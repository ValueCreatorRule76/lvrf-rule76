#!/usr/bin/env node
/**
 * LVRF — Seed the Skillsoft offerings catalog.
 *
 *   node records/seed_offerings.mjs --dry-run     # runs everything, ROLLS BACK
 *   node records/seed_offerings.mjs               # commits
 *
 * Reads DATABASE_URL from env.
 *
 * DESIGN NOTE — why this introspects instead of hardcoding:
 * This script does not know the shape of `capabilities`. Rather than guess
 * column names and fail at 2am, it reads information_schema, fills what it
 * can, and ABORTS with a named list if a required column has no source.
 * A refusal that names the missing column is worth more than a seed that
 * half-works.
 *
 * It will not invent data. commercial_model stays null on all 12 rows.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(HERE, 'offering_catalog_skillsoft.json');
const DRY_RUN = process.argv.includes('--dry-run');

const log = (...a) => console.log(...a);
const die = (msg) => { console.error(`\n  ABORT: ${msg}\n`); process.exit(1); };

// ------------------------------------------------------------------

async function requiredColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`, [table]);
  if (rows.length === 0) die(`table "${table}" does not exist`);
  return rows;
}

/** Columns that MUST be supplied: not nullable, no default. */
const mustSupply = (cols) =>
  cols.filter(c => c.is_nullable === 'NO' && c.column_default === null)
      .map(c => c.column_name);

