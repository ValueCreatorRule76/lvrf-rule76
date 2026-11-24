// S6 (3.1; LVRF_PLAN §25) — the browser walk for scripts/verify_s6_war_room.sh, over the Chrome DevTools Protocol.
// Signs in THROUGH THE PAGE as the steward, by session; THROWAWAY CLONE ONLY. Prints PASS/FAIL lines, and DONE.
//
//   node scripts/lib/s6_walk.mjs SECTIONS     SECTIONS: a comma list of
//     empty     the book with no member (prod's shape): the tile, the note, "Not in the book", the gap, the band
//     book      each row and each tile against SQL (EXP) and against book confidence (GET /api/cohort); the frame's
//               own run on a row; "late" vs "No promised date on record", never "on time"; the account in focus kept
//     band      the Accounts home band: the same counts, hypotheses due in words, confirmed and refuted together
//     money     D1: no money on the War Room or the band (text), nor in GET /api/book (every key and every string)
//     phone     at 390: cards, not the table; no sideways scroll on the War Room or the home
//     keys      Tab reaches every row's account and the band's link, each with the gold ring
//     contrast  every text on the War Room and in the band at AA, computed
//
// Env: VITE_PORT CDP_PORT OUT S_EMAIL PW EXP (JSON from SQL) TAG.
import { readFileSync, writeFileSync } from 'node:fs';

