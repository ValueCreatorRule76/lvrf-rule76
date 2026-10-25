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
    'value_outcomes', 'stewardship_returns', 'heartbeats', 'offerings',
    -- 0019 (2.0 item 5, industry packs step 1): industry_measures is a
    -- fully governed row (status/version/superseded_by_id/timestamps,
    -- same shape as business_metrics), so it belongs in this loop rather
    -- than a bespoke declaration — the generic "Set deleted_at instead"
    -- remedy is TRUE for it. industries does NOT belong here; see section
    -- 11 for why it is declared individually instead.
    'industry_measures',
    -- 0024 (account workbench): institution_facts carries the full
    -- governance() column set — deleted_at, updated_at, superseded_by_id —
    -- so the generic triad applies as written, and "Set deleted_at
    -- instead" is a true remedy for it.
    'institution_facts',
    -- 0034 (Q4h): institution_entities, the account's pinned entity —
    -- full governance() columns; corrected by supersession.
    'institution_entities',
    -- 0035 (O1): value_levers — pack content, full governance() columns.
    'value_levers',
    -- 0036 (O2): hypotheses and reference-example markers are governed rows,
    -- corrected by supersession.
    'value_hypotheses', 'reference_example_markers'
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
    'stewardship_returns', 'tenants', 'value_outcomes', 'value_runs',
    -- 0019: industry_measures carries superseded_by_id and follows the
    -- same chain-sanity rules as every other table here. industries does
    -- not — it has no superseded_by_id column — so it is absent from
    -- this list, not just from the governed array above.
    'industry_measures',
    -- 0024: institution_facts — corrections supersede, so the chain must
    -- obey the same sanity rules as every other superseding table.
    'institution_facts',
    -- 0034 (Q4h): an entity is corrected by superseding it (3.0 item 3).
    'institution_entities',
    -- 0035 (O1): a lever is corrected by superseding it.
    'value_levers',
    -- 0036 (O2): hypotheses and reference-example markers are governed rows,
    -- corrected by supersession.
    'value_hypotheses', 'reference_example_markers'
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
-- CLOSED 11 October 2026 by section 17 (L16): lvrf_audit_composite and
-- _no_delete on all four. The note below is kept as the reason it was open.
--
-- value_outcome_evidence, offering_capabilities, person_roles, and
-- reflection_evidence carry no _audit/_touch/_no_delete triggers. All four
-- are composite-key junction tables with no id column, and lvrf_audit()
-- above hardcodes NEW.id::text — attaching it as-is would create cleanly and
-- then fail the first time a row is written on any of them. Closing this gap
-- needs either a variant audit function keyed on the composite primary key,
-- or a schema change adding a surrogate id to each table. That decision has
-- not been made; do not close it by adding these tables to the governed
-- array in section 4 unmodified.
--
-- hardening_manifest is a fifth ungoverned table, deliberately, for a
-- different reason: see section 14. It is TRUNCATEd and repopulated by this
-- file on every run, so a _no_delete guard on it would make hardening.sql
-- fail against its own manifest, and _audit/_touch are meaningless on a
-- table with no UPDATEs. Do not add it to the governed array.

-- ------------------------------------------------------------------
-- 6. Append-only privileges
-- ------------------------------------------------------------------
-- The app can write history and read it. Its code paths cannot rewrite it.
-- This is FA-001's "AI may never rewrite history", applied to humans and
-- agents alike. NOT YET UNBREAKABLE AT THE ROLE LEVEL: lvrf_app owns
-- audit_log and heartbeat_events (migrations run as it), and an owner can
-- GRANT these privileges back to itself (shown on the prod copy, 12 Oct
-- 2026). Pending OWN-1 (LVRF_PLAN): a separate owner role, so lvrf_app
-- holds only the privileges below.

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

-- ------------------------------------------------------------------
-- 9. Citation resolution is final
-- ------------------------------------------------------------------
-- A citation resolution could previously be rewritten or reversed once set.
-- evidence_resolution_requires_human (CHECK, db/schema.ts) enforces that a
-- resolution carries a named person and a timestamp; nothing prevented
-- those values being changed afterwards, or citation_resolved being
-- flipped back to false.
--
-- WHY THIS MATTERS: the Deep Research seam. LVRF does not produce
-- AI-sourced evidence — it accepts it from outside and governs it. The
-- ONLY thing standing between AI-sourced text and verified evidence is a
-- named human resolving the citation. A gate that can be quietly reopened
-- is not a gate.
--
-- Modeled on lvrf_locked_run_immutable (5b): keyed on the row's PRIOR
-- state, so the first write (false -> true, setting the resolution) passes
-- and every later one is caught — a one-way door that closes behind
-- itself. Unlike locked_run_immutable, this does not freeze the whole row:
-- only the three resolution columns are frozen once set. Every other
-- column on evidence stays editable — this freezes the RESOLUTION, not the
-- evidence row.
--
-- WHAT THIS DOES NOT DO: it does not prevent a resolution being
-- SUPERSEDED. Creating a new evidence row that supersedes this one is the
-- sanctioned correction path, and lvrf_supersession_is_sane (5e) already
-- governs that chain. Immutability here means "not silently edited," not
-- "never correctable."
--
-- CONSEQUENCE: trigger count goes 64 -> 65.

-- Q4k (Brad, 12 Oct 2026): AI ORIGIN IS PERMANENT. ai_sourced, once true,
-- stays true on the row for good — before or after the citation is opened.
-- Opening a citation records that a named human checked the source; it
-- does not launder where the text came from. Folded into this function (no
-- new trigger): it is the same gate, keyed on the same row.
CREATE OR REPLACE FUNCTION lvrf_resolution_is_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.ai_sourced AND NOT NEW.ai_sourced THEN
    RAISE EXCEPTION
      'LVRF: evidence % is AI-sourced, and stays so: opening its citation records that a person '
      'checked the source; it does not change where the text came from.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  -- Unresolved is the normal case and is not governed further.
  IF NOT OLD.citation_resolved THEN RETURN NEW; END IF;

  IF NEW.citation_resolved IS DISTINCT FROM OLD.citation_resolved
     OR NEW.citation_resolved_by_person_id IS DISTINCT FROM OLD.citation_resolved_by_person_id
     OR NEW.citation_resolved_at IS DISTINCT FROM OLD.citation_resolved_at THEN
    RAISE EXCEPTION
      'LVRF: evidence % citation resolution is final. A resolved citation is the human '
      'gate between AI-sourced text and verified evidence, and it cannot be rewritten or '
      'reversed once set. Supersede the evidence row instead.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS evidence_resolution_is_final ON evidence;
CREATE TRIGGER evidence_resolution_is_final
  BEFORE UPDATE ON evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_resolution_is_final();

-- ------------------------------------------------------------------
-- 10. 2.0 item 5 — research_results governance
-- ------------------------------------------------------------------
-- research_results (db/schema.ts) holds parsed research fields pending a
-- human accept/reject decision — see the migration comment on
-- db/drizzle/0018_dusty_gideon.sql for why parsing and accepting are
-- different facts.
--
-- Full triad, individually declared rather than through the section 4
-- loop: research_results needs a NON-GENERIC _no_delete remedy (a parsed
-- result records what an agent returned and what a person decided about
-- it — there is no deleted_at column, so "Set deleted_at instead" would be
-- permanently false), the same reason record_documents (5c) and refusals
-- (8) are declared here rather than added to the governed array unmodified.
--
-- _touch is bespoke, not the generic lvrf_touch(): this table has no
-- updated_at column, and the generic function would fail on the first
-- UPDATE with "record NEW has no field updated_at". What DOES need to be
-- server-set rather than caller-supplied is reviewed_at — the review
-- decision is the only UPDATE this table's design allows, so
-- lvrf_touch_reviewed_at() stamps reviewed_at on every UPDATE the same way
-- lvrf_touch() stamps updated_at everywhere else. One pattern, a different
-- column, because this table has no updated_at to reuse. It does not set
-- reviewed_by_person_id — a person cannot be inferred the way "now" can,
-- so that column stays caller-supplied and is what
-- research_results_review_is_complete (0018) actually checks alongside it.
--
-- Q4b (0031) widened _touch to INSERT as well, and renamed its function
-- lvrf_research_results_stamps() (lvrf_touch_reviewed_at() is dropped
-- below, once nothing uses it). parsed_at is now server-set too: stamped
-- now() on INSERT, whatever the caller sent, and frozen on UPDATE. That is
-- what gives research_results_untracked_predates_prompts (0031) its force
-- — the CHECK says an untracked row was parsed before the cut-off, and
-- this makes parsed_at a fact the caller cannot choose, so no new row,
-- even by direct SQL, can claim to predate prompt tracking. Same trigger,
-- one more event: the distinct count is unchanged.
--
-- CONSEQUENCE: trigger count goes 65 -> 68.

CREATE OR REPLACE FUNCTION lvrf_research_results_stamps() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.parsed_at := now();
  ELSE
    NEW.parsed_at := OLD.parsed_at;
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS research_results_audit ON research_results;
CREATE TRIGGER research_results_audit
  AFTER INSERT OR UPDATE ON research_results
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS research_results_touch ON research_results;
CREATE TRIGGER research_results_touch
  BEFORE INSERT OR UPDATE ON research_results
  FOR EACH ROW EXECUTE FUNCTION lvrf_research_results_stamps();
DROP FUNCTION IF EXISTS lvrf_touch_reviewed_at();

DROP TRIGGER IF EXISTS research_results_no_delete ON research_results;
CREATE TRIGGER research_results_no_delete
  BEFORE DELETE ON research_results
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A parsed research result records what an agent returned and what a person decided about it; it cannot be deleted.'
  );

-- ------------------------------------------------------------------
-- 11. 2.0 item 5, industry packs step 1 — industries governance
-- ------------------------------------------------------------------
-- industry_measures (db/schema.ts) needs nothing here: it is a fully
-- governed row — status, version, superseded_by_id, steward_person_id,
-- created_at, updated_at, deleted_at, same shape as business_metrics — so
-- it was added to the `governed` array (section 4) and the
-- `supersession_governed` array (section 5e) above rather than declared
-- individually. See db/drizzle/0019_*.sql for what the table is and why
-- it is not a business_metrics row.
--
-- industries (db/schema.ts) is NOT fully governed, and that is a
-- decision, not an oversight. It is TENANT-SCOPED REFERENCE DATA — a
-- taxonomy seeded from one tenant's own vocabulary, extended by inserting
-- a row, not walked through a draft/ratify/retire lifecycle. It carries
-- no updated_at, no superseded_by_id, no deleted_at, so three of the four
-- standard triggers either don't apply or would fail outright:
--
--   _audit              yes. lvrf_audit() only needs NEW.id, present on
--                        every table, and recording who added an industry
--                        and when is useful.
--   _touch               NO. There is no updated_at column for
--                        lvrf_touch() to stamp; attaching it would fail
--                        on the first UPDATE with "record NEW has no
--                        field updated_at".
--   _no_delete           yes, but with ITS OWN remedy text, same pattern
--                        as record_documents (5c) and refusals (8):
--                        there is no deleted_at column, so the generic
--                        "Set deleted_at instead" would be a false
--                        instruction.
--   _supersession_sane   NO. lvrf_supersession_is_sane() (5e) reads
--                        NEW.superseded_by_id unconditionally; there is
--                        no such column here, so attaching it would fail
--                        on every INSERT.
--
-- Declared individually rather than through section 4's loop for the same
-- reason record_documents and refusals are: this table's shape does not
-- match what the generic loop assumes.
--
-- CONSEQUENCE: trigger count goes 68 -> 74. Six new triggers —
-- industry_measures_audit, industry_measures_touch,
-- industry_measures_no_delete (via section 4's loop),
-- industry_measures_supersession_sane (via section 5e's loop), plus
-- industries_audit and industries_no_delete (declared here). Reconciled
-- by LIST in the Verification block below, not by total.

DROP TRIGGER IF EXISTS industries_audit ON industries;
CREATE TRIGGER industries_audit
  AFTER INSERT OR UPDATE ON industries
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS industries_no_delete ON industries;
CREATE TRIGGER industries_no_delete
  BEFORE DELETE ON industries
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'This is tenant-scoped reference data with no soft-delete path; an unwanted industry stays, unused, rather than being deleted.'
  );

-- ------------------------------------------------------------------
-- 12. 2.0 item 5, industry packs step 2 — industry_measure_exclusions
--     governance
-- ------------------------------------------------------------------
-- industry_measure_exclusions (db/schema.ts) is a measure tested and
-- REJECTED for an industry — kept so the same wrong proposal is not made
-- twice, the same argument that produced refusals (section 8). Same
-- insert-only shape: no deleted_at, no superseded_by_id, no status, no
-- version, so it is declared individually rather than through section 4's
-- loop, for the same reason industries (section 11) is:
--
--   _audit              yes, generic — lvrf_audit() only needs NEW.id.
--                        Unlike refusals, which gets no _audit because
--                        the row IS the record of the event and a second
--                        audit_log entry would duplicate it, an exclusion
--                        is a business judgement about a MEASURE, not a
--                        record of an access attempt — worth its own
--                        audit trail if a person's reasoning is ever
--                        corrected by re-inserting under a new row.
--   _touch               NO. There is no updated_at column.
--   _no_delete           yes, with its own remedy text, same pattern as
--                        refusals (8) and industries (11): there is no
--                        deleted_at column, so the generic "Set
--                        deleted_at instead" would be a false
--                        instruction.
--   _supersession_sane   NO. There is no superseded_by_id column.
--
-- CONSEQUENCE: trigger count goes 74 -> 76. Two new triggers —
-- industry_measure_exclusions_audit, industry_measure_exclusions_no_delete.
-- Reconciled by LIST in the Verification block below, not by total.

DROP TRIGGER IF EXISTS industry_measure_exclusions_audit ON industry_measure_exclusions;
CREATE TRIGGER industry_measure_exclusions_audit
  AFTER INSERT OR UPDATE ON industry_measure_exclusions
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS industry_measure_exclusions_no_delete ON industry_measure_exclusions;
CREATE TRIGGER industry_measure_exclusions_no_delete
  BEFORE DELETE ON industry_measure_exclusions
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'This is an immutable record of a measure tested and rejected for an industry; it cannot be deleted, because the rejection happened.'
  );

-- ------------------------------------------------------------------
-- 13. 2.0 item 5, industry packs step 5 — capability_industry_measures
--     governance
-- ------------------------------------------------------------------
-- capability_industry_measures (db/schema.ts) records a JUDGEMENT with
-- an author: which industry measure a capability claims to move, and by
-- what mechanism. Insert-only, same shape as industry_measure_exclusions
-- and refusals: no deleted_at, no superseded_by_id, no status, no
-- version, so it is declared individually rather than through section
-- 4's loop, for the same reason industries (11) and
-- industry_measure_exclusions (12) are:
--
--   _audit              yes, generic — lvrf_audit() needs NEW.id, and
--                        UNLIKE offering_capabilities this table HAS one.
--                        See db/drizzle/0023_*.sql for why: a claim with
--                        no audit trail defeats the point of
--                        claimed_by_person_id, where offering_capabilities
--                        records a structural attachment nobody judged.
--   _touch               NO. There is no updated_at column.
--   _no_delete           yes, with its own remedy text, same pattern as
--                        refusals (8), industries (11) and
--                        industry_measure_exclusions (12): there is no
--                        deleted_at column, so the generic "Set
--                        deleted_at instead" would be a false
--                        instruction. Remedy text points at superseding
--                        the CAPABILITY, since that is how a claim made
--                        here is actually withdrawn.
--   _supersession_sane   NO. There is no superseded_by_id column.
--
-- THIS DOES NOT CLOSE the "Known ungoverned tables" gap noted after
-- section 5e — offering_capabilities, value_outcome_evidence,
-- person_roles and reflection_evidence still have no _audit, for the
-- same NEW.id::text limitation. capability_industry_measures sidesteps
-- the gap for itself, by having an id column; it does not fix
-- lvrf_audit() for composite-key tables in general, which remains a
-- separate, undecided question.
--
-- CONSEQUENCE: trigger count goes 76 -> 78. Two new triggers —
-- capability_industry_measures_audit,
-- capability_industry_measures_no_delete. Reconciled by LIST in the
-- Verification block below, not by total.

