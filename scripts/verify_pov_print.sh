#!/usr/bin/env bash
#
# UX-1 slice 3 — the POV on screen and in print (DESIGN_SPEC §9, "UX-1
# standards"; O-D5: the PDF is the browser's print of the page; CLAUDE.md:
# every printed page carries the disclosure banner and the run's hash).
# Local verification.
#
#   ./scripts/verify_pov_print.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data
# neutralised) to `lvrf_verifypov` with make_clone, migrated and hardened,
# dropped on exit; one new account (no locked run) through the route. Each POV
# is checked in a browser signed in by SESSION at 1280 and 390, then printed to
# PDF by Chrome (Page.printToPDF) and read PAGE BY PAGE with pdftotext; every
# page is also rendered to an image (pdftoppm) for a person to look at.
# DELIBERATE BREAKS edit a source file in place and restore it byte-identical.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
command -v pdftotext > /dev/null && command -v pdftoppm > /dev/null || { echo "REFUSING: pdftotext/pdftoppm (poppler) not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifypov
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3097; VITE_PORT=5197; CDP_PORT=9357
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_pov.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
POVPAGE=client/src/pages/PovPage.tsx
FORMAT=client/src/lib/format.ts
ROUTE=server/routes/valueHypotheses.ts
for f in "$POVPAGE" "$FORMAT" "$ROUTE"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
start_server() {
  LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start"; exit 1
}
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$POVPAGE" "$FORMAT" "$ROUTE"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck"
(cd client && npx tsc -b) > "$W/tsc.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc.log")"
npx tsc --noEmit -p . > "$W/tsc2.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc2.log")"

step "2. Clone the prod copy; a new account with no locked run; a session"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy && migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 \
  && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "cloned the prod copy, converted, migrated, hardened" || { bad "clone"; exit 1; }
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server && ok "API up on $PORT"
CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d "{\"institution\":{\"name\":\"POV check unsealed account $(date +%s)\"}}" "$BASE/api/account-inputs")"
[ "$CODE" = "201" ] && ok "a new account (no locked run), through the route" || bad "new account -> $CODE"
NEW="$(node -e "console.log(require('$W/r.json').institution_id)")"
SCOTTS="$(q "SELECT id FROM institutions WHERE name ILIKE 'Scotts%' LIMIT 1")"; CURIA="$(q "SELECT id FROM institutions WHERE name = 'Curia' LIMIT 1")"
[ -n "$SCOTTS" ] && [ -n "$CURIA" ] && ok "the copy has Scotts and Curia" || { bad "Scotts or Curia missing from the copy"; exit 1; }
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "signed in by session" || { bad "no session"; exit 1; }

