// Q4h — the browser walk of the account page's Research section (A1–A5),
// over the Chrome DevTools Protocol. Called by verify_account_research.sh;
// prints "  PASS"/"  FAIL" lines it counts, and exits non-zero if it crashes
// (the script counts that as a failure too).
//
//   node scripts/lib/account_research_walk.mjs MODE VITE_PORT CDP_PORT SHOTS DB INST_ID EMAIL PW
//
// MODE: walk | break-h1 | create-link
// Signs in by SESSION through the real sign-in form — never the header.
// A fictional account: never a real company's figures in a test.

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, DB, INST, EMAIL, PW] = process.argv.slice(2);
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
const has = (scope, s) => `((${scope})?.textContent || '').includes(${JSON.stringify(s)})`;
const card = (title) => `([...document.querySelectorAll('section')].find(s=>s.querySelector('h3')?.textContent.includes(${JSON.stringify(title)})))`;
const field = (heading) => `([...document.querySelectorAll('[data-testid=pending-field]')].find(d=>d.querySelector('h4')?.textContent===${JSON.stringify(heading)}))`;
const setField = (scope, label, value) => ev(`(()=>{const root=${scope};if(!root)return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!l)return 'no label';
  const el=l.querySelector('input,textarea');const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const click = (scope, text) => ev(`(()=>{const el=[...((${scope})||document).querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!el)return false;el.click();return true})()`);
const disabled = (scope, text) => ev(`(()=>{const el=[...((${scope})||document).querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});return el?el.disabled:null})()`);
const tick = (scope, label) => ev(`(()=>{const l=[...(${scope}).querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));const cb=l&&l.querySelector('input[type=checkbox]');if(!cb)return false;if(!cb.checked)cb.click();return cb.checked})()`);
async function shot(name, selector) {
  // UX-1 slice 1: a screenshot's target may sit in a folded workspace step or
  // the closed "Account detail". Open them first, as a reader would (the
  // step's own toggle; the <details> element), so the shot shows the target.
  if (selector) {
    const opened = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return 0;let n=0;for(let p=el;p;p=p.parentElement){if(p.tagName==='DETAILS'&&!p.open){p.open=true;n++;}if(p.dataset&&p.dataset.open==='false'){p.querySelector('[data-step-toggle]')?.click();n++;}}return n})()`);
    if (opened) await sleep(300);
  }
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const rect = selector ? await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`) : null;
  const r = await send('Page.captureScreenshot', { format: 'png', ...(rect ? { clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }, captureBeyondViewport: true } : {}) });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  console.log(`  shot  ${SHOTS}/${name}.png`);
}
async function signIn() {
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`document.readyState === 'complete'`);
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor(`!!document.querySelector('input[type=password]')`);
  await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(EMAIL)});set('input[type=password]',${JSON.stringify(PW)});return true})()`);
  await click('document', 'Sign in');
  return waitFor(`document.body.textContent.includes('Signed in as')`);
}
async function openAccount() {
  await send('Page.navigate', { url: `${APP}/accounts/${INST}` });
  return waitFor(`!!document.querySelector('[data-testid=account-research]') && document.body.textContent.includes('Generate research prompt')`);
}
const latestPrompt = () => psql(`SELECT id FROM research_prompts WHERE institution_id = '${INST}' ORDER BY generated_at DESC LIMIT 1`);
async function parse(obj) {
  // After a recorded parse the form stays done until "Parse another response".
  if (await click(card('Parse a research response'), 'Parse another response')) await sleep(300);
  await setField(card('Parse a research response'), "The agent's JSON response", JSON.stringify(obj, null, 2));
  await sleep(200);
  await click(card('Parse a research response'), 'Parse');
}
const ENTITY = { legal_name: 'Walk Fictional Filer Inc.', identifier_type: 'sec_cik', identifier: '0000777001', registry_jurisdiction: null,
  source_kind: 'public_filing', citation: 'EDGAR company record, CIK 0000777001 (verification fixture, not a source)', caveats: [] };
