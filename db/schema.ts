/**
 * LVRF — Canonical Object Schema
 * Learning Value Realization Framework · A Chapel of the Rule76 Living Cathedral
 *
 * v0.2 — vendor-facing. See CLAUDE.md amendments A8 / A9.
 *
 * Primary workflow is the VALUE SPINE, walked by a value engineer:
 *   baseline -> attach -> model -> commit -> measure -> verify -> return
 *
 * The LEARNING SPINE (13 stages) nests inside attach/measure as the mechanism
 * that produces the capability change. It is not the primary workflow.
 *
 * Constraints here are load-bearing. Read CLAUDE.md before editing.
 */

import { sql } from 'drizzle-orm';
import {
  pgTable, pgEnum, uuid, text, numeric, integer, boolean,
  timestamp, date, jsonb, bigserial, index, unique, uniqueIndex, check, primaryKey, foreignKey,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/* ================================================================== */
/* Enums                                                              */
/* ================================================================== */

/** The value spine. Primary workflow. Mirrors CVAF's ECC spine. */
export const valueStage = pgEnum('value_stage', [
  'baseline',  // establish the customer's current-state metric from their source system
  'attach',    // attach a capability to that metric — the hypothesis
  'model',     // model target and financial impact
  'commit',    // the customer agrees the target is the right one
  'measure',   // a measured actual arrives from the customer's system of record
  'verify',    // a named human confirms sources and the delta
  'return',    // the finding returns to the portfolio and to Rule76
]);

/** The learning spine. 13 stages; terminal stage is a write. See A1. */
export const learningStage = pgEnum('learning_stage', [
  'observe', 'assess', 'understand', 'plan', 'learn', 'practice',
  'reflect', 'demonstrate', 'measure', 'preserve', 'improve',
  'teach', 'return_to_rule76',
]);

/** Ratified precedes active. See A2, A3. */
export const lifecycleStatus = pgEnum('lifecycle_status', [
  'draft', 'proposed', 'rejected', 'ratified',
  'active', 'superseded', 'retired', 'archived',
]);

export const confidenceLevel = pgEnum('confidence_level', ['low', 'medium', 'high']);

export const realizationStatus = pgEnum('realization_status', [
  'claimed',      // a target exists; no measured actual
  'measured',     // an actual arrived, not yet verified
  'verified',     // a named human confirmed sources and delta
  'not_realized', // measured, and the target was not met
]);

/** Is an increase good or bad? Without this you cannot compute improvement. */
export const metricDirection = pgEnum('metric_direction', ['increase', 'decrease']);

export const evidenceKind = pgEnum('evidence_kind', [
  'assessment_result', 'system_export', 'artifact',
  'observation', 'attestation', 'public_filing', 'vendor_publication',
]);

/**
 * Account workbench. What an institution_facts row states. Two numeric
 * kinds and two text kinds; the CHECKs on institution_facts hold each kind
 * to its shape. `system` is one row per system ("Workday (HRIS)"), not a
 * list in prose — a list in prose cannot be superseded one entry at a time.
 */
export const institutionFactKind = pgEnum('institution_fact_kind', [
  'revenue', 'headcount', 'stated_priority', 'system',
  // 0033 (Q4h): the account's disclosure regime (3.0 item 4's minimum) —
  // value_text is one of four labels (institution_facts_regime_shape).
  'disclosure_regime',
]);

export const returnKind = pgEnum('return_kind', [
  'lesson_learned', 'capability_update', 'knowledge_artifact',
  'lever_pattern', 'constitutional_amendment',
]);

/** Who may see a rendered record. Drives the visible disclosure banner. */
export const documentDisclosure = pgEnum('document_disclosure', [
  'draft', 'internal', 'customer_shared',
]);

export const personRole = pgEnum('person_role', [
  // vendor-side (tenant-scoped) — primary users
  'value_engineer', 'account_executive', 'revenue_leader', 'ai_steward',
  // 0001 — HB-0016 requires a named human verifier and the enum had no value for
  // one. Deliberately named by FUNCTION not department: the authority may sit in
  // Finance, Internal Audit or RevOps. Separation of duties: a value_verifier
  // must not also be the metric_owner for the same metric, and for a customer's
  // metric must be institution-scoped. Enforced in the API, not the schema.
  'value_verifier',
  // customer-side (institution-scoped) — subjects and approvers
  'learner', 'coach', 'metric_owner', 'executive_sponsor',
  // governance
  'rule76_steward', 'administrator',
]);

/** Seven constitutional categories. HEARTBEAT-REGISTER §6. */
export const heartbeatCategory = pgEnum('heartbeat_category', [
  'operational', 'governance', 'integrity', 'financial',
  'learning', 'security', 'constitutional',
]);

/** HEARTBEAT-REGISTER §8 / COMPASS-HEARTBEAT-STATUS §8. */
export const healthState = pgEnum('health_state', [
  'healthy', 'watch', 'warning', 'critical', 'constitutional_failure',
]);

export const auditOperation = pgEnum('audit_operation', ['insert', 'update', 'soft_delete']);

/**
 * 2.0 item 5. Three states, not two: a field nobody has looked at yet is not
 * rejected. Same absent-versus-simulated distinction as elsewhere in this
 * schema — see research_results below.
 */
export const researchReviewState = pgEnum('research_review_state', [
  'pending', 'accepted', 'rejected',
]);

/**
 * 2.0 item 5, industry packs step 3. research_results (0018) was designed
 * for ONE shape: a published figure for one metric at one institution,
 * scalar value + citation. A pack measure is a richer object — see
 * industryMeasures below — that does not fit those scalar columns. Two
 * shapes landing in one table with no discriminant is how a parser starts
 * guessing; this enum is the discriminant. NO DEFAULT on the column that
 * carries it — see research_results below.
 */
export const researchResultKind = pgEnum('research_result_kind', [
  'metric_value',     // a published figure for one metric at one institution. Scalar: value + citation.
  'industry_measure', // a candidate pack entry for an industry. Rich shape, carried in raw_response.
  'institution_fact', // 0033 (Q4h): one researched field about an account — a fact, its entity, its regime, or a not-found.
]);

/** 0034 (Q4h): what makes an entity unambiguous (3.0 item 3's minimum). */
export const entityIdentifierType = pgEnum('entity_identifier_type', ['sec_cik', 'ticker', 'registry']);

/** 0034 (Q4h): an account research prompt asks for the entity first, then facts. */
export const researchPromptPhase = pgEnum('research_prompt_phase', ['entity', 'facts']);

/** 0034 (Q4h, L8): who refused — the database (a constraint) or the parser (a 422). */
/**
 * Who refused. 'route' (0035, O1): a request the ROUTE refuses before any
 * write is attempted — e.g. an effect size sent with a value lever, which
 * has nowhere to land (LVRF_PLAN §5, no invented targets) — recorded so
 * the attempt stands on record, as a parser refusal does.
 */
export const refusalSource = pgEnum('refusal_source', ['database', 'parser', 'route']);

/* ================================================================== */
/* Shared builders                                                    */
/* ================================================================== */

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

/** Governance columns on every governed object. Provenance/confidence excluded — see A4. */
const governance = () => ({
  status: lifecycleStatus('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  supersededById: uuid('superseded_by_id'),
  stewardPersonId: uuid('steward_person_id')
    .references((): AnyPgColumn => persons.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/* ================================================================== */
/* Tenant — the vendor operating the framework                        */
/* ================================================================== */

/**
 * A9. The vendor running LVRF across many customer institutions from one seat.
 * Root of the multi-tenant scope.
 */
export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  /** True when the tenant is also measuring itself. Customer zero. */
  isSelfMeasuring: boolean('is_self_measuring').notNull().default(false),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'tenants_superseded_by_fk' }).onDelete('restrict'),unique('tenants_name_key').on(t.name)]);

/* ================================================================== */
/* Institution — a customer of the tenant                             */
/* ================================================================== */

export const institutions = pgTable('institutions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  industry: text('industry'),
  /**
   * 2.0 item 5, industry packs step 1. `industry` (above) is WHAT WAS
   * STATED AT INTAKE; this is WHAT IT WAS CLASSIFIED AS against the
   * tenant's industries taxonomy. Classification is a judgement a person
   * makes, so this migration adds the column NULL on every row and leaves
   * it there — asserting a classification here would be exactly the
   * fabrication this system refuses. An unmapped institution has no pack;
   * that is an honest state, not a gap to backfill silently.
   */
  industryId: uuid('industry_id').references((): AnyPgColumn => industries.id, { onDelete: 'restrict' }),
  /**
   * Account workbench. The account's website, as entered at creation.
   * Nullable — an account with no known website is honest, a guessed one
   * is not. Written only by POST /api/account-inputs; there is no update
   * path, same as name and industry.
   */
  website: text('website'),
  /** True when this institution IS the tenant — the customer-zero engagement. */
  isTenantSelf: boolean('is_tenant_self').notNull().default(false),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'institutions_superseded_by_fk' }).onDelete('restrict'),
  unique('institutions_tenant_name_key').on(t.tenantId, t.name),
  index('institutions_tenant_idx').on(t.tenantId),
  check('institutions_website_is_url',
    sql`${t.website} IS NULL OR ${t.website} ~ '^https?://[^[:space:]]+$'`),
]);

/* ================================================================== */
/* Person + roles                                                     */
/* ================================================================== */

/**
 * A5 — one identity object; Learner/Coach/Steward are roles.
 *
 * A person belongs to EXACTLY ONE of tenant (vendor staff) or institution
 * (customer staff). Enforced by CHECK, because getting this wrong leaks a
 * customer's people into a vendor's roster.
 */
export const persons = pgTable('persons', {
  id: id(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'restrict' }),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  title: text('title'),
  /**
   * Persons currently disclose synthetic status via a '[SIM]' prefix in
   * full_name. A prefix convention is not a constraint — nothing enforces
   * it and no constraint can read it. value_outcomes_verified_requires_human
   * checks that a verifier is NAMED, not that they are REAL, so a synthetic
   * actor currently satisfies it.
   */
  simulated: boolean('simulated').notNull().default(false),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'persons_superseded_by_fk' }).onDelete('restrict'),
  check(
    'persons_scoped_to_exactly_one',
    sql`(${t.tenantId} IS NOT NULL)::int + (${t.institutionId} IS NOT NULL)::int = 1`,
  ),
  unique('persons_email_key').on(t.email),
  index('persons_tenant_idx').on(t.tenantId),
  index('persons_institution_idx').on(t.institutionId),
]);

