ALTER TABLE "persons" ADD COLUMN "simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- ------------------------------------------------------------------
-- Added by hand — a data backfill, not a schema diff; drizzle-kit
-- generate has nothing to emit here. Sets the new stored fact from the
-- prose convention it replaces. Does not touch full_name: the column
-- is what a caller reads going forward, the '[SIM]' prefix is what a
-- human reads in a raw query, and editing existing full_name text is
-- not something this system does.
-- ------------------------------------------------------------------
UPDATE "persons" SET "simulated" = true WHERE "full_name" LIKE '[SIM]%';