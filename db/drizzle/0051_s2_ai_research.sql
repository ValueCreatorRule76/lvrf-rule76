ALTER TYPE "public"."governance_act" ADD VALUE 'clear';--> statement-breakpoint
ALTER TYPE "public"."governance_act" ADD VALUE 'withdraw_clearance';--> statement-breakpoint
CREATE TABLE "research_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_sha256" text NOT NULL,
	"sent_call_id" uuid,
	"clearance_id" uuid,
	"model" text NOT NULL,
	"retention_class" text NOT NULL,
	"settings" jsonb,
	"outcome" text,
	"answer_text" text,
	"answer_sha256" text,
	"request_id" text,
	"stop_reason" text,
	"error_type" text,
	"http_status" integer,
	"usage" jsonb,
	"cost_usd" numeric,
	"person_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_calls_kind_known" CHECK ("research_calls"."kind" IN ('sent', 'result')),
	CONSTRAINT "research_calls_prompt_sha256_shape" CHECK ("research_calls"."prompt_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "research_calls_model_named" CHECK (char_length(btrim("research_calls"."model")) >= 3),
	CONSTRAINT "research_calls_retention_known" CHECK ("research_calls"."retention_class" IN ('standard', 'covered')),
	CONSTRAINT "research_calls_sent_complete" CHECK ("research_calls"."kind" <> 'sent' OR ("research_calls"."clearance_id" IS NOT NULL AND "research_calls"."settings" IS NOT NULL AND jsonb_typeof("research_calls"."settings") = 'object'
        AND "research_calls"."sent_call_id" IS NULL AND "research_calls"."outcome" IS NULL AND "research_calls"."usage" IS NULL AND "research_calls"."cost_usd" IS NULL)),
	CONSTRAINT "research_calls_result_complete" CHECK ("research_calls"."kind" <> 'result' OR ("research_calls"."sent_call_id" IS NOT NULL AND "research_calls"."outcome" IS NOT NULL
        AND "research_calls"."outcome" IN ('answered', 'refused', 'truncated', 'failed', 'timeout')
        AND "research_calls"."cost_usd" IS NOT NULL AND "research_calls"."cost_usd" >= 0 AND "research_calls"."clearance_id" IS NULL AND "research_calls"."settings" IS NULL)),
	CONSTRAINT "research_calls_answer_kept" CHECK (coalesce("research_calls"."outcome" = 'answered', false) = ("research_calls"."answer_text" IS NOT NULL)
        AND ("research_calls"."answer_text" IS NULL) = ("research_calls"."answer_sha256" IS NULL)
        AND ("research_calls"."answer_text" IS NULL OR ("research_calls"."answer_sha256" = encode(sha256(convert_to("research_calls"."answer_text", 'UTF8')), 'hex')
             AND octet_length("research_calls"."answer_text") BETWEEN 1 AND 524288))),
	CONSTRAINT "research_calls_error_named" CHECK (coalesce("research_calls"."outcome" IN ('failed', 'timeout'), false) = ("research_calls"."error_type" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "research_clearances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"institution_id" uuid,
	"industry_id" uuid,
	"model" text NOT NULL,
	"retention_class" text NOT NULL,
	"disclosure_text" text,
	"disclosure_sha256" text,
	"withdraws_clearance_id" uuid,
	"reason" text NOT NULL,
	"person_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_clearances_kind_known" CHECK ("research_clearances"."kind" IN ('clearance', 'withdrawal')),
	CONSTRAINT "research_clearances_one_subject" CHECK (num_nonnulls("research_clearances"."institution_id", "research_clearances"."industry_id") = 1),
	CONSTRAINT "research_clearances_model_named" CHECK (char_length(btrim("research_clearances"."model")) >= 3),
	CONSTRAINT "research_clearances_retention_known" CHECK ("research_clearances"."retention_class" IN ('standard', 'covered')),
	CONSTRAINT "research_clearances_disclosure_kept" CHECK (("research_clearances"."kind" = 'clearance' AND "research_clearances"."disclosure_text" IS NOT NULL AND char_length(btrim("research_clearances"."disclosure_text")) >= 100
         AND "research_clearances"."disclosure_sha256" IS NOT NULL AND "research_clearances"."disclosure_sha256" = encode(sha256(convert_to("research_clearances"."disclosure_text", 'UTF8')), 'hex'))
        OR ("research_clearances"."kind" = 'withdrawal' AND "research_clearances"."disclosure_text" IS NULL AND "research_clearances"."disclosure_sha256" IS NULL)),
	CONSTRAINT "research_clearances_withdrawal_names" CHECK (("research_clearances"."kind" = 'withdrawal') = ("research_clearances"."withdraws_clearance_id" IS NOT NULL)),
	CONSTRAINT "research_clearances_reason_stated" CHECK (char_length(btrim("research_clearances"."reason")) >= 12)
);
--> statement-breakpoint
ALTER TABLE "research_imports" ADD COLUMN "call_id" uuid;--> statement-breakpoint
ALTER TABLE "research_calls" ADD CONSTRAINT "research_calls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_calls" ADD CONSTRAINT "research_calls_prompt_id_research_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."research_prompts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_calls" ADD CONSTRAINT "research_calls_sent_call_id_research_calls_id_fk" FOREIGN KEY ("sent_call_id") REFERENCES "public"."research_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_calls" ADD CONSTRAINT "research_calls_clearance_id_research_clearances_id_fk" FOREIGN KEY ("clearance_id") REFERENCES "public"."research_clearances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_calls" ADD CONSTRAINT "research_calls_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_clearances" ADD CONSTRAINT "research_clearances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_clearances" ADD CONSTRAINT "research_clearances_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_clearances" ADD CONSTRAINT "research_clearances_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_clearances" ADD CONSTRAINT "research_clearances_withdraws_clearance_id_research_clearances_id_fk" FOREIGN KEY ("withdraws_clearance_id") REFERENCES "public"."research_clearances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_clearances" ADD CONSTRAINT "research_clearances_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_calls_prompt_idx" ON "research_calls" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_calls_one_sent_per_prompt" ON "research_calls" USING btree ("prompt_id") WHERE "research_calls"."kind" = 'sent';--> statement-breakpoint
CREATE UNIQUE INDEX "research_calls_one_result_per_call" ON "research_calls" USING btree ("sent_call_id");--> statement-breakpoint
CREATE INDEX "research_clearances_institution_idx" ON "research_clearances" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "research_clearances_industry_idx" ON "research_clearances" USING btree ("industry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_clearances_one_withdrawal" ON "research_clearances" USING btree ("withdraws_clearance_id");--> statement-breakpoint
ALTER TABLE "research_imports" ADD CONSTRAINT "research_imports_call_id_research_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."research_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "research_imports_one_per_call" ON "research_imports" USING btree ("call_id");