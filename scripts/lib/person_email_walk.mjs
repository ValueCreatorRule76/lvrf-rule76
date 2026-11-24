// §32 — a person's email is optional; the same name is warned; Measure by's earliest day. For scripts/verify_person_email.sh.
//
//   node scripts/lib/person_email_walk.mjs SECTION[,SECTION]
//
//   roles     on E.INST's card 01b: the email optional (a name alone leaves nothing unmet); E.DUP_NAME typed in (another
//             case, extra spaces) shows the existing person; "Choose them" opens the role form with E.DUP_ID chosen
//   distinct  on E.INST's card 01b: E.DUP_NAME again, "This is a different person": the confirmation says so in full,
//             naming E.DUP_WHO; confirmed, it is added
//   w1        on E.INST_W (W1 next): W1's form is the shared one, its email optional
//   measureby on E.INST: the commit form on E.OC: Measure by's earliest day is the day after Committed on, and follows it
const SECTIONS = (process.argv[2] ?? 'lists').split(',');
const E = process.env;
const TAG = E.TAG ?? 'email';
const APP = `http://localhost:${E.VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (c, m, d = '') => { const line = `${c ? 'PASS' : 'FAIL'}  ${TAG}: ${m}${!c && d ? ` — ${String(d).slice(0, 300)}` : ''}`; out.push(line); console.log(line); };
const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; const to = setTimeout(() => { pend.delete(id); r({ timeout: true }); }, 15000); pend.set(id, (m) => { clearTimeout(to); r(m); }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 25000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(200); } return false; };
const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

await go('/');
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await go('/');
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await waitFor(`document.body.textContent.includes('Signed in as')`))) { check(false, 'signed in through the page'); console.log('DONE 0 1'); process.exit(0); }


const row = (id) => `document.querySelector('[data-testid=spine-outcome][data-outcome="${id}"]')`;
const openAccount = async (inst) => {
  await go(`/accounts/${inst}`);
  await waitFor(`!!document.querySelector('[data-testid=account-detail]') || !!document.querySelector('[data-testid=outcome-spine]')`, 30000);
  await ev(`(()=>{document.querySelectorAll('[data-testid=account-detail]').forEach(d=>{d.open=true});return true})()`); await sleep(800);
  return true;
};
const set = (scope, testid, value) => ev(`(()=>{const el=${scope}?.querySelector('[data-testid=${testid}]');if(!el)return false;
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const card = `document.getElementById('customer-roles')`;
const form = `${card}?.querySelector('[data-testid=person-add]')`;
const unmet = (f) => ev(`${f}?.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`);
const openAdd = async () => { await ev(`${card}?.querySelector('[data-testid=person-add-open]')?.click()`); await sleep(300); return ev(`!!${form}`); };

if (SECTIONS.includes('roles')) {
  await openAccount(E.INST);
  check(await openAdd(), 'roles: card 01b opens "Add a person of this account…"');
  const label = await ev(`[...(${form}?.querySelectorAll('label span') ?? [])].map(s=>s.textContent).find(t=>t.startsWith('Email')) ?? null`);
  check(label === 'Email (optional; needed only to sign in)', 'roles: the email is optional, needed only to sign in', label);
  await set(form, 'person-add-name', 'K32 Lee Example (invented)'); await sleep(250);
  check((await unmet(form)) === '', 'roles: a name alone leaves nothing unmet (no email needed)', await unmet(form));
  await set(form, 'person-add-name', E.DUP_TYPED); await sleep(300);
  const w = await ev(`${form}?.querySelector('[data-testid=person-same-name]')?.textContent ?? null`);
  check(w !== null && w.includes(E.DUP_WHO) && w.includes('is already recorded at this account.'), `roles: "${E.DUP_TYPED}" shows ${E.DUP_WHO}, already recorded`, w);
  check((await unmet(form)).includes('choose them, or confirm this is a different person'), 'roles: until answered, the form will not submit, and says why', await unmet(form));
  await ev(`${form}?.querySelector('[data-testid=person-same-choose]')?.click()`); await sleep(500);
  const chosen = await ev(`${card}?.querySelector('[data-testid=customer-role-form] select')?.value ?? null`);
  check(chosen === E.DUP_ID, 'roles: "Choose them" opens the role form with them chosen', chosen);
  check((await ev(`!${form}`)) === true, 'roles: ...and nothing is added (the form closed)');
}

if (SECTIONS.includes('distinct')) {
  await openAccount(E.INST);
  check(await openAdd(), 'distinct: the form open again');
  await set(form, 'person-add-name', E.DUP_TYPED); await set(form, 'person-add-title', 'Site lead'); await sleep(300);
  await ev(`${form}?.querySelector('[data-testid=person-same-different]')?.click()`); await sleep(300);
  check((await unmet(form)) === '', 'distinct: "This is a different person" answers the warning', await unmet(form));
  await ev(`${form}?.querySelector('button[type=submit]')?.click()`);
  check(await waitFor(`!!${form}?.querySelector('[data-testid=form-confirm]')`), 'distinct: it asks for confirmation');
  const ct = await ev(`${form}?.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  const want = `Add ${E.DUP_TYPED.trim()}, Site lead, as a person of this account. This is a different person from ${E.DUP_WHO}, already recorded here.`;
  check(ct === want, 'distinct: the confirmation says it in full', ct);
  await ev(`${form}?.querySelector('[data-testid=form-confirm-yes]')?.click()`);
  check(await waitFor(`!${form} && !!${card}?.querySelector('[data-testid=person-add-open]')`, 15000), 'distinct: confirmed; the form closes');
}

if (SECTIONS.includes('w1')) {
  await openAccount(E.INST_W);
  const w1 = `document.querySelector('[data-testid=w1-add-person]')`;
  check(await waitFor(`!!${w1}`, 20000), 'w1: W1 is next, with its "add a person" form');
  const label = await ev(`[...(${w1}?.querySelectorAll('label span') ?? [])].map(s=>s.textContent).find(t=>t.startsWith('Email')) ?? null`);
  check(label === 'Email (optional; needed only to sign in)', "w1: W1's form is the shared one, its email optional", label);
}

if (SECTIONS.includes('measureby')) {
  await openAccount(E.INST);
  check(await waitFor(`!!${row(E.OC)}`, 20000), 'measureby: card 01d lists the outcome');
  await ev(`${row(E.OC)}?.querySelector('[data-testid=commit-open]')?.click()`); await sleep(300);
  const f = `${row(E.OC)}?.querySelector('[data-testid=commit]')`;
  const read = () => ev(`(()=>{const a=${f}?.querySelector('[data-testid=commit-on]'),b=${f}?.querySelector('[data-testid=commit-by]');return a&&b?a.value+'|'+b.getAttribute('min'):null})()`);
  const next = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  const r1 = await read(); const [on1, min1] = (r1 ?? '|').split('|');
  check(min1 === next(on1), `measureby: Measure by's earliest day is ${next(on1)}, the day after Committed on (${on1})`, r1);
  await set(f, 'commit-on', E.EARLIER); await sleep(250);
  const r2 = await read(); const [on2, min2] = (r2 ?? '|').split('|');
  check(on2 === E.EARLIER && min2 === next(E.EARLIER), `measureby: Committed on changed to ${E.EARLIER}: the earliest day follows, ${next(E.EARLIER)}`, r2);
}

console.log(`DONE ${out.filter((l) => l.startsWith('PASS')).length} ${out.filter((l) => l.startsWith('FAIL')).length}`);
ws.close();
process.exit(0);
