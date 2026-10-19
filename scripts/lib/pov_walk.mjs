// O2 — the browser walk of the account page's hypothesis, summary and
// reference-example cards, and of the POV page, over the Chrome DevTools
// Protocol (no extra dependency). Called by scripts/verify_value_hypotheses.sh;
// prints "  PASS"/"  FAIL" lines it counts. The CDP and sign-in preamble is
// pack_research_walk.mjs's, unchanged (its openPack is unused here).
//
//   node scripts/lib/pov_walk.mjs MODE VITE_PORT CDP_PORT SHOTS DB INST S_EMAIL X_EMAIL PW S_NAME LATER SPINE
//
// MODE: author (X states a hypothesis on the account page) | pov (the POV page)
// Signs in by SESSION through the real sign-in form — never the header.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, DB, INST, S_EMAIL, X_EMAIL, PW, S_NAME, LATER, SPINE] = process.argv.slice(2);
const SLUG = null;
const APP = `http://localhost:${VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(`${m}${detail ? ` — ${detail}` : ''}`));
const psql = (sql) => execFileSync('psql', ['-X', '-At', '-d', DB, '-c', sql]).toString().trim();

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
// textContent, not innerText: labels are uppercased by CSS, and innerText
// returns the transformed text.
const bodyHas = (s) => `document.body.textContent.includes(${JSON.stringify(s)})`;

// Full-page screenshot, or one element's region (scrolled into view).
async function shot(name, selector) {
  // UX-1 slice 1: a screenshot's target may sit in a folded workspace step or
  // the closed "Account detail". Open them first, as a reader would (the
  // step's own toggle; the <details> element), so the shot shows the target.
  if (selector) {
    const opened = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return 0;let n=0;for(let p=el;p;p=p.parentElement){if(p.tagName==='DETAILS'&&!p.open){p.open=true;n++;}if(p.dataset&&p.dataset.open==='false'){p.querySelector('[data-step-toggle]')?.click();n++;}}return n})()`);
    if (opened) await sleep(300);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  if (selector) {
    const rect = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`);
    const h = await ev('document.documentElement.scrollHeight');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const r = await send('Page.captureScreenshot', { format: 'png', clip: rect ? { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } : undefined, captureBeyondViewport: true });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  } else {
    const h = await ev('document.documentElement.scrollHeight');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  console.log(`  shot  ${SHOTS}/${name}.png`);
}

// In-page helpers: set a field by its label text inside a scope element, and
// click a button by its text inside a scope.
const setField = (scopeExpr, labelText, value) => ev(`(()=>{
  const root=${scopeExpr}; if(!root) return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)})); if(!l) return 'no label';
  const el=l.querySelector('input,select,textarea'); if(!el) return 'no field';
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
const fieldValue = (scopeExpr, labelText) => ev(`(()=>{const root=${scopeExpr};const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)}));const el=l&&l.querySelector('input,select,textarea');return el?el.value:null})()`);
const click = (scopeExpr, text, tag = 'button') => ev(`(()=>{const root=${scopeExpr}||document;const el=[...root.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}||e.textContent.includes(${JSON.stringify(text)}));if(!el)return false;el.click();return true})()`);
const buttonDisabled = (scopeExpr, text) => ev(`(()=>{const root=${scopeExpr};const el=[...root.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});return el?el.disabled:null})()`);
const card = (title) => `([...document.querySelectorAll('section')].find(s=>s.querySelector('h3')?.textContent.includes(${JSON.stringify(title)})))`;
// Q4c1b: the "caveats read" tick a pending result needs before Accept.
const tickCaveats = (scopeExpr) => ev(`(()=>{const root=${scopeExpr};const cb=root&&root.querySelector('input[type=checkbox]');if(!cb)return false;if(!cb.checked)cb.click();return cb.checked})()`);
const pendingEntry = (name) => `([...(${card('Pending review')}||document).querySelectorAll('h4')].find(h=>h.textContent===${JSON.stringify(name)})?.parentElement)`;

