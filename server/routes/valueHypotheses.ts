import { Router, type Request, type Response } from 'express';
import { recordAct } from '../lib/governanceAct.js';
import type { Pool, PoolClient } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { requireSteward } from '../lib/stewardActs.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * O2 (Outputs band, LVRF_PLAN §5; decisions O2-D1–D4) — value hypotheses,
 * executive summaries, reference-example markers, and the account POV.
 *
 *   POST /api/institutions/:institutionId/hypotheses          state one (authorized)
 *   POST /api/value-hypotheses/:id/supersede                  a new version (authorized)
 *   POST /api/value-hypotheses/:id/withdraw                   (authorized)
 *   POST /api/institutions/:institutionId/executive-summaries (authorized)
 *   POST /api/institutions/:institutionId/reference-example   mark (steward)
 *   POST /api/reference-examples/:id/supersede                correct (steward)
 *   POST /api/reference-examples/:id/retire                   unmark (steward)
 *   GET  /api/institutions/:institutionId/pov                 the POV, assembled
 *
 * NOBODY DECIDES A HYPOTHESIS (O2-D1). There is no decide route and no
 * stored status: lvrf_hypothesis_verdict() computes it from the falsifier
 * and the outcome's VERIFIED actual. The falsifier's reference value is
 * copied by the database, its direction is the pack entry's, and post hoc
 * is computed at INSERT — a request that tries to set any of them is
 * refused 400 and recorded (source 'route'), with the reason.
 */

class ValidationError extends Error {
  constructor(public readonly issues: string[]) { super(issues.join('; ')); }
}
/** A 409 the route decides before any write: answered and recorded like a 422. */
class ConflictRefusal extends Error {}
/**
 * An id in the body that is not this account's or tenant's — unknown, or
 * another tenant's. Answered like any 422 but NOT recorded: sign-in P3
 * answers another tenant's id exactly as an unknown one, with nothing
 * written and nothing recorded (verify_tenant_scope), as a 404 is.
 */
class UnknownIdError extends ValidationError {}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MIN_REASON = 12;
const NO_NUMBERS = 'numbers belong in recorded values, not falsifier conditions';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isId = (v: unknown): v is string => typeof v === 'string' && isUuid(v);

/** Why a hypothesis request cannot set a field (O2-D1, D3, D4). */
const hypothesisFieldExplained = (k: string): string | null => {
  if (/direction|better/i.test(k)) return `body.${k}: the direction (lower or higher is better) comes only from the pack entry; a hypothesis cannot set it (O2-D4)`;
  if (/status|verdict|decision|decided|outcome_status|survived|refuted|confirmed/i.test(k)) return `body.${k}: the verdict is computed from the falsifier and the verified actual (O2-D1); nobody sets it`;
  if (/post_hoc/i.test(k)) return `body.${k}: post hoc is computed by the database (O2-D3)`;
  if (/reference_value|reference_recorded|baseline|target/i.test(k)) return `body.${k}: the reference value is quoted from the outcome row by the database; ${NO_NUMBERS}`;
  if (/author/i.test(k)) return `body.${k}: the author is the signed-in person`;
  return null;
};
const summaryFieldExplained = (k: string): string | null =>
  /author/i.test(k) ? `body.${k}: the author is the signed-in person; a summary is attributed to who wrote it` : null;

function falsifierFields(body: Record<string, unknown>, issues: string[]) {
  const reference = body['falsifier_reference'];
  if (reference !== 'baseline' && reference !== 'committed_target') issues.push('body.falsifier_reference must be baseline or committed_target');
  const due = body['falsifier_due'];
  if (typeof due !== 'string' || !DATE_RE.test(due) || Number.isNaN(Date.parse(`${due}T00:00:00Z`))) issues.push('body.falsifier_due must be a date (YYYY-MM-DD)');
  const conditions = body['falsifier_conditions'] ?? '';
  if (typeof conditions !== 'string') issues.push('body.falsifier_conditions must be text');
  else if (/[0-9]/.test(conditions)) issues.push(`body.falsifier_conditions: ${NO_NUMBERS}`);
  const statement = body['statement'];
  if (typeof statement !== 'string' || statement.trim().length < 24) issues.push('body.statement must state the hypothesis, in at least 24 characters');
  return {
    reference: reference as 'baseline' | 'committed_target',
    due: due as string,
    conditions: typeof conditions === 'string' ? conditions.trim() : '',
    statement: typeof statement === 'string' ? statement.trim() : '',
  };
}

function reasonOf(body: Record<string, unknown>, key: string, what: string, issues: string[]): string {
  const v = body[key];
  if (typeof v !== 'string' || v.trim().length < MIN_REASON) {
    issues.push(`body.${key} must state why ${what}, in at least ${MIN_REASON} characters`);
    return '';
  }
  return v.trim();
}

async function answerError(pool: Pool, err: unknown, req: Request, res: Response, endpoint: string, subjectTable: string,
  subjectId: string | null, tenantId: string | null, institutionId: string | null): Promise<void> {
  // Q4l: an early refusal is recorded (source 'route') once the tenant is
  // known, so a refused attempt is never invisible on the box. Before that
  // (a malformed id, an unknown or another tenant's subject) there is no
  // tenant to file it under, and the answer alone stands.
  if (err instanceof ValidationError || err instanceof ConflictRefusal) {
    const message = err instanceof ValidationError ? `${err.issues.length} issue(s) found; nothing was written.` : err.message;
    if (tenantId && !(err instanceof UnknownIdError)) {
      await recordRouteRefusal(pool, req, { endpoint, subjectTable, subjectId, tenantId, institutionId, attemptedPayload: req.body },
        err instanceof ValidationError ? `${message} ${err.issues.join('; ')}` : message);
    }
    if (err instanceof ValidationError) res.status(422).json({ message, issues: err.issues });
    else res.status(409).json({ message });
    return;
  }
  if (await handleGovernanceError(pool, err, req, res, {
    endpoint, subjectTable, subjectId, tenantId, institutionId, attemptedPayload: req.body,
  })) return;
  respondServerError(res, err);
}

