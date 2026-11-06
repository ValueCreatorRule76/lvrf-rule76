#!/usr/bin/env bash
#
# C3b — the definition factor under the C3 rule (model 1.0.2, 1.0.0 and 1.0.1 kept); a figure with no source on
# record (figure_findings, the 'unsourced_figure' erratum); one errata batch with both counts; "verified without
# the source being opened" (LVRF_PLAN §15; migration 0044; hardening.sql section 29; Brad's rulings and
# conditions, 27 Oct 2026). Local verification.
#
#   ./scripts/verify_c3b.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` to `lvrf_verifyc3b`, migrated (through 0044) and hardened, dropped on exit. L39: the
# fixtures are the script's own, through the routes; roles through the role act only. Runs sealed under 1.0.0
# and 1.0.1 are sealed by that code itself (produceRun.ts and confidenceModel.ts as at 42e7fe4 and eaf29a3, put
# back for the sealing and restored). The clone's own Curia runs appear in the dry run; counted, not judged.
# DELIBERATE BREAKS, every file restored byte-identical, every function restored by re-applying hardening.sql:
#   B1  1.0.2 crediting a non-customer-side confirmer: the model check catches it
#   B2  DEFINITION_RULE left out of the fingerprint: 1.0.2 would carry 1.0.1's fingerprint
#   B3  the 1.0.1 scorer dropped from the registry: a 1.0.1 run's recompute is refused
#   B4  the confirmer read from the metric's latest version, as it stands: the run sealed under the earlier
#       version is wrongly listed
#   B5  each of the finding's three checks removed (three breaks): a finding is accepted on an account that has it
#   B6  "invented" in a finding or an unsourced-figure erratum: the CHECKs refuse it
#   B7  the batch without its unsourced-figure count check: a count that was off is accepted
#   B8  the run page's sealed banner without its unsourced line: the run-page check catches it
#   B9  the erratum line without the unsourced kind: the headline check catches it
#   B10 the POV's baseline without its finding line: the POV check catches it
#   B11 a finding present, its evidence's basis still system_of_record (the rule removed): the basis check catches it

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

VERIFY_DB=lvrf_verifyc3b
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3104; VITE_PORT=5204; CDP_PORT=9364
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_c3b.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
PRODUCE=server/routes/produceRun.ts; MODELF=server/spine/confidenceModel.ts; SCORERS=server/spine/scorers.ts
C3R=server/routes/creditAndMarks.ts; NCC=server/lib/nonCustomerCredit.ts; POVP=client/src/pages/PovPage.tsx; BENCH=client/src/components/workbench/Workbench.tsx
EDITED=("$PRODUCE" "$MODELF" "$SCORERS" "$C3R" "$NCC" "$POVP" "$BENCH")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
V100=42e7fe4; V101=eaf29a3
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
  for p in $(lsof -ti tcp:$PORT,$VITE_PORT,$CDP_PORT 2>/dev/null); do kill "$p" 2>/dev/null || true; done
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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "209" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 209 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}
code_at() {  # REF — that commit's produce-run and model, for sealing under its model
  git show "$1:$PRODUCE" > "$PRODUCE"; git show "$1:$MODELF" > "$MODELF"; stop_server; start_server
}
code_now() { restore "$PRODUCE"; restore "$MODELF"; stop_server; start_server; }
FP() { npx tsx -e "import('./$1').then(m=>console.log(m.MODEL_VERSION + ' ' + m.MODEL_FINGERPRINT))" 2>&1 | tail -1; }
factors() { q "SELECT string_agg(f->>'factor' || '=' || (f->>'earned'), ',' ORDER BY f->>'factor') FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$1'"; }

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc.log")"
(cd client && npx tsc -b) > "$W/tsc2.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc2.log")"

step "2. The models: 1.0.2 current; 1.0.0 and 1.0.1 kept (M1; C3b ruling 1)"
F100="$(FP server/spine/models/confidence_1_0_0.ts)"; F101="$(FP server/spine/models/confidence_1_0_1.ts)"; F102="$(FP "$MODELF")"
[ "$F100" = "1.0.0 d4cf8f31472a" ] && ok "1.0.0 kept: $F100" || bad "1.0.0: $F100"
[ "$F101" = "1.0.1 cf11d21c781a" ] && ok "1.0.1 kept: $F101, the fingerprint C3 recorded" || bad "1.0.1: $F101"
[ "${F102%% *}" = "1.0.2" ] && [ "${F102##* }" != "cf11d21c781a" ] && [ "${F102##* }" != "d4cf8f31472a" ] && ok "the current model: $F102 (DEFINITION_RULE moves the fingerprint with the version)" || bad "1.0.2: $F102"
REG="$(npx tsx -e "import('./$SCORERS').then(m=>console.log(Object.values(m.SCORERS).map(s=>s.version+':'+s.fingerprint).sort().join(',')))" 2>&1 | tail -1)"
[ "$REG" = "1.0.0:d4cf8f31472a,1.0.1:cf11d21c781a,1.0.2:${F102##* }" ] && ok "the registry keeps all three, each at its fingerprint" || bad "registry: $REG"
# B2 — DEFINITION_RULE out of the fingerprint.
edit "$MODELF" "      definitionRule: DEFINITION_RULE," ""
F2="$(FP "$MODELF")"
[ "${F2##* }" = "cf11d21c781a" ] && ok "B2: DEFINITION_RULE left out → caught: 1.0.2 would carry 1.0.1's fingerprint ($F2)" || bad "B2: $F2"
restore "$MODELF"
cat > "$W/model.ts" <<TS
import { computeConfidence as c102 } from '$(pwd)/$MODELF';
import { computeConfidence as c101 } from '$(pwd)/server/spine/models/confidence_1_0_1.ts';
const base = { metricDefinitionConfirmed: true, metricDefinitionConfirmerName: 'P', evidence: [], claimedCurrencyImpact: null, realizedCurrencyImpact: null,
  impactBasisStated: false, impactIsInference: true, committerName: null, committerSimulated: false, verifierName: null, verifierSimulated: false, assertedConfidence: null };
const d = (r: ReturnType<typeof c102>) => { const f = r.factors.find((x) => x.factor === 'metric_definition_confirmed')!; return f.earned + ':' + f.note; };
console.log(JSON.stringify([
  d(c102({ ...base, metricDefinitionConfirmerCustomerSide: true, metricDefinitionConfirmerRoles: 'metric owner per X, named by S, 1 Jan 2026' })),
  d(c102({ ...base, metricDefinitionConfirmerCustomerSide: false, metricDefinitionConfirmerSideReason: 'no customer-side role named from a source' })),
  d(c102({ ...base, metricDefinitionConfirmerCustomerSide: null })),
  d(c101({ ...base, metricDefinitionConfirmerCustomerSide: false } as never)),
]));
TS
MOD="$(npx tsx "$W/model.ts" 2>&1 | tail -1)"
[ "$MOD" = '["20:Calculation method documented, confirmed by P (metric owner per X, named by S, 1 Jan 2026).","0:Calculation method documented and confirmed by P, who is not customer-side (no customer-side role named from a source).","0:Calculation method documented and confirmed by P, who is not customer-side (no customer-side role named from a source).","20:Calculation method documented."]' ] \
  && ok "1.0.2 credits the definition (20) only for a customer-side confirmer, naming the role's source; otherwise 0, saying why; 1.0.1, kept, did not ask" || bad "model: $MOD"
