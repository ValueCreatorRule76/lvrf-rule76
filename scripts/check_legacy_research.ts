// Q4b (11 Oct 2026) — the research results parsed before prompts were
// tracked, against the contract as it is now. Read-only.
//
//   npx tsx scripts/check_legacy_research.ts
//
// Reads DATABASE_URL from .env. Every industry_measure result with no
// prompt_id must have prompt_tracked = false (0031 set it on every row that
// existed), and its raw_response must still validate against
// INDUSTRY_MEASURE_CONTRACT in accept mode — the stricter gate: every field
// present and typed, no key the mapping does not know. Prints one line per
// row that fails and exits 1, or a summary and exits 0. Writes nothing.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { INDUSTRY_MEASURE_CONTRACT, validateMeasure } from '../server/research/contracts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (expected in .env).'); process.exit(2); }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const failures: string[] = [];
let n = 0;
const byState: Record<string, number> = {};
try {
  await client.query('BEGIN READ ONLY');
  const { rows: directionRows } = await client.query<{ enumlabel: string }>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'metric_direction' ORDER BY e.enumsortorder`,
  );
  const validDirections = directionRows.map((r) => r.enumlabel);
  const { rows } = await client.query<{ id: string; review_state: string; prompt_tracked: boolean; contract_version: number | null; raw_response: unknown }>(
    `SELECT id, review_state, prompt_tracked, contract_version, raw_response FROM research_results
      WHERE result_kind = 'industry_measure' AND prompt_id IS NULL ORDER BY id`,
  );
  for (const r of rows) {
    n++;
    byState[r.review_state] = (byState[r.review_state] ?? 0) + 1;
    if (r.prompt_tracked) failures.push(`${r.id}: prompt_tracked is true with no prompt_id`);
    if (r.contract_version !== null) failures.push(`${r.id}: contract_version ${r.contract_version} with no prompt_id`);
    const issues: string[] = [];
    validateMeasure(INDUSTRY_MEASURE_CONTRACT, r.raw_response, { mode: 'accept', path: 'raw_response', validDirections, issues });
    for (const i of issues) failures.push(`${r.id} (${r.review_state}): ${i}`);
  }
  await client.query('ROLLBACK');
} finally {
  await client.end();
}

const states = Object.entries(byState).map(([s, c]) => `${c} ${s}`).join(', ') || 'none';
if (failures.length === 0) {
  console.log(`legacy research results: ${n} (${states}); all prompt_tracked = false; all validate against contract v${INDUSTRY_MEASURE_CONTRACT.version}`);
  process.exit(0);
}
for (const f of failures) console.log(`LEGACY: ${f}`);
console.log(`legacy research results: ${n} (${states}); ${failures.length} problem(s)`);
process.exit(1);
