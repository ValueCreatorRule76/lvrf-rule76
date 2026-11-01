// L41 + L47 — the browser walk: Record a source, open it, name the role from it; the forms no longer ask
// whether evidence is verified. Called by scripts/verify_evidence_final.sh; prints "  PASS"/"  FAIL" lines it counts.
//
//   node scripts/lib/l41_walk.mjs MODE VITE_PORT CDP_PORT SHOTS TOKEN   (the rest in env)
import { writeFileSync } from 'node:fs';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, TOKEN] = process.argv.slice(2);
const E = process.env;
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
const posts = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST') posts.push(new URL(m.params.request.url).pathname);
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
  await sleep(1200);
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
const printTo = async (name) => {
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/${name}`, Buffer.from(pdf.result.data, 'base64'));
};
const setField = (scopeExpr, labelText, value) => ev(`(()=>{
  const root=${scopeExpr}; if(!root) return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)})); if(!l) return 'no label';
  const el=l.querySelector('input,select,textarea'); if(!el) return 'no field';
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
const submitIn = (scopeExpr, label) => ev(`(()=>{const el=[...${scopeExpr}.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(label)}));if(!el||el.disabled)return false;el.click();return true})()`);
const confirmIn = (scopeExpr) => ev(`(()=>{const b=${scopeExpr}.querySelector('[data-testid=form-confirm-yes]');if(!b)return false;b.click();return true})()`);
const runReady = `!!document.querySelector('[data-testid=run-page] h1')`;
const posted = (part) => posts.filter((p) => p.includes(part)).length;
const text = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(x=>x.textContent).join(' | ')`);


if (MODE === 'source') {
  check(await open(`/accounts/${E.WALK_INST}`, `!!document.querySelector('[data-testid=account-detail]')`), 'the account page');
  await ev(`document.querySelector('[data-testid=account-detail]').open = true`); await sleep(800);
  const card = `document.querySelector('[data-testid=account-evidence]')`;
  check(await waitFor(`!!${card}`), "the account's evidence card");
  check(await ev(`(()=>{const b=${card}.querySelector('[data-testid=record-source-open]');if(!b)return false;b.click();return true})()`), '"Record a source…" opens');
  await sleep(500);
  const f = `${card}.querySelector('[data-testid=record-source]')`;
  check(!(await ev(`!!${f}.querySelector('[data-testid=source-verified]')`)), '  ...it does not ask whether the source is verified');
  check((await ev(`${f}.querySelector('[data-testid=about-choice]').value`)) === 'account', '  ...what it is about defaults to this account, shown');
  await setField(f, 'Kind', 'artifact');
  await setField(f, 'What it states', 'Org chart naming the walk owner as metric owner (fixture)');
  await setField(f, 'Where it came from', 'Fixture org chart, Q3 (not a source)');
  await setField(f, 'What it rests on', 'quote'); await sleep(300);
  await setField(f, 'Quote', 'Walk owner, metric owner.');
  await setField(f, 'How it was read', 'Read from the fixture org chart, top box.'); await sleep(300);
  await shot('l41_record_source_1280', 1280);
  const before = posted(`/institutions/${E.WALK_INST}/evidence`);
  check(await submitIn(f, 'Record the source'), 'the source is submitted');
  await sleep(500);
  if (await ev(`!!${f}?.querySelector('[data-testid=form-confirm-yes]')`)) await confirmIn(f);
  check(await waitFor(`[...document.querySelectorAll('[data-testid=account-evidence-row]')].some(r=>r.textContent.includes('Org chart naming the walk owner'))`), '  ...it appears on the card');
  check(posted(`/institutions/${E.WALK_INST}/evidence`) - before === 1, '  ...one request');
  const row = `[...document.querySelectorAll('[data-testid=account-evidence-row]')].find(r=>r.textContent.includes('Org chart naming the walk owner'))`;
  check((await ev(`${row}.textContent`)).includes('Not source-verified'), '  ...unverified');
  check((await ev(`${row}.querySelector('[data-testid=evidence-about]').textContent`)).startsWith('about '), '  ...about the account');
  check(await ev(`(()=>{const b=${row}.querySelector('[data-testid=open-source-open]');if(!b)return false;b.click();return true})()`), '"Record that you opened the source…" opens');
  await sleep(400);
  const o = `${row}.querySelector('[data-testid=open-source]')`;
  await setField(o, 'Does the source say what this evidence states?', 'true'); await sleep(300);
  await shot('l41_open_source_1280', 1280);
  check(await submitIn(o, 'Record the opening'), 'the opening is submitted');
  await sleep(500);
  if (await ev(`!!${o}?.querySelector('[data-testid=form-confirm-yes]')`)) await confirmIn(o);
  check(await waitFor(`!!document.querySelector('[data-testid=evidence-opened]')`), '  ...the row shows who opened it');
  check((await ev(`${row}.textContent`)).includes('Source-verified'), '  ...verified now');
  await open(`/accounts/${E.WALK_INST}`, `!!document.querySelector('[data-testid=account-detail]')`);
  await ev(`document.querySelector('[data-testid=account-detail]').open = true`); await sleep(800);
  check(await ev(`(()=>{const b=document.querySelector('[data-testid=customer-role-open]');if(!b||b.disabled)return false;b.click();return true})()`), 'the roles card opens');
  await sleep(500);
  const r = `document.querySelector('[data-testid=customer-role-form]')`;
  check((await ev(`[...${r}.querySelectorAll('option')].map(o=>o.textContent).join('|')`)).includes('Org chart naming the walk owner'), '  ...the opened source is offered');
  check(await ev(`!!document.querySelector('[data-testid=record-source-open]')`), '  ..."Record a source…" is on the roles card');
  await shot('l41_roles_1280', 1280);
  await shot('l41_roles_375', 375);
}

if (MODE === 'aboutbatch') {
  check(await open('/runs', `!!document.querySelector('[data-testid=about-batch]')`), 'the Runs page shows the about batch');
  check((await text('[data-testid=about-batch-count]')).startsWith(`${E.ABOUT_COUNT} rows; ${E.ABOUT_OPEN} left for you to state`), `  ...${E.ABOUT_COUNT} rows, ${E.ABOUT_OPEN} left open`, await text('[data-testid=about-batch-count]'));
  const rows = await ev(`[...document.querySelectorAll('[data-testid=about-batch-row]')].map(r=>({p:r.dataset.proposed,v:r.querySelector('select').value,t:r.textContent.length}))`);
  check(rows.length === Number(E.ABOUT_COUNT), '  ...every row listed', String(rows.length));
  check(rows.every((r) => (r.p === 'account' ? r.v === 'account' : r.v === '')), '  ...a derived row is pre-filled; the rest are not (condition 2)');
  const f = `document.querySelector('[data-testid=about-batch]')`;
  await setField(f, 'Why they are stated', 'Verification: the walk leaves this unsent.'); await sleep(300);
  check(await ev(`[...${f}.querySelectorAll('button')].find(e=>e.textContent.includes('State the')).disabled`), '  ...the submit waits while a row is open');
  check((await ev(`${f}.textContent`)).includes(`state the ${E.ABOUT_OPEN} rows left open`), '  ...saying so in words');
  await shot('l41_about_batch_1280', 1280);
  await shot('l41_about_batch_375', 375);
}

const LINE = 'verified without the source being opened';
const openAll = async () => { await ev(`[...document.querySelectorAll('details')].forEach(d=>{d.open=true})`); await sleep(600); };
const lineCount = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x=>[...x.querySelectorAll('[data-testid=verified-unopened]')].length>0).length`);