const env = (prompt, extra) => ({ prompt_id: prompt, institution: 'Walk Fictional Filer', research_query: 'Walk verification query',
  query_as_executed: 'As asked', research_tool: 'Walk verification tool', ai_sourced: true, ...extra });

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

check(await signIn(), 'signs in by session (an authorized user, not the steward)');

if (MODE === 'create-link') {
  // After Create account succeeds, "Open account →" leads to the new account.
  const NAME = `Walk Link Account ${Date.now()}`;
  await waitFor(`document.body.textContent.includes('Create account')`);
  await setField(card('Create account'), 'Account name', NAME);
  await sleep(200);
  await click(card('Create account'), 'Submit');
  check(await waitFor(`!!document.querySelector('[data-testid=open-account]')`), 'Create account: the Recorded block offers "Open account →"');
  const id = psql(`SELECT id FROM institutions WHERE name = '${NAME}'`);
  check(await ev(`document.querySelector('[data-testid=open-account]').getAttribute('href')`) === `/accounts/${id}`, '  ...linking to /accounts/<the new institution_id>');
  await ev(`document.querySelector('[data-testid=open-account]').click()`);
  check(await waitFor(`location.pathname === '/accounts/${id}' && !!document.querySelector('[data-testid=account-research]')`), '  ...and it opens the new account, with its Research section');
  ws.close();
  process.exit(0);
}
check(await openAccount(), 'the account page shows the Research section');

