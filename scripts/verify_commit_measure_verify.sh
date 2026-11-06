#!/usr/bin/env bash
#
# B4 (LVRF_PLAN §14, approved by Brad 5 Nov 2026) — commit, measure and verify; the steward's withdrawals; the class rule;
# the attribution sentence; the stage-10 rehearsal's fixes (figure check, target, falsifier, committer ask); the OUTSIDE-IN
# banner ruling and its not-shown line; D4. Local verification, on a clone of `lvrf_prodcopy`, dropped on exit.
#
#   ./scripts/verify_commit_measure_verify.sh [screenshot_dir]
#
# The B4 act session's acts 1-4 are performed on the clone through the page, each confirmation compared word for word
# with §14; acts 5-7 then produce, lock and read Skillsoft's first v5 run under the CFO lens. DELIBERATE BREAKS, each
# caught, every file restored byte-identical and every function by re-applying hardening.sql:
#   M1  a commit without the method       M2  the method changed after commit      M3  a measurement on inferred evidence
#   M4  the class rule removed            M5  a withdrawal's kept values not checked
#   M6  the not-shown line removed        M7  an unsourced claimed impact printed as a figure
#   M8  the AMENDMENT-005 exemption widened past a withdrawal

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifyspine
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3111; VITE_PORT=5211; CDP_PORT=9371
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_spine.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
PAGE=client/src/pages/ValueCasePage.tsx
EDITED=("$PAGE")
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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "209" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 209 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone; migrate 0049; harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "209" ] && ok "209 triggers: section 34 adds 5" || bad "triggers: $(trig)"
[ "$(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")" = "328" ] && ok "  ...328 information_schema rows (320 + 8)" || bad "  ...rows"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "  ...every run byte-identical" || bad "  ...a run changed"
[ "$(q "SELECT count(*) FROM value_outcomes WHERE attribution_method IS NOT NULL OR measure_class IS NOT NULL")" = "0" ] && ok "  ...D1: every commitment made before B4 keeps no method or class" || bad "  ...a method was filled in"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 50 migrations, newest 0049_b4_attribution" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^130 CHECKs in the database: 130 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN" || bad "plain: $PLAIN"
[ "$(q "SELECT has_table_privilege('lvrf_app', 'public.outcome_withdrawals', 'INSERT') || '|' || has_table_privilege('lvrf_app', 'public.outcome_withdrawals', 'UPDATE')")" = "true|false" ] && ok "outcome_withdrawals: INSERT, never UPDATE, for the app" || bad "privileges"

step "3. The session and the server"
S="$(q "SELECT steward_person_id FROM tenants t WHERE EXISTS (SELECT 1 FROM institutions i WHERE i.tenant_id = t.id AND i.is_tenant_self) LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
TS="$(date +%s)"; PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', 'x.$TS@spine.example') RETURNING id" | head -1)"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
SELF="$(q "SELECT id FROM institutions WHERE is_tenant_self AND tenant_id = '$TEN'")"
OUT="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE 'f23ee6a8%'")"; SIM1="$(q "SELECT id FROM evidence WHERE id::text LIKE '2c10e091%'")"; SIM2="$(q "SELECT id FROM evidence WHERE id::text LIKE 'eea43d9a%'")"
ENG="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$OUT'")"
RUN1="$(q "SELECT id FROM value_runs WHERE engagement_id = '$ENG' AND run_number = 1")"
[ -n "$OUT" ] && [ -n "$SIM1" ] && [ -n "$SIM2" ] && ok "Skillsoft's outcome f23ee6a8 and its two simulated actual links, as on prod" || { bad "fixtures from the copy"; exit 1; }
start_server && ok "API up on $PORT"
# As on prod (Brad's B3 act session, 5 Nov 2026): D = 6, N = 2, and the CFO lens, set by the steward on the clone.
expect POST /api/policies/values "$(J key cost_of_delay_months value 6 reason 'Verification: D, as on prod.')" 201 "D = 6, as on prod"
expect POST /api/policies/values "$(J key pack_ratification_institutions value 2 reason 'Verification: N, as on prod.')" 201 "N = 2, as on prod"
expect POST /api/policies/lenses "$(J persona cfo min_confidence_score 55 admitted_bases '["system_of_record","published"]' suppresses '["consumption"]' refusal_text 'The CFO lens shows a value case only when its computed confidence is at least 55 and every actual it reports rests on a system of record or a published source. This case does not meet that yet. Below is each reason, and what would meet it.' reason 'Verification: the CFO lens, as on prod.')" 201 "the CFO lens, as on prod"
# As on prod (Brad's acts, 5 Nov 2026): the outcome's impact-basis link is withdrawn, so the claim has no source.
for E in $(q "SELECT evidence_id FROM value_outcome_evidence WHERE value_outcome_id = '$OUT' AND supports = 'impact_basis' AND withdrawn_at IS NULL"); do
  expect POST "/api/value-outcomes/$OUT/evidence/$E/withdraw" "$(J reason 'Verification: as on prod, the impact-basis link withdrawn.')" 200 "  ...the impact-basis link of ${E:0:8} withdrawn, as on prod"
