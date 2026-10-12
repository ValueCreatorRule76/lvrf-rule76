-- ------------------------------------------------------------------
-- Q4h (3.0 item 6, account research intake, with the minimum of items 3
-- and 4, and L8). Plan: docs/LVRF_PLAN.md §4e. drizzle-kit's own output;
-- no hand edit.
--
-- WHAT IT CHANGES. Additive or widening:
--   institution_entities   NEW, governed (hardening.sql adds it to the
--                          governed and supersession loops, and section 19's
--                          deferred one-current trigger: triggers 98 -> 103):
--                          the pinned entity — legal name and one identifier,
--                          its evidence; corrected by supersession, with a
--                          reason (institution_entities_supersession_reason).
--                          One current per account is enforced at COMMIT by
--                          that trigger, not by a partial unique index, so a
--                          correction can insert the successor before
--                          pointing the old row at it.
--   institution_facts      CHECK institution_facts_regime_shape: a
--                          disclosure_regime fact is one of four labels.
--   research_prompts       industry_id becomes nullable; institution_id and
--                          phase and entity_id added; CHECK
--                          research_prompts_subject_shape (a pack prompt names
--                          an industry; an account prompt an account and a
--                          phase, and a facts prompt its entity). Every existing
--                          row is an industry_measure prompt, so it holds.
--   research_results       institution_fact_id, institution_entity_id (FKs);
--                          kind_shape, found_shape and accepted_has_record
--                          each gain an institution_fact branch (dropped and
--                          re-added; the existing branches are unchanged).
--   refusals               source ('database' | 'parser', default database);
--                          sqlstate becomes nullable, required for database
--                          (refusals_source_shape) — L8: parse refusals on
--                          record. Every existing row is a database refusal.
-- WHAT IT COULD ORPHAN. Nothing. BACK UP FIRST (CLAUDE.md rule 8).
-- ------------------------------------------------------------------
CREATE TYPE "public"."entity_identifier_type" AS ENUM('sec_cik', 'ticker', 'registry');--> statement-breakpoint
CREATE TYPE "public"."refusal_source" AS ENUM('database', 'parser');--> statement-breakpoint
CREATE TYPE "public"."research_prompt_phase" AS ENUM('entity', 'facts');--> statement-breakpoint
CREATE TABLE "institution_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"identifier_type" "entity_identifier_type" NOT NULL,
	"identifier" text NOT NULL,
	"registry_jurisdiction" text,
	"evidence_id" uuid NOT NULL,
	"captured_by_person_id" uuid NOT NULL,
	"supersession_reason" text,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "institution_entities_evidence_key" UNIQUE("evidence_id"),
	CONSTRAINT "institution_entities_supersession_reason" CHECK (("institution_entities"."superseded_by_id" IS NULL) = ("institution_entities"."supersession_reason" IS NULL)
        AND ("institution_entities"."supersession_reason" IS NULL OR length(btrim("institution_entities"."supersession_reason")) >= 12)),
	CONSTRAINT "institution_entities_identifier_shape" CHECK (btrim("institution_entities"."legal_name") <> '' AND btrim("institution_entities"."identifier") <> ''
        AND ("institution_entities"."identifier_type" <> 'registry' OR ("institution_entities"."registry_jurisdiction" IS NOT NULL AND btrim("institution_entities"."registry_jurisdiction") <> ''))
        AND ("institution_entities"."identifier_type" = 'registry' OR "institution_entities"."registry_jurisdiction" IS NULL)
        AND ("institution_entities"."identifier_type" <> 'sec_cik' OR "institution_entities"."identifier" ~ '^[0-9]{10}$'))
);
--> statement-breakpoint
ALTER TABLE "research_results" DROP CONSTRAINT "research_results_kind_shape";--> statement-breakpoint
ALTER TABLE "research_results" DROP CONSTRAINT "research_results_found_shape";--> statement-breakpoint
ALTER TABLE "research_results" DROP CONSTRAINT "research_results_accepted_has_record";--> statement-breakpoint
ALTER TABLE "refusals" ALTER COLUMN "sqlstate" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "research_prompts" ALTER COLUMN "industry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "refusals" ADD COLUMN "source" "refusal_source" DEFAULT 'database' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_prompts" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "research_prompts" ADD COLUMN "phase" "research_prompt_phase";--> statement-breakpoint
ALTER TABLE "research_prompts" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "institution_fact_id" uuid;--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "institution_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "institution_entities" ADD CONSTRAINT "institution_entities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_entities" ADD CONSTRAINT "institution_entities_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_entities" ADD CONSTRAINT "institution_entities_captured_by_person_id_persons_id_fk" FOREIGN KEY ("captured_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_entities" ADD CONSTRAINT "institution_entities_steward_person_id_persons_id_fk" FOREIGN KEY ("steward_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_entities" ADD CONSTRAINT "institution_entities_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."institution_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_prompts" ADD CONSTRAINT "research_prompts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_prompts" ADD CONSTRAINT "research_prompts_entity_id_institution_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."institution_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_institution_fact_id_institution_facts_id_fk" FOREIGN KEY ("institution_fact_id") REFERENCES "public"."institution_facts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_institution_entity_id_institution_entities_id_fk" FOREIGN KEY ("institution_entity_id") REFERENCES "public"."institution_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_prompts_institution_idx" ON "research_prompts" USING btree ("institution_id");--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_regime_shape" CHECK ("institution_facts"."kind"::text <> 'disclosure_regime'
        OR ("institution_facts"."value_text" IN ('public_filer', 'private', 'subsidiary_of_filer', 'public_sector')
            AND "institution_facts"."value_numeric" IS NULL AND "institution_facts"."unit" IS NULL));--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_source_shape" CHECK ("refusals"."source" = 'parser' OR "refusals"."sqlstate" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "research_prompts" ADD CONSTRAINT "research_prompts_subject_shape" CHECK (("research_prompts"."result_kind"::text = 'industry_measure' AND "research_prompts"."industry_id" IS NOT NULL AND "research_prompts"."institution_id" IS NULL AND "research_prompts"."phase" IS NULL)
        OR ("research_prompts"."result_kind"::text = 'institution_fact' AND "research_prompts"."institution_id" IS NOT NULL AND "research_prompts"."industry_id" IS NULL AND "research_prompts"."phase" IS NOT NULL
            AND (("research_prompts"."phase" = 'facts') = ("research_prompts"."entity_id" IS NOT NULL))));--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_kind_shape" CHECK (("research_results"."result_kind" = 'metric_value'
           AND "research_results"."institution_id" IS NOT NULL
           AND "research_results"."industry_id" IS NULL)
        OR ("research_results"."result_kind" = 'industry_measure'
           AND "research_results"."industry_id" IS NOT NULL
           AND "research_results"."institution_id" IS NULL
           AND "research_results"."business_metric_id" IS NULL)
        OR ("research_results"."result_kind"::text = 'institution_fact'
           AND "research_results"."institution_id" IS NOT NULL
           AND "research_results"."industry_id" IS NULL
           AND "research_results"."business_metric_id" IS NULL
           AND "research_results"."industry_measures_id" IS NULL));--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_found_shape" CHECK (("research_results"."found" = false AND "research_results"."not_found_reason" IS NOT NULL)
        OR ("research_results"."found" = true AND "research_results"."result_kind" = 'metric_value'
              AND "research_results"."value" IS NOT NULL AND "research_results"."citation" IS NOT NULL)
        OR ("research_results"."found" = true AND "research_results"."result_kind" = 'industry_measure'
              AND "research_results"."value" IS NULL AND "research_results"."citation" IS NULL)
        OR ("research_results"."found" = true AND "research_results"."result_kind"::text = 'institution_fact'
              AND "research_results"."value" IS NULL AND "research_results"."citation" IS NULL));--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_accepted_has_record" CHECK ("research_results"."review_state" <> 'accepted'
        OR ("research_results"."result_kind" = 'metric_value'
              AND "research_results"."evidence_id" IS NOT NULL AND "research_results"."industry_measures_id" IS NULL)
        OR ("research_results"."result_kind" = 'industry_measure'
              AND "research_results"."industry_measures_id" IS NOT NULL AND "research_results"."evidence_id" IS NULL)
        OR ("research_results"."result_kind"::text = 'institution_fact' AND "research_results"."found" = false
              AND "research_results"."evidence_id" IS NULL AND "research_results"."institution_fact_id" IS NULL AND "research_results"."institution_entity_id" IS NULL)
        OR ("research_results"."result_kind"::text = 'institution_fact' AND "research_results"."found" = true AND "research_results"."evidence_id" IS NOT NULL
              AND (("research_results"."institution_fact_id" IS NOT NULL) <> ("research_results"."institution_entity_id" IS NOT NULL))));