#!/usr/bin/env node
//
// The cases for verify_tenant_scope.sh (sign-in P3). Run only by that
// script, which builds the clone, the fixtures and the server and passes
// everything in the environment. Talks to the server over HTTP with real
// sessions (no header), and to the clone with psql for counts.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const E = process.env;
const BASE = E.BASE;
let PASS = 0;
let FAIL = 0;
const ok = (m) => { PASS++; console.log(`  PASS  ${m}`); };
const bad = (m) => { FAIL++; console.log(`  FAIL  ${m}`); };
const step = (m) => console.log(`\n==> ${m}`);
const q = (sql) => execFileSync('psql', ['-At', '-d', E.VERIFY_DB, '-c', sql], { encoding: 'utf8' }).trim();
const logText = () => readFileSync(E.LOG, 'utf8');
// Marked into every body, so the log can be searched for it: a mismatch
// line must never carry the request body.
const MARK = `P3-BODY-MARKER-${E.TS}`;

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: E.PW }),
  });
  if (r.status !== 200) throw new Error(`login ${email} -> ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

async function call(cookie, method, path, body) {
  const init = { method, headers: { cookie } };
  if (method !== 'GET') {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body ?? {});
  }
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  // The message AND any issues list: a 422 that names its issue must name
  // the same one for another tenant's id as for an unknown id.
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? json : null;
  const message = obj ? (Array.isArray(obj.issues) ? [obj.message, ...obj.issues].join(' | ') : obj.message) : undefined;
  return { status: r.status, json, text, message };
}

const T0 = '2026-01-01T00:00:00Z';
const note = (s) => `${s} — ${MARK}`;

// ---------------------------------------------------------------- cases
//
// kind 'id': B calls `path` with A's id; it must get `notFound` (status +
// exact message), the mismatch is logged against `target`, and A's
// identical call (or `controlBody`) must NOT get that answer.
// kind 'list': B's response must hold none of `aIds` (and all of `bIds`);
// A's must hold all of `aIds` and none of `bIds`.
// kind 'special': its own check, run where noted.

const CASES = [
  // ---- reads
  { route: 'GET /api/business-metrics/:metricId/research-prompt', kind: 'id',
    path: `/api/business-metrics/${E.METRIC_A_SELF}/research-prompt`,
    notFound: [404, `business metric ${E.METRIC_A_SELF} not found, retired, or superseded`], target: ['business_metrics', E.METRIC_A_SELF] },
  // Q4n: INST_A carries MARKER_A (a reference example), which the book leaves out
  // by design (O-D3); an unmarked A account is the one A must see.
  { route: 'GET /api/cohort', kind: 'list', path: '/api/cohort', aIds: [E.INST_A_UNCLASSIFIED], bIds: [E.INST_B] },
  { route: 'GET /api/engagements', kind: 'list', path: '/api/engagements', aIds: [E.ENG_A], bIds: [E.ENG_B] },
  { route: 'GET /api/engagements/:id/runs', kind: 'id', path: `/api/engagements/${E.ENG_A}/runs`,
    notFound: [404, `engagement ${E.ENG_A} not found`], target: ['engagements', E.ENG_A] },
  { route: 'GET /api/industries', kind: 'list', path: '/api/industries', aIds: [E.IND_A], bIds: [E.IND_B] },
  // By slug, tenant in the WHERE: no single row of another tenant, so
  // nothing to log — another tenant's slug is simply not found.
  { route: 'GET /api/industries/:slug/pack', kind: 'id', path: `/api/industries/${E.SLUG_A}/pack`,
    notFound: [404, `industry '${E.SLUG_A}' not found`], target: null },
  { route: 'GET /api/industries/:slug/research', kind: 'id', path: `/api/industries/${E.SLUG_A}/research`,
    notFound: [404, `industry '${E.SLUG_A}' not found`], target: null },
  { route: 'GET /api/institutions/:institutionId/research', kind: 'id', path: `/api/institutions/${E.INST_A}/research`,
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'GET /api/institutions/:institutionId/walk', kind: 'id', path: `/api/institutions/${E.INST_A}/walk`,
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'GET /api/institutions', kind: 'list', path: '/api/institutions', aIds: [E.INST_A], bIds: [E.INST_B] },
  { route: 'GET /api/institutions/:id/view', kind: 'id', path: `/api/institutions/${E.INST_A}/view`,
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  // O2: the POV read, and the hypothesis, summary and reference-example acts.
  { route: 'GET /api/institutions/:institutionId/pov', kind: 'id', path: `/api/institutions/${E.INST_A}/pov`,
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/hypotheses', kind: 'id', path: `/api/institutions/${E.INST_A}/hypotheses`,
    body: { value_outcome_id: E.OUTCOME_A, value_lever_id: E.LEVER_A, statement: note('Verification: a hypothesis for the tenant scope checks.'),
            falsifier_reference: 'baseline', falsifier_due: '2030-01-01', falsifier_conditions: 'on the same denominator' },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/executive-summaries', kind: 'id', path: `/api/institutions/${E.INST_A}/executive-summaries`,
    body: { lens: 'board', body: note('Verification: an executive summary for the tenant scope checks.'), drafted_with_ai: false },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/reference-example', kind: 'id', path: `/api/institutions/${E.INST_A}/reference-example`,
    body: { kind: 'demonstration', source_citation: note('Verification citation.'), note: note('Verification marker.') },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/value-hypotheses/:id/supersede', kind: 'id', path: `/api/value-hypotheses/${E.HYP_A}/supersede`,
    body: { statement: note('Verification: a restated hypothesis for the checks.'), falsifier_reference: 'baseline', falsifier_due: '2030-01-01',
            falsifier_conditions: 'on the same denominator', supersession_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `value hypothesis ${E.HYP_A} not found`], target: ['value_hypotheses', E.HYP_A] },
  { route: 'POST /api/value-hypotheses/:id/withdraw', kind: 'id', path: `/api/value-hypotheses/${E.HYP_A}/withdraw`,
    body: { retirement_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `value hypothesis ${E.HYP_A} not found`], target: ['value_hypotheses', E.HYP_A] },
  { route: 'POST /api/reference-examples/:id/supersede', kind: 'id', path: `/api/reference-examples/${E.MARKER_A}/supersede`,
    body: { kind: 'demonstration', source_citation: note('Verification citation.'), note: note('Verification marker.'), supersession_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `reference example marker ${E.MARKER_A} not found`], target: ['reference_example_markers', E.MARKER_A] },
  // Q4k: opening an AI-sourced citation on outcome evidence.
  { route: 'POST /api/evidence/:id/open-citation', kind: 'id', path: `/api/evidence/${E.EV_A}/open-citation`,
    body: { source_verified: false },
    notFound: [404, `evidence ${E.EV_A} not found`], target: ['evidence', E.EV_A] },
  // W1 fix: naming an analyst of record, and withdrawing the link.
  { route: 'POST /api/institutions/:institutionId/analyst-of-record', kind: 'id', path: `/api/institutions/${E.INST_A}/analyst-of-record`,
    body: { person_id: E.STAFF_A, title: 'Verification analyst' },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/account-person-links/:id/retire', kind: 'id', path: `/api/account-person-links/${E.APL_A}/retire`,
    body: { retirement_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `account person link ${E.APL_A} not found`], target: ['account_person_links', E.APL_A] },
  { route: 'POST /api/reference-examples/:id/retire', kind: 'id', path: `/api/reference-examples/${E.MARKER_A}/retire`,
    body: { retirement_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `reference example marker ${E.MARKER_A} not found`], target: ['reference_example_markers', E.MARKER_A] },
  // C1: correcting what a link supports, and an erratum on a sealed run. A's
  // controls are refused before any write (an unknown field; texts missing).
  { route: 'POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/correct-support', kind: 'id',
    path: `/api/value-outcomes/${E.OUTCOME_A}/evidence/${E.LINKEV_A}/correct-support`, body: {}, controlBody: { x: 1 },
    notFound: [404, `no current link of evidence ${E.LINKEV_A} to value outcome ${E.OUTCOME_A}`], target: ['value_outcomes', E.OUTCOME_A] },
  // C2c: the withdrawal, the same shape as the correction.
  { route: 'POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/withdraw', kind: 'id',
    path: `/api/value-outcomes/${E.OUTCOME_A}/evidence/${E.LINKEV_A}/withdraw`, body: {}, controlBody: { x: 1 },
    notFound: [404, `no current link of evidence ${E.LINKEV_A} to value outcome ${E.OUTCOME_A}`], target: ['value_outcomes', E.OUTCOME_A] },
  // C3: customer-side roles (steward's act), the credit errata and the system-exercise marks. The batch
  // routes take the actor's tenant, never an id in the path; they are checked in F.
  { route: 'GET /api/institutions/:institutionId/customer-roles', kind: 'id', path: `/api/institutions/${E.INST_A}/customer-roles`,
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/customer-roles', kind: 'id', path: `/api/institutions/${E.INST_A}/customer-roles`,
    body: {}, controlBody: { x: 1 }, notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/customer-roles/:id/revoke', kind: 'id', path: `/api/customer-roles/${E.GRANT_A}/revoke`,
    body: {}, controlBody: { x: 1 }, notFound: [404, `role grant ${E.GRANT_A} not found`], target: ['customer_role_grants', E.GRANT_A] },
  { route: 'GET /api/system-exercise/candidates', kind: 'list', path: '/api/system-exercise/candidates', aIds: [E.EV_A, E.RUN_A], bIds: [] },
  { route: 'GET /api/errata/non-customer-credit', kind: 'list', path: '/api/errata/non-customer-credit', aIds: [], bIds: [] },
  { route: 'POST /api/errata/non-customer-credit', kind: 'actor' },
  { route: 'POST /api/system-exercise/marks', kind: 'actor' },
  { route: 'POST /api/value-runs/:runId/errata', kind: 'id', path: `/api/value-runs/${E.RUN_A}/errata`, body: {},
    notFound: [404, `run ${E.RUN_A} not found`], target: ['value_runs', E.RUN_A] },
  // P2: where a figure came from (read-only).
  { route: 'GET /api/lineage/:table/:id', kind: 'id', path: `/api/lineage/institution_facts/${E.FACT_A}`,
    notFound: [404, `institution_facts ${E.FACT_A} not found`], target: ['institution_facts', E.FACT_A] },
  { route: 'GET /api/persons', kind: 'list', path: '/api/persons', aIds: [E.STAFF_A, E.CUST_A], bIds: [E.STAFF_B, E.CUST_B] },
  { route: 'GET /api/runs', kind: 'list', path: '/api/runs', aIds: [E.RUN_A], bIds: [] },
  { route: 'GET /api/runs/:id', kind: 'id', path: `/api/runs/${E.RUN_A}`,
    notFound: [404, `run ${E.RUN_A} not found`], target: ['value_runs', E.RUN_A] },
  { route: 'GET /api/value-outcomes/:outcomeId/gaps', kind: 'id', path: `/api/value-outcomes/${E.OUTCOME_A}/gaps`,
    notFound: [404, `value outcome ${E.OUTCOME_A} not found`], target: ['value_outcomes', E.OUTCOME_A] },
  { route: 'GET /api/value-outcomes/:outcomeId/record-documents', kind: 'id', path: `/api/value-outcomes/${E.OUTCOME_A}/record-documents`,
    notFound: [404, `value outcome ${E.OUTCOME_A} not found`], target: ['value_outcomes', E.OUTCOME_A] },
  { route: 'GET /api/value-runs/:baselineRunId/compare/:comparisonRunId', kind: 'id', path: `/api/value-runs/${E.RUN_A}/compare/${E.RUN_A2}`,
    notFound: [404, `value run ${E.RUN_A} not found`], target: ['value_runs', E.RUN_A] },

  // ---- writes
  { route: 'POST /api/account-inputs', kind: 'special' },
  { route: 'POST /api/business-metrics/:metricId/pack-basis', kind: 'id', path: `/api/business-metrics/${E.METRIC_A}/pack-basis`,
    body: { industry_measure_id: E.MEASURE_OTHER, basis_note: note('P3 verification') },
    notFound: [404, `business metric ${E.METRIC_A} not found`], target: ['business_metrics', E.METRIC_A] },
  { route: 'POST /api/business-metrics/:metricId/validate', kind: 'id', path: `/api/business-metrics/${E.METRIC_A}/validate`,
    body: { metric: { unit: 'count', direction: 'increase', source_system: 'verification system of record' }, baseline_value: 0,
            baseline_measured_at: T0, confirmed_by_person_id: E.CUST_A, supersession_reason: note('P3 verification') },
    // A's control must not supersede the metric the body-id cases use:
    // a confirmer who is not of the account fails AFTER the lookup.
    controlBody: { metric: { unit: 'count', direction: 'increase', source_system: 'verification system of record' }, baseline_value: 0,
                   baseline_measured_at: T0, confirmed_by_person_id: E.STAFF_B, supersession_reason: note('P3 verification') },
    notFound: [404, `business metric ${E.METRIC_A} not found`], target: ['business_metrics', E.METRIC_A] },
  { route: 'POST /api/capabilities/:capabilityId/industry-measures', kind: 'id', path: `/api/capabilities/${E.CAP_A}/industry-measures`,
    body: { industry_measure_id: E.MEASURE_OTHER, claim: note('P3 verification') },
    notFound: [404, `capability ${E.CAP_A} not found`], target: ['capabilities', E.CAP_A] },
  { route: 'POST /api/engagements/:engagementId/produce-run', kind: 'id', path: `/api/engagements/${E.ENG_A}/produce-run`,
    body: { source_fixture: 'p3-verification', note: note('P3 verification') },
    notFound: [404, `engagement ${E.ENG_A} not found`], target: ['engagements', E.ENG_A] },
  { route: 'POST /api/engagements/:id/retire', kind: 'id', path: `/api/engagements/${E.ENG_A_RETIRE}/retire`,
    body: { retirement_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `engagement ${E.ENG_A_RETIRE} not found, already retired, or superseded`], target: ['engagements', E.ENG_A_RETIRE] },
  { route: 'POST /api/industries/:industryId/exclusions', kind: 'id', path: `/api/industries/${E.IND_A}/exclusions`,
    body: { name: `P3 verification ${E.TS}`, reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `industry ${E.IND_A} not found`], target: ['industries', E.IND_A] },
  { route: 'POST /api/industries/:industryId/research-prompts', kind: 'id', path: `/api/industries/${E.IND_A}/research-prompts`,
    body: {},
    notFound: [404, `industry ${E.IND_A} not found`], target: ['industries', E.IND_A] },
  { route: 'POST /api/industries/:industryId/research-results', kind: 'id', path: `/api/industries/${E.IND_A}/research-results`,
    body: { research_query: note('q') },
    notFound: [404, `industry ${E.IND_A} not found`], target: ['industries', E.IND_A] },
  { route: 'POST /api/industry-measures/:id/retire', kind: 'id', path: `/api/industry-measures/${E.MEASURE_A}/retire`,
    body: { retirement_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `industry measure ${E.MEASURE_A} not found`], target: ['industry_measures', E.MEASURE_A] },
  // O1: value levers and the solutions that pull them.
  { route: 'POST /api/industry-measures/:id/levers', kind: 'id', path: `/api/industry-measures/${E.MEASURE_A}/levers`,
    body: { name: `P3 lever ${E.TS}`, mechanism: note('Verification: P3 tenant scope checks.'), leading_indicator: 'x', citation: note('Verification fixture.') },
    notFound: [404, `industry measure ${E.MEASURE_A} not found`], target: ['industry_measures', E.MEASURE_A] },
  { route: 'POST /api/value-levers/:id/offerings', kind: 'id', path: `/api/value-levers/${E.LEVER_A}/offerings`,
    body: { offering_key: 'p3_verification', basis: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `value lever ${E.LEVER_A} not found`], target: ['value_levers', E.LEVER_A] },
  { route: 'POST /api/value-levers/:id/retire', kind: 'id', path: `/api/value-levers/${E.LEVER_A}/retire`,
    body: { retirement_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `value lever ${E.LEVER_A} not found`], target: ['value_levers', E.LEVER_A] },
  { route: 'POST /api/lever-offerings/:id/retire', kind: 'id', path: `/api/lever-offerings/${E.LINK_A}/retire`,
    body: { retirement_reason: note('Verification: P3 tenant scope checks.') },
    notFound: [404, `lever offering ${E.LINK_A} not found`], target: ['lever_offerings', E.LINK_A] },
  { route: 'POST /api/institutions/:institutionId/research-prompts', kind: 'id', path: `/api/institutions/${E.INST_A}/research-prompts`,
    body: {}, notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/research-results', kind: 'id', path: `/api/institutions/${E.INST_A}/research-results`,
    body: { research_query: note('q') }, notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/account-research-results/:id/accept', kind: 'id', path: `/api/account-research-results/${E.ARR_A}/accept`,
    body: { review_note: note('P3 verification') }, notFound: [404, `account research result ${E.ARR_A} not found`], target: ['research_results', E.ARR_A] },
  { route: 'POST /api/account-research-results/:id/reject', kind: 'id', path: `/api/account-research-results/${E.ARR_A2}/reject`,
    body: { review_note: note('P3 verification') }, notFound: [404, `account research result ${E.ARR_A2} not found`], target: ['research_results', E.ARR_A2] },
  { route: 'POST /api/institutions/:institutionId/entity/supersede', kind: 'id', path: `/api/institutions/${E.INST_A}/entity/supersede`,
    body: { legal_name: 'P3 verification', identifier_type: 'ticker', identifier: 'PTHREE', source_kind: 'public_filing',
            citation: note('P3 verification citation'), supersession_reason: note('P3 verification reason') },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/facts', kind: 'id', path: `/api/institutions/${E.INST_A}/facts`,
    body: { kind: 'system', value_text: note('P3'), as_of: '2026-10-01', evidence_kind: 'observation',
            provenance: 'Verification run, not a real source', confidence: 'low' },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/facts/:factId/supersede', kind: 'id', path: `/api/institutions/${E.INST_A}/facts/${E.FACT_A}/supersede`,
    body: { value_text: note('Fact A corrected'), as_of: '2026-10-01', evidence_kind: 'observation', confidence: 'low',
            provenance: 'Verification run, not a real source', supersession_reason: note('P3 verification of the correction route') },
    notFound: [404, `fact ${E.FACT_A} not found on institution ${E.INST_A}`], target: ['institution_facts', E.FACT_A] },
  { route: 'POST /api/institutions/:institutionId/industry', kind: 'id', path: `/api/institutions/${E.INST_A_UNCLASSIFIED}/industry`,
    body: { industry_slug: 'no-such-slug-p3', classification_note: note('P3 verification') },
    notFound: [404, `institution ${E.INST_A_UNCLASSIFIED} not found`], target: ['institutions', E.INST_A_UNCLASSIFIED] },
  { route: 'POST /api/institutions/:institutionId/inputs', kind: 'id', path: `/api/institutions/${E.INST_A}/inputs`,
    body: { persons: [{ full_name: 'P3 verification person', email: `p3.${E.TS}@account-a.example`, title: MARK }] },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/offerings', kind: 'id', path: `/api/institutions/${E.INST_A}/offerings`,
    body: { offering_key: 'no-such-offering-p3', capability_name: 'x', owner_person_id: E.CUST_A, is_primary: true, basis: note('P3') },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/institutions/:institutionId/value-outcomes', kind: 'id', path: `/api/institutions/${E.INST_A}/value-outcomes`,
    body: { engagement_name: 'P3 verification', engagement_owner_person_id: E.CUST_A,
            metric: { name: `P3 metric ${E.TS}`, unit: 'count', direction: 'increase', source_system: 'verification system of record' },
            capability_name: 'no-such-capability-p3', baseline_value: 0, baseline_measured_at: T0, note: MARK },
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
  { route: 'POST /api/research-results/:id/accept', kind: 'id', path: `/api/research-results/${E.RR_A}/accept`,
    body: { review_note: note('P3 verification') },
    notFound: [404, `research result ${E.RR_A} not found`], target: ['research_results', E.RR_A] },
  { route: 'POST /api/research-results/:id/reject', kind: 'id', path: `/api/research-results/${E.RR_A2}/reject`,
    body: { review_note: note('P3 verification') },
    notFound: [404, `research result ${E.RR_A2} not found`], target: ['research_results', E.RR_A2] },
  { route: 'POST /api/value-outcomes/:outcomeId/commit', kind: 'id', path: `/api/value-outcomes/${E.OUTCOME_A}/commit`,
    body: { committed_by_person_id: E.CUST_A, committed_at: T0, target_value: 1, commitment_note: note('P3') },
    notFound: [404, `value outcome ${E.OUTCOME_A} not found`], target: ['value_outcomes', E.OUTCOME_A] },
  { route: 'POST /api/value-outcomes/:outcomeId/evidence', kind: 'id', path: `/api/value-outcomes/${E.OUTCOME_A}/evidence`,
    body: { kind: 'observation', summary: note('P3'), provenance: 'Verification run, not a real source', supports: 'baseline', confidence: 'low' },
    notFound: [404, `value outcome ${E.OUTCOME_A} not found`], target: ['value_outcomes', E.OUTCOME_A] },
  { route: 'POST /api/value-outcomes/:outcomeId/measure', kind: 'id', path: `/api/value-outcomes/${E.OUTCOME_A}/measure`,
    body: { actual_value: 1, actual_measured_at: T0, note: note('P3') },
    notFound: [404, `value outcome ${E.OUTCOME_A} not found`], target: ['value_outcomes', E.OUTCOME_A] },
  { route: 'POST /api/value-outcomes/:outcomeId/verify', kind: 'id', path: `/api/value-outcomes/${E.OUTCOME_A}/verify`,
    body: { verified_by_person_id: E.CUST_A, verified_at: T0, attestation_note: note('P3') },
    notFound: [404, `value outcome ${E.OUTCOME_A} not found`], target: ['value_outcomes', E.OUTCOME_A] },
  { route: 'POST /api/value-runs/:runId/lock', kind: 'id', path: `/api/value-runs/${E.RUN_A}/lock`,
    body: { lock_reason: note('P3 verification') },
    notFound: [404, `value run ${E.RUN_A} not found`], target: ['value_runs', E.RUN_A] },
  { route: 'POST /api/value-runs/:runId/record-document', kind: 'id', path: `/api/value-runs/${E.RUN_A}/record-document`,
    body: { note: MARK },
    notFound: [404, `value run ${E.RUN_A} not found`], target: ['value_runs', E.RUN_A] },
];

// Ids of another tenant inside a request body, sent by A against A's own
// path: answered exactly as an unknown id is (the same status and message,
// with the id substituted). `logged` — whether it is a tenant mismatch the
// helper logs (a slug lookup scoped in the WHERE is not).
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const BODY_CASES = [
  { name: 'claim: industry_measure_id of another tenant', path: `/api/capabilities/${E.CAP_A}/industry-measures`,
    body: (id) => ({ industry_measure_id: id, claim: note('P3') }), other: E.MEASURE_OTHER, logged: ['industry_measures'] },
  { name: 'pack basis: industry_measure_id of another tenant', path: `/api/business-metrics/${E.METRIC_A}/pack-basis`,
    body: (id) => ({ industry_measure_id: id, basis_note: note('P3') }), other: E.MEASURE_OTHER, logged: ['industry_measures'] },
  { name: 'value outcome: engagement_id of another tenant', path: `/api/institutions/${E.INST_A}/value-outcomes`,
    body: (id) => ({ engagement_id: id, metric: { name: `P3 m ${E.TS}`, unit: 'count', direction: 'increase', source_system: 'verification system of record' },
                     capability_name: 'x', baseline_value: 0, baseline_measured_at: T0 }), other: E.ENG_B, logged: ['engagements'] },
  { name: 'value outcome: metric.owner_person_id of another tenant', path: `/api/institutions/${E.INST_A}/value-outcomes`,
    body: (id) => ({ engagement_name: 'x', engagement_owner_person_id: E.CUST_A,
                     metric: { name: `P3 m2 ${E.TS}`, unit: 'count', direction: 'increase', source_system: 'verification system of record', owner_person_id: id },
                     capability_name: 'x', baseline_value: 0, baseline_measured_at: T0 }), other: E.STAFF_B, logged: ['persons'] },
  { name: 'validate: metric.owner_person_id of another tenant', path: `/api/business-metrics/${E.METRIC_A}/validate`,
    body: (id) => ({ metric: { unit: 'count', direction: 'increase', source_system: 'verification system of record', owner_person_id: id },
                     baseline_value: 0, baseline_measured_at: T0, confirmed_by_person_id: E.CUST_A, supersession_reason: note('P3') }),
    other: E.CUST_B, logged: ['persons'] },
  { name: 'commit: committed_by of another tenant (checked against the account)', path: `/api/value-outcomes/${E.OUTCOME_A_OPEN}/commit`,
    body: (id) => ({ committed_by_person_id: id, committed_at: T0, target_value: 1, commitment_note: note('P3') }), other: E.CUST_B, logged: null },
  // O2: a hypothesis naming another tenant's lever; a summary superseding
  // another tenant's summary. Answered as an unknown id: the same status
  // and message, from the route, before any write (so nothing is recorded
  // in refusals).
  { name: 'hypothesis: value_lever_id of another tenant', path: `/api/institutions/${E.OUTCOME_A_INST}/hypotheses`,
    body: (id) => ({ value_outcome_id: E.OUTCOME_A, value_lever_id: id, statement: 'A hypothesis naming a lever by id, for the checks.',
                     falsifier_reference: 'baseline', falsifier_due: '2030-01-01', falsifier_conditions: 'on the same denominator' }),
    other: E.LEVER_B, logged: null },
  { name: 'executive summary: supersedes_id of another tenant', path: `/api/institutions/${E.INST_A}/executive-summaries`,
    body: (id) => ({ lens: 'chro', body: 'A summary naming a summary by id, for the tenant scope checks.', drafted_with_ai: false, supersedes_id: id }),
    other: E.SUMMARY_B, logged: null },
  { name: 'analyst of record: person_id of another tenant', path: `/api/institutions/${E.INST_A}/analyst-of-record`,
    body: (id) => ({ person_id: id, title: 'Verification analyst' }), other: E.STAFF_B, logged: null },
  { name: 'classify: an industry slug only another tenant has', path: `/api/institutions/${E.INST_A_UNCLASSIFIED}/industry`,
    body: (slug) => ({ industry_slug: slug, classification_note: note('P3') }), other: E.SLUG_B, unknown: 'no-such-slug-p3', logged: null },
];

// ---------------------------------------------------------------- run

const routes = E.ROUTES.split('\n').filter(Boolean);
const cookieA = await login(E.EMAIL_A);
const cookieB = await login(E.EMAIL_B);

step('A. Coverage guard: every route under requireActor has a case, and every case is a route');
const caseRoutes = new Set(CASES.map((c) => c.route));
const missing = routes.filter((r) => !caseRoutes.has(r));
const extra = [...caseRoutes].filter((r) => !routes.includes(r));
missing.length === 0 ? ok(`all ${routes.length} routes have a case`) : bad(`routes with NO tenant case: ${missing.join(' | ')}`);
extra.length === 0 ? ok('no case for a route that does not exist') : bad(`cases for unknown routes: ${extra.join(' | ')}`);

step("B. Tenant B against tenant A's rows — nothing written, nothing recorded as a refusal");
const auditBefore = q('SELECT coalesce(max(id), 0) FROM audit_log');
const refusalsBefore = q('SELECT count(*) FROM refusals');
for (const c of CASES.filter((x) => x.kind === 'id')) {
  const before = logText().length;
  const r = await call(cookieB, c.route.split(' ')[0], c.path, c.body);
  const [st, msg] = c.notFound;
  if (r.status === st && r.message === msg) ok(`${c.route}: B -> ${st} "${msg.slice(0, 50)}${msg.length > 50 ? '…' : ''}"`);
  else bad(`${c.route}: B -> ${r.status} ${JSON.stringify(r.message ?? r.text.slice(0, 120))} (expected ${st} "${msg}")`);
  const added = logText().slice(before);
  if (c.target) {
    const [table, id] = c.target;
    const pattern = c.route;
    const line = added.split('\n').find((l) => l.includes('LVRF tenant mismatch'));
    if (line && line.includes(`actor ${E.STAFF_B} (tenant ${E.TENANT_B})`) && line.includes(`${pattern} -> ${table} ${id}`)) ok('  ...logged: actor, tenant, route, target');
    else bad(`  ...log line missing or wrong: ${JSON.stringify(line ?? added.trim().slice(0, 200))}`);
  } else if (added.includes('LVRF tenant mismatch')) {
    bad('  ...logged a mismatch where none should be');
  }
}
// The same filter as a list: an institution_id of another tenant -> [] and logged.
{
  const before = logText().length;
  const r = await call(cookieB, 'GET', `/api/persons?institution_id=${E.INST_A}`);
  const added = logText().slice(before);
  Array.isArray(r.json) && r.json.length === 0 ? ok("GET /api/persons?institution_id=<A's account>: B -> [] (as for an unknown id)") : bad(`persons filter: ${r.status} ${r.text.slice(0, 120)}`);
  added.includes(`-> institutions ${E.INST_A}`) ? ok('  ...logged') : bad('  ...not logged');
}
for (const c of CASES.filter((x) => x.kind === 'list')) {
  const r = await call(cookieB, 'GET', c.path);
  const s = r.text;
  const leaked = c.aIds.filter((id) => s.includes(id));
  const absent = c.bIds.filter((id) => !s.includes(id));
  r.status === 200 && leaked.length === 0 ? ok(`${c.route}: B sees none of A's rows`) : bad(`${c.route}: B ${r.status}, A ids leaked: ${leaked.join(', ')}`);
  if (c.bIds.length) absent.length === 0 ? ok("  ...and sees its own") : bad(`  ...B's own rows missing: ${absent.join(', ')}`);
}
q('SELECT 1');
const auditAfterB = q('SELECT coalesce(max(id), 0) FROM audit_log');
auditAfterB === auditBefore ? ok(`no audit_log row from any of B's requests (max id ${auditBefore})`) : bad(`audit_log grew: ${auditBefore} -> ${auditAfterB}`);

