#!/usr/bin/env bash
#
# Q4h — account research intake (3.0 item 6), with the entity (item 3's
# minimum), the disclosure regime (item 4's minimum), L6 and L8. Local
# verification. Plan: docs/LVRF_PLAN.md §4e.
#
#   ./scripts/verify_account_research.sh [screenshot_dir]
#
# Clone `lvrf_verifyaccountresearch` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated
# (0033, 0034) and hardened, dropped on exit. API with the header actor
# (LVRF_ALLOW_ACTOR_HEADER=1, this throwaway server only); the page through
# Vite and headless Chrome, signed in by SESSION. FICTIONAL accounts only:
# never a real company's figures in a test.
#
# DELIBERATE BREAKS edit a source file in place and restore it
# byte-identical (cmp); the EXIT trap restores them too.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifyaccountresearch
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3072; VITE_PORT=5176; CDP_PORT=9336
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_acctresearch.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ROUTE=server/routes/accountResearch.ts
CARDS=client/src/components/AccountResearch.tsx
for f in "$ROUTE" "$CARDS"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$ROUTE" "$CARDS"; do
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
req() {  # METHOD PATH [BODY] [ACTOR]
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: ${4:-$X}" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: ${4:-$X}" -d "$3" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING] [ACTOR]
  req "$1" "$2" "$3" "${7:-$X}"
  local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 400)"; fi
}
# Response builders (node, so the JSON is always well formed).
J() { node -e "$1"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate (0033, 0034 in one run), harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated: 0033 (enum values) and 0034 together — the CHECKs compare the new values as text" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }
N_TRIG="$(q "SELECT count(DISTINCT trigger_name || '.' || event_object_table) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
# By name, not a pinned total: later migrations add triggers of their own.
ENT_TRIG="$(q "SELECT string_agg(DISTINCT trigger_name, ',' ORDER BY trigger_name) FROM information_schema.triggers WHERE event_object_table = 'institution_entities'")"
[ "$N_TRIG" = "$EXPECT_TRIGGERS" ] && [ "$ENT_TRIG" = "institution_entities_audit,institution_entities_no_delete,institution_entities_one_current,institution_entities_supersession_sane,institution_entities_touch" ] \
  && ok "$N_TRIG distinct triggers, as hardening.sql declares; institution_entities: _audit, _touch, _no_delete, _supersession_sane, one_current" || bad "triggers: $N_TRIG, expected $EXPECT_TRIGGERS; institution_entities: $ENT_TRIG"
OUT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs || true)"
case "$OUT" in "schema drift: none"*) ok "D2: $OUT" ;; *) bad "D2: $OUT" ;; esac
OUT="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/drift_report.ts 2>&1 | tail -1 || true)"
case "$OUT" in *"no findings"*) ok "drift report: $OUT" ;; *) bad "drift report: $OUT" ;; esac

step "3. Fixtures and server"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@acctresearch.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
start_server && ok "API up on $PORT"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Verification Filer $TS\"}}" 201 "a fictional public filer (account)"
INST="$(rj b.institution_id)"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Verification Private $TS\"}}" 201 "a fictional private company (account)"
PRIV="$(rj b.institution_id)"
TEN_X="$(q "SELECT id FROM tenants WHERE id <> '$TEN' ORDER BY id LIMIT 1")"
INST_X="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TEN_X', 'Other tenant account (verification $TS)') RETURNING id" | head -1)"
[ -n "$INST_X" ] && ok "another tenant's institution, for the 404s" || bad "no other-tenant institution"
PARSE="/api/institutions/$INST/research-results"
REF0() { q "SELECT count(*) FROM refusals WHERE source = 'parser' AND institution_id = '$1'"; }

step "4. Phase ENTITY"
expect GET "/api/institutions/$INST/research" "" 200 "GET research"
[ "$(rj "b.phase_now + '|' + b.entity + '|' + b.contract_version_now")" = "entity|null|1" ] && ok "  ...phase entity, no entity, contract v1" || bad "  ...$(head -c 300 "$W/r.json")"
expect GET "/api/institutions/$INST_X/research" "" 404 "another tenant's account" "institution $INST_X not found"
expect POST "/api/institutions/$INST/research-prompts" '{}' 201 "generate: the entity-phase prompt"
P1="$(rj b.prompt_id)"; rj b.prompt > "$W/p1.txt"
[ "$(rj b.phase)" = "entity" ] && grep -qF "PHASE: ENTITY" "$W/p1.txt" && grep -qF "Return no facts" "$W/p1.txt" && grep -qF "NEVER return a measured outcome" "$W/p1.txt" \
  && ok "  ...phase entity; asks only for the entity and regime; never a measured outcome" || bad "  ...prompt text"
[ "$(q "SELECT institution_id = '$INST' AND industry_id IS NULL AND phase = 'entity' AND entity_id IS NULL AND prompt_sha256 = encode(sha256(convert_to(prompt_text, 'UTF8')), 'hex') FROM research_prompts WHERE id = '$P1'")" = "t" ] \
  && ok "  ...stored: the account, no industry, phase entity, no entity, the hash is the text's" || bad "  ...stored row"
