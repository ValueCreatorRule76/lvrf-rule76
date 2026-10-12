/**
 * The research contracts — ONE definition per result kind (Q4b, the first
 * step of 3.0 Band B). Inside the research-intake seam (CLAUDE.md, D1).
 *
 * WHY: until Q4b the industry-measure contract existed three times — the
 * parse-time validator, the accept-time mapping (industryResearch.ts), and
 * a hand-written prompt that lived outside the repo. The 3.0 item 9 recon
 * (11 Oct 2026) found them free to disagree; CVAF's pack drifted exactly
 * that way. Now the parser, the accept mapping and (from Q4b's second
 * commit) the generated prompt all read this file.
 *
 * VERSIONING: `version` is the contract's shape. v1 predated
 * addressable_by_workforce_capability (the CDMO run, 31 Aug); v2 lacked
 * confounders (Manufacturing); v3 is the current shape. Changing a field
 * here is a contract change: bump the version. A prompt records the
 * version it was generated against (research_prompts.contract_version),
 * and parse refuses a response to a prompt of any other version.
 *
 * PROMPT_TEMPLATE_VERSION is the wording of buildIndustryMeasurePrompt
 * below, separately: rewording the prompt without changing a field bumps
 * it, not the contract.
 */

export type MeasureFieldKind = 'string' | 'boolean';

export interface ContractLeaf {
  key: string;
  kind: MeasureFieldKind;
  /** The industry_measures column this lands in at accept. */
  column: string;
  /** The sentence the generated prompt uses to ask for it. */
  prompt: string;
  /** Validated against this enum's live labels (pg_enum), not a list here. */
  enumType?: 'metric_direction';
}

export interface ContractObject {
  key: string;
  kind: 'object';
  prompt: string;
  fields: ContractLeaf[];
}

export type ContractField = ContractLeaf | ContractObject;

export interface ResearchContract {
  resultKind: 'industry_measure';
  version: number;
  fields: ContractField[];
}

