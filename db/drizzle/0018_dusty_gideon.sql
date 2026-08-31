-- ------------------------------------------------------------------
-- 2.0 item 5 — research_results
--
-- WHY THIS EXISTS: research intake is four stages — LVRF generates a
-- prompt, a human runs it in an AI agent, LVRF parses the response, and a
-- human accepts or rejects each field. Parsing and accepting produce
-- DIFFERENT FACTS — parsing establishes that the agent returned this;
-- accepting establishes that a person judged the citation checkable and
-- the value worth recording. Collapsing them would make pasting an act of
-- endorsement, and nobody could tell which fields a human actually looked
-- at.
--
-- A parsed field is not evidence. Evidence is a claim the system stands
-- behind. This table holds parsed fields until a person decides.
--
-- A REJECTED result is kept, not discarded. "We researched this and
-- rejected it" is a fact, and this system currently forgets everything it
-- declines — the same argument that produced the refusals table (0016).
--
-- THREE REVIEW STATES, NOT TWO: a field nobody has looked at is not
-- rejected. Same absent-versus-simulated distinction closed elsewhere in
-- this schema. This also makes review PER FIELD and partial — accept two,
-- reject one, leave three pending.
--
-- NO confidence column, deliberately. LVRF computes confidence from the
-- evidence ledger and never accepts an asserted one — an agent's
-- self-declared confidence has no place here.
--
-- SHAPE: insert-then-review, same family as refusals (0016) and
-- hardening_manifest (0017) — no deleted_at, no superseded_by_id, no
-- status, no version. A parse happened; that is a fact. Review state moves
-- a row from pending to accepted/rejected, but the row itself is never
-- retired or versioned — a correction is a new research pass, not an edit
-- here.
--
-- No writer and no parser yet. This migration only. hardening.sql adds
-- research_results_audit / _touch / _no_delete.
-- ------------------------------------------------------------------
CREATE TYPE "public"."research_review_state" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "research_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"business_metric_id" uuid,
	"research_query" text NOT NULL,
	"query_as_executed" text NOT NULL,
	"research_tool" text NOT NULL,
	"field_name" text NOT NULL,
	"found" boolean NOT NULL,
	"value" text,
	"citation" text,
	"not_found_reason" text,
	"raw_response" jsonb NOT NULL,
	"review_state" "research_review_state" DEFAULT 'pending' NOT NULL,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"evidence_id" uuid,
	"parsed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed_by_person_id" uuid NOT NULL,
	CONSTRAINT "research_results_review_is_complete" CHECK ("research_results"."review_state" = 'pending'
        OR ("research_results"."reviewed_by_person_id" IS NOT NULL AND "research_results"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "research_results_found_shape" CHECK (("research_results"."found" = true AND "research_results"."value" IS NOT NULL AND "research_results"."citation" IS NOT NULL)
        OR ("research_results"."found" = false AND "research_results"."not_found_reason" IS NOT NULL)),
	CONSTRAINT "research_results_accepted_has_evidence" CHECK ("research_results"."review_state" <> 'accepted' OR "research_results"."evidence_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_business_metric_id_business_metrics_id_fk" FOREIGN KEY ("business_metric_id") REFERENCES "public"."business_metrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_reviewed_by_person_id_persons_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_parsed_by_person_id_persons_id_fk" FOREIGN KEY ("parsed_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_results_tenant_idx" ON "research_results" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "research_results_institution_idx" ON "research_results" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "research_results_business_metric_idx" ON "research_results" USING btree ("business_metric_id");--> statement-breakpoint
CREATE INDEX "research_results_review_state_idx" ON "research_results" USING btree ("review_state");