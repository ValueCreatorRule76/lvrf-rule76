import type { Request } from 'express';
import type { PoolClient } from 'pg';

/**
 * P2 (LVRF_PLAN §10; design §2.4; P2-D3, D4 ruled by Brad, 25 Oct 2026) — the
 * one writer of governance_acts. A route that makes a governed transition
 * records its act here, on req.dbClient, in the same transaction as the change;
 * the deferred `<table>_act_present` triggers (hardening.sql section 27) refuse
 * the COMMIT otherwise. The act's actor is the session's; its txid is forced by
 * the database to this transaction's.
 *
 * ROUTE_ACTS classes EVERY mutating route (Brad's condition on D3): its acts,
 * or 'create-only' (routes that create rows, or set a field, carrying their own
 * who/when and making no governed transition — left out of P2 by name in
 * LVRF_PLAN §10). verify_acts_lineage.sh fails a mutating route that is not
 * classed, a class naming no route, and an act route that never calls
 * recordAct with its own pattern.
 */

export type GovernanceAct =
  | 'import' | 'validate' | 'approve' | 'certify' | 'activate' | 'supersede' | 'verify' | 'attest'
  | 'open_citation' | 'accept' | 'reject' | 'withdraw' | 'ratify' | 'demote' | 'commit'
  | 'measure' | 'lock' | 'retire' | 'exclude' | 'mark' | 'link' | 'correct' | 'record_erratum' | 'grant' | 'find' | 'state_about' | 'add_industry'
  | 'record_rate' | 'plan' | 'share';

