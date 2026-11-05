#!/usr/bin/env bash
#
# §16 — the case snapshot: a run seals the whole case (LVRF_PLAN §16; CS-D1–D6, Brad's two additions; B2 of
# docs/LVRF_3.0_CRITICAL_PATH.md). Local verification.
#
#   ./scripts/verify_case_snapshot.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` to `lvrf_verifycase`, migrated and hardened, dropped on exit. Fixtures go through the
# routes; the view and the curve are also read on the copy's own runs (Curia's 21-run reference engagement).
# DELIBERATE BREAKS, every file restored byte-identical, every function restored by re-applying hardening.sql:
#   B1  a chain item dropped from lvrf_case_chain(): the seal is caught missing it
#   B2  the lock guard removed: a superseded hypothesis, a new summary and a withdrawn lever each lock (caught)
#   B3  (the guard on) the verdict moved after produce, by a verified actual: the lock is refused
#   B4  produce-run sealing v3 again: that run still locks, and its bytes do not change
#   B5  the view on a retired engagement (200) and on another tenant's (404)
#   B6  the curve joined across a model change; an erratum's mark dropped: the walk catches each
#   B7  a one-sided compare reading as both sealed: caught
#   B8  an erratum's corrected score derived from its points rather than read: caught

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifycase
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3108; VITE_PORT=5208; CDP_PORT=9368
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_case.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
PRODUCE=server/routes/produceRun.ts; COMPARE=server/routes/compareRuns.ts; SNAP=server/routes/snapshots.ts; CURVE=client/src/components/snapshots/ConfidenceCurve.tsx
EDITED=("$PRODUCE" "$COMPARE" "$SNAP" "$CURVE")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "${EDITED[@]}"; do
    cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }
  done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
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
sqlrefused() {  # LABEL SQL NEEDLE — in a rolled-back transaction
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1: refused ($3)" || bad "$1: $out"
}
sqllands() {  # LABEL SQL NEEDLE — a break: the statement lands (rolled back)
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1" || bad "$1: $out"
}
verdict() { q "SELECT lvrf_hypothesis_verdict(h) FROM value_hypotheses h WHERE id = '$1'"; }

