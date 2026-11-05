#!/usr/bin/env bash
#
# B3 (P6; LVRF_PLAN §19) — the value case: policies, the CFO lens, cost of delay, the roadmap, solutioning, the share for
# review and the print request; payloadVersion 5. Local verification.
#
#   ./scripts/verify_value_case.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` to `lvrf_verifyvaluecase`, migrated (0047, 0048) and hardened (section 33), dropped on exit.
# Fixtures go through the routes; the B3 act session is performed through the page, on the clone, and its confirmations
# compared word for word with LVRF_PLAN §19. DELIBERATE BREAKS (every file restored byte-identical, every function
# restored by re-applying hardening.sql), each must be caught:
#   C1  the measure-class refusal removed from lvrf_cost_of_delay: the fixture then computes, so the class is what holds it
#   C2  a rate on vendor evidence; a rate attested by no customer-side person (both refused by the function)
#   C3  the unit check removed from the rate guard: a rate in the wrong unit lands
#   C4  the reference-example test removed from the CFO lens: Curia reads through the CFO lens
#   C5  a pre-v5 run given today's cost of delay: caught
#   C6  solutioning reading links under a withdrawn lever (ruling 5)
#   C7  the reviewer's note joined into the case (ruling 4)
#   C8  a share recorded while the run is not outside-in (the banner gate removed)
#   C9  N lowered; D unset; a policy value, a lens or a share by a non-steward (route and database)
#   C10 a converting question removed; floor-first's sort removed
#   C11 the "sourced at x of N" label dropped from the page
# Plus: the $50,000 proven by hand through lvrf_cost_of_delay_amount only; a NULL-input refusal per new CHECK; a
# roadmap milestone edited in place refused; screens at 1280 and 390; every printed page of the case and the POV.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifyvaluecase
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3109; VITE_PORT=5209; CDP_PORT=9369
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_vcase.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
CASE=server/routes/valueCase.ts; ASKS=server/lib/caseQuestions.ts; PAGE=client/src/pages/ValueCasePage.tsx
EDITED=("$CASE" "$ASKS" "$PAGE")
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

step "2. Clone the prod copy; migrate 0047 and 0048; harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > "$W/own.log" 2>&1 && ok "ownership.sql" || bad "ownership: $(grep -m2 ERROR "$W/own.log")"
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "204" ] && ok "204 triggers: section 33 adds 18" || bad "triggers: $(trig)"
[ "$(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")" = "320" ] && ok "  ...320 information_schema rows (288 + 32)" || bad "  ...rows: $(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "  ...every run byte-identical: the migrations and section 33 write nothing to a run" || bad "  ...a run changed"
[ "$(q "SELECT string_agg(DISTINCT kind, ',') || '|' || count(*) FROM record_documents")" = "rendering|$(q "SELECT count(*) FROM record_documents")" ] && ok "  ...every existing record document reads 'rendering'" || bad "  ...kinds: $(q "SELECT string_agg(DISTINCT kind, ',') FROM record_documents")"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 49 migrations, newest 0048_b3_value_case" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^127 CHECKs in the database: 127 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN" || bad "plain: $PLAIN"
OWN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_ownership.ts 2>&1 | tail -1)"
printf '%s' "$OWN" | grep -q "lvrf_app owns nothing" && ok "ownership: $OWN" || bad "ownership: $OWN"

step "3. Fixtures, through the routes"
TS="$(date +%s)"
TODAY="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')")"
LATER="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 90, 'YYYY-MM-DD')")"
LATER2="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 120, 'YYYY-MM-DD')")"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', 'x.$TS@vcase.example') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
# The real Manufacturing TRIR entry, which carries a reviewer's note (ruling 4: it must not reach the case).
E="$(q "SELECT m.id FROM industry_measures m JOIN industries i ON i.id = m.industry_id WHERE i.slug = 'manufacturing' AND m.name = 'Total Recordable Incident Rate (TRIR)' AND m.deleted_at IS NULL")"
NOTE_PART="BLS formula quoted"
[ -n "$E" ] && [ "$(q "SELECT count(*) FROM research_results WHERE industry_measures_id = '$E' AND review_state = 'accepted' AND review_note LIKE '%$NOTE_PART%'")" = "1" ] && ok "the TRIR entry, with a reviewer's note on record" || { bad "TRIR entry"; exit 1; }
UNIT="incidents per 200,000 hours"
start_server && ok "API up on $PORT"
acct() {  # NAME -> INST, OWNER, FIN
  expect POST /api/account-inputs "{\"institution\":{\"name\":\"$1 $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for B3.\"},\"persons\":[{\"full_name\":\"Customer owner (verification)\",\"email\":\"owner.$1.$TS@vcase.example\",\"title\":\"Director of Safety\"},{\"full_name\":\"Customer finance (verification)\",\"email\":\"fin.$1.$TS@vcase.example\",\"title\":\"Controller\"}]}" 201 "an account: $1"
  INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; FIN="$(rj b.person_ids[1])"
}
outcome() {  # INST OWNER NAME BASELINE -> OUT, MET, ENG
  req POST "/api/institutions/$1/value-outcomes" "{\"engagement_name\":\"$3 engagement $TS\",\"engagement_owner_person_id\":\"$2\",\"capability_name\":\"B3 safety capability\",\"metric\":{\"name\":\"$3\",\"unit\":\"$UNIT\",\"direction\":\"decrease\",\"source_system\":\"verification system of record\",\"owner_person_id\":\"$2\"},\"baseline_value\":$4,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}"
  [ "$CODE" = "201" ] || { bad "outcome $3: $CODE $(said)"; exit 1; }
  OUT="$(rj b.value_outcome_id)"; MET="$(rj b.business_metric_id)"; ENG="$(rj b.engagement_id)"
  expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E\",\"basis_note\":\"Verification: the same rate.\"}" 201 "  ...$3 based on the TRIR entry"
}
EVB() {  # KIND SUMMARY SUPPORTS [ATTESTER]
  if [ -n "${4:-}" ]; then J kind "$1" provenance "Fixture source for: $2 (not a source)" summary "$2" supports "$3" confidence medium source_verified false ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.' attested_by_person_id "$4" attested_at 2026-10-01T00:00:00Z
  else J kind "$1" provenance "Fixture source for: $2 (not a source)" summary "$2" supports "$3" confidence medium source_verified false ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.'; fi
}
COND="on the same denominator, among the covered population"
HB() { J value_outcome_id "$1" value_lever_id "$2" statement "$3" falsifier_reference baseline falsifier_due "$LATER" falsifier_conditions "$COND"; }
LV() { J name "$1" mechanism 'EHS procedural training improves observed safe-work behaviour (fixture).' leading_indicator 'Share of safety observations rated safe' citation 'Verification citation, not a source.'; }
produce() { expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "$2" source_fixture value_case_fixture)" 201 "  ...produced: $2"; RUN="$(rj b.value_run_id)"; }
lock() { expect POST "/api/value-runs/$1/lock" "$(J lock_reason 'Verification: sealed for the value case.')" 200 "  ...locked"; }