const SECTIONS = (process.argv[2] ?? 'book').split(',');
const E = process.env;
const EXP = JSON.parse(readFileSync(E.EXP, 'utf8'));
const TAG = E.TAG ?? 's6';
// §28 D5 (Brad, 24 Nov 2026): late is Anywhere on Earth, said wherever late shows. Written here, apart from the client.
const LATE_RULE = 'late: the promised day has ended everywhere';
const APP = `http://localhost:${E.VITE_PORT}`;
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
const size = async (width) => { await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }); await sleep(250); };
const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(100); };
const shot = async (name, width = 1280) => {
  await size(width); const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 6000), deviceScaleFactor: 1, mobile: width < 600 }); await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) writeFileSync(`${E.OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  await size(width);
};
await send('Page.enable'); await send('Runtime.enable'); await size(1280);
// Sign in through the page.
await go('/');
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await go('/');
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await waitFor(`document.body.textContent.includes('Signed in as')`))) { check(false, 'signed in through the page'); console.log('DONE'); process.exit(0); }

const T = (sel) => `(document.querySelector(${JSON.stringify(sel)})?.textContent ?? null)`;
const bookReady = EXP.members.length === 0
  ? `!!document.querySelector('[data-testid=war-room]') && !!document.querySelector('[data-testid=book-empty-note]')`
  : `!!document.querySelector('[data-testid=war-room]') && document.querySelectorAll('[data-testid=book-row]').length === ${EXP.members.length} && ![...document.querySelectorAll('[data-testid=book-row]')].some(r=>r.textContent.includes('loading')||r.textContent.includes('…'))`;
const openBook = async () => { await go('/book'); const ok = await waitFor(bookReady, 40000); await sleep(800); return ok; };
const BAND = (b) => b.charAt(0).toUpperCase() + b.slice(1);
// D1: a money symbol, a money word, or an amount with a money scale.
const MONEY_TEXT = /[$€£¥]|\bUSD\b|\bEUR\b|\bGBP\b|\bNPV\b|\bARR\b|\brevenue\b|\bportfolio value\b|\b\d[\d,.]*\s?(k|m|bn|million|billion|thousand)\b/i;
const MONEY_KEY = /amount|currency|impact|npv|revenue|price|money|usd|dollar|monetization|(^|_)rate($|_)|(^|_)value_(usd|money)/i;

// ---- empty -------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('empty')) {
  check(await openBook(), 'empty: the War Room opens, from its own route');
  check((await ev(T('[data-testid=tile-accounts]'))).includes('0'), 'empty: "In the book" is 0', await ev(T('[data-testid=tile-accounts]')));
  check(await ev(`document.querySelector('[data-testid=book-confidence]')?.dataset.floor`) === 'empty' && (await ev(T('[data-testid=book-confidence]'))).startsWith('No live customer engagements yet.'),
    'empty: book confidence says "No live customer engagements yet.", never 0', await ev(T('[data-testid=book-confidence]')));
  check((await ev(`!!document.querySelector('[data-testid=book-empty-note]')`)) && !(await ev(`!!document.querySelector('[data-testid=book-table]')`)), '  ...with its note, and no table');
  const rows = await ev(`[...document.querySelectorAll('[data-testid=not-in-book-row]')].map(r=>({name:r.querySelector('span').textContent,reason:r.dataset.reason,text:r.textContent,href:r.querySelector('a')?.getAttribute('href')}))`);
  const want = EXP.outside.map((o) => ({ name: o.name, reason: o.reason }));
  check(JSON.stringify(rows.map((r) => ({ name: r.name, reason: r.reason }))) === JSON.stringify(want), `empty: "Not in the book" lists ${want.map((w) => w.name).join(', ')}, each with its reason`, JSON.stringify(rows));
  check(rows.every((r) => /^\/accounts\/[0-9a-f-]{36}$/.test(r.href ?? '')) && rows.filter((r) => r.reason === 'reference_example').every((r) => r.text.includes('A reference example (')), '  ...each linked; a reference example names its kind');
  check((await ev(T('[data-testid=confirmation-gap-state]'))) === 'Not reported: 0 verified outcomes in the book; it needs 5.', 'empty: the confirmation gap: "Not reported: 0 verified outcomes in the book; it needs 5."', await ev(T('[data-testid=confirmation-gap-state]')));
  await waitFor(`!!document.querySelector('[data-testid=book-scope]')`, 20000);
  check((await ev(`!!document.querySelector('[data-testid=book-scope]')`)) && !(await ev(`!!document.querySelector('[data-testid=war-room] [data-testid=book-empty]')`)), "empty: book confidence's detail is here, with no second headline (D6)");
  await shot(`${TAG}_book_empty_1280`);
  await go('/');
  check(await waitFor(`!!document.querySelector('[data-testid=band-empty]')`, 20000) && (await ev(T('[data-testid=band-empty]'))) === 'No live customer engagements yet', 'empty: the band says "No live customer engagements yet"', await ev(T('[data-testid=book-band]')));
  check(!(await ev(`!!document.querySelector('[data-testid=accounts-home] [data-testid=book-scope]')`)), "empty: book confidence's card is no longer on Accounts home (D6)");
  await shot(`${TAG}_home_band_empty_1280`);
}

// ---- book --------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('book')) {
  if (EXP.focus) {
    await go(`/accounts/${EXP.focus}`);
    await waitFor(`document.querySelector('[data-testid=account-frame]')?.dataset.account === ${JSON.stringify(EXP.focus)} && !!document.querySelector('[data-testid=frame-name]')`, 30000);
  }
  check(await openBook(), `book: the War Room opens with ${EXP.members.length} rows`);
  // Membership: the same as book confidence's (GET /api/cohort), and as SQL; never the tenant's own or a reference example.
  const cohortIds = await ev(`fetch('/api/cohort').then(r=>r.json()).then(c=>[...new Set(c.book.members.map(m=>m.institution_id))].sort())`);
  const rowIds = (await ev(`[...document.querySelectorAll('[data-testid=book-row]')].map(r=>r.dataset.account)`)).sort();
  check(JSON.stringify(rowIds) === JSON.stringify(cohortIds) && JSON.stringify(rowIds) === JSON.stringify(EXP.members.map((m) => m.id).sort()),
    `book: its rows are book confidence's members, and SQL's (${rowIds.length})`, JSON.stringify({ rowIds, cohortIds }));
  check(!EXP.outside.some((o) => rowIds.includes(o.id)), "book: neither the tenant's own account nor a reference example is a row");
  for (const m of EXP.members) {
    const r = await ev(`(()=>{const r=document.querySelector('[data-testid=book-row][data-account=${JSON.stringify(m.id)}]');if(!r)return null;const t=(s)=>r.querySelector(s)?.textContent??null;
      return {name:t('[data-testid=book-row-name]'),stage:t('[data-testid=book-row-stage]'),conf:t('[data-testid=book-row-confidence]'),due:t('[data-testid=book-row-due]'),cr:t('[data-testid=book-row-cr]'),
        outcomes:t('[data-testid=book-row-outcomes]'),delay:r.querySelector('[data-testid=row-delay]')?.dataset.state??null,delayText:t('[data-testid=row-delay]'),standing:t('[data-testid=book-row-standing]'),focus:r.dataset.focus,text:r.textContent}})()`);
    const W = `book, ${m.name}`;
    if (!r) { check(false, `${W}: its row`); continue; }
    check(r.name === m.name, `${W}: the row names the account`, r.name);
    check(r.due === `${m.due30} · ${m.due60} · ${m.due90}` + (m.past_due > 0 ? `${m.past_due} past due` : ''), `${W}: hypotheses due ${m.due30} · ${m.due60} · ${m.due90} (open, by falsifier date, SQL)`, r.due);
    check(r.cr === `${m.confirmed} · ${m.refuted}`, `${W}: confirmed · refuted ${m.confirmed} · ${m.refuted} (the database's verdict)`, r.cr);
    const wantOut = m.outcomes === 0 ? 'No outcome yet' : m.late > 0 ? `${m.late} late: the promised day, ` : m.measured ? 'Measured ' : m.promised_future ? 'Not yet due: promised ' : 'No promised date on record';
    check(r.outcomes?.startsWith(wantOut), `${W}: outcomes read "${wantOut}${wantOut.endsWith(' ') ? '…' : ''}"`, r.outcomes);
    check(!/on time/i.test(r.text), `${W}: never "on time" (D5)`);
    if (m.head) {
      check(r.conf === `Run ${m.head.run_number}: ${Number(m.head.score)} / 100 · ${BAND(m.head.band)}`, `${W}: confidence names its run: "Run ${m.head.run_number}: ${Number(m.head.score)} / 100 · ${BAND(m.head.band)}"`, r.conf);
      check(r.stage === m.head.stage_label, `${W}: stage reached "${m.head.stage_label}" (the run's own stage)`, r.stage);
      check(r.delay === (m.head.cod ?? 'not_sealed'), `${W}: cost of delay "${m.head.cod ?? 'not_sealed'}", by word and link, no figure (D3)`, `${r.delay}: ${r.delayText}`);
    } else {
      check(r.conf === m.no_confidence && r.delay === 'none', `${W}: "${m.no_confidence}", and no case yet`, `${r.conf} | ${r.delay}`);
    }
    check((r.focus === 'true') === (m.id === EXP.focus), `${W}: ${m.id === EXP.focus ? 'marked "In focus" (the frame kept)' : 'not marked in focus'}`, r.focus);
  }
  // The War Room and the frame never say two things: the focused account's row against its own frame.
  if (EXP.focus) {
    const fr = await ev(`(()=>{const f=document.querySelector('[data-testid=account-frame] [data-testid=frame-desktop]');return f?{run:f.querySelector('[data-testid=frame-confidence-run]')?.textContent??null,badge:f.querySelector('[data-testid=frame-confidence] [data-testid=confidence-badge]')?.textContent??null,standing:f.querySelector('[data-testid=frame-standing]')?.textContent}:null})()`);
    const row = await ev(`(()=>{const r=document.querySelector('[data-testid=book-row][data-account=${JSON.stringify(EXP.focus)}]');return {conf:r.querySelector('[data-testid=book-row-confidence]').textContent,standing:r.querySelector('[data-testid=book-row-standing]')?.textContent}})()`);
    check(fr && row && (fr.badge === null ? !row.conf.includes('/ 100') : row.conf.endsWith(fr.badge) && fr.run.includes(`run ${row.conf.match(/^Run (\d+)/)?.[1]}:`)) && fr.standing === row.standing,
      'book: the focused row and the frame above it name the same run, score and next step', JSON.stringify({ fr, row }));
    check(await ev(`document.querySelector('[data-testid=account-frame]')?.dataset.account === ${JSON.stringify(EXP.focus)} && !document.querySelector('[data-testid=frame-switched]')`), 'book: the War Room keeps the account in focus, nothing announced');
  }
  // The tiles.
  const tiles = await ev(`(()=>{const t=(s)=>document.querySelector(s)?.textContent??null;return {acc:t('[data-testid=tile-accounts]'),conf:t('[data-testid=book-confidence]'),floor:document.querySelector('[data-testid=book-confidence]')?.dataset.floor,due:t('[data-testid=tile-due]'),cr:t('[data-testid=tile-cr]'),late:t('[data-testid=tile-late]'),status:t('[data-testid=book-status-line]')}})()`);
  check(tiles.acc === `In the book${EXP.members.length}customer accounts` || tiles.acc === `In the book${EXP.members.length}customer accounts`, `book: "In the book" ${EXP.members.length}`, tiles.acc);
  check(tiles.floor === EXP.floor, `book: book confidence's floor is "${EXP.floor}", as GET /api/cohort's (the weakest member)`, tiles.floor);
  if (EXP.floor === 'run') check(tiles.conf.startsWith(`${Number(EXP.floor_score)} / 100 · ${BAND(EXP.floor_band)}`), `book: book confidence ${Number(EXP.floor_score)} / 100 · ${BAND(EXP.floor_band)}, set by the weakest member`, tiles.conf);
  if (EXP.floor === 'unmeasured') check(tiles.conf.startsWith('Not measured') && EXP.unmeasured.every((u) => tiles.conf.includes(u)) && !/^\d/.test(tiles.conf), `book: book confidence "Not measured", naming ${EXP.unmeasured.join(' and ')}; never a number nobody measured`, tiles.conf);
  const sum = (k) => EXP.members.reduce((a, m) => a + m[k], 0);
  check(tiles.due === `Hypotheses due${sum('due30')} in 30 days · ${sum('due60')} in 60 · ${sum('due90')} in 90` || tiles.due.startsWith(`Hypotheses due${sum('due30')} in 30 days · ${sum('due60')} in 60 · ${sum('due90')} in 90`), `book: hypotheses due in words: "${sum('due30')} in 30 days · ${sum('due60')} in 60 · ${sum('due90')} in 90"`, tiles.due);
  check(tiles.cr === `Confirmed · refuted${sum('confirmed')} confirmed · ${sum('refuted')} refuted${sum('open')} open`, `book: "${sum('confirmed')} confirmed · ${sum('refuted')} refuted", ${sum('open')} open`, tiles.cr);
  check(tiles.late === `Late outcomes${sum('late')}${sum('no_promise')} with no promised date on record.Counted as ${LATE_RULE}.`, `book: late outcomes ${sum('late')}, ${sum('no_promise')} with no promised date on record, and the rule in UTC dates (§26 D4)`, tiles.late);
  check(tiles.status === `Outcomes by status: ${EXP.status_line}. Counts only: the War Room never sums or averages money across accounts.`, `book: outcomes by status "${EXP.status_line}", counts only`, tiles.status);
  check((await ev(T('[data-testid=confirmation-gap-state]'))) === `Not reported: ${EXP.verified} verified ${EXP.verified === 1 ? 'outcome' : 'outcomes'} in the book; it needs 5.`, `book: the confirmation gap refuses at ${EXP.verified} verified (it needs 5)`, await ev(T('[data-testid=confirmation-gap-state]')));
  await waitFor(`!!document.querySelector('[data-testid=book-scope]')`, 20000);
  check((await ev(`!!document.querySelector('[data-testid=book-scope]')`)) && !(await ev(`!!document.querySelector('[data-testid=war-room] [data-testid=book-empty]')`)), "book: book confidence's detail (members and industries) is here, with no second headline (D6)");
  await shot(`${TAG}_book_1280`);
}