DROP TRIGGER IF EXISTS capability_industry_measures_audit ON capability_industry_measures;
CREATE TRIGGER capability_industry_measures_audit
  AFTER INSERT OR UPDATE ON capability_industry_measures
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS capability_industry_measures_no_delete ON capability_industry_measures;
CREATE TRIGGER capability_industry_measures_no_delete
  BEFORE DELETE ON capability_industry_measures
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'This is an immutable record of a claim that a capability moves an industry measure; it cannot be deleted, because the claim was made. To withdraw it, supersede the capability instead.'
  );

-- ------------------------------------------------------------------
-- 15. Sign-in P1 (0027) — person_credentials and sessions
--     (placed before section 14 so the manifest, which reads back every
--     trigger this run created, includes these two)
-- ------------------------------------------------------------------
-- Both tables are insert + revoke: a credential is rotated by marking the
-- current row revoked_at and inserting a new one; a session ends by
-- revoked_at or by expiry. Neither has deleted_at, so the generic "Set
-- deleted_at instead" remedy would be false — each gets its own text,
-- same pattern as refusals (8), industries (11), exclusions (12).
--
--   _audit      NO, deliberately. lvrf_audit() copies whole rows into
--               audit_log, which is append-only and can never be cleaned;
--               auditing these tables would put password hashes and
--               session-token hashes into it permanently.
--   _touch      NO. Neither table has updated_at.
--   _no_delete  YES, both.
--
-- CONSEQUENCE: trigger count goes 82 -> 84. Two new triggers —
-- person_credentials_no_delete, sessions_no_delete. Reconciled by LIST in
-- the Verification block below, not by total.

DROP TRIGGER IF EXISTS person_credentials_no_delete ON person_credentials;
CREATE TRIGGER person_credentials_no_delete
  BEFORE DELETE ON person_credentials
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A credential is never deleted. To replace a password, revoke the current credential (set revoked_at) and insert a new one — scripts/set_password.ts does both.'
  );

DROP TRIGGER IF EXISTS sessions_no_delete ON sessions;
CREATE TRIGGER sessions_no_delete
  BEFORE DELETE ON sessions
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A session is never deleted. To end it, set revoked_at; an expired session is already unusable.'
  );

-- ------------------------------------------------------------------
-- 16. 3.0 Band A item 1 (0029) — access_grants: only the steward grants
--     (placed before section 14 so the manifest includes these three)
-- ------------------------------------------------------------------
-- An access grant is a record of a decision that is Brad's alone (3.0
-- draft Q2, D4: tenants.steward_person_id). Insert + revoke, no
-- deleted_at, no updated_at, no superseded_by_id — declared individually,
-- like sections 11-13 and 15:
--
--   _audit              yes. Unlike person_credentials (15), nothing secret
--                       is in the row; who granted whom, when and why is
--                       exactly what the audit log is for.
--   _touch              NO. There is no updated_at column.
--   _no_delete          yes, with its own remedy text.
--   _steward_only       NEW. The rule "only the steward grants" held by
--                       the database, not by the scripts alone:
--                         INSERT — the grantee is current, non-simulated
--                           vendor staff of NEW.tenant_id; the tenant has
--                           a steward; granted_by IS that steward; no
--                           revocation fields yet.
--                         UPDATE — nothing changes but the revocation,
--                           written once (OLD.revoked_at IS NULL), and
--                           revoked_by IS the steward.
--                       The steward's own first grant (grantor = grantee)
--                       passes the same rule: it is the bootstrap.
--
-- TRUST ROOT, stated rather than hidden: the postgres superuser can
-- disable or bypass any trigger, and SSH to the box reaches it. That is
-- accepted (BUILD_STATUS, Band A). These triggers bind the APP'S CODE
-- PATHS: every route, and every script that writes through them. They do
-- NOT yet bind the lvrf_app ROLE: migrations run as lvrf_app, so it owns
-- the tables, and a table's owner can drop or disable its triggers and
-- re-grant itself revoked privileges (shown as lvrf_app on the prod copy,
-- 12 Oct 2026). Role-level protection is pending OWN-1 (LVRF_PLAN).
--
-- CONSEQUENCE: trigger count goes 84 -> 87. Three new triggers —
-- access_grants_audit, access_grants_no_delete,
-- access_grants_steward_only. Reconciled by LIST in the Verification
-- block below, not by total.

CREATE OR REPLACE FUNCTION lvrf_access_grant_steward_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  steward uuid;
  grantee_tenant uuid;
  grantee_ok boolean;
BEGIN
  SELECT steward_person_id INTO steward FROM tenants WHERE id = NEW.tenant_id;
  IF steward IS NULL THEN
    RAISE EXCEPTION 'LVRF: access_grants: tenant % has no steward; set one (scripts/set_steward.ts) before granting access.', NEW.tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT p.tenant_id,
           (p.simulated = false AND p.deleted_at IS NULL AND p.superseded_by_id IS NULL)
      INTO grantee_tenant, grantee_ok
      FROM persons p WHERE p.id = NEW.person_id;
    IF grantee_tenant IS DISTINCT FROM NEW.tenant_id OR NOT coalesce(grantee_ok, false) THEN
      RAISE EXCEPTION 'LVRF: access_grants: % is not current, non-simulated vendor staff of tenant %.', NEW.person_id, NEW.tenant_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.granted_by_person_id IS DISTINCT FROM steward THEN
      RAISE EXCEPTION 'LVRF: access_grants: only the tenant''s steward may grant access (granted_by % is not the steward).', NEW.granted_by_person_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revoked_at IS NOT NULL OR NEW.revoked_by_person_id IS NOT NULL OR NEW.revocation_reason IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: access_grants: a grant is inserted unrevoked; revocation is a later act.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only the revocation, once, by the steward.
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'LVRF: access_grants: grant % is already revoked; a revocation is not amended.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.person_id IS DISTINCT FROM OLD.person_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.granted_by_person_id IS DISTINCT FROM OLD.granted_by_person_id
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at OR NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION 'LVRF: access_grants: only the revocation may be written after a grant is made.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revoked_at IS NOT NULL AND NEW.revoked_by_person_id IS DISTINCT FROM steward THEN
    RAISE EXCEPTION 'LVRF: access_grants: only the tenant''s steward may revoke access (revoked_by % is not the steward).', NEW.revoked_by_person_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS access_grants_steward_only ON access_grants;
CREATE TRIGGER access_grants_steward_only
  BEFORE INSERT OR UPDATE ON access_grants
  FOR EACH ROW EXECUTE FUNCTION lvrf_access_grant_steward_only();

DROP TRIGGER IF EXISTS access_grants_audit ON access_grants;
CREATE TRIGGER access_grants_audit
  AFTER INSERT OR UPDATE ON access_grants
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS access_grants_no_delete ON access_grants;
CREATE TRIGGER access_grants_no_delete
  BEFORE DELETE ON access_grants
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'An access grant is never deleted. To end access, revoke it (scripts/revoke_access.ts), which records who revoked it and why.'
  );

-- ------------------------------------------------------------------
-- 17. L16 (Q4, 11 Oct 2026) — the four composite-key link tables
--     (placed before section 14 so the manifest includes these eight)
-- ------------------------------------------------------------------
-- value_outcome_evidence, offering_capabilities, person_roles and
-- reflection_evidence: link rows with a two-column primary key and no id,
-- which is why lvrf_audit() (NEW.id::text) could not be attached — see the
-- "Known ungoverned tables" note after section 5e, now closed by this
-- section. Every write to them in the code is an INSERT (checked by grep,
-- 11 Oct 2026: routes, walkSpine, seeds); nothing UPDATEs or DELETEs them.
--
--   _audit      via lvrf_audit_composite(<key columns>): record_id is the
--               primary-key values joined with '|', in key-column order
--               (e.g. '<value_outcome_id>|<evidence_id>'). audit_log.
--               record_id is text NOT NULL, so this needs no migration and
--               coerces nothing; the full row, key included, is in
--               new_row / old_row as always.
--   _no_delete  yes, with its own remedy text: a link is a fact that was
--               recorded; there is no deleted_at to set.
--
-- CONSEQUENCE: trigger count goes 87 -> 95. Eight new triggers — <table>
-- _audit and <table>_no_delete for each of the four. Reconciled by LIST in
-- the Verification block below, not by total. D3 (driftChecks.ts) then
-- finds no gap.

CREATE OR REPLACE FUNCTION lvrf_audit_composite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j_old jsonb;
  j_new jsonb;
  rid text := '';
  i int;
BEGIN
  IF TG_NARGS = 0 THEN
    RAISE EXCEPTION 'LVRF: lvrf_audit_composite on % needs its key columns as trigger arguments.', TG_TABLE_NAME;
  END IF;
  j_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN j_old := to_jsonb(OLD); END IF;
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    IF NOT jsonb_exists(j_new, TG_ARGV[i]) THEN
      RAISE EXCEPTION 'LVRF: lvrf_audit_composite on %: % is not a column.', TG_TABLE_NAME, TG_ARGV[i];
    END IF;
    rid := rid || CASE WHEN i > 0 THEN '|' ELSE '' END || (j_new ->> TG_ARGV[i]);
  END LOOP;
  INSERT INTO audit_log (table_name, record_id, operation, actor_person_id, old_row, new_row)
  VALUES (TG_TABLE_NAME, rid, CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END::audit_operation,
          lvrf_current_actor(), j_old, j_new);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS value_outcome_evidence_audit ON value_outcome_evidence;
CREATE TRIGGER value_outcome_evidence_audit
  AFTER INSERT OR UPDATE ON value_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit_composite('value_outcome_id', 'evidence_id');
DROP TRIGGER IF EXISTS value_outcome_evidence_no_delete ON value_outcome_evidence;
CREATE TRIGGER value_outcome_evidence_no_delete
  BEFORE DELETE ON value_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A link between an outcome and its evidence is never deleted; it records what the evidence was offered to support.'
  );

DROP TRIGGER IF EXISTS offering_capabilities_audit ON offering_capabilities;
CREATE TRIGGER offering_capabilities_audit
  AFTER INSERT OR UPDATE ON offering_capabilities
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit_composite('offering_id', 'capability_id');
DROP TRIGGER IF EXISTS offering_capabilities_no_delete ON offering_capabilities;
CREATE TRIGGER offering_capabilities_no_delete
  BEFORE DELETE ON offering_capabilities
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A link between an offering and a capability is never deleted. To withdraw it, supersede the capability.'
  );

DROP TRIGGER IF EXISTS person_roles_audit ON person_roles;
CREATE TRIGGER person_roles_audit
  AFTER INSERT OR UPDATE ON person_roles
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit_composite('person_id', 'role');
DROP TRIGGER IF EXISTS person_roles_no_delete ON person_roles;
CREATE TRIGGER person_roles_no_delete
  BEFORE DELETE ON person_roles
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A role assignment is never deleted; it records that the person held the role. To end it, supersede the person.'
  );

DROP TRIGGER IF EXISTS reflection_evidence_audit ON reflection_evidence;
CREATE TRIGGER reflection_evidence_audit
  AFTER INSERT OR UPDATE ON reflection_evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit_composite('reflection_id', 'evidence_id');
DROP TRIGGER IF EXISTS reflection_evidence_no_delete ON reflection_evidence;
CREATE TRIGGER reflection_evidence_no_delete
  BEFORE DELETE ON reflection_evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A link between a reflection and its evidence is never deleted.'
  );

-- ------------------------------------------------------------------
-- 18. Q4b (0031, 11 Oct 2026) — research_prompts: a generated prompt is
--     final (placed before section 14 so the manifest includes these three)
-- ------------------------------------------------------------------
-- research_prompts (db/schema.ts) records the exact text a research agent
-- was given, generated from live rows by POST /api/industries/:id/
-- research-prompts. A research result names the prompt it answered
-- (research_results.prompt_id), so the prompt is the other half of that
-- result's provenance: if its text could change, the result would point at
-- a question nobody asked. research_prompts_sha256_is_the_text (CHECK)
-- holds the hash to the text; this section holds the row still.
--
--   _audit      the generic lvrf_audit(): the table has an id.
--   _no_delete  with its own remedy text: there is no deleted_at to set.
--   _immutable  BEFORE UPDATE, raises on every UPDATE. A prompt that is
--               wrong is replaced by generating a new one; nothing is
--               edited. (So _audit only ever sees INSERTs; it is attached
--               for INSERT OR UPDATE like every other _audit, to keep one
--               shape.)
--
-- CONSEQUENCE: trigger count goes 95 -> 98.

CREATE OR REPLACE FUNCTION lvrf_research_prompt_is_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'LVRF: research prompt % is final. It is the exact text a research agent was given, '
    'and the results that answered it name it. Generate a new prompt instead.', OLD.id
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS research_prompts_audit ON research_prompts;
CREATE TRIGGER research_prompts_audit
  AFTER INSERT OR UPDATE ON research_prompts
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS research_prompts_no_delete ON research_prompts;
CREATE TRIGGER research_prompts_no_delete
  BEFORE DELETE ON research_prompts
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A research prompt is the exact text an agent was given; the results that answered it name it. It cannot be deleted.'
  );

DROP TRIGGER IF EXISTS research_prompts_immutable ON research_prompts;
CREATE TRIGGER research_prompts_immutable
  BEFORE UPDATE ON research_prompts
  FOR EACH ROW EXECUTE FUNCTION lvrf_research_prompt_is_final();

-- ------------------------------------------------------------------
-- 19. Q4h (0034, 12 Oct 2026) — one current entity per account, at COMMIT
--     (placed before section 14 so the manifest includes it)
-- ------------------------------------------------------------------
-- institution_entities (db/schema.ts) may have ONE current row (not
-- retired, not superseded) per institution. Not a partial unique index: a
-- correction inserts the successor and THEN points the old row at it
-- (lvrf_supersession_is_sane requires the successor to exist first), and an
-- immediate index refuses the instant both are current — the latent gap
-- 0015 recorded for business_metrics. A CONSTRAINT TRIGGER, DEFERRABLE
-- INITIALLY DEFERRED, runs at COMMIT: by then a correction has pointed the
-- old row, and anything that still leaves two current entities is refused
-- whole. Race: two pinning transactions each see one current row of their
-- own; the routes take the institution's entity rows FOR UPDATE, and this
-- trigger is the database's own backstop.
--
-- CONSEQUENCE: trigger count goes 102 -> 103.

CREATE OR REPLACE FUNCTION lvrf_one_current_entity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM institution_entities
   WHERE institution_id = NEW.institution_id AND deleted_at IS NULL AND superseded_by_id IS NULL;
  IF n > 1 THEN
    RAISE EXCEPTION
      'LVRF: institution % would have % current entities; an account has one. '
      'Correct an entity by superseding it (POST /api/institutions/:id/entity/supersede).', NEW.institution_id, n
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS institution_entities_one_current ON institution_entities;
CREATE CONSTRAINT TRIGGER institution_entities_one_current
  AFTER INSERT OR UPDATE ON institution_entities
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION lvrf_one_current_entity();

