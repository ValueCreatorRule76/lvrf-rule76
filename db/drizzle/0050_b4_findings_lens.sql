-- 0050 (B4 addendum, LVRF_PLAN §14; Brad, 6 Nov 2026): run_errata gains the 'misstated_finding' kind and finding_code
-- (F2 or F3: a sealed finding its own seal contradicts, both texts read from the seal by lvrf_misstated_findings(),
-- hardening §35); record_documents gains lens_policy_id (the CFO lens policy a print request applied; the lens stays read
-- live, O-D1). Both columns nullable; every existing row satisfies the widened CHECKs; nothing is orphaned.
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_kind_known";--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_kind_complete";--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_recompute_complete";--> statement-breakpoint
ALTER TABLE "record_documents" ADD COLUMN "lens_policy_id" uuid;--> statement-breakpoint
ALTER TABLE "run_errata" ADD COLUMN "finding_code" text;--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_lens_policy_id_lens_policies_id_fk" FOREIGN KEY ("lens_policy_id") REFERENCES "public"."lens_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_errata_one_per_sealed_finding" ON "run_errata" USING btree ("value_run_id","finding_code") WHERE "run_errata"."kind" = 'misstated_finding';--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_lens_policy_scope" CHECK ("record_documents"."lens_policy_id" IS NULL OR (coalesce("record_documents"."kind", '') = 'print_request' AND coalesce("record_documents"."lens", '') = 'cfo'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_kind_known" CHECK ("run_errata"."kind" IN ('link_correction', 'non_customer_credit', 'unsourced_figure', 'misstated_finding'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_kind_complete" CHECK (("run_errata"."kind" = 'link_correction' AND "run_errata"."evidence_id" IS NOT NULL AND "run_errata"."corrected_to_supports" IS NOT NULL AND "run_errata"."points_not_credited" IS NULL AND "run_errata"."figure_finding_id" IS NULL
            AND "run_errata"."finding_code" IS NULL)
        OR ("run_errata"."kind" = 'non_customer_credit' AND "run_errata"."evidence_id" IS NULL AND "run_errata"."corrected_to_supports" IS NULL AND "run_errata"."supersedes_id" IS NULL
            AND "run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL AND "run_errata"."figure_finding_id" IS NULL AND "run_errata"."finding_code" IS NULL
            AND "run_errata"."points_not_credited" IS NOT NULL AND "run_errata"."points_not_credited" >= 0 AND "run_errata"."points_not_credited" <= 100
            AND "run_errata"."recompute_method" LIKE 'From this run''s seal:%')
        OR ("run_errata"."kind" = 'unsourced_figure' AND "run_errata"."figure_finding_id" IS NOT NULL AND "run_errata"."evidence_id" IS NULL AND "run_errata"."corrected_to_supports" IS NULL
            AND "run_errata"."supersedes_id" IS NULL AND "run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL AND "run_errata"."points_not_credited" IS NULL
            AND "run_errata"."finding_code" IS NULL
            AND "run_errata"."recompute_method" LIKE 'From this run''s seal:%' AND "run_errata"."recompute_method" LIKE '%has no source on record%')
        OR ("run_errata"."kind" = 'misstated_finding' AND coalesce("run_errata"."finding_code", '') IN ('F2', 'F3') AND "run_errata"."evidence_id" IS NULL
            AND "run_errata"."corrected_to_supports" IS NULL AND "run_errata"."supersedes_id" IS NULL AND "run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL
            AND "run_errata"."points_not_credited" IS NULL AND "run_errata"."figure_finding_id" IS NULL AND "run_errata"."recompute_method" LIKE 'From this run''s seal:%'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_recompute_complete" CHECK ("run_errata"."kind" IN ('non_customer_credit', 'unsourced_figure', 'misstated_finding') OR ("run_errata"."recomputed_score" IS NOT NULL AND "run_errata"."recomputed_band" IS NOT NULL AND "run_errata"."model_version" IS NOT NULL AND "run_errata"."model_fingerprint" IS NOT NULL
         AND "run_errata"."recompute_method" NOT LIKE 'Not recomputed:%')
        OR ("run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL AND "run_errata"."recompute_method" LIKE 'Not recomputed:%'
         AND ("run_errata"."model_version" IS NULL) = ("run_errata"."model_fingerprint" IS NULL)));