acct "B3 client-stated account"; INSTA="$INST"; OWNA="$OWNER"; FINA="$FIN"
expect POST "/api/institutions/$INSTA/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'B3 safety capability' owner_person_id "$OWNA" is_primary false basis 'Verification: EHS solution.')" 201 "an offering"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "$(J industry_measure_id "$E" claim 'Verification: training improves safe behaviour.')" 201 "the capability claims the TRIR entry"
expect POST "/api/industry-measures/$E/levers" "$(LV 'B3 current lever')" 201 "a current lever (steward)"; L="$(rj b.value_lever_id)"
expect POST "/api/industry-measures/$E/levers" "$(LV 'B3 lever to withdraw')" 201 "a second lever, to be withdrawn"; LW="$(rj b.value_lever_id)"
expect POST "/api/value-levers/$L/offerings" "$(J offering_key skillsoft_compliance_suite basis 'Verification: the EHS courses deliver the procedural training.')" 201 "  ...Compliance Suite linked to the current lever"
expect POST "/api/value-levers/$LW/offerings" "$(J offering_key skillsoft_compliance_suite basis 'Verification: a link that must never reach a case.')" 201 "  ...and to the lever to be withdrawn"
outcome "$INSTA" "$OWNA" "B3 TRIR client" 1.4; OA="$OUT"; META="$MET"; ENGA="$ENG"
expect POST "/api/value-outcomes/$OA/evidence" "$(EVB public_filing 'TRIR FY25 1.4 (fixture)' baseline)" 201 "a published baseline"
expect POST "/api/institutions/$INSTA/hypotheses" "$(HB "$OA" "$L" 'Safe-work training raises observed safe behaviour at this account.')" 201 "H1 on the current lever" "" "$X"
expect POST "/api/institutions/$INSTA/hypotheses" "$(HB "$OA" "$LW" 'A second hypothesis, through the lever to be withdrawn.')" 201 "H2 on the lever to be withdrawn" "" "$X"
expect POST "/api/value-levers/$LW/retire" "$(J retirement_reason 'Verification: withdrawn, its link left current.')" 200 "  ...the second lever withdrawn"
[ "$(q "SELECT count(*) FROM lever_offerings WHERE value_lever_id = '$LW' AND retired_at IS NULL")" = "1" ] && ok "  ...its link still reads current (a withdrawn lever keeps its links)" || bad "  ...LW link"
# D unset: the first run refuses "no cost-of-delay months set" and says it is the vendor's to set.
produce "$ENGA" "Verification: D not set yet."; R0="$RUN"
[ "$(q "SELECT payload->>'payloadVersion' FROM value_runs WHERE id = '$R0'")" = "5" ] && ok "payloadVersion 5" || bad "version: $(q "SELECT payload->>'payloadVersion' FROM value_runs WHERE id = '$R0'")"
[ "$(q "SELECT (payload->'case') ?& ARRAY['cost_of_delay','roadmap','solutioning','hypotheses','pack_entry'] FROM value_runs WHERE id = '$R0'")" = "t" ] && ok "  ...the case seals cost of delay, the roadmap and solutioning beside §16's chain" || bad "  ...keys"
[ "$(q "SELECT (payload->'case') = lvrf_case_chain('$OA') FROM value_runs WHERE id = '$R0'")" = "t" ] && ok "  ...payload.case is lvrf_case_chain(), the function the lock guard reads" || bad "  ...case differs"
[ "$(q "SELECT jsonb_path_query_array(payload->'case'->'cost_of_delay'->'reasons', '\$[*].code')::text FROM value_runs WHERE id = '$R0'")" = '["no_months", "no_commitment", "no_rate", "no_measure_class"]' ] && ok "D unset (C9): refused, never computed: no months, no commitment, no rate, no class" || bad "R0 reasons: $(q "SELECT payload->'case'->'cost_of_delay'->'reasons' FROM value_runs WHERE id = '$R0'")"
req GET "/api/value-runs/$R0/case"; [ "$(rj "b.vendor_gaps.map(g=>g.code).join()")" = "no_months" ] && ok "  ...and the case lists it apart, as the vendor's to set" || bad "  ...vendor gaps: $(rj "JSON.stringify(b.vendor_gaps)")"

