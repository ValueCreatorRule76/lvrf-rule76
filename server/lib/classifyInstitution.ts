import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { isOtherTenant } from './tenantScope.js';

/**
 * The classification act, shared by its two callers:
 *
 *   POST /api/institutions/:institutionId/industry   (institutionClassify.ts)
 *   POST /api/account-inputs                          (accountInputs.ts, when
 *                                                      industry_slug is sent)
 *
 * Moved here verbatim from institutionClassify.ts so the create form can
 * classify in the same transaction as the insert without a second copy of
 * the rules. One writer of institutions.industry_id, in one place — two
 * copies of this logic would be two gates that drift.
 *
 * The rules, unchanged (see institutionClassify.ts's header for the why):
 *   - classification_note is required and becomes an evidence row
 *     (kind 'observation', confidence 'low', source_verified false)
 *   - a classified institution is never reclassified — 409, supersede the
 *     institution instead
 *   - the institution must be in the actor's tenant (sign-in P3: 404
 *     otherwise, as for an unknown id)
 *   - the slug must name an industry in the institution's own tenant —
 *     404 otherwise. Until P3 a slug that existed only in ANOTHER tenant
 *     got a 422 saying so, which told the caller what another tenant's
 *     taxonomy contains; it is now the same 404 as an unknown slug.
 *   - the UPDATE is race-guarded on industry_id IS NULL
 *   - institutions.industry (the free-text statement) is never touched
 *
 * Runs on the caller's client, inside actorContext's transaction. Returns a
 * result rather than writing the response, so each caller keeps its own
 * response shape. A non-ok result means the caller must respond with
 * `status` and `message` and write nothing further — actorContext rolls
 * back on a non-2xx status, which undoes the evidence row if one was
 * already inserted before a race-guard miss.
 */

export type ClassifyResult =
  | {
      ok: true;
      institutionName: string;
      industryName: string;
      industrySlug: string;
      evidenceId: string;
    }
  | { ok: false; status: 404 | 409 | 422; message: string };

export async function classifyInstitution(
  client: PoolClient,
  req: Request,
  args: {
    institutionId: string;
    industrySlug: string;
    classificationNote: string;
    actorPersonId: string;
    /**
     * Called as soon as the institution's tenant is known, BEFORE any
     * write. A CHECK refusal thrown by the evidence insert propagates as an
     * exception, not a result — the caller's handleGovernanceError needs
     * the tenant id for its refusal record even then.
     */
    onTenantResolved?: (tenantId: string) => void;
  },
): Promise<ClassifyResult & { tenantId?: string }> {
  const { institutionId, industrySlug, classificationNote, actorPersonId } = args;

  // current_industry_name/slug are only populated if industry_id is
  // already set — needed to name the existing classification in the
  // 409 below, without a second round trip.
  const { rows: [institution] } = await client.query<{
    id: string;
    tenant_id: string;
    name: string;
    industry_id: string | null;
    current_industry_name: string | null;
    current_industry_slug: string | null;
  }>(
    `SELECT i.id, i.tenant_id, i.name, i.industry_id,
            ind.name AS current_industry_name, ind.slug AS current_industry_slug
       FROM institutions i
       LEFT JOIN industries ind ON ind.id = i.industry_id
      WHERE i.id = $1 AND i.deleted_at IS NULL`,
    [institutionId],
  );
  if (!institution || isOtherTenant(req, institution.tenant_id, { table: 'institutions', id: institutionId })) {
    return { ok: false, status: 404, message: `institution ${institutionId} not found` };
  }
  const tenantId = institution.tenant_id;
  args.onTenantResolved?.(tenantId);

  // A classification is not amended silently — the same reasoning as a
  // locked run (lockRun.ts): changing what an account IS changes what
  // every pack lookup already made against it meant. A second
  // classification supersedes the INSTITUTION, it does not overwrite
  // this one's industry_id.
  if (institution.industry_id !== null) {
    return {
      ok: false,
      status: 409,
      tenantId,
      message:
        `institution ${institutionId} is already classified as ` +
        `${institution.current_industry_name} (${institution.current_industry_slug}); ` +
        `a classification is not amended — supersede the institution instead`,
    };
  }

  // Scoped by tenant_id: industries are tenant-owned, and a slug is unique
  // only within a tenant. On a hit, the institution and industry share a
  // tenant by construction. A miss is one 404 whether or not some other
  // tenant uses the slug (sign-in P3 — see the header).
  const { rows: [industry] } = await client.query<{ id: string; name: string; slug: string }>(
    'SELECT id, name, slug FROM industries WHERE tenant_id = $1 AND slug = $2',
    [tenantId, industrySlug],
  );
  if (!industry) {
    return {
      ok: false,
      status: 404,
      tenantId,
      message: `industry_slug unknown for this tenant: ${industrySlug}`,
    };
  }

  // actorContext already confirmed this id names a real, non-simulated
  // person before calling next() — this lookup is only for a readable
  // name in the provenance text, not another authorization check.
  const { rows: [actorPerson] } = await client.query<{ full_name: string }>(
    'SELECT full_name FROM persons WHERE id = $1',
    [actorPersonId],
  );

  const { rows: [evidenceRow] } = await client.query<{ id: string }>(
    `INSERT INTO evidence (
       institution_id, kind, summary, provenance, confidence,
       source_verified, ai_sourced, simulated, captured_by_person_id
     ) VALUES ($1, 'observation', $2, $3, 'low', false, false, false, $4)
     RETURNING id`,
    [
      institutionId,
      classificationNote,
      `Asserted at industry classification by ${actorPerson.full_name}`,
      actorPersonId,
    ],
  );

  // Race guard, same shape as outcomeWalk.ts's commit: if another
  // request classified this institution between the SELECT above and
  // this UPDATE, zero rows come back instead of silently overwriting
  // whoever won.
  const { rows: [updated] } = await client.query<{ industry_id: string }>(
    `UPDATE institutions
        SET industry_id = $1
      WHERE id = $2 AND industry_id IS NULL
      RETURNING industry_id`,
    [industry.id, institutionId],
  );
  if (!updated) {
    return {
      ok: false,
      status: 409,
      tenantId,
      message: `institution ${institutionId} was classified by another request just now; retry to see the current classification`,
    };
  }

  return {
    ok: true,
    tenantId,
    institutionName: institution.name,
    industryName: industry.name,
    industrySlug: industry.slug,
    evidenceId: evidenceRow.id,
  };
}
