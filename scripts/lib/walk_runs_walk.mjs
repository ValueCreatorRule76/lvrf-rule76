// Q4l — the browser walk of (1) forms that say what they wait for, and
// what happened; (2) a second run after the first is locked, and the run
// list showing what each run sealed. Called by scripts/verify_walk_runs.sh.
// The CDP and sign-in preamble is pack_research_walk.mjs's, unchanged.
//
//   node scripts/lib/walk_runs_walk.mjs MODE VITE_PORT CDP_PORT SHOTS DB INST S_EMAIL X_EMAIL PW S_NAME PHASE
//
// MODE: main | break-unmet | break-lock. PHASE (main only): before-lever | after-lever.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, DB, INST, S_EMAIL, X_EMAIL, PW, S_NAME, PHASE] = process.argv.slice(2);
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
const markShot = (scopeExpr) => ev(`(()=>{document.querySelectorAll('[data-shot]').forEach(e=>e.removeAttribute('data-shot'));(${scopeExpr}).setAttribute('data-shot','1');return true})()`);
const step = (id) => `document.querySelector('[data-testid=${id}]')`;
const hyp = card('Value hypotheses');
const OUT = psql(`SELECT vo.id FROM value_outcomes vo WHERE vo.institution_id = '${INST}' ORDER BY vo.created_at LIMIT 1`);

check(await signIn(S_EMAIL), 'signs in by session');
await send('Page.navigate', { url: `${APP}/accounts/${INST}` });
check(await waitFor(`!!${hyp} && !!${step('w7')}`), 'the account page shows the hypotheses card and the walk');

async function openStateForm() {
  await click(hyp, 'State a hypothesis…');
  await waitFor(`!!(${hyp}).querySelector('[data-testid=state-hypothesis]')`);
  const f = `(${hyp}).querySelector('[data-testid=state-hypothesis]')`;
  await setField(f, 'Outcome', OUT);
  await sleep(300);
  return f;
}

