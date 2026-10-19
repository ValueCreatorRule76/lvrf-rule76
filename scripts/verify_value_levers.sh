#!/usr/bin/env bash
#
# O1 (Outputs band, LVRF_PLAN §5) — the derived D2 basis function
# (lvrf_evidence_basis, hardening section 21), runs sealing the account's
# facts and entity (3.0 item 10), value_levers and lever_offerings
# (migration 0035, steward acts, O-D2), and the pack page's levers and
# solutions. Local verification.
#
#   ./scripts/verify_value_levers.sh [screenshot_dir]
#
# Clone `lvrf_verifylevers` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated and
# hardened, dropped on exit. API with the header actor
# (LVRF_ALLOW_ACTOR_HEADER=1, this throwaway server only); the page through
# Vite and headless Chrome, signed in by SESSION (scripts/lib/
# pack_levers_walk.mjs). The basis rules are exercised on rows built in
# memory (jsonb_populate_record over one evidence row): no evidence is
# written to test them.
#
# DELIBERATE BREAKS edit a source file in place and restore it
# byte-identical (cmp); the EXIT trap restores them too. The basis break
# replaces the function on the clone and re-applies hardening.sql.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifylevers
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3075; VITE_PORT=5173; CDP_PORT=9333
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_levers.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ROUTE=server/routes/valueLevers.ts
RUNS=server/routes/produceRun.ts
CARDS=client/src/components/PackLevers.tsx
for f in "$ROUTE" "$RUNS" "$CARDS"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$ROUTE" "$RUNS" "$CARDS"; do
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
# Recompute a run's hash from its stored payload (payloadHash removed), as
# the server computes it; prints "id ok" or "id MISMATCH" per run.
rehash() {  # WHERE-clause on value_runs
  q "SELECT json_build_object('id', id, 'hash', payload_hash, 'payload', payload) FROM value_runs WHERE $1 ORDER BY id" > "$W/runs.jsonl"
  npx tsx -e "
    import('./server/spine/hash.ts').then((h) => {
      for (const line of require('fs').readFileSync('$W/runs.jsonl', 'utf8').split('\n').filter(Boolean)) {
        const r = JSON.parse(line); const p = { ...r.payload }; delete p.payloadHash;
        console.log(r.id + ' ' + (h.sha256Hex(p) === r.hash && r.payload.payloadHash === r.hash ? 'ok' : 'MISMATCH'));
      }
    });"
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate (0035), harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }
N_TRIG="$(q "SELECT count(DISTINCT trigger_name || '.' || event_object_table) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$N_TRIG" = "$EXPECT_TRIGGERS" ] && ok "$N_TRIG distinct triggers, as hardening.sql declares" || bad "triggers: $N_TRIG, expected $EXPECT_TRIGGERS"
[ "$(q "SELECT string_agg(trigger_name, ',' ORDER BY trigger_name) FROM (SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE event_object_table IN ('value_levers', 'lever_offerings')) t")" = "lever_offerings_audit,lever_offerings_no_delete,lever_offerings_steward_only,value_levers_audit,value_levers_no_delete,value_levers_steward_only,value_levers_supersession_sane,value_levers_touch" ] \
  && ok "value_levers: audit, no_delete, supersession_sane, touch (governed), steward_only; lever_offerings: audit, no_delete, steward_only (append-only)" || bad "triggers on the new tables: $(q "SELECT string_agg(DISTINCT trigger_name, ',') FROM information_schema.triggers WHERE event_object_table IN ('value_levers', 'lever_offerings')")"
[ "$(q "SELECT provolatile FROM pg_proc WHERE proname = 'lvrf_evidence_basis'")" = "s" ] && ok "lvrf_evidence_basis(evidence) exists, STABLE" || bad "basis function missing"
OUT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs || true)"
case "$OUT" in "schema drift: none"*) ok "D2: $OUT" ;; *) bad "D2: $OUT" ;; esac
PRE_RUNS="$(q "SELECT count(*) FROM value_runs")"
# Each run as the template database holds it, to show O1 changes none of them.
RUNS_SIG="SELECT md5(string_agg(id::text || payload::text || payload_hash, '|' ORDER BY id)) FROM value_runs"
TEMPLATE_RUNS="$(psql -X -At -d lvrf -c "$RUNS_SIG")"

step "3. Fixtures"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@levers.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant'), ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
read -r IND SLUG <<< "$(q "SELECT id || ' ' || slug FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
MEAS() { q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$1', '$2', '$3', 'incidents per 200,000 hours', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders.', 'Verification fixture, not a source.') RETURNING id" | head -1; }
E1="$(MEAS "$TEN" "$IND" "Levers E1 API (fixture)")"; E_WALK="$(MEAS "$TEN" "$IND" "Levers E2 walk (fixture)")"; E_RET="$(MEAS "$TEN" "$IND" "Levers E3 retired (fixture)")"
read -r IND_X TEN_X <<< "$(q "SELECT id || ' ' || tenant_id FROM industries WHERE tenant_id <> '$TEN' ORDER BY slug LIMIT 1")"
M_X="$(MEAS "$TEN_X" "$IND_X" "Other tenant entry (fixture)")"
P_X="$(q "SELECT id FROM persons WHERE tenant_id = '$TEN_X' ORDER BY created_at LIMIT 1")"
# The database lets only a tenant's steward propose a lever: P_X is made the other tenant's.
q "UPDATE tenants SET steward_person_id = '$P_X' WHERE id = '$TEN_X'" > /dev/null
LEVER_X="$(q "INSERT INTO value_levers (tenant_id, industry_measure_id, name, mechanism, leading_indicator, citation, proposed_by_person_id)
  VALUES ('$TEN_X', '$M_X', 'Other tenant lever (fixture)', 'Verification fixture.', 'Verification fixture.', 'Verification fixture, not a source.', '$P_X') RETURNING id" | head -1)"
