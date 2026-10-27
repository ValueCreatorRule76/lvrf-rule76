#!/usr/bin/env bash
#
# P1 — the evidence form and the figure check (LVRF_PLAN §8; migration 0039;
# hardening.sql section 25; P1-D1–D6; Brad's rulings on the plan's two gaps,
# 24 Oct 2026). Local verification.
#
#   ./scripts/verify_evidence_form.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data
# neutralised) to `lvrf_verifyform` with make_clone, migrated (through 0039)
# and hardened, dropped on exit. Fixtures are invented ("Form check account
# (fixture)"); everything is written through the routes except the attempts the
# database must refuse and one v1 research result (research_prompts and
# research_results are written by script only on throwaway clones; CLAUDE.md).
# The POV is checked in a browser signed in by SESSION at 1280 and 390 and in
# print. DELIBERATE BREAKS: B1–B7 and B10 are refused writes; B8 and B9 edit
# server/lib/figureCheck.ts in place and restore it byte-identical.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
. scripts/lib/acts.sh
. scripts/lib/raw_text.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
command -v pdftotext > /dev/null || { echo "REFUSING: pdftotext (poppler) not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyform
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3099; VITE_PORT=5199; CDP_PORT=9359
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_form.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
FC=server/lib/figureCheck.ts
cp "$FC" "$W/figureCheck.ts.orig"
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
  cmp -s "$W/figureCheck.ts.orig" "$FC" || { cp "$W/figureCheck.ts.orig" "$FC"; echo "  (EXIT trap restored $FC)"; }
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
# A write the database must refuse: run in a transaction that is rolled back; print the error text.
sqlrefused() {  # LABEL SQL EXPECTED_SUBSTRING
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
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
form() { q "SELECT evidence_form FROM evidence WHERE id = '$1'"; }

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc.log")"
(cd client && npx tsc -b) > "$W/tsc2.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc2.log")"

step "2. Clone the prod copy; migrate through 0039; harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
PRE="$(q "SELECT count(*) FROM evidence")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (0039_evidence_form)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
TRIG="$(q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal")"
# The clone is migrated and hardened with this checkout's files: 141 since C1 (section 26's six).
[ "$TRIG" = "176" ] && ok "176 triggers by pg_trigger (C3 section 28: +9; 129 + section 25's six + 26's six + 27's twenty-six)" || bad "triggers: $TRIG"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none" && ok "drift: none after 0039 ($DRIFT)" || bad "drift: $DRIFT"

step "3. Every evidence row from before 0039 reads legacy; none blank"
[ "$(q "SELECT count(*) || '|' || count(*) FILTER (WHERE evidence_form = 'legacy') || '|' || count(*) FILTER (WHERE evidence_form IS NULL) FROM evidence")" = "$PRE|$PRE|0" ] \
  && ok "all $PRE pre-0039 evidence rows read legacy; none is blank" || bad "legacy: $(q "SELECT evidence_form, count(*) FROM evidence GROUP BY 1")"
[ "$(q "SELECT count(*) FROM evidence WHERE evidence_form = 'legacy' AND (quote_text IS NOT NULL OR locator IS NOT NULL OR how_read IS NOT NULL)")" = "0" ] \
  && ok "  ...a legacy row has no quote, locator or how-read (nothing guessed for it: P1-D6)" || bad "  ...legacy rows carry a form's fields"

step "4. Fixtures and the server"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
IND="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
E="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$IND', 'Form check TRIR (fixture)', 'incidents per 200,000 hours', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders: plant mix.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
[ -n "$E" ] && ok "steward signed in by fixture credential; a fixture pack entry" || { bad "fixtures"; exit 1; }
start_server && ok "API up on $PORT"
SINCE="$(q "SELECT now()")"

