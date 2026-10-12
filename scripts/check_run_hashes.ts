/**
 * Read-only: recompute every value run's payload_hash from its stored
 * payload, exactly as produce-run and walkSpine compute it —
 * sha256Hex(payload without payloadHash), over whatever keys that run was
 * produced with (a run before O1 has no `entity`/`institutionFacts`, and is
 * recomputed as it is). Also compares the payloadHash embedded in the
 * payload with the payload_hash column. Prints one line per mismatch and a
 * summary; exits 1 if any run mismatches. Writes nothing (READ ONLY
 * transaction).
 *
 *   DATABASE_URL=... npx tsx scripts/check_run_hashes.ts
 */
import pg from 'pg';
import { sha256Hex } from '../server/spine/hash.js';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('BEGIN READ ONLY');
const { rows } = await client.query<{ id: string; run_number: number; engagement: string | null; created_at: Date; locked: boolean;
  payload_hash: string; payload: Record<string, unknown> }>(
  `SELECT r.id, r.run_number, e.name AS engagement, r.created_at, r.locked_at IS NOT NULL AS locked, r.payload_hash, r.payload
     FROM value_runs r LEFT JOIN engagements e ON e.id = r.engagement_id ORDER BY r.created_at, r.id`,
);
await client.query('ROLLBACK');
await client.end();
let recomputeBad = 0, embeddedBad = 0;
for (const r of rows) {
  const { payloadHash, ...base } = r.payload;
  const recomputed = sha256Hex(base) === r.payload_hash;
  const embedded = payloadHash === r.payload_hash;
  if (!recomputed) recomputeBad++;
  if (!embedded) embeddedBad++;
  if (!recomputed || !embedded) {
    console.log(`MISMATCH run ${r.id} #${r.run_number} "${r.engagement ?? '(no engagement)'}" created ${r.created_at.toISOString().slice(0, 10)} `
      + `locked=${r.locked}: recompute ${recomputed ? 'ok' : 'DIFFERS'}, embedded payloadHash ${embedded ? 'ok' : (payloadHash === undefined ? 'ABSENT' : 'DIFFERS')}`);
  }
}
console.log(`${rows.length} runs: recompute matches ${rows.length - recomputeBad}, differs ${recomputeBad}; embedded payloadHash matches ${rows.length - embeddedBad}, differs ${embeddedBad}`);
process.exit(recomputeBad + embeddedBad === 0 ? 0 : 1);
