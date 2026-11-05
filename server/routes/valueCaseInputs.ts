import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { recordAct } from '../lib/governanceAct.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { actorTenantId, isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { requireSteward } from '../lib/stewardActs.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { isUuid } from './params.js';

/**
 * B3 (P6; LVRF_PLAN §19, approved by Brad 5 Nov 2026) — the value case's governed inputs. Every write here is held in
 * the database too (hardening section 33): steward-only where the plan says so, insert-only, one act per write.
 *
 *   GET  /api/policies                                  the current policy values and CFO lens, with their history
 *   POST /api/policies/values               steward     set cost-of-delay months or the pack ratification threshold
 *   POST /api/policies/lenses               steward     ratify a lens policy (CFO only in 3.0)
 *   POST /api/value-outcomes/:outcomeId/monetization-rates   record (or correct) the client's rate for the metric
 *   POST /api/engagements/:engagementId/milestones          plan a roadmap milestone
 *   POST /api/roadmap-milestones/:id/supersede              change a milestone's date, status or owner, with a reason
 *   POST /api/value-runs/:runId/share-for-review  steward   D-M21: "Shared for review as an outside-in hypothesis"
 *   POST /api/value-runs/:runId/print-request              O4: the Print control was pressed (claims the request only)
 *
 * Nothing here computes a figure or falls back to a default: with no row, the case says what is not set.
 *
 * No SELECT here takes a row lock: lvrf_app holds no UPDATE on these insert-only tables (section 24), and FOR UPDATE
 * needs it. Two writers racing on one chain still cannot both land: the unique supersedes_id, and the one-root index
 * on a key, refuse the second.
 */
