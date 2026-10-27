#!/usr/bin/env bash
#
# C3 — credit only for customer-side people (a role named from a source); model 1.0.1 with 1.0.0 kept (M1);
# errata on what the seals credited; system-exercise marks; headlines (LVRF_PLAN §12; migration 0043;
# hardening.sql section 28; Brad's rulings, 26 Oct 2026). Local verification.
#
#   ./scripts/verify_c3.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` to `lvrf_verifyc3`, migrated (through 0043) and hardened, dropped on exit. L39: the
# fixtures are the script's own, through the routes. Runs sealed under model 1.0.0 are sealed by the pre-C3
# code itself (produceRun.ts and confidenceModel.ts as at 42e7fe4, put back for the sealing and restored),
# the C2 way. Fixture roles are named through the role act only — no SQL role insert, even here (Brad).
# The clone's own Curia runs appear in the errata dry run; they are counted, printed as NOTEs, not judged.
# DELIBERATE BREAKS, every file restored byte-identical, every function restored by re-applying hardening.sql:
#   B1  the grant guard's analyst-of-record test removed: a role named for the analyst of record is accepted
#   B2  the grant guard's vendor-side test removed: a role named for a person with sign-in credentials is accepted
#   B3  the grant guard's steward test removed: the steward's own grant is no longer refused as the steward's
#   B4  the grant guard's source test removed: a role named from another account's evidence is accepted
#   B5  lvrf_customer_side_reason's role test removed: the analyst's attestation reads client-stated
#   B6  1.0.1 crediting a non-customer-side attester: the model check catches it
#   B7  ATTESTER_RULE left out of the fingerprint: the version moves, the fingerprint does not
#   B8  the 1.0.0 scorer dropped from the registry: a 1.0.0 run's recompute is refused
#   B9  the errata batch without its count check: a count that was off is accepted
#   B10 the POV's headline taking a marked run: the headline check catches it
#   B11 the POV's headline without its erratum line: the headline check catches it
#   B12 the print without the system-exercise line: the printed pages catch it
#   B13 the book's run of record taking a marked run: the cohort check catches it
#   B14 the book's row without its erratum line: the headline check catches it
#   B15 the route's source check removed: a role with no source is refused by the database's grant guard, nothing written

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

VERIFY_DB=lvrf_verifyc3
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3103; VITE_PORT=5203; CDP_PORT=9363
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_c3.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
PRODUCE=server/routes/produceRun.ts; MODELF=server/spine/confidenceModel.ts; SCORERS=server/spine/scorers.ts
C3R=server/routes/creditAndMarks.ts; VH=server/routes/valueHypotheses.ts; POVP=client/src/pages/PovPage.tsx; BENCH=client/src/components/workbench/Workbench.tsx
COH=server/routes/cohort.ts; CARD=client/src/components/CohortCard.tsx
EDITED=("$PRODUCE" "$MODELF" "$SCORERS" "$C3R" "$VH" "$POVP" "$BENCH" "$COH" "$CARD")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PRE_C3=42e7fe4
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
sqlrefused() {  # LABEL SQL EXPECTED_SUBSTRING [ACTOR]
  local out; out="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "${4:-$S}" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
sqlaccepted() {  # SQL [ACTOR]
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nROLLBACK;\n" "${2:-$S}" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1 || true
}
# A hardening.sql function — plpgsql "name() … END $$;" or sql "name(args) … $$;" — with one piece replaced, on the clone only.
fnbreak() {  # FUNCTION OLD NEW
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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "176" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 176 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}
pre_c3() {  # the pre-C3 code itself, for sealing runs under model 1.0.0
  git show "$PRE_C3:$PRODUCE" > "$PRODUCE"; git show "$PRE_C3:$MODELF" > "$MODELF"; stop_server; start_server
}
post_c3() { restore "$PRODUCE"; restore "$MODELF"; stop_server; start_server; }
FP() { npx tsx -e "import('./$1').then(m=>console.log(m.MODEL_VERSION + ' ' + m.MODEL_FINGERPRINT))" 2>&1 | tail -1; }

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc.log")"
(cd client && npx tsc -b) > "$W/tsc2.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc2.log")"

step "2. The models: 1.0.1 current, 1.0.0 kept (M1; C3-D2)"
F100="$(FP server/spine/models/confidence_1_0_0.ts)"; F101="$(FP "$MODELF")"
[ "$F100" = "1.0.0 d4cf8f31472a" ] && ok "the kept 1.0.0 scorer: $F100, the fingerprint every 1.0.0 run sealed" || bad "1.0.0: $F100"
[ "${F101%% *}" = "1.0.1" ] && [ "${F101##* }" != "d4cf8f31472a" ] && ok "the current model: $F101 (ATTESTER_RULE moves the fingerprint with the version)" || bad "1.0.1: $F101"
REG="$(npx tsx -e "import('./$SCORERS').then(m=>console.log(Object.keys(m.SCORERS).sort().join(',')))" 2>&1 | tail -1)"
[ "$REG" = "1.0.0,1.0.1" ] && ok "the scorer registry keeps both: $REG" || bad "registry: $REG"
# B7 — ATTESTER_RULE out of the fingerprint: 1.0.1's fingerprint falls back to 1.0.0's.
edit "$MODELF" "      attesterRule: ATTESTER_RULE," ""
F7="$(FP "$MODELF")"
[ "${F7##* }" = "d4cf8f31472a" ] && ok "B7: ATTESTER_RULE left out → caught: 1.0.1 would carry 1.0.0's fingerprint ($F7) — the version moved, the fingerprint did not" || bad "B7: $F7"
restore "$MODELF"
cat > "$W/model.ts" <<TS
import { evidenceCredit } from '$(pwd)/$MODELF';
const base = { kind: 'system_export', sourceVerified: true, supports: 'baseline' as const, attestedByName: 'P', attestedByScope: 'institution' as const, attesterSimulated: false };
console.log(JSON.stringify([
  evidenceCredit({ ...base, attesterCustomerSide: true, attesterRoles: 'metric owner per X, named by S, 1 Jan 2026' }),
  evidenceCredit({ ...base, attesterCustomerSide: false, attesterSideReason: 'no customer-side role named from a source' }),
  evidenceCredit({ ...base, attesterCustomerSide: null }),
].map((g) => g.credit + ':' + g.note)));
TS
MOD="$(npx tsx "$W/model.ts" 2>&1 | tail -1)"
[ "$MOD" = '["0.6:attested by P (metric owner per X, named by S, 1 Jan 2026)","0:attester is not customer-side (P: no customer-side role named from a source)","0:attester is not customer-side (P: no customer-side role named from a source)"]' ] \
  && ok "1.0.1 credits an attestation (0.6) only from a customer-side attester, naming the role's source; otherwise 0, saying why" || bad "model: $MOD"
