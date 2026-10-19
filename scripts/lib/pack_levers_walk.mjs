// O1 — the browser walk of the pack page's value levers and solutions,
// driven over the Chrome DevTools Protocol (no extra dependency). Called by
// scripts/verify_value_levers.sh; prints "  PASS"/"  FAIL" lines it counts.
// The CDP and sign-in preamble is pack_research_walk.mjs's, unchanged.
//
//   node scripts/lib/pack_levers_walk.mjs MODE VITE_PORT CDP_PORT SHOTS DB SLUG S_EMAIL X_EMAIL PW ENTRY_NAME S_NAME
//
// MODE: steward | nonsteward | break-gate
// Signs in by SESSION through the real sign-in form — never the header.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, DB, SLUG, S_EMAIL, X_EMAIL, PW, ENTRY_NAME, S_NAME] = process.argv.slice(2);
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
  // UX-1 slice 1: a screenshot's target may sit in a folded workspace step or
  // the closed "Account detail". Open them first, as a reader would (the
  // step's own toggle; the <details> element), so the shot shows the target.
  if (selector) {
    const opened = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return 0;let n=0;for(let p=el;p;p=p.parentElement){if(p.tagName==='DETAILS'&&!p.open){p.open=true;n++;}if(p.dataset&&p.dataset.open==='false'){p.querySelector('[data-step-toggle]')?.click();n++;}}return n})()`);
    if (opened) await sleep(300);
  }
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
const entry = `([...document.querySelectorAll('h4')].find(h=>h.textContent===${JSON.stringify(ENTRY_NAME)})?.parentElement?.parentElement)`;
const levers = `(${entry}?.querySelector('[data-testid=levers]'))`;
const leverNamed = (name) => `([...(${levers}).querySelectorAll('[data-testid=lever]')].find(l=>l.querySelector('span')?.textContent===${JSON.stringify(name)}))`;
const LEVER = {
  name: 'Hazard recognition before the task',
  mechanism: 'Crews trained to recognise hazards stop unsafe tasks before an incident occurs.',
  leading: 'Near-miss reports per 100 workers',
  citation: 'Walk verification citation, not a source.',
};
const OFFERING_NAME = psql("SELECT name FROM offerings WHERE offering_key = 'skillsoft_compliance_suite' AND deleted_at IS NULL AND superseded_by_id IS NULL LIMIT 1");
// Screenshots by CSS selector: mark THIS entry's block, not the first on the page.
const markShot = () => ev(`(()=>{document.querySelectorAll('[data-shot]').forEach(e=>e.removeAttribute('data-shot'));(${levers}).setAttribute('data-shot','1');return true})()`);
const leverRows = () => psql(`SELECT count(*) FROM value_levers WHERE name = '${LEVER.name}'`);

await signIn(MODE === 'steward' ? S_EMAIL : X_EMAIL);
await openPack();
check(await waitFor(`!!${levers}`), `the entry "${ENTRY_NAME}" shows its Value levers block`);

if (MODE === 'steward') {
  check(await ev(`(${levers}).textContent.includes('No lever proposed for this entry yet.')`), '  ...empty, and says so');
  check((await buttonDisabled(levers, 'Add a lever…')) === false, 'S: "Add a lever…" is enabled for the steward');
  await click(levers, 'Add a lever…');
  await waitFor(`!!(${levers}).querySelector('[data-testid=add-lever]')`);
  const form = `(${levers}).querySelector('[data-testid=add-lever]')`;
  check(await ev(`(${form}).textContent.includes('No effect size')`), '  ...the form says a lever carries no effect size');
  await setField(form, 'Lever name', LEVER.name);
  await setField(form, 'Mechanism', 'too short');
  await setField(form, 'Leading indicator', LEVER.leading);
  await setField(form, 'Citation', LEVER.citation);
  await sleep(200);
  check((await buttonDisabled(form, 'Propose the lever')) === true, '  ...a mechanism under 12 characters keeps "Propose the lever" disabled');
  await setField(form, 'Mechanism', LEVER.mechanism);
  await sleep(200);
  await markShot(); await shot('o1_1_add_lever_form', '[data-shot="1"]');
  await click(form, 'Propose the lever');
  check(await waitFor(`!!${leverNamed(LEVER.name)}`), '  ...proposed: the lever appears on the entry');
  const lv = leverNamed(LEVER.name);
  check(await ev(`(${lv}).textContent.includes(${JSON.stringify(LEVER.mechanism)}) && (${lv}).textContent.includes('Moves first: ${LEVER.leading}') && (${lv}).textContent.includes('proposed') && (${lv}).textContent.includes(${JSON.stringify(`Proposed by ${S_NAME}`)})`),
    '  ...with its mechanism, what moves first, status proposed, and who proposed it');
  check(leverRows() === '1', '  ...one row in value_levers', leverRows());
  check(await ev(`(${lv}).textContent.includes('No solution linked yet.')`), '  ...no solution yet, and it says so');
  await click(lv, 'Link a solution…');
  await waitFor(`!!(${lv}).querySelector('[data-testid=link-solution]')`);
  const lf = `(${lv}).querySelector('[data-testid=link-solution]')`;
  await setField(lf, 'Solution', 'skillsoft_compliance_suite');
  await sleep(200);
  check(await ev(`(${lf}).textContent.includes('Can evidence:')`), '  ...choosing a solution shows what it can evidence, before the link');
  await setField(lf, 'Why it pulls this lever', 'Hazard-recognition courses in the compliance suite train exactly this behaviour.');
  await sleep(200);
  await markShot(); await shot('o1_2_link_solution_form', '[data-shot="1"]');
  await click(lf, 'Link the solution');
  check(await waitFor(`[...(${lv}).querySelectorAll('[data-testid=solutions] li')].some(li=>li.textContent.includes(${JSON.stringify(OFFERING_NAME)})&&li.textContent.includes('can evidence:'))`),
    `  ...linked: "${OFFERING_NAME}" shows under the lever, beside what it can evidence`);
  check(psql(`SELECT count(*) FROM lever_offerings lo JOIN value_levers v ON v.id = lo.value_lever_id WHERE v.name = '${LEVER.name}'`) === '1', '  ...one row in lever_offerings');
  check(await ev(`!(${lv}).textContent.includes('No solution linked yet.')`), '  ...and the empty line is gone');
  check(await ev(`!(${levers}).querySelector('[data-testid=add-lever]') && !(${lv}).querySelector('[data-testid=link-solution]')`), '  ...both forms closed on success: the new rows are the confirmation');
  await markShot(); await shot('o1_3_lever_with_solution', '[data-shot="1"]');
  // Withdrawal: a second lever, proposed then withdrawn — it stays, marked.
  const W_NAME = 'A lever the walk withdraws';
  const WHY = 'Walk verification: superseded by a sharper mechanism.';
  await click(levers, 'Add a lever…');
  await waitFor(`!!(${levers}).querySelector('[data-testid=add-lever]')`);
  const f2 = `(${levers}).querySelector('[data-testid=add-lever]')`;
  await setField(f2, 'Lever name', W_NAME);
  await setField(f2, 'Mechanism', LEVER.mechanism);
  await setField(f2, 'Leading indicator', LEVER.leading);
  await setField(f2, 'Citation', LEVER.citation);
  await sleep(200);
  await click(f2, 'Propose the lever');
  await waitFor(`!!${leverNamed(W_NAME)}`);
  const wl = leverNamed(W_NAME);
  await click(wl, 'Withdraw this lever…');
  await waitFor(`!!(${wl}).querySelector('[data-testid=withdraw]')`);
  const wf = `(${wl}).querySelector('[data-testid=withdraw]')`;
  check(await ev(`(${wf}).textContent.includes('not deleted')`), '  ...the withdraw form says it is not deleted');
  await setField(wf, 'Why it is withdrawn', WHY);
  await sleep(200);
  await markShot(); await shot('o1_4a_withdraw_form', '[data-shot="1"]');
  await click(wf, 'Withdraw');
  check(await waitFor(`(${leverNamed(W_NAME)})?.dataset.withdrawn === 'true'`), `  ...withdrawn: "${W_NAME}" is still on the page, marked withdrawn`);
  const wl2 = leverNamed(W_NAME);
  check(await ev(`(${wl2}).textContent.includes(${JSON.stringify(`Withdrawn by ${S_NAME}`)}) && (${wl2}).textContent.includes(${JSON.stringify(WHY)})`), '  ...naming who withdrew it and why');
  check(await ev(`![...(${wl2}).querySelectorAll('button')].some(b=>/Link a solution|Withdraw this lever/.test(b.textContent))`), '  ...and it offers no new link and no second withdrawal');
  check(await ev(`(${levers}).querySelector('span').textContent.includes('1, and 1 withdrawn')`), '  ...the count reads "1, and 1 withdrawn"');
  check(psql(`SELECT status || '|' || (deleted_at IS NOT NULL) || '|' || retirement_reason FROM value_levers WHERE name = '${W_NAME}'`) === `retired|true|${WHY}`, '  ...the row: retired, deleted_at set, the reason as typed');
  check(await ev(`[...(${levers}).querySelectorAll('[data-testid=lever]')].pop().dataset.withdrawn === 'true'`), '  ...listed after the current lever');
  await markShot(); await shot('o1_4b_withdrawn_lever', '[data-shot="1"]');
  await shot('o1_4_pack_page');
} else {
  // nonsteward, and break-gate (the client gate removed: the server's 403 stays).
  const before = leverRows();
  if (MODE === 'nonsteward') {
    check((await buttonDisabled(levers, 'Add a lever…')) === true, 'X: "Add a lever…" is disabled');
    check(await ev(`(${levers}).textContent.includes(${JSON.stringify(`Proposing a value lever is the steward's act — ${S_NAME}'s alone`)})`), `  ...naming the steward (${S_NAME})`);
    const anyLever = `((${levers}).querySelector('[data-testid=lever]'))`;
    if (await ev(`!!${anyLever}`)) {
      check((await buttonDisabled(anyLever, 'Link a solution…')) === true, 'X: "Link a solution…" is disabled');
      check(await ev(`(${anyLever}).textContent.includes(${JSON.stringify(`Linking a solution to a lever is the steward's act — ${S_NAME}'s alone`)})`), '  ...naming the steward');
      check(await ev(`(${anyLever}).querySelectorAll('[data-testid=solutions] li').length >= 1`), '  ...X still READS the lever and its solutions');
      check((await buttonDisabled(anyLever, 'Withdraw this lever…')) === true && (await buttonDisabled(anyLever, 'Withdraw this solution…')) === true
        && await ev(`(${anyLever}).textContent.includes(${JSON.stringify(`Withdrawing a value lever is the steward's act — ${S_NAME}'s alone`)})`),
        'X: "Withdraw this lever…" and "Withdraw this solution…" are disabled, naming the steward');
      check(await ev(`[...(${levers}).querySelectorAll('[data-testid=lever]')].some(l=>l.dataset.withdrawn==='true')`), '  ...X sees the withdrawn lever too');
    } else bad('X: no lever on the entry to check "Link a solution…" against');
    await markShot(); await shot('o1_5_nonsteward', '[data-shot="1"]');
  } else {
    const enabled = (await buttonDisabled(levers, 'Add a lever…')) === false;
    if (!enabled) { bad('break-gate: "Add a lever…" still disabled — the break did not take'); }
    else {
      await click(levers, 'Add a lever…');
      await waitFor(`!!(${levers}).querySelector('[data-testid=add-lever]')`);
      const form = `(${levers}).querySelector('[data-testid=add-lever]')`;
      await setField(form, 'Lever name', 'A lever X should not be able to propose');
      await setField(form, 'Mechanism', LEVER.mechanism);
      await setField(form, 'Leading indicator', LEVER.leading);
      await setField(form, 'Citation', LEVER.citation);
      await sleep(200);
      await click(form, 'Propose the lever');
      check(await waitFor(`(${form}).textContent.includes("Proposing a value lever is the steward's act")`),
        "break-gate: without the client's gate X submits, and the SERVER refuses (403, the steward's act) — the gate is a courtesy, the 403 the authority");
      check(psql("SELECT count(*) FROM value_levers WHERE name = 'A lever X should not be able to propose'") === '0', '  ...nothing written');
      await markShot(); await shot('o1_6_break_gate_refused', '[data-shot="1"]');
    }
  }
  check(leverRows() === before, '  ...value_levers unchanged by X');
}
ws.close();
process.exit(0);