step "4. The act session, through the page (on the clone)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "the steward signed in by session" || { bad "no session"; exit 1; }
cw() {  # MODE
  local log="$W/walk.$1.$RANDOM.log"
  local rc=0; node scripts/lib/l41_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" > "$log" 2>&1 || rc=$?
  PASS=$((PASS + $(grep -c '^  PASS' "$log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$log" || true)))
  grep -E '^  (PASS|FAIL)' "$log" || true
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc (see $log)"
}
A0="$(q "SELECT count(*) FROM governance_acts WHERE act = 'ratify' AND subject_table IN ('policy_values', 'lens_policies')")"
cw policies
[ "$(q "SELECT key || '=' || trim_scale(value) FROM policy_values ORDER BY key" | tr '\n' ' ')" = "cost_of_delay_months=6 pack_ratification_institutions=2 " ] && ok "D = 6 and N = 2, as set on the page" || bad "policy values: $(q "SELECT key, value FROM policy_values")"
[ "$(q "SELECT persona || ':' || trim_scale(min_confidence_score) || ':' || array_to_string(admitted_bases, '+') || ':' || array_to_string(suppresses, '+') FROM lens_policies")" = "cfo:55:system_of_record+published:consumption" ] && ok "  ...the CFO lens as ratified on the page" || bad "  ...lens: $(q "SELECT * FROM lens_policies")"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'ratify' AND subject_table IN ('policy_values', 'lens_policies')")" = "$((A0 + 3))" ] && ok "  ...three ratify acts, each the steward's" || bad "  ...acts"

step "5. Policies: who sets them, and never lowered (C9)"
expect POST /api/policies/values "$(J key cost_of_delay_months value 7 reason 'Verification: X tries.')" 403 "C9: a policy value by X" "steward" "$X"
expect POST /api/policies/lenses "$(J persona cfo min_confidence_score 50 admitted_bases '["published"]' suppresses '[]' refusal_text 'Verification refusal text, long enough.' reason 'Verification: X tries.')" 403 "C9: a lens by X" "steward" "$X"
sqlrefused "C9: a policy value by X, at the database" "INSERT INTO policy_values (tenant_id, key, value, reason, set_by_person_id) VALUES ('$TEN', 'cost_of_delay_months', 7, 'Verification: X.', '$X')" "only the tenant's steward sets a policy value" "$X"
sqlrefused "C9: a lens by X, at the database" "INSERT INTO lens_policies (tenant_id, persona, min_confidence_score, admitted_bases, suppresses, refusal_text, reason, ratified_by_person_id) VALUES ('$TEN', 'cfo', 50, '{published}', '{}', 'Verification refusal text, long enough.', 'Verification: X.', '$X')" "only the tenant's steward ratifies a lens policy" "$X"
expect POST /api/policies/values "$(J key pack_ratification_institutions value 1 reason 'Verification: lowering N.')" 422 "C9: N lowered" "never lowered"
expect POST /api/policies/values "$(J key cost_of_delay_months value 6 reason 'Verification: the same value.')" 409 "  ...a value that changes nothing" "changes nothing"
sqlrefused "  ...a second first value for a key" "INSERT INTO policy_values (tenant_id, key, value, reason, set_by_person_id) VALUES ('$TEN', 'cost_of_delay_months', 9, 'Verification: a second root.', '$S')" "policy_values_one_root"
sqlrefused "  ...a policy value edited in place" "UPDATE policy_values SET value = 9 WHERE key = 'cost_of_delay_months'" "never edited"

