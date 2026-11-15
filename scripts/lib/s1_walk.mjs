// S1 (3.1; LVRF_PLAN §20) — the browser walk for scripts/verify_s1_hypothesis_rule.sh, over the Chrome DevTools
// Protocol (no extra dependency). Prints "  PASS"/"  FAIL" lines the script counts, and "  confirm <act>: <text>" lines
// with each confirmation word for word (the Gate B note quotes them). Signs in by SESSION through the real sign-in
// form — never the header. THROWAWAY CLONE ONLY.
//
//   node scripts/lib/s1_walk.mjs MODE   (inputs from the environment: VITE_PORT CDP_PORT SHOTS DB S_EMAIL PW, and
//                                        RUN TENANT_INST ENG SLUG OUTCOME METRIC LATER as each mode needs)
//
// MODE: links    the case links on the run page's header, every row of the Runs list, and card 05 (H5 control)
//       nolink   the run page's header without them (H5 break: must be caught)
//       ask      the case page's no_rate ask and the rate form read EXPECT (H6)
//       tenant1  D1 through the page: add the industry; generate, parse and accept the DRR entry; propose its lever
//       tenantchain  D1 through the page (Brad's ruling 2): "Classify as…", the capability's claim (W3) and the metric's
//                pack basis (W5) on the tenant's own account
//       w7gate   ruling 1: on a customer workspace whose outcome has no current hypothesis, W7 says so and offers no
//                produce; its control opens step 3; W7 sits after step 3 in the page
//       w7order  the break: W7 rendered before the hypothesis step must be caught
//       tenant2  D1 through the page: card 05 refuses a run with no hypothesis; state the hypothesis; produce and lock
//                run N; the case links; the case under the CFO lens, printed to PDF
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MODE = process.argv[2];
const E = process.env;
const APP = `http://localhost:${E.VITE_PORT}`;
const SHOTS = E.SHOTS;
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
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
const bodyHas = (s) => `document.body.textContent.includes(${JSON.stringify(s)})`;

