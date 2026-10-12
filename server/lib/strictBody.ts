import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { recordRouteRefusal } from './refusal.js';

/**
 * O1/O2 — strict request bodies. A field a route does not take is refused
 * 400 and recorded in `refusals` (source 'route'), so the attempt stands on
 * record: an effect size on a lever, a direction on a hypothesis, a status
 * on a hypothesis (its verdict is computed, O2-D1). `explain` names why a
 * particular field cannot be set; anything else is "not a field of this
 * request". Runs once the subject's tenant is known (refusals.tenant_id is
 * NOT NULL). Returns true when it has answered.
 */
export async function refuseUnknownFields(
  pool: Pool, req: Request, res: Response, allowed: readonly string[],
  ctx: { endpoint: string; subjectTable: string; subjectId: string | null; tenantId: string; institutionId?: string | null },
  explain: (field: string) => string | null = () => null,
): Promise<boolean> {
  const body = req.body as Record<string, unknown>;
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length === 0) return false;
  const issues = extra.map((k) => explain(k) ?? `body.${k} is not a field of this request (it takes ${allowed.join(', ')})`);
  const message = `${issues.length} field(s) refused; nothing was written.`;
  await recordRouteRefusal(pool, req, {
    endpoint: ctx.endpoint, subjectTable: ctx.subjectTable, subjectId: ctx.subjectId,
    tenantId: ctx.tenantId, institutionId: ctx.institutionId ?? null, attemptedPayload: req.body,
  }, `${message} ${issues.join(' | ')}`);
  res.status(400).json({ message, issues });
  return true;
}
