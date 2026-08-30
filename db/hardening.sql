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
--
-- NULL means a system operation: no HTTP request, no person. audit_log.
-- actor_person_id is deliberately nullable for exactly this case — the
-- null-actor rows from migrations 0011 and 0012 are the correct meaning of
-- NULL, not a gap, and migrations and hardening.sql itself run with the
-- setting unset, so this path must keep working. A malformed value is a
-- different thing: not "no actor", but garbage where an actor should be.
-- That must not audit as NULL — it must fail loudly, below.

CREATE OR REPLACE FUNCTION lvrf_current_actor() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  v := current_setting('lvrf.actor_person_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION
    'LVRF: lvrf.actor_person_id is set but is not a valid UUID. '
    'A write is either attributed to a person or is a system operation. '
    'It may not be attributed to nothing.'
    USING ERRCODE = 'check_violation';
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

-- 5d. A simulated person may not attest, assess, resolve a citation, or
-- verify a value outcome. AMD-005 Article I, enforced: a synthetic actor is
-- not the customer's named human, regardless of what a column says it
-- attests to.
--
-- One function across three tables, keyed on TG_TABLE_NAME rather than
-- three near-identical functions. NEW's columns differ by table, so which
-- column is read is decided by TG_TABLE_NAME branches BEFORE any column is
-- referenced — evidence has no assessed_by_person_id, and referencing it
-- unconditionally would fail at runtime on an evidence row. Exactly one
-- SELECT resolves every id gathered from those branches against persons in
-- a single lookup; the four IF blocks after it each raise their own
-- message so the reason is named, not just that one fired.
--
-- CONSEQUENCE: trigger count goes 46 -> 49. Three new triggers —
-- assessments_no_simulated_attestor, evidence_no_simulated_attestor,
-- value_outcomes_no_simulated_attestor. Reconciled by LIST below, not by
-- total: a count that reconciles is not proof the right things are
-- present; the full trigger list is the only valid check.

CREATE OR REPLACE FUNCTION lvrf_block_simulated_attestor() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  assessor_id  uuid;
  attestor_id  uuid;
  resolver_id  uuid;
  verifier_id  uuid;
  assessor_sim boolean;
  attestor_sim boolean;
  resolver_sim boolean;
  verifier_sim boolean;
BEGIN
  IF TG_TABLE_NAME = 'assessments' THEN
    assessor_id := NEW.assessed_by_person_id;
  ELSIF TG_TABLE_NAME = 'evidence' THEN
    attestor_id := NEW.attested_by_person_id;
    resolver_id := NEW.citation_resolved_by_person_id;
  ELSIF TG_TABLE_NAME = 'value_outcomes' THEN
    verifier_id := NEW.verified_by_person_id;
  END IF;

  IF assessor_id IS NULL AND attestor_id IS NULL
     AND resolver_id IS NULL AND verifier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pa.simulated, pt.simulated, pr.simulated, pv.simulated
    INTO assessor_sim, attestor_sim, resolver_sim, verifier_sim
    FROM (SELECT 1) AS _
    LEFT JOIN persons pa ON pa.id = assessor_id
    LEFT JOIN persons pt ON pt.id = attestor_id
    LEFT JOIN persons pr ON pr.id = resolver_id
    LEFT JOIN persons pv ON pv.id = verifier_id;

  IF assessor_sim THEN
    RAISE EXCEPTION
      'LVRF: a simulated person may not be the assessor of record. '
      'AMENDMENT-005 Article I. Attestation requires a real person of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF attestor_sim THEN
    RAISE EXCEPTION
      'LVRF: a simulated person may not attest to evidence. '
      'AMENDMENT-005 Article I. Attestation requires a real person of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF resolver_sim THEN
    RAISE EXCEPTION
      'LVRF: a simulated person may not resolve a citation. '
      'AMENDMENT-005 Article I. Attestation requires a real person of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF verifier_sim THEN
    RAISE EXCEPTION
      'LVRF: a simulated person may not verify a value outcome. '
      'AMENDMENT-005 Article I. Attestation requires a real person of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assessments_no_simulated_attestor ON assessments;
CREATE TRIGGER assessments_no_simulated_attestor
  BEFORE INSERT OR UPDATE ON assessments
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_simulated_attestor();

DROP TRIGGER IF EXISTS evidence_no_simulated_attestor ON evidence;
CREATE TRIGGER evidence_no_simulated_attestor
  BEFORE INSERT OR UPDATE ON evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_simulated_attestor();

DROP TRIGGER IF EXISTS value_outcomes_no_simulated_attestor ON value_outcomes;
CREATE TRIGGER value_outcomes_no_simulated_attestor
  BEFORE INSERT OR UPDATE ON value_outcomes
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_simulated_attestor();

-- 5e. Supersession chain sanity — fourteen tables carry superseded_by_id,
-- and until now nothing enforced what supersession MEANS beyond the bare
-- foreign key. A row could point at itself, supersede an already-superseded
-- row (two claimants), point backwards in time, or form a cycle. A broken
-- chain is worse than no chain: the chain is what makes "what did we
-- believe before" answerable, and it cannot fork or loop.
--
-- Mechanical integrity rules, not constitutional ones — no AMENDMENT-005
-- citation here. These four rules would hold even if AMENDMENT-005 did not
-- exist; they govern the shape of the supersession graph, not who may
-- attest to what.
--
-- One function across fourteen tables, keyed on TG_TABLE_NAME, the same
-- pattern as 5d. Two dynamic lookups, not one: the first resolves the
-- target row's own created_at/deleted_at — rules 2 and 4 together, a
-- single query, matching 5a/5d's shape — and the second checks whether any
-- OTHER row already claims the same successor (rule 3), a structurally
-- different question the first query cannot also answer.
--
-- CONSEQUENCE: trigger count goes 49 -> 63. Fourteen new triggers, one per
-- table in the loop below. Reconciled by LIST in the Verification block,
-- not by total — a count that reconciles is not proof the right things are
-- present.

CREATE OR REPLACE FUNCTION lvrf_supersession_is_sane() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_created_at timestamptz;
  target_deleted_at timestamptz;
  already_claimed boolean;
BEGIN
  IF NEW.superseded_by_id IS NULL THEN RETURN NEW; END IF;

  -- Rule 1: not self.
  IF NEW.superseded_by_id = NEW.id THEN
    RAISE EXCEPTION
      'LVRF: % % cannot supersede itself (superseded_by_id = id).',
      TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rules 2 & 4: one lookup for both — the target must exist, must not be
  -- retired, and must be newer than the row it supersedes.
  EXECUTE format('SELECT created_at, deleted_at FROM %I WHERE id = $1', TG_TABLE_NAME)
    INTO target_created_at, target_deleted_at
    USING NEW.superseded_by_id;

  IF target_created_at IS NULL THEN
    RAISE EXCEPTION
      'LVRF: % %.superseded_by_id (%) does not exist.',
      TG_TABLE_NAME, TG_TABLE_NAME, NEW.superseded_by_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF target_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION
      'LVRF: % % cannot supersede %, which is already retired (deleted_at is set).',
      TG_TABLE_NAME, NEW.id, NEW.superseded_by_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- NEW is the row having ITS OWN superseded_by_id set — the predecessor
  -- being replaced. target (looked up above) is the successor it points
  -- at. The successor must be newer than what it replaces; violation is
  -- target_created_at <= NEW.created_at, not the other way around.
  IF target_created_at <= NEW.created_at THEN
    RAISE EXCEPTION
      'LVRF: % %.superseded_by_id (%) is not newer than the row it supersedes (%). '
      'A superseding row must be newer than what it replaces, or the chain runs backwards in time.',
      TG_TABLE_NAME, TG_TABLE_NAME, NEW.superseded_by_id, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rule 3: the target may not already be claimed as the successor of a
  -- DIFFERENT row. Excludes NEW's own id so re-saving an unchanged row does
  -- not conflict with itself.
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I WHERE superseded_by_id = $1 AND id <> $2)',
    TG_TABLE_NAME)
    INTO already_claimed
    USING NEW.superseded_by_id, NEW.id;

  IF already_claimed THEN
    RAISE EXCEPTION
      'LVRF: % % is already claimed as the successor of a different % row. '
      'Two rows superseded by the same successor forks the chain.',
      TG_TABLE_NAME, NEW.superseded_by_id, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DO $$
