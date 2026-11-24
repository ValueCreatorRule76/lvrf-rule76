// §29 — only a customer-side person commits or verifies, on the page, for scripts/verify_customer_committer.sh.
//
//   node scripts/lib/customer_side_walk.mjs SECTION[,SECTION]
//
//   lists     on E.INST: the commit form on E.OC and the verify form on E.OV list E.OWNER_NAME and no one else
//             (E.NOROLE_NAME, with no role, is not offered)
//   empty     on E.INST_E (no customer-side person): the commit form on E.OE prints the sentence and its link to the
//             roles card; Commit is disabled with the unmet line; the link brings the roles card into view
//   addperson on E.INST_E: card 01b's "Add a person of this account…" adds E.NEW_NAME, through its confirmation
//   curia     on E.CURIA: e3fb0061's row prints the before-the-rule line; the commit form on E.CURIA_OPEN prints the sentence
//   tenant    on E.SELF: the commit form on E.SO prints the tenant's own sentence, with no link
const SECTIONS = (process.argv[2] ?? 'lists').split(',');
const E = process.env;
const TAG = E.TAG ?? 'side';
const APP = `http://localhost:${E.VITE_PORT}`;
const SENTENCE = 'No customer-side person is recorded at this account yet. Add one, with a role named from a source, on the roles card.';
const SELF_SENTENCE = "No one can commit to or verify your own company's outcomes yet: that needs a named executive with a role named from a source, a rule still to be set.";
const BEFORE = ' · not customer-side: committed before only customer-side people could commit, 24 Nov 2026';
const UNMET = 'record a customer-side person at this account first';
const SELF_UNMET = 'no one can commit here yet';
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
const openAccount = async (inst, ids) => {
  await go(`/accounts/${inst}`);
  await waitFor(`!!document.querySelector('[data-testid=account-detail]') || !!document.querySelector('[data-testid=outcome-spine]')`, 30000);
  await ev(`(()=>{document.querySelectorAll('[data-testid=account-detail]').forEach(d=>{d.open=true});return true})()`); await sleep(600);
  return waitFor(ids.map((id) => `!!${row(id)}`).join(' && '), 30000);
};
const options = (o, testid) => ev(`[...(${row(o)}?.querySelectorAll('[data-testid=${testid}] option') ?? [])].filter(x=>x.value).map(x=>x.textContent)`);
const set = (scope, testid, value) => ev(`(()=>{const el=${scope}?.querySelector('[data-testid=${testid}]');if(!el)return false;
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const emptyForm = async (o, sentence, withLink, label) => {
  await ev(`${row(o)}?.querySelector('[data-testid=commit-open]')?.click()`); await sleep(400);
  const f = `${row(o)}?.querySelector('[data-testid=commit]')`;
  const txt = await ev(`${f}?.querySelector('[data-testid=no-customer-side]')?.textContent ?? null`);
  check(txt === sentence, `${label}: the commit form prints "${sentence}"`, txt);
  check((await ev(`${f}?.querySelector('[data-testid=commit-committer]') === null`)) === true, `${label}: it offers no one to choose`);
  const link = await ev(`(()=>{const a=${f}?.querySelector('[data-testid=no-customer-side-link]');return a?[a.textContent,a.getAttribute('href')].join('|'):null})()`);
  if (withLink) check(link === 'the roles card|#customer-roles', `${label}: "the roles card" links to card 01b (#customer-roles)`, link);
  else check(link === null, `${label}: no link (this page has no roles card)`, link);
  check((await ev(`${f}?.querySelector('button[type=submit]')?.disabled`)) === true, `${label}: Commit is disabled`);
  const u = await ev(`${f}?.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`);
  const want = withLink ? UNMET : SELF_UNMET;
  check(u.includes(want), `${label}: its unmet line says "${want}"`, u);
  return f;
};

if (SECTIONS.includes('lists')) {
  check(await openAccount(E.INST, [E.OC, E.OV]), 'lists: card 01d lists the fixture outcomes');
  await ev(`${row(E.OC)}.querySelector('[data-testid=commit-open]')?.click()`); await sleep(300);
  const c = await options(E.OC, 'commit-committer');
  check(Array.isArray(c) && c.length === 1 && c[0].startsWith(E.OWNER_NAME), `lists: "Who commits" offers ${E.OWNER_NAME} alone`, JSON.stringify(c));
  check(Array.isArray(c) && !c.some((x) => x.startsWith(E.NOROLE_NAME)), `lists: "Who commits" does not offer ${E.NOROLE_NAME} (no role named)`, JSON.stringify(c));
  await ev(`${row(E.OV)}.querySelector('[data-testid=verify-open]')?.click()`); await sleep(300);
  const v = await options(E.OV, 'verify-verifier');
  check(Array.isArray(v) && v.length === 1 && v[0].startsWith(E.OWNER_NAME), `lists: "Who verifies" offers ${E.OWNER_NAME} alone`, JSON.stringify(v));
}

if (SECTIONS.includes('empty')) {
  check(await openAccount(E.INST_E, [E.OE]), 'empty: card 01d on the account with no customer-side person');
  const f = await emptyForm(E.OE, SENTENCE, true, 'empty');
  await ev(`window.scrollTo(0, document.body.scrollHeight)`); await sleep(300);
  await ev(`${f}?.querySelector('[data-testid=no-customer-side-link]')?.click()`); await sleep(600);
  const top = await ev(`(()=>{const el=document.getElementById('customer-roles');return el?Math.round(el.getBoundingClientRect().top)+0:null})()`);
  const before = await ev(`(()=>{const el=document.getElementById('customer-roles');return el?'found':'missing'})()`);
  check(typeof top === 'number' && top >= -5 && top < 450, 'empty: the link brings the roles card into view', `top ${String(top)}, the card ${before}, hash ${await ev('location.hash')}`);
}

if (SECTIONS.includes('addperson')) {
  check(await openAccount(E.INST_E, [E.OE]), 'addperson: the account with no customer-side person');
  const card = `document.getElementById('customer-roles')`;
  await ev(`${card}?.querySelector('[data-testid=person-add-open]')?.click()`); await sleep(300);
  const f = `${card}?.querySelector('[data-testid=person-add]')`;
  await set(f, 'person-add-name', E.NEW_NAME); await set(f, 'person-add-email', E.NEW_EMAIL); await set(f, 'person-add-title', 'Plant controller'); await sleep(250);
  check((await ev(`${f}?.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`)) === '', 'addperson: the form is complete');
  await ev(`${f}?.querySelector('button[type=submit]')?.click()`);
  check(await waitFor(`!!${f}?.querySelector('[data-testid=form-confirm]')`), 'addperson: it asks for confirmation');
  const ct = await ev(`${f}?.querySelector('[data-testid=confirm-text]')?.textContent ?? ''`);
  check(ct === `Add ${E.NEW_NAME}, Plant controller, as a person of this account.`, 'addperson: the confirmation names the person', ct);
  await ev(`${f}?.querySelector('[data-testid=form-confirm-yes]')?.click()`);
  check(await waitFor(`!${card}?.querySelector('[data-testid=person-add]') && !!${card}?.querySelector('[data-testid=person-add-open]')`, 15000), 'addperson: confirmed; the form closes');
}

if (SECTIONS.includes('curia')) {
  check(await openAccount(E.CURIA, [E.CURIA_O, E.CURIA_OPEN]), "curia: card 01d lists e3fb0061 and the open outcome");
  const side = await ev(`${row(E.CURIA_O)}?.querySelector('[data-testid=outcome-committer-side]')?.textContent ?? null`);
  check(side === BEFORE, `curia: e3fb0061 reads "${BEFORE.slice(3)}"`, side);
  await emptyForm(E.CURIA_OPEN, SENTENCE, true, 'curia');
}

if (SECTIONS.includes('tenant')) {
  check(await openAccount(E.SELF, [E.SO]), "tenant: card 01d on the tenant's own page");
  await emptyForm(E.SO, SELF_SENTENCE, false, 'tenant');
}

console.log(`DONE ${out.filter((l) => l.startsWith('PASS')).length} ${out.filter((l) => l.startsWith('FAIL')).length}`);
ws.close();
process.exit(0);
