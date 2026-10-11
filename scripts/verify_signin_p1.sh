#!/usr/bin/env bash
#
# Sign-in P1 (0027) — local verification. Dev Mac only.
#
#   ./scripts/verify_signin_p1.sh
#
# Clone `lvrf_verifysignin` (createdb -T lvrf -O lvrf_app), migrated to the
# latest and hardened, dropped on exit. Credentials are inserted directly
# with an argon2id hash computed here, because scripts/set_password.ts reads
# the password from a terminal without echo and cannot be scripted.
# Stop `npm run dev` first.

set -euo pipefail
cd "$(dirname "$0")/.."
# The expected trigger total is read from db/hardening.sql's Verification
# block — the one place it is declared (CLAUDE.md: no file restates a
# canonical value). A migration that adds triggers updates that line, and
# every script follows.
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifysignin
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3091
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
JAR=/tmp/lvrf_signin_cookies.txt
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -f "$JAR"; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone, migrate to latest, harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /tmp/lvrf_hardening_signin.log 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && [ "$T" = "84" ] && ok "84 distinct triggers (82 + 2; matches the hardening.sql total)" || bad "triggers: $T (expected 84, hardening.sql says $EXPECT_TRIGGERS)"
for t in person_credentials sessions; do
  [ "$(q "SELECT count(*) FROM information_schema.triggers WHERE event_object_table = '$t' AND trigger_name = '${t}_no_delete'")" = "1" ] && ok "$t has _no_delete" || bad "$t missing _no_delete"
  [ "$(q "SELECT count(*) FROM information_schema.triggers WHERE event_object_table = '$t' AND trigger_name = '${t}_audit'")" = "0" ] && ok "$t is not audited (hashes stay out of audit_log)" || bad "$t is audited"
done

step "3. Credentials, inserted directly"
STAFF="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
STAFF_EMAIL="$(q "SELECT email FROM persons WHERE id = '$STAFF'")"
CUSTOMER="$(q "SELECT id FROM persons WHERE tenant_id IS NULL AND institution_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
CUSTOMER_EMAIL="$(q "SELECT email FROM persons WHERE id = '$CUSTOMER'")"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$STAFF', '$HASH', 'verify')" > /dev/null && ok "staff credential inserted"
[ -n "$CUSTOMER" ] && q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$CUSTOMER', '$HASH', 'verify')" > /dev/null && ok "customer-side credential inserted (the login must ignore it)"
if q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$STAFF', 'plaintext', 'verify')" > /dev/null 2>&1; then
  bad "a non-argon2id hash was accepted"
else
  ok "a second current credential, or a non-argon2id hash, is refused"
fi
echo "  staff $STAFF_EMAIL · customer ${CUSTOMER_EMAIL:-none}"

step "4. API against the clone, port ${PORT}"
DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_signin_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }

login() {  # EMAIL PASSWORD [extra curl args] -> code; headers in /tmp/lvrf_h.txt
  local e="$1" p="$2"; shift 2
  curl -s -o /tmp/lvrf_r.json -D /tmp/lvrf_h.txt -w '%{http_code}' -c "$JAR" -X POST \
    -H 'content-type: application/json' "$@" \
    -d "{\"email\":\"$e\",\"password\":\"$p\"}" "$BASE/api/auth/login"
}
msg() { node -e 'try{console.log(require("/tmp/lvrf_r.json").message??"")}catch{console.log("")}'; }

step "5. Refusals look identical"
C="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST -H 'content-type: text/plain' -d 'x' "$BASE/api/auth/login")"
[ "$C" = "415" ] && ok "non-JSON body -> 415" || bad "non-JSON -> $C"
C="$(login "" "")"; [ "$C" = "422" ] && ok "empty -> 422" || bad "empty -> $C"
C="$(login "nobody@example.invalid" "whatever-password")"; M1="$(msg)"
[ "$C" = "401" ] && ok "unknown email -> 401  $M1" || bad "unknown email -> $C"
C="$(login "$STAFF_EMAIL" "wrong-password-123")"; M2="$(msg)"
[ "$C" = "401" ] && [ "$M2" = "$M1" ] && ok "wrong password -> 401, same message" || bad "wrong password -> $C '$M2'"
if [ -n "$CUSTOMER" ]; then
  C="$(login "$CUSTOMER_EMAIL" "$PW")"; M3="$(msg)"
  [ "$C" = "401" ] && [ "$M3" = "$M1" ] && ok "customer-side person with a valid password -> 401, same message" || bad "customer login -> $C '$M3'"
fi

