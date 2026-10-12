// GET /api/industries/:slug/research (Q4c1) — a pack's research state:
// the prompts on record and the results still pending review. snake_case,
// exactly the columns the route selects (same convention as packs.ts).
// Tenant-scoped by the signed-in actor, like the pack GET.

import { apiFetch } from './http';

export interface ResearchPrompt {
  id: string;
  generated_at: string;
  generated_by: string;
  contract_version: number;
  template_version: number;
  prompt_sha256: string;
  listed_measures: number;
  listed_exclusions: number;
  results_count: number;
  prompt_text: string;
}

export interface PendingResult {
  id: string;
  field_name: string;
  parsed_at: string;
  parsed_by: string;
  research_tool: string;
  research_query: string;
  /** Null for a result parsed before prompts were tracked (0031). */
  prompt_id: string | null;
  contract_version: number | null;
  /** The measure object exactly as the agent returned it. */
  raw_response: unknown;
}

export interface IndustryResearch {
  industry: { id: string; name: string; slug: string };
  /** The contract version parse validates against now; a prompt of any other is stale. */
  contract_version_now: number;
  prompts: ResearchPrompt[];
  pending: PendingResult[];
}

/** POST /api/industries/:industryId/research-prompts → 201. */
export interface GeneratedPrompt {
  prompt_id: string;
  prompt_sha256: string;
  contract_version: number;
  template_version: number;
  prompt: string;
}

export type FetchIndustryResearchResult =
  | { status: 'ok'; research: IndustryResearch }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string };

export async function fetchIndustryResearch(slug: string): Promise<FetchIndustryResearchResult> {
  let res: Response;
  try {
    res = await apiFetch(`/api/industries/${encodeURIComponent(slug)}/research`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }
  const body = await res.json().catch(() => null);
  if (res.status === 404) {
    return { status: 'not_found', message: body?.message ?? `industry '${slug}' not found` };
  }
  if (!res.ok) {
    return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  }
  return { status: 'ok', research: body as IndustryResearch };
}
