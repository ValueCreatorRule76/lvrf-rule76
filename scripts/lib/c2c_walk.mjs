// C2c — the browser walk of withdrawing a link with no replacement, the confirmation before a
// correction or withdrawal is sent, the run page's two separate controls, and one request per
// submit, over the Chrome DevTools Protocol. Called by scripts/verify_c2c.sh; prints
// "  PASS"/"  FAIL" lines it counts. The CDP preamble is corrections_walk.mjs's. Signs in by SESSION.
// Every POST the page sends is counted from the network, not inferred from the page.
//
//   node scripts/lib/c2c_walk.mjs MODE VITE_PORT CDP_PORT SHOTS TOKEN RUN
//
// MODE (env as named):
//   sections   RUN's page: "The outcome's links" and "This run", each with its one line, apart
//   erratum1   RUN's page: an erratum about LINK (summary) recorded with a double click: one POST
//   withdraw   RUN's page: withdraw LINK: the confirmation (link, change, outcome METRIC, RUNS sharing
//              it) before any request; one POST on "Confirm"; the link struck through, "no replacement"
//   confirm0   (break B10) RUN's page: withdraw LINK: no request before the confirmation
//   shared     RUN's page (sharing the outcome): the withdrawal shown struck through, once
import { writeFileSync } from 'node:fs';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, TOKEN, RUN] = process.argv.slice(2);
const { LINK, METRIC, RUNS, WHY } = process.env;
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
  await sleep(900);
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
const setField = (scopeExpr, labelText, value) => ev(`(()=>{
  const root=${scopeExpr}; if(!root) return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)})); if(!l) return 'no label';
  const el=l.querySelector('input,select,textarea'); if(!el) return 'no field';
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
const optionValue = (scopeExpr, labelText, textPart) => ev(`(()=>{const l=[...${scopeExpr}.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)}));return l?[...l.querySelectorAll('option')].find(o=>o.value&&o.textContent.includes(${JSON.stringify(textPart)}))?.value??null:null})()`);
const submitIn = (scopeExpr, label) => ev(`(()=>{const el=[...${scopeExpr}.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(label)}));if(!el||el.disabled)return false;el.click();return true})()`);
const runReady = `!!document.querySelector('[data-testid=run-page] h1')`;
const posted = (part) => posts.filter((p) => p.includes(part)).length;

// Open the withdraw form, choose LINK, give WHY, press "Withdraw the link": returns the form selector.
async function startWithdraw() {
  await ev(`document.querySelector('[data-testid=withdraw-on-run-open]')?.click()`); await sleep(300);
  const form = `document.querySelector('[data-testid=withdraw-on-run-form]')`;
  const v = await optionValue(form, 'The link', LINK);
  check(Boolean(v), `the withdraw form offers "${LINK}"`);
  await setField(form, 'The link', v); await setField(form, 'Why', WHY); await sleep(200);
  check(await submitIn(form, 'Withdraw the link'), 'the steward presses "Withdraw the link"');
  await sleep(1200);
  return form;
}

if (MODE === 'sections') {
  check(await open(`/runs/${RUN}`, runReady), 'the run page opens');
  const links = await ev(`document.querySelector('[data-testid=correct-on-run-says]')?.textContent ?? ''`);
  const erratum = await ev(`document.querySelector('[data-testid=record-erratum-says]')?.textContent ?? ''`);
  check(/^The outcome's links — changes what a link of .+ supports, for every run that shares it; this run stays as sealed\.$/.test(links), 'the links control reads "The outcome\'s links — changes what a link of <outcome> supports, for every run that shares it; this run stays as sealed."', links);
  check(erratum === 'This run — records, beside this sealed run, what it got wrong; it changes no link and no score.', 'the erratum control reads "This run — records, beside this sealed run, what it got wrong; it changes no link and no score."', erratum);
  check(await ev(`(()=>{const a=document.querySelector('[data-testid=correct-on-run]'),b=document.querySelector('[data-testid=record-erratum]');return !!a&&!!b&&!a.contains(b)&&!b.contains(a)})()`), '  ...two separate controls, neither inside the other');
  await shot('c2c_run_sections_1280', 1280);
}

if (MODE === 'erratum1') {
  check(await open(`/runs/${RUN}`, runReady), 'the run page opens');
  await ev(`document.querySelector('[data-testid=record-erratum-open]').click()`); await sleep(300);
  const ef = `document.querySelector('[data-testid=record-erratum]')`;
  await setField(ef, 'The corrected link', await optionValue(ef, 'The corrected link', LINK));
  await setField(ef, 'What was wrong', "The tenant's own filing was sealed as support for this outcome's impact basis.");
  await setField(ef, 'What is right', "It is a filing about the vendor, not about this account's figure.");
  await setField(ef, 'Why it is recorded', 'Verification: the erratum for the fixture correction (C2c).');
  await sleep(200);
  const before = posted('/errata');
  // Two clicks in one task, before React re-renders: a double click.
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-testid=record-erratum] button')].find(e=>e.textContent.includes('Record the erratum'));b.click();b.click();return true})()`);
  await waitFor(`!!document.querySelector('[data-testid=banner-erratum]')`, 8000); await sleep(1500);
  check(posted('/errata') - before === 1, 'a double click on "Record the erratum" sends one request', `${posted('/errata') - before} sent`);
}