# B1 — 1.0.2 crediting a non-customer-side confirmer.
edit "$MODELF" "  if (input.metricDefinitionConfirmed && input.metricDefinitionConfirmerCustomerSide === true) {" "  if (input.metricDefinitionConfirmed) {"
MOD1="$(npx tsx "$W/model.ts" 2>&1 | tail -1)"
printf '%s' "$MOD1" | node -e 'const a=JSON.parse(require("fs").readFileSync(0,"utf8"));process.exit(a[1].startsWith("20:")?0:1)' && ok "B1: 1.0.2 crediting a non-customer-side confirmer → caught (20 for a confirmer with no role)" || bad "B1: $MOD1"
restore "$MODELF"
# Condition 1, the wording: a confirmer not recoverable from the seal is said so, and counts nothing.
DP="$(npx tsx -e "import('./$NCC').then(m=>{const f={factor:'metric_definition_confirmed',question:'Q?',weight:20,earned:20};console.log(JSON.stringify([m.definitionPart(f,null),m.definitionPart(f,{full_name:'A',customer_side:true}),m.definitionPart(f,{full_name:'A',customer_side:false})]))})" 2>&1 | tail -1)"
[ "$DP" = '[{"points":0,"part":"20 of 20 in \"Q?\" rest on a confirmer: the confirmer is not recoverable from this seal, so no points are counted for it"},{"points":0,"part":null},{"points":20,"part":"20 of 20 in \"Q?\" rest on a confirmation by A"}]' ] \
  && ok "the definition's part of a credit erratum: \"the confirmer is not recoverable from this seal\" with no points (condition 1); nothing for a customer-side confirmer; the points otherwise" || bad "definitionPart: $DP"

# Ruling 2 (31 Oct): a run whose only credit rests on an unrecoverable confirmer still gets an erratum, saying the rule cannot be applied.
CT="$(npx tsx -e "import('./$NCC').then(m=>console.log(m.creditErratumText(['20 of 20 in \"Q?\" rest on a confirmer: the confirmer is not recoverable from this seal, so no points are counted for it'],'',true,45)))" 2>&1 | tail -1)"
[ "$CT" = "From this run's seal: 20 of 20 in \"Q?\" rest on a confirmer: the confirmer is not recoverable from this seal, so no points are counted for it. The C3 rule cannot be applied to credit resting on a confirmer not recoverable from this seal. The sealed score, 45 / 100, stands." ] \
  && ok "a run with only that credit: its erratum says the points rest on a confirmer not recoverable, the rule cannot be applied, and the sealed score stands" || bad "creditErratumText: $CT"

step "3. Clone the prod copy; migrate through 0044; harden; what 0044 orphans"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
ERR0="$(q "SELECT count(*) || '|' || coalesce(string_agg(md5(e::text), '' ORDER BY id), '') FROM run_errata e")"
CRED0="$(q "SELECT count(*) FROM run_errata WHERE kind = 'non_customer_credit'")"; UNS0="$(q "SELECT count(*) FROM run_errata WHERE kind = 'unsourced_figure'")"; FIND0="$(q "SELECT count(*) FROM figure_findings")"
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (through 0044_c3b_findings)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "209" ] && ok "209 triggers (B4 section 34: +5) (B3 section 33: +18) (176 + section 29's five: figure_findings guard, immutable, audit, no_delete, act_present)" || bad "triggers: $(trig)"
[ "$(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")" = "328" ] && ok "  ...328 information_schema rows (B4: +8) (B3: +32) (274 + 7)" || bad "  ...rows: $(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 50 migrations, newest 0049_b4_attribution" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^[0-9]+ CHECKs in the database: [0-9]+ with a plain sentence, 0 without; 0 stale" && ok "every CHECK has its plain sentence ($PLAIN)" || bad "plain: $PLAIN"
[ "$(q "SELECT count(*) || '|' || coalesce(string_agg(md5(e::text), '' ORDER BY id), '') FROM run_errata e")" = "$ERR0" ] && ok "0044 orphans nothing: all ${ERR0%%|*} errata kept, each unchanged" || bad "errata after 0044"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "  ...every run byte-identical" || bad "  ...a run changed"
for c in figure_findings_never_invented run_errata_never_invented run_errata_kind_complete; do
  [ -n "$(q "SELECT 1 FROM pg_constraint WHERE conname = '$c'")" ] && ok "CHECK $c present" || bad "CHECK $c missing"
done

step "4. Fixtures and the server"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
S_TITLE="$(q "SELECT lower(coalesce(title, '')) FROM persons WHERE id = '$S'")"
S_ROLE="$([ -n "$S_TITLE" ] && printf "the vendor's %s" "$S_TITLE" || printf "the vendor's staff")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', 'x.$TS@c3b.example') RETURNING id" | head -1)"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
start_server && ok "API up on $PORT"
ANALYST_NAME="C3b analyst of record (fixture)"
acct() {  # NAME PERSONS_JSON -> INST, ACCT, P0, P1
  ACCT="$1 $TS"
  expect POST /api/account-inputs "$(J institution "$(J name "$ACCT" industry_slug manufacturing classification_note 'Verification: classified for C3b.')" persons "$2")" 201 "account: $1"
  INST="$(rj b.institution_id)"; P0="$(rj b.person_ids[0])"; P1="$(rj "b.person_ids[1] ?? ''")"
  expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'C3b capability' owner_person_id "$P0" is_primary false basis 'Verification: the solution.')" 201 "  ...its offering"
  CAP="$(rj b.capability_id)"
}
SRCSYS="Customer HRIS, supplied by the customer (fixture, not a source)"
outcome() {  # NAME OWNER BASELINE -> O, ENG, MET
  expect POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name "C3b engagement $1" engagement_owner_person_id "$2" capability_name 'C3b capability' metric "$(J name "C3b days to productivity $1" unit days direction decrease source_system "$SRCSYS" owner_person_id "$2")" baseline_value "$3" baseline_measured_at 2023-06-30T00:00:00Z)" 201 "outcome $1, baseline $3"
  O="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"; MET="$(rj b.business_metric_id)"
}
validate() {  # METRIC CONFIRMER BASELINE -> O (the new outcome), MET (the new metric)
  expect POST "/api/business-metrics/$1/validate" "$(J metric "$(J unit days direction decrease source_system "$SRCSYS" definition_notes 'Calendar days from promotion to the first review at standard (fixture).')" baseline_value "$3" baseline_measured_at 2023-06-30T00:00:00Z confirmed_by_person_id "$2" supersession_reason 'Verification: the definition confirmed.')" 201 "  ...the metric validated, its definition confirmed"
  O="$(rj b.outcomes[0].new_outcome_id)"; MET="$(rj b.new_metric_id)"
}
evid() {  # OUTCOME KIND SUMMARY SUPPORTS [ATTESTER] -> EV
  if [ -n "${5:-}" ]; then expect POST "/api/value-outcomes/$1/evidence" "$(J kind "$2" provenance "Fixture source for: $3" summary "$3" supports "$4" source_verified "${EVID_VERIFIED:-true}" ai_sourced false simulated false evidence_form quote quote_text 'Mean 214 days, from the export.' how_read 'The mean, read from the export.' attested_by_person_id "$5" attested_at 2025-10-01T00:00:00Z)" 201 "  ...evidence: $3"
  else expect POST "/api/value-outcomes/$1/evidence" "$(J kind "$2" provenance "Fixture source for: $3" summary "$3" supports "$4" source_verified "${EVID_VERIFIED:-true}" ai_sourced false simulated false evidence_form quote quote_text 'Named in the org chart.' how_read 'The name, read as published.')" 201 "  ...evidence: $3"; fi
  EV="$(rj b.evidence_id)"
}
seal() { expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'VALIDATED BASELINE' note "$2" source_fixture c3b_validated)" 201 "  ...produced: $2"; RUN="$(rj b.value_run_id)"; expect POST "/api/value-runs/$RUN/lock" "$(J lock_reason 'Verification: sealed.')" 200 "  ...locked"; }

