// C2 — the browser walk of what a commitment's and a verification's attestation support, and of an
// erratum not recomputed, over the Chrome DevTools Protocol. Called by scripts/verify_c2.sh; prints
// "  PASS"/"  FAIL" lines it counts. The CDP preamble is corrections_walk.mjs's. Signs in by SESSION.
//
//   node scripts/lib/c2_walk.mjs MODE VITE_PORT CDP_PORT SHOTS TOKEN INST RUN PDF_NAME
//
// MODE:
//   supports   INST's walk (W6), its POV and RUN's page: the attestations read "supports the
//              commitment" and "supports the verification", never the impact basis
//   runcorrect C2b: INST's walk shows a later engagement, so W6 cannot reach RUN's outcome; RUN's page
//              corrects the attestation (env SUMMARY) to the commitment; RUN_OTHER, sharing the outcome,
//              shows the correction once made and offers no second form for that link (env SUMMARY, RUN_OTHER)
//   noreoffer  C2b break B7: RUN, sharing the outcome, lists exactly the other current links (env OTHER_LINKS)
//   nonsteward C2b: RUN's page offers the correction disabled, with its reason
//   erratum    RUN's page at 1280 and 390: its erratum reads "Not recomputed: …" beside the sealed
//              score, and no other score; printed to SHOTS/PDF_NAME
import { writeFileSync } from 'node:fs';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, TOKEN, INST, RUN, PDF_NAME] = process.argv.slice(2);
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
const openFolds = () => ev(`document.querySelectorAll('[data-testid$=-toggle][aria-expanded=false]').forEach(b=>b.click()); document.querySelectorAll('details').forEach(d=>d.open=true)`);
const runReady = `!!document.querySelector('[data-testid=run-page] h1')`;

if (MODE === 'supports') {
  check(await open(`/accounts/${INST}`, `!!document.querySelector('[data-testid=w6]')`), 'the account page shows the walk (W6)');
  // Unfold the workspace step holding W6, as a reader would (corrections_walk.mjs's unfold).
  await ev(`(()=>{const el=document.querySelector('[data-testid=w6]');if(!el)return 0;let n=0;for(let p=el;p;p=p.parentElement){if(p.tagName==='DETAILS'&&!p.open){p.open=true;n++;}if(p.dataset&&p.dataset.open==='false'){p.querySelector('[data-step-toggle]')?.click();n++;}}return n})()`); await sleep(400);
  const w6 = await ev(`[...document.querySelectorAll('[data-testid=w6-evidence]')].map(li=>li.textContent)`);
  check(Array.isArray(w6) && w6.some((x) => x.startsWith('attestation · supports the commitment')) && w6.some((x) => x.startsWith('attestation · supports the verification')),
    'W6 lists the attestations as "supports the commitment" and "supports the verification"', JSON.stringify((w6 ?? []).map((x) => x.slice(0, 50))));
  check(Array.isArray(w6) && !w6.some((x) => x.startsWith('attestation · supports impact')), '  ...and neither as the impact basis');
  await shot('c2_walk_supports_1280', 1280);
  check(await open(`/accounts/${INST}/pov`, `!!document.querySelector('[data-testid=pov] h1')`), 'the POV opens');
  const pov = await ev(`document.querySelector('[data-testid=pov]').innerText`);
  check(/the commitment: /.test(pov) && /the verification: /.test(pov), 'the POV lists them as "the commitment: …" and "the verification: …"', '');
  await shot('c2_pov_supports_1280', 1280);
  for (const width of [1280, 390]) {
    check(await open(`/runs/${RUN}`, runReady, width), `the run page @${width} opens`);
    await openFolds(); await sleep(500);
    const sealed = await ev(`[...document.querySelectorAll('[data-testid=sealed-item]')].map(x=>x.innerText)`);
    check(Array.isArray(sealed) && sealed.some((x) => /supports the commitment/.test(x)) && sealed.some((x) => /supports the verification/.test(x)),
      `@${width}: the sealed evidence reads "supports the commitment" and "supports the verification"`, JSON.stringify((sealed ?? []).map((x) => x.slice(0, 80))));
    check((await ev('document.documentElement.scrollWidth')) <= width, `@${width}: no sideways scroll`);
    await shot(`c2_run_supports_${width}`, width);
  }
}

