-- ------------------------------------------------------------------
-- C1 (LVRF_PLAN §9; Brad's ruling and C1-D1–D4, 25 Oct 2026). Changes
-- value_outcome_evidence (the key widens to include supports; withdrawal and
-- correction columns, all null on every existing link, so every link stays
-- current; one current link per outcome and evidence) and adds run_errata.
-- Orphans nothing: no row is deleted or changed, no FK is dropped.
-- ------------------------------------------------------------------
CREATE TABLE "run_errata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"value_run_id" uuid NOT NULL,
	"value_outcome_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"what_was_wrong" text NOT NULL,
	"what_is_right" text NOT NULL,
	"reason" text NOT NULL,
	"model_version" text NOT NULL,
	"model_fingerprint" text NOT NULL,
	"sealed_score" numeric(5, 1) NOT NULL,
	"sealed_band" text NOT NULL,
	"recomputed_score" numeric(5, 1) NOT NULL,
	"recomputed_band" text NOT NULL,
	"recompute_method" text NOT NULL,
	"recorded_by_person_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_errata_texts_stated" CHECK (length(btrim("run_errata"."what_was_wrong")) >= 12 AND length(btrim("run_errata"."what_is_right")) >= 12 AND length(btrim("run_errata"."reason")) >= 12),
	CONSTRAINT "run_errata_scores_in_range" CHECK ("run_errata"."sealed_score" BETWEEN 0 AND 100 AND "run_errata"."recomputed_score" BETWEEN 0 AND 100),
	CONSTRAINT "run_errata_bands_known" CHECK ("run_errata"."sealed_band" IN ('low', 'medium', 'high') AND "run_errata"."recomputed_band" IN ('low', 'medium', 'high')),
	CONSTRAINT "run_errata_method_stated" CHECK (length(btrim("run_errata"."recompute_method")) >= 24)
);
--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" DROP CONSTRAINT "value_outcome_evidence_value_outcome_id_evidence_id_pk";--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_value_outcome_id_evidence_id_supports_pk" PRIMARY KEY("value_outcome_id","evidence_id","supports");--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD COLUMN "withdrawn_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD COLUMN "withdrawal_reason" text;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD COLUMN "corrects_supports" text;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD COLUMN "corrected_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD COLUMN "correction_reason" text;--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_value_run_id_value_runs_id_fk" FOREIGN KEY ("value_run_id") REFERENCES "public"."value_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_recorded_by_person_id_persons_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_errata_run_idx" ON "run_errata" USING btree ("value_run_id");--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_withdrawn_by_person_id_persons_id_fk" FOREIGN KEY ("withdrawn_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_corrected_by_person_id_persons_id_fk" FOREIGN KEY ("corrected_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "value_outcome_evidence_one_current" ON "value_outcome_evidence" USING btree ("value_outcome_id","evidence_id") WHERE "value_outcome_evidence"."withdrawn_at" IS NULL;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_withdrawal_complete" CHECK (("value_outcome_evidence"."withdrawn_by_person_id" IS NULL AND "value_outcome_evidence"."withdrawn_at" IS NULL AND "value_outcome_evidence"."withdrawal_reason" IS NULL)
        OR ("value_outcome_evidence"."withdrawn_by_person_id" IS NOT NULL AND "value_outcome_evidence"."withdrawn_at" IS NOT NULL AND "value_outcome_evidence"."withdrawal_reason" IS NOT NULL
            AND length(btrim("value_outcome_evidence"."withdrawal_reason")) >= 12));--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_correction_complete" CHECK (("value_outcome_evidence"."corrects_supports" IS NULL AND "value_outcome_evidence"."corrected_by_person_id" IS NULL AND "value_outcome_evidence"."correction_reason" IS NULL)
        OR ("value_outcome_evidence"."corrects_supports" IS NOT NULL AND "value_outcome_evidence"."corrected_by_person_id" IS NOT NULL AND "value_outcome_evidence"."correction_reason" IS NOT NULL
            AND "value_outcome_evidence"."corrects_supports" IN ('baseline', 'actual', 'impact_basis') AND "value_outcome_evidence"."corrects_supports" <> "value_outcome_evidence"."supports"
            AND length(btrim("value_outcome_evidence"."correction_reason")) >= 12));