-- ------------------------------------------------------------------
-- 20. O1 (0035, 12 Oct 2026) — levers and their solutions: steward acts,
--     withdrawn, never deleted (placed before section 14 so the manifest
--     includes these)
-- ------------------------------------------------------------------
-- value_levers is governed (the loops above: _audit, _touch, _no_delete,
-- _supersession_sane). lever_offerings records that a steward judged a
-- catalog offering to pull a lever, with the basis: _audit (it has an id)
-- and _no_delete with its own remedy.
--
-- Both are STEWARD ACTS (O-D2). The routes check it (requireSteward); the
-- two *_steward_only triggers below make the database check it too, as
-- access_grants_steward_only does for grants (section 16), and guard the
-- tenant: a lever's tenant is its pack entry's, a link's is its lever's
-- and its offering's.
--   value_levers     INSERT — proposed_by IS the steward; unretired.
--                    UPDATE — a withdrawal (retired_by set) is by the
--                    steward; value_levers_retirement_is_complete holds the
--                    four marks together.
--   lever_offerings  INSERT — linked_by IS the steward; unretired.
--                    UPDATE — APPEND-ONLY but for the withdrawal: nothing
--                    changes but retired_at/by/reason, written once, by
--                    the steward.
-- Same trust root as section 16: these bind the app's code paths, not yet
-- the lvrf_app role, which owns the tables until OWN-1 (LVRF_PLAN).
--
-- CONSEQUENCE: with value_levers in the governed and supersession loops
-- above (+4), trigger count goes 103 -> 111.

CREATE OR REPLACE FUNCTION lvrf_value_lever_steward_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  steward uuid;
  entry_tenant uuid;
BEGIN
  SELECT steward_person_id INTO steward FROM tenants WHERE id = NEW.tenant_id;
  IF TG_OP = 'INSERT' THEN
    SELECT tenant_id INTO entry_tenant FROM industry_measures WHERE id = NEW.industry_measure_id;
    IF entry_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'LVRF: value_levers: a lever''s tenant is its pack entry''s (entry % is not of tenant %).', NEW.industry_measure_id, NEW.tenant_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_levers_steward_only';
    END IF;
    IF steward IS NULL OR NEW.proposed_by_person_id IS DISTINCT FROM steward THEN
      RAISE EXCEPTION 'LVRF: value_levers: only the tenant''s steward may propose a lever (proposed_by % is not the steward).', NEW.proposed_by_person_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_levers_steward_only';
    END IF;
    IF NEW.deleted_at IS NOT NULL OR NEW.retired_by_person_id IS NOT NULL OR NEW.retirement_reason IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: value_levers: a lever is inserted current; withdrawal is a later act.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_levers_steward_only';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.retired_by_person_id IS NULL AND NEW.retired_by_person_id IS NOT NULL
     AND (steward IS NULL OR NEW.retired_by_person_id IS DISTINCT FROM steward) THEN
    RAISE EXCEPTION 'LVRF: value_levers: only the tenant''s steward may withdraw a lever (retired_by % is not the steward).', NEW.retired_by_person_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'value_levers_steward_only';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS value_levers_steward_only ON value_levers;
CREATE TRIGGER value_levers_steward_only
  BEFORE INSERT OR UPDATE ON value_levers
  FOR EACH ROW EXECUTE FUNCTION lvrf_value_lever_steward_only();

CREATE OR REPLACE FUNCTION lvrf_lever_offering_steward_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  steward uuid;
  lever_tenant uuid;
  offering_tenant uuid;
BEGIN
  SELECT steward_person_id INTO steward FROM tenants WHERE id = NEW.tenant_id;
  IF TG_OP = 'INSERT' THEN
    SELECT tenant_id INTO lever_tenant FROM value_levers WHERE id = NEW.value_lever_id;
    SELECT tenant_id INTO offering_tenant FROM offerings WHERE id = NEW.offering_id;
    IF lever_tenant IS DISTINCT FROM NEW.tenant_id OR offering_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'LVRF: lever_offerings: a link''s tenant is its lever''s and its offering''s (tenant %).', NEW.tenant_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'lever_offerings_steward_only';
    END IF;
    IF steward IS NULL OR NEW.linked_by_person_id IS DISTINCT FROM steward THEN
      RAISE EXCEPTION 'LVRF: lever_offerings: only the tenant''s steward may link a solution to a lever (linked_by % is not the steward).', NEW.linked_by_person_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'lever_offerings_steward_only';
    END IF;
    IF NEW.retired_at IS NOT NULL OR NEW.retired_by_person_id IS NOT NULL OR NEW.retirement_reason IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: lever_offerings: a link is inserted current; withdrawal is a later act.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'lever_offerings_steward_only';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: only the withdrawal, once, by the steward.
  IF OLD.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'LVRF: lever_offerings: link % is already withdrawn; a withdrawal is not amended.', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'lever_offerings_steward_only';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.value_lever_id IS DISTINCT FROM OLD.value_lever_id OR NEW.offering_id IS DISTINCT FROM OLD.offering_id
     OR NEW.basis IS DISTINCT FROM OLD.basis OR NEW.linked_by_person_id IS DISTINCT FROM OLD.linked_by_person_id
     OR NEW.linked_at IS DISTINCT FROM OLD.linked_at THEN
    RAISE EXCEPTION 'LVRF: lever_offerings: only the withdrawal may be written after a link is made.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'lever_offerings_steward_only';
  END IF;
  IF steward IS NULL OR NEW.retired_by_person_id IS DISTINCT FROM steward THEN
    RAISE EXCEPTION 'LVRF: lever_offerings: only the tenant''s steward may withdraw a link (retired_by % is not the steward).', NEW.retired_by_person_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'lever_offerings_steward_only';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lever_offerings_audit ON lever_offerings;
CREATE TRIGGER lever_offerings_audit
  AFTER INSERT OR UPDATE ON lever_offerings
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS lever_offerings_no_delete ON lever_offerings;
CREATE TRIGGER lever_offerings_no_delete
  BEFORE DELETE ON lever_offerings
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A link between a lever and a solution is never deleted; withdraw it (POST /api/lever-offerings/:id/retire, the steward''s act) and it stays on record, marked.'
  );

DROP TRIGGER IF EXISTS lever_offerings_steward_only ON lever_offerings;
CREATE TRIGGER lever_offerings_steward_only
  BEFORE INSERT OR UPDATE ON lever_offerings
  FOR EACH ROW EXECUTE FUNCTION lvrf_lever_offering_steward_only();

-- ------------------------------------------------------------------
-- 21. Q9 (O1, 12 Oct 2026) — the D2 basis, DERIVED (decision D2, plan §3)
-- ------------------------------------------------------------------
-- ONE function computes the basis of an evidence row; every renderer calls
-- it and none infers it (LVRF_PLAN §5). Nothing is stored beside it, so
-- there is nothing to drift. Strongest first: system_of_record > published
-- > client_stated > inferred > assumed (the floor). Rules in D2's order;
-- the first that matches decides:
--   1 simulated                                   -> assumed, always
--   2 ai_sourced AND NOT citation_resolved        -> assumed, whatever the kind
--   3 system_export                               -> system_of_record
--   4 public_filing                               -> published
--   5 attestation, customer-side attester + date  -> client_stated
--   6 attestation otherwise                       -> assumed
--   7 vendor_publication                          -> published if about the
--                                                    tenant itself, else inferred
--   8 artifact                                    -> client_stated with a
--                                                    customer-side attester,
--                                                    else inferred
--   9 observation                                 -> inferred with a source
--                                                    reference, else assumed
--  10 assessment_result                           -> NULL: outside the
--                                                    account-fact vocabulary
-- source_verified does NOT raise the basis (it is the disclosure gate, Rule
-- 6), and self-declared confidence never does. A customer-side attester is
-- a non-simulated person of the evidence's own institution.

CREATE OR REPLACE FUNCTION lvrf_evidence_basis(e evidence) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN e.simulated THEN 'assumed'
    WHEN e.ai_sourced AND NOT e.citation_resolved THEN 'assumed'
    WHEN e.kind = 'system_export' THEN 'system_of_record'
    WHEN e.kind = 'public_filing' THEN 'published'
    WHEN e.kind = 'attestation' THEN
      CASE WHEN e.attested_at IS NOT NULL AND EXISTS (
             SELECT 1 FROM persons p WHERE p.id = e.attested_by_person_id
                AND p.institution_id = e.institution_id AND NOT p.simulated)
           THEN 'client_stated' ELSE 'assumed' END
    WHEN e.kind = 'vendor_publication' THEN
      CASE WHEN EXISTS (SELECT 1 FROM institutions i WHERE i.id = e.institution_id AND i.is_tenant_self)
           THEN 'published' ELSE 'inferred' END
    WHEN e.kind = 'artifact' THEN
      CASE WHEN EXISTS (
             SELECT 1 FROM persons p WHERE p.id = e.attested_by_person_id
                AND p.institution_id = e.institution_id AND NOT p.simulated)
           THEN 'client_stated' ELSE 'inferred' END
    WHEN e.kind = 'observation' THEN
      CASE WHEN e.source_reference IS NOT NULL AND btrim(e.source_reference) <> ''
           THEN 'inferred' ELSE 'assumed' END
    ELSE NULL  -- assessment_result: no basis (D2 rule 10)
  END
$$;

-- ------------------------------------------------------------------
-- 22. O2 (0036, 12 Oct 2026) — hypotheses, their computed verdict, the
--     verifier rule, executive summaries, reference-example markers
--     (placed before section 14 so the manifest includes these)
-- ------------------------------------------------------------------
-- value_hypotheses and reference_example_markers are in the governed and
-- supersession loops above (+8). This section adds:
--   value_hypotheses_guard            BEFORE INSERT OR UPDATE — the chain is
--                                     one chain; the author is current,
--                                     non-simulated staff; the reference
--                                     value is COPIED from the outcome row;
--                                     post_hoc COMPUTED; conditions hold no
--                                     digit; after INSERT nothing changes but
--                                     a withdrawal or a supersession, once,
--                                     while the verdict is open.
--   value_outcomes_verifier_not_author BEFORE UPDATE — O2-D1: the person who
--                                     verifies an actual may not have written
--                                     a hypothesis on that outcome.
--   reference_example_markers_steward_only, _one_current (deferred).
--   executive_summaries_audit, _no_delete, _guard (author is the actor's
--                                     kind: current non-simulated staff of
--                                     the tenant; no UPDATE, ever).
-- And the function lvrf_hypothesis_verdict(value_hypotheses): the verdict,
-- derived and never stored (O2-D1).
--
-- CONSEQUENCE: 111 -> 126 (8 from the loops, 7 here).

CREATE OR REPLACE FUNCTION lvrf_value_hypothesis_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o record;
  lev record;
  inst_tenant uuid;
  author_ok boolean;
  v text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.falsifier_conditions ~ '[0-9]' THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: numbers belong in recorded values, not falsifier conditions (the conditions hold a digit).'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_conditions_no_digits';
    END IF;
    SELECT tenant_id INTO inst_tenant FROM institutions WHERE id = NEW.institution_id;
    IF inst_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: the account % is not of tenant %.', NEW.institution_id, NEW.tenant_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
    END IF;
    SELECT vo.id, vo.institution_id, vo.capability_id, vo.deleted_at, vo.superseded_by_id,
           vo.baseline_value, vo.baseline_measured_at, vo.target_value, vo.committed_by_person_id,
           vo.committed_at, vo.actual_value, vo.verified_by_person_id, bm.industry_measure_id AS entry_id
      INTO o
      FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id
     WHERE vo.id = NEW.value_outcome_id;
    IF o.id IS NULL OR o.institution_id IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: outcome % is not this account''s.', NEW.value_outcome_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
    END IF;
    IF o.deleted_at IS NOT NULL OR o.superseded_by_id IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: outcome % is not current (retired or superseded).', NEW.value_outcome_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
    END IF;
    SELECT id, tenant_id, industry_measure_id, deleted_at, superseded_by_id INTO lev FROM value_levers WHERE id = NEW.value_lever_id;
    IF lev.id IS NULL OR lev.tenant_id IS DISTINCT FROM NEW.tenant_id OR lev.deleted_at IS NOT NULL OR lev.superseded_by_id IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: lever % is not a current lever of this tenant.', NEW.value_lever_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
    END IF;
    IF o.entry_id IS DISTINCT FROM lev.industry_measure_id THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: the outcome''s metric is not based on the lever''s pack entry; a hypothesis is one chain (capability, lever, pack entry, metric, outcome).'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM capability_industry_measures c
                    WHERE c.capability_id = o.capability_id AND c.industry_measure_id = lev.industry_measure_id) THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: the outcome''s capability does not claim the lever''s pack entry.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
    END IF;
    SELECT (p.tenant_id = NEW.tenant_id AND NOT p.simulated AND p.deleted_at IS NULL AND p.superseded_by_id IS NULL)
      INTO author_ok FROM persons p WHERE p.id = NEW.author_person_id;
    IF NOT coalesce(author_ok, false) THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: the author % is not current, non-simulated staff of the tenant.', NEW.author_person_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
    END IF;
    IF o.verified_by_person_id IS NOT DISTINCT FROM NEW.author_person_id THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: % verified this outcome''s actual and cannot author a hypothesis on it; the verifier may not be the author (O2-D1).', NEW.author_person_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_verifier_not_author';
    END IF;
    -- The reference value is QUOTED from the outcome row, here, once.
    IF NEW.falsifier_reference = 'baseline' THEN
      NEW.reference_value := o.baseline_value;
      NEW.reference_recorded_at := o.baseline_measured_at;
    ELSE
      IF o.target_value IS NULL OR o.committed_by_person_id IS NULL THEN
        RAISE EXCEPTION 'LVRF: value_hypotheses: outcome % has no committed target; a falsifier may reference only a target a named person committed to.', NEW.value_outcome_id
          USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
      END IF;
      NEW.reference_value := o.target_value;
      NEW.reference_recorded_at := o.committed_at;
    END IF;
    -- O2-D3: computed, never taken from a request.
    NEW.post_hoc := (now() AT TIME ZONE 'UTC')::date > NEW.falsifier_due OR o.actual_value IS NOT NULL;
    IF NEW.deleted_at IS NOT NULL OR NEW.superseded_by_id IS NOT NULL OR NEW.retired_by_person_id IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: a hypothesis is inserted current.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_guard';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: FROZEN. Only a withdrawal or a supersession, once each, while open.
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.institution_id IS DISTINCT FROM OLD.institution_id OR NEW.value_outcome_id IS DISTINCT FROM OLD.value_outcome_id
     OR NEW.value_lever_id IS DISTINCT FROM OLD.value_lever_id OR NEW.statement IS DISTINCT FROM OLD.statement
     OR NEW.falsifier_reference IS DISTINCT FROM OLD.falsifier_reference OR NEW.falsifier_due IS DISTINCT FROM OLD.falsifier_due
     OR NEW.falsifier_conditions IS DISTINCT FROM OLD.falsifier_conditions
     OR NEW.reference_value IS DISTINCT FROM OLD.reference_value
     OR NEW.reference_recorded_at IS DISTINCT FROM OLD.reference_recorded_at
     OR NEW.post_hoc IS DISTINCT FROM OLD.post_hoc OR NEW.author_person_id IS DISTINCT FROM OLD.author_person_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION 'LVRF: value_hypotheses: hypothesis % is frozen; its statement, chain and falsifier are never edited. Supersede it (POST /api/value-hypotheses/:id/supersede): the old version stays on the record.', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_frozen';
  END IF;
  IF (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     OR (OLD.superseded_by_id IS NOT NULL AND NEW.superseded_by_id IS DISTINCT FROM OLD.superseded_by_id) THEN
    RAISE EXCEPTION 'LVRF: value_hypotheses: hypothesis % is already withdrawn or superseded; that is not undone or amended.', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_frozen';
  END IF;
  IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
     OR (OLD.superseded_by_id IS NULL AND NEW.superseded_by_id IS NOT NULL) THEN
    v := lvrf_hypothesis_verdict(OLD);
    IF v <> 'open' THEN
      RAISE EXCEPTION 'LVRF: value_hypotheses: hypothesis %''s verdict is in (%); a tested hypothesis is not withdrawn or superseded.', OLD.id, v
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_hypotheses_frozen';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- The verdict (O2-D1). Derived, never stored; every renderer calls this.
--   superseded / withdrawn     the row says so
--   open                       until the outcome THIS hypothesis names has a
--                              VERIFIED actual (source_verified and a named
--                              verifier) measured on or after the due date
--   refuted                    the actual is no better than the reference,
--                              in the PACK ENTRY's direction (decrease:
--                              actual >= reference; increase: actual <=)
--   survived                   otherwise
--   ..._post_hoc               O2-D3: a post hoc hypothesis never reads
--                              plain 'survived'
-- Created before 0036's guard on value_hypotheses (the guard calls it).
CREATE OR REPLACE FUNCTION lvrf_hypothesis_verdict(h value_hypotheses) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN h.superseded_by_id IS NOT NULL THEN 'superseded'
    WHEN h.deleted_at IS NOT NULL THEN 'withdrawn'
    WHEN NOT (o.source_verified AND o.verified_by_person_id IS NOT NULL AND o.actual_value IS NOT NULL
              AND o.actual_measured_at IS NOT NULL
              AND (o.actual_measured_at AT TIME ZONE 'UTC')::date >= h.falsifier_due) THEN 'open'
    ELSE CASE WHEN (m.direction = 'decrease' AND o.actual_value >= h.reference_value)
                OR (m.direction = 'increase' AND o.actual_value <= h.reference_value)
              THEN 'refuted' ELSE 'survived' END
         || CASE WHEN h.post_hoc THEN '_post_hoc' ELSE '' END
  END
  FROM value_outcomes o, value_levers l JOIN industry_measures m ON m.id = l.industry_measure_id
  WHERE o.id = h.value_outcome_id AND l.id = h.value_lever_id