step "6. The rate (design §5.4)"
CR() { printf '/api/institutions/%s/customer-roles' "$1"; }
expect POST "/api/institutions/$INSTA/evidence" "$(J about account kind artifact provenance 'Fixture source for: org chart naming the controller (not a source)' summary 'Org chart naming the controller (fixture)' evidence_form quote quote_text 'Named in the fixture org chart.' how_read 'Read from the fixture org chart, finance box.')" 201 "a role source, as account evidence"; SRC="$(rj b.evidence_id)"
expect POST "/api/evidence/$SRC/open-citation" '{"source_verified":true}' 200 "  ...its source opened (Yes)"
expect POST "$(CR "$INSTA")" "$(J person_id "$FINA" role metric_owner source_evidence_id "$SRC" reason 'Verification: named from the customer org chart.')" 201 "the controller named customer-side (steward, from the source)"
expect POST "/api/value-outcomes/$OA/evidence" "$(EVB attestation 'Controller states 250,000 USD per point of TRIR per year (fixture)' impact_basis "$FINA")" 201 "the rate's evidence, attested by the controller"; RE="$(rj b.evidence_id)"
[ "$(q "SELECT lvrf_evidence_basis(e) FROM evidence e WHERE id = '$RE'")" = "client_stated" ] && ok "  ...client-stated" || bad "  ...basis: $(q "SELECT lvrf_evidence_basis(e) FROM evidence e WHERE id = '$RE'")"
RATE() { J rate 250000 currency USD per_unit "$1" rate_kind performance how_read 'Verification: the controller states the rate in the attestation.' evidence_id "$2"; }
expect POST "/api/value-outcomes/$OA/monetization-rates" "$(RATE 'per incident' "$RE")" 422 "C3: a rate in the wrong unit, refused by the database" "in the metric's own unit"
expect POST "/api/value-outcomes/$OA/monetization-rates" "$(RATE "$UNIT" "$RE")" 201 "the rate, in the metric's unit"; RT="$(rj b.monetization_rate_id)"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'record_rate' AND subject_id = '$RT'")" = "1" ] && ok "  ...one record_rate act" || bad "  ...act"
expect POST "/api/value-outcomes/$OA/monetization-rates" "$(RATE "$UNIT" "$RE")" 422 "  ...a correction with no reason" "say why"
sqlrefused "  ...a rate edited in place" "UPDATE monetization_rates SET rate = 1 WHERE id = '$RT'" "never edited"
fnbreak lvrf_monetization_rate_guard "  IF NEW.per_unit IS DISTINCT FROM m.unit THEN" "  IF false THEN"
[ "$(sqlaccepted "INSERT INTO monetization_rates (tenant_id, institution_id, business_metric_id, rate, currency, per_unit, rate_kind, how_read, evidence_id, reason, recorded_by_person_id, supersedes_id) VALUES ('$TEN', '$INSTA', '$META', 250000, 'USD', 'per incident', 'performance', 'Verification: a break.', '$RE', 'Verification: the wrong unit.', '$S', '$RT')")" = "ACCEPTED" ] && ok "C3: the unit check removed → caught: a rate in the wrong unit lands" || bad "C3"
reharden
CODC() { q "SELECT jsonb_path_query_array(lvrf_cost_of_delay('$OA')->'reasons', '\$[*].code')::text"; }
in_txn() {  # SQL SELECT — the SELECT's result, inside a rolled-back transaction under the steward
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\n%s;\nROLLBACK;\n" "$S" "$1" "$2" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | tail -1
}
expect POST "/api/value-outcomes/$OA/evidence" "$(EVB vendor_publication 'Vendor states a rate (fixture)' impact_basis)" 201 "a vendor's publication"; RV="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$OA/evidence" "$(EVB attestation 'Owner states a rate, no role named (fixture)' impact_basis "$OWNA")" 201 "an attestation by a person with no customer-side role"; RN="$(rj b.evidence_id)"
CORR() { printf "INSERT INTO monetization_rates (tenant_id, institution_id, business_metric_id, rate, currency, per_unit, rate_kind, how_read, evidence_id, reason, recorded_by_person_id, supersedes_id) VALUES ('%s', '%s', '%s', 250000, 'USD', '%s', 'performance', 'Verification: a correction.', '%s', 'Verification: the evidence changes.', '%s', '%s')" "$TEN" "$INSTA" "$META" "$UNIT" "$1" "$S" "$RT"; }
V="$(in_txn "$(CORR "$RV")" "SELECT jsonb_path_query_array(lvrf_cost_of_delay('$OA')->'reasons', '\$[*].code')::text")"
printf '%s' "$V" | grep -q '"rate_basis"' && printf '%s' "$V" | grep -q '"rate_not_attested"' && ok "C2: a rate on a vendor's publication → refused: its evidence is inferred, and no customer-side person attests it" || bad "C2 vendor: $V"
V="$(in_txn "$(CORR "$RN")" "SELECT jsonb_path_query_array(lvrf_cost_of_delay('$OA')->'reasons', '\$[*].code')::text")"
printf '%s' "$V" | grep -q '"rate_not_attested"' && ok "C2: a rate attested by a person with no customer-side role → refused" || bad "C2 attester: $V"

