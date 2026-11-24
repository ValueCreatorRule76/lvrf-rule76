ALTER TABLE "persons" DROP CONSTRAINT "persons_email_key";--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "confirmed_distinct_from" uuid[];--> statement-breakpoint
CREATE UNIQUE INDEX "persons_email_key" ON "persons" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_email_normalized" CHECK ("persons"."email" IS NULL OR "persons"."email" = lower(btrim("persons"."email")));