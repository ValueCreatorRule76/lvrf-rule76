import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';

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

// The phrase used on every MISSING (not merely malformed) required field
// in the measure contract — see the VERSION DRIFT comment above. A field
// that is present but the wrong shape is a different failure (bad data,
// not an old response) and gets its own message below.
function versionDriftMessage(path: string): string {
  return (
    `${path} is missing. This response predates the current contract and ` +
    'must be re-run — a reviewer may not supply it at accept time.'
  );
}

// Accumulates into `issues` rather than throwing on the first failure, so
// every bad field across every measure is reported in one 422. Returns
// undefined on failure; callers only use the parsed value once `issues`
// comes back empty.
function requireMeasureString(
  obj: Record<string, unknown>,
  field: string,
  path: string,
  issues: string[],
): string | undefined {
  const v = obj[field];
  if (v === undefined) {
    issues.push(versionDriftMessage(`${path}.${field}`));
    return undefined;
  }
  if (typeof v !== 'string' || v.trim() === '') {
    issues.push(`${path}.${field} must be a non-empty string`);
    return undefined;
  }
  return v;
}

interface ParsedMeasure {
  /** Becomes research_results.field_name. */
  name: string;
  /** The whole measure object, verbatim — becomes research_results.raw_response. */
  raw: Record<string, unknown>;
}

function validateMeasure(
  raw: unknown,
  index: number,
  validDirections: string[],
  issues: string[],
): ParsedMeasure | null {
  const path = `measures[${index}]`;
  if (!isRecord(raw)) {
    issues.push(`${path} must be an object`);
    return null;
  }

  const name = requireMeasureString(raw, 'name', path, issues);
  requireMeasureString(raw, 'unit', path, issues);
  const direction = requireMeasureString(raw, 'direction', path, issues);
  if (direction !== undefined && !validDirections.includes(direction)) {
    issues.push(`${path}.direction must be one of: ${validDirections.join(', ')}`);
  }
  requireMeasureString(raw, 'definition', path, issues);
  requireMeasureString(raw, 'why_it_pays', path, issues);
  requireMeasureString(raw, 'confounders', path, issues);
  requireMeasureString(raw, 'citation', path, issues);

  const addressable = raw['addressable_by_workforce_capability'];
  if (addressable === undefined) {
    issues.push(versionDriftMessage(`${path}.addressable_by_workforce_capability`));
  } else if (!isRecord(addressable)) {
    issues.push(`${path}.addressable_by_workforce_capability must be an object`);
  } else {
    const value = addressable['value'];
    if (value === undefined) {
      issues.push(versionDriftMessage(`${path}.addressable_by_workforce_capability.value`));
    } else if (typeof value !== 'boolean') {
      issues.push(`${path}.addressable_by_workforce_capability.value must be a boolean`);
    }
    const why = addressable['why'];
    if (why === undefined) {
      issues.push(versionDriftMessage(`${path}.addressable_by_workforce_capability.why`));
    } else if (typeof why !== 'string' || why.trim() === '') {
      issues.push(`${path}.addressable_by_workforce_capability.why must be a non-empty string`);
    }
  }

  // name is the only piece of the measure this endpoint needs on its own
  // (field_name); everything else is validated above and then carried
  // whole into raw_response — see the NO PER-FIELD COLUMNS comment above.
  if (name === undefined) return null;
  return { name, raw };
}

