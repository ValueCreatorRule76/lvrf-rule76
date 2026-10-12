#!/usr/bin/env bash
#
# O2 (Outputs band, LVRF_PLAN §5; O2-D1–D4) — value hypotheses with a
# structured, digit-free falsifier and a COMPUTED verdict; the verifier
# may not be the author; post hoc; executive summaries; reference-example
# markers; the account POV. Local verification.
#
#   ./scripts/verify_value_hypotheses.sh [screenshot_dir]
#
# Clone `lvrf_verifyhyp` (createdb -T lvrf -O lvrf_app), migrated (0036)
# and hardened, dropped on exit. API with the header actor
# (LVRF_ALLOW_ACTOR_HEADER=1, this throwaway server only); the pages
# through Vite and headless Chrome, signed in by SESSION
# (scripts/lib/pov_walk.mjs). Fixtures go through the routes.
#
# DELIBERATE BREAKS (Brad, 12 Oct 2026): an author verifying their own
# actual; a verdict without a verified actual; a hypothesis setting its own
# direction; a digit in the conditions; a falsifier edited in place; post
# hoc read as survived. A source edit is restored byte-identical (cmp; the
# EXIT trap too); a database break runs in a rolled-back transaction or is
# undone by re-applying hardening.sql.

set -euo pipefail
cd "$(dirname "$0")/.."
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifyhyp
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3076; VITE_PORT=5178; CDP_PORT=9338
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_hyp.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ROUTE=server/routes/valueHypotheses.ts
for f in "$ROUTE"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$ROUTE"; do
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
sqlrefused() {  # LABEL SQL NEEDLE — in a rolled-back transaction
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1: refused ($3)" || bad "$1: $out"
}
sqllands() {  # LABEL SQL NEEDLE — a break: the statement lands (rolled back)
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1" || bad "$1: $out"
}
verdict() { q "SELECT lvrf_hypothesis_verdict(h) FROM value_hypotheses h WHERE id = '$1'"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate (0036), harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }
N_TRIG="$(q "SELECT count(DISTINCT trigger_name || '.' || event_object_table) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$N_TRIG" = "$EXPECT_TRIGGERS" ] && [ "$(q "SELECT count(*) FROM hardening_manifest")" = "$EXPECT_TRIGGERS" ] && ok "$N_TRIG distinct triggers and as many manifest rows, as hardening.sql declares" || bad "triggers: $N_TRIG, manifest $(q "SELECT count(*) FROM hardening_manifest"), expected $EXPECT_TRIGGERS"
[ "$(q "SELECT string_agg(DISTINCT trigger_name, ',' ORDER BY trigger_name) FROM information_schema.triggers WHERE event_object_table IN ('value_hypotheses','executive_summaries','reference_example_markers') OR trigger_name = 'value_outcomes_verifier_not_author'")" = "executive_summaries_audit,executive_summaries_guard,executive_summaries_no_delete,reference_example_markers_audit,reference_example_markers_no_delete,reference_example_markers_one_current,reference_example_markers_steward_only,reference_example_markers_supersession_sane,reference_example_markers_touch,value_hypotheses_audit,value_hypotheses_guard,value_hypotheses_no_delete,value_hypotheses_supersession_sane,value_hypotheses_touch,value_outcomes_verifier_not_author" ] \
  && ok "the 15 O2 triggers, by name" || bad "O2 triggers: $(q "SELECT string_agg(DISTINCT trigger_name, ',' ORDER BY trigger_name) FROM information_schema.triggers WHERE event_object_table IN ('value_hypotheses','executive_summaries','reference_example_markers') OR trigger_name = 'value_outcomes_verifier_not_author'")"
[ "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name = 'value_hypotheses' AND column_name ~ 'direction|verdict|decid'")" = "0" ] && ok "value_hypotheses has no direction, verdict or decision column (O2-D1, D4)" || bad "a direction/verdict column exists"
OUT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs || true)"
case "$OUT" in "schema drift: none"*) ok "D2: $OUT" ;; *) bad "D2: $OUT" ;; esac

