// C1 — the browser walk of the two correction acts and their display, over the
// Chrome DevTools Protocol. Called by scripts/verify_corrections.sh; prints
// "  PASS"/"  FAIL" lines it counts. The CDP preamble and the in-page field
// helpers are evidence_form_walk.mjs's. Signs in by SESSION — never the header.
//
//   node scripts/lib/corrections_walk.mjs MODE VITE_PORT CDP_PORT SHOTS TOKEN INST RUN EVIDENCE PDF_NAME SUMMARY
//
// INST, RUN and EVIDENCE are the script's own fixture (L39): an account whose one engagement sealed
// EVIDENCE as the baseline in error, in runs 1 and 2, before it was retired. SUMMARY is that
// evidence's summary, which finds its line on the page.
//
// MODE:
//   acts       the steward corrects the wrong link on the account page (W6)
//              and records an erratum on RUN, as Brad will on prod
//   display    RUN's page at 1280 and 390 and printed to SHOTS/PDF_NAME; the
//              POV's withdrawn line; the walk's struck-through link
//   nonsteward both controls disabled, each with its reason
//   print      RUN's page printed to SHOTS/PDF_NAME only (break B8)
//   povnote    the POV's correction note on the corrected link only (break B13)
//   supersede  the steward supersedes RUN's erratum through the form (Brad's C1 review)
import { writeFileSync } from 'node:fs';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, TOKEN, INST, RUN, EVIDENCE, PDF_NAME, SUMMARY] = process.argv.slice(2);
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
const text = () => ev('document.body.textContent');

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
// Unfold the workspace step or <details> holding a selector, as a reader would.
const unfold = async (selector) => {
  const opened = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return 0;let n=0;for(let p=el;p;p=p.parentElement){if(p.tagName==='DETAILS'&&!p.open){p.open=true;n++;}if(p.dataset&&p.dataset.open==='false'){p.querySelector('[data-step-toggle]')?.click();n++;}}return n})()`);
  if (opened) await sleep(400);
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
const click = (scopeExpr, label) => ev(`(()=>{const root=${scopeExpr}||document;const el=[...root.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(label)}));if(!el||el.disabled)return false;el.click();return true})()`);
const runReady = `!!document.querySelector('[data-testid=run-page] h1')`;
const walkReady = `!!document.querySelector('[data-testid=w6]')`;
const povReady = `!!document.querySelector('[data-testid=pov] h1')`;
// The W6 list item of this evidence: its "Correct what it supports…" control is inside it.
const linkLi = `[...document.querySelectorAll('[data-testid=w6-evidence]')].find(li=>li.textContent.includes(${JSON.stringify(SUMMARY)}))`;

if (MODE === 'acts') {
  check(await open(`/accounts/${INST}`, walkReady), 'the account page shows the walk (W6)');
  await unfold('[data-testid=w6]');
  check(await ev(`!!(${linkLi})`) && (await ev(`(${linkLi}).textContent`)).includes('supports baseline'), "W6 lists the wrong link as it stands: \"supports baseline\"");
  check(await ev(`(()=>{const li=${linkLi};const b=li&&li.querySelector('[data-testid=correct-support-open]');return !!b&&!b.disabled})()`), 'the steward sees "Correct what it supports…", enabled');
  await ev(`(${linkLi}).querySelector('[data-testid=correct-support-open]').click()`); await sleep(300);
  const form = `document.querySelector('[data-testid=correct-support]')`;
  check(await ev(`[...${form}.querySelectorAll('select option')].map(o=>o.value).filter(Boolean).join(',')`) === 'actual,impact_basis', 'the choices are the other two supports (actual, impact basis), never the current one');
  check(await ev(`${form}.textContent.includes('withdrawn') && ${form}.textContent.includes('A sealed run is not changed')`), 'the form says what it records: the link withdrawn, kept, and a sealed run not changed');
  await setField(form, 'What it supports', 'impact_basis');
  await setField(form, 'Why', 'Verification: another company\'s filing is not this account\'s baseline; it is the impact basis (C1).');
  check(await click(form, 'Withdraw and correct'), 'the steward submits "Withdraw and correct"');
  check(await waitFor(`!!document.querySelector('[data-testid=w6-withdrawn]')`), 'W6 now lists the withdrawn link');
  await unfold('[data-testid=w6]');
  check(!(await ev(`!!document.querySelector('[data-testid=correct-support]')`)), 'the form closes once recorded (no stale form left on the corrected link)');
  const struck = await ev(`document.querySelector('[data-testid=w6-withdrawn]').textContent`);
  check(await ev(`!!document.querySelector('[data-testid=w6-withdrawn] s')`) && /^supports baseline — .*withdrawn by .+, \d{4}-\d{2}-\d{2}: Verification: another company's filing/.test(struck),
    'the withdrawn link is struck through, with who withdrew it, the date and the reason', struck);
  check((await ev(`(${linkLi}).textContent`)).includes('supports impact_basis') && (await ev(`(${linkLi}).textContent`)).includes('corrected from baseline'),
    'the current link reads "supports impact_basis", "corrected from baseline"');
  await shot('c1_walk_corrected', 1280);

  check(await open(`/runs/${RUN}`, runReady), 'the run page opens');
  check(await ev(`(()=>{const b=document.querySelector('[data-testid=record-erratum-open]');return !!b&&!b.disabled})()`), 'the steward sees "Record an erratum…", enabled');
  await ev(`document.querySelector('[data-testid=record-erratum-open]').click()`); await sleep(300);
  const ef = `document.querySelector('[data-testid=record-erratum]')`;
  check(await ev(`[...${ef}.querySelectorAll('select option')].map(o=>o.value).filter(Boolean).join(',')`) === EVIDENCE, 'the one choice is the corrected link');
  check(!(await ev(`!!${ef}.querySelector('input[type=number]')`)) && !(await ev(`${ef}.textContent.toLowerCase().includes('score:')`)), 'the form has no score field: the recompute is the server\'s');
  await setField(ef, 'The corrected link', EVIDENCE);
  await setField(ef, 'What was wrong', "Another company's filing was sealed as support for this account's baseline.");
  await setField(ef, 'What is right', "It supports the impact basis only; the baseline rests on the account's own filing.");
  await setField(ef, 'Why it is recorded', "Verification: Brad's C1 ruling, point 1 — the sealed run stays as sealed.");
  check(await click(ef, 'Record the erratum'), 'the steward submits "Record the erratum"');
  check(await waitFor(`!!document.querySelector('[data-testid=banner-erratum]')`), 'the page reloads with the erratum banner');
}

// The corrected link's own line on the POV carries its correction (L39: on any evidence, not only a vendor claim).
async function povNote() {
  const c = await ev(`[...document.querySelectorAll('[data-testid=outcome] li')].find(li=>li.textContent.includes(${JSON.stringify(SUMMARY)})&&!li.closest('[data-testid=pov-withdrawn]')&&!li.querySelector('s'))?.querySelector('[data-testid=pov-corrected]')?.textContent ?? ''`);
  check(c.startsWith('Corrected by ') && c.includes('from baseline to impact basis: Verification:'), 'the corrected link\'s own line reads "Corrected by <name> from baseline to impact basis: <reason>"', c);
}

if (MODE === 'povnote') {
  check(await open(`/accounts/${INST}/pov`, povReady), 'the POV opens');
  await povNote();
}

if (MODE === 'display') {
  for (const width of [1280, 390]) {
    check(await open(`/runs/${RUN}`, runReady, width), `run page @${width} opens`);
    const b = await ev(`document.querySelector('[data-testid=banner-erratum]')?.textContent ?? ''`);
    check(b.startsWith('ERRATUM — recorded after sealing') && b.includes('The sealed record below is unchanged.'), `@${width}: the erratum reads "ERRATUM — recorded after sealing …" and "The sealed record below is unchanged."`, b.slice(0, 120));
    check(/Recomputed under model 1\.0\.0, the one it was sealed with, with the correction: \d+ \/ 100 · \w+ \(sealed: \d+ \/ 100 · \w+\)/.test(b), `@${width}: it states the recompute under model 1.0.0 beside the sealed score`, b.slice(-160));
    check(await ev(`(()=>{const s=[...document.querySelectorAll('[data-testid=banners]')].find(x=>x.offsetParent!==null);if(!s)return false;const kids=[...s.children].map(c=>c.dataset.testid);return kids.indexOf('banner-erratum')>kids.indexOf('banner-unverified')&&kids.indexOf('banner-unverified')>=0})()`),
      `@${width}: the erratum sits beneath the disclosure banner (LVRF_PLAN §9)`);
    check(await ev(`!!document.querySelector('[data-testid=banner-sealed]')?.textContent.includes('as recorded at sealing')`), `@${width}: the sealed banner still reads "as recorded at sealing" (standard 10), distinct from "recorded after sealing"`);
    check((await ev('document.documentElement.scrollWidth')) <= width, `@${width}: no sideways scroll`);
    await shot(`c1_run_erratum_${width}`, width);
  }
  await open(`/runs/${RUN}`, runReady);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/${PDF_NAME}`, Buffer.from(pdf.result.data, 'base64'));

  check(await open(`/accounts/${INST}/pov`, povReady), 'the POV opens');
  const w = await ev(`document.querySelector('[data-testid=pov-withdrawn]')?.textContent ?? ''`);
  check(await ev(`!!document.querySelector('[data-testid=pov-withdrawn] s')`) && /^baseline: .* — withdrawn by .+, \d{1,2} [A-Z][a-z]{2} \d{4}: Verification:/.test(w),
    'the POV lists the withdrawn link under its outcome, struck through: "withdrawn by <name>, <date>: <reason>"', w);
  await povNote();
  check(await ev(`[...document.querySelectorAll('[data-testid=outcome] li')].filter(li=>li.textContent.includes(${JSON.stringify('baseline: ' + SUMMARY)})&&!li.closest('[data-testid=pov-withdrawn]')&&!li.querySelector('s')).length`) === 0,
    'the wrong link is not listed as baseline evidence any more (only its struck-through withdrawn line)');
  await shot('c1_pov_withdrawn_1280', 1280);
}

