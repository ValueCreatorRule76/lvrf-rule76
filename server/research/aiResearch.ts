import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { Router, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { isUuid } from '../routes/params.js';
import { isOtherTenant, actorTenantId } from '../lib/tenantScope.js';
import { recordRouteRefusal, handleGovernanceError } from '../lib/refusal.js';
import { refuseUnknownFields } from '../lib/strictBody.js';
import { requireSteward } from '../lib/stewardActs.js';
import { recordAct } from '../lib/governanceAct.js';
import { respondServerError } from '../lib/serverError.js';
import { withActorTransaction } from '../db/withActorTransaction.js';
import { composeAccountPrompt } from '../routes/accountResearch.js';
import { notOutsideInRows, type NotOutsideIn } from './outsideIn.js';
import { composeIndustryPrompt } from '../routes/industryResearch.js';
import { INDUSTRY_MEASURE_CONTRACT, INSTITUTION_FACT_CONTRACT_VERSION } from './contracts.js';
import {
  CAPS, MODELS, cappedCallUsd, costUsd, disclosureText, PRICES_READ_ON, type CallUsage, type ModelSpec,
} from './aiSettings.js';

/**
 * S2 (3.1; LVRF_PLAN §21, approved by Brad 18 Nov 2026) — research with Claude, the API's half. Mounted at
 * /api/research-ai. The ONLY writer of research_clearances and research_calls. It holds no key and sends nothing to
 * Anthropic itself: it asks the research process (server/research/sidecar/main.ts, its own system user on the box,
 * D2) over a unix socket to run a stored prompt, and records what happened.
 *
 *   GET  /status                                     on or off, the model, the caps, this month's spend and the limit
 *   GET  /subjects/:kind/:id                         an account's or industry's clearances, calls and blocking rows
 *   POST /institutions/:institutionId/clearances     the steward clears an account   (act 'clear')
 *   POST /industries/:industryId/clearances          the steward clears an industry  (act 'clear')
 *   POST /clearances/:id/withdraw                    the steward withdraws a clearance (act 'withdraw_clearance')
 *   POST /prompts/:promptId/calls                    run one stored prompt (authorized; 202, the call runs in the background)
 *   GET  /calls/:id                                  one call: sent, and its result when it has one
 *
 * A call is refused before anything is sent (§21.2, step 2), each in a plain sentence, recorded in refusals: the
 * research process absent, off or without a key (503); the spend limit unset (503); the prompt not current (409); a
 * customer-side row in it (409, D5); no current clearance for this model (403); today's limit (429); the month's
 * spend (429, D4); a call already made for the prompt (409). Then the `sent` row is committed, and only then is the
 * prompt sent. The `result` row follows, whatever happened. The answer is imported by the person, through the parse
 * route, with { call_id } (server/research/callAnswer.ts); every field is still reviewed by a person.
 */

const env = process.env;
const socketPath = () => env.LVRF_RESEARCH_SOCKET ?? (env.NODE_ENV === 'production' ? '/run/lvrf-research/sock' : '');
// The limits are the research process's own (its root-owned settings; Brad's socket question, 18 Nov 2026): the API
// reads them from its /status and checks them first, for a plain answer; the process checks them again itself.
let lastDaily = 3;
const dailyLimit = () => lastDaily;
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

interface SidecarStatus { configured: boolean; model: string; retention_class: string; timeout_ms: number; monthly_limit_usd: number | null; daily_limit: number }

function sidecar<T>(method: 'GET' | 'POST', path: string, body: unknown, timeoutMs: number): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const sp = socketPath();
    if (!sp) { reject(new Error('no socket')); return; }
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
    const r = httpRequest({
      socketPath: sp, path, method, timeout: timeoutMs,
      headers: payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {},
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as T }); }
        catch (e) { reject(e); }
      });
    });
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

type Availability =
  | { on: true; model: ModelSpec; limitUsd: number }
  | { on: false; why: string; model: ModelSpec | null; limitUsd: number | null };