step('C. Ids of another tenant inside a request body (A on its own path): answered as an unknown id');
for (const c of BODY_CASES) {
  const unknown = c.unknown ?? UNKNOWN;
  const before = logText().length;
  const rOther = await call(cookieA, 'POST', c.path, c.body(c.other));
  const added = logText().slice(before);
  const rUnknown = await call(cookieA, 'POST', c.path, c.body(unknown));
  const same = rOther.status === rUnknown.status && rOther.message === (rUnknown.message ?? '').replaceAll(unknown, c.other);
  same && rOther.status >= 400
    ? ok(`${c.name}: ${rOther.status} "${(rOther.message ?? '').slice(0, 60)}" — same as an unknown id`)
    : bad(`${c.name}: other -> ${rOther.status} ${JSON.stringify(rOther.message)}; unknown -> ${rUnknown.status} ${JSON.stringify(rUnknown.message)}`);
  if (c.logged) {
    added.includes(`actor ${E.STAFF_A} (tenant ${E.TENANT_A})`) && added.includes(`-> ${c.logged[0]} ${c.other}`)
      ? ok('  ...logged') : bad(`  ...not logged: ${JSON.stringify(added.trim().slice(0, 200))}`);
  }
}
// The owner check is "a current person of the actor's tenant" — staff OR
// customer side at one of the tenant's accounts. A's own customer-side
// person must be accepted, not only A's staff.
{
  const r = await call(cookieA, 'POST', `/api/institutions/${E.INST_A}/value-outcomes`, {
    engagement_name: `P3 owner check ${E.TS}`, engagement_owner_person_id: E.CUST_A,
    metric: { name: `P3 owner metric ${E.TS}`, unit: 'count', direction: 'increase', source_system: 'verification system of record', owner_person_id: E.CUST_A },
    capability_name: E.CAPNAME_A, baseline_value: 0, baseline_measured_at: T0 });
  const owner = r.json?.business_metric_id ? q(`SELECT owner_person_id FROM business_metrics WHERE id = '${r.json.business_metric_id}'`) : '';
  r.status === 201 && owner === E.CUST_A
    ? ok("value outcome: metric.owner_person_id = A's CUSTOMER-SIDE person -> 201, stored as the owner")
    : bad(`customer-side owner on value-outcomes -> ${r.status} ${JSON.stringify(r.message)} (owner stored: ${owner || 'n/a'})`);
  const v = await call(cookieA, 'POST', `/api/business-metrics/${E.METRIC_A}/validate`, {
    metric: { unit: 'count', direction: 'increase', source_system: 'verification system of record', owner_person_id: E.CUST_A },
    baseline_value: 0, baseline_measured_at: T0, confirmed_by_person_id: E.STAFF_B, supersession_reason: note('P3') });
  // confirmed_by = B's staff fails AFTER the owner check (and writes nothing):
  // reaching that message proves the customer-side owner was accepted.
  v.status === 422 && (v.message ?? '').startsWith('confirmed_by_person_id does not belong')
    ? ok("validate: metric.owner_person_id = A's CUSTOMER-SIDE person passes the owner check")
    : bad(`customer-side owner on validate -> ${v.status} ${JSON.stringify(v.message)}`);
}
const refusalsAfter = q('SELECT count(*) FROM refusals');
refusalsAfter === refusalsBefore ? ok(`no mismatch recorded in refusals (${refusalsBefore} before and after)`) : bad(`refusals ${refusalsBefore} -> ${refusalsAfter}`);
logText().includes(MARK) ? bad('a request body reached the server log') : ok('no request body in the server log (marker absent)');

