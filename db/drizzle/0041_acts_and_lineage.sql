-- ------------------------------------------------------------------
-- P2 (LVRF_PLAN §10; design §2.4/§5.1; P2-D1–D8 ruled by Brad, 25 Oct 2026).
-- Adds enum governance_act, governance_acts (append-only, one row per act,
-- keyed to its transaction) and research_imports (the whole pasted text and
-- its SHA-256), and research_results.import_id (required from the cutover,
-- 25 Oct 2026 00:00 UTC; every earlier result keeps NULL).
-- Orphans nothing: no row is changed or deleted, no FK is dropped.
-- ------------------------------------------------------------------
CREATE TYPE "public"."governance_act" AS ENUM('import', 'validate', 'approve', 'certify', 'activate', 'supersede', 'verify', 'attest', 'open_citation', 'accept', 'reject', 'withdraw', 'ratify', 'demote', 'commit', 'measure', 'lock', 'retire', 'exclude', 'mark', 'link', 'correct', 'record_erratum');--> statement-breakpoint
CREATE TABLE "governance_acts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"act" "governance_act" NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"result_table" text,
	"result_id" uuid,
	"evidence_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"actor_person_id" uuid NOT NULL,
	"reason" text,
	"route" text NOT NULL,
	"txid" bigint DEFAULT txid_current() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governance_acts_result_complete" CHECK (("governance_acts"."result_table" IS NULL) = ("governance_acts"."result_id" IS NULL)),
	CONSTRAINT "governance_acts_reason_stated" CHECK ("governance_acts"."reason" IS NULL OR length(btrim("governance_acts"."reason")) > 0),
	CONSTRAINT "governance_acts_route_is_a_pattern" CHECK ("governance_acts"."route" ~ '^(POST|PUT|PATCH|DELETE) /api/[A-Za-z0-9/:_-]+$' AND "governance_acts"."route" !~ '[0-9a-f]{8}-[0-9a-f]{4}')
);
--> statement-breakpoint
CREATE TABLE "research_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"raw_sha256" text NOT NULL,
	"byte_length" integer NOT NULL,
	"imported_by_person_id" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_imports_sha256_is_the_text" CHECK ("research_imports"."raw_sha256" = encode(sha256(convert_to("research_imports"."raw_text", 'UTF8')), 'hex')),
	CONSTRAINT "research_imports_size" CHECK ("research_imports"."byte_length" = octet_length("research_imports"."raw_text") AND "research_imports"."byte_length" BETWEEN 1 AND 524288)
);
--> statement-breakpoint
ALTER TABLE "research_results" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "governance_acts" ADD CONSTRAINT "governance_acts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_acts" ADD CONSTRAINT "governance_acts_actor_person_id_persons_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_imports" ADD CONSTRAINT "research_imports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_imports" ADD CONSTRAINT "research_imports_prompt_id_research_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."research_prompts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_imports" ADD CONSTRAINT "research_imports_imported_by_person_id_persons_id_fk" FOREIGN KEY ("imported_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "governance_acts_txid_idx" ON "governance_acts" USING btree ("txid","subject_table","subject_id");--> statement-breakpoint
CREATE INDEX "governance_acts_subject_idx" ON "governance_acts" USING btree ("subject_table","subject_id");--> statement-breakpoint
CREATE INDEX "governance_acts_result_idx" ON "governance_acts" USING btree ("result_table","result_id");--> statement-breakpoint
CREATE INDEX "research_imports_prompt_idx" ON "research_imports" USING btree ("prompt_id");--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_import_id_research_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."research_imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_import_after_cutover" CHECK ("research_results"."import_id" IS NOT NULL OR "research_results"."parsed_at" < '2026-10-25 00:00:00+00'::timestamptz);