DECLARE t text;
  supersession_governed text[] := ARRAY[
    'assessments', 'business_metrics', 'capabilities', 'engagements', 'evidence',
    'heartbeats', 'institutions', 'offerings', 'persons', 'reflections',
    'stewardship_returns', 'tenants', 'value_outcomes', 'value_runs'
  ];
BEGIN
  FOREACH t IN ARRAY supersession_governed LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_supersession_sane', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION lvrf_supersession_is_sane()', t || '_supersession_sane', t);
  END LOOP;
END $$;

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

-- ------------------------------------------------------------------
-- 8. 2.0 item 2, part A — refusals: an immutable record of authority
--    exercised
-- ------------------------------------------------------------------
-- A refusal is a FACT, not a governed claim (db/schema.ts) — no
-- deleted_at, no status, no version, nothing that ever changes. It gets a
-- delete guard only:
--   no _audit — audit_log's contract is old_row/new_row, a CHANGE; a
--   refusal has neither, so there is nothing for lvrf_audit() to record
--   no _touch — there is no updated_at; the row never changes
-- Same shape as 5c's record_documents_no_delete: its own remedy text,
-- because the generic "Set deleted_at instead" is permanently false here,
-- not just false until a later migration.
--
-- LIMITATION, restated at the point of enforcement: this trigger protects
-- a refusals ROW once one exists. It does not create one. This records
-- refusals arriving through an ENDPOINT — a gate refusal raised directly
-- in a psql session, which is every gate test to date, still leaves
-- nothing, because the trigger raises and no application is listening.
-- No writer exists yet; do not describe this as complete coverage.
--
-- CONSEQUENCE: trigger count goes 63 -> 64.

