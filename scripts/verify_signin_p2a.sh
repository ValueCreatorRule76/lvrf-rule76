#!/usr/bin/env bash
#
# Sign-in P2a — the session becomes the actor; reads need sign-in; the
# cross-site write guard; loopback bind. Local verification, dev Mac only.
#
#   ./scripts/verify_signin_p2a.sh
#
# Clone `lvrf_verifyp2a` (createdb -T lvrf -O lvrf_app), migrated to the
# latest and hardened, dropped on exit. Every address is a placeholder.
# Stop `npm run dev` first.

set -euo pipefail
cd "$(dirname "$0")/.."
# The expected trigger total is read from db/hardening.sql's Verification
# block — the one place it is declared.
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyp2a
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3089
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
JAR=/tmp/lvrf_p2a_jar.txt
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() { stop_server; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -f "$JAR" /tmp/lvrf_p2a_*.json /tmp/lvrf_p2a_server.log; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }

# start_server [ENV=VALUE ...] — env is passed through `env`, so an unset
# LVRF_PUBLIC_ORIGIN / NODE_ENV stays unset unless named here.
start_server() {
  stop_server
  env -u LVRF_PUBLIC_ORIGIN -u NODE_ENV DATABASE_URL="$VERIFY_URL" PORT="$PORT" "$@" npx tsx server/index.ts > /tmp/lvrf_p2a_server.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  return 1
}
code() {  # METHOD PATH [curl args...] -> status; body in /tmp/lvrf_p2a_r.json
  local m="$1" p="$2"; shift 2
  curl -s -o /tmp/lvrf_p2a_r.json -w '%{http_code}' -X "$m" "$@" "$BASE$p"
}
msg() { node -e 'try{console.log(require("/tmp/lvrf_p2a_r.json").message??"")}catch{console.log("")}'; }
rj()  { node -e "console.log(require('/tmp/lvrf_p2a_r.json')$1)"; }
JSON=(-H 'content-type: application/json')

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone, migrate to latest, harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$T triggers (no migration in P2a)" || bad "triggers $T (expected $EXPECT_TRIGGERS)"

step "3. Fixtures"
STAFF="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
STAFF_EMAIL="$(q "SELECT email FROM persons WHERE id = '$STAFF'")"
STAFF2="$(q "INSERT INTO persons (tenant_id, full_name, email) SELECT tenant_id, 'Second Staff (verification)', 'second.staff.$(date +%s)@lvrf.example' FROM persons WHERE id = '$STAFF' RETURNING id" | head -1)"
CUSTOMER="$(q "SELECT id FROM persons WHERE tenant_id IS NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
SIMULATED="$(q "SELECT id FROM persons WHERE simulated = true AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
IND="$(q "SELECT i.id FROM industries i JOIN persons p ON p.id = '$STAFF' AND p.tenant_id = i.tenant_id ORDER BY i.slug LIMIT 1")"
RUN="$(q "SELECT id FROM value_runs WHERE deleted_at IS NULL ORDER BY walked_at DESC LIMIT 1")"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$STAFF', '$HASH', 'verify')" > /dev/null
[ -n "$STAFF2" ] && [ -n "$CUSTOMER" ] && [ -n "$SIMULATED" ] && [ -n "$IND" ] && [ -n "$RUN" ] && ok "staff with a credential, a second staff person, a customer-side and a simulated person, an industry, a run" || bad "fixtures"
X="/api/industries/$IND/exclusions"
N=0; excl() { N=$((N + 1)); printf '{"name":"P2a verification %s %s","reason":"Verification: P2a session and guard checks."}' "$N" "$(date +%s%N)"; }
audit_actor() {  # EXCLUSION_ID -> actor_person_id of its insert audit row
  for _ in $(seq 1 50); do
    local a; a="$(q "SELECT actor_person_id FROM audit_log WHERE table_name = 'industry_measure_exclusions' AND record_id = '$1' AND operation = 'insert'")"
    [ -n "$a" ] && { echo "$a"; return; }; sleep 0.1
  done
}

