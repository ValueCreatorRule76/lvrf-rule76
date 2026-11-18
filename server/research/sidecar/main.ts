/**
 * S2 (3.1; LVRF_PLAN §21, D2 ruled by Brad 18 Nov 2026) — the research process: the ONLY code that holds Anthropic's
 * key and the only importer of @anthropic-ai/sdk (a Gate A grep refuses any other).
 *
 * On the box it runs as its own system user, `lvrf_research` (ops/lvrf-research.service), from ONE bundled file
 * installed root-owned at /opt/lvrf-research/sidecar.mjs. The key and its limits come from /etc/lvrf-research.env
 * (root, 600), read by systemd. No `brad` process can read the key: not the file, not this process's environment
 * (another uid), and not by changing this code (root-owned). Root can; Brad's interactive sudo, with its password, is
 * root.
 *
 * It listens on a unix socket (LVRF_RESEARCH_SOCKET, /run/lvrf-research/sock in production), reachable by its own
 * group, which only the API's service joins (SupplementaryGroups in ops/lvrf-api.service; `brad` is not a member).
 *   GET  /status  whether a key is configured, the model, the caps and its limits (never the key);
 *   POST /call    { call_id } and nothing else: runs ONE call the API recorded as sent.
 *   POST /smoke   one fixed sentence, no tools, at most once a minute (§21.6).
 *
 * IT ENFORCES, ITSELF, FROM THE DATABASE (Brad's socket question, 18 Nov 2026), so a request straight to the socket can
 * send nothing the API would refuse. Connected as its own role, lvrf_research (peer authentication: no password), it
 * reads the call's `sent` row (the audit row before the call), the prompt TEXT FROM research_prompts (never from the
 * request), and the clearance, and refuses, recording why in research_process_refusals, unless:
 *   - the call was recorded as sent by the API, for this process's model;
 *   - the clearance is a current one of the prompt's account (or industry) for this model;
 *   - the prompt's SHA-256 is its text's and the sent row's;
 *   - today's calls for that account are within its daily cap, and the month's spend, with this call at its cap, within
 *     its monthly limit (both from its own root-owned settings, not the API's);
 *   - it claims the call first (research_call_claims, once per call, ever: nothing is sent twice, a restart included).
 * Then it sends, and writes the `result` row itself (the audit row after the call), with the cost from the usage.
 * The API still runs its own checks, and those that only it can make: the prompt is current, and D5 (no row that is
 * not outside-in is carried).
 * Every request it sends is built here, from aiSettings.ts. The prompt goes as the one user turn, byte for byte. No
 * system prompt, no metadata, no fallbacks (D9).
 *
 * It never logs, returns or records the key, a header, or an error's message: only an error's type and status.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';
import { CAPS, DEFAULT_MODEL, MODELS, PRICES_READ_ON, cappedCallUsd, costUsd, type CallUsage } from '../aiSettings.js';

const env = process.env;
const production = env.NODE_ENV === 'production';
const socketPath = env.LVRF_RESEARCH_SOCKET ?? (production ? '/run/lvrf-research/sock' : '');
const appDir = env.LVRF_APP_DIR ?? '/srv/lvrf';
const timeoutMs = Number(env.LVRF_RESEARCH_TIMEOUT_MS ?? CAPS.timeoutMs);
const modelId = env.LVRF_RESEARCH_MODEL ?? DEFAULT_MODEL;
const model = MODELS[modelId];
const key = env.ANTHROPIC_API_KEY ?? '';
const databaseUrl = env.LVRF_RESEARCH_DATABASE_URL ?? (production ? 'postgresql://lvrf_research@/lvrf?host=/var/run/postgresql' : '');
const monthlyLimitUsd = (() => { const r = env.LVRF_RESEARCH_MONTHLY_USD; if (r === undefined || r.trim() === '') return null; const n = Number(r); return Number.isFinite(n) && n >= 0 ? n : NaN; })();
const dailyLimit = Number(env.LVRF_RESEARCH_DAILY_LIMIT ?? 3);
// The key's text is held in this closure only. Remove it from the environment, so nothing this process spawns or
// prints from process.env carries it.
delete env.ANTHROPIC_API_KEY;

function die(msg: string): never {
  console.error(`[ai-research] refusing to start: ${msg}`);
  process.exit(1);
}

if (!socketPath) die('LVRF_RESEARCH_SOCKET is not set.');
if (!model) die(`LVRF_RESEARCH_MODEL "${modelId}" is not a model this code knows (${Object.keys(MODELS).join(', ')}).`);
if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) die('LVRF_RESEARCH_TIMEOUT_MS is not a number of milliseconds.');
if (!databaseUrl) die('LVRF_RESEARCH_DATABASE_URL is not set: this process checks every call against the database itself.');
if (Number.isNaN(monthlyLimitUsd)) die('LVRF_RESEARCH_MONTHLY_USD is not a number of dollars.');
if (!Number.isInteger(dailyLimit) || dailyLimit < 0) die('LVRF_RESEARCH_DAILY_LIMIT is not a whole number.');
// Outside production, a key is used only against a stand-in: no test, and nothing on a dev machine, reaches Anthropic.
if (!production && key && !env.ANTHROPIC_BASE_URL) die('outside production, a key needs ANTHROPIC_BASE_URL (a local stand-in); nothing here reaches Anthropic.');
if (production) {
  // Production talks to api.anthropic.com only; a stand-in is for tests.
  if (env.ANTHROPIC_BASE_URL !== undefined) die('ANTHROPIC_BASE_URL is set; production talks to api.anthropic.com only.');
  // D2: not the user that owns the app, and not code that user could change.
  if (existsSync(appDir) && statSync(appDir).uid === process.getuid?.()) {
    die(`this process runs as the owner of ${appDir}; it must run as its own user (lvrf_research).`);
  }
  const self = statSync(process.argv[1] ?? '');
  if (self.uid !== 0 || (self.mode & 0o022) !== 0) {
    die(`its code file ${process.argv[1]} must be owned by root and writable by no one else.`);
  }
}

const client = key
  ? new Anthropic({
    apiKey: key,
    authToken: null, // the key from /etc/lvrf-research.env only: never a profile or a token from the environment
    ...(production ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
    timeout: timeoutMs,
    maxRetries: 0, // nothing is retried: a retry would send the prompt again, billed again.
  })
  : null;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const db = new pg.Pool({ connectionString: databaseUrl, max: 4 });
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

type Code = 'bad_request' | 'not_sent' | 'not_cleared' | 'wrong_model' | 'prompt_mismatch' | 'daily_cap' | 'spend' | 'no_limit' | 'already_claimed' | 'busy';
const STATUS: Record<Code, number> = { bad_request: 400, not_sent: 404, not_cleared: 403, wrong_model: 409, prompt_mismatch: 409,
  daily_cap: 429, spend: 429, no_limit: 503, already_claimed: 409, busy: 429 };
class Refused extends Error { constructor(public code: Code, public reason: string, public tenantId: string | null = null, public promptId: string | null = null) { super(reason); } }

/** Recorded before the answer: what was refused, and why. The payload holds ids and field names, never a text. */
async function recordRefusal(r: Refused, requestedCallId: string | null, payload: Record<string, unknown>) {
  try {
    await db.query(
      `INSERT INTO research_process_refusals (requested_call_id, tenant_id, prompt_id, code, reason, payload) VALUES ($1, $2, $3, $4, $5, $6)`,
      [requestedCallId, r.tenantId, r.promptId, r.code, r.reason, payload]);
  } catch (e) {
    console.error(`[ai-research] could not record a refusal (${r.code}): ${(e as { code?: string }).code ?? 'error'}`);
  }
  console.log(`[ai-research] refused ${r.code}${requestedCallId ? ` (call ${requestedCallId.slice(0, 8)})` : ''}`);
}

