// L41 + L47 — the browser walk: Record a source, open it, name the role from it; the forms no longer ask
// whether evidence is verified. Called by scripts/verify_evidence_final.sh; prints "  PASS"/"  FAIL" lines it counts.
//
//   node scripts/lib/l41_walk.mjs MODE VITE_PORT CDP_PORT SHOTS TOKEN   (the rest in env)
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
/** One element, whole, however far down the page it sits. */
const shotOf = async (name, selector, width) => {
  await viewport(width); await sleep(400);
  const box = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:0,y:r.top+scrollY,width:innerWidth,height:r.height}})()`);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 } });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
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


if (MODE === 'source') {
  check(await open(`/accounts/${E.WALK_INST}`, `!!document.querySelector('[data-testid=account-detail]')`), 'the account page');
  await ev(`document.querySelector('[data-testid=account-detail]').open = true`); await sleep(800);
  const card = `document.querySelector('[data-testid=account-evidence]')`;
  check(await waitFor(`!!${card}`), "the account's evidence card");
  check(await ev(`(()=>{const b=${card}.querySelector('[data-testid=record-source-open]');if(!b)return false;b.click();return true})()`), '"Record a source…" opens');
  await sleep(500);
  const f = `${card}.querySelector('[data-testid=record-source]')`;
  check(!(await ev(`!!${f}.querySelector('[data-testid=source-verified]')`)), '  ...it does not ask whether the source is verified');
  check((await ev(`${f}.querySelector('[data-testid=about-choice]').value`)) === '', '  ...what it is about starts unchosen (L52)');
  await setField(f, 'What it is about', 'account');
  await setField(f, 'Kind', 'artifact');
  await setField(f, 'What it states', 'Org chart naming the walk owner as metric owner (fixture)');
  await setField(f, 'Where it came from', 'Fixture org chart, Q3 (not a source)');
  await setField(f, 'What it rests on', 'quote'); await sleep(300);
  await setField(f, 'Quote', 'Walk owner, metric owner.');
  await setField(f, 'How it was read', 'Read from the fixture org chart, top box.'); await sleep(300);
  await shot('l41_record_source_1280', 1280);
  const before = posted(`/institutions/${E.WALK_INST}/evidence`);
  check(await submitIn(f, 'Record the source'), 'the source is submitted');
  await sleep(500);
  if (await ev(`!!${f}?.querySelector('[data-testid=form-confirm-yes]')`)) await confirmIn(f);
  check(await waitFor(`[...document.querySelectorAll('[data-testid=account-evidence-row]')].some(r=>r.textContent.includes('Org chart naming the walk owner'))`), '  ...it appears on the card');
  check(posted(`/institutions/${E.WALK_INST}/evidence`) - before === 1, '  ...one request');
  const row = `[...document.querySelectorAll('[data-testid=account-evidence-row]')].find(r=>r.textContent.includes('Org chart naming the walk owner'))`;
  check((await ev(`${row}.textContent`)).includes('Not source-verified'), '  ...unverified');
  check((await ev(`${row}.querySelector('[data-testid=evidence-about]').textContent`)).startsWith('about '), '  ...about the account');
  check(await ev(`(()=>{const b=${row}.querySelector('[data-testid=open-source-open]');if(!b)return false;b.click();return true})()`), '"Record that you opened the source…" opens');
  await sleep(400);
  const o = `${row}.querySelector('[data-testid=open-source]')`;
  await setField(o, 'Does the source say what this evidence states?', 'true'); await sleep(300);
  await shot('l41_open_source_1280', 1280);
  check(await submitIn(o, 'Record the opening'), 'the opening is submitted');
  await sleep(400);
  check(/^Record that you opened [0-9a-f]{8}, /.test(await ev(`${o}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`)), '  ...its confirmation names the row by its short id', await ev(`${o}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`));
  await confirmIn(o);
  await sleep(500);
  if (await ev(`!!${o}?.querySelector('[data-testid=form-confirm-yes]')`)) await confirmIn(o);
  check(await waitFor(`!!document.querySelector('[data-testid=evidence-opened]')`), '  ...the row shows who opened it');
  check((await ev(`${row}.textContent`)).includes('Source-verified'), '  ...verified now');
  await open(`/accounts/${E.WALK_INST}`, `!!document.querySelector('[data-testid=account-detail]')`);
  await ev(`document.querySelector('[data-testid=account-detail]').open = true`); await sleep(800);
  check(await ev(`(()=>{const b=document.querySelector('[data-testid=customer-role-open]');if(!b||b.disabled)return false;b.click();return true})()`), 'the roles card opens');
  await sleep(500);
  const r = `document.querySelector('[data-testid=customer-role-form]')`;
  check((await ev(`[...${r}.querySelectorAll('option')].map(o=>o.textContent).join('|')`)).includes('Org chart naming the walk owner'), '  ...the opened source is offered');
  check(await ev(`!!document.querySelector('[data-testid=record-source-open]')`), '  ..."Record a source…" is on the roles card');
  await shot('l41_roles_1280', 1280);
  await shot('l41_roles_375', 375);
}

if (MODE === 'aboutbatch') {
  check(await open('/runs', `!!document.querySelector('[data-testid=about-batch]')`), 'the Runs page shows the about batch');
  check((await text('[data-testid=about-batch-count]')).startsWith(`${E.ABOUT_COUNT} rows; ${E.ABOUT_OPEN} left for you to state`), `  ...${E.ABOUT_COUNT} rows, ${E.ABOUT_OPEN} left open`, await text('[data-testid=about-batch-count]'));
  const rows = await ev(`[...document.querySelectorAll('[data-testid=about-batch-row]')].map(r=>({p:r.dataset.proposed,v:r.querySelector('select').value,t:r.textContent.length}))`);
  check(rows.length === Number(E.ABOUT_COUNT), '  ...every row listed', String(rows.length));
  check(rows.every((r) => (r.p === 'account' ? r.v === 'account' : r.v === '')), '  ...a derived row is pre-filled; the rest are not (condition 2)');
  const f = `document.querySelector('[data-testid=about-batch]')`;
  await setField(f, 'Why they are stated', 'Verification: the walk leaves this unsent.'); await sleep(300);
  check(await ev(`[...${f}.querySelectorAll('button')].find(e=>e.textContent.includes('State the')).disabled`), '  ...the submit waits while a row is open');
  check((await ev(`${f}.textContent`)).includes(`state the ${E.ABOUT_OPEN} rows left open`), '  ...saying so in words');
  // Brad, 1 Nov 2026: what the control offered on each row of the batch, read from the page.
  for (const prefix of ['cee6fea9', 'f9775317', '423be7c6', '092c46b6']) {
    ok(`OPTIONS ${prefix}: ${await ev(`[...document.querySelectorAll('[data-testid=about-batch-row]')].find(r=>r.dataset.evidence.startsWith('${prefix}')).querySelector('select').innerText.replace(/\\n/g,' | ')`)}`);
  }
  await shot('l41_about_batch_1280', 1280);
  await shot('l41_about_batch_375', 375);
}

const LINE = 'verified without the source being opened';
const openAll = async () => { await ev(`[...document.querySelectorAll('details')].forEach(d=>{d.open=true})`); await sleep(600); };
const lineCount = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(x=>[...x.querySelectorAll('[data-testid=verified-unopened]')].length>0).length`);