export const personRoles = pgTable('person_roles', {
  personId: uuid('person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  role: personRole('role').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.personId, t.role] })]);

/* ================================================================== */
/* Engagement — the unit of work                                      */
/* ================================================================== */

/**
 * A9. A tenant engaging an institution. Everything a value engineer does happens
 * inside an engagement, and the engagement carries the value stage.
 */
export const engagements = pgTable('engagements', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  /** The value engineer of record. Vendor-side. */
  ownerPersonId: uuid('owner_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  accountExecutivePersonId: uuid('account_executive_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  /** Customer-side sponsor who can commit to a target. */
  sponsorPersonId: uuid('sponsor_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  valueStage: valueStage('value_stage').notNull().default('baseline'),
  renewalDate: timestamp('renewal_date', { withTimezone: true }),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'engagements_superseded_by_fk' }).onDelete('restrict'),
  index('engagements_tenant_idx').on(t.tenantId),
  index('engagements_institution_idx').on(t.institutionId),
  index('engagements_stage_idx').on(t.valueStage),
]);

/* ================================================================== */
/* Business metric — the customer's own number                        */
/* ================================================================== */

/**
 * The metric must be one the customer ALREADY reports. `sourceSystem` is not
 * optional metadata — it is the provenance claim the whole record rests on. A
 * metric with no named source cannot produce a defensible outcome.
 */
export const businessMetrics = pgTable('business_metrics', {
  id: id(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  direction: metricDirection('direction').notNull(),
  /** Where the number comes from. Required. */
  sourceSystem: text('source_system').notNull(),
  /** Customer-side owner of the number. */
  ownerPersonId: uuid('owner_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  reportingCadence: text('reporting_cadence'),
  definitionNotes: text('definition_notes'),
  /**
   * confidenceModel.ts's metric_definition_confirmed factor (20 of 100
   * points, binary) is earned only when BOTH are set: definition_notes is
   * present AND a real, non-simulated person has confirmed it. Neither
   * column alone is sufficient — a confirmation without notes documents
   * nothing, and notes without a confirmer are unattested. No boolean
   * flag: presence of the pair IS the flag, same pattern as
   * evidence.attested_by_person_id / attested_at. Nullable, and never
   * backfilled — no existing metric has been confirmed by anyone, and
   * asserting otherwise would fabricate exactly what this measures.
   */
  definitionConfirmedByPersonId: uuid('definition_confirmed_by_person_id')
    .references(() => persons.id, { onDelete: 'restrict' }),
  definitionConfirmedAt: timestamp('definition_confirmed_at', { withTimezone: true }),
  /**
   * 2.0 item 5, industry packs step 1. NULLABLE: an account can track
   * something no pack knows about, and forcing every metric into a pack
   * would invent a classification nobody made. This link is what makes
   * promotion COUNTABLE — "this industry measure has been sourced at N
   * institutions" is a query over it.
   */
  industryMeasureId: uuid('industry_measure_id')
    .references((): AnyPgColumn => industryMeasures.id, { onDelete: 'restrict' }),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'business_metrics_superseded_by_fk' }).onDelete('restrict'),
  // No unique index on (institution_id, name) — 0014's partial version
  // (WHERE deleted_at IS NULL AND superseded_by_id IS NULL) still cannot
  // hold. validateMetric.ts inserts the successor row BEFORE marking the
  // ancestor superseded, so for that instant both rows are
  // superseded_by_id IS NULL and match the same predicate — Postgres
  // cannot defer a unique INDEX to end-of-statement/transaction the way it
  // can a deferrable UNIQUE CONSTRAINT, and a deferrable UNIQUE CONSTRAINT
  // cannot carry a WHERE clause. No index formulation permits the
  // transient state a two-step supersession requires.
  //
  // A metric's identity is its id; name is a label, and a chain of rows
  // sharing a label is what supersession looks like. Uniqueness among
  // current (non-superseded, non-deleted) rows is now an application
  // invariant, not a database one: validateMetric.ts refuses to supersede
  // an already-superseded metric (409), and every name-based lookup that
  // resolves "the current metric" must filter superseded_by_id IS NULL
  // itself — see valueOutcomes.ts's business_metrics lookup.
  index('business_metrics_institution_idx').on(t.institutionId),
  index('business_metrics_industry_measure_idx').on(t.industryMeasureId),
  /** A confirmer with no date, or a date with no confirmer, is a half-recorded fact. */
  check('business_metrics_definition_confirmation_is_complete',
    sql`(${t.definitionConfirmedByPersonId} IS NULL AND ${t.definitionConfirmedAt} IS NULL)
        OR (${t.definitionConfirmedByPersonId} IS NOT NULL AND ${t.definitionConfirmedAt} IS NOT NULL)`),
]);

/* ================================================================== */
/* Industry — the tenant's own industry taxonomy                      */
/* ================================================================== */

/**
 * 2.0 item 5, industry packs step 1. TENANT-SCOPED, not global: this
 * taxonomy is drawn from Skillsoft's own industry content-channel list, and
 * another vendor running LVRF would have a different one — these are not
 * industry-standard codes (SIC/NAICS), they are one tenant's vocabulary.
 * See db/drizzle/0019_*.sql for the seed and its three deliberate
 * divergences from Skillsoft's own channel spelling/grouping.
 *
 * REFERENCE DATA, not a governed business object: no status/version/
 * superseded_by_id/timestamps. An industry is added by inserting a row, not
 * by a lifecycle a value engineer walks — the taxonomy is EXTENSIBLE (a new
 * industry is just a new row) but not itself something with a draft/ratify/
 * retire arc. hardening.sql gives it _audit and _no_delete only; there is
 * no updated_at for _touch to stamp and no superseded_by_id for
 * _supersession_sane to police. See hardening.sql for the full reasoning.
 */
export const industries = pgTable('industries', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
}, (t) => [
  unique('industries_tenant_slug_key').on(t.tenantId, t.slug),
  index('industries_tenant_idx').on(t.tenantId),
]);

/* ================================================================== */
/* Industry measure — the pack entry                                  */
/* ================================================================== */

/**
 * 2.0 item 5, industry packs step 1. NOT a business_metrics row. This is
 * the INDUSTRY-LEVEL claim that a measure carries money in an industry — a
 * hypothesis until sourced, a conclusion once ratified. An account's
 * business_metrics row is an INSTANCE of it at one institution. The whole
 * pack rests on that distinction: collapsing the two would let one
 * customer's metric stand in for the industry's claim, which is the
 * anecdote-as-fact failure the N=2 ratification threshold (enforced by a
 * future writer, not by this schema) exists to prevent.
 *
 * Reuses governance() but overrides its status default: 'proposed', not
 * 'draft' — a pack entry starts life as a hypothesis, not a draft. Only
 * 'proposed' and 'ratified' are used from lifecycle_status today.
 *
 * 2.0 item 5, industry packs STEP 2. Three research runs (CDMO,
 * Manufacturing, Healthcare providers) showed name/unit/direction/
 * definition was not enough to make an entry usable, so five more fields
 * are required — ALL FIVE NOT NULL, because nothing writes to this table
 * yet and tightening it now costs nothing. See each field's comment below
 * for why it earned its place, and db/drizzle/0020_*.sql for the full
 * argument.
 *
 * ADDRESSABLE = FALSE ENTRIES STAY IN THE PACK. They are NOT moved to
 * industry_measure_exclusions. A measure tested and KEPT with
 * addressable = false is a different fact from one tested and REJECTED:
 * healthcare's salaries-and-benefits ratio is exactly this case — the
 * obvious measure to propose, tested, and found not to hold. If it were
 * dropped from the pack instead of kept at addressable = false, the next
 * person to open the pack would propose it again, because it is still the
 * obvious thing to propose — the pack would have tested it, learned it
 * does not hold, and then forgotten. It is also commercially stronger: an
 * account manager who can say "we deliberately do not claim against your
 * labour ratio, because your payer rates move it more than we can" is
 * more credible than one who claims everything. The refusal is the
 * product.
 */
export const industryMeasures = pgTable('industry_measures', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  industryId: uuid('industry_id').notNull().references(() => industries.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  direction: metricDirection('direction').notNull(),
  definition: text('definition').notNull(),
  /**
   * The commercial argument, and the field an account manager reads
   * aloud. TRIR feeding the workers' compensation experience modification
   * rate for three years at a time is worth more than the metric's name.
   */
  whyItPays: text('why_it_pays').notNull(),
  /**
   * The whole pack turns on this pair. Healthcare's salaries-and-benefits
   * ratio came back FALSE: the denominator is set by payer contract
   * rates, so a rate increase lowers it with no change in labour
   * behaviour at all — the measure a learning vendor would MOST want to
   * claim, and the honest answer is no. See the table comment above for
   * why a false here does not remove the row.
   */
  addressable: boolean('addressable').notNull(),
  addressableReasoning: text('addressable_reasoning').notNull(),
  /**
   * NOT NULLABLE. A measure with no stated confounders is a measure
   * nobody thought about. Healthcare is where this earned its place: raw
   * ALOS is a trap, because a hospital winning higher-acuity volume sees
   * length of stay RISE while performing better; A/R days "can be
   * improved by writing off aged accounts rather than collecting them."
   * A pack entry that hides its own misuse is worse than no entry.
   */
  confounders: text('confounders').notNull(),
  /** A proposed measure without one is a guess wearing a schema. */
  citation: text('citation').notNull(),
  ...governance(),
  status: lifecycleStatus('status').notNull().default('proposed'),
  /**
   * 0032 (Q4c1b). Who retired this entry, and why — set by
   * POST /api/industry-measures/:id/retire (steward-only) together with
   * deleted_at and status 'retired', never apart
   * (industry_measures_retirement_is_complete). A retired entry is shown
   * on the pack page, not hidden; its accepted research result stays
   * accepted. A retired name can return only through a new accepted
   * result (the unique name index is partial over current entries).
   */
  retiredByPersonId: uuid('retired_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  retirementReason: text('retirement_reason'),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'industry_measures_superseded_by_fk' }).onDelete('restrict'),
  /** 0032: retired means all four marks together — deleted_at, status, who, why (≥ 12 chars) — or none of them. */
  check('industry_measures_retirement_is_complete',
    sql`(${t.deletedAt} IS NULL AND ${t.retiredByPersonId} IS NULL AND ${t.retirementReason} IS NULL
         AND ${t.status} <> 'retired')
        OR (${t.deletedAt} IS NOT NULL AND ${t.status} = 'retired' AND ${t.retiredByPersonId} IS NOT NULL
            AND char_length(btrim(${t.retirementReason})) >= 12)`),
  index('industry_measures_tenant_idx').on(t.tenantId),
  index('industry_measures_industry_idx').on(t.industryId),
  // Partial unique index, same technique as 0014's business_metrics index —
  // and the same latent gap: 0014's was DROPPED in 0015 because a two-step
  // supersession (insert the successor, THEN mark the ancestor superseded)
  // makes both rows momentarily match this predicate, and no index
  // formulation survives that transient state (see the comment on
  // businessMetrics above for the full argument). No supersession writer
  // exists yet for industry_measures — this migration is schema-only — so
  // the failure mode is latent, not active. Whoever writes the
  // promotion/demotion path must read that comment before reusing
  // business_metrics' two-step pattern here.
  uniqueIndex('industry_measures_industry_name_key').on(t.industryId, t.name)
    .where(sql`${t.deletedAt} IS NULL AND ${t.supersededById} IS NULL`),
]);

/* ================================================================== */
/* Industry measure exclusion — a measure tested and rejected          */
/* ================================================================== */

/**
 * 2.0 item 5, industry packs step 2. Measures tested and REJECTED for an
 * industry, kept so the same wrong proposal is not made twice — the same
 * argument that produced refusals: the system otherwise forgets everything
 * it declines. NOT the same fact as industry_measures.addressable = false:
 * that is a measure KEPT in the pack because the test itself is a useful
 * finding; this is a measure that does not belong in the pack at all.
 *
 * Insert-only, same shape as refusals: no deleted_at, no superseded_by_id,
 * no status, no version. A rejection happened; that is a fact, not a
 * claim with a lifecycle. citation is nullable, unlike industry_measures' —
 * a rejected measure is often a real measure with a real source that
 * simply does not hold for this industry, but not always one anyone
 * bothered to cite before rejecting it.
 */
export const industryMeasureExclusions = pgTable('industry_measure_exclusions', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  industryId: uuid('industry_id').notNull().references(() => industries.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  /** Why it was rejected. */
  reason: text('reason').notNull(),
  /** Often a real measure with a real source that simply does not hold. */
  citation: text('citation'),
  excludedByPersonId: uuid('excluded_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  excludedAt: timestamp('excluded_at', { withTimezone: true }).notNull().defaultNow(),
  /**
   * 0026. When a research run proposed this exclusion, which tool ran it
   * and what it said — VERBATIM, kept apart from `reason`. `reason` is the
   * person's judgement (excluded_by_person_id is NOT NULL for that reason);
   * the proposal is the agent's. Merging them would let an agent's prose
   * stand as a person's decision. Both or neither: a proposal with no
   * named tool, or a tool with nothing it proposed, is half a fact.
   */
  proposedByResearchTool: text('proposed_by_research_tool'),
  proposalText: text('proposal_text'),
}, (t) => [
  unique('industry_measure_exclusions_industry_name_key').on(t.industryId, t.name),
  check('industry_measure_exclusions_proposal_is_complete',
    sql`(${t.proposedByResearchTool} IS NULL AND ${t.proposalText} IS NULL)
        OR (${t.proposedByResearchTool} IS NOT NULL AND btrim(${t.proposedByResearchTool}) <> ''
            AND ${t.proposalText} IS NOT NULL AND btrim(${t.proposalText}) <> '')`),
  index('industry_measure_exclusions_tenant_idx').on(t.tenantId),
  index('industry_measure_exclusions_industry_idx').on(t.industryId),
]);

/* ================================================================== */
/* Capability                                                         */
/* ================================================================== */

export const capabilities = pgTable('capabilities', {
  id: id(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description'),
  /** Role family the capability applies to, e.g. "enterprise account executive". */
  roleFamily: text('role_family'),
  /** Every capability has an owner. Volume II's Definition of Success, enforced. */
  ownerPersonId: uuid('owner_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'capabilities_superseded_by_fk' }).onDelete('restrict'),index('capabilities_institution_idx').on(t.institutionId)]);

/* ================================================================== */
/* Assessment — mechanism, not primary workflow                       */
/* ================================================================== */

/** Zero is a legitimate score. NOT NULL with a CHECK range that includes zero. */
export const assessments = pgTable('assessments', {
  id: id(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  learnerPersonId: uuid('learner_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  capabilityId: uuid('capability_id').notNull().references(() => capabilities.id, { onDelete: 'restrict' }),

  score: numeric('score', { precision: 8, scale: 3 }).notNull(),
  scaleMin: numeric('scale_min', { precision: 8, scale: 3 }).notNull().default('0'),
  scaleMax: numeric('scale_max', { precision: 8, scale: 3 }).notNull().default('5'),

  /** A human is the assessor of record. The Copilot may draft; it may not score. */
  assessedByPersonId: uuid('assessed_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  aiAssisted: boolean('ai_assisted').notNull().default(false),

  assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
  learningStage: learningStage('learning_stage'),
  notes: text('notes'),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'assessments_superseded_by_fk' }).onDelete('restrict'),
  check('assessments_score_in_range', sql`${t.score} >= ${t.scaleMin} AND ${t.score} <= ${t.scaleMax}`),
  check('assessments_scale_sane', sql`${t.scaleMax} > ${t.scaleMin}`),
  index('assessments_learner_idx').on(t.learnerPersonId),
  index('assessments_capability_idx').on(t.capabilityId),
]);

/* ================================================================== */
/* Evidence                                                           */
/* ================================================================== */

export const evidence = pgTable('evidence', {
  id: id(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  kind: evidenceKind('kind').notNull(),
  summary: text('summary').notNull(),

  /** Required. Evidence without a source is an assertion. */
  provenance: text('provenance').notNull(),
  /** Citation, filing reference, export ID, or URL. */
  sourceReference: text('source_reference'),
  confidence: confidenceLevel('confidence').notNull().default('medium'),
  /** The disclosure gate. False means the record renders as unverified. */
  sourceVerified: boolean('source_verified').notNull().default(false),
  /**
   * Simulated evidence is currently disclosed by a '[SIM]' prefix convention
   * in the free-text provenance column. A convention in prose is not a
   * constraint — nothing enforces it and nothing can read it. This column
   * makes the disclosure a stored fact the gate can act on.
   */
  simulated: boolean('simulated').notNull().default(false),

  assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'restrict' }),
  capturedByPersonId: uuid('captured_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),

  /**
   * Who puts their name to the claim that this evidence says what it says.
   *
   * DISTINCT from capturedByPersonId, which is whoever entered it — normally
   * the value engineer. Attestation credit (0.6) requires the attester be
   * institution-scoped and non-synthetic: a vendor capturing a customer's
   * export is not the customer attesting to it.
   *
   * Independent of `kind`. An assessment_result may be attested; a coach
   * signing that scores are accurate does not make the artifact an
   * attestation document. simulate_spine.py has always gated on
   * `kind == 'attestation' OR attested_by`.
   */
  attestedByPersonId: uuid('attested_by_person_id')
    .references(() => persons.id, { onDelete: 'restrict' }),
  attestedAt: timestamp('attested_at', { withTimezone: true }),

  /* ── AMENDMENT-005 · governed research ─────────────────────────── */
  /** Located by a model rather than a person. */
  aiSourced: boolean('ai_sourced').notNull().default(false),
  /** The query that produced it. Required when aiSourced. */
  researchQuery: text('research_query'),
  /** Which system, and when. Required when aiSourced. */
  researchTool: text('research_tool'),
  /**
   * A named human OPENED the cited source and confirmed it says what the
   * summary claims. Not that the URL resolves — that the content matches.
   * This is the only control that catches a fabricated citation.
   */
  citationResolved: boolean('citation_resolved').notNull().default(false),
  citationResolvedByPersonId: uuid('citation_resolved_by_person_id')
    .references(() => persons.id, { onDelete: 'restrict' }),
  citationResolvedAt: timestamp('citation_resolved_at', { withTimezone: true }),
  ...governance(),
}, (t) => [
  check('evidence_ai_requires_query',
    sql`${t.aiSourced} = false
        OR (${t.researchQuery} IS NOT NULL AND ${t.researchTool} IS NOT NULL)`),
  check('evidence_resolution_requires_human',
    sql`${t.citationResolved} = false
        OR (${t.citationResolvedByPersonId} IS NOT NULL AND ${t.citationResolvedAt} IS NOT NULL)`),
  /** AI-sourced evidence cannot self-certify. AMD-005 Article III. */
  check('evidence_ai_verify_requires_resolution',
    sql`${t.sourceVerified} = false OR ${t.aiSourced} = false OR ${t.citationResolved} = true`),
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'evidence_superseded_by_fk' }).onDelete('restrict'),
  /** An attestation with no date, or a date with no attester, is a half-recorded fact. */
  check('evidence_attestation_is_complete',
    sql`(${t.attestedByPersonId} IS NULL AND ${t.attestedAt} IS NULL)
        OR (${t.attestedByPersonId} IS NOT NULL AND ${t.attestedAt} IS NOT NULL)`),
  index('evidence_institution_idx').on(t.institutionId),
  index('evidence_verified_idx').on(t.sourceVerified),
  index('evidence_attested_idx').on(t.attestedByPersonId),
]);

/* ================================================================== */
/* Institution fact — the account workbench's company inputs          */
/* ================================================================== */

/**
 * Account workbench. Revenue, headcount, stated priorities and the systems
 * landscape — the company inputs a baseline is argued against. Value spine
 * stage: baseline.
 *
 * PROVENANCE LIVES IN `evidence`, NOT HERE. evidence_id is NOT NULL and
 * UNIQUE: every fact is backed by exactly one evidence row, so the
 * existing disclosure gate applies unchanged — provenance NOT NULL,
 * source_reference, confidence, source_verified, and AMENDMENT-005's
 * ai_sourced rules. A revenue figure nobody sourced renders unverified
 * exactly as any other unsourced evidence does. Restating those columns
 * here would be a second, driftable gate.
 *
 * The evidence row must belong to the same institution. A CHECK cannot see
 * across tables, so POST /api/institutions/:id/facts writes both rows in
 * one transaction against one institution id; it is the only writer.
 *
 * Zero is data: value_numeric >= 0, and 0 is legitimate (a dormant
 * subsidiary with zero revenue is a fact). Corrections supersede; nothing
 * is updated in place. Two revenue rows with different as_of dates are
 * both current — a time series, not a conflict.
 */
/**
 * 0034 (Q4h) — the entity an account is, pinned before any researched fact
 * about it is accepted (3.0 item 3's minimum; the Zachry lesson). Legal name
 * plus ONE identifier that makes it unambiguous: an SEC CIK, a ticker, or a
 * registry number with its jurisdiction. Its provenance is an evidence row
 * (NOT NULL). Governed: a wrong entity is corrected by SUPERSESSION, never
 * edited; one current entity per account (the partial unique index).
 * Parse refuses a facts response about a different entity, naming both.
 * Not yet: parent and affiliate relationships, the run sealing its entity
 * (L4, item 10), website (L9) — Q7.
 */
export const institutionEntities = pgTable('institution_entities', {
  id: id(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  legalName: text('legal_name').notNull(),
  identifierType: entityIdentifierType('identifier_type').notNull(),
  identifier: text('identifier').notNull(),
  /** Required for a registry number (e.g. NZ for the Companies Office); null otherwise. */
  registryJurisdiction: text('registry_jurisdiction'),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id, { onDelete: 'restrict' }),
  capturedByPersonId: uuid('captured_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  /** Why this entity was corrected — set with superseded_by_id, never apart (as institution_facts, 0028). */
  supersessionReason: text('supersession_reason'),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'institution_entities_superseded_by_fk' }).onDelete('restrict'),
  // ONE CURRENT ENTITY PER ACCOUNT is NOT a partial unique index: a
  // correction inserts the successor THEN points the old row at it, and an
  // immediate index refuses the moment both are current (the 0014/0015
  // business_metrics lesson). It is the DEFERRED constraint trigger
  // institution_entities_one_current (hardening.sql section 19), checked
  // at commit.
  check('institution_entities_supersession_reason',
    sql`(${t.supersededById} IS NULL) = (${t.supersessionReason} IS NULL)
        AND (${t.supersessionReason} IS NULL OR length(btrim(${t.supersessionReason})) >= 12)`),
  unique('institution_entities_evidence_key').on(t.evidenceId),
  check('institution_entities_identifier_shape',
    sql`btrim(${t.legalName}) <> '' AND btrim(${t.identifier}) <> ''
        AND (${t.identifierType} <> 'registry' OR (${t.registryJurisdiction} IS NOT NULL AND btrim(${t.registryJurisdiction}) <> ''))
        AND (${t.identifierType} = 'registry' OR ${t.registryJurisdiction} IS NULL)
        AND (${t.identifierType} <> 'sec_cik' OR ${t.identifier} ~ '^[0-9]{10}$')`),
]);

export const institutionFacts = pgTable('institution_facts', {
  id: id(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  kind: institutionFactKind('kind').notNull(),
  valueNumeric: numeric('value_numeric'),
  valueText: text('value_text'),
  /** ISO 4217 for revenue; 'people' for headcount; NULL for text kinds. */
  unit: text('unit'),
  /** The date the fact describes — fiscal year end, filing date — not the capture date. */
  asOf: date('as_of').notNull(),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id, { onDelete: 'restrict' }),
  capturedByPersonId: uuid('captured_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  /**
   * 0028, fact supersession. WHY this row was replaced, stated by the person
   * who replaced it. Set in the same UPDATE as superseded_by_id, on the row
   * being replaced, and only then. The CHECK below holds both together:
   * a superseded fact always carries its reason, and a current fact never
   * carries one. Who and when are the audit log's UPDATE row and the
   * successor's captured_by / created_at; they are not restated here.
   */
  supersessionReason: text('supersession_reason'),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'institution_facts_superseded_by_fk' }).onDelete('restrict'),
  check('institution_facts_supersession_reason',
    sql`(${t.supersededById} IS NULL) = (${t.supersessionReason} IS NULL)
        AND (${t.supersessionReason} IS NULL OR length(btrim(${t.supersessionReason})) >= 12)`),
  unique('institution_facts_evidence_key').on(t.evidenceId),
  check('institution_facts_numeric_shape',
    sql`${t.kind} NOT IN ('revenue', 'headcount')
        OR (${t.valueNumeric} IS NOT NULL AND ${t.valueNumeric} >= 0 AND ${t.valueText} IS NULL)`),
  check('institution_facts_text_shape',
    sql`${t.kind} NOT IN ('stated_priority', 'system')
        OR (${t.valueText} IS NOT NULL AND btrim(${t.valueText}) <> ''
            AND ${t.valueNumeric} IS NULL AND ${t.unit} IS NULL)`),
  check('institution_facts_revenue_currency',
    sql`${t.kind} <> 'revenue' OR ${t.unit} ~ '^[A-Z]{3}$'`),
  /**
   * 0034 (Q4h): the disclosure regime is one of four labels, as text. The
   * kind is compared as text so this CHECK is safe in the same transaction
   * that adds the enum value (0033).
   */
  check('institution_facts_regime_shape',
    sql`${t.kind}::text <> 'disclosure_regime'
        OR (${t.valueText} IN ('public_filer', 'private', 'subsidiary_of_filer', 'public_sector')
            AND ${t.valueNumeric} IS NULL AND ${t.unit} IS NULL)`),
  check('institution_facts_headcount_whole_people',
    sql`${t.kind} <> 'headcount'
        OR (${t.unit} = 'people' AND ${t.valueNumeric} = trunc(${t.valueNumeric}))`),
  index('institution_facts_institution_idx').on(t.institutionId),
]);

/* ================================================================== */
/* Reflection — mechanism                                             */
/* ================================================================== */

export const reflections = pgTable('reflections', {
  id: id(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  authorPersonId: uuid('author_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  capabilityId: uuid('capability_id').references(() => capabilities.id, { onDelete: 'restrict' }),
  prompt: text('prompt').notNull(),
  body: text('body').notNull(),
  /** The Copilot may draft. Stewardship governs publication. */
  aiDrafted: boolean('ai_drafted').notNull().default(false),
  reviewedByPersonId: uuid('reviewed_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'reflections_superseded_by_fk' }).onDelete('restrict'),
  check(
    'reflections_human_review_before_ratification',
    sql`${t.status} NOT IN ('ratified','active') OR (${t.reviewedByPersonId} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL)`,
  ),
  index('reflections_author_idx').on(t.authorPersonId),
]);

export const reflectionEvidence = pgTable('reflection_evidence', {
  reflectionId: uuid('reflection_id').notNull().references(() => reflections.id, { onDelete: 'restrict' }),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id, { onDelete: 'restrict' }),
}, (t) => [primaryKey({ columns: [t.reflectionId, t.evidenceId] })]);

/* ================================================================== */
/* Value Outcome — the product                                        */
/* ================================================================== */

/**
 * The Realization Record's data. Same shape as CVAF's realization record —
 * claimed benefit, measured actual, evidence behind both. That correspondence is
 * the cross-Chapel contract, and Compass should be derived from these two tables
 * rather than declared ahead of them.
 */
export const valueOutcomes = pgTable('value_outcomes', {
  id: id(),
  engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),

  /** Value is always value OF a capability, measured ON a business metric. */
  capabilityId: uuid('capability_id').notNull().references(() => capabilities.id, { onDelete: 'restrict' }),
  businessMetricId: uuid('business_metric_id').notNull().references(() => businessMetrics.id, { onDelete: 'restrict' }),

  valueStage: valueStage('value_stage').notNull().default('baseline'),

  /** Zero is a legitimate baseline. */
  baselineValue: numeric('baseline_value', { precision: 18, scale: 4 }).notNull(),
  baselineMeasuredAt: timestamp('baseline_measured_at', { withTimezone: true }).notNull(),

  targetValue: numeric('target_value', { precision: 18, scale: 4 }),
  /** The commit stage: the customer agreed this target is the right one. */
  committedByPersonId: uuid('committed_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  committedAt: timestamp('committed_at', { withTimezone: true }),

  actualValue: numeric('actual_value', { precision: 18, scale: 4 }),
  actualMeasuredAt: timestamp('actual_measured_at', { withTimezone: true }),

  /**
   * Claimed vs realized are SEPARATE columns, not one.
   *
   * The confirmation gap engine cannot compute a dollar variance from a single
   * value — it needs the amount claimed at `commit` and the amount realized at
   * `verify`. A single column silently overwrites the claim with the outcome,
   * which erases the only evidence that the claim was ever wrong. That is the
   * exact record a finance function wants to see.
   */
  claimedCurrencyImpact: numeric('claimed_currency_impact', { precision: 18, scale: 2 }),
  realizedCurrencyImpact: numeric('realized_currency_impact', { precision: 18, scale: 2 }),
  currencyCode: text('currency_code').default('USD'),
  /** How the currency figure was derived. Required whenever one is stated. */
  impactBasis: text('impact_basis'),

  /**
   * The measurement date committed to, distinct from the date it arrived.
   * A practice that always delivers LATE is a different failure from one that
   * delivers SHORT, and without this the two are indistinguishable.
   */
  promisedMeasuredAt: timestamp('promised_measured_at', { withTimezone: true }),

  realization: realizationStatus('realization').notNull().default('claimed'),
  confidence: confidenceLevel('confidence').notNull().default('low'),
  sourceVerified: boolean('source_verified').notNull().default(false),
  verifiedByPersonId: uuid('verified_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'value_outcomes_superseded_by_fk' }).onDelete('restrict'),
  /** Cannot claim measurement without the measurement. */
  check(
    'value_outcomes_measured_requires_actual',
    sql`${t.realization} = 'claimed' OR (${t.actualValue} IS NOT NULL AND ${t.actualMeasuredAt} IS NOT NULL)`,
  ),
  /** Verified requires a named human and confirmed sources. */
  check(
    'value_outcomes_verified_requires_human',
    sql`${t.realization} <> 'verified' OR (${t.verifiedByPersonId} IS NOT NULL AND ${t.verifiedAt} IS NOT NULL AND ${t.sourceVerified} = true)`,
  ),
  /** No unexplained money, claimed or realized. */
  check(
    'value_outcomes_impact_requires_basis',
    sql`(${t.claimedCurrencyImpact} IS NULL AND ${t.realizedCurrencyImpact} IS NULL)
        OR ${t.impactBasis} IS NOT NULL`,
  ),
  /**
   * A realized figure cannot exist before there is a measurement to realize it
   * from. Prevents back-filling an outcome with a result it never measured.
   */
  check(
    'value_outcomes_realized_requires_measurement',
    sql`${t.realizedCurrencyImpact} IS NULL OR ${t.realization} <> 'claimed'`,
  ),
  /** A committed target requires both a target and a named committer. */
  check(
    'value_outcomes_commit_is_complete',
    sql`${t.committedAt} IS NULL OR (${t.targetValue} IS NOT NULL AND ${t.committedByPersonId} IS NOT NULL)`,
  ),
  index('value_outcomes_engagement_idx').on(t.engagementId),
  index('value_outcomes_realization_idx').on(t.realization),
]);

export const valueOutcomeEvidence = pgTable('value_outcome_evidence', {
  valueOutcomeId: uuid('value_outcome_id').notNull().references(() => valueOutcomes.id, { onDelete: 'restrict' }),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id, { onDelete: 'restrict' }),
  /**
   * Does this evidence support the baseline, the actual, or the impact basis?
   * 0030 (hygiene L3): held to those three by a CHECK. lvrf_block_ai_actual
   * compares this column to 'actual', so a typo ('Actual', 'actuals') used
   * to skip the gate silently; the route validated it, the database did not.
   */
  supports: text('supports').notNull().default('baseline'),
}, (t) => [
  primaryKey({ columns: [t.valueOutcomeId, t.evidenceId] }),
  check('value_outcome_evidence_supports_known',
    sql`${t.supports} IN ('baseline', 'actual', 'impact_basis')`),
]);

/* ================================================================== */
/* Value Run — the immutable snapshot                                 */
/* ================================================================== */

/**
 * A walk of the value spine, captured whole.
 *
 * Live objects (`value_outcomes`, `evidence`) mutate. A run does not — it is a
 * payload plus a hash, fixed at the moment it was walked.
 *
 * LOCKING declares a run authoritative: the one the institution would defend.
 * Unlocked runs are exploratory. RELOCKING is not an edit — it is a new run
 * that supersedes the prior one via `supersedesRunId`, so the superseded
 * version survives. History accumulates; it is never rewritten.
 *
 * `record_documents.value_run_id` ties a document to the run it rendered from,
 * and a document may not be `customer_shared` unless that run is locked. That
 * is the connection between locking and the disclosure gate.
 *
 * Five capabilities depend on this object: Lock/Relock, Value Runs, Executive
 * Outputs, Roadmap, Close Plans.
 */
export const valueRuns = pgTable('value_runs', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'restrict' }),
  /** Sequential within an engagement. */
  runNumber: integer('run_number').notNull(),

  terminalValueStage: valueStage('terminal_value_stage').notNull(),

  /** Snapshotted at walk time. Zero is a legitimate confidence score. */
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 1 }).notNull(),
  confidenceBand: confidenceLevel('confidence_band').notNull(),
  institutionalHealth: numeric('institutional_health', { precision: 5, scale: 1 }),
  healthBand: healthState('health_band'),
  /** Share of dimension weight actually measured. Published with the score. */
  healthCoveragePct: integer('health_coverage_pct'),

  /** Locking declares the run authoritative. Immutability is trigger-enforced. */
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedByPersonId: uuid('locked_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  lockReason: text('lock_reason'),
  /** Relock: this run supersedes an earlier locked one. */
  supersedesRunId: uuid('supersedes_run_id'),

  /**
   * The fixture file this run was walked from, e.g. 'customer_b'.
   *
   * Restores a guard lost in the move to Postgres: render_record.py refused
   * to render when a run came from a different fixture than the one
   * requested. Nothing recorded which fixture produced a row, so the
   * refusal became inoperative and a document could silently carry another
   * engagement's numbers.
   *
   * Nullable — runs predating this column have none, which is accurate.
   */
  sourceFixture: text('source_fixture'),

  /** SHA-256 over payload. Makes the snapshot tamper-evident. */
  payloadHash: text('payload_hash').notNull(),
  payload: jsonb('payload').notNull(),

  walkedByPersonId: uuid('walked_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  walkedAt: timestamp('walked_at', { withTimezone: true }).notNull().defaultNow(),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'value_runs_superseded_by_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.supersedesRunId], foreignColumns: [t.id],
    name: 'value_runs_supersedes_fk' }).onDelete('restrict'),
  unique('value_runs_engagement_number_key').on(t.engagementId, t.runNumber),
  /** A lock requires a named human and a stated reason. */
  check('value_runs_lock_is_complete',
    sql`${t.lockedAt} IS NULL
        OR (${t.lockedByPersonId} IS NOT NULL AND ${t.lockReason} IS NOT NULL)`),
  check('value_runs_confidence_range',
    sql`${t.confidenceScore} >= 0 AND ${t.confidenceScore} <= 100`),
  index('value_runs_engagement_idx').on(t.engagementId),
  index('value_runs_locked_idx').on(t.lockedAt),
]);

