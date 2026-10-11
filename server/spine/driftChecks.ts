import type { PoolClient } from 'pg';
import type { Finding } from './findingsModel.js';

/**
 * 2.0 item 4 — the drift instrument.
 *
 * SQL ONLY. This reads the database and nothing else — no filesystem, no
 * environment, no process introspection.
 *
 * WHY: a check that reads files can fail for boring reasons — a permission
 * error, a moved file — and would emit a drift finding about the CHECKER
 * rather than the system. A finding must mean something is wrong with the
 * record.
 *
 * Filesystem-level drift (client/src/types/run.ts versus what the server
 * actually returns, ops files versus what is actually deployed) belongs in
 * a lint or a build step. It lives on a developer's machine at authoring
 * time, and no runtime check reading a live database will ever catch it.
 *
 * ---------------------------------------------------------------------
 * D1 — declared triggers still present
 * ---------------------------------------------------------------------
 * Compares hardening_manifest (db/schema.ts, written by db/hardening.sql
 * section 9) against pg_trigger, by NAME AND TABLE. Compares LISTS, never
 * counts — on 23 August a trigger count of 41 reconciled by coincidence
 * while five declared triggers had never been applied. That coincidence is
 * the entire reason this check exists.
 *
 * WHAT D1 CANNOT CATCH:
 *
 *  - hardening_manifest is derived from the same catalog this check reads
 *    (hardening.sql section 9 populates it from information_schema.triggers
 *    at the end of its own run). So D1 detects drift occurring AFTER a
 *    hardening run — a trigger dropped since. It cannot detect a trigger
 *    that failed to create DURING the run itself: if a CREATE TRIGGER
 *    statement never actually ran, the manifest simply never lists it, and
 *    there is nothing to compare against. That is the direction the 23
 *    August gap actually ran, so it is the right coverage. Do not describe
 *    it as more.
 *
 *  - The manifest records what hardening.sql DECLARED. A trigger it never
 *    declared is invisible to both the file and this check. D1 catches
 *    declared-but-missing, not applied-but-undeclared.
 */
export async function runDriftChecks(client: PoolClient): Promise<Finding[]> {
  // Q4 (11 Oct 2026): D1, D3 and D4 each report independently; one check's
  // finding never hides another's. D2 (migration journal and schema versus
  // the repo's snapshot) needs the repo, so it is not here — it runs before
  // the restart in lvrf-deploy.sh (scripts/check_schema_drift.mjs).
  return [...(await checkD1(client)), ...(await checkD3(client)), ...(await checkD4(client))];
}