expect POST "/api/institutions/$INST_X/research-prompts" '{}' 404 "generate for another tenant's account"
ENTITY='{"legal_name":"Verification Filer Inc.","identifier_type":"sec_cik","identifier":"0000123456","registry_jurisdiction":null,"source_kind":"public_filing","citation":"EDGAR company record, CIK 0000123456 (fixture, not a source)","caveats":[]}'
REGIME='{"value":"public_filer","basis":"Files a 10-K with the SEC.","as_of":"2024-09-30","source_kind":"public_filing","citation":"EDGAR filing index (fixture)","caveats":[]}'
# JSON lists with "{...,...}" are held in single-quoted variables: written
# inline inside "$( ... )", bash brace-expands them.
NF_ENTITY='[{"kind":"entity","reason":"x"}]'
NF_SYSTEM='[{"kind":"system","reason":"Not disclosed in filings (fixture)."}]'
NF_PRIV='[{"kind":"revenue","reason":"Private; no statutory filing discloses revenue (fixture)."},{"kind":"headcount","reason":"Private; not disclosed (fixture)."}]'
FACT_NZD='{"kind":"revenue","value":1,"unit":"NZD","as_of":"2024-12-31","period":"FY2024","source_kind":"company_publication","citation":"x","quote":"x","caveats":[]}'
envb() { printf '{"prompt_id":"%s","institution":"Verification Filer","research_query":"q","query_as_executed":"qe","research_tool":"Verification tool","ai_sourced":true,%s}' "$1" "$2"; }
R0="$(REF0 "$INST")"
expect POST "$PARSE" "$(envb 00000000-0000-4000-8000-000000000000 "\"entity\":$ENTITY,\"disclosure_regime\":$REGIME,\"facts\":[],\"not_found\":[]")" 422 "an unknown prompt" "is not a research prompt for institution"
expect POST "$PARSE" "$(envb "$P1" "\"entity\":$ENTITY,\"disclosure_regime\":$REGIME,\"facts\":[{\"kind\":\"revenue\"}],\"not_found\":[]")" 422 "facts in an entity-phase response" "facts are refused until the entity is pinned"
expect POST "$PARSE" "$(envb "$P1" "\"disclosure_regime\":$REGIME,\"facts\":[],\"not_found\":[]")" 422 "no entity and no not-found for it" "body.entity is required (or a not_found for \"entity\""
expect POST "$PARSE" "$(envb "$P1" "\"entity\":${ENTITY/0000123456\"/123456\"},\"disclosure_regime\":$REGIME,\"facts\":[],\"not_found\":[]")" 422 "an SEC CIK not 10 digits" "must be the SEC CIK as 10 digits, zero-padded"
expect POST "$PARSE" "$(envb "$P1" "\"entity\":${ENTITY/\"caveats\":[]/\"caveats\":\"none\"},\"disclosure_regime\":$REGIME,\"facts\":[],\"not_found\":[]")" 422 "caveats not a list" "entity.caveats must be a list of strings"
expect POST "$PARSE" "$(envb "$P1" "\"entity\":$ENTITY,\"disclosure_regime\":$REGIME,\"facts\":[]" )" 422 "no not_found list" "body.not_found is required"
expect POST "$PARSE" "$(envb "$P1" "\"entity\":$ENTITY,\"disclosure_regime\":$REGIME,\"facts\":[],\"not_found\":[]" | sed 's/"ai_sourced":true,//')" 422 "ai_sourced missing" "body.ai_sourced must be true or false"
P_OLD="$(q "INSERT INTO research_prompts (tenant_id, institution_id, result_kind, phase, contract_version, template_version, prompt_text, prompt_sha256, generated_by_person_id)
  VALUES ('$TEN', '$INST', 'institution_fact', 'entity', 99, 1, 'a v99 prompt', encode(sha256(convert_to('a v99 prompt', 'UTF8')), 'hex'), '$X') RETURNING id" | head -1)"
expect POST "$PARSE" "$(envb "$P_OLD" "\"entity\":$ENTITY,\"disclosure_regime\":$REGIME,\"facts\":[],\"not_found\":[]")" 422 "a prompt of another contract version" "the prompt was generated against v99; the contract is now v1; generate a new prompt."
R1="$(REF0 "$INST")"
[ "$((R1 - R0))" = "8" ] && ok "L8: all 8 parse refusals are on record in refusals (source parser)" || bad "L8: $((R1 - R0)) parse refusals recorded, expected 8"
[ "$(q "SELECT (sqlstate IS NULL) || '|' || endpoint || '|' || (message LIKE '%the prompt was generated against v99%') || '|' || (actor_person_id = '$X') FROM refusals WHERE source = 'parser' AND institution_id = '$INST' ORDER BY refused_at DESC LIMIT 1")" = "true|POST /api/institutions/:institutionId/research-results|true|true" ] \
  && ok "  ...a row: no SQLSTATE, the endpoint, the issues, the actor" || bad "  ...refusal row"
