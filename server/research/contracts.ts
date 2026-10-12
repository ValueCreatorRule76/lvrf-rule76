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

export type MeasureFieldKind = 'string' | 'boolean' | 'string_list';

export interface ContractLeaf {
  key: string;
  kind: MeasureFieldKind;
  /**
   * The industry_measures column this lands in at accept — or null for a
   * review-only field (v4's `caveats`), validated at both gates and kept in
   * raw_response, mapped to no column.
   */
  column: string | null;
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

const V3_FIELDS: ContractField[] = [
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
];

/**
 * EVERY VERSION IS KEPT, by number (Q4g): a result is judged against the
 * version it was parsed under (check_legacy_research.ts), while parse and
 * accept use the current one. v3 is the shape of every result parsed before
 * Q4g, including the 13 pre-Q4b rows (verified against v3 at Q4b's Gate C).
 */
export const INDUSTRY_MEASURE_CONTRACTS: Readonly<Record<number, ResearchContract>> = {
  3: { resultKind: 'industry_measure', version: 3, fields: V3_FIELDS },
  /**
   * v4 (Q4g, Brad 12 Oct): `caveats` is REQUIRED on every measure — a list,
   * where [] is the research stating there are none. Q4e showed why: the
   * agent's caveats ("reviewer should confirm…") were buried in `citation`
   * and accepted unread. Review-only: it maps to no column.
   */
  4: {
    resultKind: 'industry_measure',
    version: 4,
    fields: [
      ...V3_FIELDS,
      { key: 'caveats', kind: 'string_list', column: null,
        prompt: 'Anything a reviewer must check before relying on this measure: a figure taken from a secondary summary, a source you could not open, a gated or paywalled report, an estimate. One caveat per string. If there are none, return an empty list [] — the key is required either way.' },
    ],
  },
};

/** The contract parse and accept validate against now. */
export const INDUSTRY_MEASURE_CONTRACT: ResearchContract = INDUSTRY_MEASURE_CONTRACTS[4];

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
      else if (f.column) columns[f.column] = v;
      return;
    }
    if (f.kind === 'string_list') {
      if (v === undefined && missingIsDrift) {
        issues.push(missingMessage(mode, `${p}.${f.key}`));
      } else if (!Array.isArray(v)) {
        issues.push(`${p}.${f.key} must be a list of strings ([] if there are none)`);
      } else {
        v.forEach((item, i) => {
          if (typeof item !== 'string' || item.trim() === '') issues.push(`${p}.${f.key}[${i}] must be a non-empty string`);
        });
      }
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
    if (f.column) columns[f.column] = v;
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
  return contract.fields
    .flatMap((f) => (f.kind === 'object' ? f.fields.map((s) => s.column) : [f.column]))
    .filter((c): c is string => c !== null);
}

/* ------------------------------------------------------------------ */
/* The generated prompt (Q4b)                                          */
/* ------------------------------------------------------------------ */

