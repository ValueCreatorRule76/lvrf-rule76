// S5 (3.1; LVRF_PLAN §24) — the browser walk for scripts/verify_s5_account_frame.sh, over the Chrome DevTools Protocol.
// Signs in THROUGH THE PAGE as the steward, by session; THROWAWAY CLONE ONLY. Prints PASS/FAIL lines.
//
//   node scripts/lib/s5_walk.mjs SECTIONS     SECTIONS: a comma list of
//     frame     the frame on every account page, each field read against the record (EXP, from SQL) and the workspace
//     held      focus held across Runs, Packs, Policies, the home and a lineage row; no frame read on navigation (D4);
//               Runs filtered with "Show every account's runs" (D3); the pack classified into, marked
//     shared    a shared link to another account's run: the frame switches and says so once; never the run under the
//               held account (watched at every DOM change); "Back to …"
//     leave     "Leave the account" clears the focus (desktop and phone)
//     tabs      two tabs hold two accounts (D1)
//     phone     at 390, the one-line frame and no sideways scroll on any page, closed and open
//     keys      keyboard: every frame control reachable by Tab, with the gold focus ring; the phone toggle by Enter
//     contrast  every text in the frame, its notice and its classify panel at AA, computed
//     print     the frame and its notice never print (print media, and the PDF's text)
//     classify  D6: "Classify as…" only on an unclassified customer account; S1's form and act, through the page
//     classified  (after classify) no "Classify as…" on the account now classified
//
// Env: VITE_PORT CDP_PORT OUT S_EMAIL PW EXP (a JSON file: the accounts' facts from SQL) TAG (a label for the lines).
import { readFileSync, writeFileSync } from 'node:fs';

const SECTIONS = (process.argv[2] ?? 'frame').split(',');
const E = process.env;
const EXP = JSON.parse(readFileSync(E.EXP, 'utf8'));
const TAG = E.TAG ?? 's5';
const APP = `http://localhost:${E.VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (c, m, d = '') => { const line = `${c ? 'PASS' : 'FAIL'}  ${TAG}: ${m}${!c && d ? ` — ${String(d).slice(0, 400)}` : ''}`; out.push(line); console.log(line); };

// One CDP connection per tab.
async function tab() {
  const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let n = 0; const pend = new Map(); const requests = []; const failures = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    if (m.method === 'Network.loadingFailed') failures.push({ id: m.params.requestId, err: m.params.errorText, blocked: m.params.blockedReason ?? null, canceled: m.params.canceled ?? false, t: Date.now() });
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') failures.push({ console: m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200), t: Date.now() });
  });
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const waitFor = async (expr, ms = 20000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
  const size = async (width) => { await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }); await sleep(250); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await size(1280);
  const key = async (k, code, vk, shift = false) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0, ...(k === 'Enter' ? { text: '\r' } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 }); await sleep(120);
  };
  const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
  const shot = async (name, width = 1280) => {
    await size(width);
    const h = await ev('document.documentElement.scrollHeight');
    await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 6000), deviceScaleFactor: 1, mobile: width < 600 }); await sleep(300);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) writeFileSync(`${E.OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
    await size(width);
  };
  return { ws, send, ev, waitFor, size, key, go, shot, requests, failures, close: () => { ws.close(); return fetch(`http://127.0.0.1:${E.CDP_PORT}/json/close/${t.id}`).catch(() => null); } };
}

const T = await tab();
// Sign in through the page.
await T.go('/');
await T.ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await T.go('/');
await T.waitFor(`!!document.querySelector('input[type=password]')`);
await T.ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await T.ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await T.waitFor(`document.body.textContent.includes('Signed in as')`))) { check(false, 'signed in through the page'); console.log(out.join('\n')); process.exit(0); }

// ---- in-page readers ------------------------------------------------------------------------------------------------
const FRAME = `document.querySelector('[data-testid=account-frame]')`;
const vis = `(el)=>{if(!el)return false;const r=el.getClientRects();if(!r.length)return false;for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden')return false}return true}`;
const readFrame = (scope) => `(()=>{const v=${vis};const f=${FRAME};if(!f)return null;const root=f.querySelector('[data-testid=${scope}]');if(!root)return {account:f.dataset.account,pending:!!f.querySelector('[data-testid=frame-pending]')};
  const t=(s)=>root.querySelector(s)?.textContent??null;
  return {account:f.dataset.account, shown:v(root), name:t('[data-testid=frame-name]')??root.querySelector('summary .truncate')?.textContent??null,
    pack:t('[data-testid=frame-pack]'), reference:t('[data-testid=frame-reference]'), run:t('[data-testid=frame-confidence-run]'),
    badge:t('[data-testid=frame-confidence] [data-testid=confidence-badge]'), confidence:t('[data-testid=frame-confidence]'), standing:t('[data-testid=frame-standing]'),
    classify:!!root.querySelector('[data-testid=frame-classify-open]'),
    pages:[...root.querySelectorAll('[data-page]')].map(a=>({key:a.dataset.page,label:a.textContent,href:a.getAttribute('href'),current:a.getAttribute('aria-current'),off:a.dataset.off==='true'})),
    text:f.textContent, notice:document.querySelector('[data-testid=frame-switched]')?.textContent??null}})()`;
