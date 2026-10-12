// Q4b (11 Oct 2026), widened by Q4g (12 Oct) — every industry_measure
// research result, against the contract version it was PARSED UNDER.
// Read-only.
//
//   npx tsx scripts/check_legacy_research.ts
//
// Reads DATABASE_URL from .env.
//
//   - A result with no prompt_id predates prompt tracking (0031): it must
//     have prompt_tracked = false and no contract_version, and it is judged
//     against v3 — the shape it was verified against at Q4b's Gate C.
//   - A result with a prompt_id is judged against its own contract_version.
//
// Each raw_response is validated in ACCEPT mode, the stricter gate: every
// field present and typed, no key the mapping does not know. A result is
// never re-judged against a later version: a v3 result is not wrong for
// lacking v4's caveats. (Accepting a still-pending one is a different
// question: accept uses the contract as it is now — industryResearch.ts.)
//
// Prints one line per row that fails and exits 1, or a summary and exits 0.
// Writes nothing. (The name is Q4b's; it now covers every version.)

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { INDUSTRY_MEASURE_CONTRACTS, validateMeasure } from '../server/research/contracts.js';

const PRE_PROMPT_VERSION = 3;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(root, '.env')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (expected in .env).'); process.exit(2); }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const failures: string[] = [];
let n = 0;
let legacy = 0;
const byState: Record<string, number> = {};
const byVersion: Record<string, number> = {};
try {
  await client.query('BEGIN READ ONLY');
  const { rows: directionRows } = await client.query<{ enumlabel: string }>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'metric_direction' ORDER BY e.enumsortorder`,
  );
  const validDirections = directionRows.map((r) => r.enumlabel);
  const { rows } = await client.query<{
    id: string; review_state: string; prompt_id: string | null; prompt_tracked: boolean;
    contract_version: number | null; raw_response: unknown;
  }>(
    `SELECT id, review_state, prompt_id, prompt_tracked, contract_version, raw_response FROM research_results
      WHERE result_kind = 'industry_measure' ORDER BY parsed_at, id`,
  );
  for (const r of rows) {
    n++;
    byState[r.review_state] = (byState[r.review_state] ?? 0) + 1;
    let version: number;
    if (r.prompt_id === null) {
      legacy++;
      if (r.prompt_tracked) failures.push(`${r.id}: prompt_tracked is true with no prompt_id`);
      if (r.contract_version !== null) failures.push(`${r.id}: contract_version ${r.contract_version} with no prompt_id`);
      version = PRE_PROMPT_VERSION;
    } else {
      version = r.contract_version ?? -1;
    }
    const contract = INDUSTRY_MEASURE_CONTRACTS[version];
    if (!contract) {
      failures.push(`${r.id} (${r.review_state}): parsed under contract v${version}, which this code does not define`);
      continue;
    }
    byVersion[`v${version}`] = (byVersion[`v${version}`] ?? 0) + 1;
    const issues: string[] = [];
    validateMeasure(contract, r.raw_response, { mode: 'accept', path: 'raw_response', validDirections, issues });
    for (const i of issues) failures.push(`${r.id} (${r.review_state}, v${version}): ${i}`);
  }
  await client.query('ROLLBACK');
} finally {
  await client.end();
}

const states = Object.entries(byState).map(([s, c]) => `${c} ${s}`).join(', ') || 'none';
const versions = Object.entries(byVersion).map(([v, c]) => `${v}: ${c}`).join(', ') || 'none';
if (failures.length === 0) {
  console.log(`research results: ${n} (${states}); ${legacy} predate prompts, all prompt_tracked = false; each validates against the version it was parsed under (${versions})`);
  process.exit(0);
}
for (const f of failures) console.log(`LEGACY: ${f}`);
console.log(`research results: ${n} (${states}); ${failures.length} problem(s); by the version each was parsed under (${versions})`);
process.exit(1);