# Account V — worked by the vendor alone, in Curia's shape: an external analyst confirms the definition, attests an
# "export" and commits; the figure is entered by tenant staff; runs sealed under 1.0.0, 1.0.1 and 1.0.2.
acct "C3b vendor-alone account (fixture)" "[$(J full_name "$ANALYST_NAME" email "analyst.$TS@c3b.example" title 'External analyst of record — not an employee')]"
INSTV="$INST"; ACCTV="$ACCT"; ANALYST="$P0"
outcome V "$ANALYST" 214; ENGV="$ENG"
validate "$MET" "$ANALYST" 214; OV="$O"; METV="$MET"
# L41: a row verified with no opening cannot be made any more, so V's row is unverified; an opening would block the
# finding. "verified without the source being opened" is read below from a row of the copy that holds it.
EVID_VERIFIED=false evid "$OV" system_export 'C3b export attested by the analyst (fixture)' baseline "$ANALYST"; EVV="$EV"
expect POST "/api/value-outcomes/$OV/commit" "$(J target_value 150 committed_by_person_id "$ANALYST" committed_at 2026-10-01T00:00:00Z commitment_note 'Verification: committed by the analyst.' attribution_method contribution_only measure_class capability_performance)" 201 "  ...committed by the analyst"
# The POV shows an outcome's figures and evidence under its hypothesis (C2's fixture shape): a pack entry, its lever, the claim, the basis.
IND="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
ENTRY="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation) VALUES ('$TEN', '$IND', 'C3b days to productivity entry (fixture) $TS', 'days', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders: cohort mix.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
expect POST "/api/capabilities/$CAP/industry-measures" "$(J industry_measure_id "$ENTRY" claim 'Verification: coaching shortens time to productivity.')" 201 "  ...the capability claims a fixture pack entry"
expect POST "/api/industry-measures/$ENTRY/levers" "$(J name 'Manager coaching (C3b fixture)' mechanism 'New managers coached in the first months reach standard sooner.' leading_indicator 'Coaching sessions held' citation 'Verification citation, not a source.')" 201 "  ...a lever on it"
LEVER="$(rj b.value_lever_id)"
expect POST "/api/business-metrics/$METV/pack-basis" "$(J industry_measure_id "$ENTRY" basis_note 'Verification: the same measure.')" 201 "  ...the metric based on the entry"
expect POST "/api/institutions/$INSTV/hypotheses" "$(J value_outcome_id "$OV" value_lever_id "$LEVER" statement 'Coaching new managers shortens their time to full productivity at this account.' falsifier_reference baseline falsifier_due "$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 365, 'YYYY-MM-DD')")" falsifier_conditions 'on the same cohort definition')" 201 "  ...a hypothesis on the outcome"
code_at "$V100"; ok "the 1.0.0 code ($V100) in place"
seal "$ENGV" "Verification: run 1, under 1.0.0."; RV1="$RUN"
code_now; code_at "$V101"; ok "the 1.0.1 code ($V101) in place"
seal "$ENGV" "Verification: run 2, under 1.0.1."; RV2="$RUN"
code_now
seal "$ENGV" "Verification: run 3, under 1.0.2."; RV3="$RUN"
[ "$(q "SELECT string_agg(payload->'confidence'->>'modelVersion', ',' ORDER BY run_number) FROM value_runs WHERE id IN ('$RV1', '$RV2', '$RV3')")" = "1.0.0,1.0.1,1.0.2" ] && ok "three runs, sealed under 1.0.0, 1.0.1 and 1.0.2" || bad "models: $(q "SELECT string_agg(payload->'confidence'->>'modelVersion', ',' ORDER BY run_number) FROM value_runs WHERE id IN ('$RV1', '$RV2', '$RV3')")"
F1="$(factors "$RV1")"; F2r="$(factors "$RV2")"; F3="$(factors "$RV3")"
printf '%s' "$F1" | grep -q "metric_definition_confirmed=20" && printf '%s' "$F1" | grep -q "baseline_evidence_verified=0" && printf '%s' "$F1" | grep -q "human_commit_of_record=10" && ok "  ...1.0.0 credited the analyst: definition 20, committer 10 (the export unverified, L41) (Curia runs 13–21's shape)" || bad "  ...RV1: $F1"
printf '%s' "$F2r" | grep -q "metric_definition_confirmed=20" && printf '%s' "$F2r" | grep -q "baseline_evidence_verified=0" && printf '%s' "$F2r" | grep -q "human_commit_of_record=0" && ok "  ...1.0.1 credited only the definition (20): C3's rule did not reach it" || bad "  ...RV2: $F2r"
printf '%s' "$F3" | grep -q "metric_definition_confirmed=0" && printf '%s' "$F3" | grep -q "baseline_evidence_verified=0" && ok "  ...1.0.2 credits none of it" || bad "  ...RV3: $F3"
N3="$(q "SELECT f->>'note' FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$RV3' AND f->>'factor' = 'metric_definition_confirmed'")"
[ "$N3" = "Calculation method documented and confirmed by $ANALYST_NAME, who is not customer-side (no customer-side role named from a source)." ] && ok "  ...its note: \"$N3\"" || bad "  ...note: $N3"
[ "$(q "SELECT (payload->'businessMetric'->>'id' = '$METV') || '|' || (payload->'people'->'definition_confirmer'->>'name') || '|' || (payload->'people'->'definition_confirmer'->>'customer_side') FROM value_runs WHERE id = '$RV3'")" = "true|$ANALYST_NAME|false" ] \
  && ok "  ...1.0.2 seals the metric version and the confirmer, as they stood (C3b-D1 for every later run)" || bad "  ...sealed: $(q "SELECT payload->'people' FROM value_runs WHERE id = '$RV3'")"
SEALS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE r.id IN ('$RV1', '$RV2', '$RV3')")"