done
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

step "4. The act session, acts 1-4, through the page (on the clone)"
export SELF_INST="$SELF" OUT SIM1 SIM2
export R1="The actual of 100.4% rests only on simulated rows 2c10e091 and eea43d9a; Skillsoft has not reported Q2 FY2027, so the figure does not exist. Withdrawn so no case prints it."
export R2="The target of 100% was committed by [SIM] Customer Sponsor, a simulated person; no named person at Skillsoft has committed to a target."
export R3="A simulated assessment, not Skillsoft's dollar retention; the measurement it supported is withdrawn."
export R4="A simulated export of a figure Skillsoft has not reported; the measurement it supported is withdrawn."
export C1="Withdraw the measurement of f23ee6a8, Dollar Retention Rate (trailing twelve months): actual 100.4 %, measured 2026-07-31, realized 8,400,000 USD. The outcome reads committed again; the withdrawn values stay on the record."
export C2="Withdraw the commitment of f23ee6a8, Dollar Retention Rate (trailing twelve months): target 100 %, committed by [SIM] Customer Sponsor. The outcome reads claimed; the withdrawn values stay on the record."
cw spineacts
[ "$(q "SELECT kind || ':' || (withdrawn_values->>'actual_value') || ':' || (withdrawn_values->>'realized_currency_impact') FROM outcome_withdrawals WHERE value_outcome_id = '$OUT' AND kind = 'measurement'")" = "measurement:100.4:8400000" ] && ok "act 1: the measurement's values kept exactly (actual 100.4, realized 8400000)" || bad "act 1 values: $(q "SELECT withdrawn_values FROM outcome_withdrawals WHERE value_outcome_id = '$OUT'")"
[ "$(q "SELECT (withdrawn_values->>'target_value') || ':' || (withdrawn_values->>'committed_by') FROM outcome_withdrawals WHERE value_outcome_id = '$OUT' AND kind = 'commitment'")" = "100:[SIM] Customer Sponsor" ] && ok "act 2: the commitment's values kept exactly" || bad "act 2 values"
[ "$(q "SELECT realization || '|' || coalesce(actual_value::text, '-') || '|' || coalesce(realized_currency_impact::text, '-') || '|' || coalesce(target_value::text, '-') || '|' || coalesce(committed_by_person_id::text, '-') FROM value_outcomes WHERE id = '$OUT'")" = "claimed|-|-|-|-" ] && ok "  ...the outcome reads claimed, with no actual, realized impact or target" || bad "  ...outcome: $(q "SELECT realization, actual_value, target_value FROM value_outcomes WHERE id = '$OUT'")"
AW="$(q "SELECT count(*) FROM governance_acts WHERE act = 'withdraw' AND subject_table = 'value_outcomes' AND subject_id = '$OUT' AND result_table = 'outcome_withdrawals'")"
AL="$(q "SELECT count(*) FROM value_outcome_evidence WHERE value_outcome_id = '$OUT' AND supports = 'actual' AND withdrawn_at IS NULL")"
[ "$AW" = "2" ] && ok "acts 1-2: two withdrawal acts on the outcome, each naming its kept record" || bad "acts 1-2: $AW"
[ "$AL" = "0" ] && ok "acts 3-4: no actual link left on the outcome" || bad "acts 3-4: $AL current actual links: $(q "SELECT left(evidence_id::text,8) || ':' || supports FROM value_outcome_evidence WHERE value_outcome_id = '$OUT' AND withdrawn_at IS NULL")"
sqlrefused "  ...and linking a simulated row as an actual is still refused (the guard lets only a withdrawal through)" "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OUT', '$SIM2', 'actual')" "simulated evidence may not support a measured actual"
# M8: the AMENDMENT-005 exemption widened past a withdrawal (to any write): a new simulated actual link then lands. The row
# linked is a fresh copy of a simulated row (rolled back), since the withdrawn link already holds (outcome, SIM2, actual).
NEWSIM="SELECT set_config('lvrf.actor_person_id', '$S', true);
INSERT INTO evidence SELECT (jsonb_populate_record(NULL::evidence, to_jsonb(e) || jsonb_build_object('id', 'b4b4b4b4-0000-4000-8000-000000000008', 'summary', 'M8: a simulated row never linked (verification)', 'evidence_form', 'quote', 'quote_text', 'Verification fixture quote, not a source.', 'how_read', 'Verification fixture: read from the fixture quote as written.'))).* FROM evidence e WHERE e.id = '$SIM2';
INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OUT', 'b4b4b4b4-0000-4000-8000-000000000008', 'actual')"
sqlrefused "  ...a simulated row never linked, linked as the actual: refused" "$NEWSIM" "simulated evidence may not support a measured actual"
fnbreak lvrf_block_ai_actual "  IF TG_OP = 'UPDATE' AND OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL
     AND" "  IF true OR"
