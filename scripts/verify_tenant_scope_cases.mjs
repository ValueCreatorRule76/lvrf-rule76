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
  return { status: r.status, json, text, message: json && typeof json === 'object' && !Array.isArray(json) ? json.message : undefined };
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
  { route: 'GET /api/cohort', kind: 'list', path: '/api/cohort', aIds: [E.INST_A], bIds: [E.INST_B] },
  { route: 'GET /api/engagements', kind: 'list', path: '/api/engagements', aIds: [E.ENG_A], bIds: [E.ENG_B] },
  { route: 'GET /api/engagements/:id/runs', kind: 'id', path: `/api/engagements/${E.ENG_A}/runs`,
    notFound: [404, `engagement ${E.ENG_A} not found`], target: ['engagements', E.ENG_A] },
  { route: 'GET /api/industries', kind: 'list', path: '/api/industries', aIds: [E.IND_A], bIds: [E.IND_B] },
  // By slug, tenant in the WHERE: no single row of another tenant, so
  // nothing to log — another tenant's slug is simply not found.
  { route: 'GET /api/industries/:slug/pack', kind: 'id', path: `/api/industries/${E.SLUG_A}/pack`,
    notFound: [404, `industry '${E.SLUG_A}' not found`], target: null },
  { route: 'GET /api/institutions', kind: 'list', path: '/api/institutions', aIds: [E.INST_A], bIds: [E.INST_B] },
  { route: 'GET /api/institutions/:id/view', kind: 'id', path: `/api/institutions/${E.INST_A}/view`,
    notFound: [404, `institution ${E.INST_A} not found`], target: ['institutions', E.INST_A] },
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
  { route: 'POST /api/industries/:industryId/research-results', kind: 'id', path: `/api/industries/${E.IND_A}/research-results`,
    body: { research_query: note('q') },
    notFound: [404, `industry ${E.IND_A} not found`], target: ['industries', E.IND_A] },
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

console.log(`\n==> cases ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL === 0 ? 0 : 1);