const frameReady = (id) => `(()=>{const f=${FRAME};return !!f&&f.dataset.account===${JSON.stringify(id)}&&!!f.querySelector('[data-testid=frame-name]')})()`;
const noFrame = `!${FRAME}`;
const held = `(()=>{try{return sessionStorage.getItem('lvrf:account-focus')}catch{return 'unavailable'}})()`;
const clickText = (scope, text, tag = 'a') => `(()=>{const root=${scope}||document;const el=[...root.querySelectorAll(${JSON.stringify(tag)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!el)return false;el.click();return true})()`;
const navClick = (label) => clickText(`document.querySelector('[data-testid=header-desktop] nav')`, label);
const frameClick = (key) => `(()=>{const el=[...document.querySelectorAll('[data-testid=frame-desktop] [data-page=${key}]')][0];if(!el||el.tagName!=='A')return false;el.click();return true})()`;
const loaded = {
  workspace: `!!document.querySelector('[data-testid=workspace]') && !!document.querySelector('[data-testid=ws-confidence]') && document.querySelectorAll('[data-testid^=ws-step-][data-status]').length===6 && !document.querySelector('[data-testid=workspace]').textContent.includes('loading')`,
  self: `!!document.querySelector('h1') && !document.body.textContent.includes('loading')`,
};
const BAND = (b) => b.charAt(0).toUpperCase() + b.slice(1);
const expectedPages = (a) => {
  const p = [{ key: 'workspace', label: a.self ? 'Account' : 'Workspace', href: `/accounts/${a.id}` }];
  if (!a.self) p.push({ key: 'research', label: 'Research', href: `/accounts/${a.id}#research` });
  p.push({ key: 'runs', label: `Runs (${a.runs})`, href: '/runs' });
  p.push(a.head ? { key: 'case', label: 'Value case', href: `/runs/${a.head.id}/case` } : { key: 'case', label: 'Value case: none yet, no locked run', href: null });
  if (!a.self) p.push({ key: 'pov', label: 'Point of view', href: `/accounts/${a.id}/pov` });
  return p;
};
const MONEY = /[$€£]|\bUSD\b|\bmillion\b|\bbillion\b|\b\d+(\.\d+)?\s?[mbk]n?\b/i;

async function openAccount(X, a) {
  await X.go(`/accounts/${a.id}`);
  const ok = await X.waitFor(`${frameReady(a.id)} && (${a.self ? loaded.self : loaded.workspace})`, 30000);
  await sleep(800);
  return ok;
}

// ---- frame ------------------------------------------------------------------------------------------------------------
// deep: also the account's case, run pages, POV, step 1 and snapshots (the 'frame' section); shallow for 'classified'.
async function frameSection(list, deep) {
  for (const a of list) {
    const W = `frame, ${a.label}`;
    check(await openAccount(T, a), `${W}: opening the account frames it`, await T.ev(`${FRAME}?.outerHTML.slice(0,200)`));
    const f = await T.ev(readFrame('frame-desktop'));
    if (!f || !f.name) { check(false, `${W}: the frame read`, JSON.stringify(f)); continue; }
    check(f.shown && f.account === a.id && f.name === a.name, `${W}: the frame names the account, as recorded ("${a.name}")`, JSON.stringify([f.account, f.name]));
    const packWant = a.industry ? `${a.industry} pack` : a.self ? 'Not classified: your own account' : 'Unclassified: no industry pack';
    check(f.pack === packWant, `${W}: its pack, as recorded ("${packWant}")`, f.pack);
    check(a.reference ? f.reference === 'Reference example, not a customer engagement' : f.reference === null, `${W}: ${a.reference ? 'the reference-example label, in words' : 'no reference-example label'}`, f.reference);
    if (a.head) {
      check(f.run === `Latest locked run, run ${a.head.run_number}:` && f.badge === `${Number(a.head.score)} / 100 · ${BAND(a.head.band)}`,
        `${W}: the confidence names its run: "Latest locked run, run ${a.head.run_number}: ${Number(a.head.score)} / 100 · ${BAND(a.head.band)}"`, JSON.stringify([f.run, f.badge]));
    } else {
      check(f.run === null && f.confidence === a.no_confidence, `${W}: no headline run, said in words ("${a.no_confidence}"), never a 0`, f.confidence);
    }
    if (!a.self) {
      // The workspace's own headline and step: the frame and the page never say two things.
      const ws = await T.ev(`(()=>{const c=document.querySelector('[data-testid=ws-confidence]');return {badge:c.querySelector('[data-testid=confidence-badge]')?.textContent??null,from:(c.textContent.match(/from run (\\d+)/)||[])[1]??null,now:document.querySelector('[data-testid^=ws-step-][data-status=now]')?.dataset.step??null}})()`);
      check(a.head ? ws.from === String(a.head.run_number) && ws.badge === f.badge : ws.from === null, `${W}: the workspace's headline is the same run and score`, JSON.stringify(ws));
      check(new RegExp(`^Step ${ws.now} of 6 next: \\S`).test(f.standing ?? ''), `${W}: where it stands is the workspace's open step (${ws.now})`, f.standing);
    } else {
      check(/^Your own account · \S/.test(f.standing ?? ''), `${W}: where it stands, for the tenant's own account (from its chain)`, f.standing);
    }
    const want = expectedPages(a);
    const got = f.pages.map((p) => ({ key: p.key, label: p.label, href: p.href }));
    check(JSON.stringify(got) === JSON.stringify(want), `${W}: its pages: ${want.map((p) => p.label).join(', ')}`, JSON.stringify(got));
    check(f.pages.filter((p) => p.current === 'page').map((p) => p.key).join() === 'workspace', `${W}: "${want[0].label}" is the current page`, JSON.stringify(f.pages.map((p) => p.current)));
    check(f.classify === a.classifiable, `${W}: "Classify as…" ${a.classifiable ? 'offered (an unclassified customer account)' : 'not offered'}`, String(f.classify));
    check(!MONEY.test(f.text), `${W}: no money in the frame`, (f.text.match(MONEY) || [''])[0]);
    if (!deep) continue;
    await T.shot(`${TAG}_frame_${a.key}_1280`);
    if (a.head) {
      // Its run, its value case: the same account, the right page current.
      await T.ev(frameClick('case'));
      check(await T.waitFor(`location.pathname==='/runs/${a.head.id}/case' && !!document.querySelector('[data-testid=value-case]') && ${frameReady(a.id)}`, 30000), `${W}: "Value case" opens run ${a.head.run_number}'s case, the frame kept`);
      const c = await T.ev(readFrame('frame-desktop'));
      check(c && c.pages.find((p) => p.current === 'page')?.key === 'case' && !c.notice, `${W}: on its value case, "Value case" is current and nothing is announced`, JSON.stringify(c?.pages.map((p) => p.current)));
      await T.go(`/runs/${a.head.id}`);
      check(await T.waitFor(`!!document.querySelector('[data-testid=run-page]') && ${frameReady(a.id)}`, 30000), `${W}: its run page frames the same account`);
      const r = await T.ev(readFrame('frame-desktop'));
      check(r && r.pages.find((p) => p.current === 'page')?.key === 'runs', `${W}: on a run page, "Runs" is current`);
    }
    if (a.older) {
      await T.go(`/runs/${a.older.id}`);
      check(await T.waitFor(`!!document.querySelector('[data-testid=run-page]') && ${frameReady(a.id)}`, 30000), `${W}: another of its runs (run ${a.older.run_number}) frames the same account`);
      const o = await T.ev(readFrame('frame-desktop'));
      check(o && o.run === `Latest locked run, run ${a.head.run_number}:`, `${W}: on run ${a.older.run_number}'s page, the frame still names the run its confidence is from (${a.head.run_number}), so the two cannot silently disagree`, o?.run);
      await T.shot(`${TAG}_frame_${a.key}_older_run_1280`);
    }
    if (!a.self) {
      await T.go(`/accounts/${a.id}/pov`);
      check(await T.waitFor(`!!document.querySelector('[data-testid=pov]') && ${frameReady(a.id)}`, 30000), `${W}: its point of view frames the same account`);
      const p = await T.ev(readFrame('frame-desktop'));
      check(p && p.pages.find((x) => x.current === 'page')?.key === 'pov', `${W}: on the POV, "Point of view" is current`);
      if (a.key === 'curia') await T.shot(`${TAG}_frame_pov_1280`);
      await T.ev(frameClick('research'));
      check(await T.waitFor(`location.pathname==='/accounts/${a.id}' && location.hash==='#research' && document.querySelector('[data-testid=ws-step-1]')?.dataset.open==='true'`, 30000), `${W}: "Research" opens the workspace at step 1, open`);
      const rs = await T.ev(readFrame('frame-desktop'));
      check(rs && rs.pages.find((x) => x.current === 'page')?.key === 'research', `${W}: on step 1, "Research" is current`);
    }
    if (a.engagement) {
      await T.go(`/engagements/${a.engagement}/snapshots`);
      check(await T.waitFor(`!!document.querySelector('[data-testid=snapshots]') && ${frameReady(a.id)}`, 30000), `${W}: its engagement's snapshots frame the same account`);
    }
  }
}

