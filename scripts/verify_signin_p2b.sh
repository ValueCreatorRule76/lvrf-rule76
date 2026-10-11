#!/usr/bin/env bash
#
# Sign-in P2b — the X-Actor-Person-Id header is off unless
# LVRF_ALLOW_ACTOR_HEADER=1 outside production; production with the flag
# refuses to start. Local verification, dev Mac only.
#
#   ./scripts/verify_signin_p2b.sh
#
# Clone `lvrf_verifyp2b` (createdb -T lvrf -O lvrf_app), migrated to the
# latest and hardened, dropped on exit. Every address is a placeholder.
# Stop `npm run dev` first.
#
# The shell's environment wins over .env (process.loadEnvFile does not
# overwrite a variable that is already set), so every server start below
# names LVRF_ALLOW_ACTOR_HEADER and NODE_ENV explicitly — whatever the
# local .env says.

set -euo pipefail
cd "$(dirname "$0")/.."
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyp2b
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3088
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
JAR=/tmp/lvrf_p2b_jar.txt
LOG=/tmp/lvrf_p2b_server.log
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() { stop_server; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -f "$JAR" /tmp/lvrf_p2b_*.json "$LOG"; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }

# start_server [-u NAME] [ENV=VALUE ...] — LVRF_PUBLIC_ORIGIN unset; the
# caller names NODE_ENV and LVRF_ALLOW_ACTOR_HEADER. The caller's args go
# FIRST: env stops reading options at its first NAME=VALUE.
start_server() {
  stop_server
  env -u LVRF_PUBLIC_ORIGIN "$@" DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$LOG" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  return 1
}
# must_refuse LABEL EXPECTED_LOG_TEXT ENV=VALUE ... — the server must exit
# non-zero, for the stated reason, and never listen. Started in the
# background and given 20 seconds: a server that wrongly STARTS never exits,
# and must fail this check rather than hang the script (found by the Gate A
# mutation that removed the startup guard).
must_refuse() {
  local label="$1" want="$2" pid rc=""; shift 2
  stop_server
  env -u LVRF_PUBLIC_ORIGIN "$@" DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$LOG" 2>&1 &
  pid=$!
  for _ in $(seq 1 40); do
    if ! kill -0 "$pid" 2>/dev/null; then wait "$pid" && rc=0 || rc=$?; break; fi
    sleep 0.5
  done
  if [ -z "$rc" ]; then
    bad "$label: the server started (still running after 20s)"
    curl -s -o /dev/null "$BASE/api/health" && bad "  ...and it is listening on $PORT" || true
    kill "$pid" 2>/dev/null || true; sleep 1
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
    return
  fi
  if [ "$rc" = "0" ]; then
    bad "$label: the server exited 0"
  elif grep -q "$want" "$LOG"; then
    ok "$label: refused to start — $(grep -o "$want[^.]*" "$LOG" | head -1)"
  else
    bad "$label: exited, but not for that reason: $(tail -2 "$LOG")"
  fi
  curl -s -o /dev/null "$BASE/api/health" && bad "  ...something is listening on $PORT" || ok "  ...nothing listening on $PORT"
}
code() {  # METHOD PATH [curl args...] -> status; body in /tmp/lvrf_p2b_r.json
  local m="$1" p="$2"; shift 2
  curl -s -o /tmp/lvrf_p2b_r.json -w '%{http_code}' -X "$m" "$@" "$BASE$p"
}
msg() { node -e 'try{console.log(require("/tmp/lvrf_p2b_r.json").message??"")}catch{console.log("")}'; }
rj()  { node -e "console.log(require('/tmp/lvrf_p2b_r.json')$1)"; }
JSON=(-H 'content-type: application/json')

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone, migrate to latest, harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$T triggers (no migration in P2b)" || bad "triggers $T (expected $EXPECT_TRIGGERS)"

