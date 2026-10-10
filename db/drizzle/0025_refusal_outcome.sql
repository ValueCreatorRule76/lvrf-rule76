-- ------------------------------------------------------------------
-- Refusals name the value outcome they targeted.
--
-- WHAT IT CHANGES. Additive only: refusals.value_outcome_id, nullable, FK
-- value_outcomes ON DELETE RESTRICT, indexed. Written from now on by the
-- outcome routes (evidence, commit, measure, verify) once the outcome is
-- resolved; the gap register attributes evidence refusals ONLY on an exact
-- match. Replaces the single-outcome-at-institution guess and the
-- created_at bound that contained it (BUILD_STATUS, 10 October).
--
-- NO BACK-FILL. Existing refusals did not record their target; inferring
-- one now would be the guess this column removes. They stay NULL and are
-- never attributed. On prod that is one row (30 August, AMENDMENT-005).
--
-- WHAT IT COULD ORPHAN. Nothing: no column dropped or retyped, no row
-- touched. refusals keeps refusals_no_delete; no trigger is added or
-- changed, so the trigger count stays 82 and hardening.sql is unchanged.
-- Re-running hardening.sql after migrating is still the standing rule.
--
-- BACK UP FIRST (CLAUDE.md rule 8).
--
-- Generated with drizzle-kit's generateMigration against 0024's snapshot;
-- statements are drizzle-kit's own output, unedited.
-- ------------------------------------------------------------------
ALTER TABLE "refusals" ADD COLUMN "value_outcome_id" uuid;
--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_value_outcome_id_value_outcomes_id_fk" FOREIGN KEY ("value_outcome_id") REFERENCES "public"."value_outcomes"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "refusals_value_outcome_idx" ON "refusals" USING btree ("value_outcome_id");
