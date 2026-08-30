import { Router } from 'express';
import type { Pool } from 'pg';
import { handleGovernanceError } from '../lib/refusal.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary and decides on
 * commit vs rollback from the response status once this handler returns.
 */

class ValidationError extends Error {}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${path} is required`);
  }
  return value as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, field: string, path: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ValidationError(`${path}.${field} is required`);
  }
  return v;
}

function optionalNullableString(
  obj: Record<string, unknown>,
  field: string,
  path: string,
): string | null {
  const v = obj[field];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new ValidationError(`${path}.${field} must be a string or null`);
  }
  return v;
}

function requireBoolean(obj: Record<string, unknown>, field: string, path: string): boolean {
  const v = obj[field];
  if (typeof v !== 'boolean') {
    throw new ValidationError(`${path}.${field} is required`);
  }
  return v;
}

function requireNumber(obj: Record<string, unknown>, field: string, path: string): number {
  const v = obj[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ValidationError(`${path}.${field} is required`);
  }
  return v;
}

function optionalNumber(
  obj: Record<string, unknown>,
  field: string,
  path: string,
): number | undefined {
  const v = obj[field];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ValidationError(`${path}.${field} must be a number`);
  }
  return v;
}

function optionalArray(obj: Record<string, unknown>, field: string, path: string): unknown[] {
  const v = obj[field];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new ValidationError(`${path}.${field} must be an array`);
  }
  return v;
}

// POST /api/account-inputs — creates an institution, its persons, and any
// capability-baseline assessments as one unit. Roster item 2: the external
// entry point. There is no update path here and no implicit creation of
// capabilities — a capability must already exist for the institution
// before an assessment can baseline against it.
// Every actual query in this handler's happy path runs on req.dbClient,
// inside actorContext's transaction, never on pool — pool is used only by
// handleGovernanceError, on its own separate connection (see
// server/lib/refusal.ts for why).
export function accountInputsRouter(pool: Pool): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    // Captured for handleGovernanceError's refusal record.
    // refusalSubjectTable tracks which write is currently in flight —
    // 'institutions' until the institution insert succeeds, then updated
    // predictively at the top of each of the two loops below.
    let refusalTenantId: string | null = null;
    let refusalInstitutionId: string | null = null;
    let refusalSubjectTable = 'institutions';

    try {
      const body = requireObject(req.body, 'body');

      const institutionInput = requireObject(body.institution, 'institution');
      const institutionName = requireString(institutionInput, 'name', 'institution');
      const institutionIndustry = optionalNullableString(institutionInput, 'industry', 'institution');

      const personInputs = optionalArray(body, 'persons', 'body').map((p, i) =>
        requireObject(p, `persons[${i}]`),
      );
      const assessmentInputs = optionalArray(body, 'assessments', 'body').map((a, i) =>
        requireObject(a, `assessments[${i}]`),
      );

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: tenantRows } = await client.query<{ id: string }>(
        'SELECT id FROM tenants WHERE deleted_at IS NULL',
      );
      if (tenantRows.length !== 1) {
        res.status(422).json({
          message: `Expected exactly one tenant, found ${tenantRows.length}. Not guessing which one.`,
        });
        return;
      }
      const tenantId = tenantRows[0].id;
      refusalTenantId = tenantId;

      const { rows: insertedInstitution } = await client.query<{ id: string }>(
        `INSERT INTO institutions (tenant_id, name, industry)
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT institutions_tenant_name_key DO NOTHING
         RETURNING id`,
        [tenantId, institutionName, institutionIndustry],
      );

      if (insertedInstitution.length === 0) {
        // Resolving by name, not id — filter the supersession chain or this
        // can match a superseded ancestor. institutions_tenant_name_key is
        // a PLAIN unique constraint (no WHERE), so the conflict above can
        // be against a retired or superseded row that this filtered SELECT
        // will not find — a pre-existing gap in the constraint itself
        // (same shape business_metrics had), not something to paper over
        // with an empty-array crash.
        const { rows: existing } = await client.query<{ id: string }>(
          `SELECT id FROM institutions
            WHERE tenant_id = $1 AND name = $2
              AND deleted_at IS NULL AND superseded_by_id IS NULL`,
          [tenantId, institutionName],
        );
        if (existing.length === 0) {
          res.status(409).json({
            message: `An institution named "${institutionName}" already exists for this tenant, but is retired or superseded and not currently active — the naming conflict cannot be resolved to a current institution.`,
          });
          return;
        }
        res.status(409).json({
          message: `An institution named "${institutionName}" already exists for this tenant.`,
          institution_id: existing[0].id,
        });
        return;
      }
      const institutionId = insertedInstitution[0].id;
      refusalInstitutionId = institutionId;
      refusalSubjectTable = 'persons';

      const personIds: string[] = [];
      const personIdByEmail = new Map<string, string>();
      for (const [i, personInput] of personInputs.entries()) {
        const path = `persons[${i}]`;
        const fullName = requireString(personInput, 'full_name', path);
        const email = requireString(personInput, 'email', path);
        const title = optionalNullableString(personInput, 'title', path);

        const { rows: [person] } = await client.query<{ id: string }>(
          `INSERT INTO persons (institution_id, full_name, email, title)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [institutionId, fullName, email, title],
        );
        personIds.push(person.id);
        personIdByEmail.set(email, person.id);
      }

      refusalSubjectTable = 'assessments';
      const assessmentIds: string[] = [];
      for (const [i, assessmentInput] of assessmentInputs.entries()) {
        const path = `assessments[${i}]`;
        const personEmail = requireString(assessmentInput, 'person_email', path);
        const capabilityName = requireString(assessmentInput, 'capability_name', path);
        const score = requireNumber(assessmentInput, 'score', path);
        const scaleMin = optionalNumber(assessmentInput, 'scale_min', path) ?? 0;
        const scaleMax = optionalNumber(assessmentInput, 'scale_max', path) ?? 5;
        const aiAssisted = requireBoolean(assessmentInput, 'ai_assisted', path);
        const notes = optionalNullableString(assessmentInput, 'notes', path);

        const learnerPersonId = personIdByEmail.get(personEmail);
        if (!learnerPersonId) {
          res.status(422).json({
            message: `${path}: person_email does not match any submitted person: ${personEmail}`,
          });
          return;
        }

        // Resolving by name, not id — filter the supersession chain or this
        // can match a superseded ancestor.
        const { rows: [capability] } = await client.query<{ id: string }>(
          `SELECT id FROM capabilities
            WHERE institution_id = $1 AND name = $2
              AND deleted_at IS NULL AND superseded_by_id IS NULL`,
          [institutionId, capabilityName],
        );
        if (!capability) {
          res.status(422).json({
            message: `${path}: capability not found for this institution: ${capabilityName}`,
          });
          return;
        }

        const { rows: [assessment] } = await client.query<{ id: string }>(
          `INSERT INTO assessments (
             institution_id, learner_person_id, capability_id,
             score, scale_min, scale_max,
             assessed_by_person_id, ai_assisted, notes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            institutionId, learnerPersonId, capability.id,
            score, scaleMin, scaleMax,
            actorPersonId, aiAssisted, notes,
          ],
        );
        assessmentIds.push(assessment.id);
      }

      res.status(201).json({
        institution_id: institutionId,
        person_ids: personIds,
        assessment_ids: assessmentIds,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // is the governance gate doing its job, not a server fault. Its
      // message names the amendment and the reason — that message IS the
      // product here, so it goes to the caller unchanged, not swallowed
      // into a generic 500. handleGovernanceError also records the attempt
      // — see server/lib/refusal.ts.
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/account-inputs',
        subjectTable: refusalSubjectTable,
        subjectId: null,
        tenantId: refusalTenantId,
        institutionId: refusalInstitutionId,
        attemptedPayload: req.body,
      })) {
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
