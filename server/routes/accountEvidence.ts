import { Router, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { recordAct } from '../lib/governanceAct.js';
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
  if (err instanceof Refusal || err instanceof EvidenceFormError) {
    if (ctx.tenantId) await recordRouteRefusal(pool, req, { ...ctx, tenantId: ctx.tenantId, attemptedPayload: req.body }, err.message);
    res.status(err instanceof Refusal ? err.status : 422).json({ message: err.message });
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
async function insertRecorded(client: PoolClient, body: Record<string, unknown>, institutionId: string, tenantId: string, actor: string, simulated: boolean): Promise<string> {
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
       attested_by_person_id, attested_at, evidence_form, quote_text, locator, how_read, about_institution_id, about_other_party)
     VALUES ($1, $2, $3, $4, $5, 'medium', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
    [institutionId, kind, text('summary'), text('provenance'), sourceReference, simulated, actor, attestedBy, attestedAt,
      form.evidenceForm, form.quoteText, form.locator === null ? null : JSON.stringify(form.locator), form.howRead,
      about.aboutInstitutionId, about.aboutOtherParty]);
  return row.id;
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
      const { rows: accounts } = await pool.query<{ id: string; name: string }>(
        'SELECT id, name FROM institutions WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name', [tenantId]);
      res.json({ count: rows.length, rows, accounts });
    } catch (err) {
      respondServerError(res, err);
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
      citation_resolved: boolean; deleted_at: string | null; superseded_by_id: string | null }>(
      `SELECT e.id, e.institution_id, i.tenant_id, e.source_verified, e.citation_resolved, e.deleted_at, e.superseded_by_id
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
      const successor = await insertRecorded(client, b, e.institution_id, e.tenant_id, actorOf(req), b.simulated === true);
      await client.query('UPDATE evidence SET superseded_by_id = $2 WHERE id = $1', [id, successor]);
      await recordAct(client, req, 'POST /api/evidence/:id/supersede', { act: 'supersede', tenantId, subjectTable: 'evidence', subjectId: id, resultTable: 'evidence', resultId: successor, reason });
      res.status(201).json({ evidence_id: successor, supersedes: id });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'evidence', subjectId: id, tenantId, institutionId });
    }
  });
  return router;
}