class Refusal extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const MIN_REASON = 12;
type Body = Record<string, unknown>;
const bodyOf = (req: { body: unknown }): Body => (typeof req.body === 'object' && req.body !== null ? req.body as Body : {});
const str = (b: Body, k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');

export const POLICY_KEYS: Record<string, string> = {
  cost_of_delay_months: 'Cost-of-delay months',
  pack_ratification_institutions: "Pack ratification threshold (institutions' systems of record)",
};
export const BASES = ['system_of_record', 'published', 'client_stated', 'inferred', 'assumed'] as const;

async function refuse(pool: Pool, req: Parameters<typeof recordRouteRefusal>[1], res: { status: (n: number) => { json: (b: unknown) => void } },
  err: unknown, ctx: { endpoint: string; subjectTable: string; subjectId: string | null; tenantId: string | null; institutionId: string | null }) {
  if (err instanceof Refusal) {
    if (ctx.tenantId) await recordRouteRefusal(pool, req, { ...ctx, tenantId: ctx.tenantId, attemptedPayload: req.body }, err.message);
    res.status(err.status).json({ message: err.message });
    return true;
  }
  return handleGovernanceError(pool, err, req, res as never, { ...ctx, attemptedPayload: req.body });
}

export function policiesRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const tenantId = actorTenantId(req);
      const { rows: values } = await pool.query(
        `SELECT v.id, v.key, trim_scale(v.value)::text AS value, v.reason, p.full_name AS set_by, v.set_at, v.supersedes_id,
                NOT EXISTS (SELECT 1 FROM policy_values s WHERE s.supersedes_id = v.id) AS current
           FROM policy_values v JOIN persons p ON p.id = v.set_by_person_id WHERE v.tenant_id = $1 ORDER BY v.key, v.set_at`, [tenantId]);
      const { rows: lenses } = await pool.query(
        `SELECT l.id, l.persona, trim_scale(l.min_confidence_score)::text AS min_confidence_score, l.admitted_bases, l.suppresses, l.refusal_text,
                l.reason, p.full_name AS ratified_by, l.ratified_at, l.supersedes_id,
                NOT EXISTS (SELECT 1 FROM lens_policies s WHERE s.supersedes_id = l.id) AS current
           FROM lens_policies l JOIN persons p ON p.id = l.ratified_by_person_id WHERE l.tenant_id = $1 ORDER BY l.persona, l.ratified_at`, [tenantId]);
      res.json({ keys: POLICY_KEYS, values, lenses });
    } catch (err) { respondServerError(res, err); }
  });

  router.post('/values', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/policies/values';
    const client: PoolClient = req.dbClient!;
    let tenantId: string | null = null;
    const ctx = () => ({ endpoint, subjectTable: 'policy_values', subjectId: null, tenantId, institutionId: null });
    try {
      tenantId = actorTenantId(req);
      if (await refuseUnknownFields(pool, req, res, ['key', 'value', 'reason'], { ...ctx(), tenantId })) return;
      const b = bodyOf(req);
      const key = str(b, 'key');
      const reason = str(b, 'reason');
      if (!(key in POLICY_KEYS)) throw new Refusal(422, 'Choose the policy: cost-of-delay months or the pack ratification threshold.');
      const value = typeof b.value === 'number' ? b.value : typeof b.value === 'string' && /^\d+$/.test(b.value.trim()) ? Number(b.value) : NaN;
      if (!Number.isInteger(value)) throw new Refusal(422, 'The value is a whole number.');
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why, in at least ${MIN_REASON} characters.`);
      const { rows: [head] } = await client.query<{ id: string; value: string }>(
        `SELECT v.id, trim_scale(v.value)::text AS value FROM policy_values v
          WHERE v.tenant_id = $1 AND v.key = $2 AND NOT EXISTS (SELECT 1 FROM policy_values s WHERE s.supersedes_id = v.id)`, [tenantId, key]);
      if (head && Number(head.value) === value) throw new Refusal(409, `${POLICY_KEYS[key]} is already ${value}; a value that changes nothing is not recorded.`);
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO policy_values (tenant_id, key, value, reason, set_by_person_id, supersedes_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tenantId, key, value, reason, req.actor!.personId, head?.id ?? null]);
      await recordAct(client, req, 'POST /api/policies/values', { act: 'ratify', tenantId, subjectTable: 'policy_values', subjectId: row.id, reason });
      res.status(201).json({ policy_value_id: row.id, key, value, supersedes: head?.id ?? null, previous: head ? Number(head.value) : null });
    } catch (err) {
      if (await refuse(pool, req, res, err, ctx())) return;
      respondServerError(res, err);
    }
  });

  router.post('/lenses', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/policies/lenses';
    const client: PoolClient = req.dbClient!;
    let tenantId: string | null = null;
    const ctx = () => ({ endpoint, subjectTable: 'lens_policies', subjectId: null, tenantId, institutionId: null });
    try {
      tenantId = actorTenantId(req);
      if (await refuseUnknownFields(pool, req, res, ['persona', 'min_confidence_score', 'admitted_bases', 'suppresses', 'refusal_text', 'reason'], { ...ctx(), tenantId })) return;
      const b = bodyOf(req);
      const persona = str(b, 'persona');
      if (persona !== 'cfo') throw new Refusal(422, 'In 3.0 the only lens policy is the CFO lens (the CHRO lens is 3.1).');
      const min = typeof b.min_confidence_score === 'number' ? b.min_confidence_score : Number.NaN;
      if (!Number.isFinite(min) || min < 0 || min > 100) throw new Refusal(422, 'The minimum computed confidence is a number from 0 to 100.');
      const bases = Array.isArray(b.admitted_bases) ? b.admitted_bases : [];
      if (bases.length === 0 || !bases.every((x) => (BASES as readonly unknown[]).includes(x))) throw new Refusal(422, 'Admit at least one basis for an actual.');
      const sup = Array.isArray(b.suppresses) ? b.suppresses : [];
      if (!sup.every((x) => x === 'consumption')) throw new Refusal(422, 'A lens may suppress consumption metrics, and nothing else yet.');
      const refusalText = str(b, 'refusal_text');
      const reason = str(b, 'reason');
      if (refusalText.length < 24) throw new Refusal(422, 'The refusal text needs at least 24 characters.');
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why, in at least ${MIN_REASON} characters.`);
      const { rows: [head] } = await client.query<{ id: string }>(
        `SELECT l.id FROM lens_policies l WHERE l.tenant_id = $1 AND l.persona = $2
            AND NOT EXISTS (SELECT 1 FROM lens_policies s WHERE s.supersedes_id = l.id)`, [tenantId, persona]);
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO lens_policies (tenant_id, persona, min_confidence_score, admitted_bases, suppresses, refusal_text, reason, ratified_by_person_id, supersedes_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tenantId, persona, min, [...new Set(bases as string[])], [...new Set(sup as string[])], refusalText, reason, req.actor!.personId, head?.id ?? null]);
      await recordAct(client, req, 'POST /api/policies/lenses', { act: 'ratify', tenantId, subjectTable: 'lens_policies', subjectId: row.id, reason });
      res.status(201).json({ lens_policy_id: row.id, persona, supersedes: head?.id ?? null });
    } catch (err) {
      if (await refuse(pool, req, res, err, ctx())) return;
      respondServerError(res, err);
    }
  });
  return router;
}