# Account W — the version chain (C3b-D1): v1 confirmed by the customer-side owner (a role named through the act),
# a run sealed under 1.0.1 (no metric id sealed), then v2 confirmed by an analyst.
acct "C3b version account (fixture)" "[$(J full_name 'C3b owner (fixture)' email "ownerw.$TS@c3b.example" title Owner),$(J full_name 'C3b analyst W (fixture)' email "analystw.$TS@c3b.example" title 'External analyst of record — not an employee')]"
INSTW="$INST"; OWNERW="$P0"; ANALYSTW="$P1"
outcome W "$OWNERW" 30; ENGW="$ENG"
csrc() { expect POST "/api/institutions/$1/evidence" "$(J about account kind artifact provenance "Fixture source for: $2" summary "$2" evidence_form quote quote_text 'Named in the fixture org chart.' how_read 'Read from the fixture org chart, top box.')" 201 "  ...the source, as account evidence (L47)"; EV="$(rj b.evidence_id)"; expect POST "/api/evidence/$EV/open-citation" '{"source_verified":true}' 200 "  ...opened by a person"; }
csrc "$INSTW" 'C3b org chart naming the owner as metric owner'; SRCW="$EV"
expect POST "/api/institutions/$INSTW/customer-roles" "$(J person_id "$OWNERW" role metric_owner source_evidence_id "$SRCW" reason 'Verification: named from the org chart.')" 201 "  ...the owner named metric owner, from the org chart (the act)"
validate "$MET" "$OWNERW" 30; MW1="$MET"
code_at "$V101"
seal "$ENGW" "Verification: W run 1, under 1.0.1, the owner's confirmation."; RW1="$RUN"
code_now
validate "$MW1" "$ANALYSTW" 30; MW2="$MET"
[ "$(factors "$RW1" | grep -o 'metric_definition_confirmed=[0-9.]*')" = "metric_definition_confirmed=20" ] && [ "$(q "SELECT payload->'businessMetric' ? 'id' FROM value_runs WHERE id = '$RW1'")" = "f" ] \
  && ok "  ...W run 1 earned the definition from the owner's confirmation, and sealed no metric id" || bad "  ...RW1: $(factors "$RW1")"

step "5. The finding: its route's refusals, its three checks in the database (B5), \"never invented\" (B6)"
FF() { printf '/api/value-outcomes/%s/figure-findings' "$1"; }
expect GET "$(FF "$OV")" "" 200 "the figures of V's outcome, with what a finding would say"
WOULD="$(rj "b.fields.find(f=>f.field==='baseline_value').would_say")"
D_ENT="$(q "SELECT to_char(min(at) AT TIME ZONE 'UTC', 'FMDD Mon YYYY') FROM audit_log WHERE table_name = 'value_outcomes' AND record_id = '$OV' AND (new_row->>'baseline_value')::numeric = 214")"
WANT="The baseline, 214 days, has no source on record: it was entered by $S_NAME, $S_ROLE, on $D_ENT, and nothing from $ACCTV exists in LVRF (no person of $ACCTV is customer-side; no evidence of $ACCTV has an opened citation or a customer-side attester; no research result or fact about $ACCTV was accepted)."
[ "$WOULD" = "$WANT" ] && ok "  ...it would say: \"$WOULD\" (who entered it read from the audit log; the three facts named)" || bad "  ...would say: $WOULD (want $WANT)"
[ "$(rj "b.fields.find(f=>f.field==='baseline_value').blockers.length")" = "0" ] && ok "  ...no blocker on V" || bad "  ...blockers on V"
expect POST "$(FF "$OV")" "$(J field baseline_value reason 'Verification: X records it.')" 403 "X records a finding" "steward" "$X"
expect POST "$(FF "$OV")" "$(J field target_value reason 'Verification: an unknown figure.')" 422 "an unknown figure" "baseline_value, actual_value or claimed_currency_impact"
expect POST "$(FF "$OV")" "$(J field actual_value reason 'Verification: no actual recorded.')" 422 "a figure the outcome does not record" "records no actual"
expect POST "$(FF "$OV")" "$(J field baseline_value reason 'Short')" 422 "a 5-character reason" "in at least 12 characters"
expect POST "$(FF "$OV")" "$(J field baseline_value reason 'Verification: the figure was invented.')" 422 "a reason saying \"invented\"" "never says the figure was invented"
expect POST "$(FF "$OV")" "$(J field baseline_value value 214 reason 'Verification: a typed figure.')" 400 "a typed figure" "read from the record by the server"
[ "$(q "SELECT count(*) FROM figure_findings")" = "$FIND0" ] && ok "  ...none of them wrote" || bad "  ...a refused finding wrote"
FSQL() { printf "INSERT INTO figure_findings (tenant_id, institution_id, value_outcome_id, field, value, finding_text, reason, recorded_by_person_id) VALUES ('%s', '%s', '%s', 'baseline_value', %s, 'The baseline has no source on record: verification.', '%s', '%s')" "$TEN" "$1" "$2" "$3" "${4:-Verification: a finding by SQL.}" "${5:-$S}"; }
sqlrefused "B6: \"invented\" in a finding, at the database" "$(FSQL "$INSTV" "$OV" 214 'Verification: the figure was invented.')" "figure_findings_never_invented"
[ "$(sqlaccepted "$(FSQL "$INSTV" "$OV" 214 'Verification: the Inventec inventory export.')")" = "ACCEPTED" ] && ok "  ...whole words only: a name such as \"Inventec\" or the word \"inventory\" is not refused (rolled back)" || bad "  ...a false refusal: $(sqlaccepted "$(FSQL "$INSTV" "$OV" 214 'Verification: the Inventec inventory export.')")"
sqlrefused "a finding by X, at the database" "$(FSQL "$INSTV" "$OV" 214 'Verification: by X.' "$X")" "only the tenant's steward records a finding" "$X"
sqlrefused "a finding naming another value than the outcome's" "$(FSQL "$INSTV" "$OV" 215)" "the finding names the figure as it stands"
# Three accounts, each holding one of the three things the finding's text denies.
blk() {  # NAME -> INST, O (an outcome with baseline 214, the owner P0)
  acct "$1" "[$(J full_name "C3b person ($1)" email "p.$RANDOM.$TS@c3b.example" title Owner)]"
  outcome "$1" "$P0" 214
}
blk "C3b blocker one (fixture)"; IB1="$INST"; OB1="$O"
csrc "$IB1" 'C3b org chart naming the person (blocker one)'
expect POST "/api/institutions/$IB1/customer-roles" "$(J person_id "$P0" role metric_owner source_evidence_id "$EV" reason 'Verification: named from the org chart.')" 201 "  ...a customer-side person, named through the act"
blk "C3b blocker two (fixture)"; IB2="$INST"; OB2="$O"
expect POST "/api/value-outcomes/$OB2/evidence" "$(J kind public_filing provenance 'Fixture AI search (not a source)' summary 'C3b AI-found filing (blocker two)' supports baseline source_verified false ai_sourced true research_query 'C3b (fixture)' research_tool 'Verification tool' simulated false evidence_form quote quote_text 'A fixture sentence.' how_read 'Read as written, from the fixture.')" 201 "  ...AI-sourced evidence"
expect POST "/api/evidence/$(rj b.evidence_id)/open-citation" '{"source_verified":true}' 200 "  ...its citation opened"
blk "C3b blocker three (fixture)"; IB3="$INST"; OB3="$O"
expect POST "/api/institutions/$IB3/facts" '{"kind":"system","value_text":"Workday (HRIS)","as_of":"2026-10-01","evidence_kind":"public_filing","provenance":"Verification run, not a real source","confidence":"low","evidence_form":"quote","quote_text":"Verification fixture quote, not a source.","how_read":"Verification fixture: read from the fixture quote as written.","source_verified":false,"ai_sourced":false}' 201 "  ...a fact about the account"
for n in 1 2 3; do
  eval "I=\$IB$n; O=\$OB$n"
  case $n in 1) WHY='a person of this account is customer-side'; CUT="CASE WHEN EXISTS (SELECT 1 FROM persons p WHERE p.institution_id = p_institution AND p.deleted_at IS NULL AND lvrf_customer_side(p.id, p_institution))" ;;
             2) WHY='evidence of this account has an opened citation or a customer-side attester'; CUT="CASE WHEN EXISTS (SELECT 1 FROM evidence e WHERE e.institution_id = p_institution AND e.deleted_at IS NULL" ;;
             3) WHY='a research result or fact about this account was accepted'; CUT="CASE WHEN EXISTS (SELECT 1 FROM institution_facts f WHERE f.institution_id = p_institution)" ;; esac
  expect GET "$(FF "$O")" "" 200 "blocker $n: the figures read"
  # L41-D6: a role's source is opened evidence, so blocker one holds the second as well.
  [ "$(rj "b.fields[0].blockers.join('|')" | sed 's/|evidence of this account.*//')" = "$WHY" ] && ok "  ...and name the blocker: \"$WHY\"" || bad "  ...blockers: $(rj "b.fields[0].blockers.join('|')")"
  expect POST "$(FF "$O")" "$(J field baseline_value reason 'Verification: no source on record.')" 422 "  ...a finding is refused, in words" "$WHY"
  sqlrefused "  ...and at the database" "$(FSQL "$I" "$O" 214)" "$WHY"
  case $n in 1|3) NEWCUT="CASE WHEN false AND EXISTS (SELECT 1 FROM $( [ $n = 1 ] && echo "persons p WHERE p.institution_id = p_institution AND p.deleted_at IS NULL AND lvrf_customer_side(p.id, p_institution))" || echo "institution_facts f WHERE f.institution_id = p_institution)")" ;;
             2) NEWCUT="CASE WHEN false AND EXISTS (SELECT 1 FROM evidence e WHERE e.institution_id = p_institution AND e.deleted_at IS NULL" ;; esac
  fnbreak lvrf_figure_finding_blockers "$CUT" "$NEWCUT"
  if [ "$n" = 1 ]; then  # the second check goes too: an opened source sits under every role.
    python3 - "$W/fnbreak.sql" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read()