// ------------------------------------------------------------------

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const offerings = catalog.offerings;

  if (offerings.length !== 12)
    die(`expected 12 offerings in the catalog, found ${offerings.length}`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('BEGIN');

  try {
    log(`\n  LVRF offerings seed${DRY_RUN ? '  [DRY RUN — will roll back]' : ''}`);
    log(`  ${'-'.repeat(64)}`);

    // --- 1. Tenant -------------------------------------------------
    const tenantCols = await requiredColumns(client, 'tenants');
    const tenantNameCol = tenantCols.find(c => ['name','display_name','legal_name']
      .includes(c.column_name))?.column_name;
    if (!tenantNameCol) die('cannot find a name column on tenants; inspect and adjust');

    const unfillableTenant = mustSupply(tenantCols).filter(c => c !== tenantNameCol);
    if (unfillableTenant.length)
      die(`tenants requires columns this script cannot fill: ${unfillableTenant.join(', ')}`);

    let { rows: [tenant] } = await client.query(
      `SELECT id FROM tenants WHERE ${tenantNameCol} = $1`, ['Skillsoft']);
    if (!tenant) {
      ({ rows: [tenant] } = await client.query(
        `INSERT INTO tenants (${tenantNameCol}) VALUES ($1) RETURNING id`, ['Skillsoft']));
      log(`  tenant        created  Skillsoft  ${tenant.id}`);
    } else {
      log(`  tenant        found    Skillsoft  ${tenant.id}`);
    }

    // --- 2. Offerings ----------------------------------------------
    let inserted = 0, updated = 0;
    for (const o of offerings) {
      if (o.commercial_model !== null)
        die(`${o.offering_key} carries a commercial_model. Gap G4 is open — nothing public supports a figure.`);

      if (!o.market_status)
        die(`${o.offering_key} has no market_status. This is a sourced fact, not a ` +
            `column default — set it explicitly in the catalog before seeding.`);

      if (!o.evidence_access)
        die(`${o.offering_key} has no evidence_access. Derived from open gaps, not a ` +
            `column default — set it explicitly in the catalog before seeding.`);

      const { rows: [row] } = await client.query(`
        INSERT INTO offerings (
          tenant_id, offering_key, name, family, description,
          evidence_class, verification_source, evidence_artifacts,
          commercial_model, source_refs, confirmation_gaps, market_status,
          provider_org, evidence_access
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9::jsonb,$10,$11,$12,$13)
        ON CONFLICT (tenant_id, offering_key) WHERE deleted_at IS NULL DO UPDATE SET
          name                = EXCLUDED.name,
          family              = EXCLUDED.family,
          description         = EXCLUDED.description,
          evidence_class      = EXCLUDED.evidence_class,
          verification_source = EXCLUDED.verification_source,
          evidence_artifacts  = EXCLUDED.evidence_artifacts,
          source_refs         = EXCLUDED.source_refs,
          confirmation_gaps   = EXCLUDED.confirmation_gaps,
          market_status       = EXCLUDED.market_status,
          provider_org        = EXCLUDED.provider_org,
          evidence_access     = EXCLUDED.evidence_access
        RETURNING id, (xmax = 0) AS was_insert
      `, [tenant.id, o.offering_key, o.name, o.family, o.description,
          o.evidence_class, o.verification_source, o.evidence_artifacts,
          JSON.stringify(o.source_refs), o.confirmation_gaps, o.market_status,
          o.provider_org ?? null, o.evidence_access]);
      row.was_insert ? inserted++ : updated++;
    }
    log(`  offerings     ${inserted} inserted, ${updated} updated`);

    // --- 3. Capabilities for the validation run --------------------
    // Use A and Use B belong to DIFFERENT institutions. Use A is Skillsoft
    // measuring its own sellers (tenant === institution); Use B is
    // Northgate's own workforce capability, not Skillsoft's. Collapsing
    // both under Skillsoft would erase the vendor/customer distinction the
    // schema exists to hold.
    const capCols = await requiredColumns(client, 'capabilities');
    const capNameCol = capCols.find(c => ['name','title','label']
      .includes(c.column_name))?.column_name;
    if (!capNameCol) die('cannot find a name column on capabilities; inspect and adjust');

    const unfillableCap = mustSupply(capCols)
      .filter(c => ![capNameCol, 'institution_id', 'owner_person_id'].includes(c));
    if (unfillableCap.length) {
      die(`capabilities requires columns this script cannot fill: ${unfillableCap.join(', ')}\n` +
          `         Supply them explicitly rather than letting the script guess.`);
    }

    const { rows: [skillsoftSelf] } = await client.query(
      `SELECT id FROM institutions WHERE tenant_id = $1 AND is_tenant_self = true`, [tenant.id]);
    if (!skillsoftSelf)
      die('no self-institution found for Skillsoft (is_tenant_self); seed it before running this script');

    const { rows: [northgate] } = await client.query(
      `SELECT id FROM institutions WHERE tenant_id = $1 AND name = $2`,
      [tenant.id, 'Northgate Utilities']);
    if (!northgate)
      die('Northgate Utilities institution not found under the Skillsoft tenant; seed it first');

    // Owner: reuses the same person both pre-existing capabilities already
    // use ("Value-based renewal execution" under Skillsoft self,
    // "Switching order verification" under Northgate), regardless of which
    // institution the capability itself belongs to. NOT cited as precedent
    // that resolves anything — a Skillsoft-tenant-scoped person owning a
    // Northgate-institution-scoped capability IS Defect B (see
    // docs/README_0005.md): the schema has no scope for whoever actually
    // does this job across institutions, so every capability's owner gets
    // filed under the vendor by default. Reused here for consistency with
    // existing data, not because it settles the question. Refuses rather
    // than invents a new placeholder if that person is gone.
    const { rows: [owner] } = await client.query(
      `SELECT id FROM persons WHERE email = $1`, ['brad.piver@skillsoft.example']);
    if (!owner)
      die('brad.piver@skillsoft.example not found. This script will not create a placeholder ' +
          'owner — the existing capabilities in this database are both owned by this person; ' +
          'if that changed, supply the new owner explicitly.');

    const capInstitution = { use_a: skillsoftSelf.id, use_b: northgate.id };
    const capInstitutionLabel = { use_a: 'Skillsoft self', use_b: 'Northgate Utilities' };

    const capIds = {};
    for (const [key, capName] of Object.entries({
      use_a: catalog.validation_test.use_a.capability,
      use_b: catalog.validation_test.use_b.capability,
    })) {
      const institutionId = capInstitution[key];
      let { rows: [c] } = await client.query(
        `SELECT id FROM capabilities WHERE ${capNameCol} = $1 AND institution_id = $2`,
        [capName, institutionId]);
      if (!c) ({ rows: [c] } = await client.query(
        `INSERT INTO capabilities (${capNameCol}, institution_id, owner_person_id)
         VALUES ($1,$2,$3) RETURNING id`, [capName, institutionId, owner.id]));
      capIds[key] = c.id;
      log(`  capability    ${key}  "${capName}"  (${capInstitutionLabel[key]}, owner Brad Piver)`);
    }

    // --- 4. Link offerings to capabilities -------------------------
    // ON CONFLICT DO NOTHING means rowCount === 0 on a second run whenever
    // the link ALREADY exists — that is success, not "offering missing".
    // Check the offering's existence separately so the two failure modes
    // (row truly absent vs. link already present) are not conflated.
    let links = 0;
    for (const useKey of ['use_a', 'use_b']) {
      const use = catalog.validation_test[useKey];
      for (const [i, offeringKey] of use.offerings.entries()) {
        const { rows: [offering] } = await client.query(
          `SELECT id FROM offerings WHERE tenant_id = $1 AND offering_key = $2`,
          [tenant.id, offeringKey]);
        if (!offering) die(`could not link ${offeringKey} — offering row missing`);

        await client.query(`
          INSERT INTO offering_capabilities (offering_id, capability_id, is_primary)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [offering.id, capIds[useKey], i === 0]);
        links++;
      }
    }
    log(`  links         ${links} offering→capability`);

    // --- 5. Verify --------------------------------------------------
    log(`  ${'-'.repeat(64)}`);
    const { rows: dist } = await client.query(`
      SELECT evidence_class::text AS c, count(*)::int AS n
        FROM offerings WHERE tenant_id = $1 GROUP BY 1 ORDER BY 1`, [tenant.id]);
    const got = Object.fromEntries(dist.map(r => [r.c, r.n]));
    const want = { assessed: 6, demonstrated: 4, none: 1, consumption: 1 };

    let ok = true;
    for (const [k, v] of Object.entries(want)) {
      const pass = got[k] === v;
      if (!pass) ok = false;
      log(`  ${pass ? 'PASS' : 'FAIL'}  evidence_class ${k.padEnd(13)} expected ${v}, got ${got[k] ?? 0}`);
    }

    const { rows: [{ n: nulls }] } = await client.query(
      `SELECT count(*)::int AS n FROM offerings
        WHERE tenant_id = $1 AND commercial_model IS NULL`, [tenant.id]);
    const nullsOk = nulls === 12;
    if (!nullsOk) ok = false;
    log(`  ${nullsOk ? 'PASS' : 'FAIL'}  commercial_model null on all 12  (got ${nulls})`);

    const { rows: [{ n: unrat }] } = await client.query(
      `SELECT count(*)::int AS n FROM offerings
        WHERE tenant_id = $1 AND evidence_ratification = 'unratified'`, [tenant.id]);
    const unratOk = unrat === 12;
    if (!unratOk) ok = false;
    log(`  ${unratOk ? 'PASS' : 'FAIL'}  evidence_ratification unratified on all 12  (got ${unrat})`);

    // applied must be empty. It is defined so the gap stays visible.
    const appliedOk = (got.applied ?? 0) === 0;
    if (!appliedOk) ok = false;
    log(`  ${appliedOk ? 'PASS' : 'FAIL'}  evidence_class applied is empty by design  (got ${got.applied ?? 0})`);

    const checks = [
      ["market_status = 'active' on all 12",  `market_status = 'active'`],
      ["status = 'draft' on all 12",          `status = 'draft'`],
      ["deleted_at null on all 12",           `deleted_at IS NULL`],
      ["version = 1 on all 12",               `version = 1`],
    ];
    for (const [label, predicate] of checks) {
      const { rows: [{ n }] } = await client.query(
        `SELECT count(*)::int AS n FROM offerings WHERE tenant_id = $1 AND ${predicate}`, [tenant.id]);
      const pass = n === 12;
      if (!pass) ok = false;
      log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}  (got ${n})`);
    }

    const { rows: [{ n: providerOrgCount }] } = await client.query(
      `SELECT count(*)::int AS n FROM offerings
        WHERE tenant_id = $1 AND provider_org IS NOT NULL`, [tenant.id]);
    const providerOrgOk = providerOrgCount === 1;
    if (!providerOrgOk) ok = false;
    log(`  ${providerOrgOk ? 'PASS' : 'FAIL'}  provider_org non-null on exactly 1 row  (got ${providerOrgCount})`);

    // Derived 2026-08-02 from open confirmation_gaps (see the P6 analysis):
    // every row is currently unconfirmed — nothing in the catalog has ever
    // been confirmed retrievable. Not a placeholder distribution; this is
    // the honest, unsoftened result of that analysis.
    const { rows: accessDist } = await client.query(`
      SELECT evidence_access::text AS a, count(*)::int AS n
        FROM offerings WHERE tenant_id = $1 GROUP BY 1 ORDER BY 1`, [tenant.id]);
    const gotAccess = Object.fromEntries(accessDist.map(r => [r.a, r.n]));
    const wantAccess = { unconfirmed: 12 };
    for (const [k, v] of Object.entries(wantAccess)) {
      const pass = gotAccess[k] === v;
      if (!pass) ok = false;
      log(`  ${pass ? 'PASS' : 'FAIL'}  evidence_access ${k.padEnd(11)} expected ${v}, got ${gotAccess[k] ?? 0}`);
    }
    const confirmedOk = (gotAccess.confirmed ?? 0) === 0;
    if (!confirmedOk) ok = false;
    log(`  ${confirmedOk ? 'PASS' : 'FAIL'}  evidence_access confirmed is empty — nothing has been confirmed retrievable  (got ${gotAccess.confirmed ?? 0})`);

    log(`  ${'-'.repeat(64)}`);

    if (!ok) { await client.query('ROLLBACK'); die('verification failed — rolled back'); }

    if (DRY_RUN) { await client.query('ROLLBACK'); log('  DRY RUN — rolled back. Nothing written.\n'); }
    else         { await client.query('COMMIT');   log('  Committed. 12 offerings seeded, unratified.\n'); }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n  ROLLED BACK:', err.message, '\n');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