/* ================================================================== */
/* Record Document — the rendered deliverable                          */
/* ================================================================== */

/**
 * Every rendering of a Realization Record is logged with a content hash, so a
 * document in a customer's hands can always be traced to the data that produced
 * it.
 *
 * The API must refuse `customer_shared` unless the outcome is verified. That rule
 * cannot be a CHECK here because it spans tables — enforce it in the route and do
 * not remove it.
 */
export const recordDocuments = pgTable('record_documents', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'restrict' }),
  valueOutcomeId: uuid('value_outcome_id').notNull().references(() => valueOutcomes.id, { onDelete: 'restrict' }),
  /**
   * The run this document rendered from. Nullable only for documents produced
   * before value_runs existed. The API must refuse `customer_shared` unless the
   * referenced run is locked — that rule spans tables and cannot be a CHECK.
   */
  valueRunId: uuid('value_run_id').references(() => valueRuns.id, { onDelete: 'restrict' }),

  documentVersion: integer('document_version').notNull().default(1),
  disclosure: documentDisclosure('disclosure').notNull().default('draft'),
  /** SHA-256 of the payload the document was rendered from. */
  contentHash: text('content_hash').notNull(),
  /** Snapshot of the render payload, so the document can be reproduced exactly. */
  payload: jsonb('payload').notNull(),
  filePath: text('file_path'),

  renderedByPersonId: uuid('rendered_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  renderedAt: timestamp('rendered_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('record_documents_outcome_version_key').on(t.valueOutcomeId, t.documentVersion),
  index('record_documents_engagement_idx').on(t.engagementId),
]);

