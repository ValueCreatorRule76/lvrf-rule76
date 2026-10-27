#!/usr/bin/env bash
#
# P2 — governance acts, research imports and lineage (LVRF_PLAN §10; migration
# 0041; hardening.sql section 27; P2-D1–D8 ruled by Brad, 25 Oct 2026, with
# conditions on D3–D6). Local verification.
#
#   ./scripts/verify_acts_lineage.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data
# neutralised) to `lvrf_verifyacts` with make_clone, migrated (through 0041)
# and hardened, dropped on exit. Fixtures are invented ("Fixture Valley
# Electric Cooperative (invented)"); every governed act goes through its route,
# signed in by header (actor fixtures) or by SESSION (the browser), except the
# attempts the database must refuse (each in a transaction rolled back).
# Step 0 (scripts/step0_act_presence.sh) is re-run first, on its own scratch
# database.
# DELIBERATE BREAKS, every file restored byte-identical and every function
# restored by re-applying hardening.sql:
#   B1  a governed change with no act: refused at COMMIT
#   B2  a tampered import (hash is not the text's)
#   B3  an import edited after insert
#   B4  an act whose actor is not the session's
#   B5  an UPDATE or a DELETE of an act
#   B6  an act committed in an earlier transaction does not cover a later change
#   B7  a result parsed after the cutover with no import
#   B8  a result naming another prompt's import
#   B9  the act helper call removed from the accept route: the write is refused at COMMIT
#   B10 the lineage's supersession steps removed (on the clone): the chain loses its step
#   B11 a paste over 512 KB: refused in words, recorded by hash and size, not text
#   B12 the open-citation route's own act removed: the opening is refused at COMMIT
#   B13 the errata note on a run's seal step removed (on the clone): the seal loses its erratum

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
. scripts/lib/raw_text.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
command -v pdftotext > /dev/null || { echo "REFUSING: pdftotext (poppler) not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyacts
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3097; VITE_PORT=5197; CDP_PORT=9357
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_acts.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ACCT=server/routes/accountResearch.ts; CITE=server/routes/evidenceCitation.ts
EDITED=("$ACCT" "$CITE")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
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
  for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
sqlrefused() {  # LABEL SQL EXPECTED_SUBSTRING [ACTOR]
  local out; out="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nCOMMIT;\n" "${4:-$S}" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
req() {  # METHOD PATH [BODY] [ACTOR]
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: ${4:-$S}" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: ${4:-$S}" -d "$(asraw "$2" "${3:-}")" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING] [ACTOR]
  req "$1" "$2" "$3" "${7:-$S}"
  local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 400)"; fi
}
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
# The acts written since the last call, as "act:subject_table:result_table:by-S:route", sorted.
# (Not in a $(...) subshell: the count of acts seen must survive the call.)
ACTS_SEEN=0; ACTS_GOT=""
acts_new() {
  local now; now="$(q "SELECT count(*) FROM governance_acts")"
  ACTS_GOT="$(q "SELECT coalesce(string_agg(x, ' | ' ORDER BY x), '') FROM (SELECT act || ':' || subject_table || ':' || coalesce(result_table, '-') || ':' || (actor_person_id = '${1:-$S}') || ':' || route AS x
       FROM governance_acts ORDER BY at, id OFFSET $ACTS_SEEN) a")"
  ACTS_SEEN="$now"
}
act_is() {  # LABEL EXPECTED (sorted, " | "-joined; actor S unless $3)
  acts_new "${3:-$S}"
  [ "$ACTS_GOT" = "$2" ] && ok "  ...$1: $2" || bad "  ...$1: expected [$2], got [$ACTS_GOT]"
}

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc.log")"
(cd client && npx tsc -b) > "$W/tsc2.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc2.log")"

step "2. Step 0, re-run (its own scratch database): the presence check, eight cases"
if ./scripts/step0_act_presence.sh > "$W/step0.log" 2>&1; then
  ok "step0_act_presence: $(grep -E '^==> [0-9]+ passed' "$W/step0.log") — an act for another row (S6) and one from another transaction (S4) do not satisfy it"
else bad "Step 0 failed: $(grep FAIL "$W/step0.log" | head -3)"; fi

step "3. Clone the prod copy; migrate through 0041; harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RR0="$(q "SELECT count(*) FROM research_results")"; HASH0="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (0041_acts_and_lineage)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "176" ] && ok "176 triggers by pg_trigger (C3 section 28: +9; 141 + section 27's 26)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none" && ok "drift: none after 0041 ($DRIFT)" || bad "drift: $DRIFT"
[ "$(q "SELECT count(*) || '|' || count(*) FILTER (WHERE import_id IS NULL) FROM research_results")" = "$RR0|$RR0" ] \
  && ok "all $RR0 existing research results keep import_id NULL: none blank-filled, none invented" || bad "import_id after 0041"