step "3. Fixtures, through the routes"
TS="$(date +%s)"
TODAY="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')")"
LATER="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 60, 'YYYY-MM-DD')")"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@hyp.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant'), ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
IND="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
MEAS() { q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$IND', '$1', 'incidents per 200,000 hours', '$2', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders: plant mix, seasonality.', 'Verification fixture, not a source.') RETURNING id" | head -1; }
E="$(MEAS "Hyp TRIR (fixture)" decrease)"; E2="$(MEAS "Hyp other entry (fixture)" decrease)"; E_INC="$(MEAS "Hyp higher-is-better entry (fixture)" increase)"
TEN_X="$(q "SELECT id FROM tenants WHERE id <> '$TEN' ORDER BY id LIMIT 1")"
INST_X="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TEN_X', 'Other tenant (hyp verification $TS)') RETURNING id" | head -1)"
start_server && ok "API up on $PORT"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Hyp account $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for O2.\"},\"persons\":[{\"full_name\":\"Customer owner (verification)\",\"email\":\"owner.$TS@hyp.example\",\"title\":\"Owner\"},{\"full_name\":\"Customer verifier (verification)\",\"email\":\"verifier.$TS@hyp.example\",\"title\":\"EHS director\"}]}" 201 "an account with two customer-side persons"
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
EVB() { printf '{"kind":"%s","provenance":"Fixture source, page 21 (not a source)","summary":"%s","supports":"%s","confidence":"medium","source_verified":false,"ai_sourced":false,"simulated":false}' "$1" "$2" "$3"; }
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB public_filing 'TRIR FY25 1.4 (fixture)' baseline)" 201 "baseline evidence: a public filing"
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB vendor_publication 'Vendor claim: 75% fewer recordables (fixture)' impact_basis)" 201 "a vendor claim, as impact_basis"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV, before any customer-side evidence"
[ "$(rj "[b.banners.outside_in, b.banners.unverified, b.value_spine.join('>')].join('|')")" = "true|true|$(q "SELECT array_to_string(enum_range(NULL::value_stage), '>')")" ] \
  && ok "  ...OUTSIDE-IN and UNVERIFIED; the spine in the enum's order" || bad "  ...$(rj "JSON.stringify([b.banners,b.value_spine])")"

step "4. Stating a hypothesis: the route and the database"
COND="on the same denominator, among the covered population"
HB() {  # OUTCOME LEVER [REFERENCE] [DUE] [CONDITIONS] [EXTRA]
  printf '{"value_outcome_id":"%s","value_lever_id":"%s","statement":"Frontline hazard recognition reduces recordable injuries at this account.","falsifier_reference":"%s","falsifier_due":"%s","falsifier_conditions":"%s"%s}' "$1" "$2" "${3:-baseline}" "${4:-$TODAY}" "${5:-$COND}" "${6:-}"
}
REF0="$(q "SELECT count(*) FROM refusals WHERE source = 'route'")"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L" baseline "$TODAY" "$COND" ',"direction":"increase"')" 400 "a hypothesis setting its own direction" "the direction (lower or higher is better) comes only from the pack entry" "$X"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L" baseline "$TODAY" "$COND" ',"verdict":"survived"')" 400 "...its own verdict" "the verdict is computed from the falsifier and the verified actual" "$X"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L" baseline "$TODAY" "$COND" ',"post_hoc":false')" 400 "...its own post hoc flag" "post hoc is computed by the database" "$X"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L" baseline "$TODAY" "$COND" ',"reference_value":1.2')" 400 "...its own reference value" "the reference value is quoted from the outcome row" "$X"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L" baseline "$TODAY" "$COND" ",\"author_person_id\":\"$S\"")" 400 "...another author" "the author is the signed-in person" "$X"
[ "$(q "SELECT count(*) FROM refusals WHERE source = 'route'")" = "$((REF0 + 5))" ] && [ "$(q "SELECT endpoint || '|' || subject_table || '|' || actor_person_id || '|' || (attempted_payload->>'direction') FROM refusals WHERE source = 'route' AND message LIKE '%comes only from the pack entry%' ORDER BY refused_at DESC LIMIT 1")" = "POST /api/institutions/:institutionId/hypotheses|value_hypotheses|$X|increase" ] \
  && ok "  ...each recorded in refusals (source route), the direction attempt with its payload" || bad "  ...route refusals: $(q "SELECT count(*) FROM refusals WHERE source = 'route'") (from $REF0)"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L" baseline "$TODAY" 'within 2 quarters')" 422 "a digit in the conditions (route)" "numbers belong in recorded values, not falsifier conditions" "$X"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L" committed_target)" 422 "a committed target that nobody committed" "no committed target" "$X"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L_OTHER")" 422 "a lever on another pack entry: not one chain" "is not based on the lever's pack entry" "$X"
