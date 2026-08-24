-- LVRF — Database hardening
-- Applied as the postgres superuser, AFTER the first Drizzle migration:
--   sudo -u postgres psql -d lvrf -f hardening.sql
--
-- Idempotent, despite what an earlier version of this comment claimed. Every
-- statement here is CREATE OR REPLACE, DROP TRIGGER IF EXISTS before CREATE,
-- or DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT. Re-running the whole
-- file in full is safe, and doing so is itself a test that this file and the
-- live database still agree — a mismatch would surface as an unexpected
-- trigger-count delta in the Verification block at the end.
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
DECLARE
  op audit_operation;
  j_old jsonb;
  j_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    j_new := to_jsonb(NEW);
    INSERT INTO audit_log (table_name, record_id, operation, actor_person_id, old_row, new_row)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'insert', lvrf_current_actor(), NULL, j_new);
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    j_old := to_jsonb(OLD);
    j_new := to_jsonb(NEW);
    -- Not every governed table has deleted_at (record_documents does not —
    -- its retirement mechanism is document_version). jsonb_exists guards the
    -- classification so those tables fall through to 'update' instead of
    -- erroring on a field that doesn't exist. jsonb_exists is used rather
    -- than the `?` operator because `?` is a bind-parameter placeholder in
    -- some drivers, and this function is not always applied by hand.
    IF jsonb_exists(j_old, 'deleted_at')
       AND (j_old ->> 'deleted_at') IS NULL
       AND (j_new ->> 'deleted_at') IS NOT NULL THEN
      op := 'soft_delete';
    ELSE
      op := 'update';
    END IF;
    INSERT INTO audit_log (table_name, record_id, operation, actor_person_id, old_row, new_row)
    VALUES (TG_TABLE_NAME, NEW.id::text, op, lvrf_current_actor(), j_old, j_new);
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
  -- Remedy text is an optional trigger argument (TG_ARGV[0]), so a table whose
  -- retirement mechanism isn't deleted_at can state its own — e.g.
  -- record_documents, which retires by document_version instead (see 5c).
  -- Every trigger created before this change passes zero arguments, so the
  -- TG_NARGS > 0 branch is unreachable for them and their behavior, message
  -- included, is unchanged.
  -- The argument is a SQL string literal in the CREATE TRIGGER call that
  -- passes it (see 5c) — any apostrophe in future remedy text must be
  -- doubled ('') or the trigger definition fails to parse. person_roles and
  -- reflection_evidence will likely need one of these when their governance
  -- gap closes.
  RAISE EXCEPTION
    'LVRF: % is a governed object; hard DELETE is prohibited. %',
    TG_TABLE_NAME,
    CASE WHEN TG_NARGS > 0 THEN TG_ARGV[0]
         ELSE 'Set deleted_at instead.' END
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
DECLARE
  ai boolean;
  assisted boolean;
  sim boolean;
  vendor boolean;
BEGIN
  IF NEW.supports <> 'actual' THEN RETURN NEW; END IF;
  SELECT e.ai_sourced, a.ai_assisted, e.simulated, e.kind = 'vendor_publication'
    INTO ai, assisted, sim, vendor
    FROM evidence e
    LEFT JOIN assessments a ON a.id = e.assessment_id
    WHERE e.id = NEW.evidence_id;

  IF ai THEN
    RAISE EXCEPTION
      'LVRF: AI-sourced evidence may not support a measured actual. '
      'AMENDMENT-005 Article I. The actual comes from the customer''s system of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF assisted THEN
    RAISE EXCEPTION
      'LVRF: evidence from an AI-assisted assessment may not support a measured actual. '
      'AMENDMENT-005 Article I. The actual comes from the customer''s system of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF sim THEN
    RAISE EXCEPTION
      'LVRF: simulated evidence may not support a measured actual. '
      'AMENDMENT-005 Article I. The actual comes from the customer''s system of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF vendor THEN
    RAISE EXCEPTION
      'LVRF: vendor-published evidence may not support a measured actual. '
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

