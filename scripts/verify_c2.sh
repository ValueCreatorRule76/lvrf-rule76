#!/usr/bin/env bash
#
# C2 — what a commitment's and a verification's attestation supports (LVRF_PLAN §11; migration
# 0042; Brad's ruling and C2-D1–D3, 25 Oct 2026; and his ruling after the dry run: an erratum is
# recorded NOT RECOMPUTED, saying why, when the seal cannot be reproduced). Local verification.
#
#   ./scripts/verify_c2.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data neutralised) to
# `lvrf_verifyc2` with make_clone, migrated (through 0042) and hardened, dropped on exit.
# L39: every fixture is the script's own, built through the routes. Curia's shape (a commitment's
# attestation linked as the impact basis, sealed in locked runs) is built by running the pre-C2
# commit itself: the script puts commit's old 'impact_basis' line back, commits two fixture
# outcomes, and restores the file. That edit is also the break "commit linking impact_basis again".
# Nothing is asserted on what prod holds; the dry run's lines for the clone's own Curia runs are
# printed as NOTEs.
# C3 (0043, model 1.0.1): the Curia-shaped runs are sealed by the pre-C3 code itself (produceRun.ts and
# confidenceModel.ts as at 42e7fe4, put back for the sealing and restored), so they carry model 1.0.0 and no
# sealed attester, as Curia's do; their errata recompute under the kept 1.0.0 scorer.
# DELIBERATE BREAKS, every file restored byte-identical, the clone's CHECK restored by re-adding it:
#   B1  the supports CHECK without the new values (on the clone): commit refuses, in words, and writes nothing
#   B2  commit linking impact_basis again (the pre-C2 line): the commit check catches it
#   B3  factor 4 grading target_commitment: the model check catches it
#   B4  the dry run writing a row: its READ ONLY transaction refuses it
#   B5  an erratum with a typed score: refused
#   B6  the not-recomputed erratum without the seal's factor line: the erratum check catches it
#   B7  (C2b) the run-page correction re-offering a corrected link: the shared run's check catches it

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
command -v pdftotext > /dev/null && command -v pdfinfo > /dev/null || { echo "REFUSING: pdftotext/pdfinfo (poppler) not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyc2
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3101; VITE_PORT=5201; CDP_PORT=9361
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_c2.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
WALK=server/routes/outcomeWalk.ts; MODELF=server/spine/confidenceModel.ts; REPORT=scripts/report_c2_errata.ts; RECOMP=server/lib/recomputeRun.ts
BENCH=client/src/components/workbench/Workbench.tsx; PRODUCE=server/routes/produceRun.ts; PRE_C3=42e7fe4
EDITED=("$WALK" "$MODELF" "$REPORT" "$RECOMP" "$BENCH" "$PRODUCE")
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
J() { node -e 'const a=process.argv.slice(1);const o={};for(let i=0;i<a.length;i+=2){let v=a[i+1];try{if(/^[\[{]|^-?\d+(\.\d+)?$|^(true|false|null)$/.test(v))v=JSON.parse(v)}catch{}o[a[i]]=v}console.log(JSON.stringify(o))' "$@"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
pre_c3() {  # the pre-C3 code itself, for sealing runs under model 1.0.0
  git show "$PRE_C3:$PRODUCE" > "$PRODUCE"; git show "$PRE_C3:$MODELF" > "$MODELF"; stop_server; start_server
}
post_c3() { restore "$PRODUCE"; restore "$MODELF"; stop_server; start_server; }
links_of() { q "SELECT coalesce(string_agg(e.kind || ':' || voe.supports, ',' ORDER BY e.kind, voe.supports), '') FROM value_outcome_evidence voe JOIN evidence e ON e.id = voe.evidence_id WHERE voe.value_outcome_id = '$1' AND voe.withdrawn_at IS NULL AND e.kind = 'attestation'"; }

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc.log")"
(cd client && npx tsc -b) > "$W/tsc2.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc2.log")"

step "2. C2-D1: the model's fingerprint, measured (C3: 1.0.1 current, 1.0.0 kept)"
FP="$(npx tsx -e "import('./server/spine/confidenceModel.ts').then(m=>console.log(m.MODEL_VERSION + ' ' + m.MODEL_FINGERPRINT))" 2>&1 | tail -1)"
FP0="$(npx tsx -e "import('./server/spine/scorers.ts').then(m=>{const s=m.SCORERS['1.0.0'];console.log(s.version + ' ' + s.fingerprint)})" 2>&1 | tail -1)"
[ "$FP0" = "1.0.0 d4cf8f31472a" ] && ok "model 1.0.0 kept in the registry at its fingerprint, unchanged by widening supports' type: $FP0 (C2-D1; M1)" || bad "the 1.0.0 fingerprint moved: $FP0 — stop and bring it to Brad (C2-D1)"
[ "$FP" = "1.0.1 cf11d21c781a" ] && ok "  ...the current model is C3's: $FP" || bad "  ...current model: $FP"

step "3. Clone the prod copy; migrate through 0042; harden; what 0042 orphans"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
LINKS0="$(q "SELECT count(*) || '|' || coalesce(string_agg(supports || ':' || n, ',' ORDER BY supports), '') FROM (SELECT supports, count(*) n FROM value_outcome_evidence GROUP BY 1) x")"
ERR0="$(q "SELECT count(*) || '|' || coalesce(string_agg(md5((to_jsonb(e) - 'kind' - 'points_not_credited')::text), '' ORDER BY id), '') FROM run_errata e")"
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (0042_c2_supports)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "176" ] && ok "176 triggers by pg_trigger (C3 section 28: +9; 0042 adds none)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none" && ok "drift: none after 0042 ($DRIFT)" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^[0-9]+ CHECKs in the database: [0-9]+ with a plain sentence, 0 without; 0 stale" && ok "every CHECK has its plain sentence ($PLAIN)" || bad "plain sentences: $PLAIN"
[ "$(q "SELECT count(*) || '|' || coalesce(string_agg(supports || ':' || n, ',' ORDER BY supports), '') FROM (SELECT supports, count(*) n FROM value_outcome_evidence GROUP BY 1) x")" = "$LINKS0" ] \
  && ok "0042 orphans nothing: every link kept, with its supports ($LINKS0)" || bad "links after 0042"
