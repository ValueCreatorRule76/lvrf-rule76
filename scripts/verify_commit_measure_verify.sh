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
#   M8  the AMENDMENT-005 exemption widened past a withdrawal      M9  card 05's run controls hidden on the tenant's own account
#   M10 an absent committer sealed as synthetic again  M11 the errata guard admits a true finding (Skillsoft run 1)
#   M12 the withheld-claim line removed from the CFO refusal page

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
. scripts/lib/customer_side.sh
. scripts/lib/hypothesis.sh  # S1 (§20, D4): a hypothesis before every produce
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
INSTPAGE=client/src/pages/InstitutionPage.tsx
PRODUCE=server/routes/produceRun.ts
EDITED=("$PAGE" "$INSTPAGE" "$PRODUCE" server/routes/outcomeWalk.ts)
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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "233" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 233 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone; migrate 0049; harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
RUNIDS0="$(q "SELECT string_agg(quote_literal(id::text), ',' ORDER BY id) FROM value_runs")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "233" ] && ok "233 triggers (S7b section 39: +4) (§32 section 38: +2) (S4 section 37: +1) (S2 section 36: +16) (S1 section 35: +1): section 34 adds 5" || bad "triggers: $(trig)"
[ "$(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")" = "360" ] && ok "  ...360 (S7b section 39: +7) (§32 section 38: +3, before it 350) information_schema rows (S2: +20) (S1: +1) (320 + 8)" || bad "  ...rows"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "  ...every run byte-identical" || bad "  ...a run changed"
[ "$(q "SELECT count(*) FROM value_outcomes WHERE attribution_method IS NOT NULL OR measure_class IS NOT NULL")" = "0" ] && ok "  ...D1: every commitment made before B4 keeps no method or class" || bad "  ...a method was filled in"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 56 migrations, newest 0055_s7b_story_records" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^165 CHECKs in the database: 165 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN" || bad "plain: $PLAIN"
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
# As on prod (Brad's B3 act session, 5 Nov 2026): D = 6, N = 2, and the CFO lens. A copy taken after that session holds
# them: each is asserted as recorded, Brad's, with his act and his reason (Gate A, 14 Nov 2026). An earlier copy has none,
# and the steward sets them on the clone. Rehearsing the B3 acts themselves is verify_value_case's, on a fixture tenant.
PV() {  # KEY VALUE — the current value, the steward's, with its ratify act and the same reason
  q "SELECT trim_scale(v.value) || '|' || (v.set_by_person_id = '$S') || '|' || (length(btrim(v.reason)) >= 12) || '|' || (SELECT count(*) FROM governance_acts a WHERE a.act = 'ratify' AND a.subject_table = 'policy_values' AND a.subject_id = v.id AND a.actor_person_id = v.set_by_person_id AND a.reason = v.reason) FROM policy_values v WHERE v.tenant_id = '$TEN' AND v.key = '$1' AND NOT EXISTS (SELECT 1 FROM policy_values n WHERE n.supersedes_id = v.id)"
}
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
if [ -n "$(PV cost_of_delay_months)" ]; then
  [ "$(PV cost_of_delay_months)" = "6|true|true|1" ] && ok "D = 6 on the copy, as recorded: ${S_NAME}'s, with his ratify act and reason" || bad "D on the copy: $(PV cost_of_delay_months)"
else
  expect POST /api/policies/values "$(J key cost_of_delay_months value 6 reason 'Verification: D, as on prod.')" 201 "D = 6, as on prod"
fi
if [ -n "$(PV pack_ratification_institutions)" ]; then
  [ "$(PV pack_ratification_institutions)" = "2|true|true|1" ] && ok "N = 2 on the copy, as recorded: ${S_NAME}'s, with his ratify act and reason" || bad "N on the copy: $(PV pack_ratification_institutions)"
else
  expect POST /api/policies/values "$(J key pack_ratification_institutions value 2 reason 'Verification: N, as on prod.')" 201 "N = 2, as on prod"
fi
LP="$(q "SELECT trim_scale(l.min_confidence_score) || '|' || array_to_string(l.admitted_bases, '+') || '|' || array_to_string(l.suppresses, '+') || '|' || (l.ratified_by_person_id = '$S') || '|' || (length(btrim(l.reason)) >= 12) || '|' || (SELECT count(*) FROM governance_acts a WHERE a.act = 'ratify' AND a.subject_table = 'lens_policies' AND a.subject_id = l.id AND a.actor_person_id = l.ratified_by_person_id AND a.reason = l.reason) FROM lens_policies l WHERE l.tenant_id = '$TEN' AND l.persona = 'cfo' AND NOT EXISTS (SELECT 1 FROM lens_policies n WHERE n.supersedes_id = l.id)")"
if [ -n "$LP" ]; then
  [ "$LP" = "55|system_of_record+published|consumption|true|true|1" ] && ok "the CFO lens on the copy, as recorded: ${S_NAME}'s ratification, with his act and reason" || bad "the CFO lens on the copy: $LP"
