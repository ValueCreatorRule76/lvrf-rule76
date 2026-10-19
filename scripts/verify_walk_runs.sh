#!/usr/bin/env bash
#
# Q4l (Brad's Scotts walk, 13 Oct 2026) — (1) no silent outcomes: a form
# says what its disabled button waits for, and a success that closes a form
# leaves a plain sentence; (2) a second run after the walk's first: "Produce a
# new run…" and "Lock run N", with W7 listing what each run sealed.
# Local verification.
#
#   ./scripts/verify_walk_runs.sh [screenshot_dir]
#
# Clone `lvrf_verifyq4l`, migrated and hardened, dropped on exit. API with
# the header actor; the page through Vite and headless Chrome, by SESSION
# (scripts/lib/walk_runs_walk.mjs). Fixtures go through the routes.
# DELIBERATE BREAKS edit a source file in place and restore it byte-identical.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifyq4l
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3079; VITE_PORT=5181; CDP_PORT=9341
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_q4l.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
FORM=client/src/components/GovernedForm.tsx
WALKCARD=client/src/components/OutsideInWalk.tsx
POVCARD=client/src/components/PovAuthoring.tsx
POVPAGE=client/src/pages/PovPage.tsx
POVROUTE=server/routes/valueHypotheses.ts
POVAPI=client/src/api/pov.ts
for f in "$FORM" "$WALKCARD" "$POVCARD" "$POVPAGE" "$POVROUTE" "$POVAPI"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$FORM" "$WALKCARD" "$POVCARD" "$POVPAGE" "$POVROUTE" "$POVAPI"; do
    cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }
  done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
trap cleanup EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
start_server() {
  LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start: $(tail -5 "$W/server.log")"; exit 1
}
req() {  # METHOD PATH [BODY] [ACTOR] — status in $CODE, body in $W/r.json
  if [ "$1" = GET ]; then
    CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: ${4:-$S}" "$BASE$2")"
  else
    CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: ${4:-$S}" -d "$3" "$BASE$2")"
  fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING] [ACTOR]
  req "$1" "$2" "$3" "${7:-$S}"
  local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 400)"; fi
}
noraw() {  # LABEL — the last response carries no Postgres text and no constraint or relation name
  if grep -qiE 'violates|check constraint|foreign key|relation "|not-null|_key|_fk' "$W/r.json"; then bad "  ...$1: Postgres text in the response: $(head -c 300 "$W/r.json")"; else ok "  ...$1: no Postgres text, no constraint or relation name"; fi
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }

step "3. Fixtures, through the routes: a Scotts-like walk at its first locked run"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@q4l.example"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
IND="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
E="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$IND', 'Q4l TRIR (fixture)', 'incidents per 200,000 hours', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
start_server && ok "API up on $PORT"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Q4l walk account $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for Q4l.\"}}" 201 "an account"
INST="$(rj b.institution_id)"
expect POST "/api/institutions/$INST/analyst-of-record" "{\"person_id\":\"$S\",\"title\":\"External analyst of record (verification)\"}" 201 "W1: the steward as analyst of record"
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Q4l capability\",\"owner_person_id\":\"$S\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "W2"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "W3"
expect POST "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"Q4l engagement\",\"engagement_owner_person_id\":\"$S\",\"capability_name\":\"Q4l capability\",\"metric\":{\"name\":\"Q4l TRIR $TS\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"published disclosures\",\"owner_person_id\":\"$S\"},\"baseline_value\":1.4,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}" 201 "W4"
OUT="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"; MET="$(rj b.business_metric_id)"
expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E\",\"basis_note\":\"Verification: the same rate.\"}" 201 "W5"
expect POST "/api/value-outcomes/$OUT/evidence" '{"kind":"public_filing","provenance":"Fixture CR disclosures, page 21 (not a source)","summary":"Q4l AI baseline (fixture)","supports":"baseline","confidence":"medium","source_verified":false,"ai_sourced":true,"simulated":false,"research_query":"q","research_tool":"t"}' 201 "W6: AI-sourced baseline evidence, unverified"
expect POST "/api/engagements/$ENG/produce-run" '{"banner_title":"OUTSIDE-IN HYPOTHESIS","note":"Verification: run one, before the citation is opened.","source_fixture":"q4l_run_1"}' 201 "W7: run 1"
R1="$(rj b.value_run_id)"
expect POST "/api/value-runs/$R1/lock" '{"lock_reason":"Verification: locked before the opening (as on Scotts)."}' 200 "W8: run 1 locked"
expect GET "/api/institutions/$INST/walk" "" 200 "the walk read"
# Single-quoted: inline, bash brace-expands the {...,...} body.
RUN1_SEALED='(()=>{const s=b.engagements[0].runs[0].sealed_evidence[0];return [b.engagements[0].runs.length,s.supports,s.ai_sourced,s.citation_resolved,s.source_verified,s.basis].join("|")})()'
[ "$(rj "$RUN1_SEALED")" = "1|baseline|true|false|false|assumed" ] \
  && ok "  ...each run carries what it SEALED, from its payload: run 1 — AI-sourced, citation not opened, unverified, assumed" || bad "  ...runs: $(rj "JSON.stringify(b.engagements.map(e=>e.runs))" | head -c 600)"

