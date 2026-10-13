import { createHash, randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import type { Pool, PoolClient } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';
import { isOtherTenant } from '../lib/tenantScope.js';
import { insertEvidence, insertFactWithEvidence } from '../lib/institutionFactWriter.js';
import {
  INSTITUTION_FACT_CONTRACT_VERSION, INSTITUTION_PROMPT_TEMPLATE_VERSION, buildAccountPrompt, evidenceKindFor,
  validateEntity, validateFact, validateNotFound, validateRegime,
  type GateMode, type ResearchedEntity, type ResearchedFact, type ResearchedRegime,
} from '../research/contracts.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * Q4h — account research intake (3.0 item 6), with the minimum of items 3
 * (the entity is pinned) and 4 (the disclosure regime), and L6 and L8.
 * Plan: docs/LVRF_PLAN.md §4e. Inside the research-intake seam (CLAUDE.md,
 * D1): this file and industryResearch.ts are the only writers of
 * research_prompts and research_results.
 *
 *   GET  /api/institutions/:institutionId/research          the account's research state
 *   POST /api/institutions/:institutionId/research-prompts  generate (authorized)
 *   POST /api/institutions/:institutionId/research-results  parse (authorized)
 *   POST /api/account-research-results/:id/accept|reject    review (authorized — H2)
 *   POST /api/institutions/:institutionId/entity/supersede  correct the pinned entity (authorized)
 *
 * WHO REVIEWS (H2): an AUTHORIZED user, not the steward. Q3 made recording a
 * fact an authorized act; accepting a researched fact IS recording a fact,
 * with research as its source. The pack is the steward's because every
 * account inherits it; a fact is one account's. Pinning the entity and
 * recording the regime are account-scoped too. The guard on the entity is
 * the exact-identifier rule at parse, and supersession to correct it.
 *
 * NO HOP LEFT SHORT: accepting writes the evidence row and the fact (or the
 * entity) in ONE transaction through the one writer
 * (lib/institutionFactWriter.ts), and the review — or nothing at all.
 *
 * H1: accepting a found field requires the reviewer to confirm they opened
 * its citation; the evidence is written citation_resolved by that person.
 *
 * L8: a parse refusal is recorded in `refusals` (source 'parser') through
 * the POOL — the request's own transaction rolls back on a 422 — exactly as
 * handleGovernanceError records a database refusal.
 *
 * Each parsed row's raw_response is { subject, item, ai_sourced }: the one
 * object the agent returned for that field, which subject it is, and the
 * envelope's ai_sourced (needed for the evidence row at accept).
 */

class ValidationError extends Error {
  constructor(public readonly issues: string[]) { super(issues.join('; ')); }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
type Subject = 'entity' | 'disclosure_regime' | 'fact' | 'not_found';

interface Institution { id: string; tenant_id: string; name: string; website: string | null }
interface PinnedEntity { id: string; legal_name: string; identifier_type: string; identifier: string; registry_jurisdiction: string | null }

async function findInstitution(client: PoolClient | Pool, req: Request, institutionId: string): Promise<Institution | null> {
  const { rows: [institution] } = await client.query<Institution>(
    `SELECT id, tenant_id, name, website FROM institutions
      WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
    [institutionId],
  );
  if (!institution || isOtherTenant(req, institution.tenant_id, { table: 'institutions', id: institutionId })) return null;
  return institution;
}

async function currentEntity(client: PoolClient | Pool, institutionId: string): Promise<PinnedEntity | null> {
  const { rows: [e] } = await client.query<PinnedEntity>(
    `SELECT id, legal_name, identifier_type, identifier, registry_jurisdiction FROM institution_entities
      WHERE institution_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
    [institutionId],
  );
  return e ?? null;
}

async function currentRegime(client: PoolClient | Pool, institutionId: string): Promise<{ id: string; value: string; as_of: string } | null> {
  const { rows: [r] } = await client.query<{ id: string; value: string; as_of: string }>(
    `SELECT id, value_text AS value, as_of::text FROM institution_facts
      WHERE institution_id = $1 AND kind = 'disclosure_regime' AND deleted_at IS NULL AND superseded_by_id IS NULL
      ORDER BY as_of DESC, created_at DESC LIMIT 1`,
    [institutionId],
  );
  return r ?? null;
}

const describe = (e: { legal_name: string; identifier_type: string; identifier: string; registry_jurisdiction?: string | null }) =>
  `${e.legal_name}, ${e.identifier_type} ${e.identifier}${e.registry_jurisdiction ? ` (${e.registry_jurisdiction})` : ''}`;

/** The same identifier: exact, except a ticker, compared without case. */
function sameEntity(a: { identifier_type: string; identifier: string; registry_jurisdiction: string | null }, b: typeof a): boolean {
  if (a.identifier_type !== b.identifier_type) return false;
  const norm = (s: string) => (a.identifier_type === 'ticker' ? s.trim().toUpperCase() : s.trim());
  return norm(a.identifier) === norm(b.identifier)
    && (a.registry_jurisdiction ?? '').trim().toUpperCase() === (b.registry_jurisdiction ?? '').trim().toUpperCase();
}

/**
 * Facts accepted while an entity that is no longer current was the account's
 * entity: from a facts prompt that named it, or from the entity-phase prompt
 * that pinned it (the regime). Listed, never changed or hidden: a person
 * reviews them against the corrected entity.
 */
const UNDER_PREVIOUS_ENTITY_SQL = `
  SELECT f.id AS fact_id, f.kind::text AS kind,
         coalesce(f.value_text, f.value_numeric::text || coalesce(' ' || f.unit, '')) AS value, f.as_of::text AS as_of,
         e.id AS entity_id, e.legal_name, e.identifier_type::text AS identifier_type, e.identifier, r.id AS research_result_id
    FROM institution_entities e
    JOIN research_results r ON r.institution_id = e.institution_id AND r.review_state = 'accepted'
                           AND r.institution_fact_id IS NOT NULL
    JOIN research_prompts p ON p.id = r.prompt_id
    JOIN institution_facts f ON f.id = r.institution_fact_id
   WHERE e.institution_id = $1 AND (e.superseded_by_id IS NOT NULL OR e.deleted_at IS NOT NULL)
     AND ($2::uuid IS NULL OR e.id = $2)
     AND (p.entity_id = e.id
          OR p.id = (SELECT x.prompt_id FROM research_results x WHERE x.institution_entity_id = e.id LIMIT 1))
   ORDER BY f.kind, f.as_of, f.id`;

/** L8 — a parser's 422, recorded through the pool (the request rolls back). */
async function recordParseRefusal(pool: Pool, req: Request, tenantId: string, institutionId: string, issues: string[]): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO refusals (tenant_id, institution_id, actor_person_id, endpoint, subject_table, subject_id,
                             source, sqlstate, constraint_name, message, attempted_payload)
       VALUES ($1, $2, $3, 'POST /api/institutions/:institutionId/research-results', 'research_results', NULL,
               'parser', NULL, NULL, $4, $5)`,
      [tenantId, institutionId, req.actor!.personId, `${issues.length} issue(s) found; nothing was written. ${issues.join(' | ')}`, req.body ?? {}],
    );
  } catch (err) {
    // A failure to record must never change the answer — the 422 stands.
    console.error('LVRF: failed to record a parse refusal (L8). The 422 still stands.', err);
  }
}

export function accountResearchRouter(pool: Pool): Router {
  const router = Router();

  // GET — the account's research state, for the account page's Research
  // section: the pinned entity, the regime, the prompts, the pending
  // results, and what research reported it could not find.
  router.get('/:institutionId/research', async (req, res) => {
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    try {
      const institution = await findInstitution(pool, req, institutionId);
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      const { rows: [entity] } = await pool.query(
        `SELECT e.id, e.legal_name, e.identifier_type, e.identifier, e.registry_jurisdiction, e.created_at,
                p.full_name AS captured_by, ev.provenance, ev.source_reference, ev.citation_resolved
           FROM institution_entities e JOIN persons p ON p.id = e.captured_by_person_id JOIN evidence ev ON ev.id = e.evidence_id
          WHERE e.institution_id = $1 AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL`,
        [institutionId],
      );
      const regime = await currentRegime(pool, institutionId);
      const { rows: prompts } = await pool.query(
        `SELECT p.id, p.phase, p.generated_at, g.full_name AS generated_by, p.contract_version, p.template_version,
                p.prompt_sha256, p.entity_id,
                (SELECT count(*)::int FROM research_results r WHERE r.prompt_id = p.id) AS results_count, p.prompt_text
           FROM research_prompts p JOIN persons g ON g.id = p.generated_by_person_id
          WHERE p.institution_id = $1 AND p.result_kind = 'institution_fact'
          ORDER BY p.generated_at DESC, p.id`,
        [institutionId],
      );
      const { rows: pending } = await pool.query(
        `SELECT r.id, r.field_name, r.found, r.not_found_reason, r.parsed_at, pb.full_name AS parsed_by,
                r.research_tool, r.prompt_id, r.contract_version, r.raw_response
           FROM research_results r JOIN persons pb ON pb.id = r.parsed_by_person_id
          WHERE r.institution_id = $1 AND r.result_kind = 'institution_fact' AND r.review_state = 'pending'
          ORDER BY r.parsed_at, r.field_name, r.id`,
        [institutionId],
      );
      const { rows: notFound } = await pool.query(
        `SELECT r.field_name AS kind, r.not_found_reason AS reason, r.reviewed_at, rv.full_name AS reviewed_by
           FROM research_results r JOIN persons rv ON rv.id = r.reviewed_by_person_id
          WHERE r.institution_id = $1 AND r.result_kind = 'institution_fact'
            AND r.review_state = 'accepted' AND r.found = false
          ORDER BY r.reviewed_at DESC, r.field_name`,
        [institutionId],
      );
      const { rows: underPrevious } = await pool.query(UNDER_PREVIOUS_ENTITY_SQL, [institutionId, null]);
      res.json({
        institution: { id: institution.id, name: institution.name },
        under_previous_entity: underPrevious,
        contract_version_now: INSTITUTION_FACT_CONTRACT_VERSION,
        phase_now: entity ? 'facts' : 'entity',
        entity: entity ?? null,
        regime,
        prompts,
        pending,
        not_found: notFound,
      });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  // POST — generate the prompt from live rows; its phase is decided by
  // whether an entity is pinned. Stored immutably (research_prompts).
  router.post('/:institutionId/research-prompts', async (req, res) => {
    const client = req.dbClient!;
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      const institution = await findInstitution(client, req, institutionId);
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      refusalTenantId = institution.tenant_id;
      const entity = await currentEntity(client, institutionId);
      const regime = await currentRegime(client, institutionId);
      const { rows: facts } = await client.query<{ kind: string; value: string; as_of: string }>(
        `SELECT kind::text, coalesce(value_text, value_numeric::text || coalesce(' ' || unit, '')) AS value, as_of::text
           FROM institution_facts
          WHERE institution_id = $1 AND kind <> 'disclosure_regime' AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [institutionId],
      );
      const { rows: notFound } = await client.query<{ kind: string; reason: string; reviewed_at: string }>(
        `SELECT field_name AS kind, not_found_reason AS reason, reviewed_at::text FROM research_results
          WHERE institution_id = $1 AND result_kind = 'institution_fact' AND review_state = 'accepted' AND found = false`,
        [institutionId],
      );
      const promptId = randomUUID();
      const text = buildAccountPrompt({
        promptId,
        institution: { name: institution.name, website: institution.website },
        entity, regime, facts, notFound,
      });
      const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
      const phase = entity ? 'facts' : 'entity';
      await client.query(
        `INSERT INTO research_prompts (
           id, tenant_id, institution_id, result_kind, phase, entity_id, contract_version, template_version,
           prompt_text, prompt_sha256, generated_by_person_id
         ) VALUES ($1, $2, $3, 'institution_fact', $4, $5, $6, $7, $8, $9, $10)`,
        [promptId, institution.tenant_id, institutionId, phase, entity?.id ?? null,
          INSTITUTION_FACT_CONTRACT_VERSION, INSTITUTION_PROMPT_TEMPLATE_VERSION, text, sha256, actorPersonId],
      );
      res.status(201).json({
        prompt_id: promptId, phase, prompt_sha256: sha256,
        contract_version: INSTITUTION_FACT_CONTRACT_VERSION, template_version: INSTITUTION_PROMPT_TEMPLATE_VERSION,
        entity: entity ? describe(entity) : null, prompt: text,
      });
    } catch (err) {
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/institutions/:institutionId/research-prompts', subjectTable: 'research_prompts',
        subjectId: null, tenantId: refusalTenantId, institutionId, attemptedPayload: req.body,
      })) return;
      respondServerError(res, err);
    }
  });

  // POST — parse. Refuse wholesale; every issue named; recorded (L8).
  router.post('/:institutionId/research-results', async (req, res) => {
    const client = req.dbClient!;
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      const institution = await findInstitution(client, req, institutionId);
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      refusalTenantId = institution.tenant_id;

      const body = req.body;
      const issues: string[] = [];
      if (!isRecord(body)) throw new ValidationError(['body is required']);

      const env = (k: string) => {
        const v = body[k];
        if (typeof v !== 'string' || v.trim() === '') { issues.push(`body.${k} is required`); return undefined; }
        return v;
      };
      const researchQuery = env('research_query');
      const queryAsExecuted = env('query_as_executed');
      const researchTool = env('research_tool');
      const aiSourced = body['ai_sourced'];
      if (typeof aiSourced !== 'boolean') issues.push('body.ai_sourced must be true or false: whether an AI system did the research');

      // The prompt this response answered.
      const promptId = body['prompt_id'];
      let prompt: { phase: 'entity' | 'facts'; contract_version: number; entity_id: string | null } | undefined;
      if (typeof promptId !== 'string' || !isUuid(promptId)) {
        issues.push(`body.prompt_id is required: the id of the prompt this response answered. Generate one with POST /api/institutions/${institutionId}/research-prompts.`);
      } else {
        ({ rows: [prompt] } = await client.query(
          `SELECT phase, contract_version, entity_id FROM research_prompts
            WHERE id = $1 AND institution_id = $2 AND result_kind = 'institution_fact'`,
          [promptId, institutionId],
        ));
        if (!prompt) issues.push(`body.prompt_id ${promptId} is not a research prompt for institution ${institutionId}.`);
        else if (prompt.contract_version !== INSTITUTION_FACT_CONTRACT_VERSION) {
          issues.push(`the prompt was generated against v${prompt.contract_version}; the contract is now v${INSTITUTION_FACT_CONTRACT_VERSION}; generate a new prompt.`);
        }
      }

      const pinned = await currentEntity(client, institutionId);
      const rows: { subject: Subject; fieldName: string; found: boolean; reason: string | null; item: unknown }[] = [];
      const notFoundRaw = body['not_found'];
      if (!Array.isArray(notFoundRaw)) issues.push('body.not_found is required: a list ([] if research found everything it was asked for)');
      const notFound = Array.isArray(notFoundRaw)
        ? notFoundRaw.map((n, i) => validateNotFound(n, `not_found[${i}]`, 'parse', issues)) : [];
      const notFoundKinds = new Set(notFound.filter((n) => n).map((n) => n!.kind));

      if (prompt?.phase === 'entity') {
        // Phase ENTITY: the entity and the regime only.
        if (pinned) issues.push(`an entity is already pinned for this account (${describe(pinned)}); generate a facts prompt instead.`);
        const facts = body['facts'];
        if (facts !== undefined && !(Array.isArray(facts) && facts.length === 0)) {
          issues.push('body.facts: facts are refused until the entity is pinned — this prompt is phase "entity". Accept the entity first, then generate a facts prompt.');
        }
        if (body['entity'] !== undefined) {
          const e = validateEntity(body['entity'], 'entity', 'parse', issues);
          if (e) rows.push({ subject: 'entity', fieldName: 'entity', found: true, reason: null, item: body['entity'] });
        } else if (!notFoundKinds.has('entity')) issues.push('body.entity is required (or a not_found for "entity", with the reason)');
        if (body['disclosure_regime'] !== undefined) {
          const r = validateRegime(body['disclosure_regime'], 'disclosure_regime', 'parse', issues);
          if (r) rows.push({ subject: 'disclosure_regime', fieldName: 'disclosure_regime', found: true, reason: null, item: body['disclosure_regime'] });
        } else if (!notFoundKinds.has('disclosure_regime')) issues.push('body.disclosure_regime is required (or a not_found for "disclosure_regime", with the reason)');
        for (const n of notFound) {
          if (!n) continue;
          if (n.kind !== 'entity' && n.kind !== 'disclosure_regime') issues.push(`not_found "${n.kind}": a facts-phase kind, refused until the entity is pinned.`);
        }
      } else if (prompt?.phase === 'facts') {
        // Phase FACTS: the response must be about the pinned entity.
        const said = validateEntity(body['entity'], 'entity', 'parse', issues);
        const promptEntity = prompt.entity_id;
        if (!pinned || pinned.id !== promptEntity) {
          issues.push('the account\'s entity was corrected since this prompt was generated; generate a new prompt.');
        } else if (said && !sameEntity(said, pinned)) {
          issues.push(`this response is about ${describe(said)}; the account's entity is ${describe(pinned)}; nothing was written.`);
        }
        if (body['disclosure_regime'] !== undefined) {
          issues.push('body.disclosure_regime: the regime is recorded in the entity phase; correct it by supersession, not in a facts response.');
        }
        const facts = body['facts'];
        if (!Array.isArray(facts)) issues.push('body.facts is required: a list ([] if every kind is in not_found)');
        else facts.forEach((f, i) => {
          const v = validateFact(f, `facts[${i}]`, 'parse', issues);
          if (v) rows.push({ subject: 'fact', fieldName: v.kind, found: true, reason: null, item: f });
        });
        for (const n of notFound) {
          if (n && (n.kind === 'entity' || n.kind === 'disclosure_regime')) issues.push(`not_found "${n.kind}": not a facts-phase kind.`);
        }
      }
      for (const n of notFound) if (n) rows.push({ subject: 'not_found', fieldName: n.kind, found: false, reason: n.reason, item: n });
      if (issues.length === 0 && rows.length === 0) issues.push('the response carries nothing to record: no entity, regime, fact or not_found.');

      if (issues.length > 0) throw new ValidationError(issues);

      const results: { id: string; field_name: string; found: boolean }[] = [];
      for (const r of rows) {
        const { rows: [inserted] } = await client.query<{ id: string; field_name: string; found: boolean }>(
          `INSERT INTO research_results (
             tenant_id, result_kind, institution_id, field_name, found, not_found_reason, raw_response,
             research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version
           ) VALUES ($1, 'institution_fact', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id, field_name, found`,
          [institution.tenant_id, institutionId, r.fieldName, r.found, r.reason,
            { subject: r.subject, item: r.item, ai_sourced: aiSourced },
            researchQuery!, queryAsExecuted!, researchTool!, actorPersonId, promptId, INSTITUTION_FACT_CONTRACT_VERSION],
        );
        results.push(inserted);
      }
      res.status(201).json({ count: results.length, results });
    } catch (err) {
      if (err instanceof ValidationError) {
        if (refusalTenantId) await recordParseRefusal(pool, req, refusalTenantId, institutionId, err.issues);
        res.status(422).json({ message: `${err.issues.length} issue(s) found; nothing was written.`, issues: err.issues });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/institutions/:institutionId/research-results', subjectTable: 'research_results',
        subjectId: null, tenantId: refusalTenantId, institutionId, attemptedPayload: req.body,
      })) return;
      respondServerError(res, err);
    }
  });

  // POST — correct the pinned entity by SUPERSEDING it (3.0 item 3): an
  // authorized act, as pinning is. A new entity row with its evidence, then
  // the old row pointed at it with the reason — one transaction; the
  // deferred one-current trigger (hardening.sql 19) checks at commit. The
  // facts accepted under the old entity are LISTED in the response, never
  // changed or hidden: a person reviews them. Every later prompt names the
  // new entity, and a response or a pending fact under the old one is
  // refused (the guards in parse and accept).
  router.post('/:institutionId/entity/supersede', async (req, res) => {
    const client = req.dbClient!;
    const institutionId = req.params.institutionId;
    if (!isUuid(institutionId)) {
      res.status(400).json({ message: `invalid institution id: ${institutionId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    let refusalTable = 'institution_entities';
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      const body = req.body;
      if (!isRecord(body)) throw new ValidationError(['body is required']);
      const issues: string[] = [];
      const reason = body['supersession_reason'];
      if (typeof reason !== 'string' || reason.trim().length < 12) {
        issues.push('body.supersession_reason must state why the entity is being corrected, in at least 12 characters');
      }
      const citation = body['citation'];
      if (typeof citation !== 'string' || citation.trim().length < 12) {
        issues.push('body.citation must name where the corrected entity is established, in at least 12 characters');
      }
      // The new entity, by the same reader research uses (caveats optional here: a person typed it).
      const entity = validateEntity(
        { caveats: [], source_kind: body['source_kind'], citation, legal_name: body['legal_name'],
          identifier_type: body['identifier_type'], identifier: body['identifier'],
          registry_jurisdiction: body['registry_jurisdiction'] ?? null },
        'body', 'parse', issues,
      );
      const institution = await findInstitution(client, req, institutionId);
      if (!institution) {
        res.status(404).json({ message: `institution ${institutionId} not found` });
        return;
      }
      refusalTenantId = institution.tenant_id;
      const { rows: [old] } = await client.query<PinnedEntity>(
        `SELECT id, legal_name, identifier_type, identifier, registry_jurisdiction FROM institution_entities
          WHERE institution_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
          FOR UPDATE`,
        [institutionId],
      );
      if (!old) {
        res.status(409).json({ message: 'no entity is pinned for this account: research the entity first; there is nothing to correct.' });
        return;
      }
      if (entity && sameEntity(entity, old)) issues.push(`the corrected entity is the pinned one (${describe(old)}); nothing to correct.`);
      if (issues.length > 0 || !entity) throw new ValidationError(issues);

      refusalTable = 'evidence';
      const evidenceId = await insertEvidence(client, institutionId,
        `Entity: ${describe(entity)} (corrects ${describe(old)})`,
        {
          evidenceKind: evidenceKindFor(entity.source_kind), provenance: entity.citation, confidence: 'medium',
          sourceReference: entity.citation, sourceVerified: false, aiSourced: false, researchQuery: null, researchTool: null,
        }, actorPersonId);
      refusalTable = 'institution_entities';
      const { rows: [created] } = await client.query<{ id: string }>(
        `INSERT INTO institution_entities (institution_id, legal_name, identifier_type, identifier, registry_jurisdiction,
                                           evidence_id, captured_by_person_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [institutionId, entity.legal_name, entity.identifier_type, entity.identifier, entity.registry_jurisdiction, evidenceId, actorPersonId],
      );
      const { rows: [pointed] } = await client.query<{ id: string }>(
        `UPDATE institution_entities SET superseded_by_id = $1, supersession_reason = $2
          WHERE id = $3 AND superseded_by_id IS NULL AND deleted_at IS NULL RETURNING id`,
        [created.id, reason, old.id],
      );
      if (!pointed) {
        res.status(409).json({ message: 'the entity was corrected by another request just now; reload to see the current one.' });
        return;
      }
      const { rows: underPrevious } = await client.query(UNDER_PREVIOUS_ENTITY_SQL, [institutionId, old.id]);
      res.status(201).json({
        entity_id: created.id,
        superseded_entity_id: old.id,
        entity: describe(entity),
        superseded_entity: describe(old),
        evidence_id: evidenceId,
        // Listed, not changed: each was accepted under the previous entity.
        facts_accepted_under_previous_entity: underPrevious,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: `${err.issues.length} issue(s) found; nothing was written.`, issues: err.issues });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/institutions/:institutionId/entity/supersede', subjectTable: refusalTable,
        subjectId: null, tenantId: refusalTenantId, institutionId, attemptedPayload: req.body,
      })) return;
      respondServerError(res, err);
    }
  });

  return router;
}

