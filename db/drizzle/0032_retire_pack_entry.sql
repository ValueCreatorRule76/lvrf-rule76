-- ------------------------------------------------------------------
-- Q4c1b: retiring a pack entry is an act with a person and a reason.
--
-- WHAT IT CHANGES. Additive, on industry_measures:
--   retired_by_person_id (FK persons, RESTRICT) and retirement_reason, both
--   nullable; CHECK industry_measures_retirement_is_complete — retired means
--   deleted_at, status 'retired', the person and a reason of at least 12
--   characters, all together, or none of them. Written only by
--   POST /api/industry-measures/:id/retire (steward-only). Triggers
--   unchanged (98): industry_measures is already in the governed loop.
--
-- ONE HAND EDIT to drizzle-kit's output, on purpose: the CHECK is added
-- NOT VALID and then VALIDATED in the same migration only if no existing
-- row violates it. Prod (26 entries, all proposed, none deleted, 12 Oct
-- 2026) is validated in full. Local lvrf has three retired TEST entries
-- from 5 Sep 2026 with no person or reason; they are not rewritten (a
-- guessed retirer would be manufactured history), so a clone of local keeps
-- the CHECK NOT VALID — still enforced on every row inserted or updated
-- from now on. The constraint's name and definition are drizzle-kit's own,
-- as the snapshot says.
--
-- WHAT IT COULD ORPHAN. Nothing: two nullable columns and a CHECK.
-- BACK UP FIRST (CLAUDE.md rule 8).
-- ------------------------------------------------------------------
ALTER TABLE "industry_measures" ADD COLUMN "retired_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD COLUMN "retirement_reason" text;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD CONSTRAINT "industry_measures_retired_by_person_id_persons_id_fk" FOREIGN KEY ("retired_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD CONSTRAINT "industry_measures_retirement_is_complete" CHECK (("industry_measures"."deleted_at" IS NULL AND "industry_measures"."retired_by_person_id" IS NULL AND "industry_measures"."retirement_reason" IS NULL
         AND "industry_measures"."status" <> 'retired')
        OR ("industry_measures"."deleted_at" IS NOT NULL AND "industry_measures"."status" = 'retired' AND "industry_measures"."retired_by_person_id" IS NOT NULL
            AND char_length(btrim("industry_measures"."retirement_reason")) >= 12)) NOT VALID;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "industry_measures"
     WHERE NOT (("deleted_at" IS NULL AND "retired_by_person_id" IS NULL AND "retirement_reason" IS NULL AND "status" <> 'retired')
            OR ("deleted_at" IS NOT NULL AND "status" = 'retired' AND "retired_by_person_id" IS NOT NULL
                AND char_length(btrim("retirement_reason")) >= 12))
  ) THEN
    ALTER TABLE "industry_measures" VALIDATE CONSTRAINT "industry_measures_retirement_is_complete";
  END IF;
END $$;