else
  expect POST /api/policies/lenses "$(J persona cfo min_confidence_score 55 admitted_bases '["system_of_record","published"]' suppresses '["consumption"]' refusal_text 'The CFO lens shows a value case only when its computed confidence is at least 55 and every actual it reports rests on a system of record or a published source. This case does not meet that yet. Below is each reason, and what would meet it.' reason 'Verification: the CFO lens, as on prod.')" 201 "the CFO lens, as on prod"
fi
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
export C3="Withdraw 2c10e091, “Assessed capability in value-based renewal execution across the enterprise sales cohort moved from 1.8 to 3.4 on a 0-5 scale.”, from Dollar Retention Rate (trailing twelve months): it supports the actual now, and will support nothing."
export C4="Withdraw eea43d9a, “LTM dollar retention rate of 100.4% at Q2 FY2027 period end.”, from Dollar Retention Rate (trailing twelve months): it supports the actual now, and will support nothing."
export C2="Withdraw the commitment of f23ee6a8, Dollar Retention Rate (trailing twelve months): target 100 %, committed by [SIM] Customer Sponsor. The outcome reads claimed; the withdrawn values stay on the record."
# Gate A, 14 Nov 2026 (L39): a copy taken after Brad's B4 act session (6 Nov 2026) holds acts 1-4. Each is asserted as
# recorded (Brad's, his reason, his act), and the rehearsal runs on a fixture in the pre-act shape: f23ee6a8 as it stood
# before act 1 (its own engagement on the account; the values its two withdrawals kept) and copies of its two simulated
# rows, linked as its actual. Those links cannot be made through any route today (AMENDMENT-005 refuses them; prod's
# predate the guard), so the fixture rows are written on the clone with triggers suspended for that one transaction,
# then every guard is in force for the rehearsal. The confirmations are §14's, with the fixture's short ids.
if [ "$(q "SELECT count(*) FROM outcome_withdrawals WHERE value_outcome_id = '$OUT'")" != "0" ]; then
  REC() {  # KIND REASON — the withdrawal row, by the steward, with its reason, and its withdraw act naming it
    q "SELECT (w.withdrawn_by_person_id = '$S') || '|' || (w.reason = \$r\$$2\$r\$) || '|' || (SELECT count(*) FROM governance_acts a WHERE a.act = 'withdraw' AND a.subject_table = 'value_outcomes' AND a.subject_id = '$OUT' AND a.result_table = 'outcome_withdrawals' AND a.result_id = w.id AND a.actor_person_id = w.withdrawn_by_person_id AND a.reason = w.reason) FROM outcome_withdrawals w WHERE w.value_outcome_id = '$OUT' AND w.kind = '$1'"
  }
  LREC() {  # EVIDENCE REASON — the actual link withdrawn by the steward, with its reason, and its withdraw act
    q "SELECT (l.withdrawn_by_person_id = '$S') || '|' || (l.withdrawal_reason = \$r\$$2\$r\$) || '|' || (SELECT count(*) FROM governance_acts a WHERE a.act = 'withdraw' AND a.subject_table = 'value_outcome_evidence' AND a.subject_id = '$OUT' AND a.result_table = 'evidence' AND a.result_id = l.evidence_id AND a.actor_person_id = l.withdrawn_by_person_id AND a.reason = l.withdrawal_reason) FROM value_outcome_evidence l WHERE l.value_outcome_id = '$OUT' AND l.evidence_id = '$1' AND l.supports = 'actual' AND l.withdrawn_at IS NOT NULL"
  }
  [ "$(REC measurement "$R1")" = "true|true|1" ] && [ "$(q "SELECT (withdrawn_values->>'actual_value') || ':' || (withdrawn_values->>'realized_currency_impact') FROM outcome_withdrawals WHERE value_outcome_id = '$OUT' AND kind = 'measurement'")" = "100.4:8400000" ] \
    && ok "act 1 on the copy, as recorded: f23ee6a8's measurement withdrawn by ${S_NAME}, with act 1's reason and his act; actual 100.4 and realized 8400000 kept" || bad "act 1 on the copy: $(REC measurement "$R1")"
  [ "$(REC commitment "$R2")" = "true|true|1" ] && [ "$(q "SELECT (withdrawn_values->>'target_value') || ':' || (withdrawn_values->>'committed_by') FROM outcome_withdrawals WHERE value_outcome_id = '$OUT' AND kind = 'commitment'")" = "100:[SIM] Customer Sponsor" ] \
    && ok "act 2 on the copy, as recorded: the commitment withdrawn by ${S_NAME}, with act 2's reason and his act; target 100 by [SIM] Customer Sponsor kept" || bad "act 2 on the copy: $(REC commitment "$R2")"
  [ "$(LREC "$SIM1" "$R3")" = "true|true|1" ] && ok "act 3 on the copy, as recorded: 2c10e091's actual link withdrawn by ${S_NAME}, with act 3's reason and his act" || bad "act 3 on the copy: $(LREC "$SIM1" "$R3")"
  [ "$(LREC "$SIM2" "$R4")" = "true|true|1" ] && ok "act 4 on the copy, as recorded: eea43d9a's actual link withdrawn by ${S_NAME}, with act 4's reason and his act" || bad "act 4 on the copy: $(LREC "$SIM2" "$R4")"
  FENG="$(uuidgen | tr 'A-Z' 'a-z')"; FOUT="$(uuidgen | tr 'A-Z' 'a-z')"; FS1="$(uuidgen | tr 'A-Z' 'a-z')"; FS2="$(uuidgen | tr 'A-Z' 'a-z')"
  FIX="$(psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 <<SQL
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO engagements SELECT (jsonb_populate_record(NULL::engagements, to_jsonb(g) || jsonb_build_object('id', '$FENG', 'name', 'Fixture: f23ee6a8 before the B4 act session (verification)'))).* FROM engagements g WHERE g.id = '$ENG';
INSERT INTO evidence SELECT (jsonb_populate_record(NULL::evidence, to_jsonb(e) || jsonb_build_object('id', CASE e.id WHEN '$SIM1' THEN '$FS1' ELSE '$FS2' END))).* FROM evidence e WHERE e.id IN ('$SIM1', '$SIM2');
INSERT INTO value_outcomes SELECT (jsonb_populate_record(NULL::value_outcomes, to_jsonb(o)
    || (SELECT withdrawn_values FROM outcome_withdrawals WHERE value_outcome_id = o.id AND kind = 'measurement')
    || ((SELECT withdrawn_values FROM outcome_withdrawals WHERE value_outcome_id = o.id AND kind = 'commitment') - 'committed_by' - 'value_stage')
    || jsonb_build_object('id', '$FOUT', 'engagement_id', '$FENG'))).* FROM value_outcomes o WHERE o.id = '$OUT';