expect POST "/api/institutions/$INST/hypotheses" '{"value_outcome_id":"'"$O1"'","value_lever_id":"'"$L"'","statement":"too short","falsifier_reference":"baseline","falsifier_due":"soon"}' 422 "a short statement, no date" "body.falsifier_due must be a date" "$X"
expect POST "/api/institutions/$INST_X/hypotheses" "$(HB "$O1" "$L")" 404 "another tenant's account" "institution $INST_X not found" "$X"
AUD0="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O1" "$L")" 201 "X states H1 on outcome one, due today" "" "$X"
H1="$(rj b.value_hypothesis_id)"
[ "$(q "SELECT reference_value::text || '|' || to_char(reference_recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') || '|' || post_hoc || '|' || author_person_id || '|' || lvrf_hypothesis_verdict(h) FROM value_hypotheses h WHERE id = '$H1'")" = "1.4000|2025-09-30|false|$X|open" ] \
  && ok "  ...the reference copied by the database (1.4, 2025-09-30); not post hoc; X the author; verdict open" || bad "  ...row: $(q "SELECT reference_value, reference_recorded_at, post_hoc, author_person_id FROM value_hypotheses WHERE id = '$H1'")"
[ "$(q "SELECT count(*) FROM audit_log WHERE id > $AUD0 AND table_name = 'value_hypotheses' AND record_id = '$H1' AND actor_person_id = '$X'")" = "1" ] && ok "  ...audited, X as actor" || bad "  ...not audited"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O3" "$L")" 201 "H3 on the zero-baseline outcome" "" "$X"; H3="$(rj b.value_hypothesis_id)"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV"
SENT="$(rj "b.hypotheses.find(h=>h.id==='$H1').falsifier_text")"
[ "$SENT" = "Hyp TRIR one at or above its baseline of 1.4 incidents per 200,000 hours (recorded 2025-09-30) on $TODAY, on the same denominator, among the covered population." ] \
  && ok "  ...H1's falsifier sentence: every number quoted from a row; the direction phrase from the pack entry" || bad "  ...sentence: $SENT"
[ "$(rj "b.hypotheses.find(h=>h.id==='$H3').falsifier_text.includes('its baseline of 0 incidents')")" = "true" ] && ok "  ...H3 quotes the zero baseline as 0 (zero is data)" || bad "  ...H3: $(rj "b.hypotheses.find(h=>h.id==='$H3').falsifier_text")"
[ "$(rj "b.hypotheses.find(h=>h.id==='$H1').direction_label")" = "lower is better" ] && ok "  ...shown as 'lower is better', from the pack entry" || bad "  ...direction label"

step "5. Frozen: never edited, restated in plain view"
sqlrefused "edit the conditions in place" "UPDATE value_hypotheses SET falsifier_conditions = 'easier conditions' WHERE id = '$H1'" "is frozen"
sqlrefused "edit the reference value" "UPDATE value_hypotheses SET reference_value = 2 WHERE id = '$H1'" "is frozen"
sqlrefused "move the due date" "UPDATE value_hypotheses SET falsifier_due = DATE '2099-01-01' WHERE id = '$H1'" "is frozen"
sqlrefused "set post hoc" "UPDATE value_hypotheses SET post_hoc = true WHERE id = '$H1'" "is frozen"
sqlrefused "a digit, by SQL" "INSERT INTO value_hypotheses (tenant_id, institution_id, value_outcome_id, value_lever_id, statement, falsifier_reference, falsifier_due, falsifier_conditions, author_person_id) VALUES ('$TEN', '$INST', '$O1', '$L', 'A statement long enough for the CHECK.', 'baseline', DATE '$TODAY', 'by 3 percent', '$X')" "numbers belong in recorded values, not falsifier conditions"
[ "$(printf "BEGIN;\nINSERT INTO value_hypotheses (tenant_id, institution_id, value_outcome_id, value_lever_id, statement, falsifier_reference, falsifier_due, author_person_id, reference_value, reference_recorded_at) VALUES ('%s', '%s', '%s', '%s', 'A statement long enough for the CHECK.', 'baseline', DATE '%s', '%s', 0.1, now()) RETURNING reference_value::text;\nROLLBACK;\n" "$TEN" "$INST" "$O1" "$L" "$TODAY" "$X" | psql -X -At -q -d "$VERIFY_DB" | head -1)" = "1.4000" ] \
  && ok "  ...a reference value sent by SQL (0.1) is replaced by the outcome's recorded baseline (1.4)" || bad "  ...reference value taken from the INSERT"
expect POST "/api/value-hypotheses/$H1/supersede" "{\"statement\":\"Frontline hazard recognition reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"$TODAY\",\"falsifier_conditions\":\"on the same denominator\",\"supersession_reason\":\"Verification: the population condition was not measurable.\"}" 201 "X restates H1 (a new version)" "" "$X"
H1B="$(rj b.value_hypothesis_id)"
[ "$(verdict "$H1")|$(verdict "$H1B")|$(q "SELECT supersession_reason FROM value_hypotheses WHERE id = '$H1'")" = "superseded|open|Verification: the population condition was not measurable." ] && ok "  ...H1 reads superseded, with the reason; H1b open" || bad "  ...$(verdict "$H1") $(verdict "$H1B")"
expect POST "/api/value-hypotheses/$H1/supersede" "{\"statement\":\"Frontline hazard recognition reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"$TODAY\",\"supersession_reason\":\"Verification: a second restatement.\"}" 409 "restating the superseded version" "is not current" "$X"
expect POST "/api/value-hypotheses/$H3/withdraw" '{"retirement_reason":"Verification: the zero baseline was a placeholder."}' 200 "X withdraws H3 before it was tested" "" "$X"
[ "$(verdict "$H3")" = "withdrawn" ] && ok "  ...H3 reads withdrawn" || bad "  ...H3 $(verdict "$H3")"
sqlrefused "un-withdraw H3" "UPDATE value_hypotheses SET deleted_at = NULL, status = 'proposed', retired_by_person_id = NULL, retirement_reason = NULL WHERE id = '$H3'" "is already withdrawn or superseded"

step "6. The verdict: computed, never decided (O2-D1)"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O2" "$L")" 201 "X states H2 on outcome two, due today" "" "$X"; H2="$(rj b.value_hypothesis_id)"
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O5" "$L")" 201 "X states H5 on outcome five, due today" "" "$X"; H5="$(rj b.value_hypothesis_id)"
measure() {  # OUTCOME ACTUAL
  req POST "/api/value-outcomes/$1/evidence" "$(EVB system_export "TRIR extract (fixture)" actual)"; [ "$CODE" = "201" ] || bad "actual evidence $1: $CODE $(said)"
  req POST "/api/value-outcomes/$1/measure" "{\"actual_value\":$2,\"actual_measured_at\":\"${TODAY}T12:00:00Z\"}"; [ "$CODE" = "200" ] || bad "measure $1: $CODE $(said)"
}
verify() {  # OUTCOME
  req POST "/api/value-outcomes/$1/verify" "{\"verified_by_person_id\":\"$VERIFIER\",\"verified_at\":\"${TODAY}T13:00:00Z\",\"attestation_note\":\"Verification: the customer confirmed the extract.\"}"; [ "$CODE" = "200" ] || bad "verify $1: $CODE $(said)"
}
measure "$O1" 1.1
[ "$(verdict "$H1B")" = "open" ] && ok "outcome one measured (1.1), NOT verified: H1b stays open" || bad "H1b after measure: $(verdict "$H1B")"
sqlrefused "the author recorded as the verifier of the actual" "UPDATE value_outcomes SET verified_by_person_id = '$X', verified_at = now(), source_verified = true, realization = 'verified' WHERE id = '$O1'" "cannot verify its actual; the verifier may not be the hypothesis' author"
verify "$O1"
[ "$(verdict "$H1B")" = "survived" ] && ok "verified by the customer's verifier: H1b SURVIVED (1.1 beats the baseline 1.4, lower is better)" || bad "H1b: $(verdict "$H1B")"
sqlrefused "a hypothesis by the person who verified its outcome" "UPDATE value_outcomes SET verified_by_person_id = '$S' WHERE id = '$O1'; INSERT INTO value_hypotheses (tenant_id, institution_id, value_outcome_id, value_lever_id, statement, falsifier_reference, falsifier_due, author_person_id) VALUES ('$TEN', '$INST', '$O1', '$L', 'A statement long enough for the CHECK.', 'baseline', DATE '$TODAY', '$S')" "verified this outcome's actual and cannot author a hypothesis on it"
[ "$(q "SELECT lvrf_hypothesis_verdict(jsonb_populate_record(h, '{\"value_lever_id\":\"$L_INC\"}')) FROM value_hypotheses h WHERE id = '$H1B'")" = "refuted" ] \
  && ok "the same numbers through a higher-is-better pack entry read REFUTED: the direction is the pack entry's alone" || bad "direction flip"
[ "$(q "SELECT lvrf_hypothesis_verdict(jsonb_populate_record(h, '{\"falsifier_due\":\"$LATER\"}')) FROM value_hypotheses h WHERE id = '$H1B'")" = "open" ] \
  && ok "a verified actual measured BEFORE the due date: open" || bad "early actual"
measure "$O2" 1.6; verify "$O2"
[ "$(verdict "$H2")" = "refuted" ] && ok "outcome two verified at 1.6: H2 REFUTED (no better than 1.4) — a first-class result" || bad "H2: $(verdict "$H2")"
expect POST "/api/value-hypotheses/$H2/withdraw" '{"retirement_reason":"Verification: trying to withdraw a refuted hypothesis."}' 409 "withdrawing a refuted hypothesis" "verdict is in (refuted)" "$X"
expect POST "/api/value-hypotheses/$H2/supersede" "{\"statement\":\"Frontline hazard recognition reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"$LATER\",\"supersession_reason\":\"Verification: moving the goalposts after the result.\"}" 409 "restating a refuted hypothesis" "verdict is in (refuted)" "$X"
sqlrefused "withdrawing a refuted hypothesis by SQL" "UPDATE value_hypotheses SET deleted_at = now(), status = 'retired', retired_by_person_id = '$X', retirement_reason = 'Verification: by SQL.' WHERE id = '$H2'" "a tested hypothesis is not withdrawn or superseded"
measure "$O4" 1.1
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O4" "$L")" 201 "X states H4 AFTER outcome four was measured" "" "$X"; H4="$(rj b.value_hypothesis_id)"
[ "$(q "SELECT post_hoc FROM value_hypotheses WHERE id = '$H4'")" = "t" ] && ok "  ...post hoc, computed by the database (O2-D3)" || bad "  ...post_hoc"
verify "$O4"
[ "$(verdict "$H4")" = "survived_post_hoc" ] && ok "  ...verified, it reads survived_post_hoc — never survived" || bad "  ...H4: $(verdict "$H4")"
measure "$O5" 1.1
[ "$(verdict "$H5")" = "open" ] && ok "outcome five measured, not verified: H5 open (used by the B2 break)" || bad "H5: $(verdict "$H5")"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV, after the verdicts"
[ "$(rj "b.hypotheses.map(h=>h.verdict).sort().join(',')")" = "open,refuted,superseded,survived,survived_post_hoc,withdrawn" ] && ok "  ...every verdict, as computed: open, refuted, superseded, survived, survived_post_hoc, withdrawn" || bad "  ...$(rj "b.hypotheses.map(h=>h.verdict).sort().join(',')")"
[ "$(rj "[b.banners.outside_in, b.banners.unverified].join('|')")" = "false|true" ] && ok "  ...customer-side evidence now: no OUTSIDE-IN; still UNVERIFIED (outcomes three and five)" || bad "  ...banners $(rj "JSON.stringify(b.banners)")"
ENG1="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O1'")"; ENG3="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O3'")"
[ "$(rj "[b.engagements.find(e=>e.id==='$ENG1').value_stage, b.engagements.find(e=>e.id==='$ENG1').engagement_stage, b.engagements.find(e=>e.id==='$ENG3').value_stage].join('|')")" = "verify|baseline|baseline" ] \
  && ok "  ...stage reached: verify for outcome one's engagement (its outcome was verified; the engagement row still says baseline), baseline where nothing moved" || bad "  ...stages $(rj "JSON.stringify(b.engagements.map(e=>[e.value_stage,e.engagement_stage]))")"
[ "$(rj "b.outcomes.find(o=>o.id==='$O1').evidence.find(e=>e.kind==='vendor_publication').basis")" = "inferred" ] && ok "  ...the vendor claim rides along, basis inferred, never as the actual" || bad "  ...vendor claim"

step "7. Executive summaries: written by a person, versioned"
SB() { printf '{"lens":"%s","body":"%s","drafted_with_ai":%s%s}' "$1" "${2:-Scotts-like account: the published TRIR baseline is 1.4; the lever is hazard recognition.}" "${3:-false}" "${4:-}"; }
expect POST "/api/institutions/$INST/executive-summaries" "$(SB general '' false ",\"author_person_id\":\"$S\"")" 400 "naming another author" "the author is the signed-in person" "$X"
expect POST "/api/institutions/$INST/executive-summaries" "$(SB general '' true)" 422 "AI-drafted without the tool" "body.drafting_tool must name the tool" "$X"
expect POST "/api/institutions/$INST/executive-summaries" "$(SB general '' false ',"drafting_tool":"Claude"')" 422 "a tool on a summary not drafted with AI" "only for a summary drafted with AI" "$X"
expect POST "/api/institutions/$INST/executive-summaries" "$(SB general 'Too short.')" 422 "a short body" "at least 40 characters" "$X"
expect POST "/api/institutions/$INST/executive-summaries" "$(SB general '' true ',"drafting_tool":"Claude"')" 201 "X writes the first general summary (AI-drafted, declared)" "" "$X"; ES1="$(rj b.executive_summary_id)"
[ "$(q "SELECT author_person_id || '|' || drafted_with_ai || '|' || drafting_tool FROM executive_summaries WHERE id = '$ES1'")" = "$X|true|Claude" ] && ok "  ...authored by X, the actor; the AI disclosure stored" || bad "  ...row"
expect POST "/api/institutions/$INST/executive-summaries" "$(SB general 'A second summary, not naming the first, should be refused here.')" 409 "a second current summary for the same reader" "a new version names it in supersedes_id" "$X"
expect POST "/api/institutions/$INST/executive-summaries" "$(SB general 'The second version: the verified actual beat the baseline at one outcome.' false ",\"supersedes_id\":\"$ES1\"")" 201 "a new version, naming the first" "" "$S"
ES2="$(rj b.executive_summary_id)"
sqlrefused "editing a summary" "UPDATE executive_summaries SET body = 'A quietly edited summary body, long enough.' WHERE id = '$ES1'" "is a version on the record and is never edited"
sqlrefused "deleting a summary" "DELETE FROM executive_summaries WHERE id = '$ES1'" "never deleted"
SIM="$(q "INSERT INTO persons (tenant_id, full_name, email, simulated) VALUES ('$TEN', 'Simulated staff (verification)', 'sim.$TS@hyp.example', true) RETURNING id" | head -1)"
sqlrefused "a summary by a simulated person" "INSERT INTO executive_summaries (tenant_id, institution_id, lens, body, author_person_id, drafted_with_ai) VALUES ('$TEN', '$INST', 'cfo', 'A summary attributed to a simulated person, long enough.', '$SIM', false)" "is not current, non-simulated staff of the tenant"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV"
[ "$(rj "b.executive_summaries.map(s=>s.id+':'+s.current+':'+s.author).join(',')")" = "$ES2:true:$S_NAME,$ES1:false:Authorized X (verification)" ] && ok "  ...both versions listed, the new one current, each attributed" || bad "  ...$(rj "JSON.stringify(b.executive_summaries.map(s=>[s.id,s.current,s.author]))")"