if (MODE === 'nonsteward') {
  check(await open(`/accounts/${INST}`, walkReady), 'X: the account page shows the walk');
  await unfold('[data-testid=w6]');
  check(await ev(`[...document.querySelectorAll('[data-testid=correct-support-open]')].every(b=>b.disabled)`) && await ev(`document.querySelectorAll('[data-testid=correct-support-open]').length`) > 0,
    'X: every "Correct what it supports…" is disabled');
  check((await ev(`document.querySelector('[data-testid=correct-support-reason]')?.textContent ?? ''`)).startsWith("Correcting what a link supports is the steward's act"), 'X: …with its reason, naming the steward');
  await shot('c1_walk_nonsteward', 1280);
  check(await open(`/runs/${RUN}`, runReady), 'X: the run page opens');
  check(await ev(`!!document.querySelector('[data-testid=record-erratum-open]')?.disabled`), 'X: "Record an erratum…" is disabled');
  check((await ev(`document.querySelector('[data-testid=erratum-reason]')?.textContent ?? ''`)).startsWith("Recording an erratum is the steward's act"), 'X: …with its reason, naming the steward');
  check(await ev(`!!document.querySelector('[data-testid=banner-erratum]')`), 'X: the erratum is shown to every reader');
  await shot('c1_run_nonsteward_1280', 1280);
}