step("D. Controls: A's identical requests find the row (not the not-found answer)");
for (const c of CASES.filter((x) => x.kind === 'id')) {
  const r = await call(cookieA, c.route.split(' ')[0], c.path, c.controlBody ?? c.body);
  const [st, msg] = c.notFound;
  r.status === st && r.message === msg ? bad(`${c.route}: A also gets the not-found answer — the case proves nothing`) : ok(`${c.route}: A -> ${r.status}`);
}
for (const c of CASES.filter((x) => x.kind === 'list')) {
  const r = await call(cookieA, 'GET', c.path);
  const missingA = c.aIds.filter((id) => !r.text.includes(id));
  const leakedB = c.bIds.filter((id) => r.text.includes(id));
  missingA.length === 0 && leakedB.length === 0 ? ok(`${c.route}: A sees its rows and none of B's`) : bad(`${c.route}: A missing ${missingA.join(', ')}; B leaked ${leakedB.join(', ')}`);
}

step("E. POST /api/account-inputs creates in the ACTOR's tenant");
{
  // Same name as an account A already has: for A that is a 409; for B it
  // is a new account of B's — no cross-tenant name collision, no leak.
  const body = { institution: { name: E.INST_A_NAME, industry: null, website: null } };
  const rB = await call(cookieB, 'POST', '/api/account-inputs', body);
  const newId = rB.json?.institution_id ?? rB.json?.institution?.id;
  const tenant = newId ? q(`SELECT tenant_id FROM institutions WHERE id = '${newId}'`) : '';
  rB.status === 201 && tenant === E.TENANT_B ? ok(`B -> 201, account created in tenant B`) : bad(`B -> ${rB.status} ${rB.text.slice(0, 200)} (tenant ${tenant})`);
  const rA = await call(cookieA, 'POST', '/api/account-inputs', body);
  rA.status === 409 ? ok('A, same name -> 409 (its own account of that name)') : bad(`A -> ${rA.status} ${rA.text.slice(0, 120)}`);
}

