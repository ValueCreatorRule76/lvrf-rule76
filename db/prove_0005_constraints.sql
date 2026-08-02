-- ==================================================================
-- LVRF — Prove 0005 constraints
--
-- Step 0 discipline: prove the constraints bite BEFORE trusting them.
-- Same pattern used to prove deferred-constraint behaviour ahead of 0003.
--
-- Runs entirely inside a transaction that ROLLS BACK. Writes nothing.
--
--   psql -f db/prove_0005_constraints.sql
--
-- Expect 12 results (numbered 1-7, 9-12; 6 splits into 6a/6b setup+check).
-- Every line must read PASS, except 12, which is a FINDING — not a
-- pass/fail — reporting observed behaviour, not asserting a requirement.
-- If any PASS/FAIL line reads FAIL, report and STOP. Do not adjust the
-- test to match the behaviour.
-- ==================================================================

\set ON_ERROR_STOP on

-- Baseline, captured OUTSIDE the transaction, before BEGIN. A prior version
-- of this check asserted these counts were zero after rollback — wrong: both
-- tables carry real, previously-committed history that will never be zero in
-- a live database. What must hold is that THIS run adds nothing, i.e. the
-- count is unchanged across the transaction. Comparing before/after captures
-- that; an absolute count does not.
--
-- This delta assumes no concurrent writer touches offerings or audit_log
-- between the two captures. Fine for an interactive run on a dev box; do not
-- carry that assumption into CI, where a concurrent test run committing real
-- rows in that window would produce a false-positive nonzero delta.
SELECT count(*) AS off_before FROM offerings \gset
SELECT count(*) AS aud_before FROM audit_log \gset

BEGIN;

DO $proof$
DECLARE
  t_id      uuid;
  inst_id   uuid;
  person_id uuid;
  c_id      uuid;
  o_id      uuid;
  c2_id     uuid;
  reuse1_id uuid;
  reuse2_id uuid;
  both1_id  uuid;
  both2_id  uuid;
  rec       record;
  failures  int := 0;
