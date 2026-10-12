#!/usr/bin/env bash
#
# Q4c2 — the outside-in walk card on the account page (LVRF_PLAN §4c) and
# its read, GET /api/institutions/:institutionId/walk. Local verification.
#
#   ./scripts/verify_outside_in_walk.sh [screenshot_dir]
#
# Clone `lvrf_verifywalk` (createdb -T lvrf -O lvrf_app), migrated and
# hardened, dropped on exit. API with the header actor
# (LVRF_ALLOW_ACTOR_HEADER=1, this throwaway server only); the page through
# Vite and headless Chrome, signed in by SESSION. FICTIONAL accounts only.
#
# DELIBERATE BREAKS edit a source file in place and restore it
# byte-identical (cmp); the EXIT trap restores them too.

set -euo pipefail
cd "$(dirname "$0")/.."
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifywalk
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3071; VITE_PORT=5177; CDP_PORT=9337
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_walk.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ROUTE=server/routes/outsideInWalk.ts
CARD=client/src/components/OutsideInWalk.tsx
EVCARD=client/src/components/workbench/AddEvidenceCard.tsx
for f in "$ROUTE" "$CARD" "$EVCARD"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$ROUTE" "$CARD" "$EVCARD"; do
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
req() {  # METHOD PATH [BODY] [ACTOR]
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: ${4:-$S}" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: ${4:-$S}" -d "$3" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING] [ACTOR]
  req "$1" "$2" "$3" "${7:-$S}"
  local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 400)"; fi
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate, harden; fixtures"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@walk.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant'), ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
IND_M="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
IND_O="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'retail'")"
MEAS() { q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$1', '$2', 'incidents per 200,000 hours', 'decrease', 'Recordable incidents x 200,000 / hours worked (fixture).', 'w', true, 'r', 'Fixture confounders: reporting practice, mix of work.', 'Verification fixture, not a source.') RETURNING id" | head -1; }
E_M="$(MEAS "$IND_M" "Walk TRIR (fixture)")"; E_O="$(MEAS "$IND_O" "Walk retail entry (fixture)")"
[ -n "$E_M" ] && [ -n "$E_O" ] && ok "steward S, authorized X; a manufacturing pack entry and a retail one (fixtures)" || { bad "fixtures"; exit 1; }
start_server && ok "API up on $PORT"
acct() { req POST /api/account-inputs "{\"institution\":{\"name\":\"$1 $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for the walk.\"}}"; rj b.institution_id; }
A_API="$(acct 'Walk API account')"; A_UI="$(acct 'Walk UI account')"; A_UI2="$(acct 'Walk UI account two')"
TEN_X="$(q "SELECT id FROM tenants WHERE id <> '$TEN' ORDER BY id LIMIT 1")"
INST_X="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TEN_X', 'Other tenant (walk verification $TS)') RETURNING id" | head -1)"

step "3. GET /api/institutions/:institutionId/walk"
expect GET "/api/institutions/$A_API/walk" "" 200 "the walk read on a fresh account"
[ "$(rj "[b.institution.industry_slug, b.persons.length, b.capabilities.length, b.engagements.length, b.pack.some(m=>m.id==='$E_M' && m.confounders.startsWith('Fixture confounders')), b.offerings.some(o=>o.offering_key==='skillsoft_compliance_suite')].join()")" = "manufacturing,0,0,0,true,true" ] \
  && ok "  ...nothing done yet; the manufacturing pack with confounders; the offering catalog" || bad "  ...$(head -c 300 "$W/r.json")"
expect GET "/api/institutions/$INST_X/walk" "" 404 "another tenant's account" "institution $INST_X not found"