if (MODE === 'fourrows') {
  check(await open(`/accounts/${E.SELF_INST}`, `!!document.querySelector('[data-testid=account-evidence]')`), "the tenant's own account page shows the evidence card");
  const sel = `document.querySelector('[data-evidence="${E.UNOPENED_ROW}"]')`;
  check(await waitFor(`!!${sel}`), '  ...a verified, unopened row is reachable');
  check((await ev(`${sel}.textContent`)).includes('verified without the source being opened'), '  ...reading "verified without the source being opened"');
  check(await ev(`!!${sel}.querySelector('[data-testid=open-source-open]') && !!${sel}.querySelector('[data-testid=withdraw-verification-open]')`), '  ...with both of its ends: open it, or withdraw the verification');
  await shot('l41_four_rows_1280', 1280);

  // Brad, 1 Nov 2026: the POV, W6 and the lineage, against the four real rows, as C3b left them. Each of the first
  // two is asserted as it stands, so a change is seen: the POV draws evidence only under a hypothesis, and neither
  // account has one; Skillsoft, the tenant's own account, has no walk; Curia's W6 shows lot acceptance (L43).
  check(await open(`/accounts/${E.SELF_INST}/pov`, `!!document.querySelector('[data-testid=pov]')`), "the POV: Skillsoft's");
  check(await lineCount('body') === 0, '  ...9765335f and 271a449a are not on it: no hypothesis, so no evidence is drawn');
  await shot('l41_real_pov_self_1280', 1280);
  check(await open(`/accounts/${E.CURIA_INST}/pov`, `!!document.querySelector('[data-testid=pov]')`), "the POV: Curia's");
  check(await lineCount('body') === 0, '  ...1632a5e0 and f9775317 are not on it, for the same reason');
  check(await open(`/accounts/${E.SELF_INST}`, `!!document.querySelector('[data-testid=account-evidence]')`), 'W6: the tenant\'s own account');
  check(!(await ev(`!!document.querySelector('[data-testid=w6]')`)), '  ...has no walk, so no W6');
  check(await waitFor(`[${JSON.stringify(E.ROW_9)},${JSON.stringify(E.ROW_2)}].every(id=>(document.querySelector('[data-evidence="'+id+'"]')?.textContent??'').includes(${JSON.stringify(LINE)}))`), "  ...the account's evidence card carries the line on both");
  await shot('l41_real_self_card_1280', 1280);
  check(await open(`/accounts/${E.CURIA_INST}`, `!!document.querySelector('[data-testid=w6]')`), "W6: Curia's");
  await openAll();
  check(await lineCount('[data-testid=w6-evidence],[data-testid=w6-withdrawn]') === 0, '  ...shows lot acceptance, with no evidence: the 2 rows are not in it (L43)');
  check(await waitFor(`[${JSON.stringify(E.ROW_1)},${JSON.stringify(E.ROW_F)}].every(id=>(document.querySelector('[data-evidence="'+id+'"]')?.textContent??'').includes(${JSON.stringify(LINE)}))`), "  ...the account's evidence card carries the line on both");
  for (const [name, id] of [['9765335f', E.ROW_9], ['271a449a', E.ROW_2], ['1632a5e0', E.ROW_1], ['f9775317', E.ROW_F]]) {
    check(await open(`/lineage/evidence/${id}`, `!!document.querySelector('[data-testid=lineage-steps]')`), `the lineage of ${name}`);
    check((await text('[data-testid=lineage-steps]')).includes(LINE), '  ...carries the line');
    if (name === '1632a5e0') await shot('l41_real_lineage_1632_1280', 1280);
  }
}

if (MODE === 'fourlinked') {
  // On this clone only: a lever, a hypothesis and two links, so Curia's real rows reach the surfaces that draw them.
  check(await open(`/accounts/${E.CURIA_INST}/pov`, `!!document.querySelector('[data-testid=pov]')`), "the POV: Curia's, once the outcome has a hypothesis (clone only)");
  check(await lineCount('li') === 2, '  ...1632a5e0 and f9775317 each carry the line', String(await lineCount('li')));
  await shot('l41_real_pov_curia_linked_1280', 1280);
  await shot('l41_real_pov_curia_linked_375', 375);
  check(await open(`/accounts/${E.CURIA_INST}`, `!!document.querySelector('[data-testid=w6]')`), "W6: Curia's, the same rows linked (clone only)");
  await openAll();
  check(await lineCount('[data-testid=w6-evidence]') === 2, '  ...each carries the line', String(await lineCount('[data-testid=w6-evidence]')));
  await shot('l41_real_w6_curia_linked_1280', 1280);
}

if (MODE === 'aboutcontrol' || MODE === 'aboutprefilled') {
  // L52, 2: the same on an account's page and the tenant's own; nothing pre-filled.
  const opts = (f) => ev(`[...${f}.querySelectorAll('[data-testid=about-choice] option')].filter(o=>o.value!=='').map(o=>o.textContent).join(' | ')`);
  const openForm = async (inst) => {
    await open(`/accounts/${inst}`, `!!document.querySelector('[data-testid=account-evidence],[data-testid=account-detail]')`);
    await ev(`document.querySelector('[data-testid=account-detail]') && (document.querySelector('[data-testid=account-detail]').open = true)`); await sleep(800);
    const card = `document.querySelector('[data-testid=account-evidence]')`;
    await waitFor(`!!${card}`);
    await ev(`${card}.querySelector('[data-testid=record-source-open]').click()`); await sleep(500);
    await waitFor(`${card}.querySelectorAll('[data-testid=about-choice] option').length > 2`);
    return `${card}.querySelector('[data-testid=record-source]')`;
  };
  const f = await openForm(E.CURIA);
  const value = await ev(`${f}.querySelector('[data-testid=about-choice]').value`);
  if (MODE === 'aboutprefilled') { check(value === 'account', 'B2: the control pre-filled → caught: it reads "this account" with nothing chosen', value); ws.close(); process.exit(0); }
  check(value === '', "Curia's form: what it is about starts unchosen", value);
  const curia = await opts(f);
  check(curia === 'This account | Skillsoft (the tenant) | Scotts Miracle-Gro | Another company, named', '  ...it offers this account, the tenant, the other account and a typed company', curia);
  check((await ev(`${f}.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`)).includes('say what this evidence is about'), '  ...and says so until it is chosen');
  await shot('l52_about_control_1280', 1280);
  const g = await openForm(E.SELF_INST);
  const own = await opts(g);
  check(own === 'This account | Curia | Scotts Miracle-Gro | Another company, named', "the tenant's own form offers this account, each account and a typed company", own);
}

