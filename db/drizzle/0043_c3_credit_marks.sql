-- C3 (LVRF_PLAN §12; Brad's rulings, 26 Oct 2026). Changes:
--   governance_act gains 'grant' (a steward names a customer-side role);
--   run_errata gains kind ('link_correction' for every existing row, by default; 'non_customer_credit')
--     and points_not_credited; evidence_id and corrected_to_supports become nullable, held by
--     run_errata_kind_complete; run_errata_supports_known and run_errata_recompute_complete are
--     rewritten for the kind, definite under NULL; one credit erratum per run (a partial unique index);
--   new table customer_role_grants (a role named from a source, append-only but for its revocation);
--   new table system_exercise_marks (append-only, one per evidence row or run).
-- Orphans nothing: no row is changed but for the new default kind, and the 14 existing errata are all
-- link corrections, each passing run_errata_kind_complete.
ALTER TYPE "public"."governance_act" ADD VALUE 'grant';--> statement-breakpoint
CREATE TABLE "customer_role_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text NOT NULL,
	"source_evidence_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"granted_by_person_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_person_id" uuid,
	"revocation_reason" text,
	CONSTRAINT "customer_role_grants_role_known" CHECK ("customer_role_grants"."role" IN ('metric_owner', 'executive_sponsor')),
	CONSTRAINT "customer_role_grants_reason_stated" CHECK (length(btrim("customer_role_grants"."reason")) >= 12),
	CONSTRAINT "customer_role_grants_revocation_complete" CHECK (("customer_role_grants"."revoked_at" IS NULL AND "customer_role_grants"."revoked_by_person_id" IS NULL AND "customer_role_grants"."revocation_reason" IS NULL)
        OR ("customer_role_grants"."revoked_at" IS NOT NULL AND "customer_role_grants"."revoked_by_person_id" IS NOT NULL AND "customer_role_grants"."revocation_reason" IS NOT NULL
            AND length(btrim(coalesce("customer_role_grants"."revocation_reason", ''))) >= 12))
);
--> statement-breakpoint
CREATE TABLE "system_exercise_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"marked_by_person_id" uuid NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_exercise_marks_subject_known" CHECK ("system_exercise_marks"."subject_table" IN ('evidence', 'value_runs')),
	CONSTRAINT "system_exercise_marks_reason_quotes_note" CHECK ("system_exercise_marks"."reason" LIKE 'Entered to exercise the system, not as case evidence' || chr(59) || ' its own note reads: %' AND length(btrim("system_exercise_marks"."reason")) >= 80)
);
--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_supports_known";--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_recompute_complete";--> statement-breakpoint
ALTER TABLE "run_errata" ALTER COLUMN "evidence_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run_errata" ALTER COLUMN "corrected_to_supports" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run_errata" ADD COLUMN "kind" text DEFAULT 'link_correction' NOT NULL;--> statement-breakpoint
ALTER TABLE "run_errata" ADD COLUMN "points_not_credited" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "customer_role_grants" ADD CONSTRAINT "customer_role_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_role_grants" ADD CONSTRAINT "customer_role_grants_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_role_grants" ADD CONSTRAINT "customer_role_grants_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_role_grants" ADD CONSTRAINT "customer_role_grants_source_evidence_id_evidence_id_fk" FOREIGN KEY ("source_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_role_grants" ADD CONSTRAINT "customer_role_grants_granted_by_person_id_persons_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_role_grants" ADD CONSTRAINT "customer_role_grants_revoked_by_person_id_persons_id_fk" FOREIGN KEY ("revoked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_exercise_marks" ADD CONSTRAINT "system_exercise_marks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_exercise_marks" ADD CONSTRAINT "system_exercise_marks_marked_by_person_id_persons_id_fk" FOREIGN KEY ("marked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_role_grants_current_key" ON "customer_role_grants" USING btree ("institution_id","person_id","role") WHERE "customer_role_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "customer_role_grants_person_idx" ON "customer_role_grants" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_exercise_marks_one_per_subject" ON "system_exercise_marks" USING btree ("subject_table","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_errata_one_credit_erratum" ON "run_errata" USING btree ("value_run_id") WHERE "run_errata"."kind" = 'non_customer_credit';--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_kind_known" CHECK ("run_errata"."kind" IN ('link_correction', 'non_customer_credit'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_kind_complete" CHECK (("run_errata"."kind" = 'link_correction' AND "run_errata"."evidence_id" IS NOT NULL AND "run_errata"."corrected_to_supports" IS NOT NULL AND "run_errata"."points_not_credited" IS NULL)
        OR ("run_errata"."kind" = 'non_customer_credit' AND "run_errata"."evidence_id" IS NULL AND "run_errata"."corrected_to_supports" IS NULL AND "run_errata"."supersedes_id" IS NULL
            AND "run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL
            AND "run_errata"."points_not_credited" IS NOT NULL AND "run_errata"."points_not_credited" > 0 AND "run_errata"."points_not_credited" <= 100
            AND "run_errata"."recompute_method" LIKE 'From this run''s seal:%'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_supports_known" CHECK ("run_errata"."corrected_to_supports" IS NULL OR "run_errata"."corrected_to_supports" IN ('baseline', 'actual', 'impact_basis', 'target_commitment', 'verification'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_recompute_complete" CHECK ("run_errata"."kind" = 'non_customer_credit' OR ("run_errata"."recomputed_score" IS NOT NULL AND "run_errata"."recomputed_band" IS NOT NULL AND "run_errata"."model_version" IS NOT NULL AND "run_errata"."model_fingerprint" IS NOT NULL
         AND "run_errata"."recompute_method" NOT LIKE 'Not recomputed:%')
        OR ("run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL AND "run_errata"."recompute_method" LIKE 'Not recomputed:%'
         AND ("run_errata"."model_version" IS NULL) = ("run_errata"."model_fingerprint" IS NULL)));