#!/usr/bin/env bash
#
# §26 (3.1 small item; Brad's rulings, 23 Nov 2026, D1-D6) — the promised measurement date, recorded at commit.
#
#   ./scripts/verify_promised_date.sh [out_dir]
#
# Clones `lvrf_prodcopy` to `lvrf_verifyp26`, migrated and hardened, dropped on exit. On the clone, as the steward:
#   P0  the clone: no migration, 227 triggers, every run byte-identical; Curia's commitment of 30 Aug 2026 (made before
#       §26) keeps no date, and card 01d says so.
#   P1  a commit THROUGH THE FORM (card 01d): the measure-by field; its unmet lines (none, on the commit date, past three
#       years); the confirmation word for word; the row holds the date at 12:00 UTC; HB-0014's payload and the act; the
#       card; a run sealed afterwards carries it as roadmap.promised_measured_on; its value case prints it.
#   P1r the route's own refusals, in words: no date, not a date, on the commit date, past three years; three years
#       exactly is admitted.
#   P2  the database's rules, as lvrf_app in a rolled-back transaction, each refused by hardening §34 itself: a commit
#       with no date; a date on the commit date; one past three years; a date changed while the commitment stands; a
#       date set on a commitment made before §26; a date on an outcome with no commitment; a commitment taken back
#       leaving its date; a withdrawal recording another date, or none.
#   P3  the withdrawal, by route: it records the date (D5) and clears it; committing again takes a new date. A pre-§26
#       commitment's withdrawal records promised_measured_on null (on the database: Curia's is in a retired engagement).
#   P4  "late" (§28 D5, Anywhere on Earth), against SQL and on the page: promised today, not late; promised two days
#       ago and unmeasured, late; promised two days ago and measured, never late. The tile and the band say the rule.
# A coverage gate fails any section that prints no line.
# DELIBERATE BREAKS, each against the clean pass, files restored byte-identical and functions by re-applying hardening:
#   B1 the guard's date rule removed       B2 the date made changeable          B3 the withdrawal not recording the date
#   B4 moved to verify_local_date (§28: late is Anywhere on Earth, proven at fixed instants)      B5 the date left out of the confirmation

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
. scripts/lib/customer_side.sh
. scripts/lib/hypothesis.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyp26
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3381; VITE_PORT=5381; CDP_PORT=9491
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_p26.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
SPINE=client/src/components/OutcomeSpine.tsx; WDR=server/routes/outcomeWithdrawals.ts; BOOKR=server/routes/book.ts
EDITED=("$SPINE" "$WDR" "$BOOKR")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
# stop_port and by_port are scripts/lib/ports.sh's (sourced by finish.sh): a listener is stopped only if it is this script's own.
cleanup() {
  stop_port "$PORT"; stop_port "$VITE_PORT"
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  sleep 1; [ -n "${KEEP_DB:-}" ] || dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1"; }
J() { node -e 'const a=process.argv.slice(1);const o={};for(let i=0;i<a.length;i+=2){let v=a[i+1];try{if(/^[\[{]|^-?\d+(\.\d+)?$|^(true|false|null)$/.test(v))v=JSON.parse(v)}catch{}o[a[i]]=v}console.log(JSON.stringify(o))' "$@"; }
req() {  # METHOD PATH [BODY] — status in $CODE, body in $W/r.json, as the steward
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: $S" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d "$3" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?b.message:JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING]
  req "$1" "$2" "$3"; local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 300)"; fi
}
# As lvrf_app, the actor set, in a transaction that is always rolled back.
sqlrefused() {  # LABEL SQL NEEDLE
  local out; out="$(printf "BEGIN;\nSET LOCAL ROLE lvrf_app;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "$S" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused by the database: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
sqlaccepted() {  # SQL
  printf "BEGIN;\nSET LOCAL ROLE lvrf_app;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nROLLBACK;\n" "$S" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1 || true
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
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
reharden() {
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "233" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 233 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}
edit() { python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; sleep 3; }
start_server() {
  LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
  for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done; return 1
}
restart_server() { stop_port "$PORT"; start_server; }
walk() {  # SECTIONS TAG LOG [ENV=VALUE...]
  local s="$1" tag="$2" log="$3"; shift 3
  env VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT_DIR="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" TAG="$tag" "$@" node scripts/lib/promised_walk.mjs "$s" > "$log" 2>&1 \
    || echo "FAIL  $tag: the walk crashed: $(tail -3 "$log" | tr '\n' ' ')" >> "$log"
}
tally() {
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$1"
  grep -q '^DONE ' "$1" || bad "the walk did not finish: $(tail -3 "$1" | tr '\n' ' ')"
}
cover() {  # LOG PHRASE...
  local log="$1"; shift
  for want in "$@"; do grep -qF -- "$want" "$log" && ok "coverage: ran — $want" || bad "coverage: no line for — $want"; done
}
d() { q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + ($1), 'YYYY-MM-DD')"; }  # a UTC date, N days from today
LOG="$W/main.log"; exec > >(tee "$LOG") 2>&1

step "1. Typecheck, tokens"
(cd client && npx tsc -b) > "$W/tsc.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc.log")"
npx tsc --noEmit -p tsconfig.json > "$W/tsc_s.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc_s.log")"
node scripts/check_design_tokens.mjs > "$W/tokens.log" 2>&1 && ok "check_design_tokens: $(tail -1 "$W/tokens.log")" || bad "check_design_tokens: $(tail -5 "$W/tokens.log")"
H="$(grep -nE '#[0-9A-Fa-f]{3,8}\b' "$SPINE" client/src/pages/WarRoomPage.tsx client/src/components/BookBand.tsx client/src/api/book.ts || true)"
[ -z "$H" ] && ok "the changed client files restate no hex value" || bad "a hex: $H"