M8R="$(sqlaccepted "$NEWSIM")"
[ "$M8R" = "ACCEPTED" ] && ok "M8: the AMENDMENT-005 exemption widened to any write → caught: a simulated row linked as an actual lands" || bad "M8: $M8R"
reharden
sqlrefused "  ...with it back: the same link refused" "$NEWSIM" "simulated evidence may not support a measured actual"

step "5. Acts 5-7: Skillsoft's first v5 run, locked, read under the CFO lens"
expect POST "/api/engagements/$ENG/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "Skillsoft's own case as it stands: the published DRR baseline of 98%, no committed target, no measured actual." source_fixture 'Skillsoft 8-K Ex. 99.1, Q1 FY2027 release (9 Jun 2026)')" 201 "act 5: produced"; RS="$(rj b.value_run_id)"
expect POST "/api/value-runs/$RS/lock" "$(J lock_reason "Skillsoft's own case as it stands, locked as the record its value case and its print are read from.")" 200 "act 6: locked"
[ "$(q "SELECT payload->>'payloadVersion' || '|' || coalesce(payload->>'actualValue','-') || '|' || coalesce(payload->>'realizedCurrencyImpact','-') || '|' || (payload->'case'->'cost_of_delay'->>'status') FROM value_runs WHERE id = '$RS'")" = "5|-|-|refused" ] && ok "  ...v5, sealing no actual, no realized impact, and cost of delay refused" || bad "  ...sealed: $(q "SELECT payload->>'actualValue', payload->>'realizedCurrencyImpact' FROM value_runs WHERE id = '$RS'")"
HASHS="$(q "SELECT payload_hash FROM value_runs WHERE id = '$RS'")"
CFOR="$(q "SELECT CASE WHEN confidence_score < 55 THEN 'below_threshold,' ELSE '' END FROM value_runs WHERE id = '$RS'")no_actual"
RUN="$RS" LENS=cfo TAG=skillsoft EXPECT_ASKS="baseline_not_system_of_record+q,no_commitment+q,no_rate+q,no_measure_class+q,no_actual+q,no_verifier+q" \
  EXPECT_CFO_REFUSED=1 EXPECT_CFO_REASONS="$CFOR" FORBID2="100.4" HASH="$HASHS" EXPECT_OUTSIDE_IN=1 cw valuecase