step "4. The pages, in a browser"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
walk() {  # MODE PHASE
  set +e
  node scripts/lib/walk_runs_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$INST" "$S_EMAIL" "$X_EMAIL" "$PW" "$S_NAME" "${2:-}" 2>&1 | tee "$W/walk.$1.${2:-x}.log"; local rc=${PIPESTATUS[0]}; set -e
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.${2:-x}.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.${2:-x}.log" || true)))
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc — a crash is a failure"
}
walk main before-lever
# An early route refusal is answered in a plain sentence AND recorded (source 'route'),
# except an id that is not this tenant's or account's: P3 answers that exactly as an
# unknown id, with nothing recorded (verify_tenant_scope), as a 404 is.
REFQ="SELECT count(*) FROM refusals WHERE source = 'route' AND endpoint = 'POST /api/institutions/:institutionId/hypotheses'"
R0="$(q "$REFQ")"
expect POST "/api/institutions/$INST/hypotheses" "{\"value_outcome_id\":\"$OUT\",\"value_lever_id\":\"00000000-0000-4000-8000-000000000009\",\"statement\":\"Frontline hazard recognition reduces recordable injuries.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"2027-09-30\",\"falsifier_conditions\":\"\"}" 422 "a hypothesis naming no current lever -> refused" "that lever is not current"
grep -qE '[0-9a-f]{8}-[0-9a-f]{4}' "$W/r.json" && bad "  ...the answer carries an id: $(head -c 300 "$W/r.json")" || ok "  ...in words, with no id in the answer"
[ "$(q "$REFQ")" = "$R0" ] && ok "  ...and NOT recorded: an unknown id is answered as P3 answers another tenant's" || bad "  ...recorded: $(q "$REFQ") (from $R0)"
expect POST "/api/institutions/$INST/hypotheses" "{\"value_outcome_id\":\"$OUT\",\"value_lever_id\":\"00000000-0000-4000-8000-000000000009\",\"statement\":\"Frontline hazard recognition reduces recordable injuries.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"2027-09-30\",\"falsifier_conditions\":\"within 2 quarters\"}" 422 "a digit in the conditions -> refused" "numbers belong in recorded values"
[ "$(q "$REFQ")" = "$((R0 + 1))" ] && [ "$(q "SELECT message FROM refusals WHERE source = 'route' ORDER BY refused_at DESC, id DESC LIMIT 1")" = "1 issue(s) found; nothing was written. body.falsifier_conditions: numbers belong in recorded values, not falsifier conditions" ] \
  && ok "  ...and recorded in refusals (source route), so the attempt is visible on the box" || bad "  ...refusals: $(q "$REFQ") (from $R0): $(q "SELECT message FROM refusals ORDER BY refused_at DESC, id DESC LIMIT 1")"
expect POST "/api/industry-measures/$E/levers" '{"name":"Q4l lever","mechanism":"Crews trained to recognise hazards stop unsafe tasks earlier.","leading_indicator":"Near-miss reports","citation":"Verification citation, not a source."}' 201 "(the steward adds a lever on the entry)"
walk main after-lever
expect GET "/api/institutions/$INST/walk" "" 200 "the walk read, after the browser"
RUNS_SEALED='(()=>{const r=b.engagements[0].runs;return [r.length,r.every(x=>x.locked_at!==null),r[0].sealed_evidence[0].citation_resolved,r[1].sealed_evidence[0].citation_resolved,r[1].sealed_evidence[0].source_verified,r[1].sealed_evidence[0].basis].join("|")})()'
[ "$(rj "$RUNS_SEALED")" = "2|true|false|true|true|published" ] \
  && ok "  ...two locked runs: run 1 sealed 'not opened', run 2 'opened, verified, published'" || bad "  ...runs: $(rj "JSON.stringify(b.engagements.map(e=>e.runs))" | head -c 900)"
