// Q4c1 — the browser walk of the pack page's Research section, driven over
// the Chrome DevTools Protocol (no extra dependency). Called by
// scripts/verify_pack_research.sh; prints "  PASS"/"  FAIL" lines it counts.
//
//   node scripts/lib/pack_research_walk.mjs MODE VITE_PORT CDP_PORT SHOTS DB SLUG S_EMAIL X_EMAIL PW P_STALE S_NAME
//
// MODE: full | break-steward-gate | break-issues
// Signs in by SESSION through the real sign-in form — never the header.

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, DB, SLUG, S_EMAIL, X_EMAIL, PW, P_STALE, S_NAME] = process.argv.slice(2);
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
const measure = (name, dir = 'increase') => ({
  name, unit: '%', direction: dir, definition: `How ${name} is computed (verification).`,
  why_it_pays: 'Verification reason it carries money.', confounders: 'Verification confounders.',
  citation: 'Verification citation, not a source.',
  addressable_by_workforce_capability: { value: true, why: 'Verification why.' },
});
const response = (promptId, measures, extra = {}) => JSON.stringify({
  prompt_id: promptId, industry: SLUG, research_query: 'Verification query', query_as_executed: 'As asked',
  research_tool: 'Walk verification tool', measures, ...extra,
}, null, 2);
async function parse(text) {
  const r = await setField(card('Parse a research response'), "The agent's JSON response", text);
  await sleep(200);
  await click(card('Parse a research response'), 'Parse');
  return r;
}
async function latestPromptId() {
  return psql(`SELECT p.id FROM research_prompts p JOIN industries i ON i.id = p.industry_id WHERE i.slug = '${SLUG}' AND p.contract_version = 3 ORDER BY p.generated_at DESC LIMIT 1`).split('\n')[0];
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

if (MODE === 'full') {
  // ---- as authorized X (not the steward)
  check(await signIn(X_EMAIL), 'X signs in by session');
  check(await openPack(), 'the pack page shows the Research section to X');
  check(await ev(`(${card('Prompts on record')}).textContent.includes('Generated against contract v2; the contract is now v3')`), 'the v2 prompt is flagged STALE, with "generate a new prompt"');
  await click(card('Generate a research prompt'), 'Generate research prompt');
  check(await waitFor(bodyHas('Copy prompt')), 'X generates a prompt; the text appears with Copy');
  const P = await latestPromptId();
  check(await ev(`(${card('Generate a research prompt')}).textContent.includes(${JSON.stringify(P)})`), `the card shows the new prompt's id (${P})`);

  await setField(card('Parse a research response'), "The agent's JSON response", '{ not json');
  await sleep(200);
  check(await ev(`(${card('Parse a research response')}).textContent.includes('Not valid JSON')`) && (await buttonDisabled(card('Parse a research response'), 'Parse')) === true,
    'invalid JSON: named locally, Parse disabled, nothing sent');

  await parse(response(P, [{ name: 'Missing nearly everything' }]));
  check(await waitFor(`(${card('Parse a research response')}).textContent.includes('Write refused')`), 'a non-conforming response is refused');
  const nIssues = await ev(`(${card('Parse a research response')}).querySelectorAll('ul li').length`);
  check(nIssues > 1, `C0: the refusal lists every issue the server named (${nIssues})`);
  await shot('q4c1_1_refused_parse_issues', '#parse-card');
  await shot('q4c1_1_refused_parse_issues_page');

  await parse(response(P, [measure('Walk first-contact resolution'), measure('Walk reopen rate', 'decrease')],
    { measures_tested_and_excluded_as_unaddressable: ['Server uptime — set by infrastructure and hosting, not by service-desk capability'] }));
  check(await waitFor(`(${card('Parse a research response')}).textContent.includes('2 results pending review')`), 'X parses a conforming response: 2 results pending review');
  check(await ev(`(${card('Parse a research response')}).textContent.includes('shown, not stored')`), "the agent's own exclusion list is shown, marked not stored");
  check(await waitFor(`!!${pendingEntry('Walk first-contact resolution')}`), 'the pending card lists the parsed results');
  check(await ev(`(${pendingEntry('Walk first-contact resolution')}).textContent.includes('Not yours to record') && (${pendingEntry('Walk first-contact resolution')}).textContent.includes(${JSON.stringify(S_NAME)})`),
    `X: accept/reject is disabled, naming the steward (${S_NAME})`);
  check((await buttonDisabled(pendingEntry('Walk first-contact resolution'), 'Accept')) === true, "X: the Accept button is disabled");
  check((await buttonDisabled(card('Exclude a measure'), 'Record exclusion')) === true, 'X: Record exclusion is disabled');
  await shot('q4c1_2_nonsteward_pending', '#pending-card');
  await shot('q4c1_2_nonsteward_page');

  // ---- as the steward S
  check(await signIn(S_EMAIL), 'S (the steward) signs in by session');
  check(await openPack(), 'the pack page loads for S');
  check(!(await ev(bodyHas('Server uptime — set by'))), "after a reload the agent's list is gone — it was never stored");
  await click(card('Generate a research prompt'), 'Generate research prompt');
  await waitFor(bodyHas('Copy prompt'));
  const P2 = await latestPromptId();
  const LINE = 'Server uptime — set by infrastructure and hosting, not by service-desk capability';
  await parse(response(P2, [measure('Walk SLA attainment')], { measures_tested_and_excluded_as_unaddressable: [LINE] }));
  check(await waitFor(`(${card('Parse a research response')}).textContent.includes('1 result pending review')`), 'S parses a response with the agent list');
  await click(card('Parse a research response'), 'Record as exclusion…');
  await sleep(500);
  const ex = card('Exclude a measure');
  const vName = await fieldValue(ex, 'Measure name');
  const vReason = await fieldValue(ex, 'Your reason');
  const vTool = await fieldValue(ex, 'Proposed by research tool');
  const vProposal = await fieldValue(ex, "The research's proposal");
  check(vReason === '', 'Record as exclusion…: the REASON box is EMPTY', JSON.stringify(vReason));
  check(vProposal === LINE && vTool === 'Walk verification tool', "the agent's line is the proposal text, verbatim; the tool is the research tool", `${vTool} / ${vProposal}`);
  check(vName === 'Server uptime', 'the name is offered from the line, editable', vName);
  await shot('q4c1_3_exclusion_prefill_empty_reason', `#exclude-card`);
  const REASON = "Steward's judgement: availability is an infrastructure measure; the service desk cannot move it.";
  await setField(ex, 'Your reason', REASON);
  await sleep(200);
  await click(ex, 'Record exclusion');
  check(await waitFor(`(${ex}).textContent.includes('Excluded from this pack.')`), 'S records the exclusion');
  const row = psql(`SELECT x.reason || E'\\x1f' || x.proposal_text || E'\\x1f' || x.proposed_by_research_tool || E'\\x1f' || p.email FROM industry_measure_exclusions x JOIN industries i ON i.id = x.industry_id JOIN persons p ON p.id = x.excluded_by_person_id WHERE i.slug = '${SLUG}' AND x.name = 'Server uptime'`).split('\x1f');
  check(row[0] === REASON, "stored reason = exactly what the steward typed", row[0]);
  check(row[1] === LINE && row[2] === 'Walk verification tool', "stored proposal_text = the agent's line; proposed_by_research_tool = the research tool", `${row[2]} / ${row[1]}`);
  check(row[0] !== row[1], 'the reason and the proposal differ');
  check(row[3] === S_EMAIL, 'excluded_by is the steward');
  check(await waitFor(`(${card('Tested and excluded')})?.textContent.includes('Server uptime')`), 'the pack\'s "Tested and excluded" card shows it, the proposal labeled as the research\'s');

  await setField(pendingEntry('Walk first-contact resolution'), 'Review note', 'Verification: accepted by the steward in the walk.');
  await sleep(200);
  await click(pendingEntry('Walk first-contact resolution'), 'Accept');
  check(await waitFor(bodyHas('Walk first-contact resolution: accepted into the pack')), 'S accepts a result');
  check(await waitFor(`(${card('What you can claim against')})?.textContent.includes('Walk first-contact resolution')`), 'the accepted entry is on the pack, refreshed in place');
  await ev(`(()=>{const e=${pendingEntry('Walk reopen rate')};const r=[...e.querySelectorAll('input[type=radio]')][1];r.click();return true})()`);
  await setField(pendingEntry('Walk reopen rate'), 'Review note', 'Verification: rejected by the steward in the walk.');
  await sleep(200);
  await click(pendingEntry('Walk reopen rate'), 'Reject');
  check(await waitFor(bodyHas('Walk reopen rate: rejected')), 'S rejects a result');
  check(psql(`SELECT string_agg(field_name || '=' || review_state, ',' ORDER BY field_name) FROM research_results WHERE field_name LIKE 'Walk %'`) ===
    'Walk first-contact resolution=accepted,Walk reopen rate=rejected,Walk SLA attainment=pending', 'database: accepted, rejected, and one still pending');
  await shot('q4c1_4_steward_after');
} else if (MODE === 'break-steward-gate') {
  await signIn(X_EMAIL);
  await openPack();
  await waitFor(`!!${pendingEntry('Walk SLA attainment')}`);
  const enabledForX = !(await ev(`(${pendingEntry('Walk SLA attainment')}).textContent.includes('Not yours to record')`));
  check(enabledForX, 'B1: with the client gate removed, X sees the steward form enabled');
  await setField(pendingEntry('Walk SLA attainment'), 'Review note', 'Verification: X tries to accept.');
  await sleep(200);
  await click(pendingEntry('Walk SLA attainment'), 'Accept');
  await sleep(1500);
  const said = await ev(`(${pendingEntry('Walk SLA attainment')})?.textContent || ''`);
  check(/steward/i.test(said) && !said.includes('Recorded as'), "B1: the server still refuses X (403, the steward's act) — the gate is a courtesy, the server the authority", said.slice(-200));
  check(psql(`SELECT review_state FROM research_results WHERE field_name = 'Walk SLA attainment'`) === 'pending', 'B1: the result is still pending');
} else if (MODE === 'break-issues') {
  await signIn(X_EMAIL);
  await openPack();
  const P = await latestPromptId();
  await parse(response(P, [{ name: 'Missing nearly everything' }]));
  await waitFor(`(${card('Parse a research response')}).textContent.includes('Write refused')`);
  const nIssues = await ev(`(${card('Parse a research response')}).querySelectorAll('ul li').length`);
  check(nIssues === 0, 'B2: with C0 removed, the refusal shows no issues — only "N issue(s) found"; C0 is what lists them');
  await shot('q4c1_5_break_no_issues', '#parse-card');
}
ws.close();
process.exit(0);