step "2. P0: clone the prod copy, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (no migration in §26)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "233" ] && ok "233 triggers (§26 adds none; §32 section 38: +2)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 56 migrations, newest 0055_s7b_story_records" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every run byte-identical after hardening" || bad "a run changed"
[ "$(q "SELECT count(*) FROM value_outcomes WHERE promised_measured_at IS NOT NULL")" = "0" ] && ok "no outcome on the copy carries a promised date (none backfilled)" || bad "a promised date on the copy"
CURIA_O="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE 'e3fb0061%'")"; CURIA="$(q "SELECT institution_id FROM value_outcomes WHERE id = '$CURIA_O'")"
[ "$(q "SELECT (committed_at IS NOT NULL) || '|' || (promised_measured_at IS NULL) FROM value_outcomes WHERE id = '$CURIA_O'")" = "true|true" ] \
  && ok "Curia's commitment e3fb0061 (30 Aug 2026, before §26) stands with no promised date (D2)" || bad "Curia's commitment: $(q "SELECT committed_at, promised_measured_at FROM value_outcomes WHERE id = '$CURIA_O'")"

step "3. The session, the server, a fixture account"
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"; TS="$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server && ok "API up on $PORT" || { bad "server: $(tail -5 "$W/server.log")"; exit 1; }
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
ACCT="Larkspur Freight (P26 fixture, invented)"
expect POST /api/account-inputs "$(J institution "$(J name "$ACCT" industry_slug manufacturing classification_note 'Verification: classified for §26.')" persons "[$(J full_name 'P26 owner (invented)' email "owner.$TS@p26.example" title Owner)]")" 201 "a fixture customer account, with a customer-side owner"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
make_customer_side "$INST" "$OWNER"  # §29: only a customer-side person commits
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'P26 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
outcome() {  # NAME -> stdout: outcome id
  req POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name "P26 engagement $1" engagement_owner_person_id "$OWNER" capability_name 'P26 capability' metric "$(J name "P26 TRIR $1" unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)"
  [ "$CODE" = "201" ] && rj b.value_outcome_id || { echo "ERR $CODE $(said)"; return 1; }
}
O1="$(outcome form)"; O2="$(outcome rules)"; O3="$(outcome today)"; O4="$(outcome yesterday)"; O5="$(outcome measured)"; O6="$(outcome confirm-break)"
for o in "$O1" "$O2" "$O3" "$O4" "$O5" "$O6"; do case "$o" in ERR*) bad "an outcome: $o"; exit 1 ;; esac; done
ok "six fixture outcomes, each in its own engagement"
CB() {  # COMMITTED_ON PROMISED_ON — a commit body, by the owner
  J target_value 1.0 committed_by_person_id "$OWNER" committed_at "${1}T12:00:00Z" promised_measured_on "$2" commitment_note 'Verification: committed with a measure-by date (§26).' attribution_method contribution_only measure_class capability_performance
}
CBX() { J target_value 1.0 committed_by_person_id "$OWNER" committed_at 2026-10-01T12:00:00Z commitment_note 'Verification: committed without a measure-by date.' attribution_method contribution_only measure_class capability_performance; }