N0="$(q "SELECT count(*) FROM research_results WHERE institution_id = '$INST'")"
[ "$N0" = "0" ] && ok "  ...and nothing was written by any of them" || bad "  ...$N0 rows written"
expect POST "$PARSE" "$(envb "$P1" "\"entity\":$ENTITY,\"disclosure_regime\":$REGIME,\"facts\":[],\"not_found\":[]")" 201 "a conforming entity-phase response"
RE="$(rj "b.results.find(r=>r.field_name==='entity').id")"; RR="$(rj "b.results.find(r=>r.field_name==='disclosure_regime').id")"
expect POST "/api/account-research-results/$RR/accept" '{"review_note":"v","citation_opened":true}' 409 "accepting the regime before the entity" "accept the entity first"
expect POST "/api/account-research-results/$RE/accept" '{"review_note":"Verification: the CIK matches."}' 422 "H1: accepting without citation_opened" "citation_opened must be true"
expect POST "/api/account-research-results/$RE/accept" '{"review_note":"Verification: the CIK matches.","citation_opened":true}' 200 "accept the entity (an AUTHORIZED user, not the steward)"
[ "$(q "SELECT e.legal_name || '|' || e.identifier || '|' || ev.kind || '|' || ev.citation_resolved || '|' || (ev.citation_resolved_by_person_id = '$X') || '|' || ev.ai_sourced || '|' || (ev.research_query IS NOT NULL) || '|' || ev.source_verified FROM institution_entities e JOIN evidence ev ON ev.id = e.evidence_id WHERE e.institution_id = '$INST'")" = "Verification Filer Inc.|0000123456|public_filing|true|true|true|true|false" ] \
  && ok "  ...one transaction: the entity and its evidence (public_filing, citation resolved by X, AI-sourced with its query, not source-verified)" || bad "  ...entity row"
[ "$(q "SELECT review_state || '|' || (institution_entity_id IS NOT NULL) || '|' || (evidence_id IS NOT NULL) FROM research_results WHERE id = '$RE'")" = "accepted|true|true" ] && ok "  ...the result accepted, linking the entity and evidence" || bad "  ...result row"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'institution_entities' AND actor_person_id = '$X'")" = "1" ] && ok "  ...audited, with X as actor" || bad "  ...audit"
expect POST "/api/account-research-results/$RE/accept" '{"review_note":"again","citation_opened":true}' 409 "accepting it again" "is already accepted"
expect POST "/api/account-research-results/$RR/accept" '{"review_note":"Verification: files a 10-K.","citation_opened":true}' 200 "accept the regime"
[ "$(q "SELECT value_text || '|' || as_of FROM institution_facts WHERE institution_id = '$INST' AND kind = 'disclosure_regime'")" = "public_filer|2024-09-30" ] && ok "  ...a disclosure_regime fact: public_filer, as of 2024-09-30" || bad "  ...regime fact"
BADREG="$(psql -X -d "$VERIFY_DB" -c "INSERT INTO institution_facts (institution_id, kind, value_text, as_of, evidence_id, captured_by_person_id) SELECT '$INST', 'disclosure_regime', 'listed', '2024-01-01', evidence_id, '$X' FROM research_results WHERE id = '$RE'" 2>&1 || true)"
printf '%s' "$BADREG" | grep -qF "institution_facts_regime_shape" && ok "a regime that is not one of the four labels: refused by institution_facts_regime_shape" || bad "regime CHECK: $BADREG"

step "5. Phase FACTS"
expect POST "/api/institutions/$INST/research-prompts" '{}' 201 "generate: the facts-phase prompt"
P2="$(rj b.prompt_id)"; rj b.prompt > "$W/p2.txt"
E_ID="$(q "SELECT id FROM institution_entities WHERE institution_id = '$INST'")"
[ "$(rj b.phase)" = "facts" ] && [ "$(q "SELECT entity_id FROM research_prompts WHERE id = '$P2'")" = "$E_ID" ] && grep -qF "ENTITY (pinned): Verification Filer Inc. — sec_cik 0000123456." "$W/p2.txt" \
  && grep -qF "as_of: the LAST DAY OF THE PERIOD the fact describes" "$W/p2.txt" && grep -qF "ALREADY RECORDED (0)" "$W/p2.txt" \
  && ok "  ...phase facts, the pinned entity named and stored, as_of = the period end, nothing recorded yet" || bad "  ...facts prompt"
