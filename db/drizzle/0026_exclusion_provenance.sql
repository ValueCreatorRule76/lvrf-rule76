-- ------------------------------------------------------------------
-- Exclusions carry the research that proposed them; one accepted review
-- per pack entry.
--
-- WHAT IT CHANGES. Additive only:
--   - industry_measure_exclusions.proposed_by_research_tool and
--     proposal_text, nullable, with CHECK
--     industry_measure_exclusions_proposal_is_complete (both or neither,
--     neither blank). The research's own wording, kept apart from `reason`,
--     which is the person's judgement.
--   - research_results_one_accepted_per_measure: a partial UNIQUE index on
--     research_results(industry_measures_id) WHERE review_state =
--     'accepted'. Makes the pack page's one-review-per-entry join a
--     constraint instead of a property of how accept happens to work.
--
-- WHAT IT COULD ORPHAN OR REFUSE. Nothing orphaned. The CHECK passes on
-- every existing exclusion (there are none, local or prod). The unique
-- index would fail to build if any measure had two accepted results;
-- prod has 12 accepted results on 12 distinct measures, so it builds.
-- No trigger change: the count stays 82. Re-run hardening.sql as usual.
--
-- BACK UP FIRST (CLAUDE.md rule 8).
--
-- Generated with drizzle-kit's generateMigration against 0025's snapshot;
-- statements are drizzle-kit's own output, unedited.
-- ------------------------------------------------------------------
ALTER TABLE "industry_measure_exclusions" ADD COLUMN "proposed_by_research_tool" text;
--> statement-breakpoint
ALTER TABLE "industry_measure_exclusions" ADD COLUMN "proposal_text" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "research_results_one_accepted_per_measure" ON "research_results" USING btree ("industry_measures_id") WHERE "research_results"."review_state" = 'accepted';
--> statement-breakpoint
ALTER TABLE "industry_measure_exclusions" ADD CONSTRAINT "industry_measure_exclusions_proposal_is_complete" CHECK (("industry_measure_exclusions"."proposed_by_research_tool" IS NULL AND "industry_measure_exclusions"."proposal_text" IS NULL)
        OR ("industry_measure_exclusions"."proposed_by_research_tool" IS NOT NULL AND btrim("industry_measure_exclusions"."proposed_by_research_tool") <> ''
            AND "industry_measure_exclusions"."proposal_text" IS NOT NULL AND btrim("industry_measure_exclusions"."proposal_text") <> ''));