step "4. P0 on the page: Curia's pre-§26 commitment says it has no date"
walk card p0 "$W/p0.log" CARD_INST="$CURIA" CARD_OUT="$CURIA_O" CARD_WANT=" · no promised date on record (committed before promised dates were recorded, 24 Nov 2026)"; tally "$W/p0.log"

step "5. P1: a commit through the form"
ON="$(d -30)"; BY="$(d 150)"; PAST3="$(q "SELECT to_char(('$ON'::date + interval '3 years')::date + 1, 'YYYY-MM-DD')")"
WANT="Commit ${O1:0:8}, P26 TRIR form: target 1.2 incidents per 200,000 hours., by P26 owner (invented), on $ON; measured by $BY; attribution: contribution only (no share claimed); class: capability and performance. The method, the class and the measure-by date are fixed while the commitment stands."
walk form p1 "$W/p1.log" INST="$INST" OUT="$O1" COMMITTER='P26 owner (invented)' TARGET=1.2 ON="$ON" BY="$BY" PAST3="$PAST3" NOTE='Verification: committed through the form (§26).' WANT="$WANT" CONFIRM=1; tally "$W/p1.log"
[ "$(q "SELECT to_char(promised_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')  FROM value_outcomes WHERE id = '$O1'")" = "$BY 12:00" ] && ok "the row holds the promised date, at 12:00 UTC on $BY" || bad "row: $(q "SELECT promised_measured_at FROM value_outcomes WHERE id = '$O1'")"
[ "$(q "SELECT payload->>'promised_measured_on' FROM heartbeat_events WHERE heartbeat_id = 'HB-0014' AND subject_id = '$O1'")" = "$BY" ] && ok "HB-0014's payload names promised_measured_on $BY (D6)" || bad "HB-0014: $(q "SELECT payload FROM heartbeat_events WHERE heartbeat_id = 'HB-0014' AND subject_id = '$O1'")"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'commit' AND subject_id = '$O1' AND actor_person_id = '$S'")" = "1" ] && ok "  ...one commit act, the steward's" || bad "commit act"
ENG1="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O1'")"
state_hypothesis "$ENG1" > "$W/hyp.log" 2>&1 && ok "a hypothesis on it, by the routes (state_hypothesis)" || bad "state_hypothesis: $(tail -3 "$W/hyp.log")"
expect POST "/api/engagements/$ENG1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note 'Verification: §26 run.' source_fixture p26)" 201 "a run produced after the commit"
RUN="$(rj b.value_run_id)"
expect POST "/api/value-runs/$RUN/lock" "$(J lock_reason 'Verification: §26 run sealed.')" 200 "  ...and locked"
[ "$(q "SELECT jsonb_path_query_array(payload, '\$.**.promised_measured_on') FROM value_runs WHERE id = '$RUN'")" = "[\"$BY\"]" ] && ok "the sealed case carries roadmap.promised_measured_on $BY (payloadVersion unchanged)" || bad "sealed: $(q "SELECT jsonb_path_query_array(payload, '\$.**.promised_measured_on') FROM value_runs WHERE id = '$RUN'")"
walk case p1case "$W/p1c.log" RUN="$RUN" BY="$BY"; tally "$W/p1c.log"