step "7. Commit, the seal, and the \$50,000 (C1)"
expect POST "/api/value-outcomes/$OA/commit" "$(J target_value 1.0 committed_by_person_id "$OWNA" committed_at 2026-10-01T00:00:00Z commitment_note 'Verification: committed to 1.0.')" 201 "a committed target of 1.0 against 1.4"
[ "$(CODC)" = '["no_measure_class"]' ] && ok "every input but the class in place: refused with exactly \"no measure class stated at commit\" (until B4)" || bad "reasons: $(CODC)"
[ "$(q "SELECT (lvrf_cost_of_delay('$OA')->>'amount') IS NULL AND lvrf_cost_of_delay('$OA')->>'status' = 'refused'")" = "t" ] && ok "  ...and no amount: the function computes nothing for a 3.0 case" || bad "  ...amount: $(q "SELECT lvrf_cost_of_delay('$OA')")"
# In tenths, so the hand sum is exact: |10 − 14| / 10 × 250,000 × 6 / 12.
BYHAND="$(node -e 'console.log(Math.abs(10 - 14) * 250000 * 6 / (12 * 10))')"
[ "$(q "SELECT trim_scale(round(lvrf_cost_of_delay_amount(1.4, 1.0, 250000, 6), 2))")" = "$BYHAND" ] && [ "$BYHAND" = "50000" ] && ok "the \$50,000, by hand: |1.0 − 1.4| × 250,000 × 6 / 12 = $BYHAND, through lvrf_cost_of_delay_amount only" || bad "amount: $(q "SELECT lvrf_cost_of_delay_amount(1.4, 1.0, 250000, 6)") by hand $BYHAND"
[ "$(q "SELECT lvrf_cost_of_delay_amount(NULL, 1.0, 250000, 6) IS NULL AND lvrf_cost_of_delay_amount(1.4, 1.0, 0, 6) = 0")" = "t" ] && ok "  ...a NULL input gives no figure; a zero rate gives zero (zero is data)" || bad "  ...null/zero"
fnbreak lvrf_cost_of_delay "  reasons := reasons || jsonb_build_object('code', 'no_measure_class', 'text', 'no measure class stated at commit');" "  NULL;"
[ "$(q "SELECT lvrf_cost_of_delay('$OA')->>'status' || '|' || (lvrf_cost_of_delay('$OA')->>'amount')")" = "computed|50000" ] && ok "C1: the class refusal removed → caught: the fixture computes 50000, so the class is what holds a 3.0 case" || bad "C1: $(q "SELECT lvrf_cost_of_delay('$OA')")"
reharden
expect POST "/api/engagements/$ENGA/milestones" "$(J title 'Baseline extract from the EHS system' due_on "$LATER" owner 'Jane Doe, Director of Safety (fixture)' stage measure)" 201 "a milestone, its owner as stated"; MS="$(rj b.roadmap_milestone_id)"
expect POST "/api/engagements/$ENGA/milestones" "$(J title 'Baseline extract' due_on "$LATER")" 422 "  ...a milestone with no owner stated" "State its owner"
expect POST "/api/roadmap-milestones/$MS/supersede" "$(J due_on "$LATER2" reason 'Verification: the extract slips a month.')" 201 "  ...its date moved, with a reason"; MS2="$(rj b.roadmap_milestone_id)"
expect POST "/api/roadmap-milestones/$MS/supersede" "$(J due_on "$LATER" reason 'Verification: the old version.')" 409 "  ...the old version cannot be changed again" "already been changed"
expect POST "/api/roadmap-milestones/$MS2/supersede" "$(J status done reason 'Verification: done with no evidence.')" 422 "  ...done with no evidence" "only with the evidence"
sqlrefused "a milestone edited in place" "UPDATE roadmap_milestones SET due_on = '$TODAY' WHERE id = '$MS2'" "never edited"
produce "$ENGA" "Verification: the client-stated case."; RA="$RUN"; HASHA="$(q "SELECT payload_hash FROM value_runs WHERE id = '$RA'")"
C() { q "SELECT $1 FROM value_runs WHERE id = '$RA'"; }
[ "$(C "jsonb_path_query_array(payload->'case'->'cost_of_delay'->'reasons', '\$[*].code')::text")" = '["no_measure_class"]' ] && ok "the run seals cost of delay refused for the class alone" || bad "sealed reasons: $(C "payload->'case'->'cost_of_delay'")"
[ "$(C "jsonb_array_length(payload->'case'->'roadmap'->'milestones') || '|' || (payload->'case'->'roadmap'->'milestones'->0->>'owner') || '|' || (payload->'case'->'roadmap'->'milestones'->0->>'slipped')")" = "1|Jane Doe, Director of Safety (fixture)|true" ] && ok "  ...the roadmap: the milestone's current version, its owner as stated, and that it slipped" || bad "  ...roadmap: $(C "payload->'case'->'roadmap'")"
[ "$(C "(SELECT string_agg((x->>'lever_current') || ':' || jsonb_array_length(x->'offerings'), ',' ORDER BY x->>'lever') FROM jsonb_array_elements(payload->'case'->'solutioning') x)")" = "true:1,false:0" ] && ok "  ...solutioning: one offering on the current lever, none through the withdrawn one (ruling 5)" || bad "  ...solutioning: $(C "payload->'case'->'solutioning'")"
[ "$(C "payload->>'currencyCode'")" = "" ] && ok "  ...the outcome's currency sealed as recorded (none here, so the case says so)" || ok "  ...currency sealed: $(C "payload->>'currencyCode'")"
lock "$RA"
fnbreak lvrf_case_chain "'offerings', CASE WHEN l.deleted_at IS NULL AND l.superseded_by_id IS NULL THEN coalesce((" "'offerings', CASE WHEN true THEN coalesce(("
[ "$(q "SELECT (SELECT string_agg((x->>'lever_current') || ':' || jsonb_array_length(x->'offerings'), ',' ORDER BY x->>'lever') FROM jsonb_array_elements(lvrf_case_chain('$OA')->'solutioning') x)")" = "true:1,false:1" ] && ok "C6: the current-lever condition removed → caught: the withdrawn lever's link would reach the case" || bad "C6"
reharden