if (MODE === 'supersede') {
  const shown = `[...document.querySelectorAll('[data-testid=banners]')].find(x=>x.offsetParent!==null)`;
  check(await open(`/runs/${RUN}`, runReady), 'run 1 opens');
  check(await ev(`(${shown}).querySelectorAll('[data-testid=banner-erratum]').length`) === 1, 'run 1 shows its one erratum');
  await ev(`document.querySelector('[data-testid=record-erratum-open]').click()`); await sleep(300);
  const ef = `document.querySelector('[data-testid=record-erratum]')`;
  await setField(ef, 'The corrected link', EVIDENCE);
  check(await waitFor(`!!document.querySelector('[data-testid=erratum-supersedes]')`), 'choosing the link names the erratum it would supersede, and says the earlier one stays on the record');
  await setField(ef, 'What was wrong', "Another company's filing was sealed as support for the baseline (run 1).");
  await setField(ef, 'What is right', "It supports the impact basis only; the baseline rests on the account's own filing.");
  await setField(ef, 'Why it is recorded', "Verification: Brad's C1 ruling, point 1, restated.");
  check(!(await click(ef, 'Record the erratum')), 'without a reason for superseding, the form does not submit');
  await setField(ef, 'Why the earlier erratum is superseded', "Verification: the first erratum's wording was a draft.");
  check(await click(ef, 'Record the erratum'), 'with it, the steward submits');
  check(await waitFor(`(${shown})?.textContent.includes('It supersedes the erratum recorded')`), 'the page reloads with the superseding erratum');
  const b = await ev(`(${shown}).querySelector('[data-testid=banner-erratum]').textContent`);
  check(await ev(`(${shown}).querySelectorAll('[data-testid=banner-erratum]').length`) === 1 && b.includes("because: Verification: the first erratum's wording was a draft.") && b.includes('The sealed record below is unchanged.'),
    'one erratum shown — the current one — naming the one it supersedes, who recorded it and why', b.slice(0, 200));
  await shot('c1_run1_superseded_1280', 1280);
}

if (MODE === 'print') {
  await open(`/runs/${RUN}`, runReady);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/${PDF_NAME}`, Buffer.from(pdf.result.data, 'base64'));
}

ws.close();
process.exit(0);