if (MODE === 'supersession') {
  check(await open('/runs', `!!document.querySelector('[data-testid=supersession-open]')`), 'the Runs page offers "Correct evidence…"');
  await ev(`document.querySelector('[data-testid=supersession-open]').click()`);
  check(await waitFor(`document.querySelectorAll('[data-testid=supersession-row]').length > 0`), '  ...every current row is listed');
  const rowOf = (id) => `document.querySelector('[data-testid=supersession-row][data-evidence="${id}"]')`;
  const dry = `document.querySelector('[data-testid=supersession-dry-run]')`;
  check(await ev(`${dry}.disabled`), '  ..."Show what this will do" waits for a row');
  for (const [id, about, summary] of [[E.RC, 'Skillsoft (the tenant)', E.TC ?? ''], [E.RF, 'Skillsoft (the tenant)', E.TF ?? ''], [E.RT, 'account', E.T1], [E.R2, 'account', E.T2], [E.R9, 'account', E.T9]]) {
    await ev(`${rowOf(id)}.querySelector('[data-testid=supersession-tick]').click()`); await sleep(300);
    const sel = `${rowOf(id)}.querySelector('[data-testid=supersession-about]')`;
    check((await ev(`${sel}.value`)) === '', '  ...a ticked row starts unchosen');
    const value = about === 'account' ? about : await ev(`[...${sel}.options].find(o=>o.textContent===${JSON.stringify(about)}).value`);
    await setField(rowOf(id), 'What it is about', value); await sleep(300);
    if (summary) await setField(rowOf(id), 'New text', summary);
    if (await ev(`!!${rowOf(id)}.querySelector('[data-testid=supersession-reading]')`)) {
      await setField(rowOf(id), 'What it rests on', 'quote'); await sleep(300);
      await setField(rowOf(id), 'Quote', 'Named in the fixture document as stated here.');
      await setField(rowOf(id), 'How it was read', 'Read from the fixture document, page one (fixture).'); await sleep(300);
    }
  }
  for (const id of [E.E1, E.E2]) {
    const r = `document.querySelector('[data-testid=supersession-erratum][data-erratum="${id}"]')`;
    await ev(`${r}.querySelector('[data-testid=supersession-erratum-tick]').click()`); await sleep(300);
    await setField(r, 'What is right', 'It supports the impact basis only. A vendor claim about Scotts is never support for a baseline.');
    await setField(r, 'Reason', 'The link was corrected on 25 Oct 2026, because a vendor claim is never baseline support.');
    await setField(r, 'Why it is superseded', 'The earlier text misidentified the subject of the story.'); await sleep(300);
  }
  const before = posted('/api/evidence/supersession-batch/dry-run');
  check(await ev(`(()=>{const b=${dry};if(b.disabled)return false;b.click();return true})()`), 'the dry run runs', await text('[data-testid=supersession-waiting]'));
  check(await waitFor(`document.querySelectorAll('[data-testid=supersession-plan-row]').length === 5 && document.querySelectorAll('[data-testid=supersession-plan-erratum]').length === 2`), '  ...and lists the 5 rows and 2 errata', await text('[data-testid=supersession-failed]'));
  check(posted('/api/evidence/supersession-batch/dry-run') - before === 1, '  ...in one request');
  const planOf = (id) => `document.querySelector('[data-testid=supersession-plan-row][data-evidence="${id}"]')`;
  if (!E.POST) {
  const c = await ev(`${planOf(E.RC)}.textContent`);
  check(c.includes('About Curia → about Skillsoft'), '  ...cee6fea9: its current and new statement', c.slice(0, 200));
  check(c.includes('Text new: unchanged'), '  ...and text');
  check(c.includes('the system-exercise mark carries to the new row'), '  ...what happens to its mark');
  check(c.includes('Links: none current; 1 withdrawn stay on the old row'), '  ...its links', c);
  check(c.includes('16 sealed runs'), '  ...its lineage, and the sealed runs that stay', c);
  const t = await ev(`${planOf(E.RT)}.textContent`);
  check(t.includes('Text new: ' + E.T1), '  ...423be7c6: its current and new text');
  check(t.includes('About Scotts Miracle-Gro → about Scotts Miracle-Gro'), '  ...its about, kept');
  check(t.includes('Source-verified now, opened. The new row starts unverified and unopened'), '  ...that its verification does not carry', t);
  check(t.includes('It stays AI-sourced'), '  ...that its AI origin does');
  check(t.includes('Mark: none.'), '  ...no mark');
  check(t.includes('moves to the new row, with its support unchanged (the outcome stays frozen)'), '  ...its link carried', t);
  const e1 = await ev(`document.querySelector('[data-testid=supersession-plan-erratum][data-erratum="${E.E1}"]').textContent`);
  check(e1.includes('another company') && e1.includes('A vendor claim about Scotts is never support for a baseline.') && e1.includes('misidentified'), '  ...each erratum: current and new text, and why', e1.slice(0, 240));
  } else {
    // A copy taken after B1's acts: every row's plan shows its current and new text, statement, mark, links and lineage.
    for (const id of [E.RC, E.RF, E.RT, E.R2, E.R9]) {
      const t = await ev(`${planOf(id)}.textContent`);
      check(['Text now:', 'Text new:', 'About ', 'Mark:', 'Lineage:'].every((w) => t.includes(w)) && /Links?:/.test(t), `  ...${id.slice(0, 8)}: its text, statement, mark, links and lineage`, t.slice(0, 200));
    }
    check((await ev(`${planOf(E.RT)}.textContent`)).includes('moves to the new row, with its support unchanged (the outcome stays frozen)'), '  ...the frozen link carried');
  }
  const plan = `[data-testid=supersession-plan]`;
  await shotOf('l52_dry_run_1280', plan, 1280);
  await shotOf('l52_dry_run_375', plan, 375);
  await viewport(1280);
  const sec = `document.querySelector('[data-testid=supersession-batch]')`;
  await setField(sec, 'Why they are superseded', 'Verification: the rows and errata as ruled.'); await sleep(300);
  const n = posted('/api/evidence/supersession-batch') - posted('/api/evidence/supersession-batch/dry-run');
  check(await submitIn(sec, 'Supersede 7 items'), 'the steward presses "Supersede 7 items"');
  await sleep(500);
  check((posted('/api/evidence/supersession-batch') - posted('/api/evidence/supersession-batch/dry-run')) === n, '  ...nothing is sent before the confirmation');
  check((await text('[data-testid=confirm-text]')).includes('Supersede 7 items, as listed above.'), '  ...the confirmation states the count');
  await confirmIn(sec);
  check(await waitFor(`!document.querySelector('[data-testid=supersession-plan]')`), '  ...recorded');
}