SELF="$(q "SELECT id FROM institutions WHERE tenant_id = '$TEN' AND is_tenant_self LIMIT 1")"
for v in S TEN X IND SLUG E1 E_WALK E_RET IND_X TEN_X M_X P_X LEVER_X SELF; do [ -n "${!v}" ] || { bad "fixture $v is empty"; exit 1; }; done
ok "steward S ($S_NAME), authorized X; three manufacturing entries; another tenant's entry and lever; the tenant's own institution"
start_server && ok "API up on $PORT"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Levers account $TS\",\"industry_slug\":\"$SLUG\",\"classification_note\":\"Verification: classified for O1.\"},\"persons\":[{\"full_name\":\"Customer owner (verification)\",\"email\":\"owner.$TS@levers.example\",\"title\":\"Verification owner\"}]}" 201 "an account with a customer-side person"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
SIM="$(q "INSERT INTO persons (institution_id, full_name, email, simulated) VALUES ('$INST', 'Simulated customer (verification)', 'sim.$TS@levers.example', true) RETURNING id" | head -1)"
EV0="$(q "INSERT INTO evidence (institution_id, kind, summary, provenance, confidence, captured_by_person_id) VALUES ('$INST', 'observation', 'Basis rule fixture', 'Verification fixture, not a source', 'low', '$S') RETURNING id" | head -1)"
[ -n "$SIM" ] && [ -n "$EV0" ] && ok "a simulated customer person; one evidence row for the in-memory basis cases" || { bad "basis fixtures"; exit 1; }

step "4. The D2 basis: one function, ten rules, first match decides"
basis() { q "SELECT coalesce(lvrf_evidence_basis(jsonb_populate_record(e, '$1'::jsonb)), 'NULL') FROM evidence e WHERE e.id = '$EV0'"; }
rule() {  # LABEL OVERRIDES EXPECTED
  local got; got="$(basis "$2")"
  [ "$got" = "$3" ] && ok "$1 -> $got" || bad "$1 -> $got (expected $3)"
}
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rule "1 simulated, even a system export"                        '{"simulated":true,"kind":"system_export"}' assumed
rule "2 AI-sourced, citation unresolved, even a system export"  '{"ai_sourced":true,"citation_resolved":false,"kind":"system_export"}' assumed
rule "2 ...the same, citation resolved: rule 2 no longer holds"  '{"ai_sourced":true,"citation_resolved":true,"kind":"system_export"}' system_of_record
rule "3 system export"                                          '{"kind":"system_export"}' system_of_record
rule "4 public filing"                                          '{"kind":"public_filing"}' published
rule "5 attestation, customer-side attester, dated"            "{\"kind\":\"attestation\",\"attested_by_person_id\":\"$OWNER\",\"attested_at\":\"$NOW\"}" client_stated
rule "6 attestation, customer-side attester, undated"           "{\"kind\":\"attestation\",\"attested_by_person_id\":\"$OWNER\"}" assumed
rule "6 attestation, a SIMULATED customer attester, dated"     "{\"kind\":\"attestation\",\"attested_by_person_id\":\"$SIM\",\"attested_at\":\"$NOW\"}" assumed
rule "6 attestation, a vendor-side attester, dated"             "{\"kind\":\"attestation\",\"attested_by_person_id\":\"$S\",\"attested_at\":\"$NOW\"}" assumed
rule "7 vendor publication about the customer"                  '{"kind":"vendor_publication"}' inferred
rule "7 vendor publication about the tenant itself"             "{\"kind\":\"vendor_publication\",\"institution_id\":\"$SELF\"}" published
rule "8 artifact, customer-side attester"                       "{\"kind\":\"artifact\",\"attested_by_person_id\":\"$OWNER\"}" client_stated
rule "8 artifact, no attester"                                  '{"kind":"artifact"}' inferred
rule "9 observation with a source reference"                    '{"kind":"observation","source_reference":"Fixture page 3"}' inferred
rule "9 observation, no source reference"                       '{"kind":"observation","source_reference":null}' assumed
rule "9 observation, a blank source reference"                  '{"kind":"observation","source_reference":"   "}' assumed
rule "10 assessment result: outside the vocabulary"             '{"kind":"assessment_result"}' NULL
rule "source_verified does NOT raise the basis"                 '{"kind":"observation","source_reference":null,"source_verified":true}' assumed
rule "self-declared high confidence does NOT raise it"          '{"kind":"observation","source_reference":null,"confidence":"high"}' assumed
[ "$(q "SELECT count(*) FROM evidence WHERE id = '$EV0' AND kind = 'observation' AND NOT simulated")" = "1" ] && ok "  ...the evidence row itself is unchanged (cases built in memory)" || bad "  ...EV0 changed"

