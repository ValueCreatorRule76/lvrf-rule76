-- ==================================================================
-- SUPERSEDED — this file describes the shape as of migration 0005.
-- Migration 0006 (applied) changed this shape. This file was NOT updated
-- and must not be read as the current oracle for offerings. Specifically:
--
--   * lifecycle_status  -> RENAMED to market_status (line 82 below).
--     Reason: collided with the lifecycle_status ENUM TYPE that every
--     governance()-conformant table's `status` column uses.
--   * governance_status -> RENAMED to evidence_ratification (line 83).
--     Reason: sitting beside governance().status, the name implied the
--     row's lifecycle rather than "has the evidence_class + verification_
--     source claim been independently audited" — the actual meaning.
--   * offerings_tenant_key_unique (lines 88-89) was a plain UNIQUE
--     constraint here. 0006 dropped it and replaced it with a PARTIAL
--     unique index (WHERE deleted_at IS NULL), because offerings gained
--     the governance() columns below and a soft-deleted row must not
--     block reuse of its (tenant_id, offering_key) pair.
--   * offerings did not have status, version, superseded_by_id,
--     steward_person_id, or deleted_at at all in this file — offerings
--     was hand-rolled without ...governance(). 0006 added all five;
--     their absence here made offerings the one governed table lvrf_audit()
--     could not touch.
--   * offerings_lifecycle_status_valid / offerings_governance_status_valid
--     (lines 112-117) were dropped and replaced by offerings_market_status_
--     valid / offerings_evidence_ratification_valid on the renamed columns.
--
-- For the current shape, read db/schema.ts and the live database, not this
-- file. This file is retained only as a historical record of what 0005
-- actually shipped, per the "reference SQL is a parity oracle, not a
-- migration" convention — see db/drizzle/0006_typical_marten_broadcloak.sql
-- for what changed and why.
-- ==================================================================

-- ==================================================================
-- LVRF Migration 0005 — Offerings Catalog
-- Learning Value Realization Framework · A Chapel of the Rule76 Living Cathedral
--
-- Spine stage served: ATTACH.
--
-- WHAT THIS CHANGES
--   Adds 3 enums, 2 tables, 5 CHECK constraints, 1 unique constraint,
--   1 partial unique index, 3 foreign keys.
--
-- WHAT THIS COULD ORPHAN
--   Nothing existing. Both tables are new and nothing references them yet.
--   Forward risk only: offering_capabilities.capability_id declares ON DELETE
--   RESTRICT, and a capability referenced by an offering is intentionally not
--   disposable — a capability with catalog history should not vanish.
--
--   CORRECTED (db/prove_0005_constraints.sql test 7, run after 0006): RESTRICT
--   is not what enforces this. capabilities is a governed table, and
--   capabilities_no_delete (hardening.sql) fires BEFORE DELETE and raises
--   23514 unconditionally, before Postgres ever reaches the FK check — so the
--   hard-delete attempt dies there, not at the FK. RESTRICT never gets a turn
--   in normal operation; it is a dormant backstop for the abnormal paths
--   where the trigger wouldn't apply (DISABLE TRIGGER, a superuser bypass, or
--   capabilities being removed from hardening.sql's governed array while the
--   FK stays declared). This is not a property of this one relationship — it
--   is true of every FK pointing at any of the 13 governed tables.
--
-- TRIGGERS ARE NOT CREATED HERE.
--   offerings is a GOVERNED table. Its audit (AFTER) and touch (BEFORE UPDATE)
--   triggers are attached by hardening.sql, which loops the governed array.
--   Add 'offerings' to that array and re-run hardening.sql after this applies.
--   Do not hand-roll triggers here — that is how DEFECT-001 happened.
-- ==================================================================

BEGIN;

-- ------------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------------

-- The strongest evidence of capability change an offering can actually emit.
-- Not what its marketing claims. Ordering is meaningful, weakest first.
CREATE TYPE evidence_class AS ENUM (
  'none',          -- emits nothing about a learner (authoring/enablement tooling)
  'consumption',   -- proves only that learning was consumed
  'assessed',      -- scored measure of capability against a standard
  'demonstrated',  -- observed performance in a simulated or supervised setting
  'applied'        -- capability exercised in the customer's real work system
);

-- Who grades the evidence. This is what a CFO actually weighs.
CREATE TYPE verification_source AS ENUM (
  'none',
  'vendor_platform',
  'human_observer',
  'third_party',
  'customer_system'
);

CREATE TYPE offering_family AS ENUM (
  'platform', 'assessment', 'practice', 'coaching',
  'instructor_led', 'program', 'content', 'enabler'
);

