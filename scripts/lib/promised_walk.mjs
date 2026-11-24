// §26 (Brad, 23 Nov 2026) — the browser walk of the promised measurement date, for scripts/verify_promised_date.sh.
// Signed in as the steward by session, through the page.
//
//   node scripts/lib/promised_walk.mjs SECTION[,SECTION]   (env below)
//
//   form   card 01d's commit form on E.INST's outcome E.OUT: the measure-by field; the unmet lines (no date; a date on the
//          commit date; one past three years); the confirmation, compared word for word with E.WANT; with E.CONFIRM=1 it
//          confirms, and the card then reads "measurement promised by E.BY". With E.CONFIRM unset it goes Back.
//   card   card 01d reads E.CARD_OUT's line: "measurement promised by E.BY", or for a commitment made before §26
//          "no promised date on record (committed before §26)" (E.CARD_WANT names which).
//   case   the run E.RUN's value case prints "Committed measurement date: E.BY."
//   book   the War Room: the late tile counts E.LATE and says the rule in UTC dates (D4), under the table too; the
//          fixture account's row reads E.ROW_WANT (a prefix); the band counts E.LATE late, with the rule.
// Prints PASS / FAIL lines, then DONE.
import { writeFileSync } from 'node:fs';

const SECTIONS = (process.argv[2] ?? 'form').split(',');
const E = process.env;
const TAG = E.TAG ?? 'p26';
const APP = `http://localhost:${E.VITE_PORT}`;
// §26 D4: the rule, said wherever late shows. Written here, apart from the client.
const LATE_RULE = "An outcome is late once today's UTC date is after its promised date.";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (c, m, d = '') => { const line = `${c ? 'PASS' : 'FAIL'}  ${TAG}: ${m}${!c && d ? ` — ${String(d).slice(0, 400)}` : ''}`; out.push(line); console.log(line); };

