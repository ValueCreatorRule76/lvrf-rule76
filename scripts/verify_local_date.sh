#!/usr/bin/env bash
#
# §28 (Brad's rulings, 24 Nov 2026, D4 and D5 changed) — the walk dates in the person's own time zone, and "late"
# Anywhere on Earth.
#
#   ./scripts/verify_local_date.sh [out_dir]
#
#   1. "Late" (server/lib/late.ts, the one definition GET /api/book reads), at fixed instants, for an outcome promised
#      for 23 Nov 2026: not late at 19:00 New York on 23 Nov (00:00 UTC 24 Nov), nor at 06:59 New York on 24 Nov
#      (11:59 UTC), and late at 07:00 New York on 24 Nov (12:00 UTC); never late once measured, or with no date.
#      Break L1: late back to §26's UTC-date comparison, caught at 19:00 New York.
#   2. In the browser, its time zone set and its clock pinned, on a clone of the prod copy:
#      New York, 22:28 on 23 Nov 2026: Committed on, Measured on and Verified on each default to 2026-11-23; measure-by
#        2026-11-23 is refused by the form in words, by the route (422) and by the database; 2026-11-24 is admitted,
#        and committed_at is stored at 2026-11-23 12:00 UTC.
#      Auckland, 09:00 on 25 Nov 2026 (20:00 UTC 24 Nov): the default is 2026-11-25.
#      Break L2: the default back to the UTC date, caught in New York's evening.

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

VERIFY_DB=lvrf_verifylocal
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3401; VITE_PORT=5401; CDP_PORT=9511
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_local.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
SPINE=client/src/components/OutcomeSpine.tsx; LATE=server/lib/late.ts
EDITED=("$SPINE" "$LATE")
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

step "1. Late, Anywhere on Earth, at fixed instants (server/lib/late.ts)"
grep -q "isLate(o.promised_on, o.measured_on, now)" server/routes/book.ts && ! grep -q "AS late" server/routes/book.ts && ok "GET /api/book reads late from isLate only: no second definition in its SQL" || bad "book.ts: late not from isLate"
late_at() { npx tsx -e "import('./server/lib/late.ts').then(m=>console.log(m.isLate($1, $2, new Date('$3'))))" 2>&1 | tail -1; }
instants() {  # -> one line per case
  echo "19:00 New York 23 Nov|$(late_at "'2026-11-23'" null 2026-11-24T00:00:00Z)|false"
  echo "06:59 New York 24 Nov|$(late_at "'2026-11-23'" null 2026-11-24T11:59:00Z)|false"
  echo "07:00 New York 24 Nov|$(late_at "'2026-11-23'" null 2026-11-24T12:00:00Z)|true"
  echo "measured, a week later|$(late_at "'2026-11-23'" "'2026-11-22'" 2026-12-01T12:00:00Z)|false"
  echo "no promised date|$(late_at null null 2026-12-01T12:00:00Z)|false"
}
instants > "$W/inst.txt"
while IFS='|' read -r label got want; do [ "$got" = "$want" ] && ok "promised for 23 Nov, at $label: late $got" || bad "at $label: late $got, expected $want"; done < "$W/inst.txt"
# L1 — late back to §26's UTC-date comparison.
edit "$LATE" "  return now.getTime() >= promisedDayEndsEverywhere(promisedOn);" "  return now.toISOString().slice(0, 10) > promisedOn;"
[ "$(late_at "'2026-11-23'" null 2026-11-24T00:00:00Z)" = "true" ] && ok "L1: late by UTC date → 19:00 New York on the promised day reads late (caught)" || bad "L1: not caught"
restore "$LATE"
[ "$(late_at "'2026-11-23'" null 2026-11-24T00:00:00Z)" = "false" ] && ok "  ...with it back, not late" || bad "  ...after restore"

step "2. Clone the prod copy, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (no migration in §26)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "229" ] && ok "229 triggers (§26 adds none; §32 section 38: +2)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 55 migrations, newest 0054_s7a_figure_class" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
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
ACCT="Kestrel Mills (§28 fixture, invented)"
expect POST /api/account-inputs "$(J institution "$(J name "$ACCT" industry_slug manufacturing classification_note 'Verification: classified for §28.')" persons "[$(J full_name 'K28 owner (invented)' email "owner.$TS@k28.example" title Owner)]")" 201 "a fixture customer account, with a customer-side owner"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
make_customer_side "$INST" "$OWNER"  # §29: only a customer-side person commits
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K28 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
outcome() {  # NAME -> stdout: outcome id
  req POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name "K28 engagement $1" engagement_owner_person_id "$OWNER" capability_name 'K28 capability' metric "$(J name "K28 TRIR $1" unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)"
  [ "$CODE" = "201" ] && rj b.value_outcome_id || { echo "ERR $CODE $(said)"; return 1; }
}