// ---- band --------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('band')) {
  await go('/');
  check(await waitFor(`!!document.querySelector('[data-testid=band-accounts]') && !!document.querySelector('[data-testid=book-confidence]')`, 20000), 'band: the book band is on Accounts home');
  const b = await ev(`(()=>{const t=(s)=>document.querySelector(s)?.textContent??null;return {acc:t('[data-testid=band-accounts]'),conf:t('[data-testid=band-confidence]'),due:t('[data-testid=band-due]'),cr:t('[data-testid=band-cr]'),late:t('[data-testid=band-late]'),href:document.querySelector('[data-testid=band-open]')?.getAttribute('href')}})()`);
  const sum = (k) => EXP.members.reduce((a, m) => a + m[k], 0);
  check(b.acc === `${EXP.members.length} customer ${EXP.members.length === 1 ? 'account' : 'accounts'}`, `band: ${EXP.members.length} customer accounts`, b.acc);
  check(EXP.floor === 'unmeasured' ? b.conf === 'Book confidence Not measured' : b.conf === `Book confidence ${Number(EXP.floor_score)} / 100 · ${BAND(EXP.floor_band)}`, 'band: book confidence once, in the one format', b.conf);
  check(b.due === `Hypotheses due ${sum('due30')} in 30 days · ${sum('due60')} in 60 · ${sum('due90')} in 90`, 'band: hypotheses due in words (Brad, 20 Nov 2026)', b.due);
  check(b.cr === `${sum('confirmed')} confirmed · ${sum('refuted')} refuted`, 'band: confirmed and refuted together, never refuted alone (Brad, 20 Nov 2026)', b.cr);
  check(b.late === `${sum('late')} late ${sum('late') === 1 ? 'outcome' : 'outcomes'} (${LATE_RULE})`, `band: ${sum('late')} late, with the rule, Anywhere on Earthtes (§26 D4)`, b.late);
  check(b.href === '/book', 'band: "Open the War Room" links to /book');
  check(!(await ev(`!!document.querySelector('[data-testid=accounts-home] [data-testid=book-scope]')`)), "band: book confidence's card is no longer on Accounts home (D6)");
  await shot(`${TAG}_home_band_1280`);
  await ev(`document.querySelector('[data-testid=band-open]').click()`);
  check(await waitFor(`location.pathname==='/book' && !!document.querySelector('[data-testid=war-room]')`, 15000), 'band: the link opens the War Room');
  await go('/');
  await waitFor(`!!document.querySelector('[data-testid=book-band]')`);
  await ev(`[...document.querySelectorAll('[data-testid=header-desktop] nav a')].find(a=>a.textContent.trim()==='War Room').click()`);
  check(await waitFor(`location.pathname==='/book'`, 15000), 'band: "War Room" is in the main navigation, after Accounts');
  check(JSON.stringify(await ev(`[...document.querySelectorAll('[data-testid=header-desktop] nav a')].map(a=>a.textContent.trim())`)) === JSON.stringify(['Accounts', 'War Room', 'Packs', 'Runs', 'Policies']), '  ...in the order Accounts, War Room, Packs, Runs, Policies');
}