const setField = (scopeExpr, labelText, value) => ev(`(()=>{
  const root=${scopeExpr}; if(!root) return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)})); if(!l) return 'no label';
  const el=l.querySelector('input,select,textarea'); if(!el) return 'no field';
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
const click = (scopeExpr, label) => ev(`(()=>{const root=${scopeExpr}||document;const el=[...root.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(label)}));if(!el||el.disabled)return false;el.click();return true})()`);

if (MODE === 'runcorrect') {
  const { SUMMARY, RUN_OTHER } = process.env;
  check(await open(`/accounts/${INST}`, `!!document.querySelector('[data-testid=w6]')`), 'the account page shows the walk (W6)');
  await ev(`(()=>{const el=document.querySelector('[data-testid=w6]');if(!el)return 0;for(let p=el;p;p=p.parentElement){if(p.tagName==='DETAILS'&&!p.open)p.open=true;if(p.dataset&&p.dataset.open==='false')p.querySelector('[data-step-toggle]')?.click();}return 1})()`); await sleep(400);
  check(!(await ev(`[...document.querySelectorAll('[data-testid=w6-evidence]')].some(li=>li.textContent.includes(${JSON.stringify(SUMMARY)}))`)),
    "the walk's W6 shows the later engagement: the retired engagement's attestation is not on it (the gap C2b closes)");
  check(await open(`/runs/${RUN}`, runReady), 'the retired engagement\'s run 2 opens');
  check(await ev(`(()=>{const b=document.querySelector('[data-testid=correct-on-run-open]');return !!b&&!b.disabled})()`), 'the steward sees "Correct what a link supports…", enabled, beside "Record an erratum…"');
  await ev(`document.querySelector('[data-testid=correct-on-run-open]').click()`); await sleep(300);
  const form = `document.querySelector('[data-testid=correct-on-run-form]')`;
  const says = await ev(`${form}.textContent`);
  check(/corrects the current link of this run's outcome/.test(says) && /The sealed run is not changed: record an erratum on it\./.test(says),
    'the form says it corrects the outcome\'s current link, and that the sealed run is not changed ("record an erratum on it")', says.slice(0, 260));
  const linkVal = await ev(`[...${form}.querySelectorAll('label')].find(l=>l.textContent.includes('The link')).querySelector('select option[value]:not([value=""])') && [...[...${form}.querySelectorAll('label')].find(l=>l.textContent.includes('The link')).querySelectorAll('option')].find(o=>o.textContent.includes(${JSON.stringify(SUMMARY)}))?.value`);
  check(Boolean(linkVal), 'the attestation is offered, as it stands ("supports impact basis")');
  await setField(form, 'The link', linkVal); await sleep(200);
  const choices = await ev(`[...[...${form}.querySelectorAll('label')].find(l=>l.textContent.includes('What it supports')).querySelectorAll('option')].map(o=>o.value).filter(Boolean).join(',')`);
  check(choices === 'baseline,actual,target_commitment,verification', 'an attestation may be corrected to the baseline, the actual, the commitment or the verification', choices);
  await setField(form, 'What it supports', 'target_commitment');
  await setField(form, 'Why', "Verification: the commitment's attestation supports the commitment, not the impact basis (C2b).");
  check(await click(form, 'Withdraw and correct'), 'the steward submits "Withdraw and correct"');
  check(await waitFor(`[...document.querySelectorAll('[data-testid=correct-on-run-done]')].some(p=>p.textContent.includes(${JSON.stringify(SUMMARY.slice(0, 40))}))`), 'the page reloads with "Corrected on <date> by <name>"');
  const done = await ev(`[...document.querySelectorAll('[data-testid=correct-on-run-done]')].map(p=>p.textContent).join(' | ')`);
  check(/^Corrected on \d{1,2} [A-Z][a-z]{2} \d{4} by .+: “.+” now supports the commitment, not impact basis\. The sealed run is unchanged: an erratum records it\.$/.test(done), '  ...reading the date, who, what it supports now and what it did', done);
  check(!(await ev(`(()=>{const b=document.querySelector('[data-testid=record-erratum-open]');return !b||b.disabled})()`)), '  ...and "Record an erratum…" is now enabled for it');
  await shot('c2b_run2_corrected_1280', 1280);
  check(await open(`/runs/${RUN_OTHER}`, runReady), 'run 1, sharing the outcome, opens');
  const done1 = await ev(`[...document.querySelectorAll('[data-testid=correct-on-run-done]')].map(p=>p.textContent).join(' | ')`);
  check(done1 === done, 'run 1 shows the same correction, once made', done1);
  await linkList(process.env.OTHER_LINKS);
  await shot('c2b_run1_shared_1280', 1280);
  for (const width of [390]) {
    check(await open(`/runs/${RUN_OTHER}`, runReady, width), `run 1 @${width} opens`);
    check((await ev('document.documentElement.scrollWidth')) <= width, `@${width}: no sideways scroll`);
    await shot(`c2b_run1_shared_${width}`, width);
  }
}

// C2b: on a run sharing the outcome, "The link" lists exactly the outcome's other current links (OTHER, "|"-separated
// option texts), never the corrected one. The list's contents are asserted, not only the corrected link's absence.
async function linkList(OTHER) {
  if (!(await ev(`!!document.querySelector('[data-testid=correct-on-run-open]')`))) { bad('"Correct what a link supports…" is not offered for the other links'); return; }
  await ev(`document.querySelector('[data-testid=correct-on-run-open]')?.click()`); await sleep(300);
  const opts = await ev(`(()=>{const l=[...document.querySelectorAll('[data-testid=correct-on-run-form] label')].find(l=>l.textContent.includes('The link'));return l?[...l.querySelectorAll('option')].filter(o=>o.value).map(o=>o.textContent):null})()`);
  check(Array.isArray(opts) && JSON.stringify(opts) === JSON.stringify(OTHER.split('|')),
    `"The link" lists exactly the outcome's other current links (${OTHER.split('|').length}: ${OTHER}), never the corrected attestation`, JSON.stringify(opts));
}