step "4. Server: loopback only, dev origin defaults"
start_server && ok "server up" || { bad "server did not start"; cat /tmp/lvrf_p2a_server.log; exit 1; }
# Every socket listening on the port, whoever owns it: exactly one, on
# 127.0.0.1 — not *, not ::.
LISTEN="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | awk 'NR>1{print $9}' | sort -u | tr '\n' ' ')"
case "$LISTEN" in "127.0.0.1:$PORT ") ok "listening on 127.0.0.1:$PORT only" ;; *) bad "listening on: $LISTEN" ;; esac
C="$(code GET /api/health)"; M="$(rj .origin_check)"
[ "$C" = "200" ] && [ "$M" = "dev-default" ] && ok "health 200, origin_check dev-default (LVRF_PUBLIC_ORIGIN unset, not production)" || bad "health $C origin_check $M"

step "5. Nothing without an actor"
C="$(code GET /api/cohort)"; [ "$C" = "401" ] && [ "$(msg)" = "Sign in to continue." ] && ok "GET /api/cohort, no actor -> 401" || bad "no-actor cohort -> $C $(msg)"
C="$(code GET "/api/runs/$RUN")"; [ "$C" = "401" ] && ok "GET /api/runs/:id, no actor -> 401 (the deploy smoke test's fail-closed check)" || bad "no-actor run -> $C"
BEFORE="$(q "SELECT count(*) FROM industry_measure_exclusions")"
C="$(code POST "$X" "${JSON[@]}" -d "$(excl)")"; [ "$C" = "401" ] && ok "POST, no actor -> 401" || bad "no-actor write -> $C"
[ "$(q "SELECT count(*) FROM industry_measure_exclusions")" = "$BEFORE" ] && ok "  ...and nothing was written" || bad "an unauthenticated write landed"

step "6. The header, still accepted in P2a — vendor staff only"
C="$(code GET /api/cohort -H "x-actor-person-id: $STAFF")"; [ "$C" = "200" ] && ok "header, vendor staff -> 200" || bad "header staff -> $C"
C="$(code GET /api/cohort -H "x-actor-person-id: $CUSTOMER")"; [ "$C" = "401" ] && ok "header, customer-side person -> 401 (customers do not act)" || bad "header customer -> $C"
C="$(code GET /api/cohort -H "x-actor-person-id: $SIMULATED")"; [ "$C" = "401" ] && ok "header, simulated person -> 401" || bad "header simulated -> $C"
C="$(code GET /api/cohort -H "x-actor-person-id: 00000000-0000-0000-0000-000000000000")"; [ "$C" = "401" ] && ok "header, unknown id -> 401" || bad "header unknown -> $C"
C="$(code POST "$X" "${JSON[@]}" -H "x-actor-person-id: $STAFF" -d "$(excl)")"; [ "$C" = "201" ] && ok "header write -> 201" || bad "header write -> $C $(msg)"
[ "$(audit_actor "$(rj .exclusion_id)")" = "$STAFF" ] && ok "  ...audited with the header's person" || bad "header write audit actor wrong"

step "7. The session is the actor"
C="$(code POST /api/auth/login "${JSON[@]}" -c "$JAR" -d "{\"email\":\"$STAFF_EMAIL\",\"password\":\"$PW\"}")"; [ "$C" = "200" ] && ok "signed in" || bad "login -> $C $(msg)"
C="$(code GET /api/cohort -b "$JAR")"; [ "$C" = "200" ] && ok "GET with the cookie only -> 200" || bad "cookie read -> $C"
C="$(code POST "$X" "${JSON[@]}" -b "$JAR" -d "$(excl)")"; [ "$C" = "201" ] && ok "write with the cookie only -> 201" || bad "cookie write -> $C $(msg)"
[ "$(audit_actor "$(rj .exclusion_id)")" = "$STAFF" ] && ok "  ...audit_log actor = the signed-in person" || bad "session write audit actor wrong"
[ "$(q "SELECT excluded_by_person_id FROM industry_measure_exclusions WHERE id = '$(rj .exclusion_id)'")" = "$STAFF" ] && ok "  ...and the domain column (excluded_by) = the signed-in person" || bad "excluded_by wrong"
C="$(code POST "$X" "${JSON[@]}" -b "$JAR" -H "x-actor-person-id: $STAFF2" -d "$(excl)")"; [ "$C" = "201" ] || bad "cookie + other header write -> $C"
[ "$(audit_actor "$(rj .exclusion_id)")" = "$STAFF" ] && ok "cookie + a header naming someone else: the SESSION is the actor, the header is ignored" || bad "header overrode the session"

