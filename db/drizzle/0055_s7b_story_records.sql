ALTER TYPE "public"."governance_act" ADD VALUE 'issue';--> statement-breakpoint
CREATE TABLE "story_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"stage" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"issued_by_person_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by_person_id" uuid,
	"withdrawal_reason" text,
	CONSTRAINT "story_records_audience_known" CHECK ("story_records"."audience" IN ('internal', 'client')),
	CONSTRAINT "story_records_stage_known" CHECK ("story_records"."stage" IN ('reference', 'decision', 'realization', 'compounding')),
	CONSTRAINT "story_records_reference_internal" CHECK ("story_records"."stage" <> 'reference' OR "story_records"."audience" = 'internal'),
	CONSTRAINT "story_records_hash_shape" CHECK ("story_records"."payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "story_records_withdrawal_is_complete" CHECK (("story_records"."withdrawn_at" IS NULL AND "story_records"."withdrawn_by_person_id" IS NULL AND "story_records"."withdrawal_reason" IS NULL)
        OR ("story_records"."withdrawn_at" IS NOT NULL AND "story_records"."withdrawn_by_person_id" IS NOT NULL AND length(btrim("story_records"."withdrawal_reason")) >= 12))
);
--> statement-breakpoint
ALTER TABLE "story_records" ADD CONSTRAINT "story_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_records" ADD CONSTRAINT "story_records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_records" ADD CONSTRAINT "story_records_issued_by_person_id_persons_id_fk" FOREIGN KEY ("issued_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_records" ADD CONSTRAINT "story_records_withdrawn_by_person_id_persons_id_fk" FOREIGN KEY ("withdrawn_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_records_institution_idx" ON "story_records" USING btree ("institution_id");