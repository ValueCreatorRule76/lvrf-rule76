-- C3b (LVRF_PLAN §15; Brad's rulings and conditions, 27 Oct 2026). Changes:
--   governance_act gains 'find' (a steward records that a figure has no source on record);
--   new table figure_findings (append-only, one per outcome and field; "no source on record", never "invented");
--   run_errata gains figure_finding_id and a third kind, 'unsourced_figure' (names its finding, no link, no
--     points, no recompute); run_errata_kind_known, run_errata_kind_complete and run_errata_recompute_complete
--     are rewritten for it, definite under NULL; run_errata_never_invented; one per run and finding.
-- Orphans nothing: no existing row changes. The 14 errata are link corrections; each still passes
-- run_errata_kind_complete with figure_finding_id NULL.
ALTER TYPE "public"."governance_act" ADD VALUE 'find';--> statement-breakpoint
CREATE TABLE "figure_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"value_outcome_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" numeric(18, 4) NOT NULL,
	"finding_text" text NOT NULL,
	"reason" text NOT NULL,
	"recorded_by_person_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figure_findings_field_known" CHECK ("figure_findings"."field" IN ('baseline_value', 'actual_value', 'claimed_currency_impact')),
	CONSTRAINT "figure_findings_texts_stated" CHECK (length(btrim("figure_findings"."reason")) >= 12 AND "figure_findings"."finding_text" LIKE '% has no source on record%'),
	CONSTRAINT "figure_findings_never_invented" CHECK (("figure_findings"."finding_text" || ' ' || "figure_findings"."reason") !~* '\m(invent(ed|s|ing)?|fabricat[a-z]*|made up)\M')
);
--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_kind_known";--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_kind_complete";--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_recompute_complete";--> statement-breakpoint
ALTER TABLE "run_errata" ADD COLUMN "figure_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "figure_findings" ADD CONSTRAINT "figure_findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_findings" ADD CONSTRAINT "figure_findings_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_findings" ADD CONSTRAINT "figure_findings_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_findings" ADD CONSTRAINT "figure_findings_recorded_by_person_id_persons_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "figure_findings_one_per_figure" ON "figure_findings" USING btree ("value_outcome_id","field");--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_figure_finding_id_figure_findings_id_fk" FOREIGN KEY ("figure_finding_id") REFERENCES "public"."figure_findings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_errata_one_per_finding" ON "run_errata" USING btree ("value_run_id","figure_finding_id") WHERE "run_errata"."kind" = 'unsourced_figure';--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_never_invented" CHECK ("run_errata"."kind" <> 'unsourced_figure' OR ("run_errata"."what_was_wrong" || ' ' || "run_errata"."what_is_right" || ' ' || "run_errata"."reason" || ' ' || "run_errata"."recompute_method") !~* '\m(invent(ed|s|ing)?|fabricat[a-z]*|made up)\M');--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_kind_known" CHECK ("run_errata"."kind" IN ('link_correction', 'non_customer_credit', 'unsourced_figure'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_kind_complete" CHECK (("run_errata"."kind" = 'link_correction' AND "run_errata"."evidence_id" IS NOT NULL AND "run_errata"."corrected_to_supports" IS NOT NULL AND "run_errata"."points_not_credited" IS NULL AND "run_errata"."figure_finding_id" IS NULL)
        OR ("run_errata"."kind" = 'non_customer_credit' AND "run_errata"."evidence_id" IS NULL AND "run_errata"."corrected_to_supports" IS NULL AND "run_errata"."supersedes_id" IS NULL
            AND "run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL AND "run_errata"."figure_finding_id" IS NULL
            AND "run_errata"."points_not_credited" IS NOT NULL AND "run_errata"."points_not_credited" > 0 AND "run_errata"."points_not_credited" <= 100
            AND "run_errata"."recompute_method" LIKE 'From this run''s seal:%')
        OR ("run_errata"."kind" = 'unsourced_figure' AND "run_errata"."figure_finding_id" IS NOT NULL AND "run_errata"."evidence_id" IS NULL AND "run_errata"."corrected_to_supports" IS NULL
            AND "run_errata"."supersedes_id" IS NULL AND "run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL AND "run_errata"."points_not_credited" IS NULL
            AND "run_errata"."recompute_method" LIKE 'From this run''s seal:%' AND "run_errata"."recompute_method" LIKE '%has no source on record%'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_recompute_complete" CHECK ("run_errata"."kind" IN ('non_customer_credit', 'unsourced_figure') OR ("run_errata"."recomputed_score" IS NOT NULL AND "run_errata"."recomputed_band" IS NOT NULL AND "run_errata"."model_version" IS NOT NULL AND "run_errata"."model_fingerprint" IS NOT NULL
         AND "run_errata"."recompute_method" NOT LIKE 'Not recomputed:%')
        OR ("run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL AND "run_errata"."recompute_method" LIKE 'Not recomputed:%'
         AND ("run_errata"."model_version" IS NULL) = ("run_errata"."model_fingerprint" IS NULL)));