[ "$(q "SELECT (SELECT count(*) FROM governance_acts) || '|' || (SELECT count(*) FROM research_imports)")" = "0|0" ] && ok "governance_acts and research_imports empty after the migration (no backfill: P2-D2)" || bad "acts/imports not empty"
[ "$(q "SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%_act_present' AND tgconstraint <> 0 AND tgdeferrable AND tginitdeferred")" = "20" ] \
  && ok "20 _act_present triggers (P2's 18, C3's customer_role_grants and system_exercise_marks), each a deferred constraint trigger" || bad "act_present triggers: $(q "SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%_act_present'")"

step "4. The coverage guard (Brad's condition on D3): every mutating route classed; every act route records its act"
node scripts/list_api_routes.mjs 2>/dev/null | grep -E '^(POST|PUT|PATCH|DELETE) ' | sort -u > "$W/routes.txt"
npx tsx -e "import('$(pwd)/server/lib/governanceAct.ts').then(m => { for (const [r, a] of Object.entries(m.ROUTE_ACTS)) console.log(r + '\t' + (a === 'create-only' ? 'create-only' : a.join(','))); })" 2>/dev/null | sort > "$W/classes.txt"
UNCLASSED="$(cut -f1 "$W/classes.txt" | comm -23 "$W/routes.txt" - | paste -sd'|' -)"
NOROUTE="$(cut -f1 "$W/classes.txt" | comm -13 "$W/routes.txt" - | paste -sd'|' -)"
[ -z "$UNCLASSED" ] && ok "all $(wc -l < "$W/routes.txt" | tr -d ' ') mutating routes are classed in ROUTE_ACTS" || bad "mutating routes NOT classed: $UNCLASSED"
[ -z "$NOROUTE" ] && ok "every class names a route that exists" || bad "classed but not a route: $NOROUTE"
MISSING=""
while IFS=$'\t' read -r route acts; do
  [ "$acts" = "create-only" ] && continue
  grep -rqF "recordAct(client, req, '$route'" server/routes || { grep -rqF "const route = '$route'" server/routes && grep -rqF "recordAct(client, req, route," server/routes; } || MISSING="$MISSING|$route"
done < "$W/classes.txt"
[ -z "$MISSING" ] && ok "$(grep -vc 'create-only' "$W/classes.txt") act routes each call recordAct with their own pattern; $(grep -c 'create-only' "$W/classes.txt") create-only routes, listed by name in LVRF_PLAN §10" || bad "act routes not calling recordAct:$MISSING"

step "5. Fixtures and the server"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@acts.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
read -r IND SLUG <<< "$(q "SELECT id || ' ' || slug FROM industries WHERE tenant_id = '$TEN' AND slug = 'information-technology'")"
[ -n "$IND" ] && ok "S = $S_NAME (steward), X (authorized); the IT industry for pack research" || { bad "fixtures"; exit 1; }
start_server && ok "API up on $PORT"
ACTS_SEEN="$(q "SELECT count(*) FROM governance_acts")"

step "6. Every act route records its act — pack research and the pack"
mk() { printf '{"name":"%s","unit":"%%","direction":"increase","definition":"d","why_it_pays":"w","confounders":"Fixture confounders: plant mix.","citation":"Verification citation, not a source.","addressable_by_workforce_capability":{"value":true,"why":"y"},"caveats":[]}' "$1"; }
expect POST "/api/industries/$IND/research-prompts" '{}' 201 "a pack research prompt (create-only)"
P_PACK="$(rj b.prompt_id)"
act_is "a prompt writes no act" ""
PACK_TEXT="{\"prompt_id\":\"$P_PACK\",\"industry\":\"$SLUG\",\"research_query\":\"q\",\"query_as_executed\":\"qe\",\"research_tool\":\"Acts verification tool\",\"measures\":[$(mk "Acts M1 $TS"),$(mk "Acts M2 $TS"),$(mk "Acts M3 $TS")]}"
expect POST "/api/industries/$IND/research-results" "$PACK_TEXT" 201 "the pack response, pasted as text"
IMP_PACK="$(rj b.import_id)"
act_is "import" "import:research_imports:-:true:POST /api/industries/:industryId/research-results"
WANT_SHA="$(printf '%s' "$PACK_TEXT" | shasum -a 256 | cut -d' ' -f1)"
[ "$(q "SELECT raw_sha256 || '|' || byte_length || '|' || (raw_text = \$t\$$PACK_TEXT\$t\$) || '|' || (prompt_id = '$P_PACK') FROM research_imports WHERE id = '$IMP_PACK'")" = "$WANT_SHA|${#PACK_TEXT}|true|true" ] \
  && ok "  ...the import holds the text byte for byte; its SHA-256 recomputed here ($WANT_SHA); its prompt named" || bad "  ...import row: $(q "SELECT raw_sha256, byte_length FROM research_imports WHERE id = '$IMP_PACK'")"
[ "$(q "SELECT count(*) FILTER (WHERE import_id = '$IMP_PACK' AND prompt_id = '$P_PACK') || '/' || count(*) FROM research_results WHERE parsed_at > now() - interval '1 hour' AND industry_id = '$IND'")" = "3/3" ] \
  && ok "  ...each of the 3 results names the import and the prompt" || bad "  ...results' import"
R_M1="$(q "SELECT id FROM research_results WHERE import_id = '$IMP_PACK' AND field_name = 'Acts M1 $TS'")"; R_M2="$(q "SELECT id FROM research_results WHERE import_id = '$IMP_PACK' AND field_name = 'Acts M2 $TS'")"; R_M3="$(q "SELECT id FROM research_results WHERE import_id = '$IMP_PACK' AND field_name = 'Acts M3 $TS'")"
expect POST "/api/research-results/$R_M1/accept" '{"review_note":"Verification: accepted as a fixture."}' 200 "accept M1 (steward)"
act_is "accept" "accept:research_results:industry_measures:true:POST /api/research-results/:id/accept"
expect POST "/api/research-results/$R_M2/reject" '{"review_note":"Verification: rejected as a fixture."}' 200 "reject M2"
act_is "reject" "reject:research_results:-:true:POST /api/research-results/:id/reject"
expect POST "/api/research-results/$R_M3/accept" '{"review_note":"Verification: accepted to be withdrawn."}' 200 "accept M3"
acts_new
M1="$(q "SELECT industry_measures_id FROM research_results WHERE id = '$R_M1'")"; M3="$(q "SELECT industry_measures_id FROM research_results WHERE id = '$R_M3'")"
expect POST "/api/industry-measures/$M3/retire" '{"retirement_reason":"Verification: withdrawn as a fixture."}' 200 "withdraw M3 (pack entry)"
act_is "withdraw" "withdraw:industry_measures:-:true:POST /api/industry-measures/:id/retire"
LEVB() { printf '{"name":"%s","mechanism":"Crews trained to recognise hazards stop unsafe tasks earlier.","leading_indicator":"Near-miss reports","citation":"Verification citation, not a source."}' "$1"; }
expect POST "/api/industry-measures/$M1/levers" "$(LEVB "Acts lever $TS")" 201 "ratify a lever on M1"
LEV="$(rj b.value_lever_id)"
act_is "ratify" "ratify:value_levers:-:true:POST /api/industry-measures/:id/levers"
expect POST "/api/value-levers/$LEV/offerings" '{"offering_key":"skillsoft_compliance_suite","basis":"Verification: this suite pulls this lever."}' 201 "link a solution"
LINK="$(rj b.lever_offering_id)"
act_is "link" "link:lever_offerings:-:true:POST /api/value-levers/:id/offerings"
expect POST "/api/lever-offerings/$LINK/retire" '{"retirement_reason":"Verification: link withdrawn as a fixture."}' 200 "withdraw the link"
act_is "withdraw (link)" "withdraw:lever_offerings:-:true:POST /api/lever-offerings/:id/retire"
expect POST "/api/industry-measures/$M1/levers" "$(LEVB "Acts lever two $TS")" 201 "ratify a second lever"
LEV2="$(rj b.value_lever_id)"; acts_new
expect POST "/api/value-levers/$LEV2/retire" '{"retirement_reason":"Verification: lever withdrawn as a fixture."}' 200 "withdraw the second lever"
act_is "withdraw (lever)" "withdraw:value_levers:-:true:POST /api/value-levers/:id/retire"
expect POST "/api/industries/$IND/exclusions" "{\"name\":\"Acts exclusion $TS\",\"reason\":\"Verification: excluded as a fixture.\"}" 201 "exclude a measure"
act_is "exclude" "exclude:industry_measure_exclusions:-:true:POST /api/industries/:industryId/exclusions"

step "7. Every act route records its act — the account, its research, its outcome"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Fixture Valley Electric Cooperative (invented) $TS\",\"industry_slug\":\"$SLUG\",\"classification_note\":\"Verification: classified for P2.\"},\"persons\":[{\"full_name\":\"Fixture owner (invented)\",\"email\":\"owner.$TS@acts.example\",\"title\":\"Owner\"},{\"full_name\":\"Fixture verifier (invented)\",\"email\":\"verifier.$TS@acts.example\",\"title\":\"EHS director\"}]}" 201 "the fixture account (create-only)"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; VERIFIER="$(rj b.person_ids[1])"
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Acts capability\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: attached for P2.\"}" 201 "an offering (create-only)"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$M1\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "  ...its claim on M1 (create-only)"
act_is "create-only routes write no act" ""
# Account research: entity, regime, then a fact.
envb() { printf '{"prompt_id":"%s","institution":"Fixture Valley","research_query":"q","query_as_executed":"qe","research_tool":"Verification tool","ai_sourced":true,%s}' "$1" "$2"; }
QH=',"quote":"Fixture Valley Electric Cooperative files annual reports on Form 10-K (fixture).","how_read":"The registrant name and CIK on the fixture cover page."'
ENT='{"legal_name":"Fixture Valley Electric Cooperative","identifier_type":"sec_cik","identifier":"0000888001","registry_jurisdiction":null,"source_kind":"public_filing","citation":"EDGAR company record (fixture, not a source)","caveats":[]'
REG='{"value":"public_filer","basis":"Files a 10-K.","as_of":"2024-09-30","source_kind":"public_filing","citation":"EDGAR filing index (fixture)","caveats":[]'
expect POST "/api/institutions/$INST/research-prompts" '{}' 201 "the entity-phase prompt"
PE="$(rj b.prompt_id)"
expect POST "/api/institutions/$INST/research-results" "$(envb "$PE" "\"entity\":$ENT$QH},\"disclosure_regime\":$REG$QH},\"not_found\":[]")" 201 "the entity and regime, pasted as text"
act_is "import (account)" "import:research_imports:-:true:POST /api/institutions/:institutionId/research-results"
RE="$(rj "b.results.find(r=>r.field_name==='entity').id")"; RG="$(rj "b.results.find(r=>r.field_name==='disclosure_regime').id")"
expect POST "/api/account-research-results/$RE/accept" '{"review_note":"Verification: the CIK matches.","citation_opened":true}' 200 "accept the entity"
act_is "accept (entity)" "accept:research_results:institution_entities:true:POST /api/account-research-results/:id/accept"
expect POST "/api/account-research-results/$RG/reject" '{"review_note":"Verification: rejected as a fixture."}' 200 "reject the regime"
act_is "reject (account)" "reject:research_results:-:true:POST /api/account-research-results/:id/reject"
expect POST "/api/institutions/$INST/research-prompts" '{}' 201 "the facts-phase prompt"
PF="$(rj b.prompt_id)"
ENTECHO='{"legal_name":"Fixture Valley Electric Cooperative","identifier_type":"sec_cik","identifier":"0000888001","registry_jurisdiction":null,"source_kind":"public_filing","citation":"x","caveats":[],"quote":"Verification fixture sentence naming it, not a source.","how_read":"Verification fixture: read from the fixture sentence as written."}'
HC='{"kind":"headcount","value":4200,"unit":"people","as_of":"2024-09-30","period":"as of 30 September 2024","source_kind":"public_filing","citation":"Form 10-K FY2024, Item 1 (fixture)","quote":"We had approximately 4,200 employees.","caveats":["Approximate."],"how_read":"Verification fixture: read from the fixture quote as written."}'
FACTS_TEXT="$(envb "$PF" "\"entity\":$ENTECHO,\"facts\":[$HC],\"not_found\":[]")"
expect POST "/api/institutions/$INST/research-results" "$FACTS_TEXT" 201 "a facts response, pasted as text"
IMP_F="$(rj b.import_id)"; RHC="$(rj "b.results.find(r=>r.field_name==='headcount').id")"; acts_new
expect POST "/api/account-research-results/$RHC/accept" '{"review_note":"Verification: matches Item 1.","citation_opened":true}' 200 "accept the headcount fact"
act_is "accept (fact)" "accept:research_results:institution_facts:true:POST /api/account-research-results/:id/accept"
F_HC="$(q "SELECT institution_fact_id FROM research_results WHERE id = '$RHC'")"
[ "$(q "SELECT (evidence_ids @> ARRAY[(SELECT evidence_id FROM research_results WHERE id = '$RHC')]) || '|' || reason FROM governance_acts WHERE subject_id = '$RHC' AND act = 'accept'")" = "true|Verification: matches Item 1." ] \
  && ok "  ...the accept act names the evidence written and carries the review note verbatim" || bad "  ...accept act detail"
