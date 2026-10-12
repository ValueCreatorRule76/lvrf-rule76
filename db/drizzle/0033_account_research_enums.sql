-- ------------------------------------------------------------------
-- Q4h (3.0 item 6, account research intake) — the two enum values, alone.
--
-- WHAT IT CHANGES. research_result_kind gains 'institution_fact'
-- (one researched field about an account); institution_fact_kind gains
-- 'disclosure_regime' (3.0 item 4's minimum). A migration of its own, as
-- planned: Postgres cannot USE a new enum value inside the transaction
-- that adds it. 0034's CHECKs that name these values compare them as
-- text (::text), so they are safe even when drizzle-kit applies 0033 and
-- 0034 in one run (tested: local and prod-copy clones, 12 Oct 2026).
-- WHAT IT COULD ORPHAN. Nothing. BACK UP FIRST (CLAUDE.md rule 8).
-- ------------------------------------------------------------------
ALTER TYPE "public"."institution_fact_kind" ADD VALUE 'disclosure_regime';--> statement-breakpoint
ALTER TYPE "public"."research_result_kind" ADD VALUE 'institution_fact';