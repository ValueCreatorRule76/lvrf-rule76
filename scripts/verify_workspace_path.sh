#!/usr/bin/env bash
#
# UX-1 slice 1 — the account workspace (DESIGN_SPEC §9, "UX-1 standards"):
# one guided path of six steps, one step open, one filled button, done steps
# folded, waiting steps saying what they wait for, the rail at desktop width
# only, no sideways scroll at 390. Presentation only: every write below goes
# through the existing routes. Local verification.
#
#   ./scripts/verify_workspace_path.sh [screenshot_dir]
#
# Clone `lvrf_verifyws` (make_clone), migrated and hardened, dropped on exit.
# The account is walked to the mock-ups' three states — new, mid-walk (at the
# hypothesis), locked (the point of view next) — and each is checked in a
# browser, signed in by SESSION, at 1280 and at 390.
# DELIBERATE BREAKS edit a client file in place and restore it byte-identical.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }

VERIFY_DB=lvrf_verifyws
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3092; VITE_PORT=5192; CDP_PORT=9352
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_ws.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
STEPFILE=client/src/components/workbench/Workspace.tsx
WALKFILE=client/src/components/OutsideInWalk.tsx
for f in "$STEPFILE" "$WALKFILE"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$STEPFILE" "$WALKFILE"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
req() {  # METHOD PATH [BODY]
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: $S" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d "$3" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
expect() {  # METHOD PATH BODY STATUS LABEL
  req "$1" "$2" "$3"; [ "$CODE" = "$4" ] && ok "$5 -> $CODE" || bad "$5 -> $CODE (expected $4) $(head -c 300 "$W/r.json")"
}

step "1. Typecheck"
(cd client && npx tsc -b) > "$W/tsc.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc.log")"

step "2. Clone, convert, migrate, harden; fixtures"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 \
  && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "cloned, converted, migrated, hardened" || { bad "clone"; exit 1; }
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
[ "$(q "SELECT count(*) FROM access_grants WHERE person_id = '$S' AND revoked_at IS NULL")" = "0" ] && q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
IND="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
E="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$IND', 'UX1 TRIR (fixture)', 'incidents per 200,000 hours worked.', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
expect POST /api/account-inputs "{\"institution\":{\"name\":\"UX1 workspace account $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for UX-1.\"}}" 201 "an account (state: new)"
INST="$(rj b.institution_id)"