if (SECTIONS.includes('frame')) await frameSection(EXP.accounts, true);

// ---- held ------------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('held')) {
  const a = EXP.accounts.find((x) => x.key === 'curia');
  await openAccount(T, a);
  T.requests.length = 0;
  for (const [label, path, ready] of [['Runs', '/runs', `!!document.querySelector('[data-testid=runs-filter]')`], ['Packs', '/packs', `document.querySelectorAll('[data-testid=pack-row]').length>0`],
    ['Policies', '/policies', `location.pathname==='/policies' && !document.body.textContent.includes('loading')`]]) {
    check(await T.ev(navClick(label)), `held: the header's "${label}" link`);
    check(await T.waitFor(`location.pathname==='${path}' && ${ready} && ${frameReady(a.id)}`, 20000), `held: ${label} keeps ${a.name} in focus`, await T.ev(`location.pathname+' '+(${FRAME}?.dataset.account??'no frame')`));
    check(await T.ev(`!document.querySelector('[data-testid=frame-switched]')`), `held: ${label}: nothing announced`);
    if (label === 'Packs') await T.shot(`${TAG}_packs_in_focus_1280`);
    if (label === 'Policies') await T.shot(`${TAG}_policies_in_focus_1280`);
  }
  const frameReads = T.requests.filter((u) => new RegExp(`/api/institutions/${a.id}/(view|walk|pov|research)`).test(u));
  check(frameReads.length === 0, `held: no frame read on navigation (D4): ${frameReads.length} reads of ${a.name} across Runs, Packs and Policies`, JSON.stringify(frameReads.slice(0, 4)));
  // A lineage row, opened as a link is (a page load, so the frame reads once, as on any load).
  await T.go(`/lineage/${EXP.lineage.table}/${EXP.lineage.id}`);
  check(await T.waitFor(`${frameReady(a.id)} && !document.body.textContent.includes('loading')`, 20000), 'held: a lineage row (no account of its own) keeps the focus');
  await T.ev(navClick('Accounts'));
  check(await T.waitFor(`location.pathname==='/' && ${frameReady(a.id)} && document.querySelectorAll('[data-testid=account-row]').length>0`, 20000), 'held: the Accounts home keeps the focus');
  // D3: Runs, this account's; every account's one click away; the focus kept.
  await T.ev(navClick('Runs'));
  await T.waitFor(`!!document.querySelector('[data-testid=runs-filter]') && document.querySelectorAll('[data-testid=runs-row]').length>0`, 20000);
  const mine = await T.ev(`[...document.querySelectorAll('[data-testid=runs-row]')].map(r=>r.dataset.account)`);
  check(mine.length === a.runs && mine.every((x) => x === a.id), `held: Runs lists ${a.name}'s ${a.runs} runs, and only them`, `${mine.length} rows`);
  check(await T.ev(`document.querySelector('[data-testid=runs-filter]').textContent`) === `Showing ${a.name}'s ${a.runs} runs.Show every account's runs (${EXP.total_runs})`, `held: "Showing ${a.name}'s ${a.runs} runs. Show every account's runs (${EXP.total_runs})"`, await T.ev(`document.querySelector('[data-testid=runs-filter]').textContent`));
  const fr = await T.ev(readFrame('frame-desktop'));
  check(fr && fr.pages.find((p) => p.key === 'runs')?.label === `Runs (${mine.length})` && fr.pages.find((p) => p.current === 'page')?.key === 'runs', `held: the frame's "Runs (${a.runs})" equals the list, and is current`, JSON.stringify(fr?.pages));
  await T.shot(`${TAG}_runs_in_focus_1280`);
  await T.ev(`document.querySelector('[data-testid=runs-show-all]').click()`);
  check(await T.waitFor(`location.search==='?all=1' && document.querySelectorAll('[data-testid=runs-row]').length===${EXP.total_runs}`, 20000), `held: "Show every account's runs" lists all ${EXP.total_runs}`);
  const marks = await T.ev(`[...document.querySelectorAll('[data-testid=runs-row]')].filter(r=>r.querySelector('[data-testid=runs-in-focus]')).map(r=>r.dataset.account)`);
  check(marks.length === a.runs && marks.every((x) => x === a.id), `held: ${a.name}'s ${a.runs} runs are marked "In focus", and no other`, `${marks.length}`);
  check(await T.ev(frameReady(a.id)), 'held: with every account shown, the focus is kept');
  await T.shot(`${TAG}_runs_all_1280`);
  await T.ev(`document.querySelector('[data-testid=runs-show-focus]').click()`);
  check(await T.waitFor(`location.search==='' && document.querySelectorAll('[data-testid=runs-row]').length===${a.runs}`, 20000), `held: "Show only ${a.name}'s" goes back`);
  // The pack it is classified into, marked in words; no other.
  await T.go('/packs');
  await T.waitFor(`document.querySelectorAll('[data-testid=pack-row]').length>0 && ${frameReady(a.id)}`);
  const pk = await T.ev(`[...document.querySelectorAll('[data-testid=pack-in-focus]')].map(e=>({slug:e.closest('[data-testid=pack-row]').dataset.slug,text:e.textContent}))`);
  check(pk.length === 1 && pk[0].slug === a.slug && pk[0].text === `${a.name} is classified here`, `held: Packs marks the pack ${a.name} is classified into ("${a.name} is classified here"), and no other`, JSON.stringify(pk));
}