# The outcome.
OUTB() { printf '{"engagement_name":"Acts engagement %s","engagement_owner_person_id":"%s","capability_name":"Acts capability","metric":{"name":"Acts TRIR %s","unit":"incidents per 200,000 hours.","direction":"decrease","source_system":"verification system of record","owner_person_id":"%s"},"baseline_value":1.4,"baseline_measured_at":"2025-09-30T00:00:00Z"}' "$1" "$OWNER" "$1" "$OWNER"; }
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTB one)" 201 "an outcome (create-only)"
O1="$(rj b.value_outcome_id)"; M_1="$(rj b.business_metric_id)"; ENG1="$(rj b.engagement_id)"
expect POST "/api/business-metrics/$M_1/pack-basis" "{\"industry_measure_id\":\"$M1\",\"basis_note\":\"Verification: the same rate.\"}" 201 "its pack basis (create-only)"
EVB() { printf '{"kind":"%s","provenance":"Fixture %s (not a source)","summary":"%s","supports":"%s","source_verified":%s,"ai_sourced":%s,%s"simulated":false,"evidence_form":"quote","quote_text":"Our total recordable incident rate was 1.4 in FY25.","how_read":"The FY25 TRIR, from the fixture report, read as published."}' "$1" "$2" "$3" "$4" "${5:-false}" "${6:-false}" "$([ "${6:-false}" = true ] && printf '"research_query":"TRIR FY25 (fixture)","research_tool":"Verification tool",')"; }
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB public_filing filing 'TRIR FY25 (fixture)' baseline true)" 201 "baseline evidence (create-only)"
EV1="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB public_filing 'AI search' 'TRIR FY25, AI-found (fixture)' baseline false true)" 201 "AI-sourced evidence (create-only)"
EV_AI="$(rj b.evidence_id)"
act_is "create-only routes write no act" ""
expect POST "/api/evidence/$EV_AI/open-citation" '{"source_verified":true}' 200 "open its citation"
act_is "open_citation" "open_citation:evidence:-:true:POST /api/evidence/:id/open-citation"
# P2 review (Brad): the standalone opening writes its own act; the row, as recorded.
echo "  ROW   $(q "SELECT 'act=' || act || ' subject=' || subject_table || '/' || subject_id || ' actor=' || (SELECT full_name FROM persons WHERE id = actor_person_id) || ' route=' || route || ' reason=' || coalesce(reason, 'NULL') || ' txid=' || txid || ' at=' || to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') FROM governance_acts WHERE subject_table = 'evidence' AND subject_id = '$EV_AI'")"
[ "$(q "SELECT count(*) || '|' || bool_and(subject_id = '$EV_AI' AND result_table IS NULL AND evidence_ids = '{}') FROM governance_acts WHERE act = 'open_citation'")" = "1|true" ] \
  && ok "  ...one open_citation act, its subject the evidence opened, standing on its own (no accept involved)" || bad "  ...open_citation acts: $(q "SELECT count(*) FROM governance_acts WHERE act = 'open_citation'")"
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB public_filing 'AI search two' 'TRIR FY25, AI-found again (fixture)' baseline false true)" 201 "a second AI-sourced item (create-only)"
EV_AI2="$(rj b.evidence_id)"; acts_new
sqlrefused "opening a citation outside an accept, by SQL with no act → refused at COMMIT" "UPDATE evidence SET citation_resolved = true, citation_resolved_by_person_id = '$S', citation_resolved_at = now() WHERE id = '$EV_AI2'" "a citation opened with no governance act recorded in this transaction"
[ "$(q "SELECT citation_resolved FROM evidence WHERE id = '$EV_AI2'")" = "f" ] && ok "  ...the citation stays unopened" || bad "  ...opened without an act"
expect POST "/api/institutions/$INST/hypotheses" "{\"value_outcome_id\":\"$O1\",\"value_lever_id\":\"$LEV\",\"statement\":\"Frontline hazard recognition reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"2027-09-30\",\"falsifier_conditions\":\"Same definition and denominator as the published baseline.\"}" 201 "a hypothesis (create-only)"
H1="$(rj b.value_hypothesis_id)"; acts_new
expect POST "/api/value-hypotheses/$H1/supersede" '{"statement":"Frontline hazard recognition reduces recordable injuries across the account.","falsifier_reference":"baseline","falsifier_due":"2027-09-30","falsifier_conditions":"Same definition and denominator as the published baseline.","supersession_reason":"Verification: restated as a fixture."}' 201 "restate the hypothesis"
H2="$(rj b.value_hypothesis_id)"
act_is "supersede (hypothesis)" "supersede:value_hypotheses:value_hypotheses:true:POST /api/value-hypotheses/:id/supersede"
expect POST "/api/value-hypotheses/$H2/withdraw" '{"retirement_reason":"Verification: withdrawn as a fixture."}' 200 "withdraw it"
act_is "withdraw (hypothesis)" "withdraw:value_hypotheses:-:true:POST /api/value-hypotheses/:id/withdraw"
# A current hypothesis, so the POV draws the outcome's figures (and their lineage links).
expect POST "/api/institutions/$INST/hypotheses" "{\"value_outcome_id\":\"$O1\",\"value_lever_id\":\"$LEV\",\"statement\":\"Hazard recognition training reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"2027-09-30\",\"falsifier_conditions\":\"Same definition and denominator as the published baseline.\"}" 201 "a current hypothesis (create-only)"
acts_new
expect POST "/api/engagements/$ENG1/produce-run" '{"banner_title":"ACTS CHECK","note":"Verification: a run sealing the fact.","source_fixture":"acts"}' 201 "a run (create-only)"
R0="$(rj b.value_run_id)"; act_is "produce-run writes no act" ""
expect POST "/api/value-runs/$R0/lock" '{"lock_reason":"Verification: sealed for lineage."}' 200 "lock it"
act_is "lock" "lock:value_runs:-:true:POST /api/value-runs/:runId/lock"
FQ='"evidence_kind":"public_filing","provenance":"Fixture 10-K FY2025 (not a source)","confidence":"medium","source_verified":false,"ai_sourced":false,"evidence_form":"quote","quote_text":"We employ about 4,300 people.","how_read":"Headcount from the fixture 10-K, Item 1, restated."'
expect POST "/api/institutions/$INST/facts/$F_HC/supersede" "{\"supersession_reason\":\"Verification: the headcount was restated.\",\"value_numeric\":4300,\"unit\":\"people\",\"as_of\":\"2024-09-30\",$FQ}" 201 "correct the headcount (supersede)"
F_HC2="$(rj b.fact_id)"
act_is "supersede (fact)" "supersede:institution_facts:institution_facts:true:POST /api/institutions/:institutionId/facts/:factId/supersede"
expect POST "/api/value-outcomes/$O1/evidence" '{"kind":"system_export","provenance":"Fixture extract (not a source)","summary":"TRIR extract (fixture)","supports":"actual","source_verified":false,"ai_sourced":false,"simulated":false,"evidence_form":"locator","locator":{"document":"Fixture safety extract (not a source)","table":"Monthly TRIR","row":"Sep 2026","column":"Plant total","value":1.1,"scale":"units"},"how_read":"The plant-total TRIR cell for September 2026, read as published."}' 201 "actual evidence (create-only)"
acts_new
expect POST "/api/value-outcomes/$O1/commit" "{\"target_value\":1.2,\"committed_by_person_id\":\"$OWNER\",\"committed_at\":\"2026-10-01T00:00:00Z\",\"commitment_note\":\"Verification: the owner commits to 1.2.\"}" 201 "commit"
act_is "commit" "commit:value_outcomes:-:true:POST /api/value-outcomes/:outcomeId/commit"
expect POST "/api/value-outcomes/$O1/measure" '{"actual_value":1.1,"actual_measured_at":"2026-10-12T12:00:00Z"}' 200 "measure"
act_is "measure" "measure:value_outcomes:-:true:POST /api/value-outcomes/:outcomeId/measure"
expect POST "/api/value-outcomes/$O1/verify" "{\"verified_by_person_id\":\"$VERIFIER\",\"verified_at\":\"2026-10-12T13:00:00Z\",\"attestation_note\":\"Verification: the customer confirmed the extract.\"}" 200 "verify"
act_is "verify" "verify:value_outcomes:-:true:POST /api/value-outcomes/:outcomeId/verify"
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTB two)" 201 "a second outcome, for the metric validation"
M_2="$(rj b.business_metric_id)"; acts_new
expect POST "/api/business-metrics/$M_2/validate" "{\"metric\":{\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"verification system of record\"},\"baseline_value\":2,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\",\"confirmed_by_person_id\":\"$OWNER\",\"supersession_reason\":\"Verification: the customer confirmed the calculation.\"}" 201 "validate the metric"
act_is "supersede (metric, and the outcome it carried)" "supersede:business_metrics:business_metrics:true:POST /api/business-metrics/:metricId/validate | supersede:value_outcomes:value_outcomes:true:POST /api/business-metrics/:metricId/validate"
# A third engagement: a run, a correction, an erratum, the retirement.
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTB three)" 201 "a third outcome"
O3="$(rj b.value_outcome_id)"; ENG3="$(rj b.engagement_id)"
expect POST "/api/value-outcomes/$O3/evidence" "$(EVB public_filing filing 'TRIR FY25 third (fixture)' baseline true)" 201 "  ...its verified baseline evidence"
EV3="$(rj b.evidence_id)"
expect POST "/api/engagements/$ENG3/produce-run" '{"note":"Verification: sealed before a correction.","source_fixture":"acts"}' 201 "  ...a run"
R3="$(rj b.value_run_id)"
expect POST "/api/value-runs/$R3/lock" '{"lock_reason":"Verification: sealed before a correction."}' 200 "  ...locked"
acts_new
expect POST "/api/value-outcomes/$O3/evidence/$EV3/correct-support" '{"supports":"impact_basis","reason":"Verification: this filing bases the impact, not the baseline."}' 201 "correct what the link supports"
act_is "correct" "correct:value_outcome_evidence:evidence:true:POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/correct-support"
expect POST "/api/value-runs/$R3/errata" "{\"evidence_id\":\"$EV3\",\"what_was_wrong\":\"The filing was sealed as support for the baseline.\",\"what_is_right\":\"It supports the impact basis only.\",\"reason\":\"Verification: an erratum as a fixture.\"}" 201 "record an erratum"
act_is "record_erratum" "record_erratum:run_errata:-:true:POST /api/value-runs/:runId/errata"
expect POST "/api/engagements/$ENG3/retire" '{"retirement_reason":"Verification: retired as a fixture."}' 200 "retire the engagement"
act_is "retire" "retire:engagements:-:true:POST /api/engagements/:id/retire"
MK() { printf '{"kind":"outside_in_test","source_citation":"Verification citation (not a source)","note":"%s"%s}' "$1" "${2:-}"; }
expect POST "/api/institutions/$INST/reference-example" "$(MK 'Verification: a marker as a fixture.')" 201 "mark a reference example"
MARK="$(rj b.reference_example_marker_id)"
act_is "mark" "mark:reference_example_markers:-:true:POST /api/institutions/:institutionId/reference-example"
expect POST "/api/reference-examples/$MARK/supersede" "$(MK 'Verification: the marker restated.' ',"supersession_reason":"Verification: corrected as a fixture."')" 201 "correct the marker"
MARK2="$(rj b.reference_example_marker_id)"
act_is "supersede (marker)" "supersede:reference_example_markers:reference_example_markers:true:POST /api/reference-examples/:id/supersede"
expect POST "/api/reference-examples/$MARK2/retire" '{"retirement_reason":"Verification: unmarked as a fixture."}' 200 "unmark"
act_is "withdraw (marker)" "withdraw:reference_example_markers:-:true:POST /api/reference-examples/:id/retire"
expect POST "/api/institutions/$INST/analyst-of-record" "{\"person_id\":\"$S\",\"title\":\"External analyst of record (verification)\"}" 201 "an analyst of record (create-only)"
APL="$(rj b.account_person_link_id)"; acts_new
expect POST "/api/account-person-links/$APL/retire" '{"retirement_reason":"Verification: the link withdrawn as a fixture."}' 200 "withdraw the analyst link"
act_is "withdraw (person link)" "withdraw:account_person_links:-:true:POST /api/account-person-links/:id/retire"
CORR() { printf '{"legal_name":"%s","identifier_type":"sec_cik","identifier":"%s","source_kind":"public_filing","citation":"EDGAR company record, CIK %s (fixture, not a source)","supersession_reason":"%s","evidence_form":"quote","quote_text":"Verification fixture sentence naming the entity, not a source.","how_read":"Verification fixture: read from the fixture sentence as written."}' "$1" "$2" "$2" "$3"; }
expect POST "/api/institutions/$INST/entity/supersede" "$(CORR 'Fixture Valley Electric Holdings' 0000888002 'Verification: the filer is the holding company.')" 201 "correct the entity"
act_is "supersede (entity)" "supersede:institution_entities:institution_entities:true:POST /api/institutions/:institutionId/entity/supersede"
[ "$(q "SELECT count(*) FROM governance_acts WHERE route ~ '[0-9a-f]{8}-' OR route LIKE '%?%'")" = "0" ] && ok "no act carries an id or a value in its route" || bad "an act route carries a value"
[ "$(q "SELECT count(DISTINCT route) FROM governance_acts")" = "29" ] && ok "29 distinct act routes exercised — every act route in ROUTE_ACTS" || bad "act routes exercised: $(q "SELECT count(DISTINCT route) FROM governance_acts")"

