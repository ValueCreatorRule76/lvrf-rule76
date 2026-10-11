#!/usr/bin/env node
//
// D2 — the migration journal and the live schema, against the repo
// (Q4, 11 October 2026). Read-only.
//
//   node scripts/check_schema_drift.mjs
//
// Reads DATABASE_URL from .env. Run by lvrf-deploy.sh BEFORE the restart.
//
// Two checks, both against what THIS checkout's code expects:
//
//  1. NEVER RUN NEW CODE AGAINST AN UNMIGRATED DATABASE. Every migration in
//     db/drizzle/meta/_journal.json must be recorded in
//     drizzle.__drizzle_migrations (matched by its `when` = created_at). A
//     migration the code ships but the database has not applied stops the
//     deploy here, with the running service untouched. A recorded migration
//     the journal does not know is reported too.
//
//  2. THE SCHEMA IS WHAT THE NEWEST SNAPSHOT SAYS. Tables, columns (with
//     nullability), CHECK and UNIQUE constraints, foreign keys and indexes
//     from the newest db/drizzle/meta/NNNN_snapshot.json, compared as LISTS
//     with the live catalog. This is the 0013 failure (the journal said
//     applied; the column was absent). Two normalisations, both stated:
//       - names are compared on their first 63 bytes, because Postgres
//         truncates longer identifiers (L19: three FK names on prod);
//       - constraints that db/hardening.sql adds itself (ADD CONSTRAINT …)
//         are expected in addition to the snapshot, read from that file —
//         not from a hand-kept list.
//
// Prints "schema drift: none" and exits 0, or prints each difference and
// exits 1.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (expected in .env).'); process.exit(2); }

const meta = join(root, 'db/drizzle/meta');
const journal = JSON.parse(readFileSync(join(meta, '_journal.json'), 'utf8'));
const entries = journal.entries;
const newest = entries[entries.length - 1];
const snapFile = readdirSync(meta).filter((f) => f.endsWith('_snapshot.json')).sort().pop();
const snapshot = JSON.parse(readFileSync(join(meta, snapFile), 'utf8'));
const n63 = (s) => Buffer.from(s).subarray(0, 63).toString();

const expected = new Set();
for (const t of Object.values(snapshot.tables)) {
  const tn = t.name;
  expected.add(`table ${tn}`);
  for (const c of Object.values(t.columns)) expected.add(`column ${tn}.${c.name} ${c.notNull ? 'notnull' : 'null'}`);
  for (const c of Object.values(t.checkConstraints ?? {})) expected.add(`check ${tn}.${n63(c.name)}`);
  for (const c of Object.values(t.uniqueConstraints ?? {})) expected.add(`unique ${tn}.${n63(c.name)}`);
  for (const i of Object.values(t.indexes ?? {})) expected.add(`index ${tn}.${n63(i.name)}`);
  for (const f of Object.values(t.foreignKeys ?? {})) expected.add(`fk ${tn}.${n63(f.name)}`);
}
// Constraints hardening.sql adds on its own: "ALTER TABLE <t> ADD CONSTRAINT <name> <TYPE>".
const hardening = readFileSync(join(root, 'db/hardening.sql'), 'utf8');
for (const m of hardening.matchAll(/^\s*ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT\s+(\w+)\s+(FOREIGN KEY|CHECK|UNIQUE)/gim)) {
  const kind = { 'FOREIGN KEY': 'fk', CHECK: 'check', UNIQUE: 'unique' }[m[3].toUpperCase()];
  expected.add(`${kind} ${m[1]}.${n63(m[2])}`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const problems = [];
try {
  await client.query('BEGIN READ ONLY');
  const { rows: applied } = await client.query('SELECT created_at::text AS w FROM drizzle.__drizzle_migrations');
  const appliedSet = new Set(applied.map((r) => r.w));
  const journalSet = new Set(entries.map((e) => String(e.when)));
  const notApplied = entries.filter((e) => !appliedSet.has(String(e.when)));
  if (notApplied.length > 0) {
    problems.push(`UNMIGRATED: ${notApplied.length} migration(s) this code ships are not applied: ${notApplied.map((e) => e.tag).join(', ')}. Apply them (npx drizzle-kit migrate, then db/hardening.sql) before deploying this code.`);
  }
  const unknown = applied.filter((r) => !journalSet.has(r.w));
  if (unknown.length > 0) problems.push(`the database records ${unknown.length} migration(s) this checkout's journal does not know (created_at ${unknown.map((r) => r.w).join(', ')}).`);

  // Only compare the shape once the journal agrees: an unmigrated database
  // differs from the snapshot by definition, and listing every difference
  // would bury the one line that matters.
  if (notApplied.length === 0) {
    const { rows } = await client.query(`
      SELECT 'table ' || c.relname AS k FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' WHERE c.relkind = 'r'
      UNION ALL SELECT 'column ' || table_name || '.' || column_name || ' ' || CASE WHEN is_nullable = 'NO' THEN 'notnull' ELSE 'null' END FROM information_schema.columns WHERE table_schema = 'public'
      UNION ALL SELECT CASE contype WHEN 'c' THEN 'check ' WHEN 'u' THEN 'unique ' WHEN 'f' THEN 'fk ' END || conrelid::regclass::text || '.' || conname
                  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype IN ('c', 'u', 'f')
      UNION ALL SELECT 'index ' || tablename || '.' || indexname FROM pg_indexes
                 WHERE schemaname = 'public' AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE contype IN ('u', 'p'))`);
    const actual = new Set(rows.map((r) => r.k));
    const missing = [...expected].filter((k) => !actual.has(k)).sort();
    const extra = [...actual].filter((k) => !expected.has(k)).sort();
    if (missing.length > 0) problems.push(`in ${snapFile} but not in the database: ${missing.join('; ')}`);
    if (extra.length > 0) problems.push(`in the database but not in ${snapFile} or hardening.sql: ${extra.join('; ')}`);
  }
  await client.query('ROLLBACK');
} finally {
  await client.end();
}

if (problems.length === 0) {
  console.log(`schema drift: none (journal ${entries.length} migrations, newest ${newest.tag}; ${expected.size} schema objects match ${snapFile})`);
  process.exit(0);
}
for (const p of problems) console.log(`D2 critical: ${p}`);
process.exit(1);
