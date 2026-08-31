import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';

/**
 * GET /api/business-metrics/:metricId/research-prompt — LVRF 2.0 item 5, step 2.
 *
 * WHAT THIS IS. LVRF does not do research. It prepares a request and governs
 * the response. The seam is a HUMAN running the agent — copying the prompt
 * out of this response and the agent's JSON back into the parser (step 3).
 * That is a real boundary, not a technicality: nothing in this system calls
 * a model.
 *
 * The prompt is composed ENTIRELY from live rows — business_metrics and its
 * institution. Nothing is invented, nothing is estimated, and no industry
 * knowledge is asserted that the record does not already hold. If a metric
 * has no reporting_cadence on file, the prompt says that, rather than
 * guessing one.
 *
 * NO CONFIDENCE RATING IS REQUESTED, ANYWHERE IN THIS FILE, DELIBERATELY.
 * LVRF computes confidence from an evidence ledger (server/spine/
 * confidenceModel.ts) and never accepts an asserted one. An agent's
 * self-declared confidence has no place in the contract below — do not add
 * one later without re-reading this comment.
 *
 * This is a read: actorContext returns early on GET and never sets
 * req.dbClient, so this queries the pool directly, same as gapRegister.ts
 * and persons.ts.
 */

interface BusinessMetricForPrompt {
  id: string;
  name: string;
  unit: string;
  direction: 'increase' | 'decrease';
  source_system: string;
  reporting_cadence: string | null;
  definition_notes: string | null;
  institution_id: string;
  institution_name: string;
  institution_industry: string | null;
}

// Turns a metric name into a field_name an agent can echo back verbatim and
// a parser (step 3) can match without fuzziness — not a display label.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// definition_notes carries this exact word when a vendor has stated a
// definition exists but declined to publish how it is calculated —
// Skillsoft's DRR notes are the case this was written against. A prompt
// that only asked for the value would leave that gap unrecorded.
const UNCONFIRMED_MARKER = 'UNCONFIRMED';

interface FieldSpec {
  field_name: string;
  ask: string;
}

function buildFieldSpecs(bm: BusinessMetricForPrompt): FieldSpec[] {
  const valueField = slugify(bm.name);
  const directionNote = bm.direction === 'increase'
    ? 'a HIGHER figure is favorable'
    : 'a LOWER figure is favorable';

  const specs: FieldSpec[] = [{
    field_name: valueField,
    ask:
      `The current reported value of "${bm.name}" for ${bm.institution_name}, in ${bm.unit} ` +
      `(${directionNote}). Cite it specifically enough that a person can locate it without ` +
      'further searching: the document name, its date, and a section or page number. ' +
      '"Investor relations" or a bare homepage URL is not a citation.',
  }];

  if (bm.definition_notes?.includes(UNCONFIRMED_MARKER)) {
    specs.push({
      field_name: 'calculation_methodology',
      ask:
        `The published calculation methodology for "${bm.name}" — numerator, denominator, and ` +
        `any stated exclusions — OR explicit confirmation that ${bm.institution_name} does not ` +
        'publish this methodology, if that is what you find. An unpublished methodology is a ' +
        'finding, not a failure: say so rather than leaving the field silent.',
    });
  }

  return specs;
}

// Returned alongside the prompt text, not only embedded in it, so the
// parser (step 3) validates an agent's response against the SAME shape the
// agent was shown — one declaration, not a prose copy and a code copy free
// to drift apart.
function buildContract(fieldSpecs: FieldSpec[]) {
  return {
    query_as_executed: {
      type: 'string',
      required: true,
      description:
        'What you actually ran, verbatim, if it differs at all from the query you were given. ' +
        'An agent may narrow, decompose or rewrite a prompt before running it, and what ran is a ' +
        'different fact from what was asked.',
    },
    fields: {
      type: 'array',
      expected_field_names: fieldSpecs.map((f) => f.field_name),
      item_shape: {
        field_name: { type: 'string', required: true },
        found: { type: 'boolean', required: true },
        value: {
          type: 'string',
          required_when: 'found is true',
          note: 'Must be null/absent when found is false, not an empty string.',
        },
        citation: {
          type: 'string',
          required_when: 'found is true',
          note: 'Document, date, and section or page — specific enough to check.',
        },
        not_found_reason: {
          type: 'string',
          required_when: 'found is false',
          note:
            'Required, not optional. Omitting a field is not the same fact as searching and not ' +
            'finding it — say which one happened.',
        },
      },
      note: 'No confidence field. LVRF computes confidence from evidence and never accepts an asserted one.',
    },
  };
}

