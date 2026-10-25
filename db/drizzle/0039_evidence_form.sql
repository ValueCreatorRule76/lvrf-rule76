CREATE TYPE "public"."evidence_form" AS ENUM('quote', 'locator', 'statement', 'legacy');--> statement-breakpoint
CREATE TYPE "public"."figure_check_result" AS ENUM('pass', 'flag', 'not_checkable');--> statement-breakpoint
CREATE TABLE "figure_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_field" text NOT NULL,
	"value_checked" text,
	"numbers_in_value" jsonb NOT NULL,
	"numbers_found" jsonb NOT NULL,
	"numbers_missing" jsonb NOT NULL,
	"wording_flags" jsonb NOT NULL,
	"result" "figure_check_result" NOT NULL,
	"detail" text NOT NULL,
	"rules_version" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_by_person_id" uuid NOT NULL,
	CONSTRAINT "figure_checks_subject_shape" CHECK (("figure_checks"."subject_table" = 'institution_facts' AND "figure_checks"."subject_field" IN ('value_numeric', 'value_text'))
        OR ("figure_checks"."subject_table" = 'value_outcomes' AND "figure_checks"."subject_field" IN ('baseline_value', 'actual_value', 'claimed_currency_impact'))),
	CONSTRAINT "figure_checks_rules_version_positive" CHECK ("figure_checks"."rules_version" > 0),
	CONSTRAINT "figure_checks_arrays" CHECK (jsonb_typeof("figure_checks"."numbers_in_value") = 'array' AND jsonb_typeof("figure_checks"."numbers_found") = 'array'
        AND jsonb_typeof("figure_checks"."numbers_missing") = 'array' AND jsonb_typeof("figure_checks"."wording_flags") = 'array'),
	CONSTRAINT "figure_checks_result_shape" CHECK (("figure_checks"."result" = 'pass' AND "figure_checks"."value_checked" IS NOT NULL AND "figure_checks"."numbers_missing" = '[]'::jsonb AND "figure_checks"."wording_flags" = '[]'::jsonb)
        OR ("figure_checks"."result" = 'flag' AND "figure_checks"."value_checked" IS NOT NULL AND ("figure_checks"."numbers_missing" <> '[]'::jsonb OR "figure_checks"."wording_flags" <> '[]'::jsonb))
        OR ("figure_checks"."result" = 'not_checkable' AND "figure_checks"."numbers_found" = '[]'::jsonb AND "figure_checks"."numbers_missing" = '[]'::jsonb AND "figure_checks"."wording_flags" = '[]'::jsonb)),
	CONSTRAINT "figure_checks_detail_present" CHECK (btrim("figure_checks"."detail") <> '')
);
--> statement-breakpoint
-- ------------------------------------------------------------------
-- Edited by hand (P1, LVRF_PLAN §8). Every row that exists before this
-- migration is "legacy" (P1-D6: it stays legacy; nothing is backfilled to
-- another form by script). ADD COLUMN ... DEFAULT fills the existing rows
-- in the catalog without an UPDATE: no audit or touch trigger fires and no
-- row's updated_at changes. The default is then dropped, so a new row must
-- state its form (NOT NULL), and lvrf_evidence_form_guard (hardening.sql
-- section 25) refuses "legacy" on INSERT. Nothing is orphaned: no FK is
-- dropped and no row is deleted.
-- ------------------------------------------------------------------
ALTER TABLE "evidence" ADD COLUMN "evidence_form" "evidence_form" DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "evidence_form" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "quote_text" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "locator" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "how_read" text;--> statement-breakpoint
ALTER TABLE "figure_checks" ADD CONSTRAINT "figure_checks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_checks" ADD CONSTRAINT "figure_checks_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figure_checks" ADD CONSTRAINT "figure_checks_checked_by_person_id_persons_id_fk" FOREIGN KEY ("checked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "figure_checks_evidence_idx" ON "figure_checks" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "figure_checks_subject_idx" ON "figure_checks" USING btree ("subject_table","subject_id");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_form_shape" CHECK (("evidence"."evidence_form" = 'quote' AND "evidence"."locator" IS NULL AND "evidence"."quote_text" IS NOT NULL
          AND btrim("evidence"."quote_text") <> ''
          AND array_length(regexp_split_to_array(btrim("evidence"."quote_text"), '[[:space:]]+'), 1) <= 40)
        OR ("evidence"."evidence_form" = 'locator' AND "evidence"."quote_text" IS NULL AND "evidence"."locator" IS NOT NULL
          AND coalesce(jsonb_typeof("evidence"."locator"), '') = 'object'
          AND coalesce(jsonb_typeof("evidence"."locator" -> 'document'), '') = 'string' AND coalesce(btrim("evidence"."locator" ->> 'document'), '') <> ''
          AND coalesce(jsonb_typeof("evidence"."locator" -> 'value'), '') = 'number'
          AND coalesce("evidence"."locator" ->> 'scale', '') IN ('units', 'thousands', 'millions', 'billions', 'percent')
          AND ("evidence"."locator" - ARRAY['document', 'value', 'scale', 'table', 'row', 'column']) = '{}'::jsonb)
        OR ("evidence"."evidence_form" = 'statement' AND "evidence"."quote_text" IS NULL AND "evidence"."locator" IS NULL
          AND ("evidence"."kind" = 'attestation' OR ("evidence"."kind" = 'observation' AND "evidence"."source_reference" IS NULL)))
        OR ("evidence"."evidence_form" = 'legacy' AND "evidence"."quote_text" IS NULL AND "evidence"."locator" IS NULL));--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_how_read" CHECK (("evidence"."evidence_form" IN ('quote', 'locator') AND "evidence"."how_read" IS NOT NULL AND length(btrim("evidence"."how_read")) >= 24)
        OR ("evidence"."evidence_form" IN ('statement', 'legacy') AND "evidence"."how_read" IS NULL));