INSERT INTO value_outcome_evidence SELECT (jsonb_populate_record(NULL::value_outcome_evidence, to_jsonb(l) || jsonb_build_object('value_outcome_id', '$FOUT',
    'evidence_id', CASE l.evidence_id WHEN '$SIM1' THEN '$FS1' ELSE '$FS2' END, 'withdrawn_at', NULL, 'withdrawn_by_person_id', NULL, 'withdrawal_reason', NULL))).*
  FROM value_outcome_evidence l WHERE l.value_outcome_id = '$OUT' AND l.evidence_id IN ('$SIM1', '$SIM2') AND l.supports = 'actual';
SELECT 'FIXTURE';
COMMIT;
SQL
)"
  [ "$FIX" = "FIXTURE" ] || { bad "the fixture: $FIX"; exit 1; }
  [ "$(q "SELECT realization || '|' || trim_scale(actual_value) || '|' || trim_scale(realized_currency_impact) || '|' || trim_scale(target_value) || '|' || (SELECT full_name FROM persons WHERE id = committed_by_person_id) || '|' || (SELECT count(*) FROM value_outcome_evidence WHERE value_outcome_id = '$FOUT' AND supports = 'actual' AND withdrawn_at IS NULL) || '|' || (SELECT bool_and(simulated) FROM evidence WHERE id IN ('$FS1', '$FS2')) FROM value_outcomes WHERE id = '$FOUT'")" = "measured|100.4|8400000|100|[SIM] Customer Sponsor|2|true" ] \
    && ok "the fixture ${FOUT:0:8}: measured, actual 100.4, realized 8400000, target 100 by [SIM] Customer Sponsor, two simulated rows (${FS1:0:8}, ${FS2:0:8}) as its actual: f23ee6a8 before act 1" || bad "the fixture: $(q "SELECT realization, actual_value, target_value FROM value_outcomes WHERE id = '$FOUT'")"
  [ "$(trig)" = "233" ] && ok "  ...every guard in force again: 233 triggers" || bad "  ...triggers: $(trig)"
  C1="${C1//f23ee6a8/${FOUT:0:8}}"; C2="${C2//f23ee6a8/${FOUT:0:8}}"; C3="${C3//2c10e091/${FS1:0:8}}"; C4="${C4//eea43d9a/${FS2:0:8}}"
  OUT="$FOUT"; SIM1="$FS1"; SIM2="$FS2"; export OUT SIM1 SIM2 C1 C2 C3 C4
