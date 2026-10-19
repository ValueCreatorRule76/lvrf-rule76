#!/usr/bin/env bash
#
# UX-1 slice 2 — the Accounts home and the phone-width header (DESIGN_SPEC §9,
# "UX-1 standards"). Presentation only. Local verification.
#
#   ./scripts/verify_accounts_home.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data
# neutralised) to `lvrf_verifyhome` with make_clone, migrated and hardened,
# dropped on exit: it carries real reference examples, retired engagements,
# locked runs and the tenant's own account. One new account is created through
# the route. Checked in a browser, signed in by SESSION (a fixture credential on
# the clone only), at 1280 and 390. Checks are structural, never tied to names.
# DELIBERATE BREAKS edit a client file in place and restore it byte-identical.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyhome
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3096; VITE_PORT=5196; CDP_PORT=9356
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_home.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
HOME_PAGE=client/src/pages/AccountsIndexPage.tsx
HEADER=client/src/components/AppHeader.tsx
for f in "$HOME_PAGE" "$HEADER"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  [ -f "$W/workspaceStatus.ts.orig" ] && { cmp -s "$W/workspaceStatus.ts.orig" client/src/lib/workspaceStatus.ts || { cp "$W/workspaceStatus.ts.orig" client/src/lib/workspaceStatus.ts; echo "  (EXIT trap restored workspaceStatus.ts)"; }; }
  for f in "$HOME_PAGE" "$HEADER"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W/chrome"
}
trap cleanup EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck"
(cd client && npx tsc -b) > "$W/tsc.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc.log")"

step "2. Clone the prod copy, migrate, harden; a session"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy && migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 \
  && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "cloned the prod copy, converted, migrated, hardened" || { bad "clone"; exit 1; }
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d "{\"institution\":{\"name\":\"Home check new account $(date +%s)\"}}" "$BASE/api/account-inputs")"
[ "$CODE" = "201" ] && ok "a new account, through the route" || bad "new account -> $CODE"
NEW="$(node -e "console.log(require('$W/r.json').institution_id)")"
N_ACC="$(q "SELECT count(*) FROM institutions WHERE deleted_at IS NULL AND superseded_by_id IS NULL AND tenant_id = (SELECT tenant_id FROM persons WHERE id = '$S')")"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "signed in by session" || { bad "no session"; exit 1; }