step "5. The basis where facts are read (/view) and walked (/walk)"
FACT() {  # KIND TEXT EVIDENCE_KIND [EXTRA JSON]
  printf '{"kind":"%s","value_text":"%s","as_of":"2026-09-30","evidence_kind":"%s","confidence":"medium","provenance":"Verification fixture, not a source"%s}' "$1" "$2" "$3" "${4:-}"
}
expect POST "/api/institutions/$INST/facts" "$(FACT system 'Fixture HRIS (filing)' public_filing)" 201 "a fact on a public filing"
expect POST "/api/institutions/$INST/facts" "$(FACT stated_priority 'Fixture priority (observed, cited)' observation ',"source_reference":"Fixture careers page"')" 201 "a fact on an observation with a source reference"
expect POST "/api/institutions/$INST/facts" "$(FACT system 'Fixture LMS (observed, no reference)' observation)" 201 "a fact on an observation with none"
F_FILING="$(q "SELECT id FROM institution_facts WHERE institution_id = '$INST' AND value_text = 'Fixture HRIS (filing)'")"
expect GET "/api/institutions/$INST/view" "" 200 "the account view"
[ "$(rj "b.facts.map(f=>f.value_text+'='+f.basis).sort().join('|')")" = "Fixture HRIS (filing)=published|Fixture LMS (observed, no reference)=assumed|Fixture priority (observed, cited)=inferred" ] \
  && ok "  ...each fact carries the function's basis: published, assumed, inferred" || bad "  ...$(rj "JSON.stringify(b.facts.map(f=>[f.value_text,f.basis]))")"
[ "$(q "SELECT string_agg(lvrf_evidence_basis(e), ',' ORDER BY f.value_text) FROM institution_facts f JOIN evidence e ON e.id = f.evidence_id WHERE f.institution_id = '$INST'")" = "published,assumed,inferred" ] \
  && ok "  ...the same answer as the function in SQL, row by row" || bad "  ...SQL disagrees"

step "6. A run seals the account's facts and entity, with their basis, under its hash"
EV_ENT="$(q "INSERT INTO evidence (institution_id, kind, summary, provenance, confidence, captured_by_person_id) VALUES ('$INST', 'public_filing', 'Entity fixture', 'Verification fixture registry extract, not a source', 'medium', '$S') RETURNING id" | head -1)"
q "INSERT INTO institution_entities (institution_id, legal_name, identifier_type, identifier, evidence_id, captured_by_person_id) VALUES ('$INST', 'Levers Fixture Corp', 'sec_cik', '0000000042', '$EV_ENT', '$S')" > /dev/null
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Levers capability\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: attached for O1.\"}" 201 "an offering creates a capability"
expect POST "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"Levers engagement\",\"engagement_owner_person_id\":\"$OWNER\",\"capability_name\":\"Levers capability\",\"metric\":{\"name\":\"Levers TRIR $TS\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"verification system of record\",\"owner_person_id\":\"$OWNER\"},\"baseline_value\":0,\"baseline_measured_at\":\"2026-09-30T00:00:00Z\"}" 201 "an outcome, baseline 0 (zero is data)"
OUTC="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"
expect POST "/api/value-outcomes/$OUTC/evidence" '{"kind":"public_filing","provenance":"Fixture disclosures, page 21 (not a source)","summary":"Baseline fixture","supports":"baseline","confidence":"medium","source_verified":false,"ai_sourced":false,"simulated":false}' 201 "outcome evidence on a public filing"
expect POST "/api/engagements/$ENG/produce-run" '{"note":"Verification: O1 run one.","source_fixture":"verify_value_levers_1"}' 201 "produce run one"
R1="$(rj b.value_run_id)"
[ "$(q "SELECT payload->'entity'->>'legalName' || '|' || (payload->'entity'->>'identifier') || '|' || (payload->'entity'->>'basis') FROM value_runs WHERE id = '$R1'")" = "Levers Fixture Corp|0000000042|published" ] \
  && ok "  ...the entity is sealed: legal name, identifier, basis published" || bad "  ...entity: $(q "SELECT payload->'entity' FROM value_runs WHERE id = '$R1'")"
[ "$(q "SELECT string_agg((f->>'valueText') || '=' || (f->>'basis') || '/' || (f->>'evidenceKind'), '|' ORDER BY f->>'valueText') FROM value_runs, jsonb_array_elements(payload->'institutionFacts') f WHERE id = '$R1'")" = "Fixture HRIS (filing)=published/public_filing|Fixture LMS (observed, no reference)=assumed/observation|Fixture priority (observed, cited)=inferred/observation" ] \
  && ok "  ...all three current facts are sealed, each with its basis and evidence kind" || bad "  ...facts: $(q "SELECT payload->'institutionFacts' FROM value_runs WHERE id = '$R1'")"
[ "$(q "SELECT string_agg(ev->>'basis', ',') FROM value_runs, jsonb_array_elements(payload->'evidence') ev WHERE id = '$R1'")" = "published" ] \
  && ok "  ...the outcome evidence in the run carries its basis too" || bad "  ...evidence basis: $(q "SELECT payload->'evidence' FROM value_runs WHERE id = '$R1'")"