// Same accumulate-rather-than-throw shape as requireMeasureString, for the
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
// Does not create industry_measures rows; see the file comment.
export function industryResearchRouter(pool: Pool): Router {
  const router = Router();

  router.post('/:industryId/research-results', async (req, res) => {
    const client = req.dbClient!;

    const industryId = req.params.industryId;
    if (!isUuid(industryId)) {
      res.status(400).json({ message: `invalid industry id: ${industryId}` });
      return;
    }

    // Captured for handleGovernanceError's refusal record as soon as known.
    let refusalTenantId: string | null = null;

    try {
      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything
        // wrong — thrown inside try so it falls through to the 500 below
        // rather than becoming an unhandled rejection in this async handler.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      // Resolves the requesting actor's own tenant (persons.tenant_id for
      // a vendor-side actor, or via their institution for a customer-side
      // one) and requires the industry to belong to it, in one predicate —
      // see the 404 comment above for why "missing" and "wrong tenant"
      // deliberately produce the same empty result.
      const { rows: [industry] } = await client.query<{ id: string; tenant_id: string }>(
        `SELECT ind.id, ind.tenant_id
           FROM industries ind
           JOIN persons p ON p.id = $2
           LEFT JOIN institutions i ON i.id = p.institution_id
          WHERE ind.id = $1
            AND ind.tenant_id = COALESCE(p.tenant_id, i.tenant_id)`,
        [industryId, actorPersonId],
      );
      if (!industry) {
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

      const body = req.body;
      if (!isRecord(body)) {
        res.status(422).json({ message: 'body is required', issues: ['body is required'] });
        return;
      }

      const issues: string[] = [];

      // Envelope fields. Not subject to the version-drift framing above —
      // unlike the per-measure contract, these did not evolve across the
      // three research runs; every run stated what it asked and what it
      // ran.
      requireEnvelopeString(body, 'industry', issues);
      // Not cross-checked against the resolved industry's own name — the
      // industryId path param, not this field, is what governs which
      // industry this writes to. This field records what the agent
      // believed it researched.
      const researchQuery = requireEnvelopeString(body, 'research_query', issues);
      const queryAsExecuted = requireEnvelopeString(body, 'query_as_executed', issues);
      const researchTool = requireEnvelopeString(body, 'research_tool', issues);

      validateExclusionList(body, issues);

      const measuresRaw = body['measures'];
      let parsedMeasures: ParsedMeasure[] = [];
      if (!Array.isArray(measuresRaw) || measuresRaw.length === 0) {
        issues.push('body.measures is required and must contain at least one measure');
      } else {
        parsedMeasures = measuresRaw
          .map((m, i) => validateMeasure(m, i, validDirections, issues))
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
      const results: { id: string; field_name: string }[] = [];
      for (const measure of parsedMeasures) {
        const { rows: [inserted] } = await client.query<{ id: string; field_name: string }>(
          `INSERT INTO research_results (
             tenant_id, result_kind, industry_id, field_name, found,
             raw_response, research_query, query_as_executed, research_tool,
             parsed_by_person_id
           ) VALUES ($1, 'industry_measure', $2, $3, true, $4, $5, $6, $7, $8)
           RETURNING id, field_name`,
          [
            industry.tenant_id, industryId, measure.name, measure.raw,
            researchQuery!, queryAsExecuted!, researchTool!, actorPersonId,
          ],
        );
        results.push(inserted);
      }

      res.status(201).json({ count: results.length, results });
    } catch (err) {
      if (err instanceof ValidationError) {
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
        attemptedPayload: req.body,
      })) {
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
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
    actorPersonId: string,
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
         JOIN persons p ON p.id = $2
         LEFT JOIN institutions i ON i.id = p.institution_id
         LEFT JOIN persons reviewer ON reviewer.id = rr.reviewed_by_person_id
        WHERE rr.id = $1
          AND rr.tenant_id = COALESCE(p.tenant_id, i.tenant_id)`,
      [resultId, actorPersonId],
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

  // The keys this endpoint knows how to carry from raw_response into
  // industry_measures. See the file-level comment on the accept route
  // below for why an unrecognised key refuses rather than being dropped.
  const MAPPED_MEASURE_KEYS = new Set([
    'name', 'unit', 'direction', 'definition', 'why_it_pays',
    'confounders', 'citation', 'addressable_by_workforce_capability',
  ]);
  const MAPPED_ADDRESSABLE_KEYS = new Set(['value', 'why']);

  interface MappedMeasure {
    name: string; unit: string; direction: string; definition: string;
    whyItPays: string; confounders: string; citation: string;
    addressable: boolean; addressableReasoning: string;
  }

  // Accumulates into `issues` rather than throwing on the first failure —
  // same shape as requireMeasureString above, so an accept that fails
  // reports every problem in raw_response at once, not one round trip
  // per field.
  function requireRawString(raw: Record<string, unknown>, field: string, issues: string[]): string | undefined {
    const v = raw[field];
    if (v === undefined) {
      issues.push(
        `raw_response.${field} is missing. This raw_response predates the accept mapping ` +
        'contract and must be re-parsed from a conforming research response.',
      );
      return undefined;
    }
    if (typeof v !== 'string' || v.trim() === '') {
      issues.push(`raw_response.${field} must be a non-empty string`);
      return undefined;
    }
    return v;
  }

  /**
   * THE MAPPING IS THE ONLY PLACE THE TWO SHAPES MEET.
   *
   * raw_response holds the research object verbatim; industry_measures has
   * columns. This function is the seam, and it is deliberately exhaustive
   * in both directions: every industry_measures column it fills is read
   * from a named raw_response key (never invented, never defaulted), and
   * every raw_response key is checked against the known list — a key this
   * function does not recognise is refused with a 422 naming it, not
   * silently dropped. A silently dropped field is a fact the research
   * established and the pack forgot; the reviewer accepting this row
   * would have no way to know a field existed and vanished.
   *
   * This is a SECOND gate, not a restatement of the parse route's. The
   * parse route validates raw_response's shape at parse time, against
   * whatever the measure contract was then; this validates it again at
   * accept time, against whatever the contract is NOW. Nothing mutates
   * raw_response between those two moments, so the only way for this gate
   * to fire is a contract change in between — exactly the case it exists
   * to catch.
   */
  function mapRawResponseToIndustryMeasure(
    rawResponse: unknown,
    validDirections: string[],
    issues: string[],
  ): MappedMeasure | null {
    if (!isRecord(rawResponse)) {
      issues.push('raw_response must be an object');
      return null;
    }

    for (const key of Object.keys(rawResponse)) {
      if (!MAPPED_MEASURE_KEYS.has(key)) {
        issues.push(
          `raw_response has an unrecognised key "${key}". The accept mapping only knows: ` +
          `${[...MAPPED_MEASURE_KEYS].join(', ')}. Refusing rather than silently dropping it.`,
        );
      }
    }

    const name = requireRawString(rawResponse, 'name', issues);
    const unit = requireRawString(rawResponse, 'unit', issues);
    const direction = requireRawString(rawResponse, 'direction', issues);
    if (direction !== undefined && !validDirections.includes(direction)) {
      issues.push(`raw_response.direction must be one of: ${validDirections.join(', ')}`);
    }
    const definition = requireRawString(rawResponse, 'definition', issues);
    const whyItPays = requireRawString(rawResponse, 'why_it_pays', issues);
    const confounders = requireRawString(rawResponse, 'confounders', issues);
    const citation = requireRawString(rawResponse, 'citation', issues);

    let addressable: boolean | undefined;
    let addressableReasoning: string | undefined;
    const addressableRaw = rawResponse['addressable_by_workforce_capability'];
    if (addressableRaw === undefined) {
      issues.push(
        'raw_response.addressable_by_workforce_capability is missing. This raw_response ' +
        'predates the accept mapping contract and must be re-parsed from a conforming research response.',
      );
    } else if (!isRecord(addressableRaw)) {
      issues.push('raw_response.addressable_by_workforce_capability must be an object');
    } else {
      for (const key of Object.keys(addressableRaw)) {
        if (!MAPPED_ADDRESSABLE_KEYS.has(key)) {
          issues.push(
            `raw_response.addressable_by_workforce_capability has an unrecognised key "${key}". ` +
            `The accept mapping only knows: ${[...MAPPED_ADDRESSABLE_KEYS].join(', ')}. ` +
            'Refusing rather than silently dropping it.',
          );
        }
      }
      const value = addressableRaw['value'];
      if (typeof value !== 'boolean') {
        issues.push('raw_response.addressable_by_workforce_capability.value must be a boolean');
      } else {
        addressable = value;
      }
      const why = addressableRaw['why'];
      if (typeof why !== 'string' || why.trim() === '') {
        issues.push('raw_response.addressable_by_workforce_capability.why must be a non-empty string');
      } else {
        addressableReasoning = why;
      }
    }

    if (issues.length > 0) return null;

    // Safe only because issues is empty here: every field above that could
    // have left its result undefined also pushed an issue onto `issues`.
    return {
      name: name!, unit: unit!, direction: direction!, definition: definition!,
      whyItPays: whyItPays!, confounders: confounders!, citation: citation!,
      addressable: addressable!, addressableReasoning: addressableReasoning!,
    };
  }

  // POST /api/research-results/:id/accept — turns one pending
  // industry_measure result into a proposed industry_measures row, in the
  // same transaction. Does not exist for result_kind = 'metric_value' yet.
  router.post('/:id/accept', async (req, res) => {
    const client = req.dbClient!;
    const resultId = req.params.id;
    if (!isUuid(resultId)) {
      res.status(400).json({ message: `invalid research result id: ${resultId}` });
      return;
    }

    let refusalTenantId: string | null = null;

    try {
      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // Same broken-guarantee case as the parse route above.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const body = req.body;
      if (!isRecord(body)) {
        res.status(422).json({ message: 'body is required', issues: ['body is required'] });
        return;
      }

      const issues: string[] = [];
      // required, free text, NOT content-validated — presence only.
      const reviewNote = requireEnvelopeString(body, 'review_note', issues);

      const candidate = await findReviewCandidate(client, resultId, actorPersonId);
      if (!candidate) {
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

      const measure = mapRawResponseToIndustryMeasure(candidate.rawResponse, validDirections, issues);

      if (issues.length > 0) {
        throw new ValidationError(issues);
      }

      // issues is empty past this point: reviewNote and measure are both
      // defined, for the same reason as the `!` assertions in the parse
      // route above.
      const { rows: [insertedMeasure] } = await client.query<{ id: string }>(
        `INSERT INTO industry_measures (
           tenant_id, industry_id, name, unit, direction, definition, why_it_pays,
           addressable, addressable_reasoning, confounders, citation, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'proposed')
         RETURNING id`,
        [
          candidate.tenantId, candidate.industryId, measure!.name, measure!.unit, measure!.direction,
          measure!.definition, measure!.whyItPays, measure!.addressable, measure!.addressableReasoning,
          measure!.confounders, measure!.citation,
        ],
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
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
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
  router.post('/:id/reject', async (req, res) => {
    const client = req.dbClient!;
    const resultId = req.params.id;
    if (!isUuid(resultId)) {
      res.status(400).json({ message: `invalid research result id: ${resultId}` });
      return;
    }

    let refusalTenantId: string | null = null;

    try {
      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        throw new Error('x-actor-person-id missing on a request past actorContext');
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

      const candidate = await findReviewCandidate(client, resultId, actorPersonId);
      if (!candidate) {
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
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