step "4. The walk's routes (API), with the cases §4c names"
expect POST "/api/institutions/$A_API/inputs" "{\"persons\":[{\"full_name\":\"API Analyst (external analyst of record)\",\"email\":\"api.analyst.$TS@walk.example\",\"title\":\"External analyst of record\"}]}" 201 "W1: the analyst of record"
OWNER="$(rj b.person_ids[0])"
expect POST "/api/institutions/$A_API/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"API safety capability\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "W2: offering and capability"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E_O\",\"claim\":\"Verification: another industry's entry.\"}" 422 "W3: a claim on another industry's entry" "not Retail"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E_M\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "W3: the claim"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E_M\",\"claim\":\"again\"}" 409 "W3: a second claim (final)" "a claim is not amended"
expect POST "/api/institutions/$A_API/value-outcomes" "{\"engagement_name\":\"API walk — reference example, not an engagement\",\"engagement_owner_person_id\":\"$OWNER\",\"capability_name\":\"API safety capability\",\"metric\":{\"name\":\"API TRIR\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"API fixture disclosures\",\"owner_person_id\":\"$OWNER\"},\"baseline_value\":0,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}" 201 "W4: the outcome, baseline 0 (zero is data), no target"
OUT="$(rj b.value_outcome_id)"; MET="$(rj b.business_metric_id)"; ENG="$(rj b.engagement_id)"
[ "$(q "SELECT baseline_value::text || '|' || (target_value IS NULL) FROM value_outcomes WHERE id = '$OUT'")" = "0.0000|true" ] && ok "  ...stored 0, target null" || bad "  ...outcome row"
expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E_O\",\"basis_note\":\"v\"}" 422 "W5: a basis on another industry's entry" "not Retail"
expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E_M\",\"basis_note\":\"Verification: same rate.\"}" 201 "W5: the basis"
expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E_M\",\"basis_note\":\"again\"}" 409 "W5: a second basis (final)" "a basis is not amended"
EVB() { printf '{"kind":"%s","provenance":"Fixture CR disclosures, page 21 (not a source)","summary":"%s","supports":"%s","confidence":"medium","source_verified":false,"ai_sourced":false,"simulated":false}' "$1" "$2" "$3"; }
expect POST "/api/value-outcomes/$OUT/evidence" "$(EVB vendor_publication 'A vendor claim offered as the actual' actual)" 422 "W6: a vendor publication as the actual: refused by the database" "vendor-published evidence may not support a measured actual"
expect POST "/api/value-outcomes/$OUT/evidence" "$(EVB public_filing 'TRIR FY25 0 (fixture)' baseline)" 201 "W6: the baseline evidence, before any run"
expect POST "/api/value-outcomes/$OUT/evidence" "$(EVB vendor_publication 'Vendor claim: 75% reduction, no period (fixture)' impact_basis)" 201 "W6: the vendor claim as impact_basis"
expect POST "/api/engagements/$ENG/produce-run" '{"banner_title":"OUTSIDE-IN HYPOTHESIS","note":"Verification: an outside-in hypothesis from published material.","source_fixture":"walk_api_outside_in"}' 201 "W7: produce the run"
RUN="$(rj b.value_run_id)"
expect POST "/api/value-runs/$RUN/lock" '{"lock_reason":"Verification: first locked."}' 200 "W8: lock it"
expect POST "/api/value-runs/$RUN/lock" '{"lock_reason":"again"}' 409 "W8: a second lock" "is already locked"
expect POST "/api/engagements/$ENG/retire" '{"retirement_reason":"Verification: a reference example."}' 403 "W9: retire by a non-steward" "Retiring an engagement is the steward's act" "$X"
expect POST "/api/engagements/$ENG/retire" '{"retirement_reason":"Verification: a reference example, its run locked."}' 200 "W9: retire by the steward"
expect GET "/api/institutions/$A_API/walk" "" 200 "the walk read after every step"
[ "$(rj "[b.persons.length, b.capabilities[0].claims.length, b.engagements[0].retired, b.engagements[0].outcomes[0].metric.industry_measure_id==='$E_M', b.engagements[0].outcomes[0].evidence.map(e=>e.supports).sort().join('+'), b.engagements[0].runs[0].locked_at!==null].join()")" = "1,1,true,true,baseline+impact_basis,true" ] \
  && ok "  ...every step reflected: person, claim, basis, evidence, locked run, retired" || bad "  ...$(head -c 400 "$W/r.json")"

step "5. The card, in a browser (sign-in by session)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
walk() {  # MODE INST
  set +e  # pipefail would end the script on a failed walk before its code is read
  node scripts/lib/outside_in_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$2" "$S_EMAIL" "$X_EMAIL" "$PW" "$S_NAME" 2>&1 | tee "$W/walk.$1.log"; local rc=${PIPESTATUS[0]}; set -e
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc — a crash is a failure (see $W/walk.$1.log)"
}
walk steward-to-lock "$A_UI"
walk nonsteward-retire "$A_UI"

step "6. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
# B1 — the client's steward gate on W9 removed: X submits; the server still 403s.
edit "$CARD" "const stewardReason = actor?.is_steward ? undefined :" "const stewardReason = true ? undefined :"
sleep 5; walk break-retire-gate "$A_UI"; restore "$CARD"
sleep 3; walk steward-retire "$A_UI"
# B2 — the read's tenant check removed: another tenant's account is served.
edit "$ROUTE" "if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) {" "if (!inst) {"
stop_server; start_server
expect GET "/api/institutions/$INST_X/walk" "" 200 "B2: without the tenant check, another tenant's walk is served — the check is what refuses it"
restore "$ROUTE"; stop_server; start_server
expect GET "/api/institutions/$INST_X/walk" "" 404 "B2 restored: 404 again"
# B3 — the evidence card's outcomeId path removed: evidence cannot be added before a run.
edit "$EVCARD" "  const outcomeId = outcomeIdProp ?? run?.payload.valueOutcomeId;" "  const outcomeId = run?.payload.valueOutcomeId ?? (outcomeIdProp && undefined);"
sleep 5; walk break-evidence "$A_UI2"; restore "$EVCARD"
for f in "$ROUTE" "$CARD" "$EVCARD"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