$$;

DROP TRIGGER IF EXISTS value_hypotheses_guard ON value_hypotheses;
CREATE TRIGGER value_hypotheses_guard
  BEFORE INSERT OR UPDATE ON value_hypotheses
  FOR EACH ROW EXECUTE FUNCTION lvrf_value_hypothesis_guard();

CREATE OR REPLACE FUNCTION lvrf_outcome_verifier_not_author() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verified_by_person_id IS NOT NULL
     AND NEW.verified_by_person_id IS DISTINCT FROM OLD.verified_by_person_id
     AND EXISTS (SELECT 1 FROM value_hypotheses h
                  WHERE h.value_outcome_id = NEW.id AND h.author_person_id = NEW.verified_by_person_id) THEN
    RAISE EXCEPTION 'LVRF: value_outcomes: % wrote a hypothesis on outcome % and cannot verify its actual; the verifier may not be the hypothesis'' author (O2-D1).', NEW.verified_by_person_id, NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcomes_verifier_not_author';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS value_outcomes_verifier_not_author ON value_outcomes;
CREATE TRIGGER value_outcomes_verifier_not_author
  BEFORE UPDATE ON value_outcomes
  FOR EACH ROW EXECUTE FUNCTION lvrf_outcome_verifier_not_author();

CREATE OR REPLACE FUNCTION lvrf_reference_marker_steward_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  steward uuid;
  inst_tenant uuid;
BEGIN
  SELECT steward_person_id INTO steward FROM tenants WHERE id = NEW.tenant_id;
  IF TG_OP = 'INSERT' THEN
    SELECT tenant_id INTO inst_tenant FROM institutions WHERE id = NEW.institution_id;
    IF inst_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'LVRF: reference_example_markers: the account % is not of tenant %.', NEW.institution_id, NEW.tenant_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'reference_example_markers_steward_only';
    END IF;
    IF steward IS NULL OR NEW.marked_by_person_id IS DISTINCT FROM steward THEN
      RAISE EXCEPTION 'LVRF: reference_example_markers: only the tenant''s steward may mark a reference example (marked_by % is not the steward).', NEW.marked_by_person_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'reference_example_markers_steward_only';
    END IF;
    IF NEW.deleted_at IS NOT NULL OR NEW.superseded_by_id IS NOT NULL OR NEW.retired_by_person_id IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: reference_example_markers: a marker is inserted current.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'reference_example_markers_steward_only';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.source_citation IS DISTINCT FROM OLD.source_citation
     OR NEW.note IS DISTINCT FROM OLD.note OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.marked_by_person_id IS DISTINCT FROM OLD.marked_by_person_id THEN
    RAISE EXCEPTION 'LVRF: reference_example_markers: a marker is not edited; supersede it.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'reference_example_markers_steward_only';
  END IF;
  IF OLD.retired_by_person_id IS NULL AND NEW.retired_by_person_id IS NOT NULL
     AND (steward IS NULL OR NEW.retired_by_person_id IS DISTINCT FROM steward) THEN
    RAISE EXCEPTION 'LVRF: reference_example_markers: only the tenant''s steward may unmark a reference example.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'reference_example_markers_steward_only';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reference_example_markers_steward_only ON reference_example_markers;
CREATE TRIGGER reference_example_markers_steward_only
  BEFORE INSERT OR UPDATE ON reference_example_markers
  FOR EACH ROW EXECUTE FUNCTION lvrf_reference_marker_steward_only();

CREATE OR REPLACE FUNCTION lvrf_one_current_reference_marker() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM reference_example_markers
   WHERE institution_id = NEW.institution_id AND deleted_at IS NULL AND superseded_by_id IS NULL;
  IF n > 1 THEN
    RAISE EXCEPTION 'LVRF: account % would have % current reference-example markers; it has one. Supersede it instead.', NEW.institution_id, n
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS reference_example_markers_one_current ON reference_example_markers;
CREATE CONSTRAINT TRIGGER reference_example_markers_one_current
  AFTER INSERT OR UPDATE ON reference_example_markers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION lvrf_one_current_reference_marker();

CREATE OR REPLACE FUNCTION lvrf_executive_summary_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  inst_tenant uuid;
  author_ok boolean;
  prev record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'LVRF: executive_summaries: summary % is a version on the record and is never edited; write a new version that supersedes it.', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'executive_summaries_guard';
  END IF;
  SELECT tenant_id INTO inst_tenant FROM institutions WHERE id = NEW.institution_id;
  IF inst_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'LVRF: executive_summaries: the account % is not of tenant %.', NEW.institution_id, NEW.tenant_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'executive_summaries_guard';
  END IF;
  SELECT (p.tenant_id = NEW.tenant_id AND NOT p.simulated AND p.deleted_at IS NULL AND p.superseded_by_id IS NULL)
    INTO author_ok FROM persons p WHERE p.id = NEW.author_person_id;
  IF NOT coalesce(author_ok, false) THEN
    RAISE EXCEPTION 'LVRF: executive_summaries: the author % is not current, non-simulated staff of the tenant; a summary is written by a named person.', NEW.author_person_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'executive_summaries_guard';
  END IF;
  IF NEW.value_run_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM value_runs r JOIN engagements e ON e.id = r.engagement_id
        WHERE r.id = NEW.value_run_id AND e.institution_id = NEW.institution_id) THEN
    RAISE EXCEPTION 'LVRF: executive_summaries: run % is not this account''s.', NEW.value_run_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'executive_summaries_guard';
  END IF;
  IF NEW.supersedes_id IS NOT NULL THEN
    SELECT institution_id, lens INTO prev FROM executive_summaries WHERE id = NEW.supersedes_id;
    IF prev.institution_id IS DISTINCT FROM NEW.institution_id OR prev.lens IS DISTINCT FROM NEW.lens THEN
      RAISE EXCEPTION 'LVRF: executive_summaries: a new version supersedes a summary of the same account and lens.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'executive_summaries_guard';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS executive_summaries_audit ON executive_summaries;
CREATE TRIGGER executive_summaries_audit
  AFTER INSERT OR UPDATE ON executive_summaries
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS executive_summaries_no_delete ON executive_summaries;
CREATE TRIGGER executive_summaries_no_delete
  BEFORE DELETE ON executive_summaries
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'An executive summary is a version on the record and is never deleted; write a new version that supersedes it.'
  );

DROP TRIGGER IF EXISTS executive_summaries_guard ON executive_summaries;
CREATE TRIGGER executive_summaries_guard
  BEFORE INSERT OR UPDATE ON executive_summaries
  FOR EACH ROW EXECUTE FUNCTION lvrf_executive_summary_guard();

-- ------------------------------------------------------------------
-- 23. W1 fix (0037, 12 Oct 2026) — account_person_links
--     (placed before section 14 so the manifest includes these)
-- ------------------------------------------------------------------
-- An existing person named in a role on an account (analyst of record),
-- with the title stated for that account. A link never makes a person
-- customer-side: commit, verify and attestation read persons.institution_id,
-- which a link does not touch.
--   account_person_links_guard  BEFORE INSERT OR UPDATE —
--     INSERT: the account is of the link's tenant; the person is current,
--             non-simulated STAFF of that tenant (persons.tenant_id); the
--             linker is current staff of it too; inserted current.
--     UPDATE: append-only but for the withdrawal, once.
--   account_person_links_audit, _no_delete.
-- These bind the app's code paths, not yet the lvrf_app role (OWN-1).
--
-- CONSEQUENCE: 126 -> 129.

CREATE OR REPLACE FUNCTION lvrf_account_person_link_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  inst_tenant uuid;
  ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT tenant_id INTO inst_tenant FROM institutions WHERE id = NEW.institution_id;
    IF inst_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'LVRF: account_person_links: the account % is not of tenant %.', NEW.institution_id, NEW.tenant_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'account_person_links_guard';
    END IF;
    SELECT (p.tenant_id = NEW.tenant_id AND NOT p.simulated AND p.deleted_at IS NULL AND p.superseded_by_id IS NULL)
      INTO ok FROM persons p WHERE p.id = NEW.person_id;
    IF NOT coalesce(ok, false) THEN
      RAISE EXCEPTION 'LVRF: account_person_links: % is not current, non-simulated staff of the tenant; only the tenant''s own people are linked to an account (a customer''s people belong to it directly).', NEW.person_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'account_person_links_guard';
    END IF;
    SELECT (p.tenant_id = NEW.tenant_id AND NOT p.simulated AND p.deleted_at IS NULL)
      INTO ok FROM persons p WHERE p.id = NEW.linked_by_person_id;
    IF NOT coalesce(ok, false) THEN
      RAISE EXCEPTION 'LVRF: account_person_links: the linker % is not current staff of the tenant.', NEW.linked_by_person_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'account_person_links_guard';
    END IF;
    IF NEW.retired_at IS NOT NULL OR NEW.retired_by_person_id IS NOT NULL OR NEW.retirement_reason IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: account_person_links: a link is inserted current; withdrawal is a later act.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'account_person_links_guard';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'LVRF: account_person_links: link % is already withdrawn; a withdrawal is not amended.', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'account_person_links_guard';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.institution_id IS DISTINCT FROM OLD.institution_id OR NEW.person_id IS DISTINCT FROM OLD.person_id
     OR NEW.role IS DISTINCT FROM OLD.role OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.linked_by_person_id IS DISTINCT FROM OLD.linked_by_person_id OR NEW.linked_at IS DISTINCT FROM OLD.linked_at THEN
    RAISE EXCEPTION 'LVRF: account_person_links: only the withdrawal may be written after a link is made; withdraw it and link again to change the title.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'account_person_links_guard';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS account_person_links_audit ON account_person_links;
CREATE TRIGGER account_person_links_audit
  AFTER INSERT OR UPDATE ON account_person_links
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS account_person_links_no_delete ON account_person_links;
CREATE TRIGGER account_person_links_no_delete
  BEFORE DELETE ON account_person_links
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A person named on an account stays on record; withdraw the link instead (POST /api/account-person-links/:id/retire).'
  );

DROP TRIGGER IF EXISTS account_person_links_guard ON account_person_links;
CREATE TRIGGER account_person_links_guard
  BEFORE INSERT OR UPDATE ON account_person_links
  FOR EACH ROW EXECUTE FUNCTION lvrf_account_person_link_guard();