/** The wording of buildIndustryMeasurePrompt. Bump on any change to its text. */
export const PROMPT_TEMPLATE_VERSION = 2; // 2: v4's caveats (Q4g)

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
      : [`- ${f.key} (${f.kind === 'string_list' ? 'list of strings' : f.kind}): ${f.prompt}`]);
  const skeleton = Object.fromEntries(contract.fields.map((f) => [
    f.key,
    f.kind === 'object'
      ? Object.fromEntries(f.fields.map((s) => [s.key, s.kind === 'boolean' ? '<true|false>' : `<${s.key}>`]))
      : f.kind === 'string_list'
        ? [`<a ${f.key.replace(/s$/, '')}; or [] if there are none>`]
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
    ...(contract.fields.some((f) => f.key === 'caveats')
      ? ['- "caveats" is required on every measure. Say what a reviewer must check; [] states there is nothing to check.']
      : []),
    '',
    'Return ONE JSON object of exactly this shape, and nothing else:',
    JSON.stringify(envelope, null, 2),
    '',
  ].join('\n');
}

/* ================================================================== */
/* The institution_fact contract (Q4h, 3.0 item 6)                     */
/* ================================================================== */

/**
 * ACCOUNT RESEARCH: what research may say about one account, per
 * AMENDMENT-005 Art. I — baseline facts (revenue, headcount, stated
 * priorities, systems), the entity it is about, and its disclosure regime.
 * NEVER a measure- or verify-stage value, and never a value outcome: the
 * prompt does not ask, and this contract has no field to put one in.
 *
 * Two phases, decided by live rows (LVRF_PLAN §4e):
 *   'entity'  no entity pinned — ask ONLY for the entity and the regime;
 *             facts in such a response are refused ("pin the entity first").
 *   'facts'   an entity is pinned — name it, ask for every fact kind (H4),
 *             and refuse a response about any other entity, naming both.
 *
 * Every fact carries `as_of` = the LAST DAY OF THE PERIOD it describes (L6:
 * not the publication date) and the period as stated, side by side for the
 * reviewer. `source_kind` is kept as stated (H3): public_filing maps to the
 * evidence kind public_filing; a company's own other publication and a
 * third party's map to `observation` with a source reference (derived:
 * inferred), until a ruling adds a kind.
 */

export const INSTITUTION_FACT_CONTRACT_VERSION = 1;
export const INSTITUTION_PROMPT_TEMPLATE_VERSION = 1;

export const RESEARCHABLE_FACT_KINDS = ['revenue', 'headcount', 'stated_priority', 'system'] as const;
export type ResearchableFactKind = (typeof RESEARCHABLE_FACT_KINDS)[number];
export const DISCLOSURE_REGIMES = ['public_filer', 'private', 'subsidiary_of_filer', 'public_sector'] as const;
export const IDENTIFIER_TYPES = ['sec_cik', 'ticker', 'registry'] as const;
export const SOURCE_KINDS = ['public_filing', 'company_publication', 'third_party_publication'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
/** What a not-found may name: a fact kind, or the entity or regime itself (entity phase). */
export const NOT_FOUND_SUBJECTS = [...RESEARCHABLE_FACT_KINDS, 'entity', 'disclosure_regime'] as const;

/** H3: the evidence kind each stated source kind is recorded as. */
export function evidenceKindFor(sourceKind: SourceKind): 'public_filing' | 'observation' {
  return sourceKind === 'public_filing' ? 'public_filing' : 'observation';
}

export interface ResearchedEntity {
  legal_name: string; identifier_type: (typeof IDENTIFIER_TYPES)[number]; identifier: string;
  registry_jurisdiction: string | null; source_kind: SourceKind; citation: string; caveats: string[];
}
export interface ResearchedRegime {
  value: (typeof DISCLOSURE_REGIMES)[number]; basis: string; as_of: string;
  source_kind: SourceKind; citation: string; caveats: string[];
}
export interface ResearchedFact {
  kind: ResearchableFactKind; value: number | string; unit: string | null; as_of: string; period: string;
  source_kind: SourceKind; citation: string; quote: string; caveats: string[];
}
export interface NotFound { kind: (typeof NOT_FOUND_SUBJECTS)[number]; reason: string }

type Issues = string[];
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One reader for each object, in two modes like the measure contract:
 * 'parse' (a missing field means the response predates the contract) and
 * 'accept' (the second gate; unknown keys refused). Messages name the path.
 */
function reader(raw: Record<string, unknown>, path: string, mode: GateMode, known: string[], issues: Issues) {
  if (mode === 'accept') for (const k of Object.keys(raw)) if (!known.includes(k)) issues.push(unknownKeyMessage(path, k, known));
  const missing = (k: string) => issues.push(missingMessage(mode, `${path}.${k}`));
  return {
    str(k: string): string | undefined {
      const v = raw[k];
      if (v === undefined) { missing(k); return undefined; }
      if (typeof v !== 'string' || v.trim() === '') { issues.push(`${path}.${k} must be a non-empty string`); return undefined; }
      return v;
    },
    oneOf<T extends string>(k: string, allowed: readonly T[]): T | undefined {
      const v = this.str(k);
      if (v !== undefined && !allowed.includes(v as T)) { issues.push(`${path}.${k} must be one of: ${allowed.join(', ')}`); return undefined; }
      return v as T | undefined;
    },
    date(k: string): string | undefined {
      const v = this.str(k);
      if (v !== undefined && (!DATE.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()))) {
        issues.push(`${path}.${k} must be a date, YYYY-MM-DD — the last day of the period it describes`); return undefined;
      }
      return v;
    },
    list(k: string): string[] | undefined {
      const v = raw[k];
      if (v === undefined) { missing(k); return undefined; }
      if (!Array.isArray(v)) { issues.push(`${path}.${k} must be a list of strings ([] if there are none)`); return undefined; }
      v.forEach((item, i) => { if (typeof item !== 'string' || item.trim() === '') issues.push(`${path}.${k}[${i}] must be a non-empty string`); });
      return v as string[];
    },
  };
}

export function validateEntity(raw: unknown, path: string, mode: GateMode, issues: Issues): ResearchedEntity | null {
  const before = issues.length;
  if (!isRec(raw)) { issues.push(`${path} must be an object`); return null; }
  const r = reader(raw, path, mode, ['legal_name', 'identifier_type', 'identifier', 'registry_jurisdiction', 'source_kind', 'citation', 'caveats'], issues);
  const legal_name = r.str('legal_name');
  const identifier_type = r.oneOf('identifier_type', IDENTIFIER_TYPES);
  const identifier = r.str('identifier');
  const j = raw['registry_jurisdiction'];
  let registry_jurisdiction: string | null = null;
  if (identifier_type === 'registry') {
    if (typeof j !== 'string' || j.trim() === '') issues.push(`${path}.registry_jurisdiction is required for a registry number (e.g. "NZ")`);
    else registry_jurisdiction = j;
  } else if (j !== undefined && j !== null) {
    issues.push(`${path}.registry_jurisdiction is only for a registry number; use null`);
  }
  if (identifier_type === 'sec_cik' && identifier !== undefined && !/^\d{10}$/.test(identifier)) {
    issues.push(`${path}.identifier must be the SEC CIK as 10 digits, zero-padded (e.g. "0000012345")`);
  }
  const source_kind = r.oneOf('source_kind', SOURCE_KINDS);
  const citation = r.str('citation');
  const caveats = r.list('caveats');
  return issues.length === before
    ? { legal_name: legal_name!, identifier_type: identifier_type!, identifier: identifier!, registry_jurisdiction, source_kind: source_kind!, citation: citation!, caveats: caveats! }
    : null;
}

export function validateRegime(raw: unknown, path: string, mode: GateMode, issues: Issues): ResearchedRegime | null {
  const before = issues.length;
  if (!isRec(raw)) { issues.push(`${path} must be an object`); return null; }
  const r = reader(raw, path, mode, ['value', 'basis', 'as_of', 'source_kind', 'citation', 'caveats'], issues);
  const value = r.oneOf('value', DISCLOSURE_REGIMES);
  const basis = r.str('basis');
  const as_of = r.date('as_of');
  const source_kind = r.oneOf('source_kind', SOURCE_KINDS);
  const citation = r.str('citation');
  const caveats = r.list('caveats');
  return issues.length === before
    ? { value: value!, basis: basis!, as_of: as_of!, source_kind: source_kind!, citation: citation!, caveats: caveats! }
    : null;
}

export function validateFact(raw: unknown, path: string, mode: GateMode, issues: Issues): ResearchedFact | null {
  const before = issues.length;
  if (!isRec(raw)) { issues.push(`${path} must be an object`); return null; }
  const r = reader(raw, path, mode, ['kind', 'value', 'unit', 'as_of', 'period', 'source_kind', 'citation', 'quote', 'caveats'], issues);
  const kind = r.oneOf('kind', RESEARCHABLE_FACT_KINDS);
  const v = raw['value'];
  const u = raw['unit'];
  let value: number | string | undefined;
  let unit: string | null = null;
  if (v === undefined) issues.push(missingMessage(mode, `${path}.value`));
  if (kind === 'revenue' || kind === 'headcount') {
    // Zero is data: 0 passes. Negative and fractional people do not.
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) issues.push(`${path}.value must be a number, 0 or more, for ${kind}`);
    else if (kind === 'headcount' && typeof v === 'number' && !Number.isInteger(v)) issues.push(`${path}.value must be a whole number of people`);
    else value = v as number | undefined;
    if (kind === 'revenue') {
      if (typeof u !== 'string' || !/^[A-Z]{3}$/.test(u)) issues.push(`${path}.unit must be the ISO currency code of the revenue (e.g. "USD")`);
      else unit = u;
    } else if (u !== 'people') issues.push(`${path}.unit must be "people" for headcount`);
    else unit = 'people';
  } else if (kind !== undefined) {
    if (v !== undefined && (typeof v !== 'string' || v.trim() === '')) issues.push(`${path}.value must be a non-empty string for ${kind}`);
    else value = v as string | undefined;
    if (u !== undefined && u !== null) issues.push(`${path}.unit must be null for ${kind}`);
  }
  const as_of = r.date('as_of');
  const period = r.str('period');
  const source_kind = r.oneOf('source_kind', SOURCE_KINDS);
  const citation = r.str('citation');
  const quote = r.str('quote');
  const caveats = r.list('caveats');
  return issues.length === before
    ? { kind: kind!, value: value!, unit, as_of: as_of!, period: period!, source_kind: source_kind!, citation: citation!, quote: quote!, caveats: caveats! }
    : null;
}

