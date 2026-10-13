// Q4k — the browser walk of the evidence form's AI-sourced lock, R1's help
// text, and "Open the citation…" on W6's evidence list, over the Chrome
// DevTools Protocol. Called by scripts/verify_plain_refusals.sh; prints
// "  PASS"/"  FAIL" lines it counts. The CDP and sign-in preamble is
// pack_research_walk.mjs's, unchanged (its openPack is unused here).
//
//   node scripts/lib/evidence_form_walk.mjs MODE VITE_PORT CDP_PORT SHOTS DB INST S_EMAIL X_EMAIL PW S_NAME
//
// MODE: form | break-gate. Signs in by SESSION — never the header.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, DB, INST, S_EMAIL, X_EMAIL, PW, S_NAME] = process.argv.slice(2);
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
const w6 = `document.querySelector('[data-testid=w6]')`;
const form = `(${card('Add evidence')})`;
const SENTENCE = "AI-sourced evidence is verified after its citation is opened, not when it's recorded";

check(await signIn(S_EMAIL), 'signs in by session');
await send('Page.navigate', { url: `${APP}/accounts/${INST}` });
check(await waitFor(`!!${w6} && !!${form}`), 'the account page shows W6 and its evidence form');

if (MODE === 'form') {
  const help = await ev(`(${form}).querySelector('[data-testid=kind-help]')?.textContent ?? ''`);
  check(help.includes('10-K') && help.includes('public_filing') && help.includes('observation') && help.includes('press release'),
    "R1's help text under Kind: formal annual disclosure reports are public_filing, looser material observation", help.slice(0, 120));
  check(await ev(`(${form}).querySelector('[data-testid=source-verified]').disabled === false`), 'Source verified is open while AI-sourced is unchosen');
  await setField(form, 'AI-sourced', 'true');
  await sleep(300);
  check(await ev(`(()=>{const s=(${form}).querySelector('[data-testid=source-verified]');return s.disabled===true&&s.value==='false'})()`),
    'AI-sourced = Yes: Source verified is set to No and disabled');
  check(await ev(`(${form}).querySelector('[data-testid=source-verified-reason]')?.textContent.includes(${JSON.stringify(SENTENCE)})`), '  ...with the reason beside it');
  await markShot(form); await shot('q4k_1_form_lock', '[data-shot="1"]');
  await setField(form, 'AI-sourced', 'false');
  await sleep(300);
  check(await ev(`(${form}).querySelector('[data-testid=source-verified]').disabled === false`), 'AI-sourced back to No: Source verified opens again');
  // Open the citation on the AI-sourced evidence already recorded.
  const li = `([...document.querySelectorAll('[data-testid=w6-evidence]')].find(l=>l.textContent.includes('Walk AI evidence (fixture)')))`;
  check(await ev(`!!${li} && ${li}.textContent.includes('citation not yet opened')`), "W6 lists the AI-sourced evidence as 'citation not yet opened'");
  await click(li, 'Open the citation…');
  await waitFor(`!!${li}?.querySelector('[data-testid=open-citation]')`);
  check(await ev(`${li}.textContent.includes('final') && ${li}.textContent.includes('stays marked AI-sourced')`), '  ...the form says it is final and the evidence stays AI-sourced');
  await setField(`${li}.querySelector('[data-testid=open-citation]')`, 'Does the source say', 'true');
  await sleep(200);
  await markShot(li); await shot('q4k_2_open_citation_form', '[data-shot="1"]');
  await click(`${li}.querySelector('[data-testid=open-citation]')`, 'Record the opened citation');
  check(await waitFor(`!!${li}?.querySelector('[data-testid=citation-opened]') && ${li}.querySelector('[data-testid=citation-opened]').textContent.includes(${JSON.stringify(`citation opened by ${S_NAME}`)}) && ${li}.textContent.includes('source verified')`),
    `opened: "citation opened by ${S_NAME}", source verified`);
  check(psql(`SELECT ai_sourced || '|' || citation_resolved || '|' || source_verified || '|' || (citation_resolved_at IS NOT NULL) FROM evidence WHERE summary = 'Walk AI evidence (fixture)'`) === 'true|true|true|true',
    '  ...the row: still ai_sourced, citation resolved with a time, source verified');
  await markShot(w6); await shot('q4k_3_citation_opened', '[data-shot="1"]');
} else {
  // break-gate: the client's lock removed; the route still refuses, in plain words.
  await setField(form, 'Provenance', 'Walk break-gate fixture, not a source');
  await setField(form, 'Kind', 'public_filing');
  await setField(form, 'Summary', 'Walk break-gate evidence');
  await setField(form, 'Supports', 'baseline');
  await setField(form, 'Confidence', 'medium');
  await setField(form, 'AI-sourced', 'true');
  await sleep(200);
  await setField(form, 'Source verified', 'true');
  await setField(form, 'Research query', 'walk query');
  await setField(form, 'Research tool', 'walk tool');
  await setField(form, 'Simulated', 'false');
  await sleep(300);
  check(await ev(`(${form}).querySelector('[data-testid=source-verified]').disabled === false`), 'break-gate: with the lock removed, Source verified = Yes can be chosen with AI-sourced = Yes');
  await click(form, 'Submit');
  check(await waitFor(`(${form}).textContent.includes(${JSON.stringify(SENTENCE)})`), '  ...and the ROUTE refuses it in the same plain words — the lock is a courtesy, the route and the CHECK the authority');
  check(await ev(`!/violates|check constraint|relation "/.test((${form}).textContent)`), '  ...no Postgres text on the page');
  check(psql(`SELECT count(*) FROM evidence WHERE summary = 'Walk break-gate evidence'`) === '0', '  ...nothing written');
  await markShot(form); await shot('q4k_4_break_gate_refused', '[data-shot="1"]');
}
ws.close();
process.exit(0);
