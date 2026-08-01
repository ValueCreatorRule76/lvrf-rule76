import '../env.js';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { pool } from '../db/pool.js';
import { withActorTransaction, type Db } from '../db/withActorTransaction.js';
import * as schema from '../../db/schema.js';
import { loadFixture, type PersonFixture } from '../spine/fixture.js';

/**
 * Idempotent seed from a records/*.json fixture — defaults to
 * records/customer_zero.json, but accepts any fixture filename (e.g.
 * "customer_b.json") to seed that engagement's reference data instead.
 * Safe to re-run: every entity is looked up by the natural key already in
 * db/schema.ts before it is written.
 *
 *   tenants.name                              — tenants_name_key
 *   institutions(tenant_id, name)              — institutions_tenant_name_key
 *   persons.email                              — persons_email_key
 *   business_metrics(institution_id, name)      — business_metrics_institution_name_key
 *
 * `capabilities` and `engagements` have no unique constraint on (institution,
 * name) in db/schema.ts — only a non-unique index — so those two use a plain
 * select-then-insert instead of ON CONFLICT. Not a defect to fix here; that's
 * schema.ts, which this task does not touch.
 */

const EMAIL_DOMAIN = 'skillsoft.example'; // RFC 2606 reserved — never a real inbox.

function emailFor(person: PersonFixture): string {
  const local = person.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `${local}@${EMAIL_DOMAIN}`;
}

async function upsertTenant(db: Db, name: string, isSelfMeasuring: boolean) {
  const [row] = await db
    .insert(schema.tenants)
    .values({ name, isSelfMeasuring })
    .onConflictDoUpdate({ target: schema.tenants.name, set: { isSelfMeasuring } })
    .returning();
  return row;
}

async function upsertInstitution(
  db: Db,
  tenantId: string,
  name: string,
  industry: string,
  isTenantSelf: boolean,
) {
  const [row] = await db
    .insert(schema.institutions)
    .values({ tenantId, name, industry, isTenantSelf })
    .onConflictDoUpdate({
      target: [schema.institutions.tenantId, schema.institutions.name],
      set: { industry, isTenantSelf },
    })
    .returning();
  return row;
}

async function upsertPerson(db: Db, values: typeof schema.persons.$inferInsert) {
  const [row] = await db
    .insert(schema.persons)
    .values(values)
    .onConflictDoUpdate({
      target: schema.persons.email,
      set: { fullName: values.fullName, title: values.title ?? null },
    })
    .returning();
  return row;
}

async function ensurePersonRole(db: Db, personId: string, role: (typeof schema.personRole.enumValues)[number]) {
  await db
    .insert(schema.personRoles)
    .values({ personId, role })
    .onConflictDoNothing({ target: [schema.personRoles.personId, schema.personRoles.role] });
}

async function ensureCapability(
  db: Db,
  institutionId: string,
  name: string,
  roleFamily: string,
  description: string,
  ownerPersonId: string,
) {
  const existing = await db
    .select()
    .from(schema.capabilities)
    .where(and(eq(schema.capabilities.institutionId, institutionId), eq(schema.capabilities.name, name)))
    .limit(1);
  if (existing[0]) return existing[0];

  const [row] = await db
    .insert(schema.capabilities)
    .values({ institutionId, name, roleFamily, description, ownerPersonId })
    .returning();
  return row;
}

async function upsertBusinessMetric(db: Db, values: typeof schema.businessMetrics.$inferInsert) {
  const [row] = await db
    .insert(schema.businessMetrics)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.businessMetrics.institutionId, schema.businessMetrics.name],
      set: {
        unit: values.unit,
        direction: values.direction,
        sourceSystem: values.sourceSystem,
        ownerPersonId: values.ownerPersonId,
        reportingCadence: values.reportingCadence,
        definitionNotes: values.definitionNotes,
      },
    })
    .returning();
  return row;
}

async function ensureEngagement(
  db: Db,
  values: typeof schema.engagements.$inferInsert,
) {
  const existing = await db
    .select()
    .from(schema.engagements)
    .where(and(eq(schema.engagements.institutionId, values.institutionId), eq(schema.engagements.name, values.name)))
    .limit(1);
  if (existing[0]) return existing[0];

  const [row] = await db.insert(schema.engagements).values(values).returning();
  return row;
}

export interface SeedResult {
  tenant: typeof schema.tenants.$inferSelect;
  institution: typeof schema.institutions.$inferSelect;
  persons: {
    valueEngineer: typeof schema.persons.$inferSelect;
    sponsor: typeof schema.persons.$inferSelect;
    metricOwner: typeof schema.persons.$inferSelect;
    verifier: typeof schema.persons.$inferSelect;
    coach: typeof schema.persons.$inferSelect;
  };
  capability: typeof schema.capabilities.$inferSelect;
  businessMetric: typeof schema.businessMetrics.$inferSelect;
  engagement: typeof schema.engagements.$inferSelect;
}

