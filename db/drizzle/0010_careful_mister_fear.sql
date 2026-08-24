ALTER TYPE "public"."evidence_kind" ADD VALUE 'vendor_publication';--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- ------------------------------------------------------------------
-- Added by hand — a data backfill, not a schema diff; drizzle-kit
-- generate has nothing to emit here. Sets the new stored fact from the
-- prose convention it replaces. Does not touch provenance: the column
-- is what the gate reads going forward, the '[SIM]' prefix is what a
-- human reads in a raw query, and editing existing provenance text is
-- not something this system does.
-- ------------------------------------------------------------------
UPDATE "evidence" SET "simulated" = true WHERE "provenance" LIKE '[SIM]%';