step "8. The case read, the CFO lens, and the reference example (C4, C5, C7)"
req GET "/api/value-runs/$RA/case?lens=cfo"
[ "$(rj "b.cfo.refused + '|' + b.cfo.reasons.map(r=>r.code).join()")" = "true|$(q "SELECT CASE WHEN confidence_score < 55 THEN 'below_threshold,' ELSE '' END FROM value_runs WHERE id = '$RA'")no_actual" ] && ok "the CFO lens refuses, with its reasons: $(rj "b.cfo.reasons.map(r=>r.code).join()")" || bad "cfo: $(rj "JSON.stringify(b.cfo)")"
[ "$(rj "b.pack_entry.sourced_at + '|' + b.pack_entry.threshold + '|' + b.pack_entry.status")" = "0|2|proposed" ] && ok "  ...the entry: proposed, sourced at 0 of 2 (N the policy value; the count derived now)" || bad "  ...pack entry: $(rj "JSON.stringify(b.pack_entry)")"
grep -qF "$NOTE_PART" "$W/r.json" && bad "ruling 4: the reviewer's note is in the case" || ok "ruling 4: the reviewer's note is not in the case"
edit "$CASE" "        packEntry = { ...sealedCase.pack_entry, sourced_at: c.x, threshold: c.n === null ? null : Number(c.n) };" "        packEntry = { ...sealedCase.pack_entry, sourced_at: c.x, threshold: c.n === null ? null : Number(c.n), review_note: (await pool.query('SELECT review_note FROM research_results WHERE industry_measures_id = \$1 AND review_state = \$2', [sealedCase.pack_entry.id, 'accepted'])).rows[0]?.review_note };"
stop_server; start_server
req GET "/api/value-runs/$RA/case?lens=cfo"; grep -qF "$NOTE_PART" "$W/r.json" && ok "C7: the note joined into the case → caught" || bad "C7"
restore "$CASE"; stop_server; start_server
CURIA_RUN="$(q "SELECT r.id FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id WHERE i.name = 'Curia' AND r.locked_at IS NOT NULL ORDER BY r.walked_at DESC LIMIT 1")"
req GET "/api/value-runs/$CURIA_RUN/case?lens=cfo"
[ "$(rj "b.cfo.reasons.some(r=>r.code==='reference_example') + '|' + b.v5 + '|' + (b.cost_of_delay === null)")" = "true|false|true" ] && ok "Curia (a reference example) never reads through the CFO lens; its pre-v5 run has no cost of delay, roadmap or solutioning" || bad "curia: $(rj "JSON.stringify({cfo:b.cfo,v5:b.v5,cod:b.cost_of_delay})")"
edit "$CASE" "        if (marker) reasons.push('reference_example');" "        if (false && marker) reasons.push('reference_example');"
stop_server; start_server
req GET "/api/value-runs/$CURIA_RUN/case?lens=cfo"; [ "$(rj "b.cfo.reasons.some(r=>r.code==='reference_example')")" = "false" ] && ok "C4: the reference-example test removed → caught" || bad "C4"
restore "$CASE"; stop_server; start_server
edit "$CASE" "      const cod = version >= 5 ? sealedCase?.cost_of_delay ?? null : null;" "      const cod = (await pool.query('SELECT lvrf_cost_of_delay(\$1) AS c', [p.valueOutcomeId])).rows[0]?.c ?? null;"
stop_server; start_server
req GET "/api/value-runs/$CURIA_RUN/case"; [ "$(rj "b.cost_of_delay !== null")" = "true" ] && ok "C5: a pre-v5 run given today's cost of delay → caught (the case would read live, not sealed)" || bad "C5"
restore "$CASE"; stop_server; start_server

step "9. Share for review (D-M21) and the print request (C8)"
acct "B3 outside-in account"; INSTB="$INST"; OWNB="$OWNER"
expect POST "/api/institutions/$INSTB/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'B3 safety capability' owner_person_id "$OWNB" is_primary false basis 'Verification: EHS solution.')" 201 "an offering on the outside-in account"
CAPB="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAPB/industry-measures" "$(J industry_measure_id "$E" claim 'Verification: training improves safe behaviour.')" 201 "  ...its capability claims the entry"
outcome "$INSTB" "$OWNB" "B3 TRIR outside-in" 2.1; OB="$OUT"; ENGB="$ENG"
expect POST "/api/value-outcomes/$OB/evidence" "$(EVB public_filing 'TRIR FY25 2.1 as published (fixture)' baseline)" 201 "  ...a published baseline only"
expect POST "/api/institutions/$INSTB/hypotheses" "$(HB "$OB" "$L" 'Safe-work training raises observed safe behaviour at the prospect.')" 201 "  ...a hypothesis" "" "$X"
produce "$ENGB" "Verification: the outside-in case."; RB="$RUN"; HASHB="$(q "SELECT payload_hash FROM value_runs WHERE id = '$RB'")"
expect POST "/api/value-runs/$RB/share-for-review" "$(J shared_with 'Pat Example, VP Operations, Prospect Co (fixture)' lens cfo)" 409 "a share of an unlocked run" "lock it first"
lock "$RB"
[ "$(q "SELECT lvrf_run_banners('$RB')::text || '|' || lvrf_run_banners('$RA')::text")" = '{"outside_in": true, "unverified": true}|{"outside_in": false, "unverified": true}' ] && ok "banners from the seal: the outside-in run carries both; the client-stated run is not outside-in" || bad "banners: $(q "SELECT lvrf_run_banners('$RB'), lvrf_run_banners('$RA')")"
expect POST "/api/value-runs/$RB/share-for-review" "$(J shared_with 'Pat Example, VP Operations, Prospect Co (fixture)' lens cfo)" 403 "a share by X" "steward" "$X"
expect POST "/api/value-runs/$RB/share-for-review" "$(J shared_with 'Pat Example, VP Operations, Prospect Co (fixture)' lens cfo)" 201 "the steward's share of the outside-in run"; DOC="$(rj b.record_document_id)"
[ "$(q "SELECT kind || '|' || disclosure || '|' || lens || '|' || shared_with || '|' || (content_hash = '$HASHB') FROM record_documents WHERE id = '$DOC'")" = "share_for_review|shared_for_review|cfo|Pat Example, VP Operations, Prospect Co (fixture)|true" ] && ok "  ...who, with whom, the run's hash; disclosed 'shared for review', never customer-shared" || bad "  ...doc: $(q "SELECT * FROM record_documents WHERE id = '$DOC'")"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'share' AND subject_id = '$DOC'")|$(q "SELECT payload_hash FROM value_runs WHERE id = '$RB'")" = "1|$HASHB" ] && ok "  ...one share act; the run unchanged" || bad "  ...act or run"
expect POST "/api/value-runs/$RA/share-for-review" "$(J shared_with 'Pat Example, VP Operations, Prospect Co (fixture)' lens general)" 422 "a share of the client-stated run (not outside-in)" "only while both banners print"
sqlrefused "  ...a share edited in place" "UPDATE record_documents SET shared_with = 'Someone else' WHERE id = '$DOC'" "never edited"
SHARESQL="INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, value_run_id, document_version, disclosure, content_hash, payload, rendered_by_person_id, kind, lens, shared_with) VALUES ('$TEN', '$ENGA', '$OA', '$RA', 90, 'shared_for_review', '$HASHA', '{}', '$S', 'share_for_review', 'general', 'Verification: a break.')"
fnbreak lvrf_record_document_guard "    IF NOT coalesce((b->>'outside_in')::boolean, false) OR NOT coalesce((b->>'unverified')::boolean, false) THEN" "    IF false THEN"
[ "$(sqlaccepted "$SHARESQL")" = "ACCEPTED" ] && ok "C8: the banner gate removed → caught: a share of a run that is not outside-in lands" || bad "C8: $(sqlaccepted "$SHARESQL")"
reharden
expect POST "/api/value-runs/$RA/print-request" "$(J lens cfo)" 201 "a print request (anyone signed in)" "" "$X"; PRQ="$(rj b.record_document_id)"
[ "$(q "SELECT kind || '|' || disclosure || '|' || (content_hash = '$HASHA') FROM record_documents WHERE id = '$PRQ'")|$(q "SELECT count(*) FROM governance_acts WHERE subject_id = '$PRQ'")" = "print_request|internal|true|0" ] && ok "  ...internal, the run's hash, no act (it claims the request only)" || bad "  ...print request"