export async function seedCustomerZero(fixtureFile?: string): Promise<SeedResult> {
  const fixture = await loadFixture(fixtureFile);

  // Brad Piver is the first real person in a fresh database — there is no
  // existing actor to attribute his own creation to. Resolve first (a read
  // needs no actor), then either reuse his real id or self-attribute: he
  // creates himself, using his own pre-generated id as the transaction's
  // actor, so no audit row in this seed is ever attributed to NULL.
  const existing = await pool.query<{ id: string }>('SELECT id FROM persons WHERE email = $1', [
    emailFor(fixture.persons.value_engineer),
  ]);
  const valueEngineerId = existing.rows[0]?.id ?? randomUUID();

  return withActorTransaction(pool, valueEngineerId, async (db) => {
    const tenant = await upsertTenant(db, fixture.tenant.id, fixture.tenant.is_self_measuring);

    const institution = await upsertInstitution(
      db,
      tenant.id,
      fixture.institution.name,
      fixture.institution.industry,
      fixture.institution.is_tenant_self,
    );

    const valueEngineer = await upsertPerson(db, {
      id: valueEngineerId,
      tenantId: tenant.id,
      fullName: fixture.persons.value_engineer.name,
      email: emailFor(fixture.persons.value_engineer),
      title: fixture.persons.value_engineer.title,
    });

    const sponsor = await upsertPerson(db, {
      institutionId: institution.id,
      fullName: fixture.persons.sponsor.name,
      email: emailFor(fixture.persons.sponsor),
      title: fixture.persons.sponsor.title,
    });

    const metricOwner = await upsertPerson(db, {
      institutionId: institution.id,
      fullName: fixture.persons.metric_owner.name,
      email: emailFor(fixture.persons.metric_owner),
      title: fixture.persons.metric_owner.title,
    });

    const verifier = await upsertPerson(db, {
      institutionId: institution.id,
      fullName: fixture.persons.verifier.name,
      email: emailFor(fixture.persons.verifier),
      title: fixture.persons.verifier.title,
    });

    const coach = await upsertPerson(db, {
      institutionId: institution.id,
      fullName: fixture.persons.assessor.name,
      email: emailFor(fixture.persons.assessor),
      title: fixture.persons.assessor.title,
    });

    await ensurePersonRole(db, valueEngineer.id, 'value_engineer');
    await ensurePersonRole(db, sponsor.id, 'executive_sponsor');
    await ensurePersonRole(db, metricOwner.id, 'metric_owner');
    await ensurePersonRole(db, coach.id, 'coach');
    // personRole has no value for "Finance Verifier" — metric_owner is
    // already taken by a different person, and nothing else fits without
    // distorting the role's meaning. Deliberately left with no person_roles
    // row rather than forcing an inaccurate one; the person exists and is
    // still usable wherever a plain persons.id is needed (e.g. as an
    // actorPersonId on a heartbeat event).

    const capability = await ensureCapability(
      db,
      institution.id,
      fixture.capability.name,
      fixture.capability.role_family,
      fixture.capability.description,
      valueEngineer.id,
    );

    const businessMetric = await upsertBusinessMetric(db, {
      institutionId: institution.id,
      name: fixture.business_metric.name,
      unit: fixture.business_metric.unit,
      direction: fixture.business_metric.direction,
      sourceSystem: fixture.business_metric.source_system,
      ownerPersonId: metricOwner.id,
      reportingCadence: fixture.business_metric.reporting_cadence,
      definitionNotes: fixture.business_metric.definition_notes,
    });

    const engagement = await ensureEngagement(db, {
      tenantId: tenant.id,
      institutionId: institution.id,
      name: fixture.engagement.name,
      ownerPersonId: valueEngineer.id,
      sponsorPersonId: sponsor.id,
      renewalDate: new Date(fixture.engagement.renewal_date),
    });

    return {
      tenant,
      institution,
      persons: { valueEngineer, sponsor, metricOwner, verifier, coach },
      capability,
      businessMetric,
      engagement,
    };
  });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  seedCustomerZero()
    .then((result) => {
      console.log('Seed complete — Customer Zero.\n');
      console.log(`tenant           ${result.tenant.id}  ${result.tenant.name}`);
      console.log(`institution      ${result.institution.id}  ${result.institution.name}`);
      console.log(`value_engineer   ${result.persons.valueEngineer.id}  ${result.persons.valueEngineer.email}`);
      console.log(`sponsor          ${result.persons.sponsor.id}  ${result.persons.sponsor.email}`);
      console.log(`metric_owner     ${result.persons.metricOwner.id}  ${result.persons.metricOwner.email}`);
      console.log(`verifier         ${result.persons.verifier.id}  ${result.persons.verifier.email}`);
      console.log(`coach            ${result.persons.coach.id}  ${result.persons.coach.email}`);
      console.log(`capability       ${result.capability.id}  ${result.capability.name}`);
      console.log(`business_metric  ${result.businessMetric.id}  ${result.businessMetric.name}`);
      console.log(`engagement       ${result.engagement.id}  ${result.engagement.name}`);
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
