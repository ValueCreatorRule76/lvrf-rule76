#!/usr/bin/env bash
#
# UX-1 slice 4 — the run page on screen and in print (DESIGN_SPEC §9, "UX-1
# standards"; LVRF_PLAN §7g; mock-up design/mockups/run.html; O-D5: the PDF is
# the browser's print of the page; CLAUDE.md: every printed page carries the
# disclosure banner and the run's hash). Local verification. Reads only.
#
#   ./scripts/verify_run_page.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data
# neutralised) to `lvrf_verifyrun` with make_clone, migrated and hardened,
# dropped on exit. Four real runs, each a different case:
#   - Scotts run 2: locked, its engagement retired, a reference marker;
#   - Curia run 1 (the live pack-grounded engagement): locked, no sealed
#     evidence, the evidence form and the gap register live;
#   - Curia run 21: its engagement retired, compared with run 20 (whose
#     engagement's own run list the server refuses);
#   - Skillsoft run 1: before the outcome link, no marker.
# Each is checked in a browser signed in by SESSION at 1280 and 390, then
# printed to PDF by Chrome and read PAGE BY PAGE with pdftotext.
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

VERIFY_DB=lvrf_verifyrun
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3098; VITE_PORT=5198; CDP_PORT=9358
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_run.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
WB=client/src/components/workbench/Workbench.tsx
EVC=client/src/components/workbench/EvidenceCard.tsx
FND=client/src/components/workbench/FindingsCard.tsx
for f in "$WB" "$EVC" "$FND"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$WB" "$EVC" "$FND"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck"
(cd client && npx tsc -b) > "$W/tsc.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc.log")"

step "2. Clone the prod copy; a session"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy && migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 \
  && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "cloned the prod copy, converted, migrated, hardened" || { bad "clone"; exit 1; }
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
run_id() { q "SELECT r.id FROM value_runs r JOIN engagements e ON e.id = r.engagement_id JOIN institutions i ON i.id = e.institution_id WHERE $1 AND r.run_number = $2 AND r.locked_at IS NOT NULL LIMIT 1"; }
R_SCOTTS="$(run_id "i.name ILIKE 'Scotts%'" 2)"
R_CURIA1="$(run_id "i.name = 'Curia' AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL" 1)"
R_CURIA21="$(run_id "i.name = 'Curia'" 21)"
R_SKILL="$(run_id "i.name = 'Skillsoft'" 1)"
[ -n "$R_SCOTTS" ] && [ -n "$R_CURIA1" ] && [ -n "$R_CURIA21" ] && [ -n "$R_SKILL" ] && ok "the copy has the four runs: Scotts 2, Curia 1 (live), Curia 21 (retired), Skillsoft 1" || { bad "a run is missing from the copy"; exit 1; }
LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 & SERVER_PID=$!
for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "signed in by session" || { bad "no session"; exit 1; }

# What each run's page must say comes from the record (GET /api/runs/:id and the account's POV), not from this script.
expect() {  # NAME RUN_ID -> $W/x.NAME.json
  curl -s -H "x-actor-person-id: $S" "$BASE/api/runs/$2" > "$W/run.$1.json"
  local inst; inst="$(node -e "console.log(require('$W/run.$1.json').institution_id ?? '')")"
  if [ -n "$inst" ]; then curl -s -H "x-actor-person-id: $S" "$BASE/api/institutions/$inst/pov" > "$W/pov.$1.json"; else echo '{}' > "$W/pov.$1.json"; fi
  node -e "
    const r = require('$W/run.$1.json'), pov = require('$W/pov.$1.json'), p = r.payload;
    const KIND = { outside_in_test: 'OUTSIDE-IN TEST', published_case_study: 'REFERENCE EXAMPLE', demonstration: 'DEMONSTRATION' };
    const band = p.confidence.band.charAt(0).toUpperCase() + p.confidence.band.slice(1);
    console.log(JSON.stringify({ n: p.runNumber, inst: r.institution_id, instName: r.institution_name, hash: r.payload_hash, retired: r.engagement_retired,
      stage: r.terminal_value_stage, confidence: Number(p.confidence.score) + ' / 100 · ' + band, low: p.confidence.band === 'low',
      verified: p.realization === 'verified', sealed: p.bannerTitle ?? null, marker: pov.reference_example ? KIND[pov.reference_example.kind] : null,
      evidence: p.evidence ? p.evidence.length : null, outcome: typeof p.valueOutcomeId === 'string', baseline: String(p.baselineValue),
      unit: typeof p.businessMetric === 'object' ? p.businessMetric.unit : null, engagementId: r.engagement_id }));
  " > "$W/x.$1.json"
}
for k in scotts curia1 curia21 skill; do
  case $k in scotts) expect $k "$R_SCOTTS" ;; curia1) expect $k "$R_CURIA1" ;; curia21) expect $k "$R_CURIA21" ;; skill) expect $k "$R_SKILL" ;; esac
