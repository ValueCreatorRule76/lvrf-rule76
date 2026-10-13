import { Router } from 'express';
import type { Pool } from 'pg';
import { handleGovernanceError } from '../lib/refusal.js';
import { classifyInstitution } from '../lib/classifyInstitution.js';
import { actorTenantId } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';

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
//
// Account workbench additions, both optional:
//   institution.website — stored as entered; institutions_website_is_url
//     (a CHECK, not a validation here) refuses anything that is not an
//     http(s) URL
//   institution.industry_slug + institution.classification_note — sent
//     TOGETHER or not at all. When sent, the account is classified in this
//     same transaction by server/lib/classifyInstitution.ts, the one writer
//     of industry_id. A refused classification refuses the whole create —
//     actorContext rolls back on any non-2xx — so an account is never left
//     half-made. institution.industry (the free-text statement) is stored
//     separately and never derived from the slug, or vice versa.
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
      const institutionWebsite = optionalNullableString(institutionInput, 'website', 'institution');
      const industrySlug = optionalNullableString(institutionInput, 'industry_slug', 'institution');
      const classificationNote = optionalNullableString(
        institutionInput, 'classification_note', 'institution',
      );
      const hasSlug = industrySlug !== null && industrySlug.trim() !== '';
      const hasNote = classificationNote !== null && classificationNote.trim() !== '';
      if (hasSlug !== hasNote) {
        // A classification with no recorded reasoning is an assertion with
        // no author; a note with no classification is reasoning about
        // nothing. Either half alone is refused, not half-applied.
        throw new ValidationError(
          hasSlug
            ? 'institution.classification_note is required when institution.industry_slug is sent'
            : 'institution.industry_slug is required when institution.classification_note is sent',
        );
      }

      const personInputs = optionalArray(body, 'persons', 'body').map((p, i) =>
        requireObject(p, `persons[${i}]`),
      );
      const assessmentInputs = optionalArray(body, 'assessments', 'body').map((a, i) =>
        requireObject(a, `assessments[${i}]`),
      );

      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('req.actor missing on a request past requireActor');
      }

      // Sign-in P3: the account is created in the ACTOR'S tenant. Until P3
      // this read `SELECT id FROM tenants` and refused unless there was
      // exactly one — which held, but would have put a second tenant's
      // staff on a 422, and was never a statement of whose account it is.
      const tenantId = actorTenantId(req);
      refusalTenantId = tenantId;

      const { rows: insertedInstitution } = await client.query<{ id: string }>(
        `INSERT INTO institutions (tenant_id, name, industry, website)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ON CONSTRAINT institutions_tenant_name_key DO NOTHING
         RETURNING id`,
        [tenantId, institutionName, institutionIndustry, institutionWebsite],
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

      let classification: {
        industry_name: string;
        industry_slug: string;
        evidence_id: string;
      } | null = null;
      if (hasSlug && hasNote) {
        const result = await classifyInstitution(client, req, {
          institutionId,
          industrySlug: industrySlug!,
          classificationNote: classificationNote!,
          actorPersonId,
        });
        if (!result.ok) {
          // Non-2xx: actorContext rolls back the institution insert too.
          res.status(result.status).json({
            message: `account not created — classification refused: ${result.message}`,
          });
          return;
        }
        classification = {
          industry_name: result.industryName,
          industry_slug: result.industrySlug,
          evidence_id: result.evidenceId,
        };
      }

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
        classification,
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
      respondServerError(res, err);
    }
  });

  return router;
}
