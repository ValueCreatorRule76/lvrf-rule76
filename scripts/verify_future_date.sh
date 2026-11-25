#!/usr/bin/env bash
#
# §31 (Brad's rulings, 24 Nov 2026: D1-D5 as recommended) — no walk date in the future: a Committed on, Measured on or
# Verified on date whose UTC date is later than today's UTC date plus one day is refused by the route, by the database
# and, at the person's own today, by the form.
#
#   ./scripts/verify_future_date.sh [out_dir]
#
#   1. server/lib/walkDate.ts at fixed instants: today + 1 admitted (the Auckland morning), today + 2 refused.
#   2. A clone of the prod copy, migrated and hardened: 227 triggers; drift none; runs and e3fb0061 byte-identical.
#   3. The routes: commit, measure and verify, each dated today + 2, refused (422) in D3's sentence with nothing written
#      and no database refusal recorded (the route answered); each dated today + 1 admitted.
#   4. The database, as lvrf_app, rolled back: each of the three at today + 2 refused (D4's constraints), today + 1
#      accepted; an INSERT carrying a future commit date refused; a row already holding a later date, saved again for
#      another column, not re-read (D2).
#   5. The forms, the clock pinned: each date's latest day is the local today in New York and in Auckland; the next day
#      typed in is refused in words and the button stays disabled.
#   Breaks, each caught by its own section: F1 the route's commit check (the database answers, its refusal recorded),
#   F2 the database's commit clause (today + 2 accepted), F3 the form's max (the picker offers the next day).

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

VERIFY_DB=lvrf_verifyfuture
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3431; VITE_PORT=5431; CDP_PORT=9541
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_future.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
SPINE=client/src/components/OutcomeSpine.tsx; WALKR=server/routes/outcomeWalk.ts
EDITED=("$SPINE" "$WALKR")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
by_port() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }
stop_port() { local p; p="$(by_port "$1")"; [ -n "$p" ] && kill $p 2>/dev/null || true; for _ in $(seq 1 20); do [ -z "$(by_port "$1")" ] && return 0; sleep 0.25; done; }
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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "229" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 229 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
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
  env VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT_DIR="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" TAG="$tag" "$@" node scripts/lib/local_date_walk.mjs "$s" > "$log" 2>&1 \
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
SC="The commit date can't be later than today."; SMS="The measurement date can't be later than today."; SV="The verification date can't be later than today."

step "1. The rule at fixed instants (server/lib/walkDate.ts)"
lt() { npx tsx -e "import('./server/lib/walkDate.ts').then(m=>console.log(m.laterThanToday(new Date('$1'), new Date('$2'))))" 2>&1 | tail -1; }
for c in "2026-11-25T12:00:00Z|2026-11-24T20:00:00Z|false|today + 1, at 20:00 UTC (09:00 on 25 Nov in Auckland)" "2026-11-25T23:59:00Z|2026-11-24T00:00:00Z|false|today + 1, late in its day" \
         "2026-11-26T00:00:00Z|2026-11-24T23:59:00Z|true|today + 2, at its first minute" "2026-11-24T12:00:00Z|2026-11-24T12:00:00Z|false|today"; do
  IFS='|' read -r w n want label <<< "$c"; [ "$(lt "$w" "$n")" = "$want" ] && ok "$label: later than today $want" || bad "$label: $(lt "$w" "$n"), wanted $want"
done

step "2. Clone the prod copy, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
CURIA_O="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE 'e3fb0061%'")"; ROW0="$(q "SELECT md5(to_jsonb(o)::text) FROM value_outcomes o WHERE id = '$CURIA_O'")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (no migration in §31)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "229" ] && ok "229 triggers (§31 adds none; §32 section 38: +2)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 55 migrations, newest 0054_s7a_figure_class" && ok "drift: none" || bad "drift: $DRIFT"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every run byte-identical after hardening" || bad "a run changed"
[ "$(q "SELECT md5(to_jsonb(o)::text) FROM value_outcomes o WHERE id = '$CURIA_O'")" = "$ROW0" ] && ok "Curia's e3fb0061 byte-identical after hardening (D2: never re-read)" || bad "e3fb0061 changed"