done

cat > "$W/run.mjs" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const [CDP, VITE, TOKEN, OUTDIR, NAME, ID, X_FILE, MODE = 'full'] = process.argv.slice(2);
const X = JSON.parse(readFileSync(X_FILE, 'utf8'));
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
const LABELS = { baseline: 'Baseline set', attach: 'Capability attached', model: 'Value modelled', commit: 'Target committed', measure: 'Actual measured', verify: 'Verified', return: 'Returned to the record' };
const ready = async () => { for (let i = 0; i < 80; i++) { await sleep(200); if (await ev(`!!document.querySelector('[data-testid=run-page] h1') && !document.querySelector('[data-testid=fold-ledgers]')?.textContent.includes('loading') && (!document.querySelector('[data-testid=banners]') || document.querySelectorAll('[data-testid=banners]').length > 0)`)) break; } await sleep(900); };
// The app's own words: the page minus the record's own text (data-record) and the auditor's mono identifiers.
const ownText = `(()=>{const c=document.querySelector('[data-testid=run-page]').cloneNode(true);c.querySelectorAll('[data-record],.font-mono').forEach(e=>e.remove());return c.textContent})()`;
const visible = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e && e.offsetParent!==null})()`;
const widths = MODE === 'full' ? [1280, 390] : [1280];
for (const width of widths) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: `http://localhost:${VITE}/runs/${ID}` });
  await ready();
  const W = `${NAME} @${width}`;
  // Breadcrumb back to its step.
  const crumbs = await ev(`[...document.querySelectorAll('[data-testid=breadcrumb] li')].map(l=>[l.textContent.replace(/\\s*›\\s*$/,'').trim(), l.querySelector('a')?.getAttribute('href') ?? null])`);
  const wantCrumbs = X.inst ? [['Accounts', '/'], [X.instName, `/accounts/${X.inst}`], ['Run and lock', `/accounts/${X.inst}`], [`Run ${X.n}`, null]] : null;
  check(wantCrumbs && JSON.stringify(crumbs) === JSON.stringify(wantCrumbs), `${W}: breadcrumb Accounts › ${X.instName} › Run and lock › Run ${X.n}, each a link to its page`, JSON.stringify(crumbs));
  // Banners: the disclosure, the account's marker, the run's own sealed banner.
  const banners = await ev(`[...document.querySelectorAll('[data-testid=banners]')[0].children].map(b=>[b.dataset.testid,b.textContent])`);
  const has = (id, txt) => banners.some(([d, t2]) => d === id && (!txt || t2.includes(txt)));
  check(X.verified ? has('banner-verified') : has('banner-unverified', "UNVERIFIED — this run's outcome has no verified actual"), `${W}: the disclosure banner (${X.verified ? 'VERIFIED' : 'UNVERIFIED'}) shows`, JSON.stringify(banners));
  check(X.marker ? has('banner-reference', X.marker) : !has('banner-reference'), `${W}: the account's marker ${X.marker ? `"${X.marker}"` : '(none)'} as recorded`, JSON.stringify(banners));
  check(X.sealed ? has('banner-sealed', `${X.sealed} — as recorded at sealing`) : !has('banner-sealed'), `${W}: the run's own sealed banner ${X.sealed ? `"${X.sealed}"` : '(none)'}`, JSON.stringify(banners));
  // Title, confidence, stage strip, hash.
  check(await ev(`document.querySelector('[data-testid=run-page] h1').textContent`) === `Run ${X.n}`, `${W}: the title is "Run ${X.n}"`);
  const conf = await ev(`document.querySelector('[data-testid=confidence] [data-testid=confidence-badge]')?.textContent ?? ''`);
  check(conf === X.confidence, `${W}: confidence reads "${X.confidence}"`, conf);
  check(!(await ev(`!!document.querySelector('[data-testid=run-page] .text-critical')`)), `${W}: nothing on the page in critical red (Low is neutral)`);
  const stages = await ev(`[...document.querySelectorAll('[data-testid=run-stages] li')].map(l=>[l.dataset.stage,l.dataset.state,l.textContent])`);
  check(stages.length === 7 && stages.every(([s, , t2]) => t2.startsWith(LABELS[s])) && stages.find(([s]) => s === X.stage)?.[1] === 'current', `${W}: the stage strip in plain labels, "${LABELS[X.stage]}" furthest (as sealed)`, JSON.stringify(stages.map(([s, st]) => `${s}:${st}`)));
  check(await ev(`!!document.querySelector('[data-testid=run-stages] [data-testid=stage-legend]')`), `${W}: the stage strip has its legend`);
  const hashLine = await ev(`document.querySelector('[data-testid=run-hash]')?.textContent ?? ''`);
  check(hashLine.includes(X.hash) && hashLine.includes('a locked run never changes'), `${W}: "Record hash <the full hash> · a locked run never changes"`, hashLine.slice(0, 120));
  // The figures: the record's values; the stored unit without trailing punctuation.
  const baseline = await ev(`document.querySelector('[data-testid=figure-baseline]')?.textContent ?? ''`);
  const unit = X.unit ? X.unit.trim().replace(/[\s.;,:]+$/, '') : '';
  check(baseline.startsWith(X.baseline) && (!unit || baseline.includes(unit)) && !/[.;,:]\s*$/.test(baseline), `${W}: the baseline is the record's ${X.baseline}${unit ? ` ${unit}` : ''}, no trailing punctuation`, baseline);
  // What the run sealed.
  const items = await ev(`document.querySelectorAll('[data-testid=sealed-item]').length`);
  check(X.evidence === null ? await ev(visible('[data-testid=sealed-unavailable]')) : X.evidence === 0 ? await ev(visible('[data-testid=sealed-none]')) : items === X.evidence,
    `${W}: what the run sealed: ${X.evidence === null ? 'unavailable on this run (said so)' : X.evidence === 0 ? 'nothing (said so)' : `${X.evidence} item(s)`}`, String(items));
  // The evidence form: the retired line, the no-outcome line, or folded behind "Add evidence…".
  if (X.retired) check(await ev(`document.querySelector('[data-testid=run-frozen]')?.textContent`) === 'Locked, and its engagement retired: no evidence is added to this run.' && !(await ev(`!!document.querySelector('[data-testid=add-evidence-open]')`)), `${W}: retired: the one line, and no "Add evidence…"`);
  else if (!X.outcome) check(await ev(visible('[data-testid=run-no-outcome]')) && !(await ev(`!!document.querySelector('[data-testid=add-evidence-open]')`)), `${W}: before the outcome link: one line, and no "Add evidence…"`);
  else {
    const b = `document.querySelector('[data-testid=add-evidence-open]')`;
    check(await ev(`${b}?.textContent === 'Add evidence…' && ${b}.getAttribute('aria-expanded') === 'false' && !document.querySelector('[data-testid=add-evidence] form') && !(document.querySelector('#add-evidence-form')?.offsetParent)`), `${W}: the evidence form is folded behind "Add evidence…" (aria-expanded false)`);
    await ev(`${b}.click()`); await sleep(500);
    check(await ev(`${b}.getAttribute('aria-expanded') === 'true' && [...document.querySelectorAll('#add-evidence-form h3')].some(h=>h.textContent.includes('Add evidence')) && document.querySelector('#add-evidence-form').offsetParent !== null`), `${W}: "Add evidence…" opens the form (aria-expanded true)`);
    await ev(`${b}.click()`); await sleep(300);
  }
  // Disabled actions carry their reason under them.
  const disabled = await ev(`[...document.querySelectorAll('[data-testid=run-actions] button:disabled')].map(b=>[b.textContent,(b.parentElement.querySelector('[data-testid=action-reason],[data-testid=share-reason]')?.textContent ?? '')])`);
  check(disabled.every(([, r]) => r.length > 10), `${W}: every disabled action carries its reason under it (${disabled.map(([t2]) => t2).join(', ') || 'none disabled'})`, JSON.stringify(disabled));
  // Folds: closed content is hidden and inert; each opens on demand.
  for (const f of ['fold-gaps', 'fold-ledgers']) {
    const body = `document.querySelector('[data-testid=${f}] [id$=-body]')`;
    check(await ev(`${body}.offsetParent === null && ${body}.inert === true && document.querySelector('[data-testid=${f}-toggle]').getAttribute('aria-expanded') === 'false'`), `${W}: ${f} is folded (hidden, inert, aria-expanded false)`);
    await ev(`document.querySelector('[data-testid=${f}-toggle]').click()`); await sleep(700);
    check(await ev(`${body}.offsetParent !== null && ${body}.inert === false`), `${W}: ${f} opens`);
  }
  for (let i = 0; i < 30 && await ev(`document.querySelector('[data-testid=fold-ledgers]').textContent.includes('loading')`); i++) await sleep(200);
  // DESIGN_SPEC §9 standard 10: every verbatim sealed text sits in a block marked "as recorded at sealing".
  const sealedTexts = await ev(`document.querySelectorAll('[data-testid=run-page] [data-record]').length`);
  const unmarked = await ev(`[...document.querySelectorAll('[data-testid=run-page] [data-record]')].filter(r=>{let e=r.parentElement;while(e&&e.dataset.testid!=='run-page'){const m=e.querySelector('[data-testid=sealed-mark]');if(m&&/as recorded at (the )?sealing/.test(m.textContent))return false;if(e.tagName==='SECTION'||e.dataset.testid==='sealed-evidence')break;e=e.parentElement}return true}).map(r=>r.textContent.slice(0,60))`);
  check(sealedTexts > 0 && unmarked.length === 0, `${W}: every verbatim sealed text (${sealedTexts}) is marked "as recorded at sealing"`, JSON.stringify(unmarked));
  // Retired engagement: the comparison still works (its own run list is refused by the server).
  if (X.compareWith) {
    const cmp = await ev(`document.querySelector('[data-testid=compare-confidence]')?.textContent ?? document.querySelector('[data-testid=fold-ledgers]').textContent.slice(-200)`);
    check(cmp.startsWith(`Run ${X.compareWith} to run ${X.n}: confidence`) && / \/ 100/.test(cmp), `${W}: the comparison with run ${X.compareWith} shows, though its engagement is retired`, cmp.slice(0, 160));
  }
  // No internal terms in the app's own words; no id or "not found" anywhere.
  const own = await ev(ownText);
  const banned = own.match(/value_outcomes\w*|valueOutcomeId|payload|\bW[1-9]\b|§|O-D\d|points outstanding|missing \d+ points|work list|UNMEASURED|\b[a-z]+_[a-z_]+\b|not found|[0-9a-f]{8}-[0-9a-f]{4}-/g);
  check(!banned, `${W}: no internal term, enum code, id or "not found" in the app's own words (folds open)`, JSON.stringify(banned));
  const sw = await ev('document.documentElement.scrollWidth');
  check(sw <= width, `${W}: no sideways scroll (scrollWidth ${sw})`);
  if (MODE === 'full') {
    // Folds closed again for the screenshot, as a person first sees the page.
    for (const f of ['fold-gaps', 'fold-ledgers']) await ev(`document.querySelector('[data-testid=${f}-toggle]').click()`);
    await sleep(400);
    const h = await ev('document.documentElement.scrollHeight');
    await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 9000), deviceScaleFactor: 1, mobile: width < 600 }); await sleep(400);
    const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUTDIR}/ux1s4_run_${NAME}_${width}.png`, Buffer.from(r.result.data, 'base64'));
  }
}
// Print, as the browser prints it (folds closed on screen: print shows them in full).
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:${VITE}/runs/${ID}` });
await ready();
const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
writeFileSync(`${OUTDIR}/ux1s4_run_${NAME}.pdf`, Buffer.from(pdf.result.data, 'base64'));
console.log(out.join('\n')); ws.close(); process.exit(0);
JS

