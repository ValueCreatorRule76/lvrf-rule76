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
  timestamp, jsonb, bigserial, index, unique, uniqueIndex, check, primaryKey, foreignKey,
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
  /** True when this institution IS the tenant — the customer-zero engagement. */
  isTenantSelf: boolean('is_tenant_self').notNull().default(false),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'institutions_superseded_by_fk' }).onDelete('restrict'),
  unique('institutions_tenant_name_key').on(t.tenantId, t.name),
  index('institutions_tenant_idx').on(t.tenantId),
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
  /** A confirmer with no date, or a date with no confirmer, is a half-recorded fact. */
  check('business_metrics_definition_confirmation_is_complete',
    sql`(${t.definitionConfirmedByPersonId} IS NULL AND ${t.definitionConfirmedAt} IS NULL)
        OR (${t.definitionConfirmedByPersonId} IS NOT NULL AND ${t.definitionConfirmedAt} IS NOT NULL)`),
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
  /** Does this evidence support the baseline, the actual, or the impact basis? */
  supports: text('supports').notNull().default('baseline'),
}, (t) => [primaryKey({ columns: [t.valueOutcomeId, t.evidenceId] })]);

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
  /** Postgres SQLSTATE, e.g. '23514', '23505'. */
  sqlstate: text('sqlstate').notNull(),
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
 */
export const researchResults = pgTable('research_results', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'restrict' }),
  /** Null when the research was not metric-scoped. */
  businessMetricId: uuid('business_metric_id').references(() => businessMetrics.id, { onDelete: 'restrict' }),

  /** What LVRF asked. */
  researchQuery: text('research_query').notNull(),
  /** What the agent SAYS it ran — not necessarily identical to researchQuery. */
  queryAsExecuted: text('query_as_executed').notNull(),
  researchTool: text('research_tool').notNull(),
  fieldName: text('field_name').notNull(),

  found: boolean('found').notNull(),
  /** Null when found is false. */
  value: text('value'),
  /** Null when found is false. */
  citation: text('citation'),
  /** Null when found is true. */
  notFoundReason: text('not_found_reason'),
  /** The whole field object as parsed, verbatim. */
  rawResponse: jsonb('raw_response').notNull(),

  reviewState: researchReviewState('review_state').notNull().default('pending'),
  reviewedByPersonId: uuid('reviewed_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  /** Set when accepted and an evidence row was written from this result. */
  evidenceId: uuid('evidence_id').references(() => evidence.id, { onDelete: 'restrict' }),

  parsedAt: timestamp('parsed_at', { withTimezone: true }).notNull().defaultNow(),
  parsedByPersonId: uuid('parsed_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
}, (t) => [
  /** A decision has a decider and a time, both or neither. */
  check('research_results_review_is_complete',
    sql`${t.reviewState} = 'pending'
        OR (${t.reviewedByPersonId} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL)`),
  /** The response shape is enforced, not trusted. */
  check('research_results_found_shape',
    sql`(${t.found} = true AND ${t.value} IS NOT NULL AND ${t.citation} IS NOT NULL)
        OR (${t.found} = false AND ${t.notFoundReason} IS NOT NULL)`),
  /** Accepting means an evidence row exists. */
  check('research_results_accepted_has_evidence',
    sql`${t.reviewState} <> 'accepted' OR ${t.evidenceId} IS NOT NULL`),
  index('research_results_tenant_idx').on(t.tenantId),
  index('research_results_institution_idx').on(t.institutionId),
  index('research_results_business_metric_idx').on(t.businessMetricId),
  index('research_results_review_state_idx').on(t.reviewState),
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