fi
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
# Acts 5-6 through the page, on card 05 (Brad, 6 Nov 2026: every act in a rehearsal goes through the page).
export ENG NEXT="$(q "SELECT coalesce(max(run_number), 0) + 1 FROM value_runs WHERE engagement_id = '$ENG'")"
export N5="Skillsoft's own case as it stands: the published DRR baseline of 98%, no committed target, no measured actual."
export S5="Skillsoft 8-K Ex. 99.1, Q1 FY2027 release (9 Jun 2026)"
export L6="Skillsoft's own case as it stands, locked as the record its value case and its print are read from."
# M9: card 05's run controls hidden on the tenant's own account: the walk cannot perform act 5.
edit "$INSTPAGE" "{view.institution.is_tenant_self && <EngagementRuns" "{false && <EngagementRuns"
sleep 6
cw runacts > "$W/m9.out" 2>&1 || true
grep -q "FAIL  card 05: the tenant's own engagement offers" "$W/m9.out" && ok "M9: card 05's run controls hidden → caught: act 5 cannot be performed through the page" || bad "M9: $(grep -c FAIL "$W/m9.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/m9.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/m9.out" || true)))
[ "$(q "SELECT count(*) FROM value_runs WHERE engagement_id = '$ENG' AND run_number >= $NEXT")" = "0" ] && ok "  ...and nothing was produced under the break" || bad "  ...a run was produced under M9"
restore "$INSTPAGE"; sleep 4
# S1 (§20, D4): run 3 seals the hypothesis it tests, so the fixture states one on f23ee6a8 first (the shared helper,
# through the routes), before the act count is read: the helper's own acts are not acts 5-6.
state_hypothesis "$ENG" && ok "S1: a fixture hypothesis on the outcome (${HYP_ID:0:8}) before act 5" || bad "S1: no hypothesis stated on $ENG"
A0="$(q "SELECT count(*) FROM governance_acts")"
cw runacts
RS="$(q "SELECT id FROM value_runs WHERE engagement_id = '$ENG' AND run_number = $NEXT")"
[ -n "$RS" ] && [ "$(q "SELECT (locked_at IS NOT NULL) || '|' || source_fixture || '|' || lock_reason || '|' || (locked_by_person_id = '$S') FROM value_runs WHERE id = '$RS'")" = "true|$S5|$L6|true" ] \
  && ok "acts 5-6 recorded through the page: run $NEXT produced with act 5's run source label, locked by the steward with act 6's reason" || bad "acts 5-6: $(q "SELECT run_number, locked_at, source_fixture, lock_reason FROM value_runs WHERE engagement_id = '$ENG' ORDER BY run_number")"