J() { node -e 'const a=process.argv.slice(1);const o={};for(let i=0;i<a.length;i+=2){let v=a[i+1];try{if(/^[\[{]|^-?\d+(\.\d+)?$|^(true|false|null)$/.test(v))v=JSON.parse(v)}catch{}o[a[i]]=v}console.log(JSON.stringify(o))' "$@"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
sqlrefused() {  # LABEL SQL EXPECTED_SUBSTRING [ACTOR]
  local out; out="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "${4:-$S}" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
sqlcommit() {  # SQL — kept on the clone, under the steward
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nCOMMIT;\n" "$S" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1
}
sqlaccepted() {  # SQL [ACTOR]
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nROLLBACK;\n" "${2:-$S}" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1 || true
}
fnbreak() {  # FUNCTION OLD NEW — a hardening.sql function with one piece replaced, on the clone only
  python3 - "$W/fnbreak.sql" "$1" "$2" "$3" <<'PY'
import re, sys
out, name, a, b = sys.argv[1:5]
s = open('db/hardening.sql').read()
m = re.search(r"CREATE OR REPLACE FUNCTION " + name + r"\(.*?\n(?:END )?\$\$;\n", s, re.S)
fn = m.group(0); assert fn.count(a) == 1, a
open(out, 'w').write(fn.replace(a, b))
PY
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/fnbreak.sql" > /dev/null
}
reharden() {
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "204" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 204 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone the prod copy; migrate; harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "204" ] && ok "204 triggers (B3 section 33: +18; before:: section 32 adds value_runs_case_current" || bad "triggers: $(trig)"
[ "$(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")" = "320" ] && ok "  ...320 information_schema rows (B3: +32) (287 + 1)" || bad "  ...rows: $(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "  ...every run byte-identical: section 32 writes nothing" || bad "  ...a run changed"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 49 migrations" && ok "drift: none, no migration ($DRIFT)" || bad "drift: $DRIFT"

step "3. Fixtures, through the routes"
TS="$(date +%s)"
TODAY="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')")"
LATER="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 60, 'YYYY-MM-DD')")"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@case.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
IND="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
MEAS() { q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$IND', '$1', 'incidents per 200,000 hours', '$2', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders: plant mix, seasonality.', 'Verification fixture, not a source.') RETURNING id" | head -1; }
E="$(MEAS "Hyp TRIR (fixture)" decrease)"; E2="$(MEAS "Hyp other entry (fixture)" decrease)"; E_INC="$(MEAS "Hyp higher-is-better entry (fixture)" increase)"
TEN_X="$(q "SELECT id FROM tenants WHERE id <> '$TEN' ORDER BY id LIMIT 1")"
[ -n "$TEN_X" ] || TEN_X="$(q "INSERT INTO tenants (name) VALUES ('Tenant X (case verification $TS)') RETURNING id" | head -1)"
INST_X="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TEN_X', 'Other tenant (hyp verification $TS)') RETURNING id" | head -1)"
start_server && ok "API up on $PORT"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Case account $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for O2.\"},\"persons\":[{\"full_name\":\"Customer owner (verification)\",\"email\":\"owner.$TS@case.example\",\"title\":\"Owner\"},{\"full_name\":\"Customer verifier (verification)\",\"email\":\"verifier.$TS@case.example\",\"title\":\"EHS director\"}]}" 201 "an account with two customer-side persons"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; VERIFIER="$(rj b.person_ids[1])"
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Hyp safety capability\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "an offering creates the capability"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "the capability claims the TRIR entry"
LV() { printf '{"name":"%s","mechanism":"Crews trained to recognise hazards stop unsafe tasks earlier.","leading_indicator":"Near-miss reports","citation":"Verification citation, not a source."}' "$1"; }
expect POST "/api/industry-measures/$E/levers" "$(LV 'Hazard recognition')" 201 "a lever on TRIR (steward)"; L="$(rj b.value_lever_id)"
expect POST "/api/industry-measures/$E2/levers" "$(LV 'A lever on another entry')" 201 "a lever on another entry"; L_OTHER="$(rj b.value_lever_id)"
expect POST "/api/industry-measures/$E_INC/levers" "$(LV 'A lever where higher is better')" 201 "a lever on a higher-is-better entry"; L_INC="$(rj b.value_lever_id)"
N=0
outcome() {  # METRIC_NAME BASELINE — sets OUT (and MET), based on the TRIR entry
  N=$((N + 1))
  req POST "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"Hyp engagement $N\",\"engagement_owner_person_id\":\"$OWNER\",\"capability_name\":\"Hyp safety capability\",\"metric\":{\"name\":\"$1\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"verification system of record\",\"owner_person_id\":\"$OWNER\"},\"baseline_value\":$2,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}"
  [ "$CODE" = "201" ] || { bad "outcome $1: $CODE $(said)"; exit 1; }
  OUT="$(rj b.value_outcome_id)"; MET="$(rj b.business_metric_id)"
  req POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E\",\"basis_note\":\"Verification: the same rate.\"}"
  [ "$CODE" = "201" ] || { bad "pack basis $1: $CODE $(said)"; exit 1; }
}
outcome "Hyp TRIR one" 1.4; O1="$OUT"
outcome "Hyp TRIR two" 1.4; O2="$OUT"
outcome "Hyp TRIR zero" 0; O3="$OUT"
outcome "Hyp TRIR four" 1.4; O4="$OUT"
outcome "Hyp TRIR five" 1.4; O5="$OUT"
ok "five outcomes on the TRIR entry, baseline 1.4 (and one of 0: zero is data), each metric based on the entry"
EVB() { printf '{"kind":"%s","provenance":"Fixture source, page 21 (not a source)","summary":"%s","supports":"%s","confidence":"medium","evidence_form":"quote","quote_text":"Verification fixture quote, not a source.","how_read":"Verification fixture: read from the fixture quote as written.","source_verified":false,"ai_sourced":false,"simulated":false}' "$1" "$2" "$3"; }
COND="on the same denominator, among the covered population"
HB() {  # OUTCOME LEVER [REFERENCE] [DUE] [CONDITIONS] [EXTRA]
  printf '{"value_outcome_id":"%s","value_lever_id":"%s","statement":"Frontline hazard recognition reduces recordable injuries at this account.","falsifier_reference":"%s","falsifier_due":"%s","falsifier_conditions":"%s"%s}' "$1" "$2" "${3:-baseline}" "${4:-$TODAY}" "${5:-$COND}" "${6:-}"
}
measure() {  # OUTCOME ACTUAL
  req POST "/api/value-outcomes/$1/evidence" "$(EVB system_export "TRIR extract (fixture)" actual)"; [ "$CODE" = "201" ] || bad "actual evidence $1: $CODE $(said)"
  req POST "/api/value-outcomes/$1/measure" "{\"actual_value\":$2,\"actual_measured_at\":\"${TODAY}T12:00:00Z\"}"; [ "$CODE" = "200" ] || bad "measure $1: $CODE $(said)"
}
verify() {  # OUTCOME
  req POST "/api/value-outcomes/$1/verify" "{\"verified_by_person_id\":\"$VERIFIER\",\"verified_at\":\"${TODAY}T13:00:00Z\",\"attestation_note\":\"Verification: the customer confirmed the extract.\"}"; [ "$CODE" = "200" ] || bad "verify $1: $CODE $(said)"
}