[ "$(rehash "id = '$R1'")" = "$R1 ok" ] && ok "  ...and the hash covers them: recomputed from the stored payload, it matches" || bad "  ...hash: $(rehash "id = '$R1'")"
H1="$(q "SELECT payload_hash FROM value_runs WHERE id = '$R1'")"
expect POST "/api/institutions/$INST/facts/$F_FILING/supersede" "$(FACT system 'Fixture HRIS (corrected)' public_filing ',"supersession_reason":"Verification: the filing named a different system."')" 201 "the filing fact is corrected after run one"
expect POST "/api/engagements/$ENG/produce-run" '{"note":"Verification: O1 run two.","source_fixture":"verify_value_levers_2"}' 201 "produce run two"
R2="$(rj b.value_run_id)"
[ "$(q "SELECT (payload->'institutionFacts')::text LIKE '%Fixture HRIS (corrected)%' AND (payload->'institutionFacts')::text NOT LIKE '%Fixture HRIS (filing)%' FROM value_runs WHERE id = '$R2'")" = "t" ] \
  && ok "  ...run two seals the correction" || bad "  ...run two"
[ "$(q "SELECT (payload->'institutionFacts')::text LIKE '%Fixture HRIS (filing)%' AND payload_hash = '$H1' FROM value_runs WHERE id = '$R1'")" = "t" ] && [ "$(rehash "id = '$R1'")" = "$R1 ok" ] \
  && ok "  ...run one still shows the fact as it was when produced, hash unchanged" || bad "  ...run one changed"
OLD="$(q "SELECT count(*) || '/' || count(*) FILTER (WHERE payload ? 'institutionFacts' OR payload ? 'entity') FROM value_runs WHERE id NOT IN ('$R1', '$R2')")"
[ "$OLD" = "$PRE_RUNS/0" ] && [ "$(q "${RUNS_SIG/FROM value_runs/FROM value_runs WHERE id NOT IN ('$R1', '$R2')}")" = "$TEMPLATE_RUNS" ] \
  && ok "  ...the $PRE_RUNS runs produced before O1 carry neither key, and are byte-identical to the template's (payload and hash)" || bad "  ...older runs: $OLD"
# Reported, not asserted: runs whose stored payload does not recompute to
# their hash were so in the template already (seed runs of 1 Aug 2026).
echo "  info  pre-O1 runs that do not recompute to their stored hash: $(rehash "id NOT IN ('$R1', '$R2')" | grep -vc ' ok$' || true) of $PRE_RUNS (as in the template; not O1's)"

step "7. Levers: POST /api/industry-measures/:id/levers (steward)"
LV() { printf '{"name":"%s","mechanism":"%s","leading_indicator":"%s","citation":"%s"}' "$1" "${2:-Supervisors trained in hazard recognition stop unsafe tasks earlier.}" "${3:-Near-miss reports per 100 workers}" "${4:-Verification citation, not a source.}"; }
expect POST "/api/industry-measures/$E1/levers" "$(LV 'Hazard recognition')" 403 "a non-steward" "Proposing a value lever is the steward's act" "$X"
expect POST "/api/industry-measures/not-a-uuid/levers" "$(LV 'Hazard recognition')" 400 "a malformed id"
expect POST "/api/industry-measures/$M_X/levers" "$(LV 'Hazard recognition')" 404 "another tenant's entry" "industry measure $M_X not found"
expect POST "/api/industry-measures/$E_RET/retire" '{"retirement_reason":"Verification: retired for the lever case."}' 200 "(an entry is retired)"
expect POST "/api/industry-measures/$E_RET/levers" "$(LV 'Hazard recognition')" 409 "a lever on a retired entry" "not a current pack entry"
AUD0="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"
expect POST "/api/industry-measures/$E1/levers" '{}' 422 "nothing stated: every field named" "body.name is required | body.mechanism must state"
expect POST "/api/industry-measures/$E1/levers" "$(LV 'Hazard recognition' 'trains them' 'x' 'short')" 422 "a mechanism and citation under 12 characters" "body.citation must state the source of the lever, in at least 12 characters"
REF0="$(q "SELECT count(*) FROM refusals")"
expect POST "/api/industry-measures/$E1/levers" '{"name":"x","mechanism":"Supervisors trained in hazard recognition stop unsafe tasks.","leading_indicator":"x","citation":"Verification citation.","effect_size":0.4}' 400 "an effect_size sent with a lever: refused" "body.effect_size: a value lever carries no effect size or target"
[ "$(q "SELECT source || '|' || endpoint || '|' || subject_table || '|' || actor_person_id || '|' || tenant_id || '|' || (sqlstate IS NULL) || '|' || (attempted_payload->>'effect_size') || '|' || (message LIKE '%no effect size%') FROM refusals ORDER BY refused_at DESC, id DESC LIMIT 1")" = "route|POST /api/industry-measures/:id/levers|value_levers|$S|$TEN|true|0.4|true" ] \
  && ok "  ...recorded in refusals: source route, the endpoint, the steward, the tenant, no sqlstate, the payload as sent, the reason" || bad "  ...refusal row: $(q "SELECT source, endpoint, message, attempted_payload FROM refusals ORDER BY refused_at DESC, id DESC LIMIT 1")"