# B6 — 1.0.1 crediting a non-customer-side attester.
edit "$MODELF" "    if (ev.attesterCustomerSide !== true) {" "    if (false) {"
MOD6="$(npx tsx "$W/model.ts" 2>&1 | tail -1)"
printf '%s' "$MOD6" | grep -q '"0.6:attested by P"' && ok "B6: 1.0.1 crediting a non-customer-side attester → caught (0.6 for an attester with no role)" || bad "B6: $MOD6"
restore "$MODELF"

step "3. Clone the prod copy; migrate through 0043; harden; what 0043 orphans"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
ERR0="$(q "SELECT count(*) FROM run_errata")"; RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (0043_c3_credit_marks)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "176" ] && ok "176 triggers (167 + section 28's nine)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^[0-9]+ CHECKs in the database: [0-9]+ with a plain sentence, 0 without; 0 stale" && ok "every CHECK has its plain sentence ($PLAIN)" || bad "plain: $PLAIN"
[ "$(q "SELECT count(*) || '|' || count(*) FILTER (WHERE kind = 'link_correction')  FROM run_errata")" = "$ERR0|$ERR0" ] && ok "0043 orphans nothing: all $ERR0 errata kept, each a link correction" || bad "errata after 0043"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "  ...every run byte-identical" || bad "  ...a run changed"

step "4. Fixtures and the server"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', 'x.$TS@c3.example') RETURNING id" | head -1)"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
start_server && ok "API up on $PORT"
ANALYST_NAME="C3 analyst of record (invented)"; OWNER_NAME="C3 owner (invented)"
acct() {  # NAME PERSONS_JSON -> INST, P0, P1, P2
  expect POST /api/account-inputs "$(J institution "$(J name "$1 $TS" industry_slug manufacturing classification_note 'Verification: classified for C3.')" persons "$2")" 201 "account: $1"
  INST="$(rj b.institution_id)"; P0="$(rj b.person_ids[0])"; P1="$(rj "b.person_ids[1] ?? ''")"; P2="$(rj "b.person_ids[2] ?? ''")"
  expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'C3 capability' owner_person_id "$P0" is_primary false basis 'Verification: EHS solution.')" 201 "  ...its offering"
}
OUTC() { J engagement_name "C3 engagement $1" engagement_owner_person_id "$2" capability_name 'C3 capability' metric "$(J name "C3 TRIR $1" unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$2")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z; }
outcome() { expect POST "/api/institutions/$INST/value-outcomes" "$(OUTC "$1" "$2")" 201 "outcome $1"; O="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"; }
evid() {  # OUTCOME KIND SUMMARY SUPPORTS [ATTESTER] -> EV
  if [ -n "${5:-}" ]; then expect POST "/api/value-outcomes/$1/evidence" "$(J kind "$2" provenance "Fixture source for: $3" summary "$3" supports "$4" source_verified true ai_sourced false simulated false evidence_form quote quote_text 'TRIR 1.4 for FY25, from the export.' how_read 'The FY25 TRIR, read from the export.' attested_by_person_id "$5" attested_at 2025-10-01T00:00:00Z)" 201 "  ...evidence: $3"
  else expect POST "/api/value-outcomes/$1/evidence" "$(J kind "$2" provenance "Fixture source for: $3" summary "$3" supports "$4" source_verified true ai_sourced false simulated false evidence_form quote quote_text 'TRIR 1.4 for FY25.' how_read 'The FY25 TRIR, read as published.')" 201 "  ...evidence: $3"; fi
  EV="$(rj b.evidence_id)"
}
commit() { expect POST "/api/value-outcomes/$1/commit" "$(J target_value 1.2 committed_by_person_id "$2" committed_at 2026-10-01T00:00:00Z commitment_note "Verification: committed to 1.2 ($3).")" 201 "  ...committed by $3"; }
seal() { expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "$2" source_fixture c3)" 201 "  ...produced: $2"; RUN="$(rj b.value_run_id)"; expect POST "/api/value-runs/$RUN/lock" "$(J lock_reason 'Verification: sealed.')" 200 "  ...locked"; }
# Account 1: the analyst of record's case (Curia's shape), sealed under the pre-C3 code.
acct "C3 account one (invented)" "[$(J full_name "$OWNER_NAME 1" email "owner1.$TS@c3.example" title Owner),$(J full_name "$ANALYST_NAME" email "analyst.$TS@c3.example" title 'External analyst of record — not an employee')]"
INST1="$INST"; OWNER1="$P0"; ANALYST="$P1"
outcome plain "$OWNER1"; O3="$O"; ENG3="$ENG"
evid "$O3" public_filing 'C3 TRIR FY25 filing (fixture)' baseline; EV3="$EV"
outcome analyst "$OWNER1"; O1="$O"; ENG1="$ENG"
evid "$O1" system_export 'C3 export attested by the analyst (fixture)' baseline "$ANALYST"
commit "$O1" "$ANALYST" analyst
pre_c3; ok "the pre-C3 code ($PRE_C3) in place, for sealing under model 1.0.0"
seal "$ENG3" "Verification: run 1, under 1.0.0."; R3="$RUN"
seal "$ENG1" "Verification: the analyst's run, under 1.0.0."; R_OLD="$RUN"
post_c3
[ "$(q "SELECT string_agg(r.payload->'confidence'->>'modelVersion', ',') FROM value_runs r WHERE r.id IN ('$R3', '$R_OLD')")" = "1.0.0,1.0.0" ] && ok "both sealed under model 1.0.0" || bad "models: $(q "SELECT payload->'confidence'->>'modelVersion' FROM value_runs WHERE id IN ('$R3', '$R_OLD')")"
FAC_OLD="$(q "SELECT string_agg(f->>'factor' || '=' || (f->>'earned'), ',' ORDER BY f->>'factor') FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$R_OLD'")"
printf '%s' "$FAC_OLD" | grep -q "baseline_evidence_verified=15" && printf '%s' "$FAC_OLD" | grep -q "human_commit_of_record=10" && ok "  ...1.0.0 credited the analyst: baseline 15 of 25 and committer 10 of 10, as Curia's runs" || bad "  ...$FAC_OLD"
SEAL_OLD="$(q "SELECT md5(r::text) FROM value_runs r WHERE r.id = '$R_OLD'")"
# Account 2: a role-holder, named from a source; a person with no role; a simulated person; a person with credentials.
acct "C3 account two (invented)" "[$(J full_name "$OWNER_NAME" email "owner2.$TS@c3.example" title Owner),$(J full_name 'C3 colleague (invented)' email "colleague.$TS@c3.example" title 'Plant manager'),$(J full_name 'C3 signer (invented)' email "signer.$TS@c3.example" title 'Controller')]"
INST2="$INST"; OWNER2="$P0"; NOROLE="$P1"; SIGNER="$P2"
SIMP="$(q "INSERT INTO persons (institution_id, full_name, email, simulated) VALUES ('$INST2', 'C3 simulated person', 'sim.$TS@c3.example', true) RETURNING id" | head -1)"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$SIGNER', '$HASH', 'verify')" > /dev/null
ok "  ...a simulated person and a customer person given sign-in credentials (fixture persons, not roles)"
outcome role "$OWNER2"; O2="$O"; ENG2="$ENG"
SOURCE="Fixture source for: C3 org chart naming the owner as metric owner"
evid "$O2" public_filing 'C3 org chart naming the owner as metric owner' impact_basis; SRC="$EV"
evid "$O2" system_export 'C3 export attested by the owner (fixture)' baseline "$OWNER2"
commit "$O2" "$OWNER2" owner
evid "$O2" observation 'Entered to exercise the accept path (fixture test row)' impact_basis; EV_TEST="$EV"
outcome norole "$NOROLE"; O4="$O"; ENG4="$ENG"
evid "$O4" system_export 'C3 export attested by a person with no role (fixture)' baseline "$NOROLE"
commit "$O4" "$NOROLE" 'a person with no role'