FACTENV() { envb "$P2" "\"entity\":${1:-$ENTITY},$2"; }
REV='{"kind":"revenue","value":0,"unit":"USD","as_of":"2024-09-30","period":"fiscal year ended 30 September 2024","source_kind":"public_filing","citation":"Form 10-K FY2024, Item 8 (fixture)","quote":"Net sales were nil (fixture).","caveats":[]}'
PRI='{"kind":"stated_priority","value":"Operational excellence (fixture)","unit":null,"as_of":"2024-09-30","period":"FY2024","source_kind":"company_publication","citation":"Company annual review 2024, p. 3 (fixture)","quote":"Our priority is operational excellence.","caveats":["From the annual review of the company, not a filing."]}'
HC='{"kind":"headcount","value":4200,"unit":"people","as_of":"2024-09-30","period":"as of 30 September 2024","source_kind":"public_filing","citation":"Form 10-K FY2024, Item 1 (fixture)","quote":"We had approximately 4,200 employees.","caveats":["Approximate."]}'
R2="$(REF0 "$INST")"
expect POST "$PARSE" "$(FACTENV "${ENTITY/0000123456/0000999999}" "\"facts\":[$REV],\"not_found\":[]")" 422 "a response about another entity" "this response is about Verification Filer Inc., sec_cik 0000999999; the account's entity is Verification Filer Inc., sec_cik 0000123456; nothing was written."
expect POST "$PARSE" "$(FACTENV "" "\"disclosure_regime\":$REGIME,\"facts\":[$REV],\"not_found\":[]")" 422 "a regime in a facts response" "the regime is recorded in the entity phase"
expect POST "$PARSE" "$(FACTENV "" "\"facts\":[${REV/\"USD\"/\"usd\"}],\"not_found\":[]")" 422 "revenue without an ISO currency" "facts[0].unit must be the ISO currency code"
expect POST "$PARSE" "$(FACTENV "" "\"facts\":[${HC/4200/4200.5}],\"not_found\":[]")" 422 "a fractional headcount" "facts[0].value must be a whole number of people"
expect POST "$PARSE" "$(FACTENV "" "\"facts\":[${REV/\"as_of\":\"2024-09-30\",/}],\"not_found\":[]")" 422 "a fact with no as_of (L6)" "facts[0].as_of is missing"
expect POST "$PARSE" "$(FACTENV "" "\"facts\":[],\"not_found\":$NF_ENTITY")" 422 "an entity not-found in a facts response" "not a facts-phase kind"
R3="$(REF0 "$INST")"
[ "$((R3 - R2))" = "6" ] && ok "L8: the 6 facts-phase refusals are on record too" || bad "L8: $((R3 - R2)) recorded, expected 6"
expect POST "$PARSE" "$(FACTENV "" "\"facts\":[$REV,$PRI,$HC],\"not_found\":$NF_SYSTEM")" 201 "a conforming facts response: 3 facts and a not-found"
RREV="$(rj "b.results.find(r=>r.field_name==='revenue').id")"; RPRI="$(rj "b.results.find(r=>r.field_name==='stated_priority').id")"
RHC="$(rj "b.results.find(r=>r.field_name==='headcount').id")"; RSYS="$(rj "b.results.find(r=>r.field_name==='system').id")"
expect POST "/api/account-research-results/$RREV/accept" '{"review_note":"Verification: matches Item 8.","citation_opened":true}' 200 "accept revenue 0 (zero is data)"
[ "$(q "SELECT f.value_numeric::text || '|' || f.unit || '|' || f.as_of || '|' || ev.kind || '|' || ev.citation_resolved || '|' || (ev.provenance LIKE '%Net sales were nil (fixture).%fiscal year ended 30 September 2024%') FROM institution_facts f JOIN evidence ev ON ev.id = f.evidence_id WHERE f.institution_id = '$INST' AND f.kind = 'revenue'")" = "0|USD|2024-09-30|public_filing|true|true" ] \
  && ok "  ...the fact: 0 USD, as_of = the period end (L6), public_filing, citation resolved, the quote and period in the provenance" || bad "  ...revenue fact: $(q "SELECT value_numeric, unit, as_of FROM institution_facts WHERE institution_id = '$INST' AND kind = 'revenue'")"
# Q4i: the account page's read carries citation_resolved, by whom, when —
# apart from source_verified. A typed fact has none.
expect POST "/api/institutions/$INST/facts" '{"kind":"system","value_text":"A typed system (fixture)","as_of":"2024-09-30","evidence_kind":"observation","provenance":"Typed by the verifier (fixture, not a source)","confidence":"low"}' 201 "Q4i: a typed fact, for contrast"
expect GET "/api/institutions/$INST/view" "" 200 "Q4i: GET /view"
[ "$(rj "(f=>[f.citation_resolved, f.citation_resolved_by, /^\\d{4}-\\d{2}-\\d{2}$/.test(f.citation_resolved_at), f.source_verified].join())(b.facts.find(f=>f.kind==='revenue'))")" = "true,Authorized X (verification),true,false" ] \
  && [ "$(rj "(f=>[f.citation_resolved, f.citation_resolved_by, f.citation_resolved_at].join())(b.facts.find(f=>f.value_text==='A typed system (fixture)'))")" = "false,," ] \
  && ok "  ...the researched revenue: citation opened by X, dated, still source-unverified; the typed fact: not opened" || bad "  ...$(rj "JSON.stringify(b.facts.map(f=>[f.kind,f.citation_resolved,f.citation_resolved_by]))")"
expect POST "/api/account-research-results/$RPRI/accept" '{"review_note":"Verification: the company says so.","citation_opened":true}' 200 "accept a stated priority from the company's own publication"
[ "$(q "SELECT ev.kind || '|' || ev.source_reference FROM institution_facts f JOIN evidence ev ON ev.id = f.evidence_id WHERE f.institution_id = '$INST' AND f.kind = 'stated_priority'")" = "observation|Company annual review 2024, p. 3 (fixture)" ] \
  && ok "  ...H3: recorded as observation with a source reference (derives inferred); the stated source kind kept in raw_response" || bad "  ...H3"
