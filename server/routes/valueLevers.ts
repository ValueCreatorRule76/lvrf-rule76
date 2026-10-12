import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { requireSteward } from '../lib/stewardActs.js';

/**
 * O1 (Outputs band, LVRF_PLAN §5) — value levers and the solutions that pull
 * them. Pack content, so every act here is the STEWARD's (O-D2):
 *
 *   POST /api/industry-measures/:id/levers      a lever on a current pack entry
 *   POST /api/value-levers/:id/offerings        a catalog offering that pulls a lever
 *   POST /api/value-levers/:id/retire           withdraw a lever
 *   POST /api/lever-offerings/:id/retire        withdraw a link
 *
 * A lever is a mechanism, not a promise: it has no effect size, and nothing
 * here computes or stores a target (§5, no invented targets). A request
 * that SENDS one — or any field these routes do not take — is refused 400
 * and recorded in `refusals` (source 'route'): the attempt stands on record.
 *
 * WITHDRAWN, NEVER DELETED. A withdrawn lever keeps its row (deleted_at,
 * status 'retired', who, why — value_levers_retirement_is_complete); a
 * withdrawn link keeps its row (retired_at, who, why). Both stay on the pack
 * page, marked. The database refuses DELETE on both, and refuses a
 * non-steward's write (hardening section 20).
 */