export const ROUTE_ACTS: Readonly<Record<string, readonly GovernanceAct[] | 'create-only'>> = {
  // Research: the import, and the review of each result.
  'POST /api/institutions/:institutionId/research-results': ['import'],
  'POST /api/industries/:industryId/research-results': ['import'],
  'POST /api/account-research-results/:id/accept': ['accept'],
  'POST /api/account-research-results/:id/reject': ['reject'],
  'POST /api/research-results/:id/accept': ['accept'],
  'POST /api/research-results/:id/reject': ['reject'],
  // Evidence and the value spine.
  'POST /api/evidence/:id/open-citation': ['open_citation'],
  'POST /api/value-outcomes/:outcomeId/commit': ['commit'],
  'POST /api/value-outcomes/:outcomeId/measure': ['measure'],
  'POST /api/value-outcomes/:outcomeId/verify': ['verify'],
  'POST /api/value-runs/:runId/lock': ['lock'],
  'POST /api/engagements/:id/retire': ['retire'],
  // Withdrawals.
  'POST /api/industry-measures/:id/retire': ['withdraw'],
  'POST /api/value-levers/:id/retire': ['withdraw'],
  'POST /api/lever-offerings/:id/retire': ['withdraw'],
  'POST /api/reference-examples/:id/retire': ['withdraw'],
  'POST /api/value-hypotheses/:id/withdraw': ['withdraw'],
  'POST /api/account-person-links/:id/retire': ['withdraw'],
  // Supersessions (the predecessor is the subject; the successor, the result).
  'POST /api/institutions/:institutionId/facts/:factId/supersede': ['supersede'],
  'POST /api/institutions/:institutionId/entity/supersede': ['supersede'],
  'POST /api/business-metrics/:metricId/validate': ['supersede'],
  'POST /api/value-hypotheses/:id/supersede': ['supersede'],
  'POST /api/reference-examples/:id/supersede': ['supersede'],
  // Steward acts that create a governed record.
  'POST /api/industry-measures/:id/levers': ['ratify'],
  'POST /api/value-levers/:id/offerings': ['link'],
  'POST /api/industries/:industryId/exclusions': ['exclude'],
  'POST /api/industries': ['add_industry'],
  'POST /api/institutions/:institutionId/reference-example': ['mark'],
  'POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/correct-support': ['correct'],
  'POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/withdraw': ['withdraw'],
  // C3 (26 Oct 2026)
  'POST /api/institutions/:institutionId/customer-roles': ['grant'],
  'POST /api/customer-roles/:id/revoke': ['withdraw'],
  'POST /api/errata/non-customer-credit': ['record_erratum'],
  'POST /api/system-exercise/marks': ['mark'],
  // C3b: a figure with no source on record.
  'POST /api/value-outcomes/:outcomeId/figure-findings': ['find'],
  'POST /api/value-runs/:runId/errata': ['record_erratum'],
  // L41 + L47 (1 Nov 2026).
  'POST /api/evidence/about-batch': ['state_about'],
  'POST /api/evidence/:id/withdraw-verification': ['withdraw'],
  // L52: a supersession carries the row's mark and moves its live links, each with its act.
  'POST /api/evidence/:id/supersede': ['supersede', 'mark', 'withdraw', 'link'],
  'POST /api/evidence/supersession-batch': ['supersede', 'mark', 'withdraw', 'link', 'record_erratum'],
  // B3 (§19): the value case's governed inputs.
  'POST /api/policies/values': ['ratify'],
  'POST /api/policies/lenses': ['ratify'],
  'POST /api/value-outcomes/:outcomeId/monetization-rates': ['record_rate'],
  'POST /api/engagements/:engagementId/milestones': ['plan'],
  'POST /api/roadmap-milestones/:id/supersede': ['plan'],
  'POST /api/value-runs/:runId/share-for-review': ['share'],
  // B4 (§14, D3): the steward withdraws a measurement or a commitment.
  'POST /api/value-outcomes/:outcomeId/measurement/withdraw': ['withdraw'],
  'POST /api/value-outcomes/:outcomeId/commitment/withdraw': ['withdraw'],
  // B3 (O4): a print request claims the request only, with its own who and when; no governed transition.
  'POST /api/value-runs/:runId/print-request': 'create-only',
  // Create-only: left out of P2 by name (LVRF_PLAN §10, D3).
  'POST /api/account-inputs': 'create-only',
  // L52: the dry run writes nothing.
  'POST /api/evidence/supersession-batch/dry-run': 'create-only',
  'POST /api/business-metrics/:metricId/pack-basis': 'create-only',
  'POST /api/capabilities/:capabilityId/industry-measures': 'create-only',
  'POST /api/engagements/:engagementId/produce-run': 'create-only',
  'POST /api/industries/:industryId/research-prompts': 'create-only',
  'POST /api/institutions/:institutionId/research-prompts': 'create-only',
  'POST /api/institutions/:institutionId/analyst-of-record': 'create-only',
  'POST /api/institutions/:institutionId/executive-summaries': 'create-only',
  'POST /api/institutions/:institutionId/evidence': 'create-only',
  'POST /api/institutions/:institutionId/facts': 'create-only',
  'POST /api/institutions/:institutionId/hypotheses': 'create-only',
  'POST /api/institutions/:institutionId/industry': 'create-only',
  'POST /api/institutions/:institutionId/inputs': 'create-only',
  'POST /api/institutions/:institutionId/offerings': 'create-only',
  'POST /api/institutions/:institutionId/value-outcomes': 'create-only',
  'POST /api/value-outcomes/:outcomeId/evidence': 'create-only',
  'POST /api/value-runs/:runId/record-document': 'create-only',
};

export interface ActRecord {
  act: GovernanceAct;
  tenantId: string;
  subjectTable: string;
  subjectId: string;
  resultTable?: string;
  resultId?: string;
  evidenceIds?: string[];
  /** The route's own reason or note, verbatim; omitted when the route takes none (never invented). */
  reason?: string | null;
}

/** Records one act, on the request's transaction. A misuse (an unclassed route or act) is a programming error: it throws. */
export async function recordAct(client: PoolClient, req: Request, route: string, a: ActRecord): Promise<void> {
  const acts = ROUTE_ACTS[route];
  if (!acts || acts === 'create-only' || !acts.includes(a.act)) {
    throw new Error(`LVRF: recordAct: ${route} is not classed with the act "${a.act}" in ROUTE_ACTS`);
  }
  const actor = req.actor?.personId;
  if (!actor) throw new Error('req.actor missing on a request past requireActor');
  const reason = typeof a.reason === 'string' && a.reason.trim() !== '' ? a.reason : null;
  await client.query(
    `INSERT INTO governance_acts (tenant_id, act, subject_table, subject_id, result_table, result_id, evidence_ids, actor_person_id, reason, route)
     VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8, $9, $10)`,
    [a.tenantId, a.act, a.subjectTable, a.subjectId, a.resultTable ?? null, a.resultId ?? null, a.evidenceIds ?? [], actor, reason, route],
  );
}