step "5. The eight writers, each with its form"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Form check account (fixture) $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for P1.\"},\"persons\":[{\"full_name\":\"Fixture owner (invented)\",\"email\":\"owner.$TS@form.example\",\"title\":\"Owner\"},{\"full_name\":\"Fixture verifier (invented)\",\"email\":\"verifier.$TS@form.example\",\"title\":\"EHS director\"}]}" 201 "an account, classified, with two customer-side persons"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; VERIFIER="$(rj b.person_ids[1])"
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Form safety capability\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "an offering attached"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "  ...its claim"
OUTB() { printf '{"engagement_name":"Form engagement %s","engagement_owner_person_id":"%s","capability_name":"Form safety capability","metric":{"name":"Form TRIR %s","unit":"incidents per 200,000 hours.","direction":"decrease","source_system":"verification system of record","owner_person_id":"%s"},"baseline_value":%s,"baseline_measured_at":"2025-09-30T00:00:00Z"}' "$1" "$OWNER" "$1" "$OWNER" "$2"; }
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTB one 1.4)" 201 "an outcome, baseline 1.4"
O1="$(rj b.value_outcome_id)"; M1="$(rj b.business_metric_id)"; ENG1="$(rj b.engagement_id)"
expect POST "/api/business-metrics/$M1/pack-basis" "{\"industry_measure_id\":\"$E\",\"basis_note\":\"Verification: the same rate.\"}" 201 "  ...its pack basis"
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTB two 2)" 201 "a second outcome (for the metric validation)"
M2="$(rj b.business_metric_id)"
expect POST "/api/business-metrics/$M2/validate" "{\"metric\":{\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"verification system of record\"},\"baseline_value\":2,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\",\"confirmed_by_person_id\":\"$OWNER\",\"supersession_reason\":\"Verification: the customer confirmed the calculation.\"}" 201 "  ...its metric validated"
Q='"evidence_form":"quote","quote_text":"Our total recordable incident rate was 1.42 in FY25.","how_read":"The FY25 TRIR, from the safety section of the fixture report."'
EVB() { printf '{"kind":"%s","provenance":"Fixture CR disclosures, page 21 (not a source)","summary":"%s","supports":"%s","source_verified":false,"ai_sourced":false,"simulated":false,%s}' "$1" "$2" "$3" "$4"; }
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB public_filing 'TRIR FY25 (fixture)' baseline "$Q")" 201 "outcome evidence resting on a quote"
EV_Q="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB observation 'The plant manager said TRIR was 1.4 (fixture)' baseline '"evidence_form":"statement"')" 201 "outcome evidence that is a person's statement (an observation citing no source)"
EV_S="$(rj b.evidence_id)"
LOC='"evidence_form":"locator","locator":{"document":"Fixture safety extract (not a source)","table":"Monthly TRIR","row":"Sep 2026","column":"Plant total","value":1.1,"scale":"units"},"how_read":"The plant-total TRIR cell for September 2026, read as published."'
expect POST "/api/value-outcomes/$O1/evidence" "$(EVB system_export 'TRIR extract (fixture)' actual "$LOC")" 201 "outcome evidence resting on a locator (the actual)"
EV_L="$(rj b.evidence_id)"
# A hypothesis on the outcome, so the POV draws its figures (the value chain).
expect POST "/api/industry-measures/$E/levers" '{"name":"Form hazard recognition (fixture)","mechanism":"Crews trained to recognise hazards stop unsafe tasks earlier.","leading_indicator":"Near-miss reports","citation":"Verification citation, not a source."}' 201 "a lever on the entry (steward)"
LEV="$(rj b.value_lever_id)"
expect POST "/api/institutions/$INST/hypotheses" "{\"value_outcome_id\":\"$O1\",\"value_lever_id\":\"$LEV\",\"statement\":\"Frontline hazard recognition reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"2027-09-30\",\"falsifier_conditions\":\"Same definition and denominator as the published baseline.\"}" 201 "a hypothesis on the outcome"
expect POST "/api/value-outcomes/$O1/commit" "{\"target_value\":1.2,\"committed_by_person_id\":\"$OWNER\",\"committed_at\":\"2026-10-01T00:00:00Z\",\"commitment_note\":\"Verification: the owner commits to 1.2.\"}" 201 "the target committed"
expect POST "/api/value-outcomes/$O1/measure" '{"actual_value":1.1,"actual_measured_at":"2026-10-12T12:00:00Z"}' 200 "the actual measured"
expect POST "/api/value-outcomes/$O1/verify" "{\"verified_by_person_id\":\"$VERIFIER\",\"verified_at\":\"2026-10-12T13:00:00Z\",\"attestation_note\":\"Verification: the customer confirmed the extract.\"}" 200 "the actual verified"
FQ() { printf '"evidence_kind":"public_filing","provenance":"Fixture 10-K FY2025 (not a source)","confidence":"medium","source_verified":false,"ai_sourced":false,"evidence_form":"quote","quote_text":"%s","how_read":"%s"' "$1" "$2"; }
expect POST "/api/institutions/$INST/facts" "{\"kind\":\"revenue\",\"value_numeric\":3413100000,\"unit\":\"USD\",\"as_of\":\"2025-09-30\",$(FQ 'Net sales were $3,413.1 million for fiscal 2025.' 'Net sales for fiscal 2025, income statement, in millions.')}" 201 "a typed fact resting on a quote (revenue)"
F_REV="$(rj b.fact_id)"
expect POST "/api/institutions/$INST/facts" "{\"kind\":\"stated_priority\",\"value_text\":\"Train approximately 5,200 associates\",\"as_of\":\"2025-09-30\",$(FQ 'We will train 5,200 associates this year.' 'The training commitment in the fixture CEO letter.')}" 201 "a text fact with a qualifier the quote lacks"
F_PRI="$(rj b.fact_id)"
FL='"evidence_kind":"public_filing","provenance":"Fixture 10-K FY2025 (not a source)","confidence":"medium","source_verified":false,"ai_sourced":false,"evidence_form":"locator","locator":{"document":"Fixture 10-K FY2025","table":"Consolidated statements of operations","row":"Net sales","column":"2025","value":3413.1,"scale":"millions"},"how_read":"Net sales for 2025 from the income statement, stated in millions."'
expect POST "/api/institutions/$INST/facts" "{\"kind\":\"headcount\",\"value_numeric\":5200,\"unit\":\"people\",\"as_of\":\"2025-09-30\",$(FQ 'We employ about 5,200 people.' 'Headcount from the fixture 10-K, Item 1.')}" 201 "a headcount fact resting on a quote"
F_HC="$(rj b.fact_id)"
expect POST "/api/engagements/$ENG1/produce-run" '{"banner_title":"FORM CHECK","note":"Verification: a run sealed after 0039.","source_fixture":"form_check"}' 201 "a run produced after 0039"
RUN="$(rj b.value_run_id)"
expect POST "/api/value-runs/$RUN/lock" '{"lock_reason":"Verification: sealed with forms."}' 200 "  ...locked"
expect POST "/api/engagements/$ENG1/retire" '{"retirement_reason":"Verification: a fixture engagement, its run locked."}' 200 "the engagement retired"
# Every evidence row written since the server started: by writer, with its form.
WROTE="$(q "SELECT string_agg(w || ':' || f, ' ' ORDER BY w) FROM (SELECT CASE
     WHEN provenance LIKE 'Asserted at industry classification%' THEN 'classify'
     WHEN provenance LIKE 'Asserted at offering attachment%' THEN 'offering'
     WHEN provenance LIKE 'Asserted at pack basis%' THEN 'pack_basis'
     WHEN provenance LIKE 'Asserted at metric validation%' THEN 'validate'
     WHEN provenance LIKE 'Asserted at engagement retirement%' THEN 'retire'
     WHEN provenance LIKE 'Attested at value outcome commitment%' THEN 'commit'
     WHEN provenance LIKE 'Attested at value outcome verification%' THEN 'verify'
     WHEN id IN (SELECT evidence_id FROM institution_facts) THEN 'fact_writer'
     ELSE 'outcome_evidence' END AS w, string_agg(DISTINCT evidence_form::text, '+') AS f
   FROM evidence WHERE created_at >= '$SINCE' AND institution_id = '$INST' GROUP BY 1) x")"