// ---- money (D1) --------------------------------------------------------------------------------------------------
if (SECTIONS.includes('money')) {
  await openBook();
  const page = await ev(`document.body.innerText`);
  check(!MONEY_TEXT.test(page), 'money: no money on the War Room: no currency symbol, money word or money amount, per row or in total (D1)', (page.match(MONEY_TEXT) || [''])[0]);
  await go('/'); await waitFor(`!!document.querySelector('[data-testid=book-band]') && !document.querySelector('[data-testid=book-band]').textContent.includes('loading')`);
  const band = await ev(T('[data-testid=book-band]'));
  check(!MONEY_TEXT.test(band), 'money: none in the band either', (band.match(MONEY_TEXT) || [''])[0]);
  const api = await ev(`fetch('/api/book').then(r=>r.text())`);
  const keys = []; const strings = [];
  const walk = (v, path) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.push(`${path}.${k}`); walk(x, `${path}.${k}`); } else if (typeof v === 'string') strings.push(v); };
  walk(JSON.parse(api), '');
  const badKeys = keys.filter((k) => MONEY_KEY.test(k.split('.').pop()));
  check(badKeys.length === 0, `money: GET /api/book carries no money field (${keys.length} keys read)`, JSON.stringify(badKeys.slice(0, 5)));
  const badStrings = strings.filter((s) => MONEY_TEXT.test(s) && !/^[0-9a-f-]{36}$/.test(s));
  check(badStrings.length === 0, `money: and no string in it names money (${strings.length} strings read)`, JSON.stringify(badStrings.slice(0, 5)));
  check(!/"(amount|currency|rate)"/.test(api), '  ...not even inside a sealed cost of delay: its state and reasons only');
}

