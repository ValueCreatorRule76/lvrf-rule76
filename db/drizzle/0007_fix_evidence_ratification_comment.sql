-- ------------------------------------------------------------------
-- Hand-authored — no schema.ts change. drizzle-kit generate has nothing
-- to diff here; COMMENT ON is not part of Drizzle's schema model (same
-- reason 0006's COMMENT ON blocks were hand-appended, not generated).
--
-- Fixes a false claim in the COMMENT ON offerings.evidence_ratification
-- written in 0006: it asserted "an offering can be status=active while
-- evidence_ratification=unratified, and most of the seeded catalog is
-- exactly that." records/seed_offerings.mjs produces status='draft' on
-- every row, not 'active' — the seeded catalog was never an example of
-- that claim. The orthogonality point itself stands; only the empirical
-- claim about the catalog was wrong. Do not edit 0006; it is applied.
-- ------------------------------------------------------------------
COMMENT ON COLUMN "offerings"."evidence_ratification" IS
  'Whether this offering''s evidentiary CLAIM — the evidence_class + '
  'verification_source pair — has been independently audited. Orthogonal to '
  'offerings.status, which is the row''s governance lifecycle: an offering '
  'can be status=active while evidence_ratification=unratified — that is '
  'the orthogonality, not a claim about any particular row. The seeded '
  'catalog illustrates the same orthogonality differently: every seeded row '
  'is status=draft, evidence_ratification=unratified, and market_status='
  'active — all three governance/market dimensions differing simultaneously '
  'on one row. "revoked" means a prior ratification of this '
  'claim was withdrawn as incorrect — no lifecycle_status value carries '
  'that meaning.';