[ "$(q "SELECT raw_response->'item'->>'source_kind' FROM research_results WHERE id = '$RPRI'")" = "company_publication" ] && ok "  ...raw_response keeps source_kind \"company_publication\"" || bad "  ...source kind not kept"
expect POST "/api/account-research-results/$RSYS/accept" '{"review_note":"Verification: not in the filings."}' 200 "accept a not-found (no citation tick needed)"
[ "$(q "SELECT review_state || '|' || (evidence_id IS NULL) || '|' || (institution_fact_id IS NULL) FROM research_results WHERE id = '$RSYS'")" = "accepted|true|true" ] && ok "  ...accepted as not found: no evidence, no fact" || bad "  ...not-found row"
expect POST "/api/account-research-results/$RHC/reject" '{"review_note":"Verification: approximate; wait for an exact figure."}' 200 "reject the headcount"
[ "$(q "SELECT review_state FROM research_results WHERE id = '$RHC'")" = "rejected" ] && [ "$(q "SELECT count(*) FROM institution_facts WHERE institution_id = '$INST' AND kind = 'headcount'")" = "0" ] && ok "  ...kept as rejected; no fact" || bad "  ...reject"
expect GET "/api/institutions/$INST/research" "" 200 "GET research after review"
[ "$(rj "b.phase_now + '|' + b.entity.identifier + '|' + b.regime.value + '|' + b.not_found.map(n=>n.kind).join() + '|' + b.pending.length")" = "facts|0000123456|public_filer|system|0" ] \
  && ok "  ...facts phase; the entity, the regime, the not-found, nothing pending" || bad "  ...$(head -c 300 "$W/r.json")"
expect POST "/api/institutions/$INST/research-prompts" '{}' 201 "the next facts prompt"
rj b.prompt > "$W/p3.txt"
grep -qF "ALREADY RECORDED (3)" "$W/p3.txt" && grep -qF -- "- revenue: 0 USD (as of 2024-09-30)" "$W/p3.txt" && grep -qF "PREVIOUSLY NOT FOUND (1)" "$W/p3.txt" && grep -qF -- "- system: Not disclosed in filings (fixture)." "$W/p3.txt" \
  && ok "  ...lists what is recorded (H4: still asks for every kind) and what was not found, with the reason" || bad "  ...$(grep -A3 'ALREADY' "$W/p3.txt" | head -4)"
P3="$(rj b.prompt_id)"

step "6. No hop left short; correcting the entity; tenancy; the steward's route"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Verification Unpinned $TS\"}}" 201 "an account with no entity pinned"
WALK_INST_PRE="$(rj b.institution_id)"
# A failure after the evidence insert must leave nothing: a temporary CHECK
# on this clone refuses the fact itself.
expect POST "$PARSE" "$(envb "$P3" "\"entity\":$ENTITY,\"facts\":[${HC/4200/777777}],\"not_found\":[]")" 201 "parse a headcount the temporary CHECK will refuse"
RBOOM="$(rj b.results[0].id)"
q "ALTER TABLE institution_facts ADD CONSTRAINT verify_temp_refuse CHECK (value_numeric IS DISTINCT FROM 777777)" > /dev/null
EV0="$(q "SELECT count(*) FROM evidence WHERE institution_id = '$INST'")"
req POST "/api/account-research-results/$RBOOM/accept" '{"review_note":"Verification: forced failure.","citation_opened":true}'
[ "$CODE" != "200" ] && [ "$(q "SELECT count(*) FROM evidence WHERE institution_id = '$INST'")" = "$EV0" ] && [ "$(q "SELECT review_state FROM research_results WHERE id = '$RBOOM'")" = "pending" ] \
  && ok "the fact refused after its evidence was inserted ($CODE): no evidence row, the result still pending — one transaction" || bad "atomicity: $CODE, evidence $EV0 -> $(q "SELECT count(*) FROM evidence WHERE institution_id = '$INST'")"
q "ALTER TABLE institution_facts DROP CONSTRAINT verify_temp_refuse" > /dev/null
# CORRECTING THE ENTITY (Brad, 12 Oct): supersede it through the route. The
# facts accepted under the old entity are listed, not changed; a pending fact
# and the old prompt are refused; research targets the new entity.
expect POST "$PARSE" "$(envb "$P3" "\"entity\":$ENTITY,\"facts\":[$HC],\"not_found\":[]")" 201 "parse a headcount under the current entity"
RLATE="$(rj b.results[0].id)"
OLD_E="$(q "SELECT id FROM institution_entities WHERE institution_id = '$INST' AND superseded_by_id IS NULL")"
FACTS_BEFORE="$(q "SELECT string_agg(id || ':' || coalesce(value_text, value_numeric::text) || ':' || (superseded_by_id IS NULL) || ':' || (deleted_at IS NULL), ',' ORDER BY id) FROM institution_facts WHERE institution_id = '$INST'")"
CORR() { printf '{"legal_name":"%s","identifier_type":"sec_cik","identifier":"%s","source_kind":"public_filing","citation":"EDGAR company record, CIK %s (fixture, not a source)","supersession_reason":"%s"}' "$1" "$2" "$2" "$3"; }
expect POST "/api/institutions/$INST/entity/supersede" "$(CORR 'Verification Filer Holdings Inc.' 0000654321 'short')" 422 "a correction without a 12-character reason" "supersession_reason must state why"
expect POST "/api/institutions/$INST/entity/supersede" "$(CORR 'Verification Filer Inc.' 0000123456 'Verification: the same entity again.')" 422 "a correction to the same entity" "nothing to correct"
expect POST "/api/institutions/$INST_X/entity/supersede" "$(CORR 'X' 0000654321 'Verification: another tenant.')" 404 "a correction on another tenant's account" "institution $INST_X not found"
expect POST "/api/institutions/$WALK_INST_PRE/entity/supersede" "$(CORR 'X' 0000654321 'Verification: nothing pinned yet.')" 409 "a correction where no entity is pinned" "research the entity first; there is nothing to correct"
expect POST "/api/institutions/$INST/entity/supersede" "$(CORR 'Verification Filer Holdings Inc.' 0000654321 'Verification: the 10-K is filed by the holding company, not the operating subsidiary.')" 201 "correct the entity (an authorized act)"
NEW_E="$(rj b.entity_id)"
[ "$(rj "b.facts_accepted_under_previous_entity.map(f=>f.kind).sort().join()")" = "disclosure_regime,revenue,stated_priority" ] \
  && ok "  ...the response lists the 3 facts accepted under the previous entity (the regime, revenue, the stated priority)" || bad "  ...listed: $(rj "JSON.stringify(b.facts_accepted_under_previous_entity)")"