[ "$WROTE" = "classify:statement commit:statement fact_writer:quote offering:statement outcome_evidence:locator+quote+statement pack_basis:statement retire:statement validate:statement verify:statement" ] \
  && ok "each writer wrote its form: the six act sites (classify, offering, pack basis, validate, commit, verify) and retirement a statement; the fact writer a quote; outcome evidence a quote, a locator and a statement" || bad "writers: $WROTE"
[ "$(q "SELECT count(*) FROM evidence WHERE created_at >= '$SINCE' AND evidence_form = 'legacy'")" = "0" ] && ok "  ...no row written since reads legacy" || bad "  ...a new legacy row"
[ "$(q "SELECT count(*) FROM evidence WHERE created_at >= '$SINCE' AND evidence_form = 'statement' AND NOT (kind = 'attestation' OR (kind = 'observation' AND source_reference IS NULL))")" = "0" ] \
  && ok "  ...every statement is an attestation, or an observation citing no source (Brad's condition 1)" || bad "  ...a statement of another kind"
[ "$(q "SELECT confidence FROM evidence WHERE id = '$EV_Q'")" = "medium" ] && ok "Q10: outcome evidence's confidence is not read from the body; written medium" || bad "Q10: $(q "SELECT confidence FROM evidence WHERE id = '$EV_Q'")"