step "8. Lineage — a fixture chain made after P2"
LN() { q "SELECT string_agg(kind || ':' || source, ' > ' ORDER BY step) FROM lvrf_lineage('$1', '$2'${3:+, '$3'})"; }
[ "$(LN institution_facts "$F_HC")" = "prompt:record > import:act > result:record > accept:act > evidence:record > open_citation:act > figure_check:record > fact:record > superseded_by:act > seal:seal" ] \
  && ok "the researched fact: prompt > import (act) > result > accept (act) > evidence > citation opened (in the accept act) > figure check > fact > superseded (act) > run's seal" || bad "fact lineage: $(LN institution_facts "$F_HC")"
[ "$(LN institution_facts "$F_HC2")" = "origin:record > evidence:record > figure_check:record > fact:record > supersedes:act > seal:seal" ] && ok "its correction: recorded directly > evidence > figure check > fact > supersedes (act) > a later run's seal" || bad "successor lineage: $(LN institution_facts "$F_HC2")"
[ "$(q "SELECT actor || '|' || (at IS NOT NULL) FROM lvrf_lineage('institution_facts', '$F_HC') WHERE kind = 'accept'")" = "$S_NAME|true" ] && ok "  ...each step names who and when (the accept: $S_NAME)" || bad "  ...accept step who/when"
[ "$(LN evidence "$EV3")" = "evidence:record > figure_check:record > link:record > withdrawn:act > correct:act > seal:seal > erratum:act" ] \
  && ok "corrected evidence: evidence > figure check > link > withdrawn (act) > corrected link (act) > the run's seal (matched) > erratum" || bad "evidence lineage: $(LN evidence "$EV3")"
