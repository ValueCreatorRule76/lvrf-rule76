// C3 — the browser walk: customer-side roles named from a source, the two steward batches (each confirmed,
// with its count), system-exercise marks on every surface and in print, credit errata, and headlines (the latest
// unmarked run, with its erratum line). Called by scripts/verify_c3.sh; prints "  PASS"/"  FAIL" lines it
// counts. The CDP preamble is corrections_walk.mjs's. Signs in by SESSION. POSTs are counted from the network.
//
//   node scripts/lib/c3b_walk.mjs MODE VITE_PORT CDP_PORT SHOTS TOKEN   (the rest in env, per mode)
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


const LINE = E.LINE; // "erratum: its baseline, 214, has no source on record"

if (MODE === 'finding') {
  // The steward records the finding from the run page: the form says what it will record, from the record; one request on Confirm.
  check(await open(`/runs/${E.RUN}`, `!!document.querySelector('[data-testid=finding-on-run]')`), "the run page shows \"The outcome's figures\"");
  const says = await text('[data-testid=finding-on-run-says]');
  check(says.includes('records that a figure has no source on record; it changes no figure and no sealed run'), '  ...its line says what it does', says);
  check(await ev(`(()=>{const b=document.querySelector('[data-testid=finding-on-run-open][data-field=baseline_value]'); if(!b||b.disabled) return false; b.click(); return true})()`), '  ..."Record that the baseline, 214 days, has no source on record…" opens the form');
  await sleep(500);
  const would = await text('[data-testid=finding-would-say]');
  check(would.includes(E.WOULD_SAY), '  ...the form quotes what the finding will say, read from the record', would.slice(0, 300));
  const f = `document.querySelector('[data-testid=finding-on-run-form]')`;
  await setField(f, 'Why', 'Verification: C3b, no source for this baseline is on record.'); await sleep(200);
  const before = posted('/figure-findings');
  check(await submitIn(f, 'Record the finding'), '  ...the steward presses "Record the finding"');
  await sleep(500);
  check(posted('/figure-findings') - before === 0, '  ...nothing is sent before the confirmation');
  const conf = await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(conf.startsWith('Record that the baseline, 214 days, has no source on record.'), '  ...the confirmation names the figure', conf);
  await shot('c3b_finding_confirm_1280', 1280);
  await confirmIn(f);
  check(await waitFor(`!!document.querySelector('[data-testid=finding-on-run-done]')`), '  ...on "Confirm", the finding is shown');
  check(posted('/figure-findings') - before === 1, '  ...one request sent');
  check((await text('[data-testid=finding-on-run-done]')).includes(E.WOULD_SAY), '  ...reading what the form said it would');
}

if (MODE === 'batch') {
  check(await open('/runs', `!!document.querySelector('[data-testid=unsourced-errata-count]')`), 'the Runs page shows "Errata the record calls for"');
  const credit = await text('[data-testid=credit-errata-count]'); const uns = await text('[data-testid=unsourced-errata-count]');
  check(credit === `${E.CREDIT} runs call for a credit erratum.`, `the dry run shows the credit count, ${E.CREDIT}`, credit);
  check(uns === `${E.UNSOURCED} runs call for an unsourced-figure erratum.`, `  ...and the unsourced-figure count, ${E.UNSOURCED}, before any submit (condition 5)`, uns);
  const list = await text('[data-testid=unsourced-erratum-candidate]');
  check(list.includes(E.UNSOURCED_TEXT), "  ...each unsourced-figure erratum's text, from the seal and the record", list.slice(0, 300));
  check(!/invent|fabricat|made up/i.test(list), '  ...never "invented"');
  const f = `document.querySelector('[data-testid=credit-errata-batch]')`;
  await setField(f, 'Why they are recorded', 'Verification: C3b, the errata the record calls for.'); await sleep(200);
  const before = posted('/api/errata/non-customer-credit');
  check(await submitIn(f, 'Record the'), 'the steward presses "Record the … errata"');
  await sleep(500);
  check(posted('/api/errata/non-customer-credit') - before === 0, '  ...nothing is sent before the confirmation');
  const conf = await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  const total = Number(E.CREDIT) + Number(E.UNSOURCED);
  check(conf.includes(`Record ${E.CREDIT} credit errata and ${E.UNSOURCED} unsourced-figure errata, ${total} in all`), '  ...the confirmation states both counts', conf);
  await shot('c3b_batch_confirm_1280', 1280);
  await confirmIn(f);
  check(await waitFor(`document.querySelector('[data-testid=credit-errata-recorded]')?.textContent === 'Recorded ${total}.'`), `on "Confirm", "Recorded ${total}."`);
  check(posted('/api/errata/non-customer-credit') - before === 1, '  ...one request sent');
}