async function availability(): Promise<Availability> {
  if ((env.LVRF_AI_RESEARCH ?? '').toLowerCase() === 'off') {
    return { on: false, why: 'Research with Claude is switched off on this server; copy the prompt and run it yourself.', model: null, limitUsd: null };
  }
  let st: SidecarStatus;
  try {
    const r = await sidecar<SidecarStatus>('GET', '/status', undefined, 5_000);
    if (r.status !== 200) throw new Error('status');
    st = r.body;
  } catch {
    return { on: false, why: 'Research with Claude is not set up on this server; copy the prompt and run it yourself.', model: null, limitUsd: null };
  }
  const limitUsd = typeof st.monthly_limit_usd === 'number' ? st.monthly_limit_usd : null;
  if (Number.isInteger(st.daily_limit)) lastDaily = st.daily_limit;
  const model = MODELS[st.model] ?? null;
  if (!model || model.retentionClass !== st.retention_class) {
    return { on: false, why: `The research process names a model this server does not know (${st.model}); nothing is sent.`, model: null, limitUsd };
  }
  if (!st.configured) {
    return { on: false, why: 'Research with Claude is not set up on this server (no key); copy the prompt and run it yourself.', model, limitUsd };
  }
  if (limitUsd === null) {
    return { on: false, why: 'The research process has no monthly spend limit set (LVRF_RESEARCH_MONTHLY_USD in /etc/lvrf-research.env); nothing is sent.', model, limitUsd };
  }
  return { on: true, model, limitUsd };
}

const MONTH_START = `date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
const DAY_START = `date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;

/** D4: the month's recorded cost, and the calls sent this month with no result yet (each counted at the capped estimate). */
async function monthSpend(c: PoolClient | Pool, tenantId: string): Promise<{ spent: number; pending: number }> {
  const { rows: [r] } = await c.query<{ spent: string; pending: string }>(
    `SELECT coalesce((SELECT sum(cost_usd) FROM research_calls WHERE tenant_id = $1 AND kind = 'result' AND at >= ${MONTH_START}), 0)::text AS spent,
            (SELECT count(*) FROM research_calls s WHERE s.tenant_id = $1 AND s.kind = 'sent' AND s.at >= ${MONTH_START}
               AND NOT EXISTS (SELECT 1 FROM research_calls r WHERE r.sent_call_id = s.id))::text AS pending`,
    [tenantId],
  );
  return { spent: Number(r.spent), pending: Number(r.pending) };
}

interface Subject { kind: 'account' | 'industry'; id: string; tenantId: string; name: string }

async function findSubject(c: PoolClient | Pool, req: Request, kind: 'institution' | 'industry', id: string): Promise<Subject | null> {
  if (kind === 'institution') {
    const { rows: [i] } = await c.query<{ id: string; tenant_id: string; name: string }>(
      'SELECT id, tenant_id, name FROM institutions WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL', [id]);
    if (!i || isOtherTenant(req, i.tenant_id, { table: 'institutions', id })) return null;
    return { kind: 'account', id: i.id, tenantId: i.tenant_id, name: i.name };
  }
  const { rows: [d] } = await c.query<{ id: string; tenant_id: string; name: string }>(
    'SELECT id, tenant_id, name FROM industries WHERE id = $1', [id]);
  if (!d || isOtherTenant(req, d.tenant_id, { table: 'industries', id })) return null;
  return { kind: 'industry', id: d.id, tenantId: d.tenant_id, name: d.name };
}

const subjectColumn = (s: Subject) => (s.kind === 'account' ? 'institution_id' : 'industry_id');

interface ClearanceRow { id: string; kind: string; model: string; retention_class: string; disclosure_text: string | null;
  disclosure_sha256: string | null; reason: string; person: string; at: string; withdrawn_by: string | null;
  withdrawn_at: string | null; withdrawal_reason: string | null }

