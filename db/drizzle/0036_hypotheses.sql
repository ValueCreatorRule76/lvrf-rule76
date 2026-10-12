-- ------------------------------------------------------------------
-- O2 (Outputs band, LVRF_PLAN §5; O2-D1–D4): value hypotheses, executive
-- summaries, reference-example markers. drizzle-kit's own output; no hand
-- edit.
--
-- WHAT IT CHANGES. Additive: three enums, three new tables.
--   value_hypotheses           governed; frozen after INSERT; the falsifier's
--                              reference value copied by the database; no
--                              direction column, no stored verdict
--                              (lvrf_hypothesis_verdict, hardening section 22)
--   executive_summaries        append-only versions, author = the actor
--   reference_example_markers  governed, steward-set, one current per account
-- hardening.sql section 22 also adds value_outcomes_verifier_not_author on
-- an EXISTING table: from then on, a person who wrote a hypothesis on an
-- outcome cannot be recorded as that outcome's verifier.
-- WHAT IT COULD ORPHAN. Nothing: no existing row is rewritten. BACK UP FIRST
-- (CLAUDE.md rule 8).
-- Triggers 111 -> 126 after hardening.sql.
-- ------------------------------------------------------------------
CREATE TYPE "public"."falsifier_reference" AS ENUM('baseline', 'committed_target');--> statement-breakpoint
CREATE TYPE "public"."reference_example_kind" AS ENUM('published_case_study', 'demonstration');--> statement-breakpoint
CREATE TYPE "public"."summary_lens" AS ENUM('cfo', 'chro', 'board', 'general');--> statement-breakpoint
CREATE TABLE "executive_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"value_run_id" uuid,
	"lens" "summary_lens" NOT NULL,
	"body" text NOT NULL,
	"author_person_id" uuid NOT NULL,
	"drafted_with_ai" boolean NOT NULL,
	"drafting_tool" text,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executive_summaries_supersedes_key" UNIQUE("supersedes_id"),
	CONSTRAINT "executive_summaries_body_stated" CHECK (length(btrim("executive_summaries"."body")) >= 40),
	CONSTRAINT "executive_summaries_ai_disclosed" CHECK (("executive_summaries"."drafted_with_ai" AND "executive_summaries"."drafting_tool" IS NOT NULL AND length(btrim("executive_summaries"."drafting_tool")) >= 2)
        OR (NOT "executive_summaries"."drafted_with_ai" AND "executive_summaries"."drafting_tool" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "reference_example_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"kind" "reference_example_kind" NOT NULL,
	"source_citation" text NOT NULL,
	"note" text NOT NULL,
	"marked_by_person_id" uuid NOT NULL,
	"retired_by_person_id" uuid,
	"retirement_reason" text,
	"supersession_reason" text,
	"status" "lifecycle_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reference_example_markers_stated" CHECK (length(btrim("reference_example_markers"."source_citation")) >= 12 AND length(btrim("reference_example_markers"."note")) >= 12),
	CONSTRAINT "reference_example_markers_retirement_is_complete" CHECK (("reference_example_markers"."deleted_at" IS NULL AND "reference_example_markers"."retired_by_person_id" IS NULL AND "reference_example_markers"."retirement_reason" IS NULL AND "reference_example_markers"."status" <> 'retired')
        OR ("reference_example_markers"."deleted_at" IS NOT NULL AND "reference_example_markers"."status" = 'retired' AND "reference_example_markers"."retired_by_person_id" IS NOT NULL
            AND char_length(btrim("reference_example_markers"."retirement_reason")) >= 12)),
	CONSTRAINT "reference_example_markers_supersession_reason" CHECK (("reference_example_markers"."superseded_by_id" IS NULL) = ("reference_example_markers"."supersession_reason" IS NULL)
        AND ("reference_example_markers"."supersession_reason" IS NULL OR length(btrim("reference_example_markers"."supersession_reason")) >= 12))
);
--> statement-breakpoint
CREATE TABLE "value_hypotheses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"value_outcome_id" uuid NOT NULL,
	"value_lever_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"falsifier_reference" "falsifier_reference" NOT NULL,
	"falsifier_due" date NOT NULL,
	"falsifier_conditions" text DEFAULT '' NOT NULL,
	"reference_value" numeric(18, 4) NOT NULL,
	"reference_recorded_at" timestamp with time zone NOT NULL,
	"post_hoc" boolean DEFAULT false NOT NULL,
	"author_person_id" uuid NOT NULL,
	"retired_by_person_id" uuid,
	"retirement_reason" text,
	"supersession_reason" text,
	"status" "lifecycle_status" DEFAULT 'proposed' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "value_hypotheses_statement_stated" CHECK (length(btrim("value_hypotheses"."statement")) >= 24),
	CONSTRAINT "value_hypotheses_conditions_no_digits" CHECK ("value_hypotheses"."falsifier_conditions" !~ '[0-9]'),
	CONSTRAINT "value_hypotheses_retirement_is_complete" CHECK (("value_hypotheses"."deleted_at" IS NULL AND "value_hypotheses"."retired_by_person_id" IS NULL AND "value_hypotheses"."retirement_reason" IS NULL AND "value_hypotheses"."status" <> 'retired')
        OR ("value_hypotheses"."deleted_at" IS NOT NULL AND "value_hypotheses"."status" = 'retired' AND "value_hypotheses"."retired_by_person_id" IS NOT NULL
            AND char_length(btrim("value_hypotheses"."retirement_reason")) >= 12)),
	CONSTRAINT "value_hypotheses_supersession_reason" CHECK (("value_hypotheses"."superseded_by_id" IS NULL) = ("value_hypotheses"."supersession_reason" IS NULL)
        AND ("value_hypotheses"."supersession_reason" IS NULL OR length(btrim("value_hypotheses"."supersession_reason")) >= 12))
);
--> statement-breakpoint
ALTER TABLE "executive_summaries" ADD CONSTRAINT "executive_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_summaries" ADD CONSTRAINT "executive_summaries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_summaries" ADD CONSTRAINT "executive_summaries_value_run_id_value_runs_id_fk" FOREIGN KEY ("value_run_id") REFERENCES "public"."value_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_summaries" ADD CONSTRAINT "executive_summaries_author_person_id_persons_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executive_summaries" ADD CONSTRAINT "executive_summaries_supersedes_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."executive_summaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_example_markers" ADD CONSTRAINT "reference_example_markers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_example_markers" ADD CONSTRAINT "reference_example_markers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_example_markers" ADD CONSTRAINT "reference_example_markers_marked_by_person_id_persons_id_fk" FOREIGN KEY ("marked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_example_markers" ADD CONSTRAINT "reference_example_markers_retired_by_person_id_persons_id_fk" FOREIGN KEY ("retired_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_example_markers" ADD CONSTRAINT "reference_example_markers_steward_person_id_persons_id_fk" FOREIGN KEY ("steward_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_example_markers" ADD CONSTRAINT "reference_example_markers_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."reference_example_markers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_value_lever_id_value_levers_id_fk" FOREIGN KEY ("value_lever_id") REFERENCES "public"."value_levers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_author_person_id_persons_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_retired_by_person_id_persons_id_fk" FOREIGN KEY ("retired_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_steward_person_id_persons_id_fk" FOREIGN KEY ("steward_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."value_hypotheses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "executive_summaries_institution_idx" ON "executive_summaries" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "reference_example_markers_institution_idx" ON "reference_example_markers" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "value_hypotheses_institution_idx" ON "value_hypotheses" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "value_hypotheses_outcome_idx" ON "value_hypotheses" USING btree ("value_outcome_id");