if (MODE === 'fourrows') {
  check(await open(`/accounts/${E.SELF_INST}`, `!!document.querySelector('[data-testid=account-evidence]')`), "the tenant's own account page shows the evidence card");
  const sel = `document.querySelector('[data-evidence="${E.UNOPENED_ROW}"]')`;
  check(await waitFor(`!!${sel}`), '  ...a verified, unopened row is reachable');
  check((await ev(`${sel}.textContent`)).includes('verified without the source being opened'), '  ...reading "verified without the source being opened"');
  check(await ev(`!!${sel}.querySelector('[data-testid=open-source-open]') && !!${sel}.querySelector('[data-testid=withdraw-verification-open]')`), '  ...with both of its ends: open it, or withdraw the verification');
  await shot('l41_four_rows_1280', 1280);

  // Brad, 1 Nov 2026: the POV, W6 and the lineage, against the four real rows, as C3b left them. Each of the first
  // two is asserted as it stands, so a change is seen: the POV draws evidence only under a hypothesis, and neither
  // account has one; Skillsoft, the tenant's own account, has no walk; Curia's W6 shows lot acceptance (L43).
  check(await open(`/accounts/${E.SELF_INST}/pov`, `!!document.querySelector('[data-testid=pov]')`), "the POV: Skillsoft's");
  check(await lineCount('body') === 0, '  ...9765335f and 271a449a are not on it: no hypothesis, so no evidence is drawn');
  await shot('l41_real_pov_self_1280', 1280);
  check(await open(`/accounts/${E.CURIA_INST}/pov`, `!!document.querySelector('[data-testid=pov]')`), "the POV: Curia's");
  check(await lineCount('body') === 0, '  ...1632a5e0 and f9775317 are not on it, for the same reason');
  check(await open(`/accounts/${E.SELF_INST}`, `!!document.querySelector('[data-testid=account-evidence]')`), 'W6: the tenant\'s own account');
  check(!(await ev(`!!document.querySelector('[data-testid=w6]')`)), '  ...has no walk, so no W6');
  check(await waitFor(`[${JSON.stringify(E.ROW_9)},${JSON.stringify(E.ROW_2)}].every(id=>(document.querySelector('[data-evidence="'+id+'"]')?.textContent??'').includes(${JSON.stringify(LINE)}))`), "  ...the account's evidence card carries the line on both");
  await shot('l41_real_self_card_1280', 1280);
  check(await open(`/accounts/${E.CURIA_INST}`, `!!document.querySelector('[data-testid=w6]')`), "W6: Curia's");
  await openAll();
  check(await lineCount('[data-testid=w6-evidence],[data-testid=w6-withdrawn]') === 0, '  ...shows lot acceptance, with no evidence: the 2 rows are not in it (L43)');
  check(await waitFor(`[${JSON.stringify(E.ROW_1)},${JSON.stringify(E.ROW_F)}].every(id=>(document.querySelector('[data-evidence="'+id+'"]')?.textContent??'').includes(${JSON.stringify(LINE)}))`), "  ...the account's evidence card carries the line on both");
  for (const [name, id] of [['9765335f', E.ROW_9], ['271a449a', E.ROW_2], ['1632a5e0', E.ROW_1], ['f9775317', E.ROW_F]]) {
    check(await open(`/lineage/evidence/${id}`, `!!document.querySelector('[data-testid=lineage-steps]')`), `the lineage of ${name}`);
    check((await text('[data-testid=lineage-steps]')).includes(LINE), '  ...carries the line');
    if (name === '1632a5e0') await shot('l41_real_lineage_1632_1280', 1280);
  }
}