step "5. Naming a customer-side role: the act, its guards, in the database (Brad's guards)"
CR() { printf '/api/institutions/%s/customer-roles' "$1"; }
GR() { J person_id "$1" role "${2:-metric_owner}" source_evidence_id "${3:-$SRC}" reason 'Verification: named from the customer org chart.'; }
expect POST "$(CR "$INST2")" "$(GR "$OWNER2")" 403 "X names a role" "steward" "$X"
expect POST "$(CR "$INST2")" "$(J person_id "$OWNER2" role metric_owner reason 'Verification: no source given.')" 422 "a role with no source" "No source, no role."
expect POST "$(CR "$INST2")" "$(GR "$OWNER2" chief_of_staff)" 422 "an unknown role" "the metric owner or the executive sponsor"
expect POST "$(CR "$INST1")" "$(GR "$ANALYST" metric_owner "$EV3")" 422 "the analyst of record (titled external analyst)" "is an analyst of record or external"
expect POST "$(CR "$INST2")" "$(GR "$X")" 422 "tenant staff (X)" "is vendor-side"
expect POST "$(CR "$INST2")" "$(GR "$SIGNER")" 422 "a person with sign-in credentials" "is vendor-side (tenant staff, a vendor-side role, or sign-in credentials)"
expect POST "$(CR "$INST2")" "$(GR "$S")" 422 "the steward themself" "the steward does not name a customer-side role for themself"
expect POST "$(CR "$INST2")" "$(GR "$SIMP")" 422 "a simulated person" "a simulated person holds no customer-side role"
expect POST "$(CR "$INST2")" "$(GR "$OWNER1")" 422 "a person of another account" "is not a person of this account"
expect POST "$(CR "$INST2")" "$(GR "$OWNER2" metric_owner "$EV3")" 422 "a source from another account" "a role is named from a source: evidence of this account"
[ "$(q "SELECT count(*) FROM customer_role_grants")" = "0" ] && ok "  ...none of them wrote" || bad "  ...a refused grant wrote"
GSQL() { printf "INSERT INTO customer_role_grants (tenant_id, institution_id, person_id, role, source_evidence_id, reason, granted_by_person_id) VALUES ('%s', '%s', '%s', 'metric_owner', '%s', 'Verification: a break.', '%s')" "$TEN" "$1" "$2" "$3" "$S"; }
fnbreak lvrf_customer_role_grant_guard "  IF EXISTS (SELECT 1 FROM account_person_links l WHERE l.person_id = p.id AND l.role = 'analyst_of_record')
     OR coalesce(p.title, '') ~* '(analyst|external)' THEN" "  IF false THEN"