step "8. The cross-site write guard"
BEFORE="$(q "SELECT count(*) FROM industry_measure_exclusions")"
C="$(code POST "$X" -b "$JAR" -H 'content-type: text/plain' -d "$(excl)")"; [ "$C" = "415" ] && ok "text/plain body -> 415" || bad "text/plain -> $C"
C="$(code POST "$X" -b "$JAR" -H 'content-type: application/x-www-form-urlencoded' -d 'name=x&reason=yyyyyyyyyyyy')"; [ "$C" = "415" ] && ok "form body -> 415" || bad "form -> $C"
C="$(code POST "$X" "${JSON[@]}" -b "$JAR" -H 'origin: https://evil.example' -d "$(excl)")"; [ "$C" = "403" ] && ok "foreign Origin -> 403  $(msg)" || bad "foreign origin -> $C"
C="$(code POST "$X" "${JSON[@]}" -b "$JAR" -H 'sec-fetch-site: cross-site' -d "$(excl)")"; [ "$C" = "403" ] && ok "Sec-Fetch-Site: cross-site -> 403" || bad "cross-site -> $C"
C="$(code POST /api/auth/login -H 'content-type: application/json' -H 'origin: https://evil.example' -d "{\"email\":\"$STAFF_EMAIL\",\"password\":\"$PW\"}")"; [ "$C" = "403" ] && ok "sign-in from a foreign Origin -> 403 (the guard covers /api/auth too)" || bad "foreign-origin login -> $C"
[ "$(q "SELECT count(*) FROM industry_measure_exclusions")" = "$BEFORE" ] && ok "  ...none of the refused writes landed" || bad "a refused write landed"
C="$(code POST "$X" "${JSON[@]}" -b "$JAR" -H 'origin: http://localhost:5173' -d "$(excl)")"; [ "$C" = "201" ] && ok "Origin http://localhost:5173 (dev default) -> 201" || bad "dev origin -> $C $(msg)"

step "9. Session lifetime"
TOKEN_HASH="$(printf '%s' "$(awk '$6=="lvrf_session"{print $7}' "$JAR")" | shasum -a 256 | cut -d' ' -f1)"
SEEN0="$(q "SELECT last_seen_at FROM sessions WHERE token_hash = '$TOKEN_HASH'")"
code GET /api/cohort -b "$JAR" > /dev/null; code GET /api/cohort -b "$JAR" > /dev/null
[ "$(q "SELECT last_seen_at FROM sessions WHERE token_hash = '$TOKEN_HASH'")" = "$SEEN0" ] && ok "requests within a minute do not rewrite the session (throttled refresh)" || bad "session rewritten on every request"
q "UPDATE sessions SET last_seen_at = now() - interval '2 minutes', expires_at = now() + interval '1 hour' WHERE token_hash = '$TOKEN_HASH'" > /dev/null
code GET /api/cohort -b "$JAR" > /dev/null
[ "$(q "SELECT (last_seen_at > now() - interval '30 seconds' AND expires_at > now() + interval '11 hours')::text FROM sessions WHERE token_hash = '$TOKEN_HASH'")" = "true" ] && ok "a stale session is refreshed and its idle expiry slides" || bad "stale session not refreshed"
q "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = '$TOKEN_HASH'" > /dev/null
C="$(code GET /api/cohort -b "$JAR")"; [ "$C" = "401" ] && ok "an expired session -> 401" || bad "expired session -> $C"
code POST /api/auth/login "${JSON[@]}" -c "$JAR" -d "{\"email\":\"$STAFF_EMAIL\",\"password\":\"$PW\"}" > /dev/null
C="$(code POST /api/auth/logout "${JSON[@]}" -b "$JAR" -c "$JAR" -d '{}')"; [ "$C" = "200" ] && ok "sign out -> 200" || bad "logout -> $C"
C="$(code GET /api/cohort -b "$JAR")"; [ "$C" = "401" ] && ok "after sign-out -> 401" || bad "after logout -> $C"