[ "$(q "SELECT count(*) || '|' || coalesce(string_agg(md5((to_jsonb(e) - 'kind' - 'points_not_credited')::text), '' ORDER BY id), '') FROM run_errata e")" = "$ERR0" ] && ok "  ...every erratum unchanged (${ERR0%%|*}; compared without 0043's two new columns), each passing run_errata_recompute_complete" || bad "  ...errata changed"
[ "$(q "SELECT count(*) FILTER (WHERE kind <> 'link_correction' OR points_not_credited IS NOT NULL) FROM run_errata")" = "0" ] && ok "  ...and 0043 reads each one as a link correction, with no points" || bad "  ...0043 kind/points: $(q "SELECT kind, points_not_credited FROM run_errata")"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "  ...every run byte-identical" || bad "  ...a run changed"
for c in run_errata_scores_in_range run_errata_bands_known run_errata_recompute_complete; do
  printf '%s' "$(q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '$c'")" | grep -q "IS NULL" && ok "$c names NULL explicitly (every term definite)" || bad "$c: $(q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '$c'")"
done

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
X_EMAIL="x.$TS@c2.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$X', '$HASH', 'verify')" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
start_server && ok "API up on $PORT"
expect POST /api/account-inputs "$(J institution "$(J name "C2 fixture account (invented) $TS" industry_slug manufacturing classification_note 'Verification: classified for C2.')" persons "[$(J full_name 'C2 owner (invented)' email "owner.$TS@c2.example" title Owner),$(J full_name 'C2 verifier (invented)' email "verifier.$TS@c2.example" title Verifier)]")" 201 "a fixture account, with a customer-side owner and verifier"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; VERIFIER="$(rj b.person_ids[1])"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'C2 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
OUTC() { J engagement_name "C2 engagement $1" engagement_owner_person_id "$OWNER" capability_name 'C2 capability' metric "$(J name "C2 TRIR $1" unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z; }
EVB() {  # KIND SUMMARY SUPPORTS VERIFIED [ATTESTED_BY]
  if [ -n "${5:-}" ]; then J kind "$1" provenance 'Fixture extract (not a source)' summary "$2" supports "$3" source_verified "$4" ai_sourced false simulated false evidence_form quote quote_text 'TRIR 1.4 for FY25, from the fixture extract.' how_read 'The FY25 TRIR, read as exported.' attested_by_person_id "$5" attested_at 2025-10-01T00:00:00Z
  else J kind "$1" provenance 'Fixture filing (not a source)' summary "$2" supports "$3" source_verified "$4" ai_sourced false simulated false evidence_form quote quote_text 'Our total recordable incident rate was 1.4 in FY25.' how_read 'The FY25 TRIR, from the fixture report, read as published.'; fi
}
COMMIT() { J target_value 1.2 committed_by_person_id "$OWNER" committed_at 2026-10-01T00:00:00Z commitment_note "Verification: the owner commits to 1.2 ($1)."; }
outcome() {  # NAME -> O, ENG
  expect POST "/api/institutions/$INST/value-outcomes" "$(OUTC "$1")" 201 "outcome $1"
  O="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"
}
seal() {  # ENGAGEMENT LABEL -> RUN
  expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "Verification: $2." source_fixture c2)" 201 "  ...$2 produced"
  RUN="$(rj b.value_run_id)"
  expect POST "/api/value-runs/$RUN/lock" "$(J lock_reason "Verification: $2 sealed.")" 200 "  ...$2 locked"
}

step "5. Curia's shape, built by the pre-C2 commit (B2: commit linking impact_basis again)"
edit "$WALK" "        [outcomeId, evidence.id, 'target_commitment']," "        [outcomeId, evidence.id, 'impact_basis'],"
stop_server; start_server
outcome A; O_A="$O"; ENG_A="$ENG"
expect POST "/api/value-outcomes/$O_A/evidence" "$(EVB public_filing 'C2 TRIR FY25 (fixture)' baseline true)" 201 "  ...its baseline, an independent filing, source-verified"
expect POST "/api/value-outcomes/$O_A/commit" "$(COMMIT A)" 201 "  ...committed under the pre-C2 code"
[ "$(links_of "$O_A")" = "attestation:impact_basis" ] && ok "B2: with commit's old line back, the commitment's attestation is linked impact_basis → the commit check below (target_commitment) would fail on it: caught" || bad "B2: $(links_of "$O_A")"
outcome B; O_B="$O"; ENG_B="$ENG"
expect POST "/api/value-outcomes/$O_B/evidence" "$(EVB system_export 'C2 days to productivity (fixture export, attested)' baseline true "$OWNER")" 201 "  ...outcome B's baseline, a system export attested by the customer-side owner"
expect POST "/api/value-outcomes/$O_B/commit" "$(COMMIT B)" 201 "  ...committed under the pre-C2 code"
# C2b: Curia's account exactly — a reference engagement whose commitment attestation is linked impact_basis,
# sealed and retired, then a later live engagement, so the account's walk shows the later one.
INST_AB0="$INST"; OWNER_AB0="$OWNER"
expect POST /api/account-inputs "$(J institution "$(J name "C2b fixture account E (invented) $TS" industry_slug manufacturing classification_note 'Verification: classified for C2b.')" persons "[$(J full_name 'C2b owner E (invented)' email "ownere.$TS@c2.example" title Owner)]")" 201 "C2b: account E, Curia's shape"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; INST_E="$INST"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'C2 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...its offering"
outcome E1; O_E1="$O"; ENG_E1="$ENG"
expect POST "/api/value-outcomes/$O_E1/evidence" "$(EVB public_filing 'C2b TRIR FY25 (fixture)' baseline true)" 201 "  ...the reference outcome's baseline"
expect POST "/api/value-outcomes/$O_E1/commit" "$(COMMIT E)" 201 "  ...committed under the pre-C2 code"
SUM_E="Verification: the owner commits to 1.2 (E)."
restore "$WALK"; pre_c3; ok "  ...the pre-C3 code ($PRE_C3) in place, for sealing under model 1.0.0"
seal "$ENG_E1" "E run 1"; R_E1="$RUN"
seal "$ENG_E1" "E run 2"; R_E2="$RUN"
expect POST "/api/engagements/$ENG_E1/retire" "$(J retirement_reason 'Verification: the reference engagement retired, as Curia'"'"'s was.')" 200 "  ...the reference engagement retired"
outcome E2; O_E2="$O"
ok "  ...and a later, live engagement with an outcome: the account's walk shows it, not the reference one"
INST="$INST_AB0"; OWNER="$OWNER_AB0"
seal "$ENG_A" "A run 1"; R_A1="$RUN"
seal "$ENG_A" "A run 2"; R_A2="$RUN"
seal "$ENG_B" "B run 1"; R_B1="$RUN"
post_c3
[ "$(q "SELECT string_agg(DISTINCT payload->'confidence'->>'modelVersion', ',') FROM value_runs WHERE id IN ('$R_A1', '$R_A2', '$R_B1', '$R_E1', '$R_E2')")" = "1.0.0" ] \
  && ok "  ...the five sealed under model 1.0.0, as Curia's are" || bad "  ...sealed models: $(q "SELECT payload->'confidence'->>'modelVersion' FROM value_runs WHERE id = '$R_A1'")"
[ "$(q "SELECT string_agg(DISTINCT x->>'supports', ',') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id IN ('$R_A1', '$R_A2', '$R_B1') AND x->>'kind' = 'attestation'")" = "impact_basis" ] \
  && ok "three locked runs seal the commitment's attestation as the impact basis, as Curia's 9 do" || bad "sealed: $(q "SELECT payload->'evidence' FROM value_runs WHERE id = '$R_A1'")"
[ "$(q "SELECT f->>'earned' FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$R_B1' AND f->>'factor' = 'baseline_evidence_verified'")" = "15" ] \
  && ok "  ...B's attested baseline earns the attested credit (15 of 25), as Curia runs 17–21 do" || bad "  ...B's baseline factor"

step "6. Commit and verify link the new values (C2 rulings 1–2; C2-D3)"
# C on an account of its own: W6 shows an account's last engagement with outcomes.
INST_AB="$INST"; OWNER_AB="$OWNER"; VERIFIER_AB="$VERIFIER"
expect POST /api/account-inputs "$(J institution "$(J name "C2 fixture account C (invented) $TS" industry_slug manufacturing classification_note 'Verification: classified for C2.')" persons "[$(J full_name 'C2 owner C (invented)' email "ownerc.$TS@c2.example" title Owner),$(J full_name 'C2 verifier C (invented)' email "verifierc.$TS@c2.example" title Verifier)]")" 201 "account C, with its customer-side owner and verifier"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; VERIFIER="$(rj b.person_ids[1])"; INST_C="$INST"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'C2 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...its offering"
CAP_C="$(rj b.capability_id)"
outcome C; O_C="$O"; ENG_C="$ENG"; MET_C="$(rj b.business_metric_id)"
# The POV shows an outcome's evidence under its hypothesis: a pack entry, its lever, the claim, the basis, a hypothesis.
IND_C="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
E_C="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation) VALUES ('$TEN', '$IND_C', 'C2 TRIR entry (fixture) $TS', 'incidents per 200,000 hours', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders: plant mix, seasonality.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
expect POST "/api/capabilities/$CAP_C/industry-measures" "$(J industry_measure_id "$E_C" claim 'Verification: training reduces incidents.')" 201 "  ...the capability claims a fixture pack entry"
expect POST "/api/industry-measures/$E_C/levers" "$(J name 'Hazard recognition (C2 fixture)' mechanism 'Crews trained to recognise hazards stop unsafe tasks earlier.' leading_indicator 'Near-miss reports' citation 'Verification citation, not a source.')" 201 "  ...a lever on it"
L_C="$(rj b.value_lever_id)"
expect POST "/api/business-metrics/$MET_C/pack-basis" "$(J industry_measure_id "$E_C" basis_note 'Verification: the same rate.')" 201 "  ...the metric based on the entry"
expect POST "/api/institutions/$INST/hypotheses" "$(J value_outcome_id "$O_C" value_lever_id "$L_C" statement 'Frontline hazard recognition reduces recordable injuries at this account.' falsifier_reference baseline falsifier_due "$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 365, 'YYYY-MM-DD')")" falsifier_conditions 'on the same denominator, among the covered population')" 201 "  ...a hypothesis on the outcome"
expect POST "/api/value-outcomes/$O_C/evidence" "$(EVB public_filing 'C2 TRIR FY25 C (fixture)' baseline true)" 201 "  ...its baseline"
expect POST "/api/value-outcomes/$O_C/commit" "$(COMMIT C)" 201 "  ...committed"
[ "$(links_of "$O_C")" = "attestation:target_commitment" ] && ok "commit links its attestation as target_commitment" || bad "commit linked: $(links_of "$O_C")"
expect POST "/api/value-outcomes/$O_C/evidence" "$(J kind system_export provenance 'Fixture extract (not a source)' summary 'C2 TRIR FY26 C (fixture export)' supports actual source_verified false ai_sourced false simulated false evidence_form quote quote_text 'TRIR 1.1 for FY26, from the fixture export.' how_read 'The FY26 TRIR, read from the fixture export.')" 201 "  ...its actual evidence, a system export, not yet source-verified"
expect POST "/api/value-outcomes/$O_C/measure" '{"actual_value":1.1,"actual_measured_at":"2026-10-12T12:00:00Z"}' 200 "  ...measured"
expect POST "/api/value-outcomes/$O_C/verify" "$(J verified_by_person_id "$VERIFIER" verified_at 2026-10-13T13:00:00Z attestation_note 'Verification: the customer confirmed the extract.')" 200 "  ...verified"
[ "$(links_of "$O_C")" = "attestation:target_commitment,attestation:verification" ] && ok "verify links its attestation as verification only — not the actual (C2-D3)" || bad "verify linked: $(links_of "$O_C")"
[ "$(q "SELECT count(*) FROM value_outcome_evidence voe JOIN evidence e ON e.id = voe.evidence_id WHERE voe.value_outcome_id = '$O_C' AND e.kind = 'attestation' AND voe.supports IN ('actual', 'impact_basis')")" = "0" ] && ok "  ...neither attestation supports the actual or the impact basis" || bad "  ...an attestation on a figure"
seal "$ENG_C" "C run 1"; R_C1="$RUN"
[ "$(q "SELECT string_agg(x->>'supports', ',' ORDER BY x->>'supports') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$R_C1' AND x->>'kind' = 'attestation'")" = "target_commitment,verification" ] \
  && ok "the run seals them as target_commitment and verification" || bad "C sealed: $(q "SELECT payload->'evidence' FROM value_runs WHERE id = '$R_C1'")"
FAC_C="$(q "SELECT string_agg(f->>'factor' || '=' || (f->>'earned'), ',' ORDER BY f->>'factor') FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$R_C1'")"
printf '%s' "$FAC_C" | grep -q "actual_evidence_verified=0" && printf '%s' "$FAC_C" | grep -q "impact_basis_evidenced=10" \
  && ok "  ...and neither earns credit here: the actual factor 0 (its only actual evidence unverified), the impact basis 10 (no currency claimed); step 7 shows it with verified attestations" || bad "  ...factors: $FAC_C"
INST="$INST_AB"; OWNER="$OWNER_AB"; VERIFIER="$VERIFIER_AB"

step "7. Neither feeds any factor, with or without a claimed currency figure (the model, computed)"
cat > "$W/model.ts" <<TS
import { computeConfidence, type ConfidenceInput } from '$(pwd)/server/spine/confidenceModel.ts';
const base = (claimed: number | null, extra: ConfidenceInput['evidence']): ConfidenceInput => ({
  metricDefinitionConfirmed: true, evidence: [{ kind: 'public_filing', sourceVerified: true, supports: 'baseline', attestedByName: null, attestedByScope: null, attesterSimulated: false, attesterCustomerSide: null }, ...extra],
  claimedCurrencyImpact: claimed, realizedCurrencyImpact: null, impactBasisStated: claimed !== null, impactIsInference: true,
  committerName: 'C2 owner', committerSimulated: false, committerCustomerSide: true, verifierName: 'C2 verifier', verifierSimulated: false, verifierCustomerSide: true, assertedConfidence: null });
const att = (supports: 'target_commitment' | 'verification' | 'impact_basis' | 'actual') => ({ kind: 'attestation', sourceVerified: true, supports, attestedByName: 'C2 owner', attestedByScope: 'institution' as const, attesterSimulated: false, attesterCustomerSide: true });
const f = (i: ConfidenceInput) => computeConfidence(i).factors.map((x) => x.factor + '=' + x.earned).join(',');
const out: Record<string, boolean> = {};
for (const claimed of [null, 250000]) {
  const without = f(base(claimed, []));
  out['same_' + claimed] = f(base(claimed, [att('target_commitment'), att('verification')])) === without;
  out['control_' + claimed] = f(base(claimed, [att('impact_basis'), att('actual')])) !== without;
}
console.log(JSON.stringify(out));
TS
MOD="$(npx tsx "$W/model.ts" 2>&1 | tail -1)"
[ "$MOD" = '{"same_null":true,"control_null":true,"same_250000":true,"control_250000":true}' ] \
  && ok "attestations supporting the commitment and the verification change no factor, with no currency claimed and with 250,000 claimed; the same attestations on the impact basis and the actual do (the control)" || bad "the model: $MOD"
# B3 — factor 4 grading target_commitment.
edit "$MODELF" "    const basisEvidence = input.evidence.filter((e) => e.supports === 'impact_basis');" "    const basisEvidence = input.evidence.filter((e) => e.supports === 'impact_basis' || e.supports === 'target_commitment');"
MOD3="$(npx tsx "$W/model.ts" 2>&1 | tail -1)"
printf '%s' "$MOD3" | grep -q '"same_250000":false' && ok "B3: factor 4 grading target_commitment → caught: with a currency figure claimed, the commitment's attestation changes factor 4" || bad "B3: not caught: $MOD3"
restore "$MODELF"

step "8. The dry run: read-only, its count and recomputes against the script's own"
DRY() { DATABASE_URL="$VERIFY_URL" npx tsx "$REPORT" 2>&1; }
SNAP() { q "SELECT (SELECT count(*) FROM audit_log) || '|' || (SELECT count(*) FROM refusals) || '|' || (SELECT count(*) FROM run_errata) || '|' || (SELECT count(*) FROM governance_acts)"; }
SNAP0="$(SNAP)"; DRY > "$W/dry.txt"; SNAP1="$(SNAP)"
[ "$SNAP0" = "$SNAP1" ] && ok "the dry run writes nothing (audit log, refusals, errata and acts unchanged: $SNAP0)" || bad "the dry run wrote: $SNAP0 → $SNAP1"
grep -E "^  RUN C2 engagement" "$W/dry.txt" | sed -E 's/[0-9a-f]{8}-[0-9a-f-]{27}/<id>/g' | sed 's/^/  dry   /'
grep -E "^  RUN " "$W/dry.txt" | grep -v "C2 engagement" | sed -E 's/[0-9a-f]{8}-[0-9a-f-]{27}/<id>/g' | cut -c1-200 | sed 's/^/  NOTE  (the copy'"'"'s own, not judged) /'
for r in "$R_A1" "$R_A2"; do
  LINE="$(grep -F " · $r · " "$W/dry.txt" || true)"
  WANT="$(q "SELECT payload FROM value_runs WHERE id = '$r'" | node -e '
    // The independent computation: the attestation fed only factor 4, which was full with no currency claimed, so moving it changes nothing.
    const p = JSON.parse(require("fs").readFileSync(0, "utf8")); const f4 = p.confidence.factors.find((f) => f.factor === "impact_basis_evidenced");
    console.log(p.claimedCurrencyImpact == null && Number(f4.earned) === Number(f4.weight) ? `sealed ${p.confidence.score} / 100 · ${p.confidence.band} (model ${p.confidence.modelVersion}) · recomputed ${p.confidence.score} / 100 · ${p.confidence.band}` : "cannot");')"
  printf '%s' "$LINE" | grep -qF "$WANT" && ok "the dry run lists $(q "SELECT 'run ' || run_number FROM value_runs WHERE id = '$r'") of A: \"$WANT\", as the script computes it" || bad "dry run, A: $LINE (want $WANT)"
done
LINE_B="$(grep -F " · $R_B1 · " "$W/dry.txt" || true)"
printf '%s' "$LINE_B" | grep -qF "NOT RECOMPUTED: this run's seal does not carry who attested its attested evidence" \
  && ok "the dry run lists B's run as not recomputed: its seal does not carry the attester (as Curia runs 17–21)" || bad "dry run, B: $LINE_B"
[ "$(grep -c "^  RUN C2 engagement" "$W/dry.txt")" = "5" ] && ok "  ...five fixture runs listed (A's two, B's, and E's two, for C2b), and not C's (sealed as the commitment and the verification)" || bad "  ...fixture runs listed: $(grep -c "^  RUN C2 engagement" "$W/dry.txt")"
grep -q "Nothing written.$" "$W/dry.txt" && ok "  ...it ends \"Nothing written.\"" || bad "  ...$(tail -1 "$W/dry.txt")"
# B4 — the dry run writing a row: its READ ONLY transaction refuses.
edit "$REPORT" "await client.query('BEGIN READ ONLY');" "await client.query('BEGIN READ ONLY');
await client.query('UPDATE value_runs SET payload = payload WHERE false');"
SNAP2="$(SNAP)"; B4OUT="$(DRY || true)"; SNAP3="$(SNAP)"
printf '%s' "$B4OUT" | grep -q "read-only transaction" && [ "$SNAP2" = "$SNAP3" ] && ok "B4: the dry run writing → refused (\"cannot execute UPDATE in a read-only transaction\"), nothing written" || bad "B4: $(printf '%s' "$B4OUT" | grep -m1 -i error) ($SNAP2 → $SNAP3)"
restore "$REPORT"

step "9. The correction, through the route, with its act (C2 ruling 3)"
CS() { printf '/api/value-outcomes/%s/evidence/%s/correct-support' "$1" "$2"; }
ATT_A="$(q "SELECT e.id FROM value_outcome_evidence voe JOIN evidence e ON e.id = voe.evidence_id WHERE voe.value_outcome_id = '$O_A' AND e.kind = 'attestation' AND voe.withdrawn_at IS NULL")"
ATT_B="$(q "SELECT e.id FROM value_outcome_evidence voe JOIN evidence e ON e.id = voe.evidence_id WHERE voe.value_outcome_id = '$O_B' AND e.kind = 'attestation' AND voe.withdrawn_at IS NULL")"
FIL_A="$(q "SELECT e.id FROM value_outcome_evidence voe JOIN evidence e ON e.id = voe.evidence_id WHERE voe.value_outcome_id = '$O_A' AND e.kind = 'public_filing'")"
expect POST "$(CS "$O_A" "$FIL_A")" '{"supports":"target_commitment","reason":"Verification: a filing is not a commitment."}' 422 "a filing corrected to the commitment" "Only an attestation supports the commitment; this evidence is not one."
expect POST "$(CS "$O_A" "$ATT_A")" '{"supports":"target_commitment","reason":"Verification: the commitment attestation supports the commitment, not the impact basis (C2)."}' 201 "the steward corrects A's commitment attestation, impact_basis → target_commitment"
[ "$(q "SELECT supports || '|' || coalesce(corrects_supports, '-') FROM value_outcome_evidence WHERE value_outcome_id = '$O_A' AND evidence_id = '$ATT_A' AND withdrawn_at IS NULL")|$(q "SELECT supports FROM value_outcome_evidence WHERE value_outcome_id = '$O_A' AND evidence_id = '$ATT_A' AND withdrawn_at IS NOT NULL")" = "target_commitment|impact_basis|impact_basis" ] \
  && ok "  ...the impact_basis link withdrawn, the target_commitment link current, naming it" || bad "  ...links: $(q "SELECT supports, corrects_supports, withdrawn_at FROM value_outcome_evidence WHERE evidence_id = '$ATT_A'")"
[ "$(q "SELECT act || '|' || subject_table || '|' || (subject_id = '$O_A') || '|' || (result_id = '$ATT_A') || '|' || (actor_person_id = '$S') FROM governance_acts WHERE route = 'POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/correct-support' ORDER BY at DESC LIMIT 1")" = "correct|value_outcome_evidence|true|true|true" ] \
  && ok "  ...with its act: correct, by the steward, naming the outcome and the evidence (P2)" || bad "  ...act: $(q "SELECT act, subject_table, route FROM governance_acts ORDER BY at DESC LIMIT 1")"
[ "$(q "SELECT count(*) FROM figure_checks WHERE evidence_id = '$ATT_A'")" = "0" ] && ok "  ...and no figure check: the commitment supports no figure" || bad "  ...a figure check recorded for the commitment"
expect POST "$(CS "$O_B" "$ATT_B")" '{"supports":"target_commitment","reason":"Verification: the commitment attestation supports the commitment, not the impact basis (C2)."}' 201 "  ...and B's"

step "10. Errata: recomputed on A run 1; not recomputed on B, saying why, quoting the seal (Brad's conditions)"
ERR() { J evidence_id "$1" what_was_wrong "The commitment's attestation was sealed as support for the impact basis." what_is_right "It supports the commitment; no factor reads it." reason "Verification: C2, Brad's ruling, point 4."; }
# B5 — an erratum with a typed score.
expect POST "/api/value-runs/$R_A1/errata" "$(node -e "const o=$(ERR "$ATT_A");o.recomputed_score=55;console.log(JSON.stringify(o))")" 400 "B5: an erratum with a typed score → refused" "the recompute is the server's"
expect POST "/api/value-runs/$R_A1/errata" "$(ERR "$ATT_A")" 201 "the steward records the erratum on A run 1"
E_A1="$(rj b.erratum_id)"
[ "$(q "SELECT corrected_to_supports || '|' || recomputed_score::numeric::int || '|' || sealed_score::numeric::int || '|' || model_version || '|' || (recompute_method LIKE '%counted as support for the commitment, not the impact basis;%') FROM run_errata WHERE id = '$E_A1'")" = "target_commitment|$(q "SELECT confidence_score::numeric::int FROM value_runs WHERE id = '$R_A1'")|$(q "SELECT confidence_score::numeric::int FROM value_runs WHERE id = '$R_A1'")|1.0.0|true" ] \
  && ok "  ...recomputed under 1.0.0 to its sealed score, the method reading \"counted as support for the commitment, not the impact basis\"" || bad "  ...A1: $(q "SELECT recomputed_score, sealed_score, recompute_method FROM run_errata WHERE id = '$E_A1'")"
expect POST "/api/value-runs/$R_B1/errata" "$(ERR "$ATT_B")" 201 "the steward records the erratum on B run 1"
E_B1="$(rj b.erratum_id)"
SEALED_B="$(q "SELECT confidence_score::numeric::int FROM value_runs WHERE id = '$R_B1'")"
[ "$(q "SELECT (recomputed_score IS NULL) || '|' || (recomputed_band IS NULL) || '|' || model_version || '|' || sealed_score::numeric::int FROM run_errata WHERE id = '$E_B1'")" = "true|true|1.0.0|$SEALED_B" ] \
  && ok "  ...not recomputed: no score and no band, the model it was sealed under kept (1.0.0), the sealed $SEALED_B" || bad "  ...B1: $(q "SELECT recomputed_score, recomputed_band, model_version FROM run_errata WHERE id = '$E_B1'")"
M_B="$(q "SELECT recompute_method FROM run_errata WHERE id = '$E_B1'")"
printf '%s' "$M_B" | grep -qF "Not recomputed: this run's seal does not carry who attested its attested evidence, so \"Is the baseline" \
  && ok "  ...the method says why, for this run: the seal does not carry the attester, naming the factor it cannot reproduce" || bad "  ...method: $M_B"
printf '%s' "$M_B" | grep -qF "it could feed only the sealed factor asking \"Is the currency figure's derivation stated and supported?\", sealed at 10 of 10: \"No currency figure claimed — nothing to substantiate.\"" \
  && ok "  ...and quotes from the seal the one factor the item could feed and its sealed value (Brad's condition 1)" || bad "  ...factor line: $M_B"
# The other reason, specific: a run that sealed no model version (A run 2's own payload, without it).
cat > "$W/nomodel.ts" <<TS
import { recomputeWithCorrection } from '$(pwd)/server/lib/recomputeRun.ts';
const p = JSON.parse(process.argv[2]); const m = JSON.parse(process.argv[3]);
delete p.confidence.modelVersion; delete p.confidence.modelFingerprint;
const r = recomputeWithCorrection(p, m, 'target_commitment');
console.log(JSON.stringify(r.ok ? 'ok' : [Boolean(r.notRecomputed), r.modelVersion, r.method]));
TS
NM="$(npx tsx "$W/nomodel.ts" "$(q "SELECT payload FROM value_runs WHERE id = '$R_A2'")" "$(q "SELECT json_build_object('kind', kind, 'summary', summary, 'provenance', provenance) FROM evidence WHERE id = '$ATT_A'")" 2>&1 | tail -1)"
printf '%s' "$NM" | grep -qF '[true,null,"Not recomputed: this run sealed no model version, so the model it was sealed with cannot be named' && printf '%s' "$NM" | grep -qF 'it could feed only the sealed factor asking' \
  && ok "a run that sealed no model version (as Curia runs 13–16): not recomputed, saying so, the model left empty, the seal's factor quoted" || bad "no model: $NM"
# B6 — the not-recomputed erratum without the seal's factor line.
edit "$RECOMP" "    method: \`Not recomputed: \${why}\${fedLine} The sealed run is unchanged.\`," "    method: \`Not recomputed: \${why} The sealed run is unchanged.\`,"
NM6="$(npx tsx "$W/nomodel.ts" "$(q "SELECT payload FROM value_runs WHERE id = '$R_A2'")" "$(q "SELECT json_build_object('kind', kind, 'summary', summary, 'provenance', provenance) FROM evidence WHERE id = '$ATT_A'")" 2>&1 | tail -1)"
printf '%s' "$NM6" | grep -qF 'it could feed only the sealed factor asking' && bad "B6: not caught" || ok "B6: the factor line dropped → caught: the method no longer quotes the seal's factor"
restore "$RECOMP"
expect GET "/api/runs/$R_B1" "" 200 "GET B's run"
[ "$(rj "String(b.errata.find(x=>x.id==='$E_B1').recomputed_score)+'|'+String(b.errata.find(x=>x.id==='$E_B1').recomputed_band)+'|'+b.errata.find(x=>x.id==='$E_B1').recompute_method.startsWith('Not recomputed: ')")" = "null|null|true" ] && ok "  ...it carries the erratum, not recomputed" || bad "  ...$(rj "JSON.stringify(b.errata)")"
# B1 — the supports CHECK without the new values (on the clone): commit refuses, in words, and writes nothing.
q "ALTER TABLE value_outcome_evidence DROP CONSTRAINT value_outcome_evidence_supports_known" > /dev/null
q "ALTER TABLE value_outcome_evidence ADD CONSTRAINT value_outcome_evidence_supports_known CHECK (supports IN ('baseline', 'actual', 'impact_basis')) NOT VALID" > /dev/null
outcome D; O_D="$O"
expect POST "/api/value-outcomes/$O_D/commit" "$(COMMIT D)" 422 "B1: the CHECK without the new values → commit refused, in words" "Evidence supports the baseline, the actual, the impact basis, the commitment or the verification."
[ "$(q "SELECT (committed_at IS NULL) || '|' || (SELECT count(*) FROM value_outcome_evidence WHERE value_outcome_id = '$O_D' AND supports <> 'baseline') FROM value_outcomes WHERE id = '$O_D'")" = "true|0" ] && ok "  ...nothing written: the outcome uncommitted, no attestation linked" || bad "  ...B1 wrote"
q "ALTER TABLE value_outcome_evidence DROP CONSTRAINT value_outcome_evidence_supports_known" > /dev/null
q "ALTER TABLE value_outcome_evidence ADD CONSTRAINT value_outcome_evidence_supports_known CHECK (supports IN ('baseline', 'actual', 'impact_basis', 'target_commitment', 'verification'))" > /dev/null
DRIFT2="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT2" | grep -q "schema drift: none" && ok "  ...the CHECK restored: drift none" || bad "  ...drift after B1: $DRIFT2"
expect POST "/api/value-outcomes/$O_D/commit" "$(COMMIT D)" 201 "  ...and commit succeeds again"

step "11. The seals: every run hashes; the fixture runs byte-identical after the corrections and errata"
HASH1="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
RUNS1="$(q "SELECT count(*) FROM value_runs")"
printf '%s' "$HASH1" | grep -qE "^$RUNS1 runs: recompute matches $RUNS1, differs 0; embedded payloadHash matches $RUNS1, differs 0" && ok "check_run_hashes: $HASH1" || bad "hashes: $HASH1"

step "12. The display: the walk, the POV and the run page; the erratum not recomputed, on screen and in print"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "the steward signed in by session" || { bad "no session"; exit 1; }
cwalk() {  # MODE INST RUN PDF
  node scripts/lib/c2_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" "$2" "$3" "${4:-none.pdf}" > "$W/walk.$1.log" 2>&1; local rc=$?
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
  grep -E '^  (PASS|FAIL)' "$W/walk.$1.log" || true
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc (see $W/walk.$1.log)"
}
cwalk supports "$INST_C" "$R_C1"
SEALED="$SEALED_B" cwalk erratum "$INST" "$R_B1" c2_run_b1.pdf
if [ -f "$SHOTS/c2_run_b1.pdf" ]; then
  NP="$(pdfinfo "$SHOTS/c2_run_b1.pdf" | awk '/^Pages:/{print $2}')"; MISS=""
  for p in $(seq 1 "$NP"); do
    flat="$(pdftotext -f "$p" -l "$p" "$SHOTS/c2_run_b1.pdf" - 2>/dev/null | tr -d '[:space:]')"
    printf '%s' "$flat" | grep -qF "ERRATUM:notrecomputed(sealed$SEALED_B/100).Fulltextonpage1." || MISS="$MISS p$p"
    printf '%s' "$flat" | grep -qF "UNVERIFIED—thisrun'soutcomehasnoverifiedactual" || MISS="$MISS p$p:disclosure"
  done
  printf '%s' "$(pdftotext -f 1 -l 1 "$SHOTS/c2_run_b1.pdf" - | tr -d '[:space:]')" | grep -qF "Notrecomputed:thisrun'ssealdoesnotcarrywhoattesteditsattestedevidence" || MISS="$MISS p1:full"
  [ -z "$MISS" ] && ok "B's run printed ($NP pages): every page's header reads \"ERRATUM: not recomputed (sealed $SEALED_B / 100). Full text on page 1.\" beside the disclosure; page 1 the full reason" || bad "B's run printed: missing$MISS"
else bad "B's run: no PDF printed"; fi

step "12b. C2b: the correction from the run page, for a retired engagement's outcome the walk cannot reach"
# The outcome's other current link, as "The link" names it: the baseline filing, never the corrected attestation.
OTHER_LINKS="C2b TRIR FY25 (fixture) — supports baseline"
SUMMARY="$SUM_E" RUN_OTHER="$R_E1" OTHER_LINKS="$OTHER_LINKS" cwalk runcorrect "$INST_E" "$R_E2"
[ "$(q "SELECT supports || '|' || coalesce(corrects_supports, '-') || '|' || (corrected_by_person_id = '$S') FROM value_outcome_evidence voe JOIN evidence e ON e.id = voe.evidence_id WHERE voe.value_outcome_id = '$O_E1' AND e.kind = 'attestation' AND voe.withdrawn_at IS NULL")" = "target_commitment|impact_basis|true" ] \
  && ok "  ...in the database: the attestation now supports the commitment, correcting impact_basis, by the steward, on the frozen outcome" || bad "  ...links: $(q "SELECT supports, corrects_supports FROM value_outcome_evidence WHERE value_outcome_id = '$O_E1'")"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'correct' AND subject_id = '$O_E1'")" = "1" ] && ok "  ...with its one act (P2)" || bad "  ...acts: $(q "SELECT count(*) FROM governance_acts WHERE subject_id = '$O_E1'")"
X_TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$X_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
TOKEN_S="$TOKEN"; TOKEN="$X_TOKEN"; cwalk nonsteward "$INST_E" "$R_E1"; TOKEN="$TOKEN_S"
# B7 — the run-page correction re-offering a corrected link.
edit "$BENCH" "  const open_ = outcome.evidence.filter((e) => e.corrects_supports === null);" "  const open_ = outcome.evidence;"
sleep 3; OTHER_LINKS="$OTHER_LINKS" node scripts/lib/c2_walk.mjs noreoffer "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" "$INST_E" "$R_E1" none.pdf > "$W/walk.b7.log" 2>&1 || true
grep -q "^  PASS  the run sharing the outcome opens" "$W/walk.b7.log" && grep -q "^  FAIL  \"The link\" lists exactly the outcome's other current links" "$W/walk.b7.log" \
  && ok "B7: the corrected link re-offered → caught: \"The link\" lists $(grep -o '— \[.*\]$' "$W/walk.b7.log" | head -1)" || bad "B7: not caught: $(head -3 "$W/walk.b7.log")"
restore "$BENCH"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots and PDFs: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