async function clearances(c: PoolClient | Pool, s: Subject): Promise<ClearanceRow[]> {
  const { rows } = await c.query<ClearanceRow>(
    `SELECT k.id, k.kind, k.model, k.retention_class, k.disclosure_text, k.disclosure_sha256, k.reason, p.full_name AS person, k.at,
            wp.full_name AS withdrawn_by, w.at AS withdrawn_at, w.reason AS withdrawal_reason
       FROM research_clearances k JOIN persons p ON p.id = k.person_id
       LEFT JOIN research_clearances w ON w.withdraws_clearance_id = k.id
       LEFT JOIN persons wp ON wp.id = w.person_id
      WHERE k.kind = 'clearance' AND k.${subjectColumn(s)} = $1
      ORDER BY k.at DESC, k.id`,
    [s.id],
  );
  return rows;
}

/**
 * D5 as ruled (Brad, 18 Nov 2026): what the account's next prompt would leave out, and what it would still carry that
 * is not outside-in (only the pinned entity can be: a fact or the regime is left out). Composed under a placeholder id.
 */
async function accountRows(c: PoolClient | Pool, institutionId: string): Promise<{ leftOut: NotOutsideIn[]; carriedNotOut: NotOutsideIn[] }> {
  const { rows: [inst] } = await c.query<{ id: string; name: string; website: string | null }>('SELECT id, name, website FROM institutions WHERE id = $1', [institutionId]);
  const composed = await composeAccountPrompt(c, inst, '00000000-0000-4000-8000-000000000000');
  const notOut = composed.phase === 'facts' ? await notOutsideInRows(c, institutionId) : [];
  return { leftOut: composed.leftOut, carriedNotOut: notOut.filter((r) => composed.carried.includes(r.id)) };
}

const currentClearance = (rows: ClearanceRow[], m: ModelSpec | null) =>
  m ? rows.find((r) => r.withdrawn_at === null && r.model === m.id && r.retention_class === m.retentionClass) ?? null : null;

/** The in-process jobs: a `sent` row with no result and no job here reads "interrupted" (nothing is retried). */
const inFlight = new Set<string>();

/**
 * Asks the research process to run the call the `sent` row names: { call_id } alone. The process checks it again,
 * claims it, sends it and writes the result row itself. The API writes a result only when the process refused it or
 * could not be reached, so the call never reads "running" for ever; never when the process may still be at work (a
 * wait that ran out: its own timeout will end the call, and it writes the result).
 */
async function runCallJob(pool: Pool, personId: string, sent: { id: string; tenant_id: string; prompt_id: string; prompt_sha256: string },
  model: ModelSpec, timeoutMs: number): Promise<void> {
  inFlight.add(sent.id);
  let failed: string | null = null;
  try {
    const r = await sidecar<{ outcome?: string; result_id?: string | null; refused?: string }>('POST', '/call', { call_id: sent.id }, timeoutMs + 60_000);
    if (r.status !== 200 && r.body?.refused && r.body.refused !== 'already_claimed') failed = `research_process_${r.body.refused}`;
    else if (r.status !== 200 && !r.body?.refused) failed = 'research_process_result_unrecorded';
  } catch (e) {
    failed = e instanceof Error && e.message === 'timeout' ? null : 'research_process_unreachable';
  }
  try {
    if (failed) {
      await withActorTransaction(pool, personId, async (_db, c) => {
        await c.query(
          `INSERT INTO research_calls (tenant_id, kind, prompt_id, prompt_sha256, sent_call_id, model, retention_class, outcome,
             error_type, usage, cost_usd, person_id)
           SELECT $1, 'result', $2, $3, $4, $5, $6, 'failed', $7, $8, 0, $9
            WHERE NOT EXISTS (SELECT 1 FROM research_calls WHERE sent_call_id = $4)`,
          [sent.tenant_id, sent.prompt_id, sent.prompt_sha256, sent.id, model.id, model.retentionClass, failed,
            { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 0, web_fetch_requests: 0 },
            personId],
        );
      });
    }
  } catch (err) {
    console.error(`LVRF: research call ${sent.id.slice(0, 8)}: the failure could not be recorded; the call reads "interrupted".`, err instanceof Error ? err.message : '');
  } finally {
    inFlight.delete(sent.id);
  }
}