expect POST "/api/institutions/$INST/reference-example" '{"kind":"demonstration","source_citation":"Verification fixture, not a source","note":"Verification: a marker for the case seal."}' 201 "a reference-example marker"
expect POST "/api/institutions/$INST/executive-summaries" '{"lens":"general","body":"A summary for the case seal, verification fixture, long enough.","drafted_with_ai":false}' 201 "an executive summary, version 1"; ES1="$(rj b.executive_summary_id)"
outcome "Case TRIR one" 1.4; O1="$OUT"; ENG1="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O1'")"
outcome "Case TRIR two" 1.4; O2="$OUT"; ENG2="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O2'")"
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB public_filing 'TRIR FY25 1.4 (fixture)' baseline)" 201 "baseline evidence"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L" baseline "$LATER")" 201 "H1 on outcome one" "" "$X"; H1="$(rj b.value_hypothesis_id)"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O2" "$L" baseline "$TODAY")" 201 "H2 on outcome two, due today" "" "$X"; H2="$(rj b.value_hypothesis_id)"
produce() { expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "$2" source_fixture case_fixture)" 201 "  ...produced: $2"; RUN="$(rj b.value_run_id)"; }
lock() { req POST "/api/value-runs/$1/lock" "$(J lock_reason "${2:-Verification: sealed.}")"; }