interface SentCall { id: string; tenant_id: string; prompt_id: string; prompt_sha256: string; model: string; retention_class: string;
  person_id: string; clearance_id: string; prompt_text: string; p_sha: string; institution_id: string | null; industry_id: string | null;
  k_kind: string | null; k_model: string | null; k_retention: string | null; k_institution: string | null; k_industry: string | null;
  k_tenant: string | null; k_withdrawn: boolean; has_result: boolean; claimed: boolean }

/** Every check, from the database, in order; throws Refused. Returns the sent call, its prompt text included. */
async function admit(callId: string): Promise<SentCall> {
  const { rows: [c] } = await db.query<SentCall>(
    `SELECT s.id, s.tenant_id, s.prompt_id, s.prompt_sha256, s.model, s.retention_class, s.person_id, s.clearance_id,
            p.prompt_text, p.prompt_sha256 AS p_sha, p.institution_id, p.industry_id,
            k.kind AS k_kind, k.model AS k_model, k.retention_class AS k_retention, k.institution_id AS k_institution,
            k.industry_id AS k_industry, k.tenant_id AS k_tenant,
            EXISTS (SELECT 1 FROM research_clearances w WHERE w.withdraws_clearance_id = k.id) AS k_withdrawn,
            EXISTS (SELECT 1 FROM research_calls r WHERE r.sent_call_id = s.id) AS has_result,
            EXISTS (SELECT 1 FROM research_call_claims m WHERE m.sent_call_id = s.id) AS claimed
       FROM research_calls s JOIN research_prompts p ON p.id = s.prompt_id
       LEFT JOIN research_clearances k ON k.id = s.clearance_id
      WHERE s.id = $1 AND s.kind = 'sent'`, [callId]);
  if (!c) throw new Refused('not_sent', `No call ${callId.slice(0, 8)} was recorded as sent by the API, so nothing is sent.`);
  const ids = [c.tenant_id, c.prompt_id] as const;
  if (c.has_result || c.claimed) throw new Refused('already_claimed', `Call ${callId.slice(0, 8)} was already sent; a call is sent once.`, ...ids);
  if (c.model !== model.id || c.retention_class !== model.retentionClass) {
    throw new Refused('wrong_model', `Call ${callId.slice(0, 8)} is for ${c.model}; this process runs ${model.id}.`, ...ids);
  }
  if (c.k_kind !== 'clearance' || c.k_withdrawn || c.k_tenant !== c.tenant_id || c.k_model !== model.id || c.k_retention !== model.retentionClass
      || c.k_institution !== c.institution_id || c.k_industry !== c.industry_id) {
    throw new Refused('not_cleared', `The prompt's ${c.institution_id ? 'account' : 'industry'} is not cleared for research with ${model.label}; nothing is sent.`, ...ids);
  }
  if (sha256(c.prompt_text) !== c.p_sha || c.p_sha !== c.prompt_sha256) {
    throw new Refused('prompt_mismatch', `The stored prompt does not match the SHA-256 the call names; nothing is sent.`, ...ids);
  }
  if (monthlyLimitUsd === null) throw new Refused('no_limit', 'This process has no monthly spend limit set, so it sends nothing.', ...ids);
  const subj = c.institution_id ? 'institution_id' : 'industry_id';
  const { rows: [n] } = await db.query<{ today: string; spent: string; pending: string }>(
    `SELECT (SELECT count(*) FROM research_calls s JOIN research_prompts q ON q.id = s.prompt_id
              WHERE s.kind = 'sent' AND q.${subj} = $1 AND s.at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::text AS today,
            coalesce((SELECT sum(cost_usd) FROM research_calls WHERE tenant_id = $2 AND kind = 'result'
              AND at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)::text AS spent,
            (SELECT count(*) FROM research_calls s WHERE s.tenant_id = $2 AND s.kind = 'sent' AND s.id <> $3
              AND s.at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
              AND NOT EXISTS (SELECT 1 FROM research_calls r WHERE r.sent_call_id = s.id))::text AS pending`,
    [c.institution_id ?? c.industry_id, c.tenant_id, c.id]);
  if (Number(n.today) > dailyLimit) throw new Refused('daily_cap', `${n.today} calls today (UTC) for this ${c.institution_id ? 'account' : 'industry'}; this process's cap is ${dailyLimit} a day.`, ...ids);
  const projected = Number(n.spent) + (Number(n.pending) + 1) * cappedCallUsd(model);
  if (projected > monthlyLimitUsd) {
    throw new Refused('spend', `This month's calls cost $${Number(n.spent).toFixed(2)}${Number(n.pending) ? `, with ${n.pending} unanswered` : ''}; this call at its cap would pass this process's $${monthlyLimitUsd.toFixed(2)} limit.`, ...ids);
  }
  return c;
}