expect POST "/api/industry-measures/$E1/levers" '{"name":"x","mechanism":"Supervisors trained in hazard recognition stop unsafe tasks.","leading_indicator":"x","citation":"Verification citation.","target_value":12}' 400 "a target_value: refused the same way" "body.target_value: a value lever carries no effect size"
expect POST "/api/industry-measures/$E1/levers" '{"name":"x","mechanism":"Supervisors trained in hazard recognition stop unsafe tasks.","leading_indicator":"x","citation":"Verification citation.","colour":"gold"}' 400 "any field the route does not take: refused" "body.colour is not a field of this request"
[ "$(q "SELECT count(*) FROM refusals") $(q "SELECT count(*) FROM value_levers WHERE name = 'x'")" = "$((REF0 + 3)) 0" ] && ok "  ...three refusal rows; no lever written" || bad "  ...refusals $(q "SELECT count(*) FROM refusals") (from $REF0), levers named x: $(q "SELECT count(*) FROM value_levers WHERE name = 'x'")"
[ "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name = 'value_levers' AND column_name ~ 'effect|target|size|impact'")" = "0" ] && ok "  ...value_levers has no column for one to land in" || bad "  ...value_levers has an effect-like column"
expect POST "/api/industry-measures/$E1/levers" "$(LV 'Hazard recognition')" 201 "the steward proposes a lever"
LEVER="$(rj b.value_lever_id)"
[ "$(q "SELECT status || '|' || proposed_by_person_id || '|' || tenant_id || '|' || industry_measure_id FROM value_levers WHERE id = '$LEVER'")" = "proposed|$S|$TEN|$E1" ] && ok "  ...row: proposed, by the steward, the entry's tenant and entry" || bad "  ...row"
[ "$(q "SELECT count(*) FROM audit_log WHERE id > $AUD0 AND table_name = 'value_levers' AND record_id = '$LEVER' AND actor_person_id = '$S'")" = "1" ] && ok "  ...audited, the steward as actor" || bad "  ...not audited"
[ "$(q "SELECT count(*) FROM audit_log WHERE id > $AUD0 AND table_name = 'value_levers'")" = "1" ] && ok "  ...the refused requests wrote nothing (one insert audited: this one)" || bad "  ...audit rows: $(q "SELECT count(*) FROM audit_log WHERE id > $AUD0 AND table_name = 'value_levers'")"
expect POST "/api/industry-measures/$E1/levers" "$(LV '  hazard RECOGNITION ')" 409 "the same name again (trimmed, any case)" "already has a current lever named"

step "8. Solutions: POST /api/value-levers/:id/offerings (steward)"
LO() { printf '{"offering_key":"%s","basis":"%s"}' "$1" "${2:-Hazard-recognition courses train exactly this behaviour.}"; }
expect POST "/api/value-levers/$LEVER/offerings" "$(LO skillsoft_compliance_suite)" 403 "a non-steward" "Linking a solution to a lever is the steward's act" "$X"
expect POST "/api/value-levers/$LEVER_X/offerings" "$(LO skillsoft_compliance_suite)" 404 "another tenant's lever" "value lever $LEVER_X not found"
expect POST "/api/value-levers/$LEVER/offerings" "$(LO no_such_offering)" 422 "an offering not in the catalog" "is not a current offering in this tenant's catalog"
expect POST "/api/value-levers/$LEVER/offerings" "$(LO skillsoft_compliance_suite 'it helps')" 422 "a basis under 12 characters" "in at least 12 characters"
AUD1="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"
expect POST "/api/value-levers/$LEVER/offerings" "$(LO skillsoft_compliance_suite)" 201 "the steward links the compliance suite"
LINK="$(rj b.lever_offering_id)"
[ "$(q "SELECT count(*) FROM audit_log WHERE id > $AUD1 AND table_name = 'lever_offerings' AND record_id = '$LINK' AND actor_person_id = '$S'")" = "1" ] && ok "  ...audited, the steward as actor" || bad "  ...not audited"
expect POST "/api/value-levers/$LEVER/offerings" "$(LO skillsoft_compliance_suite 'Linked a second time, verification.')" 409 "the same link again" "is not repeated"
expect POST "/api/value-levers/$LEVER/offerings" "$(LO skillsoft_percipio_platform 'The platform delivers the hazard-recognition paths.')" 201 "a second solution on the same lever"
LINK2="$(rj b.lever_offering_id)"
expect POST "/api/value-levers/$LEVER/offerings" '{"offering_key":"skillsoft_compliance_suite","basis":"Hazard-recognition courses train exactly this behaviour.","expected_uplift":"20%"}' 400 "an expected_uplift on a link: refused" "body.expected_uplift: a value lever carries no effect size"

step "8b. Withdrawal: never deleted, and it stays visible"
RETW='{"retirement_reason":"Verification: the mechanism was not testable."}'
expect POST "/api/industry-measures/$E1/levers" "$(LV 'A lever to withdraw')" 201 "(a second lever, to withdraw)"
LEVER_OLD="$(rj b.value_lever_id)"
expect POST "/api/value-levers/$LEVER_OLD/offerings" "$(LO skillsoft_compliance_suite)" 201 "(a solution on it)"
expect POST "/api/value-levers/$LEVER_OLD/retire" "$RETW" 403 "a non-steward withdraws a lever" "Withdrawing a value lever is the steward's act" "$X"
expect POST "/api/value-levers/$LEVER_X/retire" "$RETW" 404 "another tenant's lever" "value lever $LEVER_X not found"
expect POST "/api/value-levers/$LEVER_OLD/retire" '{"retirement_reason":"too short"}' 422 "a reason under 12 characters" "in at least 12 characters"
expect POST "/api/value-levers/$LEVER_OLD/retire" '{"retirement_reason":"Verification: a target sent along.","target":1}' 400 "a withdrawal carrying a target field" "body.target: a value lever carries no effect size"
AUD2="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"
expect POST "/api/value-levers/$LEVER_OLD/retire" "$RETW" 200 "the steward withdraws the lever"
[ "$(q "SELECT status || '|' || (deleted_at IS NOT NULL) || '|' || retired_by_person_id || '|' || retirement_reason FROM value_levers WHERE id = '$LEVER_OLD'")" = "retired|true|$S|Verification: the mechanism was not testable." ] \
  && ok "  ...the row stays: status retired, deleted_at, who, why" || bad "  ...row: $(q "SELECT status, deleted_at, retired_by_person_id, retirement_reason FROM value_levers WHERE id = '$LEVER_OLD'")"