step "3. Fixtures"
STAFF="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
STAFF_EMAIL="$(q "SELECT email FROM persons WHERE id = '$STAFF'")"
STAFF2="$(q "INSERT INTO persons (tenant_id, full_name, email) SELECT tenant_id, 'Second Staff (verification)', 'second.staff.$(date +%s)@lvrf.example' FROM persons WHERE id = '$STAFF' RETURNING id" | head -1)"
IND="$(q "SELECT i.id FROM industries i JOIN persons p ON p.id = '$STAFF' AND p.tenant_id = i.tenant_id ORDER BY i.slug LIMIT 1")"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$STAFF', '$HASH', 'verify')" > /dev/null
# Band A deploy B: sign-in needs a current access grant. Name the staff person the
# tenant's steward (if none) and grant them access — the steward's own
# grant, the bootstrap shape access_grants_steward_only allows.
q "UPDATE tenants SET steward_person_id = '$STAFF' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$STAFF') AND steward_person_id IS NULL" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT p.id, p.tenant_id, t.steward_person_id, 'Verification fixture grant' FROM persons p JOIN tenants t ON t.id = p.tenant_id WHERE p.id = '$STAFF'" > /dev/null
[ -n "$STAFF" ] && [ -n "$STAFF2" ] && [ -n "$IND" ] && ok "staff with a credential, a second staff person, an industry" || bad "fixtures"
X="/api/industries/$IND/exclusions"
N=0; excl() { N=$((N + 1)); printf '{"name":"P2b verification %s %s","reason":"Verification: P2b header and startup-guard checks."}' "$N" "$(date +%s%N)"; }
count_excl() { q "SELECT count(*) FROM industry_measure_exclusions"; }
audit_actor() {  # EXCLUSION_ID -> actor_person_id of its insert audit row
  for _ in $(seq 1 50); do
    local a; a="$(q "SELECT actor_person_id FROM audit_log WHERE table_name = 'industry_measure_exclusions' AND record_id = '$1' AND operation = 'insert'")"
    [ -n "$a" ] && { echo "$a"; return; }; sleep 0.1
  done
}
# "Flag unset". If the local .env sets the flag, unsetting it in the shell
# would let .env's value through, so 0 stands in — and the script says so.
if grep -q '^LVRF_ALLOW_ACTOR_HEADER=' .env; then
  echo "NOTE  .env sets LVRF_ALLOW_ACTOR_HEADER; the 'unset' steps run with 0 instead"
  FLAG_UNSET=(LVRF_ALLOW_ACTOR_HEADER=0)
else
  FLAG_UNSET=(-u LVRF_ALLOW_ACTOR_HEADER)
fi
login() { code POST /api/auth/login "${JSON[@]}" -c "$JAR" -d "{\"email\":\"$STAFF_EMAIL\",\"password\":\"$PW\"}"; }

# The header is refused (no session) and the session still works. Run
# against every configuration in which the header must be off.
header_refused() {  # LABEL
  local C B
  C="$(code GET /api/cohort -H "x-actor-person-id: $STAFF")"
  [ "$C" = "401" ] && [ "$(msg)" = "Sign in to continue." ] && ok "$1: header naming current vendor staff, no session, GET -> 401" || bad "$1: header GET -> $C $(msg)"
  B="$(count_excl)"
  C="$(code POST "$X" "${JSON[@]}" -H "x-actor-person-id: $STAFF" -d "$(excl)")"
  [ "$C" = "401" ] && ok "$1: header write -> 401" || bad "$1: header write -> $C $(msg)"
  [ "$(count_excl)" = "$B" ] && ok "$1:   ...and nothing was written" || bad "$1: a header write landed"
  [ "$(login)" = "200" ] && ok "$1: sign-in -> 200" || bad "$1: login -> $(msg)"
  C="$(code POST "$X" "${JSON[@]}" -b "$JAR" -H "x-actor-person-id: $STAFF2" -d "$(excl)")"
  [ "$C" = "201" ] && [ "$(audit_actor "$(rj .exclusion_id)")" = "$STAFF" ] && ok "$1: session write -> 201, audited as the signed-in person (a header naming someone else is ignored)" || bad "$1: session write -> $C, actor $(audit_actor "$(rj .exclusion_id)")"
}