function buildPromptText(bm: BusinessMetricForPrompt, fieldSpecs: FieldSpec[], contract: unknown): string {
  const lines: string[] = [];

  lines.push(
    `Research the current value of the metric "${bm.name}" for ${bm.institution_name}` +
    (bm.institution_industry ? ` (industry: ${bm.institution_industry}).` : '.'),
  );
  lines.push('');
  lines.push('ON RECORD FOR THIS METRIC:');
  lines.push(`  Unit: ${bm.unit}`);
  lines.push(`  Direction: ${bm.direction}`);
  lines.push(`  Source system of record: ${bm.source_system}`);
  lines.push(`  Reporting cadence: ${bm.reporting_cadence ?? 'not recorded'}`);
  lines.push(`  Definition notes: ${bm.definition_notes ?? 'none recorded'}`);
  lines.push('');
  lines.push('FIND THE FOLLOWING:');
  for (const spec of fieldSpecs) {
    lines.push(`  [${spec.field_name}] ${spec.ask}`);
  }
  lines.push('');
  lines.push(
    'Return your result as JSON matching this contract exactly. Do not include a confidence ' +
    'rating of any kind — none is wanted and none will be used. Do not omit a field because you ' +
    'did not find it: every field in expected_field_names must appear, with found explicitly ' +
    'true or false and not_found_reason stated when it is false.',
  );
  lines.push('');
  lines.push(JSON.stringify(contract, null, 2));

  return lines.join('\n');
}

export function researchPromptRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:metricId/research-prompt', async (req, res) => {
    const metricId = req.params.metricId;
    if (!isUuid(metricId)) {
      res.status(400).json({ message: `invalid business metric id: ${metricId}` });
      return;
    }

    try {
      // Governed row resolved by something other than a primary key path:
      // metricId alone does not establish this metric is still current, so
      // the supersession chain is filtered here rather than trusted.
      const { rows: [bm] } = await pool.query<BusinessMetricForPrompt>(
        `SELECT bm.id, bm.name, bm.unit, bm.direction, bm.source_system,
                bm.reporting_cadence, bm.definition_notes, bm.institution_id,
                i.name AS institution_name, i.industry AS institution_industry
           FROM business_metrics bm
           JOIN institutions i ON i.id = bm.institution_id
          WHERE bm.id = $1
            AND bm.deleted_at IS NULL
            AND bm.superseded_by_id IS NULL`,
        [metricId],
      );
      if (!bm) {
        res.status(404).json({ message: `business metric ${metricId} not found, retired, or superseded` });
        return;
      }

      const fieldSpecs = buildFieldSpecs(bm);
      const contract = buildContract(fieldSpecs);
      const prompt = buildPromptText(bm, fieldSpecs, contract);

      const researchQuery = fieldSpecs.length > 1
        ? `Find "${bm.name}" for ${bm.institution_name} (value with citation), and the ` +
          'calculation methodology for it (or confirmation none is published).'
        : `Find "${bm.name}" for ${bm.institution_name}, with a citation specific enough to check.`;

      res.status(200).json({
        metric: { id: bm.id, name: bm.name },
        institution: { id: bm.institution_id, name: bm.institution_name },
        research_query: researchQuery,
        prompt,
        contract,
      });
    } catch (err) {
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
