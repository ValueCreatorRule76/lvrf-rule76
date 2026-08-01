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
  timestamp, jsonb, bigserial, index, unique, check, primaryKey, foreignKey,
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
  'observation', 'attestation', 'public_filing',
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
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'business_metrics_superseded_by_fk' }).onDelete('restrict'),
  unique('business_metrics_institution_name_key').on(t.institutionId, t.name),
  index('business_metrics_institution_idx').on(t.institutionId),
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

  assessmentId: uuid('assessment_id').references(() => assessments.id, { onDelete: 'restrict' }),
  capturedByPersonId: uuid('captured_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),

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
  index('evidence_institution_idx').on(t.institutionId),
  index('evidence_verified_idx').on(t.sourceVerified),
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
