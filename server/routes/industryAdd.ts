import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { recordAct } from '../lib/governanceAct.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { actorTenantId } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { requireSteward } from '../lib/stewardActs.js';
import { refuseUnknownFields } from '../lib/strictBody.js';

/**
 * L52 / B1 (Brad, 1 Nov 2026) — POST /api/industries: a steward adds an industry, with a reason, under its own act,
 * so a pack can be researched for it. An industry is reference data, a name and a slug: no pack contract, no
 * lifecycle. The steward's act is held in the database too (industries_steward_only, hardening section 31).
 */
class Refusal extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const MIN_REASON = 12;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function industryAddRouter(pool: Pool): Router {
  const router = Router();
  router.post('/', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/industries';
    const client: PoolClient = req.dbClient!;
    let tenantId: string | null = null;
    const ctx = () => ({ endpoint, subjectTable: 'industries', subjectId: null, tenantId: tenantId!, institutionId: null, attemptedPayload: req.body });
    try {
      tenantId = await actorTenantId(req);
      if (await refuseUnknownFields(pool, req, res, ['name', 'slug', 'reason'],
        { endpoint, subjectTable: 'industries', subjectId: null, tenantId, institutionId: null })) return;
      const b = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
      const text = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim() : '');
      const [name, slug, reason] = [text('name'), text('slug'), text('reason')];
      if (name.length < 2) throw new Refusal(422, 'Name the industry.');
      if (!SLUG.test(slug)) throw new Refusal(422, 'The slug is lower-case letters and digits, joined by single hyphens.');
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why it is added, in at least ${MIN_REASON} characters.`);
      const { rows: taken } = await client.query<{ name: string; slug: string }>(
        'SELECT name, slug FROM industries WHERE tenant_id = $1 AND (slug = $2 OR lower(name) = lower($3))', [tenantId, slug, name]);
      if (taken.length > 0) throw new Refusal(409, `This tenant already has "${taken[0].name}" (${taken[0].slug}).`);
      const { rows: [row] } = await client.query<{ id: string }>(
        'INSERT INTO industries (tenant_id, name, slug) VALUES ($1, $2, $3) RETURNING id', [tenantId, name, slug]);
      await recordAct(client, req, 'POST /api/industries', { act: 'add_industry', tenantId, subjectTable: 'industries', subjectId: row.id, reason });
      res.status(201).json({ industry_id: row.id, name, slug });
    } catch (err) {
      if (err instanceof Refusal) {
        if (tenantId) await recordRouteRefusal(pool, req, ctx(), err.message);
        res.status(err.status).json({ message: err.message });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, { endpoint, subjectTable: 'industries', subjectId: null, tenantId, institutionId: null, attemptedPayload: req.body })) return;
      respondServerError(res, err);
    }
  });
  return router;
}