function callView(sent: Record<string, unknown>, result: Record<string, unknown> | null, imported: string | null) {
  return {
    id: sent.id, prompt_id: sent.prompt_id, model: sent.model, person: sent.person, sent_at: sent.at, settings: sent.settings,
    state: result ? result.outcome : (inFlight.has(sent.id as string) ? 'running' : 'interrupted'),
    result: result ? {
      id: result.id, at: result.at, outcome: result.outcome, request_id: result.request_id, stop_reason: result.stop_reason,
      error_type: result.error_type, http_status: result.http_status, usage: result.usage, cost_usd: result.cost_usd,
      answer_sha256: result.answer_sha256, answer_bytes: result.answer_bytes,
    } : null,
    import_id: imported,
  };
}

async function callsOf(c: PoolClient | Pool, where: string, params: unknown[]) {
  const { rows } = await c.query<Record<string, unknown>>(
    `SELECT s.id, s.prompt_id, s.model, s.settings, s.at, p.full_name AS person,
            to_jsonb(r) - 'answer_text' || jsonb_build_object('answer_bytes', octet_length(r.answer_text)) AS result,
            i.id AS import_id
       FROM research_calls s JOIN persons p ON p.id = s.person_id
       JOIN research_prompts q ON q.id = s.prompt_id
       LEFT JOIN research_calls r ON r.sent_call_id = s.id
       LEFT JOIN research_imports i ON i.call_id = r.id
      WHERE s.kind = 'sent' AND ${where}
      ORDER BY s.at DESC, s.id`,
    params,
  );
  return rows.map((r) => callView(r, (r.result as Record<string, unknown> | null) ?? null, (r.import_id as string | null) ?? null));
}

/** For /api/health and the deploy: 'on', 'off' (reachable, but no key, switched off or no limit) or 'absent'. Never the key. */
export async function aiResearchHealth(): Promise<'on' | 'off' | 'absent'> {
  const av = await availability();
  if (av.on) return 'on';
  return av.model ? 'off' : (av.why.includes('not set up') || av.why.includes('switched off') ? 'absent' : 'off');
}

