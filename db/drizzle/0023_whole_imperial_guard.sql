-- ------------------------------------------------------------------
-- 2.0 item 5, industry packs step 5 — capability_industry_measures: the
-- missing edge in the solution-to-measure chain.
--
-- MIGRATION ONLY. No routes, no demo data.
--
-- THE CHAIN HAD ONE MISSING EDGE:
--
--   offering -> capability          EXISTS: offering_capabilities, with
--                                   is_primary and a partial unique index
--   capability -> business_metric   EXISTS: value_outcomes ties them
--   capability -> industry_measure  MISSING, until this migration
--
-- Without it, nothing states WHICH INDUSTRY MEASURE a capability claims
-- to move. Curia's capability is named "New manager effectiveness" with
-- no description and no role family — created by the attachment route
-- with just a name, because nobody stated what capability was being
-- claimed. That is the content-shaped hypothesis visible in the data: a
-- capability named after a training topic, with nothing said about what
-- it changes.
--
-- `claim` IS REQUIRED and is the point of the table: the MECHANISM by
-- which this capability moves this measure. Not "improves lot
-- acceptance" but "deviation handling and batch-record execution are the
-- operator behaviours behind lot rejection." A link with no stated
-- mechanism is an assertion that two things are related; the mechanism
-- is what makes it checkable.
--
-- `claimed_by_person_id`, for the same reason classification
-- (institutions.industry_id, 0019) carries one: this is a judgement, and
-- a judgement with no author is the authored-prose problem this system
-- refuses.
--
-- NO is_primary. A capability may claim several measures and none is
-- privileged — unlike offering_capabilities, where one offering has a
-- primary capability. That asymmetry is deliberate, not a gap: an
-- offering's capabilities compete for which one the offering is really
-- for, but a capability's claims on industry measures don't compete with
-- each other the same way — a manager-effectiveness capability can
-- plausibly move a time-to-productivity measure and a quality measure at
-- once, and ranking one "primary" would assert an ordering nobody has
-- judged.
--
-- INSERT-ONLY. No deleted_at, no superseded_by_id, no status, no
-- version. A claim was made; that is a fact. To withdraw it, supersede
-- the CAPABILITY — not this row.
--
-- SURROGATE id, UNLIKE offering_capabilities' pure composite key — a
-- deliberate divergence, not an inconsistency with "this follows
-- offering_capabilities' shape." offering_capabilities records a
-- STRUCTURAL ATTACHMENT: nobody's judgement is on the line, so there is
-- nothing for an audit trail to be worth, and hardening.sql leaves it
-- (along with value_outcome_evidence, person_roles, reflection_evidence)
-- deliberately ungoverned — see its "Known ungoverned tables" note.
-- This table records a JUDGEMENT WITH AN AUTHOR, and a judgement with no
-- audit trail defeats the point of claimed_by_person_id. lvrf_audit()
-- hardcodes NEW.id::text, so a table wanting _audit needs a real id
-- column; the natural key (capability_id, industry_measure_id) is kept
-- as a UNIQUE constraint instead of the primary key, so "one claim per
-- capability+measure pair" is enforced exactly as it would be under a
-- composite PK. This SIDESTEPS hardening.sql's ungoverned-tables gap —
-- it does not close it; offering_capabilities and the other three still
-- have no _audit, and a general fix (a composite-key-aware audit
-- function, or a surrogate id on each) remains a separate, undecided
-- question. This migration only gives ITS OWN table an id, because this
-- table's content genuinely wants one.
--
-- Trigger count: hardening.sql section 13 takes this 76 -> 78. See that
-- file for the governance decision and the reconciled count.
-- ------------------------------------------------------------------
CREATE TABLE "capability_industry_measures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability_id" uuid NOT NULL,
	"industry_measure_id" uuid NOT NULL,
	"claim" text NOT NULL,
	"claimed_by_person_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_industry_measures_pair_key" UNIQUE("capability_id","industry_measure_id")
);
--> statement-breakpoint
ALTER TABLE "capability_industry_measures" ADD CONSTRAINT "capability_industry_measures_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_industry_measures" ADD CONSTRAINT "capability_industry_measures_industry_measure_id_industry_measures_id_fk" FOREIGN KEY ("industry_measure_id") REFERENCES "public"."industry_measures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_industry_measures" ADD CONSTRAINT "capability_industry_measures_claimed_by_person_id_persons_id_fk" FOREIGN KEY ("claimed_by_person_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capability_industry_measures_measure_idx" ON "capability_industry_measures" USING btree ("industry_measure_id");