/* ================================================================== */
/* Stewardship Return — the learning spine's terminal write            */
/* ================================================================== */

export const stewardshipReturns = pgTable('stewardship_returns', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'restrict' }),
  kind: returnKind('kind').notNull(),
  summary: text('summary').notNull(),
  narrative: text('narrative'),

  capabilityId: uuid('capability_id').references(() => capabilities.id, { onDelete: 'restrict' }),
  sourceReflectionId: uuid('source_reflection_id').references(() => reflections.id, { onDelete: 'restrict' }),
  sourceValueOutcomeId: uuid('source_value_outcome_id').references(() => valueOutcomes.id, { onDelete: 'restrict' }),

  ratifiedByPersonId: uuid('ratified_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  ratifiedAt: timestamp('ratified_at', { withTimezone: true }),

  /** Shaped for promotion to Compass when Compass exists. Local until then. */
  targetChapel: text('target_chapel').notNull().default('rule76'),
  promotedAt: timestamp('promoted_at', { withTimezone: true }),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'stewardship_returns_superseded_by_fk' }).onDelete('restrict'),
  check(
    'stewardship_returns_requires_source',
    sql`${t.sourceReflectionId} IS NOT NULL OR ${t.sourceValueOutcomeId} IS NOT NULL`,
  ),
  index('stewardship_returns_tenant_idx').on(t.tenantId),
]);

/* ================================================================== */
/* Heartbeat Registry — R76-HB-001                                    */
/* ================================================================== */

/**
 * The Heartbeat Register, as a table.
 *
 * HEARTBEAT-REGISTER §1: "No heartbeat may exist outside this register. If a
 * heartbeat is not registered, it is not constitutional."
 *
 * AMENDMENT-001 Article VI requires that rule be enforced structurally rather
 * than documentarily. `heartbeat_events.heartbeat_id` is a foreign key here, so
 * an unregistered event is refused by Postgres — not discouraged by a comment.
 *
 * Primary key is the register ID (`HB-0001`), not a UUID. The register assigns
 * identity; the database does not.
 *
 * Seed from `db/seed_heartbeat_register.sql`. Adding a row is a constitutional
 * act requiring governance, not a migration convenience.
 */
export const heartbeats = pgTable('heartbeats', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: heartbeatCategory('category').notNull(),
  purpose: text('purpose').notNull(),
  producer: text('producer').notNull(),
  frequency: text('frequency').notNull(),
  /** §10. 0–10. Contribution to the institutional health composite. */
  healthWeight: integer('health_weight').notNull(),
  /** §9. 0–5, where 5 is Constitutional. */
  failureSeverity: integer('failure_severity').notNull(),
  constitutionalAuthority: text('constitutional_authority').notNull()
    .default('Rule76 Constitution'),
  ...governance(),
  /** Override: heartbeats are keyed on register ID (text), not UUID. */
  supersededById: text('superseded_by_id'),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'heartbeats_superseded_by_fk' }).onDelete('restrict'),
  /** Zero is a legitimate weight — a heartbeat may be informational. */
  check('heartbeats_health_weight_range', sql`${t.healthWeight} >= 0 AND ${t.healthWeight} <= 10`),
  check('heartbeats_failure_severity_range', sql`${t.failureSeverity} >= 0 AND ${t.failureSeverity} <= 5`),
  check('heartbeats_id_format', sql`${t.id} ~ '^HB-[0-9]{4}$'`),
]);

/* ================================================================== */
/* Heartbeat Events + Audit — append-only                             */
/* ================================================================== */

/**
 * Conforms to the canonical event contract, HEARTBEAT-REGISTER §11.
 *
 * §12 requires every heartbeat be immutable after persistence, timestamped,
 * cryptographically hashed, versioned, attributable to an authenticated
 * producer, and traceable to constitutional authority. Deletion is prohibited;
 * corrections create new events. `hardening.sql` revokes UPDATE and DELETE from
 * `lvrf_app` so that holds at the privilege level.
 */
export const heartbeatEvents = pgTable('heartbeat_events', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),

  /** Registered heartbeat. Unregistered events are structurally impossible. */
  heartbeatId: text('heartbeat_id').notNull().references(() => heartbeats.id, { onDelete: 'restrict' }),

  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'restrict' }),
  engagementId: uuid('engagement_id').references(() => engagements.id, { onDelete: 'restrict' }),

  /**
   * The run this event belongs to. 0003.
   *
   * NO `.references()` here deliberately — the constraint is DEFERRABLE
   * INITIALLY DEFERRED, which Drizzle's column builder cannot express. It is
   * declared in `db/hardening.sql` as raw SQL. Do not "fix" this by adding a
   * reference; that would create a second, non-deferred constraint and break
   * the atomic walk.
   *
   * Nullable: events predating runs, and events outside a walk (HB-0001
   * system init, HB-0002 authentication), legitimately have none.
   */
  valueRunId: uuid('value_run_id'),

  eventType: text('event_type').notNull(),
  /** §11. The emitting component. */
  producer: text('producer').notNull(),
  /** §9. 0–5. Zero (Informational) is legitimate data. */
  severity: integer('severity').notNull(),
  /** §8. Resolved at emission, not derived at read time. */
  healthState: healthState('health_state').notNull(),
  constitutionalAuthority: text('constitutional_authority').notNull(),
  /** §12. SHA-256 over the payload. Makes the event tamper-evident. */
  contentHash: text('content_hash').notNull(),
  /** §11. Contract version the event was emitted under. */
  contractVersion: text('contract_version').notNull().default('1.0.0'),

  valueStage: valueStage('value_stage'),
  learningStage: learningStage('learning_stage'),
  subjectTable: text('subject_table').notNull(),
  subjectId: text('subject_id').notNull(),
  actorPersonId: uuid('actor_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  actorIsAgent: boolean('actor_is_agent').notNull().default(false),
  payload: jsonb('payload').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('heartbeat_events_severity_range', sql`${t.severity} >= 0 AND ${t.severity} <= 5`),
  index('heartbeat_registered_idx').on(t.heartbeatId),
  index('heartbeat_run_idx').on(t.valueRunId),
  index('heartbeat_subject_idx').on(t.subjectTable, t.subjectId),
  index('heartbeat_occurred_idx').on(t.occurredAt),
  index('heartbeat_engagement_idx').on(t.engagementId),
  index('heartbeat_health_idx').on(t.healthState),
]);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  operation: auditOperation('operation').notNull(),
  actorPersonId: uuid('actor_person_id'),
  oldRow: jsonb('old_row'),
  newRow: jsonb('new_row'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_record_idx').on(t.tableName, t.recordId),
  index('audit_at_idx').on(t.at),
]);

