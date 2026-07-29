-- LVRF — Heartbeat Register seed
-- Source: HEARTBEAT-REGISTER.md (R76-HB-001) §10 Canonical Register
--   + AMENDMENT-002 (R76-AMD-002), ratified 28 Jul 2026 — Value Realization family
--
-- Run AFTER the first Drizzle migration, BEFORE hardening.sql:
--   psql -d lvrf -f db/seed_heartbeat_register.sql
--
-- Every row here is transcribed from the register. Do not invent heartbeats.
-- HEARTBEAT-REGISTER §1: a heartbeat not in the register is not constitutional.
-- Adding one is a governance act, not a migration convenience.
--
-- Status is 'ratified' because the register carries Constitutional Verdict
-- APPROVED. Per AMENDMENT-001 Article I, HB-0012's consumer list reads LVRF.

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO heartbeats
  (id, name, category, purpose, producer, frequency, health_weight, failure_severity, status)
VALUES
  ('HB-0001', 'System Initialization', 'operational',
   'Verifies successful startup.',
   'Runtime', 'Every startup', 5, 3, 'ratified'),

  ('HB-0002', 'Authentication', 'security',
   'Verifies authenticated access.',
   'Identity Provider', 'Every login', 8, 4, 'ratified'),

  ('HB-0003', 'Authorization', 'security',
   'Verifies permissions.',
   'Authorization Engine', 'Every request', 9, 5, 'ratified'),

  ('HB-0004', 'Canonical Object Created', 'operational',
   'Evidence that a constitutional object has been created.',
   'Object Service', 'Per creation', 10, 4, 'ratified'),

  ('HB-0005', 'Canonical Object Updated', 'governance',
   'Evidence that an existing object changed. Override rules enforced.',
   'Object Service', 'Per modification', 10, 4, 'ratified'),

  ('HB-0006', 'Object Locked', 'governance',
   'Object entered immutable state.',
   'Governance Engine', 'Per lock', 10, 5, 'ratified'),

  ('HB-0007', 'Governance Override', 'governance',
   'Records constitutional override.',
   'Governance Engine', 'As required', 9, 5, 'ratified'),

  ('HB-0008', 'Snapshot Created', 'integrity',
   'Immutable historical checkpoint.',
   'Repository', 'Per snapshot', 8, 4, 'ratified'),

  ('HB-0009', 'Evidence Attached', 'integrity',
   'Links governed evidence to an object.',
   'Evidence Engine', 'Per attachment', 8, 3, 'ratified'),

  ('HB-0010', 'Constitution Reviewed', 'constitutional',
   'Confirms proposed work was evaluated against the Rule76 Constitution before execution.',
   'Compass', 'Before every governed change', 10, 5, 'ratified'),

  ('HB-0011', 'Heartbeat Health Calculated', 'operational',
   'Recalculates institutional health based on all active heartbeat evidence.',
   'Heartbeat Engine', 'Scheduled and event-driven', 10, 4, 'ratified'),

  ('HB-0012', 'Institutional Health Published', 'operational',
   'Publishes the current constitutional health score to all subscribed components. Consumers: CVAF, LVRF, Compass, Executive Portal.',
   'Heartbeat Engine', 'After every recalculation', 9, 4, 'ratified'),

  -- ---------------------------------------------------------------
  -- Value Realization family — AMENDMENT-002, ratified 28 Jul 2026
  -- ---------------------------------------------------------------

  ('HB-0013', 'Value Baseline Established', 'financial',
   'Evidence that a customer''s current-state business metric has been captured from the customer''s own system of record.',
   'Value Engine', 'Per baseline', 9, 4, 'ratified'),

  ('HB-0014', 'Value Target Committed', 'governance',
   'Records that a named customer sponsor agreed the target is the correct one.',
   'Governance Engine', 'Per commitment', 9, 4, 'ratified'),

  ('HB-0015', 'Value Realized', 'financial',
   'Evidence that a measured actual arrived from the customer''s system of record. Fires on measurement, not on verification.',
   'Value Engine', 'Per measurement', 10, 4, 'ratified'),

  ('HB-0016', 'Value Verified', 'constitutional',
   'Confirms a named human verifier reviewed sources and confirmed the delta before any external claim. Advancing to verified without a human verifier is a constitutional violation.',
   'Governance Engine', 'Per verification', 10, 5, 'ratified'),

  ('HB-0017', 'Realization Record Published', 'integrity',
   'A governed document left the institution. Records content hash, version and disclosure state.',
   'Repository', 'Per external publication', 9, 5, 'ratified'),

  ('HB-0018', 'Capability Change Evidenced', 'learning',
   'Evidence that assessed capability moved, with the assessment and assessor of record attached. Mechanism tier — subordinate to value realization.',
   'Assessment Engine', 'Per assessment', 7, 3, 'ratified')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ------------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------------

-- Expect 18.
SELECT count(*) AS registered_heartbeats FROM heartbeats;

-- Expect: constitutional 2, financial 2, governance 4, integrity 3,
--         learning 1, operational 4, security 2.
SELECT category, count(*) FROM heartbeats GROUP BY category ORDER BY category;

-- All seven constitutional categories must be populated. Expect 0 rows.
SELECT unnest(enum_range(NULL::heartbeat_category)) AS empty_category
EXCEPT
SELECT category FROM heartbeats;

-- Maximum-severity heartbeats. Expect six: HB-0003, HB-0006, HB-0007, HB-0010 were
-- already severity 5 in the original register; HB-0016 and HB-0017 added the other two.
SELECT id, name, category, failure_severity
FROM heartbeats WHERE failure_severity = 5 ORDER BY id;
