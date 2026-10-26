-- C2 (LVRF_PLAN §11; Brad's ruling, 25 Oct 2026): what a commitment's and a verification's
-- attestation supports. Three CHECKs each gain 'target_commitment' and 'verification':
-- value_outcome_evidence_supports_known, value_outcome_evidence_correction_complete (the
-- corrected-from list) and run_errata_supports_known. Neither value feeds a confidence factor.
-- And (Brad, 25 Oct 2026, after the dry run): an erratum may be recorded NOT RECOMPUTED when the
-- server's recompute refuses, so run_errata's recomputed score and band, and its model version and
-- fingerprint, become nullable under run_errata_recompute_complete; scores_in_range and
-- bands_known are rewritten definite under NULL.
-- Orphans nothing: no row changes. Every existing link keeps its supports until a steward
-- corrects it, and the 3 existing errata are recomputed, so each passes the new CHECK.
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_supports_known";--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_scores_in_range";--> statement-breakpoint
ALTER TABLE "run_errata" DROP CONSTRAINT "run_errata_bands_known";--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" DROP CONSTRAINT "value_outcome_evidence_supports_known";--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" DROP CONSTRAINT "value_outcome_evidence_correction_complete";--> statement-breakpoint
ALTER TABLE "run_errata" ALTER COLUMN "model_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run_errata" ALTER COLUMN "model_fingerprint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run_errata" ALTER COLUMN "recomputed_score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run_errata" ALTER COLUMN "recomputed_band" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_recompute_complete" CHECK (("run_errata"."recomputed_score" IS NOT NULL AND "run_errata"."recomputed_band" IS NOT NULL AND "run_errata"."model_version" IS NOT NULL AND "run_errata"."model_fingerprint" IS NOT NULL
         AND "run_errata"."recompute_method" NOT LIKE 'Not recomputed:%')
        OR ("run_errata"."recomputed_score" IS NULL AND "run_errata"."recomputed_band" IS NULL AND "run_errata"."recompute_method" LIKE 'Not recomputed:%'
         AND ("run_errata"."model_version" IS NULL) = ("run_errata"."model_fingerprint" IS NULL)));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_supports_known" CHECK ("run_errata"."corrected_to_supports" IN ('baseline', 'actual', 'impact_basis', 'target_commitment', 'verification'));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_scores_in_range" CHECK ("run_errata"."sealed_score" BETWEEN 0 AND 100 AND ("run_errata"."recomputed_score" IS NULL OR "run_errata"."recomputed_score" BETWEEN 0 AND 100));--> statement-breakpoint
ALTER TABLE "run_errata" ADD CONSTRAINT "run_errata_bands_known" CHECK ("run_errata"."sealed_band" IN ('low', 'medium', 'high') AND ("run_errata"."recomputed_band" IS NULL OR "run_errata"."recomputed_band" IN ('low', 'medium', 'high')));--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_supports_known" CHECK ("value_outcome_evidence"."supports" IN ('baseline', 'actual', 'impact_basis', 'target_commitment', 'verification'));--> statement-breakpoint
ALTER TABLE "value_outcome_evidence" ADD CONSTRAINT "value_outcome_evidence_correction_complete" CHECK (("value_outcome_evidence"."corrects_supports" IS NULL AND "value_outcome_evidence"."corrected_by_person_id" IS NULL AND "value_outcome_evidence"."correction_reason" IS NULL)
        OR ("value_outcome_evidence"."corrects_supports" IS NOT NULL AND "value_outcome_evidence"."corrected_by_person_id" IS NOT NULL AND "value_outcome_evidence"."correction_reason" IS NOT NULL
            AND "value_outcome_evidence"."corrects_supports" IN ('baseline', 'actual', 'impact_basis', 'target_commitment', 'verification') AND "value_outcome_evidence"."corrects_supports" <> "value_outcome_evidence"."supports"
            AND length(btrim("value_outcome_evidence"."correction_reason")) >= 12));