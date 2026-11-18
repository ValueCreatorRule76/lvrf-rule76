// S2 (3.1; LVRF_PLAN §21): research with Claude. GET /api/research-ai/status and /subjects/:kind/:id.
import { apiFetch } from './http';

export interface AiStatus {
  on: boolean;
  why: string | null;
  model: { id: string; label: string; retention_class: string; capped_call_usd: number; prices_read_on: string } | null;
  caps: { maxTokens: number; webSearchMaxUses: number; webFetchMaxUses: number; webFetchMaxContentTokens: number; timeoutMs: number };
  daily_limit: number;
  month: { spent_usd: number; pending_calls: number; limit_usd: number | null };
}

export interface AiClearance {
  id: string; model: string; retention_class: string; disclosure_text: string | null; disclosure_sha256: string | null;
  reason: string; person: string; at: string; withdrawn_by: string | null; withdrawn_at: string | null; withdrawal_reason: string | null;
}

export interface AiCall {
  id: string; prompt_id: string; model: string; person: string; sent_at: string;
  state: 'running' | 'interrupted' | 'answered' | 'refused' | 'truncated' | 'failed' | 'timeout';
  result: null | {
    id: string; at: string; outcome: string; request_id: string | null; stop_reason: string | null; error_type: string | null;
    http_status: number | null; cost_usd: string; answer_sha256: string | null; answer_bytes: number | null;
    usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; web_search_requests: number; web_fetch_requests: number } | null;
  };
  import_id: string | null;
}

export interface AiSubject {
  subject: { kind: 'account' | 'industry'; id: string; name: string };
  disclosure: { text: string; sha256: string; model: string } | null;
  current_clearance: AiClearance | null;
  clearances: AiClearance[];
  calls: AiCall[];
  calls_today: number;
  daily_limit: number;
  /** D5 as ruled: rows the prompt would still carry that are not outside-in (only the pinned entity can be): they refuse a call. */
  customer_side_rows: { what: string; id: string; label: string; why: string }[];
  /** Rows on record left out of the prompt, never sent, each with why. */
  left_out_rows: { what: string; id: string; label: string; why: string }[];
  prompts: { id: string; prompt_sha256: string; generated_at: string; contract_version: number; phase: string | null; sent: boolean }[];
}

async function getJson<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const r = await apiFetch(path);
    const body = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: body as T } : { ok: false, message: (body as { message?: string }).message ?? `HTTP ${r.status}` };
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

export const fetchAiStatus = () => getJson<AiStatus>('/api/research-ai/status');
export const fetchAiSubject = (kind: 'institution' | 'industry', id: string) => getJson<AiSubject>(`/api/research-ai/subjects/${kind}/${id}`);
