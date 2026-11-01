import { Router, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { recordAct, type ActRecord } from '../lib/governanceAct.js';
import { checkFiguresOfLinks } from '../lib/figureCheck.js';
import { sha256Hex } from '../spine/hash.js';
import { ErratumRefusal, sameText, writeLinkErratum } from './corrections.js';
import { isUuid } from './params.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { actorTenantId, isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { requireSteward } from '../lib/stewardActs.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { EvidenceFormError, parseEvidenceForm } from '../lib/evidenceFormBody.js';
import { parseAbout } from '../lib/evidenceAbout.js';

/**
 * L41 + L47 (LVRF_PLAN §13; Brad's D1–D8 and four conditions, 1 Nov 2026) — evidence as the account holds it:
 *
 *   GET  /api/institutions/:institutionId/evidence   every row of the account, with what it is about and who opened it
 *   POST /api/institutions/:institutionId/evidence   record account evidence: no outcome link, no `supports` (L47)
 *   GET  /api/evidence/about-batch                   the dry run: each row from before "about", with its proposal
 *   POST /api/evidence/about-batch                   state them, one act per row, refused if the count changed
 *   POST /api/evidence/:id/withdraw-verification     a row verified with no opening, which nobody can open (steward)
 *   POST /api/evidence/:id/supersede                 correct a row: a new row, born unverified (steward)
 *   GET  /api/evidence/supersession-batch            the rows that can be corrected, and the accounts to choose from
 *   POST /api/evidence/supersession-batch/dry-run    what the batch would do to each row; writes nothing
 *   POST /api/evidence/supersession-batch            do it, refused if the count or the plan changed (steward)
 *
 * L52 (LVRF_PLAN §18): a supersession carries the row's mark to its successor and moves its links, on the single
 * route and the batch alike. The batch also supersedes errata, first, because an erratum needs its link.
 *
 * No route here takes source_verified: only POST /api/evidence/:id/open-citation verifies. No route here takes
 * ai_sourced: AI text comes by research (decision D1 of 11 Oct, one research path). The database is the
 * authority (evidence_final, evidence_about_stated); each route refuses first, in words. All writes on
 * req.dbClient, inside actorContext's transaction.
 */

class Refusal extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MIN_REASON = 12;
const MIN_PROVENANCE = 12;
const BODY_FIELDS = ['about', 'kind', 'summary', 'provenance', 'source_reference', 'evidence_form', 'quote_text', 'locator', 'how_read', 'attested_by_person_id', 'attested_at'];
const notTaken = (k: string) => {
  if (k === 'source_verified') return 'body.source_verified is not taken: evidence is recorded unverified, and a person verifies it by opening its source.';
  if (k === 'supports') return 'body.supports is not taken: account evidence supports no outcome. Link evidence to an outcome from the outcome.';
  if (k === 'ai_sourced') return 'body.ai_sourced is not taken: AI text comes to an account by research.';
  return null;
};

async function answer(pool: Pool, err: unknown, req: Request, res: Response,
  ctx: { endpoint: string; subjectTable: string; subjectId: string | null; tenantId: string | null; institutionId: string | null }): Promise<void> {
  if (err instanceof Refusal || err instanceof ErratumRefusal || err instanceof EvidenceFormError) {
    if (ctx.tenantId) await recordRouteRefusal(pool, req, { ...ctx, tenantId: ctx.tenantId, attemptedPayload: req.body }, err.message);
    res.status(err instanceof EvidenceFormError ? 422 : err.status).json({ message: err.message });
    return;
  }
  if (await handleGovernanceError(pool, err, req, res, { ...ctx, attemptedPayload: req.body })) return;
  respondServerError(res, err);
}
const actorOf = (req: Request): string => {
  const a = req.actor?.personId;
  if (!a) throw new Error('req.actor missing on a request past requireActor');
  return a;
};

/** One evidence row, unverified, from a body of BODY_FIELDS: the account route and a supersession write the same way. */
async function insertRecorded(client: PoolClient, body: Record<string, unknown>, institutionId: string, tenantId: string, actor: string, simulated: boolean,
  confidence = 'medium', origin: { researchQuery: string; researchTool: string } | null = null): Promise<string> {
  const text = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
  const kind = text('kind');
  const { rows: kinds } = await client.query<{ enumlabel: string }>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'evidence_kind' ORDER BY e.enumsortorder`);
  if (!kinds.some((k) => k.enumlabel === kind)) throw new Refusal(422, `Choose the kind: ${kinds.map((k) => k.enumlabel).join(', ')}.`);
  if (text('summary') === '') throw new Refusal(422, 'Write the summary: what this evidence states.');
  if (text('provenance').length < MIN_PROVENANCE) throw new Refusal(422, `State where this evidence came from, in at least ${MIN_PROVENANCE} characters.`);
  const sourceReference = text('source_reference') === '' ? null : text('source_reference');
  const form = parseEvidenceForm(body, { allowStatement: kind === 'attestation', kind, sourceReference });
  const about = await parseAbout(client, body.about, institutionId, tenantId);
  const attestedBy = body.attested_by_person_id ?? null;
  const attestedAt = body.attested_at ?? null;
  if ((attestedBy === null) !== (attestedAt === null)) throw new Refusal(422, 'Name the attester and the date together, or neither.');
  if (attestedBy !== null) {
    if (typeof attestedBy !== 'string' || !isUuid(attestedBy) || typeof attestedAt !== 'string' || Number.isNaN(new Date(attestedAt).getTime())) {
      throw new Refusal(422, 'Name the attester by id, and the date it was attested.');
    }
    const { rows: [who] } = await client.query(
      'SELECT id FROM persons WHERE id = $1 AND institution_id = $2 AND simulated = false AND deleted_at IS NULL', [attestedBy, institutionId]);
    if (!who) throw new Refusal(422, 'The attester must be a real person of this account.');
  }
  if (kind === 'attestation' && attestedBy === null) throw new Refusal(422, 'An attestation names the person who attests it.');
  const { rows: [row] } = await client.query<{ id: string }>(
    `INSERT INTO evidence (institution_id, kind, summary, provenance, source_reference, confidence, simulated, captured_by_person_id,
       attested_by_person_id, attested_at, evidence_form, quote_text, locator, how_read, about_institution_id, about_other_party,
       ai_sourced, research_query, research_tool)
     VALUES ($1, $2, $3, $4, $5, $16, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $17, $18, $19) RETURNING id`,
    [institutionId, kind, text('summary'), text('provenance'), sourceReference, simulated, actor, attestedBy, attestedAt,
      form.evidenceForm, form.quoteText, form.locator === null ? null : JSON.stringify(form.locator), form.howRead,
      about.aboutInstitutionId, about.aboutOtherParty, confidence, origin !== null, origin?.researchQuery ?? null, origin?.researchTool ?? null]);
  return row.id;
}

/**
 * L52: what a supersession does beyond the new row, in this order, because evidence_final checks the result:
 * the mark carries, the live links move, and only then is the old row superseded. `act` is the route's own recordAct.
 */
async function carryToSuccessor(client: PoolClient, act: (a: ActRecord) => Promise<void>, old: { id: string; institution_id: string; tenant_id: string },
  successor: string, reason: string, actor: string): Promise<void> {
  const tenantId = old.tenant_id;
  const { rows: [mark] } = await client.query<{ reason: string }>(
    `SELECT reason FROM system_exercise_marks WHERE subject_table = 'evidence' AND subject_id = $1`, [old.id]);
  if (mark) {
    const { rows: [m] } = await client.query<{ id: string }>(
      `INSERT INTO system_exercise_marks (tenant_id, subject_table, subject_id, reason, marked_by_person_id) VALUES ($1, 'evidence', $2, $3, $4) RETURNING id`,
      [tenantId, successor, mark.reason, actor]);
    await act({ act: 'mark', tenantId, subjectTable: 'system_exercise_marks', subjectId: m.id, reason });
  }
  const { rows: links } = await client.query<{ value_outcome_id: string; supports: string; live: boolean }>(
    `SELECT l.value_outcome_id, l.supports, (g.deleted_at IS NULL AND g.superseded_by_id IS NULL) AS live FROM value_outcome_evidence l
       JOIN value_outcomes vo ON vo.id = l.value_outcome_id JOIN engagements g ON g.id = vo.engagement_id
      WHERE l.evidence_id = $1 AND l.withdrawn_at IS NULL`, [old.id]);
  const move = async (l: { value_outcome_id: string; supports: string }) => {
    await client.query(
      `UPDATE value_outcome_evidence SET withdrawn_by_person_id = $4, withdrawn_at = now(), withdrawal_reason = $5
        WHERE value_outcome_id = $1 AND evidence_id = $2 AND supports = $3 AND withdrawn_at IS NULL`,
      [l.value_outcome_id, old.id, l.supports, actor, reason]);
    await act({ act: 'withdraw', tenantId, subjectTable: 'value_outcome_evidence', subjectId: l.value_outcome_id, resultTable: 'evidence', resultId: old.id, reason });
    await client.query('INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ($1, $2, $3)', [l.value_outcome_id, successor, l.supports]);
    await act({ act: 'link', tenantId, subjectTable: 'value_outcome_evidence', subjectId: l.value_outcome_id, resultTable: 'evidence', resultId: successor, reason });
  };
  // A live link moves first (evidence_final refuses a supersession that leaves one); a frozen outcome's moves after,
  // because its guard takes a link only from a row already superseded.
  for (const l of links.filter((x) => x.live)) await move(l);
  await client.query('UPDATE evidence SET superseded_by_id = $2 WHERE id = $1', [old.id, successor]);
  await act({ act: 'supersede', tenantId, subjectTable: 'evidence', subjectId: old.id, resultTable: 'evidence', resultId: successor, reason });
  for (const l of links.filter((x) => !x.live)) await move(l);
  if (links.length > 0) {
    const { rows: [s] } = await client.query<{ evidence_form: string; quote_text: string | null; locator: unknown }>(
      'SELECT evidence_form::text, quote_text, locator FROM evidence WHERE id = $1', [successor]);
    if (s.evidence_form === 'quote' || s.evidence_form === 'locator') {
      await checkFiguresOfLinks(client, successor, old.institution_id, actor, { evidenceForm: s.evidence_form, quoteText: s.quote_text, locator: s.locator });
    }
  }
}

interface BatchRow {
  id: string; institution_id: string; tenant_id: string; account: string; kind: string; summary: string; provenance: string; source_reference: string | null;
  confidence: string; simulated: boolean; ai_sourced: boolean; research_query: string | null; research_tool: string | null; attested_by_person_id: string | null; attested_at: string | null;
  evidence_form: string; quote_text: string | null; locator: unknown; how_read: string | null;
  source_verified: boolean; citation_resolved: boolean; deleted_at: string | null; superseded_by_id: string | null;
  about: string | null; about_institution_id: string | null; about_other_party: string | null;
}
const READING_FIELDS = ['evidence_form', 'quote_text', 'locator', 'how_read'];

/** One item of the batch: what would happen to it, and what stops it. Writes nothing; the submit reads the same thing. */
async function planItem(client: PoolClient, item: Record<string, unknown>, req: Request, tenantId: string, lock: boolean) {
  const id = String(item.evidence_id ?? '');
  const refused = (why: string) => ({ evidence_id: id, blockers: [why] });
  if (!isUuid(id)) return refused('That is not an evidence row.');
  const { rows: [e] } = await client.query<BatchRow>(
    `SELECT e.id, e.institution_id, i.tenant_id, i.name AS account, e.kind::text, e.summary, e.provenance, e.source_reference, e.confidence::text, e.simulated, e.ai_sourced, e.research_query, e.research_tool,
            e.attested_by_person_id, to_char(e.attested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS attested_at,
            e.evidence_form::text, e.quote_text, e.locator, e.how_read, e.source_verified, e.citation_resolved, e.deleted_at, e.superseded_by_id,
            lvrf_evidence_about(e.about_institution_id, e.about_other_party) AS about, e.about_institution_id, e.about_other_party
       FROM evidence e JOIN institutions i ON i.id = e.institution_id WHERE e.id = $1 ${lock ? 'FOR UPDATE OF e' : ''}`, [id]);
  if (!e || isOtherTenant(req, e.tenant_id, { table: 'evidence', id })) return refused('That is not an evidence row of this tenant.');
  const blockers: string[] = [];
  let next: { aboutInstitutionId: string | null; aboutOtherParty: string | null } | null = null;
  let nextAbout: string | null = null;
  try {
    next = await parseAbout(client, item.about, e.institution_id, tenantId);
    nextAbout = (await client.query<{ about: string }>('SELECT lvrf_evidence_about($1::uuid, $2) AS about', [next.aboutInstitutionId, next.aboutOtherParty])).rows[0].about;
  } catch (err) {
    if (!(err instanceof EvidenceFormError)) throw err;
    blockers.push(err.message);
  }
  const legacy = e.evidence_form === 'legacy';
  let reading: ReturnType<typeof parseEvidenceForm> | null = null;
  if (legacy) {
    try {
      reading = parseEvidenceForm(item, { allowStatement: false, kind: e.kind, sourceReference: e.source_reference });
    } catch (err) {
      if (!(err instanceof EvidenceFormError)) throw err;
      blockers.push(`This row records no reading, and a new row must: ${err.message}`);
    }
  }
  const sameAbout = next !== null && next.aboutInstitutionId === e.about_institution_id && next.aboutOtherParty === e.about_other_party;
  const nextSummary = typeof item.summary === 'string' && item.summary.trim() !== '' ? item.summary.trim() : e.summary;
  const nextProvenance = typeof item.provenance === 'string' && item.provenance.trim() !== '' ? item.provenance.trim() : e.provenance;
  if (nextProvenance.length < MIN_PROVENANCE) blockers.push(`State where this evidence came from, in at least ${MIN_PROVENANCE} characters.`);
  if (next !== null && sameAbout && reading === null && !legacy && nextSummary === e.summary && nextProvenance === e.provenance) {
    blockers.push('This changes nothing: the row already says this, and it records its reading.');
  }
  if (e.deleted_at !== null || e.superseded_by_id !== null) blockers.push('This evidence is not current (retired or superseded).');
  const { rows: [uses] } = await client.query<{ roles: number; facts: number; entities: number; research: number; errata: number; sealed_runs: number; old_links: number }>(
    `SELECT (SELECT count(*) FROM customer_role_grants g WHERE g.source_evidence_id = $1 AND g.revoked_at IS NULL)::int AS roles,
            (SELECT count(*) FROM institution_facts f WHERE f.evidence_id = $1 AND f.deleted_at IS NULL AND f.superseded_by_id IS NULL)::int AS facts,
            (SELECT count(*) FROM institution_entities n WHERE n.evidence_id = $1 AND n.deleted_at IS NULL AND n.superseded_by_id IS NULL)::int AS entities,
            (SELECT count(*) FROM research_results r WHERE r.evidence_id = $1)::int AS research,
            (SELECT count(*) FROM run_errata x WHERE x.evidence_id = $1)::int AS errata,
            (SELECT count(*) FROM value_runs r WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE jsonb_typeof(r.payload->'evidence') WHEN 'array' THEN r.payload->'evidence' ELSE '[]'::jsonb END) x
              WHERE x->>'evidence_id' = $1::text OR (x->>'kind' = $2 AND x->>'summary' = $3 AND x->>'provenance' = $4)))::int AS sealed_runs,
            (SELECT count(*) FROM value_outcome_evidence l WHERE l.evidence_id = $1 AND l.withdrawn_at IS NOT NULL)::int AS old_links`,
    [id, e.kind, e.summary, e.provenance]);
  if (uses.roles > 0) blockers.push('A current customer-side role is named from this evidence. Revoke the role first.');
  if (uses.facts + uses.entities > 0) blockers.push('A current account fact or entity rests on this evidence. Correct that first.');
  if (uses.research > 0) blockers.push('This evidence came from a research result; it is corrected in research, not here.');
  const { rows: mark } = await client.query<{ reason: string }>(`SELECT reason FROM system_exercise_marks WHERE subject_table = 'evidence' AND subject_id = $1`, [id]);
  const { rows: links } = await client.query<{ outcome_id: string; metric: string; supports: string; live: boolean; outcome_institution: string; own_account: boolean }>(
    `SELECT l.value_outcome_id AS outcome_id, bm.name AS metric, l.supports, (g.deleted_at IS NULL AND g.superseded_by_id IS NULL) AS live, vo.institution_id AS outcome_institution, i.is_tenant_self AS own_account
       FROM value_outcome_evidence l JOIN value_outcomes vo ON vo.id = l.value_outcome_id JOIN engagements g ON g.id = vo.engagement_id
       JOIN business_metrics bm ON bm.id = vo.business_metric_id JOIN institutions i ON i.id = vo.institution_id
      WHERE l.evidence_id = $1 AND l.withdrawn_at IS NULL ORDER BY bm.name, l.supports`, [id]);
  for (const l of links) {
    if ((l.supports === 'baseline' || l.supports === 'actual') && next !== null && next.aboutInstitutionId !== l.outcome_institution) {
      blockers.push(`It supports the ${l.supports} of "${l.metric}", which needs evidence about that account. Withdraw that link first, or keep the row about the account.`);
    }
  }
  return {
    evidence_id: id, account: e.account, kind: e.kind, summary: e.summary, provenance: e.provenance,
    current: { about: e.about, form: e.evidence_form, verified: e.source_verified, opened: e.citation_resolved },
    next: { about: nextAbout, summary: nextSummary, provenance: nextProvenance, form: reading ? reading.evidenceForm : e.evidence_form, reading: reading ? (reading.quoteText ?? reading.locator) : null, verified: false, opened: false, ai_sourced: e.ai_sourced },
    mark: { carries: mark.length > 0, reason: mark[0]?.reason ?? null },
    links: links.map((l) => ({ outcome_id: l.outcome_id, metric: l.metric, supports: l.supports, moves: true, frozen: !l.live })),
    withdrawn_links: uses.old_links, errata: uses.errata, sealed_runs: uses.sealed_runs, blockers,
    write: blockers.length > 0 ? undefined : { row: e, reading },
  };
}

interface ErratumRow { id: string; tenant_id: string; value_run_id: string; value_outcome_id: string; evidence_id: string | null; kind: string; run_number: number; engagement: string; what_was_wrong: string; what_is_right: string; reason: string; payload: unknown; superseded: boolean }

/** One erratum of the batch: its current and new text, and what stops it. */
async function planErratum(client: PoolClient, item: Record<string, unknown>, req: Request) {
  const id = String(item.erratum_id ?? '');
  if (!isUuid(id)) return { erratum_id: id, blockers: ['That is not an erratum.'] };
  const { rows: [x] } = await client.query<ErratumRow>(
    `SELECT x.id, x.tenant_id, x.value_run_id, x.value_outcome_id, x.evidence_id, x.kind, r.run_number, g.name AS engagement, x.what_was_wrong, x.what_is_right, x.reason, r.payload,
            EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id) AS superseded
       FROM run_errata x JOIN value_runs r ON r.id = x.value_run_id JOIN engagements g ON g.id = r.engagement_id WHERE x.id = $1`, [id]);
  if (!x || isOtherTenant(req, x.tenant_id, { table: 'run_errata', id })) return { erratum_id: id, blockers: ['That is not an erratum of this tenant.'] };
  const text = (k: string, now: string) => (typeof item[k] === 'string' && (item[k] as string).trim() !== '' ? (item[k] as string).trim() : now);
  const next = { what_was_wrong: text('what_was_wrong', x.what_was_wrong), what_is_right: text('what_is_right', x.what_is_right), reason: text('reason', x.reason) };
  const why = typeof item.supersession_reason === 'string' ? item.supersession_reason.trim() : '';
  const blockers: string[] = [];
  if (x.kind !== 'link_correction' || x.evidence_id === null) blockers.push('Only an erratum on a corrected link is superseded here.');
  if (x.superseded) blockers.push('This erratum is already superseded.');
  if (next.what_was_wrong === x.what_was_wrong && next.what_is_right === x.what_is_right && next.reason === x.reason) blockers.push('This changes nothing: give the new text.');
  if (why.length < MIN_REASON) blockers.push(`Say why the erratum is superseded, in at least ${MIN_REASON} characters.`);
  else if ([next.what_was_wrong, next.what_is_right, next.reason, x.what_was_wrong, x.what_is_right, x.reason].some((t) => sameText(why, t))) {
    blockers.push("The reason for superseding repeats the erratum's own text: say why the earlier erratum is superseded.");
  }
  return { erratum_id: id, run_number: x.run_number, engagement: x.engagement, evidence_id: x.evidence_id,
    current: { what_was_wrong: x.what_was_wrong, what_is_right: x.what_is_right, reason: x.reason }, next, supersession_reason: why, blockers,
    write: blockers.length > 0 ? undefined : x };
}

async function planBatch(client: PoolClient, body: Record<string, unknown>, req: Request, tenantId: string, lock: boolean) {
  const items = Array.isArray(body.items) ? body.items.filter(isRecord) : [];
  const errataItems = Array.isArray(body.errata) ? body.errata.filter(isRecord) : [];
  if (items.length + errataItems.length === 0) throw new Refusal(422, 'Choose at least one row to correct.');
  if (new Set(items.map((i) => String(i.evidence_id))).size !== items.length) throw new Refusal(422, 'Name each row once.');
  const planned = [];
  for (const i of items) planned.push({ item: i, plan: await planItem(client, i, req, tenantId, lock) });
  const rows = planned.map(({ plan }) => { const { write: _write, ...shown } = plan as typeof plan & { write?: unknown }; return shown; });
  const plannedErrata = [];
  for (const i of errataItems) plannedErrata.push(await planErratum(client, i, req));
  const errata = plannedErrata.map((plan) => { const { write: _write, ...shown } = plan as typeof plan & { write?: unknown }; return shown; });
  return { planned, plannedErrata, rows, errata, plan_hash: sha256Hex({ rows, errata }), can_submit: [...rows, ...errata].every((r) => r.blockers.length === 0) };
}

/** /api/institutions/:institutionId/evidence */
export function accountEvidenceRouter(pool: Pool): Router {
  const router = Router();
  const accountOf = async (q: Pool | PoolClient, id: string) => (await q.query<{ id: string; tenant_id: string; name: string }>(
    'SELECT id, tenant_id, name FROM institutions WHERE id = $1 AND deleted_at IS NULL', [id])).rows[0];

  router.get('/:institutionId/evidence', async (req, res) => {
    const { institutionId } = req.params;
    if (!isUuid(institutionId)) { res.status(400).json({ message: 'invalid institution id' }); return; }
    try {
      const account = await accountOf(pool, institutionId);
      if (!account || isOtherTenant(req, account.tenant_id, { table: 'institutions', id: institutionId })) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      const { rows } = await pool.query(
        `SELECT e.id, e.kind::text, e.summary, e.provenance, e.source_reference, e.evidence_form::text, e.quote_text, e.locator, e.how_read,
                e.source_verified, e.citation_resolved, e.ai_sourced, e.simulated, e.superseded_by_id, e.attester_document,
                rp.full_name AS opened_by, to_char(e.citation_resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS opened_on,
                ap.full_name AS attested_by, cp.full_name AS captured_by, to_char(e.captured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS captured_on,
                lvrf_evidence_about(e.about_institution_id, e.about_other_party) AS about,
                lvrf_evidence_basis(e) AS basis, lvrf_evidence_basis_reason(e) AS basis_reason,
                lvrf_evidence_under_finding(e.id) AS under_finding,
                lvrf_system_exercise_mark('evidence', e.id) AS system_exercise,
                (SELECT lvrf_evidence_about(s.about_institution_id, s.about_other_party) FROM evidence s WHERE s.id = e.superseded_by_id) AS superseded_about,
                coalesce((SELECT jsonb_agg(jsonb_build_object('supports', l.supports, 'withdrawn', l.withdrawn_at IS NOT NULL)) FROM value_outcome_evidence l WHERE l.evidence_id = e.id), '[]'::jsonb) AS links
           FROM evidence e
           JOIN persons cp ON cp.id = e.captured_by_person_id
           LEFT JOIN persons rp ON rp.id = e.citation_resolved_by_person_id
           LEFT JOIN persons ap ON ap.id = e.attested_by_person_id
          WHERE e.institution_id = $1 AND e.deleted_at IS NULL
          ORDER BY e.captured_at, e.id`, [institutionId]);
      res.json({ account: account.name, evidence: rows });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  router.post('/:institutionId/evidence', async (req, res) => {
    const endpoint = 'POST /api/institutions/:institutionId/evidence';
    const client: PoolClient = req.dbClient!;
    const { institutionId } = req.params;
    if (!isUuid(institutionId)) { res.status(400).json({ message: 'invalid institution id' }); return; }
    let tenantId: string | null = null;
    try {
      const account = await accountOf(client, institutionId);
      if (!account || isOtherTenant(req, account.tenant_id, { table: 'institutions', id: institutionId })) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      tenantId = account.tenant_id;
      if (await refuseUnknownFields(pool, req, res, BODY_FIELDS,
        { endpoint, subjectTable: 'evidence', subjectId: null, tenantId, institutionId }, notTaken)) return;
      const body = isRecord(req.body) ? req.body : {};
      const id = await insertRecorded(client, body, institutionId, tenantId, actorOf(req), false);
      res.status(201).json({ evidence_id: id });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'evidence', subjectId: null, tenantId, institutionId });
    }
  });
  return router;
}

interface LegacyRow { id: string; institution_id: string; tenant_id: string; account: string; kind: string; summary: string; provenance: string; proposed: 'account' | null }

/**
 * Every row of the tenant with nothing stated. Condition 2: the proposal is derived, and only where the row
 * cannot be about anyone else: a filing or a vendor publication on a customer account, backing no fact or
 * entity of that account, is not pre-filled, because its source is someone else's document.
 */
async function legacyRows(q: Pool | PoolClient, tenantId: string): Promise<LegacyRow[]> {
  const { rows } = await q.query<LegacyRow>(
    `SELECT e.id, e.institution_id, i.tenant_id, i.name AS account, e.kind::text, e.summary, e.provenance,
            CASE WHEN NOT i.is_tenant_self AND e.kind IN ('public_filing', 'vendor_publication')
                      AND NOT EXISTS (SELECT 1 FROM institution_facts f WHERE f.evidence_id = e.id)
                      AND NOT EXISTS (SELECT 1 FROM institution_entities n WHERE n.evidence_id = e.id)
                 THEN NULL ELSE 'account' END AS proposed
       FROM evidence e JOIN institutions i ON i.id = e.institution_id
      WHERE i.tenant_id = $1 AND e.about_institution_id IS NULL AND e.about_other_party IS NULL
      ORDER BY i.name, e.captured_at, e.id`, [tenantId]);
  return rows;
}

/** /api/evidence: the batch, a withdrawn verification, a supersession */
export function evidenceActsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/about-batch', async (req, res) => {
    try {
      const tenantId = await actorTenantId(req);
      const rows = await legacyRows(pool, tenantId);
      const { rows: accounts } = await pool.query<{ id: string; name: string; is_tenant_self: boolean }>(
        'SELECT id, name, is_tenant_self FROM institutions WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY is_tenant_self DESC, name', [tenantId]);
      res.json({ count: rows.length, rows, accounts });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  router.get('/supersession-batch', async (req, res) => {
    try {
      const tenantId = await actorTenantId(req);
      const { rows: errata } = await pool.query(
        `SELECT x.id, i.name AS account, g.name AS engagement, r.run_number, x.what_was_wrong, x.what_is_right, x.reason
           FROM run_errata x JOIN value_runs r ON r.id = x.value_run_id JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id
          WHERE x.tenant_id = $1 AND x.kind = 'link_correction' AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id)
          ORDER BY i.name, g.name, r.run_number`, [tenantId]);
      const { rows } = await pool.query(
        `SELECT e.id, e.institution_id, i.name AS account, e.kind::text, e.summary, e.provenance, e.source_reference, e.evidence_form::text,
                lvrf_evidence_about(e.about_institution_id, e.about_other_party) AS about, e.source_verified, e.citation_resolved,
                lvrf_system_exercise_mark('evidence', e.id) IS NOT NULL AS marked
           FROM evidence e JOIN institutions i ON i.id = e.institution_id
          WHERE i.tenant_id = $1 AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
          ORDER BY i.name, e.captured_at, e.id`, [tenantId]);
      res.json({ count: rows.length, rows, errata });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  router.post('/supersession-batch/dry-run', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/evidence/supersession-batch/dry-run';
    const client: PoolClient = req.dbClient!;
    let tenantId: string | null = null;
    try {
      tenantId = await actorTenantId(req);
      if (await refuseUnknownFields(pool, req, res, ['items', 'errata'], { endpoint, subjectTable: 'evidence', subjectId: null, tenantId, institutionId: null })) return;
      const { rows, errata, plan_hash, can_submit } = await planBatch(client, isRecord(req.body) ? req.body : {}, req, tenantId, false);
      res.status(200).json({ count: rows.length + errata.length, rows, errata, plan_hash, can_submit });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'evidence', subjectId: null, tenantId, institutionId: null });
    }
  });

  router.post('/supersession-batch', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/evidence/supersession-batch';
    const client: PoolClient = req.dbClient!;
    let tenantId: string | null = null;
    try {
      tenantId = await actorTenantId(req);
      if (await refuseUnknownFields(pool, req, res, ['items', 'errata', 'expected_count', 'plan_hash', 'reason'],
        { endpoint, subjectTable: 'evidence', subjectId: null, tenantId, institutionId: null })) return;
      const b = isRecord(req.body) ? req.body : {};
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why they are superseded, in at least ${MIN_REASON} characters.`);
      if (typeof b.expected_count !== 'number' || typeof b.plan_hash !== 'string') throw new Refusal(422, 'Give the count and the plan the dry run showed.');
      const { planned, plannedErrata, rows, errata, plan_hash, can_submit } = await planBatch(client, b, req, tenantId, true);
      const count = rows.length + errata.length;
      if (count !== b.expected_count) throw new Refusal(409, `The count changed: ${count} items now, not ${b.expected_count}. Run the dry run again.`);
      if (!can_submit) throw new Refusal(409, `Nothing was recorded: ${[...rows, ...errata].flatMap((r) => r.blockers)[0]}`);
      if (plan_hash !== b.plan_hash) throw new Refusal(409, 'The record changed since the dry run, so nothing was recorded. Run the dry run again.');
      const actor = actorOf(req);
      const act = (a: ActRecord) => recordAct(client, req, 'POST /api/evidence/supersession-batch', a);
      // Errata first: an erratum needs the evidence's current link, and the rows below move it.
      for (const p of plannedErrata) {
        const { write: x, next, supersession_reason } = p as { write: ErratumRow; next: { what_was_wrong: string; what_is_right: string; reason: string }; supersession_reason: string };
        await writeLinkErratum(client, act, {
          tenantId, actor, runId: x.value_run_id, outcomeId: x.value_outcome_id, payload: x.payload, evidenceId: x.evidence_id!,
          texts: { wrong: next.what_was_wrong, right: next.what_is_right, reason: next.reason },
          supersedes: x.id, supersessionReason: supersession_reason, supersessionReasonGiven: true,
        });
      }
      const superseded = [];
      for (const { item, plan } of planned) {
        const { row: e, reading } = (plan as { write: { row: BatchRow; reading: ReturnType<typeof parseEvidenceForm> | null } }).write;
        const body: Record<string, unknown> = {
          about: item.about, kind: e.kind, summary: (plan as { next: { summary: string } }).next.summary, provenance: (plan as { next: { provenance: string } }).next.provenance, source_reference: e.source_reference ?? undefined,
          attested_by_person_id: e.attested_by_person_id ?? undefined, attested_at: e.attested_at ?? undefined,
          ...(reading ? Object.fromEntries(READING_FIELDS.map((k) => [k, item[k]])) : { evidence_form: e.evidence_form, quote_text: e.quote_text, locator: e.locator, how_read: e.how_read }),
        };
        const origin = e.ai_sourced ? { researchQuery: e.research_query ?? '', researchTool: e.research_tool ?? '' } : null;
        const successor = await insertRecorded(client, body, e.institution_id, tenantId, actor, e.simulated, e.confidence, origin);
        await carryToSuccessor(client, act, e, successor, reason, actor);
        superseded.push({ evidence_id: e.id, successor_id: successor });
      }
      res.status(201).json({ superseded: superseded.length, errata_superseded: plannedErrata.length, rows: superseded });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'evidence', subjectId: null, tenantId, institutionId: null });
    }
  });

  router.post('/about-batch', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/evidence/about-batch';
    const client: PoolClient = req.dbClient!;
    let tenantId: string | null = null;
    try {
      tenantId = await actorTenantId(req);
      if (await refuseUnknownFields(pool, req, res, ['expected_count', 'items', 'reason'],
        { endpoint, subjectTable: 'evidence', subjectId: null, tenantId, institutionId: null })) return;
      const b = isRecord(req.body) ? req.body : {};
      if (typeof b.expected_count !== 'number' || !Number.isInteger(b.expected_count) || b.expected_count < 1) {
        throw new Refusal(422, 'Give the count the list showed (expected_count).');
      }
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why they are stated, in at least ${MIN_REASON} characters.`);
      const rows = await legacyRows(client, tenantId);
      if (rows.length !== b.expected_count) throw new Refusal(409, `The count changed: ${rows.length} rows now wait, not ${b.expected_count}. Reload the list.`);
      const items = Array.isArray(b.items) ? b.items.filter(isRecord) : [];
      const given = new Map(items.map((i) => [String(i.evidence_id), i.about]));
      if (items.length !== rows.length || given.size !== rows.length || rows.some((r) => !given.has(r.id))) {
        throw new Refusal(422, 'State every row the list shows, once each.');
      }
      for (const r of rows) {
        const about = await parseAbout(client, given.get(r.id), r.institution_id, r.tenant_id);
        await client.query('UPDATE evidence SET about_institution_id = $2, about_other_party = $3 WHERE id = $1',
          [r.id, about.aboutInstitutionId, about.aboutOtherParty]);
        await recordAct(client, req, 'POST /api/evidence/about-batch', { act: 'state_about', tenantId, subjectTable: 'evidence', subjectId: r.id, reason });
      }
      res.status(201).json({ stated: rows.length });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'evidence', subjectId: null, tenantId, institutionId: null });
    }
  });

  const rowOf = async (client: PoolClient, req: Request, id: string) => {
    const { rows: [e] } = await client.query<{ id: string; institution_id: string; tenant_id: string; source_verified: boolean;
      citation_resolved: boolean; deleted_at: string | null; superseded_by_id: string | null; ai_sourced: boolean; research_query: string | null; research_tool: string | null }>(
      `SELECT e.id, e.institution_id, i.tenant_id, e.source_verified, e.citation_resolved, e.deleted_at, e.superseded_by_id, e.ai_sourced, e.research_query, e.research_tool
         FROM evidence e JOIN institutions i ON i.id = e.institution_id WHERE e.id = $1 FOR UPDATE OF e`, [id]);
    return !e || isOtherTenant(req, e.tenant_id, { table: 'evidence', id }) ? null : e;
  };

  router.post('/:id/withdraw-verification', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/evidence/:id/withdraw-verification';
    const client: PoolClient = req.dbClient!;
    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ message: `invalid evidence id: ${id}` }); return; }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const e = await rowOf(client, req, id);
      if (!e) { res.status(404).json({ message: `evidence ${id} not found` }); return; }
      tenantId = e.tenant_id; institutionId = e.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['reason'], { endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId })) return;
      const b = isRecord(req.body) ? req.body : {};
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why, in at least ${MIN_REASON} characters.`);
      if (!e.source_verified || e.citation_resolved) {
        throw new Refusal(409, e.citation_resolved
          ? 'This evidence was opened by a person; an opening is final. Correct it by supersession.'
          : 'This evidence is not verified; there is nothing to withdraw.');
      }
      await client.query('UPDATE evidence SET source_verified = false WHERE id = $1', [id]);
      await recordAct(client, req, 'POST /api/evidence/:id/withdraw-verification', { act: 'withdraw', tenantId, subjectTable: 'evidence', subjectId: id, reason });
      res.status(200).json({ evidence_id: id, source_verified: false });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId });
    }
  });

  router.post('/:id/supersede', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/evidence/:id/supersede';
    const client: PoolClient = req.dbClient!;
    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ message: `invalid evidence id: ${id}` }); return; }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const e = await rowOf(client, req, id);
      if (!e) { res.status(404).json({ message: `evidence ${id} not found` }); return; }
      tenantId = e.tenant_id; institutionId = e.institution_id;
      if (await refuseUnknownFields(pool, req, res, [...BODY_FIELDS, 'simulated', 'reason'],
        { endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId }, notTaken)) return;
      const b = isRecord(req.body) ? req.body : {};
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why it is superseded, in at least ${MIN_REASON} characters.`);
      if (b.simulated !== undefined && typeof b.simulated !== 'boolean') throw new Refusal(422, 'Say whether the new row is simulated: true or false.');
      if (e.deleted_at !== null || e.superseded_by_id !== null) throw new Refusal(409, 'This evidence is not current (retired or superseded).');
      const { rows: grants } = await client.query('SELECT 1 FROM customer_role_grants WHERE source_evidence_id = $1 AND revoked_at IS NULL', [id]);
      if (grants.length > 0) throw new Refusal(409, 'A current customer-side role is named from this evidence. Revoke the role first.');
      // Q4k: AI origin is permanent, so a successor carries it.
      const origin = e.ai_sourced ? { researchQuery: e.research_query ?? '', researchTool: e.research_tool ?? '' } : null;
      const successor = await insertRecorded(client, b, e.institution_id, e.tenant_id, actorOf(req), b.simulated === true, 'medium', origin);
      await carryToSuccessor(client, (a) => recordAct(client, req, 'POST /api/evidence/:id/supersede', a), e, successor, reason, actorOf(req));
      res.status(201).json({ evidence_id: successor, supersedes: id });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId });
    }
  });
  return router;
}