# Every printed page: the banners, this run's full record hash, the print date,
# "rendered from the record as it stands", the page number; never the app
# header or a screen-only control. Over the whole PDF: the folds in full.
pages_check() {  # NAME PDF XFILE
  local name="$1" pdf="$2" n p txt flat bad_pages="" hash marker
  hash="$(node -e "console.log(require('$3').hash)")"; marker="$(node -e "console.log(require('$3').marker ?? '')")"
  n="$(pdfinfo "$pdf" 2>/dev/null | awk '/^Pages:/{print $2}')"
  [ -n "$n" ] && [ "$n" -ge 1 ] || { bad "$name: the PDF has no pages"; return; }
  for p in $(seq 1 "$n"); do
    txt="$(pdftotext -f "$p" -l "$p" -layout "$pdf" - 2>/dev/null | tr '\n' ' ' | tr -s ' ')"
    flat="$(printf '%s' "$txt" | tr -d ' ')"
    printf '%s' "$txt" | grep -qF "UNVERIFIED — this run's outcome has no verified actual" || bad_pages="$bad_pages p$p:disclosure"
    [ -z "$marker" ] || printf '%s' "$txt" | grep -qF "$marker" || bad_pages="$bad_pages p$p:marker"
    printf '%s' "$flat" | grep -qF "recordhash$hash" || bad_pages="$bad_pages p$p:hash"
    printf '%s' "$txt" | grep -qE "Printed [0-9]{1,2} [A-Z][a-z]{2} [0-9]{4}" || bad_pages="$bad_pages p$p:date"
    printf '%s' "$txt" | grep -qF "rendered from the record as it stands" || bad_pages="$bad_pages p$p:rendered"
    printf '%s' "$txt" | grep -qF "Page $p of $n" || bad_pages="$bad_pages p$p:pageno"
    if printf '%s' "$txt" | grep -qF "Signed in as"; then bad_pages="$bad_pages p$p:app-header"; fi
    if printf '%s' "$txt" | grep -qE "Add evidence…|Render record|Share with customer|Run and lock ›|▸|▾"; then bad_pages="$bad_pages p$p:screen-control"; fi
  done
  [ -z "$bad_pages" ] && ok "$name: printed, $n page(s); EVERY page carries the disclosure banner${marker:+, the marker}, the full record hash, the print date, \"rendered from the record as it stands\" and \"Page n of $n\"; no app header, no screen-only control" || bad "$name: printed pages missing:$bad_pages"
  local all; all="$(pdftotext "$pdf" - 2>/dev/null)"
  printf '%s' "$all" | grep -qF "How the score was made" && printf '%s' "$all" | grep -qF "Findings" && printf '%s' "$all" | grep -qF "What it takes to raise confidence" \
    && ok "$name: the folded sections print in full" || bad "$name: a folded section is missing from the print"
  pdftoppm -r 60 -png "$pdf" "${pdf%.pdf}_page" && ok "  ...each page rendered to an image ($(ls "${pdf%.pdf}"_page-*.png | wc -l | tr -d ' ') files) for a person to look at"
  PAGES_N="$n"
}
look() {  # NAME ID XFILE [OUTDIR] [MODE]
  local outdir="${4:-$SHOTS}"
  node "$W/run.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$outdir" "$1" "$2" "$3" "${5:-full}" > "$W/look.$1.log" 2>&1 || bad "the $1 walk crashed: $(tail -3 "$W/look.$1.log")"
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$W/look.$1.log"
}
# Curia 21 is compared with run 20 (both on the retired reference engagement).
node -e "const f='$W/x.curia21.json', x=require(f); x.compareWith=20; require('fs').writeFileSync(f, JSON.stringify(x))"