if (MODE === 'fourlinked') {
  // On this clone only: a lever, a hypothesis and two links, so Curia's real rows reach the surfaces that draw them.
  check(await open(`/accounts/${E.CURIA_INST}/pov`, `!!document.querySelector('[data-testid=pov]')`), "the POV: Curia's, once the outcome has a hypothesis (clone only)");
  check(await lineCount('li') === 2, '  ...1632a5e0 and f9775317 each carry the line', String(await lineCount('li')));
  await shot('l41_real_pov_curia_linked_1280', 1280);
  await shot('l41_real_pov_curia_linked_375', 375);
  check(await open(`/accounts/${E.CURIA_INST}`, `!!document.querySelector('[data-testid=w6]')`), "W6: Curia's, the same rows linked (clone only)");
  await openAll();
  check(await lineCount('[data-testid=w6-evidence]') === 2, '  ...each carries the line', String(await lineCount('[data-testid=w6-evidence]')));
  await shot('l41_real_w6_curia_linked_1280', 1280);
}

if (MODE === 'seal') {
  check(await open(`/runs/${E.RUN}`, runReady), 'the v3 run page');
  await ev(`[...document.querySelectorAll('details')].forEach(d=>{d.open=true})`); await sleep(500);
  const all = await text('[data-testid=sealed-item]');
  check(all.includes('verified without the source being opened'), '  ...the seal shows "verified without the source being opened" (condition 3)', all.slice(0, 200));
  check((await text('[data-testid=sealed-about]')).includes('About '), '  ...and what each item is about');
  await shot('l41_v3_run_1280', 1280);
}

ws.close();
process.exit(0);
