-- B3 (P6; LVRF_PLAN §19, approved by Brad 5 Nov 2026). Changes: four insert-only tables, policy_values, lens_policies,
-- monetization_rates, roadmap_milestones (and their enums rate_kind, milestone_status); record_documents gains kind
-- (default 'rendering', which the five existing rows take), lens and shared_with, with three CHECKs. Guards, steward-only
-- rules, act presence and the share gate are hardening section 33. Drops, retypes and rewrites nothing beyond that
-- default; orphans nothing. The tables are written by INSERT only, so ownership.sql's UPDATE list is unchanged.
CREATE TYPE "public"."milestone_status" AS ENUM('planned', 'done', 'missed');--> statement-breakpoint
CREATE TYPE "public"."rate_kind" AS ENUM('performance', 'exposure');--> statement-breakpoint
CREATE TABLE "lens_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"persona" text NOT NULL,
	"min_confidence_score" numeric(5, 1) NOT NULL,
	"admitted_bases" text[] NOT NULL,
	"suppresses" text[] NOT NULL,
	"refusal_text" text NOT NULL,
	"reason" text NOT NULL,
	"ratified_by_person_id" uuid NOT NULL,
	"ratified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	CONSTRAINT "lens_policies_supersedes_key" UNIQUE("supersedes_id"),
	CONSTRAINT "lens_policies_persona_known" CHECK ("lens_policies"."persona" IN ('cfo')),
	CONSTRAINT "lens_policies_threshold_range" CHECK ("lens_policies"."min_confidence_score" >= 0 AND "lens_policies"."min_confidence_score" <= 100),
	CONSTRAINT "lens_policies_bases_known" CHECK (cardinality("lens_policies"."admitted_bases") >= 1 AND array_position("lens_policies"."admitted_bases", NULL) IS NULL
        AND "lens_policies"."admitted_bases" <@ ARRAY['system_of_record', 'published', 'client_stated', 'inferred', 'assumed']::text[]),
	CONSTRAINT "lens_policies_suppresses_known" CHECK (array_position("lens_policies"."suppresses", NULL) IS NULL AND "lens_policies"."suppresses" <@ ARRAY['consumption']::text[]),
	CONSTRAINT "lens_policies_refusal_stated" CHECK (char_length(btrim("lens_policies"."refusal_text")) >= 24),
	CONSTRAINT "lens_policies_reason_stated" CHECK (char_length(btrim("lens_policies"."reason")) >= 12)
);
--> statement-breakpoint
CREATE TABLE "monetization_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"business_metric_id" uuid NOT NULL,
	"rate" numeric NOT NULL,
	"currency" text NOT NULL,
	"per_unit" text NOT NULL,
	"rate_kind" "rate_kind" NOT NULL,
	"how_read" text NOT NULL,
	"evidence_id" uuid NOT NULL,
	"reason" text,
	"recorded_by_person_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	CONSTRAINT "monetization_rates_supersedes_key" UNIQUE("supersedes_id"),
	CONSTRAINT "monetization_rates_rate_nonnegative" CHECK ("monetization_rates"."rate" >= 0),
	CONSTRAINT "monetization_rates_currency_code" CHECK ("monetization_rates"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "monetization_rates_how_read_stated" CHECK (char_length(btrim("monetization_rates"."how_read")) >= 12),
	CONSTRAINT "monetization_rates_correction_says_why" CHECK ("monetization_rates"."supersedes_id" IS NULL OR ("monetization_rates"."reason" IS NOT NULL AND char_length(btrim("monetization_rates"."reason")) >= 12))
);
--> statement-breakpoint
CREATE TABLE "policy_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" numeric NOT NULL,
	"reason" text NOT NULL,
	"set_by_person_id" uuid NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	CONSTRAINT "policy_values_supersedes_key" UNIQUE("supersedes_id"),
	CONSTRAINT "policy_values_key_known" CHECK ("policy_values"."key" IN ('cost_of_delay_months', 'pack_ratification_institutions')),
	CONSTRAINT "policy_values_value_in_range" CHECK ("policy_values"."value" = trunc("policy_values"."value")
        AND (("policy_values"."key" = 'cost_of_delay_months' AND "policy_values"."value" >= 1 AND "policy_values"."value" <= 24)
          OR ("policy_values"."key" = 'pack_ratification_institutions' AND "policy_values"."value" >= 1))),
	CONSTRAINT "policy_values_reason_stated" CHECK (char_length(btrim("policy_values"."reason")) >= 12)
);
--> statement-breakpoint
CREATE TABLE "roadmap_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_on" date NOT NULL,
	"owner_stated" text NOT NULL,
	"value_outcome_id" uuid,
	"stage" text,
	"status" "milestone_status" DEFAULT 'planned' NOT NULL,
	"done_evidence_id" uuid,
	"reason" text,
	"planned_by_person_id" uuid NOT NULL,
	"planned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supersedes_id" uuid,
	CONSTRAINT "roadmap_milestones_supersedes_key" UNIQUE("supersedes_id"),
	CONSTRAINT "roadmap_milestones_title_stated" CHECK (char_length(btrim("roadmap_milestones"."title")) >= 6),
	CONSTRAINT "roadmap_milestones_owner_stated" CHECK (char_length(btrim("roadmap_milestones"."owner_stated")) >= 3),
	CONSTRAINT "roadmap_milestones_stage_known" CHECK ("roadmap_milestones"."stage" IS NULL OR "roadmap_milestones"."stage" IN ('commit', 'measure', 'verify')),
	CONSTRAINT "roadmap_milestones_done_has_evidence" CHECK (("roadmap_milestones"."status" = 'done' AND "roadmap_milestones"."done_evidence_id" IS NOT NULL) OR ("roadmap_milestones"."status" <> 'done' AND "roadmap_milestones"."done_evidence_id" IS NULL)),
	CONSTRAINT "roadmap_milestones_change_says_why" CHECK ("roadmap_milestones"."supersedes_id" IS NULL OR ("roadmap_milestones"."reason" IS NOT NULL AND char_length(btrim("roadmap_milestones"."reason")) >= 12))
);
--> statement-breakpoint
ALTER TABLE "record_documents" ADD COLUMN "kind" text DEFAULT 'rendering' NOT NULL;--> statement-breakpoint
ALTER TABLE "record_documents" ADD COLUMN "lens" text;--> statement-breakpoint
ALTER TABLE "record_documents" ADD COLUMN "shared_with" text;--> statement-breakpoint
ALTER TABLE "lens_policies" ADD CONSTRAINT "lens_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_policies" ADD CONSTRAINT "lens_policies_ratified_by_person_id_persons_id_fk" FOREIGN KEY ("ratified_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_policies" ADD CONSTRAINT "lens_policies_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."lens_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monetization_rates" ADD CONSTRAINT "monetization_rates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monetization_rates" ADD CONSTRAINT "monetization_rates_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monetization_rates" ADD CONSTRAINT "monetization_rates_business_metric_id_business_metrics_id_fk" FOREIGN KEY ("business_metric_id") REFERENCES "public"."business_metrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monetization_rates" ADD CONSTRAINT "monetization_rates_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monetization_rates" ADD CONSTRAINT "monetization_rates_recorded_by_person_id_persons_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monetization_rates" ADD CONSTRAINT "monetization_rates_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."monetization_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_values" ADD CONSTRAINT "policy_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_values" ADD CONSTRAINT "policy_values_set_by_person_id_persons_id_fk" FOREIGN KEY ("set_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_values" ADD CONSTRAINT "policy_values_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."policy_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_done_evidence_id_evidence_id_fk" FOREIGN KEY ("done_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_planned_by_person_id_persons_id_fk" FOREIGN KEY ("planned_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "roadmap_milestones_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."roadmap_milestones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lens_policies_tenant_persona_idx" ON "lens_policies" USING btree ("tenant_id","persona");--> statement-breakpoint
CREATE UNIQUE INDEX "lens_policies_one_root" ON "lens_policies" USING btree ("tenant_id","persona") WHERE "lens_policies"."supersedes_id" IS NULL;--> statement-breakpoint
CREATE INDEX "monetization_rates_metric_idx" ON "monetization_rates" USING btree ("business_metric_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monetization_rates_one_root" ON "monetization_rates" USING btree ("institution_id","business_metric_id") WHERE "monetization_rates"."supersedes_id" IS NULL;--> statement-breakpoint
CREATE INDEX "policy_values_tenant_key_idx" ON "policy_values" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_values_one_root" ON "policy_values" USING btree ("tenant_id","key") WHERE "policy_values"."supersedes_id" IS NULL;--> statement-breakpoint
CREATE INDEX "roadmap_milestones_engagement_idx" ON "roadmap_milestones" USING btree ("engagement_id");--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_kind_known" CHECK ("record_documents"."kind" IN ('rendering', 'print_request', 'share_for_review'));--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_lens_known" CHECK ("record_documents"."lens" IS NULL OR "record_documents"."lens" IN ('cfo', 'general'));--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_kind_complete" CHECK (("record_documents"."kind" = 'rendering' AND "record_documents"."lens" IS NULL AND "record_documents"."shared_with" IS NULL)
        OR ("record_documents"."kind" = 'print_request' AND "record_documents"."lens" IS NOT NULL AND "record_documents"."shared_with" IS NULL AND "record_documents"."value_run_id" IS NOT NULL)
        OR ("record_documents"."kind" = 'share_for_review' AND "record_documents"."lens" IS NOT NULL AND "record_documents"."value_run_id" IS NOT NULL
            AND "record_documents"."shared_with" IS NOT NULL AND char_length(btrim("record_documents"."shared_with")) >= 3));