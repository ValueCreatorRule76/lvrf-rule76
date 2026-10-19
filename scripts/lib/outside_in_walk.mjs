// Q4c2 — the browser walk of the outside-in walk card (W1–W9) on the
// account page, over the Chrome DevTools Protocol. Called by
// verify_outside_in_walk.sh; prints "  PASS"/"  FAIL" lines it counts, and a
// crash exits non-zero (counted as a failure). Signs in by SESSION.
// A FICTIONAL account: never a real company's figures in a test.
//
//   node scripts/lib/outside_in_walk.mjs MODE VITE_PORT CDP_PORT SHOTS DB INST S_EMAIL X_EMAIL PW S_NAME
//
// MODE: steward-to-lock | nonsteward-retire | steward-retire | break-retire-gate | break-evidence

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, DB, INST, S_EMAIL, X_EMAIL, PW, S_NAME] = process.argv.slice(2);
const APP = `http://localhost:${VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (cond, m, detail = '') => console.log(cond ? `  PASS  ${m}` : `  FAIL  ${m}${detail ? ` — ${detail}` : ''}`);
const psql = (sql) => execFileSync('psql', ['-X', '-At', '-d', DB, '-c', sql]).toString().trim();

const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
const step = (id) => `document.querySelector('[data-testid=${id}]')`;
const stateOf = (id) => ev(`${step(id)}?.getAttribute('data-state')`);
const setField = (scope, label, value) => ev(`(()=>{const root=${scope};if(!root)return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.querySelector('span')?.textContent.trim().startsWith(${JSON.stringify(label)}));if(!l)return 'no label '+${JSON.stringify(label)};
  const el=l.querySelector('input,textarea,select');const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const click = (scope, text) => ev(`(()=>{const el=[...((${scope})||document).querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!el)return false;el.click();return true})()`);
const disabled = (scope, text) => ev(`(()=>{const el=[...((${scope})||document).querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});return el?el.disabled:null})()`);
async function shot(name, selector) {
  // UX-1 slice 1: a screenshot's target may sit in a folded workspace step or
  // the closed "Account detail". Open them first, as a reader would (the
  // step's own toggle; the <details> element), so the shot shows the target.
  if (selector) {
    const opened = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return 0;let n=0;for(let p=el;p;p=p.parentElement){if(p.tagName==='DETAILS'&&!p.open){p.open=true;n++;}if(p.dataset&&p.dataset.open==='false'){p.querySelector('[data-step-toggle]')?.click();n++;}}return n})()`);
    if (opened) await sleep(300);
  }
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.min(h, 14000), deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const rect = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`);
  const r = await send('Page.captureScreenshot', { format: 'png', ...(rect ? { clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }, captureBeyondViewport: true } : {}) });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  console.log(`  shot  ${SHOTS}/${name}.png`);
}
async function signIn(email) {
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`document.readyState === 'complete'`);
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`!!document.querySelector('input[type=password]')`);
  await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(email)});set('input[type=password]',${JSON.stringify(PW)});return true})()`);
  await click('document', 'Sign in');
  return waitFor(`document.body.textContent.includes('Signed in as')`);
}
async function openAccount() {
  await send('Page.navigate', { url: `${APP}/accounts/${INST}` });
  return waitFor(`!!document.querySelector('[data-testid=outside-in-walk]')`);
}
const done = (id) => waitFor(`${step(id)}?.getAttribute('data-state') === 'done'`);

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

if (MODE === 'steward-to-lock' || MODE === 'break-evidence') {
  check(await signIn(S_EMAIL), 'signs in by session');
  check(await openAccount(), 'the account page shows the outside-in walk');
  check((await stateOf('w1')) === 'next' && (await stateOf('w2')) === 'waiting', 'W1 is next; W2 waits');
  // W1 fix: adding someone already in LVRF (here the steward, by his own
  // email) is refused in plain words — no Postgres text, no constraint name.
  const addPerson = `(${step('w1')}).querySelector('[data-testid=w1-add-person]')`;
  await setField(addPerson, 'Full name', 'The steward, added again');
  await setField(addPerson, 'Email', S_EMAIL);
  await sleep(200); await click(addPerson, 'Add the person');
  check(await waitFor(`(${addPerson}).textContent.includes('already in LVRF; select them instead')`),
    'W1: an existing person\'s email is refused in plain words ("already in LVRF; select them instead")');
  check(await ev(`!/duplicate key|persons_email_key|constraint/i.test((${step('w1')}).textContent)`), '  ...no Postgres text and no constraint name on the page');
  await shot('w1_plain_refusal', '[data-testid=w1]');
  // The honest analyst of record: the signed-in steward himself, named (not copied).
  const nameExisting = `(${step('w1')}).querySelector('[data-testid=w1-name-existing]')`;
  check(await ev(`[...(${nameExisting}).querySelectorAll('option')].find(o=>o.selected)?.textContent.includes('(you)')`), 'W1: "Name an existing person" defaults to you');
  await click(nameExisting, 'Name the analyst of record');
  check(await done('w1'), 'W1 done: the steward named analyst of record, with the title for this account');
  check(await ev(`(${step('w1')}).querySelector('[data-testid=w1-analysts]')?.textContent.includes('External analyst of record')`), '  ...shown with his title on this account');
  const person = psql(`SELECT id FROM persons WHERE email = '${S_EMAIL}'`);
  check(psql(`SELECT count(*) FROM persons WHERE email = '${S_EMAIL}'`) === '1' && psql(`SELECT count(*) FROM persons WHERE institution_id = '${INST}'`) === '0',
    '  ...no person row created: one row for him in LVRF, none on the account');
  await setField(step('w2'), 'Offering', 'skillsoft_compliance_suite');
  await setField(step('w2'), 'Owner', person);
  await setField(step('w2'), 'Capability name', 'Walk safety capability');
  await setField(step('w2'), 'Basis', 'Verification: EHS solution attached for the walk.');
  await sleep(200); await click(step('w2'), 'Attach');
  check(await done('w2'), 'W2 done: offering and capability');
  const cap = psql(`SELECT id FROM capabilities WHERE institution_id = '${INST}' AND name = 'Walk safety capability'`);
  const entry = psql(`SELECT m.id FROM industry_measures m JOIN institutions i ON i.industry_id = m.industry_id WHERE i.id = '${INST}' AND m.deleted_at IS NULL ORDER BY m.name LIMIT 1`);
  await setField(step('w3'), 'Capability', cap);
  await setField(step('w3'), 'Pack entry', entry);
  check(await waitFor(`(${step('w3')}).querySelector('[data-testid=claim-confounders]')?.textContent.includes('What moves this that is NOT capability')`), 'W3: the entry\'s confounders are shown above the claim');
  await shot('q4c2_1_claim_confounders', '[data-testid=w3]');
  await setField(step('w3'), 'Claim', 'Verification: hazard-recognition training reduces recordable incidents.');
  await sleep(200); await click(step('w3'), 'Record the claim');
  check(await done('w3'), 'W3 done: the claim');
  check(!(await ev(`[...(${step('w4')}).querySelectorAll('label span')].some(s=>/target/i.test(s.textContent))`)), 'W4: no target field is offered');
  await setField(step('w4'), 'Engagement name', 'Walk Fictional — reference example, not an engagement');
  await setField(step('w4'), 'Owner', person);
  await setField(step('w4'), 'Capability', 'Walk safety capability');
  await setField(step('w4'), 'Metric name', 'Walk Total Recordable Incident Rate');
  await setField(step('w4'), 'Unit', 'incidents per 200,000 hours');
  await setField(step('w4'), 'Direction', 'decrease');
  await setField(step('w4'), 'Source system', 'Walk Fictional CR disclosures (fixture, not a source)');
  await setField(step('w4'), 'Baseline value', '0');
  await setField(step('w4'), 'Baseline measured at', '2025-09-30');
  await shot('q4c2_2_outcome_no_target', '[data-testid=w4]');
  await sleep(200); await click(step('w4'), 'Record the outcome');
  check(await done('w4'), 'W4 done: the outcome, baseline 0 (zero is data)');
  check(await ev(`(${step('w4')}).textContent.includes('at 2025-09-30')`), '  ...shown with its baseline date as entered (2025-09-30, UTC — not shifted a day)');
  check(psql(`SELECT vo.baseline_value::text || '|' || (vo.target_value IS NULL) FROM value_outcomes vo WHERE vo.institution_id = '${INST}'`) === '0.0000|true', '  ...stored: baseline 0, no target', psql(`SELECT vo.baseline_value::text || '|' || (vo.target_value IS NULL) FROM value_outcomes vo WHERE vo.institution_id = '${INST}'`));
  await setField(step('w5'), 'Pack entry', entry);
  await setField(step('w5'), 'Basis note', 'Verification: the same rate, per 200,000 hours.');
  await sleep(200); await click(step('w5'), 'Set the basis');
  check(await done('w5'), 'W5 done: the pack basis');
  const evScope = `(${step('w6')})`;
  if (MODE === 'break-evidence') {
    check(await waitFor(`(${step('w6')}).textContent.includes('Unavailable on this run')`), 'B-evidence: without the outcomeId path, evidence cannot be added before a run — the path is what allows it');
    ws.close(); process.exit(0);
  }
  check(await waitFor(`!!(${step('w6')}).querySelector('textarea, input')`), 'W6: the evidence card is open before any run exists');
  check(psql(`SELECT count(*) FROM value_runs r JOIN engagements e ON e.id = r.engagement_id WHERE e.institution_id = '${INST}'`) === '0', '  ...and no run exists yet');
  await setField(evScope, 'Provenance', 'Walk Fictional CR disclosures FY25, page 21 (fixture, not a source)');
  await setField(evScope, 'Kind', 'public_filing');
  await setField(evScope, 'Summary', 'TRIR FY25 0 (fixture).');
  await setField(evScope, 'Supports', 'baseline');
  await setField(evScope, 'Confidence', 'medium');
  await setField(evScope, 'Source verified', 'false');
  await setField(evScope, 'AI-sourced', 'false');
  await setField(evScope, 'Simulated', 'false');
  await sleep(300); await click(evScope, 'Submit');
  check(await done('w6'), 'W6 done: the baseline evidence, before the first run');
  await setField(step('w7'), 'Note', 'Verification: an outside-in hypothesis from published material.');
  await setField(step('w7'), 'Run source label', 'walk_ui_outside_in');
  await sleep(200); await click(step('w7'), 'Produce');
  check(await done('w7'), 'W7 done: the run produced');
  await setField(step('w8'), 'Lock reason', 'Verification: the outside-in hypothesis as first locked.');
  await sleep(200); await click(step('w8'), 'Lock run 1');
  const w8done = await done('w8');
  check(w8done, 'W8 done: the run locked');
  if (!w8done) { await shot('w8_not_done', '[data-testid=w8]'); console.log('  info  W8 text: ' + String(await ev(`(${step('w8')}).textContent`)).slice(0, 400)); }
  check(await waitFor(`(${step('w6')}).textContent.includes('evidence added now would not be in it') && !(${step('w6')}).querySelector('textarea')`), '  ...and W6 no longer offers evidence: it would not be in the locked run');
  check(psql(`SELECT count(*) FROM value_runs r JOIN engagements e ON e.id = r.engagement_id WHERE e.institution_id = '${INST}' AND r.locked_at IS NOT NULL`) === '1', '  ...one locked run, with its evidence');
} else if (MODE === 'nonsteward-retire' || MODE === 'break-retire-gate') {
  check(await signIn(X_EMAIL), 'X (not the steward) signs in by session');
  await openAccount();
  check((await stateOf('w9')) === 'next', 'W9 is next for X too (the step is shown)');
  if (MODE === 'nonsteward-retire') {
    check(await ev(`(${step('w9')}).textContent.includes('Not yours to record') && (${step('w9')}).textContent.includes(${JSON.stringify(S_NAME)})`), `W9: retire is disabled for X, naming the steward (${S_NAME})`);
    check((await disabled(step('w9'), 'Retire the engagement')) === true, '  ...the button is disabled');
    await shot('q4c2_3_retire_disabled', '[data-testid=w9]');
  } else {
    await setField(step('w9'), 'Why it is being retired', 'Verification: X tries to retire.');
    await sleep(200); await click(step('w9'), 'Retire the engagement');
    await sleep(1500);
    const said = await ev(`(${step('w9')}).textContent`);
    check(/steward/i.test(said) && !said.includes('Retired.'), 'B-retire: with the client gate removed, X submits and the server still refuses (403)', said.slice(-200));
    check(psql(`SELECT count(*) FROM engagements WHERE institution_id = '${INST}' AND deleted_at IS NULL`) === '1', '  ...the engagement is still current');
  }
} else if (MODE === 'steward-retire') {
  await signIn(S_EMAIL);
  await openAccount();
  await setField(step('w9'), 'Why it is being retired', 'Verification: a reference example, not an engagement; its run is locked.');
  await sleep(200); await click(step('w9'), 'Retire the engagement');
  check(await done('w9'), 'W9 done: the steward retires the reference engagement');
  check(psql(`SELECT count(*) FROM engagements WHERE institution_id = '${INST}' AND deleted_at IS NULL`) === '0', '  ...retired; its run is kept');
  await shot('q4c2_4_walk_done', '[data-testid=outside-in-walk]');
}
ws.close();
process.exit(0);