cat > "$W/pov.mjs" <<'JS'
import { writeFileSync } from 'node:fs';
const [CDP, VITE, TOKEN, OUTDIR, NAME, ID, X_JSON] = process.argv.slice(2);
const X = JSON.parse(X_JSON);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
const out = [];
const check = (c, m, d = '') => out.push(`${c ? 'PASS' : 'FAIL'}  ${m}${!c && d ? ` — ${d}` : ''}`);
await send('Network.enable');
await send('Network.setCookie', { name: 'lvrf_session', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true });
const LABELS = ['Baseline set', 'Capability attached', 'Value modelled', 'Target committed', 'Actual measured', 'Verified', 'Returned to the record'];
for (const width of [1280, 390]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: `http://localhost:${VITE}/accounts/${ID}/pov` });
  let ready = false; for (let i = 0; i < 80 && !ready; i++) { await sleep(200); ready = await ev(`!!document.querySelector('[data-testid=pov] h1') && !document.querySelector('[data-testid=what-it-takes]')?.textContent.includes('loading')`); }
  await sleep(700);
  const W = `${NAME} @${width}`;
  const labels = await ev(`[...document.querySelectorAll('[data-testid=stages] li span:last-child')].map(s=>s.textContent.replace(' · no committed target',''))`);
  check(labels.length > 0 ? labels.every((l) => LABELS.includes(l)) : X.noStages, `${W}: the stage bar uses the plain labels`, JSON.stringify([...new Set(labels)]));
  if (labels.length) check(await ev(`!!document.querySelector('[data-testid=stage-legend]')`), `${W}: the stage bar has its legend`);
  const conf = await ev(`document.querySelector('[data-testid=confidence]')?.textContent ?? ''`);
  check(X.confidence ? conf.includes(X.confidence) : conf.includes('No computed confidence: no locked run.'), `${W}: confidence reads "${X.confidence ?? 'No computed confidence: no locked run.'}"`, conf);
  const fals = await ev(`[...document.querySelectorAll('[data-testid=pov] li')].map(l=>l.textContent).filter(t=>t.includes('at or above its') || t.includes('at or below its'))`);
  for (const f of fals) {
    const sentence = f.slice(f.indexOf(f.match(/\S+ \S+ at or (above|below) its|[^.]* at or (above|below) its/)?.[0] ?? ''));
    check(/ by \d{1,2} [A-Z][a-z]{2} \d{4}(, provided that: [^]*)?\./.test(f) && !/\.\./.test(f) && /\(recorded \d{1,2} [A-Z][a-z]{2} \d{4}\)/.test(f), `${W}: the falsifier is one sentence: "… (recorded <date>) by <date>, provided that: …." with one final period`, sentence.slice(0, 220));
  }
  if (X.falsifiers) check(fals.length >= X.falsifiers, `${W}: ${X.falsifiers} falsifier sentence(s) on the page`, String(fals.length));
  const lever = await ev(`[...document.querySelectorAll('[data-testid=chain] li')].find(l=>l.textContent.includes('Lever'))?.querySelector('span:last-child')?.textContent ?? null`);
  if (X.lever) check(lever === X.lever, `${W}: the lever reads "${X.lever}"`, String(lever));
  const facts = await ev(`[...document.querySelectorAll('[data-testid=fact-value]')].map(e=>e.textContent)`);
  check(facts.every((f) => !/\d{5,}/.test(f.replace(/[,.]/g, (c) => c === ',' ? '' : '.')) || /million/.test(f)) && facts.every((f) => !/^\d{4,}(\s|$)/.test(f)), `${W}: no raw long number among the facts (${facts.length} facts)`, JSON.stringify(facts));
  for (const want of X.facts ?? []) check(facts.includes(want), `${W}: a fact reads "${want}"`, JSON.stringify(facts));
  // Stored values in words: no raw enum value among the labels the page derives.
  const RAW = ['public_filer', 'private', 'subsidiary_of_filer', 'public_sector', 'sec_cik', 'sec cik', 'stated_priority', 'stated priority', 'disclosure_regime', 'disclosure regime', 'definition', 'document', 'person', 'open, viable', 'refused, blocked', 'general', 'cfo', 'chro', 'board'];
  const derived = await ev(`[...document.querySelectorAll('[data-testid=fact-kind],[data-testid=gap-kind],[data-testid=gap-state],[data-testid=summary] span')].map(e=>e.textContent.trim()).concat([...document.querySelectorAll('[data-testid=facts] tr')].filter(t=>t.querySelector('[data-testid=fact-kind]')?.textContent==='Disclosure regime').map(t=>t.querySelector('[data-testid=fact-value]').textContent))`);
  const entity = await ev(`document.querySelector('[data-testid=pov] header .font-mono')?.textContent ?? ''`);
  const rawSeen = derived.filter((t) => t.includes('_') || RAW.includes(t)).concat(/sec_cik|sec cik/.test(entity) ? [entity] : []);
  check(rawSeen.length === 0, `${W}: no stored enum value shown raw (fact kinds, the disclosure regime, the identifier type, the gap table, the summary's reader; ${derived.length} labels)`, JSON.stringify(rawSeen));
  for (const want of X.labels ?? []) check(derived.includes(want) || entity.includes(want), `${W}: reads "${want}"`, JSON.stringify(derived.concat(entity)));
  // A stored unit is shown without its trailing punctuation.
  const units = await ev(`[...document.querySelectorAll('[data-testid=outcome] table tr:first-child td:nth-child(2)')].map(e=>e.textContent)`);
  if (units.length) check(units.every((u) => !/[.;,:]\s*$/.test(u)), `${W}: the baseline's stored unit has no trailing punctuation`, JSON.stringify(units));
  // Recorded text exactly as recorded.
  for (const want of X.verbatim ?? []) check(await ev(`document.body.textContent.includes(${JSON.stringify(want)})`), `${W}: recorded text kept exactly: "${want}"`);
  const sw = await ev('document.documentElement.scrollWidth');
  check(sw <= width, `${W}: no sideways scroll (scrollWidth ${sw})`);
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 9000), deviceScaleFactor: 1, mobile: width < 600 }); await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUTDIR}/ux1s3_pov_${NAME}_${width}.png`, Buffer.from(r.result.data, 'base64'));
  // Locked runs on screen: each engagement's latest run; "Show all N runs" expands.
  if (X.runs) {
    const vis = () => ev(`[...document.querySelectorAll('[data-testid=locked-run]')].filter(l=>l.offsetParent!==null).map(l=>l.querySelector('a').textContent)`);
    const v0 = await vis();
    check(JSON.stringify(v0) === JSON.stringify(X.runs.latest), `${W}: Locked runs shows each engagement's latest run only: ${X.runs.latest.join('; ')}`, JSON.stringify(v0));
    const btns = await ev(`[...document.querySelectorAll('[data-testid=show-all-runs]')].map(b=>[b.textContent,b.getAttribute('aria-expanded')])`);
    check(JSON.stringify(btns) === JSON.stringify(X.runs.buttons.map((t) => [t, 'false'])), `${W}: ${X.runs.buttons.map((t) => `"${t}"`).join(', ') || 'no'} button(s), aria-expanded false`, JSON.stringify(btns));
    if (btns.length) {
      await ev(`document.querySelectorAll('[data-testid=show-all-runs]').forEach(b=>b.click())`); await sleep(300);
      const v1 = await vis();
      check(v1.length === X.runs.total && await ev(`[...document.querySelectorAll('[data-testid=show-all-runs]')].every(b=>b.getAttribute('aria-expanded')==='true')`), `${W}: expanded, every one of the ${X.runs.total} runs shows and aria-expanded is true`, String(v1.length));
      await ev(`document.querySelectorAll('[data-testid=show-all-runs]').forEach(b=>b.click())`); await sleep(300);
      check((await vis()).length === X.runs.latest.length, `${W}: "Show the latest run only" folds them again`);
    }
  }
}
// Print, as the browser prints it.
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:${VITE}/accounts/${ID}/pov` });
let ready = false; for (let i = 0; i < 80 && !ready; i++) { await sleep(200); ready = await ev(`!!document.querySelector('[data-testid=pov] h1') && !document.querySelector('[data-testid=what-it-takes]')?.textContent.includes('loading')`); }
await sleep(800);
const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
writeFileSync(`${OUTDIR}/ux1s3_pov_${NAME}.pdf`, Buffer.from(pdf.result.data, 'base64'));
console.log(out.join('\n')); ws.close(); process.exit(0);
JS
# Every printed page: the banners, the seal line, the print date, "rendered from
# the record as it stands", the page number; never the app's own header.
# The record hashes, against what GET /pov says: every page carries the FULL hash
# of each engagement's latest locked run and "N locked runs in all; …"; no page
# carries a shortened hash; every run's full hash prints once more, under Locked
# runs (Brad, 19 Oct 2026).
cat > "$W/hashes.py" <<'PY2'
import json, re, subprocess, sys
pdf, pov = sys.argv[1], json.load(open(sys.argv[2]))
txt = lambda *a: re.sub(r'\s+', '', subprocess.run(['pdftotext', *a, pdf, '-'], capture_output=True, text=True).stdout)
n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
sealed = [e for e in pov['engagements'] if e['locked_runs']]
runs = [r for e in sealed for r in e['locked_runs']]
latest = [max(e['locked_runs'], key=lambda r: r['run_number']) for e in sealed]
total = len(runs)
line = re.sub(r'\s+', '', f"{total} locked {'run' if total == 1 else 'runs'} in all; every run's full hash is listed under Locked runs.")
bad = []
for p in range(1, n + 1):
    t = txt('-f', str(p), '-l', str(p))
    for r in latest:
        if f"latestlockedrun,run{r['run_number']}·recordhash{r['payload_hash']}" not in t: bad.append(f"p{p}:latest-run-{r['run_number']}")
    if sealed and line not in t: bad.append(f"p{p}:count-line")
    if re.search(r'[0-9a-f]{8,63}…', t): bad.append(f"p{p}:shortened-hash")
whole = txt()
latest_ids = {r['id'] for r in latest}
for r in runs:
    c = whole.count(r['payload_hash'])
    want = n + 1 if r['id'] in latest_ids else 1
    if c != want: bad.append(f"run-{r['run_number']}:{c}x-not-{want}x")
if bad: print('BAD ' + ' '.join(bad[:12]))
else: print(f"OK {n} page(s): every page carries the full hash of the latest run of each of {len(sealed)} engagement(s) and \"{total} locked run(s) in all\"; no shortened hash; all {total} full hashes under Locked runs" if sealed else f"OK {n} page(s): no run, so no hash and no count line")
PY2
hashes_check() {  # NAME PDF POV_JSON
  local r; r="$(python3 "$W/hashes.py" "$2" "$3" 2>&1)"
  case "$r" in OK*) ok "$1: ${r#OK }" ;; *) bad "$1: record hashes — ${r#BAD }" ;; esac
}
pages_check() {  # NAME PDF BANNER SEAL [POV_JSON]
  local name="$1" pdf="$2" banner="$3" seal="$4" n p txt flat bad_pages="" citation=""
  # C1b (Brad, 25 Oct 2026): the marker's line is bounded in the header; its full citation prints on page 1.
  [ -n "${5:-}" ] && citation="$(node -e "const p=require('$5');console.log(p.reference_example ? p.reference_example.source_citation.replace(/\s+/g,'') : '')")"
  n="$(pdfinfo "$pdf" 2>/dev/null | awk '/^Pages:/{print $2}')"
  [ -n "$n" ] && [ "$n" -ge 1 ] || { bad "$name: the PDF has no pages"; return; }
  for p in $(seq 1 "$n"); do
    txt="$(pdftotext -f "$p" -l "$p" -layout "$pdf" - 2>/dev/null | tr '\n' ' ' | tr -s ' ')"
    flat="$(printf '%s' "$txt" | tr -d ' ')"
    printf '%s' "$txt" | grep -qF "$banner" || bad_pages="$bad_pages p$p:banner"
    # The hard check (C1b): any printed page without the disclosure sentence fails.
    printf '%s' "$txt" | grep -qE "UNVERIFIED — (not every outcome on this page has a verified actual|no outcome is recorded)" || bad_pages="$bad_pages p$p:disclosure"
    [ -z "$citation" ] || printf '%s' "$flat" | grep -qF "·Sourceonpage1" || bad_pages="$bad_pages p$p:marker-line"
    [ -z "$citation" ] || [ "$p" != "1" ] || printf '%s' "$flat" | grep -qF -- "$citation" || bad_pages="$bad_pages p1:full-citation"
    printf '%s' "$txt" | grep -qF "$seal" || bad_pages="$bad_pages p$p:seal"
    printf '%s' "$txt" | grep -qE "Printed [0-9]{1,2} [A-Z][a-z]{2} [0-9]{4}" || bad_pages="$bad_pages p$p:date"
    printf '%s' "$txt" | grep -qF "rendered from the record as it stands" || bad_pages="$bad_pages p$p:rendered"
    printf '%s' "$txt" | grep -qF "Page $p of $n" || bad_pages="$bad_pages p$p:pageno"
    printf '%s' "$txt" | grep -qF "Signed in as" && bad_pages="$bad_pages p$p:app-header"
    printf '%s' "$txt" | grep -qE "open the run|Show all [0-9]+ runs|Show the latest run only|the account page \(where" && bad_pages="$bad_pages p$p:screen-control"
    printf '%s' "$txt" | grep -qE "public_filer|subsidiary_of_filer|public_sector|sec_cik|sec cik|stated_priority|disclosure_regime|open, viable" && bad_pages="$bad_pages p$p:raw-value"
  done
  [ -z "$bad_pages" ] && ok "$name: printed, $n page(s), and EVERY page carries the banners, \"$seal\", the print date, \"rendered from the record as it stands\" and \"Page n of $n\"; no app header, no screen-only link or button, no raw stored value" || bad "$name: printed pages missing:$bad_pages"
  pdftoppm -r 60 -png "$pdf" "${pdf%.pdf}_page" && ok "  ...each page rendered to an image ($(ls "${pdf%.pdf}"_page-*.png | wc -l | tr -d ' ') files) for a person to look at"
  PAGES_N="$n"
}
look() {  # NAME ID EXPECT_JSON BANNER SEAL [OUTDIR]
  local outdir="${6:-$SHOTS}"
  node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$outdir" "$1" "$2" "$3" > "$W/look.$1.log" 2>&1 || bad "the $1 walk crashed: $(tail -3 "$W/look.$1.log")"
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$W/look.$1.log"
  curl -s -H "x-actor-person-id: $S" "$BASE/api/institutions/$2/pov" > "$W/pov.$1.json"
  [ -f "$outdir/ux1s3_pov_$1.pdf" ] && pages_check "$1" "$outdir/ux1s3_pov_$1.pdf" "$4" "$5" "$W/pov.$1.json" && hashes_check "$1" "$outdir/ux1s3_pov_$1.pdf" "$W/pov.$1.json"
}

step "3. Scotts (locked runs, a hypothesis, a lever, published facts)"
look scotts "$SCOTTS" '{"confidence":"35 / 100 · Low","falsifiers":1,"lever":"ratified by Brad Piver, 19 Oct 2026","facts":["$3,413.1 million","5,200 people"],"labels":["Disclosure regime","Public filer","Stated priority","SEC CIK","General"],"verbatim":["provided that: Same TRIR definition and denominator as the published baseline"],"runs":{"latest":["Scotts Miracle-Gro — reference example, not an engagement (retired), run 2"],"buttons":["Show all 2 runs"],"total":2}}' "OUTSIDE-IN TEST" "record hash"
SCOTTS_PAGES="$PAGES_N"
step "4. Curia (a locked run, no hypothesis)"
look curia "$CURIA" '{"confidence":"10 / 100 · Low","labels":["Definition","Document","Person","Open; can still be closed"],"runs":{"latest":["Curia — lot acceptance, pack-grounded hypothesis, run 1","Curia — reference example, not an engagement (retired), run 21"],"buttons":["Show all 21 runs"],"total":22}}' "REFERENCE EXAMPLE" "record hash"
# C1b (Brad, 25 Oct 2026): every printed header line is bounded — in print emulation each line of the
# printed header is one line tall; Curia's marker carries a 318-character citation.
cat > "$W/header.mjs" <<'JS'
const [CDP, VITE, TOKEN, ID] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
await send('Network.setCookie', { name: 'lvrf_session', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true });
await send('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:${VITE}/accounts/${ID}/pov` });
for (let i = 0; i < 80; i++) { await sleep(200); if (await ev(`!!document.querySelector('[data-testid=pov] h1')`)) break; }
await sleep(900);
await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(400);
const rows = await ev(`[...document.querySelectorAll('[data-testid=print-header] [data-testid=banners] > div')].map(d => { const cs = getComputedStyle(d); const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5; const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth); return { id: d.dataset.testid, lines: Math.round((d.getBoundingClientRect().height - pad) / line) }; })`);
console.log(JSON.stringify(rows)); ws.close(); process.exit(0);
JS
HL="$(node "$W/header.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$CURIA" 2>/dev/null)"
[ -n "$HL" ] && [ "$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.length >= 2 && r.every(x => x.lines === 1))" "$HL")" = "true" ] \
  && ok "curia: in print emulation, every printed header line is one line tall: $HL" || bad "curia: printed header lines: $HL"