/** In one transaction as the person who started the call: their claim, before anything is sent. */
async function claim(c: SentCall) {
  const cl = await db.connect();
  try {
    await cl.query('BEGIN');
    await cl.query('SELECT set_config($1, $2, true)', ['lvrf.actor_person_id', c.person_id]);
    await cl.query('INSERT INTO research_call_claims (sent_call_id) VALUES ($1)', [c.id]);
    await cl.query('COMMIT');
  } catch (e) {
    await cl.query('ROLLBACK').catch(() => null);
    throw new Refused('already_claimed', `Call ${c.id.slice(0, 8)} was already claimed or answered; a call is sent once.`, c.tenant_id, c.prompt_id);
  } finally {
    cl.release();
  }
}

/** The result row, the audit row after the call, written by this process as the person who started it. */
async function writeResult(c: SentCall, a: CallAnswer): Promise<string> {
  const cl = await db.connect();
  try {
    await cl.query('BEGIN');
    await cl.query('SELECT set_config($1, $2, true)', ['lvrf.actor_person_id', c.person_id]);
    const { rows: [r] } = await cl.query<{ id: string }>(
      `INSERT INTO research_calls (tenant_id, kind, prompt_id, prompt_sha256, sent_call_id, model, retention_class, outcome,
         answer_text, answer_sha256, request_id, stop_reason, error_type, http_status, usage, cost_usd, person_id)
       VALUES ($1, 'result', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [c.tenant_id, c.prompt_id, c.prompt_sha256, c.id, model.id, model.retentionClass, a.outcome,
        a.answer_text, a.answer_text === null ? null : sha256(a.answer_text), a.request_id, a.stop_reason, a.error_type, a.http_status,
        { ...a.usage, requests: a.requests, request_sha256: a.request_sha256, prices_read_on: PRICES_READ_ON },
        costUsd(model, a.usage).toFixed(4), c.person_id]);
    await cl.query('COMMIT');
    return r.id;
  } catch (e) {
    await cl.query('ROLLBACK').catch(() => null);
    throw e;
  } finally {
    cl.release();
  }
}

interface CallAnswer {
  outcome: 'answered' | 'refused' | 'truncated' | 'failed' | 'timeout';
  answer_text: string | null;
  request_id: string | null;
  stop_reason: string | null;
  usage: CallUsage;
  error_type: string | null;
  http_status: number | null;
  request_sha256: string;
  requests: number;
}

function requestBody(promptText: string) {
  return {
    model: model.id,
    max_tokens: CAPS.maxTokens,
    output_config: { effort: CAPS.effort },
    messages: [{ role: 'user' as const, content: promptText }],
    tools: [
      { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: CAPS.webSearchMaxUses, blocked_domains: CAPS.blockedDomains },
      {
        type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: CAPS.webFetchMaxUses,
        max_content_tokens: CAPS.webFetchMaxContentTokens, blocked_domains: CAPS.blockedDomains,
      },
    ],
  };
}

async function runCall(promptText: string): Promise<CallAnswer> {
  const first = requestBody(promptText);
  const usage: CallUsage = {
    input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    web_search_requests: 0, web_fetch_requests: 0,
  };
  const out: CallAnswer = {
    outcome: 'failed', answer_text: null, request_id: null, stop_reason: null, usage, error_type: null, http_status: null,
    request_sha256: sha256(JSON.stringify(first)), requests: 0,
  };
  const texts: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: any[] = first.messages;
  try {
    for (let turn = 0; turn <= CAPS.pauseTurnContinuations; turn++) {
      out.requests += 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = client!.messages.stream({ ...first, messages } as any);
      const msg = await stream.finalMessage();
      out.request_id = stream.request_id ?? out.request_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = msg.usage as any;
      usage.input_tokens += u?.input_tokens ?? 0;
      usage.output_tokens += u?.output_tokens ?? 0;
      usage.cache_creation_input_tokens += u?.cache_creation_input_tokens ?? 0;
      usage.cache_read_input_tokens += u?.cache_read_input_tokens ?? 0;
      usage.web_search_requests += u?.server_tool_use?.web_search_requests ?? 0;
      usage.web_fetch_requests += u?.server_tool_use?.web_fetch_requests ?? 0;
      for (const b of msg.content) if (b.type === 'text') texts.push(b.text);
      out.stop_reason = msg.stop_reason ?? null;
      if (msg.stop_reason === 'pause_turn' && turn < CAPS.pauseTurnContinuations) {
        messages = [...first.messages, { role: 'assistant', content: msg.content }];
        continue;
      }
      break;
    }
    const answer = texts.join('');
    if (out.stop_reason === 'refusal') out.outcome = 'refused';
    else if (out.stop_reason === 'max_tokens' || out.stop_reason === 'pause_turn') out.outcome = 'truncated';
    else if (answer.trim() === '') { out.outcome = 'failed'; out.error_type = 'empty_answer'; }
    else { out.outcome = 'answered'; out.answer_text = answer; }
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      out.outcome = 'timeout'; out.error_type = 'timeout';
    } else if (err instanceof Anthropic.APIError) {
      out.outcome = 'failed';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (err as any).error;
      out.error_type = typeof body?.error?.type === 'string' ? body.error.type : (err.status ? `http_${err.status}` : 'connection');
      out.http_status = typeof err.status === 'number' ? err.status : null;
      out.request_id = err.requestID ?? out.request_id;
    } else {
      out.outcome = 'failed'; out.error_type = 'stream';
    }
  }
  return out;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new Error('too large');
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

let running = 0;
let lastSmoke = 0;
const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/status') {
      send(res, 200, {
        configured: client !== null, model: model.id, retention_class: model.retentionClass, caps: CAPS,
        timeout_ms: timeoutMs, production, monthly_limit_usd: monthlyLimitUsd, daily_limit: dailyLimit,
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/smoke') {
      // §21.6: one fixed request with no client data and no tools, to prove the key from the box. At most once a minute.
      if (!client) { send(res, 503, { refused: 'no_key' }); return; }
      if (Date.now() - lastSmoke < 60_000) { send(res, 429, { refused: 'once_a_minute' }); return; }
      lastSmoke = Date.now();
      try {
        const msg = await client.messages.create({ model: model.id, max_tokens: 1024, output_config: { effort: 'low' },
          messages: [{ role: 'user', content: 'Reply with the word OK.' }] } as never) as Anthropic.Message;
        const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.TextBlock).text).join('');
        console.log(`[ai-research] smoke: ${msg.model}, ${msg.usage.input_tokens} in, ${msg.usage.output_tokens} out`);
        send(res, 200, { model: msg.model, answer: text.slice(0, 200), stop_reason: msg.stop_reason, input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens });
      } catch (err) {
        send(res, 502, { error_type: err instanceof Anthropic.APIError ? (err as unknown as { error?: { error?: { type?: string } } }).error?.error?.type ?? `http_${err.status}` : 'connection',
          http_status: err instanceof Anthropic.APIError ? err.status ?? null : null });
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/call') {
      if (!client) { send(res, 503, { refused: 'no_key' }); return; }
      let b: Record<string, unknown> | null = null;
      try { const v = await readJson(req, 4_096); b = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null; } catch { b = null; }
      const callId = b?.call_id;
      const fields = b ? Object.keys(b) : [];
      try {
        if (!b || !isUuid(callId) || fields.length !== 1) {
          throw new Refused('bad_request', 'A call request is { call_id } and nothing else: this process reads the prompt from the database itself.');
        }
        if (running >= 2) throw new Refused('busy', 'Two calls are already running; nothing is sent.');
        const c = await admit(callId);
        await claim(c);
        running += 1;
        try {
          const answer = await runCall(c.prompt_text);
          let resultId: string | null = null;
          try { resultId = await writeResult(c, answer); }
          catch (e) { console.error(`[ai-research] call ${callId.slice(0, 8)}: the result could not be recorded (${(e as { code?: string }).code ?? 'error'})`); }
          console.log(`[ai-research] call ${callId.slice(0, 8)}: ${answer.outcome}${answer.error_type ? ` (${answer.error_type})` : ''}, `
            + `${answer.usage.input_tokens} in, ${answer.usage.output_tokens} out, ${answer.usage.web_search_requests} searches`);
          send(res, resultId ? 200 : 500, { outcome: answer.outcome, result_id: resultId, error_type: answer.error_type, http_status: answer.http_status });
        } finally {
          running -= 1;
        }
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        await recordRefusal(e, isUuid(callId) ? callId : null, { call_id: isUuid(callId) ? callId : null, fields });
        send(res, STATUS[e.code], { refused: e.code, reason: e.reason });
      }
      return;
    }
    send(res, 404, { refused: 'unknown' });
  } catch {
    send(res, 400, { refused: 'bad_request' });
  }
});

if (existsSync(socketPath)) unlinkSync(socketPath);
server.requestTimeout = 0;
server.headersTimeout = 60_000;
server.on('error', (err: NodeJS.ErrnoException) => die(`cannot listen on ${socketPath} (${err.code ?? 'error'}).`));
server.listen(socketPath, () => {
  chmodSync(socketPath, 0o660);
  console.log(client
    ? `[ai-research] on: ${model.id}, ${CAPS.maxTokens} output tokens, ${CAPS.webSearchMaxUses} searches, ${CAPS.webFetchMaxUses} fetches per call`
    : '[ai-research] off: no key');
});
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => server.close(() => process.exit(0)));