async function checkD1(client: PoolClient): Promise<Finding[]> {
  const { rows: [manifest] } = await client.query<{
    row_count: number;
    newest_applied_at: Date | null;
  }>(
    `SELECT COUNT(*)::int AS row_count, MAX(applied_at) AS newest_applied_at
       FROM hardening_manifest`,
  );

  if (manifest.row_count === 0) {
    // Empty is not a pass. It means hardening.sql has not run since the
    // manifest table existed, so there is nothing to compare against —
    // silence here would read as "checked, found nothing," which is false.
    return [{
      code: 'D1',
      severity: 'warning',
      subject: 'instrument',
      message:
        'hardening_manifest is empty. hardening.sql has not run since the manifest table ' +
        'existed, so there is nothing to compare declared triggers against — this is not a ' +
        'clean result, it is an unmade comparison.',
    }];
  }

  const { rows: missing } = await client.query<{ trigger_name: string; table_name: string }>(
    `SELECT hm.trigger_name, hm.table_name
       FROM hardening_manifest hm
      WHERE NOT EXISTS (
        SELECT 1
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND NOT t.tgisinternal
           AND t.tgname = hm.trigger_name
           AND c.relname = hm.table_name
      )
      ORDER BY hm.table_name, hm.trigger_name`,
  );

  if (missing.length > 0) {
    const names = missing.map((m) => `${m.table_name}.${m.trigger_name}`).join(', ');
    return [{
      code: 'D1',
      severity: 'critical',
      subject: 'instrument',
      message:
        `${missing.length} trigger(s) recorded in hardening_manifest as declared and applied ` +
        `are absent from pg_trigger: ${names}. A trigger the system declared and applied is ` +
        'now gone.',
    }];
  }

  // Staleness: only checkable if drizzle.__drizzle_migrations exists — the
  // migration runner's own tracking table (see
  // docs/DEPLOY_RECORD_2026-08-03.md). hardening.sql itself is applied by
  // hand, outside that runner, so this table is the only other durable,
  // queryable record of "when did the schema last change" against which the
  // manifest's own applied_at can be compared. Where it does not exist,
  // staleness is not knowable from SQL — omit the check rather than invent
  // a fixed-age threshold that would be a guess dressed up as a measurement.
  const { rows: [{ regclass: migrationsTableExists }] } = await client.query<{ regclass: string | null }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS regclass`,
  );

  if (migrationsTableExists) {
    const { rows: [{ newest_migration_at }] } = await client.query<{ newest_migration_at: Date | null }>(
      `SELECT to_timestamp(MAX(created_at) / 1000.0) AS newest_migration_at
         FROM drizzle.__drizzle_migrations`,
    );
    if (newest_migration_at && manifest.newest_applied_at && manifest.newest_applied_at < newest_migration_at) {
      return [{
        code: 'D1',
        severity: 'warning',
        subject: 'instrument',
        message:
          `hardening_manifest was last written at ${manifest.newest_applied_at.toISOString()}, ` +
          `before the newest migration was applied at ${newest_migration_at.toISOString()}. ` +
          'hardening.sql has not been re-run since the schema changed; the manifest may not ' +
          'reflect what should be declared now.',
      }];
    }
  }

  // Lists matched — and, where knowable, the manifest is not stale. Silence
  // means the check ran and found nothing, which is distinct from D0's
  // silence-would-be-ambiguous case only because runDriftChecks having
  // returned at all is what tells the caller the checks ran.
  return [];
}

/*
 * ---------------------------------------------------------------------
 * D3 — governed tables missing their governance triggers (Q4, 11 Oct 2026)
 * ---------------------------------------------------------------------
 * Reads the catalog, every public base table, and applies four rules:
 *
 *   updated_at column        => <table>_touch
 *   superseded_by_id column  => <table>_supersession_sane
 *   every table              => <table>_no_delete   (unless exempt below)
 *   every table              => <table>_audit       (unless exempt below)
 *
 * The exemptions are declared here, each with its reason, so a table that
 * is deliberately ungoverned in one respect says why rather than slipping
 * through. A NEW table — any table not listed — owes all four, so an
 * ungoverned table added later is a finding the first time a run is
 * produced. Severity warning: a governance gap, not a false record.
 */
const NO_DELETE_EXEMPT: Record<string, string> = {
  audit_log: 'append-only by revoked UPDATE/DELETE/TRUNCATE privileges (hardening.sql section 6)',
  heartbeat_events: 'append-only by revoked UPDATE/DELETE/TRUNCATE privileges (hardening.sql section 6)',
  hardening_manifest: 'TRUNCATEd and repopulated by every hardening.sql run (section 14), by design',
};
const AUDIT_EXEMPT: Record<string, string> = {
  ...NO_DELETE_EXEMPT,
  person_credentials: 'holds password hashes; audit_log is permanent, so hashes stay out of it (0027)',
  sessions: 'holds session-token hashes, and is high-volume; the row is the record (0027)',
  refusals: 'the row IS the record of the refused attempt; an audit row would duplicate it (section 8)',
};

async function checkD3(client: PoolClient): Promise<Finding[]> {
  const { rows } = await client.query<{
    table_name: string; has_updated_at: boolean; has_superseded: boolean; triggers: string[];
  }>(
    `SELECT c.relname AS table_name,
            EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped) AS has_updated_at,
            EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'superseded_by_id' AND NOT a.attisdropped) AS has_superseded,
            coalesce(array_agg(t.tgname) FILTER (WHERE t.tgname IS NOT NULL), '{}') AS triggers
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       LEFT JOIN pg_trigger t ON t.tgrelid = c.oid AND NOT t.tgisinternal
      WHERE c.relkind = 'r'
      GROUP BY c.oid, c.relname
      ORDER BY c.relname`,
  );
  const gaps: string[] = [];
  for (const r of rows) {
    const has = (suffix: string) => r.triggers.includes(`${r.table_name}_${suffix}`);
    const missing: string[] = [];
    if (r.has_updated_at && !has('touch')) missing.push('_touch');
    if (r.has_superseded && !has('supersession_sane')) missing.push('_supersession_sane');
    if (!(r.table_name in NO_DELETE_EXEMPT) && !has('no_delete')) missing.push('_no_delete');
    if (!(r.table_name in AUDIT_EXEMPT) && !has('audit')) missing.push('_audit');
    if (missing.length > 0) gaps.push(`${r.table_name} (${missing.join(', ')})`);
  }
  if (gaps.length === 0) return [];
  return [{
    code: 'D3',
    severity: 'warning',
    subject: 'instrument',
    message:
      `${gaps.length} table(s) lack governance triggers the schema implies: ${gaps.join('; ')}. ` +
      'A governed table without them can be edited or deleted without trace.',
  }];
}

/*
 * ---------------------------------------------------------------------
 * D4 — supersession pointers (Q4, 11 Oct 2026)
 * ---------------------------------------------------------------------
 * For every table with superseded_by_id:
 *   - its self-referencing FOREIGN KEY must exist. It is what makes a
 *     pointer to a row that does not exist impossible; without it the
 *     chain can dangle. Missing => critical.
 *   - no successor may be retired (deleted_at set). _supersession_sane
 *     refuses linking to a retired row, but a successor can be retired
 *     later, leaving the "current" version of a fact retired. => warning.
 *   - no successor may be claimed by two rows (a fork). _supersession_sane
 *     refuses it at write time, so one here means the trigger was bypassed.
 *     => critical.
 */
async function checkD4(client: PoolClient): Promise<Finding[]> {
  const { rows: tables } = await client.query<{ table_name: string; has_self_fk: boolean; has_deleted_at: boolean }>(
    `SELECT c.relname AS table_name,
            EXISTS (SELECT 1 FROM pg_constraint k
                     WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.confrelid = c.oid
                       AND k.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.oid AND attname = 'superseded_by_id')]) AS has_self_fk,
            EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'deleted_at' AND NOT a.attisdropped) AS has_deleted_at
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'superseded_by_id' AND NOT a.attisdropped)
      ORDER BY c.relname`,
  );
  const noFk: string[] = [];
  const retired: string[] = [];
  const forks: string[] = [];
  for (const t of tables) {
    if (!t.has_self_fk) noFk.push(t.table_name);
    // Identifiers come from pg_class, not from input; quoted all the same.
    const tbl = `"${t.table_name.replace(/"/g, '""')}"`;
    if (t.has_deleted_at) {
      const { rows: [{ n }] } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${tbl} o JOIN ${tbl} s ON s.id = o.superseded_by_id WHERE s.deleted_at IS NOT NULL`,
      );
      if (n > 0) retired.push(`${t.table_name} (${n})`);
    }
    const { rows: [{ f }] } = await client.query<{ f: number }>(
      `SELECT count(*)::int AS f FROM (SELECT superseded_by_id FROM ${tbl} WHERE superseded_by_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x`,
    );
    if (f > 0) forks.push(`${t.table_name} (${f})`);
  }
  const findings: Finding[] = [];
  if (noFk.length > 0 || forks.length > 0) {
    findings.push({
      code: 'D4',
      severity: 'critical',
      subject: 'instrument',
      message: [
        noFk.length > 0 ? `superseded_by_id without its self-referencing foreign key: ${noFk.join(', ')} — a pointer to a row that does not exist is no longer refused` : '',
        forks.length > 0 ? `forked supersession chains (one successor claimed by two rows): ${forks.join(', ')} — _supersession_sane was bypassed` : '',
      ].filter(Boolean).join('. ') + '.',
    });
  }
  if (retired.length > 0) {
    findings.push({
      code: 'D4',
      severity: 'warning',
      subject: 'instrument',
      message: `superseded rows whose successor has since been retired: ${retired.join(', ')}. The chain ends in a retired row, so the "current" version is not current.`,
    });
  }
  return findings;
}