/* ================================================================== */
/* Refusal — the record of authority exercised                        */
/* ================================================================== */

/**
 * 2.0 item 2. A refusal is the system exercising authority, and authority
 * exercised without record is what constitutions exist to prevent.
 * audit_log captures every successful write; heartbeat_events records what
 * the institution owes itself; record_documents are immutable. A refusal —
 * arguably the most informative event this system produces — currently
 * leaves nothing: the transaction rolls back and the attempt is forgotten.
 *
 * Someone offered vendor-published evidence as a measured actual on 25
 * August. The gate refused, correctly, and the system then behaved as
 * though the offer had never been made. That is the record forgetting
 * something true.
 *
 * NOT audit_log: audit_log records state CHANGES — it carries old_row and
 * new_row, and a refusal has neither. An audit log containing things that
 * did not happen stops being an audit log. Its guarantee today is that
 * every row is a change that occurred.
 *
 * Same shape as record_documents: no deletedAt, no supersededById, no
 * status, no version. A refusal is a FACT, not a claim — it cannot be
 * retired, superseded or corrected. Nothing supersedes something that
 * happened.
 *
 * LIMITATION: this records refusals arriving through an ENDPOINT. A
 * refusal raised in a psql session — as every gate test to date has been —
 * leaves nothing; the trigger raises and no application is listening. Do
 * not describe this as complete coverage.
 */
export const refusals = pgTable('refusals', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'restrict' }),
  /** A refusal always has an actor — actorContext refuses the request otherwise. */
  actorPersonId: uuid('actor_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  /** Method and path pattern, e.g. 'POST /api/value-outcomes/:id/evidence'. */
  endpoint: text('endpoint').notNull(),
  subjectTable: text('subject_table').notNull(),
  /** The subject may not exist yet. */
  subjectId: text('subject_id'),
  /**
   * The value outcome the refused request targeted, when there was one —
   * written by the outcome routes (evidence, commit, measure, verify) once
   * the outcome is resolved. subject_id cannot carry it: for an evidence
   * attach the subject is the evidence row, which never persists. The gap
   * register attributes a refusal to an outcome ONLY on this exact match.
   *
   * Nullable, and NOT back-filled: rows written before 0025 do not say which
   * outcome they targeted, and inferring it now would be the guess this
   * column exists to remove. Those rows stay unattributed.
   */
  valueOutcomeId: uuid('value_outcome_id')
    .references((): AnyPgColumn => valueOutcomes.id, { onDelete: 'restrict' }),
  /** Postgres SQLSTATE, e.g. '23514', '23505'. */
  /** 0034 (Q4h, L8): a parser's 422 has no SQLSTATE; a database refusal always does. */
  sqlstate: text('sqlstate'),
  source: refusalSource('source').notNull().default('database'),
  /** Postgres does not always supply one. */
  constraintName: text('constraint_name'),
  /** VERBATIM. Never truncated, rewritten or summarised. That sentence is the product. */
  message: text('message').notNull(),
  /** What was offered. */
  attemptedPayload: jsonb('attempted_payload').notNull(),
  refusedAt: timestamp('refused_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('refusals_tenant_idx').on(t.tenantId),
  index('refusals_subject_idx').on(t.subjectTable, t.subjectId),
  index('refusals_refused_at_idx').on(t.refusedAt),
  index('refusals_value_outcome_idx').on(t.valueOutcomeId),
  check('refusals_source_shape', sql`${t.source}::text IN ('parser', 'route') OR ${t.sqlstate} IS NOT NULL`),
]);

/* ================================================================== */
/* Hardening Manifest — what hardening.sql applied, as of its last run */
/* ================================================================== */

/**
 * 2.0 item 4. On 23 August five triggers sat DECLARED in hardening.sql and
 * ABSENT from the database for weeks, while the trigger count reconciled by
 * coincidence (see the Verification block at the end of hardening.sql). The
 * lesson was: compare lists, not totals. This table is what makes that
 * comparison possible from SQL.
 *
 * The expected list could have been a constant in the checking code. That
 * would be a SECOND declaration of what hardening.sql already declares — two
 * lists, hand-synchronised, drifting silently. A drift detector that drifts
 * is the most embarrassing possible failure of this feature.
 *
 * The manifest is written BY hardening.sql as it runs, derived from the same
 * arrays and loops that create the triggers — never hand-enumerated. One
 * declaration.
 *
 * SHAPE: insert-only, same as refusals and record_documents — no deletedAt,
 * no supersededById, no status, no version. What hardening.sql applied at a
 * moment is a fact.
 *
 * NO TRIGGERS on this table (no _audit, no _touch, no _no_delete):
 * hardening.sql truncates and repopulates it on every run (see below), so a
 * _no_delete guard would prevent hardening.sql from working.
 *
 * WHAT THIS CANNOT CATCH: the manifest records what hardening.sql DECLARED.
 * A trigger it never declared is invisible to both the file and any check
 * built on this table — so the comparison this enables catches
 * DECLARED-BUT-NOT-APPLIED, not APPLIED-BUT-NOT-DECLARED. That is the
 * direction the 23 August gap actually ran, so it is the right coverage —
 * but it is not complete coverage, and nothing here should imply otherwise.
 */
export const hardeningManifest = pgTable('hardening_manifest', {
  id: id(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  triggerName: text('trigger_name').notNull(),
  tableName: text('table_name').notNull(),
}, (t) => [
  unique('hardening_manifest_trigger_table_key').on(t.triggerName, t.tableName),
]);

/* ================================================================== */
/* Research Results — parsed, pending a human decision                */
/* ================================================================== */

/**
 * 2.0 item 5. Research intake is four stages: LVRF generates a prompt, a
 * human runs it in an AI agent, LVRF parses the response, and a human
 * accepts or rejects each field. Parsing and accepting produce DIFFERENT
 * FACTS — parsing establishes that the agent returned this; accepting
 * establishes that a person judged the citation checkable and the value
 * worth recording. Collapsing them would make pasting an act of
 * endorsement, and nobody could tell which fields a human actually looked
 * at.
 *
 * A parsed field is not evidence. Evidence (see `evidence` above) is a
 * claim the system stands behind. This table holds parsed fields until a
 * person decides.
 *
 * A REJECTED result is kept, not discarded. "We researched this and
 * rejected it" is a fact, and this system currently forgets everything it
 * declines — the same argument that produced `refusals` above.
 *
 * NO confidence column, deliberately. LVRF computes confidence from the
 * evidence ledger and never accepts an asserted one — an agent's
 * self-declared confidence has no place here.
 *
 * SHAPE: insert-then-review, same family as `refusals` and
 * `hardening_manifest` — no deletedAt, no supersededById, no status, no
 * version. A parse happened; that is a fact. Review state moves it from
 * pending to accepted/rejected, but the row itself is never retired or
 * versioned — a correction is a new research pass, not an edit here.
 *
 * 2.0 item 5, industry packs step 3. TWO SHAPES NOW LAND HERE, and
 * resultKind is the discriminant — see researchResultKind above. Added
 * with NO DEFAULT: a default would be an assertion made on this table's
 * behalf by every future caller, the same reason FindingsInput requires
 * driftChecksRan rather than defaulting it. Nothing writes to this table
 * yet, so requiring it costs nothing today and forecloses a wrong
 * assumption later.
 *
 *   metric_value — the original 0018 shape. institutionId is set,
 *   industryId is null. value/citation are the scalar answer.
 *
 *   industry_measure — a candidate pack entry. It belongs to an industry,
 *   not an account: industryId is set, institutionId and businessMetricId
 *   are both null. Its shape (name, unit, direction, definition,
 *   whyItPays, addressable, addressableReasoning, confounders, citation —
 *   see industryMeasures above) does NOT fit value/citation as scalars,
 *   and does not get nine columns used by one kind and null for the
 *   other — that is the sparse-table failure. value and citation stay
 *   NULL for this kind; the object lives in rawResponse, verbatim, and
 *   the accept path reads it from there.
 *
 * institutionId is now NULLABLE — 0018 had it NOT NULL, written only for
 * the metric case. researchResultsKindShape (below) enforces the real
 * invariant in its place: institutionId is required for metric_value and
 * forbidden for industry_measure, never both, never neither.
 */
/**
 * 0031 (Q4b) — a research prompt, as generated and handed to a person to
 * run. Generated from live rows by POST /api/industries/:industryId/
 * research-prompts (server/research/contracts.ts): the industry, the pack's
 * current entries, its exclusions with their reasons, and the contract's
 * field definitions. Each research_results row names the prompt it
 * answered, so a result says exactly what was asked.
 *
 * Immutable: a prompt is a fact about what was asked. _audit, _no_delete
 * and _immutable (hardening.sql section 18). prompt_sha256 is held to the
 * text by a CHECK, so the hash cannot disagree with what it names.
 */
export const researchPrompts = pgTable('research_prompts', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  /** An industry_measure prompt's industry; null for an account prompt (0034). */
  industryId: uuid('industry_id').references(() => industries.id, { onDelete: 'restrict' }),
  /** 0034 (Q4h): an institution_fact prompt's account; null for a pack prompt. */
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'restrict' }),
  /** 0034: an account prompt's phase — the entity first, then facts. */
  phase: researchPromptPhase('phase'),
  /**
   * 0034: a facts-phase prompt's entity — the one it named and parse checks
   * against. Accept refuses a fact whose prompt's entity is no longer
   * current (corrected since): re-run under the current one.
   */
  entityId: uuid('entity_id').references((): AnyPgColumn => institutionEntities.id, { onDelete: 'restrict' }),
  resultKind: researchResultKind('result_kind').notNull(),
  /** The contract's version when this prompt was generated (contracts.ts). */
  contractVersion: integer('contract_version').notNull(),
  /** The prompt template's version (contracts.ts PROMPT_TEMPLATE_VERSION). */
  templateVersion: integer('template_version').notNull(),
  promptText: text('prompt_text').notNull(),
  promptSha256: text('prompt_sha256').notNull(),
  /** The pack entries and exclusions the prompt listed — what it told the agent not to return. */
  listedMeasureIds: uuid('listed_measure_ids').array().notNull().default(sql`'{}'::uuid[]`),
  listedExclusionIds: uuid('listed_exclusion_ids').array().notNull().default(sql`'{}'::uuid[]`),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  generatedByPersonId: uuid('generated_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
}, (t) => [
  index('research_prompts_industry_idx').on(t.industryId),
  index('research_prompts_institution_idx').on(t.institutionId),
  /** 0034: a pack prompt names an industry; an account prompt names an account and a phase. Kind compared as text (0033). */
  check('research_prompts_subject_shape',
    sql`(${t.resultKind}::text = 'industry_measure' AND ${t.industryId} IS NOT NULL AND ${t.institutionId} IS NULL AND ${t.phase} IS NULL)
        OR (${t.resultKind}::text = 'institution_fact' AND ${t.institutionId} IS NOT NULL AND ${t.industryId} IS NULL AND ${t.phase} IS NOT NULL
            AND ((${t.phase} = 'facts') = (${t.entityId} IS NOT NULL)))`),
  check('research_prompts_versions_positive', sql`${t.contractVersion} > 0 AND ${t.templateVersion} > 0`),
  check('research_prompts_sha256_is_the_text',
    sql`${t.promptSha256} = encode(sha256(convert_to(${t.promptText}, 'UTF8')), 'hex')`),
]);

