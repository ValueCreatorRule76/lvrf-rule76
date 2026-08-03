ALTER TABLE "evidence" ADD COLUMN "attested_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "attested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_attested_by_person_id_persons_id_fk" FOREIGN KEY ("attested_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_attested_idx" ON "evidence" USING btree ("attested_by_person_id");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_attestation_is_complete" CHECK (("evidence"."attested_by_person_id" IS NULL AND "evidence"."attested_at" IS NULL)
        OR ("evidence"."attested_by_person_id" IS NOT NULL AND "evidence"."attested_at" IS NOT NULL));