[ "$(q "SELECT count(*) FROM audit_log WHERE id > $AUD2 AND table_name = 'value_levers' AND record_id = '$LEVER_OLD' AND actor_person_id = '$S'")" = "1" ] && ok "  ...audited, the steward as actor" || bad "  ...not audited"
expect POST "/api/value-levers/$LEVER_OLD/retire" "$RETW" 409 "withdrawing it again" "was already withdrawn by $S_NAME"
expect POST "/api/value-levers/$LEVER_OLD/offerings" "$(LO skillsoft_percipio_platform)" 409 "a new link on a withdrawn lever" "is not current"
[ "$(q "SELECT count(*) FILTER (WHERE retired_at IS NULL) FROM lever_offerings WHERE value_lever_id = '$LEVER_OLD'")" = "1" ] && ok "  ...its existing link stays, as recorded" || bad "  ...links of the withdrawn lever"
expect POST "/api/lever-offerings/$LINK2/retire" "$RETW" 403 "a non-steward withdraws a link" "Withdrawing a solution from a lever is the steward's act" "$X"
expect POST "/api/lever-offerings/$LINK2/retire" '{"retirement_reason":"Verification: the platform alone does not train it."}' 200 "the steward withdraws the percipio link"
[ "$(q "SELECT (retired_at IS NOT NULL) || '|' || retired_by_person_id || '|' || retirement_reason || '|' || basis FROM lever_offerings WHERE id = '$LINK2'")" = "true|$S|Verification: the platform alone does not train it.|The platform delivers the hazard-recognition paths." ] \
  && ok "  ...the row stays: retired_at, who, why; its basis untouched" || bad "  ...link row"
expect POST "/api/lever-offerings/$LINK2/retire" "$RETW" 409 "withdrawing it again" "was already withdrawn by $S_NAME"
expect POST "/api/value-levers/$LEVER/offerings" "$(LO skillsoft_percipio_platform 'Relinked: the platform now carries the hazard paths.')" 201 "a withdrawn pair linked again: a NEW row"
[ "$(q "SELECT count(*) || '/' || count(*) FILTER (WHERE retired_at IS NULL) FROM lever_offerings lo JOIN offerings o ON o.id = lo.offering_id WHERE lo.value_lever_id = '$LEVER' AND o.offering_key = 'skillsoft_percipio_platform'")" = "2/1" ] \
  && ok "  ...two rows for the pair: one withdrawn, one current" || bad "  ...pair rows"