step "6. P1r: the route's refusals, in words"
expect POST "/api/value-outcomes/$O2/commit" "$(CBX)" 422 "no measure-by date (D1)" "State the date the outcome will be measured by"
expect POST "/api/value-outcomes/$O2/commit" "$(CB 2026-10-01 2027-02-30)" 422 "not a calendar date" "as a calendar date (YYYY-MM-DD)"
expect POST "/api/value-outcomes/$O2/commit" "$(CB 2026-10-01 2026-10-01)" 422 "on the commit date (D3)" "after the commit date (2026-10-01) and no more than three years after it (by 2029-10-01)"
expect POST "/api/value-outcomes/$O2/commit" "$(CB 2026-10-01 2029-10-02)" 422 "one day past three years (D3)" "no more than three years after it"
[ "$(q "SELECT committed_at IS NULL FROM value_outcomes WHERE id = '$O2'")" = "t" ] && ok "  ...nothing committed by any of them" || bad "O2 was committed"
# Three years exactly is admitted: proven on the database in a rolled-back transaction (O2 stays uncommitted for P2).
[ "$(sqlaccepted "UPDATE value_outcomes SET target_value = 1.0, committed_by_person_id = '$OWNER', committed_at = '2026-10-01T12:00:00Z', attribution_method = 'contribution_only', measure_class = 'capability_performance', promised_measured_at = '2029-10-01T12:00:00Z', value_stage = 'commit' WHERE id = '$O2'")" = "ACCEPTED" ] \
  && ok "three years to the day (2026-10-01 → 2029-10-01) is admitted by the database" || bad "three years exactly: refused"