step "8. Reference-example markers: typed, steward-set, supersedable (O2-D2)"
MB='{"kind":"published_case_study","source_citation":"Skillsoft case study (verification fixture)","note":"Verification: an account built from a public story."}'
expect POST "/api/institutions/$INST/reference-example" "$MB" 403 "a non-steward marks" "Marking a reference example is the steward's act" "$X"
expect POST "/api/institutions/$INST/reference-example" "$MB" 201 "the steward marks the account"; M1="$(rj b.reference_example_marker_id)"
expect POST "/api/institutions/$INST/reference-example" "$MB" 409 "marking it again" "is already marked a reference example"
expect POST "/api/reference-examples/$M1/supersede" '{"kind":"demonstration","source_citation":"Internal demonstration (verification fixture)","note":"Verification: a demonstration, not a case study.","supersession_reason":"Verification: the kind was wrong."}' 201 "the steward corrects the marker"
M2="$(rj b.reference_example_marker_id)"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV"
[ "$(rj "[b.reference_example.id, b.reference_example.kind, b.reference_markers.length, b.reference_markers.find(m=>m.id==='$M1').supersession_reason].join('|')")" = "$M2|demonstration|2|Verification: the kind was wrong." ] && ok "  ...the current marker, and the corrected one kept with its reason" || bad "  ...$(rj "JSON.stringify(b.reference_markers)" | head -c 300)"
sqlrefused "a marker by a non-steward, by SQL" "INSERT INTO reference_example_markers (tenant_id, institution_id, kind, source_citation, note, marked_by_person_id) VALUES ('$TEN', '$INST', 'demonstration', 'A citation long enough.', 'A note long enough.', '$X')" "only the tenant's steward may mark a reference example"
sqlrefused "two current markers on one account (checked at commit)" "UPDATE reference_example_markers SET superseded_by_id = NULL, supersession_reason = NULL, status = 'active' WHERE id = '$M1'; SET CONSTRAINTS ALL IMMEDIATE" "current reference-example markers"
expect POST "/api/reference-examples/$M2/retire" '{"retirement_reason":"Verification: it is an engagement after all."}' 200 "the steward unmarks it"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV"
[ "$(rj "String(b.reference_example) + '|' + b.reference_markers.length")" = "null|2" ] && ok "  ...no current marker; both markers stay on the record" || bad "  ...$(rj "JSON.stringify(b.reference_example)")"
expect POST "/api/institutions/$INST/reference-example" "$MB" 201 "marked again, for the page walk"

