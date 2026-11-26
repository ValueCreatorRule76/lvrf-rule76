import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { handleGovernanceError, plainUniqueMessage, recordRefusal, recordRouteRefusal } from '../lib/refusal.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { recordAct } from '../lib/governanceAct.js';
import { requireSteward } from '../lib/stewardActs.js';
import { composeStory, currentStory, oneCurrentRefusal, StoryRefusal, type StoryAudience, type StoryPayload } from '../lib/story.js';

/**
 * S7b (3.1; LVRF_PLAN §27; Brad's rulings 24-25 Nov 2026): the story of record.
 *
 *   GET  /api/institutions/:institutionId/story-draft?audience=internal|client   the draft, composed now; on screen only
 *   GET  /api/institutions/:institutionId/stories                               the account's issued stories, newest first
 *   POST /api/institutions/:institutionId/stories  { audience }                 the steward issues one: sealed (D1)
 *   GET  /api/stories/:id                                                        an issued story, from its row alone
 *   POST /api/stories/:id/withdraw  { reason }                                   the steward withdraws one
 *
 * Issuing and withdrawing are the steward's acts only (Brad, 25 Nov 2026). Only an issued story prints; a draft never
 * does. An issued story names the evidence heads it sealed: at read, "Newer evidence exists: withdraw this story, then issue the new one to include it" (S7b.2)
 * when one was superseded or withdrawn since, and nothing changes.
 */
const audienceOf = (v: unknown): StoryAudience | null => (v === 'internal' || v === 'client' ? v : null);

async function accountTenant(pool: Pool, institutionId: string): Promise<string | null> {
  const { rows: [i] } = await pool.query<{ tenant_id: string }>(
    'SELECT tenant_id FROM institutions WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL', [institutionId]);
  return i?.tenant_id ?? null;
}

export function institutionStoriesRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:institutionId/story-draft', async (req, res) => {
    const { institutionId } = req.params;
    if (!isUuid(institutionId)) { res.status(400).json({ message: `invalid account id: ${institutionId}` }); return; }
    const audience = audienceOf(req.query.audience ?? 'internal');
    if (!audience) { res.status(400).json({ message: 'The audience is internal or client.' }); return; }
    try {
      const tenantId = await accountTenant(pool, institutionId);
      if (!tenantId || isOtherTenant(req, tenantId, { table: 'institutions', id: institutionId })) { res.status(404).json({ message: `account ${institutionId} not found` }); return; }
      const payload = await composeStory(pool, tenantId, institutionId, audience);
      if (!payload) { res.status(409).json({ message: 'This account has no locked run that is not a system exercise: there is no story to tell yet.' }); return; }
      // S7b.2 (§36): the current story for this audience, if any, and whether nothing has changed since it was issued.
      res.json({ draft: true, payload, current_story: await currentStory(pool, institutionId, audience, payload) });
    } catch (err) {
      if (err instanceof StoryRefusal) { res.status(409).json({ message: err.message }); return; }
      respondServerError(res, err);
    }
  });

  router.get('/:institutionId/stories', async (req, res) => {
    const { institutionId } = req.params;
    if (!isUuid(institutionId)) { res.status(400).json({ message: `invalid account id: ${institutionId}` }); return; }
    try {
      const tenantId = await accountTenant(pool, institutionId);
      if (!tenantId || isOtherTenant(req, tenantId, { table: 'institutions', id: institutionId })) { res.status(404).json({ message: `account ${institutionId} not found` }); return; }
      const { rows } = await pool.query(
        `SELECT s.id, s.audience, s.stage, s.payload_hash, s.issued_at, p.full_name AS issued_by,
                s.withdrawn_at, w.full_name AS withdrawn_by, s.withdrawal_reason
           FROM story_records s JOIN persons p ON p.id = s.issued_by_person_id LEFT JOIN persons w ON w.id = s.withdrawn_by_person_id
          WHERE s.institution_id = $1 ORDER BY s.issued_at DESC, s.id`, [institutionId]);
      res.json({ stories: rows });
    } catch (err) { respondServerError(res, err); }
  });

  router.post('/:institutionId/stories', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/institutions/:institutionId/stories';
    const client = req.dbClient!;
    const { institutionId } = req.params;
    if (!isUuid(institutionId)) { res.status(400).json({ message: `invalid account id: ${institutionId}` }); return; }
    let tenantId: string | null = null;
    let payload: StoryPayload | null = null;
    try {
      const actor = req.actor?.personId;
      if (!actor) throw new Error('req.actor missing on a request past requireActor');
      tenantId = await accountTenant(pool, institutionId);
      if (!tenantId || isOtherTenant(req, tenantId, { table: 'institutions', id: institutionId })) { res.status(404).json({ message: `account ${institutionId} not found` }); return; }
      if (await refuseUnknownFields(pool, req, res, ['audience'], { endpoint, subjectTable: 'institutions', subjectId: institutionId, tenantId, institutionId })) return;
      const audience = audienceOf(req.body?.audience);
      if (!audience) { res.status(422).json({ message: 'Say who the story is for: internal or client.' }); return; }
      payload = await composeStory(client, tenantId, institutionId, audience);
      if (!payload) { res.status(409).json({ message: 'This account has no locked run that is not a system exercise: there is no story to tell yet.' }); return; }
      // S7b.2 (§36, Brad 26 Nov 2026): one current story per account and audience. Refused before any write, with the
      // sentence that fits: the same hash, or a changed record (the current one is withdrawn first).
      const current = await currentStory(client, institutionId, audience, payload);
      if (current) {
        const message = oneCurrentRefusal(current);
        await recordRouteRefusal(pool, req, { endpoint, subjectTable: 'institutions', subjectId: institutionId, tenantId, institutionId, attemptedPayload: req.body }, message);
        res.status(409).json({ message, current_story: current });
        return;
      }
      const { rows: [s] } = await client.query<{ id: string; payload_hash: string; issued_at: string }>(
        `INSERT INTO story_records (tenant_id, institution_id, audience, stage, payload, payload_hash, issued_by_person_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, encode(sha256(convert_to($5::jsonb::text, 'UTF8')), 'hex'), $6)
         RETURNING id, payload_hash, issued_at`,
        [tenantId, institutionId, audience, payload.stage, JSON.stringify(payload), actor]);
      await recordAct(client, req, endpoint, { act: 'issue', tenantId, subjectTable: 'story_records', subjectId: s.id, evidenceIds: payload.evidence_heads });
      res.status(201).json({ id: s.id, payload_hash: s.payload_hash, issued_at: s.issued_at, stage: payload.stage, audience });
    } catch (err) {
      if (err instanceof StoryRefusal) { res.status(409).json({ message: err.message }); return; }
      const ctx = { endpoint, subjectTable: 'institutions', subjectId: institutionId, tenantId, institutionId, attemptedPayload: req.body };
      // A race on story_records_one_current: another issue for this audience committed first. The sentence that fits is
      // read from that story, on the pool (this request's transaction is aborted); the raw text goes to `refusals`.
      const e = err as { code?: string; constraint?: string; message?: string; detail?: string };
      if (e.code === '23505' && e.constraint === 'story_records_one_current') {
        await recordRefusal(pool, req, ctx, '23505', e.constraint, e.message ?? '');
        const won = payload ? await currentStory(pool, institutionId, audienceOf(req.body?.audience) ?? 'internal', payload).catch(() => null) : null;
        res.status(409).json({ message: won ? oneCurrentRefusal(won) : plainUniqueMessage({ message: e.message ?? '', constraint: e.constraint, detail: e.detail }), current_story: won });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, ctx)) return;
      respondServerError(res, err);
    }
  });

  return router;
}