export const researchResults = pgTable('research_results', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  /** Required for metric_value, null for industry_measure — see researchResultsKindShape. */
  institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'restrict' }),
  /** Null when the research was not metric-scoped, and always null for industry_measure. */
  businessMetricId: uuid('business_metric_id').references(() => businessMetrics.id, { onDelete: 'restrict' }),
  /** Required for industry_measure, null for metric_value — see researchResultsKindShape. */
  industryId: uuid('industry_id').references(() => industries.id, { onDelete: 'restrict' }),

  /**
   * The discriminant. NO DEFAULT — see the table comment above. Read
   * before institutionId/industryId are interpreted; the CHECK below
   * enforces that reading rather than trusting it.
   */
  resultKind: researchResultKind('result_kind').notNull(),

  /** What LVRF asked. */
  researchQuery: text('research_query').notNull(),
  /** What the agent SAYS it ran — not necessarily identical to researchQuery. */
  queryAsExecuted: text('query_as_executed').notNull(),
  researchTool: text('research_tool').notNull(),
  fieldName: text('field_name').notNull(),

  found: boolean('found').notNull(),
  /** The scalar answer for metric_value when found. Always null for industry_measure. */
  value: text('value'),
  /** The scalar citation for metric_value when found. Always null for industry_measure — its citation lives in rawResponse's object. */
  citation: text('citation'),
  /** Null when found is true. */
  notFoundReason: text('not_found_reason'),
  /** The whole field object as parsed, verbatim. For industry_measure, this IS the record — no per-field columns. */
  rawResponse: jsonb('raw_response').notNull(),

  reviewState: researchReviewState('review_state').notNull().default('pending'),
  reviewedByPersonId: uuid('reviewed_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  /** Set when accepted and an evidence row was written from this result. metric_value only — see researchResultsAcceptedHasRecord. */
  evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'restrict' }),
  /** Set when accepted and an industry_measures row was written from this result. industry_measure only — see researchResultsAcceptedHasRecord. */
  industryMeasuresId: uuid('industry_measures_id').references(() => industryMeasures.id, { onDelete: 'restrict' }),
  /** 0034 (Q4h): set when an accepted institution_fact result wrote a fact (a figure, or the regime). */
  institutionFactId: uuid('institution_fact_id').references(() => institutionFacts.id, { onDelete: 'restrict' }),
  /** 0034 (Q4h): set when an accepted institution_fact result pinned the entity. */
  institutionEntityId: uuid('institution_entity_id').references(() => institutionEntities.id, { onDelete: 'restrict' }),

  parsedAt: timestamp('parsed_at', { withTimezone: true }).notNull().defaultNow(),
  parsedByPersonId: uuid('parsed_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  /**
   * 0031 (Q4b). The exact prompt this result answered (research_prompts),
   * and the contract version the parser validated it against. Both or
   * neither (research_results_prompt_named).
   */
  promptId: uuid('prompt_id').references(() => researchPrompts.id, { onDelete: 'restrict' }),
  contractVersion: integer('contract_version'),
  /**
   * 0031. false on every row that existed when 0031 ran — they predate
   * prompt tracking and are left exactly as they were (nothing is
   * back-filled: a guessed prompt would be manufactured history). Defaults
   * true, so every row parsed since must name its prompt. Tied to the
   * cut-off by research_results_untracked_predates_prompts: an untracked
   * row must have been parsed before 2026-10-12 00:00 UTC, and parsed_at
   * is stamped by research_results_touch on INSERT and frozen on UPDATE
   * (hardening.sql section 10), so no new row — not even by direct SQL —
   * can claim to predate prompt tracking.
   */
  promptTracked: boolean('prompt_tracked').notNull().default(true),
}, (t) => [
  /** 0031: a tracked result names its prompt and contract version; prompt and version come together. */
  check('research_results_prompt_named',
    sql`((${t.promptId} IS NULL) = (${t.contractVersion} IS NULL))
        AND (NOT ${t.promptTracked} OR ${t.promptId} IS NOT NULL)`),
  /**
   * 0031: only a row parsed before prompt tracking began may be untracked.
   * The literal is the cut-off, fixed when 0031 was written (after the 13
   * legacy rows on prod, the newest parsed 10 Oct 2026); it never moves.
   */
  check('research_results_untracked_predates_prompts',
    sql`${t.promptTracked} OR ${t.parsedAt} < '2026-10-12 00:00:00+00'::timestamptz`),
  /** A decision has a decider and a time, both or neither. */
  check('research_results_review_is_complete',
    sql`${t.reviewState} = 'pending'
        OR (${t.reviewedByPersonId} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL)`),
  /**
   * Which columns apply is enforced, not trusted — same as
   * research_results_found_shape below. A metric_value result is
   * account-scoped and has no industry; an industry_measure result is
   * industry-scoped and has no account or metric.
   */
  check('research_results_kind_shape',
    sql`(${t.resultKind} = 'metric_value'
           AND ${t.institutionId} IS NOT NULL
           AND ${t.industryId} IS NULL)
        OR (${t.resultKind} = 'industry_measure'
           AND ${t.industryId} IS NOT NULL
           AND ${t.institutionId} IS NULL
           AND ${t.businessMetricId} IS NULL)
        OR (${t.resultKind}::text = 'institution_fact'
           AND ${t.institutionId} IS NOT NULL
           AND ${t.industryId} IS NULL
           AND ${t.businessMetricId} IS NULL
           AND ${t.industryMeasuresId} IS NULL)`),
  /**
   * The response shape is enforced, not trusted. 0018 required
   * value+citation whenever found = true, full stop — that conflicted
   * with industry_measure once this kind existed, since its value and
   * citation stay NULL by design (the object lives in rawResponse; see
   * the table comment). Resolved by splitting the found = true branch on
   * resultKind: metric_value still requires the scalar pair; industry_measure
   * requires them to be absent, so a row cannot silently carry both a
   * scalar answer and a rawResponse object, or neither.
   */
  check('research_results_found_shape',
    sql`(${t.found} = false AND ${t.notFoundReason} IS NOT NULL)
        OR (${t.found} = true AND ${t.resultKind} = 'metric_value'
              AND ${t.value} IS NOT NULL AND ${t.citation} IS NOT NULL)
        OR (${t.found} = true AND ${t.resultKind} = 'industry_measure'
              AND ${t.value} IS NULL AND ${t.citation} IS NULL)
        OR (${t.found} = true AND ${t.resultKind}::text = 'institution_fact'
              AND ${t.value} IS NULL AND ${t.citation} IS NULL)`),
  /**
   * Accepting means the kind's own record exists — renamed from
   * research_results_accepted_has_evidence (0018), which required
   * evidence_id whenever accepted, full stop. That was written when
   * metric_value was the only kind: accepting a metric_value creates an
   * evidence row. Accepting an industry_measure creates an
   * industry_measures row instead (see the industry pack accept route) —
   * it has no evidence to point to, so the unconditional form would
   * refuse every industry_measure accept outright. Split by result_kind,
   * same discriminant as research_results_kind_shape and
   * research_results_found_shape above, and made an XOR rather than an
   * OR: an accepted row must carry its OWN kind's id and NOT the other
   * kind's, so metric_value cannot point at an industry_measures row (or
   * vice versa) by accident. An accepted row that produced nothing is a
   * lie the database refuses, not something the application promises to
   * avoid — same reasoning as the two constraints beside it.
   */
  check('research_results_accepted_has_record',
    sql`${t.reviewState} <> 'accepted'
        OR (${t.resultKind} = 'metric_value'
              AND ${t.evidenceId} IS NOT NULL AND ${t.industryMeasuresId} IS NULL)
        OR (${t.resultKind} = 'industry_measure'
              AND ${t.industryMeasuresId} IS NOT NULL AND ${t.evidenceId} IS NULL)
        OR (${t.resultKind}::text = 'institution_fact' AND ${t.found} = false
              AND ${t.evidenceId} IS NULL AND ${t.institutionFactId} IS NULL AND ${t.institutionEntityId} IS NULL)
        OR (${t.resultKind}::text = 'institution_fact' AND ${t.found} = true AND ${t.evidenceId} IS NOT NULL
              AND ((${t.institutionFactId} IS NOT NULL) <> (${t.institutionEntityId} IS NOT NULL)))`),
  index('research_results_tenant_idx').on(t.tenantId),
  index('research_results_institution_idx').on(t.institutionId),
  index('research_results_business_metric_idx').on(t.businessMetricId),
  index('research_results_industry_idx').on(t.industryId),
  index('research_results_review_state_idx').on(t.reviewState),
  /**
   * 0026. One accepted review per pack entry. The pack page joins each
   * industry_measures row to its accepted research result to show the
   * reviewer's note; until this index that join's one-row-per-entry
   * result held only by construction (accept always creates a new
   * measure). Partial: pending and rejected rows never carry
   * industry_measures_id, and the predicate states the rule exactly.
   */
  uniqueIndex('research_results_one_accepted_per_measure')
    .on(t.industryMeasuresId)
    .where(sql`${t.reviewState} = 'accepted'`),
]);

// ------------------------------------------------------------------
// Enums
// ------------------------------------------------------------------

/**
 * The strongest evidence of capability change an offering can actually emit.
 * NOT what its marketing claims. Ordering is meaningful, weakest first.
 */
export const evidenceClass = pgEnum('evidence_class', [
  'none',         // emits nothing about a learner (authoring/enablement tooling)
  'consumption',  // proves only that learning was consumed
  'assessed',     // scored measure of capability against a standard
  'demonstrated', // observed performance in a simulated or supervised setting
  'applied',      // capability exercised in the customer's real work system
]);

/** Who grades the evidence. This is what a CFO actually weighs. */
export const verificationSource = pgEnum('verification_source', [
  'none',
  'vendor_platform',
  'human_observer',
  'third_party',
  'customer_system',
]);

/**
 * 0008. Whether it is confirmed that an offering's evidence artifacts can
 * actually be retrieved for an engagement — distinct from evidence_class,
 * which is what the offering could emit in principle. Interim
 * denormalization: see the Learnings ledger entry on the gap engine.
 */
export const evidenceAccess = pgEnum('evidence_access', [
  'unconfirmed', 'confirmed', 'denied',
]);

export const offeringFamily = pgEnum('offering_family', [
  'platform', 'assessment', 'practice', 'coaching',
  'instructor_led', 'program', 'content', 'enabler',
]);

// ------------------------------------------------------------------
// offerings — GOVERNED TABLE
// Add 'offerings' to the governed array in hardening.sql and re-run it.
// Triggers are NOT declared here: audit fires AFTER, touch fires BEFORE
// UPDATE, and hardening.sql owns that split (DEFECT-001).
// ------------------------------------------------------------------

export const offerings = pgTable('offerings', {
  id:        id(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),

  offeringKey: text('offering_key').notNull(),
  name:        text('name').notNull(),
  family:      offeringFamily('family').notNull(),
  description: text('description').notNull(),

  // The governing fields
  evidenceClass:      evidenceClass('evidence_class').notNull(),
  verificationSource: verificationSource('verification_source').notNull(),
  evidenceArtifacts:  text('evidence_artifacts').array().notNull().default(sql`'{}'::text[]`),

  /**
   * Deliberately nullable. Nothing public supports a figure (gap G4).
   * A null here is a recorded absence, not an oversight. Do not backfill
   * with an estimate.
   */
  commercialModel: text('commercial_model'),

  // Provenance
  sourceRefs:       jsonb('source_refs').notNull(),
  confirmationGaps: text('confirmation_gaps').array().notNull().default(sql`'{}'::text[]`),

  /**
   * 0008. NULL means the tenant provides this offering directly. A
   * non-null value names a third party the tenant resells: the evidence
   * chain runs through systems the tenant does not own, and the
   * arrangement can be terminated by a party outside the tenant. Added
   * after Skillsoft divested Global Knowledge (announced 2026-05-20,
   * completed 2026-07-06) while continuing to list global_knowledge_ilt
   * via a reciprocal partnership — the catalog had no way to say that
   * evidence access for this row now depends on a company Skillsoft does
   * not own. Distinct from tenant_id, which is only whose catalog the row
   * appears in. See the COMMENT ON COLUMN in db/drizzle for the full text.
   */
  providerOrg: text('provider_org'),

  /**
   * 0008. Whether it is confirmed that this offering's evidence artifacts
   * can actually be retrieved for an engagement — exportable, retained, at
   * usable grain. Distinct from evidence_class, which is what the offering
   * could emit in principle. Defaults unconfirmed: absence of confirmation
   * is not confirmation of absence, and neither is a marketing claim. An
   * interim denormalization of one bit the gate needs — the gap engine
   * named in AMENDMENT-001 is what makes this derived rather than stored.
   * See the COMMENT ON COLUMN in db/drizzle for the full text.
   */
  evidenceAccess: evidenceAccess('evidence_access').notNull().default('unconfirmed'),

  /**
   * 0006: renamed from lifecycle_status. That name collided with the
   * lifecycle_status ENUM TYPE governance().status below is typed with —
   * two different concepts sharing one name is exactly the trap this rename
   * removes rather than documents. Values unchanged: proposed/approved/
   * active/deprecated/retired. Describes the OFFERING's own commercial
   * status in the vendor's market — see the COMMENT ON COLUMN in db/drizzle
   * for the full distinction from governance().status.
   */
  marketStatus: text('market_status').notNull().default('proposed'),

  /**
   * 0006: renamed from governance_status. Sitting beside governance().status
   * with a name that generic, it was the same trap market_status's rename
   * just removed — and the more dangerous of the two, since a route gating
   * on ratification could read status='ratified' and let an unaudited
   * evidentiary claim through. NOT redundant with governance().status:
   * that field is this catalog ROW's own canonical lifecycle (draft/
   * ratified/active/superseded/retired), the same field every governed
   * table has, tracking whether the Cathedral has approved this record's
   * existence at all. evidenceRatification is narrower and offering-
   * specific: whether THIS OFFERING'S evidentiary claim (the evidence_class
   * + verification_source pair) has been independently audited. Critically,
   * its 'revoked' value has no equivalent in the lifecycle_status enum:
   * 'superseded' means replaced by a newer version, 'retired'/'archived'
   * mean ordinary end-of-life, 'rejected' means never approved to begin
   * with — none of those mean "a prior ratification of this specific
   * evidentiary claim was withdrawn as incorrect," which is what 'revoked'
   * exists to say. An offering can be governance().status = 'active' (the
   * row itself is live) while evidenceRatification = 'unratified' (nobody
   * has yet audited whether its evidence_class claim is true) — a real,
   * meaningful, non-redundant combination. 0007: the seeded catalog is NOT
   * an example of that combination — every seeded row is status='draft',
   * not 'active' — corrected after the claim was found false in the
   * COMMENT ON COLUMN. The seeded catalog does illustrate three dimensions
   * differing simultaneously: status=draft, evidenceRatification=
   * unratified, marketStatus=active. Kept as its own column rather than
   * folded into governance().status. See the COMMENT ON COLUMN in
   * db/drizzle for the full distinction.
   */
  evidenceRatification: text('evidence_ratification').notNull().default('unratified'),

  /**
   * 0006: offerings was hand-rolled with only createdAt/updatedAt instead of
   * the shared governance() convention every other governed table uses —
   * which is exactly why deleted_at was missing (lvrf_audit() assumes it on
   * every governed table). This spread also adds status, version,
   * supersededById and stewardPersonId.
   */
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'offerings_superseded_by_fk' }).onDelete('restrict'),

  // Soft-delete-safe: a retired (deleted_at set) offering frees its key for
  // reuse. The other 4 governed tables with a natural unique key (tenants,
  // institutions, business_metrics, persons) all use a PLAIN unique
  // constraint with the same latent gap — none exempt soft-deleted rows.
  // That is a shared pre-existing defect, not a convention to replicate; 0006
  // fixes it here rather than adding a fifth instance of it.
  uniqueIndex('offerings_tenant_key_unique').on(t.tenantId, t.offeringKey)
    .where(sql`${t.deletedAt} IS NULL`),

  index('offerings_tenant_idx').on(t.tenantId),
  index('offerings_evidence_class_idx').on(t.evidenceClass),

  // An offering that claims to measure capability must name who grades it.
  check('offerings_evidence_requires_source', sql`
    ${t.evidenceClass} IN ('none','consumption') OR ${t.verificationSource} <> 'none'
  `),

  /**
   * An offering that claims to emit evidence must name the artifact.
   *
   * cardinality(), NOT array_length(). array_length('{}',1) returns NULL,
   * NULL >= 1 evaluates to NULL, and a CHECK PASSES on NULL — so the
   * array_length form silently accepts the exact row it exists to reject.
   * Verified empirically on PG 16.14: the array_length form is an inert
   * constraint. Do not "simplify" this back.
   */
  check('offerings_artifacts_nonempty_when_evidential', sql`
    ${t.evidenceClass} = 'none' OR cardinality(${t.evidenceArtifacts}) >= 1
  `),

  // Provenance must be a list, so a row can never claim a single
  // unstructured source string.
  check('offerings_source_refs_is_array', sql`
    jsonb_typeof(${t.sourceRefs}) = 'array'
  `),

  check('offerings_market_status_valid', sql`
    ${t.marketStatus} IN ('proposed','approved','active','deprecated','retired')
  `),

  check('offerings_evidence_ratification_valid', sql`
    ${t.evidenceRatification} IN ('unratified','ratified','revoked')
  `),
]);

