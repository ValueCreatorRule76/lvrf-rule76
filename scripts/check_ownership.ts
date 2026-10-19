/**
 * OWN-1 — read-only: the ownership assertion of hardening.sql section 24,
 * from the deploy (step 5d) as lvrf_app. Calls lvrf_ownership_violations()
 * (the one definition, installed by hardening.sql) and prints each
 * violation. Exits 1 on any violation, or if the function is absent (a
 * database hardened before OWN-1). Writes nothing (READ ONLY transaction).
 *
 *   DATABASE_URL=... npx tsx scripts/check_ownership.ts
 */
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('BEGIN READ ONLY');
let violations: string[];
try {
  const { rows } = await client.query<{ v: string }>('SELECT v FROM lvrf_ownership_violations() v');
  violations = rows.map((r) => r.v);
} catch (err) {
  console.log(`OWNERSHIP CHECK UNAVAILABLE: ${(err as Error).message} (run db/ownership.sql, then db/hardening.sql)`);
  await client.end();
  process.exit(1);
}
await client.query('ROLLBACK');
await client.end();
for (const v of violations) console.log(`VIOLATION ${v}`);
console.log(violations.length === 0 ? 'ownership: lvrf_owner owns everything; lvrf_app owns nothing and holds no DELETE, TRUNCATE or CREATE' : `ownership: ${violations.length} violation(s)`);
process.exit(violations.length === 0 ? 0 : 1);