cat > "$W/home.mjs" <<'JS'
import { writeFileSync } from 'node:fs';
const [CDP, VITE, TOKEN, SHOTS, NAME, N_ACC, NEW, MODE] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
const paused = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Fetch.requestPaused') paused.push(m.params); });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
// Enter needs its text ("\r") for the browser to press the focused button.
const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(k === 'Enter' ? { text: '\r' } : {}) }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(150); };
const out = [];
const check = (c, m, d = '') => out.push(`${c ? 'PASS' : 'FAIL'}  ${m}${!c && d ? ` — ${d}` : ''}`);
const shot = async (file, width) => {
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 9000), deviceScaleFactor: 1, mobile: width < 600 }); await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${SHOTS}/${file}.png`, Buffer.from(r.result.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }); await sleep(300);
};
await send('Network.enable');
await send('Network.setCookie', { name: 'lvrf_session', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true });
for (const width of [1280, 390]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: `http://localhost:${VITE}/` });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { await sleep(200); ready = await ev(`document.querySelectorAll('[data-testid=account-row]').length === ${N_ACC} && ![...document.querySelectorAll('[data-testid=row-engagements]')].some(e=>e.textContent.includes('loading'))`); }
  await sleep(500);
  const W = `${NAME} @${width}`;
  // Rows: real links, one per account, to the account.
  const rows = await ev(`[...document.querySelectorAll('[data-testid=account-row]')].map(a=>({tag:a.tagName, href:a.getAttribute('href'), text:a.textContent}))`);
  check(rows.length === Number(N_ACC) && rows.every((r) => r.tag === 'A' && /^\/accounts\/[0-9a-f-]{36}$/.test(r.href)), `${W}: one row per account (${N_ACC}), each a real link to its account`, JSON.stringify(rows.map((r) => [r.tag, r.href])));
  // Each row's words: standing as "n of 6 · …" (or the tenant's own); each engagement's run in the agreed form.
  const standing = await ev(`[...document.querySelectorAll('[data-testid=row-standing]')].map(e=>e.childNodes[0]?.textContent ?? '')`);
  check(standing.every((s) => /^[1-6] of 6 · \S/.test(s) || s === 'Not worked as a path: your own account'), `${W}: every row says where it stands ("n of 6 · next step")`, JSON.stringify(standing));
  const runs = await ev(`[...document.querySelectorAll('[data-testid=row-engagement]')].map(e=>e.querySelector('span.block')?.textContent ?? '')`);
  check(runs.length > 0 && runs.every((s) => /^run \d+ · \d+ \/ 100 · (Low|Medium|High)$/.test(s) || s === 'No locked run yet.'), `${W}: every engagement line is "run N · n / 100 · Band" or "No locked run yet."`, JSON.stringify(runs));
  const low = await ev(`[...document.querySelectorAll('[data-testid=confidence-badge]')].filter(b=>/· Low/.test(b.textContent)).map(b=>getComputedStyle(b).color)`);
  const critical = await ev(`(()=>{const d=document.createElement('span');d.className='text-critical';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c})()`);
  check(low.length > 0 && low.every((c) => c !== critical), `${W}: Low is never critical red (${low.length} Low badges)`, JSON.stringify(low));
  const newRow = await ev(`[...document.querySelectorAll('[data-testid=account-row]')].find(a=>a.getAttribute('href')==='/accounts/${NEW}')?.textContent ?? ''`);
  check(newRow.includes('1 of 6 · Research the entity') && newRow.includes('No engagement yet.'), `${W}: the new account reads "1 of 6 · Research the entity" and "No engagement yet."`, newRow.slice(0, 160));
  check(rows.some((r) => / · reference example \(/.test(r.text)) && rows.some((r) => r.text.includes("your own company's account")), `${W}: status in plain words (a reference example with its kind; your own company's account)`);
  // One filled button; the create form is closed until asked for.
  const prim = await ev(`[...document.querySelectorAll('[data-primary=true]')].map(e=>e.textContent.trim())`);
  check(prim.length === 1 && prim[0] === 'New account…', `${W}: one filled button: "New account…"`, JSON.stringify(prim));
  check(await ev(`!document.querySelector('[data-testid=create-account]')`), `${W}: the create form is not open until asked for`);
  // Headers.
  const desk = await ev(`getComputedStyle(document.querySelector('[data-testid=header-desktop]')).display`);
  const phone = await ev(`getComputedStyle(document.querySelector('[data-testid=header-phone]')).display`);
  check(width === 1280 ? desk !== 'none' && phone === 'none' : desk === 'none' && phone !== 'none', `${W}: the ${width === 1280 ? 'desktop row' : 'one-row phone header'} is the one shown`, `desktop ${desk}, phone ${phone}`);
  const sw = await ev('document.documentElement.scrollWidth');
  check(sw <= width, `${W}: no sideways scroll (scrollWidth ${sw})`);
  // The app's own words: record values (account and engagement names, which
  // are shown verbatim, standard 8) are taken out before looking.
  const text = await ev(`(()=>{const c=document.querySelector('[data-testid=accounts-home]').cloneNode(true);c.querySelectorAll('[data-testid=row-engagement], [data-testid=account-row] > span:first-child > span:first-child, a[href^="/accounts/"]').forEach(e=>{ if(e.matches('[data-testid=row-engagement]')||e.parentElement?.parentElement?.matches('[data-testid=account-row]')) e.textContent=''; });c.querySelectorAll('[data-testid=book-scope] a, table a, li a').forEach(e=>e.textContent='');return c.textContent})()`);
  check(!/\bW[1-9]\b|§|cohort|customer zero|O-D\d/i.test(text), `${W}: no internal terms on the page`, (text.match(/\bW[1-9]\b|§|cohort|customer zero|O-D\d/i) || [''])[0]);
  if (width === 1280) {
    // Tab order: "New account…", then every row link, in document order.
    await ev('document.activeElement && document.activeElement.blur(); window.scrollTo(0,0); true');
    const seen = [];
    for (let i = 0; i < 40; i++) { await key('Tab', 'Tab', 9); const a = await ev(`(()=>{const a=document.activeElement;return a?.dataset?.testid==='account-row'?a.getAttribute('href'):(a?.dataset?.primary==='true'?'NEW':null)})()`); if (a && !seen.includes(a)) seen.push(a); }
    const hrefs = rows.map((r) => r.href);
    check(JSON.stringify(seen.filter((x) => x !== 'NEW')) === JSON.stringify(hrefs) && seen.indexOf('NEW') === 0, `${W}: Tab reaches "New account…" first, then every row in order`, JSON.stringify(seen));
    await shot(`ux1s2_accounts_1280`, 1280);
    // Open the form on demand: its opener goes, the form is there, nothing else is filled.
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='New account…').click()`); await sleep(500);
    check(await ev(`!!document.querySelector('[data-testid=create-account]') && ![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='New account…')`), `${W}: "New account…" opens the create form, and is replaced by it`);
    const p2 = await ev(`[...document.querySelectorAll('[data-primary=true]')].length`);
    check(p2 <= 1, `${W}: with the form open, at most one filled button (${p2}; the submit is filled once the form can be sent)`);
    check(await ev(`[...document.querySelectorAll('[data-testid=create-account] [data-testid=form-unmet]')].some(e=>e.textContent.length>0)`), `${W}: the form's disabled submit says what it waits for`);
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Close the form').click()`); await sleep(400);
    check(await ev(`!document.querySelector('[data-testid=create-account]')`), `${W}: "Close the form" closes it again`);
  } else {
    await shot(`ux1s2_accounts_390`, 390);
    // The Menu control, by keyboard.
    const btn = `document.querySelector('[data-testid=menu-button]')`;
    check(await ev(`${btn}.tagName==='BUTTON' && ${btn}.getAttribute('aria-expanded')==='false' && ${btn}.getAttribute('aria-controls')==='phone-menu'`), `${W}: "Menu" is a real button, aria-expanded false, aria-controls the panel`, await ev(`${btn}?.outerHTML.slice(0,160)`));
    check(await ev(`document.getElementById('phone-menu').hidden`), `${W}: the panel is hidden while closed`);
    await shot(`ux1s2_header_390_closed`, 390);
    await ev('window.scrollTo(0,0); document.activeElement && document.activeElement.blur(); true');
    let focused = false; for (let i = 0; i < 6 && !focused; i++) { await key('Tab', 'Tab', 9); focused = await ev(`document.activeElement===${btn}`); }
    check(focused, `${W}: Tab reaches "Menu" first`);
    await key('Enter', 'Enter', 13);
    check(await ev(`${btn}.getAttribute('aria-expanded')==='true' && !document.getElementById('phone-menu').hidden && document.getElementById('phone-menu').textContent.includes('Signed in as')`), `${W}: Enter opens it: aria-expanded true; the links and the signed-in block are shown`);
    await key('Tab', 'Tab', 9);
    check(await ev(`document.getElementById('phone-menu').contains(document.activeElement) && document.activeElement.tagName==='A'`), `${W}: the next Tab lands on the panel's first link`, await ev('document.activeElement?.outerHTML.slice(0,80)'));
    const sw2 = await ev('document.documentElement.scrollWidth');
    check(sw2 <= width, `${W}: no sideways scroll with the menu open (scrollWidth ${sw2})`);
    await shot(`ux1s2_header_390_open`, 390);
    await key('Escape', 'Escape', 27);
    check(await ev(`${btn}.getAttribute('aria-expanded')==='false' && document.getElementById('phone-menu').hidden`), `${W}: Escape closes it`);
  }
}
// A row whose reads are loading, then whose /walk fails (the browser's own
// request interception: nothing on the server is changed). Never a status from
// partial data; words only, no id; the row still a link; the rest of the page
// and the Book confidence card still there.
if (MODE !== 'nointercept') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const target = (await ev(`[...document.querySelectorAll('[data-testid=account-row]')].map(a=>a.getAttribute('href')).filter(h=>h!=='/accounts/${NEW}')`))[0].split('/').pop();
  const rowOf = `[...document.querySelectorAll('[data-testid=account-row]')].find(a=>a.getAttribute('href')==='/accounts/${target}')`;
  await send('Fetch.enable', { patterns: [{ urlPattern: `*/api/institutions/${target}/walk*`, requestStage: 'Request' }] });
  // 1. Held: loading.
  paused.length = 0;
  await send('Page.navigate', { url: `http://localhost:${VITE}/` });
  for (let i = 0; i < 60 && paused.length === 0; i++) await sleep(150);
  await sleep(1500);
  const loading = await ev(`(()=>{const a=${rowOf};return a?{tag:a.tagName,href:a.getAttribute('href'),loading:!!a.querySelector('[data-testid=row-loading]'),text:a.querySelector('[data-testid=row-loading]')?.textContent,standing:a.querySelector('[data-testid=row-standing]')?.textContent??''}:null})()`);
  check(paused.length > 0 && loading && loading.loading && loading.text === 'loading…' && loading.standing === '', `loading: with its /walk still pending, the row says "loading…" and no status`, JSON.stringify(loading));
  check(loading && loading.tag === 'A' && loading.href === `/accounts/${target}`, `loading: the row is still a working link`);
  check(await ev(`[...document.querySelectorAll('[data-testid=account-row]')].filter(a=>a.getAttribute('href')!=='/accounts/${target}').every(a=>/of 6 · |Not worked as a path/.test(a.querySelector('[data-testid=row-standing]')?.textContent??''))`), `loading: every other row shows its status`);
  check(await ev(`!!document.querySelector('[data-testid=book-scope]')`), `loading: the Book confidence card still renders`);
  for (const p of paused.splice(0)) await send('Fetch.continueRequest', { requestId: p.requestId });
  await sleep(1500);
  check(await ev(`/of 6 · /.test(${rowOf}.querySelector('[data-testid=row-standing]')?.textContent??'')`), `loading: once the read arrives, the row shows its status`);
  // 2. Failed: a 500 for this account's /walk.
  await send('Fetch.disable'); await send('Fetch.enable', { patterns: [{ urlPattern: `*/api/institutions/${target}/walk*`, requestStage: 'Request' }] });
  paused.length = 0;
  await send('Page.navigate', { url: `http://localhost:${VITE}/` });
  let answered = 0;
  for (let i = 0; i < 80 && answered === 0; i++) {
    await sleep(150);
    for (const p of paused.splice(0)) { await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 500, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ message: `value outcome ${target} could not be read (simulated)` })).toString('base64') }); answered++; }
  }
  await sleep(2000);
  const failed = await ev(`(()=>{const a=${rowOf};return a?{tag:a.tagName,href:a.getAttribute('href'),msg:a.querySelector('[data-testid=row-unavailable]')?.textContent,standing:a.querySelector('[data-testid=row-standing]')?.textContent??'',engagements:a.querySelectorAll('[data-testid=row-engagement]').length,text:a.textContent}:null})()`);
  check(answered > 0 && failed && failed.msg === "Couldn't load this account's status.", `failed /walk: the row says "Couldn't load this account's status."`, JSON.stringify(failed));
  check(failed && failed.standing === '' && failed.engagements === 0, `failed /walk: nothing computed from the other reads (no status, no runs)`, JSON.stringify(failed));
  check(failed && !/[0-9a-f]{8}-[0-9a-f]{4}/.test(failed.text) && !failed.text.includes('simulated'), `failed /walk: in words, no id and not the server's message`, failed?.text);
  check(failed && failed.tag === 'A' && failed.href === `/accounts/${target}`, `failed /walk: the row is still a working link`);
  check(await ev(`[...document.querySelectorAll('[data-testid=account-row]')].filter(a=>a.getAttribute('href')!=='/accounts/${target}').every(a=>/of 6 · |Not worked as a path/.test(a.querySelector('[data-testid=row-standing]')?.textContent??''))`), `failed /walk: every other row shows its status`);
  check(await ev(`!!document.querySelector('[data-testid=book-scope]') && !!document.querySelector('[data-testid=accounts-home] h1')`), `failed /walk: the rest of the page and the Book confidence card still render`);
  await shot('ux1s2_accounts_row_unavailable_1280', 1280);
  await send('Fetch.disable');
}
console.log(out.join('\n')); ws.close(); process.exit(0);
JS
look() {  # NAME
  node "$W/home.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$SHOTS" "$1" "$N_ACC" "$NEW" > "$W/look.$1.log" 2>&1 || bad "the $1 walk crashed: $(tail -3 "$W/look.$1.log")"
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$W/look.$1.log"
}