export function monetizationRatesRouter(pool: Pool): Router {
  const router = Router();
  router.post('/:outcomeId/monetization-rates', async (req, res) => {
    const endpoint = 'POST /api/value-outcomes/:outcomeId/monetization-rates';
    const client: PoolClient = req.dbClient!;
    const { outcomeId } = req.params;
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    const ctx = () => ({ endpoint, subjectTable: 'monetization_rates', subjectId: null, tenantId, institutionId });
    if (!isUuid(outcomeId)) { res.status(400).json({ message: `invalid value outcome id: ${outcomeId}` }); return; }
    try {
      const { rows: [o] } = await client.query<{ tenant_id: string; institution_id: string; business_metric_id: string; unit: string }>(
        `SELECT i.tenant_id, vo.institution_id, vo.business_metric_id, bm.unit FROM value_outcomes vo
           JOIN institutions i ON i.id = vo.institution_id JOIN business_metrics bm ON bm.id = vo.business_metric_id WHERE vo.id = $1`, [outcomeId]);
      if (!o || isOtherTenant(req, o.tenant_id, { table: 'value_outcomes', id: outcomeId })) {
        res.status(404).json({ message: `value outcome ${outcomeId} not found` }); return;
      }
      tenantId = o.tenant_id; institutionId = o.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['rate', 'currency', 'per_unit', 'rate_kind', 'how_read', 'evidence_id', 'reason'], { ...ctx(), tenantId })) return;
      const b = bodyOf(req);
      const rate = typeof b.rate === 'number' ? b.rate : Number.NaN;
      if (!Number.isFinite(rate) || rate < 0) throw new Refusal(422, 'The rate is a number, zero or more.');
      const currency = str(b, 'currency');
      const perUnit = str(b, 'per_unit');
      const kind = str(b, 'rate_kind');
      const howRead = str(b, 'how_read');
      const evidenceId = str(b, 'evidence_id');
      const reason = str(b, 'reason');
      if (!/^[A-Z]{3}$/.test(currency)) throw new Refusal(422, 'The currency is a three-letter code, such as USD.');
      if (!['performance', 'exposure'].includes(kind)) throw new Refusal(422, 'Say what the rate prices: performance, or exposure.');
      if (howRead.length < MIN_REASON) throw new Refusal(422, `Say how the rate was read from its source, in at least ${MIN_REASON} characters.`);
      if (!isUuid(evidenceId)) throw new Refusal(422, 'Name the evidence the rate rests on.');
      const { rows: [head] } = await client.query<{ id: string }>(
        `SELECT r.id FROM monetization_rates r WHERE r.institution_id = $1 AND r.business_metric_id = $2
            AND NOT EXISTS (SELECT 1 FROM monetization_rates s WHERE s.supersedes_id = r.id)`, [o.institution_id, o.business_metric_id]);
      if (head && reason.length < MIN_REASON) throw new Refusal(422, `This corrects the current rate: say why, in at least ${MIN_REASON} characters.`);
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO monetization_rates (tenant_id, institution_id, business_metric_id, rate, currency, per_unit, rate_kind, how_read, evidence_id, reason, recorded_by_person_id, supersedes_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [tenantId, o.institution_id, o.business_metric_id, rate, currency, perUnit, kind, howRead, evidenceId, reason || null, req.actor!.personId, head?.id ?? null]);
      await recordAct(client, req, 'POST /api/value-outcomes/:outcomeId/monetization-rates', { act: 'record_rate', tenantId, subjectTable: 'monetization_rates', subjectId: row.id, reason: reason || howRead, evidenceIds: [evidenceId] });
      res.status(201).json({ monetization_rate_id: row.id, supersedes: head?.id ?? null });
    } catch (err) {
      if (await refuse(pool, req, res, err, ctx())) return;
      respondServerError(res, err);
    }
  });
  return router;
}