step "10. NULL inputs: every new CHECK refuses them"
nullref() { sqlrefused "NULL: $1" "$2" "$3"; }
nullref "a policy value's key" "INSERT INTO policy_values (tenant_id, key, value, reason, set_by_person_id) VALUES ('$TEN', NULL, 6, 'Verification: null.', '$S')" "null value"
nullref "a policy value's value" "INSERT INTO policy_values (tenant_id, key, value, reason, set_by_person_id) VALUES ('$TEN', 'cost_of_delay_months', NULL, 'Verification: null.', '$S')" "null value"
nullref "a lens's admitted bases holding a NULL" "INSERT INTO lens_policies (tenant_id, persona, min_confidence_score, admitted_bases, suppresses, refusal_text, reason, ratified_by_person_id, supersedes_id) SELECT '$TEN', 'cfo', 55, ARRAY['published', NULL], '{}', 'Verification refusal text, long enough.', 'Verification: null.', '$S', id FROM lens_policies" "lens_policies_bases_known"
nullref "a lens's suppresses holding a NULL" "INSERT INTO lens_policies (tenant_id, persona, min_confidence_score, admitted_bases, suppresses, refusal_text, reason, ratified_by_person_id, supersedes_id) SELECT '$TEN', 'cfo', 55, '{published}', ARRAY[NULL]::text[], 'Verification refusal text, long enough.', 'Verification: null.', '$S', id FROM lens_policies" "lens_policies_suppresses_known"
nullref "a rate correction's reason" "$(CORR "$RE" | sed "s/'Verification: the evidence changes.'/NULL/")" "monetization_rates_correction_says_why"
nullref "a milestone change's reason" "INSERT INTO roadmap_milestones (tenant_id, engagement_id, title, due_on, owner_stated, planned_by_person_id, supersedes_id, reason) VALUES ('$TEN', '$ENGA', 'Verification change', '$LATER', 'A owner (fixture)', '$S', '$MS2', NULL)" "roadmap_milestones_change_says_why"
nullref "a done milestone's evidence" "INSERT INTO roadmap_milestones (tenant_id, engagement_id, title, due_on, owner_stated, planned_by_person_id, status, done_evidence_id) VALUES ('$TEN', '$ENGA', 'Verification done', '$LATER', 'A owner (fixture)', '$S', 'done', NULL)" "roadmap_milestones_done_has_evidence"
nullref "a milestone's owner" "INSERT INTO roadmap_milestones (tenant_id, engagement_id, title, due_on, owner_stated, planned_by_person_id) VALUES ('$TEN', '$ENGA', 'Verification owner', '$LATER', NULL, '$S')" "null value"
nullref "a share's with-whom" "INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, value_run_id, document_version, disclosure, content_hash, payload, rendered_by_person_id, kind, lens, shared_with) VALUES ('$TEN', '$ENGB', '$OB', '$RB', 91, 'shared_for_review', '$HASHB', '{}', '$S', 'share_for_review', 'cfo', NULL)" "record_documents_kind_complete"
nullref "a print request's lens" "INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, value_run_id, document_version, disclosure, content_hash, payload, rendered_by_person_id, kind, lens) VALUES ('$TEN', '$ENGB', '$OB', '$RB', 92, 'internal', '$HASHB', '{}', '$S', 'print_request', NULL)" "record_documents_kind_complete"
nullref "a print request's run" "INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, value_run_id, document_version, disclosure, content_hash, payload, rendered_by_person_id, kind, lens) VALUES ('$TEN', '$ENGB', '$OB', NULL, 93, 'internal', '$HASHB', '{}', '$S', 'print_request', 'cfo')" "LVRF: record_documents"
# The guard refuses that row before the CHECK runs; the CHECK itself must also be false (never NULL) on it.
KC="$(q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'record_documents_kind_complete'" | sed -E 's/^CHECK \(//; s/\)$//' | sed 's/record_documents\.//g')"
[ "$(q "SELECT ($KC) IS FALSE FROM (VALUES ('print_request'::text, 'cfo'::text, NULL::text, NULL::uuid)) v(kind, lens, shared_with, value_run_id)")" = "t" ] && ok "  ...and the CHECK reads false, not NULL, on a NULL run" || bad "  ...CHECK on NULL: $KC"

