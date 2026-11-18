#!/usr/bin/env node
// S2 (3.1; LVRF_PLAN §21) — a local stand-in for Anthropic's Messages API, for Gate A only. No real model is called in
// Gate A (Brad, 18 Nov 2026). The research process reaches it through ANTHROPIC_BASE_URL, which only a non-production
// process accepts, with a placeholder key.
//
//   node scripts/lib/fakeAnthropic.mjs PORT LOG_FILE
//
// POST /v1/messages     streams (SSE) the next scripted answer, and appends the request (headers and body) to LOG_FILE
// POST /__next          { mode, text?, delay_ms?, usage? } — the answer for the next request
//                       modes: answer | refusal | max_tokens | pause_then_answer | error | cut | slow | empty
// GET  /__count         how many /v1/messages requests it has received
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [port, logFile] = process.argv.slice(2);
let next = { mode: 'answer', text: '{}' };
let count = 0;
let pauseState = false;

const sse = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const usage0 = (u = {}) => ({ input_tokens: u.input_tokens ?? 120000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  server_tool_use: { web_search_requests: u.web_search_requests ?? 7, web_fetch_requests: u.web_fetch_requests ?? 3 } });

function stream(res, body, text, stopReason, opts = {}) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': `req_fake_${count}` });
  const u = usage0(opts.usage);
  sse(res, 'message_start', { message: { id: `msg_fake_${count}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: u } });
  let i = 0;
  if (opts.search) {
    sse(res, 'content_block_start', { index: i, content_block: { type: 'server_tool_use', id: `srvtoolu_${count}`, name: 'web_search', input: {} } });
    sse(res, 'content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: '{"query":"stand-in search"}' } });
    sse(res, 'content_block_stop', { index: i });
    i += 1;
  }
  if (text !== null) {
    sse(res, 'content_block_start', { index: i, content_block: { type: 'text', text: '' } });
    const step = Math.max(1, Math.ceil(text.length / 5));
    for (let k = 0; k < text.length; k += step) sse(res, 'content_block_delta', { index: i, delta: { type: 'text_delta', text: text.slice(k, k + step) } });
    if (opts.cut) { res.destroy(); return; }
    sse(res, 'content_block_stop', { index: i });
  }
  sse(res, 'message_delta', { delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: opts.usage?.output_tokens ?? 9000, input_tokens: u.input_tokens, cache_read_input_tokens: u.cache_read_input_tokens, server_tool_use: u.server_tool_use } });
  sse(res, 'message_stop', {});
  res.end();
}

createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    if (req.method === 'POST' && req.url === '/__next') { next = JSON.parse(raw); pauseState = false; res.end('{}'); return; }
    if (req.method === 'GET' && req.url === '/__count') { res.end(JSON.stringify({ count })); return; }
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) { res.writeHead(404); res.end(); return; }
    count += 1;
    const body = JSON.parse(raw);
    appendFileSync(logFile, JSON.stringify({ n: count, headers: req.headers, body }) + '\n');
    const n = next;
    if (body.stream !== true) {  // a plain request (the smoke request, §21.6): one JSON message
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': `req_fake_${count}` });
      res.end(JSON.stringify({ id: `msg_fake_${count}`, type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 14, output_tokens: 3 } }));
      return;
    }
    const go = () => {
      switch (n.mode) {
        case 'refusal': return stream(res, body, null, 'refusal');
        case 'max_tokens': return stream(res, body, n.text ?? '{"partial":', 'max_tokens');
        case 'empty': return stream(res, body, '', 'end_turn');
        case 'cut': return stream(res, body, n.text ?? '{"never finished', 'end_turn', { cut: true });
        case 'error':
          res.writeHead(n.status ?? 400, { 'content-type': 'application/json', 'request-id': `req_fake_${count}` });
          return res.end(JSON.stringify({ type: 'error', error: { type: n.error_type ?? 'invalid_request_error',
            message: n.message ?? 'You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.' } }));
        case 'pause_then_answer':
          if (!pauseState) { pauseState = true; return stream(res, body, null, 'pause_turn', { search: true, usage: n.usage }); }
          return stream(res, body, n.text, 'end_turn', { usage: n.usage });
        default: return stream(res, body, n.text, 'end_turn', { search: true, usage: n.usage });
      }
    };
    if (n.mode === 'slow') setTimeout(() => stream(res, body, n.text ?? '{}', 'end_turn'), n.delay_ms ?? 10000);
    else go();
  });
}).listen(Number(port), '127.0.0.1', () => console.log(`fake anthropic on ${port}`));
