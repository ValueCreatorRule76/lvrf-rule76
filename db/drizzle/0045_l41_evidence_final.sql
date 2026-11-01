-- L41 + L42 + L47 (LVRF_PLAN §13; Brad's D1–D8 and four conditions, 1 Nov 2026). Changes:
--   governance_act gains 'state_about' (a steward states what a row from before this field is about);
--   evidence gains about_institution_id, about_other_party (exactly one, evidence_about_stated) and
--     attester_document (condition 1, evidence_attestation_opened and evidence_attester_document_known).
-- Writes no evidence row: filling a column here would be 34 updates with no actor, the 23 Aug defect (L41-D3).
-- evidence_about_stated is therefore NOT VALID: it binds every new or updated row at once, and hardening.sql
-- validates it once the steward's batch leaves no row unset. Orphans nothing: every existing row and link stands.
ALTER TYPE "public"."governance_act" ADD VALUE 'state_about';--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "about_institution_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "about_other_party" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "attester_document" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_about_institution_id_institutions_id_fk" FOREIGN KEY ("about_institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_about_stated" CHECK (("evidence"."about_institution_id" IS NOT NULL AND "evidence"."about_other_party" IS NULL)
        OR ("evidence"."about_institution_id" IS NULL AND "evidence"."about_other_party" IS NOT NULL AND length(btrim("evidence"."about_other_party")) >= 3)) NOT VALID;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_attestation_opened" CHECK (NOT ("evidence"."source_verified" AND "evidence"."citation_resolved" AND ("evidence"."kind" = 'attestation' OR "evidence"."attested_by_person_id" IS NOT NULL))
        OR ("evidence"."attester_document" IS NOT NULL AND "evidence"."evidence_form" IN ('quote', 'locator')));--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_attester_document_known" CHECK ("evidence"."attester_document" IS NULL OR "evidence"."attester_document" IN ('email', 'signed_statement', 'letter'));