step "4. The seal (payloadVersion 5 since B3: v4's case and B3's keys)"
produce "$ENG1" "Verification: the first v4 run."; R1="$RUN"
[ "$(q "SELECT payload->>'payloadVersion' FROM value_runs WHERE id = '$R1'")" = "5" ] && ok "payloadVersion 5 (B3; the case chain of §16 within it)" || bad "version"
[ "$(q "SELECT (payload->'case') = lvrf_case_chain('$O1') FROM value_runs WHERE id = '$R1'")" = "t" ] && ok "  ...payload.case is lvrf_case_chain(), the function the guard reads" || bad "  ...case differs"
C() { q "SELECT $1 FROM value_runs r WHERE r.id = '$R1'"; }
[ "$(C "jsonb_array_length(payload->'case'->'hypotheses') || '|' || (payload->'case'->'hypotheses'->0->>'verdict') || '|' || (payload->'case'->'hypotheses'->0->'lever'->'ratification'->>'by') || '|' || (payload->'case'->'hypotheses'->0->'falsifier'->>'value')")" = "1|open|$S_NAME|1.4" ] && ok "  ...the hypothesis, its verdict as it read, its lever's ratification and its falsifier" || bad "  ...hypothesis: $(C "payload->'case'->'hypotheses'")"
[ "$(C "(payload->'case'->'offerings'->0->>'offering_key') || '|' || (payload->'case'->'hypotheses'->0->'lever'->>'status')")" = "skillsoft_compliance_suite|proposed" ] && ok "  ...the capability's offering; the lever's stored status beside its ratification (conflict 3)" || bad "  ...offerings"
[ "$(C "(payload->'case'->'summaries'->0->>'version') || '|' || (payload->'case'->'summaries'->0->>'lens') || '|' || (payload->'case'->'marker'->>'kind')")" = "1|general|demonstration" ] && ok "  ...the summary at version 1, and the marker (CS-D4)" || bad "  ...summaries/marker"
[ "$(C "length(payload->'case'->'pack_entry'->>'fingerprint') || '|' || (payload->'case'->'pack_entry'->>'status')")" = "64|proposed" ] && ok "  ...the pack entry with a SHA-256 of its fields (CS-D3), proposed" || bad "  ...pack entry"
HASHES() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1; }
printf '%s' "$(HASHES)" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "the v4 run hashes, under the same payloadHash" || bad "hashes: $(HASHES)"
# NULL inputs: a metric with no pack entry seals null, not a failure.
N=$((N + 1)); req POST "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"Case engagement no pack $TS\",\"engagement_owner_person_id\":\"$OWNER\",\"capability_name\":\"Hyp safety capability\",\"metric\":{\"name\":\"Case metric no pack\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"Fixture EHS system\"},\"baseline_value\":1.4,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}"
ONP="$(rj b.value_outcome_id)"; ENP="$(rj b.engagement_id)"
produce "$ENP" "Verification: no pack entry."
[ "$(q "SELECT (payload->'case'->'pack_entry') IS NULL OR jsonb_typeof(payload->'case'->'pack_entry') = 'null' FROM value_runs WHERE id = '$RUN'")|$(q "SELECT jsonb_array_length(payload->'case'->'hypotheses') FROM value_runs WHERE id = '$RUN'")" = "t|0" ] && ok "a metric on no pack entry: pack_entry null, no hypotheses, the run still sealed" || bad "no-pack seal: $(q "SELECT payload->'case' FROM value_runs WHERE id = '$RUN'")"
# B1 — a chain item dropped.
fnbreak lvrf_case_chain "    'marker', (SELECT jsonb_build_object('kind', k.kind," "    'marker_dropped', (SELECT jsonb_build_object('kind', k.kind,"
produce "$ENG1" "Verification: B1."; RB1="$RUN"
[ "$(q "SELECT payload->'case' ? 'marker' FROM value_runs WHERE id = '$RB1'")" = "f" ] && ok "B1: the marker dropped from the chain → caught: the seal no longer carries it" || bad "B1"
reharden

