/**
 * Q4k (L29 widened) — read-only coverage check: every CHECK constraint in
 * the database has a plain sentence in server/lib/plainChecks.ts. Reads the
 * live catalog (pg_constraint), so the CHECKs that migrations write by hand
 * count too, not only those db/schema.ts declares. Also lists sentences
 * whose constraint no longer exists. Exits 1 on any CHECK without one.
 *
 *   DATABASE_URL=... npx tsx scripts/check_plain_refusals.ts
 */
import pg from 'pg';
import { PLAIN_CHECK } from '../server/lib/plainChecks.js';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('BEGIN READ ONLY');
const { rows } = await client.query<{ conname: string; rel: string }>(
  `SELECT conname, conrelid::regclass::text AS rel FROM pg_constraint
    WHERE contype = 'c' AND connamespace = 'public'::regnamespace ORDER BY conname`,
);
await client.query('ROLLBACK');
await client.end();
const inDb = new Set(rows.map((r) => r.conname));
const missing = rows.filter((r) => !(r.conname in PLAIN_CHECK));
const stale = Object.keys(PLAIN_CHECK).filter((k) => !inDb.has(k));
for (const m of missing) console.log(`NO SENTENCE ${m.rel}.${m.conname}`);
for (const k of stale) console.log(`STALE SENTENCE ${k} (no such CHECK in the database)`);
console.log(`${rows.length} CHECKs in the database: ${rows.length - missing.length} with a plain sentence, ${missing.length} without; ${stale.length} stale sentence(s)`);
process.exit(missing.length === 0 ? 0 : 1);
