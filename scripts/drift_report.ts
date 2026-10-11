/**
 * The drift instrument's SQL checks (D1 declared triggers present, D3
 * governance triggers, D4 supersession pointers), run on their own — the
 * same function produceRun runs for every run's findings card. Read-only.
 *
 *   npx tsx scripts/drift_report.ts
 *
 * Reads DATABASE_URL from .env, like the server. Prints each finding.
 * Exit 0 when nothing is critical (warnings are printed, not fatal); exit 2
 * when any finding is critical — lvrf-deploy.sh stops before the restart on
 * that. D2 (journal and schema versus the repo) is scripts/check_schema_drift.mjs.
 */
import '../server/env.js';
import pg from 'pg';
import { runDriftChecks } from '../server/spine/driftChecks.js';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (expected in .env).');
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const findings = await runDriftChecks(client);
    await client.query('ROLLBACK');
    if (findings.length === 0) {
      console.log('drift checks D1, D3, D4: no findings');
      return;
    }
    for (const f of findings) console.log(`${f.code} ${f.severity}: ${f.message}`);
    if (findings.some((f) => f.severity === 'critical')) process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