step "5. A new account (no locked run): every printed page says nothing is sealed"
look unsealed "$NEW" '{"noStages":true}' "UNVERIFIED" "No locked run: nothing on this page is sealed."

step "6. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
B="$W/breaks"; mkdir -p "$B"
# B1 — the banners in the page only, not a repeating header: only page 1 carries them.
[ "${SCOTTS_PAGES:-1}" -ge 2 ] && {
  edit "$POVPAGE" '<thead className="hidden print:table-header-group" data-testid="print-header">' '<thead className="hidden" data-testid="print-header">'
  edit "$POVPAGE" '<div className="print:hidden"><Banners pov={pov} /></div>' '<div><Banners pov={pov} /></div>'
  # Its own fresh directory, and a positive control: a walk that crashed leaves no
  # PDF, and a page 2 with no banner then proves nothing.
  B1D="$B/b1"; mkdir -p "$B1D"
  sleep 5; node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B1D" scotts "$SCOTTS" '{}' > /dev/null 2>&1 || true
  if [ ! -f "$B1D/ux1s3_pov_scotts.pdf" ]; then bad "B1: the break's walk printed no PDF — nothing to judge"
  elif ! pdftotext -f 1 -l 1 "$B1D/ux1s3_pov_scotts.pdf" - 2>/dev/null | grep -qF "OUTSIDE-IN TEST"; then bad "B1: page 1 of the break's PDF has no banner either — the control failed, nothing to judge"
  elif pdftotext -f 2 -l 2 "$B1D/ux1s3_pov_scotts.pdf" - 2>/dev/null | grep -qF "OUTSIDE-IN TEST"; then bad "B1: page 2 still carries the banner without the header group"
  else ok "B1: without the repeating header group, page 1 carries the banner and page 2 loses it — the header group is what puts it on every page"; fi
  restore "$POVPAGE"
} || bad "B1 needs Scotts to print on 2+ pages (it printed ${SCOTTS_PAGES:-?})"
# B2 — the old falsifier template ("on <date>, <conditions>").
edit "$ROUTE" "  return \`\${h.metric_name} \${phrase} \${ref} by \${dayOf(h.falsifier_due)}\${conditions ? \`, provided that: \${conditions}\` : ''}.\`;" "  return \`\${h.metric_name} \${phrase} \${ref} on \${h.falsifier_due}\${conditions ? \`, \${conditions}\` : ''}.\`;"
stop_server; start_server
node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B" scotts "$SCOTTS" '{"falsifiers":1}' > "$W/b2.log" 2>&1 || true
grep -q 'FAIL  scotts @1280: the falsifier is one sentence' "$W/b2.log" && ok "B2: the old falsifier template → caught (\"on <date>, …\" is not the one sentence)" || bad "B2: not caught: $(grep -m2 falsifier "$W/b2.log")"
restore "$ROUTE"; stop_server; start_server
# B3 — numbers shown raw, ignoring the stored unit.
edit "$FORMAT" "  const u = unit?.trim().replace(/[\\s.;,:]+\$/, '') ?? '';" "  const u = unit?.trim().replace(/[\\s.;,:]+\$/, '') ?? ''; if (u) return \`\${raw} \${u}\`;"
sleep 5; node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B" scotts "$SCOTTS" '{"facts":["$3,413.1 million"]}' > "$W/b3.log" 2>&1 || true
grep -q 'FAIL  scotts @1280: no raw long number among the facts' "$W/b3.log" && ok "B3: amounts shown raw → caught (formatting comes from the stored unit)" || bad "B3: not caught: $(grep -m2 'fact' "$W/b3.log")"
restore "$FORMAT"
# B6 — "open the run" without print:hidden: a screen-only link printed.
edit "$POVPAGE" '<span className="print:hidden"> · <Link to={`/runs/${e.latest_locked_run!.id}`}' '<span> · <Link to={`/runs/${e.latest_locked_run!.id}`}'
sleep 5; node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B" curia "$CURIA" '{}' > /dev/null 2>&1 || true
pdftotext -f 1 -l 1 "$B/ux1s3_pov_curia.pdf" - 2>/dev/null | grep -qF "open the run" && ok "B6: \"open the run\" not hidden in print → caught on the printed page (screen-only links are hidden)" || bad "B6: not caught"
restore "$POVPAGE"
# B7 — the disclosure regime shown as stored ("public_filer").
edit "$POVPAGE" "label(DISCLOSURE_REGIME, f.value_text) : f.value_text" "f.value_text : f.value_text"
sleep 5; node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B" scotts "$SCOTTS" '{"labels":["Public filer"]}' > "$W/b7.log" 2>&1 || true
grep -q 'FAIL  scotts @1280: no stored enum value shown raw' "$W/b7.log" && pdftotext "$B/ux1s3_pov_scotts.pdf" - | grep -qF public_filer && ok "B7: the disclosure regime shown as stored → caught on screen and present in the print (the label is what puts it in words)" || bad "B7: not caught: $(grep -m2 'raw\|Public filer' "$W/b7.log")"
restore "$POVPAGE"
# B4 — a shortened hash in the footer (the first 16 characters and "…").
edit "$POVPAGE" '<span className="font-mono">{r.payload_hash}</span></p>' '<span className="font-mono">{`${r.payload_hash.slice(0, 16)}…`}</span></p>'
sleep 5; node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B" curia "$CURIA" '{}' > /dev/null 2>&1 || true
r="$(python3 "$W/hashes.py" "$B/ux1s3_pov_curia.pdf" "$W/pov.curia.json" 2>&1)"
case "$r" in BAD*shortened-hash*) ok "B4: a shortened hash in the footer → caught (the footer carries full hashes only)" ;; *) bad "B4: not caught: $r" ;; esac
restore "$POVPAGE"
# B5 — the footer names the FIRST run, not the latest.
edit "$POVPAGE" "const latest = (e: Pov['engagements'][number]) => e.locked_runs.reduce((a, r) => (r.run_number > a.run_number ? r : a));" "const latest = (e: Pov['engagements'][number]) => e.locked_runs.reduce((a, r) => (r.run_number < a.run_number ? r : a));"
sleep 5; node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B" scotts "$SCOTTS" '{}' > /dev/null 2>&1 || true
r="$(python3 "$W/hashes.py" "$B/ux1s3_pov_scotts.pdf" "$W/pov.scotts.json" 2>&1)"
case "$r" in BAD*latest-run-2*) ok "B5: the first run's hash in the footer instead of the latest → caught (Scotts: run 2 is the latest)" ;; *) bad "B5: not caught: $r" ;; esac
restore "$POVPAGE"
for f in "$POVPAGE" "$FORMAT" "$ROUTE"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots and PDFs: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