step "9. The pages, in a browser"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
SPINE="$(q "SELECT array_to_string(enum_range(NULL::value_stage), ',')")"
walk() {  # MODE
  set +e  # pipefail would end the script on a failed walk before its code is read
  node scripts/lib/pov_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$INST" "$S_EMAIL" "$X_EMAIL" "$PW" "$S_NAME" "$LATER" "$SPINE" 2>&1 | tee "$W/walk.$1.log"; local rc=${PIPESTATUS[0]}; set -e
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc — a crash is a failure (see $W/walk.$1.log)"
}
walk author
walk pov

step "10. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
fn_break() {  # NAME PYTHON-REPLACEMENTS... -> writes $W/$NAME.sql, the verdict function altered
  python3 - "$W/$1.sql" "$2" "$3" <<'PY'
import re, sys
s = open('db/hardening.sql').read()
fn = re.search(r"CREATE OR REPLACE FUNCTION lvrf_hypothesis_verdict.*?\n\$\$;\n", s, re.S).group(0)
assert fn.count(sys.argv[2]) == 1, sys.argv[2]
open(sys.argv[1], 'w').write(fn.replace(sys.argv[2], sys.argv[3]))
PY
}
# B1 — an author verifies their own actual: without value_outcomes_verifier_not_author it lands.
sqllands "B1: without value_outcomes_verifier_not_author, X — H2's author — is recorded as outcome two's verifier (rolled back): the trigger is what forbids it" \
  "ALTER TABLE value_outcomes DISABLE TRIGGER value_outcomes_verifier_not_author; UPDATE value_outcomes SET verified_by_person_id = '$X' WHERE id = '$O2'" "UPDATE 1"
