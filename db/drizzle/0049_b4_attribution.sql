-- B4 (LVRF_PLAN §14, approved by Brad 5 Nov 2026; design §3.2, ruling 2, D1-D3). Changes: value_outcomes gains
-- attribution_method and measure_class (nullable: a commitment made before B4 keeps none, D1; hardening section 34 requires
-- both at a new commit and fixes them after it); outcome_withdrawals (insert-only) keeps the values of a measurement or a
-- commitment the steward withdraws (D3). Rewrites no row, drops nothing, orphans nothing.
CREATE TYPE "public"."attribution_method" AS ENUM('control_group', 'comparison_group', 'trend_adjusted', 'estimate_adjusted', 'contribution_only');--> statement-breakpoint
CREATE TYPE "public"."measure_class" AS ENUM('capability_performance', 'compliance_assurance');--> statement-breakpoint
CREATE TABLE "outcome_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"value_outcome_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"withdrawn_values" jsonb NOT NULL,
	"reason" text NOT NULL,
	"withdrawn_by_person_id" uuid NOT NULL,
	"withdrawn_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_withdrawals_kind_known" CHECK ("outcome_withdrawals"."kind" IN ('measurement', 'commitment')),
	CONSTRAINT "outcome_withdrawals_values_kept" CHECK (jsonb_typeof("outcome_withdrawals"."withdrawn_values") = 'object' AND "outcome_withdrawals"."withdrawn_values" <> '{}'::jsonb),
	CONSTRAINT "outcome_withdrawals_reason_stated" CHECK (char_length(btrim("outcome_withdrawals"."reason")) >= 12)
);
--> statement-breakpoint
ALTER TABLE "value_outcomes" ADD COLUMN "attribution_method" "attribution_method";--> statement-breakpoint
ALTER TABLE "value_outcomes" ADD COLUMN "measure_class" "measure_class";--> statement-breakpoint
ALTER TABLE "outcome_withdrawals" ADD CONSTRAINT "outcome_withdrawals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_withdrawals" ADD CONSTRAINT "outcome_withdrawals_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_withdrawals" ADD CONSTRAINT "outcome_withdrawals_withdrawn_by_person_id_persons_id_fk" FOREIGN KEY ("withdrawn_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outcome_withdrawals_outcome_idx" ON "outcome_withdrawals" USING btree ("value_outcome_id");