if (MODE === 'addindustry') {
  const indName = E.IND_NAME ?? 'Utilities', indSlug = E.IND_SLUG ?? 'utilities';
  check(await open('/packs', `!!document.querySelector('[data-testid=add-industry-open]')`), 'the Packs page offers "Add an industry…"');
  await ev(`document.querySelector('[data-testid=add-industry-open]').click()`); await sleep(400);
  const f = `document.querySelector('[data-testid=add-industry]')`;
  await setField(f, 'Name', indName);
  await setField(f, 'Slug', indSlug);
  await setField(f, 'Why it is added', 'Verification: a pack is to be researched for it.'); await sleep(300);
  await shot('b1_add_industry_1280', 1280);
  check(await submitIn(f, 'Add the industry'), 'the steward adds it');
  await sleep(400);
  check((await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`)).startsWith('Add the industry '), '  ...its confirmation names the industry and its slug');
  await confirmIn(f);
  await sleep(500);
  if (await ev(`!!${f}?.querySelector('[data-testid=form-confirm-yes]')`)) await confirmIn(f);
  check(await waitFor(`[...document.querySelectorAll('a')].some(a=>a.getAttribute('href')==='/packs/${indSlug}')`), '  ...it is listed, linking to its pack');
}

if (MODE === 'cardlinks') {
  // B1 (Brad, 4 Nov 2026): card 01c corrects what a link supports, for an outcome whose runs predate the link to it.
  // E.TO_BASELINE now supports the impact basis; E.TO_IMPACT now supports the baseline: uncross them, one at a time.
  const goto = async () => {
    await open(`/accounts/${E.SELF_INST}`, `!!document.querySelector('[data-testid=account-evidence]')`);
    await waitFor(`!!document.querySelector('[data-evidence="${E.TO_BASELINE}"]')`);
  };
  await goto();
  for (const [id, from, to] of [[E.TO_BASELINE, 'impact basis', 'baseline'], [E.TO_IMPACT, 'baseline', 'impact_basis']]) {
    const row = `document.querySelector('[data-evidence="${id}"]')`;
    check((await ev(`${row}.querySelector('[data-testid=evidence-short-id]').textContent`)) === id.slice(0, 8), `${id.slice(0, 8)}: its short id is beside its text`);
    // Steward safety: the button reads "Correct…", its link named on the line above it.
    const btn = `${row}.querySelector('[data-testid=evidence-link][data-supports=${JSON.stringify(from.replace(' ', '_'))}] [data-testid=correct-link-open]')`;
    check(await ev(`!!${btn} && !${btn}.disabled && (${row}.querySelector('[data-testid=evidence-link][data-supports=${JSON.stringify(from.replace(' ', '_'))}] [data-testid=evidence-link-context]')?.textContent ?? '').includes(${JSON.stringify(from)})`), `  ...it offers "Correct…" under "Link: ${from} of …"`);
    await ev(`${btn}.click()`); await sleep(400);
    const f = `${row}.querySelector('[data-testid=correct-link]')`;
    await setField(f, 'What it supports', to);
    await setField(f, 'Why', 'Verification: uncrossing the two links, as on prod.'); await sleep(300);
    if (id === E.TO_BASELINE) await shotOf('b1_card_link_1280', `[data-evidence="${id}"]`, 1280);
    await viewport(1280);
    check(await submitIn(f, 'Withdraw and correct'), '  ...submitted');
    await sleep(500);
    check((await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`)).includes(`Correct ${id.slice(0, 8)}`), '  ...the confirmation names the row by its short id');
    await confirmIn(f); await sleep(1500);
    check(await waitFor(`!${row}?.querySelector('[data-testid=correct-link]')`), '  ...recorded: the form closed, with no refusal', await ev(`(${row}?.querySelector('[data-testid=correct-link]')?.textContent ?? '').slice(-260)`));
    await goto();
  }
  for (const [id, now] of [[E.TO_BASELINE, 'the baseline'], [E.TO_IMPACT, 'the impact basis']]) {
    check((await ev(`document.querySelector('[data-evidence="${id}"]').textContent`)).includes(`supports ${now}`), `${id.slice(0, 8)} now supports ${now}`);
  }
  await shot('b1_card_links_after_1280', 1280);
}

