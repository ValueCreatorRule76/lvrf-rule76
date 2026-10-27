// C3 — the browser walk: customer-side roles named from a source, the two steward batches (each confirmed,
// with its count), system-exercise marks on every surface and in print, credit errata, and headlines (the latest
// unmarked run, with its erratum line). Called by scripts/verify_c3.sh; prints "  PASS"/"  FAIL" lines it
// counts. The CDP preamble is corrections_walk.mjs's. Signs in by SESSION. POSTs are counted from the network.
//
//   node scripts/lib/c3_walk.mjs MODE VITE_PORT CDP_PORT SHOTS TOKEN   (the rest in env, per mode)
import { writeFileSync } from 'node:fs';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, TOKEN] = process.argv.slice(2);
const E = process.env;
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
const posts = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Network.requestWillBeSent' && m.params.request.method === 'POST') posts.push(new URL(m.params.request.url).pathname);
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
  await sleep(1200);
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
const printTo = async (name) => {
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/${name}`, Buffer.from(pdf.result.data, 'base64'));
};
const setField = (scopeExpr, labelText, value) => ev(`(()=>{
  const root=${scopeExpr}; if(!root) return 'no scope';
  const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(labelText)})); if(!l) return 'no label';
  const el=l.querySelector('input,select,textarea'); if(!el) return 'no field';
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
const submitIn = (scopeExpr, label) => ev(`(()=>{const el=[...${scopeExpr}.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(label)}));if(!el||el.disabled)return false;el.click();return true})()`);
const confirmIn = (scopeExpr) => ev(`(()=>{const b=${scopeExpr}.querySelector('[data-testid=form-confirm-yes]');if(!b)return false;b.click();return true})()`);
const runReady = `!!document.querySelector('[data-testid=run-page] h1')`;
const posted = (part) => posts.filter((p) => p.includes(part)).length;
const text = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(x=>x.textContent).join(' | ')`);

if (MODE === 'roles') {
  // The account page's roles card: the analyst of record offered but not eligible, with why; a grant with its source.
  check(await open(`/accounts/${E.INST}`, `!!document.querySelector('[data-testid=customer-roles]')`), 'the account page shows "Customer-side roles"');
  await ev(`document.querySelectorAll('details').forEach(d=>d.open=true)`); await sleep(400);
  if (E.GRANT_CHECK) {
    const granted = await text('[data-testid=customer-role]');
    check(granted.includes(`${E.OWNER_NAME}: metric owner per ${E.SOURCE}, named by ${E.STEWARD_NAME}`), 'a named role reads "<person>: metric owner per <source>, named by <steward>, <date>"', granted);
    check((await text('[data-testid=customer-role-revoked]')).includes('revoked by'), '  ...a revoked one stays shown, struck through, with who revoked it and why');
  }
  await ev(`document.querySelector('[data-testid=customer-role-open]').click()`); await sleep(400);
  const opts = await ev(`[...document.querySelectorAll('[data-testid=customer-role-form] label')].find(l=>l.textContent.includes('The person')).querySelectorAll('option')`) ;
  void opts;
  const analyst = await ev(`(()=>{const o=[...document.querySelectorAll('[data-testid=customer-role-form] option')].find(o=>o.textContent.includes(${JSON.stringify(E.ANALYST_NAME)}));return o?[o.disabled,o.textContent]:null})()`);
  if (E.ANALYST_CHECK) check(Array.isArray(analyst) && analyst[0] === true && /not eligible: an analyst of record or external, not the customer/.test(analyst[1]), 'the analyst of record is listed in the form, not eligible, saying why', JSON.stringify(analyst));
  await shot(`c3_roles_${E.GRANT_CHECK ? 'granted' : 'analyst'}_1280`, 1280);
}

if (MODE === 'errata_batch') {
  check(await open('/runs', `!!document.querySelector('[data-testid=credit-errata-count]')`), 'the Runs page shows "Errata the seals call for"');
  const count = await ev(`document.querySelector('[data-testid=credit-errata-count]').textContent`);
  check(count === `${E.COUNT} runs call for one.`, `the dry run counts ${E.COUNT}`, count);
  const list = await text('[data-testid=credit-erratum-candidate]');
  check(list.includes(E.EXPECT_TEXT), "  ...and lists the fixture's run with the points read from its seal", list.slice(0, 300));
  const f = `document.querySelector('[data-testid=credit-errata-batch]')`;
  await setField(f, 'Why they are recorded', 'Verification: C3, the errata the seals call for.'); await sleep(200);
  const before = posted('/api/errata/non-customer-credit');
  check(await submitIn(f, 'Record the'), 'the steward presses "Record the … errata"');
  await sleep(600);
  check(posted('/api/errata/non-customer-credit') - before === 0, '  ...nothing is sent before the confirmation');
  const conf = await ev(`${f}.querySelector('[data-testid=form-confirm]')?.textContent ?? ''`);
  check(conf.includes(`Record ${E.COUNT} errata, one beside each run listed.`), '  ...the confirmation states the count', conf);
  await shot('c3_errata_batch_confirm_1280', 1280);
  await confirmIn(f);
  check(await waitFor(`document.querySelector('[data-testid=credit-errata-recorded]')?.textContent === 'Recorded ${E.COUNT}.'`), `on "Confirm", "Recorded ${E.COUNT}."`);
  check(posted('/api/errata/non-customer-credit') - before === 1, '  ...one request sent');
}

if (MODE === 'marks_batch') {
  check(await open('/runs', `!!document.querySelector('[data-testid=system-exercise-candidates]')`), 'the Runs page shows "Mark system exercises"');
  check(await ev(`[...document.querySelectorAll('[data-testid=system-exercise-candidate] input')].every(i=>!i.checked)`), 'nothing is ticked for the steward');
  const items = E.ITEMS.split(',');
  for (const k of items) {
    const note = await ev(`document.querySelector('[data-testid=system-exercise-candidate][data-subject="${k}"]')?.textContent ?? ''`);
    check(note.includes(`“${E['NOTE_' + k.split('|')[0]]}`), `  ...${k.split('|')[0]} listed with its own note, quoted`, note.slice(0, 160));
    await ev(`document.querySelector('[data-testid=system-exercise-candidate][data-subject="${k}"] input').click()`); await sleep(150);
  }
  const f = `document.querySelector('[data-testid=system-exercise-batch]')`;
  check((await ev(`${f}.querySelector('[data-testid=system-exercise-ticked]').textContent`)) === `${items.length} ticked.`, `"${items.length} ticked."`);
  const before = posted('/api/system-exercise/marks');
  check(await submitIn(f, 'Mark the ticked items'), 'the steward presses "Mark the ticked items"');
  await sleep(600);
  check(posted('/api/system-exercise/marks') - before === 0, '  ...nothing is sent before the confirmation');
  const conf = await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(conf.startsWith(`Mark ${items.length} items as a system exercise:`), '  ...the confirmation states the count and names each', conf.slice(0, 200));
  await shot('c3_marks_batch_confirm_1280', 1280);
  await confirmIn(f);
  check(await waitFor(`${f}.textContent.includes('Marked ${items.length}.')`), `on "Confirm", "Marked ${items.length}."`);
  check(posted('/api/system-exercise/marks') - before === 1, '  ...one request sent');
}

if (MODE === 'run_marked') {
  for (const width of [1280, 390]) {
    check(await open(`/runs/${E.RUN}`, runReady, width), `the marked run @${width} opens`);
    const b = await ev(`[...document.querySelectorAll('[data-testid=banner-system-exercise]')].find(x=>x.offsetParent!==null)?.textContent ?? ''`);
    check(b.startsWith('SYSTEM EXERCISE — entered to exercise the system, not as case evidence. Marked by ') && b.includes("its own note reads: '"), `@${width}: the banner says so, who marked it, when, and quotes its note`, b.slice(0, 200));
    check((await ev('document.documentElement.scrollWidth')) <= width, `@${width}: no sideways scroll`);
    await shot(`c3_run_marked_${width}`, width);
  }
  await open(`/runs/${E.RUN}`, runReady);
  await printTo(E.PDF);
}

if (MODE === 'run_credit') {
  check(await open(`/runs/${E.RUN}`, runReady), 'the credited run opens');
  const b = await ev(`[...document.querySelectorAll('[data-testid=banner-erratum]')].find(x=>x.offsetParent!==null)?.textContent ?? ''`);
  check(b.includes(E.EXPECT_TEXT) && b.includes('The sealed record below is unchanged.') && !/Recomputed under model/.test(b), 'its erratum states the points from the seal, that the score stands, and recomputes nothing', b.slice(-320));
  await shot('c3_run_credit_1280', 1280);
  await printTo(E.PDF);
}

if (MODE === 'run_roles') {
  check(await open(`/runs/${E.RUN}`, runReady), 'the 1.0.1 run opens');
  await ev(`document.querySelectorAll('[data-testid$=-toggle][aria-expanded=false]').forEach(b=>b.click())`); await sleep(500);
  const body = await ev('document.body.innerText');
  check(body.includes(`attested by ${E.OWNER_NAME} (metric owner per ${E.SOURCE}, named by ${E.STEWARD_NAME}`), 'the baseline factor\'s credit shows the role and its source', '');
  check(body.includes(`Committed by ${E.OWNER_NAME} (metric owner per ${E.SOURCE}, named by ${E.STEWARD_NAME}`), "the committer factor's credit shows the role and its source");
  if (E.MARKED_SUMMARY) {
    const m = await ev(`[...document.querySelectorAll('[data-testid=sealed-item]')].find(li=>li.textContent.includes(${JSON.stringify(E.MARKED_SUMMARY)}))?.querySelector('[data-testid=system-exercise]')?.textContent ?? ''`);
    check(m.startsWith('SYSTEM EXERCISE — marked by ') && m.includes("its own note reads: '"), "the sealed item from a marked evidence row shows its mark", m.slice(0, 160));
  }
  await shot('c3_run_roles_1280', 1280);
}

if (MODE === 'headlines') {
  // POV, account page and book: a headline from a run with a current erratum shows the line; a marked run is never the headline.
  check(await open(`/accounts/${E.INST1}/pov`, `!!document.querySelector('[data-testid=pov] h1')`), 'the POV of the credited account opens');
  const h = await ev(`document.querySelector('[data-testid=confidence] [data-testid=headline-erratum]')?.textContent ?? ''`);
  check(h === E.LINE, `the POV's headline shows "${E.LINE}"`, h);
  await shot('c3_pov_headline_1280', 1280);
  check(await open(`/accounts/${E.INST1}`, `!!document.querySelector('[data-testid=headline-erratum]')`), 'the account page shows it beside the headline');
  check((await ev(`document.querySelector('[data-testid=headline-erratum]').textContent`)) === E.LINE, `  ..."${E.LINE}"`);
  check(await open('/', `!!document.querySelector('[data-testid=row-engagement]')`), 'the book opens');
  await waitFor(`[...document.querySelectorAll('[data-testid=headline-erratum]')].some(x=>x.textContent===${JSON.stringify(E.LINE)})`, 15000);
  check(await ev(`[...document.querySelectorAll('[data-testid=headline-erratum]')].some(x=>x.textContent===${JSON.stringify(E.LINE)})`), '  ...and the book, beside the engagement\'s run');
  await waitFor(`!!document.querySelector('[data-testid=book-scope]')`, 15000);
  const rowsE = await ev(`[...document.querySelectorAll('[data-testid=book-member-erratum]')].map(x=>x.textContent)`);
  check(rowsE.includes(E.LINE), `the book's weakest-link table shows "${E.LINE}" beside the credited engagement's score`, JSON.stringify(rowsE));
  await shot('c3_book_1280', 1280);
  check(await open(`/accounts/${E.INST2}/pov`, `!!document.querySelector('[data-testid=pov] h1')`), 'the POV of the account with a marked run opens');
  const runs = await ev(`[...document.querySelectorAll('[data-testid=confidence] p')].map(p=>p.textContent).join(' | ')`);
  check(runs.includes(`run ${E.HEADLINE_RUN},`) && !runs.includes(`run ${E.MARKED_RUN},`), `its headline is run ${E.HEADLINE_RUN}, not the marked run ${E.MARKED_RUN}`, runs);
  const listed = await text('[data-testid=locked-run]');
  void listed;
  await ev(`[...document.querySelectorAll('[data-testid=locked-runs] button')].forEach(b=>b.click())`); await sleep(300);
  check(await ev(`[...document.querySelectorAll('[data-testid=locked-run]')].some(li=>li.textContent.includes('run ${E.MARKED_RUN}') && !!li.querySelector('[data-testid=system-exercise]'))`), '  ...the marked run stays listed, marked');
  await shot('c3_pov_marks_1280', 1280);
}

if (MODE === 'lineage') {
  check(await open(`/lineage/value_outcomes/${E.O_ROLE}?figure=baseline`, `!!document.querySelector('[data-testid=lineage-steps]')`), "the role-holder's baseline lineage opens");
  const a = await text('[data-testid=lineage-attester-role]');
  check(a.includes(`Attested by ${E.OWNER_NAME}: metric owner per ${E.SOURCE}, named by ${E.STEWARD_NAME}`), '  ...its attested evidence shows the role and its source', a);
  check(await open(`/lineage/value_outcomes/${E.O_ANALYST}?figure=baseline`, `!!document.querySelector('[data-testid=lineage-steps]')`), "the analyst's baseline lineage opens");
  const b = await text('[data-testid=lineage-attester-role]');
  check(b.includes(`Attested by ${E.ANALYST_NAME}, who is not customer-side (no customer-side role named from a source): no credit under the C3 rule.`), '  ...its attested evidence says the attester is not customer-side, and why', b);
  await shot('c3_lineage_analyst_1280', 1280);
}

ws.close();
process.exit(0);
