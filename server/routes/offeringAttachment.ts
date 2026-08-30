import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
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

function requireUuidString(obj: Record<string, unknown>, field: string, path: string): string {
  const v = requireString(obj, field, path);
  if (!isUuid(v)) {
    throw new ValidationError(`${path}.${field} must be a valid UUID`);
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

// POST /api/institutions/:institutionId/offerings — attaches a tenant-level
// offering to an account, creating the account's capability if it does not
// exist yet. This is the link that makes an account's capabilities exist at
// all, so the basis for the attachment is recorded as an evidence row, not a
// comment: an unexplained link is the authored-prose problem this system
// exists to prevent.
export function offeringAttachmentRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:institutionId/offerings', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }

    // Captured for handleGovernanceError's refusal record.
    let refusalTenantId: string | null = null;

    try {
      const body = requireObject(req.body, 'body');
      const offeringKey = requireString(body, 'offering_key', 'body');
      const capabilityName = requireString(body, 'capability_name', 'body');
      const ownerPersonId = requireUuidString(body, 'owner_person_id', 'body');
      const basis = requireString(body, 'basis', 'body');
      const isPrimary = requireBoolean(body, 'is_primary', 'body');

      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [institution] } = await client.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM institutions WHERE id = $1 AND deleted_at IS NULL',
        [institutionId],
      );
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      refusalTenantId = institution.tenant_id;

      // Resolving by key, not id — filter the supersession chain or this
      // can match a superseded ancestor.
      const { rows: [offering] } = await client.query<{ id: string }>(
        `SELECT id FROM offerings
          WHERE tenant_id = $1 AND offering_key = $2
            AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [institution.tenant_id, offeringKey],
      );
      if (!offering) {
        res.status(422).json({
          message: `offering_key not found for this tenant: ${offeringKey}`,
        });
        return;
      }

      const { rows: [ownerPerson] } = await client.query<{ id: string }>(
        `SELECT id FROM persons
          WHERE id = $1 AND institution_id = $2 AND simulated = false AND deleted_at IS NULL`,
        [ownerPersonId, institutionId],
      );
      if (!ownerPerson) {
        res.status(422).json({
          message: `owner_person_id does not belong to institution ${institutionId}, or is simulated: ${ownerPersonId}`,
        });
        return;
      }

      let capabilityId: string;
      let capabilityCreated: boolean;
      // Resolving by name, not id — filter the supersession chain or this
      // can match a superseded ancestor.
      const { rows: [existingCapability] } = await client.query<{ id: string }>(
        `SELECT id FROM capabilities
          WHERE institution_id = $1 AND name = $2
            AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [institutionId, capabilityName],
      );
      if (existingCapability) {
        capabilityId = existingCapability.id;
        capabilityCreated = false;
      } else {
        const { rows: [newCapability] } = await client.query<{ id: string }>(
          `INSERT INTO capabilities (institution_id, name, owner_person_id)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [institutionId, capabilityName, ownerPersonId],
        );
        capabilityId = newCapability.id;
        capabilityCreated = true;
      }

      // No conflict target named: an unqualified ON CONFLICT DO NOTHING
      // absorbs a violation from EITHER unique constraint on this table —
      // the composite PK (this exact pair already attached) or the partial
      // index offering_capabilities_one_primary (a different capability
      // already holds primary for this offering). Which one fired is
      // disambiguated below rather than guessed.
      const { rows: insertedRows } = await client.query<{ offering_id: string }>(
        `INSERT INTO offering_capabilities (offering_id, capability_id, is_primary)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING offering_id`,
        [offering.id, capabilityId, isPrimary],
      );

      let statusCode = 201;
      if (insertedRows.length === 0) {
        const { rows: [existingPair] } = await client.query(
          'SELECT 1 FROM offering_capabilities WHERE offering_id = $1 AND capability_id = $2',
          [offering.id, capabilityId],
        );
        if (existingPair) {
          statusCode = 200;
        } else {
          const { rows: [existingPrimary] } = await client.query<{
            capability_id: string;
            capability_name: string;
          }>(
            `SELECT oc.capability_id, c.name AS capability_name
               FROM offering_capabilities oc
               JOIN capabilities c ON c.id = oc.capability_id
              WHERE oc.offering_id = $1 AND oc.is_primary = true`,
            [offering.id],
          );
          res.status(409).json({
            message: `Offering already has a primary capability: ${existingPrimary.capability_name}`,
            capability_id: existingPrimary.capability_id,
          });
          return;
        }
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
          basis,
          `Asserted at offering attachment by ${actorPerson.full_name}`,
          actorPersonId,
        ],
      );

      res.status(statusCode).json({
        capability_id: capabilityId,
        capability_created: capabilityCreated,
        evidence_id: evidenceRow.id,
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
        endpoint: 'POST /api/institutions/:institutionId/offerings',
        subjectTable: 'offering_capabilities',
        subjectId: null,
        tenantId: refusalTenantId,
        institutionId,
        attemptedPayload: req.body,
      })) {
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
