import { Router, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { recordAct } from '../lib/governanceAct.js';
import { isUuid } from './params.js';
import { handleGovernanceError, recordRouteRefusal } from '../lib/refusal.js';
import { actorTenantId, isOtherTenant } from '../lib/tenantScope.js';
import { respondServerError } from '../lib/serverError.js';
import { requireSteward } from '../lib/stewardActs.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { listCreditErrata } from '../lib/nonCustomerCredit.js';

/**
 * C3 (LVRF_PLAN §12; Brad's rulings, 26 Oct 2026) — the steward's acts:
 *
 *   POST /api/institutions/:institutionId/customer-roles   name a customer-side role, from a source
 *   POST /api/customer-roles/:id/revoke                    revoke it, with a reason (append-only)
 *   GET  /api/errata/non-customer-credit                    the dry run: the errata the seals call for
 *   POST /api/errata/non-customer-credit                    record them, one per run, refused if the count changed
 *   GET  /api/system-exercise/candidates                    every unmarked evidence row and run, with its own note
 *   POST /api/system-exercise/marks                         mark the ticked ones, refused if the count changed
 *
 * The database is the authority on each (customer_role_grants_guard, the errata guard,
 * system_exercise_marks_guard); the route refuses first, in words. All writes on req.dbClient, inside
 * actorContext's transaction, each with its act.
 */

class Refusal extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MIN_REASON = 12;
const ROLES = ['metric_owner', 'executive_sponsor'] as const;
const MARK_PREFIX = 'Entered to exercise the system, not as case evidence; its own note reads: ';

async function answer(pool: Pool, err: unknown, req: Request, res: Response,
  ctx: { endpoint: string; subjectTable: string; subjectId: string | null; tenantId: string | null; institutionId: string | null }) {
  if (err instanceof Refusal) {
    if (ctx.tenantId) await recordRouteRefusal(pool, req, { ...ctx, tenantId: ctx.tenantId, attemptedPayload: req.body }, err.message);
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (await handleGovernanceError(pool, err, req, res, { ...ctx, attemptedPayload: req.body })) return;
  respondServerError(res, err);
}
const actorOf = (req: Request): string => {
  const a = req.actor?.personId;
  if (!a) throw new Error('req.actor missing on a request past requireActor');
  return a;
};

/** POST /api/institutions/:institutionId/customer-roles */
export function customerRoleGrantRouter(pool: Pool): Router {
  const router = Router();
  /**
   * GET /api/institutions/:institutionId/customer-roles — the account's persons, each with whether a role may be
   * named for them and why not (the guard's own refusals, read ahead; the database stays the authority), their
   * grants (current and revoked, each with its source), and the account's evidence a role may be named from.
   */
  router.get('/:institutionId/customer-roles', async (req, res) => {
    const { institutionId } = req.params;
    if (!isUuid(institutionId)) { res.status(400).json({ message: 'invalid institution id' }); return; }
    try {
      const { rows: [inst] } = await pool.query<{ tenant_id: string; steward: string | null }>(
        'SELECT i.tenant_id, t.steward_person_id AS steward FROM institutions i JOIN tenants t ON t.id = i.tenant_id WHERE i.id = $1 AND i.deleted_at IS NULL', [institutionId]);
      if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      const { rows: persons } = await pool.query(
        `SELECT p.id, p.full_name, coalesce(p.title, '') AS title,
                CASE WHEN p.simulated THEN 'a simulated person holds no customer-side role'
                     WHEN EXISTS (SELECT 1 FROM account_person_links l WHERE l.person_id = p.id AND l.role = 'analyst_of_record')
                          OR coalesce(p.title, '') ~* '(analyst|external)' THEN 'an analyst of record or external, not the customer'
                     WHEN EXISTS (SELECT 1 FROM person_credentials c WHERE c.person_id = p.id) THEN 'has sign-in credentials: vendor-side'
                     ELSE NULL END AS ineligible,
                lvrf_customer_roles(p.id, $1) AS roles
           FROM persons p WHERE p.institution_id = $1 AND p.deleted_at IS NULL ORDER BY p.full_name`, [institutionId]);
      const { rows: grants } = await pool.query(
        `SELECT g.id, g.person_id, pp.full_name AS person, g.role, g.reason, e.id AS source_evidence_id, e.summary AS source_summary, e.provenance AS source,
                s.full_name AS named_by, to_char(g.granted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS named_on,
                to_char(g.revoked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS revoked_on, rp.full_name AS revoked_by, g.revocation_reason
           FROM customer_role_grants g JOIN persons pp ON pp.id = g.person_id JOIN evidence e ON e.id = g.source_evidence_id
           JOIN persons s ON s.id = g.granted_by_person_id LEFT JOIN persons rp ON rp.id = g.revoked_by_person_id
          WHERE g.institution_id = $1 ORDER BY g.granted_at`, [institutionId]);
      const { rows: sources } = await pool.query(
        `SELECT e.id, e.kind::text, e.summary, e.provenance FROM evidence e
          WHERE e.institution_id = $1 AND NOT e.simulated AND e.deleted_at IS NULL AND length(btrim(e.provenance)) >= 3 ORDER BY e.created_at`, [institutionId]);
      res.json({ persons, grants, sources });
    } catch (err) {
      respondServerError(res, err);
    }
  });
  router.post('/:institutionId/customer-roles', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/institutions/:institutionId/customer-roles';
    const client: PoolClient = req.dbClient!;
    const { institutionId } = req.params;
    if (!isUuid(institutionId)) { res.status(400).json({ message: 'invalid institution id' }); return; }
    let tenantId: string | null = null;
    try {
      const actor = actorOf(req);
      const { rows: [inst] } = await client.query<{ tenant_id: string }>('SELECT tenant_id FROM institutions WHERE id = $1 AND deleted_at IS NULL', [institutionId]);
      if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      tenantId = inst.tenant_id;
      if (await refuseUnknownFields(pool, req, res, ['person_id', 'role', 'source_evidence_id', 'reason'],
        { endpoint, subjectTable: 'customer_role_grants', subjectId: null, tenantId, institutionId })) return;
      if (!isRecord(req.body)) throw new Refusal(422, 'Name the person, the role, its source and why.');
      const b = req.body;
      if (typeof b.person_id !== 'string' || !isUuid(b.person_id)) throw new Refusal(422, 'Name the person who holds the role.');
      if (typeof b.role !== 'string' || !(ROLES as readonly string[]).includes(b.role)) throw new Refusal(422, 'Name the role: the metric owner or the executive sponsor.');
      if (typeof b.source_evidence_id !== 'string' || !isUuid(b.source_evidence_id)) {
        throw new Refusal(422, "Name the role's source: the evidence of this account showing the person holds it. No source, no role.");
      }
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why, in at least ${MIN_REASON} characters.`);
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO customer_role_grants (tenant_id, institution_id, person_id, role, source_evidence_id, reason, granted_by_person_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [tenantId, institutionId, b.person_id, b.role, b.source_evidence_id, reason, actor]);
      await recordAct(client, req, 'POST /api/institutions/:institutionId/customer-roles', {
        act: 'grant', tenantId, subjectTable: 'customer_role_grants', subjectId: row.id, resultTable: 'evidence', resultId: b.source_evidence_id, reason,
      });
      res.status(201).json({ customer_role_grant_id: row.id });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'customer_role_grants', subjectId: null, tenantId, institutionId });
    }
  });
  return router;
}

/** POST /api/customer-roles/:id/revoke */
export function customerRoleRevokeRouter(pool: Pool): Router {
  const router = Router();
  router.post('/:id/revoke', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/customer-roles/:id/revoke';
    const client: PoolClient = req.dbClient!;
    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ message: 'invalid role grant id' }); return; }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const actor = actorOf(req);
      const { rows: [g] } = await client.query<{ tenant_id: string; institution_id: string; revoked_at: string | null }>(
        'SELECT tenant_id, institution_id, revoked_at FROM customer_role_grants WHERE id = $1 FOR UPDATE', [id]);
      if (!g || isOtherTenant(req, g.tenant_id, { table: 'customer_role_grants', id })) { res.status(404).json({ message: `role grant ${id} not found` }); return; }
      tenantId = g.tenant_id;
      institutionId = g.institution_id;
      if (await refuseUnknownFields(pool, req, res, ['reason'], { endpoint, subjectTable: 'customer_role_grants', subjectId: id, tenantId, institutionId })) return;
      if (g.revoked_at !== null) throw new Refusal(409, 'This role is already revoked; a revocation is final.');
      const reason = isRecord(req.body) && typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why the role is revoked, in at least ${MIN_REASON} characters.`);
      await client.query(
        'UPDATE customer_role_grants SET revoked_at = now(), revoked_by_person_id = $2, revocation_reason = $3 WHERE id = $1',
        [id, actor, reason]);
      await recordAct(client, req, 'POST /api/customer-roles/:id/revoke', { act: 'withdraw', tenantId, subjectTable: 'customer_role_grants', subjectId: id, reason });
      res.status(200).json({ customer_role_grant_id: id, revoked: true });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'customer_role_grants', subjectId: id, tenantId, institutionId });
    }
  });
  return router;
}