export function validateNotFound(raw: unknown, path: string, mode: GateMode, issues: Issues): NotFound | null {
  const before = issues.length;
  if (!isRec(raw)) { issues.push(`${path} must be an object`); return null; }
  const r = reader(raw, path, mode, ['kind', 'reason'], issues);
  const kind = r.oneOf('kind', NOT_FOUND_SUBJECTS);
  const reason = r.str('reason');
  return issues.length === before ? { kind: kind!, reason: reason! } : null;
}

export interface AccountPromptInputs {
  promptId: string;
  institution: { name: string; website: string | null };
  /** The pinned entity — null decides the 'entity' phase. */
  entity: { legal_name: string; identifier_type: string; identifier: string; registry_jurisdiction: string | null } | null;
  regime: { value: string; as_of: string } | null;
  /** Facts already recorded: "do not return these unless a later period". */
  facts: { kind: string; value: string; as_of: string }[];
  /** Prior not-found results, with their reasons. */
  notFound: { kind: string; reason: string; reviewed_at: string }[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The account research prompt, generated from live rows — never
 * hand-written. Deterministic: the same rows give the same text.
 */
export function buildAccountPrompt(inputs: AccountPromptInputs): string {
  const { promptId, institution, entity, regime } = inputs;
  const facts = [...inputs.facts].sort((a, b) => cmp(a.kind, b.kind) || cmp(a.as_of, b.as_of) || cmp(a.value, b.value));
  const notFound = [...inputs.notFound].sort((a, b) => cmp(a.kind, b.kind) || cmp(a.reviewed_at, b.reviewed_at));
  const phase = entity ? 'facts' : 'entity';
  const id = (e: NonNullable<AccountPromptInputs['entity']>) =>
    `${e.legal_name} — ${e.identifier_type} ${e.identifier}${e.registry_jurisdiction ? ` (${e.registry_jurisdiction})` : ''}`;
  const sourceRule = 'source_kind: "public_filing" for the company\'s own statutory filings (10-K, annual return, registry record); "company_publication" for anything else the company itself published; "third_party_publication" for anyone else.';
  const entityShape = {
    legal_name: '<the exact legal name>', identifier_type: '<sec_cik | ticker | registry>',
    identifier: '<an SEC CIK as 10 digits, zero-padded; or the ticker; or the registry number>',
    registry_jurisdiction: '<e.g. "NZ" for a registry number; otherwise null>',
    source_kind: '<public_filing | company_publication | third_party_publication>', citation: '<where it says so>', caveats: ['<a caveat; or [] if none>'],
  };
  const lines = [
    `LVRF account research — ${institution.name}`,
    `Prompt ${promptId} · institution_fact contract v${INSTITUTION_FACT_CONTRACT_VERSION} · template v${INSTITUTION_PROMPT_TEMPLATE_VERSION} · phase ${phase}`,
    '',
    `ACCOUNT. "${institution.name}"${institution.website ? `, ${institution.website}` : ''}.`,
    '',
    'NEVER return a measured outcome, an actual, a target, or any figure about results achieved with a vendor. Only what the company itself discloses about itself.',
    '',
  ];
  if (phase === 'entity') {
    lines.push(
      'PHASE: ENTITY. Before any fact is researched, establish exactly WHICH legal entity this account is, and what it discloses.',
      'Return ONLY "entity" and "disclosure_regime" (and "not_found" for either you cannot establish). Return no facts: they are refused until the entity is pinned.',
      '',
      `- entity: the legal entity, with ONE unambiguous identifier. ${sourceRule}`,
      '- disclosure_regime.value: "public_filer" (files with a securities regulator), "private", "subsidiary_of_filer" (owned by a filer, not filing itself), or "public_sector".',
      '  basis: why, in a sentence. as_of: the date that status was true (YYYY-MM-DD).',
      '',
      'Return ONE JSON object of exactly this shape, and nothing else:',
      JSON.stringify({
        prompt_id: promptId, institution: institution.name,
        research_query: '<this prompt\'s task, in one sentence>', query_as_executed: '<the searches you actually ran>',
        research_tool: '<your name and version>', ai_sourced: '<true if an AI system did the research>',
        entity: entityShape,
        disclosure_regime: { value: '<public_filer | private | subsidiary_of_filer | public_sector>', basis: '<why>', as_of: '<YYYY-MM-DD>', source_kind: '<…>', citation: '<…>', caveats: ['<…; or []>'] },
        facts: [],
        not_found: [{ kind: '<entity | disclosure_regime>', reason: '<why it could not be established>' }],
      }, null, 2),
    );
  } else {
    lines.push(
      `ENTITY (pinned): ${id(entity!)}.`,
      'Every fact you return must be about THIS entity. Return "entity" exactly as pinned; a response about any other entity is refused whole.',
      `DISCLOSURE REGIME: ${regime ? `${regime.value} (as of ${regime.as_of})` : 'not recorded'}.`,
      ...(regime?.value === 'private'
        ? ['A private company publishes little. For revenue and headcount, a not_found with its reason ("private; no statutory filing discloses it") is the EXPECTED answer — do not estimate.']
        : []),
      '',
      `ALREADY RECORDED (${facts.length}). Do not return these again unless for a LATER period:`,
      ...(facts.length ? facts.map((f) => `- ${f.kind}: ${f.value} (as of ${f.as_of})`) : ['- (none)']),
      '',
      `PREVIOUSLY NOT FOUND (${notFound.length}), with the reason given:`,
      ...(notFound.length ? notFound.map((n) => `- ${n.kind}: ${n.reason}`) : ['- (none)']),
      '',
      'FOR EACH OF: revenue, headcount, stated_priority (one per priority), system (one per named system) — return facts, or a not_found with its reason:',
      '- value: a number for revenue and headcount (0 is a value); text for stated_priority and system.',
      '- unit: the ISO currency code for revenue (e.g. "USD"); "people" for headcount; null otherwise.',
      '- as_of: the LAST DAY OF THE PERIOD the fact describes (e.g. the fiscal year end), NOT the date it was published.',
      '- period: the period as the source states it (e.g. "fiscal year ended 30 September 2024").',
      `- ${sourceRule}`,
      '- citation: specific enough to locate without searching. quote: the sentence the figure comes from.',
      '- caveats: what a reviewer must check before relying on it; [] states there is nothing to check.',
      '',
      'Return ONE JSON object of exactly this shape, and nothing else:',
      JSON.stringify({
        prompt_id: promptId, institution: institution.name,
        research_query: '<this prompt\'s task, in one sentence>', query_as_executed: '<the searches you actually ran>',
        research_tool: '<your name and version>', ai_sourced: '<true if an AI system did the research>',
        entity: { legal_name: entity!.legal_name, identifier_type: entity!.identifier_type, identifier: entity!.identifier, registry_jurisdiction: entity!.registry_jurisdiction, source_kind: '<…>', citation: '<…>', caveats: [] },
        facts: [{ kind: '<revenue | headcount | stated_priority | system>', value: '<…>', unit: '<…>', as_of: '<YYYY-MM-DD>', period: '<as stated>', source_kind: '<…>', citation: '<…>', quote: '<…>', caveats: ['<…; or []>'] }],
        not_found: [{ kind: '<revenue | headcount | stated_priority | system>', reason: '<why research cannot reach it>' }],
      }, null, 2),
    );
  }
  lines.push('');
  return lines.join('\n');
}
