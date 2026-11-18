import type { Pool, PoolClient } from 'pg';
import { isUuid } from '../routes/params.js';
import { ImportTextError, readImportText, type ImportText } from './importText.js';
import { MODELS, statedResearchTool } from './aiSettings.js';

/**
 * S2 (3.1; LVRF_PLAN §21.2, step 6) — an answer from a research call, imported through the SAME parse path as a paste.
 * Reads only: research_imports and research_results stay written by industryResearch.ts and accountResearch.ts alone.
 *
 * The body is exactly { call_id }: the id of the call's `result` row. The text parsed is that row's answer, byte for
 * byte (research_imports_call_matches holds it in the database too). Two rules a paste does not have:
 *   - the envelope's ai_sourced must be true;
 *   - research_tool is recorded as the server states it, never the model's own claim (kept in the raw answer).
 */
export interface CallAnswer {
  imported: ImportText;
  callId: string;
  promptId: string;
  researchTool: string;
}

export async function readCallAnswer(client: PoolClient | Pool, reqBody: unknown, tenantId: string): Promise<CallAnswer | null> {
  if (typeof reqBody !== 'object' || reqBody === null || Array.isArray(reqBody) || !('call_id' in reqBody)) return null;
  const b = reqBody as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => k !== 'call_id');
  if (extra.length > 0) {
    throw new ImportTextError(extra.map((k) => `body.${k} is not taken with a call: send { call_id } alone; its answer is the text parsed`), { fields: Object.keys(b) });
  }
  const callId = b.call_id;
  if (typeof callId !== 'string' || !isUuid(callId)) {
    throw new ImportTextError(['body.call_id is the id of an answered research call'], {});
  }
  const { rows: [r] } = await client.query<{ id: string; prompt_id: string; outcome: string; answer_text: string | null; model: string; sent_call_id: string }>(
    `SELECT id, prompt_id, outcome, answer_text, model, sent_call_id FROM research_calls
      WHERE id = $1 AND kind = 'result' AND tenant_id = $2`,
    [callId, tenantId],
  );
  if (!r) throw new ImportTextError([`research call ${callId} is not an answered call of this tenant`], { call_id: callId });
  if (r.outcome !== 'answered' || r.answer_text === null) {
    throw new ImportTextError([`research call ${callId.slice(0, 8)} ended "${r.outcome}"; there is no answer to import. Copy the prompt and run it yourself, or generate a new prompt.`], { call_id: callId });
  }
  const { rows: [already] } = await client.query<{ id: string }>('SELECT id FROM research_imports WHERE call_id = $1', [callId]);
  if (already) throw new ImportTextError([`the answer of research call ${callId.slice(0, 8)} is already imported (import ${already.id.slice(0, 8)}).`], { call_id: callId });
  const imported = readImportText({ raw_text: r.answer_text });
  const m = MODELS[r.model];
  return {
    imported, callId, promptId: r.prompt_id,
    researchTool: m ? statedResearchTool(m, r.sent_call_id.slice(0, 8)) : `${r.model} via the Claude API, call ${r.sent_call_id.slice(0, 8)}`,
  };
}

/** The issues the two extra rules add, for the parse route's own list. */
export function callAnswerIssues(viaCall: CallAnswer, body: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (body['ai_sourced'] !== true) {
    issues.push('body.ai_sourced must be true: this answer came from Claude through the API, so it is AI-sourced.');
  }
  if (body['prompt_id'] !== viaCall.promptId) {
    issues.push(`body.prompt_id is not the prompt research call ${viaCall.callId.slice(0, 8)} sent (${viaCall.promptId}).`);
  }
  return issues;
}