RUN="$RS" LENS=general TAG=skillsoft EXPECT_ASKS="baseline_not_system_of_record+q,no_commitment+q,no_rate+q,no_measure_class+q,no_actual+q,no_verifier+q" \
  EXPECT_CLAIM_REFUSED=1 FORBID2="7,000,000" HASH="$HASHS" EXPECT_OUTSIDE_IN=1 cw valuecase
# Run 1 (the Customer Zero demonstration, payload v1, locked 29 Aug) seals the realized 8,400,000: its case never prints it.
RUN="$RUN1" LENS=general TAG=skillsoft_run1 EXPECT_ASKS=skip FORBID2="8,400,000" HASH="$(q "SELECT payload_hash FROM value_runs WHERE id = '$RUN1'")" cw valuecase

step "6. The rules, on a fixture account"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"B4 account $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for B4.\"},\"persons\":[{\"full_name\":\"Customer owner (verification)\",\"email\":\"owner.$TS@spine.example\",\"title\":\"Director of Safety\"},{\"full_name\":\"Customer finance (verification)\",\"email\":\"fin.$TS@spine.example\",\"title\":\"Controller\"}]}" 201 "an account"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; FIN="$(rj b.person_ids[1])"
E_TRIR="$(q "SELECT m.id FROM industry_measures m JOIN industries i ON i.id = m.industry_id WHERE i.slug = 'manufacturing' AND m.name = 'Total Recordable Incident Rate (TRIR)'")"
UNIT="incidents per 200,000 hours"
outcome() {  # NAME BASELINE -> OC, ENGO
  req POST "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"$1 engagement $TS\",\"engagement_owner_person_id\":\"$OWNER\",\"capability_name\":\"B4 safety capability\",\"metric\":{\"name\":\"$1\",\"unit\":\"$UNIT\",\"direction\":\"decrease\",\"source_system\":\"verification system of record\",\"owner_person_id\":\"$OWNER\"},\"baseline_value\":$2,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}"
  [ "$CODE" = "201" ] || { bad "outcome $1: $CODE $(said)"; exit 1; }
  OC="$(rj b.value_outcome_id)"; ENGO="$(rj b.engagement_id)"; MO="$(rj b.business_metric_id)"
  expect POST "/api/business-metrics/$MO/pack-basis" "$(J industry_measure_id "$E_TRIR" basis_note 'Verification: the same rate.')" 201 "  ...$1 based on the TRIR entry"
}
EVB() {  # KIND SUMMARY SUPPORTS [ATTESTER]
  if [ -n "${4:-}" ]; then J kind "$1" provenance "Fixture source for: $2 (not a source)" summary "$2" supports "$3" confidence medium source_verified false ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.' attested_by_person_id "$4" attested_at 2026-10-01T00:00:00Z
  else J kind "$1" provenance "Fixture source for: $2 (not a source)" summary "$2" supports "$3" confidence medium source_verified false ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.'; fi
}
CM() { J target_value 1.0 committed_by_person_id "$OWNER" committed_at 2026-10-01T00:00:00Z commitment_note 'Verification: committed to 1.0.' attribution_method "$1" measure_class "$2"; }
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'B4 safety capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "an offering and its capability"
CAPF="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAPF/industry-measures" "$(J industry_measure_id "$E_TRIR" claim 'Verification: training improves safe behaviour.')" 201 "  ...the capability claims the TRIR entry"
outcome "B4 TRIR control" 1.4; OK="$OC"; ENGK="$ENGO"
expect POST "/api/value-outcomes/$OK/evidence" "$(EVB public_filing 'TRIR FY25 1.4 (fixture)' baseline)" 201 "  ...a published baseline (its quote does not state 1.4: a figure check flags it)"
# M1: a commit without the method.
expect POST "/api/value-outcomes/$OK/commit" "$(J target_value 1.0 committed_by_person_id "$OWNER" committed_at 2026-10-01T00:00:00Z commitment_note 'Verification: no method.' measure_class capability_performance)" 422 "M1: a commit without the method (route)" "attribution_method"
sqlrefused "M1: a commit without the method (database)" "UPDATE value_outcomes SET target_value = 1.0, committed_by_person_id = '$OWNER', committed_at = now(), measure_class = 'capability_performance' WHERE id = '$OK'" "states its attribution method and its measure class"
expect POST "/api/value-outcomes/$OK/commit" "$(CM control_group capability_performance)" 201 "a commit with the method (control group) and the class"
[ "$(q "SELECT attribution_method || '|' || measure_class FROM value_outcomes WHERE id = '$OK'")" = "control_group|capability_performance" ] && ok "  ...both recorded" || bad "  ...method/class"
sqlrefused "M2: the method changed after commit" "UPDATE value_outcomes SET attribution_method = 'contribution_only' WHERE id = '$OK'" "fixed at commit"
# M3: a measurement on inferred evidence only; then on a system export.
expect POST "/api/value-outcomes/$OK/evidence" "$(EVB observation 'TRIR as observed on a site walk (fixture)' actual)" 201 "  ...an observation linked as the actual (inferred)"
expect POST "/api/value-outcomes/$OK/measure" "$(J actual_value 1.1 actual_measured_at 2026-11-01T12:00:00Z)" 422 "M3: a measurement resting on inferred evidence only" "D2"
expect POST "/api/value-outcomes/$OK/evidence" "$(EVB system_export 'TRIR extract FY26 (fixture)' actual)" 201 "  ...a system export linked as the actual"
expect POST "/api/value-outcomes/$OK/measure" "$(J actual_value 1.1 actual_measured_at 2026-11-01T12:00:00Z)" 200 "  ...then measured"
expect POST "/api/value-outcomes/$OK/commitment/withdraw" "$(J reason 'Verification: commitment while measured.')" 409 "  ...a commitment is not withdrawn while measured" "Withdraw the measurement first"
expect POST "/api/value-outcomes/$OK/measurement/withdraw" "$(J reason 'Verification: X tries.')" 403 "  ...a withdrawal by X" "steward" "$X"
fnbreak lvrf_outcome_withdrawal_guard "  IF NEW.kind = 'measurement' AND (o.actual_value IS NULL
     OR (NEW.withdrawn_values->>'actual_value')::numeric IS DISTINCT FROM o.actual_value) THEN" "  IF false THEN"
