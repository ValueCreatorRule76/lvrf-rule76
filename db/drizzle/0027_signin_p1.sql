-- ------------------------------------------------------------------
-- Sign-in, phase P1: person_credentials and sessions.
--
-- WHAT IT CHANGES. Additive only: two new tables. Nothing existing is
-- altered. Nothing reads these tables yet except the new /api/auth
-- routes; the X-Actor-Person-Id header keeps working unchanged through
-- P1. P2 switches the actor to the signed-in session.
--
--   person_credentials  argon2id hash per vendor staff member; rotation
--                       is revoke + insert; one current row per person
--                       (partial unique index); CHECK the hash is argon2id.
--   sessions            SHA-256 of the session token (never the token),
--                       sliding 12-hour expiry capped at 7 days (CHECK).
--
-- NOT AUDITED, deliberately: lvrf_audit() copies whole rows into the
-- append-only audit_log, which would put password hashes and token
-- hashes into a log that can never be cleaned. Both tables get
-- _no_delete (hardening.sql section 15): revocation is a column.
--
-- WHAT IT COULD ORPHAN. Nothing. Trigger count 82 -> 84 after
-- hardening.sql. BACK UP FIRST (CLAUDE.md rule 8).
--
-- Generated with drizzle-kit's generateMigration against 0026's snapshot;
-- statements are drizzle-kit's own output, unedited.
-- ------------------------------------------------------------------
CREATE TABLE "person_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"password_hash" text NOT NULL,
	"set_via" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "person_credentials_hash_is_argon2id" CHECK ("person_credentials"."password_hash" LIKE '$argon2id$%')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "sessions_expiry_is_bounded" CHECK ("sessions"."expires_at" <= "sessions"."absolute_expires_at")
);
--> statement-breakpoint
ALTER TABLE "person_credentials" ADD CONSTRAINT "person_credentials_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "person_credentials_one_current" ON "person_credentials" USING btree ("person_id") WHERE "person_credentials"."revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "sessions_person_idx" ON "sessions" USING btree ("person_id");