a = "CASE WHEN EXISTS (SELECT 1 FROM evidence e WHERE e.institution_id = p_institution AND e.deleted_at IS NULL"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, a.replace('CASE WHEN EXISTS', 'CASE WHEN false AND EXISTS')))
PY
    psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/fnbreak.sql" > /dev/null
  fi
  [ "$(sqlaccepted "$(FSQL "$I" "$O" 214)")" = "ACCEPTED" ] && ok "B5.$n: the check \"$WHY\" removed → caught: a finding is accepted on an account that holds it" || bad "B5.$n: $(sqlaccepted "$(FSQL "$I" "$O" 214)")"
  reharden
done
[ "$(q "SELECT count(*) FROM figure_findings")" = "$FIND0" ] && ok "  ...nothing written by the breaks (rolled back)" || bad "  ...a finding written"

step "6. Account Z: a finding, then the record gains a fact (condition 3: the sentence stays true whenever written)"
acct "C3b account Z (fixture)" "[$(J full_name "C3b analyst Z (fixture)" email "analystz.$TS@c3b.example" title 'External analyst of record — not an employee')]"
INSTZ="$INST"; PZ="$P0"
outcome Z "$PZ" 214; OZ="$O"; ENGZ="$ENG"
seal "$ENGZ" "Verification: Z run 1."; RZ1="$RUN"
expect POST "$(FF "$OZ")" "$(J field baseline_value reason 'Verification: Z has no source on record.')" 201 "the steward records Z's finding"
FZ="$(rj b.figure_finding_id)"
[ "$(q "SELECT act || '|' || subject_table || '|' || result_table || '|' || (result_id = '$OZ') || '|' || (actor_person_id = '$S') FROM governance_acts WHERE subject_id = '$FZ'")" = "find|figure_findings|value_outcomes|true|true" ] && ok "  ...with its act: find, naming the outcome, by the steward" || bad "  ...act"
expect POST "$(FF "$OZ")" "$(J field baseline_value reason 'Verification: a second finding.')" 409 "  ...a second finding on the same figure"
sqlrefused "an UPDATE of a finding" "UPDATE figure_findings SET reason = reason WHERE id = '$FZ'" "is final"
sqlrefused "a DELETE of a finding" "DELETE FROM figure_findings WHERE id = '$FZ'" "never deleted"
expect GET /api/errata/non-customer-credit "" 200 "the dry run lists Z's run"
[ "$(rj "b.unsourced.filter(x=>x.run_id==='$RZ1').length")" = "1" ] && ok "  ...one unsourced-figure erratum for Z run 1" || bad "  ...Z: $(rj "JSON.stringify(b.unsourced.map(x=>x.run_number))")"
expect POST "/api/institutions/$INSTZ/facts" '{"kind":"system","value_text":"Workday (HRIS)","as_of":"2026-10-01","evidence_kind":"public_filing","provenance":"Verification run, not a real source","confidence":"low","evidence_form":"quote","quote_text":"Verification fixture quote, not a source.","how_read":"Verification fixture: read from the fixture quote as written.","source_verified":false,"ai_sourced":false}' 201 "Z gains a fact"
expect GET /api/errata/non-customer-credit "" 200 "the dry run again"
[ "$(rj "b.unsourced.filter(x=>x.run_id==='$RZ1').length")" = "0" ] && [ "$(rj "b.blocked_findings.filter(x=>x.account.startsWith('C3b account Z')).map(x=>x.why.join('|')).join()")" = "a research result or fact about this account was accepted" ] \
  && ok "  ...Z's run is no longer listed; its finding is shown as calling for none, and why" || bad "  ...Z after the fact: $(rj "JSON.stringify(b.blocked_findings)")"
USQL() { printf "INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, kind, figure_finding_id, what_was_wrong, what_is_right, reason, sealed_score, sealed_band, recompute_method, recorded_by_person_id) SELECT '%s', '%s', '%s', 'unsourced_figure', '%s', 'The seal carries a figure with no source on record.', 'A figure is sourced, or the record says it has none.', '%s', r.confidence_score, r.confidence_band, '%s', '%s' FROM value_runs r WHERE r.id = '%s'" "$TEN" "$1" "$2" "$3" "${4:-Verification: an erratum by SQL.}" "${5:-From this run seal: its baseline has no source on record. Verification text.}" "$S" "$1"; }
sqlrefused "an unsourced-figure erratum on Z now, at the database" "$(USQL "$RZ1" "$OZ" "$FZ" | sed "s/From this run seal/From this run''s seal/")" "the record now holds something from this account"