step "6. Research: contract v2 carries its own quote and how-read; a v1 result needs the reviewer's (P1-D5)"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Form research account (fixture) $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for research.\"}}" 201 "a second account, for research"
INST_R="$(rj b.institution_id)"
expect POST "/api/institutions/$INST_R/research-prompts" '{}' 201 "the entity-phase prompt (contract v2)"
P1="$(rj b.prompt_id)"; rj b.prompt > "$W/p1.txt"
grep -qF 'institution_fact contract v2 · template v2' "$W/p1.txt" && grep -qF 'how_read' "$W/p1.txt" && ok "  ...the prompt names contract v2 and asks for a quote and how_read" || bad "  ...prompt text"
envb() { printf '{"prompt_id":"%s","institution":"Form research","research_query":"q","query_as_executed":"qe","research_tool":"Verification tool","ai_sourced":true,%s}' "$1" "$2"; }
ENT='{"legal_name":"Form Fixture Filer Inc.","identifier_type":"sec_cik","identifier":"0000999001","registry_jurisdiction":null,"source_kind":"public_filing","citation":"EDGAR company record (fixture, not a source)","caveats":[]'
REG='{"value":"public_filer","basis":"Files a 10-K.","as_of":"2024-09-30","source_kind":"public_filing","citation":"EDGAR filing index (fixture)","caveats":[]'
QH=',"quote":"Form Fixture Filer Inc. (CIK 0000999001) files annual reports on Form 10-K.","how_read":"The registrant name and CIK on the fixture cover page."'
expect POST "/api/institutions/$INST_R/research-results" "$(envb "$P1" "\"entity\":$ENT},\"disclosure_regime\":$REG$QH},\"not_found\":[]")" 422 "a v2 entity with no quote or how-read: refused at parse" "entity.quote"
expect POST "/api/institutions/$INST_R/research-results" "$(envb "$P1" "\"entity\":$ENT$QH},\"disclosure_regime\":$REG$QH},\"not_found\":[]")" 201 "a v2 entity and regime, each with a quote and how-read"
RE="$(rj "b.results.find(r=>r.field_name==='entity').id")"; RG="$(rj "b.results.find(r=>r.field_name==='disclosure_regime').id")"
expect POST "/api/account-research-results/$RE/accept" '{"review_note":"Verification: the CIK matches.","citation_opened":true}' 200 "accept the v2 entity"
EV_E="$(rj b.evidence_id)"
[ "$(q "SELECT evidence_form || '|' || quote_text || '|' || how_read FROM evidence WHERE id = '$EV_E'")" = "quote|Form Fixture Filer Inc. (CIK 0000999001) files annual reports on Form 10-K.|The registrant name and CIK on the fixture cover page." ] \
  && ok "  ...its evidence rests on the result's own quote and how-read" || bad "  ...$(q "SELECT evidence_form || '|' || coalesce(quote_text,'') FROM evidence WHERE id = '$EV_E'")"
expect POST "/api/account-research-results/$RG/accept" '{"review_note":"Verification: files a 10-K.","citation_opened":true}' 200 "accept the v2 regime"
# A v1 fact result, as one parsed before 0039 would be stored (a v1 prompt; written on this clone only).
PE="$(q "SELECT id FROM institution_entities WHERE institution_id = '$INST_R' AND superseded_by_id IS NULL")"
P_V1="$(q "INSERT INTO research_prompts (tenant_id, institution_id, phase, entity_id, result_kind, contract_version, template_version, prompt_text, prompt_sha256, generated_by_person_id)
  VALUES ('$TEN', '$INST_R', 'facts', '$PE', 'institution_fact', 1, 1, 'v1 prompt (fixture)', encode(sha256(convert_to('v1 prompt (fixture)', 'UTF8')), 'hex'), '$S') RETURNING id" | head -1)"
# P2: a result written by SQL after the cutover names its import (with its own act; scripts/lib/acts.sh).
V1_RAW='{"subject":"fact","ai_sourced":true,"item":{"kind":"revenue","value":4321500000,"unit":"USD","as_of":"2024-09-30","period":"FY2024","source_kind":"public_filing","citation":"Fixture 10-K FY2024, Item 8","quote":"Net sales were $4,321.5 million.","caveats":[]}}'
IMP_V1="$(newid)"; R_V1="$(newid)"
q "$(import_sql "$IMP_V1" "$P_V1" "$S" "$V1_RAW"); INSERT INTO research_results (id, tenant_id, result_kind, institution_id, field_name, found, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version, import_id)
  VALUES ('$R_V1', '$TEN', 'institution_fact', '$INST_R', 'revenue', true, '$V1_RAW', 'q', 'qe', 'Verification tool', '$S', '$P_V1', 1, '$IMP_V1')" > /dev/null || R_V1=""