step "5. The lock guard (CS-D1)"
lock "$R1"; [ "$CODE" = "200" ] && ok "a v4 run whose chain has not moved locks" || bad "lock R1: $CODE $(said)"
produce "$ENG1" "Verification: then the hypothesis is superseded."; R2="$RUN"
expect POST "/api/value-hypotheses/$H1/supersede" "$(node -e 'console.log(JSON.stringify({statement:"Frontline hazard recognition reduces recordable injuries across the account.",falsifier_reference:"baseline",falsifier_due:process.argv[1],falsifier_conditions:"on the same denominator",supersession_reason:"Verification: restated for the case seal."}))' "$LATER")" 201 "  ...H1 superseded after the run was produced" "" "$X"; H1B="$(rj b.value_hypothesis_id)"
lock "$R2"; [ "$CODE" = "422" ] && printf '%s' "$(said)" | grep -q "the case changed after this run was produced" && ok "  ...its lock refused: \"$(said)\"" || bad "  ...R2 lock: $CODE $(said)"
[ "$(q "SELECT locked_at IS NULL FROM value_runs WHERE id = '$R2'")" = "t" ] && ok "  ...and the run stays unlocked" || bad "  ...R2 locked"
produce "$ENG1" "Verification: produced after the change."; R3="$RUN"; lock "$R3"; [ "$CODE" = "200" ] && ok "  ...a run produced after the change locks" || bad "  ...R3: $CODE"
produce "$ENG1" "Verification: then a new summary."; R4="$RUN"
expect POST "/api/institutions/$INST/executive-summaries" "$(J lens general body 'A second version of the summary, verification fixture, long enough.' drafted_with_ai false supersedes_id "$ES1")" 201 "  ...a new summary version"
lock "$R4"; [ "$CODE" = "422" ] && ok "  ...a new summary refuses the lock" || bad "  ...R4: $CODE $(said)"
produce "$ENG1" "Verification: then the lever is withdrawn."; R5="$RUN"
expect POST "/api/value-levers/$L/retire" '{"retirement_reason":"Verification: the lever withdrawn for the case seal."}' 200 "  ...the lever withdrawn"
lock "$R5"; [ "$CODE" = "422" ] && ok "  ...a withdrawn lever refuses the lock" || bad "  ...R5: $CODE $(said)"
# B2 — the guard removed.
fnbreak lvrf_run_case_current "     AND (NEW.payload->'case') IS DISTINCT FROM (" "     AND false AND (NEW.payload->'case') IS DISTINCT FROM ("
lock "$R5"; [ "$CODE" = "200" ] && ok "B2: the guard removed → a run whose lever was withdrawn after it locks: the guard is what stops it" || bad "B2: $CODE $(said)"
reharden
# B3 — the verdict moves after produce.
produce "$ENG2" "Verification: then the actual is verified."; R7="$RUN"
[ "$(q "SELECT payload->'case'->'hypotheses'->0->>'verdict' FROM value_runs WHERE id = '$R7'")" = "open" ] && ok "a run sealed while H2 is open" || bad "R7 verdict"
measure "$O2" 1.1; verify "$O2"
[ "$(verdict "$H2")" = "survived" ] && ok "  ...H2 now survived, by a verified actual" || bad "  ...H2: $(verdict "$H2")"
lock "$R7"; [ "$CODE" = "422" ] && ok "B3: the verdict moved after produce → the lock is refused" || bad "B3: $CODE $(said)"
# B4 — a v3 run still locks, its bytes unchanged.
edit "$PRODUCE" "        payloadVersion: 5," "        payloadVersion: 3,"
edit "$PRODUCE" "        case: caseChain,
" ""
stop_server; start_server
produce "$ENG2" "Verification: B4, a v3 run."; RV3="$RUN"
B4P="$(q "SELECT md5(payload::text) FROM value_runs WHERE id = '$RV3'")"
restore "$PRODUCE"; restore "$PRODUCE"; stop_server; start_server
lock "$RV3"; [ "$CODE" = "200" ] && [ "$(q "SELECT md5(payload::text) FROM value_runs WHERE id = '$RV3'")" = "$B4P" ] && ok "B4: a run with no case locks as before, its payload unchanged" || bad "B4: $CODE"