step "3. The home and the header, at 1280 and 390"
look home

step "4. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
broke() {  # NAME EXPECTED_FAILURE_TEXT LABEL
  sleep 5; node "$W/home.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$W" "$1" "$N_ACC" "$NEW" nointercept > "$W/$1.log" 2>&1 || true
  grep -q "FAIL  $1 @[0-9]*: $2" "$W/$1.log" && ok "$3" || bad "$1: not caught: $(grep -m3 FAIL "$W/$1.log" | tr '\n' ' ')"
}
# B1 — rows out of the keyboard order (a link Tab cannot reach).
edit "$HOME_PAGE" '<Link to={`/accounts/${inst.id}`} data-testid="account-row"' '<Link to={`/accounts/${inst.id}`} tabIndex={-1} data-testid="account-row"'
broke b1 'Tab reaches "New account…" first, then every row in order' 'B1: rows taken out of the Tab order → caught (rows must be keyboard-reachable)'
restore "$HOME_PAGE"
# B2 — the create form permanently open.
edit "$HOME_PAGE" 'const [creating, setCreating] = useState(false);' 'const [creating, setCreating] = useState(true);'
broke b2 'the create form is not open until asked for' 'B2: the create form open on load → caught (it opens on demand)'
restore "$HOME_PAGE"
# B3 — "Menu" without aria-expanded.
edit "$HEADER" 'aria-expanded={open} aria-controls="phone-menu"' 'aria-controls="phone-menu"'
broke b3 '"Menu" is a real button, aria-expanded false' 'B3: "Menu" without aria-expanded → caught'
restore "$HEADER"
# B4 — the desktop row shown at 390 (the old three-row stack).
edit "$HEADER" '<div className="hidden flex-wrap items-stretch sm:flex" data-testid="header-desktop">' '<div className="flex flex-wrap items-stretch" data-testid="header-desktop">'
broke b4 'the one-row phone header is the one shown' 'B4: the desktop row at 390 → caught (one row with "Menu" instead)'
restore "$HEADER"
# B5 — a failed read treated as empty (the old behaviour): a status from partial data.
LIB=client/src/lib/workspaceStatus.ts; cp "$LIB" "$W/workspaceStatus.ts.orig"
edit "$LIB" "  if (!w.ok || !p.ok || !r.ok) return { error: ROW_UNAVAILABLE };" "  if (!p.ok || !r.ok) return { error: ROW_UNAVAILABLE };"
edit "$LIB" "  const walk = w.v; const pov = p.v; const research = r.v;" "  const walk = w.ok ? w.v : null; const pov = p.v; const research = r.v;"
sleep 5; node "$W/home.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$W" b5 "$N_ACC" "$NEW" > "$W/b5.log" 2>&1 || true
grep -q 'FAIL  failed /walk: the row says' "$W/b5.log" && ok "B5: a failed /walk read as empty → caught: the row would show a status from partial data" || bad "B5: not caught: $(grep -m3 'failed /walk' "$W/b5.log" | tr '\n' ' ')"
cp "$W/workspaceStatus.ts.orig" "$LIB"; cmp -s "$W/workspaceStatus.ts.orig" "$LIB" && ok "  ...$LIB restored byte-identical" || bad "  ...$LIB restore differs"
for f in "$HOME_PAGE" "$HEADER"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" = "0" ]