step "7. P2: the database's rules, as lvrf_app"
COMMIT_SQL="UPDATE value_outcomes SET target_value = 1.0, committed_by_person_id = '$OWNER', committed_at = '2026-10-01T12:00:00Z', attribution_method = 'contribution_only', measure_class = 'capability_performance', value_stage = 'commit'"
sqlrefused "a commit with no date (D1)" "$COMMIT_SQL WHERE id = '$O2'" "a commitment states the date its outcome will be measured by"
sqlrefused "a date on the commit date (D3)" "${COMMIT_SQL}, promised_measured_at = '2026-10-01T23:00:00Z' WHERE id = '$O2'" "after the commit date and no more than three years after it"
sqlrefused "a date past three years (D3)" "${COMMIT_SQL}, promised_measured_at = '2029-10-02T12:00:00Z' WHERE id = '$O2'" "after the commit date and no more than three years after it"
sqlrefused "a date changed while the commitment stands (D2)" "UPDATE value_outcomes SET promised_measured_at = promised_measured_at + interval '1 day' WHERE id = '$O1'" "fixed at commit; withdraw the commitment to change it"
sqlrefused "a date set on a commitment made before §26 (D2)" "UPDATE value_outcomes SET promised_measured_at = now() + interval '30 days' WHERE id = '$CURIA_O'" "fixed at commit; withdraw the commitment to change it"
sqlrefused "a date on an outcome with no commitment" "UPDATE value_outcomes SET promised_measured_at = now() + interval '30 days' WHERE id = '$O2'" "a promised measurement date belongs to a commitment"
sqlrefused "a commitment taken back, leaving its date" "UPDATE value_outcomes SET target_value = NULL, committed_by_person_id = NULL, committed_at = NULL, attribution_method = NULL, measure_class = NULL, value_stage = 'attach' WHERE id = '$O1'" "a promised measurement date belongs to a commitment"
WV="$(q "SELECT jsonb_build_object('target_value', trim_scale(target_value)::text) FROM value_outcomes WHERE id = '$O1'")"
sqlrefused "a withdrawal recording no date (D5)" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$O1', 'commitment', '$WV', 'Verification: no date recorded.', '$S')" "the values recorded are not the outcome's"
sqlrefused "a withdrawal recording another date (D5)" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$O1', 'commitment', '$WV'::jsonb || '{\"promised_measured_on\":\"2030-01-01\"}', 'Verification: another date.', '$S')" "the values recorded are not the outcome's"

step "8. P3: the withdrawal records the date and clears it; a new commit takes a new date"
expect POST "/api/value-outcomes/$O1/commitment/withdraw" "$(J reason 'Verification: withdrawn to change the measure-by date (§26).')" 200 "the commitment of ${O1:0:8} withdrawn, by route"
[ "$(q "SELECT withdrawn_values->>'promised_measured_on' FROM outcome_withdrawals WHERE value_outcome_id = '$O1' AND kind = 'commitment'")" = "$BY" ] && ok "  ...the withdrawal records promised_measured_on $BY (D5)" || bad "  ...recorded: $(q "SELECT withdrawn_values FROM outcome_withdrawals WHERE value_outcome_id = '$O1'")"
[ "$(q "SELECT (promised_measured_at IS NULL) || '|' || (committed_at IS NULL) FROM value_outcomes WHERE id = '$O1'")" = "true|true" ] && ok "  ...and the outcome holds no commitment and no date" || bad "  ...outcome after withdrawal"
BY2="$(d 200)"
expect POST "/api/value-outcomes/$O1/commit" "$(CB "$(d -1)" "$BY2")" 201 "committed again, measure by $BY2"
[ "$(q "SELECT to_char(promised_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') FROM value_outcomes WHERE id = '$O1'")" = "$BY2" ] && ok "  ...the new date stands" || bad "  ...new date"
# Curia's pre-§26 commitment is in a retired engagement (frozen: no route withdraws it), so D5's null case is proven on
# the database, rolled back: its withdrawal records promised_measured_on null, and one with no such key is refused.
CWV="$(q "SELECT jsonb_build_object('target_value', trim_scale(target_value)::text) FROM value_outcomes WHERE id = '$CURIA_O'")"
[ "$(sqlaccepted "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$CURIA_O', 'commitment', '$CWV'::jsonb || '{\"promised_measured_on\":null}', 'Verification: a pre-§26 commitment.', '$S')")" = "ACCEPTED" ] \
  && ok "a pre-§26 commitment's withdrawal records promised_measured_on null, and is admitted (D5)" || bad "pre-§26 withdrawal with null: refused"
sqlrefused "  ...one that leaves the key out" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$CURIA_O', 'commitment', '$CWV', 'Verification: no key.', '$S')" "the values recorded are not the outcome's"
cover "$LOG" 'the row holds the promised date' "HB-0014's payload" 'the sealed case carries' 'no measure-by date (D1)' 'three years to the day' 'a date changed while the commitment stands' 'a withdrawal recording another date' 'the withdrawal records promised_measured_on'

step "9. P4: late, Anywhere on Earth (§28 D5): the promised day has ended everywhere"
expect POST "/api/value-outcomes/$O3/commit" "$(CB "$(d -60)" "$(d 0)")" 201 "${O3:0:8} committed, measure by today"
expect POST "/api/value-outcomes/$O4/commit" "$(CB "$(d -60)" "$(d -2)")" 201 "${O4:0:8} committed, measure by two days ago (its day has ended everywhere at any hour)"
expect POST "/api/value-outcomes/$O5/commit" "$(CB "$(d -60)" "$(d -2)")" 201 "${O5:0:8} committed, measure by two days ago"
expect POST "/api/value-outcomes/$O5/evidence" "$(J kind system_export provenance 'Fixture source for: P26 actual (not a source)' summary 'P26 TRIR extract (fixture)' supports actual confidence medium source_verified false ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.')" 201 "  ...a system export linked to ${O5:0:8} as its actual"
expect POST "/api/value-outcomes/$O5/measure" "$(J actual_value 1.1 actual_measured_at "$(d 0)T09:00:00Z")" 200 "  ...and ${O5:0:8} measured today"
LATE_SQL() { q "SELECT o.id FROM value_outcomes o WHERE o.institution_id = '$INST' AND o.promised_measured_at IS NOT NULL AND now() >= (((o.promised_measured_at AT TIME ZONE 'UTC')::date + 1) + time '12:00') AT TIME ZONE 'UTC' AND o.actual_measured_at IS NULL ORDER BY o.id"; }
[ "$(LATE_SQL)" = "$O4" ] && ok "SQL: one late outcome, ${O4:0:8}" || bad "SQL late: $(LATE_SQL)"
book_late() { req GET /api/book; node -e "const b=require('$W/r.json');const a=b.accounts.find(x=>x.institution_id==='$INST');console.log(a.outcomes.list.filter(o=>o.late).map(o=>o.id).sort().join(' ')+'|'+b.book.outcomes.late)"; }
[ "$(book_late)" = "$O4|1" ] && ok "GET /api/book: ${O4:0:8} late; ${O3:0:8} (promised today) and ${O5:0:8} (measured) are not" || bad "GET /api/book late: $(book_late)"
walk book p4 "$W/p4.log" LATE=1 ROW_NAME="$ACCT" ROW_WANT="1 late: the promised day, "; tally "$W/p4.log"
cover "$W/p4.log" 'the late tile states the rule, Anywhere on Earth' 'and under the table' 'band: "1 late outcome'

step "10. Deliberate breaks, each against the clean pass"
# B1 — the guard's date rule removed: a commit with no date lands in the database.
fnbreak lvrf_outcome_spine_guard "    IF NEW.promised_measured_at IS NULL THEN" "    IF false THEN"
[ "$(sqlaccepted "$COMMIT_SQL WHERE id = '$O2'")" = "ACCEPTED" ] && ok "B1: the date rule removed → a commit with no date lands (caught by P2's clean refusal)" || bad "B1: not landed"
reharden
sqlrefused "  ...with it back" "$COMMIT_SQL WHERE id = '$O2'" "a commitment states the date its outcome will be measured by"
# B2 — the date made changeable.
fnbreak lvrf_outcome_spine_guard "     AND NEW.promised_measured_at IS DISTINCT FROM OLD.promised_measured_at THEN" "     AND false THEN"
[ "$(sqlaccepted "UPDATE value_outcomes SET promised_measured_at = promised_measured_at + interval '1 day' WHERE id = '$O1'")" = "ACCEPTED" ] && ok "B2: the date made changeable → a change lands (caught by P2's clean refusal)" || bad "B2: not landed"
reharden
sqlrefused "  ...with it back" "UPDATE value_outcomes SET promised_measured_at = promised_measured_at + interval '1 day' WHERE id = '$O1'" "fixed at commit"
# B3 — the withdrawal not recording the date: the database refuses the route's withdrawal.
edit "$WDR" "                     promised_measured_on: o.promised_measured_on, value_stage: o.value_stage };" "                     value_stage: o.value_stage };"
restart_server
req POST "/api/value-outcomes/$O3/commitment/withdraw" "$(J reason 'Verification: B3, the date not recorded.')"
[ "$CODE" != "200" ] && [ "$(q "SELECT committed_at IS NOT NULL FROM value_outcomes WHERE id = '$O3'")" = "t" ] && ok "B3: the withdrawal without its date → refused ($CODE), the commitment stands" || bad "B3: not caught ($CODE)"
restore "$WDR"; restart_server
# B4 moved to verify_local_date (§28 D5): "late" is proven there at fixed instants, deterministically.
# B5 — the date left out of the confirmation.
edit "$SPINE" "on {v.on}; measured by {v.by}; attribution:" "on {v.on}; attribution:"
sleep 4
WANT6="Commit ${O6:0:8}, P26 TRIR confirm-break: target 1.2 incidents per 200,000 hours., by P26 owner (invented), on $ON; measured by $BY; attribution: contribution only (no share claimed); class: capability and performance. The method, the class and the measure-by date are fixed while the commitment stands."
walk form b5 "$W/b5.log" INST="$INST" OUT="$O6" COMMITTER='P26 owner (invented)' TARGET=1.2 ON="$ON" BY="$BY" PAST3="$PAST3" NOTE='Verification: B5.' WANT="$WANT6"
grep -q '^FAIL  b5: form: the confirmation names the measure-by date' "$W/b5.log" && ok "B5: the date left out of the confirmation → caught" || bad "B5: not caught: $(grep -m2 FAIL "$W/b5.log")"
restore "$SPINE"
walk form b5c "$W/b5c.log" INST="$INST" OUT="$O6" COMMITTER='P26 owner (invented)' TARGET=1.2 ON="$ON" BY="$BY" PAST3="$PAST3" NOTE='Verification: B5 clean.' WANT="$WANT6"
grep -q '^PASS  b5c: form: the confirmation names the measure-by date' "$W/b5c.log" && ok "  ...with it back, the confirmation names it" || bad "  ...after restore: $(grep -m2 FAIL "$W/b5c.log")"
[ "$(q "SELECT committed_at IS NULL FROM value_outcomes WHERE id = '$O6'")" = "t" ] && ok "  ...B5's walks went Back: nothing recorded" || bad "B5 recorded a commit"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
cover "$LOG" 'B1: the date rule removed' 'B2: the date made changeable' 'B3: the withdrawal without its date' 'B5: the date left out'
echo "  screenshots: $OUT"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