step "11. Converting questions and floor-first (C10)"
codes() { { grep -oE "'code', '[a-z_]+'" db/hardening.sql | grep -oE "'[a-z_]+'$" | tr -d "'"; grep -oE "(codes|reasons)\.push\('[a-z_]+'\)" "$CASE" | grep -oE "'[a-z_]+'" | tr -d "'"; } | sort -u; }
ALL="$(codes | tr '\n' ' ')"
MISSING="$(for c in $ALL; do grep -q "^  $c: {" "$ASKS" || echo "$c"; done)"
[ -z "$MISSING" ] && [ "$(printf '%s' "$ALL" | wc -w | tr -d ' ')" -ge 15 ] && ok "every reason code the database and the case can give has its ask and converting question ($(printf '%s' "$ALL" | wc -w | tr -d ' ') codes)" || bad "codes without a question: $MISSING"
edit "$ASKS" "  no_rate: {" "  no_rate_removed: {"
MISSING="$(for c in $ALL; do grep -q "^  $c: {" "$ASKS" || echo "$c"; done)"
[ "$MISSING" = "no_rate" ] && ok "C10: a converting question removed → caught: no_rate" || bad "C10: $MISSING"
restore "$ASKS"
FF() { npx tsx -e "import('./server/routes/valueCase.ts').then(m => console.log(m.floorFirst([{ k: 'weak', floor: 'assumed' }, { k: 'strong', floor: 'system_of_record' }, { k: 'mid', floor: 'published' }]).map(r => r.k).join(',')))" 2>/dev/null | tail -1; }
[ "$(FF)" = "strong,mid,weak" ] && ok "floor-first: rows given weakest first are listed strongest floor first" || bad "floor-first: $(FF)"
edit "$CASE" "  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank(b.r.floor) - rank(a.r.floor) || a.i - b.i).map((x) => x.r);" "  return rows;"
[ "$(FF)" = "weak,strong,mid" ] && ok "C10: floor-first's sort removed → caught" || bad "C10 floor: $(FF)"
restore "$CASE"

step "12. The page, the screens, the print (C11)"
stop_server; start_server
RUN="$RA" LENS=general TAG=client EXPECT_ASKS="baseline_not_system_of_record+q,no_measure_class+q,no_actual+q,no_verifier+q" EXPECT_COD=cod-refused EXPECT_COD_QUESTION="no_measure_class+q" \
  EXPECT_PACK_LABEL="proposed, sourced at 0 of 2 institutions" EXPECT_SOLUTIONING="true:1,false:0" FORBID="$NOTE_PART" HASH="$HASHA" EXPECT_OUTSIDE_IN=0 cw valuecase
CFOR="$(q "SELECT CASE WHEN confidence_score < 55 THEN 'below_threshold,' ELSE '' END FROM value_runs WHERE id = '$RB'")no_actual"
RUN="$RB" LENS=cfo TAG=outside_in EXPECT_ASKS="baseline_not_system_of_record+q,no_commitment+q,no_rate+q,no_measure_class+q,no_actual+q,no_verifier+q" \
  EXPECT_CFO_REFUSED=1 EXPECT_CFO_REASONS="$CFOR" FORBID="$NOTE_PART" HASH="$HASHB" EXPECT_OUTSIDE_IN=1 cw valuecase
RUN="$RB" LENS=general TAG=outside_in EXPECT_ASKS="baseline_not_system_of_record+q,no_commitment+q,no_rate+q,no_measure_class+q,no_actual+q,no_verifier+q" EXPECT_COD=cod-refused \
  EXPECT_COD_QUESTION="no_commitment+q,no_rate+q,no_measure_class+q" EXPECT_PACK_LABEL="proposed, sourced at 0 of 2 institutions" EXPECT_SOLUTIONING="true:1" FORBID="$NOTE_PART" HASH="$HASHB" EXPECT_OUTSIDE_IN=1 cw valuecase
INST="$INSTB" cw povletter
edit "$PAGE" 'data-testid="pack-entry-label"' 'data-testid="pack-entry-label-dropped"'
sleep 5
RUN="$RA" LENS=general TAG=break EXPECT_ASKS="baseline_not_system_of_record+q,no_measure_class+q,no_actual+q,no_verifier+q" EXPECT_PACK_LABEL="proposed, sourced at 0 of 2 institutions" HASH="$HASHA" cw valuecase > "$W/c11.out" 2>&1 || true
grep -q 'FAIL    ...the pack entry reads' "$W/c11.out" && ok "C11: the \"sourced at x of N\" label dropped → caught" || bad "C11: $(grep -c FAIL "$W/c11.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/c11.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/c11.out" || true)))
restore "$PAGE"; sleep 3

step "13. What held"
HASHES() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1; }
printf '%s' "$(HASHES)" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "check_run_hashes: $(HASHES)" || bad "hashes: $(HASHES)"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE r.source_fixture IS DISTINCT FROM 'value_case_fixture'")" = "$RUNS0" ] && ok "every run on the copy byte-identical after all of this" || bad "an older run changed"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^127 CHECKs in the database: 127 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN" || bad "plain: $PLAIN"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