// ---- shared ----------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('shared')) {
  const from = EXP.accounts.find((x) => x.key === 'scotts'), to = EXP.accounts.find((x) => x.key === 'curia');
  const X = await tab();
  // Watch every DOM change: the run page must never be present under the held account's frame.
  await X.send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{window.__s5={bad:[],seen:0};const held=${JSON.stringify(from.name)};
    const look=()=>{const run=document.querySelector('[data-testid=run-page]');if(!run)return;window.__s5.seen++;const n=document.querySelector('[data-testid=account-frame] [data-testid=frame-name]');
      if(n&&n.textContent===held)window.__s5.bad.push(location.pathname)};
    new MutationObserver(look).observe(document,{subtree:true,childList:true,characterData:true,attributes:true});})()` });
  await openAccount(X, from);
  check(await X.ev(held) === from.id, `shared: ${from.name} is held (this tab)`);
  // 1. A shared link, opened cold.
  await X.go(`/runs/${to.head.id}`);
  check(await X.waitFor(`!!document.querySelector('[data-testid=run-page]') && ${frameReady(to.id)}`, 30000), `shared: a link to ${to.name}'s run frames ${to.name} (the page's own account wins)`);
  const f = await X.ev(readFrame('frame-desktop'));
  const notice = `You're now in ${to.name}: this run belongs to it. ${from.name} is no longer in focus.Back to ${from.name}`;
  check(f && f.notice === notice, `shared: it says so: "You're now in ${to.name}: this run belongs to it. ${from.name} is no longer in focus." with "Back to ${from.name}"`, f?.notice);
  const w = await X.ev('window.__s5');
  check(w.seen > 0 && w.bad.length === 0, `shared: at no DOM change was the run shown under ${from.name}'s frame (${w.seen} changes watched)`, JSON.stringify(w));
  check(await X.ev(held) === to.id, `shared: the tab now holds ${to.name}`);
  await X.shot(`${TAG}_shared_link_1280`);
  // Said once: gone on the next page.
  await X.ev(navClick('Runs'));
  check(await X.waitFor(`location.pathname==='/runs' && !!document.querySelector('[data-testid=runs-filter]')`, 20000) && await X.ev(`!document.querySelector('[data-testid=frame-switched]')`) && await X.ev(frameReady(to.id)),
    `shared: said once: on the next page the notice is gone and ${to.name} stays in focus`);
  // 2. Inside the app: every account's runs, a row of another account clicked.
  await X.ev(`(${clickText(`document.querySelector('[data-testid=frame-desktop]')`, 'Leave the account', 'button')})`);
  await openAccount(X, from);
  await X.go('/runs?all=1');
  await X.waitFor(`document.querySelectorAll('[data-testid=runs-row]').length===${EXP.total_runs}`, 20000);
  await X.ev(`window.__s5.bad=[];window.__s5.seen=0;[...document.querySelectorAll('[data-testid=runs-row]')].find(r=>r.dataset.account===${JSON.stringify(to.id)}).querySelector('td:nth-child(4)').click()`);
  check(await X.waitFor(`!!document.querySelector('[data-testid=run-page]') && ${frameReady(to.id)}`, 30000), `shared: clicking ${to.name}'s row from Runs frames ${to.name}`);
  const w2 = await X.ev('window.__s5');
  check(w2.seen > 0 && w2.bad.length === 0, `shared: in the app too, never the run under ${from.name}'s frame (${w2.seen} changes watched)`, JSON.stringify(w2));
  check((await X.ev(`document.querySelector('[data-testid=frame-switched]')?.textContent`)) === notice, '  ...and it says so, once');
  // 3. "Back to …": the focus back, its workspace, nothing announced.
  await X.ev(`document.querySelector('[data-testid=frame-back]').click()`);
  check(await X.waitFor(`location.pathname==='/accounts/${from.id}' && ${frameReady(from.id)} && !document.querySelector('[data-testid=frame-switched]')`, 30000), `shared: "Back to ${from.name}" holds ${from.name} again and opens its workspace, nothing announced`);
  await X.close();
}

// ---- leave -----------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('leave')) {
  const a = EXP.accounts.find((x) => x.key === 'curia');
  for (const width of [1280, 390]) {
    const X = await tab(); await X.size(width);
    await openAccount(X, a);
    if (width === 390) { await X.ev(`document.querySelector('[data-testid=frame-phone-toggle]').click()`); await sleep(300); }
    const scope = width === 1280 ? 'frame-desktop' : 'frame-phone';
    check(await X.ev(clickText(`document.querySelector('[data-testid=${scope}]')`, 'Leave the account', 'button')), `leave @${width}: "Leave the account" is there`);
    check(await X.waitFor(`location.pathname==='/' && ${noFrame} && document.querySelectorAll('[data-testid=account-row]').length>0`, 20000), `leave @${width}: it opens Accounts home with no frame`);
    check(await X.ev(held) === null, `leave @${width}: the focus is cleared from the tab`, await X.ev(held));
    if (width === 1280) await X.shot(`${TAG}_after_leave_1280`);
    await X.go('/runs');
    await X.waitFor(`document.querySelectorAll('[data-testid=runs-row]').length>0`, 20000);
    check(await X.ev(`${noFrame} && !document.querySelector('[data-testid=runs-filter]') && document.querySelectorAll('[data-testid=runs-row]').length===${EXP.total_runs}`), `leave @${width}: Runs then lists every account's runs, unfiltered, with no frame`);
    await X.send('Page.reload'); await sleep(1500); await X.waitFor(`document.querySelectorAll('[data-testid=runs-row]').length>0`, 20000);
    check(await X.ev(noFrame), `leave @${width}: and after a reload, still no account in focus`);
    await X.close();
  }
}