step "10. LVRF_PUBLIC_ORIGIN configured — both hosts Caddy serves"
start_server LVRF_PUBLIC_ORIGIN="https://lvrf-rule76.com,https://www.lvrf-rule76.com" && ok "server up" || bad "server did not start"
[ "$(code GET /api/health)" = "200" ] && [ "$(rj .origin_check)" = "configured" ] && ok "health origin_check configured" || bad "health: $(rj .origin_check)"
C="$(code POST "$X" "${JSON[@]}" -H "x-actor-person-id: $STAFF" -H 'origin: https://www.lvrf-rule76.com' -d "$(excl)")"; [ "$C" = "201" ] && ok "Origin https://www.lvrf-rule76.com -> 201" || bad "www origin -> $C"
C="$(code POST "$X" "${JSON[@]}" -H "x-actor-person-id: $STAFF" -H 'origin: https://lvrf-rule76.com' -d "$(excl)")"; [ "$C" = "201" ] && ok "Origin https://lvrf-rule76.com -> 201" || bad "apex origin -> $C"
C="$(code POST "$X" "${JSON[@]}" -H "x-actor-person-id: $STAFF" -H 'origin: http://localhost:5173' -d "$(excl)")"; [ "$C" = "403" ] && ok "Origin http://localhost:5173 -> 403 once configured (the dev default no longer applies)" || bad "dev origin when configured -> $C"

step "11. A malformed LVRF_PUBLIC_ORIGIN refuses to start"
stop_server
if env -u NODE_ENV DATABASE_URL="$VERIFY_URL" PORT="$PORT" LVRF_PUBLIC_ORIGIN="https://lvrf-rule76.com/path" npx tsx server/index.ts > /tmp/lvrf_p2a_server.log 2>&1; then
  bad "server started with a malformed origin"
else
  grep -q "malformed origin" /tmp/lvrf_p2a_server.log && ok "server exited: $(grep -o 'LVRF_PUBLIC_ORIGIN has malformed[^(]*' /tmp/lvrf_p2a_server.log | head -1)" || bad "exited, but not for the origin: $(tail -2 /tmp/lvrf_p2a_server.log)"
fi

step "12. Production with LVRF_PUBLIC_ORIGIN missing: fallback, loud, still guarded"
start_server NODE_ENV=production && ok "server up (NODE_ENV=production, no LVRF_PUBLIC_ORIGIN)" || bad "server did not start"
code GET /api/health > /dev/null; [ "$(rj .origin_check)" = "fallback" ] && ok "health origin_check fallback (lvrf-deploy.sh fails on this)" || bad "health: $(rj .origin_check)"
grep -q "LVRF_PUBLIC_ORIGIN is not set in production" /tmp/lvrf_p2a_server.log && ok "startup log says so" || bad "no startup warning"
C="$(code POST "$X" "${JSON[@]}" -H "x-actor-person-id: $STAFF" -H "origin: http://127.0.0.1:$PORT" -d "$(excl)")"; [ "$C" = "201" ] && ok "Origin = the request's own origin -> 201 (the site still works)" || bad "own-origin write -> $C $(msg)"
C="$(code POST "$X" "${JSON[@]}" -H "x-actor-person-id: $STAFF" -H 'origin: https://evil.example' -d "$(excl)")"; [ "$C" = "403" ] && ok "foreign Origin -> 403 (writes are not opened)" || bad "foreign origin in fallback -> $C"
stop_server

step "13. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