O_C="$(outcome commit)"; O_M="$(outcome measure)"; O_V="$(outcome verify)"
for o in "$O_C" "$O_M" "$O_V"; do case "$o" in ERR*) bad "an outcome: $o"; exit 1 ;; esac; done
ok "three fixture outcomes: to commit, to measure, to verify"
CB() { J target_value 1.0 committed_by_person_id "$OWNER" committed_at "${1}T12:00:00Z" promised_measured_on "$2" commitment_note 'Verification: committed (§28 fixture).' attribution_method contribution_only measure_class capability_performance; }
EVA() { J kind system_export provenance 'Fixture source for: K28 actual (not a source)' summary 'K28 TRIR extract (fixture)' supports actual confidence medium source_verified false ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.'; }
for o in "$O_M" "$O_V"; do
  expect POST "/api/value-outcomes/$o/commit" "$(CB 2026-10-01 2027-04-01)" 201 "  ...${o:0:8} committed"
  expect POST "/api/value-outcomes/$o/evidence" "$(EVA)" 201 "  ...${o:0:8}: its actual's evidence linked"
done
expect POST "/api/value-outcomes/$O_V/measure" "$(J actual_value 1.1 actual_measured_at 2026-11-01T12:00:00Z)" 200 "  ...${O_V:0:8} measured, to be verified"
NY=1795490880000   # 2026-11-24T03:28:00Z = 22:28 on 23 Nov in New York (EST)
AK=1795550400000   # 2026-11-24T20:00:00Z = 09:00 on 25 Nov in Auckland (NZDT)
[ "$(node -e "console.log(new Date($NY).toISOString(), new Date($AK).toISOString())")" = "2026-11-24T03:28:00.000Z 2026-11-24T20:00:00.000Z" ] && ok "the pinned instants: 2026-11-24 03:28 and 20:00 UTC" || bad "instants"

step "3. New York, 22:28 on 23 Nov 2026"
walk defaults,commit ny "$W/ny.log" TZ_ID=America/New_York EPOCH="$NY" WANT_CLOCK="2026-11-23 22:28 | UTC 2026-11-24T03:28" WANT_DAY=2026-11-23 BY=2026-11-24 INST="$INST" OC="$O_C" OM="$O_M" OV="$O_V" COMMITTER='K28 owner (invented)'; tally "$W/ny.log"
[ "$(q "SELECT to_char(committed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || '|' || to_char(promised_measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') FROM value_outcomes WHERE id = '$O_C'")" = "2026-11-23 12:00|2026-11-24" ] \
  && ok "stored: committed_at 2026-11-23 12:00 UTC, the day the person picked; promised 2026-11-24" || bad "stored: $(q "SELECT committed_at, promised_measured_at FROM value_outcomes WHERE id = '$O_C'")"
expect POST "/api/value-outcomes/$O_M/commitment/withdraw" "$(J reason 'Verification: withdrawn to commit again (§28).')" 200 "  ...${O_M:0:8}'s commitment withdrawn, to try the same evening by route"
expect POST "/api/value-outcomes/$O_M/commit" "$(CB 2026-11-23 2026-11-23)" 422 "the route: committed on 2026-11-23, measure by 2026-11-23" "after the commit date (2026-11-23)"
sqlrefused "the database: the same, as lvrf_app" "UPDATE value_outcomes SET target_value = 1.0, committed_by_person_id = '$OWNER', committed_at = '2026-11-23T12:00:00Z', attribution_method = 'contribution_only', measure_class = 'capability_performance', promised_measured_at = '2026-11-23T12:00:00Z', value_stage = 'commit' WHERE id = '$O_M'" "after the commit date and no more than three years after it"
expect POST "/api/value-outcomes/$O_M/commit" "$(CB 2026-11-23 2026-11-24)" 201 "the route: measure by 2026-11-24 admitted"

step "4. Auckland, 09:00 on 25 Nov 2026"
# A fresh outcome for Committed on; Measured on and Verified on on the other two.
O_A="$(outcome auckland)"
walk defaults ak2 "$W/ak2.log" TZ_ID=Pacific/Auckland EPOCH="$AK" WANT_CLOCK="2026-11-25 09:00 | UTC 2026-11-24T20:00" WANT_DAY=2026-11-25 INST="$INST" OC="$O_A" OM="$O_M" OV="$O_V"; tally "$W/ak2.log"

step "5. Break L2: the default back to the UTC date"
edit "$SPINE" "const today = () => localToday();" "const today = () => new Date().toISOString().slice(0, 10);"
sleep 4
walk defaults l2 "$W/l2.log" TZ_ID=America/New_York EPOCH="$NY" WANT_CLOCK="2026-11-23 22:28 | UTC 2026-11-24T03:28" WANT_DAY=2026-11-23 INST="$INST" OC="$O_A" OM="$O_M" OV="$O_V"
grep -q '^FAIL  l2: defaults: "Committed on" defaults to 2026-11-23' "$W/l2.log" && ok "L2: the UTC default → caught in New York's evening (it read 2026-11-24)" || bad "L2: not caught: $(grep -m2 -E 'PASS|FAIL' "$W/l2.log")"
restore "$SPINE"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
cover "$LOG" 'at 19:00 New York 23 Nov' 'at 06:59 New York 24 Nov' 'at 07:00 New York 24 Nov' 'L1: late by UTC date' 'ny: defaults: "Committed on" defaults to 2026-11-23' 'ny: defaults: "Measured on"' 'ny: defaults: "Verified on"' 'refused by the form in words' 'stored: committed_at 2026-11-23 12:00' 'ak2: defaults: "Committed on" defaults to 2026-11-25' 'L2: the UTC default'

echo "  screenshots: $OUT"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