-- ------------------------------------------------------------------
-- 24. OWN-1 (19 Oct 2026) — the app role owns nothing and cannot rewrite the rules
-- ------------------------------------------------------------------
-- WHY: until OWN-1, migrations ran as lvrf_app, so the app role OWNED every
-- table and could re-grant itself what section 7 revokes, or drop or disable
-- any trigger in this file (CLAUDE.md rule 3, "Pending OWN-1"). db/ownership.sql
-- hands everything to lvrf_owner (NOLOGIN); migrations run as lvrf_migrate,
-- acting as lvrf_owner. This section ASSERTS the result after every run:
-- any violation fails the run, and the transaction rolls back.
--
-- ONE DEFINITION. lvrf_ownership_violations() lists every violation as a
-- sentence; this section raises if it returns any row, and deploy step 5d
-- (scripts/check_ownership.ts) calls the same function, read-only, as
-- lvrf_app. Owned by the superuser that runs this file, so lvrf_app cannot
-- replace it. It reads only the catalogs.
--
-- ORDER ON A DATABASE: ownership.sql BEFORE this file. On a database not yet
-- converted (real local lvrf, until OWN-1 deploys) this section fails, by
-- design: hardening such a database would certify what is not true.
CREATE OR REPLACE FUNCTION lvrf_ownership_violations() RETURNS SETOF text
LANGUAGE sql STABLE AS $$
  SELECT format('the database %s is owned by %s, not lvrf_owner', d.datname, d.datdba::regrole)
    FROM pg_database d WHERE d.datname = current_database() AND d.datdba <> 'lvrf_owner'::regrole
  UNION ALL
  SELECT format('lvrf_app owns %s %I.%I', CASE c.relkind WHEN 'S' THEN 'sequence' WHEN 'v' THEN 'view' ELSE 'table' END, n.nspname, c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('public', 'drizzle') AND c.relowner = 'lvrf_app'::regrole
  UNION ALL
  SELECT format('lvrf_app owns type %I.%I', n.nspname, t.typname)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname IN ('public', 'drizzle') AND t.typowner = 'lvrf_app'::regrole
  UNION ALL
  SELECT format('lvrf_app owns function %s', p.oid::regprocedure)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'drizzle') AND p.proowner = 'lvrf_app'::regrole
  UNION ALL
  SELECT format('lvrf_app owns schema %I', n.nspname)
    FROM pg_namespace n WHERE n.nspname IN ('public', 'drizzle') AND n.nspowner = 'lvrf_app'::regrole
  UNION ALL
  SELECT format('lvrf_app holds %s on %I.%I', priv, n.nspname, c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   CROSS JOIN unnest(ARRAY['DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) priv
   WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'p')
     AND has_table_privilege('lvrf_app', c.oid, priv)
  UNION ALL
  SELECT format('lvrf_app holds UPDATE on %s', t)
    FROM unnest(ARRAY['audit_log', 'heartbeat_events', 'refusals', 'figure_checks', 'run_errata', 'governance_acts', 'research_imports']) t
   WHERE to_regclass(format('public.%I', t)) IS NOT NULL AND has_table_privilege('lvrf_app', format('public.%I', t), 'UPDATE')
  UNION ALL
  SELECT format('lvrf_app holds CREATE on schema %s', s)
    FROM unnest(ARRAY['public', 'drizzle']) s
   WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) AND has_schema_privilege('lvrf_app', s, 'CREATE')
  UNION ALL
  SELECT format('lvrf_app holds CREATE on the database %s', current_database())
   WHERE has_database_privilege('lvrf_app', current_database(), 'CREATE')
  UNION ALL
  SELECT format('lvrf_app is a member of %s', m.roleid::regrole)
    FROM pg_auth_members m WHERE m.member = 'lvrf_app'::regrole AND m.roleid IN ('lvrf_owner'::regrole, 'lvrf_migrate'::regrole)
  UNION ALL
  SELECT format('trigger %s on %s is disabled (tgenabled = %s)', tg.tgname, tg.tgrelid::regclass, tg.tgenabled)
    FROM pg_trigger tg WHERE NOT tg.tgisinternal AND tg.tgenabled <> 'O'
$$;

DO $$
DECLARE v text[];
BEGIN
  SELECT array_agg(x) INTO v FROM lvrf_ownership_violations() x;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'LVRF: OWN-1 ownership assertion failed (hardening.sql section 24; run db/ownership.sql first): %', array_to_string(v, '; ');
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 25. P1 (0039, 24 Oct 2026) — the evidence form and the figure check
--     (LVRF_PLAN §8; placed before section 14 so the manifest includes these)
-- ------------------------------------------------------------------
-- evidence_form_shape and evidence_how_read (CHECKs, db/schema.ts) hold one
-- row's shape. This section holds what a CHECK cannot:
--   evidence_form_guard          BEFORE INSERT OR UPDATE — "legacy" only on
--                                rows that existed before 0039 (refused on
--                                INSERT); the form, quote, locator and
--                                how-read never change after INSERT (the
--                                discipline of evidence_resolution_is_final).
--   institution_facts_form_kept  BEFORE UPDATE — a corrected fact keeps its
--                                evidence form: a quote's successor rests on
--                                a quote, a locator's on a locator. A legacy
--                                or statement predecessor may move to either
--                                (an upgrade, not a swap).
--   figure_checks_audit, _no_delete, _immutable, _guard — the figure check is
--                                append-only and names consistent rows: its
--                                evidence is the subject's, of the same
--                                account, never legacy, and "not checkable"
--                                exactly when the evidence is a person's
--                                statement (Brad, 24 Oct 2026).
--
-- CONSEQUENCE: trigger count goes 129 -> 135.

CREATE OR REPLACE FUNCTION lvrf_evidence_form_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.evidence_form = 'legacy' THEN
      RAISE EXCEPTION 'LVRF: evidence: "legacy" is the form of evidence recorded before evidence forms (24 Oct 2026). A new row states what it rests on: a quote, a locator, or a person''s statement.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'evidence_form_no_legacy';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.evidence_form IS DISTINCT FROM OLD.evidence_form
     OR NEW.quote_text IS DISTINCT FROM OLD.quote_text
     OR NEW.locator IS DISTINCT FROM OLD.locator
     OR NEW.how_read IS DISTINCT FROM OLD.how_read THEN
    RAISE EXCEPTION 'LVRF: evidence %: its form, quote, locator and how-read are final once recorded. Correct the fact it supports instead: the correction records new evidence.', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'evidence_form_final';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS evidence_form_guard ON evidence;
CREATE TRIGGER evidence_form_guard
  BEFORE INSERT OR UPDATE ON evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_evidence_form_guard();

CREATE OR REPLACE FUNCTION lvrf_fact_form_kept() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_form evidence_form;
  new_form evidence_form;
BEGIN
  IF NEW.superseded_by_id IS NOT NULL AND OLD.superseded_by_id IS NULL THEN
    SELECT e.evidence_form INTO old_form FROM evidence e WHERE e.id = OLD.evidence_id;
    SELECT e.evidence_form INTO new_form
      FROM institution_facts f JOIN evidence e ON e.id = f.evidence_id
     WHERE f.id = NEW.superseded_by_id;
    IF old_form IN ('quote', 'locator') AND new_form IS DISTINCT FROM old_form THEN
      RAISE EXCEPTION 'LVRF: institution_facts: a correction keeps its evidence form. This fact rests on a %, so its correction must rest on a % too (it rests on a %).', old_form, old_form, coalesce(new_form::text, 'nothing')
        USING ERRCODE = 'check_violation', CONSTRAINT = 'institution_facts_form_kept';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS institution_facts_form_kept ON institution_facts;
CREATE TRIGGER institution_facts_form_kept
  BEFORE UPDATE ON institution_facts
  FOR EACH ROW EXECUTE FUNCTION lvrf_fact_form_kept();

CREATE OR REPLACE FUNCTION lvrf_figure_check_is_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'LVRF: figure check % is final. It records what the evidence was compared with, and when. A new write records a new check.', OLD.id
    USING ERRCODE = 'check_violation';
END $$;

CREATE OR REPLACE FUNCTION lvrf_figure_check_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ev record;
  ok boolean;
BEGIN
  SELECT id, institution_id, evidence_form INTO ev FROM evidence WHERE id = NEW.evidence_id;
  IF ev.id IS NULL OR ev.institution_id IS DISTINCT FROM NEW.institution_id THEN
    RAISE EXCEPTION 'LVRF: figure_checks: evidence % is not this account''s.', NEW.evidence_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'figure_checks_guard';
  END IF;
  IF ev.evidence_form = 'legacy' THEN
    RAISE EXCEPTION 'LVRF: figure_checks: evidence % was recorded before evidence forms; it is not checked.', NEW.evidence_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'figure_checks_guard';
  END IF;
  IF (NEW.result = 'not_checkable') IS DISTINCT FROM (ev.evidence_form = 'statement') THEN
    RAISE EXCEPTION 'LVRF: figure_checks: "not checkable" is the result exactly when the evidence is a person''s statement (evidence % is a %, the result is %).', NEW.evidence_id, ev.evidence_form, NEW.result
      USING ERRCODE = 'check_violation', CONSTRAINT = 'figure_checks_guard';
  END IF;
  IF NEW.subject_table = 'institution_facts' THEN
    SELECT EXISTS (SELECT 1 FROM institution_facts f WHERE f.id = NEW.subject_id AND f.evidence_id = NEW.evidence_id) INTO ok;
  ELSE
    SELECT EXISTS (SELECT 1 FROM value_outcome_evidence l WHERE l.value_outcome_id = NEW.subject_id AND l.evidence_id = NEW.evidence_id AND l.withdrawn_at IS NULL) INTO ok;
  END IF;
  IF NOT ok THEN
    RAISE EXCEPTION 'LVRF: figure_checks: evidence % does not support % %.', NEW.evidence_id, NEW.subject_table, NEW.subject_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'figure_checks_guard';
  END IF;
  IF lvrf_current_actor() IS NOT NULL AND NEW.checked_by_person_id IS DISTINCT FROM lvrf_current_actor() THEN
    RAISE EXCEPTION 'LVRF: figure_checks: a check is recorded by the person whose write it checks.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'figure_checks_guard';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS figure_checks_audit ON figure_checks;
CREATE TRIGGER figure_checks_audit
  AFTER INSERT OR UPDATE ON figure_checks
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS figure_checks_no_delete ON figure_checks;
CREATE TRIGGER figure_checks_no_delete
  BEFORE DELETE ON figure_checks
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'A figure check records what a figure was compared with, and when. It cannot be deleted.'
  );

DROP TRIGGER IF EXISTS figure_checks_immutable ON figure_checks;
CREATE TRIGGER figure_checks_immutable
  BEFORE UPDATE ON figure_checks
  FOR EACH ROW EXECUTE FUNCTION lvrf_figure_check_is_final();

DROP TRIGGER IF EXISTS figure_checks_guard ON figure_checks;
CREATE TRIGGER figure_checks_guard
  BEFORE INSERT ON figure_checks
  FOR EACH ROW EXECUTE FUNCTION lvrf_figure_check_guard();

-- ------------------------------------------------------------------
-- 26. C1 (0040, 25 Oct 2026) — correcting what a link supports; errata on
--     sealed runs (LVRF_PLAN §9; Brad's ruling, C1-D1–D4; placed before
--     section 14 so the manifest includes these)
-- ------------------------------------------------------------------
--   value_outcome_evidence_guard      BEFORE INSERT OR UPDATE —
--     INSERT: a link is inserted current. A correcting link (corrects_supports
--       set) is the steward's, and names a link of the same outcome and
--       evidence with that supports — withdrawn first: inserting it before the
--       withdrawal is refused by value_outcome_evidence_one_current (C1-D1).
--       Any other insert on a retired engagement's outcome is refused: the
--       freeze, in the database (C1-D2).
--     UPDATE: the only change is the withdrawal — once, by the steward. A
--       link's outcome, evidence, supports and correction never change.
--   value_outcome_evidence_vendor_impact_only  BEFORE INSERT — a
--     vendor_publication about an account that is not the tenant's own may
--     support the impact basis only (Brad's ruling, point 3).
--   run_errata_audit, _no_delete, _immutable, _steward_only — an erratum is
--     the steward's, on a locked run of their tenant, about that run's
--     outcome and a current corrected link of it; and it is final. One per run
--     and correction (run_errata_one_per_correction); a later one supersedes
--     it, naming it — same run, same correction — at most once (C1 review).
--
-- CONSEQUENCE: trigger count goes 135 -> 141.

CREATE OR REPLACE FUNCTION lvrf_outcome_evidence_link_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o record;
  steward uuid;
BEGIN
  SELECT i.tenant_id, (g.deleted_at IS NOT NULL OR g.superseded_by_id IS NOT NULL) AS retired
    INTO o
    FROM value_outcomes vo JOIN institutions i ON i.id = vo.institution_id JOIN engagements g ON g.id = vo.engagement_id
   WHERE vo.id = NEW.value_outcome_id;
  SELECT steward_person_id INTO steward FROM tenants WHERE id = o.tenant_id;
  IF TG_OP = 'INSERT' THEN
    IF NEW.withdrawn_at IS NOT NULL OR NEW.withdrawn_by_person_id IS NOT NULL OR NEW.withdrawal_reason IS NOT NULL THEN
      RAISE EXCEPTION 'LVRF: value_outcome_evidence: a link is recorded current; its withdrawal is a later act.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcome_evidence_guard';
    END IF;
    IF NEW.corrects_supports IS NOT NULL THEN
      IF steward IS NULL OR NEW.corrected_by_person_id IS DISTINCT FROM steward THEN
        RAISE EXCEPTION 'LVRF: value_outcome_evidence: only the tenant''s steward corrects what a link supports.'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcome_evidence_guard';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM value_outcome_evidence l
                      WHERE l.value_outcome_id = NEW.value_outcome_id AND l.evidence_id = NEW.evidence_id AND l.supports = NEW.corrects_supports) THEN
        RAISE EXCEPTION 'LVRF: value_outcome_evidence: a correction replaces a link of the same outcome and evidence; none supports %.', NEW.corrects_supports
          USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcome_evidence_guard';
      END IF;
      RETURN NEW;
    END IF;
    IF o.retired THEN
      RAISE EXCEPTION 'LVRF: value_outcome_evidence: this outcome belongs to a retired engagement: its outcomes are frozen. Only a correction of what a link supports is recorded on it.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcome_evidence_frozen';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.value_outcome_id IS DISTINCT FROM OLD.value_outcome_id OR NEW.evidence_id IS DISTINCT FROM OLD.evidence_id
     OR NEW.supports IS DISTINCT FROM OLD.supports OR NEW.corrects_supports IS DISTINCT FROM OLD.corrects_supports
     OR NEW.corrected_by_person_id IS DISTINCT FROM OLD.corrected_by_person_id OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason THEN
    RAISE EXCEPTION 'LVRF: value_outcome_evidence: a link is never edited. Withdraw it; correct what it supports with a new link.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcome_evidence_guard';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL AND (NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at
     OR NEW.withdrawn_by_person_id IS DISTINCT FROM OLD.withdrawn_by_person_id OR NEW.withdrawal_reason IS DISTINCT FROM OLD.withdrawal_reason) THEN
    RAISE EXCEPTION 'LVRF: value_outcome_evidence: this link is already withdrawn; a withdrawal is final.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcome_evidence_guard';
  END IF;
  IF OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL
     AND (steward IS NULL OR NEW.withdrawn_by_person_id IS DISTINCT FROM steward) THEN
    RAISE EXCEPTION 'LVRF: value_outcome_evidence: only the tenant''s steward withdraws a link.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcome_evidence_guard';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS value_outcome_evidence_guard ON value_outcome_evidence;
CREATE TRIGGER value_outcome_evidence_guard
  BEFORE INSERT OR UPDATE ON value_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_outcome_evidence_link_guard();

CREATE OR REPLACE FUNCTION lvrf_vendor_impact_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ev_kind text;
  own boolean;
BEGIN
  SELECT e.kind::text INTO ev_kind FROM evidence e WHERE e.id = NEW.evidence_id;
  SELECT i.is_tenant_self INTO own FROM value_outcomes vo JOIN institutions i ON i.id = vo.institution_id WHERE vo.id = NEW.value_outcome_id;
  IF ev_kind = 'vendor_publication' AND NOT coalesce(own, false) AND NEW.supports IN ('baseline', 'actual') THEN
    RAISE EXCEPTION 'LVRF: a vendor publication about another company is not evidence of this account''s %: it may support the impact basis only.', NEW.supports
      USING ERRCODE = 'check_violation', CONSTRAINT = 'value_outcome_evidence_vendor_impact_only';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS value_outcome_evidence_vendor_impact_only ON value_outcome_evidence;
CREATE TRIGGER value_outcome_evidence_vendor_impact_only
  BEFORE INSERT ON value_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_vendor_impact_only();

CREATE OR REPLACE FUNCTION lvrf_run_erratum_is_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'LVRF: erratum % is final. It records what a sealed run got wrong, who said so and when. A further finding is a further erratum.', OLD.id
    USING ERRCODE = 'check_violation';
END $$;

CREATE OR REPLACE FUNCTION lvrf_run_erratum_steward_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  steward uuid;
BEGIN
  SELECT tenant_id, locked_at, payload->>'valueOutcomeId' AS outcome INTO r FROM value_runs WHERE id = NEW.value_run_id;
  IF r.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'LVRF: run_errata: run % is not of tenant %.', NEW.value_run_id, NEW.tenant_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'run_errata_steward_only';
  END IF;
  IF r.locked_at IS NULL THEN
    RAISE EXCEPTION 'LVRF: run_errata: an erratum is recorded on a locked run; an unlocked run is replaced, not corrected.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'run_errata_steward_only';
  END IF;
  IF r.outcome IS DISTINCT FROM NEW.value_outcome_id::text THEN
    RAISE EXCEPTION 'LVRF: run_errata: the erratum''s outcome is not the one run % sealed.', NEW.value_run_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'run_errata_steward_only';
  END IF;
  -- An erratum is about a correction: a current, correcting link of that support.
  IF NOT EXISTS (SELECT 1 FROM value_outcome_evidence l
                  WHERE l.value_outcome_id = NEW.value_outcome_id AND l.evidence_id = NEW.evidence_id
                    AND l.supports = NEW.corrected_to_supports AND l.corrects_supports IS NOT NULL AND l.withdrawn_at IS NULL) THEN
    RAISE EXCEPTION 'LVRF: run_errata: an erratum is about a corrected link; this outcome has no current link of that evidence corrected to %.', NEW.corrected_to_supports
      USING ERRCODE = 'check_violation', CONSTRAINT = 'run_errata_steward_only';
  END IF;
  -- C1 review (Brad, 25 Oct 2026): an erratum is corrected only by one that supersedes it — same run, same correction.
  IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM run_errata p WHERE p.id = NEW.supersedes_id AND p.value_run_id = NEW.value_run_id
          AND p.evidence_id = NEW.evidence_id AND p.corrected_to_supports = NEW.corrected_to_supports) THEN
    RAISE EXCEPTION 'LVRF: run_errata: an erratum supersedes one of the same run and the same correction.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'run_errata_steward_only';
  END IF;
  SELECT steward_person_id INTO steward FROM tenants WHERE id = NEW.tenant_id;
  IF steward IS NULL OR NEW.recorded_by_person_id IS DISTINCT FROM steward
     OR (lvrf_current_actor() IS NOT NULL AND lvrf_current_actor() IS DISTINCT FROM steward) THEN
    RAISE EXCEPTION 'LVRF: run_errata: only the tenant''s steward records an erratum.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'run_errata_steward_only';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS run_errata_audit ON run_errata;