[ "$(sqlaccepted "$(GSQL "$INST1" "$ANALYST" "$EV3")")" = "ACCEPTED" ] && ok "B1: the analyst-of-record test removed → caught: a role named for the analyst of record is accepted" || bad "B1: $(sqlaccepted "$(GSQL "$INST1" "$ANALYST" "$EV3")")"
reharden
fnbreak lvrf_customer_role_grant_guard "  IF p.tenant_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM person_credentials c WHERE c.person_id = p.id)" "  IF false
     AND EXISTS (SELECT 1 FROM person_credentials c WHERE c.person_id = p.id)"
[ "$(sqlaccepted "$(GSQL "$INST2" "$SIGNER" "$SRC")")" = "ACCEPTED" ] && ok "B2: the vendor-side test removed → caught: a role named for a person with sign-in credentials is accepted" || bad "B2: $(sqlaccepted "$(GSQL "$INST2" "$SIGNER" "$SRC")")"
reharden
fnbreak lvrf_customer_role_grant_guard "  IF NEW.person_id = steward THEN" "  IF false THEN"
B3="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "$S" "$(GSQL "$INST2" "$S" "$SRC")" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$B3" | grep -qF "the steward does not name a customer-side role for themself" && bad "B3: not caught" || ok "B3: the steward test removed → caught: the steward's own grant is no longer refused as the steward's (it falls to the vendor-side test: $(printf '%s' "$B3" | grep -o 'is vendor-side' | head -1))"
reharden
fnbreak lvrf_customer_role_grant_guard "  IF NOT EXISTS (SELECT 1 FROM evidence e WHERE e.id = NEW.source_evidence_id AND e.institution_id = NEW.institution_id" "  IF false AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.id = NEW.source_evidence_id AND e.institution_id = NEW.institution_id"
[ "$(sqlaccepted "$(GSQL "$INST2" "$OWNER2" "$EV3")")" = "ACCEPTED" ] && ok "B4: the source test removed → caught: a role named from another account's evidence is accepted" || bad "B4: $(sqlaccepted "$(GSQL "$INST2" "$OWNER2" "$EV3")")"
reharden
# B15 — a role with no source, the route's check removed: the database refuses it.
sqlrefused "a grant with no source, at the database" "INSERT INTO customer_role_grants (tenant_id, institution_id, person_id, role, source_evidence_id, reason, granted_by_person_id) VALUES ('$TEN', '$INST2', '$OWNER2', 'metric_owner', NULL, 'Verification: no source.', '$S')" "a role is named from a source: evidence of this account"
[ "$(q "SELECT attnotnull FROM pg_attribute WHERE attrelid = 'customer_role_grants'::regclass AND attname = 'source_evidence_id'")" = "t" ] && ok "  ...and the column is NOT NULL behind the guard" || bad "  ...source_evidence_id is nullable"
edit "$C3R" "      if (typeof b.source_evidence_id !== 'string' || !isUuid(b.source_evidence_id)) {" "      if (false) {"
stop_server; start_server
req POST "$(CR "$INST2")" "$(J person_id "$OWNER2" role metric_owner reason 'Verification: B15, no source given.')"
B15MSG="$(said)"
[ "$CODE" != "201" ] && [ "$(q "SELECT count(*) FROM customer_role_grants")" = "0" ] \
  && ok "B15: the route's source check removed → caught by the database: $CODE \"$(printf '%s' "$B15MSG" | head -c 160)\", nothing written" || bad "B15: $CODE $B15MSG ($(q "SELECT count(*) FROM customer_role_grants") grants)"
restore "$C3R"; stop_server; start_server
expect POST "$(CR "$INST2")" "$(GR "$OWNER2")" 201 "the steward names $OWNER_NAME the metric owner, from the org chart"
G1="$(rj b.customer_role_grant_id)"
[ "$(q "SELECT act || '|' || subject_table || '|' || result_table || '|' || (result_id = '$SRC') || '|' || (actor_person_id = '$S') FROM governance_acts WHERE subject_id = '$G1'")" = "grant|customer_role_grants|evidence|true|true" ] && ok "  ...with its act: grant, naming the source, by the steward" || bad "  ...act"
[ "$(q "SELECT lvrf_customer_side('$OWNER2', '$INST2')::text || '|' || lvrf_customer_side('$NOROLE', '$INST2')::text || '|' || lvrf_customer_side('$ANALYST', '$INST1')::text")" = "true|false|false" ] && ok "lvrf_customer_side: the role-holder yes; a person with no role, the analyst of record, no" || bad "customer side"
ROLES="$(q "SELECT lvrf_customer_roles('$OWNER2', '$INST2')")"
printf '%s' "$ROLES" | grep -qE "^metric owner per $SOURCE, named by $S_NAME, [0-9]{1,2} [A-Z][a-z]{2} [0-9]{4}$" && ok "  ...the role reads \"$ROLES\"" || bad "  ...roles: $ROLES"
expect POST "$(CR "$INST2")" "$(GR "$OWNER2" executive_sponsor)" 201 "a second role, to revoke"
G2="$(rj b.customer_role_grant_id)"
expect POST "/api/customer-roles/$G2/revoke" "$(J reason 'Short')" 422 "a revocation with a 5-character reason" "in at least 12 characters"
expect POST "/api/customer-roles/$G2/revoke" "$(J reason 'Verification: revoked to test revocation.')" 200 "the steward revokes it"
expect POST "/api/customer-roles/$G2/revoke" "$(J reason 'Verification: revoked a second time.')" 409 "  ...a second revocation" "a revocation is final"
sqlrefused "an edit of a grant's source" "UPDATE customer_role_grants SET source_evidence_id = '$EV3' WHERE id = '$G1'" "a role grant is never edited"
sqlrefused "a DELETE of a grant" "DELETE FROM customer_role_grants WHERE id = '$G1'" "never deleted"
[ "$(q "SELECT count(*) FROM governance_acts WHERE subject_id = '$G2' AND act = 'withdraw'")" = "1" ] && ok "  ...the revocation with its act (withdraw)" || bad "  ...revocation act"

