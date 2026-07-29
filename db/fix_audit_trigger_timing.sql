-- LVRF — Corrective: audit trigger timing
--
-- Run ONCE as the postgres superuser, against a database where hardening.sql
-- has already been applied:
--   psql -d lvrf -f db/fix_audit_trigger_timing.sql
--
-- ── Defect ─────────────────────────────────────────────────────────
-- lvrf_audit() was installed as BEFORE INSERT OR UPDATE. Postgres fires
-- BEFORE-INSERT row triggers on the *proposed* row, before conflict
-- resolution. So `INSERT ... ON CONFLICT DO UPDATE` logged an audit row
-- describing an insert of a gen_random_uuid() id that was then discarded
-- in favour of the UPDATE path.
--
-- Effect: audit_log contained entries for writes that never happened.
-- Verified on `tenants` — an "insert" logged for a UUID absent from the
-- table, immediately followed by the real "update".
--
-- This is not a bookkeeping inconvenience. The audit log is the artifact
-- the whole system's defensibility rests on; an entry that describes a
-- write which did not occur is a correctness defect.
--
-- ── Fix ────────────────────────────────────────────────────────────
-- Split the trigger by timing, because the two jobs need opposite timing:
--
--   *_touch  BEFORE UPDATE          — mutates NEW.updated_at. Must be BEFORE;
--                                     NEW is not writable in an AFTER trigger.
--   *_audit  AFTER INSERT OR UPDATE — logs only what actually persisted.
--                                     AFTER triggers fire for the action
--                                     Postgres actually took, so ON CONFLICT
--                                     resolves to a single UPDATE entry.
--
-- Trigger count moves from 24 to 36 (12 governed tables x 3). The delete
-- guard is unchanged.
--
-- Existing phantom rows are NOT removed. audit_log is append-only by
-- privilege and by principle; history is not rewritten to look tidy. See
-- the reconciliation query at the foot of this file to identify them.

\set ON_ERROR_STOP on

BEGIN;

-- ------------------------------------------------------------------
-- 1. Audit — AFTER only. No row mutation.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION lvrf_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE op audit_operation;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, operation, actor_person_id, old_row, new_row)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'insert', lvrf_current_actor(), NULL, to_jsonb(NEW));
    RETURN NULL;  -- AFTER trigger; return value is ignored
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      op := 'soft_delete';
    ELSE
      op := 'update';
    END IF;
    INSERT INTO audit_log (table_name, record_id, operation, actor_person_id, old_row, new_row)
    VALUES (TG_TABLE_NAME, NEW.id::text, op, lvrf_current_actor(), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NULL;
  END IF;

  RETURN NULL;
END $$;

-- ------------------------------------------------------------------
-- 2. Touch — BEFORE UPDATE, the only part that must mutate NEW.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION lvrf_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ------------------------------------------------------------------
-- 3. Reattach across every governed table
-- ------------------------------------------------------------------

DO $$
DECLARE t text;
  governed text[] := ARRAY[
    'tenants', 'institutions', 'persons', 'engagements', 'business_metrics',
    'capabilities', 'assessments', 'evidence', 'reflections',
    'value_outcomes', 'stewardship_returns', 'heartbeats'
  ];
BEGIN
  FOREACH t IN ARRAY governed LOOP
    -- retire the mistimed trigger
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);

    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION lvrf_audit()', t || '_audit', t);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION lvrf_touch()', t || '_touch', t);

    -- delete guard untouched, recreated only if absent
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_no_delete', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete()', t || '_no_delete', t);
  END LOOP;
END $$;

COMMIT;

-- ------------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------------

-- Expect 36 distinct triggers (12 governed tables x 3).
SELECT count(DISTINCT trigger_name) AS distinct_triggers
FROM information_schema.triggers WHERE trigger_schema = 'public';

-- Expect 4 functions: lvrf_audit, lvrf_touch, lvrf_block_delete, lvrf_current_actor.
SELECT proname FROM pg_proc WHERE proname LIKE 'lvrf%' ORDER BY proname;

-- Every audit trigger must now be AFTER. Expect 0 rows.
SELECT event_object_table, trigger_name, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name LIKE '%_audit'
  AND action_timing <> 'AFTER';

-- ------------------------------------------------------------------
-- Phantom reconciliation — identify, do not delete
-- ------------------------------------------------------------------
-- Audit rows claiming an insert whose record_id is absent from its table.
-- These are the pre-fix phantoms. They stay in the log; the log is
-- append-only. Knowing which entries are unreliable is worth more than a
-- log that has been made to look clean.

SELECT a.id, a.table_name, a.record_id, a.at
FROM audit_log a
WHERE a.operation = 'insert'
  AND a.table_name IN ('tenants','institutions','persons','business_metrics')
  AND NOT EXISTS (
    SELECT 1 FROM tenants          t WHERE a.table_name='tenants'          AND t.id::text = a.record_id
    UNION ALL SELECT 1 FROM institutions   i WHERE a.table_name='institutions'   AND i.id::text = a.record_id
    UNION ALL SELECT 1 FROM persons        p WHERE a.table_name='persons'        AND p.id::text = a.record_id
    UNION ALL SELECT 1 FROM business_metrics m WHERE a.table_name='business_metrics' AND m.id::text = a.record_id
  )
ORDER BY a.id;