[ -n "$R_V1" ] && ok "a v1 fact result (quote, no how-read), as parsed before 0039" || bad "v1 fixture"
expect POST "/api/account-research-results/$R_V1/accept" '{"review_note":"Verification: matches Item 8.","citation_opened":true}' 422 "accept the v1 fact without how-read: refused, in words" "which carried no how-read"
expect POST "/api/account-research-results/$R_V1/accept" '{"review_note":"Verification: matches Item 8.","citation_opened":true,"how_read":"Net sales for FY2024 from Item 8, stated in millions."}' 200 "accept it with the reviewer's how-read (P1-D5)"
EV_V1="$(rj b.evidence_id)"
[ "$(q "SELECT evidence_form || '|' || quote_text || '|' || how_read || '|' || (provenance NOT LIKE '%Net sales were%') FROM evidence WHERE id = '$EV_V1'")" = 'quote|Net sales were $4,321.5 million.|Net sales for FY2024 from Item 8, stated in millions.|true' ] \
  && ok "  ...its quote moved into quote_text, the reviewer's how-read recorded, and the quote no longer in the provenance" || bad "  ...$(q "SELECT evidence_form || '|' || coalesce(quote_text,'') || '|' || provenance FROM evidence WHERE id = '$EV_V1'")"
[ "$(q "SELECT result FROM figure_checks WHERE evidence_id = '$EV_V1'")" = "pass" ] && ok "  ...and its figure check passes (4,321,500,000 against \"\$4,321.5 million\")" || bad "  ...figure check $(q "SELECT result || ' ' || detail FROM figure_checks WHERE evidence_id = '$EV_V1'")"

step "7. The figure check"
chk() { q "SELECT result || '|' || detail FROM figure_checks WHERE subject_id = '$1' ORDER BY checked_at DESC LIMIT 1"; }
[ "$(chk "$F_REV")" = "pass|3,413,100,000 is in the quote (3,413.1 million)" ] && ok "revenue 3,413,100,000 against \"\$3,413.1 million\": pass" || bad "revenue: $(chk "$F_REV")"
[ "$(q "SELECT result || '|' || detail FROM figure_checks WHERE evidence_id = '$EV_Q'")" = "flag|1.4 is not in the quote (it states 1.42)" ] \
  && ok "a baseline of 1.4 against a quote stating 1.42: flag, naming 1.42" || bad "1.4 vs 1.42: $(q "SELECT result || '|' || detail FROM figure_checks WHERE evidence_id = '$EV_Q'")"
[ "$(q "SELECT result || '|' || numbers_missing::text || '|' || wording_flags::text FROM figure_checks WHERE subject_id = '$F_PRI'")" = 'flag|[]|["approximately"]' ] \
  && ok "\"approximately 5,200\" against a quote of \"5,200\": the number passes, one wording flag" || bad "approximately: $(chk "$F_PRI")"
[ "$(q "SELECT result || '|' || detail FROM figure_checks WHERE evidence_id = '$EV_S'")" = "not_checkable|not checkable: the evidence is a person's statement" ] \
  && ok "a person's statement backing the baseline: not checkable, never a pass (Brad's condition 2)" || bad "statement: $(q "SELECT result || '|' || detail FROM figure_checks WHERE evidence_id = '$EV_S'")"
[ "$(q "SELECT count(*) FROM figure_checks WHERE evidence_id = '$EV_L'")" = "0" ] \
  && ok "the actual's locator, recorded before any actual existed: nothing to compare, no check recorded" || bad "locator before actual"
# The locator case and Scotts' stored revenue, through the library itself.
cat > "$W/fc.ts" <<TS
import { checkFigure } from '$(pwd)/server/lib/figureCheck.ts';
const loc = checkFigure({ numeric: 3413100000, text: null }, { form: 'locator', quoteText: null, locator: { document: '10-K', value: 3413.1, scale: 'millions' } });
const scotts = checkFigure({ numeric: Number(process.argv[2]), text: null }, { form: 'quote', quoteText: 'Net sales were \$3,413.1 million.', locator: null });
const miss = checkFigure({ numeric: 1.4, text: null }, { form: 'quote', quoteText: 'Our TRIR was 1.42 in FY25.', locator: null });
console.log([loc.result, scotts.result, miss.result, miss.detail].join('|'));
TS
SCOTTS_REV="$(q "SELECT f.value_numeric FROM institution_facts f JOIN institutions i ON i.id = f.institution_id WHERE i.name ILIKE 'Scotts%' AND f.kind = 'revenue' AND f.superseded_by_id IS NULL")"
FCR="$(npx tsx "$W/fc.ts" "$SCOTTS_REV" 2>&1 | tail -1)"
[ "$FCR" = "pass|pass|flag|1.4 is not in the quote (it states 1.42)" ] && ok "a locator of 3,413.1 in millions: pass; Scotts' stored revenue ($SCOTTS_REV) against \"\$3,413.1 million\": pass" || bad "library: $FCR"