// ---- phone -------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('phone')) {
  await size(390);
  await openBook().catch(() => null); await waitFor(`!!document.querySelector('[data-testid=war-room]')`); await sleep(1500);
  const p = await ev(`(()=>{const v=(el)=>!!el&&el.getClientRects().length>0;return {sw:document.documentElement.scrollWidth,cards:document.querySelectorAll('[data-testid=book-card]').length,table:v(document.querySelector('[data-testid=book-table]'))}})()`);
  check(p.sw <= 390, `phone: the War Room, no sideways scroll (scrollWidth ${p.sw})`);
  if (EXP.members.length > 0) check(p.cards === EXP.members.length && !p.table, `phone: one card per account (${p.cards}), the table not shown`, JSON.stringify(p));
  await shot(`${TAG}_book_390`, 390);
  await go('/'); await waitFor(`!!document.querySelector('[data-testid=book-band]')`); await sleep(1500);
  check(await ev('document.documentElement.scrollWidth') <= 390, `phone: Accounts home with the band, no sideways scroll`);
  await shot(`${TAG}_home_band_390`, 390);
  await size(1280);
}

// ---- keys --------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('keys')) {
  await openBook();
  await ev('window.scrollTo(0,0); document.activeElement && document.activeElement.blur(); true');
  const seen = new Set(); const ring = [];
  for (let i = 0; i < 80; i++) {
    await key('Tab', 'Tab', 9);
    const r = await ev(`(()=>{const el=document.activeElement;if(!el||!el.matches('[data-testid=book-row-name]'))return null;const s=getComputedStyle(el);return {id:el.closest('[data-testid=book-row]').dataset.account,ok:el.matches(':focus-visible')&&s.outlineStyle!=='none'&&/rgb\\(201, 162, 74\\)/.test(s.outlineColor)}})()`);
    if (r && !seen.has(r.id)) { seen.add(r.id); ring.push(r.ok); }
  }
  check(EXP.members.every((m) => seen.has(m.id)), `keys: Tab reaches every row's account (${seen.size} of ${EXP.members.length})`);
  check(ring.length > 0 && ring.every(Boolean), '  ...each with the gold focus ring');
  await go('/'); await waitFor(`!!document.querySelector('[data-testid=band-open]')`);
  await ev(`document.querySelector('[data-testid=band-open]').focus()`); await key('Enter', 'Enter', 13);
  check(await waitFor(`location.pathname==='/book'`, 10000), 'keys: the band\'s link opens by Enter');
}