[ "$(q "SELECT count(*) || '|' || string_agg(act::text || ':' || (actor_person_id = '$S') || ':' || (reason = '$(printf %s "$L6" | sed "s/'/''/g")'), ',') FROM governance_acts WHERE subject_table = 'value_runs' AND subject_id = '$RS'")" = "1|lock:true:true" ] && [ "$(q "SELECT count(*) FROM governance_acts")" = "$((A0 + 1))" ] \
  && ok "  ...one act: the steward's lock, with act 6's reason (producing is create-only: the run row is its record)" || bad "  ...acts: $A0 -> $(q "SELECT count(*) FROM governance_acts"); on the run: $(q "SELECT string_agg(act::text, ',') FROM governance_acts WHERE subject_id = '$RS'")"
[ "$(q "SELECT payload->>'payloadVersion' || '|' || coalesce(payload->>'actualValue','-') || '|' || coalesce(payload->>'realizedCurrencyImpact','-') || '|' || (payload->'case'->'cost_of_delay'->>'status') FROM value_runs WHERE id = '$RS'")" = "5|-|-|refused" ] && ok "  ...v5, sealing no actual, no realized impact, and cost of delay refused" || bad "  ...sealed: $(q "SELECT payload->>'actualValue', payload->>'realizedCurrencyImpact' FROM value_runs WHERE id = '$RS'")"
HASHS="$(q "SELECT payload_hash FROM value_runs WHERE id = '$RS'")"
# B4 addendum (§35): run 2 seals no committer and no verifier; its findings say so, never "synthetic", and state its realization.
[ "$(q "SELECT (NOT (payload->'findings' @> '[{\"code\":\"F2\"}]')) || '|' || coalesce((SELECT bool_and(f->>'message' LIKE '%no verifier of record has been named%' AND f->>'message' LIKE '%remains ''claimed''%' AND f->>'message' NOT LIKE '%synthetic%') FROM jsonb_array_elements(payload->'findings') f WHERE f->>'code' = 'F3'), false) || '|' || (SELECT count(*) FROM lvrf_misstated_findings('$RS')) FROM value_runs WHERE id = '$RS'")" = "true|true|0" ] \
  && ok "  ...its findings: no F2 for an absent committer; F3 names no verifier and the claimed outcome; nothing for an erratum to state" || bad "  ...findings: $(q "SELECT payload->'findings' FROM value_runs WHERE id = '$RS'")"
CFOR="$(q "SELECT CASE WHEN confidence_score < 55 THEN 'below_threshold,' ELSE '' END FROM value_runs WHERE id = '$RS'")no_actual"
RUN="$RS" LENS=cfo TAG=skillsoft EXPECT_ASKS="baseline_not_system_of_record+q,no_commitment+q,no_rate+q,no_measure_class+q,no_actual+q,no_verifier+q" \
  EXPECT_CFO_REFUSED=1 EXPECT_CFO_REASONS="$CFOR" FORBID2="100.4" HASH="$HASHS" EXPECT_OUTSIDE_IN=1 EXPECT_CLAIM_REFUSED=1 \
  EXPECT_BANNER="OUTSIDE-IN HYPOTHESIS — built from published sources only; no figure rests on Skillsoft’s own records or on a named person at Skillsoft" PRESS_PRINT=1 \
  EXPECT_TEXT="What we need from you: the asks||Why the CFO lens refuses||set out under “Why the CFO lens refuses”||What would meet them is under “What we need from you: the asks”, below." cw valuecase
# B4 addendum (ruling 3): act 7's print request, pressed on the page, names the CFO lens policy it applied.
[ "$(q "SELECT (lens_policy_id = (SELECT l.id FROM lens_policies l WHERE l.persona = 'cfo' AND l.tenant_id = '$TEN' AND NOT EXISTS (SELECT 1 FROM lens_policies x WHERE x.supersedes_id = l.id))) || '|' || (rendered_by_person_id = '$S') FROM record_documents WHERE kind = 'print_request' AND value_run_id = '$RS' AND lens = 'cfo' ORDER BY rendered_at DESC LIMIT 1")" = "true|true" ] \
  && ok "  ...the print request records the CFO lens policy it applied, by the steward" || bad "  ...print request: $(q "SELECT kind, lens, lens_policy_id FROM record_documents WHERE value_run_id = '$RS'")"
sqlrefused "  ...a CFO-lens print request naming no lens policy" "INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, value_run_id, document_version, disclosure, content_hash, payload, rendered_by_person_id, kind, lens) SELECT '$TEN', engagement_id, lvrf_run_outcome_at_sealing(id), id, 99, 'internal', payload_hash, '{}'::jsonb, '$S', 'print_request', 'cfo' FROM value_runs WHERE id = '$RS'" "names the CFO lens policy it applied"
RUN="$RS" LENS=general TAG=skillsoft EXPECT_ASKS="baseline_not_system_of_record+q,no_commitment+q,no_rate+q,no_measure_class+q,no_actual+q,no_verifier+q" \
  EXPECT_CLAIM_REFUSED=1 FORBID2="7,000,000" HASH="$HASHS" EXPECT_OUTSIDE_IN=1 EXPECT_BANNER="OUTSIDE-IN HYPOTHESIS — built from published sources only; no figure rests on Skillsoft’s own records or on a named person at Skillsoft" cw valuecase
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
CM() { J target_value 1.0 committed_by_person_id "$OWNER" committed_at 2026-10-01T00:00:00Z promised_measured_on 2027-04-01 commitment_note 'Verification: committed to 1.0.' attribution_method "$1" measure_class "$2"; }
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'B4 safety capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "an offering and its capability"
CAPF="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAPF/industry-measures" "$(J industry_measure_id "$E_TRIR" claim 'Verification: training improves safe behaviour.')" 201 "  ...the capability claims the TRIR entry"
outcome "B4 TRIR control" 1.4; OK="$OC"; ENGK="$ENGO"
expect POST "/api/value-outcomes/$OK/evidence" "$(EVB public_filing 'TRIR FY25 1.4 (fixture)' baseline)" 201 "  ...a published baseline (its quote does not state 1.4: a figure check flags it)"
s29_restart() { stop_server; start_server; }
# §29: B4's rules are proven on commitments by an owner with no role, recorded before the rule (the asks and
# the OUTSIDE-IN banner read them as Curia's): the pre-§29 code for these commits only.
pre_s29 s29_restart
# M1: a commit without the method.
expect POST "/api/value-outcomes/$OK/commit" "$(J target_value 1.0 committed_by_person_id "$OWNER" committed_at 2026-10-01T00:00:00Z promised_measured_on 2027-04-01 commitment_note 'Verification: no method.' measure_class capability_performance)" 422 "M1: a commit without the method (route)" "attribution_method"
sqlrefused "M1: a commit without the method (database)" "UPDATE value_outcomes SET target_value = 1.0, committed_by_person_id = '$OWNER', committed_at = now(), measure_class = 'capability_performance' WHERE id = '$OK'" "states its attribution method and its measure class"
expect POST "/api/value-outcomes/$OK/commit" "$(CM control_group capability_performance)" 201 "a commit with the method (control group) and the class"
[ "$(q "SELECT attribution_method || '|' || measure_class FROM value_outcomes WHERE id = '$OK'")" = "control_group|capability_performance" ] && ok "  ...both recorded" || bad "  ...method/class"
post_s29 s29_restart
sqlrefused "M2: the method changed after commit" "UPDATE value_outcomes SET attribution_method = 'contribution_only' WHERE id = '$OK'" "fixed at commit"
# M3: a measurement on inferred evidence only; then on a system export.
expect POST "/api/value-outcomes/$OK/evidence" "$(EVB observation 'TRIR as observed on a site walk (fixture)' actual)" 201 "  ...an observation linked as the actual (inferred)"
expect POST "/api/value-outcomes/$OK/measure" "$(J actual_value 1.1 actual_measured_at 2026-11-01T12:00:00Z)" 422 "M3: a measurement resting on inferred evidence only" "or published, and not simulated."
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
produce() { state_hypothesis "$1" || bad "S1: no hypothesis stated on $1"; expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "$2" source_fixture spine_fixture)" 201 "  ...produced: $2"; RUN="$(rj b.value_run_id)"; }
produce "$ENGK" "Verification: the control-group case."; RK="$RUN"
RUN="$RK" LENS=general TAG=control EXPECT_ASKS=skip EXPECT_ATTRIBUTION="Attribution: a control group." EXPECT_FOOTNOTE="The quoted source does not state this figure (figure check:" HASH="$(q "SELECT payload_hash FROM value_runs WHERE id = '$RK'")" cw valuecase
# The class rule, the committer ask, the falsifier, the not-shown line, and the unsourced claim.
outcome "B4 TRIR compliance" 2.1; OCC="$OC"; ENGC="$ENGO"
expect POST "/api/value-outcomes/$OCC/evidence" "$(EVB public_filing 'TRIR FY25 2.1 (fixture)' baseline)" 201 "  ...a published baseline"
pre_s29 s29_restart
expect POST "/api/value-outcomes/$OCC/commit" "$(CM contribution_only compliance_assurance)" 201 "a compliance-class commitment, by a person with no customer-side role"
post_s29 s29_restart
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
  EXPECT_FALSIFIER="at or above its baseline of 2.1" HASH="$HASHC" \
  EXPECT_BANNER="OUTSIDE-IN HYPOTHESIS — no figure rests on B4 account ${TS}’s own records or on a named person at B4 account ${TS}" cw valuecase
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
# M12: the withheld-claim line removed from the CFO refusal page: the claim would be silently absent again.
edit "$PAGE" "{o0 && o0.claimed_currency_impact !== null && o0.claimed_currency_impact !== undefined && (o0.sources.impact_basis" "{false && (o0.sources.impact_basis"
sleep 6
RUN="$RS" LENS=cfo TAG=break12 EXPECT_ASKS=skip EXPECT_CFO_REFUSED=1 EXPECT_CLAIM_REFUSED=1 HASH="$HASHS" cw valuecase > "$W/m12.out" 2>&1 || true
grep -q "FAIL    ...a claimed impact with no source prints its refusal" "$W/m12.out" && ok "M12: the withheld-claim line removed from the CFO refusal page → caught" || bad "M12: $(grep -c FAIL "$W/m12.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/m12.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/m12.out" || true)))
restore "$PAGE"; sleep 3

step "6b. Findings: absence is absence (M10); the misstated-finding errata, through the page (M11)"
outcome "B4 TRIR absent" 1.6; OA="$OC"; ENGA="$ENGO"
expect POST "/api/value-outcomes/$OA/evidence" "$(EVB public_filing 'TRIR FY25 1.6 (fixture)' baseline)" 201 "  ...a published baseline; no commitment, no verifier"
produce "$ENGA" "Verification: no committer, no verifier."; RA0="$RUN"
[ "$(q "SELECT (NOT (payload->'findings' @> '[{\"code\":\"F2\"}]')) || '|' || (SELECT count(*) FROM lvrf_misstated_findings('$RA0')) FROM value_runs WHERE id = '$RA0'")" = "true|0" ] && ok "an outcome with no committer seals no F2, and nothing its seal contradicts" || bad "absent: $(q "SELECT payload->'findings' FROM value_runs WHERE id = '$RA0'")"
edit "$PRODUCE" "        committerSynthetic = false;
        committerName = null;" "        committerSynthetic = true;
        committerName = null;"
stop_server; start_server
produce "$ENGA" "Verification: M10, absence sealed as synthetic."; RA1="$RUN"
[ "$(q "SELECT (payload->'findings' @> '[{\"code\":\"F2\"}]') || '|' || (SELECT count(*) FROM lvrf_misstated_findings('$RA1') WHERE code = 'F2') FROM value_runs WHERE id = '$RA1'")" = "true|1" ] \
  && ok "M10: an absent committer sealed as synthetic again → caught: F2 sealed, and lvrf_misstated_findings names it" || bad "M10: $(q "SELECT payload->'findings' FROM value_runs WHERE id = '$RA1'")"
restore "$PRODUCE"; stop_server; start_server
# The dry run. An independent oracle in plain SQL over the payloads, never lvrf_misstated_findings() (Brad, 14 Nov 2026):
# over the locked runs the copy held when restored, every F3 but Skillsoft run 1's, plus every F2 on a run whose committer
# factor names no committer ("No committer of record has been named", or the early "[SIM] (no sponsor of record)"
# placeholder, which is absence). The route's count and the function's must both equal it; the runs made on the clone,
# all sealed by the fixed code, contribute none. The 5 Nov copy gives 39 on 24; the 14 Nov copy (prod's state) 41 on 25.
ORACLE="$(q "WITH r AS (SELECT r.id, r.payload FROM value_runs r WHERE r.tenant_id = '$TEN' AND r.locked_at IS NOT NULL AND r.deleted_at IS NULL AND r.id IN ($RUNIDS0)),
  f AS (SELECT r.id, x->>'code' AS code,
               (SELECT c->>'note' FROM jsonb_array_elements(coalesce(r.payload->'confidence'->'factors', '[]'::jsonb)) c WHERE c->>'factor' = 'human_commit_of_record' LIMIT 1) AS cnote
          FROM r, jsonb_array_elements(coalesce(r.payload->'findings', '[]'::jsonb)) x),
  o AS (SELECT id FROM f WHERE code = 'F3' AND id <> '$RUN1'
        UNION ALL SELECT id FROM f WHERE code = 'F2' AND (cnote LIKE 'No committer of record has been named%' OR cnote LIKE '%[SIM] (no sponsor of record)%'))
  SELECT count(*) || '|' || count(DISTINCT id) FROM o")"
FUNC="$(q "SELECT count(*) || '|' || count(DISTINCT r.id) FROM value_runs r CROSS JOIN LATERAL lvrf_misstated_findings(r.id) m WHERE r.tenant_id = '$TEN' AND r.locked_at IS NOT NULL AND r.deleted_at IS NULL")"
NEWRUNS="$(q "SELECT count(*) FROM value_runs r CROSS JOIN LATERAL lvrf_misstated_findings(r.id) m WHERE r.id NOT IN ($RUNIDS0) AND r.tenant_id = '$TEN' AND r.locked_at IS NOT NULL AND r.deleted_at IS NULL")"
expect GET /api/errata/misstated-findings "" 200 "the dry run"
MCOUNT="$(rj b.count)"; MRUNS="$(rj b.runs)"
[ "$MCOUNT|$MRUNS" = "$ORACLE" ] && [ "$FUNC" = "$ORACLE" ] && [ "$NEWRUNS" = "0" ] \
  && ok "  ...$MCOUNT findings on $MRUNS runs: the route, lvrf_misstated_findings() and the plain-SQL oracle agree (every F3 but Skillsoft run 1's, every F2 on a run that named no committer); the clone's own locked runs add none (M10's unlocked break run is the only one misstated, and the batch lists locked runs only)" \
  || bad "  ...dry run $MCOUNT|$MRUNS, function $FUNC, oracle $ORACLE, from the clone's own runs $NEWRUNS"
[ "$(rj "b.errata.some(e=>e.run_id==='$RA1')")|$(q "SELECT locked_at IS NULL FROM value_runs WHERE id = '$RA1'")" = "false|t" ] && ok "  ...M10's run, misstated by the break, is unlocked and not listed: the batch reads locked runs only" || bad "  ...M10's run: listed or locked"
if [ -n "${EXPECT_MISSTATED:-}" ]; then [ "$ORACLE" = "$EXPECT_MISSTATED" ] && ok "  ...as expected for this copy: $EXPECT_MISSTATED" || bad "  ...expected $EXPECT_MISSTATED for this copy, the oracle reads $ORACLE"; fi
[ "$(rj "b.errata.some(e=>e.run_id==='$RUN1')")" = "false" ] && ok "  ...Skillsoft run 1, a named simulated sponsor and verifier, measured: its findings are true, so not listed" || bad "  ...run 1 listed"
[ "$(rj "JSON.stringify(b.errata.map(e=>[e.run_id,e.code,e.false_text,e.true_text]))")" = "$(q "SELECT json_agg(json_build_array(x.run_id, x.code, x.false_text, x.true_text) ORDER BY x.account, x.run_number, x.code)::text FROM (SELECT r.id AS run_id, i.name AS account, r.run_number, m.* FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id CROSS JOIN LATERAL lvrf_misstated_findings(r.id) m WHERE r.tenant_id = '$TEN' AND r.locked_at IS NOT NULL) x" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s))))")" ] \
  && ok "  ...every row's two sentences are lvrf_misstated_findings()'s, read from the seal" || bad "  ...the list differs from the seal's"
[ "$(q "SELECT bool_and(m.false_text = (SELECT f->>'message' FROM jsonb_array_elements(r.payload->'findings') f WHERE f->>'code' = m.code)) FROM value_runs r CROSS JOIN LATERAL lvrf_misstated_findings(r.id) m")" = "t" ] && ok "  ...each false sentence is the sealed finding, verbatim" || bad "  ...false sentence differs"
expect POST /api/errata/misstated-findings "$(J expected_count "$MCOUNT" reason 'Verification: X records them.')" 403 "  ...the batch by X" "steward" "$X"
expect POST /api/errata/misstated-findings "$(J expected_count "$((MCOUNT + 1))" reason 'Verification: a count that was off.')" 409 "  ...the batch with the count off" "The count changed"
expect POST /api/errata/misstated-findings "$(J expected_count "$MCOUNT" reason 'Verification: a typed sentence.' true_text 'Typed by a person.')" 400 "  ...a typed sentence" "read from its run's seal"
# M11 (Brad's break): the guard must refuse a run whose finding is true.
R1F3="$(q "SELECT f->>'message' FROM value_runs r, jsonb_array_elements(r.payload->'findings') f WHERE r.id = '$RUN1' AND f->>'code' = 'F3'" | sed "s/'/''/g")"
TRUE1="In this run's seal no verifier of record was named."
MF() { printf "INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, kind, finding_code, what_was_wrong, what_is_right, reason, sealed_score, sealed_band, recompute_method, recorded_by_person_id) SELECT '%s', id, lvrf_run_outcome_at_sealing(id), 'misstated_finding', '%s', '%s', '%s', 'Verification: a misstated-finding erratum.', confidence_score, confidence_band, 'From this run''s seal: verification.', '%s' FROM value_runs WHERE id = '%s'" "$TEN" "$1" "$2" "$(printf %s "$3" | sed "s/'/''/g")" "$S" "$4"; }
sqlrefused "  ...an erratum on Skillsoft run 1's true F3" "$(MF F3 "$R1F3" "$TRUE1" "$RUN1")" "is not contradicted by its own seal"
fnbreak lvrf_run_erratum_steward_only "  IF NEW.kind = 'misstated_finding' AND NOT EXISTS (" "  IF false AND NOT EXISTS ("
M11R="$(sqlaccepted "$(MF F3 "$R1F3" "$TRUE1" "$RUN1")")"
[ "$M11R" = "ACCEPTED" ] && ok "M11: the errata guard admitting a true finding → caught: an erratum on Skillsoft run 1's true F3 lands" || bad "M11: $M11R"
reharden
sqlrefused "  ...with it back: refused again" "$(MF F3 "$R1F3" "$TRUE1" "$RUN1")" "is not contradicted by its own seal"
SR="$(q "SELECT r.id FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id WHERE i.name = 'Scotts Miracle-Gro' AND r.run_number = 2")"
SF="$(q "SELECT false_text FROM lvrf_misstated_findings('$SR') WHERE code = 'F3'" | sed "s/'/''/g")"
sqlrefused "  ...a misstated finding with a typed true sentence" "$(MF F3 "$SF" "In this run's seal everything was fine, typed." "$SR")" "is not contradicted by its own seal"
# NULL inputs for the widened CHECK and the new one: each reads false, never NULL.
CK() { q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '$1'" | sed -E 's/^CHECK \(//; s/\)$//' | sed "s/$2\.//g"; }
[ "$(q "SELECT ($(CK run_errata_kind_complete run_errata)) IS FALSE FROM (SELECT 'misstated_finding'::text AS kind, NULL::text AS finding_code, NULL::uuid AS evidence_id, NULL::text AS corrected_to_supports, NULL::uuid AS supersedes_id, NULL::numeric AS recomputed_score, NULL::text AS recomputed_band, NULL::numeric AS points_not_credited, NULL::uuid AS figure_finding_id, 'From this run''s seal: x'::text AS recompute_method) v")" = "t" ] \
  && ok "NULL: a misstated-finding erratum with no finding code reads false" || bad "NULL: kind_complete"
[ "$(q "SELECT ($(CK record_documents_lens_policy_scope record_documents)) IS FALSE FROM (SELECT gen_random_uuid() AS lens_policy_id, NULL::text AS kind, 'cfo'::text AS lens) v")" = "t" ] \
  && ok "NULL: a lens policy on a document of no kind reads false" || bad "NULL: lens_policy_scope"
# The batch, through the page (the steward's act after the deploy; rule 10).
export MCOUNT MRUNS RUN1 SR
export SAMPLE_TRUE="$(q "SELECT true_text FROM lvrf_misstated_findings('$SR') WHERE code = 'F3'")" SAMPLE_FALSE="$(q "SELECT false_text FROM lvrf_misstated_findings('$SR') WHERE code = 'F3'")"
export MREASON="Produce-run sealed an absent committer or verifier as synthetic, and said a claimed outcome remained measured. Each erratum states the sealed finding and what the run's own seal holds."
A1="$(q "SELECT count(*) FROM governance_acts WHERE act = 'record_erratum'")"
COUNT="$MCOUNT" RUNS="$MRUNS" SAMPLE_RUN="$SR" SAMPLE_CODE=F3 ACT=1 REASON="$MREASON" \
  CONFIRM="Record $MCOUNT misstated-finding errata on $MRUNS runs, one beside each finding listed. If the record now calls for a different number, nothing is recorded." cw misstated
[ "$(q "SELECT count(*) || '|' || count(DISTINCT value_run_id) || '|' || bool_and(recorded_by_person_id = '$S') || '|' || bool_and(reason = '$(printf %s "$MREASON" | sed "s/'/''/g")') FROM run_errata WHERE kind = 'misstated_finding'")" = "$MCOUNT|$MRUNS|true|true" ] \
  && ok "the batch recorded: $MCOUNT errata on $MRUNS runs, each the steward's, with the reason" || bad "batch: $(q "SELECT count(*) FROM run_errata WHERE kind = 'misstated_finding'")"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'record_erratum'")" = "$((A1 + MCOUNT))" ] && ok "  ...one record_erratum act each" || bad "  ...acts"
expect GET /api/errata/misstated-findings "" 200 "  ...the dry run again"
[ "$(rj b.count)" = "0" ] && ok "  ...nothing left to state" || bad "  ...$(rj b.count) left"

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