if (MODE === 'cardwithdraw') {
  // B2 (Brad, 4 Nov 2026; checklist stage 8): card 01c withdraws E.WD_ID's one current link, with no replacement.
  const row = `document.querySelector('[data-evidence="${E.WD_ID}"]')`;
  await open(`/accounts/${E.SELF_INST}`, `!!document.querySelector('[data-testid=account-evidence]')`);
  await waitFor(`!!${row}`);
  const btn = `${row}.querySelector('[data-testid=withdraw-link-open]')`;
  // Steward safety: in the row's marked withdrawals zone, under "Link: … of …".
  const offered = (await ev(`${row}.querySelector('[data-testid=danger-zone] [data-testid=evidence-link-withdraw]')?.textContent ?? ''`)).includes(`${E.WD_FROM} of`) && (await ev(`!!${btn} && !${btn}.disabled`));
  check(offered, `${E.WD_ID.slice(0, 8)}: it offers "Withdraw this link…" in the withdrawals zone, under its link`, await ev(`${row}.querySelector('[data-testid=danger-zone]')?.textContent ?? 'none'`));
  if (!offered) { ws.close(); process.exit(1); }
  await ev(`${btn}.click()`); await sleep(400);
  const f = `${row}.querySelector('[data-testid=withdraw-link]')`;
  check(!(await ev(`[...${f}.querySelectorAll('button')].find(b=>b.textContent.trim()==='Withdraw the link')?.disabled === false`)), '  ...no reason given: it cannot be submitted');
  await setField(f, 'Why', 'Verification: no source states this figure.'); await sleep(300);
  await shotOf('b2_card_withdraw_1280', `[data-evidence="${E.WD_ID}"]`, 1280);
  check(await submitIn(f, 'Withdraw the link'), '  ...submitted');
  await sleep(500);
  const ct = await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(ct.startsWith(`Withdraw ${E.WD_ID.slice(0, 8)}, `) && ct.includes('will support nothing'), '  ...the confirmation names the row by its short id, and says it will support nothing', ct);
  await confirmIn(f); await sleep(1500);
  check(await waitFor(`!${row}?.querySelector('[data-testid=withdraw-link]')`), '  ...recorded: the form closed, with no refusal', await ev(`(${row}?.querySelector('[data-testid=withdraw-link]')?.textContent ?? '').slice(-260)`));
  await open(`/accounts/${E.SELF_INST}`, `!!document.querySelector('[data-testid=account-evidence]')`); await waitFor(`!!${row}`);
  check(await ev(`!${row}.querySelector('[data-testid=withdraw-link-open]')`), '  ...the row offers no withdrawal now: it has no current link');
  await shotOf('b2_card_withdrawn_1280', `[data-evidence="${E.WD_ID}"]`, 1280);
  await shotOf('b2_card_withdrawn_390', `[data-evidence="${E.WD_ID}"]`, 390);
  await viewport(1280);
}