[ "$(q "SELECT detail->>'matched' FROM lvrf_lineage('evidence', '$EV3') WHERE kind = 'seal'")" = "matched by kind, summary and source; not sealed by id" ] \
  && ok "  ...the seal labelled \"matched by kind, summary and source; not sealed by id\" (P2-D7)" || bad "  ...seal label"
# P2 review (Brad): an outcome's baseline after a correction — the withdrawn link with name, date and
# reason; the correcting link; the run's seal noting the erratum recorded after it.
LB3="$(LN value_outcomes "$O3" baseline)"
[ "$LB3" = "baseline:record > evidence:record > figure_check:record > link:record > withdrawn:act > correct:act > seal:seal > erratum:act" ] \
  && ok "a corrected baseline: baseline > evidence > figure check > link > withdrawn (act) > corrected link (act) > the run's seal > erratum" || bad "corrected baseline: $LB3"
[ "$(q "SELECT (detail->>'current') || '|' || (detail->>'supports') FROM lvrf_lineage('value_outcomes', '$O3', 'baseline') WHERE kind = 'link'")|$(q "SELECT actor || '|' || (at::date = now()::date) || '|' || (detail->>'reason') FROM lvrf_lineage('value_outcomes', '$O3', 'baseline') WHERE kind = 'withdrawn'")" = "false|baseline|$S_NAME|true|Verification: this filing bases the impact, not the baseline." ] \
  && ok "  ...the withdrawn link: not current; withdrawn by $S_NAME, today, with the reason" || bad "  ...withdrawn step: $(q "SELECT detail FROM lvrf_lineage('value_outcomes', '$O3', 'baseline') WHERE kind = 'withdrawn'")"
