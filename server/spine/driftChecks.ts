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
