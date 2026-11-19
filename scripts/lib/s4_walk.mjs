// S4 (3.1; LVRF_PLAN §23, approved by Brad 19 Nov 2026) — the browser walk for scripts/verify_s4_form_confirmation.sh.
// Signs in by session as the steward and drives the forms THROUGH THE PAGE; THROWAWAY CLONE ONLY (rule 9).
//
//   node scripts/lib/s4_walk.mjs PART   PART is one of: record, warn, refused, supersede, basis, fullconfirm, all
//
//   record       "Record a source…": every field typed long (a 600-character, multi-line what-it-states with curly
//                quotes); the confirmation shows each field byte for byte with its count; Back keeps the fields;
//                Confirm records exactly what was shown (the stored row, field by field)
//   warn         D2: What it states equal to the quote is warned ("This summary repeats the quote word for word") and
//                may be confirmed; it records
//   refused      another pair identical (Where it came from = How it was read): the form says so and its button stays
//                disabled; no request is sent, no row is written
//   supersede    "Supersede…": a reason that repeats the old row's how-read is said at the form; then a reason of its
//                own: the confirmation shows the old row's what-it-states in full, every new field and the reason
//   basis        the pack basis: a note that repeats the capability's claim, then the entry's name, is said at the form;
//                then a note of its own: the confirmation shows the metric, the entry and the note in full; the basis
//                links its note (pack_basis_evidence_id)
//   fullconfirm  an existing confirmation (the opening of a citation) quotes a 600-character what-it-states in full
//
// Env: VITE_PORT, CDP_PORT, DB, S_EMAIL, PW, INST (the fixture account), METRIC, CLAIM, ENTRY, SHOTS.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PART = process.argv[2] ?? 'all';
const E = process.env;
const APP = `http://localhost:${E.VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);
const check = (c, m, d = '') => (c ? ok(m) : bad(`${m}${d ? ` — ${d}` : ''}`));
const psql = (sql) => execFileSync('psql', ['-X', '-At', '-d', E.DB, '-c', sql]).toString().replace(/\n$/, '');
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map(); const requests = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST') requests.push(m.params.request.url);
});
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
// The form as the person sees it: scrolled into view, the screenshot clipped to it.
async function shot(name, scope) {
  if (!E.SHOTS) return;
  const box = await ev(`(()=>{const el=${scope};if(!el)return null;el.scrollIntoView({block:'start'});const r=el.getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`);
  await sleep(200);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(box ? { clip: { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 6000), scale: 1 } } : {}) });
  writeFileSync(`${E.SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
}
// THROUGH THE PAGE: a control is clicked only when a person could see it (rendered, with a box), never by script alone.
const VISIBLE = `(el)=>!!el&&el.offsetParent!==null&&el.getClientRects().length>0`;
const setField = (scope, labelText, value) => ev(`(()=>{
  const root=${scope}; if(!root) return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)})); if(!l) return 'no label '+${JSON.stringify(labelText)};
  const el=l.querySelector('input,select,textarea'); if(!el) return 'no field';
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
const setTestid = (scope, testid, value) => ev(`(()=>{const root=${scope};const el=root&&root.querySelector('[data-testid=${testid}]');if(!el)return 'no '+${JSON.stringify(testid)};
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const button = (scope, text) => `(()=>{const root=${scope}||document;return [...root.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})||null})()`;
const click = async (scope, text) => ev(`(()=>{const b=${button(scope, text)};if(!(${VISIBLE})(b)||b.disabled)return false;b.click();return true})()`);
const enabled = (scope, text) => ev(`(()=>{const b=${button(scope, text)};return !!b&&!b.disabled})()`);
const fieldValues = (scope) => ev(`(()=>{const root=${scope};const c=root&&root.querySelector('[data-testid=confirm-text]');if(!c)return null;
  return {lead:c.querySelector('[data-testid=confirm-lead]')?.textContent??'',
    fields:[...c.querySelectorAll('[data-testid=confirm-field]')].map(f=>({label:f.getAttribute('data-label'),value:f.querySelector('[data-testid=confirm-value]').textContent,count:f.querySelector('[data-testid=confirm-count]').textContent})),
    warnings:[...c.querySelectorAll('[data-testid=confirm-warning]')].map(w=>w.textContent), text:c.textContent}})()`);
const unmetText = (scope) => ev(`(()=>{const root=${scope};return root?root.textContent:''})()`);

async function signIn() {
  await send('Page.navigate', { url: `${APP}/` }); await waitFor(`document.readyState === 'complete'`);
  await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
  await send('Page.navigate', { url: `${APP}/` }); await waitFor(`!!document.querySelector('input[type=password]')`);
  await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
  await click('document', 'Sign in');
  return waitFor(`document.body.textContent.includes('Signed in as')`);
}
const openAccount = async () => {
  await send('Page.navigate', { url: `${APP}/accounts/${E.INST}` });
  if (!(await waitFor(`!!document.querySelector('[data-testid=account-detail] summary')`, 20000))) return false;
  // As a person does: open "Account detail" by its summary, where the account's evidence (card 01c) is.
  await ev(`(()=>{const d=document.querySelector('[data-testid=account-detail]');if(!d.open)d.querySelector('summary').click();return d.open})()`);
  return waitFor(`(()=>{const a=document.querySelector('[data-testid=account-evidence]');return (${VISIBLE})(a)&&!a.textContent.includes('loading')})()`, 20000);
};
const yes = (scope) => ev(`(()=>{const r=${scope};const b=r&&r.querySelector('[data-testid=form-confirm-yes]');if(!(${VISIBLE})(b))return false;b.click();return true})()`);
const back = (scope) => ev(`(()=>{const r=${scope};const b=r&&r.querySelector('[data-testid=form-confirm-back]');if(!(${VISIBLE})(b))return false;b.click();return true})()`);
const clickTestid = (scope, testid) => ev(`(()=>{const r=${scope};const b=r&&r.querySelector('[data-testid=${testid}]');if(!(${VISIBLE})(b))return false;b.click();return true})()`);
const RS = `document.querySelector('[data-testid=record-source]')`;
async function openRecordSource() {
  for (let i = 0; i < 20; i++) {
    if (await ev(`!!${RS}`)) return true;
    await clickTestid(`document.querySelector('[data-testid=account-evidence]')`, 'record-source-open'); await sleep(300);
  }
  return false;
}
async function fillSource(scope, v) {
  const r = [
    await setTestid(scope, 'source-kind', v.kind), await setTestid(scope, 'source-summary', v.summary),
    await setTestid(scope, 'source-provenance', v.provenance), await setTestid(scope, 'source-reference', v.reference),
    await setTestid(scope, 'about-choice', 'account'), await setTestid(scope, 'evidence-form-choice', 'quote'),
  ];
  await sleep(200);
  r.push(await setField(scope, 'Quote (', v.quote), await setField(scope, 'How it was read', v.howRead));
  await sleep(300);
  return r.every((x) => x === true) ? true : r.find((x) => x !== true);
}
const NOW = Date.now();
const LONG = `Fixture (S4, ${NOW}): the account’s “dollar retention” statement, kept long on purpose.\n` +
  'It runs past every cut a confirmation used to make: '.repeat(10) + 'and ends here.';
const base = (tag) => ({
  kind: 'public_filing', summary: `${LONG} [${tag}]`,
  provenance: `S4 fixture source, ${tag}: a published filing (fictional, not a source)`,
  reference: `https://example.invalid/s4/${tag}/${NOW}`,
  quote: `Dollar retention was 98 percent in the period (${tag}).`,
  howRead: `Read from the fixture filing's key metrics section, first bullet (${tag}).`,
});
const rowBySummary = (summary) => psql(`SELECT id || '|' || kind || '|' || summary || '|' || provenance || '|' || coalesce(source_reference,'') || '|' || coalesce(quote_text,'') || '|' || coalesce(how_read,'') || '|' || evidence_form FROM evidence WHERE institution_id = ${lit(E.INST)} AND summary = ${lit(summary)} ORDER BY captured_at DESC LIMIT 1`);
const count = () => Number(psql(`SELECT count(*) FROM evidence WHERE institution_id = ${lit(E.INST)}`));

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
check(await signIn(), `the steward signs in by session (${E.S_EMAIL})`);
const parts = PART === 'all' ? ['record', 'warn', 'refused', 'supersede', 'basis', 'fullconfirm'] : [PART];

for (const part of parts) {
  if (part === 'record') {
    check(await openAccount() && await openRecordSource(), 'record: "Record a source…" opens on the account page');
    const v = base('record');
    check(await fillSource(RS, v) === true, 'record: every field typed (a 600-character, multi-line what-it-states with curly quotes)');
    const before = count(); requests.length = 0;
    check(await click(RS, 'Record the source'), 'record: "Record the source" shows the confirmation');
    await sleep(400);
    const c = await fieldValues(RS); await shot('s4_record_confirm', RS);
    const want = { 'What it states': v.summary, 'Where it came from': v.provenance, 'Citation, export ID or URL': v.reference, 'The quote': v.quote, 'How it was read': v.howRead, 'Kind': 'Public filing', 'What it rests on': 'A quote' };
    const got = Object.fromEntries((c?.fields ?? []).map((f) => [f.label, f]));
    const mism = Object.entries(want).filter(([k, w]) => got[k]?.value !== w).map(([k]) => k);
    check(c && mism.length === 0, 'record: the confirmation shows every field byte for byte as typed (no slice, no ellipsis)', mism.join(', '));
    const cnt = Object.entries(want).filter(([k, w]) => got[k] && got[k].count !== `(${[...w].length} characters)`).map(([k]) => k);
    check(c && cnt.length === 0 && got['What it states']?.count === `(${[...v.summary].length} characters)`, `record: each field carries its character count (What it states: ${[...v.summary].length})`, cnt.join(', '));
    check(c && got['What it is about']?.value.length > 0, `record: it names what the evidence is about ("${got['What it is about']?.value ?? ''}")`);
    check(requests.length === 0 && count() === before, 'record: nothing is sent before "Confirm"');
    await back(RS); await sleep(300);
    const kept = await ev(`(()=>{const r=${RS};return r.querySelector('[data-testid=source-summary]').value===${JSON.stringify(v.summary)}&&r.querySelector('[data-testid=source-provenance]').value===${JSON.stringify(v.provenance)}&&!r.querySelector('[data-testid=confirm-text]')})()`);
    check(kept, 'record: "Back" returns to the fields, unchanged');
    await click(RS, 'Record the source'); await sleep(300);
    await yes(RS);
    await waitFor(`!document.querySelector('[data-testid=record-source]')`, 10000);
    const row = rowBySummary(v.summary).split('|');
    check(row.length >= 8 && row[1] === 'public_filing' && row[2] === v.summary && row[3] === v.provenance && row[4] === v.reference && row[5] === v.quote && row[6] === v.howRead && row[7] === 'quote',
      'record: "Confirm" records exactly what was shown, field by field (the stored row)', row.slice(1).map((x) => x.slice(0, 30)).join(' | '));
    console.log(`  info  record: row ${row[0]?.slice(0, 8)}`);
  }
  if (part === 'warn') {
    check(await openAccount() && await openRecordSource(), 'warn: "Record a source…" opens');
    const v = base('warn'); v.summary = v.quote;
    await fillSource(RS, v);
    check(await click(RS, 'Record the source'), 'warn: What it states equal to the quote does not block the form (D2)');
    await sleep(400);
    const c = await fieldValues(RS); await shot('s4_warn_confirm', RS);
    check(c && c.warnings.some((w) => w.startsWith('This summary repeats the quote word for word')), 'warn: the confirmation warns "This summary repeats the quote word for word"', JSON.stringify(c?.warnings));
    const before = count();
    await yes(RS);
    await waitFor(`!document.querySelector('[data-testid=record-source]')`, 10000);
    check(count() === before + 1 && rowBySummary(v.quote) !== '', 'warn: "Confirm" records it: warned, not refused (route and database accept the pair)');
  }
  if (part === 'refused') {
    check(await openAccount() && await openRecordSource(), 'refused: "Record a source…" opens');
    const v = base('refused'); v.howRead = v.provenance;
    await fillSource(RS, v);
    const said = await unmetText(RS);
    check(said.includes('How it was read repeats Where it came from'), 'refused: another pair identical (Where it came from = How it was read) is said at the form');
    const before = count(); requests.length = 0;
    check(!(await enabled(RS, 'Record the source')), 'refused: its button is disabled, with the reason beside it');
    await click(RS, 'Record the source'); await sleep(500);
    check(requests.length === 0 && count() === before, 'refused: no request is sent and no row is written');
    await shot('s4_refused_form', RS);
  }
  if (part === 'supersede') {
    check(await openAccount(), 'supersede: the account page opens');
    const old = base('record');
    const rowId = psql(`SELECT id FROM evidence WHERE institution_id = ${lit(E.INST)} AND summary = ${lit(old.summary)} AND superseded_by_id IS NULL LIMIT 1`);
    const ROW = `document.querySelector('[data-testid=account-evidence-row][data-evidence="${rowId}"]')`;
    const SUP = `${ROW}?.querySelector('[data-testid=supersede]')`;
    for (let i = 0; i < 15 && !(await ev(`!!${SUP}`)); i++) { await clickTestid(ROW, 'supersede-open'); await sleep(300); }
    check(rowId !== '' && await ev(`!!${SUP}`), `supersede: "Supersede…" opens on row ${rowId.slice(0, 8)}`);
    const v = base('supersede');
    await fillSource(SUP, v);
    await setTestid(SUP, 'supersede-reason', old.howRead); await sleep(300);
    check((await unmetText(SUP)).includes('Why it is superseded repeats How it was read of the row it supersedes'), 'supersede: a reason that repeats the old row\'s How it was read is said at the form (the 15 Nov act)');
    check(!(await enabled(SUP, 'Supersede this evidence')), 'supersede: its button is disabled');
    const reason = 'S4 fixture: superseded to check the full confirmation, with a reason of its own.';
    await setTestid(SUP, 'supersede-reason', reason); await sleep(300);
    check(await click(SUP, 'Supersede this evidence'), 'supersede: a reason of its own shows the confirmation');
    await sleep(400);
    const c = await fieldValues(SUP); await shot('s4_supersede_confirm', SUP);
    const got = Object.fromEntries((c?.fields ?? []).map((f) => [f.label, f.value]));
    check(c && c.lead.includes(old.summary), "supersede: the lead quotes the old row's What it states in full");
    check(c && got['What it states'] === v.summary && got['How it was read'] === v.howRead && got['Why it is superseded'] === reason, 'supersede: every new field and the reason, in full');
    await yes(SUP);
    await waitFor(`!${SUP}`, 10000); await sleep(500);
    const act = psql(`SELECT reason FROM governance_acts WHERE act = 'supersede' AND subject_id = ${lit(rowId)} ORDER BY at DESC LIMIT 1`);
    check(act === reason && psql(`SELECT superseded_by_id IS NOT NULL FROM evidence WHERE id = ${lit(rowId)}`) === 't', 'supersede: "Confirm" supersedes it, the act carrying the reason as shown');
  }
  if (part === 'basis') {
    check(await openAccount(), 'basis: the account page opens');
    // As a person does: the walk is step 2; open it by its own "Show ▸" if it is closed.
    await ev(`(()=>{const t=document.querySelector('[data-testid=ws-step-2] [data-step-toggle]');if(t&&t.textContent.includes('Show'))t.click();return !!t})()`);
    const SCOPE = `(()=>{const f=[...document.querySelectorAll('form')].find(x=>[...x.querySelectorAll('button')].some(b=>b.textContent.trim()==='Set the basis'));return f&&(${VISIBLE})(f)?f.parentElement:null})()`;
    check(await waitFor(`!!${SCOPE}`, 15000), 'basis: the pack basis form is on the walk');
    const entryId = psql(`SELECT id FROM industry_measures WHERE name = ${lit(E.ENTRY)} AND deleted_at IS NULL LIMIT 1`);
    await setField(SCOPE, 'Pack entry', entryId);
    await setField(SCOPE, 'Basis note', E.CLAIM); await sleep(300);
    check((await unmetText(SCOPE)).includes("the basis note repeats the capability's claim on this entry"), "basis: a note that repeats the capability's claim is said at the form (eed11e02)");
    check(!(await enabled(SCOPE, 'Set the basis')), 'basis: its button is disabled');
    await setField(SCOPE, 'Basis note', `  ${E.ENTRY.toUpperCase()}  `); await sleep(300);
    check((await unmetText(SCOPE)).includes("the basis note repeats the entry's name"), "basis: a note that repeats the entry's name (in other case and spacing) is said at the form (D5)");
    const note = 'S4 fixture: the account reports this rate on the same definition and denominator as the pack entry.';
    await setField(SCOPE, 'Basis note', note); await sleep(300);
    check(await click(SCOPE, 'Set the basis'), 'basis: a note of its own shows the confirmation');
    await sleep(400);
    const c = await fieldValues(SCOPE); await shot('s4_basis_confirm', SCOPE);
    const got = Object.fromEntries((c?.fields ?? []).map((f) => [f.label, f.value]));
    check(c && got['Pack entry'] === E.ENTRY && got['Basis note'] === note && got['Metric'] === E.METRIC_NAME, 'basis: the confirmation shows the metric, the entry and the note, in full', JSON.stringify(got));
    await yes(SCOPE); await sleep(2000);
    const linked = psql(`SELECT e.summary FROM business_metrics m JOIN evidence e ON e.id = m.pack_basis_evidence_id WHERE m.id = ${lit(E.METRIC)}`);
    check(linked === note, 'basis: "Confirm" sets the basis, its note linked to the metric (pack_basis_evidence_id)', linked.slice(0, 60));
  }
  if (part === 'fullconfirm') {
    check(await openAccount(), 'fullconfirm: the account page opens');
    const rowId = psql(`SELECT id FROM evidence WHERE institution_id = ${lit(E.INST)} AND summary = ${lit(E.LONG_SUMMARY)} LIMIT 1`);
    const ROW = `document.querySelector('[data-testid=account-evidence-row][data-evidence="${rowId}"]')`;
    for (let i = 0; i < 15 && !(await ev(`!!${ROW}?.querySelector('[data-testid=open-source-supports]')`)); i++) {
      await clickTestid(ROW, 'open-source-open'); await sleep(300);
    }
    await setTestid(ROW, 'open-source-supports', 'false');
    await setTestid(ROW, 'open-source-why', 'S4 fixture: opened only to read its confirmation in full.'); await sleep(300);
    await click(ROW, 'Record the opening'); await sleep(400);
    const said = await ev(`(()=>{const r=${ROW};const c=r&&r.querySelector('[data-testid=confirm-text]');return c?c.textContent:null})()`);
    check(said !== null && said.includes(E.LONG_SUMMARY) && [...E.LONG_SUMMARY].length > 500, `fullconfirm: the opening's confirmation quotes the ${[...E.LONG_SUMMARY].length}-character What it states in full`);
  }
}
ws.close();
process.exit(0);