-- 5c. DEFECT-003 closure — full governance triad for value_runs;
-- record_documents gets audit and a delete guard with its own remedy text.
-- Neither is in the "governed" array in section 4: value_runs already has a
-- bespoke trigger here in section 5, and record_documents needs a
-- non-default delete-guard argument, so both are attached explicitly rather
-- than through the generic loop.

-- value_runs already carries value_runs_locked_immutable above, BEFORE
-- UPDATE. Adding value_runs_audit as AFTER UPDATE is safe by trigger TIMING,
-- not trigger naming: Postgres fires every BEFORE trigger on a table before
-- any AFTER trigger on that table, regardless of alphabetical order. So if
-- locked_immutable rejects an UPDATE on a locked run, the statement aborts
-- before value_runs_audit ever runs — no audit row is ever written for a
-- write that never happened. Do not rely on trigger-name ordering here or
-- anywhere else in this file; rely on timing.
DROP TRIGGER IF EXISTS value_runs_audit ON value_runs;
CREATE TRIGGER value_runs_audit
  AFTER INSERT OR UPDATE ON value_runs
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS value_runs_touch ON value_runs;
CREATE TRIGGER value_runs_touch
  BEFORE UPDATE ON value_runs
  FOR EACH ROW EXECUTE FUNCTION lvrf_touch();

DROP TRIGGER IF EXISTS value_runs_no_delete ON value_runs;
CREATE TRIGGER value_runs_no_delete
  BEFORE DELETE ON value_runs
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete();

-- record_documents is a rendered disclosure record with no deleted_at
-- column. Its retirement mechanism is document_version — see the UNIQUE
-- constraint on (value_outcome_id, document_version) in the first
-- migration: a stale version is superseded by rendering a new one, never
-- soft-deleted. The generic "Set deleted_at instead" remedy would therefore
-- be permanently false for this table, not just false until a later
-- migration, so it passes its own remedy text as a trigger argument.
DROP TRIGGER IF EXISTS record_documents_audit ON record_documents;
CREATE TRIGGER record_documents_audit
  AFTER INSERT OR UPDATE ON record_documents
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS record_documents_no_delete ON record_documents;
CREATE TRIGGER record_documents_no_delete
  BEFORE DELETE ON record_documents
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'This is an immutable disclosure record with no soft-delete path; supersede by rendering a new document_version.'
  );

-- ------------------------------------------------------------------
-- Known ungoverned tables — not closed by this change
-- ------------------------------------------------------------------
-- value_outcome_evidence, offering_capabilities, person_roles, and
-- reflection_evidence carry no _audit/_touch/_no_delete triggers. All four
-- are composite-key junction tables with no id column, and lvrf_audit()
-- above hardcodes NEW.id::text — attaching it as-is would create cleanly and
-- then fail the first time a row is written on any of them. Closing this gap
-- needs either a variant audit function keyed on the composite primary key,
-- or a schema change adding a surrogate id to each table. That decision has
-- not been made; do not close it by adding these tables to the governed
-- array in section 4 unmodified.

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
-- value_runs_locked_immutable) = 41, plus 5c's DEFECT-003 closure
-- (value_runs_audit, value_runs_touch, value_runs_no_delete,
-- record_documents_audit, record_documents_no_delete) = 46 distinct triggers.
-- Expect 62 rows here: information_schema.triggers emits one row per event
-- manipulation. Each governed table contributes 4 rows (2 + 1 + 1) = 52;
-- no_ai_actual fires on INSERT and UPDATE (+2), locked_immutable on UPDATE
-- (+1); value_runs's new triad contributes 4 (2 + 1 + 1); record_documents
-- contributes 3 (2 + 1). 52 + 2 + 1 + 4 + 3 = 62.
SELECT event_object_table AS tbl, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY tbl, trigger_name;

-- Expect no UPDATE or DELETE for lvrf_app on these two tables.
SELECT table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'lvrf_app' AND table_name IN ('audit_log','heartbeat_events')
ORDER BY table_name, privilege_type;
