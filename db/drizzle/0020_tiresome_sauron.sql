-- ------------------------------------------------------------------
-- 2.0 item 5 — industry packs, step 2: industry_measures gets five more
-- required fields; industry_measure_exclusions is new.
--
-- WHY: 0019 gave industry_measures name, unit, direction, definition and
-- status. Three research runs — CDMO, Manufacturing, and Healthcare
-- providers — showed that was not enough to make an entry usable. Nothing
-- writes to this table yet, so tightening it now costs nothing.
--
-- FIVE NEW COLUMNS ON industry_measures, ALL NOT NULL:
--
--   why_it_pays — the commercial argument, and the field an account
--   manager reads aloud. TRIR feeding the workers' compensation
--   experience modification rate for three years at a time is worth more
--   than the metric's name.
--
--   addressable + addressable_reasoning — the whole pack turns on this
--   pair. Healthcare's salaries-and-benefits ratio came back FALSE: the
--   denominator is set by payer contract rates, so a rate increase
--   lowers it with no change in labour behaviour at all. That is the
--   measure a learning vendor would MOST want to claim, and the honest
--   answer is no.
--
--   confounders — NOT NULLABLE. A measure with no stated confounders is a
--   measure nobody thought about. The healthcare run is where this
--   earned its place: raw ALOS is a trap, because a hospital winning
--   higher-acuity volume sees length of stay RISE while performing
--   better; and A/R days "can be improved by writing off aged accounts
--   rather than collecting them." A pack entry that hides its own misuse
--   is worse than no entry.
--
--   citation — a proposed measure without one is a guess wearing a
--   schema.
--
-- ADDRESSABLE = FALSE ENTRIES STAY IN THE PACK — counter-intuitive, so
-- stated plainly. They are NOT moved to industry_measure_exclusions. A
-- measure tested and KEPT with addressable = false is a different fact
-- from one tested and REJECTED. If the pack held only addressable
-- measures, healthcare's salaries-and-benefits entry would vanish, and
-- the next person to open the pack would propose it again, because it is
-- the obvious thing to propose — the pack would have tested it, learned
-- it does not hold, and then forgotten. It is also commercially
-- stronger: an account manager who can say "we deliberately do not claim
-- against your labour ratio, because your payer rates move it more than
-- we can" is more credible than one who claims everything. The refusal
-- is the product.
--
-- NEW TABLE industry_measure_exclusions: measures tested and REJECTED for
-- an industry, kept so the same wrong proposal is not made twice — the
-- same argument that produced refusals (0016/hardening.sql section 8):
-- the system otherwise forgets everything it declines. Insert-only, same
-- shape as refusals: no deleted_at, no superseded_by_id, no status, no
-- version — a rejection happened; that is a fact. citation is nullable
-- here, unlike industry_measures': a rejected measure is often a real
-- measure with a real source that simply does not hold for this
-- industry, but not always one anyone bothered to cite before rejecting
-- it.
--
-- DOES NOT SEED any measures or exclusions. The three research runs are
-- data a person reviews and accepts, and accepting them is a separate act
-- from creating the schema — the same reason 0019 added
-- institutions.industry_id NULL on every row instead of migrating
-- institutions.industry into it.
--
-- Trigger count: hardening.sql section 12 takes this 74 -> 76. See that
-- file for the industry_measure_exclusions governance decision and the
-- reconciled count.
-- ------------------------------------------------------------------
CREATE TABLE "industry_measure_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"name" text NOT NULL,
	"reason" text NOT NULL,
	"citation" text,
	"excluded_by_person_id" uuid NOT NULL,
	"excluded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "industry_measure_exclusions_industry_name_key" UNIQUE("industry_id","name")
);
--> statement-breakpoint
ALTER TABLE "industry_measures" ADD COLUMN "why_it_pays" text NOT NULL;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD COLUMN "addressable" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD COLUMN "addressable_reasoning" text NOT NULL;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD COLUMN "confounders" text NOT NULL;--> statement-breakpoint
ALTER TABLE "industry_measures" ADD COLUMN "citation" text NOT NULL;--> statement-breakpoint
ALTER TABLE "industry_measure_exclusions" ADD CONSTRAINT "industry_measure_exclusions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_measure_exclusions" ADD CONSTRAINT "industry_measure_exclusions_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industry_measure_exclusions" ADD CONSTRAINT "industry_measure_exclusions_excluded_by_person_id_persons_id_fk" FOREIGN KEY ("excluded_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "industry_measure_exclusions_tenant_idx" ON "industry_measure_exclusions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "industry_measure_exclusions_industry_idx" ON "industry_measure_exclusions" USING btree ("industry_id");