// ---- tabs ------------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('tabs')) {
  const a = EXP.accounts.find((x) => x.key === 'curia'), b = EXP.accounts.find((x) => x.key === 'scotts');
  const A = await tab(), B = await tab();
  await openAccount(A, a); await openAccount(B, b);
  await A.go('/runs'); await B.go('/runs');
  check(await A.waitFor(frameReady(a.id)) && await B.waitFor(frameReady(b.id)), `tabs: two tabs hold two accounts (${a.name}; ${b.name}) on the same page`);
  await A.send('Page.reload'); await B.send('Page.reload'); await sleep(1500);
  check(await A.waitFor(frameReady(a.id)) && await B.waitFor(frameReady(b.id)), '  ...each kept through a reload');
  await A.ev(`(${clickText(`document.querySelector('[data-testid=frame-desktop]')`, 'Leave the account', 'button')})`);
  await A.waitFor(noFrame); await B.go('/packs');
  check(await B.waitFor(frameReady(b.id)) && await A.ev(noFrame), `  ...leaving in one tab leaves the other's focus as it was`);
  await A.close(); await B.close();
}

// ---- phone -----------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('phone')) {
  const a = EXP.accounts.find((x) => x.key === 'curia');
  const X = await tab(); await X.size(390);
  await openAccount(X, a);
  const paths = [[`/accounts/${a.id}`, 'workspace'], [`/runs/${a.head.id}`, 'run'], [`/runs/${a.head.id}/case`, 'case'], [`/accounts/${a.id}/pov`, 'pov'], ['/runs', 'runs'], ['/runs?all=1', 'runs_all'], ['/packs', 'packs'], ['/policies', 'policies'], ['/', 'home'],
    ...EXP.accounts.filter((x) => x.key !== 'curia').map((x) => [`/accounts/${x.id}`, `account_${x.key}`])];
  for (const [path, name] of paths) {
    await X.go(path);
    const acct = name.startsWith('account_') ? EXP.accounts.find((x) => `account_${x.key}` === name).id : a.id;
    await X.waitFor(`${frameReady(acct)} && !document.body.textContent.includes('loading')`, 30000); await sleep(700);
    const p = await X.ev(`(()=>{const v=${vis};return {phone:v(document.querySelector('[data-testid=frame-phone]')),desk:v(document.querySelector('[data-testid=frame-desktop]')),h:document.querySelector('[data-testid=frame-phone] summary').getBoundingClientRect().height,sw:document.documentElement.scrollWidth}})()`);
    check(p.phone && !p.desk && p.h <= 48, `phone ${name}: the frame is one line (${Math.round(p.h)} px), the name then "Pages ▸"`, JSON.stringify(p));
    check(p.sw <= 390, `phone ${name}: no sideways scroll, closed (scrollWidth ${p.sw})`);
    await X.ev(`document.querySelector('[data-testid=frame-phone-toggle]').click()`); await sleep(350);
    const o = await X.ev(`(()=>{const d=document.querySelector('[data-testid=frame-phone]');return {open:d.open,links:d.querySelectorAll('[data-page]').length,sw:document.documentElement.scrollWidth}})()`);
    check(o.open && o.links >= 3 && o.sw <= 390, `phone ${name}: "Pages ▸" opens its pages (${o.links}), no sideways scroll (scrollWidth ${o.sw})`, JSON.stringify(o));
    if (['workspace', 'run', 'runs'].includes(name)) await X.shot(`${TAG}_phone_${name}_open_390`, 390);
    await X.ev(`document.querySelector('[data-testid=frame-phone-toggle]').click()`); await sleep(200);
    if (name === 'workspace') await X.shot(`${TAG}_phone_workspace_390`, 390);
  }
  // The notice at 390 (a shared link while held).
  await openAccount(X, EXP.accounts.find((x) => x.key === 'scotts'));
  await X.go(`/runs/${a.head.id}`);
  await X.waitFor(`${frameReady(a.id)} && !!document.querySelector('[data-testid=frame-switched]')`, 30000); await sleep(500);
  check(await X.ev('document.documentElement.scrollWidth') <= 390, 'phone: the "You\'re now in" notice, no sideways scroll');
  await X.shot(`${TAG}_phone_shared_390`, 390);
  await X.close();
}