[ "$(q "SELECT (superseded_by_id = '$NEW_E') || '|' || supersession_reason FROM institution_entities WHERE id = '$OLD_E'")" = "true|Verification: the 10-K is filed by the holding company, not the operating subsidiary." ] \
  && [ "$(q "SELECT count(*) FROM institution_entities WHERE institution_id = '$INST' AND superseded_by_id IS NULL AND deleted_at IS NULL")" = "1" ] \
  && ok "  ...the old entity points at the new one with the reason; one current entity" || bad "  ...supersession rows"
[ "$(q "SELECT string_agg(id || ':' || coalesce(value_text, value_numeric::text) || ':' || (superseded_by_id IS NULL) || ':' || (deleted_at IS NULL), ',' ORDER BY id) FROM institution_facts WHERE institution_id = '$INST'")" = "$FACTS_BEFORE" ] \
  && ok "  ...the facts themselves are unchanged (not edited, superseded or retired)" || bad "  ...facts changed"
expect GET "/api/institutions/$INST/research" "" 200 "GET research after the correction"
[ "$(rj "b.entity.identifier + '|' + b.under_previous_entity.length + '|' + b.under_previous_entity.every(f=>f.identifier==='0000123456')")" = "0000654321|3|true" ] \
  && ok "  ...the current entity is the corrected one; the 3 facts are listed under the previous one" || bad "  ...$(head -c 300 "$W/r.json")"
expect POST "/api/account-research-results/$RLATE/accept" '{"review_note":"v","citation_opened":true}' 409 "a pending fact researched under the old entity" "is no longer the account's"
expect POST "$PARSE" "$(envb "$P3" "\"entity\":$ENTITY,\"facts\":[$HC],\"not_found\":[]")" 422 "parsing against a prompt whose entity was corrected" "the account's entity was corrected since this prompt was generated"
expect POST "/api/institutions/$INST/research-prompts" '{}' 201 "the next facts prompt"
PNEW="$(rj b.prompt_id)"; rj b.prompt > "$W/pnew.txt"
grep -qF "ENTITY (pinned): Verification Filer Holdings Inc. — sec_cik 0000654321." "$W/pnew.txt" && [ "$(q "SELECT entity_id FROM research_prompts WHERE id = '$PNEW'")" = "$NEW_E" ] \
  && ok "  ...research now targets the corrected entity" || bad "  ...prompt entity"
ENTITY2='{"legal_name":"Verification Filer Holdings Inc.","identifier_type":"sec_cik","identifier":"0000654321","registry_jurisdiction":null,"source_kind":"public_filing","citation":"EDGAR company record (fixture)","caveats":[]}'
expect POST "$PARSE" "$(envb "$PNEW" "\"entity\":$ENTITY,\"facts\":[$HC],\"not_found\":[]")" 422 "a response about the OLD entity under the new prompt" "this response is about Verification Filer Inc., sec_cik 0000123456; the account's entity is Verification Filer Holdings Inc., sec_cik 0000654321"
TWO="$(printf "BEGIN;\nINSERT INTO institution_entities (institution_id, legal_name, identifier_type, identifier, evidence_id, captured_by_person_id) SELECT '%s', 'A second current entity', 'ticker', 'ZZZ', id, '%s' FROM evidence WHERE institution_id = '%s' AND NOT EXISTS (SELECT 1 FROM institution_entities ie WHERE ie.evidence_id = evidence.id) LIMIT 1;\nCOMMIT;\n" "$INST" "$X" "$INST" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$TWO" | grep -qF "would have 2 current entities" && ok "two current entities by direct SQL: refused at COMMIT by institution_entities_one_current (the deferred trigger)" || bad "two current: $TWO"
# Other tenants' results; the steward's pack route on an account result.
expect POST "/api/account-research-results/00000000-0000-4000-8000-000000000000/accept" '{"review_note":"v","citation_opened":true}' 404 "an unknown result"
expect POST "/api/research-results/$RLATE/accept" '{"review_note":"v"}' 422 "the steward's pack accept on an account result: refused by kind" "has result_kind 'institution_fact'" "$S"