export function milestonesRouter(pool: Pool): Router {
  const router = Router();
  router.post('/:engagementId/milestones', async (req, res) => {
    const endpoint = 'POST /api/engagements/:engagementId/milestones';
    const client: PoolClient = req.dbClient!;
    const { engagementId } = req.params;
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    const ctx = () => ({ endpoint, subjectTable: 'roadmap_milestones', subjectId: null, tenantId, institutionId });
    if (!isUuid(engagementId)) { res.status(400).json({ message: `invalid engagement id: ${engagementId}` }); return; }
    try {
      const { rows: [e] } = await client.query<{ tenant_id: string; institution_id: string }>(
        'SELECT tenant_id, institution_id FROM engagements WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL', [engagementId]);
      if (!e || isOtherTenant(req, e.tenant_id, { table: 'engagements', id: engagementId })) { res.status(404).json({ message: `engagement ${engagementId} not found` }); return; }
      tenantId = e.tenant_id; institutionId = e.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['title', 'due_on', 'owner', 'value_outcome_id', 'stage'], { ...ctx(), tenantId })) return;
      const b = bodyOf(req);
      const title = str(b, 'title');
      const dueOn = str(b, 'due_on');
      const owner = str(b, 'owner');
      const outcome = str(b, 'value_outcome_id');
      const stage = str(b, 'stage');
      if (title.length < 6) throw new Refusal(422, 'Give the milestone a title of at least 6 characters.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new Refusal(422, 'Give its due date.');
      if (owner.length < 3) throw new Refusal(422, 'State its owner: a name and a role.');
      if (outcome && !isUuid(outcome)) throw new Refusal(422, 'The outcome is not one of this engagement.');
      if (stage && !['commit', 'measure', 'verify'].includes(stage)) throw new Refusal(422, "A milestone's stage is commit, measure or verify.");
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO roadmap_milestones (tenant_id, engagement_id, title, due_on, owner_stated, value_outcome_id, stage, planned_by_person_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [tenantId, engagementId, title, dueOn, owner, outcome || null, stage || null, req.actor!.personId]);
      await recordAct(client, req, 'POST /api/engagements/:engagementId/milestones', { act: 'plan', tenantId, subjectTable: 'roadmap_milestones', subjectId: row.id, reason: title });
      res.status(201).json({ roadmap_milestone_id: row.id });
    } catch (err) {
      if (await refuse(pool, req, res, err, ctx())) return;
      respondServerError(res, err);
    }
  });
  return router;
}

