import { createHash, randomUUID } from 'node:crypto';
import { recordAct } from '../lib/governanceAct.js';
import { Router, type Request } from 'express';
import type { Pool, PoolClient } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';
import { readImportText, ImportTextError, type ImportText } from '../research/importText.js';
import { actorTenantId, isOtherTenant } from '../lib/tenantScope.js';
import { requireSteward } from '../lib/stewardActs.js';
import {
  INDUSTRY_MEASURE_CONTRACT, PROMPT_TEMPLATE_VERSION, buildIndustryMeasurePrompt, contractColumns, validateMeasure,
} from '../research/contracts.js';
import { respondServerError } from '../lib/serverError.js';

/**
 * 2.0 item 5, industry packs — pack parse-and-review.
 *
 * Step 1, PARSE (industryResearchRouter, below): a research agent's JSON
 * response for one industry becomes pending research_results rows. Step 2,
 * ACCEPT/REJECT (researchResultsReviewRouter, further below): a person
 * turns a pending row into a judgement — accept promotes it to a proposed
 * industry_measures row; reject records that it was unsound. Parsing and
 * reviewing are different facts (see the WHAT THIS DOES AND DOES NOT DO
 * paragraph below), AND different scopes — parsing is industry-scoped,
 * reviewing is not — so they are two routers in this one file, mounted at
 * two different prefixes (server/index.ts), not one router serving both.
 * See researchResultsReviewRouter's own comment for why.
 *
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary and decides on
 * commit vs rollback from the response status once this handler returns.
 *
 * WHAT THIS DOES AND DOES NOT DO. This takes a research agent's JSON
 * response for one industry, validates it against the pack-measure
 * contract, and writes one research_results row per measure with
 * result_kind = 'industry_measure' and review_state = 'pending'. It does
 * NOT create industry_measures rows. Parsing establishes that the agent
 * returned this; accepting establishes that a person judged it sound —
 * those are different facts (see research_results, db/schema.ts /
 * db/drizzle/0018), and this endpoint only does the first.
 *
 * REFUSE WHOLESALE, NOT PARTIALLY. If any measure in the payload fails
 * validation, NOTHING is written — not the measures that did validate,
 * not a partial row for the ones that didn't — and the 422 names every
 * failing measure and field, not just the first. A parser that accepts
 * what it understands and drops the rest is how a research result becomes
 * half-applied with nobody noticing: a reviewer working the accepted rows
 * would have no way to know four more measures were silently dropped from
 * the same response. All validation therefore runs to completion,
 * collecting every failure, before a single INSERT is attempted.
 *
 * VERSION DRIFT IS EXPECTED, AND IS A REFUSAL, NOT A REPAIR. Three
 * research runs exist against this contract and only one conforms: the
 * CDMO run predates addressable_by_workforce_capability entirely, and the
 * Manufacturing run has addressable_by_workforce_capability but no
 * confounders. Both are refused here, not patched. The alternative — let
 * a reviewer supply the missing field at accept time — would make the
 * REVIEWER the source of a claim that was supposed to come from the
 * research: the citation and the reasoning behind a field must originate
 * together, from the same research pass, or the field is not evidence of
 * anything, it is a person's guess wearing the shape of one. So a missing
 * required field is refused with a message saying the response predates
 * the current contract and must be RE-RUN — not that a field is merely
 * absent, which would read like something this endpoint could fix by
 * asking nicely.
 *
 * NO PER-FIELD COLUMNS for the measure shape. raw_response (jsonb) holds
 * the whole measure object, verbatim, exactly as industry_measures itself
 * carries nine fields with no scalar equivalent in this table (see
 * db/drizzle/0021's research_result_kind discriminant). Adding nine
 * columns used by one kind and null for the other is the sparse-table
 * failure that discriminant exists to avoid. value and citation — the
 * scalar columns 0018 built for metric_value — stay NULL here;
 * research_results_found_shape (0021) requires exactly that for
 * result_kind = 'industry_measure'.
 *
 * THE EXCLUSION LIST IS NOT WRITTEN HERE, DEFERRED. The payload may name
 * measures_tested_and_excluded_as_unaddressable — measures the agent
 * itself decided were not worth proposing. industry_measure_exclusions
 * (db/schema.ts) requires excluded_by_person_id: a person's judgement.
 * An exclusion an agent proposed is a candidate for that table, not a
 * decision already made — writing it as though it were would let an
 * agent, not a person, be the one who decided a measure does not belong
 * in the pack. Validated for shape below and otherwise ignored; a
 * person-reviewed exclusion path is future work.
 *
 * direction is validated against pg_enum for metric_direction rather than
 * a hardcoded list — matching valueOutcomes.ts's convention — so a future
 * migration that adds or renames a direction does not require this file
 * to be edited to notice.
 *
 * A RESPONSE NAMES ITS PROMPT (Q4b). The prompt is generated here, from
 * live rows and the contract (POST /api/industries/:id/research-prompts,
 * below), and stored immutable in research_prompts. Parse requires the
 * response to carry that prompt's id, and refuses — nothing written — if
 * the prompt is unknown or another industry's, if it was generated against
 * a contract version other than the one parse now validates against, or if
 * the response's own `industry` is not the prompt's industry. Each result
 * then records prompt_id and contract_version. The 13 results parsed
 * before Q4b carry neither (prompt_tracked = false, 0031).
 *
 * 404 COVERS TWO CASES ON PURPOSE: a missing industry and one that exists
 * but belongs to a different tenant read the same to the caller. The
 * query below resolves the requesting actor's own tenant (via persons,
 * falling back to the actor's institution) and requires the industry to
 * match it in one WHERE clause, so "wrong tenant" and "does not exist"
 * produce the identical empty result rather than a second code path that
 * could leak which one it was.
 */