step "3. Scotts run 2 (locked; engagement retired; outside-in test marker)"
look scotts "$R_SCOTTS" "$W/x.scotts.json"
[ -f "$SHOTS/ux1s4_run_scotts.pdf" ] && pages_check scotts "$SHOTS/ux1s4_run_scotts.pdf" "$W/x.scotts.json"
SCOTTS_PAGES="${PAGES_N:-0}"
step "4. Curia run 1 (the live engagement; the evidence form and gap register live)"
look curia1 "$R_CURIA1" "$W/x.curia1.json"
[ -f "$SHOTS/ux1s4_run_curia1.pdf" ] && pages_check curia1 "$SHOTS/ux1s4_run_curia1.pdf" "$W/x.curia1.json"
step "5. Curia run 21 (engagement retired; compared with run 20)"
look curia21 "$R_CURIA21" "$W/x.curia21.json"
[ -f "$SHOTS/ux1s4_run_curia21.pdf" ] && pages_check curia21 "$SHOTS/ux1s4_run_curia21.pdf" "$W/x.curia21.json"
step "6. Skillsoft run 1 (before the outcome link; no marker)"
look skill "$R_SKILL" "$W/x.skill.json"
[ -f "$SHOTS/ux1s4_run_skill.pdf" ] && pages_check skill "$SHOTS/ux1s4_run_skill.pdf" "$W/x.skill.json"