step("F. C3's batches take the actor's tenant: B can neither mark nor record errata on A's rows");
{
  const marksBefore = q('SELECT count(*) FROM system_exercise_marks');
  const errataBefore = q('SELECT count(*) FROM run_errata');
  for (const [table, id] of [['evidence', E.EV_A], ['value_runs', E.RUN_A]]) {
    const rOther = await call(cookieB, 'POST', '/api/system-exercise/marks', { items: [{ subject_table: table, subject_id: id }], expected_count: 1 });
    const rUnknown = await call(cookieB, 'POST', '/api/system-exercise/marks', { items: [{ subject_table: table, subject_id: UNKNOWN }], expected_count: 1 });
    rOther.status === 409 && rOther.message === rUnknown.message && /^The count changed: 0 of the 1 items/.test(rOther.message ?? '')
      ? ok(`marks: B naming A's ${table} row -> 409 "${(rOther.message ?? '').slice(0, 50)}…", the same as an unknown id`)
      : bad(`marks: B naming A's ${table} -> ${rOther.status} ${JSON.stringify(rOther.message)}; unknown -> ${rUnknown.status} ${JSON.stringify(rUnknown.message)}`);
  }
  const g = await call(cookieB, 'GET', '/api/errata/non-customer-credit');
  const e = await call(cookieB, 'POST', '/api/errata/non-customer-credit', { expected_count: (g.json?.count ?? 0) + 1, reason: note('Verification: P3 tenant scope checks.') });
  e.status === 409 && /^The count changed: the seals now call for \d+ errata/.test(e.message ?? '')
    ? ok(`credit errata: B's batch reads B's own seals only (B's count ${g.json?.count}); a count that is not B's -> 409`)
    : bad(`credit errata as B -> ${e.status} ${JSON.stringify(e.message)}`);
  const marksAfter = q('SELECT count(*) FROM system_exercise_marks');
  const errataAfter = q('SELECT count(*) FROM run_errata');
  marksAfter === marksBefore && errataAfter === errataBefore ? ok(`nothing marked, no erratum recorded (marks ${marksBefore}, errata ${errataBefore})`) : bad(`marks ${marksBefore} -> ${marksAfter}; errata ${errataBefore} -> ${errataAfter}`);
}

console.log(`\n==> cases ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL === 0 ? 0 : 1);