// ------------------------------------------------------------------
// offering_capabilities — junction, UNGOVERNED
// Consistent with person_roles and reflection_evidence.
//
// THIS TABLE IS THE CAPABILITY HOP MADE STRUCTURAL. It is the reason an
// offering cannot be wired straight to a business metric. If anyone proposes
// an `attachable_metrics` column on `offerings`, this is what they are
// proposing to bypass.
// ------------------------------------------------------------------

export const offeringCapabilities = pgTable('offering_capabilities', {
  offeringId:   uuid('offering_id').notNull()
                  .references(() => offerings.id, { onDelete: 'cascade' }),
  capabilityId: uuid('capability_id').notNull()
                  .references(() => capabilities.id, { onDelete: 'restrict' }),
  isPrimary:    boolean('is_primary').notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.offeringId, t.capabilityId] }),

  // At most one primary capability per offering.
  uniqueIndex('offering_capabilities_one_primary')
    .on(t.offeringId)
    .where(sql`${t.isPrimary}`),

  index('offering_capabilities_capability_idx').on(t.capabilityId),
]);

// ------------------------------------------------------------------
// capability_industry_measures — junction, the missing edge in the
// solution-to-measure chain:
//
//   offering -> capability          offering_capabilities (above)
//   capability -> business_metric   value_outcomes (an institution's INSTANCE)
//   capability -> industry_measure  THIS TABLE (the industry-level CLAIM)
//
// Without this edge nothing states WHICH INDUSTRY MEASURE a capability
// claims to move. Curia's "New manager effectiveness" — created by
// offeringAttachment.ts with just a name, no description, no role family
// — is the content-shaped hypothesis this table exists to close off: a
// capability named after a training topic, with nothing said about what
// it actually changes.
//
// `claim` is NOT NULLABLE and is the point of the table: the MECHANISM by
// which this capability moves this measure — "deviation handling and
// batch-record execution are the operator behaviours behind lot
// rejection," not "improves lot acceptance." A link with no stated
// mechanism only asserts that two things are related; the mechanism is
// what makes that assertion checkable.
//
// `claimedByPersonId`, for the same reason institutionClassify.ts's
// classification_note carries an author: this is a judgement, and a
// judgement with no author is the authored-prose problem this system
// exists to refuse.
//
// NO is_primary — DELIBERATELY, unlike offering_capabilities above.
// There, one offering needs at most one privileged capability
// (offering_capabilities_one_primary). Here, a capability may claim
// several industry measures at once and none is privileged over the
// others: new-manager-effectiveness training could plausibly move both a
// time-to-productivity measure and a quality measure, and ranking one
// "primary" would assert an ordering nobody has judged. The asymmetry
// with offering_capabilities is deliberate, not a gap.
//
// INSERT-ONLY, same shape as industry_measure_exclusions and refusals: no
// deleted_at, no superseded_by_id, no status, no version. A claim was
// made; that is a fact. To withdraw it, supersede the CAPABILITY (which
// already carries superseded_by_id via governance()) — not this row.
//
// SURROGATE id, UNLIKE offering_capabilities — a deliberate divergence
// from that table's shape, not an inconsistency. offering_capabilities
// records a STRUCTURAL ATTACHMENT (this offering runs through this
// capability); nobody's judgement is on the line, so there is nothing
// for an audit trail to be worth. This table records a JUDGEMENT WITH AN
// AUTHOR — who claimed a capability moves a measure, and by what
// mechanism — and a judgement with no audit trail defeats the point of
// claimedByPersonId, the same reasoning classification (0019) carries an
// author for. lvrf_audit() (db/hardening.sql) hardcodes NEW.id::text, so
// a table wanting _audit needs a real id column; the composite pair is
// preserved as a UNIQUE constraint instead of the primary key, so "one
// claim per capability+measure pair" is enforced exactly as it would be
// under a composite PK.
//
// This sidesteps hardening.sql's "Known ungoverned tables" gap — it does
// not close it. offering_capabilities, value_outcome_evidence,
// person_roles and reflection_evidence still have no _audit, and closing
// that generally (a composite-key-aware audit function, or adding a
// surrogate id to each) remains an undecided, separate question. This
// migration only gives ITS OWN table an id, because this table's
// content — an authored claim — genuinely wants one.
// ------------------------------------------------------------------