step "7. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
B="$W/breaks"; mkdir -p "$B"
brk() {  # LABEL NAME ID XFILE PATTERN -> caught if the walk prints a FAIL line matching PATTERN
  local d="$B/$2.$RANDOM"; mkdir -p "$d"
  sleep 5; node "$W/run.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$d" "$2" "$3" "$4" one > "$d/log" 2>&1 || true
  if grep -q "^PASS" "$d/log" && grep -qE "^FAIL  .*$5" "$d/log"; then ok "$1 → caught"; else bad "$1: not caught: $(grep -m2 FAIL "$d/log" || tail -2 "$d/log")"; fi
}
# B1 — the banners in the page only, not a repeating header: page 2 loses them.
if [ "$SCOTTS_PAGES" -ge 2 ]; then
  edit "$WB" '<thead className="hidden print:table-header-group" data-testid="print-header">' '<thead className="hidden" data-testid="print-header">'
  edit "$WB" '<div className="print:hidden"><RunBanners run={run} account={account} /></div>' '<div><RunBanners run={run} account={account} /></div>'
  B1D="$B/b1"; mkdir -p "$B1D"; sleep 5
  node "$W/run.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B1D" scotts "$R_SCOTTS" "$W/x.scotts.json" one > /dev/null 2>&1 || true
  if [ ! -f "$B1D/ux1s4_run_scotts.pdf" ]; then bad "B1: the break's walk printed no PDF — nothing to judge"
  elif ! pdftotext -f 1 -l 1 "$B1D/ux1s4_run_scotts.pdf" - 2>/dev/null | grep -qF "UNVERIFIED"; then bad "B1: page 1 has no banner either — the control failed"
  elif pdftotext -f 2 -l 2 "$B1D/ux1s4_run_scotts.pdf" - 2>/dev/null | grep -qF "UNVERIFIED"; then bad "B1: page 2 still carries the banner without the header group"
  else ok "B1: without the repeating header, page 1 carries the banner and page 2 loses it → caught"; fi
  restore "$WB"