if (MODE === 'main' && PHASE === 'before-lever') {
  const f = await openStateForm();
  await setField(f, 'Statement', 'Too short.');
  await setField(f, 'Due', '2027-09-30');
  await setField(f, 'Conditions', 'on the same denominator');
  await sleep(300);
  check((await buttonDisabled(f, 'State the hypothesis')) === true, 'no lever on the pack entry: "State the hypothesis" is disabled');
  const unmet = await ev(`(${f}).querySelector('[data-testid=form-unmet]')?.textContent ?? ''`);
  check(unmet.includes('has no current lever') && unmet.includes('the steward adds one on the pack page'), '  ...and the form SAYS why: the pack entry has no current lever, and who adds one', unmet);
  check(unmet.includes('the statement needs at least 24 characters'), '  ...and that the statement is too short, by how much', unmet);
  await markShot(f); await shot('q4l_1_hypothesis_waits_for', '[data-shot="1"]');
  // A form that names nothing of its own still explains itself (W9's retire form, untouched).
  check(await ev(`${step('w9')}?.querySelector('[data-testid=form-unmet]')?.textContent === 'Fill in every required field to submit.'`), "a form with no list of its own (W9) still explains its disabled button");
  // The marker's kind starts unchosen.
  const ref = card('Reference example');
  await click(ref, 'Mark as a reference example…');
  await waitFor(`!!(${ref}).querySelector('[data-testid=marker-mark]')`);
  check(await ev(`(${ref}).querySelector('[data-testid=marker-mark] select').value === ''`), 'the reference-example kind starts unchosen (no "published case study" by default)');
  check(await ev(`(${ref}).querySelector('[data-testid=form-unmet]')?.textContent.includes('choose the kind')`), "  ...and the form says 'choose the kind'");
} else if (MODE === 'main' && PHASE === 'after-lever') {
  // (1) With a lever, the hypothesis is stated, and the card says what happened.
  const f = await openStateForm();
  const LEV = psql(`SELECT id FROM value_levers WHERE name = 'Q4l lever' AND deleted_at IS NULL`);
  await setField(f, 'Lever', LEV);
  await setField(f, 'Statement', 'Frontline hazard recognition reduces recordable injuries at this account.');
  await setField(f, 'Due', '2027-09-30');
  await setField(f, 'Conditions', 'on the same denominator, among the covered population');
  await sleep(300);
  check(await ev(`!(${f}).querySelector('[data-testid=form-unmet]')`), 'everything filled: nothing left unmet');
  await click(f, 'State the hypothesis');
  check(await waitFor(`(${hyp}).querySelector('[data-testid=notice-hyp]')?.textContent === 'Hypothesis stated. Its verdict is open until a verified actual exists on or after 2027-09-30.'`),
    'stated, and the card says so in a plain sentence');
  await markShot(hyp); await shot('q4l_2_hypothesis_stated', '[data-shot="1"]');
  // (2) The run list says what run 1 sealed; open the citation; produce run 2; lock it.
  const w7 = step('w7');
  check(await ev(`[...(${w7}).querySelectorAll('[data-testid=w7-sealed]')].some(l=>l.textContent.includes('AI-sourced, citation not opened') && l.textContent.includes('basis assumed'))`),
    'W7: run 1 (locked) shows what it sealed: AI-sourced, citation not opened, basis assumed');
  const li = `([...document.querySelectorAll('[data-testid=w6-evidence]')].find(l=>l.textContent.includes('Q4l AI baseline')))`;
  await click(li, 'Open the citation…');
  await waitFor(`!!${li}?.querySelector('[data-testid=open-citation]')`);
  await setField(`${li}.querySelector('[data-testid=open-citation]')`, 'Does the source say', 'true');
  await sleep(200);
  await click(`${li}.querySelector('[data-testid=open-citation]')`, 'Record the opened citation');
  check(await waitFor(`!!${li}?.querySelector('[data-testid=citation-opened]')`), 'W6: the citation opened');
  check(await ev(`[...(${w7}).querySelectorAll('[data-testid=w7-sealed]')].some(l=>l.textContent.includes('citation not opened'))`), '  ...and run 1 still shows what IT sealed (not opened): a locked run never changes');
  await click(w7, 'Produce a new run…');
  await waitFor(`!!(${w7}).querySelector('[data-testid=new-run]')`);
  const nr = `(${w7}).querySelector('[data-testid=new-run]')`;
  await setField(nr, 'Note', 'The AI-sourced baseline citation was opened and verified.');
  await setField(nr, 'Run source label', 'scotts_outside_in_run_2');
  await sleep(200);
  await click(nr, 'Produce run 2');
  check(await waitFor(`(${w7}).querySelector('[data-testid=new-run-notice]')?.textContent.includes('Run 2 produced, not locked yet: lock it in W8.')`), 'run 2 produced, and W7 says so: not locked yet, lock it in W8');
  check(await ev(`(()=>{const r=[...(${w7}).querySelectorAll('[data-testid=w7-run]')].find(x=>x.textContent.includes('Run 2'));return !!r && r.dataset.locked==='false' && r.textContent.includes('citation opened') && r.textContent.includes('basis published') && r.textContent.includes('source verified')})()`),
    '  ...run 2 sealed the opened state: citation opened, source verified, basis published');
  const w8 = step('w8');
  check(await waitFor(`[...(${w8}).querySelectorAll('button')].some(b=>b.textContent.includes('Lock run 2'))`), 'W8 offers "Lock run 2" (the gap: before Q4l, nothing after run 1)');
  await setField(w8, 'Lock reason', 'Verification: the opened citation is sealed.');
  await sleep(200);
  await click(w8, 'Lock run 2');
  check(await waitFor(`(${w8}).textContent.includes('Run 2 locked')`), 'run 2 locked, and W8 names it');
  check(await waitFor(`[...(${w7}).querySelectorAll('[data-testid=w7-run]')].every(x=>x.dataset.locked==='true')`), '  ...both runs locked; "Produce a new run…" is offered again for a third');
  await markShot(w7); await shot('q4l_3_runs_sealed', '[data-shot="1"]');
} else if (MODE === 'break-unmet') {
  const f = await openStateForm();
  await setField(f, 'Statement', 'Too short.');
  await sleep(300);
  check(await ev(`!(${f}).querySelector('[data-testid=form-unmet]')`), 'break-unmet: without the unmet text, the disabled button says nothing — the silent failure Brad met; the text is what prevents it');
} else if (MODE === 'break-lock') {
  const w8 = step('w8');
  check(await ev(`![...(${w8}).querySelectorAll('button')].some(b=>/Lock run 3/.test(b.textContent))`), 'break-lock: with W8 back to first-run-only, an open run 3 cannot be locked from the walk — the condition is what closes the gap');
}
ws.close();
process.exit(0);