step "4. Development, flag unset: the header is off"
start_server "${FLAG_UNSET[@]}" NODE_ENV=development && ok "server up" || { bad "server did not start"; cat "$LOG"; exit 1; }
[ "$(code GET /api/health)" = "200" ] && [ "$(rj .actor_header)" = "off" ] && ok "health actor_header off" || bad "health actor_header: $(rj .actor_header)"
grep -q 'actor header: off' "$LOG" && ok "startup log: actor header: off" || bad "startup log: $(tail -1 "$LOG")"
header_refused "dev, unset"

step "5. Development, LVRF_ALLOW_ACTOR_HEADER=0: off"
start_server NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=0 && ok "server up" || bad "server did not start"
code GET /api/health > /dev/null; [ "$(rj .actor_header)" = "off" ] && ok "health actor_header off" || bad "health actor_header: $(rj .actor_header)"
header_refused "dev, =0"

step "6. Development, LVRF_ALLOW_ACTOR_HEADER=1: on (the verify scripts' mode)"
start_server NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 && ok "server up" || bad "server did not start"
code GET /api/health > /dev/null; [ "$(rj .actor_header)" = "on" ] && ok "health actor_header on" || bad "health actor_header: $(rj .actor_header)"
grep -q 'LVRF_ALLOW_ACTOR_HEADER=1 — the X-Actor-Person-Id header is accepted' "$LOG" && ok "startup log warns that the header is on" || bad "no startup warning"
C="$(code GET /api/cohort -H "x-actor-person-id: $STAFF")"; [ "$C" = "200" ] && ok "header, vendor staff -> 200" || bad "header GET -> $C"
# The header's person must be the steward here: exclusions are the
# steward's act (Band A item 2). The point stands — the HEADER's person is
# the actor when there is no session.
C="$(code POST "$X" "${JSON[@]}" -H "x-actor-person-id: $STAFF" -d "$(excl)")"
[ "$C" = "201" ] && [ "$(audit_actor "$(rj .exclusion_id)")" = "$STAFF" ] && ok "header write -> 201, audited as the header's person" || bad "header write -> $C"
login > /dev/null
C="$(code POST "$X" "${JSON[@]}" -b "$JAR" -H "x-actor-person-id: $STAFF2" -d "$(excl)")"
[ "$C" = "201" ] && [ "$(audit_actor "$(rj .exclusion_id)")" = "$STAFF" ] && ok "cookie + header naming someone else: still the session" || bad "header overrode the session"

step "7. The startup guard: production with LVRF_ALLOW_ACTOR_HEADER=1"
must_refuse "NODE_ENV=production, flag 1" "LVRF_ALLOW_ACTOR_HEADER=1 is refused in production" NODE_ENV=production LVRF_ALLOW_ACTOR_HEADER=1

step "8. A malformed flag refuses to start, in any environment"
must_refuse "flag 'true'" 'LVRF_ALLOW_ACTOR_HEADER must be unset, 0 or 1 (got "true")' NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=true
must_refuse "production, flag 'yes'" 'LVRF_ALLOW_ACTOR_HEADER must be unset, 0 or 1 (got "yes")' NODE_ENV=production LVRF_ALLOW_ACTOR_HEADER=yes

step "9. Production, flag unset (as on the box): off; the session is the only actor"
start_server "${FLAG_UNSET[@]}" NODE_ENV=production && ok "server up" || bad "server did not start"
code GET /api/health > /dev/null; [ "$(rj .actor_header)" = "off" ] && ok "health actor_header off (lvrf-deploy.sh requires this)" || bad "health actor_header: $(rj .actor_header)"
header_refused "production"

step "10. Production, LVRF_ALLOW_ACTOR_HEADER=0: starts, off"
start_server NODE_ENV=production LVRF_ALLOW_ACTOR_HEADER=0 && ok "server up" || bad "server did not start"
code GET /api/health > /dev/null; [ "$(rj .actor_header)" = "off" ] && ok "health actor_header off" || bad "health actor_header: $(rj .actor_header)"
C="$(code GET /api/cohort -H "x-actor-person-id: $STAFF")"; [ "$C" = "401" ] && ok "header GET -> 401" || bad "header GET -> $C"
stop_server

step "11. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