else bad "B1 needs Scotts to print on 2+ pages (it printed $SCOTTS_PAGES)"; fi
# B2 — a shortened hash in the print footer.
edit "$WB" '· record hash <span className="font-mono">{run.payload_hash}</span></p>' '· record hash <span className="font-mono">{run.payload_hash.slice(0, 16)}…</span></p>'
B2D="$B/b2"; mkdir -p "$B2D"; sleep 5
node "$W/run.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$B2D" skill "$R_SKILL" "$W/x.skill.json" one > /dev/null 2>&1 || true
SAVED_PASS=$PASS; SAVED_FAIL=$FAIL
if [ -f "$B2D/ux1s4_run_skill.pdf" ]; then pages_check skill-b2 "$B2D/ux1s4_run_skill.pdf" "$W/x.skill.json" > "$B2D/check" 2>&1; fi
PASS=$SAVED_PASS; FAIL=$SAVED_FAIL
grep -q 'FAIL  skill-b2: printed pages missing:.*hash' "$B2D/check" 2>/dev/null && ok "B2: a shortened hash in the print footer → caught on the printed pages" || bad "B2: not caught: $(head -3 "$B2D/check" 2>/dev/null)"
restore "$WB"
# B3 — a fold whose closed content still shows.
edit "$WB" "(open ? '' : 'hidden print:block')} inert={!open}>" "''} inert={!open}>"
brk "B3: a folded section's content visible while closed" curia1 "$R_CURIA1" "$W/x.curia1.json" "fold-gaps is folded"
restore "$WB"
# B4 — a disabled action without its reason.
edit "$WB" '{!verified && <span className="max-w-[30ch] text-[11px] text-ink-45" data-testid="share-reason">Shared only once a named person verifies the outcome.</span>}' ''
brk "B4: \"Share with customer\" disabled without its reason" scotts "$R_SCOTTS" "$W/x.scotts.json" "every disabled action carries its reason"
restore "$WB"
# B5 — a retired engagement's comparison asking the engagement's own run list (refused): it does not compare.
edit "$WB" "  if (!run.engagement_retired) return undefined;" "  if (run.engagement_retired || !run.engagement_retired) return undefined;"
brk "B5: the comparison read from the retired engagement's own run list" curia21 "$R_CURIA21" "$W/x.curia21.json" "the comparison with run 20 shows"
restore "$WB"
# B6 — sealed evidence kinds shown as stored codes.
edit "$EVC" "{label(EVIDENCE_KIND, e.kind)} · supports" "{e.kind} · supports"
brk "B6: the evidence kind shown as its stored code" scotts "$R_SCOTTS" "$W/x.scotts.json" "no internal term, enum code"
restore "$EVC"
# B7 — the stage strip in the enum's own values.
edit "$WB" "                {label(STAGE_LABEL, stage)}{state === 'gap'" "                {stage}{state === 'gap'"
brk "B7: the stage strip in enum values" curia1 "$R_CURIA1" "$W/x.curia1.json" "the stage strip in plain labels"
restore "$WB"
# B8 — the findings' sealed messages without their mark.
edit "$FND" '        <p className="m-0 text-[11px] italic text-ink-45" data-testid="sealed-mark">Messages as recorded at sealing.</p>' ''
brk "B8: finding messages shown without \"as recorded at sealing\"" scotts "$R_SCOTTS" "$W/x.scotts.json" 'is marked "as recorded at sealing"'
restore "$FND"
for f in "$WB" "$EVC" "$FND"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots and PDFs: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