step "8. A correction keeps its form; it arrives unverified and unattested"
CF() { printf '{"supersession_reason":"Verification: a correction, read again.","value_numeric":%s,"unit":"USD","as_of":"2025-09-30",%s}' "$1" "$2"; }
expect POST "/api/institutions/$INST/facts/$F_REV/supersede" "$(CF 3413200000 "$(FQ 'Net sales were $3,413.2 million for fiscal 2025.' 'Net sales for fiscal 2025, restated, in millions.')")" 201 "a quote's correction resting on a quote"
F_REV2="$(rj b.fact_id)"
[ "$(q "SELECT e.source_verified || '|' || (e.attested_by_person_id IS NULL) || '|' || e.citation_resolved FROM institution_facts f JOIN evidence e ON e.id = f.evidence_id WHERE f.id = '$F_REV2'")" = "false|true|false" ] \
  && ok "  ...the successor's evidence arrives unverified, unattested and unopened (nothing carried over)" || bad "  ...successor evidence"
SCOTTS_INST="$(q "SELECT id FROM institutions WHERE name ILIKE 'Scotts%' LIMIT 1")"; SCOTTS_FACT="$(q "SELECT id FROM institution_facts WHERE institution_id = '$SCOTTS_INST' AND kind = 'revenue' AND superseded_by_id IS NULL")"
expect POST "/api/institutions/$SCOTTS_INST/facts/$SCOTTS_FACT/supersede" "$(CF 3413100000 "$FL")" 201 "a legacy predecessor (Scotts' revenue, on this clone) corrected with a locator: an upgrade, allowed"

step "9. A run sealed after 0039: payloadVersion 2; every run still hashes"
[ "$(q "SELECT (payload->>'payloadVersion') || '|' || (payload->'institutionFacts'->0 ? 'evidenceForm') || '|' || (payload->'evidence'->0 ? 'evidence_form') || '|' || (payload->'evidence' @> '[{\"figure_check\":{\"result\":\"flag\"}}]') FROM value_runs WHERE id = '$RUN'")" = "2|true|true|true" ] \
  && ok "the run seals payloadVersion 2: each fact's and evidence item's form, and the figure check (P1-D4)" || bad "payload: $(q "SELECT payload->>'payloadVersion' FROM value_runs WHERE id = '$RUN'")"
HASHES="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
printf '%s' "$HASHES" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "check_run_hashes: $HASHES (versions 1 and 2)" || bad "hashes: $HASHES"

step "10. Refusals in plain words, recorded"
REF0="$(q "SELECT count(*) FROM refusals")"
expect POST "/api/value-outcomes/$(q "SELECT id FROM value_outcomes WHERE institution_id = '$INST' AND id <> '$O1' LIMIT 1")/evidence" "$(EVB public_filing 'Both (fixture)' baseline '"evidence_form":"quote","quote_text":"q","locator":{"document":"d","value":1,"scale":"units"},"how_read":"Verification: both a quote and a locator."')" 422 "a quote and a locator together" "Give a quote or a locator, not both"
expect POST "/api/institutions/$INST/facts" "{\"kind\":\"system\",\"value_text\":\"SAP\",\"as_of\":\"2025-09-30\",\"evidence_kind\":\"public_filing\",\"provenance\":\"Fixture 10-K (not a source)\",\"confidence\":\"low\"}" 422 "a fact with neither" "Say what this evidence rests on"
[ "$(q "SELECT count(*) FROM refusals")" = "$((REF0 + 2))" ] && ok "  ...both recorded in refusals (Q4k)" || bad "  ...refusals $(q "SELECT count(*) FROM refusals") (was $REF0)"