async function signIn(email) {
  // On the app's own origin first: a relative logout from about:blank goes nowhere.
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`document.readyState === 'complete'`);
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`!!document.querySelector('input[type=password]')`);
  await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(email)});set('input[type=password]',${JSON.stringify(PW)});return true})()`);
  await click('document', 'Sign in');
  const signed = await waitFor(bodyHas('Signed in as'));
  if (!signed) console.log(`  info  sign-in did not complete at ${await ev('location.href')}: ${String(await ev('document.body.innerText')).slice(0, 300).replace(/\n/g, ' | ')}`);
  return signed;
}
async function openPack() {
  await send('Page.navigate', { url: `${APP}/packs/${SLUG}` });
  return waitFor(bodyHas('Generate research prompt'));
}
// Screenshots by CSS selector: mark the element to capture.
const markShot = (scopeExpr) => ev(`(()=>{document.querySelectorAll('[data-shot]').forEach(e=>e.removeAttribute('data-shot'));(${scopeExpr}).setAttribute('data-shot','1');return true})()`);
const cardOf = (title) => `([...document.querySelectorAll('section')].find(s=>s.querySelector('h3')?.textContent.includes(${JSON.stringify(title)})))`;

await signIn(X_EMAIL);
if (MODE === 'author') {
  await send('Page.navigate', { url: `${APP}/accounts/${INST}` });
  check(await waitFor(`!!${cardOf('Value hypotheses')}`), 'the account page shows the Value hypotheses card');
  const hyp = cardOf('Value hypotheses');
  const ref = cardOf('Reference example');
  check(await ev(`(${ref}).textContent.includes("Correcting a reference-example marker is the steward's act — ${S_NAME}'s alone")`)
    && (await buttonDisabled(ref, 'Correct the marker…')) === true && (await buttonDisabled(ref, 'Unmark…')) === true,
    `X: "Correct the marker…" and "Unmark…" disabled, naming the steward (${S_NAME})`);
  check(await ev(`!(${hyp}).textContent.match(/\\bDecide\\b/)`), 'no "decide" anywhere on the card: the verdict is computed (O2-D1)');
  const before = await ev(`(${hyp}).querySelectorAll('[data-testid=hypothesis]').length`);
  await click(hyp, 'State a hypothesis…');
  await waitFor(`!!(${hyp}).querySelector('[data-testid=state-hypothesis]')`);
  const form = `(${hyp}).querySelector('[data-testid=state-hypothesis]')`;
  const O3 = psql(`SELECT vo.id FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id WHERE bm.name = 'Hyp TRIR zero'`);
  const LEV = psql(`SELECT id FROM value_levers WHERE name = 'Hazard recognition' AND deleted_at IS NULL`);
  await setField(form, 'Outcome', O3);
  await sleep(200);
  await setField(form, 'Lever', LEV);
  await setField(form, 'Statement', 'Hazard recognition keeps recordable injuries at zero on the new line.');
  await setField(form, 'Due', LATER);
  await setField(form, 'Conditions', 'within 2 quarters');
  await sleep(300);
  check(await ev(`!!(${form}).querySelector('[data-testid=no-numbers]') && (${form}).querySelector('[data-testid=no-numbers]').textContent === 'Numbers belong in recorded values, not falsifier conditions.'`),
    'a digit in the conditions: the form says why, in the decision\'s words');
  check((await buttonDisabled(form, 'State the hypothesis')) === true, '  ...and "State the hypothesis" stays disabled');
  await setField(form, 'Conditions', 'on the same denominator');
  await sleep(300);
  const preview = await ev(`(${form}).querySelector('[data-testid=falsifier-preview] p').textContent`);
  check(preview === `Hyp TRIR zero at or above its baseline of 0 incidents per 200,000 hours (recorded 2025-09-30) on ${LATER}, on the same denominator.`,
    'the preview quotes the recorded baseline (0: zero is data) and the pack entry\'s direction', preview);
  check(await ev(`(${form}).textContent.includes('Direction: lower is better — from the pack entry')`), '  ...and says the direction comes from the pack entry');
  await markShot(form); await shot('o2_1_state_hypothesis', '[data-shot="1"]');
  await click(form, 'State the hypothesis');
  check(await waitFor(`(${hyp}).querySelectorAll('[data-testid=hypothesis]').length === ${before + 1}`), 'stated: the hypothesis appears on the card');
  check(await ev(`[...(${hyp}).querySelectorAll('[data-testid=falsifier-text]')].some(e=>e.textContent===${JSON.stringify(preview)})`),
    '  ...its recorded falsifier sentence is EXACTLY the preview (client and server templates agree)');
  check(psql(`SELECT count(*) FROM value_hypotheses WHERE statement = 'Hazard recognition keeps recordable injuries at zero on the new line.' AND reference_value = 0 AND author_person_id = (SELECT id FROM persons WHERE email = '${X_EMAIL}')`) === '1',
    '  ...one row: reference value 0 copied by the database, X the author');
  await markShot(hyp); await shot('o2_2_hypotheses_card', '[data-shot="1"]');
  await markShot(cardOf('Executive summary')); await shot('o2_3_summary_card', '[data-shot="1"]');
} else {
  await send('Page.navigate', { url: `${APP}/accounts/${INST}/pov` });
  check(await waitFor(`!!document.querySelector('[data-testid=pov]')`), 'the POV page renders');
  await waitFor(`!document.querySelector('[data-testid=what-it-takes]')?.textContent.includes('loading')`);
  check(await ev(`!!document.querySelector('[data-testid=banner-reference]') && !document.querySelector('[data-testid=banner-outside-in]') && !!document.querySelector('[data-testid=banner-unverified]')`),
    'banners: REFERENCE EXAMPLE (the marker), UNVERIFIED (not every outcome verified), no OUTSIDE-IN (customer-side evidence exists)');
  const spine = SPINE.split(',');
  const stageOrders = await ev(`[...document.querySelectorAll('[data-testid=stages] nav')].map(n=>[...n.querySelectorAll('li')].map(l=>l.dataset.stage).join(','))`);
  check(stageOrders.length > 0 && stageOrders.every((o) => o === spine.join(',')), `each engagement's bar shows the seven spine stages, in the enum's order (${spine.join(' → ')})`, JSON.stringify(stageOrders));
  check(await ev(`[...document.querySelectorAll('[data-testid=stages] li[data-state=current]')].some(l=>l.dataset.stage==='verify')`)
    && await ev(`[...document.querySelectorAll('[data-testid=stages] li[data-stage=commit]')].some(l=>l.dataset.state==='gap')`)
    && await ev(`document.querySelectorAll('[data-testid=stages] li[data-state=done]').length === 0`),
    'a verified outcome\'s engagement reaches verify; its commit, never recorded, shows as a gap; no stage is ticked done on inference');
  check(await ev(`document.querySelector('[data-testid=confidence]').textContent.includes('No computed confidence: no locked run.')`), 'confidence: none shown without a locked run (no number from nowhere)');
  const chains = await ev(`[...document.querySelectorAll('[data-testid=chain]')].map(c=>c.querySelectorAll('li').length)`);
  const current = Number(psql(`SELECT count(*) FROM value_hypotheses WHERE institution_id = '${INST}' AND deleted_at IS NULL AND superseded_by_id IS NULL`));
  check(chains.length === current && chains.every((n) => n === 6), `one six-node chain per current hypothesis (${current}): offering → capability → lever → pack entry → account metric → outcome`, JSON.stringify(chains));
  const verdicts = await ev(`[...document.querySelectorAll('[data-testid=hypothesis]')].map(h=>h.dataset.verdict).sort().join(',')`);
  check(['open', 'refuted', 'survived', 'survived_post_hoc', 'superseded', 'withdrawn'].every((v) => verdicts.split(',').includes(v)), 'every verdict shown as computed, refuted and post hoc among them', verdicts);
  check(await ev(`!!document.querySelector('[data-testid=post-hoc]') && document.querySelector('[data-testid=post-hoc]').textContent.includes('Written after the result')`), '  ...the post hoc one says "written after the result"');
  check(await ev(`!!document.querySelector('[data-testid=vendor-claim]') && document.querySelector('[data-testid=vendor-claim]').textContent.includes('Never applied')`), 'the vendor claim shown as a claim, never applied');
  check(await ev(`!!document.querySelector('[data-testid=no-target]') && document.querySelector('[data-testid=no-target]').textContent === 'No target: a hypothesis.'`), 'an outcome with no committed target says so');
  check(await ev(`document.body.textContent.includes(${JSON.stringify(`Written by ${S_NAME}`)})`), 'the current executive summary, attributed');
  check(await ev(`!!document.querySelector('[data-testid=what-it-takes] table')`), '"What it takes": the gap register\'s asks, labelled the current view');
  await shot('o2_4_pov_1280');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(500);
  const overflow = await ev('document.documentElement.scrollWidth');
  const offenders = overflow > 391 ? await ev(`[...document.querySelectorAll('body *')].filter(e=>e.parentElement && e.getBoundingClientRect().right > e.parentElement.getBoundingClientRect().right + 1).slice(0,6).map(e=>e.tagName+'.'+(e.className||'').toString().slice(0,60)+' «'+e.textContent.slice(0,40)+'» right '+Math.round(e.getBoundingClientRect().right)+' parent '+Math.round(e.parentElement.getBoundingClientRect().right)).join(' | ')`) : '';
  check(overflow <= 391, 'at phone width (390), no horizontal page scroll', `scrollWidth ${overflow}: ${offenders}`);
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/o2_5_pov_390.png`, Buffer.from(r.result.data, 'base64'));
  console.log(`  shot  ${SHOTS}/o2_5_pov_390.png`);
}
ws.close();
process.exit(0);