CREATE TRIGGER run_errata_audit
  AFTER INSERT OR UPDATE ON run_errata
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();

DROP TRIGGER IF EXISTS run_errata_no_delete ON run_errata;
CREATE TRIGGER run_errata_no_delete
  BEFORE DELETE ON run_errata
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete(
    'An erratum records what a sealed run got wrong. It cannot be deleted.'
  );

DROP TRIGGER IF EXISTS run_errata_immutable ON run_errata;
CREATE TRIGGER run_errata_immutable
  BEFORE UPDATE ON run_errata
  FOR EACH ROW EXECUTE FUNCTION lvrf_run_erratum_is_final();

DROP TRIGGER IF EXISTS run_errata_steward_only ON run_errata;
CREATE TRIGGER run_errata_steward_only
  BEFORE INSERT ON run_errata
  FOR EACH ROW EXECUTE FUNCTION lvrf_run_erratum_steward_only();

-- ------------------------------------------------------------------
-- 27. P2 (0041, 25 Oct 2026) — governance acts, research imports, and the
--     presence check (LVRF_PLAN §10; design §2.4/§5.1; P2-D1–D8; Step 0
--     proved the mechanism on a scratch database: scripts/step0_act_presence.sh;
--     placed before section 14 so the manifest includes these)
-- ------------------------------------------------------------------
--   governance_acts_audit, _no_delete, _immutable, _guard — an act is the
--     session actor's, names a subject (and any result) that exists in its
--     tenant, and carries THIS transaction's txid (forced: it cannot be
--     written for another transaction).
--   research_imports_audit, _no_delete, _immutable — the pasted text and its
--     hash are final.
--   research_results_import_matches — a result's import answered the
--     result's own prompt, in its tenant; import_id never changes.
--   <t>_act_present on 18 governed tables (P2-D3) — a DEFERRED constraint
--     trigger: at COMMIT, a governed transition of a row with no act naming
--     it (subject or result) in the same transaction is refused.
--
-- CONSEQUENCE: trigger count goes 141 -> 167 (4 + 3 + 1 + 18).

CREATE OR REPLACE FUNCTION lvrf_governed_row_tenant(p_table text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  t text := CASE WHEN p_table = 'value_outcome_evidence' THEN 'value_outcomes' ELSE p_table END;
  j jsonb;
BEGIN
  IF t NOT IN ('research_imports', 'research_results', 'evidence', 'value_outcomes', 'value_runs', 'engagements',
               'industry_measures', 'value_levers', 'lever_offerings', 'reference_example_markers', 'value_hypotheses',
               'account_person_links', 'institution_facts', 'institution_entities', 'business_metrics',
               'industry_measure_exclusions', 'run_errata') THEN
    RETURN NULL;
  END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE x.id = $1', t) INTO j USING p_id;
  IF j IS NULL THEN RETURN NULL; END IF;
  IF j ? 'tenant_id' AND j->>'tenant_id' IS NOT NULL THEN RETURN (j->>'tenant_id')::uuid; END IF;
  IF j ? 'institution_id' AND j->>'institution_id' IS NOT NULL THEN
    RETURN (SELECT i.tenant_id FROM institutions i WHERE i.id = (j->>'institution_id')::uuid);
  END IF;
  IF j ? 'industry_id' AND j->>'industry_id' IS NOT NULL THEN
    RETURN (SELECT d.tenant_id FROM industries d WHERE d.id = (j->>'industry_id')::uuid);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION lvrf_governance_act_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  st uuid;
  rt uuid;
BEGIN
  -- The transaction's own id, always: an act cannot be written for another transaction.
  NEW.txid := txid_current();
  NEW.at := now();
  IF lvrf_current_actor() IS NOT NULL AND NEW.actor_person_id IS DISTINCT FROM lvrf_current_actor() THEN
    RAISE EXCEPTION 'LVRF: governance_acts: an act is recorded by the person acting; % is not the actor of this request.', NEW.actor_person_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'governance_acts_guard';
  END IF;
  st := lvrf_governed_row_tenant(NEW.subject_table, NEW.subject_id);
  IF st IS NULL THEN
    RAISE EXCEPTION 'LVRF: governance_acts: the act''s subject %.% does not exist, or is not a governed table.', NEW.subject_table, NEW.subject_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'governance_acts_guard';
  END IF;
  IF st IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'LVRF: governance_acts: the act''s subject is not of tenant %.', NEW.tenant_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'governance_acts_guard';
  END IF;
  IF NEW.subject_table = 'value_outcome_evidence'
     AND NOT EXISTS (SELECT 1 FROM value_outcome_evidence l WHERE l.value_outcome_id = NEW.subject_id AND l.evidence_id = NEW.result_id) THEN
    RAISE EXCEPTION 'LVRF: governance_acts: an act on a link names its outcome and its evidence; there is no such link.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'governance_acts_guard';
  END IF;
  IF NEW.result_table IS NOT NULL AND NEW.subject_table <> 'value_outcome_evidence' THEN
    rt := lvrf_governed_row_tenant(NEW.result_table, NEW.result_id);
    IF rt IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'LVRF: governance_acts: the act''s result %.% does not exist in tenant %.', NEW.result_table, NEW.result_id, NEW.tenant_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'governance_acts_guard';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION lvrf_governance_act_is_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LVRF: % % is final. An act records who did what, when and why; it is never edited.', TG_TABLE_NAME, OLD.id
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS governance_acts_audit ON governance_acts;
CREATE TRIGGER governance_acts_audit AFTER INSERT OR UPDATE ON governance_acts
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();
DROP TRIGGER IF EXISTS governance_acts_no_delete ON governance_acts;
CREATE TRIGGER governance_acts_no_delete BEFORE DELETE ON governance_acts
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete('An act records who did what, when and why. It cannot be deleted.');
DROP TRIGGER IF EXISTS governance_acts_immutable ON governance_acts;
CREATE TRIGGER governance_acts_immutable BEFORE UPDATE ON governance_acts
  FOR EACH ROW EXECUTE FUNCTION lvrf_governance_act_is_final();
DROP TRIGGER IF EXISTS governance_acts_guard ON governance_acts;
CREATE TRIGGER governance_acts_guard BEFORE INSERT ON governance_acts
  FOR EACH ROW EXECUTE FUNCTION lvrf_governance_act_guard();

DROP TRIGGER IF EXISTS research_imports_audit ON research_imports;
CREATE TRIGGER research_imports_audit AFTER INSERT OR UPDATE ON research_imports
  FOR EACH ROW EXECUTE FUNCTION lvrf_audit();
DROP TRIGGER IF EXISTS research_imports_no_delete ON research_imports;
CREATE TRIGGER research_imports_no_delete BEFORE DELETE ON research_imports
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_delete('A research import is the text a result was parsed from. It cannot be deleted.');
DROP TRIGGER IF EXISTS research_imports_immutable ON research_imports;
CREATE TRIGGER research_imports_immutable BEFORE UPDATE ON research_imports
  FOR EACH ROW EXECUTE FUNCTION lvrf_governance_act_is_final();

CREATE OR REPLACE FUNCTION lvrf_research_result_import_matches() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  imp record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.import_id IS DISTINCT FROM OLD.import_id THEN
    RAISE EXCEPTION 'LVRF: research_results: a result''s import is recorded when it is parsed and never changes.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'research_results_import_matches';
  END IF;
  -- A result with no prompt is research_results_prompt_named's to refuse, not this trigger's.
  IF NEW.import_id IS NOT NULL AND NEW.prompt_id IS NOT NULL THEN
    SELECT prompt_id, tenant_id INTO imp FROM research_imports WHERE id = NEW.import_id;
    IF imp.prompt_id IS DISTINCT FROM NEW.prompt_id OR imp.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'LVRF: research_results: this result''s import answered another prompt; a result is parsed from the import of its own prompt.'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'research_results_import_matches';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS research_results_import_matches ON research_results;
CREATE TRIGGER research_results_import_matches BEFORE INSERT OR UPDATE ON research_results
  FOR EACH ROW EXECUTE FUNCTION lvrf_research_result_import_matches();

-- The presence check. One function; each table's governed transitions are
-- named here (P2-D3). Runs at COMMIT (deferred), so the act may be written
-- before or after the change, but in the same transaction (Step 0, S1–S8).
CREATE OR REPLACE FUNCTION lvrf_require_act() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  n jsonb := to_jsonb(NEW);
  what text;
  k uuid;
  r uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Common to every governed table: a retirement or a supersession.
    IF o ? 'deleted_at' AND o->>'deleted_at' IS NULL AND n->>'deleted_at' IS NOT NULL THEN what := 'a retirement';
    ELSIF o ? 'retired_at' AND o->>'retired_at' IS NULL AND n->>'retired_at' IS NOT NULL THEN what := 'a retirement';
    ELSIF o ? 'superseded_by_id' AND o->>'superseded_by_id' IS NULL AND n->>'superseded_by_id' IS NOT NULL THEN what := 'a supersession';
    END IF;
    IF what IS NULL THEN
      CASE TG_TABLE_NAME
        WHEN 'research_results' THEN
          IF o->>'review_state' = 'pending' AND n->>'review_state' <> 'pending' THEN what := 'a review (' || (n->>'review_state') || ')'; END IF;
        WHEN 'evidence' THEN
          IF NOT (o->>'citation_resolved')::boolean AND (n->>'citation_resolved')::boolean THEN what := 'a citation opened'; END IF;
        WHEN 'value_outcomes' THEN
          IF (o->'committed_at') IS DISTINCT FROM (n->'committed_at') OR (o->'target_value') IS DISTINCT FROM (n->'target_value') THEN what := 'a commitment';
          ELSIF (o->'actual_value') IS DISTINCT FROM (n->'actual_value') OR (o->'actual_measured_at') IS DISTINCT FROM (n->'actual_measured_at') THEN what := 'a measurement';
          ELSIF (o->'verified_by_person_id') IS DISTINCT FROM (n->'verified_by_person_id') OR (o->'verified_at') IS DISTINCT FROM (n->'verified_at') THEN what := 'a verification';
          END IF;
        WHEN 'value_runs' THEN
          IF o->>'locked_at' IS NULL AND n->>'locked_at' IS NOT NULL THEN what := 'a lock'; END IF;
        WHEN 'value_outcome_evidence' THEN
          IF o->>'withdrawn_at' IS NULL AND n->>'withdrawn_at' IS NOT NULL THEN what := 'a withdrawal'; END IF;
        ELSE NULL;
      END CASE;
    END IF;
  ELSE
    CASE TG_TABLE_NAME
      WHEN 'value_levers' THEN what := 'a lever ratified';
      WHEN 'lever_offerings' THEN what := 'a solution linked';
      WHEN 'industry_measure_exclusions' THEN what := 'an exclusion';
      WHEN 'reference_example_markers' THEN what := 'a marker';
      WHEN 'run_errata' THEN what := 'an erratum';
      WHEN 'research_imports' THEN what := 'an import';
      WHEN 'value_outcome_evidence' THEN
        IF n->>'corrects_supports' IS NOT NULL THEN what := 'a correcting link'; END IF;
      ELSE NULL;
    END CASE;
  END IF;
  IF what IS NULL THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'value_outcome_evidence' THEN
    k := (n->>'value_outcome_id')::uuid;
    r := (n->>'evidence_id')::uuid;
    IF EXISTS (SELECT 1 FROM governance_acts a
                WHERE a.txid = txid_current() AND a.subject_table = TG_TABLE_NAME AND a.subject_id = k AND a.result_id = r) THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'LVRF: value_outcome_evidence (outcome %, evidence %): % with no governance act recorded in this transaction.', k, r, what
      USING ERRCODE = 'check_violation', CONSTRAINT = 'governance_act_present';
  END IF;
  k := (n->>'id')::uuid;
  IF EXISTS (SELECT 1 FROM governance_acts a
              WHERE a.txid = txid_current()
                AND ((a.subject_table = TG_TABLE_NAME AND a.subject_id = k)
                  OR (a.result_table = TG_TABLE_NAME AND a.result_id = k))) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'LVRF: % %: % with no governance act recorded in this transaction.', TG_TABLE_NAME, k, what
    USING ERRCODE = 'check_violation', CONSTRAINT = 'governance_act_present';
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'research_imports', 'research_results', 'evidence', 'value_outcomes', 'value_runs', 'engagements',
    'industry_measures', 'value_levers', 'lever_offerings', 'reference_example_markers', 'value_hypotheses',
    'account_person_links', 'institution_facts', 'institution_entities', 'business_metrics',
    'industry_measure_exclusions', 'value_outcome_evidence', 'run_errata']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_act_present', t);
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED '
                   'FOR EACH ROW EXECUTE FUNCTION lvrf_require_act()', t || '_act_present', t);
  END LOOP;
END $$;