if (MODE === 'surfaces') {
  // The POV: the finding beside the baseline; "verified without the source being opened"; the headline's line.
  check(await open(`/accounts/${E.INST}/pov`, `!!document.querySelector('[data-testid=pov] h1')`), "the vendor-alone account's POV opens");
  const pl = await text('[data-testid=outcome] [data-testid=no-source-line]');
  check(pl.includes('No source on record') && pl.includes(E.WOULD_SAY), "the POV's baseline: \"No source on record — found by …\" with the finding's text", pl.slice(0, 260));
  check((await text('[data-testid=outcome] [data-testid=basis-reason]')).includes('no source on record'), '  ...its basis reads with its reason, "no source on record"');
  const h = await ev(`document.querySelector('[data-testid=confidence] [data-testid=headline-erratum]')?.textContent ?? ''`);
  check(h.includes(LINE), `  ...its headline carries "${LINE}"`, h);
  await shot('c3b_pov_1280', 1280);
  await viewport(390); await sleep(300);
  check((await ev('document.documentElement.scrollWidth')) <= 390, '  ...@390: no sideways scroll');
  await shot('c3b_pov_390', 390);
  // The account page and its walk.
  check(await open(`/accounts/${E.INST}`, `!!document.querySelector('[data-testid=headline-erratum]')`), 'the account page shows the headline line');
  check((await text('[data-testid=headline-erratum]')).includes(LINE), `  ..."${LINE}"`);
  await ev(`document.querySelectorAll('[data-testid=w4] button, [data-testid=w6] button').forEach(b=>{ if(/^Show/.test(b.textContent)) b.click() })`); await sleep(400);
  check((await text('[data-testid=w4] [data-testid=no-source-line]')).includes('No source on record'), "  ...the walk's W4: the baseline with its finding");
  await shot('c3b_account_1280', 1280);
  // The book.
  check(await open('/', `!!document.querySelector('[data-testid=book-scope]')`), 'the book opens');
  check((await text('[data-testid=row-engagement] [data-testid=headline-erratum]')).includes(LINE), '  ...the engagement row carries the line');
  check((await text('[data-testid=book-member-erratum]')).includes(LINE), "  ...and the weakest-link table's row");
  // The Runs list: the sealed provenance label "as recorded at sealing", with the line beneath.
  check(await open('/runs', `!!document.querySelector('[data-testid=runs-unsourced]')`), 'the Runs list shows the unsourced line beneath the sealed label');
  check((await text('[data-testid=runs-unsourced]')).includes(`as recorded at sealing · ${LINE}`), `  ..."as recorded at sealing · ${LINE}"`);
  // The run page (screen at 1280 and 390, then print), the oldest run: both errata.
  for (const width of [1280, 390]) {
    check(await open(`/runs/${E.RUN}`, runReady, width), `run ${E.RUN_NUMBER} @${width} opens`);
    const sb = await ev(`[...document.querySelectorAll('[data-testid=banner-sealed-unsourced]')].find(x=>x.offsetParent!==null)?.textContent ?? ''`);
    check(sb.includes(LINE), `@${width}: the sealed banner ("as recorded at sealing") carries the line`, sb);
    check((await text('[data-testid=run-note-unsourced]')).includes(LINE), `@${width}: so does the sealed note`);
    const eb = await ev(`[...document.querySelectorAll('[data-testid=erratum-unsourced]')].find(x=>x.offsetParent!==null)?.textContent ?? ''`);
    check(eb.includes(E.UNSOURCED_TEXT.replace(/\s*The sealed record below is unchanged\.$/, '')), `@${width}: the erratum states the figure, from the seal and the record`, eb.slice(0, 200));
    check((await ev('document.documentElement.scrollWidth')) <= width, `@${width}: no sideways scroll`);
    await shot(`c3b_run_${width}`, width);
  }
  await open(`/runs/${E.RUN}`, runReady);
  await printTo(E.PDF);
  // The lineage of the baseline: the finding; the evidence step's reading.
  check(await open(`/lineage/value_outcomes/${E.OUTCOME}?figure=baseline`, `!!document.querySelector('[data-testid=lineage-steps]')`), "the baseline's lineage opens");
  check((await text('[data-testid=lineage-finding]')).includes(E.WOULD_SAY), '  ...its finding step, with the text and why');
  check((await text('[data-testid=lineage-basis-reason]')).includes('no source on record'), '  ...its evidence step: the basis, with its reason');
  await shot('c3b_lineage_1280', 1280);
}

ws.close();
process.exit(0);