class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join('; '));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ParsedMeasure {
  /** Becomes research_results.field_name. */
  name: string;
  /** The whole measure object, verbatim — becomes research_results.raw_response. */
  raw: Record<string, unknown>;
}

// Accumulates into `issues` rather than throwing (as validateMeasure does), for the
// envelope fields (body.industry, body.research_query, etc). Not version-
// drift framed — see the file comment.
function requireEnvelopeString(
  body: Record<string, unknown>,
  field: string,
  issues: string[],
): string | undefined {
  const v = body[field];
  if (typeof v !== 'string' || v.trim() === '') {
    issues.push(`body.${field} is required`);
    return undefined;
  }
  return v;
}

function validateExclusionList(body: Record<string, unknown>, issues: string[]): void {
  const v = body['measures_tested_and_excluded_as_unaddressable'];
  if (v === undefined) return;
  if (!Array.isArray(v)) {
    issues.push('body.measures_tested_and_excluded_as_unaddressable must be an array');
    return;
  }
  v.forEach((entry, i) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      issues.push(`body.measures_tested_and_excluded_as_unaddressable[${i}] must be a non-empty string`);
    }
  });
}

// POST /api/industries/:industryId/research-results — parses a research
// agent's response for one industry into pending research_results rows.
// Does not create industry_measures rows; see the file comment. Also
// POST /api/industries/:industryId/research-prompts (Q4b), and
// GET /api/industries/:slug/research (Q4c1), below it.
/** P2 (P2-D5): a parser's 422, recorded through the pool (the request rolls back) by the paste's hash and size. */
async function recordPackParseRefusal(pool: Pool, req: Request, tenantId: string, issues: string[], attemptedPayload: Record<string, unknown>): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO refusals (tenant_id, institution_id, actor_person_id, endpoint, subject_table, subject_id,
                             source, sqlstate, constraint_name, message, attempted_payload)
       VALUES ($1, NULL, $2, 'POST /api/industries/:industryId/research-results', 'research_results', NULL,
               'parser', NULL, NULL, $3, $4)`,
      [tenantId, req.actor!.personId, `${issues.length} issue(s) found; nothing was written. ${issues.join(' | ')}`, attemptedPayload],
    );
  } catch (err) {
    console.error('LVRF: failed to record a parse refusal. The 422 still stands.', err);
  }
}

export function industryResearchRouter(pool: Pool): Router {
  const router = Router();

  // GET /api/industries/:slug/research (Q4c1) — the pack's research state,
  // for the pack page's Research section: the prompts on record (with
  // their text) and the results still pending review. A READ, inside the
  // D1 seam because it is research state; it writes nothing.
  //
  // A separate route, not more fields on GET /:slug/pack: that is the
  // account manager's read, and it stays byte-identical. Tenant in the
  // WHERE, exactly as the pack GET: another tenant's slug is simply not
  // found (no single row of another tenant to log).
  //
  // Pending only — an accepted result is already on the pack (with its
  // review), and a rejected one is a decision, not work.
  router.get('/:slug/research', async (req, res) => {
    try {
      const tenantId = actorTenantId(req);
      const slug = req.params.slug;
      const { rows: [industry] } = await pool.query<{ id: string; name: string; slug: string }>(
        'SELECT id, name, slug FROM industries WHERE slug = $1 AND tenant_id = $2',
        [slug, tenantId],
      );
      if (!industry) {
        res.status(404).json({ message: `industry '${slug}' not found` });
        return;
      }
      const { rows: prompts } = await pool.query(
        `SELECT p.id, p.generated_at, g.full_name AS generated_by, p.contract_version, p.template_version,
                p.prompt_sha256, cardinality(p.listed_measure_ids) AS listed_measures,
                cardinality(p.listed_exclusion_ids) AS listed_exclusions,
                (SELECT count(*)::int FROM research_results r WHERE r.prompt_id = p.id) AS results_count,
                p.prompt_text
           FROM research_prompts p JOIN persons g ON g.id = p.generated_by_person_id
          WHERE p.industry_id = $1 AND p.result_kind = 'industry_measure'
          ORDER BY p.generated_at DESC, p.id`,
        [industry.id],
      );
      const { rows: pending } = await pool.query(
        `SELECT r.id, r.field_name, r.parsed_at, pb.full_name AS parsed_by, r.research_tool,
                r.research_query, r.prompt_id, r.contract_version, r.raw_response
           FROM research_results r JOIN persons pb ON pb.id = r.parsed_by_person_id
          WHERE r.industry_id = $1 AND r.result_kind = 'industry_measure' AND r.review_state = 'pending'
          ORDER BY r.parsed_at, r.field_name, r.id`,
        [industry.id],
      );
      res.json({ industry, contract_version_now: INDUSTRY_MEASURE_CONTRACT.version, prompts, pending });
    } catch (err) {
      respondServerError(res, err);
    }
  });

  router.post('/:industryId/research-results', async (req, res) => {
    const client = req.dbClient!;

    const industryId = req.params.industryId;
    if (!isUuid(industryId)) {
      res.status(400).json({ message: `invalid industry id: ${industryId}` });
      return;
    }

    // Captured for handleGovernanceError's refusal record as soon as known.
    let refusalTenantId: string | null = null;
    // P2 (P2-D5): what a refusal records of the paste — its hash and size, never its text.
    let parserPayload: Record<string, unknown> = {};

    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything
        // wrong — thrown inside try so it falls through to the 500 below
        // rather than becoming an unhandled rejection in this async handler.
        throw new Error('req.actor missing on a request past requireActor');
      }

      // Requires the industry to belong to the actor's tenant — see the 404
      // comment above for why "missing" and "wrong tenant" deliberately
      // produce the same answer. Sign-in P3: checked by the shared helper
      // after the lookup (it was a predicate in the WHERE), so a mismatch
      // is logged.
      const { rows: [industry] } = await client.query<{ id: string; tenant_id: string }>(
        'SELECT id, tenant_id FROM industries WHERE id = $1',
        [industryId],
      );
      if (!industry || isOtherTenant(req, industry.tenant_id, { table: 'industries', id: industryId })) {
        res.status(404).json({ message: `industry ${industryId} not found` });
        return;
      }
      refusalTenantId = industry.tenant_id;

      const { rows: directionRows } = await client.query<{ enumlabel: string }>(
        `SELECT e.enumlabel FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'metric_direction'
          ORDER BY e.enumsortorder`,
      );
      const validDirections = directionRows.map((r) => r.enumlabel);

      // P2 (P2-D5): the pasted text, parsed here; the import stores exactly this text.
      let imported: ImportText;
      try {
        imported = readImportText(req.body);
      } catch (e) {
        if (e instanceof ImportTextError) { parserPayload = e.parserPayload; throw new ValidationError(e.issues); }
        throw e;
      }
      parserPayload = { raw_sha256: imported.sha256, byte_length: imported.bytes };
      const body = imported.body;

      const issues: string[] = [];

      // Envelope fields. Not subject to the version-drift framing above —
      // unlike the per-measure contract, these did not evolve across the
      // three research runs; every run stated what it asked and what it
      // ran.
      const bodyIndustry = requireEnvelopeString(body, 'industry', issues);
      const researchQuery = requireEnvelopeString(body, 'research_query', issues);
      const queryAsExecuted = requireEnvelopeString(body, 'query_as_executed', issues);
      const researchTool = requireEnvelopeString(body, 'research_tool', issues);

      validateExclusionList(body, issues);

      // The prompt this response answered (Q4b). Checked before the
      // measures so a stale prompt is named first, but every issue is still
      // collected — refuse wholesale, as above.
      const promptId = body['prompt_id'];
      if (typeof promptId !== 'string' || !isUuid(promptId)) {
        issues.push(
          'body.prompt_id is required: the id of the prompt this response answered. Generate one with ' +
          `POST /api/industries/${industryId}/research-prompts and give the agent that prompt.`,
        );
      } else {
        const { rows: [prompt] } = await client.query<{ industry_id: string; contract_version: number; slug: string; name: string }>(
          `SELECT p.industry_id, p.contract_version, i.slug, i.name
             FROM research_prompts p JOIN industries i ON i.id = p.industry_id
            WHERE p.id = $1 AND p.result_kind = 'industry_measure'`,
          [promptId],
        );
        // Another tenant's prompt reads as unknown, as everywhere else.
        if (!prompt || prompt.industry_id !== industryId) {
          issues.push(`body.prompt_id ${promptId} is not a research prompt for industry ${industryId}.`);
        } else {
          if (prompt.contract_version !== INDUSTRY_MEASURE_CONTRACT.version) {
            issues.push(
              `the prompt was generated against v${prompt.contract_version}; the contract is now ` +
              `v${INDUSTRY_MEASURE_CONTRACT.version}; generate a new prompt.`,
            );
          }
          // The prompt asks for the slug; the name is accepted too (case
          // and surrounding space ignored). Anything else is a response to
          // a different industry's question.
          const said = bodyIndustry?.trim().toLowerCase();
          if (bodyIndustry !== undefined && said !== prompt.slug.toLowerCase() && said !== prompt.name.trim().toLowerCase()) {
            issues.push(
              `body.industry is "${bodyIndustry}", but prompt ${promptId} is for "${prompt.slug}" ` +
              `(${prompt.name}). This response answers a different industry's question.`,
            );
          }
        }
      }

      const measuresRaw = body['measures'];
      let parsedMeasures: ParsedMeasure[] = [];
      if (!Array.isArray(measuresRaw) || measuresRaw.length === 0) {
        issues.push('body.measures is required and must contain at least one measure');
      } else {
        // The ONE contract (server/research/contracts.ts), in parse mode:
        // a missing field means the response predates the contract.
        parsedMeasures = measuresRaw
          .map((m, i): ParsedMeasure | null => {
            const columns = validateMeasure(INDUSTRY_MEASURE_CONTRACT, m, {
              mode: 'parse', path: `measures[${i}]`, validDirections, issues,
            });
            return columns ? { name: columns.name as string, raw: m as Record<string, unknown> } : null;
          })
          .filter((m): m is ParsedMeasure => m !== null);
      }

      if (issues.length > 0) {
        throw new ValidationError(issues);
      }

      // issues is empty past this point, which is the only reason the
      // three `!` below are safe: every requireEnvelopeString call above
      // that could have left its result undefined also pushed an issue,
      // and an empty issues array means none of them did.

      // Reached only once every measure validated — nothing above this
      // line has written anything.
      // P2: the import first — the whole text, hashed — then each result naming it, then the act.
      const { rows: [importRow] } = await client.query<{ id: string }>(
        `INSERT INTO research_imports (tenant_id, prompt_id, raw_text, raw_sha256, byte_length, imported_by_person_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [industry.tenant_id, promptId as string, imported.text, imported.sha256, imported.bytes, actorPersonId],
      );
      const results: { id: string; field_name: string }[] = [];
      for (const measure of parsedMeasures) {
        const { rows: [inserted] } = await client.query<{ id: string; field_name: string }>(
          `INSERT INTO research_results (
             tenant_id, result_kind, industry_id, field_name, found,
             raw_response, research_query, query_as_executed, research_tool,
             parsed_by_person_id, prompt_id, contract_version, import_id
           ) VALUES ($1, 'industry_measure', $2, $3, true, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, field_name`,
          [
            industry.tenant_id, industryId, measure.name, measure.raw,
            researchQuery!, queryAsExecuted!, researchTool!, actorPersonId,
            promptId as string, INDUSTRY_MEASURE_CONTRACT.version, importRow.id,
          ],
        );
        results.push(inserted);
      }

      await recordAct(client, req, 'POST /api/industries/:industryId/research-results', {
        act: 'import', tenantId: industry.tenant_id, subjectTable: 'research_imports', subjectId: importRow.id,
      });

      res.status(201).json({ count: results.length, results, import_id: importRow.id, raw_sha256: imported.sha256 });
    } catch (err) {
      if (err instanceof ValidationError) {
        // P2 (P2-D5, Brad's condition): the parser's refusal is recorded, with the paste's hash and size, not its text.
        if (refusalTenantId) await recordPackParseRefusal(pool, req, refusalTenantId, err.issues, parserPayload);
        res.status(422).json({
          message: `${err.issues.length} issue(s) found; nothing was written.`,
          issues: err.issues,
        });
        return;
      }
      // A CHECK-constraint refusal (research_results_kind_shape or
      // research_results_found_shape) should not be reachable through this
      // endpoint's own validation above, but is still routed through the
      // shared handler rather than re-implemented — see server/lib/refusal.ts.
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/industries/:industryId/research-results',
        subjectTable: 'research_results',
        subjectId: null,
        tenantId: refusalTenantId,
        institutionId: null,
        attemptedPayload: parserPayload,
      })) {
        return;
      }
      respondServerError(res, err);
    }
  });

  // POST /api/industries/:industryId/research-prompts — generates the
  // research prompt for one industry from live rows (the industry, its
  // current pack entries, its exclusions with their reasons) and the
  // contract, and stores it, immutable, in research_prompts. An authorized
  // user's act (stewardActs.ts), tenant-checked like parse. The response
  // carries the text to give the agent and the id parse will require.
  router.post('/:industryId/research-prompts', async (req, res) => {
    const client = req.dbClient!;
    const industryId = req.params.industryId;
    if (!isUuid(industryId)) {
      res.status(400).json({ message: `invalid industry id: ${industryId}` });
      return;
    }
    let refusalTenantId: string | null = null;
    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) throw new Error('req.actor missing on a request past requireActor');

      const { rows: [industry] } = await client.query<{ id: string; tenant_id: string; name: string; slug: string }>(
        'SELECT id, tenant_id, name, slug FROM industries WHERE id = $1',
        [industryId],
      );
      if (!industry || isOtherTenant(req, industry.tenant_id, { table: 'industries', id: industryId })) {
        res.status(404).json({ message: `industry ${industryId} not found` });
        return;
      }
      refusalTenantId = industry.tenant_id;

      // Current entries: the pack as GET /api/industries/:slug/pack shows it.
      const { rows: entries } = await client.query<{ id: string; name: string; addressable: boolean }>(
        `SELECT id, name, addressable FROM industry_measures
          WHERE industry_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
          ORDER BY name COLLATE "C", id`,
        [industryId],
      );
      const { rows: exclusions } = await client.query<{ id: string; name: string; reason: string }>(
        `SELECT id, name, reason FROM industry_measure_exclusions
          WHERE industry_id = $1 ORDER BY name COLLATE "C", id`,
        [industryId],
      );

      const promptId = randomUUID();
      const text = buildIndustryMeasurePrompt(INDUSTRY_MEASURE_CONTRACT, {
        promptId, industry: { name: industry.name, slug: industry.slug }, entries, exclusions,
      });
      const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
      // research_prompts_sha256_is_the_text (CHECK) recomputes the hash in
      // Postgres; a disagreement is refused there, not trusted here.
      await client.query(
        `INSERT INTO research_prompts (
           id, tenant_id, industry_id, result_kind, contract_version, template_version,
           prompt_text, prompt_sha256, listed_measure_ids, listed_exclusion_ids, generated_by_person_id
         ) VALUES ($1, $2, $3, 'industry_measure', $4, $5, $6, $7, $8, $9, $10)`,
        [
          promptId, industry.tenant_id, industryId, INDUSTRY_MEASURE_CONTRACT.version, PROMPT_TEMPLATE_VERSION,
          text, sha256, entries.map((e) => e.id), exclusions.map((x) => x.id), actorPersonId,
        ],
      );

      res.status(201).json({
        prompt_id: promptId,
        prompt_sha256: sha256,
        contract_version: INDUSTRY_MEASURE_CONTRACT.version,
        template_version: PROMPT_TEMPLATE_VERSION,
        prompt: text,
      });
    } catch (err) {
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/industries/:industryId/research-prompts',
        subjectTable: 'research_prompts',
        subjectId: null,
        tenantId: refusalTenantId,
        institutionId: null,
        attemptedPayload: req.body,
      })) {
        return;
      }
      respondServerError(res, err);
    }
  });

  return router;
}

/**
 * 2.0 item 5, industry packs step 4 — accept and reject.
 *
 * A SEPARATE router, not more routes on industryResearchRouter — same
 * reasoning as recordDocuments.ts's write/read split: a router mounted at
 * a prefix should contain only routes belonging to that prefix. The parse
 * route above is genuinely industry-scoped (POST
 * /api/industries/:industryId/research-results — an industry that does
 * not exist or belongs to another tenant is the 404). Accept and reject
 * are NOT industry-scoped: they address one research_results row by its
 * own id, and that id already carries whatever industry or institution it
 * belongs to. Mounting them under /api/industries would put an
 * industry-shaped prefix in front of an endpoint with no :industryId
 * param — exactly the "wrong address" failure mode recordDocuments.ts's
 * comment describes, just not yet triggered because nothing there reads
 * a path param that isn't present. Mounted instead at /api/research-results
 * (see server/index.ts) — POST /api/research-results/:id/accept,
 * POST /api/research-results/:id/reject.
 *
 * Parsing (above) established that a research agent returned this; these
 * two establish that a person judged it. Same tenant-scoped 404 as the
 * parse route (a research result belonging to another tenant reads
 * identically to one that does not exist), same req.dbClient transaction
 * discipline — actorContext owns BEGIN/COMMIT/ROLLBACK, this file never
 * issues any of the three.
 */
export function researchResultsReviewRouter(pool: Pool): Router {
  const router = Router();

  interface ReviewCandidate {
    id: string;
    tenantId: string;
    industryId: string | null;
    resultKind: string;
    reviewState: string;
    reviewedByPersonId: string | null;
    reviewedAt: string | null;
    reviewerName: string | null;
    rawResponse: unknown;
  }

  async function findReviewCandidate(
    client: PoolClient,
    resultId: string,
  ): Promise<ReviewCandidate | null> {
    const { rows: [row] } = await client.query<{
      id: string; tenant_id: string; industry_id: string | null; result_kind: string;
      review_state: string; reviewed_by_person_id: string | null;
      reviewed_at: string | null; reviewer_name: string | null; raw_response: unknown;
    }>(
      `SELECT rr.id, rr.tenant_id, rr.industry_id, rr.result_kind, rr.review_state,
              rr.reviewed_by_person_id, rr.reviewed_at, reviewer.full_name AS reviewer_name,
              rr.raw_response
         FROM research_results rr
         LEFT JOIN persons reviewer ON reviewer.id = rr.reviewed_by_person_id
        WHERE rr.id = $1`,
      [resultId],
    );
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      industryId: row.industry_id,
      resultKind: row.result_kind,
      reviewState: row.review_state,
      reviewedByPersonId: row.reviewed_by_person_id,
      reviewedAt: row.reviewed_at,
      reviewerName: row.reviewer_name,
      rawResponse: row.raw_response,
    };
  }

  // "A decision is not amended; it is a fact" — names the existing state,
  // reviewer and date rather than a bare "already reviewed", so the
  // caller sees what happened instead of just that it can't happen again.
  function alreadyReviewedMessage(resultId: string, candidate: ReviewCandidate): string {
    const who = candidate.reviewerName
      ? `${candidate.reviewerName} (${candidate.reviewedByPersonId})`
      : String(candidate.reviewedByPersonId);
    const when = candidate.reviewedAt ? new Date(candidate.reviewedAt).toISOString() : 'an unknown time';
    return (
      `research result ${resultId} is already ${candidate.reviewState}, by ${who} at ${when}. ` +
      'A decision is not amended; it is a fact.'
    );
  }

  // THE MAPPING IS THE ONLY PLACE THE TWO SHAPES MEET — raw_response holds
  // the research object verbatim; industry_measures has columns. Since Q4b
  // both the field list and the mapping are server/research/contracts.ts,
  // read here in 'accept' mode: a SECOND gate, against the contract as it
  // is NOW (nothing mutates raw_response between parse and accept, so it
  // fires only on a contract change in between), exhaustive in both
  // directions — every column is read from a named key, and a key the
  // contract does not know is refused with a 422 rather than silently
  // dropped.

  // POST /api/research-results/:id/accept — turns one pending
  // industry_measure result into a proposed industry_measures row, in the
  // same transaction. Does not exist for result_kind = 'metric_value' yet.
  // Brad-only (3.0 Q3): requireSteward before anything else runs.
  router.post('/:id/accept', requireSteward(pool), async (req, res) => {
    const client = req.dbClient!;
    const resultId = req.params.id;
    if (!isUuid(resultId)) {
      res.status(400).json({ message: `invalid research result id: ${resultId}` });
      return;
    }

    let refusalTenantId: string | null = null;

    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) {
        // Same broken-guarantee case as the parse route above.
        throw new Error('req.actor missing on a request past requireActor');
      }

      const body = req.body;
      if (!isRecord(body)) {
        res.status(422).json({ message: 'body is required', issues: ['body is required'] });
        return;
      }

      const issues: string[] = [];
      // required, free text, NOT content-validated — presence only.
      const reviewNote = requireEnvelopeString(body, 'review_note', issues);

      const candidate = await findReviewCandidate(client, resultId);
      // Sign-in P3: the tenant check (a WHERE predicate in findReviewCandidate
      // until P3) — by the shared helper, so a mismatch is logged.
      if (!candidate || isOtherTenant(req, candidate.tenantId, { table: 'research_results', id: resultId })) {
        res.status(404).json({ message: `research result ${resultId} not found` });
        return;
      }
      refusalTenantId = candidate.tenantId;

      if (candidate.reviewState !== 'pending') {
        res.status(409).json({ message: alreadyReviewedMessage(resultId, candidate) });
        return;
      }

      if (candidate.resultKind !== 'industry_measure') {
        res.status(422).json({
          message: `research result ${resultId} has result_kind '${candidate.resultKind}'; ` +
            'the metric_value accept path does not exist yet.',
        });
        return;
      }

      const { rows: directionRows } = await client.query<{ enumlabel: string }>(
        `SELECT e.enumlabel FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'metric_direction'
          ORDER BY e.enumsortorder`,
      );
      const validDirections = directionRows.map((r) => r.enumlabel);

      const measure = validateMeasure(INDUSTRY_MEASURE_CONTRACT, candidate.rawResponse, {
        mode: 'accept', path: 'raw_response', validDirections, issues,
      });

      if (issues.length > 0) {
        throw new ValidationError(issues);
      }

      // issues is empty past this point: reviewNote and measure are both
      // defined, for the same reason as the `!` assertions in the parse
      // route above.

      // The other half of industryExclusions.ts's rule: a measure cannot be
      // both in the pack and excluded from it. A person already judged this
      // name does not belong here; accepting it into the pack would
      // contradict that judgement silently. Exclusions are insert-only, so
      // reversing one is a deliberate act, not something accept does.
      const { rows: [excluded] } = await client.query<{ excluded_by: string; excluded_at: string }>(
        `SELECT p.full_name AS excluded_by, x.excluded_at
           FROM industry_measure_exclusions x
           JOIN persons p ON p.id = x.excluded_by_person_id
          WHERE x.industry_id = $1 AND x.name = $2`,
        [candidate.industryId, measure!.name as string],
      );
      if (excluded) {
        res.status(409).json({
          message:
            `"${measure!.name as string}" was excluded from this pack by ${excluded.excluded_by} on ` +
            `${new Date(excluded.excluded_at).toISOString().slice(0, 10)}; a measure cannot be both in the ` +
            'pack and excluded from it. Reject this result — there is no route that reverses an exclusion.',
        });
        return;
      }

      // The columns come from the contract — never from input — so every
      // field the contract defines lands, and nothing else does.
      const columns = contractColumns(INDUSTRY_MEASURE_CONTRACT);
      const { rows: [insertedMeasure] } = await client.query<{ id: string }>(
        `INSERT INTO industry_measures (tenant_id, industry_id, ${columns.join(', ')}, status)
         VALUES ($1, $2, ${columns.map((_, i) => `$${i + 3}`).join(', ')}, 'proposed')
         RETURNING id`,
        [candidate.tenantId, candidate.industryId, ...columns.map((c) => measure![c])],
      );

      // status is 'proposed', never 'ratified' — ratification means
      // sourced at N=2 institutions, a separate act with a separate
      // threshold (see industryMeasures in db/schema.ts). Accepting a
      // research result is a judgement that the measure is worth
      // proposing, not that it is proven.
      //
      // reviewed_at is NOT set here — research_results_touch (db/hardening.sql
      // section 10) stamps it on every UPDATE to this table; setting it here
      // too would just race the trigger for no benefit.
      await client.query(
        `UPDATE research_results
            SET review_state = 'accepted',
                reviewed_by_person_id = $2,
                review_note = $3,
                industry_measures_id = $4
          WHERE id = $1`,
        [resultId, actorPersonId, reviewNote!, insertedMeasure.id],
      );
      await recordAct(client, req, 'POST /api/research-results/:id/accept', {
        act: 'accept', tenantId: candidate.tenantId, subjectTable: 'research_results', subjectId: resultId,
        resultTable: 'industry_measures', resultId: insertedMeasure.id, reason: reviewNote,
      });

      res.status(200).json({
        id: resultId,
        review_state: 'accepted',
        industry_measures_id: insertedMeasure.id,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({
          message: `${err.issues.length} issue(s) found; nothing was written.`,
          issues: err.issues,
        });
        return;
      }
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/research-results/:id/accept',
        subjectTable: 'research_results',
        subjectId: resultId,
        tenantId: refusalTenantId,
        institutionId: null,
        attemptedPayload: req.body,
      })) {
        return;
      }
      respondServerError(res, err);
    }
  });

  // POST /api/research-results/:id/reject — records that a person judged
  // this result unsound. Writes nothing to industry_measures.
  //
  // Deliberately does NOT touch industry_measure_exclusions: that table
  // records a measure tested and rejected FOR AN INDUSTRY, a standing
  // judgement that the next pack review should not propose it again.
  // Rejecting one research result is narrower — it says this response was
  // not sound, not that the measure itself is unfit for the industry. A
  // person-reviewed path from rejected research_results into that table is
  // future work, same deferral as the exclusion list in the parse route
  // above.
  // Brad-only (3.0 Q3 + D3): requireSteward before anything else runs.
  router.post('/:id/reject', requireSteward(pool), async (req, res) => {
    const client = req.dbClient!;
    const resultId = req.params.id;
    if (!isUuid(resultId)) {
      res.status(400).json({ message: `invalid research result id: ${resultId}` });
      return;
    }

    let refusalTenantId: string | null = null;

    try {
      const actorPersonId = req.actor?.personId;
      if (!actorPersonId) {
        throw new Error('req.actor missing on a request past requireActor');
      }

      const body = req.body;
      if (!isRecord(body)) {
        res.status(422).json({ message: 'body is required', issues: ['body is required'] });
        return;
      }

      const issues: string[] = [];
      // A rejection without a reason is a decision nobody can review.
      const reviewNote = requireEnvelopeString(body, 'review_note', issues);
      if (issues.length > 0) {
        res.status(422).json({
          message: `${issues.length} issue(s) found; nothing was written.`,
          issues,
        });
        return;
      }

      const candidate = await findReviewCandidate(client, resultId);
      // Sign-in P3: the tenant check (a WHERE predicate in findReviewCandidate
      // until P3) — by the shared helper, so a mismatch is logged.
      if (!candidate || isOtherTenant(req, candidate.tenantId, { table: 'research_results', id: resultId })) {
        res.status(404).json({ message: `research result ${resultId} not found` });
        return;
      }
      refusalTenantId = candidate.tenantId;

      if (candidate.reviewState !== 'pending') {
        res.status(409).json({ message: alreadyReviewedMessage(resultId, candidate) });
        return;
      }

      await client.query(
        `UPDATE research_results
            SET review_state = 'rejected',
                reviewed_by_person_id = $2,
                review_note = $3
          WHERE id = $1`,
        [resultId, actorPersonId, reviewNote!],
      );
      await recordAct(client, req, 'POST /api/research-results/:id/reject', {
        act: 'reject', tenantId: candidate.tenantId, subjectTable: 'research_results', subjectId: resultId, reason: reviewNote,
      });

      res.status(200).json({ id: resultId, review_state: 'rejected' });
    } catch (err) {
      if (await handleGovernanceError(pool, err, req, res, {
        endpoint: 'POST /api/research-results/:id/reject',
        subjectTable: 'research_results',
        subjectId: resultId,
        tenantId: refusalTenantId,
        institutionId: null,
        attemptedPayload: req.body,
      })) {
        return;
      }
      respondServerError(res, err);
    }
  });

  return router;
}
