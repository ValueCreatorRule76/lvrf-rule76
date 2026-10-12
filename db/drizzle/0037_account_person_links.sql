-- ------------------------------------------------------------------
-- W1 fix (12 Oct 2026): account_person_links — an existing person (vendor
-- staff) named analyst of record on an account, with a per-account title.
-- drizzle-kit's own output; no hand edit.
--
-- WHAT IT CHANGES. Additive: one enum, one new table. hardening.sql
-- section 23 adds account_person_links _audit, _no_delete, _guard.
-- WHAT IT COULD ORPHAN. Nothing: no existing row is rewritten. BACK UP FIRST
-- (CLAUDE.md rule 8).
-- Triggers 126 -> 129 after hardening.sql.
-- ------------------------------------------------------------------
CREATE TYPE "public"."account_person_role" AS ENUM('analyst_of_record');--> statement-breakpoint
CREATE TABLE "account_person_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "account_person_role" NOT NULL,
	"title" text NOT NULL,
	"linked_by_person_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"retired_by_person_id" uuid,
	"retirement_reason" text,
	CONSTRAINT "account_person_links_title_stated" CHECK (length(btrim("account_person_links"."title")) >= 3),
	CONSTRAINT "account_person_links_retirement_is_complete" CHECK (("account_person_links"."retired_at" IS NULL AND "account_person_links"."retired_by_person_id" IS NULL AND "account_person_links"."retirement_reason" IS NULL)
        OR ("account_person_links"."retired_at" IS NOT NULL AND "account_person_links"."retired_by_person_id" IS NOT NULL
            AND char_length(btrim("account_person_links"."retirement_reason")) >= 12))
);
--> statement-breakpoint
ALTER TABLE "account_person_links" ADD CONSTRAINT "account_person_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_person_links" ADD CONSTRAINT "account_person_links_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_person_links" ADD CONSTRAINT "account_person_links_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_person_links" ADD CONSTRAINT "account_person_links_linked_by_person_id_persons_id_fk" FOREIGN KEY ("linked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_person_links" ADD CONSTRAINT "account_person_links_retired_by_person_id_persons_id_fk" FOREIGN KEY ("retired_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_person_links_current_key" ON "account_person_links" USING btree ("institution_id","person_id","role") WHERE "account_person_links"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "account_person_links_institution_idx" ON "account_person_links" USING btree ("institution_id");