// ---- keys ------------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('keys')) {
  const a = EXP.accounts.find((x) => x.key === 'curia');
  const X = await tab();
  await openAccount(X, a);
  await X.ev('window.scrollTo(0,0); document.activeElement && document.activeElement.blur(); true');
  const seen = []; let ring = [];
  for (let i = 0; i < 30; i++) {
    await X.key('Tab', 'Tab', 9);
    const r = await X.ev(`(()=>{const el=document.activeElement;const f=el&&el.closest('[data-testid=account-frame]');if(!f)return null;const s=getComputedStyle(el);
      return {id:el.dataset.page??el.dataset.testid??el.textContent.trim(),style:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor,fv:el.matches(':focus-visible')}})()`);
    if (r && !seen.includes(r.id)) { seen.push(r.id); ring.push(r); }
  }
  const want = ['frame-name', 'workspace', 'research', 'runs', 'case', 'pov', 'frame-leave'];
  check(want.every((k) => seen.includes(k)), `keys: Tab reaches every frame control: the name, ${want.slice(1, -1).join(', ')}, "Leave the account"`, JSON.stringify(seen));
  // Reading order: the name, "Leave the account" (row 1, right), then the pages (row 2).
  const inFrame = seen.filter((k) => want.includes(k));
  check(JSON.stringify(inFrame) === JSON.stringify(['frame-name', 'frame-leave', ...want.slice(1, -1)]), '  ...in reading order: the name, "Leave the account", then the pages', JSON.stringify(inFrame));
  check(ring.length > 0 && ring.every((r) => r.fv && r.style !== 'none' && r.width >= 2 && /rgb\(201, 162, 74\)/.test(r.color)), `keys: each shows the gold focus ring when focused (${ring.length})`, JSON.stringify(ring));
  // Enter on "Runs" goes there.
  await X.ev(`document.querySelector('[data-testid=frame-desktop] [data-page=runs]').focus()`);
  await X.key('Enter', 'Enter', 13);
  check(await X.waitFor(`location.pathname==='/runs'`, 10000), 'keys: Enter on "Runs" opens Runs');
  // The phone toggle, by keyboard.
  await X.size(390); await X.go(`/accounts/${a.id}`); await X.waitFor(frameReady(a.id), 30000); await sleep(500);
  await X.ev(`document.querySelector('[data-testid=frame-phone-toggle]').focus()`);
  const s = await X.ev(`(()=>{const el=document.activeElement;return el?.dataset.testid})()`);
  await X.key('Enter', 'Enter', 13); await sleep(300);
  check(s === 'frame-phone-toggle' && await X.ev(`document.querySelector('[data-testid=frame-phone]').open`), 'keys @390: "Pages ▸" is focusable and opens by Enter');
  await X.key('Tab', 'Tab', 9);
  check(await X.ev(`document.querySelector('[data-testid=frame-phone]').contains(document.activeElement) && document.activeElement.tagName==='A'`), 'keys @390: the next Tab lands on the panel\'s first link');
  await X.close();
}

// ---- contrast --------------------------------------------------------------------------------------------------------
const CONTRAST = `(()=>{const cs=(e)=>getComputedStyle(e);const v=${vis};
  const rgb=(s)=>{const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(',').map(x=>parseFloat(x));return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
  const lum=(c)=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
  const bgOf=(el)=>{for(let e=el;e;e=e.parentElement){const c=rgb(cs(e).backgroundColor);if(c&&c.a>0)return c}return {r:255,g:255,b:255,a:1}};
  const bad=[];let checked=0;
  const scope=window.__s5scope||'frame';
  for(const root of document.querySelectorAll(scope==='form'?'[data-testid=frame-classify] [data-testid=classify-account]':'[data-testid=account-frame],[data-testid=frame-switched]'))for(const el of [root,...root.querySelectorAll('*')]){
    if(!v(el))continue;if(scope==='frame'&&el.closest('[data-testid=classify-account]'))continue;const own=[...el.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('').trim();if(!own)continue;
    const fg=rgb(cs(el).color);if(!fg)continue;const bg=bgOf(el);checked++;
    const L1=lum(fg),L2=lum(bg);const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);const px=parseFloat(cs(el).fontSize),bold=Number(cs(el).fontWeight)>=600;
    const need=(px>=24||(px>=18.66&&bold))?3:4.5;if(ratio+1e-9<need)bad.push({text:own.slice(0,40),ratio:Math.round(ratio*100)/100,need,color:cs(el).color})}
  return {checked,bad}})()`;
if (SECTIONS.includes('contrast')) {
  const X = await tab();
  const states = [];
  for (const a of EXP.accounts) {
    await openAccount(X, a);
    states.push([`${a.label} @1280`, await X.ev(CONTRAST)]);
    if (a.classifiable) {
      await X.ev(`document.querySelector('[data-testid=frame-desktop] [data-testid=frame-classify-open]').click()`); await sleep(600);
      states.push([`${a.label}, classify open (the frame's own text)`, await X.ev(CONTRAST)]);
      // S1's form inside the panel is S1's component, unchanged (D6): measured and reported, not S5's to fix.
      const form = await X.ev(`(()=>{window.__s5scope='form';return true})()`) && await X.ev(CONTRAST); await X.ev(`window.__s5scope='frame'`);
      console.log(`NOTE  contrast of S1's form inside the panel (pre-existing, GovernedForm's provenance block): ${form.checked} texts, ${form.bad.length} under AA: ${JSON.stringify(form.bad.map((b) => [b.text, b.ratio]))}`);
    }
  }
  await openAccount(X, EXP.accounts.find((x) => x.key === 'scotts'));
  await X.go(`/runs/${EXP.accounts.find((x) => x.key === 'curia').head.id}`); await X.waitFor(`!!document.querySelector('[data-testid=frame-switched]')`, 30000); await sleep(500);
  states.push(['the notice', await X.ev(CONTRAST)]);
  await X.size(390); await X.ev(`document.querySelector('[data-testid=frame-phone-toggle]').click()`); await sleep(400);
  states.push(['the phone panel @390', await X.ev(CONTRAST)]);
  for (const [name, c] of states) check(c.checked > 3 && c.bad.length === 0, `contrast: ${name}: every text in the frame at AA (${c.checked} texts)`, JSON.stringify(c.bad));
  await X.close();
}

// ---- print -----------------------------------------------------------------------------------------------------------
if (SECTIONS.includes('print')) {
  const a = EXP.accounts.find((x) => x.key === 'curia');
  const X = await tab();
  await openAccount(X, EXP.accounts.find((x) => x.key === 'scotts'));
  // The case reached by a shared link: the frame AND its notice on screen; neither printed.
  for (const [path, name, root] of [[`/runs/${a.head.id}/case`, 'case', 'value-case'], [`/runs/${a.head.id}/case?lens=cfo`, 'case_cfo', 'value-case'], [`/accounts/${a.id}/pov`, 'pov', 'pov']]) {
    await X.go(path);
    await X.waitFor(`!!document.querySelector('[data-testid=${root}]') && ${frameReady(a.id)}`, 30000); await sleep(1200);
    const screen = await X.ev(`(()=>{const v=${vis};return {frame:v(${FRAME}),notice:!!document.querySelector('[data-testid=frame-switched]')}})()`);
    await X.send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(400);
    const pr = await X.ev(`(()=>{const v=${vis};return {frame:v(${FRAME}),notice:v(document.querySelector('[data-testid=frame-switched]')),classify:v(document.querySelector('[data-testid=frame-classify]'))}})()`);
    check(screen.frame && !pr.frame && !pr.notice && !pr.classify, `print ${name}: the frame${screen.notice ? ' and its notice' : ''}, shown on screen, are not printed`, JSON.stringify({ screen, pr }));
    const pdf = await X.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
    if (pdf.result?.data) writeFileSync(`${E.OUT}/${TAG}_print_${name}.pdf`, Buffer.from(pdf.result.data, 'base64'));
    await X.send('Emulation.setEmulatedMedia', { media: '' }); await sleep(200);
    if (name === 'case') await X.shot(`${TAG}_case_in_focus_1280`);
  }
  await X.close();
}