class ValidationError extends Error {
  constructor(public readonly issues: string[]) { super(issues.join('; ')); }
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function text(body: Record<string, unknown>, k: string, min: number, issues: string[], what: string): string | undefined {
  const v = body[k];
  if (typeof v !== 'string' || v.trim().length < min) {
    issues.push(min > 1 ? `body.${k} must state ${what}, in at least ${min} characters` : `body.${k} is required`);
    return undefined;
  }
  return v.trim();
}
const MIN_REASON_LENGTH = 12;
// A key that names a size, a target or an expected result.
const EFFECT_LIKE = /effect|target|impact|uplift|expected|improvement|delta|roi|size|estimate|forecast|projected/i;

/**
 * Fields outside `allowed` are refused, 400, and recorded (source 'route').
 * Returns true when it has answered. Runs once the subject's tenant is known
 * (refusals.tenant_id is NOT NULL).
 */
async function refuseUnknownFields(
  pool: Pool, req: Request, res: Response, allowed: readonly string[],
  ctx: { endpoint: string; subjectTable: string; subjectId: string | null; tenantId: string },
): Promise<boolean> {
  const extra = Object.keys(req.body as Record<string, unknown>).filter((k) => !allowed.includes(k));
  if (extra.length === 0) return false;
  const issues = extra.map((k) => EFFECT_LIKE.test(k)
    ? `body.${k}: a value lever carries no effect size or target — it is a mechanism, not a promise (LVRF_PLAN §5)`
    : `body.${k} is not a field of this request (it takes ${allowed.join(', ')})`);
  const message = `${issues.length} field(s) refused; nothing was written.`;
  await recordRouteRefusal(pool, req, { ...ctx, institutionId: null, attemptedPayload: req.body }, `${message} ${issues.join(' | ')}`);
  res.status(400).json({ message, issues });
  return true;
}

function reasonOf(body: unknown, what: string): string {
  if (!isRecord(body)) throw new ValidationError(['body is required']);
  const reason = body['retirement_reason'];
  if (typeof reason !== 'string' || reason.trim().length < MIN_REASON_LENGTH) {
    throw new ValidationError([`body.retirement_reason must state why this ${what} is being withdrawn, in at least ${MIN_REASON_LENGTH} characters`]);
  }
  return reason.trim();
}

async function answerError(pool: Pool, err: unknown, req: Request, res: Response, endpoint: string, subjectTable: string,
  subjectId: string | null, tenantId: string | null): Promise<void> {
  if (err instanceof ValidationError) {
    res.status(422).json({ message: `${err.issues.length} issue(s) found; nothing was written.`, issues: err.issues });
    return;
  }
  if (await handleGovernanceError(pool, err, req, res, {
    endpoint, subjectTable, subjectId, tenantId, institutionId: null, attemptedPayload: req.body,
  })) return;
  res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
}

const day = (t: string | Date) => new Date(t).toISOString().slice(0, 10);

export function valueLeverRouter(pool: Pool): Router {
  const router = Router();
  const endpoint = 'POST /api/industry-measures/:id/levers';

  router.post('/:id/levers', requireSteward(pool), async (req, res) => {
    const client = req.dbClient!;
    const measureId = req.params.id;
    if (!isUuid(measureId)) {
      res.status(400).json({ message: `invalid industry measure id: ${measureId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      const body = req.body;
      if (!isRecord(body)) throw new ValidationError(['body is required']);
      const { rows: [m] } = await client.query<{ id: string; tenant_id: string; name: string; deleted_at: string | null; superseded_by_id: string | null }>(
        'SELECT id, tenant_id, name, deleted_at, superseded_by_id FROM industry_measures WHERE id = $1', [measureId],
      );
      if (!m || isOtherTenant(req, m.tenant_id, { table: 'industry_measures', id: measureId })) {
        res.status(404).json({ message: `industry measure ${measureId} not found` });
        return;
      }
      refusalTenantId = m.tenant_id;
      if (await refuseUnknownFields(pool, req, res, ['name', 'mechanism', 'leading_indicator', 'citation'],
        { endpoint, subjectTable: 'value_levers', subjectId: null, tenantId: m.tenant_id })) return;
      if (m.deleted_at !== null || m.superseded_by_id !== null) {
        res.status(409).json({ message: `"${m.name}" is not a current pack entry (retired or superseded); a lever attaches to a current entry.` });
        return;
      }
      const issues: string[] = [];
      const name = text(body, 'name', 1, issues, 'the lever');
      const mechanism = text(body, 'mechanism', 12, issues, 'how capability change moves the measure');
      const leading = text(body, 'leading_indicator', 1, issues, 'what moves first');
      const citation = text(body, 'citation', 12, issues, 'the source of the lever');
      if (issues.length > 0) throw new ValidationError(issues);
      // No partial unique index (a two-step supersession would trip it): the
      // route refuses a second CURRENT lever of the same name on the entry.
      const { rows: [dup] } = await client.query(
        `SELECT 1 FROM value_levers WHERE industry_measure_id = $1 AND lower(btrim(name)) = lower($2)
            AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [measureId, name],
      );
      if (dup) {
        res.status(409).json({ message: `"${m.name}" already has a current lever named "${name}"; withdraw it to replace it.` });
        return;
      }
      const { rows: [lever] } = await client.query<{ id: string }>(
        `INSERT INTO value_levers (tenant_id, industry_measure_id, name, mechanism, leading_indicator, citation, proposed_by_person_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [m.tenant_id, measureId, name, mechanism, leading, citation, actorPersonId],
      );
      res.status(201).json({ value_lever_id: lever.id, industry_measure_id: measureId, status: 'proposed' });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'value_levers', null, refusalTenantId);
    }
  });

  return router;
}

export function leverOfferingRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:id/offerings', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/value-levers/:id/offerings';
    const client = req.dbClient!;
    const leverId = req.params.id;
    if (!isUuid(leverId)) {
      res.status(400).json({ message: `invalid value lever id: ${leverId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      const body = req.body;
      if (!isRecord(body)) throw new ValidationError(['body is required']);
      const { rows: [lever] } = await client.query<{ id: string; tenant_id: string; name: string; deleted_at: string | null; superseded_by_id: string | null }>(
        'SELECT id, tenant_id, name, deleted_at, superseded_by_id FROM value_levers WHERE id = $1', [leverId],
      );
      if (!lever || isOtherTenant(req, lever.tenant_id, { table: 'value_levers', id: leverId })) {
        res.status(404).json({ message: `value lever ${leverId} not found` });
        return;
      }
      refusalTenantId = lever.tenant_id;
      if (await refuseUnknownFields(pool, req, res, ['offering_key', 'basis'],
        { endpoint, subjectTable: 'lever_offerings', subjectId: null, tenantId: lever.tenant_id })) return;
      if (lever.deleted_at !== null || lever.superseded_by_id !== null) {
        res.status(409).json({ message: `lever "${lever.name}" is not current (withdrawn or superseded).` });
        return;
      }
      const issues: string[] = [];
      const offeringKey = text(body, 'offering_key', 1, issues, 'the offering');
      const basis = text(body, 'basis', 12, issues, 'why this solution pulls this lever');
      if (issues.length > 0) throw new ValidationError(issues);
      const { rows: [offering] } = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM offerings WHERE tenant_id = $1 AND offering_key = $2 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [lever.tenant_id, offeringKey],
      );
      if (!offering) throw new ValidationError([`body.offering_key "${offeringKey}" is not a current offering in this tenant's catalog`]);
      const { rows: [dup] } = await client.query(
        'SELECT 1 FROM lever_offerings WHERE value_lever_id = $1 AND offering_id = $2 AND retired_at IS NULL', [leverId, offering.id],
      );
      if (dup) {
        res.status(409).json({ message: `"${offering.name}" is already linked to lever "${lever.name}"; a link is a fact and is not repeated.` });
        return;
      }
      const { rows: [link] } = await client.query<{ id: string }>(
        `INSERT INTO lever_offerings (tenant_id, value_lever_id, offering_id, basis, linked_by_person_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [lever.tenant_id, leverId, offering.id, basis, actorPersonId],
      );
      res.status(201).json({ lever_offering_id: link.id, value_lever_id: leverId, offering_key: offeringKey });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'lever_offerings', null, refusalTenantId);
    }
  });

  // Withdraw a lever. Its links stay, shown under it; it takes no new ones.
  router.post('/:id/retire', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/value-levers/:id/retire';
    const client = req.dbClient!;
    const leverId = req.params.id;
    if (!isUuid(leverId)) {
      res.status(400).json({ message: `invalid value lever id: ${leverId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      // FOR UPDATE: two withdrawals serialize; the second sees the first.
      const { rows: [lever] } = await client.query<{ id: string; tenant_id: string; name: string; deleted_at: string | null;
        superseded_by_id: string | null; retired_by: string | null; retirement_reason: string | null }>(
        `SELECT l.id, l.tenant_id, l.name, l.deleted_at, l.superseded_by_id, rb.full_name AS retired_by, l.retirement_reason
           FROM value_levers l LEFT JOIN persons rb ON rb.id = l.retired_by_person_id
          WHERE l.id = $1 FOR UPDATE OF l`, [leverId],
      );
      if (!lever || isOtherTenant(req, lever.tenant_id, { table: 'value_levers', id: leverId })) {
        res.status(404).json({ message: `value lever ${leverId} not found` });
        return;
      }
      refusalTenantId = lever.tenant_id;
      if (await refuseUnknownFields(pool, req, res, ['retirement_reason'],
        { endpoint, subjectTable: 'value_levers', subjectId: leverId, tenantId: lever.tenant_id })) return;
      const reason = reasonOf(req.body, 'lever');
      if (lever.deleted_at !== null) {
        res.status(409).json({ message: `lever "${lever.name}" was already withdrawn by ${lever.retired_by ?? 'an unrecorded person'} on ${day(lever.deleted_at)}: "${lever.retirement_reason ?? ''}". A withdrawal is not repeated or amended.` });
        return;
      }
      if (lever.superseded_by_id !== null) {
        res.status(409).json({ message: `lever "${lever.name}" is superseded; withdraw its successor instead.` });
        return;
      }
      await client.query(
        `UPDATE value_levers SET deleted_at = now(), status = 'retired', retired_by_person_id = $2, retirement_reason = $3 WHERE id = $1`,
        [leverId, actorPersonId, reason],
      );
      res.status(200).json({ value_lever_id: leverId, status: 'retired' });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'value_levers', leverId, refusalTenantId);
    }
  });

  return router;
}

export function leverOfferingRetireRouter(pool: Pool): Router {
  const router = Router();

  // Withdraw a link. The row stays, marked: who, when, why.
  router.post('/:id/retire', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/lever-offerings/:id/retire';
    const client = req.dbClient!;
    const linkId = req.params.id;
    if (!isUuid(linkId)) {
      res.status(400).json({ message: `invalid lever offering id: ${linkId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      if (!isRecord(req.body)) throw new ValidationError(['body is required']);
      const { rows: [link] } = await client.query<{ id: string; tenant_id: string; offering: string; lever: string;
        retired_at: string | null; retired_by: string | null; retirement_reason: string | null }>(
        `SELECT lo.id, lo.tenant_id, o.name AS offering, l.name AS lever, lo.retired_at, rb.full_name AS retired_by, lo.retirement_reason
           FROM lever_offerings lo JOIN offerings o ON o.id = lo.offering_id JOIN value_levers l ON l.id = lo.value_lever_id
           LEFT JOIN persons rb ON rb.id = lo.retired_by_person_id
          WHERE lo.id = $1 FOR UPDATE OF lo`, [linkId],
      );
      if (!link || isOtherTenant(req, link.tenant_id, { table: 'lever_offerings', id: linkId })) {
        res.status(404).json({ message: `lever offering ${linkId} not found` });
        return;
      }
      refusalTenantId = link.tenant_id;
      if (await refuseUnknownFields(pool, req, res, ['retirement_reason'],
        { endpoint, subjectTable: 'lever_offerings', subjectId: linkId, tenantId: link.tenant_id })) return;
      const reason = reasonOf(req.body, 'link');
      if (link.retired_at !== null) {
        res.status(409).json({ message: `the link of "${link.offering}" to lever "${link.lever}" was already withdrawn by ${link.retired_by ?? 'an unrecorded person'} on ${day(link.retired_at)}: "${link.retirement_reason ?? ''}". A withdrawal is not repeated or amended.` });
        return;
      }
      await client.query(
        `UPDATE lever_offerings SET retired_at = now(), retired_by_person_id = $2, retirement_reason = $3 WHERE id = $1`,
        [linkId, actorPersonId, reason],
      );
      res.status(200).json({ lever_offering_id: linkId, retired: true });
    } catch (err) {
      await answerError(pool, err, req, res, endpoint, 'lever_offerings', linkId, refusalTenantId);
    }
  });

  return router;
}
