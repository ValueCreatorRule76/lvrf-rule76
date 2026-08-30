-- ------------------------------------------------------------------
-- 2.0 item 4 — hardening_manifest
--
-- WHY THIS EXISTS: on 23 August five triggers sat DECLARED in hardening.sql
-- and ABSENT from the database for weeks, while the trigger count reconciled
-- by coincidence. The lesson was: compare lists, not totals. This table is
-- what makes that comparison possible from SQL.
--
-- The expected list could have been a constant in the checking code. That
-- would be a SECOND declaration of what hardening.sql already declares — two
-- lists, hand-synchronised, drifting silently. A drift detector that drifts
-- is the most embarrassing possible failure of this feature.
--
-- The manifest is written BY hardening.sql as it runs. One declaration.
--
-- SHAPE: insert-only, same as refusals and record_documents — no
-- deleted_at, no superseded_by_id, no status, no version. What
-- hardening.sql applied at a moment is a fact.
--
-- This migration only creates the table. hardening.sql truncates and
-- repopulates it at the end of its run.
-- ------------------------------------------------------------------
CREATE TABLE "hardening_manifest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger_name" text NOT NULL,
	"table_name" text NOT NULL,
	CONSTRAINT "hardening_manifest_trigger_table_key" UNIQUE("trigger_name","table_name")
);
