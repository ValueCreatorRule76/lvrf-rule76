-- ------------------------------------------------------------------
-- O1 (Outputs band, LVRF_PLAN §5): value levers, the solutions that pull
-- them, and route refusals. drizzle-kit's own output; no hand edit.
--
-- WHAT IT CHANGES.
--   value_levers     NEW, governed (hardening.sql: the governed and
--                    supersession loops; section 22 steward_act) — a lever
--                    on one pack entry: mechanism, leading indicator,
--                    citation; no effect size. Withdrawn = retired: who and
--                    why with deleted_at and status, together or not at all.
--   lever_offerings  NEW, append-only but for one withdrawal (section 20:
--                    _audit, _no_delete, _append_only; section 22
--                    steward_act). The pair is unique among CURRENT links.
--   refusal_source   + 'route' (a request a route refuses before any write,
--                    e.g. an effect size on a lever). refusals_source_shape
--                    is dropped and re-added to allow it; it compares
--                    source::text, so the new value is not used in this
--                    transaction. Existing refusals rows all satisfy it.
-- WHAT IT COULD ORPHAN. Nothing: two new tables, one enum value added, one
-- CHECK widened. No existing row is rewritten. BACK UP FIRST (CLAUDE.md
-- rule 8).
-- Triggers 103 -> 112 after hardening.sql (which also adds the derived-basis
-- function, section 21).
-- ------------------------------------------------------------------
ALTER TYPE "public"."refusal_source" ADD VALUE 'route';--> statement-breakpoint
CREATE TABLE "lever_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"value_lever_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"basis" text NOT NULL,
	"linked_by_person_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"retired_by_person_id" uuid,
	"retirement_reason" text,
	CONSTRAINT "lever_offerings_retirement_is_complete" CHECK (("lever_offerings"."retired_at" IS NULL AND "lever_offerings"."retired_by_person_id" IS NULL AND "lever_offerings"."retirement_reason" IS NULL)
        OR ("lever_offerings"."retired_at" IS NOT NULL AND "lever_offerings"."retired_by_person_id" IS NOT NULL
            AND char_length(btrim("lever_offerings"."retirement_reason")) >= 12)),
	CONSTRAINT "lever_offerings_basis_stated" CHECK (length(btrim("lever_offerings"."basis")) >= 12)
);
--> statement-breakpoint
CREATE TABLE "value_levers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"industry_measure_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mechanism" text NOT NULL,
	"leading_indicator" text NOT NULL,
	"citation" text NOT NULL,
	"proposed_by_person_id" uuid NOT NULL,
	"status" "lifecycle_status" DEFAULT 'proposed' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"retired_by_person_id" uuid,
	"retirement_reason" text,
	CONSTRAINT "value_levers_retirement_is_complete" CHECK (("value_levers"."deleted_at" IS NULL AND "value_levers"."retired_by_person_id" IS NULL AND "value_levers"."retirement_reason" IS NULL
         AND "value_levers"."status" <> 'retired')
        OR ("value_levers"."deleted_at" IS NOT NULL AND "value_levers"."status" = 'retired' AND "value_levers"."retired_by_person_id" IS NOT NULL
            AND char_length(btrim("value_levers"."retirement_reason")) >= 12)),
	CONSTRAINT "value_levers_stated" CHECK (btrim("value_levers"."name") <> '' AND length(btrim("value_levers"."mechanism")) >= 12
        AND btrim("value_levers"."leading_indicator") <> '' AND length(btrim("value_levers"."citation")) >= 12)
);
--> statement-breakpoint
ALTER TABLE "refusals" DROP CONSTRAINT "refusals_source_shape";--> statement-breakpoint
ALTER TABLE "lever_offerings" ADD CONSTRAINT "lever_offerings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lever_offerings" ADD CONSTRAINT "lever_offerings_value_lever_id_value_levers_id_fk" FOREIGN KEY ("value_lever_id") REFERENCES "public"."value_levers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lever_offerings" ADD CONSTRAINT "lever_offerings_offering_id_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lever_offerings" ADD CONSTRAINT "lever_offerings_linked_by_person_id_persons_id_fk" FOREIGN KEY ("linked_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lever_offerings" ADD CONSTRAINT "lever_offerings_retired_by_person_id_persons_id_fk" FOREIGN KEY ("retired_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_levers" ADD CONSTRAINT "value_levers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_levers" ADD CONSTRAINT "value_levers_industry_measure_id_industry_measures_id_fk" FOREIGN KEY ("industry_measure_id") REFERENCES "public"."industry_measures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_levers" ADD CONSTRAINT "value_levers_proposed_by_person_id_persons_id_fk" FOREIGN KEY ("proposed_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_levers" ADD CONSTRAINT "value_levers_steward_person_id_persons_id_fk" FOREIGN KEY ("steward_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_levers" ADD CONSTRAINT "value_levers_retired_by_person_id_persons_id_fk" FOREIGN KEY ("retired_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_levers" ADD CONSTRAINT "value_levers_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."value_levers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lever_offerings_pair_key" ON "lever_offerings" USING btree ("value_lever_id","offering_id") WHERE "lever_offerings"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX "lever_offerings_lever_idx" ON "lever_offerings" USING btree ("value_lever_id");--> statement-breakpoint
CREATE INDEX "value_levers_measure_idx" ON "value_levers" USING btree ("industry_measure_id");--> statement-breakpoint
CREATE INDEX "value_levers_tenant_idx" ON "value_levers" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "refusals" ADD CONSTRAINT "refusals_source_shape" CHECK ("refusals"."source"::text IN ('parser', 'route') OR "refusals"."sqlstate" IS NOT NULL);