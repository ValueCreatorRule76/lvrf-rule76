/**
 * S2 (3.1; LVRF_PLAN §21, D2 ruled by Brad 18 Nov 2026) — the research process: the ONLY code that holds Anthropic's
 * key and the only importer of @anthropic-ai/sdk (a Gate A grep refuses any other).
 *
 * On the box it runs as its own system user, `lvrf-research` (ops/lvrf-research.service), from ONE bundled file
 * installed root-owned at /opt/lvrf-research/sidecar.mjs. The key comes from /etc/lvrf-research.env (root, 600), read
 * by systemd. No `brad` process can read the key: not the file, not this process's environment (another uid), and not
 * by changing this code (root-owned). Root can; Brad's interactive sudo, with its password, is root.
 *
 * It listens on a unix socket (LVRF_RESEARCH_SOCKET, /run/lvrf-research/sock in production), group-readable by the
 * group `brad` is in, and answers two requests:
 *   GET  /status  whether a key is configured, the model and the caps (never the key);
 *   POST /call    { call_id, prompt_text, prompt_sha256 }: runs ONE research call and answers when it is done.
 * Every request it sends is built here, from aiSettings.ts: the API asks for a prompt to be run and chooses nothing
 * else. The prompt goes as the one user turn, byte for byte. No system prompt, no metadata, no fallbacks (D9).
 *
 * It never logs, returns or records the key, a header, or an error's message: only an error's type and status.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { CAPS, DEFAULT_MODEL, MODELS, type CallUsage } from '../aiSettings.js';

const env = process.env;
const production = env.NODE_ENV === 'production';
const socketPath = env.LVRF_RESEARCH_SOCKET ?? (production ? '/run/lvrf-research/sock' : '');
const appDir = env.LVRF_APP_DIR ?? '/srv/lvrf';
const timeoutMs = Number(env.LVRF_RESEARCH_TIMEOUT_MS ?? CAPS.timeoutMs);
const modelId = env.LVRF_RESEARCH_MODEL ?? DEFAULT_MODEL;
const model = MODELS[modelId];
const key = env.ANTHROPIC_API_KEY ?? '';
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
// Outside production, a key is used only against a stand-in: no test, and nothing on a dev machine, reaches Anthropic.
if (!production && key && !env.ANTHROPIC_BASE_URL) die('outside production, a key needs ANTHROPIC_BASE_URL (a local stand-in); nothing here reaches Anthropic.');
if (production) {
  // Production talks to api.anthropic.com only; a stand-in is for tests.
  if (env.ANTHROPIC_BASE_URL !== undefined) die('ANTHROPIC_BASE_URL is set; production talks to api.anthropic.com only.');
  // D2: not the user that owns the app, and not code that user could change.
  if (existsSync(appDir) && statSync(appDir).uid === process.getuid?.()) {
    die(`this process runs as the owner of ${appDir}; it must run as its own user (lvrf-research).`);
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
        timeout_ms: timeoutMs, production,
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
      const b = await readJson(req, CAPS.promptMaxBytes * 2) as Record<string, unknown>;
      const promptText = b?.prompt_text;
      const callId = b?.call_id;
      if (typeof promptText !== 'string' || promptText === '' || typeof callId !== 'string'
          || Buffer.byteLength(promptText, 'utf8') > CAPS.promptMaxBytes || sha256(promptText) !== b?.prompt_sha256) {
        send(res, 400, { refused: 'bad_request' });
        return;
      }
      if (running >= 2) { send(res, 429, { refused: 'busy' }); return; }
      running += 1;
      try {
        const answer = await runCall(promptText);
        console.log(`[ai-research] call ${callId.slice(0, 8)}: ${answer.outcome}${answer.error_type ? ` (${answer.error_type})` : ''}, `
          + `${answer.usage.input_tokens} in, ${answer.usage.output_tokens} out, ${answer.usage.web_search_requests} searches`);
        send(res, 200, answer);
      } finally {
        running -= 1;
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