export function aiResearchRouter(pool: Pool): Router {
  const router = Router();

  router.get('/status', async (req, res) => {
    try {
      const av = await availability();
      const tenantId = actorTenantId(req);
      const m = av.model;
      const spend = tenantId ? await monthSpend(pool, tenantId) : { spent: 0, pending: 0 };
      res.json({
        on: av.on, why: av.on ? null : av.why,
        model: m ? { id: m.id, label: m.label, retention_class: m.retentionClass, capped_call_usd: cappedCallUsd(m), prices_read_on: PRICES_READ_ON } : null,
        caps: CAPS, daily_limit: dailyLimit(),
        month: { spent_usd: spend.spent, pending_calls: spend.pending, limit_usd: av.limitUsd },
      });
    } catch (err) { respondServerError(res, err); }
  });

  router.get('/subjects/:kind/:id', async (req, res) => {
    const { kind, id } = req.params;
    if ((kind !== 'institution' && kind !== 'industry') || !isUuid(id)) { res.status(400).json({ message: 'a subject is /institution/:id or /industry/:id' }); return; }
    try {
      const s = await findSubject(pool, req, kind, id);
      if (!s) { res.status(404).json({ message: `${kind} ${id} not found` }); return; }
      const av = await availability();
      const rows = await clearances(pool, s);
      const m = av.model;
      const text = m ? disclosureText(m, s.kind, s.name) : null;
      const { rows: [today] } = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM research_calls c JOIN research_prompts p ON p.id = c.prompt_id
          WHERE c.kind = 'sent' AND p.${subjectColumn(s)} = $1 AND c.at >= ${DAY_START}`, [s.id]);
      res.json({
        subject: { kind: s.kind, id: s.id, name: s.name },
        disclosure: text ? { text, sha256: sha256(text), model: m!.id } : null,
        current_clearance: currentClearance(rows, m),
        clearances: rows,
        calls: await callsOf(pool, `q.${subjectColumn(s)} = $1`, [s.id]),
        calls_today: Number(today.n), daily_limit: dailyLimit(),
        ...(s.kind === 'account'
          ? await accountRows(pool, s.id).then((r) => ({ customer_side_rows: r.carriedNotOut, left_out_rows: r.leftOut }))
          : { customer_side_rows: [], left_out_rows: [] }),
        prompts: (await pool.query<{ id: string; prompt_sha256: string; generated_at: string; contract_version: number; phase: string | null; sent: boolean }>(
          `SELECT p.id, p.prompt_sha256, p.generated_at, p.contract_version, p.phase::text AS phase,
                  EXISTS (SELECT 1 FROM research_calls c WHERE c.prompt_id = p.id AND c.kind = 'sent') AS sent
             FROM research_prompts p WHERE p.${subjectColumn(s)} = $1 ORDER BY p.generated_at DESC, p.id`, [s.id])).rows,
      });
    } catch (err) { respondServerError(res, err); }
  });

  router.get('/calls/:id', async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ message: `invalid call id: ${id}` }); return; }
    try {
      const calls = await callsOf(pool, 's.id = $1 AND s.tenant_id = $2', [id, actorTenantId(req)]);
      if (calls.length === 0) { res.status(404).json({ message: `research call ${id} not found` }); return; }
      res.json(calls[0]);
    } catch (err) { respondServerError(res, err); }
  });

  // ---------------------------------------------------------------- clearances (the steward's)

  const clear = (kind: 'institution' | 'industry') => async (req: Request, res: Response) => {
    const route = kind === 'institution'
      ? 'POST /api/research-ai/institutions/:institutionId/clearances' : 'POST /api/research-ai/industries/:industryId/clearances';
    const client = req.dbClient!;
    const raw = kind === 'institution' ? req.params.institutionId : req.params.industryId;
    const id = typeof raw === 'string' ? raw : '';
    if (!isUuid(id)) { res.status(400).json({ message: `invalid ${kind} id: ${id}` }); return; }
    let tenantId: string | null = null;
    const ctx = () => ({ endpoint: route, subjectTable: 'research_clearances', subjectId: null, tenantId: tenantId!,
      institutionId: kind === 'institution' ? id : null, attemptedPayload: req.body });
    try {
      const s = await findSubject(client, req, kind, id);
      if (!s) { res.status(404).json({ message: `${kind} ${id} not found` }); return; }
      tenantId = s.tenantId;
      if (await refuseUnknownFields(pool, req, res, ['reason', 'disclosure_sha256'], ctx())) return;
      const b = req.body as Record<string, unknown>;
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      const refuse = async (status: number, message: string) => {
        await recordRouteRefusal(pool, req, ctx(), message);
        res.status(status).json({ message });
      };
      if (reason.length < 12) { await refuse(422, 'Say why this may be researched with Claude, in at least 12 characters.'); return; }
      // The 3.1 steward-form item (Brad, 15 Nov 2026): a field may not repeat another.
      if (reason.toLowerCase() === s.name.trim().toLowerCase()) { await refuse(422, `The reason is the ${s.kind}'s name; say why it may be researched with Claude.`); return; }
      const av = await availability();
      if (!av.model) { await refuse(503, `${av.on ? '' : av.why} A clearance names the model it is for, so nothing is cleared until the research process answers.`.trim()); return; }
      const m = av.model;
      const text = disclosureText(m, s.kind, s.name);
      if (reason.toLowerCase() === text.toLowerCase()) { await refuse(422, 'The reason repeats the disclosure; say why this may be researched with Claude.'); return; }
      if (b.disclosure_sha256 !== sha256(text)) {
        await refuse(409, 'The disclosure you were shown is not the one for this server\'s model now; reload the page and read it again. Nothing was cleared.');
        return;
      }
      if (currentClearance(await clearances(client, s), m)) { await refuse(409, `This ${s.kind} is already cleared for ${m.label}.`); return; }
      const { rows: [row] } = await client.query<{ id: string }>(
        `INSERT INTO research_clearances (tenant_id, kind, ${subjectColumn(s)}, model, retention_class, disclosure_text, disclosure_sha256, reason, person_id)
         VALUES ($1, 'clearance', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [s.tenantId, s.id, m.id, m.retentionClass, text, sha256(text), reason, req.actor!.personId],
      );
      const a = { act: 'clear' as const, tenantId: s.tenantId, subjectTable: 'research_clearances', subjectId: row.id, reason };
      // Each route's own pattern, written out (verify_acts_lineage reads them).
      if (kind === 'institution') await recordAct(client, req, 'POST /api/research-ai/institutions/:institutionId/clearances', a);
      else await recordAct(client, req, 'POST /api/research-ai/industries/:industryId/clearances', a);
      res.status(201).json({ clearance_id: row.id, model: m.id, disclosure_sha256: sha256(text) });
    } catch (err) {
      if (await handleGovernanceError(pool, err, req, res, { endpoint: route, subjectTable: 'research_clearances', subjectId: null, tenantId, institutionId: kind === 'institution' ? id : null, attemptedPayload: req.body })) return;
      respondServerError(res, err);
    }
  };
  router.post('/institutions/:institutionId/clearances', requireSteward(pool), clear('institution'));
  router.post('/industries/:industryId/clearances', requireSteward(pool), clear('industry'));

  router.post('/clearances/:id/withdraw', requireSteward(pool), async (req, res) => {
    const route = 'POST /api/research-ai/clearances/:id/withdraw';
    const client = req.dbClient!;
    const { id } = req.params;
    if (!isUuid(id)) { res.status(400).json({ message: `invalid clearance id: ${id}` }); return; }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const { rows: [k] } = await client.query<{ id: string; tenant_id: string; kind: string; institution_id: string | null; industry_id: string | null;
        model: string; retention_class: string; reason: string; withdrawn: boolean }>(
        `SELECT k.*, EXISTS (SELECT 1 FROM research_clearances w WHERE w.withdraws_clearance_id = k.id) AS withdrawn
           FROM research_clearances k WHERE k.id = $1`, [id]);
      if (!k || k.kind !== 'clearance' || isOtherTenant(req, k.tenant_id, { table: 'research_clearances', id })) {
        res.status(404).json({ message: `clearance ${id} not found` }); return;
      }
      tenantId = k.tenant_id; institutionId = k.institution_id;
      const ctx = { endpoint: route, subjectTable: 'research_clearances', subjectId: id, tenantId, institutionId, attemptedPayload: req.body };
      if (await refuseUnknownFields(pool, req, res, ['reason'], ctx)) return;
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      const refuse = async (status: number, message: string) => { await recordRouteRefusal(pool, req, ctx, message); res.status(status).json({ message }); };
      if (k.withdrawn) { await refuse(409, 'This clearance is already withdrawn.'); return; }
      if (reason.length < 12) { await refuse(422, 'Say why the clearance is withdrawn, in at least 12 characters.'); return; }
      if (reason.toLowerCase() === k.reason.trim().toLowerCase()) { await refuse(422, "The reason repeats the clearance's own; say why it is withdrawn."); return; }
      const { rows: [w] } = await client.query<{ id: string }>(
        `INSERT INTO research_clearances (tenant_id, kind, institution_id, industry_id, model, retention_class, withdraws_clearance_id, reason, person_id)
         VALUES ($1, 'withdrawal', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [k.tenant_id, k.institution_id, k.industry_id, k.model, k.retention_class, k.id, reason, req.actor!.personId],
      );
      await recordAct(client, req, route, { act: 'withdraw_clearance', tenantId: k.tenant_id, subjectTable: 'research_clearances', subjectId: k.id,
        resultTable: 'research_clearances', resultId: w.id, reason });
      res.status(201).json({ withdrawal_id: w.id });
    } catch (err) {
      if (await handleGovernanceError(pool, err, req, res, { endpoint: route, subjectTable: 'research_clearances', subjectId: id, tenantId, institutionId, attemptedPayload: req.body })) return;
      respondServerError(res, err);
    }
  });

  // ---------------------------------------------------------------- a call

  router.post('/prompts/:promptId/calls', async (req, res) => {
    const route = 'POST /api/research-ai/prompts/:promptId/calls';
    const { promptId } = req.params;
    if (!isUuid(promptId)) { res.status(400).json({ message: `invalid prompt id: ${promptId}` }); return; }
    let tenantId: string | null = null;
    let institutionId: string | null = null;
    try {
      const { rows: [p] } = await pool.query<{ id: string; tenant_id: string; institution_id: string | null; industry_id: string | null;
        result_kind: string; contract_version: number; prompt_text: string; prompt_sha256: string; phase: string | null }>(
        `SELECT id, tenant_id, institution_id, industry_id, result_kind, contract_version, prompt_text, prompt_sha256, phase::text AS phase
           FROM research_prompts WHERE id = $1`, [promptId]);
      if (!p || isOtherTenant(req, p.tenant_id, { table: 'research_prompts', id: promptId })) {
        res.status(404).json({ message: `research prompt ${promptId} not found` }); return;
      }
      tenantId = p.tenant_id; institutionId = p.institution_id;
      const ctx = { endpoint: route, subjectTable: 'research_prompts', subjectId: promptId, tenantId, institutionId, attemptedPayload: req.body };
      if (await refuseUnknownFields(pool, req, res, [], ctx)) return;
      const refuse = async (status: number, message: string, extra: Record<string, unknown> = {}) => {
        await recordRouteRefusal(pool, req, ctx, message);
        res.status(status).json({ message, ...extra });
      };
      // 1. The research process, its key, and the limit.
      const av = await availability();
      if (!av.on) { await refuse(503, av.why); return; }
      const m = av.model;
      // 2. One call per prompt.
      const { rows: [prior] } = await pool.query<{ id: string }>(`SELECT id FROM research_calls WHERE prompt_id = $1 AND kind = 'sent'`, [promptId]);
      if (prior) { await refuse(409, `Prompt ${promptId.slice(0, 8)} was already sent (call ${prior.id.slice(0, 8)}); generate a new prompt to research again.`); return; }
      // 3. The prompt is current: of today's contract, and composed again from live rows under its own id, the same text.
      const subjectKind = p.institution_id ? 'institution' : 'industry';
      const s = await findSubject(pool, req, subjectKind, (p.institution_id ?? p.industry_id)!);
      if (!s) { res.status(404).json({ message: `the prompt's ${subjectKind} is not a current one` }); return; }
      const versionNow = p.result_kind === 'industry_measure' ? INDUSTRY_MEASURE_CONTRACT.version : INSTITUTION_FACT_CONTRACT_VERSION;
      if (p.contract_version !== versionNow) { await refuse(409, `The prompt was generated against contract v${p.contract_version}; it is now v${versionNow}. Generate a new prompt.`); return; }
      let again: string;
      let carried: string[] = [];
      if (s.kind === 'account') {
        const { rows: [inst] } = await pool.query<{ id: string; name: string; website: string | null }>('SELECT id, name, website FROM institutions WHERE id = $1', [s.id]);
        const composed = await composeAccountPrompt(pool, inst, p.id);
        again = composed.text; carried = composed.carried;
      } else {
        const { rows: [ind] } = await pool.query<{ id: string; name: string; slug: string }>('SELECT id, name, slug FROM industries WHERE id = $1', [s.id]);
        again = (await composeIndustryPrompt(pool, ind, p.id)).text;
      }
      if (again !== p.prompt_text) { await refuse(409, `The ${s.kind}'s rows changed since prompt ${promptId.slice(0, 8)} was generated, so it no longer carries what is on record. Generate a new prompt.`); return; }
      if (sha256(p.prompt_text) !== p.prompt_sha256) { await refuse(409, 'The stored prompt does not match its own SHA-256; nothing is sent.'); return; }
      // 4. D5 as ruled (Brad, 18 Nov 2026): a row that is not outside-in is left out of the prompt when it is composed;
      // the call is refused only if one would still be in it: the rows this prompt carries, each tested again here.
      if (s.kind === 'account' && p.phase === 'facts') {
        const blocking = (await notOutsideInRows(pool, s.id)).filter((r) => carried.includes(r.id));
        if (blocking.length > 0) {
          await refuse(409, `The prompt would still carry ${blocking.length === 1 ? 'a row' : `${blocking.length} rows`} that ${s.name} does not publish, so nothing is sent: `
            + blocking.map((b) => `${b.what} ${b.label} (${b.id.slice(0, 8)}) ${b.why}`).join('; ')
            + '. A fact or the disclosure regime is left out of a prompt; the pinned entity cannot be, because the prompt names it. Correct the entity by supersession, resting on a quote or a locator, then generate a new prompt.',
            { customer_side_rows: blocking });
          return;
        }
      }
      // 5. The clearance, for this model.
      const k = currentClearance(await clearances(pool, s), m);
      if (!k) { await refuse(403, `${s.name} is not cleared for research with ${m.label}. The steward clears it, with a reason, before its prompt is sent.`); return; }
      // 6. Today's limit for this subject.
      const { rows: [today] } = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM research_calls c JOIN research_prompts q ON q.id = c.prompt_id
          WHERE c.kind = 'sent' AND q.${subjectColumn(s)} = $1 AND c.at >= ${DAY_START}`, [s.id]);
      if (Number(today.n) >= dailyLimit()) { await refuse(429, `${s.name} has had ${today.n} research calls today (UTC); the limit is ${dailyLimit()} a day.`); return; }
      // 7. D4: the month's spend, with one capped call, within the limit.
      const spend = await monthSpend(pool, p.tenant_id);
      const capped = cappedCallUsd(m);
      const projected = spend.spent + (spend.pending + 1) * capped;
      if (projected > av.limitUsd) {
        await refuse(429, `This month's research calls have cost $${spend.spent.toFixed(2)}${spend.pending ? `, with ${spend.pending} still unanswered` : ''}; one more call at its cap ($${capped.toFixed(2)}) would pass the $${av.limitUsd.toFixed(2)} limit. Nothing is sent.`);
        return;
      }
      // The `sent` row, committed BEFORE the prompt leaves (its own transaction; the request's own stays empty).
      const settings = { caps: CAPS, prices_read_on: PRICES_READ_ON, capped_call_usd: capped, month_spent_usd: spend.spent, limit_usd: av.limitUsd };
      const sent = await withActorTransaction(pool, req.actor!.personId, async (_db, c) => {
        const { rows: [row] } = await c.query<{ id: string; tenant_id: string; prompt_id: string; prompt_sha256: string; at: string }>(
          `INSERT INTO research_calls (tenant_id, kind, prompt_id, prompt_sha256, clearance_id, model, retention_class, settings, person_id)
           VALUES ($1, 'sent', $2, $3, $4, $5, $6, $7, $8) RETURNING id, tenant_id, prompt_id, prompt_sha256, at`,
          [p.tenant_id, p.id, p.prompt_sha256, k.id, m.id, m.retentionClass, settings, req.actor!.personId],
        );
        return row;
      });
      const timeoutMs = Number(env.LVRF_RESEARCH_TIMEOUT_MS ?? CAPS.timeoutMs);
      void runCallJob(pool, req.actor!.personId, sent, m, Number.isFinite(timeoutMs) ? timeoutMs : CAPS.timeoutMs);
      res.status(202).json({ call_id: sent.id, sent_at: sent.at, model: m.id, prompt_sha256: p.prompt_sha256 });
    } catch (err) {
      if (await handleGovernanceError(pool, err, req, res, { endpoint: route, subjectTable: 'research_calls', subjectId: null, tenantId, institutionId, attemptedPayload: req.body })) return;
      respondServerError(res, err);
    }
  });

  return router;
}