(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "signed in by session" || { bad "no session"; exit 1; }

# The browser check for one state, at both widths: NOW (the open step) and the
# step statuses expected; the one filled button's text; what must be on screen.
cat > "$W/check.mjs" <<'JS'
import { writeFileSync } from 'node:fs';
const [CDP, VITE, TOKEN, INST, SHOTS, NAME, EXPECT] = process.argv.slice(2);
const X = JSON.parse(EXPECT);
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
for (const width of [1280, 390]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: `http://localhost:${VITE}/accounts/${INST}` });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    await sleep(200);
    ready = await ev(`(()=>{const s=[...document.querySelectorAll('[data-testid^=ws-step-]')].filter(e=>/^ws-step-[1-6]$/.test(e.dataset.testid));return s.length===6 && s.map(e=>e.dataset.status).join(',')===${JSON.stringify(X.statuses.join(','))}})()`);
  }
  await sleep(600);
  const statuses = await ev(`[...document.querySelectorAll('[data-testid^=ws-step-]')].filter(e=>/^ws-step-[1-6]$/.test(e.dataset.testid)).map(e=>e.dataset.status).join(',')`);
  check(statuses === X.statuses.join(','), `${NAME} @${width}: the six steps read ${X.statuses.join(',')}`, statuses);
  const open = await ev(`[...document.querySelectorAll('[data-testid^=ws-step-]')].filter(e=>/^ws-step-[1-6]$/.test(e.dataset.testid)&&e.dataset.open==='true').map(e=>e.dataset.step).join(',')`);
  check(open === String(X.now), `${NAME} @${width}: exactly one step is open, the next one (step ${X.now})`, `open: ${open}`);
  // Counted across the whole page, folded steps included: a filled button in a
  // folded step is a second one the moment that step is shown.
  const prim = await ev(`[...document.querySelectorAll('[data-primary=true]')].map(e=>e.textContent.replace('→','').trim())`);
  check(X.primary === '' ? prim.length === 0 : prim.length === 1 && prim[0] === X.primary,
    X.primary === '' ? `${NAME} @${width}: no filled button: the next action is disabled, with its reason` : `${NAME} @${width}: one filled button on screen: "${X.primary}"`, JSON.stringify(prim));
  for (const s of X.summaries ?? []) check(await ev(`document.querySelector('[data-testid=ws-step-${s.n}]')?.textContent.includes(${JSON.stringify(s.text)})`), `${NAME} @${width}: step ${s.n} says "${s.text}"`, await ev(`document.querySelector('[data-testid=ws-step-${s.n}]')?.textContent.slice(0,160)`));
  if (X.confidence) check(await ev(`document.querySelector('[data-testid=ws-confidence]')?.textContent.includes(${JSON.stringify(X.confidence)})`), `${NAME} @${width}: confidence reads "${X.confidence}"`, await ev(`document.querySelector('[data-testid=ws-confidence]')?.textContent`));
  const rail = await ev(`getComputedStyle(document.querySelector('[data-testid=step-rail]')).display`);
  check(width === 1280 ? rail !== 'none' : rail === 'none', `${NAME} @${width}: the step rail is ${width === 1280 ? 'shown' : 'dropped'}`, rail);
  const sw = await ev('document.documentElement.scrollWidth');
  check(sw <= width, `${NAME} @${width}: no sideways scroll (scrollWidth ${sw})`);
  // The path's OWN words: the header, each step's line (not its body, whose
  // walk text is slice 5's copy pass), the rail, the detail's summary.
  const wsText = await ev(`[document.querySelector('[data-testid=workspace] > header'), ...[...document.querySelectorAll('[data-testid^=ws-step-]')].filter(e=>/^ws-step-[1-6]$/.test(e.dataset.testid)).map(e=>e.firstElementChild), document.querySelector('[data-testid=step-rail]'), document.querySelector('[data-testid=account-detail] > summary')].filter(Boolean).map(e=>e.textContent).join(' ')`);
  if (X.banner) check(await ev(`document.querySelector('[data-testid=ws-marker-banner]')?.textContent.trim()`) === X.banner, `${NAME} @${width}: the marker banner at the top: "${X.banner}"`, await ev(`document.querySelector('[data-testid=ws-marker-banner]')?.textContent`));
  // Slice 2: a long citation (an unbroken URL) wraps inside the banner, never clipped or overflowing it.
  if (X.banner) check(await ev(`(()=>{const b=document.querySelector('[data-testid=ws-marker-banner]');return b && b.scrollWidth <= b.clientWidth && b.getBoundingClientRect().right <= document.documentElement.clientWidth})()`), `${NAME} @${width}: the long citation wraps inside the marker banner (no overflow)`, await ev(`(()=>{const b=document.querySelector('[data-testid=ws-marker-banner]');return b?b.scrollWidth+'>'+b.clientWidth:'no banner'})()`));
  check(!/\bW[1-9]\b|§|cohort|customer zero/i.test(wsText), `${NAME} @${width}: no internal terms in the path's own words`, (wsText.match(/\bW[1-9]\b|§|cohort|customer zero/i) || [''])[0]);
  if (width === 1280) {
    // Folded steps and the closed "Account detail" are out of the keyboard
    // order: Tab through the page and never land inside one.
    await ev('document.activeElement && document.activeElement.blur(); window.scrollTo(0,0); true');
    let inside = null, stops = 0;
    for (let i = 0; i < 80 && !inside; i++) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      inside = await ev(`(()=>{const a=document.activeElement;if(!a||a===document.body)return null;const f=a.closest('[data-open=false] > [hidden], [data-open=false] [data-testid$=-body], details:not([open]) > :not(summary)');return f?(a.outerHTML.slice(0,80)):null})()`);
      stops++;
    }
    check(inside === null, `${NAME} @${width}: Tab (${stops} stops) never lands inside a folded step or the closed Account detail`, inside);
  }
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 9000), deviceScaleFactor: 1, mobile: width < 600 }); await sleep(400);
  const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${SHOTS}/ux1s1_${NAME}_${width}.png`, Buffer.from(r.result.data, 'base64'));
}
if (X.unfold) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev(`document.querySelector('[data-testid=ws-step-${X.unfold.n}] [data-step-toggle]').click()`); await sleep(400);
  check(await ev(`document.querySelector('[data-testid=ws-step-${X.unfold.n}]').dataset.open==='true' && !!document.querySelector('[data-testid=ws-step-${X.unfold.n}-body] ${X.unfold.has}')`), `${NAME}: a done step opens on "Show ▸", and its form is there (${X.unfold.has})`);
}
console.log(out.join('\n')); ws.close(); process.exit(0);
JS
look() {  # NAME EXPECT_JSON
  node "$W/check.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$INST" "$SHOTS" "$1" "$2" > "$W/look.$1.log" 2>&1 || bad "the $1 walk crashed: $(tail -3 "$W/look.$1.log")"
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$W/look.$1.log"
}

step "3. State: new (the account just created)"
look new '{"statuses":["now","wait","wait","wait","wait","wait"],"now":1,"primary":"Generate research prompt","summaries":[{"n":1,"text":"No researched fact is accepted until the entity is pinned."},{"n":3,"text":"Waits for step 2: an outcome on a pack entry."}],"confidence":"No locked run yet: nothing to score."}'

step "4. State: mid-walk (entity pinned, walk to the baseline's evidence, a lever): the hypothesis is next"
EVENT="$(q "INSERT INTO evidence (evidence_form, quote_text, how_read, institution_id, kind, summary, provenance, confidence, captured_by_person_id) VALUES ('quote', 'Verification fixture quote, not a source.', 'Verification fixture: read from the fixture quote as written.', '$INST', 'public_filing', 'UX1 entity (fixture)', 'Verification fixture, not a source', 'low', '$S') RETURNING id" | head -1)"
q "INSERT INTO institution_entities (institution_id, legal_name, identifier_type, identifier, evidence_id, captured_by_person_id) VALUES ('$INST', 'UX1 Fixture Holdings Inc.', 'sec_cik', '0000999999', '$EVENT', '$S')" > /dev/null && ok "(fixture: the entity pinned, on the clone)"
expect POST "/api/institutions/$INST/analyst-of-record" "{\"person_id\":\"$S\",\"title\":\"External analyst of record (verification)\"}" 201 "the analyst of record"
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"UX1 capability\",\"owner_person_id\":\"$S\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "the offering and capability"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "the claim"
expect POST "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"UX1 engagement\",\"engagement_owner_person_id\":\"$S\",\"capability_name\":\"UX1 capability\",\"metric\":{\"name\":\"UX1 TRIR\",\"unit\":\"incidents per 200,000 hours worked.\",\"direction\":\"decrease\",\"source_system\":\"published disclosures\",\"owner_person_id\":\"$S\"},\"baseline_value\":1.4,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}" 201 "the outcome"
OUT="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"; MET="$(rj b.business_metric_id)"
expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E\",\"basis_note\":\"Verification: the same rate.\"}" 201 "the pack basis"
expect POST "/api/value-outcomes/$OUT/evidence" '{"kind":"public_filing","provenance":"Fixture disclosures, page 21 (not a source)","summary":"UX1 baseline (fixture)","supports":"baseline","confidence":"medium","evidence_form":"quote","quote_text":"Verification fixture quote, not a source.","how_read":"Verification fixture: read from the fixture quote as written.","source_verified":false,"ai_sourced":false,"simulated":false}' 201 "the baseline's evidence"
look leverless '{"statuses":["done","done","now","wait","wait","wait"],"now":3,"primary":"","summaries":[{"n":3,"text":"Waits for a lever on the pack entry \"UX1 TRIR (fixture)\"."},{"n":1,"text":"Entity pinned: UX1 Fixture Holdings Inc."},{"n":2,"text":"UX1 TRIR baseline 1.4 incidents per 200,000 hours worked, recorded 30 Sep 2025"}]}'
expect POST "/api/industry-measures/$E/levers" '{"name":"UX1 lever","mechanism":"Crews trained to recognise hazards stop unsafe tasks earlier.","leading_indicator":"Near-miss reports","citation":"Verification citation, not a source."}' 201 "(the steward adds a lever)"
look mid '{"statuses":["done","done","now","wait","wait","wait"],"now":3,"primary":"State a hypothesis…","summaries":[{"n":3,"text":"State what the capability changes"}],"confidence":"No locked run yet: nothing to score."}'

step "5. State: locked (hypothesis, summary, run 1 produced and locked): the point of view is next"
expect POST "/api/institutions/$INST/hypotheses" "{\"value_outcome_id\":\"$OUT\",\"value_lever_id\":\"$(q "SELECT id FROM value_levers WHERE name = 'UX1 lever'")\",\"statement\":\"UX1: hazard recognition reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"2027-09-30\",\"falsifier_conditions\":\"on the same denominator\"}" 201 "the hypothesis"
expect POST "/api/institutions/$INST/executive-summaries" '{"lens":"general","body":"UX1: a summary written by a named person, long enough for the CHECK.","drafted_with_ai":false}' 201 "the summary"
expect POST "/api/engagements/$ENG/produce-run" '{"banner_title":"OUTSIDE-IN HYPOTHESIS","note":"Verification: run one.","source_fixture":"ux1_run_1"}' 201 "run 1"
expect POST "/api/value-runs/$(rj b.value_run_id)/lock" '{"lock_reason":"Verification: locked for the workspace check."}' 200 "run 1 locked"
expect POST "/api/institutions/$INST/reference-example" '{"kind":"outside_in_test","source_citation":"UX1 published disclosures (fixture) https://example.com/ux1-long-citation/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-cccccccccccccccccccccccccccccc/report-2025-annual-disclosures.pdf","note":"Verification: an outside-in test of published material."}' 201 "(the steward marks it an outside-in test)"
look locked '{"statuses":["done","done","done","done","done","now"],"now":6,"primary":"Open the point of view","summaries":[{"n":3,"text":"Open · due 30 Sep 2027 · via \"UX1 lever\""},{"n":4,"text":"Version 1, general reader · not AI-drafted"},{"n":5,"text":"Run 1 locked"}],"confidence":"/ 100 ·","banner":"OUTSIDE-IN TEST — built from published material, not a customer engagement · Source: UX1 published disclosures (fixture) https://example.com/ux1-long-citation/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-cccccccccccccccccccccccccccccc/report-2025-annual-disclosures.pdf","unfold":{"n":3,"has":"[data-testid=restate], [data-testid=hypotheses]"}}'

step "6. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
# B1 — every step open by default: the path is a wall again.
edit "$STEPFILE" "const isOpen = open ?? status === 'now';" "const isOpen = open ?? true;"
sleep 5; node "$W/check.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$INST" "$W" b1 '{"statuses":["done","done","done","done","done","now"],"now":6,"primary":"Open the point of view"}' > "$W/b1.log" 2>&1 || true
grep -q 'FAIL  b1 @1280: exactly one step is open' "$W/b1.log" && ok "B1: with every step open, 'exactly one step is open' fails — folding is what makes it a path" || bad "B1: not caught: $(head -5 "$W/b1.log")"
restore "$STEPFILE"
# B2 — the walk's forms all filled, ignoring which step is open: two filled buttons.
WALK_STATE_INST="$INST"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"UX1 B2 account $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: B2.\"}}" 201 "(a second new account, for B2)"
INST="$(rj b.institution_id)"
edit "$WALKFILE" "const pr = (sid: string, st: StepState) => Boolean(primaryFor?.includes(sid)) && st === 'next';" "const pr = (_sid: string, st: StepState) => st === 'next';"
sleep 5; node "$W/check.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$INST" "$W" b2 '{"statuses":["now","wait","wait","wait","wait","wait"],"now":1,"primary":"Generate research prompt"}' > "$W/b2.log" 2>&1 || true
grep -q 'FAIL  b2 @1280: one filled button' "$W/b2.log" && ok "B2: with the walk's next form filled regardless of the open step, there are two filled buttons — primaryFor is what keeps it to one" || bad "B2: not caught: $(grep -m2 'filled' "$W/b2.log")"
restore "$WALKFILE"; INST="$WALK_STATE_INST"
# B3 — a folded step's body neither hidden nor inert: Tab walks into it.
edit "$STEPFILE" "<div hidden={!isOpen} inert={!isOpen} className" "<div className"
sleep 5; node "$W/check.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$INST" "$W" b3 '{"statuses":["done","done","done","done","done","now"],"now":6,"primary":"Open the point of view"}' > "$W/b3.log" 2>&1 || true
grep -q 'FAIL  b3 @1280: Tab' "$W/b3.log" && ok "B3: with folded content neither hidden nor inert, Tab lands inside a folded step — hidden and inert are what keep it out" || bad "B3: not caught: $(grep -m2 'Tab' "$W/b3.log")"
restore "$STEPFILE"
for f in "$STEPFILE" "$WALKFILE"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