step "7. V's finding, from the run page (the browser), then the dry run: both kinds, both counts"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "the steward signed in by session" || { bad "no session"; exit 1; }
cw() {  # MODE [LOGNAME] (env per mode)
  local log="$W/walk.${2:-$1}.log"
  # A break's screens never land on the clean ones: they show the page broken.
  node scripts/lib/c3b_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "${BREAK_SHOTS:-$SHOTS}" "$TOKEN" > "$log" 2>&1; local rc=$?
  if [ -z "${2:-}" ]; then
    PASS=$((PASS + $(grep -c '^  PASS' "$log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$log" || true)))
    grep -E '^  (PASS|FAIL)' "$log" || true
    [ "$rc" = "0" ] || bad "the $1 walk exited $rc (see $log)"
  fi
}
# A link withdrawn BEFORE the finding: it did not support the figure when the finding was recorded, and keeps its own basis.
expect POST "/api/value-outcomes/$OV/evidence" "$(J kind public_filing provenance 'Fixture filing (not a source)' summary 'C3b filing, withdrawn before the finding (fixture)' supports baseline source_verified false ai_sourced false simulated false evidence_form quote quote_text 'Named in the filing.' how_read 'Read as published, from the fixture.')" 201 "a filing linked to V's baseline"
EVEARLY="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$OV/evidence/$EVEARLY/withdraw" "$(J reason 'Verification: withdrawn before the finding.')" 200 "  ...withdrawn before the finding"
BAS() { q "SELECT lvrf_evidence_basis(e) || '|' || coalesce(lvrf_evidence_basis_reason(e), '-') FROM evidence e WHERE e.id = '$1'"; }
[ "$(BAS "$EVV")" = "system_of_record|-" ] && ok "before the finding: the export reads system_of_record, from its kind" || bad "basis before: $(BAS "$EVV")"
RUN="$RV3" WOULD_SAY="$WANT" cw finding
FV="$(q "SELECT id FROM figure_findings WHERE value_outcome_id = '$OV'")"
[ "$(q "SELECT finding_text FROM figure_findings WHERE id = '$FV'")" = "$WANT" ] && [ "$(q "SELECT (value = 214)::text || '|' || (SELECT string_agg(act::text, ',') FROM governance_acts WHERE subject_id = '$FV') FROM figure_findings WHERE id = '$FV'")" = "true|find" ] \
  && ok "  ...in the database: the finding as the form said, the figure 214, its act" || bad "  ...finding row: $(q "SELECT finding_text || ' | ' || value FROM figure_findings WHERE id = '$FV'")"
# Ruling 1 (31 Oct): where a finding covers a figure, its evidence reads 'assumed', with the reason; sealed runs keep theirs.
[ "$(BAS "$EVV")" = "assumed|no source on record" ] && ok "after the finding: the export reads assumed, \"no source on record\" (ruling 1)" || bad "basis after: $(BAS "$EVV")"
[ "$(BAS "$EVEARLY")" = "published|-" ] && ok "  ...a link withdrawn before the finding keeps its own basis" || bad "  ...early: $(BAS "$EVEARLY")"
[ "$(q "SELECT string_agg(DISTINCT x->>'basis', ',') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id IN ('$RV1', '$RV2', '$RV3') AND x->>'kind' = 'system_export'")" = "system_of_record" ] && ok "  ...the sealed runs keep their sealed basis" || bad "  ...sealed basis changed"
# B11 — a finding present, the basis rule removed.
fnbreak lvrf_evidence_basis "    WHEN lvrf_evidence_under_finding(e.id) THEN 'assumed'
" ""
[ "$(q "SELECT lvrf_evidence_basis(e) FROM evidence e WHERE e.id = '$EVV'")" = "system_of_record" ] && ok "B11: a finding present and the rule removed → caught: the basis would still read system_of_record" || bad "B11: $(BAS "$EVV")"
reharden
expect GET /api/errata/non-customer-credit "" 200 "the dry run"
CREDIT="$(rj b.count)"; UNSOURCED="$(rj b.unsourced_count)"
TXT() { rj "b.errata.find(x=>x.run_id==='$1')?.text ?? ''"; }
PTS() { rj "b.errata.find(x=>x.run_id==='$1')?.points ?? 'none'"; }
Q_DEF='"Is the metric'"'"'s calculation method known and documented?"'
[ "$(PTS "$RV1")" = "30" ] && printf '%s' "$(TXT "$RV1")" | grep -qF "From this run's seal: 20 of 20 in $Q_DEF rest on a confirmation by $ANALYST_NAME; 10 of 10" \
  && ok "the 1.0.0 run: 30 points (definition 20, committer 10), read from its seal and the metric version it sealed" || bad "RV1: $(PTS "$RV1") $(TXT "$RV1")"
[ "$(PTS "$RV2")" = "20" ] && printf '%s' "$(TXT "$RV2")" | grep -qF "From this run's seal: 20 of 20 in $Q_DEF rest on a confirmation by $ANALYST_NAME. Under the C3 rule (model 1.0.2) none of these earns credit" \
  && ok "the 1.0.1 run: 20 points, the definition alone" || bad "RV2: $(PTS "$RV2") $(TXT "$RV2")"
[ "$(PTS "$RV3")" = "none" ] && ok "the 1.0.2 run: not listed (1.0.2 credited none of it)" || bad "RV3 listed: $(PTS "$RV3")"
[ "$(PTS "$RW1")" = "none" ] && ok "W run 1: not listed — the version it sealed was confirmed by the customer-side owner, not the analyst who confirmed the next (C3b-D1)" || bad "RW1 listed: $(PTS "$RW1") $(TXT "$RW1")"
UTXT="$(rj "b.unsourced.find(x=>x.run_id==='$RV1')?.text ?? ''")"
UWANT="From this run's seal: its baseline, 214 days, with its stated source \"$SRCSYS\". $WANT The sealed record below is unchanged."
[ "$UTXT" = "$UWANT" ] && ok "the unsourced-figure erratum's text: \"$UTXT\"" || bad "unsourced text: $UTXT (want $UWANT)"
[ "$(rj "b.unsourced.filter(x=>['$RV1','$RV2','$RV3'].includes(x.run_id)).length")" = "3" ] && ok "  ...one for each of V's three runs, each sealing 214" || bad "  ...V's: $(rj "JSON.stringify(b.unsourced.map(x=>x.run_number))")"
[ "$(rj "b.unsourced.some(x=>x.run_id==='$RW1')")" = "false" ] && ok "  ...none for W (no finding)" || bad "  ...W listed"
rj "b.errata.filter(x=>x.account==='Curia').map(x=>'  NOTE  (the copy'+String.fromCharCode(39)+'s own, not judged) Curia run '+x.run_number+': '+x.points+' points').join('\n')" | head -25
# B4 — the confirmer read from the metric's latest version, as it stands (no version at sealing, no audit at sealing).
edit "$NCC" "        WHERE m.created_at <= \$2
          AND NOT EXISTS (SELECT 1 FROM business_metrics s WHERE s.id = m.superseded_by_id AND s.created_at <= \$2)
          AND m.name" "        WHERE \$2::timestamptz IS NOT NULL AND m.superseded_by_id IS NULL
          AND m.name"