[ "$(q "SELECT verified_by_person_id FROM value_outcomes WHERE id = '$O2'")" = "$VERIFIER" ] && ok "  ...after B1: the verifier is the customer's, the trigger in place" || bad "  ...B1 left state"
# B2 — a verdict without a verified actual.
fn_break b2 "WHEN NOT (o.source_verified AND o.verified_by_person_id IS NOT NULL AND o.actual_value IS NOT NULL" "WHEN NOT (o.actual_value IS NOT NULL"
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/b2.sql" > /dev/null
[ "$(verdict "$H5")" = "survived" ] && ok "B2: without the verification condition, H5 reads survived on an UNVERIFIED actual — the condition is what holds it open" || bad "B2: H5 $(verdict "$H5")"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && [ "$(verdict "$H5")" = "open" ] && ok "  ...hardening.sql re-applied: H5 open again" || bad "  ...B2 restore"
# B3 — a hypothesis setting its own direction: the field allowed through.
python3 - "$ROUTE" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read()
a = "['value_outcome_id', 'value_lever_id', 'statement', 'falsifier_reference', 'falsifier_due', 'falsifier_conditions'],"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, "['value_outcome_id', 'value_lever_id', 'statement', 'falsifier_reference', 'falsifier_due', 'falsifier_conditions', 'direction'],"))
PY
stop_server; start_server
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O2" "$L" baseline "$LATER" "$COND" ',"direction":"increase"')" 201 "B3: with 'direction' let through, the author's 'increase' is silently dropped and the request 'succeeds' — the 400 is what tells them a hypothesis cannot set it" "" "$X"
H_B3="$(rj b.value_hypothesis_id)"
[ "$(q "SELECT m.direction FROM value_hypotheses h JOIN value_levers l ON l.id = h.value_lever_id JOIN industry_measures m ON m.id = l.industry_measure_id WHERE h.id = '$H_B3'")" = "decrease" ] && ok "  ...and the direction is still the pack entry's (decrease): there is nowhere to put another" || bad "  ...direction"
restore "$ROUTE"
# B4 — a digit in the conditions. (a) the route's check removed: the database still refuses, explaining itself.
python3 - "$ROUTE" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read()
a = "  else if (/[0-9]/.test(conditions)) issues.push(`body.falsifier_conditions: ${NO_NUMBERS}`);\n"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, ""))
PY
stop_server; start_server
expect POST "/api/institutions/$INST/hypotheses" "$(HB "$O2" "$L" baseline "$LATER" 'within 2 quarters')" 422 "B4a: without the route's digit check, the DATABASE refuses the digit, in the same words" "numbers belong in recorded values, not falsifier conditions" "$X"
restore "$ROUTE"; stop_server; start_server
# (b) the CHECK dropped and the guard disabled (rolled back): the digit lands.
sqllands "B4b: without value_hypotheses_conditions_no_digits and the guard, 'by 3 percent' lands in the conditions (rolled back): they are what keep numbers out" \
  "ALTER TABLE value_hypotheses DROP CONSTRAINT value_hypotheses_conditions_no_digits; ALTER TABLE value_hypotheses DISABLE TRIGGER value_hypotheses_guard; INSERT INTO value_hypotheses (tenant_id, institution_id, value_outcome_id, value_lever_id, statement, falsifier_reference, falsifier_due, falsifier_conditions, author_person_id, reference_value, reference_recorded_at) VALUES ('$TEN', '$INST', '$O2', '$L', 'A statement long enough for the CHECK.', 'baseline', DATE '$LATER', 'by 3 percent', '$X', 1.4, now())" "INSERT 0 1"