// ---- classify (D6) ---------------------------------------------------------------------------------------------------
if (SECTIONS.includes('classify')) {
  const a = EXP.accounts.find((x) => x.id === EXP.classify.id);
  const X = await tab();
  await openAccount(X, a);
  const sc = `document.querySelector('[data-testid=frame-classify]')`;
  await X.ev(`document.querySelector('[data-testid=frame-desktop] [data-testid=frame-classify-open]').click()`);
  check(await X.waitFor(`!!${sc} && [...${sc}.querySelectorAll('option')].some(o=>o.value===${JSON.stringify(EXP.classify.slug)})`, 15000), `classify: "Classify as…" in the frame opens S1's form, offering ${EXP.classify.slug}`);
  const labels = await X.ev(`[...${sc}.querySelectorAll('label > span:first-child')].map(s=>s.textContent)`);
  check(labels[0] === 'Classify as', 'classify: its label reads "Classify as", with no "(optional)" (Brad, 19 Nov 2026)', JSON.stringify(labels));
  check(await X.ev(`document.querySelector('[data-testid=frame-desktop] [data-testid=frame-classify-open]').getAttribute('aria-expanded')`) === 'true', '  ...its button says it is open (aria-expanded)');
  // Cancel closes it with nothing sent.
  X.requests.length = 0;
  await X.ev(`${sc}.querySelector('[data-testid=classify-cancel]').click()`); await sleep(400);
  check(await X.ev(`!${sc}`) && !X.requests.some((u) => u.includes('/industry')), 'classify: "Cancel" closes it, nothing sent');
  await X.ev(`document.querySelector('[data-testid=frame-desktop] [data-testid=frame-classify-open]').click()`);
  await X.waitFor(`!!${sc} && [...${sc}.querySelectorAll('option')].some(o=>o.value===${JSON.stringify(EXP.classify.slug)})`, 15000);
  const set = (label, value) => X.ev(`(()=>{const root=${sc};const l=[...root.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));const el=l.querySelector('input,select,textarea');
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await set('Classify as', EXP.classify.slug); await sleep(200);
  await set('Why this classification', EXP.classify.note); await sleep(300);
  await X.shot(`${TAG}_classify_form_1280`);
  X.requests.length = 0;
  await X.waitFor(`(()=>{const b=[...${sc}.querySelectorAll('button')].find(e=>e.textContent.trim()==='Classify');return !!b&&!b.disabled})()`);
  await X.ev(`[...${sc}.querySelectorAll('button')].find(e=>e.textContent.trim()==='Classify').click()`); await sleep(500);
  const said = await X.ev(`(()=>{const c=[...document.querySelectorAll('[data-testid=confirm-text]')].find(b=>b.offsetParent!==null);return c?c.textContent:null})()`);
  const wantSaid = `Classify this account (${a.id.slice(0, 8)}) as ${EXP.classify.name} (${EXP.classify.slug}), because: “${EXP.classify.note}”. Final: a wrong classification is corrected by superseding the account.`;
  check(said === wantSaid, 'classify: the confirmation is S1\'s, in full', said);
  check(!X.requests.some((u) => u.includes('/industry')), '  ...nothing sent before "Confirm"');
  await X.shot(`${TAG}_classify_confirm_1280`);
  await X.ev(`(()=>{const y=[...document.querySelectorAll('[data-testid=form-confirm-yes]')].find(b=>b.offsetParent!==null);if(!y)return false;y.click();return true})()`);
  check(await X.waitFor(`(()=>{const f=${FRAME};return !!f&&f.querySelector('[data-testid=frame-desktop] [data-testid=frame-pack]')?.textContent===${JSON.stringify(`${EXP.classify.name} pack`)}})()`, 20000),
    `classify: the frame reads the account again and shows "${EXP.classify.name} pack"`, await X.ev(`${FRAME}?.querySelector('[data-testid=frame-pack]')?.textContent`));
  check(await X.ev(`!document.querySelector('[data-testid=frame-classify-open]') && !${sc}`), '  ...and offers "Classify as…" no more');
  check(await X.waitFor(`document.querySelector('[data-testid=ws-subtitle]')?.textContent.startsWith(${JSON.stringify(`${EXP.classify.name} pack`)})`, 20000), '  ...and the page below reads its record again (its subtitle names the pack)');
  check(X.requests.filter((u) => u.endsWith(`/api/institutions/${a.id}/industry`)).length === 1, '  ...one request, to S1\'s route, unchanged');
  await X.shot(`${TAG}_classified_1280`);
  await X.close();
}

// ---- classified: after D6's act (run after 'classify'), the account's pack is the one chosen, and "Classify as…" is
// no longer offered.
if (SECTIONS.includes('classified')) {
  await frameSection(EXP.accounts.filter((a) => a.id === EXP.classify.id)
    .map((a) => ({ ...a, classifiable: false, industry: EXP.classify.name, slug: EXP.classify.slug, label: 'the account just classified' })), false);
}

// ---- runsfit (S5 Gate B finding, Brad, 20 Nov 2026) --------------------------------------------------------------------
// No table on Runs is clipped: each fits the box that holds it, and every header is wholly visible, at 1024, 1280 and
// 1440, with an account in focus (its runs, then every account's) and with none.
if (SECTIONS.includes('runsfit')) {
  const a = EXP.accounts.find((x) => x.key === 'self');
  const X = await tab();
  const FIT = `(()=>{const r=(e)=>e.getBoundingClientRect();const out=[];
    for(const tb of document.querySelectorAll('table')){if(!tb.getClientRects().length)continue;
      let clip=null;for(let e=tb.parentElement;e;e=e.parentElement){if(getComputedStyle(e).overflowX!=='visible'){clip=e;break}}
      const right=clip?r(clip).right:window.innerWidth;const box=clip?clip.clientWidth:window.innerWidth;
      const ths=[...tb.querySelectorAll('th')].filter(h=>h.getClientRects().length);
      out.push({w:Math.round(tb.scrollWidth),box:Math.round(box),hidden:ths.filter(h=>r(h).right>right+0.5||h.scrollWidth>h.clientWidth+1).map(h=>h.textContent)})}
    return {tables:out,page:document.documentElement.scrollWidth}})()`;
  for (const [label, focus, path] of [['in focus', a.id, '/runs'], ['every account', a.id, '/runs?all=1'], ['no account', null, '/runs']]) {
    for (const width of [1024, 1280, 1440]) {
      await X.size(width);
      await X.go('/');
      await X.ev(`(()=>{try{${focus ? `sessionStorage.setItem('lvrf:account-focus',${JSON.stringify(focus)})` : `sessionStorage.removeItem('lvrf:account-focus')`}}catch{};return true})()`);
      await X.go(path);
      await X.waitFor(`document.querySelectorAll('[data-testid=runs-row]').length>0 && ${focus ? frameReady(focus) : noFrame}`, 30000); await sleep(800);
      const f = await X.ev(FIT);
      const ok = f.tables.length > 0 && f.tables.every((t) => t.w <= t.box && t.hidden.length === 0) && f.page <= width;
      check(ok, `runsfit @${width}, ${label}: no table on Runs is clipped (${f.tables.map((t) => `${t.w} in ${t.box}`).join(', ')}); every header visible; no sideways scroll`, JSON.stringify(f));
      if (width === 1280 && label === 'every account') await X.shot(`${TAG}_runs_fit_1280`, 1280);
    }
  }
  await X.close();
}

// ---- reads (Brad, 19 Nov 2026) ----------------------------------------------------------------------------------------
// The frame reuses the page's /walk read; it never waits forever: a stalled or failed read says "Couldn't load this
// account's status." (the browser's own request interception: nothing on the server is changed).
if (SECTIONS.includes('reads')) {
  const a = EXP.accounts.find((x) => x.key === 'curia');
  const walkUrl = (u) => u.includes(`/api/institutions/${a.id}/walk`);
  {
    const X = await tab();
    await openAccount(X, a); await sleep(2500);
    const n = X.requests.filter(walkUrl).length;
    check(n === 1, `reads: opening ${a.name}'s workspace makes ONE /walk read, shared by the page and the frame (${n})`);
    await X.close();
  }
  const UNAVAIL = "Couldn't load this account's status.";
  // Parenthesised: `x ?? null === y` parses as `x ?? (null === y)`, true for any text (it passed "loading…", 19 Nov 2026).
  const pendingText = `(document.querySelector('[data-testid=frame-pending-text]')?.textContent ?? null)`;
  for (const mode of ['stalled', 'failed']) {
    const X = await tab();
    await X.go('/packs'); await X.waitFor(`document.querySelectorAll('[data-testid=pack-row]').length>0`);
    await X.ev(`sessionStorage.setItem('lvrf:account-focus', ${JSON.stringify(a.id)}); true`);
    const paused = [];
    X.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Fetch.requestPaused') paused.push(m.params); });
    await X.send('Fetch.enable', { patterns: [{ urlPattern: `*/api/institutions/${a.id}/walk*`, requestStage: 'Request' }] });
    const t0 = Date.now();
    await X.send('Page.reload'); await sleep(300);
    await X.waitFor(`!!document.querySelector('[data-testid=frame-pending]')`, 10000);
    if (mode === 'stalled') {
      await sleep(2500);
      check(await X.ev(pendingText) === 'loading…' && paused.length > 0, `reads, stalled: while its /walk is unanswered, the frame says "loading…" and names no account`, await X.ev(pendingText));
      check(await X.ev(`!!document.querySelector('[data-testid=frame-pending] [data-testid=frame-leave]')`), '  ...with "Leave the account" there');
      X.failures.length = 0;
      const gaveUp = await X.waitFor(`${pendingText} === ${JSON.stringify(UNAVAIL)}`, 25000);
      const secs = Math.round((Date.now() - t0) / 1000);
      console.log(`NOTE  stall: gave up at ${secs} s; failures ${JSON.stringify(X.failures.map((f) => ({ ...f, t: Math.round((f.t - t0) / 100) / 10 })))}; paused ${paused.length}`);
      // It must be the time limit that ends the wait: not before 14 s (an earlier end is some other failure).
      check(gaveUp && secs >= 14 && secs <= 22, `reads, stalled: it stops waiting at the 15 s limit and says "${UNAVAIL}" (${secs} s)`, await X.ev(pendingText));
      await X.shot(`${TAG}_frame_stalled_1280`);
      await X.ev(`document.querySelector('[data-testid=frame-pending] [data-testid=frame-leave]').click()`);
      check(await X.waitFor(`location.pathname==='/' && ${noFrame}`, 10000), '  ...and "Leave the account" still leaves, with the read still unanswered');
      for (const p of paused.splice(0)) await X.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => null);
    } else {
      let answered = 0;
      for (let i = 0; i < 60 && answered === 0; i++) {
        await sleep(150);
        for (const p of paused.splice(0)) { await X.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 500, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ message: 'could not be read (simulated)' })).toString('base64') }); answered++; }
      }
      const said = await X.waitFor(`${pendingText} === ${JSON.stringify(UNAVAIL)}`, 8000);
      check(answered > 0 && said, `reads, failed: a 500 on its /walk and the frame says "${UNAVAIL}" at once, not the server's message`, await X.ev(pendingText));
    }
    await X.send('Fetch.disable');
    await X.close();
  }
}

console.log(`DONE ${out.filter((l) => l.startsWith('PASS')).length} ${out.filter((l) => l.startsWith('FAIL')).length}`);
T.ws.close();
process.exit(0);
