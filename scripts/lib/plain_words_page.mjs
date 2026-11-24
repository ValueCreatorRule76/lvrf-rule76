// §28 — the words on the page, for scripts/verify_plain_words.sh. Signed in as the steward by session.
import { writeFileSync } from 'node:fs';

const SECTIONS = (process.argv[2] ?? 'form').split(',');
const E = process.env;
const TAG = E.TAG ?? 'words';
const APP = `http://localhost:${E.VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (c, m, d = '') => { const line = `${c ? 'PASS' : 'FAIL'}  ${TAG}: ${m}${!c && d ? ` — ${String(d).slice(0, 400)}` : ''}`; out.push(line); console.log(line); };

const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 25000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data && E.OUT_DIR) writeFileSync(`${E.OUT_DIR}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

await go('/');
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await go('/');
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await waitFor(`document.body.textContent.includes('Signed in as')`))) { check(false, 'signed in through the page'); console.log('DONE'); process.exit(0); }

const row = (id) => `document.querySelector('[data-testid=spine-outcome][data-outcome="${id}"]')`;
if (SECTIONS.includes('words')) {
  await go(`/accounts/${E.CURIA}`);
  await waitFor(`!!document.querySelector('[data-testid=account-detail]') || !!document.querySelector('[data-testid=outcome-spine]')`, 30000);
  await ev(`(()=>{document.querySelectorAll('[data-testid=account-detail]').forEach(d=>{d.open=true});return true})()`); await sleep(600);
  check(await waitFor(`!!${row(E.CURIA_O)}`, 30000), `words: card 01d lists Curia's ${E.CURIA_O.slice(0, 8)}`);
  const line = await ev(`${row(E.CURIA_O)}?.textContent ?? ''`);
  check(line.includes('attribution not stated (committed before attribution was recorded, 6 Nov 2026)'), 'words: card 01d reads "not stated (committed before attribution was recorded, 6 Nov 2026)" (D2)', line);
  check((await ev(`${row(E.CURIA_O)}?.querySelector('[data-testid=outcome-promised]')?.textContent ?? ''`)) === ' · no promised date on record (committed before promised dates were recorded, 24 Nov 2026)',
    'words: card 01d reads "no promised date on record (committed before promised dates were recorded, 24 Nov 2026)" (D2)', line);
  check(!/§|\bB4\b/.test(line), '  ...and neither "§" nor "B4" on the row', line);
  // No sealed run on the prod copy prints the value case's pre-attribution line (Curia's runs are payloadVersion 1, with
  // no attribution sealed); its words are checked in the source by the shell script.
  await go(`/runs/${E.RUN13}/case`);
  await waitFor(`/record hash [0-9a-f]{64}/.test(document.body.textContent)`, 40000);
  const rec = await ev(`(document.body.textContent.match(/record hash [0-9a-f]{64} · printed \\d{4}-\\d{2}-\\d{2}[^\\n]*/)||[''])[0]`);
  check(/ · printed \d{4}-\d{2}-\d{2} \(UTC\)/.test(rec), 'words: the value case\'s printed-on date says "(UTC)" (D5)', rec);
  await go(`/runs/${E.RUN13}`);
  check(await waitFor(`/Printed \\d{1,2} [A-Z][a-z]{2} \\d{4} \\(UTC\\) · rendered/.test(document.body.textContent)`, 40000), 'words: the run page\'s printed-on line says "(UTC)" (D5)',
    await ev(`(document.body.textContent.match(/Printed [^\\n]*/)||[''])[0]`));
}
console.log(`DONE ${out.filter((l) => l.startsWith('PASS')).length} ${out.filter((l) => l.startsWith('FAIL')).length}`);
ws.close();
process.exit(0);