[ "$(q "SELECT (detail->>'supports') || '|' || (detail->>'corrects_supports') || '|' || (detail->>'current') FROM lvrf_lineage('value_outcomes', '$O3', 'baseline') WHERE kind = 'correct'")" = "impact_basis|baseline|true" ] \
  && ok "  ...the impact-basis link as its correction, current" || bad "  ...correct step"
[ "$(q "SELECT jsonb_array_length(detail->'errata') || '|' || (detail->'errata'->0->>'recorded_by') FROM lvrf_lineage('value_outcomes', '$O3', 'baseline') WHERE kind = 'seal'")" = "1|$S_NAME" ] \
  && ok "  ...the run's seal notes the erratum recorded after it (by $S_NAME), beside the seal" || bad "  ...seal errata: $(q "SELECT detail->'errata' FROM lvrf_lineage('value_outcomes', '$O3', 'baseline') WHERE kind = 'seal'")"
[ "$(LN value_outcomes "$O1" actual | grep -c 'verify:act')" = "1" ] && ok "the outcome's actual: ... > verify (act)" || bad "actual lineage: $(LN value_outcomes "$O1" actual)"
expect GET "/api/lineage/institution_facts/$F_HC" "" 200 "GET the fact's lineage"
[ "$(rj "b.steps.length + '|' + b.steps[0].step + '|' + b.steps.map(s=>s.kind).includes('import')")" = "$(q "SELECT count(*) FROM lvrf_lineage('institution_facts', '$F_HC')")|1|true" ] && ok "  ...the numbered steps, as the function returns them" || bad "  ...$(head -c 300 "$W/r.json")"
expect GET "/api/lineage/value_outcomes/$O1" "" 400 "an outcome without a figure" "add ?figure=baseline or ?figure=actual"
expect GET "/api/lineage/persons/$S" "" 404 "a table lineage does not trace" "not for persons"

step "9. Lineage — the real record (P2-D1)"
SCOTTS="$(q "SELECT id FROM institutions WHERE name ILIKE 'Scotts%' LIMIT 1")"
F_REV="$(q "SELECT id FROM institution_facts WHERE institution_id = '$SCOTTS' AND kind = 'revenue' AND superseded_by_id IS NULL")"
[ "$(LN institution_facts "$F_REV")" = "prompt:record > import:record > result:record > accept:record > evidence:record > open_citation:record > fact:record > seal:seal > seal:seal" ] \
  && ok "Scotts' revenue: prompt > import > result > accept > evidence > citation > fact > runs 1 and 2 — every pre-P2 step 'record'" || bad "Scotts revenue: $(LN institution_facts "$F_REV")"
[ "$(q "SELECT detail->>'note' FROM lvrf_lineage('institution_facts', '$F_REV') WHERE kind = 'import'")" = "no import (before research imports, 25 Oct 2026)" ] \
  && ok "  ...the import step stated, not skipped: \"no import (before research imports, 25 Oct 2026)\"" || bad "  ...import note"
[ "$(q "SELECT detail->>'note' FROM lvrf_lineage('institution_facts', '$F_REV') WHERE kind = 'accept'")" = "recorded before governance acts (25 Oct 2026)" ] \
  && ok "  ...the accept from the record, labelled \"recorded before governance acts (25 Oct 2026)\" — no act invented (P2-D2)" || bad "  ...accept label"
O_S="$(q "SELECT payload->>'valueOutcomeId' FROM value_runs r JOIN engagements g ON g.id = r.engagement_id WHERE g.institution_id = '$SCOTTS' AND r.run_number = 2")"
LB="$(LN value_outcomes "$O_S" baseline)"
printf '%s' "$LB" | grep -qE '^baseline:record > evidence:record' && ! printf '%s' "$LB" | grep -qE 'prompt|import|result' && [ "$(printf '%s' "$LB" | grep -o 'seal:seal' | wc -l | tr -d ' ')" = "2" ] \
  && ok "Scotts' TRIR baseline: recorded directly as outcome evidence — no research step; its two evidence rows and links; runs 1 and 2" || bad "Scotts baseline: $LB"