if (MODE === 'stewardsafety') {
  // Steward safety (Brad, 5 Nov 2026): card 01c and the pack page. E.EXPECT = current|history|muted (current rows),
  // read from the record. BREAK names the break this walk runs under, so its FAIL lines are the catch.
  check(await open(`/accounts/${E.SELF_INST}`, `!!document.querySelector('[data-testid=account-evidence]')`), "the tenant's own card 01c");
  const [cur, hist, muted] = E.EXPECT.split('|').map(Number);
  const got = await ev(`(()=>{const c=document.querySelector('[data-testid=evidence-current]');const h=document.querySelector('[data-testid=evidence-history]');
    return {cur:c?c.querySelectorAll(':scope > [data-testid=account-evidence-row]').length:0, hist:h?h.querySelectorAll('[data-testid=account-evidence-row]').length:0, open:h?h.open:null,
      label:h?.querySelector('summary')?.textContent??'', supInCur:c?c.querySelectorAll('[data-testid=evidence-superseded]').length:0,
      muted:c?c.querySelectorAll(':scope > [data-testid=account-evidence-row][data-muted=true]').length:0}})()`);
  check(got.cur === cur && got.supInCur === 0, `current rows first: the ${cur} current rows, none of them superseded`, JSON.stringify(got));
  check(got.hist === hist && got.open === false && got.label === `History: ${hist} superseded ${hist === 1 ? 'row' : 'rows'}`, `  ...the ${hist} superseded rows under a collapsed "History"`, JSON.stringify(got));
  check(got.muted === muted, `  ...${muted} simulated or system-exercise rows muted and labelled`, JSON.stringify(got));
  const mutedRow = `document.querySelector('[data-testid=evidence-current] > [data-muted=true]')`;
  if (muted > 0) {
    check(await ev(`!!${mutedRow}.querySelector('[data-testid=show-actions]') && !${mutedRow}.querySelector('[data-testid=evidence-actions], [data-testid=danger-zone], [data-testid=supersede-open]')`), '  ...a muted row\'s acts wait behind "Show actions"');
    check(await ev(`/Simulated|System exercise/.test(${mutedRow}.textContent)`), '  ...and it says why it is muted');
    await ev(`${mutedRow}.querySelector('[data-testid=show-actions]').click()`); await sleep(300);
    check(await ev(`!!${mutedRow}.querySelector('[data-testid=supersede-open]') && ${mutedRow}.querySelector('[data-testid=show-actions]').textContent === 'Hide actions'`), '  ..."Show actions" shows them');
  }
  // A row with a live link: its withdrawal in the marked zone, its correction outside it, each under "Link: … of …".
  const linked = `[...document.querySelectorAll('[data-testid=evidence-current] > [data-muted=false]')].find(r=>r.querySelector('[data-testid=evidence-link]'))`;
  check(await ev(`(()=>{const r=${linked};if(!r)return false;const z=r.querySelector('[data-testid=danger-zone]');return !!z && !!z.querySelector('[data-testid=withdraw-link-open]') && !z.querySelector('[data-testid=correct-link-open]') && /Link: .+ of /.test(r.querySelector('[data-testid=evidence-link-context]')?.textContent??'') && r.querySelector('[data-testid=correct-link-open]').textContent.trim()==='Correct…'})()`),
    'a withdrawal sits in the marked zone, the correction outside it; short labels, the link named on the line above');
  // Its withdrawal's confirmation names the row and its short id; Back sends nothing.
  await ev(`${linked}.querySelector('[data-testid=withdraw-link-open]').click()`); await sleep(300);
  const wf = `${linked}.querySelector('[data-testid=withdraw-link]')`;
  await setField(wf, 'Why', 'Verification: reading the confirmation only.'); await sleep(200);
  await submitIn(wf, 'Withdraw the link'); await sleep(300);
  const ct = await ev(`${wf}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(/^Withdraw [0-9a-f]{8}, “/.test(ct), '  ...its confirmation names the row and its short id', ct);
  await ev(`${wf}.querySelector('[data-testid=form-confirm-back]').click()`); await sleep(300);
  check(!(await ev(`(${wf}?.textContent ?? '').includes('Withdrawn.')`)), '  ..."Back" records nothing');
  // No dead ends: a current row that cannot be opened says why and where to go.
  check(await ev(`[...document.querySelectorAll('[data-testid=evidence-current] > [data-testid=account-evidence-row]')].filter(r=>(r.dataset.muted==='false' || r.querySelector('[data-testid=show-actions]')?.textContent==='Hide actions') && !r.querySelector('[data-testid=open-source-open]') && !r.querySelector('[data-testid=evidence-opened]')).every(r=>!!r.querySelector('[data-testid=evidence-no-opening]'))`),
    'no dead ends: every current row that offers no opening says why, and where to go');
  await shotOf('ss_card01c_1280', '[data-testid=account-evidence]', 1280); await shotOf('ss_card01c_390', '[data-testid=account-evidence]', 390); await viewport(1280);
  // The pack page: retirement and withdrawals in the marked zone; a proposal's confirmation names the entry's short id.
  check(await open(`/packs/${E.SLUG}`, `!!document.querySelector('[data-testid=levers]')`), 'the pack page');
  check(await ev(`(()=>{const z=[...document.querySelectorAll('[data-testid=danger-zone]')];return z.some(x=>/Retire this entry/.test(x.textContent)) && z.some(x=>/Withdraw this lever/.test(x.textContent))})()`), '  ..."Retire this entry…" and "Withdraw this lever…" each in a marked zone');
  const lv = `document.querySelector('[data-testid=levers]')`;
  await ev(`[...${lv}.querySelectorAll('button')].find(b=>b.textContent.includes('Add a lever'))?.click()`); await sleep(300);
  const af = `${lv}.querySelector('[data-testid=add-lever]')`;
  for (const [l, v] of [['Lever name', 'Verification lever (not recorded)'], ['Mechanism', 'Verification: a mechanism sentence, long enough.'], ['Leading indicator', 'Verification indicator'], ['Citation', 'Verification citation, not a source.']]) await setField(af, l, v);
  await sleep(200); await submitIn(af, 'Propose the lever'); await sleep(300);
  const lt = await ev(`${af}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(/^Propose the lever “Verification lever \(not recorded\)” on .+ \([0-9a-f]{8}\), citing: /.test(lt), '  ...a proposal\'s confirmation names the entry and its short id', lt);
  await ev(`${af}.querySelector('[data-testid=form-confirm-back]').click()`); await sleep(200);
  await shot('ss_pack_1280', 1280);
}

if (MODE === 'policies') {
  // B3 (§19): the act session, on the clone, through the page. Every confirmation must read exactly as the act session
  // quotes it (LVRF_PLAN §19, "The B3 act session"), so the pastes Brad reads are the page's own words.
  const ready = `!!document.querySelector('[data-testid=policies]')`;
  check(await open('/policies', ready), 'the policies page');
  check((await ev(`document.querySelector('[data-testid=lens-none]')?.textContent ?? ''`)).includes('No CFO lens is ratified'), '  ...with no CFO lens, it says so');
  const acts = [
    { key: 'cost_of_delay_months', value: '6', reason: 'Q3, ruled 24 Oct 2026, and P6 ruling 3, 4 Nov 2026: a delay of D months forgoes D/12 of the annual value at the committed target, undiscounted. D = 6.',
      confirm: 'Set Cost-of-delay months to 6. No value was set before. Every cost of delay computed after this reads 6/12 of the annual value at the committed target; no sealed run changes.' },
    { key: 'pack_ratification_institutions', value: '2', reason: 'A pack entry is ratified when it is sourced from N institutions’ systems of record. N = 2, as recorded (Brad, 4 Nov 2026), and never lowered. The value case labels each proposed entry "sourced at x of N".',
      confirm: "Set Pack ratification threshold (institutions' systems of record) to 2. No value was set before. It can be raised later, never lowered; no sealed run changes." },
  ];
  for (const a of acts) {
    await ev(`document.querySelector('[data-testid=set-policy-open]').click()`); await sleep(400);
    const f = `document.querySelector('[data-testid=set-policy]')`;
    await setField(f, 'Policy', a.key); await setField(f, 'Value', a.value); await setField(f, 'Reason', a.reason); await sleep(300);
    check(await submitIn(f, 'Set the value'), `  ...${a.key}: submitted`); await sleep(400);
    const ct = await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
    check(ct === a.confirm, `  ...the confirmation reads exactly as the act session quotes it (${a.key})`, ct);
    if (a.key === 'cost_of_delay_months') await shotOf('b3_policy_confirm_1280', '[data-testid=set-policy]', 1280);
    await confirmIn(f); await sleep(1200);
    check(await waitFor(`(document.querySelector('[data-testid=set-policy]')?.textContent ?? '').includes('Set.')`), `  ...recorded (${a.key})`, await ev(`(document.querySelector('[data-testid=set-policy]')?.textContent ?? '').slice(-300)`));
    await open('/policies', ready);
  }
  await ev(`document.querySelector('[data-testid=ratify-lens-open]').click()`); await sleep(400);
  const f = `document.querySelector('[data-testid=ratify-lens]')`;
  await setField(f, 'Persona', 'cfo'); await setField(f, 'Minimum computed confidence', '55');
  await ev(`${f}.querySelector('[data-testid=lens-basis-system_of_record]').click()`); await ev(`${f}.querySelector('[data-testid=lens-basis-published]').click()`);
  await ev(`${f}.querySelector('[data-testid=lens-suppress-consumption]').click()`);
  await setField(f, 'Refusal text', 'The CFO lens shows a value case only when its computed confidence is at least 55 and every actual it reports rests on a system of record or a published source. This case does not meet that yet. Below is each reason, and what would meet it.');
  await setField(f, 'Reason', 'O-D1, 12 Oct 2026: the CFO lens threshold is 55, the medium band’s floor. It admits system-of-record and published actuals only, and suppresses consumption metrics (LVRF_PLAN §5).');
  await sleep(300);
  check(await submitIn(f, 'Ratify the lens'), '  ...the CFO lens: submitted'); await sleep(400);
  const ct = await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(ct === 'Ratify the CFO lens: at least 55, admitting system of record and published actuals, suppressing consumption metrics. No CFO lens was ratified before. Every value case read under the CFO lens after this applies it; no sealed run changes.',
    '  ...the confirmation reads exactly as the act session quotes it (CFO lens)', ct);
  await confirmIn(f); await sleep(1200);
  check(await waitFor(`(${f}?.textContent ?? '').includes('Ratified.')`), '  ...recorded (CFO lens)', await ev(`(${f}?.textContent ?? '').slice(-300)`));
  await open('/policies', ready);
  check(await ev(`!!document.querySelector('[data-testid=lens-current]')`), '  ...the CFO lens now reads ratified');
  await shot('b3_policies_1280', 1280); await shot('b3_policies_390', 390); await viewport(1280);
}

if (MODE === 'valuecase') {
  // B3 (§19): the value case of E.RUN under E.LENS, on screen and printed. E.EXPECT_* are read from the record.
  const lens = E.LENS === 'cfo' ? '?lens=cfo' : '';
  const ready = `!!document.querySelector('[data-testid=executive-page]')`;
  check(await open(`/runs/${E.RUN}/case${lens}`, ready), `the value case (${E.LENS})`);
  const has = (t) => ev(`!!document.querySelector('[data-testid=${t}]')`);
  check(await has('banner-unverified'), '  ...the disclosure banner (rule 6)');
  if (E.EXPECT_OUTSIDE_IN === '1') check(await has('banner-outside-in'), '  ...the outside-in banner');
  const asks = await ev(`[...document.querySelectorAll('[data-testid=exec-asks] [data-testid=ask]')].map(a=>a.dataset.code+(a.querySelector('[data-testid=converting-question]')?'+q':'')).join(',')`);
  check(asks === E.EXPECT_ASKS, '  ...the executive page lists every ask the record derives, each with its converting question', asks);
  if (E.EXPECT_COD) check(await has(E.EXPECT_COD), `  ...cost of delay reads ${E.EXPECT_COD}`, await ev(`document.querySelector('[data-testid=exec-page]')?.textContent?.slice(0,300) ?? ''`));
  if (E.EXPECT_COD_QUESTION) check((await ev(`[...document.querySelectorAll('[data-testid=cod-reasons] li')].map(l=>l.dataset.code+(l.querySelector('[data-testid=cod-question]')?'+q':'')).join(',')`)) === E.EXPECT_COD_QUESTION,
    '  ...each cost-of-delay reason with its converting question', await ev(`[...document.querySelectorAll('[data-testid=cod-reasons] li')].map(l=>l.dataset.code).join(',')`));
  if (E.LENS === 'cfo') {
    check(await has('cfo-refusal') === (E.EXPECT_CFO_REFUSED === '1'), `  ...the CFO lens ${E.EXPECT_CFO_REFUSED === '1' ? 'refuses' : 'admits'}`);
    if (E.EXPECT_CFO_REASONS) check((await ev(`[...document.querySelectorAll('[data-testid=cfo-reasons] [data-testid=ask]')].map(a=>a.dataset.code).join(',')`)) === E.EXPECT_CFO_REASONS,
      '  ...its reasons, each with a converting question', await ev(`[...document.querySelectorAll('[data-testid=cfo-reasons] [data-testid=ask]')].map(a=>a.dataset.code).join(',')`));
  }
  if (E.EXPECT_PACK_LABEL) check((await ev(`document.querySelector('[data-testid=pack-entry-label]')?.textContent ?? ''`)).includes(E.EXPECT_PACK_LABEL), `  ...the pack entry reads "${E.EXPECT_PACK_LABEL}" and no pack is certified`,
    await ev(`document.querySelector('[data-testid=pack-entry-label]')?.textContent ?? 'none'`));
  if (E.EXPECT_SOLUTIONING) check((await ev(`[...document.querySelectorAll('[data-testid=solutioning-lever]')].map(x=>x.dataset.current+':'+x.querySelectorAll('[data-testid=solutioning-offering]').length).join(',')`)) === E.EXPECT_SOLUTIONING,
    '  ...solutioning reads only links on current levers (ruling 5)', await ev(`[...document.querySelectorAll('[data-testid=solutioning-lever]')].map(x=>x.dataset.current+':'+x.querySelectorAll('[data-testid=solutioning-offering]').length).join(',')`));
  if (E.FORBID) check(!(await ev(`document.body.textContent.includes(${JSON.stringify(E.FORBID)})`)), `  ...the reviewer's note is not on the case (ruling 4)`);
  // Footnotes numbered in reading order: the first reference to each number appears in ascending order.
  const refs = await ev(`[...document.querySelectorAll('[data-testid=footnote-ref]')].map(x=>Number(x.textContent))`);
  const firsts = refs.filter((n, i) => refs.indexOf(n) === i);
  check(firsts.every((n, i) => n === i + 1), `  ...footnotes numbered in reading order (${firsts.join(',') || 'none'})`, JSON.stringify(refs));
  check((await ev(`document.querySelectorAll('[data-testid=footnote]').length`)) === firsts.length, '  ...one source note per number, in words');
  check(await has('case-glossary'), '  ...the glossary');
  await shot(`b3_case_${E.LENS}_${E.TAG}_1280`, 1280);
  await viewport(390); await sleep(500);
  check((await ev('document.documentElement.scrollWidth')) <= 390, '  ...at 390, no horizontal scroll', String(await ev('document.documentElement.scrollWidth')));
  await shot(`b3_case_${E.LENS}_${E.TAG}_390`, 390);
  await viewport(1280);
  await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(300);
  const shortIds = await ev(`(()=>{const t=[...document.querySelectorAll('[data-testid=value-case] *')].filter(e=>getComputedStyle(e).display!=='none'&&e.offsetParent!==null||e.tagName==='TD').map(e=>e.childNodes).flatMap(n=>[...n]).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ');return (t.match(/\\b[0-9a-f]{8}\\b(?![0-9a-f-])/g)||[]).filter(x=>!${JSON.stringify(E.HASH ?? '')}.includes(x))})()`);
  check(shortIds.length === 0, '  ...printed, no short id or row code (the hash excepted)', JSON.stringify(shortIds.slice(0, 5)));
  check(await ev(`getComputedStyle(document.querySelector('[data-testid=case-inputs]')?.parentElement ?? document.body).display === 'none' || !document.querySelector('[data-testid=case-inputs]')`), '  ...printed, the "For the next run" panel is not');
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/b3_case_${E.LENS}_${E.TAG}.pdf`, Buffer.from(pdf.result.data, 'base64'));
  await send('Emulation.setEmulatedMedia', { media: '' });
  console.log(`  shot  ${SHOTS}/b3_case_${E.LENS}_${E.TAG}.pdf`);
}

if (MODE === 'povletter') {
  // Brad, 5 Nov 2026: M21 prints the POV and the value case, both on US Letter.
  check(await open(`/accounts/${E.INST}/pov`, `!!document.querySelector('[data-testid=pov]')`), 'the POV');
  await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(300);
  check(await ev(`[...document.querySelectorAll('[data-testid=pov] [data-testid=evidence-short-id]')].every(e=>getComputedStyle(e).display==='none')`), '  ...printed, the POV shows no short id (UX item 1)');
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  await send('Emulation.setEmulatedMedia', { media: '' });
  writeFileSync(`${SHOTS}/b3_pov_letter.pdf`, Buffer.from(pdf.result.data, 'base64'));
  console.log(`  shot  ${SHOTS}/b3_pov_letter.pdf`);
}

if (MODE === 'snapshots' || MODE === 'snapshotsbreak') {
  // §16 (CS-D5): the curve against the record. E.EXPECT = points|erratum marks|hollow points|breaks, read from the DB.
  const [points, errata, hollow, breaks] = E.EXPECT.split('|').map(Number);
  check(await open(`/engagements/${E.ENG}/snapshots`, `!!document.querySelector('[data-testid=confidence-curve]')`), 'the snapshots page, with its curve');
  await sleep(800);
  const n = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const got = { points: await n('[data-testid=curve-point]'), errata: await n('[data-testid=curve-erratum-mark]'), hollow: await n('[data-testid=curve-point][data-hollow=true]'),
    segments: await n('[data-testid=curve-segment]'), breaks: await n('[data-testid=curve-break]') };
  if (MODE === 'snapshotsbreak') {
    const caught = E.BREAK === '1' ? got.breaks === breaks && got.segments === 1 : got.errata !== errata;
    check(caught && (E.BREAK === '1' ? true : got.errata === 0), E.BREAK === '1' ? 'B6: the curve joined across every change → caught: one line through all of them' : "B6: an erratum's mark dropped → caught: the points carrying one show none", JSON.stringify(got));
    ws.close(); process.exit(0);
  }
  check(got.points === points, `one point per locked run (${points})`, JSON.stringify(got));
  check(got.errata === errata, `  ...an erratum mark on each of the ${errata} carrying a current erratum`, JSON.stringify(got));
  check(got.hollow === hollow, `  ...a hollow point for each of the ${hollow} system exercises`, JSON.stringify(got));
  check(got.breaks === breaks, `  ...a break at each of the ${breaks} model or outcome changes`, JSON.stringify(got));
  check((await n('[data-testid=snapshot-run]')) === points, '  ...and the list holds the same runs, with every number');
  check((await ev(`document.body.textContent`)).includes('This run was sealed before the case was.'), '  ...each older run says it sealed no case');
  check(await ev(`!!document.querySelector('[data-testid=banner-unverified]')`), '  ...the disclosure banner (rule 6)');
  check(await ev(`!!document.querySelector('[data-testid=banner-reference]')`), '  ...and the reference-example banner (O-D3)');
  await ev(`(()=>{const p=document.querySelector('[data-testid=curve-point] rect[tabindex]');p.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));p.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}))})()`); await sleep(300);
  check(await waitFor(`!!document.querySelector('[data-testid=curve-tooltip]')`, 3000), '  ...hovering a point names its run, score, band and model');
  await shot('cs_snapshots_1280', 1280);
  await shotOf('cs_curve_1280', '[data-testid=confidence-curve]', 1280);
  await shotOf('cs_curve_390', '[data-testid=confidence-curve]', 390);
  await viewport(390); await sleep(500);
  check((await ev('document.documentElement.scrollWidth')) <= 390, 'at 390, no horizontal scroll', String(await ev('document.documentElement.scrollWidth')));
  await viewport(1280);
  await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(200);
  // A closed <details> prints as its summary alone: the printed page carries each run's sealed case itself.
  check((await ev(`[...document.querySelectorAll('[data-testid=case-sealed-print]')].filter((e)=>getComputedStyle(e).display!=='none').length`)) === points
    && (await ev(`[...document.querySelectorAll('[data-testid=snapshot-run] details')].every((e)=>getComputedStyle(e).display==='none')`)),
    `  ...printed, each of the ${points} runs carries its sealed case, not a closed summary`);
  // The curve's pixel width is measured on screen; the printed page is narrower, so the SVG scales to its card.
  check((await ev(`getComputedStyle(document.querySelector('[data-testid=confidence-curve] svg')).maxWidth`)) === '100%',
    '  ...printed, the curve scales to its card (max-width 100%), not its screen width');
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/cs_snapshots.pdf`, Buffer.from(pdf.result.data, 'base64'));
  await send('Emulation.setEmulatedMedia', { media: '' });
  console.log(`  shot  ${SHOTS}/cs_snapshots.pdf`);
}

