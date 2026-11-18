// S2 (3.1; LVRF_PLAN §21) — the browser walk for scripts/verify_s2_ai_research.sh, over the Chrome DevTools Protocol.
// Prints "  PASS"/"  FAIL" lines the script counts, and "  confirm <act>: <text>" with each confirmation word for word.
// Signs in by SESSION through the real sign-in form, as the steward. THROWAWAY CLONE ONLY; the research process talks
// to the local stand-in only.
//
//   node scripts/lib/s2_walk.mjs MODE   (VITE_PORT CDP_PORT SHOTS DB S_EMAIL PW INST, and per mode: REASON DISC WHY
//                                        ROW WREASON CREASON)
//
// MODE: off       the card says research with Claude is off, with the reason (WHY); copying the prompt still works
//       clear     the steward clears the account (REASON): the confirmation shows the disclosure (DISC) and the reason
//                 in full, no ellipsis; then the card reads cleared
//       send      "Research with Claude": the confirmation names the prompt and its SHA-256, the model and "cannot be
//                 called back"; the call answers on the page
//       import    "Import the answer": the confirmation names the call; the results are pending review
//       leftout   the card lists the row left out of the prompt (ROW, its short id and why); the send is still offered
//       withdraw  the steward withdraws the clearance (WREASON): the confirmation shows the clearance's reason (CREASON)
//                 and the withdrawal's in full
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MODE = process.argv[2];
const E = process.env;
const APP = `http://localhost:${E.VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(`${m}${detail ? ` — ${detail}` : ''}`));
const psql = (sql) => execFileSync('psql', ['-X', '-At', '-d', E.DB, '-c', sql]).toString().trim();

const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0;
const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 20000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
const bodyHas = (s) => `document.body.textContent.includes(${JSON.stringify(s)})`;
async function shot(name, width = 1280) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(400);
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${E.SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  console.log(`  shot  ${E.SHOTS}/${name}.png`);
}
const AI = `document.querySelector('[data-testid=ai-research]')`;
const setField = (scopeExpr, labelText, value) => ev(`(()=>{
  const root=${scopeExpr}; if(!root) return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)})); if(!l) return 'no label';
  const el=l.querySelector('input,select,textarea'); if(!el) return 'no field';
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
const enabledButton = (scopeExpr, text) => `(()=>{const root=${scopeExpr}||document;const el=[...root.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});return !!el&&!el.disabled})()`;
const click0 = (scopeExpr, text) => ev(`(()=>{const root=${scopeExpr}||document;const el=[...root.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!el||el.disabled)return false;el.click();return true})()`);
// The confirmation is read, printed word for word, and then confirmed, as the person would.
async function act(scopeExpr, text, label) {
  if (!(await waitFor(enabledButton(scopeExpr, text), 15000))) { bad(`${label}: "${text}" not found or disabled`); return null; }
  await click0(scopeExpr, text);
  // The confirmation of THIS form, inside its own scope: another form on the page may be confirming too.
  if (!(await waitFor(`!!(${scopeExpr})?.querySelector('[data-testid=confirm-text]')`, 8000))) { bad(`${label}: no confirmation shown`); return null; }
  const said = await ev(`(${scopeExpr}).querySelector('[data-testid=confirm-text]').textContent`);
  console.log(`  confirm ${label}: ${said}`);
  await ev(`(()=>{const y=(${scopeExpr}).querySelector('[data-testid=form-confirm-yes]');if(!y)return false;y.click();return true})()`);
  return said;
}
async function signIn() {
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`document.readyState === 'complete'`);
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`!!document.querySelector('input[type=password]')`);
  await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
  await click0('document', 'Sign in');
  return waitFor(bodyHas('Signed in as'));
}
const openAccount = async () => {
  await send('Page.navigate', { url: `${APP}/accounts/${E.INST}` });
  return waitFor(`!!${AI} && !${AI}.textContent.includes('loading')`, 25000);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
check(await signIn(), `the steward signs in by session (${E.S_EMAIL})`);
check(await openAccount(), `the account's Research step shows "Research with Claude" (${E.INST.slice(0, 8)})`);

if (MODE === 'off') {
  const why = await ev(`document.querySelector('[data-testid=ai-off]')?.textContent ?? null`);
  check(why === E.WHY, 'the card says research with Claude is off, and why', JSON.stringify(why));
  check(!(await ev(`!!document.querySelector('[data-testid=ai-send]')`)), '  ...and offers no "Research with Claude"');
  check(await ev(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Generate research prompt'))`), '  ...generating and copying a prompt still works (the paste path is unchanged)');
  await shot('s2_off_1280');
}

if (MODE === 'clear') {
  check(await ev(`!!document.querySelector('[data-testid=ai-clear]')`), 'not cleared: the clearance form is offered, with the disclosure');
  const shown = await ev(`document.querySelector('[data-testid=ai-disclosure]')?.textContent ?? null`);
  check(shown === E.DISC, '  ...the disclosure shown is the text in code for this model, word for word', JSON.stringify(shown).slice(0, 200));
  await shot('s2_clear_form_1280'); await shot('s2_clear_form_390', 390);
  const set = await setField(`document.querySelector('[data-testid=ai-clear]')`, 'Why it may be researched', E.REASON);
  check(set === true, '  ...the reason typed', String(set));
  const said = await act(`document.querySelector('[data-testid=ai-clear]')`, 'Clear this for research with Claude', 'clear');
  check(said !== null && said.includes(E.DISC) && said.includes(E.REASON) && !said.includes('…'),
    '  ...the confirmation shows the disclosure and the reason in full, with no ellipsis');
  check(await waitFor(`!!document.querySelector('[data-testid=ai-cleared]')`), '  ...the card then reads cleared');
  const row = psql(`SELECT reason = $q$${E.REASON}$q$ AND disclosure_text = $q$${E.DISC}$q$ AND model = 'claude-opus-5-5' FROM research_clearances WHERE institution_id = '${E.INST}' AND kind = 'clearance' ORDER BY at DESC LIMIT 1`);
  check(row === 't', '  ...recorded: the reason and the disclosure exactly as shown, for claude-opus-5-5');
  await shot('s2_cleared_1280');
}

if (MODE === 'send') {
  const said = await act(`document.querySelector('[data-testid=ai-send]')`, 'Research with Claude', 'send');
  const p = psql(`SELECT id || '|' || prompt_sha256 FROM research_prompts WHERE institution_id = '${E.INST}' ORDER BY generated_at DESC LIMIT 1`).split('|');
  check(said !== null && said.includes(p[0].slice(0, 8)) && said.includes(p[1]) && said.includes('Claude Opus 5.5 (claude-opus-5-5)') && said.includes('cannot be called back'),
    "  ...the confirmation names the prompt, its SHA-256, the model, and that it can't be called back");
  check(await waitFor(`!!document.querySelector('[data-testid=ai-call][data-state=answered]')`, 40000), '  ...the call answers on the page (the card follows it)');
  await shot('s2_answered_1280'); await shot('s2_answered_390', 390);
}

if (MODE === 'import') {
  const said = await act(`document.querySelector('[data-testid=ai-call][data-state=answered]')`, 'Import the answer', 'import');
  check(said !== null && /Import the answer of call [0-9a-f]{8} \([0-9,]+ bytes, SHA-256 [0-9a-f]{64}\)/.test(said), '  ...the confirmation names the call, its size and its SHA-256');
  check(await waitFor(`!!document.querySelector('[data-testid=ai-imported]')`, 20000), '  ...the call reads imported');
  check(await waitFor(bodyHas('via the Claude API, with web search and web fetch'), 20000), '  ...and its results wait in review, with the research tool as the server states it');
  await shot('s2_imported_1280');
}

if (MODE === 'leftout') {
  const rows = await ev(`[...document.querySelectorAll('[data-testid=ai-left-out-row]')].map(li=>li.textContent)`);
  check(Array.isArray(rows) && rows.some((r) => r.includes(E.ROW)), 'the card lists the row left out of the prompt, with its short id and why', JSON.stringify(rows));
  check(await ev(`!document.querySelector('[data-testid=ai-customer-side]')`), '  ...and nothing the prompt would carry blocks it');
  check(await waitFor(enabledButton(`document.querySelector('[data-testid=ai-send]')`, 'Research with Claude'), 10000), '  ..."Research with Claude" is offered');
  await shot('s2_left_out_1280'); await shot('s2_left_out_390', 390);
}

if (MODE === 'withdraw') {
  for (let i = 0; i < 20 && !(await ev(`!!document.querySelector('[data-testid=ai-withdraw]')`)); i++) { await click0(AI, 'Withdraw the clearance…'); await sleep(300); }
  const set = await setField(`document.querySelector('[data-testid=ai-withdraw]')`, 'Why it is withdrawn', E.WREASON);
  check(set === true, 'the withdrawal form opens; the reason typed', String(set));
  const said = await act(`document.querySelector('[data-testid=ai-withdraw]')`, 'Withdraw the clearance', 'withdraw');
  check(said !== null && said.includes(E.CREASON) && said.includes(E.WREASON) && !said.includes('…'),
    "  ...the confirmation shows the clearance's reason and the withdrawal's in full");
  await sleep(2500);
  console.log(`  info  after confirm: ${await ev(`(()=>{const w=document.querySelector('[data-testid=ai-withdraw]');return w?w.textContent.slice(-300):'(the withdrawal form is gone)'})()`)}`);
  check(await waitFor(`!!document.querySelector('[data-testid=ai-clear]')`), '  ...the card offers the clearance form again');
}

ws.close();
process.exit(0);