export const INDUSTRY_MEASURE_CONTRACT: ResearchContract = {
  resultKind: 'industry_measure',
  version: 3,
  fields: [
    { key: 'name', kind: 'string', column: 'name',
      prompt: 'The measure as the industry names it — a short, recognisable name.' },
    { key: 'unit', kind: 'string', column: 'unit',
      prompt: 'The unit it is reported in (e.g. "%", "days", "incidents per 200,000 hours").' },
    { key: 'direction', kind: 'string', column: 'direction', enumType: 'metric_direction',
      prompt: 'Which way is better: "increase" or "decrease".' },
    { key: 'definition', kind: 'string', column: 'definition',
      prompt: 'How it is calculated, precisely enough that two people would compute the same number.' },
    { key: 'why_it_pays', kind: 'string', column: 'why_it_pays',
      prompt: 'Why this measure carries money in this industry — the mechanism, not a slogan.' },
    { key: 'confounders', kind: 'string', column: 'confounders',
      prompt: 'What moves this measure that is NOT workforce capability.' },
    { key: 'citation', kind: 'string', column: 'citation',
      prompt: 'A citation specific enough that a person can locate it without further searching.' },
    { key: 'addressable_by_workforce_capability', kind: 'object',
      prompt: 'Whether workforce capability can move this measure, and why.',
      fields: [
        { key: 'value', kind: 'boolean', column: 'addressable',
          prompt: 'true if workforce capability can move it, false if it cannot.' },
        { key: 'why', kind: 'string', column: 'addressable_reasoning',
          prompt: 'The reasoning, in a sentence or two.' },
      ] },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The two gates that read the contract. Their wording is kept exactly as it
 * was before Q4b (the refactor is behaviour-neutral, proven byte-for-byte):
 *
 *   'parse'  — at POST /api/industries/:id/research-results. A MISSING
 *              field means the response predates the contract and must be
 *              re-run; unknown keys are carried whole into raw_response.
 *   'accept' — at POST /api/research-results/:id/accept, the SECOND gate,
 *              against the contract as it is NOW. Unknown keys are refused
 *              rather than silently dropped; a missing field means the
 *              stored raw_response predates the accept mapping.
 */
export type GateMode = 'parse' | 'accept';

function missingMessage(mode: GateMode, path: string): string {
  return mode === 'parse'
    ? `${path} is missing. This response predates the current contract and ` +
      'must be re-run — a reviewer may not supply it at accept time.'
    : `${path} is missing. This raw_response predates the accept mapping ` +
      'contract and must be re-parsed from a conforming research response.';
}

function unknownKeyMessage(path: string, key: string, known: string[]): string {
  return (
    `${path} has an unrecognised key "${key}". The accept mapping only knows: ` +
    `${known.join(', ')}. Refusing rather than silently dropping it.`
  );
}

/** industry_measures columns, by column name, once a measure validates. */
export type MeasureColumns = Record<string, string | boolean>;

/**
 * Validates one measure object against `contract`, pushing every problem
 * onto `issues` (all of them, not the first), and returns its
 * industry_measures columns — or null if anything failed.
 */
export function validateMeasure(
  contract: ResearchContract,
  raw: unknown,
  opts: { mode: GateMode; path: string; validDirections: string[]; issues: string[] },
): MeasureColumns | null {
  const { mode, path, validDirections, issues } = opts;
  const before = issues.length;
  if (!isRecord(raw)) {
    issues.push(`${path} must be an object`);
    return null;
  }
  if (mode === 'accept') {
    const known = contract.fields.map((f) => f.key);
    for (const key of Object.keys(raw)) if (!known.includes(key)) issues.push(unknownKeyMessage(path, key, known));
  }
  const columns: MeasureColumns = {};
  const leaf = (f: ContractLeaf, container: Record<string, unknown>, p: string, missingIsDrift: boolean) => {
    const v = container[f.key];
    if (f.kind === 'boolean') {
      if (v === undefined && missingIsDrift) issues.push(missingMessage(mode, `${p}.${f.key}`));
      else if (typeof v !== 'boolean') issues.push(`${p}.${f.key} must be a boolean`);
      else columns[f.column] = v;
      return;
    }
    if (v === undefined && missingIsDrift) {
      issues.push(missingMessage(mode, `${p}.${f.key}`));
      return;
    }
    if (typeof v !== 'string' || v.trim() === '') {
      issues.push(`${p}.${f.key} must be a non-empty string`);
      return;
    }
    if (f.enumType === 'metric_direction' && !validDirections.includes(v)) {
      issues.push(`${p}.${f.key} must be one of: ${validDirections.join(', ')}`);
    }
    columns[f.column] = v;
  };
  for (const f of contract.fields) {
    if (f.kind !== 'object') {
      leaf(f, raw, path, true);
      continue;
    }
    const obj = raw[f.key];
    if (obj === undefined) {
      issues.push(missingMessage(mode, `${path}.${f.key}`));
      continue;
    }
    if (!isRecord(obj)) {
      issues.push(`${path}.${f.key} must be an object`);
      continue;
    }
    if (mode === 'accept') {
      const known = f.fields.map((s) => s.key);
      for (const key of Object.keys(obj)) if (!known.includes(key)) issues.push(unknownKeyMessage(`${path}.${f.key}`, key, known));
    }
    // A missing sub-field is version drift at parse; at accept it is just
    // the wrong type (as before Q4b).
    for (const s of f.fields) leaf(s, obj, `${path}.${f.key}`, mode === 'parse');
  }
  return issues.length === before ? columns : null;
}

/** Every industry_measures column the contract fills, in contract order. */
export function contractColumns(contract: ResearchContract): string[] {
  return contract.fields.flatMap((f) => (f.kind === 'object' ? f.fields.map((s) => s.column) : [f.column]));
}

/* ------------------------------------------------------------------ */
/* The generated prompt (Q4b)                                          */
/* ------------------------------------------------------------------ */

/** The wording of buildIndustryMeasurePrompt. Bump on any change to its text. */
export const PROMPT_TEMPLATE_VERSION = 1;

export interface IndustryPromptInputs {
  promptId: string;
  industry: { name: string; slug: string };
  /** The pack's current entries (not retired, not superseded). */
  entries: { name: string; addressable: boolean }[];
  /** The pack's exclusions, each with the reason a person recorded. */
  exclusions: { name: string; reason: string }[];
}

// Code-point order, not locale order: the same rows give the same text on
// any machine.
const byName = <T extends { name: string }>(a: T, b: T) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * The research prompt for one industry, generated from live rows and from
 * INDUSTRY_MEASURE_CONTRACT — never hand-written. Deterministic: the same
 * inputs give the same text, byte for byte. The prompt names its own id
 * and asks the agent to echo it, with the industry's slug, so a response
 * says which prompt it answered (parse checks both).
 */
export function buildIndustryMeasurePrompt(contract: ResearchContract, inputs: IndustryPromptInputs): string {
  const { promptId, industry } = inputs;
  const entries = [...inputs.entries].sort(byName);
  const exclusions = [...inputs.exclusions].sort(byName);
  const fieldLines = contract.fields.flatMap((f) =>
    f.kind === 'object'
      ? [`- ${f.key}: ${f.prompt}`, ...f.fields.map((s) => `    - ${s.key} (${s.kind}): ${s.prompt}`)]
      : [`- ${f.key} (${f.kind}): ${f.prompt}`]);
  const skeleton = Object.fromEntries(contract.fields.map((f) => [
    f.key,
    f.kind === 'object'
      ? Object.fromEntries(f.fields.map((s) => [s.key, s.kind === 'boolean' ? '<true|false>' : `<${s.key}>`]))
      : `<${f.key}>`,
  ]));
  const envelope = {
    prompt_id: promptId,
    industry: industry.slug,
    research_query: '<this prompt\'s task, in one sentence>',
    query_as_executed: '<the searches you actually ran>',
    research_tool: '<your name and version>',
    measures: [skeleton],
    measures_tested_and_excluded_as_unaddressable: ['<a measure you tested and rejected, with why>'],
  };
  return [
    `LVRF industry pack research — ${industry.name}`,
    `Prompt ${promptId} · ${contract.resultKind} contract v${contract.version} · template v${PROMPT_TEMPLATE_VERSION}`,
    '',
    `TASK. Find the operational measures that carry money in the ${industry.name} industry and that`,
    'workforce capability can plausibly move. Each one you return will be reviewed by a person before',
    'it enters the pack; none is accepted on your word.',
    '',
    `ALREADY IN THE PACK (${entries.length}). Do not return these again.`,
    ...(entries.length ? entries.map((e) => `- ${e.name}${e.addressable ? '' : ' (kept as not addressable)'}`) : ['- (none)']),
    '',
    `EXCLUDED (${exclusions.length}). A person has judged these do not belong; do not return them.`,
    ...(exclusions.length ? exclusions.map((x) => `- ${x.name} — ${x.reason}`) : ['- (none)']),
    '',
    'FOR EACH MEASURE, every field is required:',
    ...fieldLines,
    '',
    'RULES.',
    '- A measure you cannot cite, leave out. Do not invent a citation, a figure or a source.',
    '- A measure you tested and found workforce capability cannot move: either return it with',
    '  addressable_by_workforce_capability.value = false and the reasoning, or list it under',
    '  measures_tested_and_excluded_as_unaddressable.',
    `- Return "prompt_id" and "industry" exactly as shown below: "${promptId}" and "${industry.slug}".`,
    '',
    'Return ONE JSON object of exactly this shape, and nothing else:',
    JSON.stringify(envelope, null, 2),
    '',
  ].join('\n');
}