[ "$(sqlaccepted "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$OK', 'measurement', '{\"actual_value\":\"9.9\"}', 'Verification: wrong values.', '$S')")" = "ACCEPTED" ] && ok "M5: the kept-values check removed → caught: a withdrawal recording values the outcome never held lands" || bad "M5"
reharden
sqlrefused "  ...with it back: a withdrawal recording other values" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$OK', 'measurement', '{\"actual_value\":\"9.9\"}', 'Verification: wrong values.', '$S')" "the values recorded are not the outcome's"
sqlrefused "  ...the outcome stepped back without its record" "UPDATE value_outcomes SET actual_value = NULL, actual_measured_at = NULL, realization = 'claimed' WHERE id = '$OK'" "only with its record of what is withdrawn"
# NULL inputs for the new CHECKs.
sqlrefused "NULL: a withdrawal's kind" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$OK', NULL, '{\"a\":1}', 'Verification: null kind.', '$S')" "null value"
sqlrefused "NULL: a withdrawal's values" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$OK', 'measurement', NULL, 'Verification: null values.', '$S')" "LVRF: outcome_withdrawals"
sqlrefused "NULL: a withdrawal's reason" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$OK', 'measurement', '{\"actual_value\":\"1.1\"}', NULL, '$S')" "null value"
# The guard refuses these rows before a CHECK runs; each CHECK must also read false, never NULL, on its input.
CK() { q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '$1'" | sed -E 's/^CHECK \(//; s/\)$//' | sed 's/outcome_withdrawals\.//g'; }
[ "$(q "SELECT ($(CK outcome_withdrawals_values_kept)) IS FALSE FROM (VALUES ('{}'::jsonb), ('[]'::jsonb), ('\"x\"'::jsonb)) v(withdrawn_values)" | sort -u)" = "t" ] && ok "  ...values_kept reads false on empty, array and scalar values" || bad "  ...values_kept: $(CK outcome_withdrawals_values_kept)"
[ "$(q "SELECT ($(CK outcome_withdrawals_reason_stated)) IS FALSE FROM (VALUES (''::text), ('short'::text)) v(reason)" | sort -u)" = "t" ] && ok "  ...reason_stated reads false on an empty or short reason" || bad "  ...reason_stated"
[ "$(q "SELECT ($(CK outcome_withdrawals_kind_known)) IS FALSE FROM (VALUES ('other'::text)) v(kind)")" = "t" ] && ok "  ...kind_known reads false on another kind" || bad "  ...kind_known"
produce() { expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "$2" source_fixture spine_fixture)" 201 "  ...produced: $2"; RUN="$(rj b.value_run_id)"; }
produce "$ENGK" "Verification: the control-group case."; RK="$RUN"
RUN="$RK" LENS=general TAG=control EXPECT_ASKS=skip EXPECT_ATTRIBUTION="Attribution: a control group." EXPECT_FOOTNOTE="The quoted source does not state this figure (figure check:" HASH="$(q "SELECT payload_hash FROM value_runs WHERE id = '$RK'")" cw valuecase
# The class rule, the committer ask, the falsifier, the not-shown line, and the unsourced claim.
outcome "B4 TRIR compliance" 2.1; OCC="$OC"; ENGC="$ENGO"
expect POST "/api/value-outcomes/$OCC/evidence" "$(EVB public_filing 'TRIR FY25 2.1 (fixture)' baseline)" 201 "  ...a published baseline"
expect POST "/api/value-outcomes/$OCC/commit" "$(CM contribution_only compliance_assurance)" 201 "a compliance-class commitment, by a person with no customer-side role"
expect POST "/api/institutions/$INST/evidence" "$(J about account kind artifact provenance 'Fixture source for: org chart naming the controller (not a source)' summary 'Org chart naming the controller (fixture)' evidence_form quote quote_text 'Named in the fixture org chart.' how_read 'Read from the fixture org chart, finance box.')" 201 "a role source"; SRC="$(rj b.evidence_id)"
expect POST "/api/evidence/$SRC/open-citation" '{"source_verified":true}' 200 "  ...opened"
expect POST "/api/institutions/$INST/customer-roles" "$(J person_id "$FIN" role metric_owner source_evidence_id "$SRC" reason 'Verification: named from the customer org chart.')" 201 "  ...the controller named customer-side"
expect POST "/api/value-outcomes/$OCC/evidence" "$(EVB attestation 'Controller states 250,000 USD per point of TRIR per year (fixture)' impact_basis "$FIN")" 201 "the rate's evidence, client-stated"; RE="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$OCC/monetization-rates" "$(J rate 250000 currency USD per_unit "$UNIT" rate_kind performance how_read 'Verification: the controller states the rate.' evidence_id "$RE")" 201 "a performance rate on a compliance measure"
[ "$(q "SELECT jsonb_path_query_array(lvrf_cost_of_delay('$OCC')->'reasons', '\$[*].code')::text")" = '["class_rate_mismatch"]' ] && ok "the class rule: a compliance class priced at a performance rate is refused, its only reason" || bad "class: $(q "SELECT lvrf_cost_of_delay('$OCC')->'reasons'")"
fnbreak lvrf_cost_of_delay "  ELSIF o.measure_class = 'compliance_assurance' AND rt.id IS NOT NULL AND rt.rate_kind <> 'exposure' THEN" "  ELSIF false THEN"
[ "$(q "SELECT lvrf_cost_of_delay('$OCC')->>'status'")" = "computed" ] && ok "M4: the class rule removed → caught: the compliance measure would be priced at a performance rate" || bad "M4"
reharden
expect POST "/api/institutions/$INST/hypotheses" "$(J value_outcome_id "$OCC" value_lever_id "$(q "SELECT id FROM value_levers WHERE industry_measure_id = '$E_TRIR' AND deleted_at IS NULL LIMIT 1")" statement 'Safe-work training raises observed safe behaviour at this account.' falsifier_reference baseline falsifier_due 2027-03-01 falsifier_conditions 'on the same denominator')" 201 "a hypothesis" "" "$X"
produce "$ENGC" "Verification: the compliance case."; RC="$RUN"; HASHC="$(q "SELECT payload_hash FROM value_runs WHERE id = '$RC'")"
[ "$(q "SELECT lvrf_run_banners('$RC')->>'outside_in' || '|' || jsonb_array_length(lvrf_run_banners('$RC')->'not_shown')")" = "true|1" ] && ok "the banner ruling: no printed figure rests on customer-side evidence, so OUTSIDE-IN; the unprinted rate attestation is named" || bad "banners: $(q "SELECT lvrf_run_banners('$RC')")"
RUN="$RC" LENS=general TAG=compliance EXPECT_ASKS="baseline_not_system_of_record+q,class_rate_mismatch+q,no_actual+q,committer_not_customer_side+q,no_verifier+q" EXPECT_OUTSIDE_IN=1 \
  EXPECT_NOT_SHOWN="One customer-side item is on record but not shown: Controller states 250,000 USD per point of TRIR per year (fixture), because cost of delay is refused." \
  EXPECT_FALSIFIER="at or above its baseline of 2.1" HASH="$HASHC" cw valuecase
expect POST "/api/value-runs/$RC/lock" "$(J lock_reason 'Verification: sealed.')" 200 "  ...locked"
expect POST "/api/value-runs/$RC/share-for-review" "$(J shared_with 'Pat Example, Prospect Co (fixture)' lens general)" 201 "D-M21 follows the printed banners: the case prints OUTSIDE-IN, so it may be shared for review"
# M6, M7: the not-shown line removed; an unsourced claim printed as a figure.
edit "$PAGE" 'data-testid="not-shown"' 'data-testid="not-shown-dropped"'
edit "$PAGE" "{o?.claimed_currency_impact !== null && o?.claimed_currency_impact !== undefined && (o.sources.impact_basis" "{o?.claimed_currency_impact !== null && o?.claimed_currency_impact !== undefined && (true"
sleep 6
RUN="$RC" LENS=general TAG=break EXPECT_ASKS=skip EXPECT_NOT_SHOWN="One customer-side item is on record but not shown" HASH="$HASHC" cw valuecase > "$W/m.out" 2>&1 || true
grep -q "FAIL    ...the customer-side item on record but not shown is named" "$W/m.out" && ok "M6: the not-shown line removed → caught" || bad "M6"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/m.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/m.out" || true)))
# M7 on Skillsoft's run, whose claimed 7,000,000 has no impact-basis source (B3 printed "a vendor claim of $7,000,000").
RUN="$RS" LENS=general TAG=break7 EXPECT_ASKS=skip EXPECT_CLAIM_REFUSED=1 FORBID2="7,000,000" HASH="$HASHS" cw valuecase > "$W/m7.out" 2>&1 || true
grep -q "FAIL    ...a claimed impact with no source prints its refusal" "$W/m7.out" && grep -q 'FAIL    ...the case never prints "7,000,000"' "$W/m7.out" && ok "M7: an unsourced claimed impact printed as a figure → caught (the refusal gone, \$7,000,000 printed)" || bad "M7: $(grep -c FAIL "$W/m7.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/m7.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/m7.out" || true)))
restore "$PAGE"; sleep 3

step "7. What held"
HASHES() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1; }
printf '%s' "$(HASHES)" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "check_run_hashes: $(HASHES)" || bad "hashes: $(HASHES)"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE r.source_fixture IS DISTINCT FROM 'spine_fixture' AND r.id <> '$RS'")" = "$RUNS0" ] && ok "every run on the copy byte-identical after all of this" || bad "an older run changed"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
