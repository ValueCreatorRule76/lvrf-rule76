// §28 D1 — the rendered sweep: every page at 1280, its visible text scanned for a plan code. Signed in as the steward
// by session. For each hit it prints one JSON line {path, code, text}: the text node that carries it. The shell script
// classifies each one (app text fails; the record's own words are listed). Then DONE.
//
//   PATHS=<file, one path per line> node scripts/lib/plain_words_sweep.mjs
import { readFileSync } from 'node:fs';

const E = process.env;
const APP = `http://localhost:${E.VITE_PORT}`;
const PATHS = readFileSync(E.PATHS, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
// The same pattern as scripts/check_plain_words.mjs.
const CODE = String.raw`§|LVRF_PLAN|AMENDMENT-\d|HEARTBEAT-REGISTER|\b(?:SS?[1-9]|B[1-9]|L\d{1,3}|C[1-9]b?|O-D\d+|O\d-D\d+|D\d{1,2}|P\d{1,2})\b`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  // A dialog would block every evaluation: dismiss it, and say so.
  if (m.method === 'Page.javascriptDialogOpening') { console.log(`NOTE  sweep: a dialog was dismissed: ${m.params?.message ?? ''}`); ws.send(JSON.stringify({ id: ++n, method: 'Page.handleJavaScriptDialog', params: { accept: false } })); } });
// Every call answers within 20 s, or resolves empty (a page that hangs is reported, never waited on forever).
const send = (method, params = {}) => new Promise((r) => { const id = ++n; const to = setTimeout(() => { pend.delete(id); r({ timeout: true }); }, 20000); pend.set(id, (m) => { clearTimeout(to); r(m); }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 20000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await go('/');
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await go('/');
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await waitFor(`document.body.textContent.includes('Signed in as')`))) { console.log('FAIL  sweep: signed in through the page'); console.log('DONE'); process.exit(0); }
console.log('PASS  sweep: signed in through the page');

let pages = 0;
for (const path of PATHS) {
  console.log(`PAGE ${path}`);
  await go(path);
  // Settled: the same text twice, 700 ms apart, with nothing loading.
  let last = ''; for (let i = 0; i < 30; i++) { await sleep(700); const cur = await ev(`document.body.innerText`); if (cur === last && !/\bloading\b|…$/m.test(cur)) break; last = cur; }
  await ev(`(()=>{document.querySelectorAll('details').forEach(d=>{d.open=true});return true})()`); await sleep(500);
  const hits = await ev(`(()=>{const re=new RegExp(${JSON.stringify(CODE)});const out=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    for(let x=w.nextNode();x;x=w.nextNode()){const t=x.textContent;const m=t.match(re);if(!m)continue;const el=x.parentElement;if(!el||!el.getClientRects().length)continue;
      let vis=true;for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'){vis=false;break}}if(!vis)continue;
      out.push({code:m[0],text:t.trim().slice(0,300),mono:getComputedStyle(el).fontFamily.includes('monospace')})}return out})()`);
  if (hits === undefined) { console.log(`FAIL  sweep: ${path} did not answer`); continue; }
  pages++;
  for (const h of hits ?? []) console.log(`HIT ${JSON.stringify({ path, ...h })}`);
}
console.log(`PASS  sweep: ${pages} pages read at 1280`);
console.log('DONE');
ws.close();
process.exit(0);
