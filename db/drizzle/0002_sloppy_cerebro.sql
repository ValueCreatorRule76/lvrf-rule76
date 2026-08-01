CREATE TABLE "value_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"run_number" integer NOT NULL,
	"terminal_value_stage" "value_stage" NOT NULL,
	"confidence_score" numeric(5, 1) NOT NULL,
	"confidence_band" "confidence_level" NOT NULL,
	"institutional_health" numeric(5, 1),
	"health_band" "health_state",
	"health_coverage_pct" integer,
	"locked_at" timestamp with time zone,
	"locked_by_person_id" uuid,
	"lock_reason" text,
	"supersedes_run_id" uuid,
	"payload_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"walked_by_person_id" uuid NOT NULL,
	"walked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "value_runs_engagement_number_key" UNIQUE("engagement_id","run_number"),
	CONSTRAINT "value_runs_lock_is_complete" CHECK ("value_runs"."locked_at" IS NULL
        OR ("value_runs"."locked_by_person_id" IS NOT NULL AND "value_runs"."lock_reason" IS NOT NULL)),
	CONSTRAINT "value_runs_confidence_range" CHECK ("value_runs"."confidence_score" >= 0 AND "value_runs"."confidence_score" <= 100)
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "ai_sourced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "research_query" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "research_tool" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "citation_resolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "citation_resolved_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "citation_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "record_documents" ADD COLUMN "value_run_id" uuid;--> statement-breakpoint
ALTER TABLE "value_runs" ADD CONSTRAINT "value_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_runs" ADD CONSTRAINT "value_runs_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_runs" ADD CONSTRAINT "value_runs_locked_by_person_id_persons_id_fk" FOREIGN KEY ("locked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_runs" ADD CONSTRAINT "value_runs_walked_by_person_id_persons_id_fk" FOREIGN KEY ("walked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_runs" ADD CONSTRAINT "value_runs_steward_person_id_persons_id_fk" FOREIGN KEY ("steward_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_runs" ADD CONSTRAINT "value_runs_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."value_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_runs" ADD CONSTRAINT "value_runs_supersedes_fk" FOREIGN KEY ("supersedes_run_id") REFERENCES "public"."value_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "value_runs_engagement_idx" ON "value_runs" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "value_runs_locked_idx" ON "value_runs" USING btree ("locked_at");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_citation_resolved_by_person_id_persons_id_fk" FOREIGN KEY ("citation_resolved_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_value_run_id_value_runs_id_fk" FOREIGN KEY ("value_run_id") REFERENCES "public"."value_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_ai_requires_query" CHECK ("evidence"."ai_sourced" = false
        OR ("evidence"."research_query" IS NOT NULL AND "evidence"."research_tool" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_resolution_requires_human" CHECK ("evidence"."citation_resolved" = false
        OR ("evidence"."citation_resolved_by_person_id" IS NOT NULL AND "evidence"."citation_resolved_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_ai_verify_requires_resolution" CHECK ("evidence"."source_verified" = false OR "evidence"."ai_sourced" = false OR "evidence"."citation_resolved" = true);