step "7. A private company"
expect POST "/api/institutions/$PRIV/research-prompts" '{}' 201 "entity prompt for the private company"
PP1="$(rj b.prompt_id)"
PENT='{"legal_name":"Verification Private Limited","identifier_type":"registry","identifier":"1234567","registry_jurisdiction":"NZ","source_kind":"public_filing","citation":"NZ Companies Office record (fixture)","caveats":[]}'
PREG='{"value":"private","basis":"Privately held; no securities filings.","as_of":"2024-12-31","source_kind":"public_filing","citation":"NZ Companies Office record (fixture)","caveats":[]}'
expect POST "/api/institutions/$PRIV/research-results" "$(envb "$PP1" "\"entity\":${PENT/\"NZ\"/null},\"disclosure_regime\":$PREG,\"facts\":[],\"not_found\":[]")" 422 "a registry number without its jurisdiction" "registry_jurisdiction is required for a registry number"
expect POST "/api/institutions/$PRIV/research-results" "$(envb "$PP1" "\"entity\":$PENT,\"disclosure_regime\":$PREG,\"facts\":[],\"not_found\":[]")" 201 "parse the private entity and regime"
for id in $(rj "b.results.map(r=>r.id).join(' ')"); do req POST "/api/account-research-results/$id/accept" '{"review_note":"Verification: the registry record.","citation_opened":true}'; done
[ "$(q "SELECT identifier_type || '|' || registry_jurisdiction FROM institution_entities WHERE institution_id = '$PRIV'")" = "registry|NZ" ] && ok "  ...pinned: a registry number, NZ" || bad "  ...private entity"
expect POST "/api/institutions/$PRIV/research-prompts" '{}' 201 "facts prompt for the private company"
rj b.prompt > "$W/pp2.txt"; PP2="$(rj b.prompt_id)"
grep -qF "A private company publishes little" "$W/pp2.txt" && grep -qF "is the EXPECTED answer" "$W/pp2.txt" && ok "  ...the prompt reads the regime: not-found is the expected answer for a private company (item 4's minimum)" || bad "  ...private prompt"
expect POST "/api/institutions/$PRIV/research-results" "$(envb "$PP2" "\"entity\":$PENT,\"facts\":[],\"not_found\":$NF_PRIV")" 201 "a facts response that is all not-found"
for id in $(rj "b.results.map(r=>r.id).join(' ')"); do req POST "/api/account-research-results/$id/accept" '{"review_note":"Verification: as expected for a private company."}'; done
expect GET "/api/institutions/$PRIV/research" "" 200 "GET research for the private company"
[ "$(rj "b.not_found.map(n=>n.kind).sort().join()")" = "headcount,revenue" ] && ok "  ...the record shows what research cannot reach, and why" || bad "  ...not_found: $(rj "JSON.stringify(b.not_found)")"

step "8. The page, in a browser"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Walk Fictional Filer $TS\"}}" 201 "an account for the walk"
WALK_INST="$(rj b.institution_id)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
walk() {  # MODE
  set +e  # pipefail would end the script on a failed walk before its code is read
  node scripts/lib/account_research_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$WALK_INST" "$X_EMAIL" "$PW" 2>&1 | tee "$W/walk.$1.log"; local rc=${PIPESTATUS[0]}; set -e
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
  # A walk that crashes prints no FAIL lines; its exit code is what says so.
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc — a crash is a failure (see $W/walk.$1.log)"
}
walk walk
walk create-link

