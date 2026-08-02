-- LVRF — Database hardening
-- Run ONCE as the postgres superuser, AFTER the first Drizzle migration.
--   sudo -u postgres psql -d lvrf -f hardening.sql
--
-- Purpose: make three governance promises structural instead of aspirational.
--   1. No destructive deletes on governed objects.
--   2. The audit log is append-only, enforced by privilege.
--   3. Every mutation is recorded without any route having to remember.

\set ON_ERROR_STOP on

BEGIN;

-- ------------------------------------------------------------------
-- 1. Actor context
-- ------------------------------------------------------------------
-- The app sets this per transaction:  SET LOCAL lvrf.actor_person_id = '<uuid>';
-- If unset, the audit row records NULL rather than failing the write —
-- an unattributed audit row is still better than a lost one.

CREATE OR REPLACE FUNCTION lvrf_current_actor() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  v := current_setting('lvrf.actor_person_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

-- ------------------------------------------------------------------
-- 2. Audit trigger
-- ------------------------------------------------------------------
-- Records inserts and updates. An update that sets deleted_at is
-- classified as a soft_delete so the log distinguishes retirement from
-- ordinary revision.

-- MUST be AFTER. A BEFORE INSERT trigger fires on the proposed row before
-- ON CONFLICT resolution, which logs inserts of ids that are never persisted.
CREATE OR REPLACE FUNCTION lvrf_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE op audit_operation;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, operation, actor_person_id, old_row, new_row)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'insert', lvrf_current_actor(), NULL, to_jsonb(NEW));
    RETURN NULL;
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

-- Separate, because updated_at mutation requires BEFORE and NEW is not
-- writable in an AFTER trigger.
CREATE OR REPLACE FUNCTION lvrf_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ------------------------------------------------------------------
-- 3. Delete guard
-- ------------------------------------------------------------------
-- Volume III: "No destructive deletes for governed objects." Enforced.

CREATE OR REPLACE FUNCTION lvrf_block_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'LVRF: % is a governed object; hard DELETE is prohibited. Set deleted_at instead.',
    TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$;

-- ------------------------------------------------------------------
-- 4. Attach to every governed table
-- ------------------------------------------------------------------

DO $$
DECLARE t text;
  governed text[] := ARRAY[
    'tenants', 'institutions', 'persons', 'engagements', 'business_metrics',
    'capabilities', 'assessments', 'evidence', 'reflections',
    'value_outcomes', 'stewardship_returns', 'heartbeats', 'offerings'
  ];
BEGIN
  FOREACH t IN ARRAY governed LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION lvrf_audit()', t || '_audit', t);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION lvrf_touch()', t || '_touch', t);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_no_delete', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete()', t || '_no_delete', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 5. 0002 — AMENDMENT-005 and value_runs governance triggers
-- ------------------------------------------------------------------
-- Neither can be a CHECK — both span tables or need OLD/NEW.

-- 5a. AI-sourced evidence may not support a measured actual.
-- AMD-005 Article I, enforced.

CREATE OR REPLACE FUNCTION lvrf_block_ai_actual() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE ai boolean;
BEGIN
  IF NEW.supports <> 'actual' THEN RETURN NEW; END IF;
  SELECT e.ai_sourced INTO ai FROM evidence e WHERE e.id = NEW.evidence_id;
  IF ai THEN
    RAISE EXCEPTION
      'LVRF: AI-sourced evidence may not support a measured actual. '
      'AMENDMENT-005 Article I. The actual comes from the customer''s system of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS value_outcome_evidence_no_ai_actual ON value_outcome_evidence;
CREATE TRIGGER value_outcome_evidence_no_ai_actual
  BEFORE INSERT OR UPDATE ON value_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_ai_actual();

-- 5b. A locked run is immutable.
-- Locking has no meaning if the row can still be edited. Only
-- superseded_by_id may change after a lock — that is how a relock records
-- that this run was replaced.

CREATE OR REPLACE FUNCTION lvrf_locked_run_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NULL THEN RETURN NEW; END IF;
  IF to_jsonb(NEW) - 'superseded_by_id' - 'updated_at'
     IS DISTINCT FROM to_jsonb(OLD) - 'superseded_by_id' - 'updated_at' THEN
    RAISE EXCEPTION
      'LVRF: value_run % is locked and immutable. Relock by creating a new run '
      'that supersedes it — do not edit history.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS value_runs_locked_immutable ON value_runs;
CREATE TRIGGER value_runs_locked_immutable
  BEFORE UPDATE ON value_runs
  FOR EACH ROW EXECUTE FUNCTION lvrf_locked_run_immutable();

-- ------------------------------------------------------------------
-- 6. Append-only privileges
-- ------------------------------------------------------------------
-- The app can write history and read it. It cannot rewrite it.
-- This is FA-001's "AI may never rewrite history" made unbreakable —
-- and it applies to humans and agents alike.

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log        FROM lvrf_app;
REVOKE UPDATE, DELETE, TRUNCATE ON heartbeat_events FROM lvrf_app;

GRANT SELECT, INSERT ON audit_log        TO lvrf_app;
GRANT SELECT, INSERT ON heartbeat_events TO lvrf_app;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq        TO lvrf_app;
GRANT USAGE, SELECT ON SEQUENCE heartbeat_events_id_seq TO lvrf_app;

-- ------------------------------------------------------------------
-- 7. 0003 · run attribution, deferred
-- ------------------------------------------------------------------
-- DEFERRABLE INITIALLY DEFERRED so a walk can emit events referencing a run
-- that is inserted at the end of the same transaction. Checked at COMMIT.
--
-- Drizzle cannot express DEFERRABLE, so `schema.ts` declares the column
-- without a reference and the constraint lives here. Adding `.references()`
-- there would create a second, non-deferred constraint and break atomicity.

ALTER TABLE heartbeat_events DROP CONSTRAINT IF EXISTS heartbeat_events_value_run_fk;
ALTER TABLE heartbeat_events
  ADD CONSTRAINT heartbeat_events_value_run_fk
  FOREIGN KEY (value_run_id) REFERENCES value_runs(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;

-- ------------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------------
-- 13 governed tables (0005 added 'offerings') × 3 (_audit, _touch, _no_delete)
-- = 39, plus the 0002 pair (value_outcome_evidence_no_ai_actual,
-- value_runs_locked_immutable) = 41 distinct triggers.
-- Expect 55 rows here: information_schema.triggers emits one row per event
-- manipulation. Each governed table contributes 4 rows (2 + 1 + 1) = 52;
-- no_ai_actual fires on INSERT and UPDATE (+2), locked_immutable on UPDATE (+1).
SELECT event_object_table AS tbl, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY tbl, trigger_name;

-- Expect no UPDATE or DELETE for lvrf_app on these two tables.
SELECT table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'lvrf_app' AND table_name IN ('audit_log','heartbeat_events')
ORDER BY table_name, privilege_type;
