CREATE TYPE "public"."evidence_class" AS ENUM('none', 'consumption', 'assessed', 'demonstrated', 'applied');--> statement-breakpoint
CREATE TYPE "public"."offering_family" AS ENUM('platform', 'assessment', 'practice', 'coaching', 'instructor_led', 'program', 'content', 'enabler');--> statement-breakpoint
CREATE TYPE "public"."verification_source" AS ENUM('none', 'vendor_platform', 'human_observer', 'third_party', 'customer_system');--> statement-breakpoint
CREATE TABLE "offering_capabilities" (
	"offering_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "offering_capabilities_offering_id_capability_id_pk" PRIMARY KEY("offering_id","capability_id")
);
--> statement-breakpoint
CREATE TABLE "offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"offering_key" text NOT NULL,
	"name" text NOT NULL,
	"family" "offering_family" NOT NULL,
	"description" text NOT NULL,
	"evidence_class" "evidence_class" NOT NULL,
	"verification_source" "verification_source" NOT NULL,
	"evidence_artifacts" text[] DEFAULT '{}'::text[] NOT NULL,
	"commercial_model" text,
	"source_refs" jsonb NOT NULL,
	"confirmation_gaps" text[] DEFAULT '{}'::text[] NOT NULL,
	"lifecycle_status" text DEFAULT 'proposed' NOT NULL,
	"governance_status" text DEFAULT 'unratified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offerings_tenant_key_unique" UNIQUE("tenant_id","offering_key"),
	CONSTRAINT "offerings_evidence_requires_source" CHECK (
    "offerings"."evidence_class" IN ('none','consumption') OR "offerings"."verification_source" <> 'none'
  ),
	CONSTRAINT "offerings_artifacts_nonempty_when_evidential" CHECK (
    "offerings"."evidence_class" = 'none' OR cardinality("offerings"."evidence_artifacts") >= 1
  ),
	CONSTRAINT "offerings_source_refs_is_array" CHECK (
    jsonb_typeof("offerings"."source_refs") = 'array'
  ),
	CONSTRAINT "offerings_lifecycle_status_valid" CHECK (
    "offerings"."lifecycle_status" IN ('proposed','approved','active','deprecated','retired')
  ),
	CONSTRAINT "offerings_governance_status_valid" CHECK (
    "offerings"."governance_status" IN ('unratified','ratified','revoked')
  )
);
--> statement-breakpoint
ALTER TABLE "offering_capabilities" ADD CONSTRAINT "offering_capabilities_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offering_capabilities" ADD CONSTRAINT "offering_capabilities_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offering_capabilities_one_primary" ON "offering_capabilities" USING btree ("offering_id") WHERE "offering_capabilities"."is_primary";--> statement-breakpoint
CREATE INDEX "offering_capabilities_capability_idx" ON "offering_capabilities" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "offerings_tenant_idx" ON "offerings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "offerings_evidence_class_idx" ON "offerings" USING btree ("evidence_class");--> statement-breakpoint
-- ------------------------------------------------------------------
-- Added by hand — Drizzle has no COMMENT ON primitive and will not
-- generate or regenerate these. They are not represented in schema.ts
-- and drizzle-kit generate will not report drift over their absence.
-- ------------------------------------------------------------------
COMMENT ON TABLE "offerings" IS
  'Vendor offering catalog, tenant-scoped. An offering reaches a business '
  'metric only through a capability — never directly. evidence_class governs '
  'whether an offering may serve as the basis for a verified value outcome.';--> statement-breakpoint
COMMENT ON COLUMN "offerings"."evidence_class" IS
  'Strongest evidence of capability change this offering can actually emit. '
  'none/consumption cannot be the sole basis for a verified value_outcome '
  '(enforced in the route — cross-table, cannot be a CHECK).';