step "6. The view (B5)"
expect GET "/api/engagements/$ENG1/snapshots" "" 200 "the snapshots of the fixture engagement"
[ "$(rj "b.runs.filter(r=>r.locked_at).length")" = "$(q "SELECT count(*) FROM value_runs WHERE engagement_id = '$ENG1' AND locked_at IS NOT NULL")" ] && [ "$(rj "b.runs.length")" = "$(q "SELECT count(*) FROM value_runs WHERE engagement_id = '$ENG1'")" ] && [ "$(rj "b.runs.find(r=>r.id==='$R1').case.hypotheses.length")" = "1" ] && ok "  ...every run, locked or not, each with its case" || bad "  ...runs: $(rj "b.runs.map(r=>r.run_number+':'+(r.locked_at?'L':'-')).join()")"
CURIA="$(q "SELECT id FROM institutions WHERE name = 'Curia'")"
CREF="$(q "SELECT g.id FROM engagements g WHERE g.institution_id = '$CURIA' AND g.deleted_at IS NOT NULL ORDER BY g.created_at LIMIT 1")"
expect GET "/api/engagements/$CREF/snapshots" "" 200 "B5: a retired engagement's snapshots"
CN="$(rj "b.runs.filter(r=>r.locked_at).length")"; [ "$CN" = "$(q "SELECT count(*) FROM value_runs WHERE engagement_id = '$CREF' AND locked_at IS NOT NULL AND deleted_at IS NULL")" ] && ok "  ...all $CN locked runs, each reading it sealed no case" || bad "  ...$CN"
[ "$(rj "b.runs.every(r=>r.case===null)")" = "true" ] && ok "  ...none filled in afterwards" || bad "  ...a case appeared"
CRED="$(q "SELECT id FROM value_runs r WHERE engagement_id = '$CREF' AND EXISTS (SELECT 1 FROM run_errata x WHERE x.value_run_id = r.id AND x.kind = 'non_customer_credit' AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id)) LIMIT 1")"
[ "$(rj "b.runs.find(r=>r.id==='$CRED').errata.filter(x=>x.kind==='non_customer_credit').every(x=>x.recomputed_score===null)")" = "true" ] && ok "  ...a credit erratum recorded no recompute, and none is shown (CS-D5)" || bad "  ...recompute"
OTHER_P="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN_X', 'Other tenant owner (case verification)', 'other.$TS@case.example') RETURNING id" | head -1)"
OTHER_E="$(q "INSERT INTO engagements (tenant_id, institution_id, name, owner_person_id) VALUES ('$TEN_X', '$INST_X', 'Other tenant engagement $TS', '$OTHER_P') RETURNING id" | head -1)"
expect GET "/api/engagements/$OTHER_E/snapshots" "" 404 "B5: another tenant's engagement" "not found"
expect GET "/api/engagements/00000000-0000-4000-8000-000000000001/snapshots" "" 404 "  ...an engagement that does not exist" "not found"
# B8 — the corrected score derived.
edit "$SNAP" "'recomputed_score', x.recomputed_score::float)" "'recomputed_score', coalesce(x.recomputed_score, x.sealed_score - coalesce(x.points_not_credited, 0))::float)"
stop_server; start_server
expect GET "/api/engagements/$CREF/snapshots" "" 200 "B8: the corrected score derived"
[ "$(rj "b.runs.find(r=>r.id==='$CRED').errata.filter(x=>x.kind==='non_customer_credit').every(x=>x.recomputed_score===null)")" = "false" ] && ok "B8: a credit erratum now shows a score it never recorded → caught" || bad "B8"
restore "$SNAP"; stop_server; start_server

step "7. What changed (CS-D6)"
expect GET "/api/value-runs/$R1/compare/$R3" "" 200 "two v4 runs"
[ "$(rj "b.case.sealed + '|' + b.case.hypotheses.added.length + '|' + b.case.hypotheses.changed.some(h=>h.what.includes('superseded'))")" = "both|1|true" ] && ok "  ...both sealed: the new version stated, the old one superseded" || bad "  ...$(rj "JSON.stringify(b.case)")"
CV3="$(q "SELECT id FROM value_runs WHERE engagement_id = '$CREF' AND locked_at IS NOT NULL ORDER BY run_number DESC LIMIT 1")"; CV2="$(q "SELECT id FROM value_runs WHERE engagement_id = '$CREF' AND locked_at IS NOT NULL ORDER BY run_number DESC OFFSET 1 LIMIT 1")"
expect GET "/api/value-runs/$CV2/compare/$CV3" "" 200 "two runs that sealed no case"
[ "$(rj "b.case.sealed")" = "neither" ] && printf '%s' "$(rj "b.case.note")" | grep -q "nothing can be said" && ok "  ...neither: nothing can be said, never \"no change\"" || bad "  ...$(rj "JSON.stringify(b.case)")"
expect GET "/api/value-runs/$RV3/compare/$R1" "" 422 "across engagements: refused, as before" "different engagements"
lock "$R3"; RL3="$R3"
produce "$ENG2" "Verification: a v4 run beside the v3 one."; R8="$RUN"; lock "$R8"; [ "$CODE" = "200" ] || bad "R8 lock: $CODE $(said)"
expect GET "/api/value-runs/$RV3/compare/$R8" "" 200 "a v3 run and a v4 run"
[ "$(rj "b.case.sealed")" = "one" ] && ok "  ...one sealed: it says so" || bad "  ...$(rj "JSON.stringify(b.case)")"
# B7 — a one-sided compare read as both.
edit "$COMPARE" "  const sealed = a && b ? 'both' : a || b ? 'one' : 'neither';" "  const sealed = a || b ? 'both' : 'neither';"
stop_server; start_server
expect GET "/api/value-runs/$RV3/compare/$R8" "" 200 "B7: the one-sided case read as both"
[ "$(rj "b.case.sealed")" != "one" ] && ok "B7: caught: it no longer says only one run sealed a case" || bad "B7"
restore "$COMPARE"; stop_server; start_server