// ---- contrast ----------------------------------------------------------------------------------------------------
const CONTRAST = (scope) => `(()=>{const cs=(e)=>getComputedStyle(e);const v=(el)=>{if(!el.getClientRects().length)return false;for(let e=el;e;e=e.parentElement){const s=cs(e);if(s.display==='none'||s.visibility==='hidden')return false}return true};
  const rgb=(s)=>{const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x));return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
  const lum=(c)=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
  const bgOf=(el)=>{for(let e=el;e;e=e.parentElement){const c=rgb(cs(e).backgroundColor);if(c&&c.a>0)return c}return {r:255,g:255,b:255,a:1}};
  const bad=[];let checked=0;for(const root of document.querySelectorAll(${JSON.stringify(scope)}))for(const el of [root,...root.querySelectorAll('*')]){if(!v(el))continue;
  const own=[...el.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('').trim();if(!own)continue;const fg=rgb(cs(el).color);if(!fg)continue;const bg=bgOf(el);checked++;
  const L1=lum(fg),L2=lum(bg);const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);const px=parseFloat(cs(el).fontSize),bold=Number(cs(el).fontWeight)>=600;
  const need=(px>=24||(px>=18.66&&bold))?3:4.5;if(ratio+1e-9<need)bad.push({t:own.slice(0,40),r:Math.round(ratio*100)/100})}return {checked,bad}})()`;
if (SECTIONS.includes('contrast')) {
  await openBook();
  const c1 = await ev(CONTRAST('[data-testid=war-room]'));
  check(c1.checked > 10 && c1.bad.length === 0, `contrast: every text on the War Room at AA (${c1.checked})`, JSON.stringify(c1.bad));
  await go('/'); await waitFor(`!!document.querySelector('[data-testid=band-open]')`); await sleep(800);
  const c2 = await ev(CONTRAST('[data-testid=book-band]'));
  check(c2.checked > 2 && c2.bad.length === 0, `contrast: every text in the band at AA, on ink (${c2.checked})`, JSON.stringify(c2.bad));
}

console.log(`DONE ${out.filter((l) => l.startsWith('PASS')).length} ${out.filter((l) => l.startsWith('FAIL')).length}`);
ws.close();
process.exit(0);