async function shot(name, width = 1280) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(400);
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  console.log(`  shot  ${SHOTS}/${name}.png`);
}
const setField = (scopeExpr, labelText, value) => ev(`(()=>{
  const root=${scopeExpr}; if(!root) return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)})); if(!l) return 'no label';
  const el=l.querySelector('input,select,textarea'); if(!el) return 'no field';
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
const click0 = (scopeExpr, text, tag = 'button') => ev(`(()=>{const root=${scopeExpr}||document;const el=[...root.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}||e.textContent.includes(${JSON.stringify(text)}));if(!el||el.disabled)return false;el.click();return true})()`);
// A governed act shows what it will record and is sent only on "Confirm": the confirmation is read, printed word for
// word, and then confirmed, as the person would.
async function act(scopeExpr, text, label) {
  const r = await click0(scopeExpr, text);
  if (!r) { bad(`${label}: "${text}" not found or disabled`); return null; }
  await sleep(400);
  const said = await ev(`(()=>{const c=[...document.querySelectorAll('[data-testid=confirm-text]')].find(b=>b.offsetParent!==null);return c?c.textContent:null})()`);
  if (said !== null) {
    console.log(`  confirm ${label}: ${said}`);
    await ev(`(()=>{const y=[...document.querySelectorAll('[data-testid=form-confirm-yes]')].find(b=>b.offsetParent!==null);if(!y)return false;y.click();return true})()`);
  }
  return said ?? '';
}
// Under load the form re-renders after its fields are set; wait for the button to be there and enabled before acting
// (a fixed sleep raced at the final regression, 15 Nov 2026), so a missing or disabled button is still a failure.
const enabledButton = (scopeExpr, text) => `(()=>{const root=${scopeExpr}||document;const el=[...root.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}||e.textContent.includes(${JSON.stringify(text)}));return !!el&&!el.disabled})()`;
// After Page.reload the old document can still answer a wait, so a click may land on a page about to be replaced.
// Open a form by clicking until its own field is there (raced at the final regression, 15 Nov 2026).
async function openForm(scopeExpr, buttonText, readyExpr, label) {
  for (let i = 0; i < 25; i++) {
    if (await ev(readyExpr)) return true;
    await click0(scopeExpr, buttonText); await sleep(400);
  }
  const r = await ev(readyExpr); if (!r) bad(`${label}: "${buttonText}" did not open its form`); return r;
}
const card = (title) => `([...document.querySelectorAll('section')].find(s=>s.querySelector('h3')?.textContent.includes(${JSON.stringify(title)})))`;
const tickCaveats = (scopeExpr) => ev(`(()=>{const root=${scopeExpr};const cb=root&&root.querySelector('input[type=checkbox]');if(!cb)return false;if(!cb.checked)cb.click();return cb.checked})()`);
const pendingEntry = (name) => `([...(${card('Pending review')}||document).querySelectorAll('h4')].find(h=>h.textContent===${JSON.stringify(name)})?.parentElement)`;
const href = (testid) => ev(`(()=>{const a=document.querySelector('[data-testid=${testid}]');return a?a.getAttribute('href'):null})()`);

async function signIn(email) {
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`document.readyState === 'complete'`);
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`!!document.querySelector('input[type=password]')`);
  await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
  await click0('document', 'Sign in');
  return waitFor(bodyHas('Signed in as'));
}
const open = async (path, ready) => { await send('Page.navigate', { url: `${APP}${path}` }); return waitFor(ready, 20000); };

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
check(await signIn(E.S_EMAIL), `the steward signs in by session (${E.S_EMAIL})`);

async function runHeaderLinks(run, tag) {
  check(await open(`/runs/${run}`, `!!document.querySelector('[data-testid=run-page]')`), `${tag}: the run page loads (${run.slice(0, 8)})`);
  const a = await href('run-case-link'); const b = await href('run-case-link-cfo');
  return { a, b };
}

if (MODE === 'links') {
  const { a, b } = await runHeaderLinks(E.RUN, 'H5 control');
  check(a === `/runs/${E.RUN}/case` && b === `/runs/${E.RUN}/case?lens=cfo`, 'H5 control: the run page header links the value case and the case under the CFO lens', `${a} | ${b}`);
  check(await ev(`document.querySelector('[data-testid=run-case-links]').textContent.trim()`) === 'Value case · under the CFO lens', '  ...reading "Value case · under the CFO lens"');
  await shot('s1_run_header_links_1280');
  await shot('s1_run_header_links_390', 390);
  await click0(`document.querySelector('[data-testid=run-case-links]')`, 'under the CFO lens', 'a');
  check(await waitFor(`location.pathname === '/runs/${E.RUN}/case' && location.search === '?lens=cfo' && !!document.querySelector('[data-testid=asks-title]')`, 20000), '  ...the CFO-lens link opens the case under the CFO lens');
  // The runs table is the page's first table (the steward's batches below it have tables of their own).
  check(await open('/runs', `!!document.querySelector('table') && document.querySelector('table').querySelectorAll('tbody tr').length > 0`), 'the Runs list loads');
  const rows = await ev(`document.querySelector('table').querySelectorAll('tbody tr').length`);
  const linked = await ev(`[...document.querySelector('table').querySelectorAll('tbody tr')].filter(tr=>{const a=tr.querySelector('[data-testid=runs-case-link]'),b=tr.querySelector('[data-testid=runs-case-link-cfo]');return a&&b&&b.getAttribute('href')===a.getAttribute('href')+'?lens=cfo'}).length`);
  check(rows > 0 && linked === rows, `every row of the Runs list links its value case under both lenses (${linked} of ${rows})`);
  await click0(`document.querySelector('table tbody tr [data-testid=runs-case-links]')`, 'Value case', 'a');
  check(await waitFor(`/^\\/runs\\/[0-9a-f-]+\\/case$/.test(location.pathname) && location.search === ''`, 20000), '  ...a row\'s link opens its case, not the run (the row\'s own click does not also fire)');
  await open('/runs', `document.querySelectorAll('tbody tr').length > 0`);
  await shot('s1_runs_list_links_1280');
  check(await open(`/accounts/${E.TENANT_INST}`, `!!document.querySelector('[data-testid=engagement-runs]')`), "the tenant's own account page shows card 05's runs");
  const items = await ev(`document.querySelectorAll('[data-testid=engagement-run]').length`);
  const itemsLinked = await ev(`[...document.querySelectorAll('[data-testid=engagement-run]')].filter(li=>li.querySelector('[data-testid=engagement-run-case-link]')&&li.querySelector('[data-testid=engagement-run-case-link-cfo]')).length`);
  check(items > 0 && itemsLinked === items, `every run on the tenant's own account links its value case under both lenses (${itemsLinked} of ${items})`);
  await shot('s1_tenant_card05_links_1280');
} else if (MODE === 'nolink') {
  const { a, b } = await runHeaderLinks(E.RUN, 'H5 break');
  check(a === null && b === null, 'H5: the case links dropped from the run page header → caught: neither link is on the page', `${a} | ${b}`);
} else if (MODE === 'ask') {
  check(await open(`/runs/${E.RUN}/case`, `!!document.querySelector('[data-testid=asks-title]')`, 20000), `the value case loads (${E.RUN.slice(0, 8)})`);
  const ask = await ev(`(()=>{const a=document.querySelector('[data-testid=ask][data-code=no_rate]');return a?a.textContent:null})()`);
  const want = E.EXPECT;
  const good = ask !== null && ask.includes(want);
  if (E.BREAK === '1') check(!good, `H6: the percentage rule removed → caught: the no_rate ask no longer reads "${want}"`, ask ?? 'no ask');
  else check(good, `the no_rate ask reads "${want}"`, ask ?? 'no ask');
  if (E.BREAK !== '1') {
    await shot(`s1_case_ask_${E.TAG}_1280`);
    if (await click0('document', "Record the client's rate…")) {
      await sleep(400);
      const prov = await ev(`document.body.textContent`);
      check(prov.includes(`What ${want}`) || prov.includes(want), `  ...and the rate form's own sentence reads "${want}"`);
      await shot(`s1_case_rate_form_${E.TAG}_1280`);
    } else console.log('  info  no rate form on this case (not offered for this run)');
  }
} else if (MODE === 'tenant1') {
  // 1. Add the industry (B1's form on the packs page).
  check(await open('/packs', bodyHas('Add an industry…')), 'the packs page offers "Add an industry…"');
  await click0('document', 'Add an industry…');
  await sleep(300);
  const f = `document.body`;
  await setField(f, 'Name', E.IND_NAME); await setField(f, 'Slug', E.SLUG); await setField(f, 'Why it is added', E.IND_REASON);
  await sleep(200);
  await act(f, 'Add the industry', 'add the industry');
  // The confirmation quotes the name, so the body holds it before the POST lands: wait for the list's own link to the
  // new pack (rendered only from the re-read list), then for the row (raced at the final regression, 15 Nov 2026).
  check(await waitFor(`!!document.querySelector('a[href="/packs/${E.SLUG}"]')`), `the industry "${E.IND_NAME}" is on the packs page, linked to its pack`);
  let indRows = '0'; for (let i = 0; i < 50 && indRows !== '1'; i++) { indRows = psql(`SELECT count(*) FROM industries WHERE slug = '${E.SLUG}'`); if (indRows !== '1') await sleep(200); }
  check(indRows === '1', '  ...and in the database', `${indRows} rows`);
  await shot('s1_d1_1_industry_added_1280');
  // 2. Generate, run (a fixture response, here), parse and accept the DRR entry.
  check(await open(`/packs/${E.SLUG}`, bodyHas('Generate research prompt')), 'the new pack page offers "Generate research prompt"');
  await click0(card('Generate a research prompt'), 'Generate research prompt');
  check(await waitFor(bodyHas('Copy prompt')), '  ...a prompt is generated, with Copy');
  const P = psql(`SELECT p.id FROM research_prompts p JOIN industries i ON i.id = p.industry_id WHERE i.slug = '${E.SLUG}' ORDER BY p.generated_at DESC LIMIT 1`);
  console.log(`  info  prompt ${P}`);
  const response = JSON.stringify({ prompt_id: P, industry: E.SLUG, research_query: E.QUERY, query_as_executed: E.QUERY,
    research_tool: 'Rehearsal fixture (Gate A, not a research tool)', measures: [JSON.parse(E.DRR_JSON)] }, null, 2);
  await setField(card('Parse a research response'), "The agent's JSON response", response);
  await sleep(200);
  await click0(card('Parse a research response'), 'Parse');
  check(await waitFor(`(${card('Parse a research response')}).textContent.includes('1 result pending review')`), '  ...the response parses: 1 result pending review');
  const entry = pendingEntry(E.DRR_NAME);
  check(await waitFor(`!!${entry}`), `  ..."${E.DRR_NAME}" waits for review`);
  await setField(entry, 'Review note', E.ACCEPT_NOTE);
  await tickCaveats(entry);
  await sleep(200);
  await act(entry, 'Accept', 'accept the DRR entry');
  check(await waitFor(bodyHas(`${E.DRR_NAME}: accepted into the pack`)), '  ...accepted into the pack');
  await shot('s1_d1_2_entry_accepted_1280');
  // 3. The steward's lever on it.
  check(await waitFor(`!!${card('What you can claim against')} && (${card('What you can claim against')}).textContent.includes(${JSON.stringify(E.DRR_NAME)})`), '  ...the entry is on the pack, to claim against');
  await click0('document', 'Add a lever…');
  await sleep(300);
  const lf = `document.querySelector('[data-testid=add-lever]')`;
  await setField(lf, 'Lever name', E.LEVER_NAME); await setField(lf, 'Mechanism', E.LEVER_MECH);
  await setField(lf, 'Leading indicator', E.LEVER_IND); await setField(lf, 'Citation', E.LEVER_CIT);
  await sleep(200);
  await act(lf, 'Propose the lever', 'propose the lever');
  // The confirmation quotes the name, so wait for the mechanism, which only the re-read lever list shows, then the row.
  check(await waitFor(bodyHas(E.LEVER_MECH)), `the lever "${E.LEVER_NAME}" is on the pack entry, with its mechanism`);
  let levRows = '0'; for (let i = 0; i < 50 && levRows !== '1'; i++) { levRows = psql(`SELECT count(*) FROM value_levers WHERE name = '${E.LEVER_NAME}' AND deleted_at IS NULL`); if (levRows !== '1') await sleep(200); }
  check(levRows === '1', '  ...and in the database', `${levRows} rows`);
  await shot('s1_d1_3_lever_proposed_1280');
} else if (MODE === 'tenantchain') {
  const chain = `document.querySelector('[data-testid=tenant-chain]')`;
  check(await open(`/accounts/${E.TENANT_INST}`, `!!${chain}`, 20000), "the tenant's own account shows \"What its value case rests on\"");
  check(await ev(`document.body.textContent.includes('It is classified only to carry its own')`) && !(await ev(`document.body.textContent.includes('it never will be')`)), '  ...and the intake card says it is classified only to carry its own value case');
  await shot('s1_d1_c0_chain_before_1280');
  // "Classify as…" (the create form's fields, the existing route).
  await click0(chain, 'Classify as…'); await sleep(500);
  const cf = `(${chain}).querySelector('[data-testid=classify-account]')`;
  check(await waitFor(`!!${cf} && [...(${cf}).querySelectorAll('option')].some(o=>o.value===${JSON.stringify(E.SLUG)})`), `  ..."Classify as…" opens, offering ${E.SLUG}`);
  await setField(cf, 'Classify as', E.SLUG); await sleep(200);
  await setField(cf, 'Why this classification', E.CLASSIFY_NOTE); await sleep(200);
  await shot('s1_d1_c1_classify_form_1280');
  await act(cf, 'Classify', 'classify the account');
  check(await waitFor(`!!document.querySelector('[data-testid=tenant-classified]') && document.querySelector('[data-testid=tenant-classified]').textContent.includes(${JSON.stringify(E.IND_NAME)})`, 20000), `  ...classified as ${E.IND_NAME}, through the page`);
  // The capability's claim (the walk's W3 form).
  const claim = `document.querySelector('[data-testid=tenant-claim]')`;
  check(await waitFor(`!!${claim}`), '  ...the claim form is offered against the new pack');
  await setField(claim, 'Capability', E.CAP_ID); await setField(claim, 'Pack entry', E.ENTRY_ID); await sleep(300);
  check(await ev(`!!(${claim}).querySelector('[data-testid=claim-confounders]')`), '  ...showing the entry\'s confounders before the claim');
  await setField(claim, 'Claim (the mechanism)', E.CLAIM); await sleep(200);
  await shot('s1_d1_c2_claim_form_1280');
  await act(claim, 'Record the claim', 'the capability claims the entry');
  check(await waitFor(`!!document.querySelector('[data-testid=tenant-claims]') && document.querySelector('[data-testid=tenant-claims]').textContent.includes(${JSON.stringify(E.DRR_NAME)})`, 20000), '  ...the claim recorded, through the page');
  // The metric's pack basis (the walk's W5 form).
  const basis = `document.querySelector('[data-testid=tenant-basis][data-outcome="${E.OUTCOME}"]')`;
  check(await waitFor(`!!${basis} && !!(${basis}).querySelector('select')`), "  ...the basis form is offered for the outcome's metric");
  await setField(basis, 'Pack entry (claimed by this capability)', E.ENTRY_ID); await setField(basis, 'Basis note', E.BASIS_NOTE); await sleep(200);
  await act(basis, 'Set the basis', "the metric's pack basis");
  check(await waitFor(`!(${basis}).querySelector('select') && (${basis}).textContent.includes(${JSON.stringify(E.DRR_NAME)})`, 20000), '  ...the basis set, through the page');
  await shot('s1_d1_c3_chain_after_1280');
} else if (MODE === 'badge') {
  const row = `([...document.querySelectorAll('[data-testid=metric-row]')].find(li=>li.textContent.includes(${JSON.stringify(E.METRIC)})))`;
  check(await open(`/accounts/${E.TENANT_INST}`, `!!${row}`, 20000), `the tenant's own account lists the metric "${E.METRIC}"`);
  const badge = await ev(`(${row}).querySelector('[data-testid=confidence-badge],span:last-child')?.textContent ?? (${row}).lastElementChild.textContent`);
  const text = await ev(`(${row}).lastElementChild.textContent.trim()`);
  if (E.BREAK === '1') check(text === 'Not applicable', 'H8: the badge back to "Not applicable" whatever the basis → caught: it no longer reads "Pack basis"', `${text} (${badge})`);
  else { check(text === 'Pack basis', '  ...its badge reads "Pack basis": the metric rests on the DRR entry (D1)', text); await shot('s1_d1_metric_pack_basis_1280'); }
} else if (MODE === 'w7gate' || MODE === 'w7order') {
  const w7 = `document.querySelector('[data-testid=w7]')`, st3 = `document.querySelector('[data-testid=ws-step-3]')`;
  check(await open(`/accounts/${E.INST}`, `!!${w7} && !!${st3}`, 20000), `the customer workspace loads (${E.INST.slice(0, 8)})`);
  const after = await ev(`!!(${st3}.compareDocumentPosition(${w7}) & Node.DOCUMENT_POSITION_FOLLOWING) && !!${w7}.closest('[data-testid=ws-step-5]')`);
  if (MODE === 'w7order') check(!after, 'W7 rendered before the hypothesis step → caught: W7 no longer follows step 3 in the page');
  else {
    check(after, 'W7 (and W8) render in step 5, after "State a hypothesis…" (step 3), as the checklist orders them');
    check(await ev(`!!(${w7}).querySelector('[data-testid=w7-needs-hypothesis]')`), '  ...with no current hypothesis, W7 says so');
    check(await ev(`![...(${w7}).querySelectorAll('button')].some(b=>/Produce/.test(b.textContent))`), '  ...and offers no produce (no submit that would 409)');
    await ev(`(()=>{const s=document.querySelector('[data-testid=ws-step-5]');if(s&&s.dataset.open==='false')s.querySelector('[data-step-toggle]').click();return true})()`); await sleep(400);
    await shot('s1_w7_needs_hypothesis_1280');
    await click0(w7, 'State a hypothesis… in step 3');
    check(await waitFor(`${st3}.dataset.open === 'true'`), '  ...its control opens step 3, where the hypothesis is stated');
  }
} else if (MODE === 'tenant2') {
  const blk = `document.querySelector('[data-testid=engagement-hypotheses][data-engagement="${E.ENG}"]')`;
  const runs = `document.querySelector('[data-testid=engagement-runs][data-engagement="${E.ENG}"]')`;
  check(await open(`/accounts/${E.TENANT_INST}`, `!!${blk} && !!${runs}`, 20000), "the tenant's own account: card 05 shows the engagement's hypotheses and runs");
  check(await ev(`!!(${blk}).querySelector('[data-testid=no-hypothesis]')`), '  ...with no hypothesis yet, said so');
  // A run is refused, in words, while the outcome has no hypothesis.
  await click0(runs, 'Produce a new run…');
  await sleep(300);
  await setField(runs, 'Note (required)', 'Rehearsal: before any hypothesis.'); await setField(runs, 'Run source label (required)', 'gate_a_s1_refused');
  await sleep(200);
  await click0(runs, `Produce run ${E.NEXT}`);
  check(await waitFor(`(${runs}).textContent.includes('has no current hypothesis')`), '  ...card 05 refuses the run, in words: the outcome has no current hypothesis');
  await shot('s1_d1_4_run_refused_1280');
  await send('Page.reload'); await waitFor(`!!${blk}`, 20000);
  // State the hypothesis (the workspace's form and route).
  const hf = `(${blk}).querySelector('[data-testid=state-hypothesis]')`;
  await openForm(blk, 'State a hypothesis…', `!!(${blk}) && !!${hf}`, 'state a hypothesis');
  await setField(hf, 'Outcome (capability and metric)', E.OUTCOME); await sleep(200);
  await setField(hf, 'Lever', E.LEVER_ID); await setField(hf, 'Statement', E.STATEMENT);
  await setField(hf, 'Measured against', 'baseline'); await setField(hf, 'Due', E.DUE); await setField(hf, 'Conditions (words only)', E.CONDITIONS);
  await sleep(300);
  console.log(`  preview ${await ev(`(${hf}).querySelector('[data-testid=falsifier-preview] p').textContent`)}`);
  await shot('s1_d1_5_hypothesis_form_1280');
  await act(hf, 'State the hypothesis', 'state the hypothesis');
  check(await waitFor(`!!(${blk}).querySelector('[data-testid=hypothesis][data-verdict=open]')`), '  ...the hypothesis is stated, its verdict open');
  await shot('s1_d1_6_hypothesis_stated_1280');
  // Produce and lock the run.
  await send('Page.reload'); await waitFor(`!!${runs}`, 20000);
  await openForm(runs, 'Produce a new run…', `!!(${runs}) && [...(${runs}).querySelectorAll('label')].some(l=>l.textContent.includes('Run source label'))`, 'produce a new run');
  await setField(runs, 'Banner', E.BANNER); await setField(runs, 'Note (required)', E.RUN_NOTE); await setField(runs, 'Run source label (required)', E.RUN_SOURCE);
  await sleep(200);
  await waitFor(enabledButton(runs, `Produce run ${E.NEXT}`), 10000);
  await act(runs, `Produce run ${E.NEXT}`, 'produce the run');
  check(await waitFor(`!!(${runs}).querySelector('[data-testid=lock-run]')`, 20000), `  ...run ${E.NEXT} produced, not locked yet`);
  await setField(`(${runs}).querySelector('[data-testid=lock-run]')`, 'Lock reason', E.LOCK_REASON); await sleep(200);
  await waitFor(enabledButton(`(${runs}).querySelector('[data-testid=lock-run]')`, `Lock run ${E.NEXT}`), 10000);
  await act(`(${runs}).querySelector('[data-testid=lock-run]')`, `Lock run ${E.NEXT}`, 'lock the run');
  check(await waitFor(`[...(${runs}).querySelectorAll('[data-testid=engagement-run]')].some(li=>li.dataset.locked==='true'&&li.textContent.includes('Run ${E.NEXT}'))`, 20000), `  ...run ${E.NEXT} locked`);
  await shot('s1_d1_7_run_locked_1280');
  const run = psql(`SELECT id FROM value_runs WHERE engagement_id = '${E.ENG}' AND run_number = ${E.NEXT}`);
  console.log(`  run ${run}`);
  // The case, under the CFO lens, from the run's header; printed.
  const { a, b } = await runHeaderLinks(run, 'the new run');
  check(b === `/runs/${run}/case?lens=cfo`, `  ...its header links the case under the CFO lens`, `${a} | ${b}`);
  await click0(`document.querySelector('[data-testid=run-case-links]')`, 'under the CFO lens', 'a');
  check(await waitFor(`location.search === '?lens=cfo' && !!document.querySelector('[data-testid=asks-title]')`, 20000), '  ...the case opens under the CFO lens');
  await sleep(800);
  await shot('s1_d1_8_case_cfo_1280');
  await shot('s1_d1_8_case_cfo_390', 390);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/s1_d1_case_cfo.pdf`, Buffer.from(pdf.result.data, 'base64'));
  console.log(`  pdf   ${SHOTS}/s1_d1_case_cfo.pdf`);
}
ws.close();
process.exit(0);
