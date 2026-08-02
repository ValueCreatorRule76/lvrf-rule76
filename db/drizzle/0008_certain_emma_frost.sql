CREATE TYPE "public"."evidence_access" AS ENUM('unconfirmed', 'confirmed', 'denied');--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "provider_org" text;--> statement-breakpoint
ALTER TABLE "offerings" ADD COLUMN "evidence_access" "evidence_access" DEFAULT 'unconfirmed' NOT NULL;--> statement-breakpoint
-- ------------------------------------------------------------------
-- Added by hand — Drizzle has no COMMENT ON primitive and will not
-- generate or regenerate these. Not represented in schema.ts's tracked
-- shape; drizzle-kit generate will not report drift over their absence.
-- ------------------------------------------------------------------
COMMENT ON COLUMN "offerings"."provider_org" IS
  'The organization that actually provides this offering. NULL means the '
  'tenant provides it directly. A non-null value means the tenant resells '
  'it: the evidence chain runs through systems the tenant does not own and '
  'the arrangement can be terminated by a party outside the tenant. '
  'Distinct from tenant_id, which is only whose catalog the row appears in.';--> statement-breakpoint
COMMENT ON COLUMN "offerings"."evidence_access" IS
  'Whether it is confirmed that this offering''s evidence artifacts can '
  'actually be retrieved for an engagement — exportable, retained, at usable '
  'grain. Distinct from evidence_class, which is what the offering could emit '
  'in principle. An offering can be demonstrated-class and still unretrievable. '
  'Default unconfirmed: absence of confirmation is not confirmation of absence, '
  'and neither is a marketing claim. The confirmation_gaps array names the open '
  'questions; this column is the current answer. When the gap engine lands, this '
  'becomes derived rather than stored.';