step "11. The display: the POV on screen (1280, 390) and in print"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "signed in by session" || { bad "no session"; exit 1; }
cat > "$W/pov.mjs" <<'JS'
import { writeFileSync } from 'node:fs';
const [CDP, VITE, TOKEN, OUT, ID, SCOTTS] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
const out = []; const check = (c, m, d = '') => out.push(`${c ? 'PASS' : 'FAIL'}  ${m}${!c && d ? ` — ${d}` : ''}`);
await send('Network.enable');
await send('Network.setCookie', { name: 'lvrf_session', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true });
const open = async (path, width) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await send('Page.navigate', { url: `http://localhost:${VITE}${path}` });
  for (let i = 0; i < 80; i++) { await sleep(200); if (await ev(`!!document.querySelector('[data-testid=pov] h1')`)) break; }
  await sleep(900);
};
for (const width of [1280, 390]) {
  await open(`/accounts/${ID}/pov`, width);
  const W = `fixture POV @${width}`;
  const text = await ev('document.body.innerText');
  check(text.includes('“Net sales were $3,413.2 million for fiscal 2025.”') && text.includes('How it was read: Net sales for fiscal 2025, restated, in millions.'), `${W}: a fact shows its quote, then "How it was read: …"`);
  check(/Figure check: "approximately" is in the value but not in the quote/.test(text), `${W}: the qualifier flag shows beside its fact`);
  check(text.includes('Figure check (baseline): 1.4 is not in the quote (it states 1.42)'), `${W}: the baseline's flagged check shows beside the outcome: "Figure check (baseline): 1.4 is not in the quote (it states 1.42)"`);
  check(text.includes("Figure check (baseline): not checkable: the evidence is a person's statement"), `${W}: the statement backing the baseline shows as not checkable`);
  check(/Stated by [^,]+, \d{1,2} [A-Z][a-z]{2} \d{4}/.test(text), `${W}: a statement reads "Stated by <name>, <date>"`);
  check(text.includes('Stated by Fixture owner (invented), 1 Oct 2026'), `${W}: an attestation is stated by its attester, on the day attested (the commitment: "Stated by Fixture owner (invented), 1 Oct 2026")`);
  check(!/3,413,100,000 is in the quote/.test(text), `${W}: a passing check adds no line`);
  check((await ev('document.documentElement.scrollWidth')) <= width, `${W}: no sideways scroll`);
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 9000), deviceScaleFactor: 1, mobile: width < 600 }); await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}/p1_pov_fixture_${width}.png`, Buffer.from(r.result.data, 'base64'));
}
await open(`/accounts/${SCOTTS}/pov`, 1280);
const st = await ev('document.body.innerText');
check(st.includes('Recorded before evidence forms (24 Oct 2026)') && st.includes('Fixture 10-K FY2025 · Consolidated statements of operations · Net sales · 2025: 3413.1 (millions)'),
  "Scotts' POV: a legacy fact reads \"Recorded before evidence forms (24 Oct 2026)\"; the corrected revenue its locator, \"Document · table · row · column: value (scale)\"");
await open(`/accounts/${ID}/pov`, 1280);
const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
writeFileSync(`${OUT}/p1_pov_fixture.pdf`, Buffer.from(pdf.result.data, 'base64'));
console.log(out.join('\n')); ws.close(); process.exit(0);
JS
node "$W/pov.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "$SHOTS" "$INST" "$SCOTTS_INST" > "$W/pov.log" 2>&1 || bad "the POV walk crashed: $(tail -3 "$W/pov.log")"
while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$W/pov.log"
if [ -f "$SHOTS/p1_pov_fixture.pdf" ]; then
  PT="$(pdftotext "$SHOTS/p1_pov_fixture.pdf" - 2>/dev/null | tr '\n' ' ' | tr -s ' ')"
  printf '%s' "$PT" | grep -qF "Figure check (baseline): 1.4 is not in the quote (it states 1.42)" && printf '%s' "$PT" | grep -qF "How it was read:" \
    && ok "in print: the flagged check and \"How it was read\" print, the same as on screen" || bad "print: the check or how-read missing"
else bad "no PDF printed"; fi

step "12. Deliberate breaks"
sqlrefused "B1: an INSERT with form legacy" "INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form) VALUES ('$INST', 'observation', 'b1', 'Verification break B1', '$S', 'legacy')" 'is the form of evidence recorded before evidence forms'
Q41="$(node -e "console.log(Array.from({length:41},(_,i)=>'w'+i).join(' '))")"
expect POST "/api/institutions/$INST/facts" "{\"kind\":\"system\",\"value_text\":\"SAP\",\"as_of\":\"2025-09-30\",$(FQ "$Q41" 'Verification: a quote of forty-one words.')}" 422 "B2: a 41-word quote, at the route" "The quote is 41 words; a quote is at most 40"
sqlrefused "B2: a 41-word quote, at the database" "INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form, quote_text, how_read) VALUES ('$INST', 'public_filing', 'b2', 'Verification break B2', '$S', 'quote', '$Q41', 'Verification: forty-one words in a quote.')" 'evidence_form_shape'
expect POST "/api/value-outcomes/$(q "SELECT id FROM value_outcomes WHERE institution_id = '$INST' AND id <> '$O1' LIMIT 1")/evidence" "$(EVB system_export 'No scale (fixture)' baseline '"evidence_form":"locator","locator":{"document":"Fixture extract","value":2},"how_read":"Verification: a locator with no scale given."')" 422 "B3: a locator missing scale, at the route" "Give the locator's scale"
sqlrefused "B3: a locator missing scale, at the database" "INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form, locator, how_read) VALUES ('$INST', 'system_export', 'b3', 'Verification break B3', '$S', 'locator', '{\"document\":\"d\",\"value\":2}', 'Verification: a locator with no scale given.')" 'evidence_form_shape'
expect POST "/api/value-outcomes/$(q "SELECT id FROM value_outcomes WHERE institution_id = '$INST' AND id <> '$O1' LIMIT 1")/evidence" "$(EVB public_filing 'A filing as a statement (fixture)' baseline '"evidence_form":"statement"')" 422 "B4: a statement on a public_filing, at the route" "this evidence's kind rests on a source"
sqlrefused "B4: a statement on a public_filing, at the database" "INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form) VALUES ('$INST', 'public_filing', 'b4', 'Verification break B4', '$S', 'statement')" 'evidence_form_shape'
expect POST "/api/institutions/$INST/facts" "{\"kind\":\"system\",\"value_text\":\"SAP\",\"as_of\":\"2025-09-30\",$(FQ 'We run SAP.' 'Too short.')}" 422 "B5: a quote with a 10-character how-read, at the route" "in at least 24 characters"
sqlrefused "B5: a 10-character how-read, at the database" "INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form, quote_text, how_read) VALUES ('$INST', 'public_filing', 'b5', 'Verification break B5', '$S', 'quote', 'We run SAP.', 'Too short.')" 'evidence_how_read'
sqlrefused "B6: an UPDATE of quote_text after insert" "UPDATE evidence SET quote_text = 'A quietly better quote.' WHERE id = '$EV_Q'" 'its form, quote, locator and how-read are final once recorded'
expect POST "/api/institutions/$INST/facts/$F_HC/supersede" "{\"supersession_reason\":\"Verification: swap the form.\",\"value_numeric\":5200,\"unit\":\"people\",\"as_of\":\"2025-09-30\",$FL}" 422 "B7: a quote's successor resting on a locator" "a correction keeps its evidence form"
sqlrefused "B10: a DELETE on figure_checks" "DELETE FROM figure_checks WHERE evidence_id = '$EV_Q'" 'cannot be deleted'
sqlrefused "B10: an UPDATE on figure_checks" "UPDATE figure_checks SET result = 'pass' WHERE evidence_id = '$EV_Q'" 'is final'
restore() { cp "$W/figureCheck.ts.orig" "$FC"; cmp -s "$W/figureCheck.ts.orig" "$FC" && ok "  ...$FC restored byte-identical" || bad "  ...$FC restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
edit "$FC" "    const scale = m[4] ? WORD_SCALE[m[4].toLowerCase()] : m[5] ? LETTER_SCALE[m[5]] : 1;" "    const scale = 1;"
B8="$(npx tsx "$W/fc.ts" "$SCOTTS_REV" 2>&1 | tail -1)"
[ "$(printf '%s' "$B8" | cut -d'|' -f2)" = "flag" ] && ok "B8: the scale words ignored → Scotts' revenue check fails (flag): the scale handling is what passes it" || bad "B8: not caught: $B8"
restore
edit "$FC" "    const hit = stated.find((s) => matches(n.v, s));" "    const hit = stated.find((s) => matches(n.v, s)) ?? stated[0] ?? { raw: '(none)', value: n.v, tolerance: 0 };"
B9="$(npx tsx "$W/fc.ts" "$SCOTTS_REV" 2>&1 | tail -1)"
[ "$(printf '%s' "$B9" | cut -d'|' -f3)" = "pass" ] && ok "B9: a missing number silently passed → caught: 1.4 against 1.42 reads pass, where the rule reads flag" || bad "B9: not caught: $B9"
restore
cmp -s "$W/figureCheck.ts.orig" "$FC" && ok "$FC byte-identical to before the run" || bad "$FC differs"
echo "  screenshots and the PDF: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
