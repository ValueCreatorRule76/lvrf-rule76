// P2 — the browser walk of /lineage/:table/:id and its "Where this came from"
// links, over the Chrome DevTools Protocol. Called by
// scripts/verify_acts_lineage.sh; prints "  PASS"/"  FAIL" lines it counts.
// Signs in by SESSION — never the header. The CDP preamble is
// corrections_walk.mjs's.
//
//   node scripts/lib/lineage_walk.mjs VITE_PORT CDP_PORT SHOTS TOKEN FACT OUTCOME_SCOTTS INST RUN
import { writeFileSync } from 'node:fs';

const [VITE_PORT, CDP_PORT, SHOTS, TOKEN, FACT, OUTCOME, INST, RUN] = process.argv.slice(2);
const APP = `http://localhost:${VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(`${m}${detail ? ` — ${detail}` : ''}`));

const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
await send('Network.enable');
await send('Network.setCookie', { name: 'lvrf_session', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true });
const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
const open = async (path, ready, width = 1280) => {
  await viewport(width);
  await send('Page.navigate', { url: `${APP}${path}` });
  const shown = await waitFor(ready);
  await sleep(800);
  return shown;
};
const shot = async (name, width) => {
  const h = await ev('document.documentElement.scrollHeight');
  await viewport(width, Math.min(h, 12000)); await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  await viewport(width);
  console.log(`  shot  ${SHOTS}/${name}.png`);
};
const steps = `[...document.querySelectorAll('[data-testid=lineage-step]')]`;
const lineageReady = `!!document.querySelector('[data-testid=lineage-steps]') || !!document.querySelector('[data-testid=lineage-error]')`;

for (const width of [1280, 390]) {
  check(await open(`/lineage/institution_facts/${FACT}`, lineageReady, width), `fixture fact lineage @${width} opens`);
  const kinds = await ev(`${steps}.map(s=>s.dataset.kind+':'+s.dataset.source).join(' > ')`);
  check(kinds.startsWith('prompt:record > import:act > result:record > accept:act'), `@${width}: the steps in order, each with its source (prompt > import (act) > result > accept (act) …)`, kinds);
  const txt = await ev(`document.querySelector('[data-testid=lineage]').textContent`);
  check(txt.includes('Research import') && txt.includes('recorded as an act') && txt.includes('from the record') && txt.includes('sealed'), `@${width}: each step reads its source in words`);
  check(await ev(`${steps}.every(s=>/[A-Za-z]/.test(s.lastElementChild.textContent))`), `@${width}: every step names who (or "no one recorded")`);
  check((await ev('document.documentElement.scrollWidth')) <= width, `@${width}: no sideways scroll`);
  await shot(`p2_lineage_fact_${width}`, width);
}
await open(`/lineage/institution_facts/${FACT}`, lineageReady);
const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
writeFileSync(`${SHOTS}/p2_lineage_fact.pdf`, Buffer.from(pdf.result.data, 'base64'));

check(await open(`/lineage/value_outcomes/${OUTCOME}?figure=baseline`, lineageReady), "Scotts' TRIR baseline lineage opens");
const sk = await ev(`${steps}.map(s=>s.dataset.kind).join(',')`);
check(sk.startsWith('baseline,evidence') && !/prompt|import|result/.test(sk), "Scotts' baseline: recorded directly as outcome evidence — no research step shown", sk);
check(await ev(`document.querySelector('[data-testid=lineage]').textContent.includes('from the record')`), "  ...its pre-P2 steps read \"from the record\"");
await shot('p2_lineage_scotts_baseline_1280', 1280);

check(await open(`/accounts/${INST}/pov`, `!!document.querySelector('[data-testid=pov] h1')`), 'the POV opens');
const povLinks = await ev(`[...document.querySelectorAll('[data-testid=lineage-link]')].map(a=>a.getAttribute('href'))`);
check(povLinks.some((h) => h.startsWith('/lineage/institution_facts/')) && povLinks.some((h) => h.includes('figure=baseline')) && povLinks.some((h) => h.includes('figure=actual')),
  'the POV links "Where this came from" from each fact and from the baseline and the actual', JSON.stringify(povLinks));
check(await ev(`[...document.querySelectorAll('[data-testid=lineage-link]')].every(a=>getComputedStyle(a).display!=='none') && [...document.styleSheets].length > 0`), '  ...shown on screen');
await shot('p2_pov_links_1280', 1280);
check(await open(`/runs/${RUN}`, `!!document.querySelector('[data-testid=run-page] h1')`), 'the run page opens');
await ev(`document.querySelectorAll('details').forEach(d=>d.open=true)`); await sleep(300);
const runLinks = await ev(`[...document.querySelectorAll('[data-testid=sealed-item] [data-testid=lineage-link]')].map(a=>a.getAttribute('href'))`);
check(runLinks.length > 0 && runLinks.every((h) => /^\/lineage\/value_outcomes\/[0-9a-f-]+\?figure=(baseline|actual)$/.test(h)),
  "the run page's sealed evidence links to its outcome's figure (the sealed item carries no id)", JSON.stringify(runLinks));
check(await open(`/accounts/${INST}`, `!!document.body.textContent.includes('Account facts') || !!document.querySelector('[data-testid=lineage-link]')`), 'the account page opens');
await ev(`document.querySelectorAll('details').forEach(d=>d.open=true)`); await sleep(400);
check(await ev(`[...document.querySelectorAll('[data-testid=lineage-link]')].some(a=>a.getAttribute('href').startsWith('/lineage/institution_facts/'))`), 'the account facts card links each fact');

ws.close();
process.exit(0);
