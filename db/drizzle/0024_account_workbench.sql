-- ------------------------------------------------------------------
-- Account workbench — institutions.website and institution_facts.
-- Value spine stage: baseline.
--
-- WHAT IT CHANGES. Additive only:
--   - institutions.website: nullable text, CHECK institutions_website_is_url
--     (http(s), no whitespace). Every existing row gets NULL, which the
--     CHECK permits. No backfill: a guessed website is an assertion.
--   - institution_fact_kind enum and the institution_facts table: revenue,
--     headcount, stated priorities and systems, each backed by exactly one
--     evidence row (evidence_id NOT NULL UNIQUE). See db/schema.ts's
--     institutionFacts comment for why provenance lives in evidence and not
--     in new columns here.
--
-- WHAT IT COULD ORPHAN. Nothing. No column is dropped, renamed or
-- retyped; no existing row is touched. The new table is empty and every FK
-- out of it is ON DELETE RESTRICT.
--
-- NOT IN THIS FILE: triggers. db/hardening.sql adds institution_facts to
-- its governed loop (_audit, _touch, _no_delete) and to the supersession
-- loop (_supersession_sane). Trigger count 78 -> 82. Re-run hardening.sql
-- immediately after this migration — a migrated database without it has
-- an ungoverned table (LVRF_Local_Setup.md, "FINDING").
--
-- BACK UP FIRST (CLAUDE.md rule 8): pg_dump -Fc before applying this
-- anywhere there is data.
--
-- Generated with drizzle-kit's generateMigration against 0023's snapshot
-- (the CLI could not be run in the authoring environment); statements are
-- drizzle-kit's own output, unedited.
-- ------------------------------------------------------------------
CREATE TYPE "public"."institution_fact_kind" AS ENUM('revenue', 'headcount', 'stated_priority', 'system');
--> statement-breakpoint
CREATE TABLE "institution_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"kind" "institution_fact_kind" NOT NULL,
	"value_numeric" numeric,
	"value_text" text,
	"unit" text,
	"as_of" date NOT NULL,
	"evidence_id" uuid NOT NULL,
	"captured_by_person_id" uuid NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "institution_facts_evidence_key" UNIQUE("evidence_id"),
	CONSTRAINT "institution_facts_numeric_shape" CHECK ("institution_facts"."kind" NOT IN ('revenue', 'headcount')
        OR ("institution_facts"."value_numeric" IS NOT NULL AND "institution_facts"."value_numeric" >= 0 AND "institution_facts"."value_text" IS NULL)),
	CONSTRAINT "institution_facts_text_shape" CHECK ("institution_facts"."kind" NOT IN ('stated_priority', 'system')
        OR ("institution_facts"."value_text" IS NOT NULL AND btrim("institution_facts"."value_text") <> ''
            AND "institution_facts"."value_numeric" IS NULL AND "institution_facts"."unit" IS NULL)),
	CONSTRAINT "institution_facts_revenue_currency" CHECK ("institution_facts"."kind" <> 'revenue' OR "institution_facts"."unit" ~ '^[A-Z]{3}$'),
	CONSTRAINT "institution_facts_headcount_whole_people" CHECK ("institution_facts"."kind" <> 'headcount'
        OR ("institution_facts"."unit" = 'people' AND "institution_facts"."value_numeric" = trunc("institution_facts"."value_numeric")))
);
--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "website" text;
--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_captured_by_person_id_persons_id_fk" FOREIGN KEY ("captured_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_steward_person_id_persons_id_fk" FOREIGN KEY ("steward_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."institution_facts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "institution_facts_institution_idx" ON "institution_facts" USING btree ("institution_id");
--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_website_is_url" CHECK ("institutions"."website" IS NULL OR "institutions"."website" ~ '^https?://[^[:space:]]+$');