[ "$(q "SELECT count(*) FROM value_hypotheses WHERE institution_id = '$INST'")" = "1" ] && ok "  ...and one hypothesis on record" || bad "  ...hypotheses"
H="$(q "SELECT id FROM value_hypotheses WHERE institution_id = '$INST'")"
expect POST "/api/value-hypotheses/$H/withdraw" '{"retirement_reason":"Verification: withdrawn to test a second withdrawal."}' 200 "(the hypothesis withdrawn)"
R0="$(q "SELECT count(*) FROM refusals WHERE source = 'route'")"
expect POST "/api/value-hypotheses/$H/withdraw" '{"retirement_reason":"Verification: withdrawing it a second time."}' 409 "withdrawing it again -> refused" "This hypothesis is not current (withdrawn or superseded)."
[ "$(q "SELECT count(*) FROM refusals WHERE source = 'route'")" = "$((R0 + 1))" ] && [ "$(q "SELECT endpoint || '|' || subject_id FROM refusals WHERE source = 'route' ORDER BY refused_at DESC, id DESC LIMIT 1")" = "POST /api/value-hypotheses/:id/withdraw|$H" ] \
  && ok "  ...a 409 is recorded too, against the hypothesis" || bad "  ...409 not recorded"

step "5. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
# B1 — the unmet text removed: the disabled button is silent again.
edit "$FORM" "      {actor && !blockedLocally && !canSubmit && !submitting && result?.status !== 'ok' && (" "      {false && (" 
sleep 5; walk break-unmet; restore "$FORM"
# B2 — W8 back to first-run-only: a later open run cannot be locked from the walk.
expect POST "/api/engagements/$ENG/produce-run" '{"banner_title":"OUTSIDE-IN HYPOTHESIS","note":"Verification: run three, for the B2 break.","source_fixture":"q4l_run_3"}' 201 "(run 3, open)"
edit "$WALKCARD" "          {openRun && (s8 === 'next' || (lockedRun && !eng?.retired)) && (" "          {s8 === 'next' && openRun && ("
sleep 5; walk break-lock; restore "$WALKCARD"
# B3 — the lever gate removed from the opener: the step is offered with no lever again.
# (A fresh account with an outcome on a leverless entry: the main walk added a lever to E.)
E2="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$IND', 'Q4l B3 entry (fixture)', 'incidents', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Q4l B3 account $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for B3.\"}}" 201 "(a second account, for B3)"
INST2="$(rj b.institution_id)"
expect POST "/api/institutions/$INST2/analyst-of-record" "{\"person_id\":\"$S\",\"title\":\"External analyst of record (verification)\"}" 201 "(its analyst of record)"
expect POST "/api/institutions/$INST2/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Q4l B3 capability\",\"owner_person_id\":\"$S\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "(its capability)"
expect POST "/api/institutions/$INST2/value-outcomes" "{\"engagement_name\":\"Q4l B3 engagement\",\"engagement_owner_person_id\":\"$S\",\"capability_name\":\"Q4l B3 capability\",\"metric\":{\"name\":\"Q4l B3 metric $TS\",\"unit\":\"incidents\",\"direction\":\"decrease\",\"source_system\":\"published disclosures\",\"owner_person_id\":\"$S\"},\"baseline_value\":3,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}" 201 "(its outcome)"
expect POST "/api/business-metrics/$(rj b.business_metric_id)/pack-basis" "{\"industry_measure_id\":\"$E2\",\"basis_note\":\"Verification: B3 basis.\"}" 201 "(on the leverless entry)"
edit "$POVCARD" "    if (based.length > 0 && based.every((o) => !hasLever(o))) {" "    if (false) {"
sleep 5; INST_SAVE="$INST"; INST="$INST2"; walk break-gate; INST="$INST_SAVE"; restore "$POVCARD"
step "6. Q4m: a retired reference engagement on the POV (Scotts' W9 is held for this)"
LEV="$(q "SELECT id FROM value_levers WHERE name = 'Q4l lever' AND deleted_at IS NULL")"
expect POST "/api/institutions/$INST/hypotheses" "{\"value_outcome_id\":\"$OUT\",\"value_lever_id\":\"$LEV\",\"statement\":\"Q4m: hazard recognition reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"2027-09-30\",\"falsifier_conditions\":\"on the same denominator\"}" 201 "(an open hypothesis)"
R3="$(q "SELECT id FROM value_runs WHERE engagement_id = '$ENG' AND locked_at IS NULL")"
expect POST "/api/value-runs/$R3/lock" '{"lock_reason":"Verification: run three locked before the retirement."}' 200 "(run 3 locked: three locked runs)"
expect POST "/api/engagements/$ENG/retire" '{"retirement_reason":"Verification: a reference example, retired so the cohort does not count it."}' 200 "W9: the reference engagement retired"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV read, after the retirement"
[ "$(rj "[b.engagements[0].retired, b.engagements[0].locked_runs.map(r=>r.run_number).join(','), b.outcomes[0].engagement_retired, b.hypotheses.filter(h=>!h.withdrawn_at&&!h.superseded_by_id).length].join('|')")" = "true|1,2,3|true|1" ] \
  && ok "  ...retired; all three locked runs; the outcome marked frozen; the open hypothesis kept" || bad "  ...$(rj "JSON.stringify([b.engagements.map(e=>[e.retired,e.locked_runs]),b.outcomes.map(o=>o.engagement_retired)])" | head -c 500)"