step "8. The page, the curve, print (B6)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "the steward signed in by session" || { bad "no session"; exit 1; }
cw() {  # MODE
  local log="$W/walk.$1.log"
  local rc=0; node scripts/lib/l41_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" > "$log" 2>&1 || rc=$?
  PASS=$((PASS + $(grep -c '^  PASS' "$log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$log" || true)))
  grep -E '^  (PASS|FAIL)' "$log" || true
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc (see $log)"
}
# What the curve must show, read from the record: one point per locked run, an erratum mark per run with a current
# erratum, a hollow point per marked run, and a segment break wherever the model or the outcome changes.
EXP() { q "WITH r AS (SELECT run_number, payload->'confidence'->>'modelFingerprint' AS fp, payload->>'valueOutcomeId' AS oc,
          EXISTS (SELECT 1 FROM run_errata x WHERE x.value_run_id = v.id AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id)) AS er,
          lvrf_system_exercise_mark('value_runs', v.id) IS NOT NULL AS sx
        FROM value_runs v WHERE engagement_id = '$1' AND locked_at IS NOT NULL AND deleted_at IS NULL),
     s AS (SELECT run_number, fp, oc, er, sx, lag(fp) OVER (ORDER BY run_number) AS pfp, lag(oc) OVER (ORDER BY run_number) AS poc, row_number() OVER (ORDER BY run_number) AS i FROM r)
     SELECT count(*) || '|' || count(*) FILTER (WHERE er) || '|' || count(*) FILTER (WHERE sx) || '|' || count(*) FILTER (WHERE i > 1 AND (fp IS NULL OR pfp IS NULL OR fp IS DISTINCT FROM pfp OR oc IS DISTINCT FROM poc)) FROM s"; }
CE="$(EXP "$CREF")"
ENG="$CREF" EXPECT="$CE" cw snapshots
ok "(Curia's reference engagement, from the record: points|erratum marks|hollow|breaks = $CE)"
RUN="$R1" cw runcase
# B6 — the curve joined across a model change; an erratum's mark dropped.
edit "$CURVE" "    const joins = prev && p.model_fingerprint !== null && prev.model_fingerprint === p.model_fingerprint && prev.value_outcome_id === p.value_outcome_id;" "    const joins = Boolean(prev);"
sleep 5
ENG="$CREF" EXPECT="$CE" BREAK=1 cw snapshotsbreak
restore "$CURVE"; sleep 2
edit "$CURVE" "              {p.erratum && <rect" "              {false && p.erratum && <rect"
sleep 5
ENG="$CREF" EXPECT="$CE" BREAK=2 cw snapshotsbreak
restore "$CURVE"; sleep 3

step "9. What held"
printf '%s' "$(HASHES)" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "check_run_hashes: $(HASHES)" || bad "hashes: $(HASHES)"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE r.source_fixture IS DISTINCT FROM 'case_fixture'")" = "$RUNS0" ] && ok "every run on the copy byte-identical after all of this" || bad "an older run changed"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^[0-9]+ CHECKs in the database: [0-9]+ with a plain sentence, 0 without; 0 stale" && ok "$PLAIN" || bad "plain: $PLAIN"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
