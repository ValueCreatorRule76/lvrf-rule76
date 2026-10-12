-- ------------------------------------------------------------------
-- Q4b (first step of 3.0 Band B): research prompts, and results that name
-- the prompt they answered.
--
-- WHAT IT CHANGES. Additive:
--   research_prompts   a generated prompt, immutable (hardening.sql section
--                      18: _audit, _no_delete, _immutable); its SHA-256 is
--                      held to its text by a CHECK.
--   research_results   prompt_id (FK) and contract_version, both or neither;
--                      prompt_tracked — FALSE on every row that exists now
--                      (they predate prompt tracking and are left as they
--                      are; nothing is back-filled), TRUE by default after,
--                      so every new result must name its prompt
--                      (research_results_prompt_named).
--   THE CUT-OFF        research_results_untracked_predates_prompts: an
--                      untracked row must have parsed_at before
--                      2026-10-12 00:00:00+00 — a literal, fixed when this
--                      file was written, after the 13 legacy rows on prod
--                      (the newest parsed 10 Oct 2026). parsed_at is stamped
--                      on INSERT and frozen on UPDATE by research_results_
--                      touch (hardening.sql section 10), so no new row, even
--                      by direct SQL, can claim to predate prompt tracking.
--                      If any existing row were parsed at or after the
--                      cut-off, this CHECK fails and the migration stops.
--
-- ONE HAND EDIT to drizzle-kit's output, on purpose: drizzle wrote
-- prompt_tracked as "DEFAULT true NOT NULL", which would mark the existing
-- rows tracked and fail the CHECK. It is added "DEFAULT false NOT NULL" —
-- so existing rows get false — then the default is set to true. The end
-- state is what the snapshot says (default true). Every other statement is
-- drizzle-kit's own (`drizzle-kit generate --name research_prompts`).
--
-- WHAT IT COULD ORPHAN. Nothing. Prod: 13 research_results, all accepted,
-- none pending (11 Oct 2026). Triggers 95 -> 98 after hardening.sql.
-- BACK UP FIRST (CLAUDE.md rule 8).
-- ------------------------------------------------------------------
CREATE TABLE "research_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"result_kind" "research_result_kind" NOT NULL,
	"contract_version" integer NOT NULL,
	"template_version" integer NOT NULL,
	"prompt_text" text NOT NULL,
	"prompt_sha256" text NOT NULL,
	"listed_measure_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"listed_exclusion_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by_person_id" uuid NOT NULL,
	CONSTRAINT "research_prompts_versions_positive" CHECK ("research_prompts"."contract_version" > 0 AND "research_prompts"."template_version" > 0),
	CONSTRAINT "research_prompts_sha256_is_the_text" CHECK ("research_prompts"."prompt_sha256" = encode(sha256(convert_to("research_prompts"."prompt_text", 'UTF8')), 'hex'))
);
--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "prompt_id" uuid;--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "contract_version" integer;--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "prompt_tracked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "research_results" ALTER COLUMN "prompt_tracked" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "research_prompts" ADD CONSTRAINT "research_prompts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_prompts" ADD CONSTRAINT "research_prompts_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_prompts" ADD CONSTRAINT "research_prompts_generated_by_person_id_persons_id_fk" FOREIGN KEY ("generated_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_prompts_industry_idx" ON "research_prompts" USING btree ("industry_id");--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_prompt_id_research_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."research_prompts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_prompt_named" CHECK ((("research_results"."prompt_id" IS NULL) = ("research_results"."contract_version" IS NULL))
        AND (NOT "research_results"."prompt_tracked" OR "research_results"."prompt_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_untracked_predates_prompts" CHECK ("research_results"."prompt_tracked" OR "research_results"."parsed_at" < '2026-10-12 00:00:00+00'::timestamptz);