-- ------------------------------------------------------------------
-- 2.0 item 5, industry packs step 4 — accept/reject the road ahead.
--
-- research_results_accepted_has_evidence (0018) required evidence_id
-- NOT NULL whenever review_state = 'accepted', full stop. That was
-- written when metric_value was the only kind research_results carried:
-- accepting a metric_value creates an evidence row, so the id always
-- existed by the time review_state flipped. Accepting an
-- industry_measure (the accept route being added alongside this
-- migration) creates an industry_measures row instead — it has no
-- evidence to point to, so the unconditional form would refuse every
-- industry_measure accept outright. Caught by reading the constraint
-- before writing the accept route, not by running it and finding out.
--
-- RESOLVED by adding industry_measures_id (nullable, fk industry_measures,
-- same restrict-on-delete as evidence_id beside it) and replacing the
-- constraint with a kind-conditional XOR, renamed to
-- research_results_accepted_has_record since it is no longer about
-- evidence specifically: an accepted metric_value row must carry
-- evidence_id and NOT industry_measures_id; an accepted industry_measure
-- row must carry industry_measures_id and NOT evidence_id. Same
-- discriminant as research_results_kind_shape and
-- research_results_found_shape above it, and the XOR (not just OR) means
-- a row can never point at both kinds' records, or point at the wrong
-- kind's. An accepted row that produced nothing is a lie the database
-- refuses, not something the application promises to avoid.
--
-- Trigger count unchanged — no new table, and neither existing trigger
-- on research_results references a column this migration alters or adds.
-- ------------------------------------------------------------------
ALTER TABLE "research_results" DROP CONSTRAINT "research_results_accepted_has_evidence";--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "industry_measures_id" uuid;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_industry_measures_id_industry_measures_id_fk" FOREIGN KEY ("industry_measures_id") REFERENCES "public"."industry_measures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_accepted_has_record" CHECK ("research_results"."review_state" <> 'accepted'
        OR ("research_results"."result_kind" = 'metric_value'
              AND "research_results"."evidence_id" IS NOT NULL AND "research_results"."industry_measures_id" IS NULL)
        OR ("research_results"."result_kind" = 'industry_measure'
              AND "research_results"."industry_measures_id" IS NOT NULL AND "research_results"."evidence_id" IS NULL));