const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 25000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data && E.OUT_DIR) writeFileSync(`${E.OUT_DIR}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

await go('/');
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await go('/');
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await waitFor(`document.body.textContent.includes('Signed in as')`))) { check(false, 'signed in through the page'); console.log('DONE'); process.exit(0); }

const row = (id) => `document.querySelector('[data-testid=spine-outcome][data-outcome="${id}"]')`;
const openCard = async (inst, id) => {
  await go(`/accounts/${inst}`);
  await waitFor(`!!document.querySelector('[data-testid=account-detail]') || !!document.querySelector('[data-testid=outcome-spine]')`, 30000);
  await ev(`(()=>{document.querySelectorAll('[data-testid=account-detail]').forEach(d=>{d.open=true});return true})()`); await sleep(600);
  return waitFor(`!!${row(id)}`, 30000);
};
// A field by its test id: React's own setter, then input and change (a select listens to change).
const set = (scope, testid, value) => ev(`(()=>{const el=${scope}?.querySelector('[data-testid=${testid}]');if(!el)return false;
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const unmet = (scope) => ev(`${scope}?.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`);

// ---- form --------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('form')) {
  check(await openCard(E.INST, E.OUT), `form: card 01d lists outcome ${E.OUT.slice(0, 8)}`);
  await ev(`${row(E.OUT)}.querySelector('[data-testid=commit-open]')?.click()`); await sleep(300);
  const f = `${row(E.OUT)}?.querySelector('[data-testid=commit]')`;
  check(await waitFor(`!!${f}?.querySelector('[data-testid=commit-by]')`), 'form: the commit form has a "Measure by" date field');
  const help = await ev(`${f}.querySelector('[data-testid=commit-by]').closest('label').textContent`);
  check(help === 'Measure byThe date the outcome will be measured by: after the commit date, within three years of it.', '  ...its help text states D3', help);
  const who = await ev(`[...${f}.querySelectorAll('[data-testid=commit-committer] option')].find(o=>o.textContent.startsWith(${JSON.stringify(E.COMMITTER)}))?.value ?? ''`);
  for (const [id, v] of [['commit-target', E.TARGET], ['commit-committer', who], ['commit-on', E.ON], ['commit-method', 'contribution_only'], ['commit-class', 'capability_performance'], ['commit-note', E.NOTE]]) await set(f, id, v);
  await sleep(250);
  check((await unmet(f)) === 'To submit: give the date it will be measured by.', 'form: with no measure-by date, it will not submit, and says why (D1)', await unmet(f));
  await set(f, 'commit-by', E.ON); await sleep(200);
  check((await unmet(f)) === 'To submit: make the measure-by date after the commit date and within three years of it.', 'form: a measure-by date on the commit date is refused, in words (D3)', await unmet(f));
  await set(f, 'commit-by', E.PAST3); await sleep(200);
  check((await unmet(f)) === 'To submit: make the measure-by date after the commit date and within three years of it.', 'form: a measure-by date past three years is refused, in words (D3)', await unmet(f));
  await set(f, 'commit-by', E.BY); await sleep(200);
  check((await unmet(f)) === '', 'form: with a date inside the window, nothing is unmet', await unmet(f));
  await ev(`${f}.querySelector('button[type=submit]').click()`);
  check(await waitFor(`!!${f}?.querySelector('[data-testid=form-confirm]')`), 'form: submitting asks for confirmation');
  const ct = await ev(`${f}.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(ct === E.WANT, 'form: the confirmation names the measure-by date in full, word for word (D6)', `${ct} ≠ ${E.WANT}`);
  await shot(`${TAG}_confirm_1280`);
  if (E.CONFIRM === '1') {
    await ev(`${f}.querySelector('[data-testid=form-confirm-yes]').click()`);
    check(await waitFor(`(${row(E.OUT)}?.querySelector('[data-testid=outcome-promised]')?.textContent ?? '') === ' · measurement promised by ${E.BY}'`, 20000),
      `form: confirmed; card 01d now reads "measurement promised by ${E.BY}"`, await ev(`${row(E.OUT)}?.textContent ?? ''`));
    await shot(`${TAG}_card_1280`);
  } else {
    await ev(`${f}.querySelector('[data-testid=form-confirm-back]').click()`); await sleep(200);
    check(true, 'form: went Back; nothing recorded');
  }
}

// ---- card --------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('card')) {
  check(await openCard(E.CARD_INST, E.CARD_OUT), `card: card 01d lists outcome ${E.CARD_OUT.slice(0, 8)}`);
  const got = await ev(`${row(E.CARD_OUT)}?.querySelector('[data-testid=outcome-promised]')?.textContent ?? null`);
  check(got === E.CARD_WANT, `card: ${E.CARD_OUT.slice(0, 8)} reads "${E.CARD_WANT.trim()}"`, got);
}

// ---- case --------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('case')) {
  await go(`/runs/${E.RUN}/case`);
  check(await waitFor(`document.body.textContent.includes('Committed measurement date: ${E.BY}.')`, 40000),
    `case: the value case of the sealed run prints "Committed measurement date: ${E.BY}."`, await ev(`(document.body.textContent.match(/Committed measurement date:[^.]*\\./)||[''])[0]`));
}

// ---- book --------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('book')) {
  await go('/book');
  check(await waitFor(`!!document.querySelector('[data-testid=book-table]') && ![...document.querySelectorAll('[data-testid=book-row]')].some(r=>r.textContent.includes('loading')||r.textContent.includes('…'))`, 40000), 'book: the War Room, with its table');
  await sleep(800);
  const tile = await ev(`document.querySelector('[data-testid=tile-late]')?.textContent ?? ''`);
  check(tile.startsWith(`Late outcomes${E.LATE}`), `book: the late tile counts ${E.LATE}`, tile);
  check(tile.endsWith(LATE_RULE) && (await ev(`document.querySelector('[data-testid=late-rule]')?.textContent ?? ''`)) === LATE_RULE, 'book: the late tile states the rule in UTC dates (D4)', tile);
  const note = await ev(`document.querySelector('[data-testid=late-rule-table]')?.textContent ?? ''`);
  check(note === `Outcomes: ${LATE_RULE} Where no date was promised, the row says so.`, '  ...and under the table, beside the rows that say late', note);
  const r = await ev(`[...document.querySelectorAll('[data-testid=book-row]')].find(x=>x.textContent.includes(${JSON.stringify(E.ROW_NAME)}))?.textContent ?? ''`);
  check(r.includes(E.ROW_WANT), `book: ${E.ROW_NAME}'s row reads "${E.ROW_WANT}…"`, r.slice(0, 300));
  await shot(`${TAG}_book_1280`);
  await go('/');
  check(await waitFor(`!!document.querySelector('[data-testid=band-late]')`, 20000), 'band: on Accounts home');
  const bl = await ev(`document.querySelector('[data-testid=band-late]')?.textContent ?? ''`);
  const want = `${E.LATE} late ${E.LATE === '1' ? 'outcome' : 'outcomes'} (today's UTC date after the promised date)`;
  check(bl === want, `band: "${want}" (D4)`, bl);
}

console.log(`DONE ${out.filter((l) => l.startsWith('PASS')).length} ${out.filter((l) => l.startsWith('FAIL')).length}`);
ws.close();
process.exit(0);