async function currentInstitution(client: Pool | PoolClient, req: Request, institutionId: string) {
  const { rows: [inst] } = await client.query<{ id: string; tenant_id: string; name: string }>(
    'SELECT id, tenant_id, name FROM institutions WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL',
    [institutionId],
  );
  if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) return null;
  return inst;
}

const actorOf = (req: Request): string => {
  const id = req.actor?.personId;
  if (!id) throw new Error('req.actor missing on a request past requireActor');
  return id;
};

/* ------------------------------------------------------------------ */
/* /api/institutions/:institutionId/...                               */
/* ------------------------------------------------------------------ */

export function hypothesisInstitutionRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:institutionId/hypotheses', async (req, res) => {
    const endpoint = 'POST /api/institutions/:institutionId/hypotheses';
    const client = req.dbClient!;
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    let tenantId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const inst = await currentInstitution(client, req, institutionId);
      if (!inst) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      tenantId = inst.tenant_id;
      if (await refuseUnknownFields(pool, req, res,
        ['value_outcome_id', 'value_lever_id', 'statement', 'falsifier_reference', 'falsifier_due', 'falsifier_conditions'],
        { endpoint, subjectTable: 'value_hypotheses', subjectId: null, tenantId, institutionId }, hypothesisFieldExplained)) return;
      const body = req.body;
      const issues: string[] = [];
      for (const k of ['value_outcome_id', 'value_lever_id']) if (!isId(body[k])) issues.push(k === 'value_lever_id' ? 'body.value_lever_id: choose a lever (the pack entry needs one first)' : 'body.value_outcome_id: choose an outcome');
      const f = falsifierFields(body, issues);
      if (issues.length > 0) throw new ValidationError(issues);
      // Ids in the body, answered as unknown whether they are missing or
      // another tenant's / another account's (sign-in P3), before any write.
      const { rows: [o] } = await client.query(
        `SELECT 1 FROM value_outcomes WHERE id = $1 AND institution_id = $2 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [body.value_outcome_id, institutionId],
      );
      if (!o) throw new UnknownIdError(['body.value_outcome_id: that outcome is not a current outcome of this account']);
      const { rows: [l] } = await client.query(
        `SELECT 1 FROM value_levers WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [body.value_lever_id, tenantId],
      );
      if (!l) throw new UnknownIdError(['body.value_lever_id: that lever is not current (withdrawn, superseded or unknown)']);
      // The chain, the author, the reference value and post hoc are the
      // database's to check and compute (value_hypotheses_guard).
      const { rows: [h] } = await client.query<{ id: string; reference_value: string; post_hoc: boolean; verdict: string }>(
        `INSERT INTO value_hypotheses (tenant_id, institution_id, value_outcome_id, value_lever_id, statement,
                                       falsifier_reference, falsifier_due, falsifier_conditions, author_person_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, reference_value::text, post_hoc, lvrf_hypothesis_verdict(value_hypotheses.*) AS verdict`,
        [tenantId, institutionId, body.value_outcome_id, body.value_lever_id, f.statement, f.reference, f.due, f.conditions, actor],
      );
      res.status(201).json({ value_hypothesis_id: h.id, reference_value: h.reference_value, post_hoc: h.post_hoc, verdict: h.verdict });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'value_hypotheses', null, tenantId, institutionId);
    }
  });

  router.post('/:institutionId/executive-summaries', async (req, res) => {
    const endpoint = 'POST /api/institutions/:institutionId/executive-summaries';
    const client = req.dbClient!;
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    let tenantId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const inst = await currentInstitution(client, req, institutionId);
      if (!inst) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      tenantId = inst.tenant_id;
      if (await refuseUnknownFields(pool, req, res,
        ['lens', 'body', 'drafted_with_ai', 'drafting_tool', 'value_run_id', 'supersedes_id'],
        { endpoint, subjectTable: 'executive_summaries', subjectId: null, tenantId, institutionId }, summaryFieldExplained)) return;
      const b = req.body as Record<string, unknown>;
      const issues: string[] = [];
      const lens = typeof b.lens === 'string' ? b.lens : '';
      const text = typeof b.body === 'string' ? b.body.trim() : '';
      if (!['cfo', 'chro', 'board', 'general'].includes(lens)) issues.push('body.lens must be cfo, chro, board or general');
      if (text.length < 40) issues.push('body.body must be the summary, in at least 40 characters');
      if (typeof b.drafted_with_ai !== 'boolean') issues.push('body.drafted_with_ai must be true or false: an AI-drafted summary says so (O-D6)');
      const tool = typeof b.drafting_tool === 'string' && b.drafting_tool.trim() !== '' ? b.drafting_tool.trim() : null;
      if (b.drafted_with_ai === true && !tool) issues.push('body.drafting_tool must name the tool that drafted it');
      if (b.drafted_with_ai === false && tool) issues.push('body.drafting_tool is only for a summary drafted with AI');
      if (b.value_run_id !== undefined && b.value_run_id !== null && !isId(b.value_run_id)) issues.push('body.value_run_id must be an id');
      if (b.supersedes_id !== undefined && b.supersedes_id !== null && !isId(b.supersedes_id)) issues.push('body.supersedes_id must be an id');
      if (issues.length > 0) throw new ValidationError(issues);
      if (isId(b.value_run_id)) {
        const { rows: [run] } = await client.query(
          `SELECT 1 FROM value_runs r JOIN engagements e ON e.id = r.engagement_id WHERE r.id = $1 AND e.institution_id = $2`,
          [b.value_run_id, institutionId],
        );
        if (!run) throw new UnknownIdError(['body.value_run_id: that run is not a run of this account']);
      }
      // One current summary per account and lens: a new one supersedes it, by name.
      // Two new versions for the same account and lens serialize on a
      // transaction-scoped advisory lock (OWN-1): SELECT … FOR UPDATE needs
      // UPDATE privilege, and lvrf_app has none on this append-only table.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('executive_summaries:' || $1 || ':' || $2))`, [institutionId, lens]);
      const { rows: [current] } = await client.query<{ id: string }>(
        `SELECT s.id FROM executive_summaries s
          WHERE s.institution_id = $1 AND s.lens = $2
            AND NOT EXISTS (SELECT 1 FROM executive_summaries n WHERE n.supersedes_id = s.id)`,
        [institutionId, lens],
      );
      const supersedes = isId(b.supersedes_id) ? b.supersedes_id : null;
      // A wrong supersedes_id is an id that is not this account's (P3: not recorded).
      if (current && supersedes && supersedes !== current.id) {
        throw new UnknownIdError([`body.supersedes_id: that summary is not this account's current ${lens} summary`]);
      }
      if (current && !supersedes) {
        throw new ConflictRefusal(`This account already has a current ${lens} summary; a new version names it in supersedes_id.`);
      }
      if (!current && supersedes) {
        throw new UnknownIdError([`body.supersedes_id: that summary is not this account's current ${lens} summary`]);
      }
      const { rows: [s] } = await client.query<{ id: string }>(
        `INSERT INTO executive_summaries (tenant_id, institution_id, value_run_id, lens, body, author_person_id, drafted_with_ai, drafting_tool, supersedes_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tenantId, institutionId, isId(b.value_run_id) ? b.value_run_id : null, lens, text, actor, b.drafted_with_ai, tool, supersedes],
      );
      res.status(201).json({ executive_summary_id: s.id });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'executive_summaries', null, tenantId, institutionId);
    }
  });

  router.post('/:institutionId/reference-example', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/institutions/:institutionId/reference-example';
    const client = req.dbClient!;
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    let tenantId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const inst = await currentInstitution(client, req, institutionId);
      if (!inst) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      tenantId = inst.tenant_id;
      if (await refuseUnknownFields(pool, req, res, ['kind', 'source_citation', 'note'],
        { endpoint, subjectTable: 'reference_example_markers', subjectId: null, tenantId, institutionId })) return;
      const m = markerFields(req.body);
      const { rows: [cur] } = await client.query<{ id: string }>(
        'SELECT id FROM reference_example_markers WHERE institution_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL',
        [institutionId],
      );
      if (cur) {
        throw new ConflictRefusal(`"${inst.name}" is already marked a reference example; correct the marker instead.`);
      }
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO reference_example_markers (tenant_id, institution_id, kind, source_citation, note, marked_by_person_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tenantId, institutionId, m.kind, m.sourceCitation, m.note, actor],
      );
      await recordAct(client, req, 'POST /api/institutions/:institutionId/reference-example', {
        act: 'mark', tenantId: inst.tenant_id, subjectTable: 'reference_example_markers', subjectId: row.id, reason: m.note,
      });
      res.status(201).json({ reference_example_marker_id: row.id });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'reference_example_markers', null, tenantId, institutionId);
    }
  });

  router.get('/:institutionId/pov', async (req, res) => {
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    try {
      const pov = await assemblePov(pool, req, institutionId);
      if (!pov) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      res.json(pov);
    } catch (err) {
      respondServerError(res, err);
    }
  });

  return router;
}

function markerFields(body: Record<string, unknown>) {
  const issues: string[] = [];
  if (!['published_case_study', 'demonstration', 'outside_in_test'].includes(body.kind as string)) {
    issues.push('body.kind: choose what kind of example this is: a published case study, a demonstration, or an outside-in test');
  }
  if (typeof body.source_citation !== 'string' || body.source_citation.trim().length < 12) issues.push('body.source_citation must name where the example comes from, in at least 12 characters');
  if (typeof body.note !== 'string' || body.note.trim().length < 12) issues.push('body.note must say what the example is for, in at least 12 characters');
  if (issues.length > 0) throw new ValidationError(issues);
  return { kind: body.kind as string, sourceCitation: (body.source_citation as string).trim(), note: (body.note as string).trim() };
}

/* ------------------------------------------------------------------ */
/* /api/value-hypotheses/:id/...                                      */
/* ------------------------------------------------------------------ */

type HypothesisRow = { id: string; tenant_id: string; institution_id: string; value_outcome_id: string; value_lever_id: string;
  deleted_at: string | null; superseded_by_id: string | null; verdict: string };

async function lockHypothesis(client: PoolClient, req: Request, id: string): Promise<HypothesisRow | null> {
  const { rows: [h] } = await client.query<HypothesisRow>(
    `SELECT h.id, h.tenant_id, h.institution_id, h.value_outcome_id, h.value_lever_id, h.deleted_at, h.superseded_by_id,
            lvrf_hypothesis_verdict(h) AS verdict
       FROM value_hypotheses h WHERE h.id = $1 FOR UPDATE OF h`, [id],
  );
  if (!h || isOtherTenant(req, h.tenant_id, { table: 'value_hypotheses', id })) return null;
  return h;
}

export function valueHypothesisRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:id/supersede', async (req, res) => {
    const endpoint = 'POST /api/value-hypotheses/:id/supersede';
    const client = req.dbClient!;
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ message: `invalid value hypothesis id: ${id}` });
      return;
    }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const h = await lockHypothesis(client, req, id);
      if (!h) {
        res.status(404).json({ message: `value hypothesis ${id} not found` });
        return;
      }
      tenantId = h.tenant_id; institutionId = h.institution_id;
      if (await refuseUnknownFields(pool, req, res,
        ['statement', 'falsifier_reference', 'falsifier_due', 'falsifier_conditions', 'supersession_reason'],
        { endpoint, subjectTable: 'value_hypotheses', subjectId: id, tenantId, institutionId }, hypothesisFieldExplained)) return;
      if (h.deleted_at !== null || h.superseded_by_id !== null) {
        throw new ConflictRefusal('This hypothesis is not current (withdrawn or superseded).');
      }
      if (h.verdict !== 'open') {
        throw new ConflictRefusal(`This hypothesis's verdict is in (${h.verdict}); a tested hypothesis is not superseded.`);
      }
      const issues: string[] = [];
      const f = falsifierFields(req.body, issues);
      const reason = reasonOf(req.body, 'supersession_reason', 'the hypothesis is being restated', issues);
      if (issues.length > 0) throw new ValidationError(issues);
      const { rows: [n] } = await client.query<{ id: string }>(
        `INSERT INTO value_hypotheses (tenant_id, institution_id, value_outcome_id, value_lever_id, statement,
                                       falsifier_reference, falsifier_due, falsifier_conditions, author_person_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [h.tenant_id, h.institution_id, h.value_outcome_id, h.value_lever_id, f.statement, f.reference, f.due, f.conditions, actor],
      );
      await client.query(
        `UPDATE value_hypotheses SET superseded_by_id = $2, supersession_reason = $3, status = 'superseded' WHERE id = $1`,
        [id, n.id, reason],
      );
      await recordAct(client, req, 'POST /api/value-hypotheses/:id/supersede', {
        act: 'supersede', tenantId: h.tenant_id, subjectTable: 'value_hypotheses', subjectId: id, resultTable: 'value_hypotheses', resultId: n.id, reason,
      });
      res.status(201).json({ value_hypothesis_id: n.id, supersedes: id });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'value_hypotheses', id, tenantId, institutionId);
    }
  });

  router.post('/:id/withdraw', async (req, res) => {
    const endpoint = 'POST /api/value-hypotheses/:id/withdraw';
    const client = req.dbClient!;
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ message: `invalid value hypothesis id: ${id}` });
      return;
    }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const h = await lockHypothesis(client, req, id);
      if (!h) {
        res.status(404).json({ message: `value hypothesis ${id} not found` });
        return;
      }
      tenantId = h.tenant_id; institutionId = h.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['retirement_reason'],
        { endpoint, subjectTable: 'value_hypotheses', subjectId: id, tenantId, institutionId }, hypothesisFieldExplained)) return;
      if (h.deleted_at !== null || h.superseded_by_id !== null) {
        throw new ConflictRefusal('This hypothesis is not current (withdrawn or superseded).');
      }
      if (h.verdict !== 'open') {
        throw new ConflictRefusal(`This hypothesis's verdict is in (${h.verdict}); a tested hypothesis is not withdrawn.`);
      }
      const issues: string[] = [];
      const reason = reasonOf(req.body, 'retirement_reason', 'the hypothesis is withdrawn', issues);
      if (issues.length > 0) throw new ValidationError(issues);
      await client.query(
        `UPDATE value_hypotheses SET deleted_at = now(), status = 'retired', retired_by_person_id = $2, retirement_reason = $3 WHERE id = $1`,
        [id, actor, reason],
      );
      await recordAct(client, req, 'POST /api/value-hypotheses/:id/withdraw', { act: 'withdraw', tenantId: h.tenant_id, subjectTable: 'value_hypotheses', subjectId: id, reason });
      res.status(200).json({ value_hypothesis_id: id, verdict: 'withdrawn' });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'value_hypotheses', id, tenantId, institutionId);
    }
  });

  return router;
}

