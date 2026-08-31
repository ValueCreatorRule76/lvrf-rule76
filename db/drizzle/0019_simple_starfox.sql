-- ------------------------------------------------------------------
-- 2.0 item 5 — industry packs, step 1: industries, industry_measures
--
-- MIGRATION ONLY. No routes, no seed data beyond the industries taxonomy
-- itself. Ratification, promotion, and the parser that will populate
-- industry_measures from research do not exist yet.
--
-- FOUR OBJECTS, ONE MODELLING DECISION:
--
--   industries — the tenant's own industry taxonomy. TENANT-SCOPED, not
--   global: it is drawn from Skillsoft's own industry content-channel
--   list, and another vendor running LVRF would have a different one.
--   Reference data, not a governed business object — no status, version,
--   superseded_by_id, or timestamps. hardening.sql section 11 gives it
--   _audit and _no_delete only, and says why not the full triad.
--
--   institutions.industry_id — an institution's CLASSIFICATION against
--   that taxonomy. Added NULL on every existing row by this migration,
--   and left that way: institutions.industry (untouched) is WHAT WAS
--   STATED AT INTAKE; industry_id is WHAT IT WAS CLASSIFIED AS.
--   Classification is a judgement a person makes, and asserting one here
--   would be exactly the fabrication this system refuses. An unmapped
--   institution has no pack — an honest state for the register to report,
--   not a gap to backfill.
--
--   industry_measures — the pack entries. NOT a business_metrics row:
--   this is the INDUSTRY-LEVEL claim that a measure carries money in an
--   industry — a hypothesis (proposed) until sourced at enough accounts
--   to call it a conclusion (ratified). An account's business_metrics
--   row is an INSTANCE of it at one institution. The whole pack rests on
--   keeping those two facts separate: one customer's metric is not the
--   industry's claim.
--
--   business_metrics.industry_measure_id — the link that makes
--   promotion COUNTABLE: "this industry measure has been sourced at N
--   institutions" becomes a query over this column. NULLABLE — an
--   account can track a measure no pack knows about, and forcing every
--   metric into a pack would invent a classification nobody made.
--
-- SEED: ten industries for the Skillsoft tenant, resolved by NAME, not
-- id — local and production tenant uuids differ, and that has bitten
-- before. Three deliberate divergences from Skillsoft's own list, kept
-- on the record rather than silently "corrected":
--
--   1. Skillsoft's own list spells it "Geospacial". Seeded CORRECTED to
--      "Geospatial". The divergence is deliberate, not a transcription
--      error.
--   2. Skillsoft lists "Defense Industry"; seeded as "Aerospace &
--      Defense", since Skillsoft's own channel content is titled "The
--      Aerospace and Defense Industry".
--   3. Skillsoft lists "Biotechnology" with no Pharmaceutical entry.
--      Combined here as "Pharmaceutical & Biotechnology", because a CDMO
--      sits in both and the sector is usually described as one. The
--      taxonomy is EXTENSIBLE: it starts from the tenant's vocabulary but
--      is not constrained by a content channel's organisation.
--
-- Trigger count: hardening.sql section 11 takes this 68 -> 74. See that
-- file for the industries / industry_measures governance decision and
-- the reconciled count.
-- ------------------------------------------------------------------
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "industries_tenant_slug_key" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "industry_measures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"direction" "metric_direction" NOT NULL,
	"definition" text NOT NULL,
	"status" "lifecycle_status" DEFAULT 'proposed' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"superseded_by_id" uuid,
	"steward_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "business_metrics" ADD COLUMN "industry_measure_id" uuid;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "industry_id" uuid;--> statement-breakpoint
ALTER TABLE "industries" ADD CONSTRAINT "industries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD CONSTRAINT "industry_measures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD CONSTRAINT "industry_measures_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD CONSTRAINT "industry_measures_steward_person_id_persons_id_fk" FOREIGN KEY ("steward_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD CONSTRAINT "industry_measures_superseded_by_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."industry_measures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "industries_tenant_idx" ON "industries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "industry_measures_tenant_idx" ON "industry_measures" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "industry_measures_industry_idx" ON "industry_measures" USING btree ("industry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "industry_measures_industry_name_key" ON "industry_measures" USING btree ("industry_id","name") WHERE "industry_measures"."deleted_at" IS NULL AND "industry_measures"."superseded_by_id" IS NULL;--> statement-breakpoint
ALTER TABLE "business_metrics" ADD CONSTRAINT "business_metrics_industry_measure_id_industry_measures_id_fk" FOREIGN KEY ("industry_measure_id") REFERENCES "public"."industry_measures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_metrics_industry_measure_idx" ON "business_metrics" USING btree ("industry_measure_id");

-- ------------------------------------------------------------------
-- Seed: the tenant's own industry taxonomy (see header)
-- ------------------------------------------------------------------
-- Resolved by NAME, not id: local and production tenant uuids differ.
-- seedOfferings.ts's resolveTenantId() hits the same requirement and
-- raises rather than guessing when the row isn't exactly one match — this
-- does the same, in SQL, since seeding here happens inside the migration
-- rather than a separate script.
--> statement-breakpoint
DO $$
DECLARE
  tenant_count int;
BEGIN
  SELECT count(*) INTO tenant_count FROM tenants WHERE name = 'Skillsoft';
  IF tenant_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one tenant named ''Skillsoft'', found %. Not guessing '
      'which one — resolve the tenant row before re-running this migration.',
      tenant_count;
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO industries (tenant_id, name, slug)
SELECT t.id, v.name, v.slug
FROM tenants t
CROSS JOIN (VALUES
  ('Aerospace & Defense',             'aerospace-defense'),
  ('Agriculture',                     'agriculture'),
  ('Capital Markets',                 'capital-markets'),
  ('Geospatial',                      'geospatial'),
  ('Healthcare',                      'healthcare'),
  ('Information Technology',          'information-technology'),
  ('Manufacturing',                   'manufacturing'),
  ('Pharmaceutical & Biotechnology',  'pharmaceutical-biotechnology'),
  ('Retail',                          'retail'),
  ('Telecommunications',              'telecommunications')
) AS v(name, slug)
WHERE t.name = 'Skillsoft';