edit "$NCC" "       FROM audit_log a WHERE a.table_name = 'business_metrics' AND a.record_id = \$1::text AND a.at <= \$2" "       FROM audit_log a WHERE a.table_name = 'business_metrics' AND a.record_id = \$1::text AND \$2::timestamptz IS NOT NULL"
edit "$NCC" "  if (!a || !a.by || !a.at || new Date(a.at) > sealedAt) return null;" "  if (!a || !a.by || !a.at) return null;"
stop_server; start_server
expect GET /api/errata/non-customer-credit "" 200 "B4: the dry run with the confirmer read as the metric stands"
[ "$(PTS "$RW1")" = "20" ] && ok "B4: caught — W run 1 is wrongly listed (20 points, on the analyst's later confirmation)" || bad "B4: not caught: $(PTS "$RW1")"
restore "$NCC"; stop_server; start_server

step "8. The batch: refusals, then in the browser with both counts (condition 5); the database after"
B() { J expected_count "$1" expected_unsourced_count "$2" reason "${3:-Verification: C3b batch.}"; }
expect POST /api/errata/non-customer-credit "$(J expected_count "$CREDIT" reason 'Verification: one count only.')" 422 "the batch with one count" "Give both counts"
expect POST /api/errata/non-customer-credit "$(B "$CREDIT" "$((UNSOURCED + 1))")" 409 "the batch with the unsourced count off" "The count changed: the record now calls for $CREDIT credit errata and $UNSOURCED unsourced-figure errata, not $CREDIT and $((UNSOURCED + 1))"
expect POST /api/errata/non-customer-credit "$(B "$CREDIT" "$UNSOURCED")" 403 "X records the batch" "steward" "$X"
sqlrefused "B6: \"invented\" in an unsourced-figure erratum, at the database" "$(USQL "$RV1" "$OV" "$FV" 'Verification: the baseline was invented.' | sed "s/From this run seal/From this run''s seal/")" "run_errata_never_invented"
sqlrefused "an unsourced-figure erratum on a run that does not seal the figure (W run 1, with V's finding)" "$(USQL "$RW1" "$OV" "$FV" | sed "s/From this run seal/From this run''s seal/")" "the erratum's outcome is not the one run"
[ "$(q "SELECT count(*) FROM run_errata WHERE kind IN ('non_customer_credit', 'unsourced_figure')")" = "$((CRED0 + UNS0))" ] && ok "  ...none of them wrote" || bad "  ...a refused batch wrote"
CREDIT="$CREDIT" UNSOURCED="$UNSOURCED" UNSOURCED_TEXT="$UWANT" cw batch
[ "$(q "SELECT count(*) FILTER (WHERE kind = 'non_customer_credit') || '|' || count(*) FILTER (WHERE kind = 'unsourced_figure') FROM run_errata")" = "$((CRED0 + CREDIT))|$((UNS0 + UNSOURCED))" ] && ok "  ...in the database: $CREDIT credit errata and $UNSOURCED unsourced-figure errata" || bad "  ...recorded: $(q "SELECT kind, count(*) FROM run_errata GROUP BY 1")"
[ "$(q "SELECT count(*) FROM governance_acts a JOIN run_errata x ON x.id = a.subject_id WHERE x.kind IN ('non_customer_credit', 'unsourced_figure') AND a.act = 'record_erratum'")" = "$((CRED0 + UNS0 + CREDIT + UNSOURCED))" ] && ok "  ...one act each" || bad "  ...acts"
[ "$(q "SELECT (recompute_method = \$\$$UWANT\$\$) || '|' || (recomputed_score IS NULL) || '|' || (points_not_credited IS NULL) || '|' || (figure_finding_id = '$FV') FROM run_errata WHERE value_run_id = '$RV1' AND kind = 'unsourced_figure'")" = "true|true|true|true" ] \
  && ok "  ...V run 1's unsourced-figure erratum: the text from its seal, nothing recomputed, no points, naming the finding" || bad "  ...RV1 erratum"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE r.id IN ('$RV1', '$RV2', '$RV3')")" = "$SEALS0" ] && ok "  ...V's sealed runs byte-identical" || bad "  ...a sealed run changed"
L1="$(q "SELECT lvrf_run_erratum_line('$RV1')")"
[ "$L1" = "erratum: 30 of these points rest on a person who is not customer-side; erratum: its baseline, 214, has no source on record" ] && ok "the headline line, both errata: \"$L1\"" || bad "line: $L1"
LINE="erratum: its baseline, 214, has no source on record"
# B7 — the batch without its unsourced-figure count check: a count that was off is accepted.
expect POST /api/errata/non-customer-credit "$(B 0 2)" 409 "  ...a second batch, the unsourced count off" "not 0 and 2"
edit "$C3R" "      if (list.length !== b.expected_count || unsourced.length !== b.expected_unsourced_count) {" "      if (list.length !== b.expected_count) {"
stop_server; start_server
expect POST /api/errata/non-customer-credit "$(B 0 2 'Verification: B7, a count that was off.')" 201 "B7: without the unsourced count check, a count that was off → accepted (caught: the batch must refuse it)"
restore "$C3R"; stop_server; start_server

step "9. The surfaces: the finding, the unopened reading, the unsourced line (screen, 390, print, lineage)"
INST="$INSTV" OUTCOME="$OV" RUN="$RV1" RUN_NUMBER="$(q "SELECT run_number FROM value_runs WHERE id = '$RV1'")" PDF=c3b_run.pdf LINE="$LINE" WOULD_SAY="$WANT" UNSOURCED_TEXT="$UWANT" cw surfaces
N="$(pdfinfo "$SHOTS/c3b_run.pdf" 2>/dev/null | awk '/^Pages:/{print $2}')"; MISS=""
for p in $(seq 1 "$N"); do flat="$(pdftotext -f "$p" -l "$p" "$SHOTS/c3b_run.pdf" - 2>/dev/null | tr -d '[:space:]')"
  printf '%s' "$flat" | grep -qF "VALIDATEDBASELINE—asrecordedatsealing·erratum:itsbaseline,214,hasnosourceonrecord" || MISS="$MISS p$p"
  printf '%s' "$flat" | grep -qF "UNVERIFIED—thisrun'soutcomehasnoverifiedactual" || MISS="$MISS p$p:disclosure"; done
