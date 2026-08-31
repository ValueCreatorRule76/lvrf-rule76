-- ------------------------------------------------------------------
-- 2.0 item 5 — industry packs, step 3: research_results gains a
-- discriminant.
--
-- WHY: 0018 designed research_results for ONE shape — a published figure
-- for one metric at one institution, scalar value + citation. A pack
-- measure (industry_measures, 0019/0020) is a richer object — name, unit,
-- direction, definition, why_it_pays, addressable, addressable_reasoning,
-- confounders, citation — that does not fit value/citation as scalars.
-- Both shapes now land in this table. Two shapes with no discriminant is
-- how a parser starts guessing.
--
-- REPORT — 0018's actual column definitions, read before anything here
-- was changed: institution_id was NOT NULL; business_metric_id was
-- already nullable ("Null when the research was not metric-scoped").
-- Only institution_id needed a nullability change; business_metric_id's
-- existing nullability already accommodated an industry_measure row, it
-- just needed the CHECK below to require it NULL for that kind.
--
-- NEW ENUM research_result_kind:
--   metric_value      a published figure for one metric at one
--                      institution. Scalar shape: value + citation.
--   industry_measure  a candidate pack entry for an industry. Rich shape,
--                      carried whole in raw_response — no per-field
--                      columns. Adding nine columns used by one kind and
--                      null for the other is the sparse-table failure
--                      this avoids.
--
-- result_kind ADDED WITH NO DEFAULT. A default would be an assertion made
-- on behalf of every caller — the same reason FindingsInput requires
-- driftChecksRan rather than defaulting it. Nothing writes to this table
-- yet, so requiring it costs nothing today and forecloses a wrong
-- assumption later.
--
-- industry_id ADDED, NULLABLE, fk industries: null for metric_value, set
-- for industry_measure. A pack measure is industry-scoped and has no
-- institution or metric.
--
-- institution_id RELAXED to nullable: it was written for the metric case
-- alone, and an industry_measure result has none. research_results_kind_shape
-- (new CHECK) enforces the real invariant in its place — institution_id
-- required and industry_id null for metric_value; industry_id required
-- and both institution_id and business_metric_id null for
-- industry_measure. The shape is enforced, not trusted, same as
-- research_results_found_shape.
--
-- REPORT — research_results_found_shape (0018) conflict: it required
-- value IS NOT NULL AND citation IS NOT NULL whenever found = true, with
-- no exception. That is unconditionally TRUE for every found row, which
-- directly conflicts with industry_measure: its value and citation stay
-- NULL by design (the object lives whole in raw_response, per above), so
-- a found = true industry_measure row would have failed 0018's CHECK
-- outright. Resolved by splitting the found = true branch on result_kind:
-- metric_value still requires the scalar pair; industry_measure now
-- requires them to be ABSENT, so a row can never silently carry both a
-- scalar answer and a raw_response object, or neither. found = false is
-- unchanged — not_found_reason is required regardless of kind.
--
-- Trigger count unchanged — no new table, and neither existing trigger
-- (research_results_audit / _touch / _no_delete, hardening.sql section
-- 10) references a column this migration alters or adds.
-- ------------------------------------------------------------------
CREATE TYPE "public"."research_result_kind" AS ENUM('metric_value', 'industry_measure');--> statement-breakpoint
ALTER TABLE "research_results" DROP CONSTRAINT "research_results_found_shape";--> statement-breakpoint
ALTER TABLE "research_results" ALTER COLUMN "institution_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "industry_id" uuid;--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "result_kind" "research_result_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_results_industry_idx" ON "research_results" USING btree ("industry_id");--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_kind_shape" CHECK (("research_results"."result_kind" = 'metric_value'
           AND "research_results"."institution_id" IS NOT NULL
           AND "research_results"."industry_id" IS NULL)
        OR ("research_results"."result_kind" = 'industry_measure'
           AND "research_results"."industry_id" IS NOT NULL
           AND "research_results"."institution_id" IS NULL
           AND "research_results"."business_metric_id" IS NULL));--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_found_shape" CHECK (("research_results"."found" = false AND "research_results"."not_found_reason" IS NOT NULL)
        OR ("research_results"."found" = true AND "research_results"."result_kind" = 'metric_value'
              AND "research_results"."value" IS NOT NULL AND "research_results"."citation" IS NOT NULL)
        OR ("research_results"."found" = true AND "research_results"."result_kind" = 'industry_measure'
              AND "research_results"."value" IS NULL AND "research_results"."citation" IS NULL));