/** GET and POST /api/errata/non-customer-credit */
export function creditErrataRouter(pool: Pool): Router {
  const router = Router();
  router.get('/non-customer-credit', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const list = await listCreditErrata(client, actorTenantId(req));
      await client.query('ROLLBACK');
      res.json({ count: list.length, errata: list });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      respondServerError(res, err);
    } finally {
      client.release();
    }
  });
  router.post('/non-customer-credit', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/errata/non-customer-credit';
    const client: PoolClient = req.dbClient!;
    const tenantId = actorTenantId(req);
    try {
      const actor = actorOf(req);
      if (await refuseUnknownFields(pool, req, res, ['expected_count', 'reason'],
        { endpoint, subjectTable: 'run_errata', subjectId: null, tenantId, institutionId: null },
        (k) => (/score|point|band|text|method/.test(k) ? `body.${k} is not taken: what each erratum states is read from its run's seal by the server` : null))) return;
      const b = isRecord(req.body) ? req.body : {};
      if (typeof b.expected_count !== 'number' || !Number.isInteger(b.expected_count) || b.expected_count < 1) {
        throw new Refusal(422, 'Give the count the dry run showed (expected_count).');
      }
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (reason.length < MIN_REASON) throw new Refusal(422, `Say why they are recorded, in at least ${MIN_REASON} characters.`);
      const list = await listCreditErrata(client, tenantId);
      if (list.length !== b.expected_count) {
        throw new Refusal(409, `The count changed: the seals now call for ${list.length} errata, not ${b.expected_count}. Nothing was recorded; read the list again.`);
      }
      const ids: string[] = [];
      for (const e of list) {
        const { rows: [row] } = await client.query<{ id: string }>(
          `INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, kind, what_was_wrong, what_is_right, reason,
             model_version, model_fingerprint, sealed_score, sealed_band, points_not_credited, recompute_method, recorded_by_person_id)
           VALUES ($1, $2, $3, 'non_customer_credit', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
          [tenantId, e.run_id, e.value_outcome_id,
            'The seal credited points to a person who is not customer-side under the C3 rule.',
            'Only a customer-side person, with a role named from a source, earns attestation, committer or verifier credit (model 1.0.1).',
            reason, e.model_version, e.model_fingerprint, e.sealed_score, e.sealed_band, e.points, e.text, actor]);
        await recordAct(client, req, 'POST /api/errata/non-customer-credit', { act: 'record_erratum', tenantId, subjectTable: 'run_errata', subjectId: row.id, resultTable: 'value_runs', resultId: e.run_id, reason });
        ids.push(row.id);
      }
      res.status(201).json({ recorded: ids.length, erratum_ids: ids });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'run_errata', subjectId: null, tenantId, institutionId: null });
    }
  });
  return router;
}

interface Candidate { subject_table: 'evidence' | 'value_runs'; subject_id: string; account: string; label: string; note: string; reason: string }

/** Every unmarked evidence row and run of the tenant, each with its own note, quoted as the record holds it. */
async function listCandidates(client: PoolClient, tenantId: string): Promise<Candidate[]> {
  const { rows } = await client.query<{ subject_table: 'evidence' | 'value_runs'; subject_id: string; account: string; label: string; note: string }>(
    `SELECT 'evidence' AS subject_table, e.id AS subject_id, i.name AS account,
            e.kind::text || ' · ' || to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS label,
            e.summary || ' (' || e.provenance || ')' AS note, e.created_at AS at
       FROM evidence e JOIN institutions i ON i.id = e.institution_id
      WHERE i.tenant_id = $1 AND NOT EXISTS (SELECT 1 FROM system_exercise_marks m WHERE m.subject_table = 'evidence' AND m.subject_id = e.id)
     UNION ALL
     SELECT 'value_runs', r.id, i.name, g.name || ' · run ' || r.run_number, coalesce(nullif(btrim(r.payload->>'note'), ''), '(no note recorded)'), r.created_at
       FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id
      WHERE r.tenant_id = $1 AND r.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM system_exercise_marks m WHERE m.subject_table = 'value_runs' AND m.subject_id = r.id)
      ORDER BY account, subject_table, at`,
    [tenantId]);
  return rows.map((r) => ({ subject_table: r.subject_table, subject_id: r.subject_id, account: r.account, label: r.label, note: r.note, reason: `${MARK_PREFIX}'${r.note}'` }));
}

/** GET /api/system-exercise/candidates, POST /api/system-exercise/marks */
export function systemExerciseRouter(pool: Pool): Router {
  const router = Router();
  router.get('/candidates', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const candidates = await listCandidates(client, actorTenantId(req));
      const { rows: marked } = await client.query(
        `SELECT m.subject_table, m.subject_id, m.reason, p.full_name AS marked_by, to_char(m.marked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS marked_on
           FROM system_exercise_marks m JOIN persons p ON p.id = m.marked_by_person_id WHERE m.tenant_id = $1 ORDER BY m.marked_at`,
        [actorTenantId(req)]);
      await client.query('ROLLBACK');
      res.json({ candidates, marked });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      respondServerError(res, err);
    } finally {
      client.release();
    }
  });
  router.post('/marks', requireSteward(pool), async (req, res) => {
    const endpoint = 'POST /api/system-exercise/marks';
    const client: PoolClient = req.dbClient!;
    const tenantId = actorTenantId(req);
    try {
      const actor = actorOf(req);
      if (await refuseUnknownFields(pool, req, res, ['items', 'expected_count'],
        { endpoint, subjectTable: 'system_exercise_marks', subjectId: null, tenantId, institutionId: null },
        (k) => (k === 'reason' ? "body.reason is not taken: each mark's reason quotes its item's own note, built by the server" : null))) return;
      const b = isRecord(req.body) ? req.body : {};
      if (typeof b.expected_count !== 'number' || !Number.isInteger(b.expected_count) || b.expected_count < 1) {
        throw new Refusal(422, 'Give the number of items ticked (expected_count).');
      }
      const items = Array.isArray(b.items) ? b.items : [];
      const keys = items.map((x) => (isRecord(x) ? `${x.subject_table}|${x.subject_id}` : ''));
      if (keys.some((k) => !/^(evidence|value_runs)\|[0-9a-f-]{36}$/.test(k)) || new Set(keys).size !== keys.length) {
        throw new Refusal(422, 'Each ticked item names an evidence row or a run, once.');
      }
      const candidates = new Map((await listCandidates(client, tenantId)).map((c) => [`${c.subject_table}|${c.subject_id}`, c]));
      const valid = keys.filter((k) => candidates.has(k));
      if (keys.length !== b.expected_count || valid.length !== b.expected_count) {
        throw new Refusal(409, `The count changed: ${valid.length} of the ${keys.length} items sent are unmarked candidates, and ${b.expected_count} were ticked. Nothing was marked; read the list again.`);
      }
      for (const k of valid) {
        const c = candidates.get(k)!;
        const { rows: [row] } = await client.query<{ id: string }>(
          `INSERT INTO system_exercise_marks (tenant_id, subject_table, subject_id, reason, marked_by_person_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [tenantId, c.subject_table, c.subject_id, c.reason, actor]);
        await recordAct(client, req, 'POST /api/system-exercise/marks', { act: 'mark', tenantId, subjectTable: 'system_exercise_marks', subjectId: row.id,
          resultTable: c.subject_table, resultId: c.subject_id, reason: c.reason });
      }
      res.status(201).json({ marked: valid.length });
    } catch (err) {
      await answer(pool, err, req, res, { endpoint, subjectTable: 'system_exercise_marks', subjectId: null, tenantId, institutionId: null });
    }
  });
  return router;
}