[ "$(q "SELECT count(*) FROM pg_constraint WHERE conname = 'value_hypotheses_conditions_no_digits'")$(q "SELECT count(*) FROM value_hypotheses WHERE falsifier_conditions ~ '[0-9]'")" = "10" ] && ok "  ...after B4b: the CHECK in place, no digit on record" || bad "  ...B4b left state"
# B5 — a falsifier edited in place.
sqllands "B5: without value_hypotheses_guard, H1b's conditions are edited in place (rolled back): the freeze is what forbids it" \
  "ALTER TABLE value_hypotheses DISABLE TRIGGER value_hypotheses_guard; UPDATE value_hypotheses SET falsifier_conditions = 'easier conditions' WHERE id = '$H1B'" "UPDATE 1"
[ "$(q "SELECT falsifier_conditions FROM value_hypotheses WHERE id = '$H1B'")" = "on the same denominator" ] && ok "  ...after B5: H1b as stated" || bad "  ...B5 left state"
# B6 — post hoc read as survived.
fn_break b6 "         || CASE WHEN h.post_hoc THEN '_post_hoc' ELSE '' END" ""
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/b6.sql" > /dev/null
[ "$(verdict "$H4")" = "survived" ] && ok "B6: without the post hoc branch, H4 — written after its result — reads plain survived: the branch is what keeps hindsight from counting" || bad "B6: H4 $(verdict "$H4")"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && [ "$(verdict "$H4")" = "survived_post_hoc" ] && ok "  ...hardening.sql re-applied: survived_post_hoc again" || bad "  ...B6 restore"
for f in "$ROUTE"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