step "9. The database holds it, whatever the route does"
sqlrefused() {  # LABEL SQL NEEDLE
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1: refused ($3)" || bad "$1: $out"
}
sqlrefused "DELETE a link" "DELETE FROM lever_offerings WHERE id = '$LINK'" "lever_offerings"
sqlrefused "DELETE a lever" "DELETE FROM value_levers WHERE id = '$LEVER'" "value_levers"
sqlrefused "edit a link's basis (append-only)" "UPDATE lever_offerings SET basis = 'A rewritten basis, after the fact.' WHERE id = '$LINK'" "only the withdrawal may be written after a link is made"
sqlrefused "amend a withdrawn link" "UPDATE lever_offerings SET retirement_reason = 'A different reason, later.' WHERE id = '$LINK2'" "is already withdrawn; a withdrawal is not amended"
sqlrefused "a link withdrawn by a non-steward" "UPDATE lever_offerings SET retired_at = now(), retired_by_person_id = '$X', retirement_reason = 'Verification: by X directly.' WHERE id = '$LINK'" "only the tenant's steward may withdraw a link"
sqlrefused "a lever proposed by a non-steward" "INSERT INTO value_levers (tenant_id, industry_measure_id, name, mechanism, leading_indicator, citation, proposed_by_person_id) VALUES ('$TEN', '$E1', 'y', 'A mechanism long enough.', 'x', 'Verification citation.', '$X')" "only the tenant's steward may propose a lever"
sqlrefused "a lever whose tenant is not its entry's" "INSERT INTO value_levers (tenant_id, industry_measure_id, name, mechanism, leading_indicator, citation, proposed_by_person_id) VALUES ('$TEN', '$M_X', 'y', 'A mechanism long enough.', 'x', 'Verification citation.', '$S')" "a lever's tenant is its pack entry's"
sqlrefused "a link made by a non-steward" "INSERT INTO lever_offerings (tenant_id, value_lever_id, offering_id, basis, linked_by_person_id) SELECT '$TEN', '$LEVER', id, 'A basis long enough.', '$X' FROM offerings WHERE tenant_id = '$TEN' AND offering_key = 'skillsoft_percipio_platform'" "only the tenant's steward may link a solution"
sqlrefused "a lever withdrawn by a non-steward" "UPDATE value_levers SET deleted_at = now(), status = 'retired', retired_by_person_id = '$X', retirement_reason = 'Verification: by X directly.' WHERE id = '$LEVER'" "only the tenant's steward may withdraw a lever"
sqlrefused "a lever 'withdrawn' with no who or why" "UPDATE value_levers SET deleted_at = now(), status = 'retired' WHERE id = '$LEVER'" "value_levers_retirement_is_complete"
sqlrefused "a lever with an 11-character mechanism" "INSERT INTO value_levers (tenant_id, industry_measure_id, name, mechanism, leading_indicator, citation, proposed_by_person_id) VALUES ('$TEN', '$E1', 'y', 'eleven char', 'x', 'Verification citation.', '$S')" "value_levers_stated"
sqlrefused "a lever with no citation" "INSERT INTO value_levers (tenant_id, industry_measure_id, name, mechanism, leading_indicator, citation, proposed_by_person_id) VALUES ('$TEN', '$E1', 'y', 'A mechanism long enough.', 'x', ' ', '$S')" "value_levers_stated"
sqlrefused "a link with a short basis" "INSERT INTO lever_offerings (tenant_id, value_lever_id, offering_id, basis, linked_by_person_id) SELECT '$TEN', '$LEVER', id, 'short', '$S' FROM offerings WHERE tenant_id = '$TEN' AND offering_key = 'skillsoft_percipio_platform'" "lever_offerings_basis_stated"
sqlrefused "the same link twice" "INSERT INTO lever_offerings (tenant_id, value_lever_id, offering_id, basis, linked_by_person_id) SELECT '$TEN', '$LEVER', id, 'A basis long enough.', '$S' FROM offerings WHERE tenant_id = '$TEN' AND offering_key = 'skillsoft_compliance_suite'" "lever_offerings_pair_key"
[ "$(q "SELECT count(*) || '/' || count(*) FILTER (WHERE retired_at IS NULL) FROM lever_offerings WHERE value_lever_id = '$LEVER'")" = "3/2" ] && [ "$(q "SELECT deleted_at IS NULL FROM value_levers WHERE id = '$LEVER'")" = "t" ] \
  && ok "  ...after all of them: the lever current, its three links as recorded (one withdrawn)" || bad "  ...links"

step "10. The pack GET: levers per entry, solutions per lever, the catalog"
expect GET "/api/industries/$SLUG/pack" "" 200 "the pack"
# Single-quoted, ids from the environment: inline, bash brace-expands the {...,...} body.
E1_PACK='(()=>{const m=b.measures.find(m=>m.id===process.env.E1);const l=m.levers.find(l=>l.id===process.env.LEVER);return [m.levers.length,m.levers[0].id===process.env.LEVER,l.name,l.status,l.proposed_by,l.solutions.map(s=>s.offering_key+":"+(s.evidence_class!=null)+":"+(s.verification_source!=null)+":"+s.linked_by+":"+(s.withdrawn_by||"-")).join("+")].join("|")})()'
GOT="$(E1="$E1" LEVER="$LEVER" rj "$E1_PACK")"
[ "$GOT" = "2|true|Hazard recognition|proposed|$S_NAME|skillsoft_compliance_suite:true:true:$S_NAME:-+skillsoft_percipio_platform:true:true:$S_NAME:-+skillsoft_percipio_platform:true:true:$S_NAME:$S_NAME" ] \
  && ok "  ...E1: the current lever first; its solutions, each with what it can evidence and who linked it, the withdrawn link last and marked" || bad "  ...got: $GOT"
OLD_PACK='(()=>{const l=b.measures.find(m=>m.id===process.env.E1).levers[1];return [l.id===process.env.LEVER_OLD,l.status,l.withdrawn_by,l.withdrawal_reason,l.withdrawn_at!==null,l.solutions.length].join("|")})()'
GOT="$(E1="$E1" LEVER_OLD="$LEVER_OLD" rj "$OLD_PACK")"
[ "$GOT" = "true|retired|$S_NAME|Verification: the mechanism was not testable.|true|1" ] && ok "  ...the withdrawn lever stays visible, after it: who, why, when, and its solution" || bad "  ...withdrawn lever: $GOT"
[ "$(rj "b.measures.filter(m=>m.id!=='$E1').every(m=>Array.isArray(m.levers))")" = "true" ] && [ "$(rj "b.measures.find(m=>m.id==='$E_WALK').levers.length")" = "0" ] && ok "  ...every entry carries levers, empty where none" || bad "  ...levers missing"
[ "$(rj "b.offerings.map(o=>o.offering_key).sort().join(',')")" = "$(q "SELECT string_agg(offering_key, ',' ORDER BY offering_key) FROM offerings WHERE tenant_id = '$TEN' AND deleted_at IS NULL AND superseded_by_id IS NULL")" ] \
  && ok "  ...the catalog: exactly the tenant's current offerings" || bad "  ...catalog"