BEGIN
  ---------------------------------------------------------------
  -- FIXTURE CHAIN — resolve every fixture up front, fail with a named
  -- reason before any test runs. This is the discipline
  -- records/seed_offerings.mjs already uses; test 6b's uncaught
  -- not_null_violation on a hand-rolled `capabilities` insert (missing
  -- institution_id/owner_person_id) is exactly the bug class this kills
  -- — not just that one instance.
  ---------------------------------------------------------------
  SELECT id INTO t_id FROM tenants LIMIT 1;
  IF t_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: no tenant row exists. Seed a tenant before running the proof.';
  END IF;

  SELECT id INTO c_id FROM capabilities LIMIT 1;
  IF c_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: no capability row exists. Seed a capability before running the proof.';
  END IF;

  SELECT institution_id, owner_person_id INTO inst_id, person_id
    FROM capabilities WHERE id = c_id;
  IF inst_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: capability % has no institution_id — schema invariant violated.', c_id;
  END IF;
  IF person_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: capability % has no owner_person_id — schema invariant violated.', c_id;
  END IF;

  PERFORM 1 FROM institutions WHERE id = inst_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FIXTURE: institution % referenced by capability % does not exist.', inst_id, c_id;
  END IF;

  PERFORM 1 FROM persons WHERE id = person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FIXTURE: person % referenced by capability % does not exist.', person_id, c_id;
  END IF;

  RAISE NOTICE 'FIXTURE CHAIN RESOLVED: tenant=%  institution=%  person=%  capability=%',
    t_id, inst_id, person_id, c_id;

  RAISE NOTICE '--------------------------------------------------------';
  RAISE NOTICE 'LVRF 0005 CONSTRAINT PROOF';
  RAISE NOTICE '--------------------------------------------------------';

  ---------------------------------------------------------------
  -- PREFLIGHT — this script predates ...governance() on offerings.
  -- Every INSERT below omits status, version, superseded_by_id,
  -- steward_person_id, deleted_at. Verify — don't assume — that's
  -- safe: status/version need defaults, the other three need to
  -- be nullable, or every insert below fails closed together.
  ---------------------------------------------------------------
  RAISE NOTICE 'PREFLIGHT — governance() columns on offerings:';
  FOR rec IN
    SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_name = 'offerings'
       AND column_name IN ('status','version','superseded_by_id','steward_person_id','deleted_at')
     ORDER BY column_name
  LOOP
    RAISE NOTICE '    %  nullable=%  default=%',
      rpad(rec.column_name, 20), rec.is_nullable, coalesce(rec.column_default, '(none)');
  END LOOP;
  RAISE NOTICE '--------------------------------------------------------';

  ---------------------------------------------------------------
  -- 1. evidence_class above consumption REQUIRES a verification source
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_no_source', 'Proof: no source', 'practice', 'x',
            'demonstrated', 'none', ARRAY['transcript'], '[]'::jsonb);
    RAISE NOTICE 'FAIL  1  demonstrated + verification_source=none was ACCEPTED';
    failures := failures + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  1  demonstrated + verification_source=none rejected';
  END;

  ---------------------------------------------------------------
  -- 2. evidential offering REQUIRES at least one artifact
  --    (this is the cardinality-vs-array_length trap)
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_no_artifacts', 'Proof: no artifacts', 'content', 'x',
            'assessed', 'vendor_platform', ARRAY[]::text[], '[]'::jsonb);
    RAISE NOTICE 'FAIL  2  assessed + empty artifacts was ACCEPTED';
    failures := failures + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  2  assessed + empty artifacts rejected';
  END;

  ---------------------------------------------------------------
  -- 3. An enabler emitting nothing is LEGAL. The gate stops it later,
  --    at the route. The catalog must be able to record a zero.
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_enabler', 'Proof: enabler', 'enabler', 'x',
            'none', 'none', ARRAY[]::text[], '[]'::jsonb)
    RETURNING id INTO o_id;
    RAISE NOTICE 'PASS  3  enabler with no evidence accepted (a visible zero)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'FAIL  3  enabler rejected: %', SQLERRM;
    failures := failures + 1;
  END;

  ---------------------------------------------------------------
  -- 4. offering_key is unique PER TENANT
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_enabler', 'Proof: duplicate', 'enabler', 'x',
            'none', 'none', ARRAY[]::text[], '[]'::jsonb);
    RAISE NOTICE 'FAIL  4  duplicate (tenant_id, offering_key) was ACCEPTED';
    failures := failures + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS  4  duplicate (tenant_id, offering_key) rejected';
  END;

  ---------------------------------------------------------------
  -- 5. source_refs must be an ARRAY, not a bare string
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_bad_refs', 'Proof: bad refs', 'content', 'x',
            'assessed', 'vendor_platform', ARRAY['score'], '"https://example.com"'::jsonb);
    RAISE NOTICE 'FAIL  5  scalar source_refs was ACCEPTED';
    failures := failures + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS  5  scalar source_refs rejected';
  END;

  ---------------------------------------------------------------
  -- 6a. SETUP — link a primary capability. Must succeed.
  --
  -- This is deliberately its OWN block, separate from 6b below.
  -- A plpgsql BEGIN..EXCEPTION block is an IMPLICIT SAVEPOINT: when the
  -- exception fires, every statement in that block rolls back — including
  -- successful setup statements that ran before the failing one.
  -- Nesting this insert inside 6b silently un-did it, which made test 7
  -- report a false FAIL. Keep them separate.
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO offering_capabilities (offering_id, capability_id, is_primary)
    VALUES (o_id, c_id, true);
    RAISE NOTICE 'PASS  6a setup: primary capability linked';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'FAIL  6a setup insert rejected: %', SQLERRM;
    failures := failures + 1;
  END;

  ---------------------------------------------------------------
  -- 6b-setup. FIX: split setup from assertion, same reasoning as
  -- 6a/6b above — a BEGIN..EXCEPTION block is an implicit savepoint, so
  -- the assertion block below must contain exactly ONE statement that
  -- can legitimately fail. This insert used to hand-roll (id, name) and
  -- died on a not_null_violation for institution_id/owner_person_id,
  -- uncaught by `WHEN unique_violation`, killing the whole DO block.
  --
  -- Copies FKs off the already-resolved c_id instead of guessing the
  -- table's shape. Checked against information_schema: capabilities'
  -- only NOT NULL/no-default columns are institution_id, owner_person_id,
  -- and name — name is supplied literally below, so no further widening
  -- is needed. Silent on success (it's setup, not one of the 12 proof
  -- results); reports FAIL with SQLSTATE if it breaks.
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO capabilities (institution_id, owner_person_id, name)
    SELECT institution_id, owner_person_id, 'proof second capability'
      FROM capabilities WHERE id = c_id
    RETURNING id INTO c2_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL  6b-setup second capability insert rejected — SQLSTATE=%  (%)', SQLSTATE, SQLERRM;
    failures := failures + 1;
  END;

  ---------------------------------------------------------------
  -- 6b-assert. At most ONE primary capability per offering. Narrow and
  -- correct: exactly one statement that can legitimately fail.
  ---------------------------------------------------------------
  IF c2_id IS NULL THEN
    RAISE NOTICE 'SKIP  6b  cannot assert — 6b-setup did not produce a second capability';
  ELSE
    BEGIN
      INSERT INTO offering_capabilities (offering_id, capability_id, is_primary)
      VALUES (o_id, c2_id, true);
      RAISE NOTICE 'FAIL  6b second primary capability was ACCEPTED';
      failures := failures + 1;
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'PASS  6b second primary capability rejected';
    END;
  END IF;

  ---------------------------------------------------------------
  -- 7. A capability referenced by an offering cannot be deleted
  --
  -- CORRECTED: capabilities is governed. capabilities_no_delete fires
  -- BEFORE DELETE, ahead of any FK evaluation, and raises with
  -- ERRCODE check_violation (23514) via lvrf_block_delete() — not
  -- foreign_key_violation (23503). The BEFORE DELETE trigger aborts the
  -- statement before Postgres ever reaches the FK check, so
  -- WHEN foreign_key_violation never catches it and the DO block used
  -- to die uncaught with no RESULT line. Catch WHEN OTHERS and report
  -- which mechanism actually fired — both are acceptable passes.
  ---------------------------------------------------------------
  BEGIN
    DELETE FROM capabilities WHERE id = c_id;
    RAISE NOTICE 'FAIL  7  referenced capability was DELETED';
    failures := failures + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS  7  referenced capability delete blocked — SQLSTATE=%  mechanism=%  (%)',
      SQLSTATE,
      CASE SQLSTATE
        WHEN '23514' THEN 'capabilities_no_delete (BEFORE DELETE governed-table guard)'
        WHEN '23503' THEN 'FK RESTRICT (offering_capabilities.capability_id)'
        ELSE 'unrecognized mechanism'
      END,
      SQLERRM;
  END;

  ---------------------------------------------------------------
  -- 9. ADDED — partial unique index: soft-delete a row, then reuse its
  --    (tenant_id, offering_key). Must ACCEPT — this is exactly the
  --    behaviour the partial index exists to enable.
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_reuse_key', 'Proof: reuse key, take 1', 'enabler', 'x',
            'none', 'none', ARRAY[]::text[], '[]'::jsonb)
    RETURNING id INTO reuse1_id;

    UPDATE offerings SET deleted_at = now() WHERE id = reuse1_id;

    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_reuse_key', 'Proof: reuse key, take 2', 'enabler', 'x',
            'none', 'none', ARRAY[]::text[], '[]'::jsonb)
    RETURNING id INTO reuse2_id;

    RAISE NOTICE 'PASS  9  (tenant_id, offering_key) reused after soft-delete accepted';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL  9  reuse after soft-delete rejected: % (SQLSTATE=%)', SQLERRM, SQLSTATE;
    failures := failures + 1;
  END;

  ---------------------------------------------------------------
  -- 10. ADDED — two rows sharing a key, both soft-deleted. Must ACCEPT
  --     — the partial index constrains live rows only.
  ---------------------------------------------------------------
  BEGIN
    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_both_deleted', 'Proof: both deleted, take 1', 'enabler', 'x',
            'none', 'none', ARRAY[]::text[], '[]'::jsonb)
    RETURNING id INTO both1_id;
    UPDATE offerings SET deleted_at = now() WHERE id = both1_id;

    INSERT INTO offerings (tenant_id, offering_key, name, family, description,
                           evidence_class, verification_source, evidence_artifacts, source_refs)
    VALUES (t_id, 'proof_both_deleted', 'Proof: both deleted, take 2', 'enabler', 'x',
            'none', 'none', ARRAY[]::text[], '[]'::jsonb)
    RETURNING id INTO both2_id;
    UPDATE offerings SET deleted_at = now() WHERE id = both2_id;

    RAISE NOTICE 'PASS  10 two soft-deleted rows sharing (tenant_id, offering_key) coexist';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FAIL  10 two soft-deleted rows sharing a key rejected: % (SQLSTATE=%)', SQLERRM, SQLSTATE;
    failures := failures + 1;
  END;

  ---------------------------------------------------------------
  -- 11. ADDED — hard DELETE on an offering must be rejected by
  --     offerings_no_delete, the same guard as every other governed
  --     table (offerings only gained it once it went through
  --     ...governance() in 0006).
  ---------------------------------------------------------------
  BEGIN
    DELETE FROM offerings WHERE id = o_id;
    RAISE NOTICE 'FAIL  11 offering was hard-DELETEd';
    failures := failures + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASS  11 offering hard DELETE blocked — SQLSTATE=%  (%)', SQLSTATE, SQLERRM;
  END;

  ---------------------------------------------------------------
  -- 12. FINDING, not pass/fail — soft-delete a capability referenced
  --     by a live offering (o_id/c_id linked in 6a). Expected: succeeds
  --     with nothing preventing it, because soft delete is an UPDATE
  --     and no FK constrains it. Reports observed behaviour only.
  ---------------------------------------------------------------
  BEGIN
    UPDATE capabilities SET deleted_at = now() WHERE id = c_id;
    RAISE NOTICE
      'FINDING 12  capability % soft-deleted while offering % still references it via '
      'offering_capabilities. The UPDATE succeeded — nothing blocks it. A soft-deleted '
      'capability CAN currently sit under a live offering.', c_id, o_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FINDING 12  capability soft-delete unexpectedly failed: SQLSTATE=%  (%)', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE '--------------------------------------------------------';
  IF failures = 0 THEN
    RAISE NOTICE 'RESULT: 0 failures (+ 1 finding, non-pass/fail) — constraints bite. Safe to seed.';
  ELSE
    RAISE EXCEPTION 'RESULT: % FAILURE(S) — constraints are wrong. Do NOT seed.', failures;
  END IF;
  RAISE NOTICE '--------------------------------------------------------';
END
$proof$;

ROLLBACK;

-- Confirm nothing leaked: compare against the pre-transaction baseline, not
-- an absolute zero. offerings is governed and every insert/update above
-- wrote an audit_log row too — both deltas must be true (before = after).
SELECT :off_before AS off_before, count(*) AS off_after,
       :off_before = count(*) AS offerings_no_leak FROM offerings;
SELECT :aud_before AS aud_before, count(*) AS aud_after,
       :aud_before = count(*) AS audit_log_no_leak FROM audit_log;
