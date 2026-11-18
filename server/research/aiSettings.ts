/**
 * S2 (3.1; LVRF_PLAN §21, approved by Brad 18 Nov 2026) — research with Claude: the settings both halves read.
 *
 * Read by the research process (server/research/sidecar/main.ts, bundled to one root-owned file on the box, D2) and
 * by the API (server/research/aiResearch.ts). Pure data and pure functions: no I/O, no key, no environment.
 *
 * PRICES were read from platform.claude.com/docs/en/about-claude/pricing on 18 Nov 2026 (USD per million tokens; web
 * search $10 per 1,000 searches; web fetch no charge of its own). A price change is a code change with a new date.
 *
 * RETENTION was read on 18 Nov 2026 from platform.claude.com/docs/en/manage-claude/api-and-data-retention,
 * support.claude.com/en/articles/15425695 (Covered Models) and privacy.claude.com/en/articles/7996866. Brad ruled the
 * disclosure states 30 days, the longer of Anthropic's two readings (18 Nov 2026). Re-read before a new account is
 * cleared; a change to a disclosure's text changes its SHA-256, and a clearance keeps the text it was given.
 */

export const PRICES_READ_ON = '18 Nov 2026';
export const TERMS_READ_ON = '18 Nov 2026';

export type RetentionClass = 'standard' | 'covered';

export interface ModelSpec {
  id: string;
  label: string;
  retentionClass: RetentionClass;
  /** USD per million tokens. */
  price: { input: number; cacheWrite: number; cacheRead: number; output: number };
  /** The retention sentence the disclosure carries for this model (Brad, 18 Nov 2026: 30 days). */
  retentionSentence: string;
}

export const MODELS: Readonly<Record<string, ModelSpec>> = {
  // D1 (Brad, 18 Nov 2026): the model. Replaces the 15 Nov "strongest model generally available".
  'claude-opus-5-5': {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    retentionClass: 'standard',
    price: { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
    retentionSentence:
      "Under Anthropic's commercial terms, the prompt and the answer are deleted from Anthropic's systems within 30 days, " +
      "or kept up to 2 years if flagged under Anthropic's Usage Policy.",
  },
  // A setting away (LVRF_RESEARCH_MODEL), with a new clearance for each subject (§21.2).
  'claude-fable-5-2': {
    id: 'claude-fable-5-2',
    label: 'Claude Fable 5.2',
    retentionClass: 'covered',
    price: { input: 8, cacheWrite: 10, cacheRead: 0.2, output: 40 },
    retentionSentence:
      "Claude Fable 5.2 is one of Anthropic's Covered Models: Anthropic keeps the prompt and the answer for at least 30 " +
      'days for safety monitoring, where automated systems review them, and then deletes them; zero data retention is ' +
      'not available for it.',
  },
};

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const WEB_SEARCH_USD = 0.01;

/** D10 (Brad, 18 Nov 2026). Every call is built from these, by the research process, and by nothing else. */
export const CAPS = {
  maxTokens: 32_000,
  effort: 'high' as const,
  webSearchMaxUses: 10,
  webFetchMaxUses: 6,
  webFetchMaxContentTokens: 20_000,
  blockedDomains: ['lvrf-rule76.com'],
  pauseTurnContinuations: 3,
  timeoutMs: 900_000,
  promptMaxBytes: 200_000,
};

/** The capped call's estimate (§21.3): 500,000 input, 32,000 output and 10 searches, at the model's prices. */
export function cappedCallUsd(m: ModelSpec): number {
  return round4((500_000 * m.price.input + CAPS.maxTokens * m.price.output) / 1e6 + CAPS.webSearchMaxUses * WEB_SEARCH_USD);
}

export interface CallUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  web_search_requests: number;
  web_fetch_requests: number;
}

export function costUsd(m: ModelSpec, u: CallUsage): number {
  return round4(
    (u.input_tokens * m.price.input + u.cache_creation_input_tokens * m.price.cacheWrite
      + u.cache_read_input_tokens * m.price.cacheRead + u.output_tokens * m.price.output) / 1e6
    + u.web_search_requests * WEB_SEARCH_USD,
  );
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/**
 * §21.4, word for word (Brad's ruling: 30 days). `subjectKind` and `subjectName` fill the two places the text names
 * the subject. The page shows exactly this text; the clearance keeps exactly this text and its SHA-256.
 */
export function disclosureText(m: ModelSpec, subjectKind: 'account' | 'industry', subjectName: string): string {
  return [
    `Research with Claude sends this ${subjectKind === 'account' ? "account's" : "industry's"} research prompt, exactly as generated and nothing else, to Anthropic's API, where ${m.label} (${m.id}) runs it with web search and web fetch.`,
    m.retentionSentence,
    "They are not used to train models without Rule76's permission.",
    'The sites Claude searches and fetches may keep their own records of those requests.',
    `A prompt that would carry anything from ${subjectName}'s side, rather than what it publishes, is refused and not sent.`,
    `Anthropic's terms read on ${TERMS_READ_ON}; they are re-read before a new account is cleared.`,
  ].join(' ');
}

/** The research_tool an answer from the API records, stated by the server (§21.2, step 6), never the model's claim. */
export function statedResearchTool(m: ModelSpec, callShortId: string): string {
  return `${m.label} (${m.id}) via the Claude API, with web search and web fetch, call ${callShortId}`;
}