step "6. Sign in"
C="$(login "$STAFF_EMAIL" "$PW")"
[ "$C" = "200" ] && ok "staff -> 200" || bad "staff login -> $C $(msg)"
SC="$(grep -i '^set-cookie:' /tmp/lvrf_h.txt | head -1)"
case "$SC" in *HttpOnly*) ok "cookie is HttpOnly" ;; *) bad "cookie not HttpOnly: $SC" ;; esac
case "$SC" in *"SameSite=Lax"*) ok "cookie is SameSite=Lax" ;; *) bad "cookie SameSite: $SC" ;; esac
case "$SC" in *Secure*) bad "cookie is Secure over plain local HTTP (unusable locally)" ;; *) ok "no Secure flag over plain HTTP" ;; esac
TOKEN="$(awk '$6=="lvrf_session"{print $7}' "$JAR")"
STORED="$(q "SELECT token_hash FROM sessions WHERE person_id = '$STAFF' ORDER BY created_at DESC LIMIT 1")"
EXPECT="$(printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1)"
[ "$STORED" = "$EXPECT" ] && [ "$STORED" != "$TOKEN" ] && ok "only the token's SHA-256 is stored" || bad "stored token_hash does not match sha256(token)"
login "$STAFF_EMAIL" "$PW" -H 'x-forwarded-proto: https' > /dev/null
case "$(grep -i '^set-cookie:' /tmp/lvrf_h.txt | head -1)" in *Secure*) ok "Secure flag set behind HTTPS (X-Forwarded-Proto)" ;; *) bad "no Secure flag behind HTTPS" ;; esac
login "$STAFF_EMAIL" "$PW" > /dev/null   # back to a plain-HTTP cookie in the jar

step "7. /me"
C="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -b "$JAR" "$BASE/api/auth/me")"
[ "$C" = "200" ] && [ "$(node -e 'console.log(require("/tmp/lvrf_r.json").person.id)')" = "$STAFF" ] && ok "/me with the cookie -> 200, the staff person" || bad "/me -> $C"
C="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/me")"
[ "$C" = "401" ] && ok "/me without a cookie -> 401" || bad "/me without cookie -> $C"
C="$(curl -s -o /dev/null -w '%{http_code}' -H 'cookie: lvrf_session=forged' "$BASE/api/auth/me")"
[ "$C" = "401" ] && ok "/me with a forged token -> 401" || bad "/me forged -> $C"

step "8. The header still works in P1"
C="$(curl -s -o /dev/null -w '%{http_code}' -H "x-actor-person-id: $STAFF" "$BASE/api/cohort")"
[ "$C" = "200" ] && ok "GET with X-Actor-Person-Id still -> 200 (P1 is additive)" || bad "header path -> $C"

step "9. Sign out"
# The jar now holds the THIRD session's token (steps 6's two re-logins each
# replaced it). Sign out is checked against the token being signed out, not
# the first one read in step 6 — that session is still live, by design:
# signing in again does not end other sessions.
TOKEN="$(awk '$6=="lvrf_session"{print $7}' "$JAR")"
EXPECT="$(printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1)"
C="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -c "$JAR" -X POST -H 'content-type: application/json' -d '{}' "$BASE/api/auth/logout")"
[ "$C" = "200" ] && ok "logout -> 200" || bad "logout -> $C"
C="$(curl -s -o /dev/null -w '%{http_code}' -H "cookie: lvrf_session=$TOKEN" "$BASE/api/auth/me")"
[ "$C" = "401" ] && ok "the old token no longer signs in" || bad "old token after logout -> $C"
[ "$(q "SELECT revoked_at IS NOT NULL FROM sessions WHERE token_hash = '$EXPECT'")" = "t" ] && ok "session row revoked, not deleted" || bad "session not revoked"

step "10. Rate limit"
for i in 1 2 3 4 5; do login "$STAFF_EMAIL" "wrong-$i-password" > /dev/null; done
C="$(login "$STAFF_EMAIL" "$PW")"
[ "$C" = "429" ] && ok "after 5 failures, even the right password -> 429" || bad "6th attempt -> $C"

step "11. Nothing deletable"
for t in person_credentials sessions; do
  if psql -q -d "$VERIFY_DB" -c "DELETE FROM $t" > /tmp/lvrf_del.log 2>&1; then bad "DELETE on $t allowed"; else ok "DELETE on $t refused"; fi
done
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name IN ('person_credentials','sessions')")" = "0" ] && ok "no credential or session rows in audit_log" || bad "audit_log contains credential/session rows"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