if (MODE === 'runcase') {
  check(await open(`/runs/${E.RUN}`, runReady), 'a v4 run page');
  await sleep(600);
  const t = await ev(`document.querySelector('[data-testid=case-sealed]')?.textContent ?? ''`);
  check(t.includes('As sealed with the run, never read live.') && t.includes('Verdict as sealed: open') && t.includes('ratified by'), '  ...the case as sealed: its hypothesis, verdict and lever', t.slice(0, 200));
  check(await ev(`!!document.querySelector('[data-testid=snapshots-link]')`), '  ...and a link to every run of the engagement');
  await shotOf('cs_run_case_1280', '[aria-labelledby=case]', 1280);
}

if (MODE === 'corrected') {
  check(await open(`/accounts/${E.CURIA}`, `!!document.querySelector('[data-testid=account-detail]')`), "Curia's account");
  await ev(`document.querySelector('[data-testid=account-detail]').open = true`); await sleep(800);
  await waitFor(`!!document.querySelector('[data-evidence="${E.RC}"]')`);
  const old = await ev(`document.querySelector('[data-evidence="${E.RC}"]').textContent`);
  check(old.includes('Superseded by a later row, about Skillsoft'), '  ...the old row names what replaced it', old.slice(0, 240));
  const neu = await ev(`document.querySelector('[data-evidence="${E.NC}"]').textContent`);
  check(neu.includes('about Skillsoft') && neu.includes('SYSTEM EXERCISE') && neu.includes('Not source-verified'), '  ...the new row: about Skillsoft, its mark, unverified', neu.slice(0, 240));
  await shot('l52_card_1280', 1280);
  check(await open(`/lineage/evidence/${E.RC}`, `!!document.querySelector('[data-testid=lineage-superseded-by]')`), "the old row's lineage reads \"superseded by\"");
  check(await open(`/lineage/evidence/${E.NC}`, `!!document.querySelector('[data-testid=lineage-supersedes]')`), "the new row's lineage reads \"supersedes\"");
  await shot('l52_lineage_1280', 1280);
}

if (MODE === 'seal') {
  check(await open(`/runs/${E.RUN}`, runReady), 'the v3 run page');
  await ev(`[...document.querySelectorAll('details')].forEach(d=>{d.open=true})`); await sleep(500);
  const all = await text('[data-testid=sealed-item]');
  check(all.includes('verified without the source being opened'), '  ...the seal shows "verified without the source being opened" (condition 3)', all.slice(0, 200));
  check((await text('[data-testid=sealed-about]')).includes('About '), '  ...and what each item is about');
  await shot('l41_v3_run_1280', 1280);
}

ws.close();
process.exit(0);