[ -z "$MISS" ] && ok "the run printed ($N pages): every page's sealed banner reads \"VALIDATED BASELINE — as recorded at sealing · $LINE\", beside the disclosure" || bad "print: missing$MISS"
# B8 — the run page's sealed banner without its unsourced line.
edit "$BENCH" "          {unsourced && <span className=\"text-gold\" data-testid=\"banner-sealed-unsourced\"> · {unsourced}</span>}" ""
sleep 3
BREAK_SHOTS="$W" INST="$INSTV" OUTCOME="$OV" RUN="$RV1" RUN_NUMBER=1 PDF=c3b_run_b8.pdf LINE="$LINE" WOULD_SAY="$WANT" UNSOURCED_TEXT="$UWANT" cw surfaces b8
grep -q "^  FAIL  @1280: the sealed banner" "$W/walk.b8.log" && ok "B8: the sealed banner without its unsourced line → caught" || bad "B8: not caught: $(grep -m2 'sealed banner' "$W/walk.b8.log")"
restore "$BENCH"
# B9 — the erratum line without the unsourced kind: the headline loses it.
fnbreak lvrf_erratum_line "           WHEN x.kind = 'unsourced_figure' THEN" "           WHEN false THEN"
BREAK_SHOTS="$W" INST="$INSTV" OUTCOME="$OV" RUN="$RV1" RUN_NUMBER=1 PDF=c3b_run_b9.pdf LINE="$LINE" WOULD_SAY="$WANT" UNSOURCED_TEXT="$UWANT" cw surfaces b9
grep -q "^  FAIL    ...its headline carries" "$W/walk.b9.log" && ok "B9: the erratum line without the unsourced kind → caught: the POV's headline loses it" || bad "B9: not caught: $(grep -m2 'headline' "$W/walk.b9.log")"
reharden
# B10 — the POV's baseline without its finding line.
edit "$POVP" "              {(o.figure_findings ?? []).filter((f) => f.field === 'baseline_value').map((f) => <NoSourceLine key={f.field} finding={f} className=\"mt-0.5\" />)}</td></tr>" "</td></tr>"
sleep 3
BREAK_SHOTS="$W" INST="$INSTV" OUTCOME="$OV" RUN="$RV1" RUN_NUMBER=1 PDF=c3b_run_b10.pdf LINE="$LINE" WOULD_SAY="$WANT" UNSOURCED_TEXT="$UWANT" cw surfaces b10
grep -q "^  FAIL  the POV's baseline" "$W/walk.b10.log" && ok "B10: the POV's baseline without its finding line → caught" || bad "B10: not caught: $(grep -m2 "POV's baseline" "$W/walk.b10.log")"
restore "$POVP"
# Condition 2 on the API: every evidence row verified with no citation opened, as the row stands.
expect GET "/api/institutions/$INSTV/pov" "" 200 "V's POV"
[ -z "$(rj "b.outcomes.flatMap(o=>o.evidence).filter(e=>e.verified_unopened).map(e=>e.summary).join('|')")" ] && ok "  ...verified_unopened on none of V's rows (L41: read from the copy's own rows in verify_evidence_final)" || bad "  ...verified_unopened: $(rj "JSON.stringify(b.outcomes.flatMap(o=>o.evidence).map(e=>[e.summary,e.verified_unopened]))")"

# Ruling 1: the finding's own withdrawal keeps its evidence covered.
expect POST "/api/value-outcomes/$OV/evidence/$EVV/withdraw" "$(J reason 'Verification: withdrawn after the finding, as the acts run.')" 200 "the export's link withdrawn after the finding"
[ "$(BAS "$EVV")" = "assumed|no source on record" ] && ok "  ...it still reads assumed, \"no source on record\"" || bad "  ...after the withdrawal: $(BAS "$EVV")"
expect GET "/api/lineage/value_outcomes/$OV?figure=baseline" "" 200 "the baseline's lineage"
[ "$(rj "(Array.isArray(b)?b:b.steps).filter(s=>s.kind==='evidence'&&s.detail.summary.startsWith('C3b export')).map(s=>s.detail.basis+'|'+s.detail.basis_reason).join()")" = "assumed|no source on record" ] && ok "  ...and in the lineage" || bad "  ...lineage: $(rj "JSON.stringify((Array.isArray(b)?b:b.steps).filter(s=>s.kind==='evidence').map(s=>s.detail))" | head -c 300)"
# Ruling 2: a credit erratum may state no points; its line says why.
Z1="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\nINSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, kind, what_was_wrong, what_is_right, reason, sealed_score, sealed_band, points_not_credited, recompute_method, recorded_by_person_id) SELECT '%s', r.id, '%s', 'non_customer_credit', 'The seal credited points to a confirmer not recoverable from it.', 'Only a customer-side person earns the credit.', 'Verification: a zero-point erratum.', r.confidence_score, r.confidence_band, 0, 'From this run''s seal: the confirmer is not recoverable.', '%s' FROM value_runs r WHERE r.id = '%s';\nSELECT 'LINE:' || lvrf_run_erratum_line('%s');\nROLLBACK;\n" "$S" "$TEN" "$OZ" "$S" "$RZ1" "$RZ1" | psql -X -q -At -d "$VERIFY_DB" 2>&1 | grep -E 'LINE:|ERROR' | head -1)"
[ "$Z1" = "LINE:erratum: its definition rests on a confirmer not recoverable from the seal" ] && ok "  ...its line: \"${Z1#LINE:}\" (rolled back)" || bad "  ...zero-point line: $Z1"

step "10. M1 for 1.0.1 (B3), and the seals"
cat > "$W/recompute.ts" <<TS
import { recomputeWithCorrection } from '$(pwd)/server/lib/recomputeRun.ts';
const p = JSON.parse(process.argv[2]); const m = JSON.parse(process.argv[3]);
const r = recomputeWithCorrection(p, m, process.argv[4] as never);
console.log(r.ok ? 'ok:' + r.modelVersion + ':' + r.score : 'refused:' + r.reason);
TS
P2="$(q "SELECT payload FROM value_runs WHERE id = '$RV2'")"; M2="$(q "SELECT json_build_object('kind', x->>'kind', 'summary', x->>'summary', 'provenance', x->>'provenance', 'supports', x->>'supports') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$RV2' AND x->>'kind' = 'system_export'")"
RC="$(npx tsx "$W/recompute.ts" "$P2" "$M2" impact_basis 2>&1 | tail -1)"
printf '%s' "$RC" | grep -q "^ok:1.0.1:" && ok "the 1.0.1 run recomputes under 1.0.1, kept: $RC" || bad "1.0.1 recompute: $RC"
P3="$(q "SELECT payload FROM value_runs WHERE id = '$RV3'")"; M3="$(q "SELECT json_build_object('kind', x->>'kind', 'summary', x->>'summary', 'provenance', x->>'provenance', 'supports', x->>'supports') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$RV3' AND x->>'kind' = 'system_export'")"
RC3="$(npx tsx "$W/recompute.ts" "$P3" "$M3" impact_basis 2>&1 | tail -1)"
printf '%s' "$RC3" | grep -q "^ok:1.0.2:" && ok "the 1.0.2 run recomputes under 1.0.2, its seal carrying the definition's confirmer: $RC3" || bad "1.0.2 recompute: $RC3"
# B3 — the 1.0.1 scorer dropped from the registry.
edit "$SCORERS" "  [v101.MODEL_VERSION]: { version: v101.MODEL_VERSION, fingerprint: v101.MODEL_FINGERPRINT, computeConfidence: v101.computeConfidence as (i: ConfidenceInput) => ConfidenceResult },
" ""
RCB="$(npx tsx "$W/recompute.ts" "$P2" "$M2" impact_basis 2>&1 | tail -1)"
printf '%s' "$RCB" | grep -q "^refused:This run was sealed under model 1.0.1" && ok "B3: the 1.0.1 scorer dropped → caught: the 1.0.1 run's recompute is refused" || bad "B3: $RCB"
restore "$SCORERS"
HASH1="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
RUNS1="$(q "SELECT count(*) FROM value_runs")"
printf '%s' "$HASH1" | grep -qE "^$RUNS1 runs: recompute matches $RUNS1, differs 0; embedded payloadHash matches $RUNS1, differs 0" && ok "check_run_hashes: $HASH1" || bad "hashes: $HASH1"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots and PDFs: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