export function milestoneChangeRouter(pool: Pool): Router {
  const router = Router();
  router.post('/:id/supersede', async (req, res) => {
    const endpoint = 'POST /api/roadmap-milestones/:id/supersede';
    const client: PoolClient = req.dbClient!;
    const { id } = req.params;
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    const ctx = () => ({ endpoint, subjectTable: 'roadmap_milestones', subjectId: id, tenantId, institutionId });
    if (!isUuid(id)) { res.status(400).json({ message: `invalid milestone id: ${id}` }); return; }
    try {
      const { rows: [m] } = await client.query<{ tenant_id: string; institution_id: string; engagement_id: string; title: string; due_on: string;
        owner_stated: string; value_outcome_id: string | null; stage: string | null; status: string; done_evidence_id: string | null; superseded: boolean }>(
        `SELECT m.tenant_id, g.institution_id, m.engagement_id, m.title, to_char(m.due_on, 'YYYY-MM-DD') AS due_on, m.owner_stated, m.value_outcome_id,
                m.stage, m.status, m.done_evidence_id, EXISTS (SELECT 1 FROM roadmap_milestones s WHERE s.supersedes_id = m.id) AS superseded
           FROM roadmap_milestones m JOIN engagements g ON g.id = m.engagement_id WHERE m.id = $1`, [id]);
      if (!m || isOtherTenant(req, m.tenant_id, { table: 'roadmap_milestones', id })) { res.status(404).json({ message: `milestone ${id} not found` }); return; }
      tenantId = m.tenant_id; institutionId = m.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['due_on', 'status', 'owner', 'done_evidence_id', 'reason'], { ...ctx(), tenantId })) return;
      if (m.superseded) throw new Refusal(409, 'This milestone has already been changed; change its current version.');
      const b = bodyOf(req);
      const dueOn = str(b, 'due_on') || m.due_on;
      const status = str(b, 'status') || m.status;
      const owner = str(b, 'owner') || m.owner_stated;
      const done = str(b, 'done_evidence_id') || null;
      const reason = str(b, 'reason');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new Refusal(422, 'Give its due date.');
      if (owner.length < 3) throw new Refusal(422, 'State its owner: a name and a role.');
      if (!['planned', 'done', 'missed'].includes(status)) throw new Refusal(422, 'A milestone is planned, done or missed.');
      if (status === 'done' && !done) throw new Refusal(422, 'A milestone is done only with the evidence that shows it.');
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why, in at least ${MIN_REASON} characters.`);
      if (dueOn === m.due_on && status === m.status && owner === m.owner_stated && (done ?? null) === m.done_evidence_id) {
        throw new Refusal(409, 'Nothing changes: a change that changes nothing is not recorded.');
      }
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO roadmap_milestones (tenant_id, engagement_id, title, due_on, owner_stated, value_outcome_id, stage, status, done_evidence_id, reason, planned_by_person_id, supersedes_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [tenantId, m.engagement_id, m.title, dueOn, owner, m.value_outcome_id, m.stage, status, status === 'done' ? done : null, reason, req.actor!.personId, id]);
      await recordAct(client, req, 'POST /api/roadmap-milestones/:id/supersede', { act: 'plan', tenantId, subjectTable: 'roadmap_milestones', subjectId: row.id, reason });
      res.status(201).json({ roadmap_milestone_id: row.id, supersedes: id });
    } catch (err) {
      if (await refuse(pool, req, res, err, ctx())) return;
      respondServerError(res, err);
    }
  });
  return router;
}

/** The run's outcome, engagement and hash, tenant-scoped. */
async function runOf(client: PoolClient, runId: string) {
  const { rows: [r] } = await client.query<{ tenant_id: string; engagement_id: string; institution_id: string; outcome: string | null; payload_hash: string; locked: boolean }>(
    `SELECT r.tenant_id, r.engagement_id, g.institution_id, r.payload->>'valueOutcomeId' AS outcome, r.payload_hash, r.locked_at IS NOT NULL AS locked
       FROM value_runs r JOIN engagements g ON g.id = r.engagement_id WHERE r.id = $1 AND r.deleted_at IS NULL`, [runId]);
  return r;
}

async function nextVersion(client: PoolClient, outcomeId: string): Promise<number> {
  const { rows: [{ n }] } = await client.query<{ n: number }>(
    'SELECT coalesce(max(document_version), 0) + 1 AS n FROM record_documents WHERE value_outcome_id = $1', [outcomeId]);
  return n;
}

export function caseRecordsRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:runId/share-for-review', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/value-runs/:runId/share-for-review';
    const client: PoolClient = req.dbClient!;
    const { runId } = req.params;
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    const ctx = () => ({ endpoint, subjectTable: 'record_documents', subjectId: null, tenantId, institutionId });
    if (!isUuid(runId)) { res.status(400).json({ message: `invalid run id: ${runId}` }); return; }
    try {
      const r = await runOf(client, runId);
      if (!r || isOtherTenant(req, r.tenant_id, { table: 'value_runs', id: runId })) { res.status(404).json({ message: `run ${runId} not found` }); return; }
      tenantId = r.tenant_id; institutionId = r.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['shared_with', 'lens'], { ...ctx(), tenantId })) return;
      const b = bodyOf(req);
      const sharedWith = str(b, 'shared_with');
      const lens = str(b, 'lens') || 'general';
      if (sharedWith.length < 3) throw new Refusal(422, 'Say with whom it is shared: the person and their organisation.');
      if (!['cfo', 'general'].includes(lens)) throw new Refusal(422, 'A lens is the CFO lens or general.');
      if (!r.outcome) throw new Refusal(409, 'This run names no outcome, so it cannot be shared as a value case.');
      if (!r.locked) throw new Refusal(409, 'Only a locked run is shared for review; lock it first.');
      const version = await nextVersion(client, r.outcome);
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, value_run_id, document_version, disclosure, content_hash, payload,
                                       rendered_by_person_id, kind, lens, shared_with)
         VALUES ($1, $2, $3, $4, $5, 'shared_for_review', $6, $7, $8, 'share_for_review', $9, $10) RETURNING id`,
        [tenantId, r.engagement_id, r.outcome, runId, version, r.payload_hash, { run: runId, payload_hash: r.payload_hash, lens, shared_with: sharedWith },
         req.actor!.personId, lens, sharedWith]);
      await recordAct(client, req, 'POST /api/value-runs/:runId/share-for-review', { act: 'share', tenantId, subjectTable: 'record_documents', subjectId: row.id, reason: `Shared for review as an outside-in hypothesis with ${sharedWith}.` });
      res.status(201).json({ record_document_id: row.id, document_version: version, payload_hash: r.payload_hash });
    } catch (err) {
      if (await refuse(pool, req, res, err, ctx())) return;
      respondServerError(res, err);
    }
  });

  router.post('/:runId/print-request', async (req, res) => {
    const endpoint = 'POST /api/value-runs/:runId/print-request';
    const client: PoolClient = req.dbClient!;
    const { runId } = req.params;
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    const ctx = () => ({ endpoint, subjectTable: 'record_documents', subjectId: null, tenantId, institutionId });
    if (!isUuid(runId)) { res.status(400).json({ message: `invalid run id: ${runId}` }); return; }
    try {
      const r = await runOf(client, runId);
      if (!r || isOtherTenant(req, r.tenant_id, { table: 'value_runs', id: runId })) { res.status(404).json({ message: `run ${runId} not found` }); return; }
      tenantId = r.tenant_id; institutionId = r.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['lens'], { ...ctx(), tenantId })) return;
      const lens = str(bodyOf(req), 'lens') || 'general';
      if (!['cfo', 'general'].includes(lens)) throw new Refusal(422, 'A lens is the CFO lens or general.');
      if (!r.outcome) throw new Refusal(409, 'This run names no outcome, so it has no value case to print.');
      const version = await nextVersion(client, r.outcome);
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, value_run_id, document_version, disclosure, content_hash, payload,
                                       rendered_by_person_id, kind, lens)
         VALUES ($1, $2, $3, $4, $5, 'internal', $6, $7, $8, 'print_request', $9) RETURNING id`,
        [tenantId, r.engagement_id, r.outcome, runId, version, r.payload_hash, { run: runId, payload_hash: r.payload_hash, lens }, req.actor!.personId, lens]);
      res.status(201).json({ record_document_id: row.id, document_version: version, payload_hash: r.payload_hash });
    } catch (err) {
      if (await refuse(pool, req, res, err, ctx())) return;
      respondServerError(res, err);
    }
  });
  return router;
}
