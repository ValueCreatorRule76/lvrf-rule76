import type { Request } from 'express';
import type { PoolClient } from 'pg';

/**
 * Sign-in P3 — the tenant check, in one place.
 *
 * Every /api route past requireActor acts for ONE tenant: the actor's
 * (req.actor.tenantId, from the session). A row of another tenant is,
 * to that actor, a row that does not exist:
 *
 *   - a route that looks a row up by id resolves the row's tenant and
 *     calls isOtherTenant(); on true it answers exactly as it would for a
 *     missing id — its own 404 (or, for an id inside a request body, its
 *     own "not found" for that field). Nothing distinguishes "exists
 *     elsewhere" from "never existed";
 *   - a route that lists rows filters on actorTenantId(req).
 *
 * A MISMATCH IS NOT A REFUSAL. refusals rows are attributed to a tenant and
 * feed that tenant's gap register; a probe from another tenant would land
 * in the victim's record. A mismatch is logged here instead, at warn: the
 * actor, the actor's tenant, the route pattern and the target id — never
 * the request body.
 *
 * WHAT IS TENANT-OWNED. Every table that carries a tenant_id, and every
 * table that reaches one through institution_id / engagement_id /
 * value_outcome_id / capability_id. The only SHARED REFERENCE tables are
 * the heartbeat register (heartbeats), tenants itself and
 * hardening_manifest; no route takes an id of those from a caller. See
 * BUILD_STATUS "Sign-in P3" for the per-table classification.
 */

export function actorTenantId(req: Request): string {
  if (!req.actor) {
    // requireActor runs before every route that calls this; reaching here
    // means the middleware order broke — fail loudly, never unscoped.
    throw new Error('req.actor missing on a request past requireActor');
  }
  return req.actor.tenantId;
}

/**
 * True when the target row belongs to a tenant other than the actor's —
 * and then logs it. A null tenant (an unresolvable owner) counts as
 * another tenant: fail closed.
 */
export function isOtherTenant(
  req: Request,
  targetTenantId: string | null | undefined,
  target: { table: string; id: string },
): boolean {
  const actorTenant = actorTenantId(req);
  if (targetTenantId === actorTenant) return false;
  const path = req.route?.path === '/' ? '' : (req.route?.path ?? '');
  const route = `${req.method} ${req.baseUrl}${path}`;
  console.warn(
    `LVRF tenant mismatch: actor ${req.actor!.personId} (tenant ${actorTenant}) ` +
    `${route} -> ${target.table} ${target.id}`,
  );
  return true;
}

/**
 * The tenant a person belongs to: their own (vendor staff) or their
 * institution's (customer side) — persons_scoped_to_exactly_one makes it
 * exactly one of the two. Null when no current person has that id. For a
 * person id chosen in a request body that no other check ties to the
 * target's institution (the metric owner).
 */
export async function personTenantId(
  db: { query: PoolClient['query'] },
  personId: string,
): Promise<string | null> {
  const { rows: [row] } = await db.query<{ tenant_id: string | null }>(
    `SELECT COALESCE(p.tenant_id, i.tenant_id) AS tenant_id
       FROM persons p
       LEFT JOIN institutions i ON i.id = p.institution_id
      WHERE p.id = $1 AND p.deleted_at IS NULL AND p.superseded_by_id IS NULL`,
    [personId],
  );
  return row?.tenant_id ?? null;
}