step "3. The routes (D3)"
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"; TS="$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server && ok "API up on $PORT" || { bad "server: $(tail -5 "$W/server.log")"; exit 1; }
d() { q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + ($1), 'YYYY-MM-DD')"; }
D0="$(d 0)"; D1="$(d 1)"; D2="$(d 2)"; DM="$(d -30)"
OWNER_NAME='K31 owner (invented)'
expect POST /api/account-inputs "$(J institution "$(J name "Linden Works (§31 fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for §31.')" persons "[$(J full_name "$OWNER_NAME" email "owner.$TS@k31.example" title Owner)]")" 201 "a fixture account"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
make_customer_side "$INST" "$OWNER"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K31 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
outcome() {  # NAME -> stdout: outcome id
  req POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name "K31 engagement $1" engagement_owner_person_id "$OWNER" capability_name 'K31 capability' metric "$(J name "K31 TRIR $1" unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)"
  [ "$CODE" = "201" ] && rj b.value_outcome_id || { echo "ERR $CODE $(said)"; return 1; }
}
O_R="$(outcome route)"; O_DB="$(outcome db)"; O_DB2="$(outcome db2)"; O_FC="$(outcome form-commit)"; O_FM="$(outcome form-measure)"; O_FV="$(outcome form-verify)"
for o in "$O_R" "$O_DB" "$O_DB2" "$O_FC" "$O_FM" "$O_FV"; do case "$o" in ERR*) bad "an outcome: $o"; exit 1 ;; esac; done
ok "six fixture outcomes"
CB() { J target_value 1.0 committed_by_person_id "$OWNER" committed_at "${1}T12:00:00Z" promised_measured_on "$2" commitment_note 'Verification: committed (§31 fixture).' attribution_method contribution_only measure_class capability_performance; }
EVA() { J kind system_export provenance 'Fixture source for: K31 actual (not a source)' summary 'K31 TRIR extract (fixture)' supports actual confidence medium source_verified true ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.'; }
VB() { J verified_by_person_id "$OWNER" verified_at "${1}T13:00:00Z" attestation_note 'Verification: checked against the fixture system of record.'; }
state() { q "SELECT coalesce(to_char(committed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), '-') || '|' || coalesce(to_char(actual_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), '-') || '|' || coalesce(to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), '-') FROM value_outcomes WHERE id = '$1'"; }
DBR() { q "SELECT count(*) FROM refusals WHERE message LIKE 'LVRF: value_outcomes: The $1 date can''t be later than today.%'"; }
N0="$(DBR commit)"; A0="$(q "SELECT count(*) FROM governance_acts")"
expect POST "/api/value-outcomes/$O_R/commit" "$(CB "$D2" "$(d 200)")" 422 "a commitment dated $D2 (today + 2)" "$SC"
[ "$(state "$O_R")" = "-|-|-" ] && [ "$(q "SELECT count(*) FROM governance_acts")" = "$A0" ] && [ "$(DBR commit)" = "$N0" ] && ok "  ...nothing written, and the route answered (no database refusal recorded)" || bad "  ...state $(state "$O_R"), acts, refusals"
expect POST "/api/value-outcomes/$O_R/commit" "$(CB "$D1" "$(d 200)")" 201 "a commitment dated $D1 (today + 1, the Auckland morning)"
expect POST "/api/value-outcomes/$O_R/evidence" "$(EVA)" 201 "  ...its actual's evidence"
expect POST "/api/value-outcomes/$O_R/measure" "$(J actual_value 1.1 actual_measured_at "${D2}T12:00:00Z")" 422 "a measurement dated $D2" "$SMS"
expect POST "/api/value-outcomes/$O_R/measure" "$(J actual_value 1.1 actual_measured_at "${D1}T12:00:00Z")" 200 "a measurement dated $D1"
expect POST "/api/value-outcomes/$O_R/verify" "$(VB "$D2")" 422 "a verification dated $D2" "$SV"
expect POST "/api/value-outcomes/$O_R/verify" "$(VB "$D1")" 200 "a verification dated $D1"
[ "$(state "$O_R")" = "$D1|$D1|$D1" ] && ok "  ...committed, measured and verified on $D1: nothing later was written" || bad "  ...state: $(state "$O_R")"

step "4. The database, as lvrf_app (D4, D2)"
UC() { printf "UPDATE value_outcomes SET target_value = 1.0, committed_by_person_id = '%s', committed_at = '%sT12:00:00Z', attribution_method = 'contribution_only', measure_class = 'capability_performance', promised_measured_at = '%sT12:00:00Z', value_stage = 'commit' WHERE id = '%s'" "$OWNER" "$1" "$(d 200)" "$2"; }
sqlrefused "a commitment dated $D2" "$(UC "$D2" "$O_DB")" "$SC"
[ "$(sqlaccepted "$(UC "$D1" "$O_DB")")" = "ACCEPTED" ] && ok "  ...dated $D1, accepted" || bad "  ...$D1: $(sqlaccepted "$(UC "$D1" "$O_DB")")"
expect POST "/api/value-outcomes/$O_DB2/commit" "$(CB "$D0" "$(d 200)")" 201 "an outcome committed today, for the measurement and verification by SQL"
expect POST "/api/value-outcomes/$O_DB2/evidence" "$(EVA)" 201 "  ...its actual's evidence"
UM() { printf "UPDATE value_outcomes SET actual_value = 1.1, actual_measured_at = '%sT12:00:00Z', realization = 'measured', value_stage = 'measure' WHERE id = '%s'" "$1" "$O_DB2"; }
sqlrefused "a measurement dated $D2" "$(UM "$D2")" "$SMS"
[ "$(sqlaccepted "$(UM "$D1")")" = "ACCEPTED" ] && ok "  ...dated $D1, accepted" || bad "  ...$D1: $(sqlaccepted "$(UM "$D1")")"
expect POST "/api/value-outcomes/$O_DB2/measure" "$(J actual_value 1.1 actual_measured_at "${D0}T12:00:00Z")" 200 "  ...measured today, for the verification by SQL"
UV() { printf "UPDATE value_outcomes SET verified_by_person_id = '%s', verified_at = '%sT13:00:00Z', source_verified = true, realization = 'verified', value_stage = 'verify' WHERE id = '%s'" "$OWNER" "$1" "$O_DB2"; }
sqlrefused "a verification dated $D2" "$(UV "$D2")" "$SV"
[ "$(sqlaccepted "$(UV "$D1")")" = "ACCEPTED" ] && ok "  ...dated $D1, accepted" || bad "  ...$D1: $(sqlaccepted "$(UV "$D1")")"
sqlrefused "an INSERT carrying a commit date of $D2" "INSERT INTO value_outcomes SELECT (jsonb_populate_record(NULL::value_outcomes, to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'committed_at', '${D2}T12:00:00Z', 'engagement_id', (SELECT engagement_id FROM value_outcomes WHERE id = '$O_DB')))).* FROM value_outcomes o WHERE o.id = '$O_R'" "$SC"
# D2: a row already holding a later date (a fixture, by the superuser with triggers off) is not re-read by a later save.
q "BEGIN; SET LOCAL session_replication_role = replica; UPDATE value_outcomes SET committed_at = '$(d 5)T12:00:00Z' WHERE id = '$O_DB2'; COMMIT;" > /dev/null
[ "$(sqlaccepted "UPDATE value_outcomes SET confidence = 'low' WHERE id = '$O_DB2'")" = "ACCEPTED" ] && ok "a row holding a later commit date ($(d 5)), saved again for another column, is not re-read (D2)" || bad "re-read: $(sqlaccepted "UPDATE value_outcomes SET confidence = 'low' WHERE id = '$O_DB2'")"

step "5. The forms, the clock pinned (D5)"
for o in "$O_FM" "$O_FV"; do expect POST "/api/value-outcomes/$o/commit" "$(CB "$DM" "$(d 200)")" 201 "  ...${o:0:8} committed"; expect POST "/api/value-outcomes/$o/evidence" "$(EVA)" 201 "  ...its actual's evidence"; done
expect POST "/api/value-outcomes/$O_FV/measure" "$(J actual_value 1.1 actual_measured_at "${DM}T12:00:00Z")" 200 "  ...${O_FV:0:8} measured, to verify"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
NY=1795490880000   # 2026-11-24T03:28:00Z = 22:28 on 23 Nov in New York
AK=1795550400000   # 2026-11-24T20:00:00Z = 09:00 on 25 Nov in Auckland
FE=(INST="$INST" OC="$O_FC" OM="$O_FM" OV="$O_FV")
walk future ny "$W/ny.log" TZ_ID=America/New_York EPOCH="$NY" WANT_CLOCK="2026-11-23 22:28 | UTC 2026-11-24T03:28" WANT_DAY=2026-11-23 NEXT_DAY=2026-11-24 "${FE[@]}"; tally "$W/ny.log"
walk future ak "$W/ak.log" TZ_ID=Pacific/Auckland EPOCH="$AK" WANT_CLOCK="2026-11-25 09:00 | UTC 2026-11-24T20:00" WANT_DAY=2026-11-25 NEXT_DAY=2026-11-26 "${FE[@]}"; tally "$W/ak.log"

step "6. Breaks, each caught by its own section"
# F1 — the route's commit check removed: the database answers, and its refusal is recorded.
edit "$WALKR" "      if (laterThanToday(committedAt)) {" "      if (false && laterThanToday(committedAt)) {"
restart_server
O_F1="$(outcome f1)"; N0="$(DBR commit)"
req POST "/api/value-outcomes/$O_F1/commit" "$(CB "$D2" "$(d 200)")"
[ "$CODE" = "422" ] && [ "$(DBR commit)" -gt "$N0" ] && [ "$(state "$O_F1")" = "-|-|-" ] && ok "F1: the route's commit check removed → caught: the database refused it, its refusal recorded, nothing written ($(said))" || bad "F1: not caught: $CODE $(said)"
restore "$WALKR"; restart_server
# F2 — the database's commit clause removed: today + 2 accepted by SQL.
fnbreak lvrf_block_simulated_attestor "       AND (NEW.committed_at AT TIME ZONE 'UTC')::date > (now() AT TIME ZONE 'UTC')::date + 1 THEN" "       AND false THEN"
[ "$(sqlaccepted "$(UC "$D2" "$O_F1")")" = "ACCEPTED" ] && ok "F2: the database's commit clause removed → caught: a commitment dated $D2 is accepted" || bad "F2: $(sqlaccepted "$(UC "$D2" "$O_F1")")"
reharden
sqlrefused "  ...with it back" "$(UC "$D2" "$O_F1")" "$SC"
# F3 — the form's max removed from Committed on.
edit "$SPINE" 'value={v.on} max={today()} onChange={(e) => setV({ ...v, on: e.target.value })} data-testid="commit-on" />' 'value={v.on} onChange={(e) => setV({ ...v, on: e.target.value })} data-testid="commit-on" />'
sleep 4
walk future f3 "$W/f3.log" TZ_ID=America/New_York EPOCH="$NY" WANT_CLOCK="2026-11-23 22:28 | UTC 2026-11-24T03:28" WANT_DAY=2026-11-23 NEXT_DAY=2026-11-24 "${FE[@]}"
grep -q '^FAIL  f3: future: "Committed on" offers no day after' "$W/f3.log" && ok "F3: the form's max removed → caught: Committed on offers the next day" || bad "F3: not caught: $(grep -m3 -E 'PASS|FAIL' "$W/f3.log")"
restore "$SPINE"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
node scripts/check_plain_words.mjs > "$W/plain.log" 2>&1 && ok "plain words: $(tail -1 "$W/plain.log")" || bad "plain words: $(grep -m3 HIT "$W/plain.log")"
cover "$LOG" 'today + 1, at 20:00 UTC' 'today + 2, at its first minute' "a commitment dated $D2 (today + 2)" "a measurement dated $D2" "a verification dated $D2" 'an INSERT carrying a commit date' 'is not re-read (D2)' \
  'ny: future: "Committed on" offers no day after' 'ny: future: "Measured on"' 'ny: future: "Verified on"' 'ak: future: "Committed on" offers no day after 2026-11-25' 'is refused by the form in words' 'F1: ' 'F2: ' 'F3: '

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