-- lvrf_lineage(table, id[, figure]) — "where did this come from" (P2, design
-- §2.4; P2-D1, D2, D7). Read-only. Each step: what, the row, who, when, and
-- its source: 'act' (a governance act recorded at the time), 'record' (the
-- row's own who/when columns or the audit log — history before governance
-- acts is labelled so, never turned into an act: P2-D2), 'seal' (a run's
-- sealed payload). Outcome evidence in a run is matched by kind, summary and
-- source, labelled so: snapshots carry no evidence id (P2-D7).
CREATE OR REPLACE FUNCTION lvrf_lineage_act(p_table text, p_id uuid, p_acts text[])
RETURNS TABLE (actor text, at timestamptz, reason text, act text, result_table text, result_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT p.full_name, a.at, a.reason, a.act::text, a.result_table, a.result_id
    FROM governance_acts a JOIN persons p ON p.id = a.actor_person_id
   WHERE a.subject_table = p_table AND a.subject_id = p_id AND a.act::text = ANY (p_acts)
   ORDER BY a.at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION lvrf_lineage_research(p_result uuid)
RETURNS TABLE (kind text, row_table text, row_id uuid, actor text, at timestamptz, source text, detail jsonb)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  rr record;
  a record;
BEGIN
  SELECT r.*, pp.full_name AS parser INTO rr FROM research_results r JOIN persons pp ON pp.id = r.parsed_by_person_id WHERE r.id = p_result;
  IF rr.id IS NULL THEN RETURN; END IF;
  IF rr.prompt_id IS NULL THEN
    RETURN QUERY SELECT 'prompt'::text, NULL::text, NULL::uuid, NULL::text, NULL::timestamptz, 'record'::text,
      jsonb_build_object('note', 'untracked: parsed before research prompts were tracked (12 Oct 2026)');
  ELSE
    RETURN QUERY SELECT 'prompt'::text, 'research_prompts'::text, p.id, g.full_name, p.generated_at, 'record'::text,
      jsonb_build_object('phase', p.phase, 'contract_version', p.contract_version, 'template_version', p.template_version,
                         'prompt_sha256', encode(sha256(convert_to(p.prompt_text, 'UTF8')), 'hex'))
      FROM research_prompts p JOIN persons g ON g.id = p.generated_by_person_id WHERE p.id = rr.prompt_id;
  END IF;
  IF rr.import_id IS NULL THEN
    RETURN QUERY SELECT 'import'::text, NULL::text, NULL::uuid, NULL::text, NULL::timestamptz, 'record'::text,
      jsonb_build_object('note', 'no import (before research imports, 25 Oct 2026)');
  ELSE
    SELECT * INTO a FROM lvrf_lineage_act('research_imports', rr.import_id, ARRAY['import']);
    RETURN QUERY SELECT 'import'::text, 'research_imports'::text, i.id, coalesce(a.actor, ip.full_name), coalesce(a.at, i.imported_at),
      CASE WHEN a.actor IS NOT NULL THEN 'act' ELSE 'record' END,
      jsonb_build_object('raw_sha256', i.raw_sha256, 'byte_length', i.byte_length)
      FROM research_imports i JOIN persons ip ON ip.id = i.imported_by_person_id WHERE i.id = rr.import_id;
  END IF;
  RETURN QUERY SELECT 'result'::text, 'research_results'::text, rr.id, rr.parser, rr.parsed_at, 'record'::text,
    jsonb_build_object('field', rr.field_name, 'found', rr.found, 'research_tool', rr.research_tool, 'contract_version', rr.contract_version);
  SELECT * INTO a FROM lvrf_lineage_act('research_results', rr.id, ARRAY['accept', 'reject']);
  IF a.actor IS NOT NULL THEN
    RETURN QUERY SELECT a.act, 'research_results'::text, rr.id, a.actor, a.at, 'act'::text, jsonb_build_object('reason', a.reason);
  ELSIF rr.review_state::text <> 'pending' THEN
    RETURN QUERY SELECT (CASE WHEN rr.review_state::text = 'accepted' THEN 'accept' ELSE 'reject' END), 'research_results'::text, rr.id,
      (SELECT full_name FROM persons WHERE id = rr.reviewed_by_person_id), rr.reviewed_at, 'record'::text,
      jsonb_build_object('reason', rr.review_note, 'note',
        CASE WHEN rr.reviewed_at < '2026-10-25 00:00:00+00' THEN 'recorded before governance acts (25 Oct 2026)' ELSE 'no act recorded' END);
  ELSE
    RETURN QUERY SELECT 'pending'::text, 'research_results'::text, rr.id, NULL::text, NULL::timestamptz, 'record'::text,
      jsonb_build_object('note', 'not yet reviewed');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION lvrf_lineage_evidence(p_evidence uuid, p_with_research boolean)
RETURNS TABLE (kind text, row_table text, row_id uuid, actor text, at timestamptz, source text, detail jsonb)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  e record;
  a record;
  rid uuid;
BEGIN
  SELECT ev.*, cp.full_name AS captured_by, lvrf_evidence_basis(ev) AS basis INTO e
    FROM evidence ev JOIN persons cp ON cp.id = ev.captured_by_person_id WHERE ev.id = p_evidence;
  IF e.id IS NULL THEN RETURN; END IF;
  IF p_with_research THEN
    SELECT r.id INTO rid FROM research_results r WHERE r.evidence_id = p_evidence ORDER BY r.parsed_at LIMIT 1;
    IF rid IS NOT NULL THEN RETURN QUERY SELECT * FROM lvrf_lineage_research(rid); END IF;
  END IF;
  RETURN QUERY SELECT 'evidence'::text, 'evidence'::text, e.id, e.captured_by, e.created_at, 'record'::text,
    jsonb_build_object('kind', e.kind, 'summary', e.summary, 'provenance', e.provenance, 'basis', e.basis,
                       'evidence_form', e.evidence_form, 'quote_text', e.quote_text, 'locator', e.locator, 'how_read', e.how_read,
                       'ai_sourced', e.ai_sourced, 'source_verified', e.source_verified);
  IF e.citation_resolved THEN
    SELECT * INTO a FROM lvrf_lineage_act('evidence', e.id, ARRAY['open_citation']);
    IF a.actor IS NULL THEN
      -- Opened as part of an accept (H1): the accept act names this evidence.
      SELECT p.full_name AS actor, g.at, g.reason, g.act::text AS act, g.result_table, g.result_id INTO a
        FROM governance_acts g JOIN persons p ON p.id = g.actor_person_id
       WHERE e.id = ANY (g.evidence_ids) AND g.act = 'accept' ORDER BY g.at LIMIT 1;
    END IF;
    RETURN QUERY SELECT 'open_citation'::text, 'evidence'::text, e.id,
      coalesce(a.actor, (SELECT full_name FROM persons WHERE id = e.citation_resolved_by_person_id)), coalesce(a.at, e.citation_resolved_at),
      CASE WHEN a.actor IS NOT NULL THEN 'act' ELSE 'record' END,
      CASE WHEN a.actor IS NOT NULL THEN jsonb_build_object('source_verified', e.source_verified, 'act', a.act)
           WHEN e.citation_resolved_at < '2026-10-25 00:00:00+00' THEN jsonb_build_object('source_verified', e.source_verified, 'note', 'recorded before governance acts (25 Oct 2026)')
           ELSE jsonb_build_object('source_verified', e.source_verified, 'note', 'no act recorded') END;
  END IF;
  IF e.attested_by_person_id IS NOT NULL THEN
    RETURN QUERY SELECT 'attested'::text, 'evidence'::text, e.id, (SELECT full_name FROM persons WHERE id = e.attested_by_person_id), e.attested_at,
      'record'::text, '{}'::jsonb;
  END IF;
  RETURN QUERY SELECT 'figure_check'::text, 'figure_checks'::text, f.id, (SELECT full_name FROM persons WHERE id = f.checked_by_person_id), f.checked_at,
    'record'::text, jsonb_build_object('result', f.result, 'detail', f.detail, 'subject', f.subject_table || '.' || f.subject_field)
    FROM figure_checks f WHERE f.evidence_id = p_evidence ORDER BY f.checked_at;
END $$;

CREATE OR REPLACE FUNCTION lvrf_lineage_links(p_evidence uuid, p_outcome uuid, p_supports text)
RETURNS TABLE (kind text, row_table text, row_id uuid, actor text, at timestamptz, source text, detail jsonb)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  l record;
  a record;
BEGIN
  FOR l IN
    SELECT v.*, ins.at AS linked_at, (SELECT full_name FROM persons WHERE id = ins.actor_person_id) AS linked_by
      FROM value_outcome_evidence v
      LEFT JOIN LATERAL (SELECT x.at, x.actor_person_id FROM audit_log x
                          WHERE x.table_name = 'value_outcome_evidence' AND x.operation = 'insert'
                            AND x.new_row->>'value_outcome_id' = v.value_outcome_id::text AND x.new_row->>'evidence_id' = v.evidence_id::text
                            AND x.new_row->>'supports' = v.supports ORDER BY x.at LIMIT 1) ins ON true
     WHERE v.evidence_id = p_evidence AND (p_outcome IS NULL OR v.value_outcome_id = p_outcome)
       AND (p_supports IS NULL OR v.supports = p_supports OR v.corrects_supports = p_supports)
     ORDER BY ins.at NULLS FIRST
  LOOP
    SELECT * INTO a FROM lvrf_lineage_act('value_outcome_evidence', l.value_outcome_id, ARRAY['correct']);
    RETURN QUERY SELECT CASE WHEN l.corrects_supports IS NOT NULL THEN 'correct' ELSE 'link' END, 'value_outcome_evidence'::text, l.value_outcome_id,
      coalesce(CASE WHEN l.corrects_supports IS NOT NULL THEN a.actor END, l.linked_by), coalesce(CASE WHEN l.corrects_supports IS NOT NULL THEN a.at END, l.linked_at),
      CASE WHEN l.corrects_supports IS NOT NULL AND a.actor IS NOT NULL THEN 'act' ELSE 'record' END,
      jsonb_build_object('outcome', l.value_outcome_id, 'evidence', l.evidence_id, 'supports', l.supports,
                         'corrects_supports', l.corrects_supports, 'reason', l.correction_reason, 'current', l.withdrawn_at IS NULL);
    IF l.withdrawn_at IS NOT NULL THEN
      RETURN QUERY SELECT 'withdrawn'::text, 'value_outcome_evidence'::text, l.value_outcome_id,
        (SELECT full_name FROM persons WHERE id = l.withdrawn_by_person_id), l.withdrawn_at,
        CASE WHEN a.actor IS NOT NULL THEN 'act' ELSE 'record' END,
        jsonb_build_object('supports', l.supports, 'reason', l.withdrawal_reason);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION lvrf_lineage_seals(p_where text, p_value text)
RETURNS TABLE (kind text, row_table text, row_id uuid, actor text, at timestamptz, source text, detail jsonb)
LANGUAGE sql STABLE AS $$
  SELECT 'seal'::text, 'value_runs'::text, r.id, (SELECT full_name FROM persons WHERE id = coalesce(r.locked_by_person_id, r.walked_by_person_id)),
         coalesce(r.locked_at, r.walked_at), 'seal'::text,
         jsonb_build_object('run_number', r.run_number, 'payload_hash', r.payload->>'payloadHash', 'locked', r.locked_at IS NOT NULL)
           || CASE WHEN p_where = 'outcome' THEN jsonb_build_object('sealed_baseline', r.payload->'baselineValue', 'sealed_actual', r.payload->'actualValue') ELSE '{}'::jsonb END
    FROM value_runs r
   WHERE r.deleted_at IS NULL
     AND ((p_where = 'fact' AND r.payload->'institutionFacts' @> jsonb_build_array(jsonb_build_object('id', p_value)))
       OR (p_where = 'entity' AND r.payload->'entity'->>'id' = p_value)
       OR (p_where = 'outcome' AND r.payload->>'valueOutcomeId' = p_value))
   ORDER BY r.run_number
$$;

CREATE OR REPLACE FUNCTION lvrf_lineage_supersession(p_table text, p_id uuid)
RETURNS TABLE (kind text, row_table text, row_id uuid, actor text, at timestamptz, source text, detail jsonb)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  j jsonb;
  pred uuid;
  a record;
BEGIN
  EXECUTE format('SELECT x.id FROM public.%I x WHERE x.superseded_by_id = $1', p_table) INTO pred USING p_id;
  IF pred IS NOT NULL THEN
    EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE x.id = $1', p_table) INTO j USING pred;
    SELECT * INTO a FROM lvrf_lineage_act(p_table, pred, ARRAY['supersede']);
    RETURN QUERY SELECT 'supersedes'::text, p_table, pred, a.actor, a.at, CASE WHEN a.actor IS NOT NULL THEN 'act' ELSE 'record' END,
      jsonb_build_object('reason', j->>'supersession_reason', 'note', CASE WHEN a.actor IS NULL THEN 'recorded before governance acts (25 Oct 2026)' END);
  END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE x.id = $1', p_table) INTO j USING p_id;
  IF j->>'superseded_by_id' IS NOT NULL THEN
    SELECT * INTO a FROM lvrf_lineage_act(p_table, p_id, ARRAY['supersede']);
    RETURN QUERY SELECT 'superseded_by'::text, p_table, (j->>'superseded_by_id')::uuid, a.actor, a.at,
      CASE WHEN a.actor IS NOT NULL THEN 'act' ELSE 'record' END, jsonb_build_object('reason', j->>'supersession_reason');
  END IF;
  IF j->>'deleted_at' IS NOT NULL THEN
    SELECT * INTO a FROM lvrf_lineage_act(p_table, p_id, ARRAY['withdraw', 'retire']);
    RETURN QUERY SELECT 'withdrawn'::text, p_table, p_id, coalesce(a.actor, (SELECT full_name FROM persons WHERE id = (j->>'retired_by_person_id')::uuid)),
      coalesce(a.at, (j->>'deleted_at')::timestamptz), CASE WHEN a.actor IS NOT NULL THEN 'act' ELSE 'record' END,
      jsonb_build_object('reason', j->>'retirement_reason');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION lvrf_lineage_rows(p_rows jsonb, p_kind text, p_table text, p_id uuid, p_actor text, p_at timestamptz, p_source text, p_detail jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT p_rows || jsonb_build_array(jsonb_build_object('kind', p_kind, 'row_table', p_table, 'row_id', p_id, 'actor', p_actor,
                                                        'at', p_at, 'source', p_source, 'detail', p_detail))
$$;

CREATE OR REPLACE FUNCTION lvrf_lineage(p_table text, p_id uuid, p_figure text DEFAULT NULL)
RETURNS TABLE (step int, kind text, row_table text, row_id uuid, actor text, at timestamptz, source text, detail jsonb)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  st jsonb := '[]'::jsonb;
  x record;
  o record;
  a record;
  rid uuid;
  ev uuid;
  j jsonb;
  k bigint;
  matched constant text := 'matched by kind, summary and source; not sealed by id';
BEGIN
  IF p_table NOT IN ('institution_facts', 'institution_entities', 'industry_measures', 'evidence', 'value_outcomes') THEN
    RAISE EXCEPTION 'LVRF: lineage is traced for facts, entities, pack measures, evidence and an outcome''s figure; not for %.', p_table
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_table = 'value_outcomes' AND coalesce(p_figure, '') NOT IN ('baseline', 'actual') THEN
    RAISE EXCEPTION 'LVRF: an outcome''s lineage is of its baseline or its actual; name which.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_table IN ('institution_facts', 'institution_entities', 'industry_measures') THEN
    IF p_table = 'institution_facts' THEN
      SELECT f.id, f.evidence_id, f.created_at, p.full_name AS who,
             jsonb_build_object('kind', f.kind, 'value_numeric', f.value_numeric, 'value_text', f.value_text, 'unit', f.unit, 'as_of', f.as_of) AS d
        INTO x FROM institution_facts f JOIN persons p ON p.id = f.captured_by_person_id WHERE f.id = p_id;
      SELECT r.id INTO rid FROM research_results r WHERE r.institution_fact_id = p_id;
    ELSIF p_table = 'institution_entities' THEN
      SELECT e.id, e.evidence_id, e.created_at, p.full_name AS who,
             jsonb_build_object('legal_name', e.legal_name, 'identifier_type', e.identifier_type, 'identifier', e.identifier) AS d
        INTO x FROM institution_entities e JOIN persons p ON p.id = e.captured_by_person_id WHERE e.id = p_id;
      SELECT r.id INTO rid FROM research_results r WHERE r.institution_entity_id = p_id;
    ELSE
      SELECT m.id, NULL::uuid AS evidence_id, m.created_at, NULL::text AS who,
             jsonb_build_object('name', m.name, 'unit', m.unit, 'direction', m.direction, 'citation', m.citation, 'status', m.status) AS d
        INTO x FROM industry_measures m WHERE m.id = p_id;
      SELECT r.id INTO rid FROM research_results r WHERE r.industry_measures_id = p_id;
    END IF;
    IF x.id IS NULL THEN RETURN; END IF;
    IF rid IS NOT NULL THEN
      st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord) FROM lvrf_lineage_research(rid)
                              WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
    ELSE
      st := lvrf_lineage_rows(st, 'origin', NULL, NULL, NULL, NULL, 'record', jsonb_build_object('note', 'recorded directly, not from a research result'));
    END IF;
    IF x.evidence_id IS NOT NULL THEN
      st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord) FROM lvrf_lineage_evidence(x.evidence_id, false)
                              WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
    END IF;
    st := lvrf_lineage_rows(st, CASE p_table WHEN 'institution_facts' THEN 'fact' WHEN 'institution_entities' THEN 'entity' ELSE 'measure' END,
                            p_table, x.id, x.who, x.created_at, 'record', x.d);
    st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord) FROM lvrf_lineage_supersession(p_table, p_id)
                            WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
    IF p_table <> 'industry_measures' THEN
      st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord)
                              FROM lvrf_lineage_seals(CASE WHEN p_table = 'institution_facts' THEN 'fact' ELSE 'entity' END, p_id::text)
                              WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
    END IF;

  ELSIF p_table = 'evidence' THEN
    IF NOT EXISTS (SELECT 1 FROM evidence WHERE id = p_id) THEN RETURN; END IF;
    st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord) FROM lvrf_lineage_evidence(p_id, true)
                            WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
    st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord) FROM lvrf_lineage_links(p_id, NULL, NULL)
                            WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
    -- Runs that sealed it, through each outcome it was linked to: matched (P2-D7).
    st := st || coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', 'seal', 'row_table', 'value_runs', 'row_id', r.id,
               'actor', (SELECT full_name FROM persons WHERE id = coalesce(r.locked_by_person_id, r.walked_by_person_id)),
               'at', coalesce(r.locked_at, r.walked_at), 'source', 'seal',
               'detail', jsonb_build_object('run_number', r.run_number, 'payload_hash', r.payload->>'payloadHash', 'locked', r.locked_at IS NOT NULL,
                                            'sealed_supports', item->>'supports', 'matched', matched)) ORDER BY r.run_number)
        FROM evidence e
        JOIN (SELECT DISTINCT value_outcome_id FROM value_outcome_evidence WHERE evidence_id = p_id) lo ON true
        JOIN value_runs r ON r.payload->>'valueOutcomeId' = lo.value_outcome_id::text AND r.deleted_at IS NULL
        CROSS JOIN LATERAL jsonb_array_elements(r.payload->'evidence') item
       WHERE e.id = p_id AND item->>'kind' = e.kind::text AND item->>'summary' = e.summary AND item->>'provenance' = e.provenance), '[]'::jsonb);
    st := st || coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', 'erratum', 'row_table', 'run_errata', 'row_id', x2.id, 'actor', p.full_name, 'at', x2.recorded_at,
               'source', 'act', 'detail', jsonb_build_object('run_number', r.run_number, 'sealed', x2.sealed_score, 'recomputed', x2.recomputed_score,
                 'supersedes', x2.supersedes_id, 'superseded', EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x2.id)))
               ORDER BY r.run_number, x2.recorded_at)
        FROM run_errata x2 JOIN value_runs r ON r.id = x2.value_run_id JOIN persons p ON p.id = x2.recorded_by_person_id
       WHERE x2.evidence_id = p_id), '[]'::jsonb);

  ELSE -- value_outcomes, one figure
    SELECT vo.*, bm.name AS metric INTO o FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id WHERE vo.id = p_id;
    IF o.id IS NULL THEN RETURN; END IF;
    SELECT * INTO a FROM lvrf_lineage_act('value_outcomes', p_id, ARRAY['measure']);
    st := lvrf_lineage_rows(st, p_figure, 'value_outcomes', o.id,
            CASE WHEN p_figure = 'actual' AND a.actor IS NOT NULL THEN a.actor
                 ELSE (SELECT pp.full_name FROM audit_log al JOIN persons pp ON pp.id = al.actor_person_id
                        WHERE al.table_name = 'value_outcomes' AND al.record_id = o.id::text AND al.operation = 'insert' ORDER BY al.at LIMIT 1) END,
            CASE WHEN p_figure = 'baseline' THEN o.created_at ELSE o.actual_measured_at END,
            CASE WHEN p_figure = 'actual' AND a.actor IS NOT NULL THEN 'act' ELSE 'record' END,
            jsonb_build_object('metric', o.metric, 'value', CASE WHEN p_figure = 'baseline' THEN o.baseline_value ELSE o.actual_value END,
                               'measured_at', CASE WHEN p_figure = 'baseline' THEN o.baseline_measured_at ELSE o.actual_measured_at END));
    FOR ev IN SELECT v.evidence_id FROM value_outcome_evidence v JOIN evidence e ON e.id = v.evidence_id
               WHERE v.value_outcome_id = p_id AND (v.supports = p_figure OR v.corrects_supports = p_figure)
               GROUP BY v.evidence_id, e.created_at ORDER BY e.created_at, v.evidence_id LOOP
      st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord) FROM lvrf_lineage_evidence(ev, true)
                              WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
      st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord) FROM lvrf_lineage_links(ev, p_id, p_figure)
                              WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
    END LOOP;
    IF p_figure = 'actual' AND o.verified_at IS NOT NULL THEN
      SELECT * INTO a FROM lvrf_lineage_act('value_outcomes', p_id, ARRAY['verify']);
      st := lvrf_lineage_rows(st, 'verify', 'value_outcomes', p_id,
              coalesce(a.actor, (SELECT full_name FROM persons WHERE id = o.verified_by_person_id)), coalesce(a.at, o.verified_at),
              CASE WHEN a.actor IS NOT NULL THEN 'act' ELSE 'record' END, jsonb_build_object('reason', a.reason));
    END IF;
    st := st || coalesce((SELECT jsonb_agg(to_jsonb(t) - 'ord' ORDER BY t.ord) FROM lvrf_lineage_seals('outcome', p_id::text)
                            WITH ORDINALITY AS t(kind, row_table, row_id, actor, at, source, detail, ord)), '[]'::jsonb);
    st := st || coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', 'erratum', 'row_table', 'run_errata', 'row_id', x2.id, 'actor', p.full_name, 'at', x2.recorded_at,
               'source', 'act', 'detail', jsonb_build_object('run_number', r.run_number, 'sealed', x2.sealed_score, 'recomputed', x2.recomputed_score,
                 'supersedes', x2.supersedes_id, 'superseded', EXISTS (SELECT 1 FROM run_errata s2 WHERE s2.supersedes_id = x2.id)))
               ORDER BY r.run_number, x2.recorded_at)
        FROM run_errata x2 JOIN value_runs r ON r.id = x2.value_run_id JOIN persons p ON p.id = x2.recorded_by_person_id
       WHERE x2.value_outcome_id = p_id), '[]'::jsonb);
  END IF;

  FOR j, k IN SELECT e.v, e.o FROM jsonb_array_elements(st) WITH ORDINALITY AS e(v, o) ORDER BY e.o LOOP
    step := k::int; kind := j->>'kind'; row_table := j->>'row_table'; row_id := (j->>'row_id')::uuid; actor := j->>'actor';
    at := (j->>'at')::timestamptz; source := j->>'source'; detail := j->'detail';
    RETURN NEXT;
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 14. 2.0 item 4 — hardening manifest: what THIS run applied
-- ------------------------------------------------------------------
-- WHY: on 23 August five triggers sat DECLARED above and ABSENT from the
-- database for weeks, while the trigger count reconciled by coincidence
-- (see Verification below). The lesson was: compare lists, not totals.
-- hardening_manifest (db/schema.ts) is what makes that comparison possible
-- from SQL, going forward.
--
-- DERIVED, NOT ENUMERATED: this does not repeat any trigger name that was
-- already typed in a CREATE TRIGGER statement above, whether from the
-- `governed` loop, the `supersession_governed` loop, or one of the
-- individually-declared triggers in sections 5a/5b/5c/5d/8/9/10. It reads back
-- from information_schema.triggers — the same catalog the Verification
-- block below already treats as ground truth for the trigger count — which
-- by now, inside this same transaction, reflects every CREATE TRIGGER this
-- run just executed. A hand-maintained list here, or in a future checking
-- script, would be exactly the second, driftable declaration this feature
-- exists to prevent. DISTINCT collapses the per-event-manipulation rows
-- information_schema.triggers emits (see Verification below) down to one
-- row per (trigger, table), matching the manifest's unique constraint.
--
-- TRUNCATE, not append — the one exception to "no hard deletes on governed
-- objects" (CLAUDE.md rule 2) in this entire system, and it needs its
-- reason stated because every other table here forbids exactly this.
-- hardening_manifest's contract is "what hardening.sql applied, as of its
-- last run" — not history. A row surviving from a previous run, for a
-- trigger this file no longer declares, would be a false claim about the
-- present: that the database still needs to satisfy something it no longer
-- must. The manifest describes now, not a history of every run there ever
-- was, so it is truncated before every repopulation.
TRUNCATE hardening_manifest;