expect GET "/api/value-outcomes/$OUT/gaps" "" 409 "the gap register still refuses a frozen outcome" "This outcome belongs to a retired engagement: its outcomes are frozen"
grep -qE '[0-9a-f]{8}-[0-9a-f]{4}' "$W/r.json" && bad "  ...with an id in the answer: $(head -c 300 "$W/r.json")" || ok "  ...in words, with no id"
walk pov-retired
# B4 — the frozen flag off: the POV asks the gap register again, and shows its refusal.
edit "$POVROUTE" "AND (eg.deleted_at IS NOT NULL OR eg.superseded_by_id IS NOT NULL)) AS engagement_retired" "AND false) AS engagement_retired"
stop_server; start_server; walk break-frozen; restore "$POVROUTE"; stop_server; start_server
# B5 — "Locked runs" back to one per engagement: runs 1 and 2 drop out of the document.
edit "$POVPAGE" "e.locked_runs.map((r) => (" "e.locked_runs.slice(-1).map((r) => ("
sleep 5; walk break-runs; restore "$POVPAGE"
step "7. UX-1-D3: the outside_in_test marker kind (0038), and the Scotts correction"
CIT="Published FY25 disclosures (verification fixture)"
expect POST "/api/institutions/$INST/reference-example" "{\"kind\":\"published_case_study\",\"source_citation\":\"$CIT\",\"note\":\"Verification: marked the old way first, as Scotts was.\"}" 201 "the account marked a published case study (how Scotts was marked before 0038)"
M1="$(rj b.reference_example_marker_id)"
expect POST "/api/reference-examples/$M1/supersede" "{\"kind\":\"case_study\",\"source_citation\":\"$CIT\",\"note\":\"Verification: an unknown kind.\",\"supersession_reason\":\"Verification: trying a kind that does not exist.\"}" 422 "an unknown kind -> refused, in words" "choose what kind of example this is: a published case study, a demonstration, or an outside-in test"
expect POST "/api/reference-examples/$M1/supersede" "{\"kind\":\"outside_in_test\",\"source_citation\":\"$CIT\",\"note\":\"Verification: an outside-in test of published material.\",\"supersession_reason\":\"Verification: it was never a published case study; it is an outside-in test.\"}" 201 "the steward corrects it to outside_in_test (a supersession, not an edit)"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV read"
[ "$(rj "[b.reference_example.kind, b.reference_markers.length, b.reference_markers.find(m=>m.id==='$M1').kind, b.reference_markers.find(m=>m.id==='$M1').current].join('|')")" = "outside_in_test|2|published_case_study|false" ] \
  && ok "  ...current kind outside_in_test; the earlier published_case_study marker kept, not current" || bad "  ...$(rj "JSON.stringify([b.reference_example, b.reference_markers])" | head -c 400)"
[ "$(q "SELECT count(*) FROM reference_example_markers WHERE institution_id = '$INST'")|$(q "SELECT string_agg(kind::text, ',' ORDER BY created_at) FROM reference_example_markers WHERE institution_id = '$INST'")" = "2|published_case_study,outside_in_test" ] && ok "  ...both rows in the table; nothing rewritten" || bad "  ...rows"
walk pov-marker
# B6 — the old banner back: the kind no longer reaches it.
edit "$POVAPI" "  outside_in_test: { label: 'Outside-in test', banner: 'OUTSIDE-IN TEST — built from published material, not a customer engagement' }," "  outside_in_test: { label: 'Outside-in test', banner: 'REFERENCE EXAMPLE, NOT AN ENGAGEMENT' },"
sleep 5; walk break-marker; restore "$POVAPI"
for f in "$FORM" "$WALKCARD" "$POVCARD" "$POVPAGE" "$POVROUTE" "$POVAPI"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
