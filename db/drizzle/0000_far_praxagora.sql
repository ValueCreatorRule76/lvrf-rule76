CREATE TYPE "public"."audit_operation" AS ENUM('insert', 'update', 'soft_delete');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."document_disclosure" AS ENUM('draft', 'internal', 'customer_shared');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('assessment_result', 'system_export', 'artifact', 'observation', 'attestation', 'public_filing');--> statement-breakpoint
CREATE TYPE "public"."health_state" AS ENUM('healthy', 'watch', 'warning', 'critical', 'constitutional_failure');--> statement-breakpoint
CREATE TYPE "public"."heartbeat_category" AS ENUM('operational', 'governance', 'integrity', 'financial', 'learning', 'security', 'constitutional');--> statement-breakpoint
CREATE TYPE "public"."learning_stage" AS ENUM('observe', 'assess', 'understand', 'plan', 'learn', 'practice', 'reflect', 'demonstrate', 'measure', 'preserve', 'improve', 'teach', 'return_to_rule76');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_status" AS ENUM('draft', 'proposed', 'rejected', 'ratified', 'active', 'superseded', 'retired', 'archived');--> statement-breakpoint
CREATE TYPE "public"."metric_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."person_role" AS ENUM('value_engineer', 'account_executive', 'revenue_leader', 'ai_steward', 'learner', 'coach', 'metric_owner', 'executive_sponsor', 'rule76_steward', 'administrator');--> statement-breakpoint
CREATE TYPE "public"."realization_status" AS ENUM('claimed', 'measured', 'verified', 'not_realized');--> statement-breakpoint
CREATE TYPE "public"."return_kind" AS ENUM('lesson_learned', 'capability_update', 'knowledge_artifact', 'lever_pattern', 'constitutional_amendment');--> statement-breakpoint
CREATE TYPE "public"."value_stage" AS ENUM('baseline', 'attach', 'model', 'commit', 'measure', 'verify', 'return');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"learner_person_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"score" numeric(8, 3) NOT NULL,
	"scale_min" numeric(8, 3) DEFAULT '0' NOT NULL,
	"scale_max" numeric(8, 3) DEFAULT '5' NOT NULL,
	"assessed_by_person_id" uuid NOT NULL,
	"ai_assisted" boolean DEFAULT false NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"learning_stage" "learning_stage",
	"notes" text,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assessments_score_in_range" CHECK ("assessments"."score" >= "assessments"."scale_min" AND "assessments"."score" <= "assessments"."scale_max"),
	CONSTRAINT "assessments_scale_sane" CHECK ("assessments"."scale_max" > "assessments"."scale_min")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"operation" "audit_operation" NOT NULL,
	"actor_person_id" uuid,
	"old_row" jsonb,
	"new_row" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"direction" "metric_direction" NOT NULL,
	"source_system" text NOT NULL,
	"owner_person_id" uuid,
	"reporting_cadence" text,
	"definition_notes" text,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "business_metrics_institution_name_key" UNIQUE("institution_id","name")
);
--> statement-breakpoint
CREATE TABLE "capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"role_family" text,
	"owner_person_id" uuid NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"account_executive_person_id" uuid,
	"sponsor_person_id" uuid,
	"value_stage" "value_stage" DEFAULT 'baseline' NOT NULL,
	"renewal_date" timestamp with time zone,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"summary" text NOT NULL,
	"provenance" text NOT NULL,
	"source_reference" text,
	"confidence" "confidence_level" DEFAULT 'medium' NOT NULL,
	"source_verified" boolean DEFAULT false NOT NULL,
	"assessment_id" uuid,
	"captured_by_person_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "heartbeat_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"heartbeat_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid,
	"engagement_id" uuid,
	"event_type" text NOT NULL,
	"producer" text NOT NULL,
	"severity" integer NOT NULL,
	"health_state" "health_state" NOT NULL,
	"constitutional_authority" text NOT NULL,
	"content_hash" text NOT NULL,
	"contract_version" text DEFAULT '1.0.0' NOT NULL,
	"value_stage" "value_stage",
	"learning_stage" "learning_stage",
	"subject_table" text NOT NULL,
	"subject_id" text NOT NULL,
	"actor_person_id" uuid,
	"actor_is_agent" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "heartbeat_events_severity_range" CHECK ("heartbeat_events"."severity" >= 0 AND "heartbeat_events"."severity" <= 5)
);
--> statement-breakpoint
CREATE TABLE "heartbeats" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "heartbeat_category" NOT NULL,
	"purpose" text NOT NULL,
	"producer" text NOT NULL,
	"frequency" text NOT NULL,
	"health_weight" integer NOT NULL,
	"failure_severity" integer NOT NULL,
	"constitutional_authority" text DEFAULT 'Rule76 Constitution' NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" text,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "heartbeats_health_weight_range" CHECK ("heartbeats"."health_weight" >= 0 AND "heartbeats"."health_weight" <= 10),
	CONSTRAINT "heartbeats_failure_severity_range" CHECK ("heartbeats"."failure_severity" >= 0 AND "heartbeats"."failure_severity" <= 5),
	CONSTRAINT "heartbeats_id_format" CHECK ("heartbeats"."id" ~ '^HB-[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"is_tenant_self" boolean DEFAULT false NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "institutions_tenant_name_key" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "person_roles" (
	"person_id" uuid NOT NULL,
	"role" "person_role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "person_roles_person_id_role_pk" PRIMARY KEY("person_id","role")
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"institution_id" uuid,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"title" text,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "persons_email_key" UNIQUE("email"),
	CONSTRAINT "persons_scoped_to_exactly_one" CHECK (("persons"."tenant_id" IS NOT NULL)::int + ("persons"."institution_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "record_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"value_outcome_id" uuid NOT NULL,
	"document_version" integer DEFAULT 1 NOT NULL,
	"disclosure" "document_disclosure" DEFAULT 'draft' NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"file_path" text,
	"rendered_by_person_id" uuid NOT NULL,
	"rendered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_documents_outcome_version_key" UNIQUE("value_outcome_id","document_version")
);
--> statement-breakpoint
CREATE TABLE "reflection_evidence" (
	"reflection_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	CONSTRAINT "reflection_evidence_reflection_id_evidence_id_pk" PRIMARY KEY("reflection_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "reflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"capability_id" uuid,
	"prompt" text NOT NULL,
	"body" text NOT NULL,
	"ai_drafted" boolean DEFAULT false NOT NULL,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reflections_human_review_before_ratification" CHECK ("reflections"."status" NOT IN ('ratified','active') OR ("reflections"."reviewed_by_person_id" IS NOT NULL AND "reflections"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "stewardship_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid,
	"kind" "return_kind" NOT NULL,
	"summary" text NOT NULL,
	"narrative" text,
	"capability_id" uuid,
	"source_reflection_id" uuid,
	"source_value_outcome_id" uuid,
	"ratified_by_person_id" uuid,
	"ratified_at" timestamp with time zone,
	"target_chapel" text DEFAULT 'rule76' NOT NULL,
	"promoted_at" timestamp with time zone,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "stewardship_returns_requires_source" CHECK ("stewardship_returns"."source_reflection_id" IS NOT NULL OR "stewardship_returns"."source_value_outcome_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_self_measuring" boolean DEFAULT false NOT NULL,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tenants_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "value_outcome_evidence" (
	"value_outcome_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"supports" text DEFAULT 'baseline' NOT NULL,
	CONSTRAINT "value_outcome_evidence_value_outcome_id_evidence_id_pk" PRIMARY KEY("value_outcome_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "value_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"business_metric_id" uuid NOT NULL,
	"value_stage" "value_stage" DEFAULT 'baseline' NOT NULL,
	"baseline_value" numeric(18, 4) NOT NULL,
	"baseline_measured_at" timestamp with time zone NOT NULL,
	"target_value" numeric(18, 4),
	"committed_by_person_id" uuid,
	"committed_at" timestamp with time zone,
	"actual_value" numeric(18, 4),
	"actual_measured_at" timestamp with time zone,
	"currency_impact" numeric(18, 2),
	"currency_code" text DEFAULT 'USD',
	"impact_basis" text,
	"realization" realization_status DEFAULT 'claimed' NOT NULL,
	"confidence" "confidence_level" DEFAULT 'low' NOT NULL,
	"source_verified" boolean DEFAULT false NOT NULL,
	"verified_by_person_id" uuid,
	"verified_at" timestamp with time zone,
	"status" "lifecycle_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "value_outcomes_measured_requires_actual" CHECK ("value_outcomes"."realization" = 'claimed' OR ("value_outcomes"."actual_value" IS NOT NULL AND "value_outcomes"."actual_measured_at" IS NOT NULL)),
	CONSTRAINT "value_outcomes_verified_requires_human" CHECK ("value_outcomes"."realization" <> 'verified' OR ("value_outcomes"."verified_by_person_id" IS NOT NULL AND "value_outcomes"."verified_at" IS NOT NULL AND "value_outcomes"."source_verified" = true)),
	CONSTRAINT "value_outcomes_impact_requires_basis" CHECK ("value_outcomes"."currency_impact" IS NULL OR "value_outcomes"."impact_basis" IS NOT NULL),
	CONSTRAINT "value_outcomes_commit_is_complete" CHECK ("value_outcomes"."committed_at" IS NULL OR ("value_outcomes"."target_value" IS NOT NULL AND "value_outcomes"."committed_by_person_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_learner_person_id_persons_id_fk" FOREIGN KEY ("learner_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_assessed_by_person_id_persons_id_fk" FOREIGN KEY ("assessed_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_metrics" ADD CONSTRAINT "business_metrics_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_metrics" ADD CONSTRAINT "business_metrics_owner_person_id_persons_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capabilities" ADD CONSTRAINT "capabilities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capabilities" ADD CONSTRAINT "capabilities_owner_person_id_persons_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_owner_person_id_persons_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_account_executive_person_id_persons_id_fk" FOREIGN KEY ("account_executive_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_sponsor_person_id_persons_id_fk" FOREIGN KEY ("sponsor_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_captured_by_person_id_persons_id_fk" FOREIGN KEY ("captured_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_events" ADD CONSTRAINT "heartbeat_events_heartbeat_id_heartbeats_id_fk" FOREIGN KEY ("heartbeat_id") REFERENCES "public"."heartbeats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_events" ADD CONSTRAINT "heartbeat_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_events" ADD CONSTRAINT "heartbeat_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_events" ADD CONSTRAINT "heartbeat_events_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_events" ADD CONSTRAINT "heartbeat_events_actor_person_id_persons_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_documents" ADD CONSTRAINT "record_documents_rendered_by_person_id_persons_id_fk" FOREIGN KEY ("rendered_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflection_evidence" ADD CONSTRAINT "reflection_evidence_reflection_id_reflections_id_fk" FOREIGN KEY ("reflection_id") REFERENCES "public"."reflections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflection_evidence" ADD CONSTRAINT "reflection_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_author_person_id_persons_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_reviewed_by_person_id_persons_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stewardship_returns" ADD CONSTRAINT "stewardship_returns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stewardship_returns" ADD CONSTRAINT "stewardship_returns_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stewardship_returns" ADD CONSTRAINT "stewardship_returns_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stewardship_returns" ADD CONSTRAINT "stewardship_returns_source_reflection_id_reflections_id_fk" FOREIGN KEY ("source_reflection_id") REFERENCES "public"."reflections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stewardship_returns" ADD CONSTRAINT "stewardship_returns_source_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("source_value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stewardship_returns" ADD CONSTRAINT "stewardship_returns_ratified_by_person_id_persons_id_fk" FOREIGN KEY ("ratified_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcomes" ADD CONSTRAINT "value_outcomes_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcomes" ADD CONSTRAINT "value_outcomes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcomes" ADD CONSTRAINT "value_outcomes_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcomes" ADD CONSTRAINT "value_outcomes_business_metric_id_business_metrics_id_fk" FOREIGN KEY ("business_metric_id") REFERENCES "public"."business_metrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcomes" ADD CONSTRAINT "value_outcomes_committed_by_person_id_persons_id_fk" FOREIGN KEY ("committed_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_outcomes" ADD CONSTRAINT "value_outcomes_verified_by_person_id_persons_id_fk" FOREIGN KEY ("verified_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_learner_idx" ON "assessments" USING btree ("learner_person_id");--> statement-breakpoint
CREATE INDEX "assessments_capability_idx" ON "assessments" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "audit_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "business_metrics_institution_idx" ON "business_metrics" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "capabilities_institution_idx" ON "capabilities" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "engagements_tenant_idx" ON "engagements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "engagements_institution_idx" ON "engagements" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "engagements_stage_idx" ON "engagements" USING btree ("value_stage");--> statement-breakpoint
CREATE INDEX "evidence_institution_idx" ON "evidence" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "evidence_verified_idx" ON "evidence" USING btree ("source_verified");--> statement-breakpoint
CREATE INDEX "heartbeat_registered_idx" ON "heartbeat_events" USING btree ("heartbeat_id");--> statement-breakpoint
CREATE INDEX "heartbeat_subject_idx" ON "heartbeat_events" USING btree ("subject_table","subject_id");--> statement-breakpoint
CREATE INDEX "heartbeat_occurred_idx" ON "heartbeat_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "heartbeat_engagement_idx" ON "heartbeat_events" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "heartbeat_health_idx" ON "heartbeat_events" USING btree ("health_state");--> statement-breakpoint
CREATE INDEX "institutions_tenant_idx" ON "institutions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "persons_tenant_idx" ON "persons" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "persons_institution_idx" ON "persons" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "record_documents_engagement_idx" ON "record_documents" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "reflections_author_idx" ON "reflections" USING btree ("author_person_id");--> statement-breakpoint
CREATE INDEX "stewardship_returns_tenant_idx" ON "stewardship_returns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "value_outcomes_engagement_idx" ON "value_outcomes" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "value_outcomes_realization_idx" ON "value_outcomes" USING btree ("realization");