if (MODE === 'walk') {
  check(await ev(has(card('Entity and disclosure regime'), 'Not pinned: research the entity first')), 'A1: "Not pinned: research the entity first"');
  check(await ev(has(card('Generate a research prompt'), 'Phase: ENTITY FIRST')), 'A2: the phase is ENTITY FIRST');
  await click(card('Generate a research prompt'), 'Generate research prompt');
  check(await waitFor(`document.body.textContent.includes('Copy prompt')`), 'generate: the entity-phase prompt appears with Copy');
  const P1 = latestPrompt();
  // An entity-phase response that carries facts: refused, and named.
  await parse(env(P1, { entity: ENTITY, disclosure_regime: { value: 'public_filer', basis: 'Files a 10-K.', as_of: '2024-09-30', source_kind: 'public_filing', citation: 'EDGAR filing index (fixture)', caveats: [] },
    facts: [{ kind: 'revenue', value: 1, unit: 'USD', as_of: '2024-09-30', period: 'FY2024', source_kind: 'public_filing', citation: 'x', quote: 'x', caveats: [] }], not_found: [] }));
  check(await waitFor(has(card('Parse a research response'), 'facts are refused until the entity is pinned')), 'A4: facts in an entity-phase response are refused, named');
  await shot('q4h_1_entity_phase_refused', '#account-parse-card');
  await parse(env(P1, { entity: ENTITY, disclosure_regime: { value: 'public_filer', basis: 'Files a 10-K with the SEC.', as_of: '2024-09-30', source_kind: 'public_filing', citation: 'EDGAR filing index (fixture)', caveats: [] }, facts: [], not_found: [] }));
  check(await waitFor(has(card('Parse a research response'), '2 results pending review')), 'A4: the entity-phase response parses into 2 pending fields');
  await waitFor(`!!${field('Entity')}`);
  await setField(field('Entity'), 'Review note', 'Verification: the CIK matches the EDGAR record.');
  await sleep(200);
  check((await disabled(field('Entity'), 'Accept')) === true, 'A5: Accept is disabled until both ticks (caveats read; citation opened)');
  await tick(field('Entity'), "I have read the research's caveats");
  await sleep(150);
  check((await disabled(field('Entity'), 'Accept')) === true, '  ...one tick is not enough');
  await tick(field('Entity'), 'I opened the citation');
  await sleep(150);
  check((await disabled(field('Entity'), 'Accept')) === false, '  ...both ticks: Accept enabled');
  await shot('q4h_2_entity_review', '#account-pending-card');
  await click(field('Entity'), 'Accept');
  check(await waitFor(`!!document.querySelector('[data-testid=pinned-entity]')`), 'A1: the entity is pinned, refreshed in place');
  check(psql(`SELECT e.legal_name || '|' || ev.citation_resolved || '|' || ev.kind FROM institution_entities e JOIN evidence ev ON ev.id = e.evidence_id WHERE e.institution_id = '${INST}'`) === 'Walk Fictional Filer Inc.|true|public_filing',
    'database: the entity, its evidence public_filing, citation resolved by the reviewer');
  await setField(field('Disclosure regime'), 'Review note', 'Verification: files a 10-K.');
  await tick(field('Disclosure regime'), "I have read the research's caveats"); await tick(field('Disclosure regime'), 'I opened the citation');
  await sleep(200);
  await click(field('Disclosure regime'), 'Accept');
  check(await waitFor(`!!document.querySelector('[data-testid=regime]') && document.querySelector('[data-testid=regime]').textContent.includes('Public filer')`), 'A1: the regime is recorded: Public filer');
  check(await waitFor(has(card('Generate a research prompt'), 'Phase: FACTS')), 'A2: the phase is now FACTS');
  // After a success the button stays disabled until "Generate another".
  await click(card('Generate a research prompt'), 'Generate another');
  await sleep(300);
  await click(card('Generate a research prompt'), 'Generate research prompt');
  // Wait on A2's own text: "Copy prompt" also appears in A3's prompt list.
  check(await waitFor(has(card('Generate a research prompt'), 'ENTITY (pinned): Walk Fictional Filer Inc. — sec_cik 0000777001')), 'the facts prompt names the pinned entity');
  const P2 = latestPrompt();
  // A facts response about another entity: refused, naming both.
  await parse(env(P2, { entity: { ...ENTITY, legal_name: 'Walk Namesake Holdings', identifier: '0000777999' }, facts: [], not_found: [{ kind: 'system', reason: 'x' }] }));
  check(await waitFor(has(card('Parse a research response'), "this response is about Walk Namesake Holdings, sec_cik 0000777999; the account's entity is Walk Fictional Filer Inc., sec_cik 0000777001")),
    'A4: a response about another entity is refused, naming both');
  await shot('q4h_3_entity_mismatch', '#account-parse-card');
  await parse(env(P2, { entity: ENTITY,
    facts: [{ kind: 'revenue', value: 4321.5, unit: 'USD', as_of: '2024-09-30', period: 'fiscal year ended 30 September 2024',
      source_kind: 'public_filing', citation: 'Form 10-K FY2024, Item 8 (fixture)', quote: 'Net sales were $4,321.5 million.', caveats: ['Figure in millions; confirm the scale in Item 8.'] }],
    not_found: [{ kind: 'system', reason: 'Not disclosed in filings.' }] }));
  check(await waitFor(has(card('Parse a research response'), '2 results pending review')), 'A4: the facts response parses (a fact and a not-found)');
  await waitFor(`!!${field('Revenue')}`);
  const rev = await ev(`(${field('Revenue')}).textContent`);
  check(rev.includes('As of (period end)2024-09-30') && rev.includes('Period, as statedfiscal year ended 30 September 2024'), 'A5 (L6): as_of shown beside the period as stated');
  check(rev.includes('Figure in millions; confirm the scale in Item 8.'), "A5: the research's stated caveat is shown");
  await shot('q4h_4_fact_review', '#account-pending-card');
  await setField(field('Revenue'), 'Review note', 'Verification: matches Item 8.');
  await tick(field('Revenue'), "I have read the research's caveats"); await tick(field('Revenue'), 'I opened the citation');
  await sleep(200);
  await click(field('Revenue'), 'Accept');
  check(await waitFor(`!${field('Revenue')}`), 'the revenue is accepted');
  check(psql(`SELECT f.value_numeric::text || '|' || f.unit || '|' || f.as_of || '|' || ev.citation_resolved FROM institution_facts f JOIN evidence ev ON ev.id = f.evidence_id WHERE f.institution_id = '${INST}' AND f.kind = 'revenue'`) === '4321.5|USD|2024-09-30|true',
    'database: the fact with as_of = the period end, its evidence citation resolved');
  // Q4i: the facts card shows the citation opened, apart from Unverified.
  check(await waitFor(`[...document.querySelectorAll('[data-testid=citation-opened]')].some(e=>e.textContent.startsWith('Citation opened by Authorized X (verification), 20') && e.closest('li').textContent.includes('Unverified'))`),
    'Q4i: the revenue fact card reads "Citation opened by <reviewer>, <date>", beside its Unverified badge');
  await shot('q4i_citation_opened', '[data-testid=citation-opened]');
  await ev(`(()=>{const e=document.querySelector('[data-testid=citation-opened]');e.closest('li').setAttribute('data-shot','fact');return true})()`);
  await shot('q4i_fact_card', '[data-shot=fact]');
  await setField(field('System — not found'), 'Review note', 'Verification: not in the filings.');
  await sleep(200);
  check((await disabled(field('System — not found'), 'Accept as not found')) === false, 'a not-found needs no citation tick');
  await click(field('System — not found'), 'Accept as not found');
  check(await waitFor(has(`document.querySelector('[data-testid=not-found]')`, 'Not disclosed in filings.')), 'A1: "Not found by research" lists it, with its reason');
  await shot('q4h_5_account_after', '[data-testid=account-research]');
  // Correct the entity (Brad, 12 Oct): the facts accepted under the old one
  // are listed for review, unchanged.
  const a1 = card('Entity and disclosure regime');
  await click(a1, 'Correct the entity…');
  await waitFor(`!!document.querySelector('[data-testid=correct-entity]')`);
  await setField(a1, 'Legal name', 'Walk Fictional Holdings Inc.');
  await setField(a1, 'Identifier', '0000777002');
  await setField(a1, 'Where it is established', 'EDGAR company record, CIK 0000777002 (fixture, not a source)');
  await setField(a1, 'Why the pinned entity is wrong', 'Verification: the filer is the holding company.');
  await sleep(300);
  await click(a1, 'Correct the entity');
  check(await waitFor(`!!document.querySelector('[data-testid=under-previous-entity]')`), 'A1: correcting the entity shows "Accepted under the previous entity: review"');
  const block = await ev(`document.querySelector('[data-testid=under-previous-entity]').textContent`);
  check(block.includes('Revenue:') && block.includes('under Walk Fictional Filer Inc., sec_cik 0000777001'), '  ...listing the revenue (and the regime) under the previous entity, by name and CIK', block.slice(0, 200));
  check(await ev(`document.querySelector('[data-testid=pinned-entity]').textContent.includes('Walk Fictional Holdings Inc.')`), '  ...and the pinned entity is the corrected one');
  check(psql(`SELECT count(*) FROM institution_facts WHERE institution_id = '${INST}' AND superseded_by_id IS NULL AND deleted_at IS NULL AND kind = 'revenue'`) === '1', '  ...the revenue fact itself is unchanged and current');
  check(!(await ev(has(card('Generate a research prompt'), 'Walk Fictional Filer Inc. — sec_cik 0000777001'))), '  ...A2 no longer shows a prompt naming the previous entity');
  await shot('q4h_6_entity_corrected', '[data-testid=account-research]');
} else if (MODE === 'break-h1') {
  // With the client's ticks removed, a found field is submitted without
  // citation_opened: the server still refuses it (H1).
  await waitFor(`!!document.querySelector('[data-testid=pending-field]')`);
  const name = await ev(`document.querySelector('[data-testid=pending-field] h4').textContent`);
  await setField(field(name), 'Review note', 'Verification: accept without opening the citation.');
  await sleep(200);
  check((await disabled(field(name), 'Accept')) === false, 'B-H1: with the client ticks removed, Accept is enabled');
  await click(field(name), 'Accept');
  check(await waitFor(has(field(name), 'citation_opened must be true')), "B-H1: the server still refuses: \"citation_opened must be true\" — the server's rule, not only the tick");
}
ws.close();
process.exit(0);