// C2b break B7: the run sharing the outcome must offer no second form for a corrected link.
if (MODE === 'noreoffer') {
  check(await open(`/runs/${RUN}`, runReady), 'the run sharing the outcome opens');
  await linkList(process.env.OTHER_LINKS);
}

if (MODE === 'nonsteward') {
  check(await open(`/runs/${RUN}`, runReady), 'X: the run page opens');
  check(await ev(`!!document.querySelector('[data-testid=correct-on-run-open]')?.disabled`), 'X: "Correct what a link supports…" is disabled');
  check((await ev(`document.querySelector('[data-testid=correct-on-run-reason]')?.textContent ?? ''`)).startsWith("Correcting what a link supports is the steward's act"), 'X: …with its reason, naming the steward');
}

if (MODE === 'erratum') {
  const { SEALED } = process.env;
  for (const width of [1280, 390]) {
    check(await open(`/runs/${RUN}`, runReady, width), `the attested run @${width} opens`);
    await openFolds(); await sleep(500);
    const shown = `[...document.querySelectorAll('[data-testid=banners]')].find(x=>x.offsetParent!==null)`;
    const b = await ev(`(${shown})?.querySelector('[data-testid=banner-erratum]')?.textContent ?? ''`);
    check(b.includes("Not recomputed: this run's seal does not carry who attested its attested evidence") && b.includes(`(sealed: ${SEALED} / 100`),
      `@${width}: the erratum reads "Not recomputed: this run's seal does not carry who attested …" beside "(sealed: ${SEALED} / 100 …)"`, b.slice(-260));
    check(/it could feed only the sealed factor asking "Is the currency figure's derivation stated and supported\?", sealed at 10 of 10: "No currency figure claimed — nothing to substantiate\."/.test(b),
      `@${width}: …and quotes, from the seal, the one factor the item could feed and its sealed value`);
    check(!/Recomputed under model/.test(b) && !/with the correction: \d/.test(b), `@${width}: …and states no recomputed score`);
    const others = await ev(`(()=>{let t=document.body.innerText;
      for(const el of document.querySelectorAll('[data-testid=banner-erratum],[data-testid=banner-erratum-line],[data-testid=record-erratum]')){const x=el.innerText;if(x)t=t.split(x).join(' ');}
      return [...t.matchAll(/(\\d+(?:\\.\\d+)?)\\s*\\/\\s*100\\b/g)].map(m=>m[1])})()`);
    check(Array.isArray(others) && others.length >= 2 && others.every((x) => Number(x) === Number(SEALED)), `@${width}: every other score on the page is the sealed ${SEALED} / 100 (${others?.length} of them)`, JSON.stringify(others));
    await shot(`c2_run_not_recomputed_${width}`, width);
  }
  await open(`/runs/${RUN}`, runReady);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/${PDF_NAME}`, Buffer.from(pdf.result.data, 'base64'));
}

ws.close();
process.exit(0);