export function storiesRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ message: `invalid story id: ${id}` }); return; }
    try {
      const { rows: [s] } = await pool.query<{
        id: string; tenant_id: string; institution_id: string; audience: string; stage: string; payload: StoryPayload; payload_hash: string;
        issued_at: string; issued_by: string; withdrawn_at: string | null; withdrawn_by: string | null; withdrawal_reason: string | null; newer: string[];
      }>(
        `SELECT s.id, s.tenant_id, s.institution_id, s.audience, s.stage, s.payload, s.payload_hash, s.issued_at, p.full_name AS issued_by,
                s.withdrawn_at, w.full_name AS withdrawn_by, s.withdrawal_reason,
                coalesce((SELECT array_agg(h ORDER BY h) FROM jsonb_array_elements_text(s.payload->'evidence_heads') h
                           JOIN evidence e ON e.id = h::uuid
                          WHERE e.superseded_by_id IS NOT NULL OR e.deleted_at IS NOT NULL), '{}') AS newer
           FROM story_records s JOIN persons p ON p.id = s.issued_by_person_id LEFT JOIN persons w ON w.id = s.withdrawn_by_person_id
          WHERE s.id = $1`, [id]);
      if (!s || isOtherTenant(req, s.tenant_id, { table: 'story_records', id })) { res.status(404).json({ message: `story ${id} not found` }); return; }
      res.json({
        id: s.id, institution_id: s.institution_id, audience: s.audience, stage: s.stage, payload_hash: s.payload_hash,
        issued_at: s.issued_at, issued_by: s.issued_by,
        withdrawn: s.withdrawn_at ? { at: s.withdrawn_at, by: s.withdrawn_by, reason: s.withdrawal_reason } : null,
        newer_evidence: s.newer.length > 0 ? { ids: s.newer, note: 'Newer evidence exists: withdraw this story, then issue the new one to include it.' } : null,
        payload: s.payload,
      });
    } catch (err) { respondServerError(res, err); }
  });

  router.post('/:id/withdraw', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/stories/:id/withdraw';
    const client = req.dbClient!;
    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ message: `invalid story id: ${id}` }); return; }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = req.actor?.personId;
      if (!actor) throw new Error('req.actor missing on a request past requireActor');
      const { rows: [s] } = await client.query<{ tenant_id: string; institution_id: string; withdrawn_at: string | null }>(
        'SELECT tenant_id, institution_id, withdrawn_at FROM story_records WHERE id = $1 FOR UPDATE', [id]);
      if (!s || isOtherTenant(req, s.tenant_id, { table: 'story_records', id })) { res.status(404).json({ message: `story ${id} not found` }); return; }
      tenantId = s.tenant_id; institutionId = s.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['reason'], { endpoint, subjectTable: 'story_records', subjectId: id, tenantId, institutionId })) return;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < 12) { res.status(422).json({ message: 'Say why the story is withdrawn, in at least 12 characters.' }); return; }
      if (s.withdrawn_at) { res.status(409).json({ message: `This story was withdrawn on ${new Date(s.withdrawn_at).toISOString().slice(0, 10)}; a withdrawn story stays on the record as it is.` }); return; }
      await client.query(
        'UPDATE story_records SET withdrawn_at = now(), withdrawn_by_person_id = $2, withdrawal_reason = $3 WHERE id = $1', [id, actor, reason]);
      await recordAct(client, req, endpoint, { act: 'withdraw', tenantId, subjectTable: 'story_records', subjectId: id, reason });
      res.json({ id, withdrawn: true });
    } catch (err) {
      if (await handleGovernanceError(pool, err, req, res, { endpoint, subjectTable: 'story_records', subjectId: id, tenantId, institutionId, attemptedPayload: req.body })) return;
      respondServerError(res, err);
    }
  });

  return router;
}
