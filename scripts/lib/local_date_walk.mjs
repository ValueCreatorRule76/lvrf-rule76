// §28 D4 — the walk dates in the person's own time zone, for scripts/verify_local_date.sh. The browser's time zone is
// set (Emulation.setTimezoneOverride) and its clock pinned (Date replaced before any page script runs), then card 01d's
// three forms are opened on E.INST's outcomes and their default dates read.
//
//   TZ_ID=America/New_York EPOCH=<ms> node scripts/lib/local_date_walk.mjs SECTION[,SECTION]
//
//   defaults  Committed on (E.OC), Measured on (E.OM) and Verified on (E.OV) each default to E.WANT_DAY
//   commit    on E.OC: measure-by E.WANT_DAY is refused in words; E.BY admitted; confirm; the card shows the date
import { readFileSync } from 'node:fs';

const SECTIONS = (process.argv[2] ?? 'defaults').split(',');
const E = process.env;
const TAG = E.TAG ?? 'local';
const APP = `http://localhost:${E.VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (c, m, d = '') => { const line = `${c ? 'PASS' : 'FAIL'}  ${TAG}: ${m}${!c && d ? ` — ${String(d).slice(0, 300)}` : ''}`; out.push(line); console.log(line); };
const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 25000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

// Sign in first, on the real clock (a session's own times are the server's); then the time zone and the pinned clock.
await go('/');
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await go('/');
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await waitFor(`document.body.textContent.includes('Signed in as')`))) { check(false, 'signed in through the page'); console.log('DONE'); process.exit(0); }
await send('Emulation.setTimezoneOverride', { timezoneId: E.TZ_ID });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const T=${Number(E.EPOCH)};const R=Date;
  class D extends R{constructor(...a){super(...(a.length?a:[T]))} static now(){return T}}; D.UTC=R.UTC; D.parse=R.parse; window.Date=D;})();` });
await go('/');
const local = await ev(`(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+' | UTC '+d.toISOString().slice(0,16)})()`);
check(local === E.WANT_CLOCK, `the browser reads ${E.WANT_CLOCK} (${E.TZ_ID})`, local);

const row = (id) => `document.querySelector('[data-testid=spine-outcome][data-outcome="${id}"]')`;
const openCard = async () => {
  await go(`/accounts/${E.INST}`);
  await waitFor(`!!document.querySelector('[data-testid=account-detail]') || !!document.querySelector('[data-testid=outcome-spine]')`, 30000);
  await ev(`(()=>{document.querySelectorAll('[data-testid=account-detail]').forEach(d=>{d.open=true});return true})()`); await sleep(600);
  return waitFor(`!!${row(E.OC)} && !!${row(E.OM)} && !!${row(E.OV)}`, 30000);
};
const set = (scope, testid, value) => ev(`(()=>{const el=${scope}?.querySelector('[data-testid=${testid}]');if(!el)return false;
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);

if (SECTIONS.includes('defaults')) {
  check(await openCard(), 'defaults: card 01d lists the three fixture outcomes');
  for (const [o, open, field, name] of [[E.OC, 'commit-open', 'commit-on', 'Committed on'], [E.OM, 'measure-open', 'measure-on', 'Measured on'], [E.OV, 'verify-open', 'verify-on', 'Verified on']]) {
    await ev(`${row(o)}.querySelector('[data-testid=${open}]')?.click()`); await sleep(300);
    const v = await ev(`${row(o)}.querySelector('[data-testid=${field}]')?.value ?? null`);
    check(v === E.WANT_DAY, `defaults: "${name}" defaults to ${E.WANT_DAY}, the local date in ${E.TZ_ID}`, v);
  }
}

if (SECTIONS.includes('commit')) {
  check(await openCard(), 'commit: card 01d');
  await ev(`${row(E.OC)}.querySelector('[data-testid=commit-open]')?.click()`); await sleep(300);
  const f = `${row(E.OC)}?.querySelector('[data-testid=commit]')`;
  const who = await ev(`[...${f}.querySelectorAll('[data-testid=commit-committer] option')].find(o=>o.textContent.startsWith(${JSON.stringify(E.COMMITTER)}))?.value ?? ''`);
  for (const [id, v] of [['commit-target', '1.2'], ['commit-committer', who], ['commit-method', 'contribution_only'], ['commit-class', 'capability_performance'], ['commit-note', 'Verification: committed late in the evening (§28).']]) await set(f, id, v);
  await set(f, 'commit-by', E.WANT_DAY); await sleep(250);
  const u = await ev(`${f}.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`);
  check(u === 'To submit: make the measure-by date after the commit date and within three years of it.', `commit: measure-by ${E.WANT_DAY}, the same evening's date, is refused by the form in words`, u);
  await set(f, 'commit-by', E.BY); await sleep(250);
  check((await ev(`${f}.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`)) === '', `commit: measure-by ${E.BY} is admitted by the form`);
  await ev(`${f}.querySelector('button[type=submit]').click()`);
  check(await waitFor(`!!${f}?.querySelector('[data-testid=form-confirm]')`), 'commit: it asks for confirmation');
  const ct = await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(ct.includes(`, on ${E.WANT_DAY}; measured by ${E.BY};`), `commit: the confirmation names the local date and the measure-by date`, ct);
  await ev(`${f}.querySelector('[data-testid=form-confirm-yes]').click()`);
  check(await waitFor(`(${row(E.OC)}?.querySelector('[data-testid=outcome-promised]')?.textContent ?? '') === ' · measurement promised by ${E.BY}'`, 20000), 'commit: confirmed; the card shows the measure-by date');
}

console.log(`DONE ${out.filter((l) => l.startsWith('PASS')).length} ${out.filter((l) => l.startsWith('FAIL')).length}`);
ws.close();
process.exit(0);