[ "$(rj "JSON.stringify(b).includes('Other tenant lever')")" = "false" ] && ok "  ...nothing of the other tenant's" || bad "  ...another tenant's lever leaked"
expect GET "/api/industries/$SLUG/pack" "" 200 "the pack, read by X (authorized)" "" "$X"
[ "$(rj "b.measures.find(m=>m.id==='$E1').levers.length")" = "2" ] && ok "  ...X reads the same levers" || bad "  ...X's read"

step "11. The page, in a browser"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
walk() {  # MODE ENTRY_NAME
  set +e  # pipefail would end the script on a failed walk before its code is read
  node scripts/lib/pack_levers_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$SLUG" "$S_EMAIL" "$X_EMAIL" "$PW" "$2" "$S_NAME" 2>&1 | tee "$W/walk.$1.log"; local rc=${PIPESTATUS[0]}; set -e
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
  # A walk that crashes prints no FAIL lines; its exit code is what says so.
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc — a crash is a failure (see $W/walk.$1.log)"
}
walk steward "Levers E2 walk (fixture)"
walk nonsteward "Levers E2 walk (fixture)"

step "12. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
# B1 — a basis rule removed (rule 2, on the clone): an unresolved AI figure
# from a "system export" reads as system of record.
python3 - "$W/basis_break.sql" <<'PY'
import re, sys
s = open('db/hardening.sql').read()
fn = re.search(r"CREATE OR REPLACE FUNCTION lvrf_evidence_basis.*?\n\$\$;\n", s, re.S).group(0)
a = "    WHEN e.ai_sourced AND NOT e.citation_resolved THEN 'assumed'\n"
assert fn.count(a) == 1
open(sys.argv[1], 'w').write(fn.replace(a, ""))
PY
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/basis_break.sql" > /dev/null
[ "$(basis '{"ai_sourced":true,"citation_resolved":false,"kind":"system_export"}')" = "system_of_record" ] \
  && ok "B1: without rule 2, an unresolved AI figure is 'system_of_record' — rule 2 is what floors it" || bad "B1: the break did not show"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && [ "$(basis '{"ai_sourced":true,"citation_resolved":false,"kind":"system_export"}')" = "assumed" ] \
  && ok "  ...hardening.sql re-applied: rule 2 back, 'assumed'" || bad "  ...B1 restore"
# B2 — fact sealing removed: a run no longer carries the facts or entity.
python3 - "$RUNS" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read(); a = "        entity,\n        institutionFacts,\n"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, ""))
PY
stop_server; start_server
expect POST "/api/engagements/$ENG/produce-run" '{"note":"Verification: B2.","source_fixture":"verify_value_levers_b2"}' 201 "B2: produce a run without the sealing"
RB="$(rj b.value_run_id)"
[ "$(q "SELECT (payload ? 'institutionFacts')::text || (payload ? 'entity')::text FROM value_runs WHERE id = '$RB'")" = "falsefalse" ] \
  && ok "B2: the run carries no facts and no entity — the two payload keys are what seal them" || bad "B2: $(q "SELECT payload ? 'institutionFacts' FROM value_runs WHERE id = '$RB'")"
restore "$RUNS"; stop_server
# B3 — the lever route's tenant check removed. The database still refuses:
# the steward of this tenant is not the other tenant's (value_levers_steward_only).
python3 - "$ROUTE" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read(); a = "if (!m || isOtherTenant(req, m.tenant_id, { table: 'industry_measures', id: measureId })) {"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, "if (!m) {"))
PY
start_server
expect POST "/api/industry-measures/$M_X/levers" "$(LV 'Cross-tenant lever (B3)')" 422 "B3: without the route's tenant check, the DATABASE refuses the cross-tenant lever (a 422 that names the other tenant's entry, where the route answers 404)" "only the tenant's steward may propose a lever"
[ "$(q "SELECT count(*) FROM value_levers WHERE industry_measure_id = '$M_X' AND name LIKE 'Cross-tenant%'")" = "0" ] && ok "  ...nothing written" || bad "  ...a cross-tenant lever was written"
restore "$ROUTE"; stop_server; start_server
expect POST "/api/industry-measures/$M_X/levers" "$(LV 'Cross-tenant lever (B3, again)')" 404 "  ...restored: 404 again"
# B4 — the client's steward gate removed: X can open the form; the server still refuses.
python3 - "$CARDS" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read(); a = "return actor?.is_steward ? undefined"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, "return true ? undefined"))
PY
sleep 3; walk break-gate "Levers E2 walk (fixture)"; restore "$CARDS"
# B5 — lever_offerings_steward_only dropped (rolled back): a link's basis is rewritten after the fact.
OUT="$(printf 'BEGIN;\nDROP TRIGGER lever_offerings_steward_only ON lever_offerings;\nUPDATE lever_offerings SET basis = %s WHERE id = %s;\nROLLBACK;\n' "'A rewritten basis, after the fact.'" "'$LINK'" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "UPDATE 1" && ok "B5: without lever_offerings_steward_only, a link's basis is rewritten — the trigger is what keeps it append-only (rolled back)" || bad "B5: $OUT"
[ "$(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_name = 'lever_offerings_steward_only'")$(q "SELECT basis FROM lever_offerings WHERE id = '$LINK'")" = "2Hazard-recognition courses train exactly this behaviour." ] && ok "  ...after B5: the trigger in place, the basis as linked" || bad "  ...B5 left state"
for f in "$ROUTE" "$RUNS" "$CARDS"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