INSERT INTO hardening_manifest (trigger_name, table_name)
SELECT DISTINCT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';

-- CONSEQUENCE: trigger count is unaffected by this section — stays 68.
-- hardening_manifest carries no triggers of its own (see the
-- "Known ungoverned tables" note above: no _audit, no _touch, no
-- _no_delete), so this section adds rows to a table, not triggers to the
-- count the Verification block checks below.

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
--   19 governed tables (0005 added 'offerings'; 0019 added
--   'industry_measures'; 0024 added 'institution_facts'; 0034 added
--   'institution_entities'; 0035 added 'value_levers'; 0036 added
--   'value_hypotheses', 'reference_example_markers') × 3 (_audit, _touch,
--   _no_delete) — 57
--   value_outcome_evidence_no_ai_actual, value_runs_locked_immutable — 2
--   5c: value_runs_audit, value_runs_touch, value_runs_no_delete,
--   record_documents_audit, record_documents_no_delete — 5
--   5d: assessments_no_simulated_attestor, evidence_no_simulated_attestor,
--   value_outcomes_no_simulated_attestor — 3
--   5e: <table>_supersession_sane × 20 (assessments, business_metrics,
--   capabilities, engagements, evidence, heartbeats, institutions,
--   offerings, persons, reflections, stewardship_returns, tenants,
--   value_outcomes, value_runs, industry_measures, institution_facts,
--   institution_entities, value_levers, value_hypotheses,
--   reference_example_markers) — 20
--   19: institution_entities_one_current (a deferred constraint trigger) — 1
--   20: lever_offerings_audit, lever_offerings_no_delete,
--   lever_offerings_steward_only, value_levers_steward_only — 4
--   22: value_hypotheses_guard, value_outcomes_verifier_not_author,
--   reference_example_markers_steward_only,
--   reference_example_markers_one_current (deferred),
--   executive_summaries_audit, executive_summaries_no_delete,
--   executive_summaries_guard — 7
--   23: account_person_links_audit, account_person_links_no_delete,
--   account_person_links_guard — 3
--   8: refusals_no_delete — 1
--   9: evidence_resolution_is_final — 1
--   10: research_results_audit, research_results_touch,
--   research_results_no_delete — 3
--   11: industries_audit, industries_no_delete — 2
--   12: industry_measure_exclusions_audit,
--   industry_measure_exclusions_no_delete — 2
--   13: capability_industry_measures_audit,
--   capability_industry_measures_no_delete — 2
--   15: person_credentials_no_delete, sessions_no_delete — 2
--   16: access_grants_audit, access_grants_no_delete,
--   access_grants_steward_only — 3
--   17: <t>_audit, <t>_no_delete for value_outcome_evidence,
--   offering_capabilities, person_roles, reflection_evidence — 8
--   18: research_prompts_audit, research_prompts_no_delete,
--   research_prompts_immutable — 3
--   25: evidence_form_guard, institution_facts_form_kept,
--   figure_checks_audit, figure_checks_no_delete, figure_checks_immutable,
--   figure_checks_guard — 6
--   26: value_outcome_evidence_guard, value_outcome_evidence_vendor_impact_only,
--   run_errata_audit, run_errata_no_delete, run_errata_immutable,
--   run_errata_steward_only — 6
--   27: governance_acts_audit, _no_delete, _immutable, _guard,
--   research_imports_audit, _no_delete, _immutable,
--   research_results_import_matches, and <t>_act_present on 18 tables
--   (deferred constraint triggers) — 26
--   Total: 167 distinct triggers. (0024 took it 78 -> 82: institution_facts
--   _audit, _touch, _no_delete, _supersession_sane. 0027 took it 82 -> 84.
--   0029 took it 84 -> 87. Section 17, L16, took it 87 -> 95.
--   Section 18, Q4b (0031), took it 95 -> 98. 0034 (Q4h) took it 98 -> 102:
--   institution_entities _audit, _touch, _no_delete, _supersession_sane.
--   Section 19 took it 102 -> 103: institution_entities_one_current.
--   0035 (O1) took it 103 -> 111: value_levers' four, section 20's four.
--   0036 (O2) took it 111 -> 126: value_hypotheses' and
--   reference_example_markers' four each, section 22's seven.
--   0037 (W1 fix) took it 126 -> 129: section 23's three.
--   0039 (P1) took it 129 -> 135: section 25's six.
--   0040 (C1) took it 135 -> 141: section 26's six.
--   0041 (P2) took it 141 -> 167: section 27's twenty-six.)
--
-- 14's hardening_manifest table adds no entry to this arithmetic: it is a
-- new table, not a new trigger, and it deliberately carries none of its
-- own (see "Known ungoverned tables" above) — a _no_delete guard on the
-- table this file truncates and repopulates every run would make the
-- TRUNCATE in section 14 fail. Total stays 167.
--
-- Expect 260 rows here: information_schema.triggers emits one row per event
-- manipulation. Each governed table contributes 4 rows (2 + 1 + 1), ×19 = 76;
-- no_ai_actual fires on INSERT and UPDATE (+2), locked_immutable on UPDATE
-- (+1); value_runs's 5c triad contributes 4 (2 + 1 + 1); record_documents
-- contributes 3 (2 + 1); each 5d trigger fires on INSERT and UPDATE, ×3 (+6);
-- each 5e trigger fires on INSERT and UPDATE, ×18 (+36); refusals_no_delete
-- fires on DELETE only (+1); evidence_resolution_is_final fires on UPDATE
-- only (+1); research_results_audit fires on INSERT and UPDATE (+2),
-- research_results_touch on INSERT and UPDATE (+2, since Q4b), research_results_no_delete on
-- DELETE only (+1); industries_audit fires on INSERT and UPDATE (+2),
-- industries_no_delete on DELETE only (+1);
-- industry_measure_exclusions_audit fires on INSERT and UPDATE (+2),
-- industry_measure_exclusions_no_delete on DELETE only (+1);
-- capability_industry_measures_audit fires on INSERT and UPDATE (+2),
-- capability_industry_measures_no_delete on DELETE only (+1);
-- person_credentials_no_delete and sessions_no_delete on DELETE only (+2);
-- access_grants_steward_only and access_grants_audit on INSERT and UPDATE
-- (+4), access_grants_no_delete on DELETE only (+1); section 17's four
-- _audit triggers on INSERT and UPDATE (+8) and four _no_delete on DELETE
-- only (+4); research_prompts_audit on INSERT and UPDATE (+2),
-- research_prompts_no_delete on DELETE only (+1),
-- research_prompts_immutable on UPDATE only (+1).
-- 68 + 2 + 1 + 4 + 3 + 6 + 36 + 1 + 1 + 2 + 1 + 1 + 2 + 1 + 2 + 1 + 2 + 1 + 2 + 4 + 1 + 8 + 4 + 2 + 1 + 1 + 1 + 2 + 3 + 4 = 168 before 0036; 0036 adds the two governed tables (+8), their 5e triggers (+4) and section 22's (guard I+U, verifier U, marker steward_only I+U, one_current I+U, summaries audit I+U, no_delete D, guard I+U: +12) = 192; 0037's section 23 adds audit I+U, no_delete D, guard I+U: +5 = 197; 0039's section 25 adds evidence_form_guard I+U, institution_facts_form_kept U, figure_checks audit I+U, no_delete D, immutable U, guard I: +8 = 205; 0040's section 26 adds the link guard I+U, vendor_impact_only I, run_errata audit I+U, no_delete D, immutable U, steward_only I: +8 = 213; 0041's section 27 adds governance_acts audit I+U, no_delete D, immutable U, guard I, research_imports audit I+U, no_delete D, immutable U, research_results_import_matches I+U, and 18 _act_present I+U: +47 = 260 (the governed 68 and the 5e 36 include 0034's institution_entities and 0035's value_levers; then Q4b's research_results_touch on INSERT, +1; section 19's one_current on INSERT and UPDATE, +2; section 20's lever_offerings _audit on INSERT and UPDATE and _no_delete on DELETE, +3; section 20's two _steward_only triggers on INSERT and UPDATE, +4).
SELECT event_object_table AS tbl, trigger_name, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY tbl, trigger_name;

-- Expect no UPDATE or DELETE for lvrf_app on these two tables.
SELECT table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'lvrf_app' AND table_name IN ('audit_log','heartbeat_events')
ORDER BY table_name, privilege_type;