DROP TRIGGER IF EXISTS refusals_no_delete ON refusals;
CREATE TRIGGER refusals_no_delete
  BEFORE DELETE ON refusals
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'This is an immutable record of an attempt that was refused; it cannot be deleted, because the attempt happened.'
  );

COMMIT;

-- ------------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------------
-- A prior version of this comment reconciled 41 by arithmetic and declared
-- "no divergence" — the arithmetic matched production by coincidence while
-- five triggers below the loop (value_runs_audit, value_runs_touch,
-- value_runs_no_delete, record_documents_audit, record_documents_no_delete)
-- had never actually been applied. A count that reconciles is not proof the
-- right things are present. Do not re-derive a total here and trust it —
-- diff the SELECT below against the full list this file declares:
--
--   13 governed tables (0005 added 'offerings') × 3 (_audit, _touch,
--   _no_delete) — 39
--   value_outcome_evidence_no_ai_actual, value_runs_locked_immutable — 2
--   5c: value_runs_audit, value_runs_touch, value_runs_no_delete,
--   record_documents_audit, record_documents_no_delete — 5
--   5d: assessments_no_simulated_attestor, evidence_no_simulated_attestor,
--   value_outcomes_no_simulated_attestor — 3
--   5e: <table>_supersession_sane × 14 (assessments, business_metrics,
--   capabilities, engagements, evidence, heartbeats, institutions,
--   offerings, persons, reflections, stewardship_returns, tenants,
--   value_outcomes, value_runs) — 14
--   8: refusals_no_delete — 1
--   Total: 64 distinct triggers.
--
-- Expect 97 rows here: information_schema.triggers emits one row per event
-- manipulation. Each governed table contributes 4 rows (2 + 1 + 1) = 52;
-- no_ai_actual fires on INSERT and UPDATE (+2), locked_immutable on UPDATE
-- (+1); value_runs's 5c triad contributes 4 (2 + 1 + 1); record_documents
-- contributes 3 (2 + 1); each 5d trigger fires on INSERT and UPDATE, ×3 (+6);
-- each 5e trigger fires on INSERT and UPDATE, ×14 (+28); refusals_no_delete
-- fires on DELETE only (+1).
-- 52 + 2 + 1 + 4 + 3 + 6 + 28 + 1 = 97.
SELECT event_object_table AS tbl, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY tbl, trigger_name;

-- Expect no UPDATE or DELETE for lvrf_app on these two tables.
SELECT table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'lvrf_app' AND table_name IN ('audit_log','heartbeat_events')
ORDER BY table_name, privilege_type;
