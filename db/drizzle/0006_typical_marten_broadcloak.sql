ALTER TABLE "offerings" RENAME COLUMN "lifecycle_status" TO "market_status";--> statement-breakpoint
ALTER TABLE "offerings" RENAME COLUMN "governance_status" TO "evidence_ratification";--> statement-breakpoint
ALTER TABLE "offerings" DROP CONSTRAINT "offerings_tenant_key_unique";--> statement-breakpoint
ALTER TABLE "offerings" DROP CONSTRAINT "offerings_lifecycle_status_valid";--> statement-breakpoint
ALTER TABLE "offerings" DROP CONSTRAINT "offerings_governance_status_valid";--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "status" "lifecycle_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "superseded_by_id" uuid;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "steward_person_id" uuid;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_steward_person_id_persons_id_fk" FOREIGN KEY ("steward_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offerings_tenant_key_unique" ON "offerings" USING btree ("tenant_id","offering_key") WHERE "offerings"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_market_status_valid" CHECK (
    "offerings"."market_status" IN ('proposed','approved','active','deprecated','retired')
  );--> statement-breakpoint
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_evidence_ratification_valid" CHECK (
    "offerings"."evidence_ratification" IN ('unratified','ratified','revoked')
  );--> statement-breakpoint
-- ------------------------------------------------------------------
-- Added by hand — Drizzle has no COMMENT ON primitive and will not
-- generate or regenerate these. Not represented in schema.ts; drizzle-kit
-- generate will not report drift over their absence.
-- ------------------------------------------------------------------
COMMENT ON COLUMN "offerings"."market_status" IS
  'Describes the OFFERING in the vendor''s market: proposed/approved/active/'
  'deprecated/retired. "retired" means the vendor stopped selling it — still '
  'true, still citable; any Realization Record that already named this '
  'offering must keep rendering it. Never set deleted_at to retire an '
  'offering: deleted_at means this ROW was created in error, a different and '
  'much rarer fact. See offerings.status for the record governance lifecycle.';--> statement-breakpoint
COMMENT ON COLUMN "offerings"."evidence_ratification" IS
  'Whether this offering''s evidentiary CLAIM — the evidence_class + '
  'verification_source pair — has been independently audited. Orthogonal to '
  'offerings.status, which is the row''s governance lifecycle: an offering '
  'can be status=active while evidence_ratification=unratified, and most of '
  'the seeded catalog is exactly that. "revoked" means a prior ratification '
  'of this claim was withdrawn as incorrect — no lifecycle_status value '
  'carries that meaning.';