if (MODE === 'withdraw' || MODE === 'confirm0') {
  check(await open(`/runs/${RUN}`, runReady), 'the run page opens');
  const before = posted('/withdraw');
  const form = await startWithdraw();
  check(posted('/withdraw') - before === 0, '  ...nothing is sent yet', `${posted('/withdraw') - before} sent`);
  const conf = await ev(`${form}?.querySelector('[data-testid=form-confirm]')?.textContent ?? ''`);
  check(conf.includes(`Withdraw “${LINK}`) && conf.includes(`from ${METRIC}: it supports the baseline now`) && conf.includes('and will support nothing; no link replaces it.') && conf.includes(`${RUNS} sealed runs share this outcome; none of them changes.`),
    `  ...the confirmation states the link, the change (baseline → withdrawn, no replacement), the outcome and the ${RUNS} runs that share it`, conf);
  if (MODE === 'withdraw') {
    await shot('c2c_withdraw_confirm_1280', 1280);
    await ev(`${form}.querySelector('[data-testid=form-confirm-yes]').click(); ${form}.querySelector('[data-testid=form-confirm-yes]')?.click()`);
    check(await waitFor(`[...document.querySelectorAll('[data-testid=correct-on-run-withdrawn]')].some(p=>p.textContent.includes(${JSON.stringify(LINK)}))`), 'on "Confirm" (pressed twice), the page reloads with the link struck through');
    check(posted('/withdraw') - before === 1, '  ...one request sent', `${posted('/withdraw') - before} sent`);
    const line = await ev(`[...document.querySelectorAll('[data-testid=correct-on-run-withdrawn]')].find(p=>p.textContent.includes(${JSON.stringify(LINK)})).textContent`);
    check(/supporting the baseline — withdrawn on \d{1,2} [A-Z][a-z]{2} \d{4} by .+, with no replacement: Verification:/.test(line) && await ev(`!!document.querySelector('[data-testid=correct-on-run-withdrawn] s')`),
      '  ...reading what it supported, when, who, "with no replacement" and why, struck through', line);
    check(!(await ev(`[...document.querySelectorAll('[data-testid=correct-on-run-done]')].some(p=>p.textContent.includes(${JSON.stringify(LINK.slice(0, 30))}))`)), '  ...and no longer as a current, corrected link');
    await shot('c2c_withdrawn_1280', 1280);
  }
}

if (MODE === 'shared') {
  for (const width of [1280, 390]) {
    check(await open(`/runs/${RUN}`, runReady, width), `the run sharing the outcome @${width} opens`);
    check((await ev(`[...document.querySelectorAll('[data-testid=correct-on-run-withdrawn]')].filter(p=>p.textContent.includes(${JSON.stringify(LINK)})).length`)) === 1, `@${width}: it shows the withdrawal, struck through, once`);
    check((await ev('document.documentElement.scrollWidth')) <= width, `@${width}: no sideways scroll`);
    await shot(`c2c_shared_${width}`, width);
  }
}

ws.close();
process.exit(0);