/**
 * Accept and reject — mounted at /api/account-research-results. AUTHORIZED
 * acts (H2), not the steward's: see the file comment.
 */
export function accountResearchReviewRouter(pool: Pool): Router {
  const router = Router();

  interface Candidate {
    id: string; tenant_id: string; institution_id: string; field_name: string; found: boolean;
    review_state: string; reviewed_by: string | null; reviewed_at: string | null; raw_response: unknown;
    research_query: string; research_tool: string; prompt_phase: string | null; prompt_entity_id: string | null;
  }

  async function findCandidate(client: PoolClient, req: Request, resultId: string): Promise<Candidate | null> {
    const { rows: [c] } = await client.query<Candidate>(
      `SELECT r.id, r.tenant_id, r.institution_id, r.field_name, r.found, r.review_state, rv.full_name AS reviewed_by,
              r.reviewed_at, r.raw_response, r.research_query, r.research_tool,
              p.phase AS prompt_phase, p.entity_id AS prompt_entity_id
         FROM research_results r
         LEFT JOIN persons rv ON rv.id = r.reviewed_by_person_id
         LEFT JOIN research_prompts p ON p.id = r.prompt_id
        WHERE r.id = $1 AND r.result_kind = 'institution_fact'
        FOR UPDATE OF r`,
      [resultId],
    );
    if (!c || isOtherTenant(req, c.tenant_id, { table: 'research_results', id: resultId })) return null;
    return c;
  }

  function reviewNote(body: unknown): string {
    if (!isRecord(body)) throw new ValidationError(['body is required']);
    const n = body['review_note'];
    if (typeof n !== 'string' || n.trim() === '') throw new ValidationError(['body.review_note is required']);
    return n;
  }

  const alreadyDecided = (c: Candidate) =>
    `research result ${c.id} is already ${c.review_state}, by ${c.reviewed_by ?? 'an unnamed reviewer'} at ` +
    `${c.reviewed_at ? new Date(c.reviewed_at).toISOString() : 'an unknown time'}. A decision is not amended; it is a fact.`;

  router.post('/:id/accept', async (req, res) => {
    const client = req.dbClient!;
    const resultId = req.params.id;
    if (!isUuid(resultId)) {
      res.status(400).json({ message: `invalid research result id: ${resultId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    let refusalTable = 'research_results';
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      const note = reviewNote(req.body);
      const c = await findCandidate(client, req, resultId);
      if (!c) {
        res.status(404).json({ message: `account research result ${resultId} not found` });
        return;
      }
      refusalTenantId = c.tenant_id;
      if (c.review_state !== 'pending') {
        res.status(409).json({ message: alreadyDecided(c) });
        return;
      }
      const { rows: [inst] } = await client.query(
        'SELECT 1 FROM institutions WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL', [c.institution_id],
      );
      if (!inst) {
        res.status(409).json({ message: `the account this result is about is retired or superseded; nothing was written.` });
        return;
      }
      const raw = isRecord(c.raw_response) ? c.raw_response : {};
      const subject = raw['subject'] as Subject;
      const item = raw['item'];
      const aiSourced = raw['ai_sourced'] === true;

      if (c.found && (req.body as Record<string, unknown>)['citation_opened'] !== true) {
        // H1 — a person opens the citation before the field becomes a fact.
        throw new ValidationError([
          'body.citation_opened must be true: accepting a researched field requires you to confirm you opened its ' +
          'citation and it says this (H1). It is recorded as resolved by you.',
        ]);
      }

      let evidenceId: string | null = null;
      let factId: string | null = null;
      let entityId: string | null = null;
      const mode: GateMode = 'accept';
      const evidenceBase = (sourceKind: Parameters<typeof evidenceKindFor>[0], citation: string, extra: string) => ({
        evidenceKind: evidenceKindFor(sourceKind),
        provenance: `Research (${c.research_tool}): ${citation}${extra}`,
        confidence: 'low' as const,
        sourceReference: citation,
        sourceVerified: false,
        aiSourced,
        researchQuery: aiSourced ? c.research_query : null,
        researchTool: aiSourced ? c.research_tool : null,
        citationResolvedByPersonId: actorPersonId,
      });

      if (subject === 'entity') {
        const issues: string[] = [];
        const e = validateEntity(item, 'raw_response.item', mode, issues) as ResearchedEntity | null;
        if (!e) throw new ValidationError(issues);
        const pinned = await currentEntity(client, c.institution_id);
        if (pinned) {
          res.status(409).json({ message: `this account's entity is already pinned (${describe(pinned)}); an entity is corrected by supersession, not a second accept.` });
          return;
        }
        refusalTable = 'evidence';
        evidenceId = await insertEvidence(client, c.institution_id, `Entity: ${describe(e)}`,
          evidenceBase(e.source_kind, e.citation, ''), actorPersonId);
        refusalTable = 'institution_entities';
        ({ rows: [{ id: entityId }] } = await client.query<{ id: string }>(
          `INSERT INTO institution_entities (institution_id, legal_name, identifier_type, identifier, registry_jurisdiction,
                                             evidence_id, captured_by_person_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [c.institution_id, e.legal_name, e.identifier_type, e.identifier, e.registry_jurisdiction, evidenceId, actorPersonId],
        ));
      } else if (subject === 'disclosure_regime' || subject === 'fact') {
        const pinned = await currentEntity(client, c.institution_id);
        if (!pinned) {
          res.status(409).json({ message: 'no entity is pinned for this account: accept the entity first.' });
          return;
        }
        const issues: string[] = [];
        if (subject === 'disclosure_regime') {
          const r = validateRegime(item, 'raw_response.item', mode, issues) as ResearchedRegime | null;
          if (!r) throw new ValidationError(issues);
          const existing = await currentRegime(client, c.institution_id);
          if (existing) {
            res.status(409).json({ message: `a disclosure regime is already recorded (${existing.value}, as of ${existing.as_of}); correct it by superseding that fact.` });
            return;
          }
          ({ factId, evidenceId } = await insertFactWithEvidence(client, c.institution_id, 'disclosure_regime', {
            valueNumeric: null, valueText: r.value, unit: null, asOf: r.as_of,
            ...evidenceBase(r.source_kind, r.citation, ` — ${r.basis}`),
          }, actorPersonId, (t) => { refusalTable = t; }));
        } else {
          if (c.prompt_phase !== 'facts' || c.prompt_entity_id !== pinned.id) {
            res.status(409).json({ message: `this fact was researched against an entity that is no longer the account's (${describe(pinned)} is current); re-run under a new prompt.` });
            return;
          }
          const f = validateFact(item, 'raw_response.item', mode, issues) as ResearchedFact | null;
          if (!f) throw new ValidationError(issues);
          ({ factId, evidenceId } = await insertFactWithEvidence(client, c.institution_id, f.kind, {
            valueNumeric: typeof f.value === 'number' ? f.value : null,
            valueText: typeof f.value === 'string' ? f.value : null,
            unit: f.unit, asOf: f.as_of,
            ...evidenceBase(f.source_kind, f.citation, ` — "${f.quote}" (${f.period})`),
          }, actorPersonId, (t) => { refusalTable = t; }));
        }
      } else if (subject !== 'not_found') {
        throw new ValidationError([`raw_response.subject "${String(subject)}" is not one this route knows`]);
      }

      // A not-found is accepted as not found: the reason is the record,
      // and nothing else is written (research_results_accepted_has_record).
      refusalTable = 'research_results';
      await client.query(
        `UPDATE research_results
            SET review_state = 'accepted', reviewed_by_person_id = $2, review_note = $3,
                evidence_id = $4, institution_fact_id = $5, institution_entity_id = $6
          WHERE id = $1`,
        [resultId, actorPersonId, note, evidenceId, factId, entityId],
      );
      res.status(200).json({
        id: resultId, review_state: 'accepted', subject,
        evidence_id: evidenceId, institution_fact_id: factId, institution_entity_id: entityId,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: `${err.issues.length} issue(s) found; nothing was written.`, issues: err.issues });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/account-research-results/:id/accept', subjectTable: refusalTable,
        subjectId: resultId, tenantId: refusalTenantId, institutionId: null, attemptedPayload: req.body,
      })) return;
      respondServerError(res, err);
    }
  });

  router.post('/:id/reject', async (req, res) => {
    const client = req.dbClient!;
    const resultId = req.params.id;
    if (!isUuid(resultId)) {
      res.status(400).json({ message: `invalid research result id: ${resultId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');
      const note = reviewNote(req.body);
      const c = await findCandidate(client, req, resultId);
      if (!c) {
        res.status(404).json({ message: `account research result ${resultId} not found` });
        return;
      }
      refusalTenantId = c.tenant_id;
      if (c.review_state !== 'pending') {
        res.status(409).json({ message: alreadyDecided(c) });
        return;
      }
      // A rejection is kept: "we researched this and rejected it" is a fact.
      await client.query(
        `UPDATE research_results SET review_state = 'rejected', reviewed_by_person_id = $2, review_note = $3 WHERE id = $1`,
        [resultId, actorPersonId, note],
      );
      res.status(200).json({ id: resultId, review_state: 'rejected' });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ message: `${err.issues.length} issue(s) found; nothing was written.`, issues: err.issues });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/account-research-results/:id/reject', subjectTable: 'research_results',
        subjectId: resultId, tenantId: refusalTenantId, institutionId: null, attemptedPayload: req.body,
      })) return;
      respondServerError(res, err);
    }
  });

  return router;
}