-- ------------------------------------------------------------------
-- offerings — GOVERNED
-- ------------------------------------------------------------------

CREATE TABLE offerings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  offering_key        text NOT NULL,
  name                text NOT NULL,
  family              offering_family NOT NULL,
  description         text NOT NULL,

  -- The governing fields
  evidence_class      evidence_class NOT NULL,
  verification_source verification_source NOT NULL,
  evidence_artifacts  text[] NOT NULL DEFAULT '{}',

  -- Deliberately nullable. Nothing public supports a figure (gap G4).
  -- A null here is a recorded absence, not an oversight.
  commercial_model    text,

  -- Provenance
  source_refs         jsonb NOT NULL,
  confirmation_gaps   text[] NOT NULL DEFAULT '{}',

  lifecycle_status    text NOT NULL DEFAULT 'proposed',
  governance_status   text NOT NULL DEFAULT 'unratified',

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT offerings_tenant_key_unique
    UNIQUE (tenant_id, offering_key),

  -- An offering that claims to measure capability must name who grades it.
  CONSTRAINT offerings_evidence_requires_source CHECK (
    evidence_class IN ('none','consumption') OR verification_source <> 'none'
  ),

  -- An offering that claims to emit evidence must name the artifact.
  --
  -- cardinality(), NOT array_length(). array_length('{}',1) returns NULL,
  -- NULL >= 1 evaluates to NULL, and a CHECK passes on NULL — so the
  -- array_length form silently accepts the exact row it exists to reject.
  -- Proven empirically before this migration was written. Do not "simplify".
  CONSTRAINT offerings_artifacts_nonempty_when_evidential CHECK (
    evidence_class = 'none' OR cardinality(evidence_artifacts) >= 1
  ),

  -- Provenance must be a list, so a row can never claim a single
  -- unstructured source string.
  CONSTRAINT offerings_source_refs_is_array CHECK (
    jsonb_typeof(source_refs) = 'array'
  ),

  CONSTRAINT offerings_lifecycle_status_valid CHECK (
    lifecycle_status IN ('proposed','approved','active','deprecated','retired')
  ),

  CONSTRAINT offerings_governance_status_valid CHECK (
    governance_status IN ('unratified','ratified','revoked')
  )
);

CREATE INDEX offerings_tenant_idx ON offerings (tenant_id);
CREATE INDEX offerings_evidence_class_idx ON offerings (evidence_class);

COMMENT ON TABLE offerings IS
  'Vendor offering catalog, tenant-scoped. An offering reaches a business '
  'metric only through a capability — never directly. evidence_class governs '
  'whether an offering may serve as the basis for a verified value outcome.';

COMMENT ON COLUMN offerings.evidence_class IS
  'Strongest evidence of capability change this offering can actually emit. '
  'none/consumption cannot be the sole basis for a verified value_outcome '
  '(enforced in the route — cross-table, cannot be a CHECK).';

-- ------------------------------------------------------------------
-- offering_capabilities — junction, UNGOVERNED
-- Consistent with person_roles and reflection_evidence.
--
-- THIS TABLE IS THE CAPABILITY HOP MADE STRUCTURAL. It is the reason an
-- offering cannot be wired straight to a business metric.
-- ------------------------------------------------------------------

CREATE TABLE offering_capabilities (
  offering_id   uuid NOT NULL REFERENCES offerings(id)   ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES capabilities(id) ON DELETE RESTRICT,
  is_primary    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (offering_id, capability_id)
);

-- At most one primary capability per offering.
CREATE UNIQUE INDEX offering_capabilities_one_primary
  ON offering_capabilities (offering_id)
  WHERE is_primary;

CREATE INDEX offering_capabilities_capability_idx
  ON offering_capabilities (capability_id);

COMMIT;

-- ------------------------------------------------------------------
-- Verification — run after COMMIT
-- ------------------------------------------------------------------

-- Expect 2.
SELECT count(*) AS new_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('offerings','offering_capabilities');

-- Expect 5 CHECK constraints on offerings (excludes NOT NULL).
SELECT conname FROM pg_constraint
WHERE conrelid = 'offerings'::regclass AND contype = 'c'
ORDER BY conname;

-- Expect 3 enums: evidence_class 5, offering_family 8, verification_source 5.
-- (An earlier version of this query hardcoded ::evidence_class in enum_range
--  and reported 5 for all three. It looked right and proved nothing.)
SELECT t.typname, count(e.enumlabel)::int AS n
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('evidence_class','verification_source','offering_family')
GROUP BY t.typname ORDER BY t.typname;

-- Expect 0 rows. offerings has no triggers until hardening.sql runs.
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'offerings'::regclass AND NOT tgisinternal;