step "6. Sealing under 1.0.1: credit only for the customer-side person, each credit naming its source; the basis badge agrees"
seal "$ENG2" "Verification: the role-holder's run, under 1.0.1."; R2="$RUN"
seal "$ENG4" "Verification: the run of a person with no role, under 1.0.1."; R4="$RUN"
F2="$(q "SELECT string_agg(f->>'factor' || '=' || (f->>'earned'), ',' ORDER BY f->>'factor') FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$R2'")"
F4="$(q "SELECT string_agg(f->>'factor' || '=' || (f->>'earned'), ',' ORDER BY f->>'factor') FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$R4'")"
printf '%s' "$F2" | grep -q "baseline_evidence_verified=15" && printf '%s' "$F2" | grep -q "human_commit_of_record=10" && ok "the role-holder's run: baseline 15 of 25, committer 10 of 10" || bad "R2: $F2"
printf '%s' "$F4" | grep -q "baseline_evidence_verified=0" && printf '%s' "$F4" | grep -q "human_commit_of_record=0" && ok "the run of a person with no role: baseline 0, committer 0" || bad "R4: $F4"
N4="$(q "SELECT f->>'note' FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$R4' AND f->>'factor' = 'human_commit_of_record'")"
[ "$N4" = "Committed by C3 colleague (invented) — not customer-side (no customer-side role named from a source)." ] && ok "  ...its note: \"$N4\"" || bad "  ...note: $N4"
[ "$(q "SELECT (r.payload->'confidence'->>'modelVersion') || '|' || (x->'attester'->>'customer_side') || '|' || (r.payload->'people'->'committer'->>'customer_side') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$R2' AND x->>'kind' = 'system_export'")" = "1.0.1|true|true" ] \
  && ok "  ...1.0.1 seals the attester and the committer as they stood (C3-D3)" || bad "  ...sealed people"
q "SELECT 1" > /dev/null
expect POST "/api/value-outcomes/$O2/evidence" "$(J kind attestation provenance 'Fixture attestation (owner)' summary 'C3 owner attestation (fixture)' supports impact_basis source_verified false ai_sourced false simulated false evidence_form statement attested_by_person_id "$OWNER2" attested_at 2025-10-01T00:00:00Z)" 201 "  ...an attestation by the role-holder"
A_OWN="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$O4/evidence" "$(J kind attestation provenance 'Fixture attestation (no role)' summary 'C3 no-role attestation (fixture)' supports impact_basis source_verified false ai_sourced false simulated false evidence_form statement attested_by_person_id "$NOROLE" attested_at 2025-10-01T00:00:00Z)" 201 "  ...an attestation by a person with no role"
A_NO="$(rj b.evidence_id)"
BASIS="$(q "SELECT lvrf_evidence_basis(e) FROM evidence e WHERE e.id = '$A_OWN'") $(q "SELECT lvrf_evidence_basis(e) FROM evidence e WHERE e.id = '$A_NO'")"
[ "$BASIS" = "client_stated assumed" ] && ok "lvrf_evidence_basis: the role-holder's attestation client-stated; the no-role person's assumed (one definition, the score and the badge agree)" || bad "basis: $BASIS"
fnbreak lvrf_customer_side_reason "    WHEN NOT EXISTS (SELECT 1 FROM customer_role_grants g WHERE g.person_id = p.id AND g.institution_id = p_institution AND g.revoked_at IS NULL)
      THEN 'no customer-side role named from a source'" "    WHEN false THEN 'no customer-side role named from a source'"
[ "$(q "SELECT lvrf_evidence_basis(e) FROM evidence e WHERE e.id = '$A_NO'")" = "client_stated" ] && ok "B5: the role test removed → caught: the no-role person's attestation reads client-stated" || bad "B5: $(q "SELECT lvrf_evidence_basis(e) FROM evidence e WHERE e.id = '$A_NO'")"
reharden

step "7. M1: each run recomputes under the model it was sealed with"
cat > "$W/rc.ts" <<TS
import { recomputeWithCorrection } from '$(pwd)/server/lib/recomputeRun.ts';
const p = JSON.parse(process.argv[2]); const m = JSON.parse(process.argv[3]);
const r = recomputeWithCorrection(p, m, 'impact_basis');
console.log(r.ok ? 'ok:' + r.modelVersion + ':' + r.score : 'refused:' + r.reason);
TS
PAY3="$(q "SELECT payload FROM value_runs WHERE id = '$R3'")"; M3="$(q "SELECT json_build_object('kind', kind, 'summary', summary, 'provenance', provenance) FROM evidence WHERE id = '$EV3'")"
PAY2="$(q "SELECT payload FROM value_runs WHERE id = '$R2'")"; M2="$(q "SELECT json_build_object('kind', kind, 'summary', summary, 'provenance', provenance) FROM evidence e WHERE e.institution_id = '$INST2' AND e.summary = 'C3 export attested by the owner (fixture)'")"
RC3="$(npx tsx "$W/rc.ts" "$PAY3" "$M3" 2>&1 | tail -1)"; RC2="$(npx tsx "$W/rc.ts" "$PAY2" "$M2" 2>&1 | tail -1)"
printf '%s' "$RC3" | grep -q "^ok:1.0.0:" && ok "a 1.0.0 run recomputes under the kept 1.0.0 scorer ($RC3)" || bad "1.0.0 recompute: $RC3"
printf '%s' "$RC2" | grep -q "^ok:1.0.1:" && ok "a 1.0.1 run with an attested item recomputes under 1.0.1: its seal carries the attester ($RC2)" || bad "1.0.1 recompute: $RC2"
# B8 — the 1.0.0 scorer dropped from the registry.
edit "$SCORERS" "  [v100.MODEL_VERSION]: { version: v100.MODEL_VERSION, fingerprint: v100.MODEL_FINGERPRINT, computeConfidence: v100.computeConfidence as (i: ConfidenceInput) => ConfidenceResult },
" ""
RC8="$(npx tsx "$W/rc.ts" "$PAY3" "$M3" 2>&1 | tail -1)"
printf '%s' "$RC8" | grep -q "^refused:This run was sealed under model 1.0.0" && ok "B8: the 1.0.0 scorer dropped → caught: the 1.0.0 run's recompute is refused" || bad "B8: $RC8"
restore "$SCORERS"

step "8. The errata the seals call for: the dry run, its count, the batch (rulings B + C)"
expect GET /api/errata/non-customer-credit "" 200 "the dry run"
COUNT="$(rj b.count)"
LINE_OLD="$(rj "b.errata.find(x=>x.run_id==='$R_OLD')?.text ?? ''")"; PTS_OLD="$(rj "b.errata.find(x=>x.run_id==='$R_OLD')?.points ?? ''")"
EXPECT_TEXT="From this run's seal: 15 of 25 in \"Is the baseline supported by confirmed evidence?\" rest on an attestation by $ANALYST_NAME; 10 of 10 in \"Did a named, non-simulated person commit to this target?\" were credited to $ANALYST_NAME as committer."
printf '%s' "$LINE_OLD" | grep -qF "$EXPECT_TEXT" && [ "$PTS_OLD" = "25" ] && ok "the analyst's 1.0.0 run: 25 points, read from its seal: $LINE_OLD" || bad "R_OLD: $PTS_OLD $LINE_OLD"
[ "$(rj "[b.errata.some(x=>x.run_id==='$R2'), b.errata.some(x=>x.run_id==='$R4'), b.errata.some(x=>x.run_id==='$R3')].join(',')")" = "false,false,false" ] \
  && ok "  ...not the role-holder's run (customer-side), nor the no-role run (1.0.1 credited nothing), nor the plain run" || bad "  ...listed: $(rj "b.errata.map(x=>x.run_number).join(',')")"
rj "b.errata.filter(x=>x.run_id!=='$R_OLD').map(x=>'  NOTE  (the copy'+String.fromCharCode(39)+'s own, not judged) '+x.account+' run '+x.run_number+': '+x.points+' points').join('\n')" | head -20
expect POST /api/errata/non-customer-credit "$(J expected_count "$COUNT" reason 'Verification: X records them.')" 403 "X records the batch" "steward" "$X"
expect POST /api/errata/non-customer-credit "$(J expected_count "$((COUNT + 1))" reason 'Verification: a count that was off.')" 409 "the batch with a count that is off" "The count changed: the seals now call for $COUNT errata, not $((COUNT + 1))"
expect POST /api/errata/non-customer-credit "$(J expected_count "$COUNT" reason 'Verification: a typed figure.' points_not_credited 5)" 400 "a typed point figure" "what each erratum states is read from its run's seal by the server"
[ "$(q "SELECT count(*) FROM run_errata WHERE kind = 'non_customer_credit'")" = "0" ] && ok "  ...none of them wrote" || bad "  ...a refused batch wrote"

step "9. The browser: roles, the two batches (each confirmed, with its count), marks, credit errata, headlines, lineage"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "the steward signed in by session" || { bad "no session"; exit 1; }
cw() {  # MODE [LOGNAME] (env per mode)
  local log="$W/walk.${2:-$1}.log"
  node scripts/lib/c3_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" > "$log" 2>&1; local rc=$?
  if [ -z "${2:-}" ]; then
    PASS=$((PASS + $(grep -c '^  PASS' "$log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$log" || true)))
    grep -E '^  (PASS|FAIL)' "$log" || true
    [ "$rc" = "0" ] || bad "the $1 walk exited $rc (see $log)"
  fi
}
export OWNER_NAME ANALYST_NAME SOURCE STEWARD_NAME="$S_NAME"
INST="$INST2" GRANT_CHECK=1 cw roles
INST="$INST1" ANALYST_CHECK=1 cw roles
COUNT="$COUNT" EXPECT_TEXT="$EXPECT_TEXT" cw errata_batch
[ "$(q "SELECT count(*) FROM run_errata WHERE kind = 'non_customer_credit'")" = "$COUNT" ] && ok "  ...$COUNT errata recorded" || bad "  ...recorded: $(q "SELECT count(*) FROM run_errata WHERE kind = 'non_customer_credit'")"
[ "$(q "SELECT count(*) FROM governance_acts a JOIN run_errata x ON x.id = a.subject_id WHERE x.kind = 'non_customer_credit' AND a.act = 'record_erratum'")" = "$COUNT" ] && ok "  ...one act each" || bad "  ...acts"
[ "$(q "SELECT points_not_credited::numeric::int || '|' || (recomputed_score IS NULL) || '|' || (recompute_method LIKE '%The sealed score, 35 / 100, stands.') FROM run_errata WHERE value_run_id = '$R_OLD' AND kind = 'non_customer_credit'")" = "25|true|true" ] \
  && ok "  ...the analyst's run: 25 points, nothing recomputed, \"The sealed score, 35 / 100, stands.\"" || bad "  ...R_OLD erratum: $(q "SELECT points_not_credited, recompute_method FROM run_errata WHERE value_run_id = '$R_OLD' AND kind = 'non_customer_credit'")"
[ "$(q "SELECT md5(r::text) FROM value_runs r WHERE r.id = '$R_OLD'")" = "$SEAL_OLD" ] && ok "  ...the sealed run byte-identical" || bad "  ...the sealed run changed"
expect GET /api/errata/non-customer-credit "" 200 "the dry run again"
[ "$(rj b.count)" = "0" ] && ok "  ...calls for none: each run's erratum is recorded" || bad "  ...count $(rj b.count)"
expect POST /api/errata/non-customer-credit "$(J expected_count 1 reason 'Verification: once more.')" 409 "  ...a second batch, the count off" "The count changed: the seals now call for 0 errata, not 1"
# B9 — the batch without its count check: a count that was off is accepted.
edit "$C3R" "      if (list.length !== b.expected_count) {" "      if (false) {"
stop_server; start_server
expect POST /api/errata/non-customer-credit "$(J expected_count 3 reason 'Verification: B9, a count that was off.')" 201 "B9: without the count check, a count that was off → accepted (caught: the batch must refuse it)"
restore "$C3R"; stop_server; start_server
# Marks: the API's refusals, then the batch in the browser.
expect GET /api/system-exercise/candidates "" 200 "the marks' candidates"
SEX_NOTE="$(rj "b.candidates.find(x=>x.subject_id==='$EV_TEST').note")"
expect POST /api/system-exercise/marks "$(J items "[$(J subject_table evidence subject_id "$EV_TEST")]" expected_count 1)" 403 "X marks an item" "steward" "$X"
expect POST /api/system-exercise/marks "$(J items "[$(J subject_table evidence subject_id "$EV_TEST")]" expected_count 1 reason 'Typed reason.')" 400 "a typed reason" "each mark's reason quotes its item's own note"
expect POST /api/system-exercise/marks "$(J items "[$(J subject_table evidence subject_id "$EV_TEST")]" expected_count 2)" 409 "a count that is off" "The count changed"
[ "$(q "SELECT count(*) FROM system_exercise_marks")" = "0" ] && ok "  ...none of them wrote" || bad "  ...a refused mark wrote"
seal "$ENG2" "Verification: produced to exercise the system (fixture test run)."; R2B="$RUN"
RUN_NOTE="$(q "SELECT payload->>'note' FROM value_runs WHERE id = '$R2B'")"
ITEMS="evidence|$EV_TEST,value_runs|$R2B" NOTE_evidence="$SEX_NOTE" NOTE_value_runs="$RUN_NOTE" cw marks_batch
[ "$(q "SELECT count(*) || '|' || count(*) FILTER (WHERE reason = 'Entered to exercise the system, not as case evidence; its own note reads: ''' || (CASE WHEN subject_table = 'value_runs' THEN '$RUN_NOTE' ELSE '$(printf '%s' "$SEX_NOTE" | sed "s/'/''/g")' END) || '''') FROM system_exercise_marks")" = "2|2" ] \
  && ok "  ...two marks, each reason quoting its item's own note" || bad "  ...marks: $(q "SELECT subject_table, reason FROM system_exercise_marks")"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'mark' AND subject_table = 'system_exercise_marks'")" = "2" ] && ok "  ...one act each (mark)" || bad "  ...mark acts"
MK="$(q "SELECT id FROM system_exercise_marks LIMIT 1")"
sqlrefused "an UPDATE of a mark" "UPDATE system_exercise_marks SET reason = reason WHERE id = '$MK'" "is final"
sqlrefused "a DELETE of a mark" "DELETE FROM system_exercise_marks WHERE id = '$MK'" "never deleted"
sqlrefused "a mark by X, at the database" "INSERT INTO system_exercise_marks (tenant_id, subject_table, subject_id, reason, marked_by_person_id) VALUES ('$TEN', 'value_runs', '$R2', 'Entered to exercise the system, not as case evidence; its own note reads: ''a note long enough''', '$X')" "only the tenant's steward marks" "$X"
RUN="$R2B" PDF=c3_run_marked.pdf cw run_marked
pages() {  # PDF NEEDLE_EVERY NEEDLE_PAGE1 LABEL [no]
  local n p miss="" flat; n="$(pdfinfo "$1" 2>/dev/null | awk '/^Pages:/{print $2}')"
  for p in $(seq 1 "$n"); do flat="$(pdftotext -f "$p" -l "$p" "$1" - 2>/dev/null | tr -d '[:space:]')"
    printf '%s' "$flat" | grep -qF "$2" || miss="$miss p$p"
    printf '%s' "$flat" | grep -qF "UNVERIFIED—thisrun'soutcomehasnoverifiedactual" || miss="$miss p$p:disclosure"; done
  [ "$(pdftotext -f 1 -l 1 "$1" - | tr -d '[:space:]' | grep -cF "$3")" -ge 1 ] || miss="$miss p1:full"
  if [ "${5:-}" = no ]; then [ -n "$miss" ] && ok "$4 → caught: pages missing it:$miss" || bad "$4: not caught"
  else [ -z "$miss" ] && ok "$4 ($n pages)" || bad "$4: missing$miss"; fi
}
pages "$SHOTS/c3_run_marked.pdf" "SYSTEMEXERCISE—enteredtoexercisethesystem,notascaseevidence.Fulltextonpage1." "itsownnotereads:" "the marked run printed: every page says \"SYSTEM EXERCISE — … Full text on page 1.\" beside the disclosure; page 1 the full reason"
RUN="$R_OLD" PDF=c3_run_credit.pdf EXPECT_TEXT="$EXPECT_TEXT" cw run_credit
pages "$SHOTS/c3_run_credit.pdf" "ERRATUM:credittoapersonnotcustomer-side(sealed35/100).Fulltextonpage1." "UndertheC3rule" "the credited run printed: every page's header reads \"ERRATUM: credit to a person not customer-side (sealed 35 / 100). Full text on page 1.\""
RUN="$R2" MARKED_SUMMARY='Entered to exercise the accept path (fixture test row)' cw run_roles
LINE="erratum: 25 of these points rest on a person who is not customer-side"
# The book (GET /api/cohort): the run of record is the latest unmarked locked run, with its erratum line.
cohort_of() { expect GET /api/cohort "" 200 "$1"; COH_OUT="$(rj "JSON.stringify(b.book.members.filter(m=>['$ENG1','$ENG2'].includes(m.engagement_id)).map(m=>[m.engagement_id===('$ENG1')?'analyst':'role', m.run_id, m.erratum_line]))")"; }
COH_WANT="$(node -e 'console.log(JSON.stringify([["analyst",process.argv[1],process.argv[3]],["role",process.argv[2],null]]))' "$R_OLD" "$R2" "$LINE")"
COH_SORT() { node -e 'console.log(JSON.stringify(JSON.parse(process.argv[1]).sort()))' "$1"; }
cohort_of "the book"
[ "$(COH_SORT "$COH_OUT")" = "$(COH_SORT "$COH_WANT")" ] && ok "  ...its run of record for the role-holder's engagement is run $(q "SELECT run_number FROM value_runs WHERE id = '$R2'"), not the marked one; the analyst's carries \"$LINE\"" || bad "  ...book members: $COH_OUT (want $COH_WANT)"
# B13 — the book's run of record taking a marked run.
edit "$COH" "              AND lvrf_system_exercise_mark('value_runs', id) IS NULL
" ""
stop_server; start_server
cohort_of "B13: the book without the mark filter"
[ "$(COH_SORT "$COH_OUT")" != "$(COH_SORT "$COH_WANT")" ] && printf '%s' "$COH_OUT" | grep -qF "$R2B" && ok "  ...caught: the marked run becomes the run of record" || bad "  ...B13 not caught: $COH_OUT"
restore "$COH"; stop_server; start_server
INST1="$INST1" INST2="$INST2" LINE="$LINE" HEADLINE_RUN="$(q "SELECT run_number FROM value_runs WHERE id = '$R2'")" MARKED_RUN="$(q "SELECT run_number FROM value_runs WHERE id = '$R2B'")" cw headlines
O_ROLE="$O2" O_ANALYST="$O1" cw lineage
# B10 — the POV's headline taking a marked run.
edit "$VH" "                 AND lvrf_system_exercise_mark('value_runs', r.id) IS NULL
               ORDER BY r.run_number DESC LIMIT 1) AS latest_locked_run," "               ORDER BY r.run_number DESC LIMIT 1) AS latest_locked_run,"
stop_server; start_server; sleep 2
INST1="$INST1" INST2="$INST2" LINE="$LINE" HEADLINE_RUN="$(q "SELECT run_number FROM value_runs WHERE id = '$R2'")" MARKED_RUN="$(q "SELECT run_number FROM value_runs WHERE id = '$R2B'")" cw headlines b10
grep -q "^  FAIL  its headline is run" "$W/walk.b10.log" && ok "B10: the POV's headline taking a marked run → caught" || bad "B10: not caught: $(grep -m2 'headline is run' "$W/walk.b10.log")"
restore "$VH"; stop_server; start_server
# B11 — the POV's headline without its erratum line.
edit "$POVP" "            {e.latest_locked_run!.erratum_line && <span className=\"mt-1 block text-[11px] text-warning\" data-testid=\"headline-erratum\">{e.latest_locked_run!.erratum_line}</span>}" ""
sleep 3
INST1="$INST1" INST2="$INST2" LINE="$LINE" HEADLINE_RUN="$(q "SELECT run_number FROM value_runs WHERE id = '$R2'")" MARKED_RUN="$(q "SELECT run_number FROM value_runs WHERE id = '$R2B'")" cw headlines b11
grep -q "^  FAIL  the POV's headline shows" "$W/walk.b11.log" && ok "B11: the POV's headline without its erratum line → caught" || bad "B11: not caught: $(grep -m2 "POV's headline" "$W/walk.b11.log")"
restore "$POVP"
# B14 — the book's row without its erratum line.
edit "$CARD" "                      {m.erratum_line && <span className=\"mt-1 block text-[11px] text-warning\" data-testid=\"book-member-erratum\">{m.erratum_line}</span>}
" ""
sleep 3
INST1="$INST1" INST2="$INST2" LINE="$LINE" HEADLINE_RUN="$(q "SELECT run_number FROM value_runs WHERE id = '$R2'")" MARKED_RUN="$(q "SELECT run_number FROM value_runs WHERE id = '$R2B'")" cw headlines b14
grep -q "^  FAIL  the book's weakest-link table shows" "$W/walk.b14.log" && ok "B14: the book's row without its erratum line → caught" || bad "B14: not caught: $(grep -m2 "weakest-link" "$W/walk.b14.log")"
restore "$CARD"
# B12 — the print without the system-exercise line.
edit "$BENCH" "      {run.system_exercise && (
        <div className={'bg-ink px-4 py-2 font-mono text-[12px] tracking-[.04em] text-offwhite [overflow-wrap:anywhere] sm:px-6' + line} data-testid=\"banner-system-exercise\">" "      {run.system_exercise && !compact && (
        <div className={'bg-ink px-4 py-2 font-mono text-[12px] tracking-[.04em] text-offwhite [overflow-wrap:anywhere] sm:px-6' + line} data-testid=\"banner-system-exercise\">"
sleep 3; RUN="$R2B" PDF=c3_run_marked_b12.pdf cw run_marked b12
pages "$SHOTS/c3_run_marked_b12.pdf" "SYSTEMEXERCISE—enteredtoexercisethesystem,notascaseevidence.Fulltextonpage1." "itsownnotereads:" "B12: the print without the system-exercise line" no
restore "$BENCH"

step "10. The seals: every run hashes"
HASH1="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
RUNS1="$(q "SELECT count(*) FROM value_runs")"
printf '%s' "$HASH1" | grep -qE "^$RUNS1 runs: recompute matches $RUNS1, differs 0; embedded payloadHash matches $RUNS1, differs 0" && ok "check_run_hashes: $HASH1" || bad "hashes: $HASH1"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots and PDFs: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