step "9. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
expect POST "/api/institutions/$INST/research-prompts" '{}' 201 "a facts prompt for the breaks"
PB="$(rj b.prompt_id)"
# B1 — the entity check removed: a response about another entity is written.
edit "$ROUTE" "} else if (said && !sameEntity(said, pinned)) {" "} else if (said && false && !sameEntity(said, pinned)) {"
stop_server; start_server
expect POST "$PARSE" "$(envb "$PB" "\"entity\":${ENTITY/0000123456/0000999999},\"facts\":[$HC],\"not_found\":[]")" 201 "B1: without the entity check, a response about another entity is written — the check is what refuses it"
restore "$ROUTE"; stop_server; start_server
expect POST "$PARSE" "$(envb "$PB" "\"entity\":${ENTITY/0000123456/0000999999},\"facts\":[$HC],\"not_found\":[]")" 422 "B1 restored: refused again" "this response is about"
# B2 — the phase check removed: facts are written from an entity-phase prompt.
expect POST "/api/institutions/$WALK_INST/research-prompts" '{}' 201 "an entity-phase prompt on a fresh account" "" "$X"
q "SELECT 1" > /dev/null
PE="$(q "SELECT id FROM research_prompts WHERE institution_id = '$PRIV' AND phase = 'entity' ORDER BY generated_at LIMIT 1")"
edit "$ROUTE" "if (facts !== undefined && !(Array.isArray(facts) && facts.length === 0)) {" "if (false) {"
edit "$ROUTE" "if (pinned) issues.push(\`an entity is already pinned" "if (false) issues.push(\`an entity is already pinned"
stop_server; start_server
expect POST "/api/institutions/$PRIV/research-results" "$(envb "$PE" "\"entity\":$PENT,\"disclosure_regime\":$PREG,\"facts\":[$FACT_NZD],\"not_found\":[]")" 201 "B2: without the phase checks, an entity-phase response carrying facts is written — the checks are what refuse it"
restore "$ROUTE"; stop_server; start_server
# B3 — H1 on the server removed: accepted with no citation opened.
expect POST "$PARSE" "$(envb "$PB" "\"entity\":$ENTITY2,\"facts\":[${HC/4200/4300}],\"not_found\":[]")" 201 "a headcount for B3"
RB3="$(rj b.results[0].id)"
edit "$ROUTE" "if (c.found && (req.body as Record<string, unknown>)['citation_opened'] !== true) {" "if (false) {"
stop_server; start_server
expect POST "/api/account-research-results/$RB3/accept" '{"review_note":"Verification: B3, no citation opened."}' 200 "B3: without the server's H1 rule, a fact is accepted with no citation opened — the rule is what requires it"
restore "$ROUTE"; stop_server; start_server
# B4 — L8's writer removed: a parse refusal leaves no record.
edit "$ROUTE" "        if (refusalTenantId) await recordParseRefusal(pool, req, refusalTenantId, institutionId, err.issues);" "        void recordParseRefusal;"
stop_server; start_server
RB4="$(REF0 "$INST")"
expect POST "$PARSE" "$(envb "$PB" "\"entity\":$ENTITY2,\"facts\":[{\"kind\":\"revenue\"}],\"not_found\":[]")" 422 "B4: a refused parse without the L8 writer"
[ "$(REF0 "$INST")" = "$RB4" ] && ok "B4: no refusal recorded — the writer is what keeps L8" || bad "B4: a refusal was recorded anyway"
restore "$ROUTE"; stop_server; start_server
# B5 — the client's ticks removed: the server still refuses without citation_opened.
expect POST "/api/institutions/$WALK_INST/research-prompts" '{}' 201 "a facts prompt for the walk account"
PW5="$(rj b.prompt_id)"
# The walk corrected its account's entity: B5's fact names the corrected one.
WENT='{"legal_name":"Walk Fictional Holdings Inc.","identifier_type":"sec_cik","identifier":"0000777002","registry_jurisdiction":null,"source_kind":"public_filing","citation":"x","caveats":[]}'
expect POST "/api/institutions/$WALK_INST/research-results" "$(envb "$PW5" "\"entity\":$WENT,\"facts\":[$HC],\"not_found\":[]")" 201 "a pending headcount on the walk account"
edit "$CARDS" "const ready = note.trim() !== '' && (decision === 'reject' || !found || (caveatsRead && opened));" "const ready = note.trim() !== '';"
sleep 5; walk break-h1; restore "$CARDS"
# B6 — the correction's listing removed: the response no longer names the
# facts accepted under the previous entity.
expect POST "/api/institutions/$PRIV/research-prompts" '{}' 201 "(B6 setup) a facts prompt on the private company"
edit "$ROUTE" "        facts_accepted_under_previous_entity: underPrevious," "        facts_accepted_under_previous_entity: [],"
stop_server; start_server
expect POST "/api/institutions/$INST/entity/supersede" "$(CORR 'Verification Filer Group Ltd' 0000654322 'Verification: B6, a further correction.')" 201 "B6: a further correction with the listing removed"
[ "$(rj "b.facts_accepted_under_previous_entity.length")" = "0" ] && [ "$(q "SELECT count(*) FROM research_results r JOIN research_prompts p ON p.id = r.prompt_id WHERE p.entity_id = '$NEW_E' AND r.review_state = 'accepted' AND r.institution_fact_id IS NOT NULL")" -ge 1 ] \
  && ok "B6: facts were accepted under the superseded entity, and the response lists none — the listing is what tells the person" || bad "B6 not caught"
restore "$ROUTE"; stop_server; start_server
# B7 — the deferred one-current trigger dropped (rolled back): two current entities commit.
OUT="$(printf "BEGIN;\nDROP TRIGGER institution_entities_one_current ON institution_entities;\nINSERT INTO institution_entities (institution_id, legal_name, identifier_type, identifier, evidence_id, captured_by_person_id) SELECT '%s', 'A second current entity', 'ticker', 'ZZZ', id, '%s' FROM evidence WHERE institution_id = '%s' AND NOT EXISTS (SELECT 1 FROM institution_entities ie WHERE ie.evidence_id = evidence.id) LIMIT 1;\nSELECT 'current=' || count(*) FROM institution_entities WHERE institution_id = '%s' AND superseded_by_id IS NULL AND deleted_at IS NULL;\nROLLBACK;\n" "$INST" "$X" "$INST" "$INST" | psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "current=2" && ok "B7: without the deferred trigger, two current entities stand — the trigger is what holds one (rolled back)" || bad "B7: $OUT"
[ "$(q "SELECT count(*) FROM pg_trigger WHERE tgname = 'institution_entities_one_current'")" = "1" ] && ok "  ...after B7 the trigger is in place" || bad "  ...B7 left state"
for f in "$ROUTE" "$CARDS"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