CURIA="$(q "SELECT id FROM institutions WHERE name ILIKE 'Curia%' LIMIT 1")"
# Curia has no facts on record; its outcome's baseline and one of its evidence rows trace.
O_C="$(q "SELECT id FROM value_outcomes WHERE institution_id = '$CURIA' AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
EV_C="$(q "SELECT evidence_id FROM value_outcome_evidence WHERE value_outcome_id = '$O_C' AND withdrawn_at IS NULL ORDER BY evidence_id LIMIT 1")"
N_OC="$(q "SELECT count(*) FROM lvrf_lineage('value_outcomes', '$O_C', 'baseline')")"; N_EC="$(q "SELECT count(*) FROM lvrf_lineage('evidence', '$EV_C')")"
[ -n "$O_C" ] && [ -n "$EV_C" ] && [ "$N_OC" -ge 2 ] && [ "$N_EC" -ge 2 ] \
  && ok "Curia (no facts on record): its outcome's baseline ($N_OC steps) and an evidence row ($N_EC steps) trace: $(LN evidence "$EV_C")" || bad "Curia lineage: outcome $N_OC, evidence $N_EC"
echo "  (The prod copy predates C1's acts on prod; Gate C reads Scotts' vendor link, its correction and errata from the real record.)"

step "10. The display: the lineage page at 1280 and 390, and in print; the links"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "signed in by session" || { bad "no session"; exit 1; }
node scripts/lib/lineage_walk.mjs "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" "$F_HC" "$O_S" "$INST" "$R0" "$O3" > "$W/walk.log" 2>&1; rc=$?
PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.log" || true)))
grep -E '^  (PASS|FAIL)' "$W/walk.log" || true
[ "$rc" = "0" ] || bad "the lineage walk exited $rc (see $W/walk.log)"
if [ -f "$SHOTS/p2_lineage_fact.pdf" ]; then
  PT="$(pdftotext "$SHOTS/p2_lineage_fact.pdf" - 2>/dev/null | tr '\n' ' ' | tr -s ' ')"
  printf '%s' "$PT" | grep -qF "Research import" && printf '%s' "$PT" | grep -qF "recorded as an act" && printf '%s' "$PT" | grep -qF "Lineage of institution_facts" \
    && ok "in print: the steps, their sources and the footer print" || bad "print: $(printf '%s' "$PT" | head -c 200)"
else bad "no PDF printed"; fi
CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' "$BASE/api/lineage/institution_facts/$F_HC")"
[ "$CODE" = "401" ] && ok "signed out: GET lineage -> 401" || bad "signed out: $CODE"

step "11. Deliberate breaks"
RP="$(q "SELECT id FROM research_results WHERE import_id = '$IMP_F' AND review_state = 'pending' LIMIT 1")"
if [ -z "$RP" ]; then
  expect POST "/api/institutions/$INST/research-prompts" '{}' 201 "(a facts prompt for the breaks)"
  PB="$(rj b.prompt_id)"
  expect POST "/api/institutions/$INST/research-results" "$(envb "$PB" "\"entity\":$(printf '%s' "$ENTECHO" | sed 's/Fixture Valley Electric Cooperative/Fixture Valley Electric Holdings/; s/0000888001/0000888002/'),\"facts\":[$HC],\"not_found\":[]")" 201 "(a pending result for the breaks)"
  RP="$(rj "b.results[0].id")"; PB_IMP="$(rj b.import_id)"
fi
sqlrefused "B1: a review with no act, at COMMIT" "UPDATE research_results SET review_state = 'rejected', reviewed_by_person_id = '$S', review_note = 'Verification: B1.' WHERE id = '$RP'" "a review (rejected) with no governance act recorded in this transaction"
sqlrefused "B2: a tampered import (the hash is not the text's)" "INSERT INTO research_imports (tenant_id, prompt_id, raw_text, raw_sha256, byte_length, imported_by_person_id) VALUES ('$TEN', '$PF', '{\"a\":1}', encode(sha256('{\"a\":2}'::bytea), 'hex'), 7, '$S')" "research_imports_sha256_is_the_text"
sqlrefused "B3: an import edited after insert" "UPDATE research_imports SET raw_text = '{\"edited\":true}' WHERE id = '$IMP_PACK'" "is final"
sqlrefused "B4: an act recorded for another person than the actor" "INSERT INTO governance_acts (tenant_id, act, subject_table, subject_id, actor_person_id, route) VALUES ('$TEN', 'reject', 'research_results', '$RP', '$X', 'POST /api/account-research-results/:id/reject')" "is not the actor of this request"
sqlrefused "B5: an UPDATE of an act" "UPDATE governance_acts SET reason = 'Verification: rewritten.' WHERE subject_id = '$RHC'" "is final"
sqlrefused "B5: a DELETE of an act" "DELETE FROM governance_acts WHERE subject_id = '$RHC'" "cannot be deleted"
printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\nINSERT INTO governance_acts (tenant_id, act, subject_table, subject_id, actor_person_id, route) VALUES ('%s', 'reject', 'research_results', '%s', '%s', 'POST /api/account-research-results/:id/reject');\nCOMMIT;\n" "$S" "$TEN" "$RP" "$S" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" > /dev/null 2>&1
sqlrefused "B6: an act committed in an earlier transaction does not cover this one" "UPDATE research_results SET review_state = 'rejected', reviewed_by_person_id = '$S', review_note = 'Verification: B6.' WHERE id = '$RP'" "with no governance act recorded in this transaction"
sqlrefused "B7: a result parsed after the cutover with no import" "INSERT INTO research_results (tenant_id, result_kind, institution_id, field_name, found, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version) SELECT tenant_id, result_kind, institution_id, field_name, found, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version FROM research_results WHERE id = '$RHC'" "research_results_import_after_cutover"
sqlrefused "B8: a result naming another prompt's import" "INSERT INTO research_results (tenant_id, result_kind, institution_id, field_name, found, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version, import_id) SELECT tenant_id, result_kind, institution_id, field_name, found, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version, '$IMP_PACK' FROM research_results WHERE id = '$RHC'" "answered another prompt"
# B9 — the helper call removed from the account accept route: the change is refused at COMMIT, in words.
python3 - "$ACCT" <<'PY'
import re, sys; p = sys.argv[1]; s = open(p).read()
m = re.search(r"      await recordAct\(client, req, 'POST /api/account-research-results/:id/accept', \{.*?\n      \}\);\n", s, re.S)
assert m; open(p, 'w').write(s.replace(m.group(0), ''))
PY
stop_server; start_server
expect POST "/api/account-research-results/$RP/accept" '{"review_note":"Verification: B9.","citation_opened":true}' 500 "B9: accept without its act → refused at COMMIT" "with no governance act recorded in this transaction"
sleep 0.5
JL="$(grep 'LVRF: COMMIT failed' "$W/server.log" || true)"
[ "$JL" = "LVRF: COMMIT failed; the write was not saved. POST /api/account-research-results/:id/accept · sqlstate 23514 · rule governance_act_present" ] \
  && ok "  ...the journal logs it as an error, with no values: \"$JL\"" || bad "  ...journal line: $JL"
