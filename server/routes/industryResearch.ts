import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { handleGovernanceError } from '../lib/refusal.js';

/**
 * 2.0 item 5, industry packs — pack parse-and-review, step 1: PARSE ONLY.
 * There is no accept endpoint yet.
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
