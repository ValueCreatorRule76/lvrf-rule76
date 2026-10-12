// GET /api/institutions/:institutionId/research (Q4h) — an account's research
// state: the pinned entity, the disclosure regime, the prompts on record,
// the results pending review, and what research reported it could not find.
// snake_case, exactly the columns the route selects.

import { apiFetch } from './http';

export interface AccountEntity {
  id: string;
  legal_name: string;
  identifier_type: 'sec_cik' | 'ticker' | 'registry';
  identifier: string;
  registry_jurisdiction: string | null;
  created_at: string;
  captured_by: string;
  provenance: string;
  source_reference: string | null;
  citation_resolved: boolean;
}

export interface AccountPrompt {
  id: string;
  phase: 'entity' | 'facts';
  generated_at: string;
  generated_by: string;
  contract_version: number;
  template_version: number;
  prompt_sha256: string;
  entity_id: string | null;
  results_count: number;
  prompt_text: string;
}

export interface AccountPendingResult {
  id: string;
  field_name: string;
  found: boolean;
  not_found_reason: string | null;
  parsed_at: string;
  parsed_by: string;
  research_tool: string;
  prompt_id: string | null;
  contract_version: number | null;
  /** { subject, item, ai_sourced } — the one object the agent returned for this field. */
  raw_response: { subject: 'entity' | 'disclosure_regime' | 'fact' | 'not_found'; item: Record<string, unknown>; ai_sourced: boolean };
}

export interface AccountResearchState {
  institution: { id: string; name: string };
  contract_version_now: number;
  phase_now: 'entity' | 'facts';
  entity: AccountEntity | null;
  regime: { id: string; value: string; as_of: string } | null;
  prompts: AccountPrompt[];
  pending: AccountPendingResult[];
  not_found: { kind: string; reason: string; reviewed_at: string; reviewed_by: string }[];
  /** Facts accepted while a since-corrected entity was the account's: listed for review, never changed. */
  under_previous_entity: {
    fact_id: string; kind: string; value: string; as_of: string;
    entity_id: string; legal_name: string; identifier_type: string; identifier: string; research_result_id: string;
  }[];
}

export interface GeneratedAccountPrompt {
  prompt_id: string;
  phase: 'entity' | 'facts';
  prompt_sha256: string;
  contract_version: number;
  template_version: number;
  entity: string | null;
  prompt: string;
}

export type FetchAccountResearchResult =
  | { status: 'ok'; research: AccountResearchState }
  | { status: 'error'; message: string };

export async function fetchAccountResearch(institutionId: string): Promise<FetchAccountResearchResult> {
  let res: Response;
  try {
    res = await apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/research`);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'network error' };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return { status: 'error', message: body?.message ?? `HTTP ${res.status}` };
  return { status: 'ok', research: body as AccountResearchState };
}