/* ------------------------------------------------------------------ */
/* /api/reference-examples/:id/... (steward)                          */
/* ------------------------------------------------------------------ */

export function referenceExampleRouter(pool: Pool): Router {
  const router = Router();

  async function lockMarker(client: PoolClient, req: Request, id: string) {
    const { rows: [m] } = await client.query<{ id: string; tenant_id: string; institution_id: string; deleted_at: string | null; superseded_by_id: string | null }>(
      'SELECT id, tenant_id, institution_id, deleted_at, superseded_by_id FROM reference_example_markers WHERE id = $1 FOR UPDATE', [id],
    );
    if (!m || isOtherTenant(req, m.tenant_id, { table: 'reference_example_markers', id })) return null;
    return m;
  }

  router.post('/:id/supersede', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/reference-examples/:id/supersede';
    const client = req.dbClient!;
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ message: `invalid reference example marker id: ${id}` });
      return;
    }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const m = await lockMarker(client, req, id);
      if (!m) {
        res.status(404).json({ message: `reference example marker ${id} not found` });
        return;
      }
      tenantId = m.tenant_id; institutionId = m.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['kind', 'source_citation', 'note', 'supersession_reason'],
        { endpoint, subjectTable: 'reference_example_markers', subjectId: id, tenantId, institutionId })) return;
      if (m.deleted_at !== null || m.superseded_by_id !== null) {
        throw new ConflictRefusal('This marker is not current (unmarked or superseded).');
      }
      const f = markerFields(req.body);
      const issues: string[] = [];
      const reason = reasonOf(req.body, 'supersession_reason', 'the marker is corrected', issues);
      if (issues.length > 0) throw new ValidationError(issues);
      const { rows: [n] } = await client.query<{ id: string }>(
        `INSERT INTO reference_example_markers (tenant_id, institution_id, kind, source_citation, note, marked_by_person_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [m.tenant_id, m.institution_id, f.kind, f.sourceCitation, f.note, actor],
      );
      await client.query(
        `UPDATE reference_example_markers SET superseded_by_id = $2, supersession_reason = $3, status = 'superseded' WHERE id = $1`,
        [id, n.id, reason],
      );
      await recordAct(client, req, 'POST /api/reference-examples/:id/supersede', {
        act: 'supersede', tenantId: m.tenant_id, subjectTable: 'reference_example_markers', subjectId: id, resultTable: 'reference_example_markers', resultId: n.id, reason,
      });
      res.status(201).json({ reference_example_marker_id: n.id, supersedes: id });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'reference_example_markers', id, tenantId, institutionId);
    }
  });

  router.post('/:id/retire', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/reference-examples/:id/retire';
    const client = req.dbClient!;
    const id = req.params.id;
    if (!isUuid(id)) {
      res.status(400).json({ message: `invalid reference example marker id: ${id}` });
      return;
    }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = actorOf(req);
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const m = await lockMarker(client, req, id);
      if (!m) {
        res.status(404).json({ message: `reference example marker ${id} not found` });
        return;
      }
      tenantId = m.tenant_id; institutionId = m.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['retirement_reason'],
        { endpoint, subjectTable: 'reference_example_markers', subjectId: id, tenantId, institutionId })) return;
      if (m.deleted_at !== null || m.superseded_by_id !== null) {
        throw new ConflictRefusal('This marker is not current (unmarked or superseded).');
      }
      const issues: string[] = [];
      const reason = reasonOf(req.body, 'retirement_reason', 'the account is no longer a reference example', issues);
      if (issues.length > 0) throw new ValidationError(issues);
      await client.query(
        `UPDATE reference_example_markers SET deleted_at = now(), status = 'retired', retired_by_person_id = $2, retirement_reason = $3 WHERE id = $1`,
        [id, actor, reason],
      );
      await recordAct(client, req, 'POST /api/reference-examples/:id/retire', { act: 'withdraw', tenantId: m.tenant_id, subjectTable: 'reference_example_markers', subjectId: id, reason });
      res.status(200).json({ reference_example_marker_id: id, retired: true });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'reference_example_markers', id, tenantId, institutionId);
    }
  });

  return router;
}

/* ------------------------------------------------------------------ */
/* The POV, assembled (one read; every derived flag computed here)     */
/* ------------------------------------------------------------------ */

/** A recorded numeric as it was recorded, without trailing zeros: "1.4000" -> "1.4", "0.0000" -> "0". */
export function recorded(v: string | null): string | null {
  if (v === null) return null;
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
}

/**
 * The falsifier as one sentence (O-D4, O2-D4). Every number in it is quoted
 * from a row: the reference value and its date from the hypothesis (copied
 * from the outcome by the database), the due date, the unit; the direction
 * phrase from the PACK ENTRY's direction. The author's words are only the
 * digit-free conditions.
 */
export function falsifierSentence(h: {
  metric_name: string; unit: string | null; direction: 'increase' | 'decrease'; falsifier_reference: string;
  reference_value: string; reference_recorded_on: string; falsifier_due: string; falsifier_conditions: string;
}): string {
  // UX-1 slice 3: ONE sentence, "… by <date>, provided that: <conditions>."
  // The unit and the conditions are stored as typed; trailing punctuation is
  // dropped when composing, so the sentence ends with exactly one period.
  // Composed at render time, never sealed in a run: no record hash changes.
  // previewFalsifier (client/src/components/PovAuthoring.tsx) is the same
  // template; verify_value_hypotheses.sh checks the two are identical.
  const phrase = h.direction === 'decrease' ? 'at or above' : 'at or below';
  const value = `${recorded(h.reference_value)}${h.unit ? ` ${trimEnd(h.unit)}` : ''}`;
  const ref = h.falsifier_reference === 'baseline'
    ? `its baseline of ${value} (recorded ${dayOf(h.reference_recorded_on)})`
    : `its committed target of ${value} (committed ${dayOf(h.reference_recorded_on)})`;
  const conditions = trimEnd(h.falsifier_conditions ?? '');
  return `${h.metric_name} ${phrase} ${ref} by ${dayOf(h.falsifier_due)}${conditions ? `, provided that: ${conditions}` : ''}.`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2025-09-30" -> "30 Sep 2025" (the record's dates, read as UTC). */
function dayOf(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const trimEnd = (s: string) => s.trim().replace(/[\s.;,:]+$/, '');

const STRONG = new Set(['system_of_record', 'client_stated']);

async function assemblePov(pool: Pool, req: Request, institutionId: string) {
  const { rows: [inst] } = await pool.query<{ id: string; tenant_id: string; name: string; industry_name: string | null; industry_slug: string | null }>(
    `SELECT i.id, i.tenant_id, i.name, ind.name AS industry_name, ind.slug AS industry_slug
       FROM institutions i LEFT JOIN industries ind ON ind.id = i.industry_id
      WHERE i.id = $1 AND i.deleted_at IS NULL`, [institutionId],
  );
  if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) return null;
  const q = <T extends object>(sql: string) => pool.query<T>(sql, [institutionId]).then((r) => r.rows);

  const [markers, entityRows, facts, engagements, outcomes, evidence, hypotheses, summaries, levers] = await Promise.all([
    q<Record<string, unknown>>(`
      SELECT m.id, m.kind, m.source_citation, m.note, mb.full_name AS marked_by, m.created_at AS marked_at,
             (m.deleted_at IS NULL AND m.superseded_by_id IS NULL) AS current,
             m.deleted_at AS unmarked_at, rb.full_name AS unmarked_by, m.retirement_reason AS unmark_reason,
             m.superseded_by_id, m.supersession_reason
        FROM reference_example_markers m JOIN persons mb ON mb.id = m.marked_by_person_id
        LEFT JOIN persons rb ON rb.id = m.retired_by_person_id
       WHERE m.institution_id = $1 ORDER BY m.created_at DESC, m.id`),
    q<Record<string, unknown>>(`
      SELECT ie.legal_name, ie.identifier_type::text, ie.identifier, ie.registry_jurisdiction, lvrf_evidence_basis(e) AS basis
        FROM institution_entities ie JOIN evidence e ON e.id = ie.evidence_id
       WHERE ie.institution_id = $1 AND ie.deleted_at IS NULL AND ie.superseded_by_id IS NULL`),
    q<{ basis: string | null } & Record<string, unknown>>(`
      SELECT f.id, f.kind::text, f.value_numeric::text, f.value_text, f.unit, to_char(f.as_of, 'YYYY-MM-DD') AS as_of,
             e.kind::text AS evidence_kind, e.provenance, e.source_verified, e.citation_resolved,
             rp.full_name AS citation_resolved_by, lvrf_evidence_basis(e) AS basis,
             -- P1 (0039): what the evidence rests on, and the fact's latest figure check.
             e.evidence_form::text, e.quote_text, e.locator, e.how_read,
             (SELECT jsonb_build_object('result', c.result, 'detail', c.detail, 'rules_version', c.rules_version)
                FROM figure_checks c WHERE c.subject_table = 'institution_facts' AND c.subject_id = f.id
               ORDER BY c.checked_at DESC, c.id DESC LIMIT 1) AS figure_check
        FROM institution_facts f JOIN evidence e ON e.id = f.evidence_id
        LEFT JOIN persons rp ON rp.id = e.citation_resolved_by_person_id
       WHERE f.institution_id = $1 AND f.deleted_at IS NULL AND f.superseded_by_id IS NULL
       ORDER BY f.kind, f.as_of DESC`),
    q<Record<string, unknown>>(`
      -- The stage reached: the furthest of the engagement's own value_stage
      -- and its current outcomes' (the outcome routes advance the outcome,
      -- not the engagement). The enum is ordered as the spine, so max and
      -- GREATEST follow it.
      SELECT e.id, e.name,
             GREATEST(e.value_stage, (SELECT max(vo.value_stage) FROM value_outcomes vo
                                        WHERE vo.engagement_id = e.id AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL))::text AS value_stage,
             e.value_stage::text AS engagement_stage, (e.deleted_at IS NOT NULL) AS retired,
             -- The one earlier stage the record can confirm: a named committer.
             EXISTS (SELECT 1 FROM value_outcomes vo WHERE vo.engagement_id = e.id AND vo.deleted_at IS NULL
                        AND vo.superseded_by_id IS NULL AND vo.committed_by_person_id IS NOT NULL) AS committed,
             (SELECT json_build_object('id', r.id, 'run_number', r.run_number, 'confidence_score', r.confidence_score,
                                       'confidence_band', r.confidence_band, 'locked_at', r.locked_at, 'payload_hash', r.payload_hash)
                FROM value_runs r WHERE r.engagement_id = e.id AND r.locked_at IS NOT NULL AND r.deleted_at IS NULL
               ORDER BY r.run_number DESC LIMIT 1) AS latest_locked_run,
             -- Q4m: EVERY locked run, oldest first. The POV lists them all: a locked
             -- run is part of the record, and retiring an engagement keeps its runs.
             (SELECT coalesce(json_agg(json_build_object('id', r.id, 'run_number', r.run_number, 'confidence_score', r.confidence_score,
                                       'confidence_band', r.confidence_band, 'locked_at', r.locked_at, 'payload_hash', r.payload_hash)
                                       ORDER BY r.run_number), '[]')
                FROM value_runs r WHERE r.engagement_id = e.id AND r.locked_at IS NOT NULL AND r.deleted_at IS NULL) AS locked_runs
        FROM engagements e WHERE e.institution_id = $1 AND e.superseded_by_id IS NULL
       ORDER BY e.deleted_at IS NOT NULL, e.created_at`),
    q<{ id: string; source_verified: boolean } & Record<string, unknown>>(`
      SELECT vo.id, vo.engagement_id, bm.name AS metric_name, bm.unit, c.name AS capability_name,
             -- C2c: how many locked runs sealed this outcome (a correction or withdrawal changes none of them).
             (SELECT count(*)::int FROM value_runs r WHERE r.locked_at IS NOT NULL AND r.deleted_at IS NULL AND r.payload->>'valueOutcomeId' = vo.id::text) AS sealed_run_count,
             (SELECT coalesce(json_agg(json_build_object('offering_key', o.offering_key, 'name', o.name) ORDER BY o.name), '[]')
                FROM offering_capabilities oc JOIN offerings o ON o.id = oc.offering_id WHERE oc.capability_id = c.id) AS offerings,
             vo.baseline_value::text, to_char(vo.baseline_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS baseline_measured_on,
             vo.target_value::text, cp.full_name AS committed_by, to_char(vo.committed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS committed_on,
             vo.actual_value::text, to_char(vo.actual_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS actual_measured_on,
             vp.full_name AS verified_by, vo.source_verified, vo.realization::text, bm.industry_measure_id,
             -- Q4m: an outcome of a retired engagement is frozen; the POV says so
             -- rather than ask the gap register, which refuses it.
             EXISTS (SELECT 1 FROM engagements eg WHERE eg.id = vo.engagement_id
                        AND (eg.deleted_at IS NOT NULL OR eg.superseded_by_id IS NOT NULL)) AS engagement_retired,
             CASE WHEN m.id IS NULL THEN NULL ELSE json_build_object('id', m.id, 'name', m.name, 'direction', m.direction,
                  'unit', m.unit, 'confounders', m.confounders) END AS pack_entry
        FROM value_outcomes vo
        JOIN business_metrics bm ON bm.id = vo.business_metric_id
        JOIN capabilities c ON c.id = vo.capability_id
        LEFT JOIN industry_measures m ON m.id = bm.industry_measure_id
        LEFT JOIN persons cp ON cp.id = vo.committed_by_person_id
        LEFT JOIN persons vp ON vp.id = vo.verified_by_person_id
       WHERE vo.institution_id = $1 AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL
       ORDER BY vo.created_at`),
    q<{ value_outcome_id: string; basis: string | null } & Record<string, unknown>>(`
      SELECT voe.value_outcome_id, voe.evidence_id, voe.supports, e.kind::text, e.summary, e.provenance, lvrf_evidence_basis(e) AS basis,
             -- C1: a link that corrects what an earlier one supported, with who and why.
             voe.corrects_supports, (SELECT full_name FROM persons WHERE id = voe.corrected_by_person_id) AS corrected_by, voe.correction_reason,
             -- C2b: when — the withdrawal of the link it corrects, made in the same act (C1-D1); a link keeps no date of its own.
             (SELECT to_char(p.withdrawn_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') FROM value_outcome_evidence p
               WHERE p.value_outcome_id = voe.value_outcome_id AND p.evidence_id = voe.evidence_id AND p.supports = voe.corrects_supports
                 AND p.withdrawn_at IS NOT NULL) AS corrected_on,
             -- P1 (0039): what it rests on, and its latest figure check against this outcome.
             e.evidence_form::text, e.quote_text, e.locator, e.how_read,
             -- A statement is the attester's word when there is one, otherwise the recorder's.
             coalesce(ap.full_name, cp.full_name) AS stated_by,
             to_char(coalesce(e.attested_at, e.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS stated_on,
             (SELECT jsonb_build_object('result', c.result, 'detail', c.detail, 'rules_version', c.rules_version)
                FROM figure_checks c WHERE c.evidence_id = e.id AND c.subject_table = 'value_outcomes' AND c.subject_id = voe.value_outcome_id
               ORDER BY c.checked_at DESC, c.id DESC LIMIT 1) AS figure_check
        FROM value_outcome_evidence voe JOIN evidence e ON e.id = voe.evidence_id
        JOIN persons cp ON cp.id = e.captured_by_person_id
        LEFT JOIN persons ap ON ap.id = e.attested_by_person_id
        JOIN value_outcomes vo ON vo.id = voe.value_outcome_id
       WHERE vo.institution_id = $1 AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL
         AND voe.withdrawn_at IS NULL  -- C1: a withdrawn link supports nothing; it is listed apart
       ORDER BY voe.supports, e.created_at`),
    q<{ metric_name: string; unit: string | null; direction: 'increase' | 'decrease'; falsifier_reference: string; reference_value: string;
        reference_recorded_on: string; falsifier_due: string; falsifier_conditions: string } & Record<string, unknown>>(`
      SELECT h.id, h.value_outcome_id, h.statement, lvrf_hypothesis_verdict(h) AS verdict, h.post_hoc,
             h.falsifier_reference::text, h.reference_value::text,
             to_char(h.reference_recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS reference_recorded_on,
             to_char(h.falsifier_due, 'YYYY-MM-DD') AS falsifier_due, h.falsifier_conditions,
             bm.name AS metric_name, bm.unit, m.direction::text AS direction,
             json_build_object('id', l.id, 'name', l.name, 'mechanism', l.mechanism, 'leading_indicator', l.leading_indicator,
                               'citation', l.citation, 'status', l.status, 'withdrawn', l.deleted_at IS NOT NULL,
                               -- UX-1 slice 3 (read-only): who proposed it and when. Under O-D2
                               -- the steward's proposal IS the ratification (O-D2a); L32 renames the status.
                               'proposed_by', lp.full_name, 'proposed_at', l.created_at) AS lever,
             json_build_object('id', m.id, 'name', m.name, 'direction', m.direction, 'confounders', m.confounders) AS pack_entry,
             ap.full_name AS author, h.created_at, h.superseded_by_id, h.supersession_reason,
             h.deleted_at AS withdrawn_at, wp.full_name AS withdrawn_by, h.retirement_reason AS withdrawal_reason
        FROM value_hypotheses h
        JOIN value_outcomes vo ON vo.id = h.value_outcome_id
        JOIN business_metrics bm ON bm.id = vo.business_metric_id
        JOIN value_levers l ON l.id = h.value_lever_id
        LEFT JOIN persons lp ON lp.id = l.proposed_by_person_id
        JOIN industry_measures m ON m.id = l.industry_measure_id
        JOIN persons ap ON ap.id = h.author_person_id
        LEFT JOIN persons wp ON wp.id = h.retired_by_person_id
       WHERE h.institution_id = $1
       ORDER BY (h.deleted_at IS NULL AND h.superseded_by_id IS NULL) DESC, h.created_at DESC, h.id`),
    q<Record<string, unknown>>(`
      SELECT s.id, s.lens::text, s.body, ap.full_name AS author, s.drafted_with_ai, s.drafting_tool, s.created_at,
             s.supersedes_id, s.value_run_id,
             NOT EXISTS (SELECT 1 FROM executive_summaries n WHERE n.supersedes_id = s.id) AS current
        FROM executive_summaries s JOIN persons ap ON ap.id = s.author_person_id
       WHERE s.institution_id = $1 ORDER BY s.lens, s.created_at DESC`),
    // The current levers on the pack entries this account's outcomes rest on:
    // what "State a hypothesis…" may choose from.
    q<Record<string, unknown>>(`
      SELECT l.id, l.name, l.mechanism, l.industry_measure_id, m.name AS pack_entry_name, m.direction::text AS direction
        FROM value_levers l JOIN industry_measures m ON m.id = l.industry_measure_id
       WHERE l.deleted_at IS NULL AND l.superseded_by_id IS NULL
         AND l.industry_measure_id IN (SELECT bm.industry_measure_id FROM value_outcomes vo
                                         JOIN business_metrics bm ON bm.id = vo.business_metric_id
                                        WHERE vo.institution_id = $1 AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL)
       ORDER BY m.name, l.name`),
  ]);

  // The value spine, in order, from its enum (CLAUDE.md: never restated).
  const { rows: [{ spine }] } = await pool.query<{ spine: string[] }>(
    `SELECT enum_range(NULL::value_stage)::text[] AS spine`,
  );
  const entity = entityRows[0] ?? null;
  // C1: links withdrawn by a correction, listed apart under their outcome (who, when, why).
  const withdrawn = await q<{ value_outcome_id: string } & Record<string, unknown>>(`
    SELECT w.value_outcome_id, w.supports, e.summary, wp.full_name AS withdrawn_by,
           -- C2c: which evidence, and whether a correcting link replaced it (a withdrawal alone has none).
           w.evidence_id AS link_evidence_id,
           -- (a correcting link in any state: corrected and later withdrawn, it was still replaced)
           EXISTS (SELECT 1 FROM value_outcome_evidence c WHERE c.value_outcome_id = w.value_outcome_id AND c.evidence_id = w.evidence_id
                     AND c.corrects_supports = w.supports) AS replaced,
           to_char(w.withdrawn_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS withdrawn_on, w.withdrawal_reason AS reason
      FROM value_outcome_evidence w JOIN evidence e ON e.id = w.evidence_id
      JOIN persons wp ON wp.id = w.withdrawn_by_person_id
      JOIN value_outcomes vo ON vo.id = w.value_outcome_id
     WHERE vo.institution_id = $1 AND w.withdrawn_at IS NOT NULL
     ORDER BY w.withdrawn_at`);
  const withdrawnOf = new Map<string, unknown[]>();
  for (const w of withdrawn) {
    const { value_outcome_id: oid, ...rest } = w;
    withdrawnOf.set(oid, [...(withdrawnOf.get(oid) ?? []), rest]);
  }
  const evidenceOf = new Map<string, unknown[]>();
  for (const e of evidence) {
    const list = evidenceOf.get(e.value_outcome_id) ?? [];
    const { value_outcome_id: _omit, ...rest } = e;
    list.push(rest);
    evidenceOf.set(e.value_outcome_id, list);
  }
  // BANNERS, computed here once (rule 6; §5 "Outside-in says so").
  const bases = [
    ...facts.map((f) => f.basis),
    ...(entity ? [entity.basis as string | null] : []),
    ...evidence.map((e) => e.basis),
  ];
  const outsideIn = !bases.some((b) => b !== null && STRONG.has(b));
  const unverified = outcomes.length === 0 || outcomes.some((o) => !o.source_verified);

  return {
    institution: { id: inst.id, name: inst.name, industry_name: inst.industry_name, industry_slug: inst.industry_slug },
    reference_example: markers.find((m) => m.current) ?? null,
    reference_markers: markers,
    entity,
    facts,
    engagements,
    outcomes: outcomes.map((o) => ({ ...o, evidence: evidenceOf.get(o.id) ?? [], withdrawn_links: withdrawnOf.get(o.id) ?? [] })),
    hypotheses: hypotheses.map((h) => ({
      ...h,
      direction_label: h.direction === 'decrease' ? 'lower is better' : 'higher is better',
      falsifier_text: falsifierSentence(h),
    })),
    executive_summaries: summaries,
    levers,
    banners: { outside_in: outsideIn, unverified },
    value_spine: spine,
  };
}