! grep -qE '[0-9a-f]{8}-[0-9a-f]{4}-' "$W/server.log" && ! grep -qF 'Verification: B9' "$W/server.log" \
  && ok "  ...no id and no body text anywhere in the server's log" || bad "  ...a value in the log: $(grep -oE '.{40}[0-9a-f]{8}-[0-9a-f]{4}-.{20}' "$W/server.log" | head -2)"
[ "$(q "SELECT review_state FROM research_results WHERE id = '$RP'")" = "pending" ] && ok "  ...nothing written: the result still pending" || bad "  ...B9 wrote"
restore "$ACCT"
# B12 (P2 review) — the open-citation route's own act removed: the opening is refused at COMMIT.
python3 - "$CITE" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read()
a = "      await recordAct(client, req, 'POST /api/evidence/:id/open-citation', { act: 'open_citation', tenantId: e.tenant_id, subjectTable: 'evidence', subjectId: id });\n"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, ''))
PY
stop_server; start_server
expect POST "/api/evidence/$EV_AI2/open-citation" '{"source_verified":true}' 500 "B12: the standalone opening without its act → refused at COMMIT" "a citation opened with no governance act recorded in this transaction"
[ "$(q "SELECT citation_resolved FROM evidence WHERE id = '$EV_AI2'")|$(q "SELECT count(*) FROM governance_acts WHERE subject_id = '$EV_AI2'")" = "f|0" ] && ok "  ...nothing written: unopened, no act" || bad "  ...B12 wrote"
restore "$CITE"; stop_server; start_server
expect POST "/api/evidence/$EV_AI2/open-citation" '{"source_verified":true}' 200 "  ...restored: the opening goes through with its act"
[ "$(q "SELECT count(*) FROM governance_acts WHERE subject_id = '$EV_AI2' AND act = 'open_citation'")" = "1" ] && ok "  ...one open_citation act for it" || bad "  ...no act after restore"
# B10 — the lineage's supersession steps removed (on the clone).
python3 - "$W/b10.sql" <<'PY'
import re, sys
s = open('db/hardening.sql').read()
fn = re.search(r"CREATE OR REPLACE FUNCTION lvrf_lineage_supersession\(.*?\nEND \$\$;\n", s, re.S).group(0)
a = "BEGIN\n  EXECUTE format('SELECT x.id FROM public.%I x WHERE x.superseded_by_id = $1', p_table) INTO pred USING p_id;"
assert fn.count(a) == 1
open(sys.argv[1], 'w').write(fn.replace(a, "BEGIN\n  RETURN;\n  EXECUTE format('SELECT x.id FROM public.%I x WHERE x.superseded_by_id = $1', p_table) INTO pred USING p_id;"))
PY
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/b10.sql" > /dev/null
[ "$(LN institution_facts "$F_HC")" = "prompt:record > import:act > result:record > accept:act > evidence:record > open_citation:act > figure_check:record > fact:record > seal:seal" ] \
  && ok "B10: caught — without the supersession steps the chain loses \"superseded_by\"; the script names the missing step" || bad "B10: not caught: $(LN institution_facts "$F_HC")"
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && [ "$(trig)" = "176" ] && printf '%s' "$(LN institution_facts "$F_HC")" | grep -qF "superseded_by:act" \
  && ok "  ...hardening.sql re-applied: the step back, 176 triggers" || bad "  ...B10 restore"
# B13 (P2 review) — the errata note on a seal step removed (on the clone).
python3 - "$W/b13.sql" <<'PY'
import re, sys
s = open('db/hardening.sql').read()
fn = re.search(r"CREATE OR REPLACE FUNCTION lvrf_lineage_run_errata\(.*?\n\$\$;\n", s, re.S).group(0)
a = "WHERE x.value_run_id = p_run"
assert fn.count(a) == 1
open(sys.argv[1], 'w').write(fn.replace(a, "WHERE false AND x.value_run_id = p_run"))
PY
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/b13.sql" > /dev/null
[ "$(q "SELECT jsonb_array_length(detail->'errata') FROM lvrf_lineage('value_outcomes', '$O3', 'baseline') WHERE kind = 'seal'")" = "0" ] \
  && ok "B13: caught — without the errata note the seal step reads as if nothing were recorded after it" || bad "B13: not caught"
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && [ "$(trig)" = "176" ] && [ "$(q "SELECT jsonb_array_length(detail->'errata') FROM lvrf_lineage('value_outcomes', '$O3', 'baseline') WHERE kind = 'seal'")" = "1" ] \
  && ok "  ...hardening.sql re-applied: the erratum back on the seal, 176 triggers" || bad "  ...B13 restore"
# B11 — a paste over 512 KB; and a parser refusal recorded by hash and size, never text.
BIG="$(node -e "process.stdout.write(JSON.stringify({prompt_id:'$PF', pad:'x'.repeat(530000)}))")"
REF0="$(q "SELECT count(*) FROM refusals")"
expect POST "/api/institutions/$INST/research-results" "$BIG" 422 "B11: a paste of $(printf '%s' "$BIG" | wc -c | tr -d ' ') bytes" "at most 524,288 are taken"
expect POST "/api/institutions/$INST/research-results" '{"prompt_id": oops not json' 422 "a paste that is not JSON" "is not JSON"
[ "$(q "SELECT count(*) FROM refusals WHERE source = 'parser' AND refused_at > now() - interval '5 minutes' AND attempted_payload ? 'raw_sha256' AND attempted_payload ? 'byte_length' AND NOT attempted_payload ? 'raw_text' AND octet_length(attempted_payload::text) < 400")" -ge 2 ] \
  && [ "$(q "SELECT count(*) FROM refusals")" -ge "$((REF0 + 2))" ] \
  && ok "  ...both recorded in refusals (source parser) with the paste's SHA-256 and byte length, never its text (D5)" || bad "  ...parser refusals: $(q "SELECT attempted_payload::text FROM refusals WHERE source = 'parser' ORDER BY refused_at DESC LIMIT 2" | head -c 300)"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
HASH1="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
printf '%s' "$HASH1" | grep -qE "recompute matches ([0-9]+), differs 0; embedded payloadHash matches \1, differs 0" && ok "check_run_hashes after every act: $HASH1 (before: $HASH0)" || bad "hashes: $HASH1"
echo "  screenshots and the PDF: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
