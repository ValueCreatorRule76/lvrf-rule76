-- ------------------------------------------------------------------
-- 3.0 Band A item 1: an access grant is a record (access_grants), and
-- a starting password must be changed (person_credentials.must_change).
--
-- WHAT IT CHANGES. Additive: one new table and one new column (default
-- false, so every existing credential is unaffected). Nothing reads
-- access_grants for sign-in yet — enforcement is Band A deploy B, after
-- the steward's own grant is verified on prod (no lockout).
--
--   access_grants   person, tenant, granted_by, granted_at, reason;
--                   revoked_at / revoked_by / revocation_reason (all or
--                   none, reason >= 12 chars, not before the grant); one
--                   current grant per person (partial unique index).
--   must_change     set on a starting password (grant, reset); the
--                   holder's session reaches only me / change-password /
--                   logout until it is replaced.
--
-- hardening.sql section 16 adds access_grants_audit, _no_delete and
-- access_grants_steward_only (grantor and revoker = the tenant's steward;
-- only the revocation may be written after insert). Trigger count
-- 84 -> 87.
--
-- WHAT IT COULD ORPHAN. Nothing. BACK UP FIRST (CLAUDE.md rule 8).
--
-- Generated with `drizzle-kit generate --name access_grants`; statements
-- are drizzle-kit's own output, unedited.
-- ------------------------------------------------------------------
CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"granted_by_person_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_person_id" uuid,
	"revocation_reason" text,
	CONSTRAINT "access_grants_reason_stated" CHECK (length(btrim("access_grants"."reason")) >= 12),
	CONSTRAINT "access_grants_revocation_complete" CHECK (("access_grants"."revoked_at" IS NULL) = ("access_grants"."revoked_by_person_id" IS NULL)
        AND ("access_grants"."revoked_at" IS NULL) = ("access_grants"."revocation_reason" IS NULL)),
	CONSTRAINT "access_grants_revocation_reason_stated" CHECK ("access_grants"."revocation_reason" IS NULL OR length(btrim("access_grants"."revocation_reason")) >= 12),
	CONSTRAINT "access_grants_revoked_after_granted" CHECK ("access_grants"."revoked_at" IS NULL OR "access_grants"."revoked_at" >= "access_grants"."granted_at")
);
--> statement-breakpoint
ALTER TABLE "person_credentials" ADD COLUMN "must_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_person_id_persons_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_revoked_by_person_id_persons_id_fk" FOREIGN KEY ("revoked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_one_current" ON "access_grants" USING btree ("person_id") WHERE "access_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "access_grants_tenant_idx" ON "access_grants" USING btree ("tenant_id");