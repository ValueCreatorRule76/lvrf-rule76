-- ------------------------------------------------------------------
-- 2.0 item 2, part A — refusals
--
-- WHY THIS EXISTS: a refusal is the system exercising authority, and
-- authority exercised without record is what constitutions exist to
-- prevent. audit_log captures every successful write; heartbeat_events
-- records what the institution owes itself; record_documents are
-- immutable. A refusal — arguably the most informative event this system
-- produces — currently leaves nothing. The transaction rolls back and the
-- attempt is forgotten.
--
-- Someone offered vendor-published evidence as a measured actual on 25
-- August. The gate refused, correctly, and the system then behaved as
-- though the offer had never been made. That is the record forgetting
-- something true.
--
-- WHY NOT audit_log: audit_log records state CHANGES — it carries old_row
-- and new_row, and a refusal has neither. An audit log containing things
-- that did not happen stops being an audit log. Its guarantee today is
-- that every row is a change that occurred.
--
-- SHAPE: same as record_documents — no deleted_at, no superseded_by_id, no
-- status, no version. A refusal is a FACT, not a claim. It cannot be
-- retired, superseded or corrected. Nothing supersedes something that
-- happened.
--
-- LIMITATION: this records refusals arriving through an ENDPOINT. A
-- refusal raised in a psql session — as every gate test to date has been —
-- leaves nothing. The trigger raises and no application is listening. Do
-- not describe this as complete coverage.
--
-- No writer yet. This migration only. hardening.sql adds refusals_no_delete.
-- ------------------------------------------------------------------
CREATE TABLE "refusals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid,
	"actor_person_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" text,
	"sqlstate" text NOT NULL,
	"constraint_name" text,
	"message" text NOT NULL,
	"attempted_payload" jsonb NOT NULL,
	"refused_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_actor_person_id_persons_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refusals_tenant_idx" ON "refusals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "refusals_subject_idx" ON "refusals" USING btree ("subject_table","subject_id");--> statement-breakpoint
CREATE INDEX "refusals_refused_at_idx" ON "refusals" USING btree ("refused_at");