export const capabilityIndustryMeasures = pgTable('capability_industry_measures', {
  id: id(),
  capabilityId: uuid('capability_id').notNull()
                  .references(() => capabilities.id, { onDelete: 'restrict' }),
  industryMeasureId: uuid('industry_measure_id').notNull()
                  .references(() => industryMeasures.id, { onDelete: 'restrict' }),
  /** The mechanism, not the outcome. Required — see the header comment. */
  claim: text('claim').notNull(),
  claimedByPersonId: uuid('claimed_by_person_id').notNull()
                  .references(() => persons.id, { onDelete: 'restrict' }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('capability_industry_measures_pair_key').on(t.capabilityId, t.industryMeasureId),
  index('capability_industry_measures_measure_idx').on(t.industryMeasureId),
]);

/* ================================================================== */
/* Sign-in — credentials and sessions (0027, phase P1)                */
/* ================================================================== */

/**
 * A vendor staff member's password, as an argon2id hash. Only persons
 * with a tenant_id (vendor staff) who are not simulated may have one —
 * enforced by the only writer, scripts/set_password.ts, and by the login
 * route, which ignores credentials on anyone else. Customer-side persons
 * are subjects of the record, not users of the system.
 *
 * ROTATION IS INSERT + REVOKE, NEVER UPDATE OR DELETE. Setting a new
 * password marks the current row revoked and inserts a new one; the
 * partial unique index allows one current credential per person.
 * _no_delete is installed by hardening.sql (section 15).
 *
 * DELIBERATELY NOT AUDITED. lvrf_audit() copies whole rows into
 * audit_log; for this table that would copy password hashes into a log
 * that is append-only and can never be cleaned. The fact that a password
 * was set is recorded by the row itself (created_at, set_via).
 */
export const personCredentials = pgTable('person_credentials', {
  id: id(),
  personId: uuid('person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  passwordHash: text('password_hash').notNull(),
  /**
   * How it was set: 'cli:<os user>' (set_password.ts, break-glass or
   * initial setup), 'grant' (grant_access.ts), 'reset' (reset_password.ts),
   * 'self' (POST /api/auth/change-password).
   */
  setVia: text('set_via').notNull(),
  /**
   * 0029, Band A item 1. A starting password chosen by the steward (grant
   * or reset) must be replaced by its holder: while true, a session may
   * reach only /api/auth/me, /change-password and /logout (requireActor
   * answers every other /api route 403 password_change_required).
   */
  mustChange: boolean('must_change').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('person_credentials_one_current')
    .on(t.personId)
    .where(sql`${t.revokedAt} IS NULL`),
  check('person_credentials_hash_is_argon2id',
    sql`${t.passwordHash} LIKE '$argon2id$%'`),
]);

/**
 * 0029, 3.0 Band A item 1 — an access grant is a record.
 *
 * Who may use LVRF is decided by the tenant's steward (tenants.
 * steward_person_id; Brad Piver for Skillsoft — 3.0 draft Q2/D4) and by
 * nobody else. A grant names the person, the steward who granted it, when
 * and why; a revocation names who revoked it, when and why. Sign-in
 * requires a current grant as well as a current credential (enforced from
 * Band A deploy B).
 *
 * Insert + revoke, never deleted (_no_delete) and audited (_audit; no
 * secrets here, unlike person_credentials). access_grants_steward_only
 * (hardening.sql section 16) holds the rest in the database: the grantor
 * and the revoker must be the person's tenant's steward, the grant must
 * match the person's own tenant, and an UPDATE may only fill in the
 * revocation, once. The steward's own first grant (grantor = grantee) is
 * the bootstrap and is allowed by the same rule.
 */
export const accessGrants = pgTable('access_grants', {
  id: id(),
  personId: uuid('person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  grantedByPersonId: uuid('granted_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  reason: text('reason').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedByPersonId: uuid('revoked_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  revocationReason: text('revocation_reason'),
}, (t) => [
  uniqueIndex('access_grants_one_current')
    .on(t.personId)
    .where(sql`${t.revokedAt} IS NULL`),
  index('access_grants_tenant_idx').on(t.tenantId),
  check('access_grants_reason_stated', sql`length(btrim(${t.reason})) >= 12`),
  check('access_grants_revocation_complete',
    sql`(${t.revokedAt} IS NULL) = (${t.revokedByPersonId} IS NULL)
        AND (${t.revokedAt} IS NULL) = (${t.revocationReason} IS NULL)`),
  check('access_grants_revocation_reason_stated',
    sql`${t.revocationReason} IS NULL OR length(btrim(${t.revocationReason})) >= 12`),
  check('access_grants_revoked_after_granted',
    sql`${t.revokedAt} IS NULL OR ${t.revokedAt} >= ${t.grantedAt}`),
]);

/**
 * A signed-in browser. The token itself is never stored — only its
 * SHA-256 — so a read of this table cannot be replayed as a login.
 *
 * Signing out, expiry and password rotation set revoked_at or are judged
 * by expires_at; no row is ever deleted (_no_delete, hardening.sql
 * section 15). Not audited: high volume, and the row already is the
 * record. expires_at slides forward on use (12 hours of inactivity) and
 * never passes absolute_expires_at (7 days after sign-in).
 */
export const sessions = pgTable('sessions', {
  id: id(),
  tokenHash: text('token_hash').notNull(),
  personId: uuid('person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  userAgent: text('user_agent'),
}, (t) => [
  unique('sessions_token_hash_key').on(t.tokenHash),
  index('sessions_person_idx').on(t.personId),
  check('sessions_expiry_is_bounded',
    sql`${t.expiresAt} <= ${t.absoluteExpiresAt}`),
]);

/* ================================================================== */
/* Outputs band, O1 — value levers and the solutions that pull them    */
/* ================================================================== */

/**
 * 0035 (O1; LVRF_PLAN §5; CAPABILITY_MAP item 8). A VALUE LEVER is the
 * mechanism by which capability change moves one pack entry — the step
 * between "a capability" and "a measure". Pack content, so a STEWARD act
 * (O-D2). It carries a mechanism a CFO can test, a leading indicator (what
 * moves first) and a citation; it carries NO expected-effect size: a lever
 * is a mechanism, not a promise (no invented targets, §5).
 *
 * Governed (governance(): status proposed → ratified, supersession,
 * retirement). WITHDRAWN = RETIRED: POST /api/value-levers/:id/retire
 * (steward) sets deleted_at, status 'retired', who and why together, never
 * apart (value_levers_retirement_is_complete). A withdrawn lever stays on
 * the pack page, marked, with its solutions. Only the tenant's steward may
 * propose or withdraw one — in the route AND in the database
 * (value_levers_steward_act, hardening section 22). NO partial unique index on (industry_measure_id, name): a
 * two-step supersession would trip it (the 0014/0015 and 0034 lesson); the
 * route refuses a second CURRENT lever of the same name on the same entry.
 */
export const valueLevers = pgTable('value_levers', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  industryMeasureId: uuid('industry_measure_id').notNull().references(() => industryMeasures.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  /** How capability change moves the measure — one testable sentence. */
  mechanism: text('mechanism').notNull(),
  /** What moves first, before the measure does. */
  leadingIndicator: text('leading_indicator').notNull(),
  /** A lever without a source is an assertion (rule 5). */
  citation: text('citation').notNull(),
  proposedByPersonId: uuid('proposed_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  ...governance(),
  status: lifecycleStatus('status').notNull().default('proposed'),
  retiredByPersonId: uuid('retired_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  retirementReason: text('retirement_reason'),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id], name: 'value_levers_superseded_by_fk' }).onDelete('restrict'),
  /** Withdrawn means all four marks together — deleted_at, status, who, why (≥ 12) — or none (as industry_measures, 0032). */
  check('value_levers_retirement_is_complete',
    sql`(${t.deletedAt} IS NULL AND ${t.retiredByPersonId} IS NULL AND ${t.retirementReason} IS NULL
         AND ${t.status} <> 'retired')
        OR (${t.deletedAt} IS NOT NULL AND ${t.status} = 'retired' AND ${t.retiredByPersonId} IS NOT NULL
            AND char_length(btrim(${t.retirementReason})) >= 12)`),
  index('value_levers_measure_idx').on(t.industryMeasureId),
  index('value_levers_tenant_idx').on(t.tenantId),
  check('value_levers_stated',
    sql`btrim(${t.name}) <> '' AND length(btrim(${t.mechanism})) >= 12
        AND btrim(${t.leadingIndicator}) <> '' AND length(btrim(${t.citation})) >= 12`),
]);

/**
 * 0035 (O1; CAPABILITY_MAP item 10). A Skillsoft solution (a catalog
 * offering) that pulls a lever, with the steward's basis for saying so
 * (O-D2). Rendered beside the offering's own evidence_class and
 * verification_source, so "solutions per lever" also says what each can
 * EVIDENCE — consumption is not realization.
 *
 * APPEND-ONLY but for one act: WITHDRAWAL. POST /api/lever-offerings/:id/
 * retire (steward) sets retired_at, who and why, together and once
 * (lever_offerings_retirement_is_complete); lever_offerings_append_only
 * (hardening section 20) refuses every other UPDATE, and _no_delete every
 * DELETE. A withdrawn link stays on the pack page, marked. The pair is
 * unique among CURRENT links only, so a withdrawn pair can be linked again
 * as a new row (retire, then link: two statements, no two-step trip).
 */
export const leverOfferings = pgTable('lever_offerings', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  valueLeverId: uuid('value_lever_id').notNull().references(() => valueLevers.id, { onDelete: 'restrict' }),
  offeringId: uuid('offering_id').notNull().references(() => offerings.id, { onDelete: 'restrict' }),
  basis: text('basis').notNull(),
  linkedByPersonId: uuid('linked_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  retiredByPersonId: uuid('retired_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  retirementReason: text('retirement_reason'),
}, (t) => [
  uniqueIndex('lever_offerings_pair_key').on(t.valueLeverId, t.offeringId).where(sql`${t.retiredAt} IS NULL`),
  check('lever_offerings_retirement_is_complete',
    sql`(${t.retiredAt} IS NULL AND ${t.retiredByPersonId} IS NULL AND ${t.retirementReason} IS NULL)
        OR (${t.retiredAt} IS NOT NULL AND ${t.retiredByPersonId} IS NOT NULL
            AND char_length(btrim(${t.retirementReason})) >= 12)`),
  index('lever_offerings_lever_idx').on(t.valueLeverId),
  check('lever_offerings_basis_stated', sql`length(btrim(${t.basis})) >= 12`),
]);

/* ================================================================== */
/* Outputs band, O2 — hypotheses, executive summaries, reference marks */
/* ================================================================== */

/** O2-D2: what kind of reference example an account is. */
/**
 * UX-1-D3 (0038, 19 Oct 2026): outside_in_test — an outside-in test of the
 * method against a company's published record (Scotts). Neither a customer's
 * published case study nor a demonstration built for show. Added, never
 * renamed: existing markers keep their kind; a correction is the steward's
 * supersession, on the record.
 */
export const referenceExampleKind = pgEnum('reference_example_kind', ['published_case_study', 'demonstration', 'outside_in_test']);
/** O2-D4: the recorded value a falsifier is measured against. */
export const falsifierReference = pgEnum('falsifier_reference', ['baseline', 'committed_target']);
/** The reader an executive summary was written for (lens_policies are O3). */
export const summaryLens = pgEnum('summary_lens', ['cfo', 'chro', 'board', 'general']);

/**
 * 0036 (O2-D2). An account is a REFERENCE EXAMPLE only when a current
 * marker says so — never inferred from retired engagements, which mean
 * something else. Typed (kind), cited, steward-set (the route and
 * reference_example_markers_steward_only, hardening section 22), audited,
 * supersedable (a correction), retirable (unmarking: deleted_at, status
 * 'retired', who and why together). One current marker per account, by a
 * DEFERRED constraint trigger (the 0034 lesson: a two-step supersession).
 * O-D3 reads it: a reference example renders only as one.
 */
export const referenceExampleMarkers = pgTable('reference_example_markers', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  kind: referenceExampleKind('kind').notNull(),
  /** Where the example comes from, e.g. the published case study. */
  sourceCitation: text('source_citation').notNull(),
  note: text('note').notNull(),
  markedByPersonId: uuid('marked_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  retiredByPersonId: uuid('retired_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  retirementReason: text('retirement_reason'),
  supersessionReason: text('supersession_reason'),
  ...governance(),
  status: lifecycleStatus('status').notNull().default('active'),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id], name: 'reference_example_markers_superseded_by_fk' }).onDelete('restrict'),
  index('reference_example_markers_institution_idx').on(t.institutionId),
  check('reference_example_markers_stated',
    sql`length(btrim(${t.sourceCitation})) >= 12 AND length(btrim(${t.note})) >= 12`),
  check('reference_example_markers_retirement_is_complete',
    sql`(${t.deletedAt} IS NULL AND ${t.retiredByPersonId} IS NULL AND ${t.retirementReason} IS NULL AND ${t.status} <> 'retired')
        OR (${t.deletedAt} IS NOT NULL AND ${t.status} = 'retired' AND ${t.retiredByPersonId} IS NOT NULL
            AND char_length(btrim(${t.retirementReason})) >= 12)`),
  check('reference_example_markers_supersession_reason',
    sql`(${t.supersededById} IS NULL) = (${t.supersessionReason} IS NULL)
        AND (${t.supersessionReason} IS NULL OR length(btrim(${t.supersessionReason})) >= 12)`),
]);

/**
 * 0036 (O2; CAPABILITY_MAP item 7). A VALUE HYPOTHESIS: this account's
 * outcome (which names the capability and the metric) moves, through this
 * lever, and here is what would show it wrong.
 *
 * THE FALSIFIER CARRIES NO NEW NUMBER (O-D4, O2-D4). It is "no better than
 * the reference by the due date", where the reference is the outcome's
 * recorded baseline or its committed target. reference_value and
 * reference_recorded_at are COPIED BY THE DATABASE at INSERT
 * (value_hypotheses_guard), never taken from a request. The conditions are
 * words only: a digit is refused ("numbers belong in recorded values, not
 * falsifier conditions"). The direction (lower or higher is better) is the
 * PACK ENTRY's: this table has no direction column.
 *
 * NO STORED VERDICT (O2-D1). lvrf_hypothesis_verdict() computes open ·
 * survived · refuted (· _post_hoc) · withdrawn · superseded from the
 * falsifier and the outcome's VERIFIED actual. Nobody decides it; the human
 * act is verifying the actual, and the verifier may not be the author.
 *
 * FROZEN. Nothing about a hypothesis changes after INSERT; a new version
 * supersedes it (with a reason), the old one stays visible, and only while
 * the verdict is open. post_hoc (O2-D3) is computed at INSERT.
 */
export const valueHypotheses = pgTable('value_hypotheses', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  valueOutcomeId: uuid('value_outcome_id').notNull().references(() => valueOutcomes.id, { onDelete: 'restrict' }),
  valueLeverId: uuid('value_lever_id').notNull().references(() => valueLevers.id, { onDelete: 'restrict' }),
  statement: text('statement').notNull(),
  falsifierReference: falsifierReference('falsifier_reference').notNull(),
  falsifierDue: date('falsifier_due').notNull(),
  falsifierConditions: text('falsifier_conditions').notNull().default(''),
  /** Set by value_hypotheses_guard from the outcome row; never from a request. */
  referenceValue: numeric('reference_value', { precision: 18, scale: 4 }).notNull(),
  referenceRecordedAt: timestamp('reference_recorded_at', { withTimezone: true }).notNull(),
  /** O2-D3, computed at INSERT: written after its due date or after a measured actual. */
  postHoc: boolean('post_hoc').notNull().default(false),
  authorPersonId: uuid('author_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  retiredByPersonId: uuid('retired_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  retirementReason: text('retirement_reason'),
  supersessionReason: text('supersession_reason'),
  ...governance(),
  status: lifecycleStatus('status').notNull().default('proposed'),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id], name: 'value_hypotheses_superseded_by_fk' }).onDelete('restrict'),
  index('value_hypotheses_institution_idx').on(t.institutionId),
  index('value_hypotheses_outcome_idx').on(t.valueOutcomeId),
  check('value_hypotheses_statement_stated', sql`length(btrim(${t.statement})) >= 24`),
  check('value_hypotheses_conditions_no_digits', sql`${t.falsifierConditions} !~ '[0-9]'`),
  check('value_hypotheses_retirement_is_complete',
    sql`(${t.deletedAt} IS NULL AND ${t.retiredByPersonId} IS NULL AND ${t.retirementReason} IS NULL AND ${t.status} <> 'retired')
        OR (${t.deletedAt} IS NOT NULL AND ${t.status} = 'retired' AND ${t.retiredByPersonId} IS NOT NULL
            AND char_length(btrim(${t.retirementReason})) >= 12)`),
  check('value_hypotheses_supersession_reason',
    sql`(${t.supersededById} IS NULL) = (${t.supersessionReason} IS NULL)
        AND (${t.supersessionReason} IS NULL OR length(btrim(${t.supersessionReason})) >= 12)`),
]);

/**
 * 0036 (O2; O-D6). An EXECUTIVE SUMMARY, human-authored and attributed:
 * author_person_id is the session's actor (set by the route), non-simulated
 * vendor staff (executive_summaries_guard). LVRF generates no prose; an
 * AI-drafted one says so (drafted_with_ai and the tool, together). Append-
 * only versions: a new version names the one it supersedes
 * (supersedes_id, each version superseded at most once); no row is ever
 * updated (the guard refuses every UPDATE) or deleted.
 */
export const executiveSummaries = pgTable('executive_summaries', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  valueRunId: uuid('value_run_id').references(() => valueRuns.id, { onDelete: 'restrict' }),
  lens: summaryLens('lens').notNull(),
  body: text('body').notNull(),
  authorPersonId: uuid('author_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  draftedWithAi: boolean('drafted_with_ai').notNull(),
  draftingTool: text('drafting_tool'),
  supersedesId: uuid('supersedes_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.supersedesId], foreignColumns: [t.id], name: 'executive_summaries_supersedes_fk' }).onDelete('restrict'),
  unique('executive_summaries_supersedes_key').on(t.supersedesId),
  index('executive_summaries_institution_idx').on(t.institutionId),
  check('executive_summaries_body_stated', sql`length(btrim(${t.body})) >= 40`),
  check('executive_summaries_ai_disclosed',
    sql`(${t.draftedWithAi} AND ${t.draftingTool} IS NOT NULL AND length(btrim(${t.draftingTool})) >= 2)
        OR (NOT ${t.draftedWithAi} AND ${t.draftingTool} IS NULL)`),
]);

/* ================================================================== */
/* Account ↔ person links (0037, the W1 fix)                           */
/* ================================================================== */

/** What a linked person is on an account. One role today. */
export const accountPersonRole = pgEnum('account_person_role', ['analyst_of_record']);

/**
 * 0037 (W1 fix, 12 Oct 2026). An EXISTING person named in a role on an
 * account, with a title stated for that account — without a person row on
 * the account. For an outside-in walk the honest analyst of record is the
 * vendor's own analyst (Brad), asserting from published material, not a
 * customer employee; persons are scoped to exactly one tenant or one
 * institution, so naming him on an account needs this link, not a copy.
 *
 * A LINK NEVER MAKES A PERSON CUSTOMER-SIDE. It satisfies the capability-
 * owner and engagement-owner checks (an analyst may own what he asserts;
 * the engagement owner is vendor-side by design), and nothing else: commit,
 * verify and attestation still require a person OF the institution, and
 * lvrf_evidence_basis's customer-side attester rule reads
 * persons.institution_id, which a link does not touch.
 *
 * Append-only but for one withdrawal (retired_at, who, why), by
 * account_person_links_guard (hardening section 23): the person is current,
 * non-simulated staff of the account's tenant. One current link per
 * account, person and role (a partial unique index: unlink, then relink,
 * is two statements).
 */
export const accountPersonLinks = pgTable('account_person_links', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  personId: uuid('person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  role: accountPersonRole('role').notNull(),
  /** The title on THIS account, e.g. "External analyst of record — not an employee". */
  title: text('title').notNull(),
  linkedByPersonId: uuid('linked_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  retiredByPersonId: uuid('retired_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  retirementReason: text('retirement_reason'),
}, (t) => [
  uniqueIndex('account_person_links_current_key').on(t.institutionId, t.personId, t.role).where(sql`${t.retiredAt} IS NULL`),
  index('account_person_links_institution_idx').on(t.institutionId),
  check('account_person_links_title_stated', sql`length(btrim(${t.title})) >= 3`),
  check('account_person_links_retirement_is_complete',
    sql`(${t.retiredAt} IS NULL AND ${t.retiredByPersonId} IS NULL AND ${t.retirementReason} IS NULL)
        OR (${t.retiredAt} IS NOT NULL AND ${t.retiredByPersonId} IS NOT NULL
            AND char_length(btrim(${t.retirementReason})) >= 12)`),
]);
