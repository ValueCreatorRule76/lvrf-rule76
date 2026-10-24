#!/usr/bin/env bash
#
# L31 (19 Oct 2026) — the request log: one line per /api request (method,
# route pattern, status, ms, session y/n), and never a body, a query string,
# a cookie or header value, an id from the path, or an IP address.
# Local verification.
#
#   ./scripts/verify_request_log.sh
#
# Clone `lvrf_verifyreqlog` (make_clone: converted as prod is after OWN-1),
# dropped on exit. The API runs with the actor header OFF, as in production:
# every actor here is a session, signed in through /api/auth/login.
# DELIBERATE BREAKS edit server/lib/requestLog.ts in place and restore it
# byte-identical.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyreqlog
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3091
ORIGIN="http://localhost:5191"
BASE="http://127.0.0.1:${PORT}"
LOGLIB=server/lib/requestLog.ts
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_reqlog.XXXXXX")"
cp "$LOGLIB" "$W/requestLog.ts.orig"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  cmp -s "$W/requestLog.ts.orig" "$LOGLIB" || { cp "$W/requestLog.ts.orig" "$LOGLIB"; echo "  (EXIT trap restored $LOGLIB)"; }
  dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
start_server() {  # LOGFILE
  LVRF_PUBLIC_ORIGIN="$ORIGIN" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=0 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$1" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start: $(tail -5 "$1")"; exit 1
}
# The log lines for one marker request: everything the server printed after N lines.
lines_after() { tail -n +"$(( $1 + 1 ))" "$2" | grep '^LVRF req ' || true; }
nlines() { wc -l < "$1" | tr -d ' '; }

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -3 "$W/tsc.log")"

step "2. Clone, convert, migrate, harden; a signed-in person"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 \
  && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "cloned, converted, migrated, hardened" || { bad "clone"; exit 1; }
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.id = p.tenant_id WHERE p.simulated = false AND p.deleted_at IS NULL AND p.superseded_by_id IS NULL ORDER BY p.created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="MARKPW-$(date +%s)-secret"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN' AND steward_person_id IS NULL" > /dev/null
[ "$(q "SELECT count(*) FROM access_grants WHERE person_id = '$S' AND revoked_at IS NULL")" = "0" ] \
  && q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
INST="$(q "SELECT id FROM institutions WHERE tenant_id = '$TEN' AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
LOG="$W/server.log"
start_server "$LOG" && ok "API up on $PORT (actor header off: sessions only)"

UUID="7d1c2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f"
CT=(-H 'content-type: application/json' -H "Origin: $ORIGIN")
code() { curl -s -o "$W/r.json" -w '%{http_code}' "$@"; }

step "3. The lines: a 401 before routing, a sign-in, signed-in reads and refusals, a 404"
N="$(nlines "$LOG")"
C="$(code "$BASE/api/institutions/$UUID/pov?q=MARKQUERY1")"; sleep 0.3
L="$(lines_after "$N" "$LOG")"
[ "$C" = "401" ] && printf '%s' "$L" | grep -qE '^LVRF req GET /api/institutions/:institutionId/pov 401 [0-9]+ms session=n$' \
  && ok "a 401 before routing, no cookie: '$L'" || bad "401, no cookie -> $C: '$L'"
N="$(nlines "$LOG")"
C="$(code -X POST "${CT[@]}" -H 'Cookie: lvrf_session=MARKCOOKIE1; other=MARKCOOKIE2' -H 'X-Marker: MARKHEADER' \
  -d '{"statement":"MARKBODY a statement in the body","value_lever_id":"MARKBODY2"}' "$BASE/api/institutions/$UUID/hypotheses?q=MARKQUERY2&x=1")"; sleep 0.3
L="$(lines_after "$N" "$LOG")"
[ "$C" = "401" ] && printf '%s' "$L" | grep -qE '^LVRF req POST /api/institutions/:institutionId/hypotheses 401 [0-9]+ms session=y$' \
  && ok "a 401 with an expired or unknown session cookie (today's blind spot): '$L'" || bad "401, bad cookie -> $C: '$L'"
N="$(nlines "$LOG")"
C="$(curl -s -c "$W/jar" -o "$W/r.json" -w '%{http_code}' -X POST "${CT[@]}" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login")"; sleep 0.3
L="$(lines_after "$N" "$LOG")"
[ "$C" = "200" ] && printf '%s' "$L" | grep -qE '^LVRF req POST /api/auth/login 200 [0-9]+ms session=n$' && ok "sign-in: '$L'" || bad "login -> $C: '$L' $(head -c 200 "$W/r.json")"
TOKEN="$(awk '$6 == "lvrf_session" {print $7}' "$W/jar")"
N="$(nlines "$LOG")"
C="$(code -b "$W/jar" "$BASE/api/institutions/$INST/pov?q=MARKQUERY3")"; sleep 0.3
L="$(lines_after "$N" "$LOG")"
[ "$C" = "200" ] && printf '%s' "$L" | grep -qE '^LVRF req GET /api/institutions/:institutionId/pov 200 [0-9]+ms session=y$' && ok "a signed-in read: '$L'" || bad "pov -> $C: '$L'"
N="$(nlines "$LOG")"
C="$(code -b "$W/jar" -X POST "${CT[@]}" -d '{"value_outcome_id":"MARKBODY3","statement":"short"}' "$BASE/api/institutions/$INST/hypotheses")"; sleep 0.3
L="$(lines_after "$N" "$LOG")"
[ "$C" = "422" ] && printf '%s' "$L" | grep -qE '^LVRF req POST /api/institutions/:institutionId/hypotheses 422 [0-9]+ms session=y$' && ok "a signed-in refusal: '$L'" || bad "422 -> $C: '$L'"
N="$(nlines "$LOG")"
C="$(code -X POST -H 'content-type: application/json' -H 'Origin: http://evil.example' -d '{"a":"MARKBODY4"}' "$BASE/api/institutions/$UUID/hypotheses")"; sleep 0.3
L="$(lines_after "$N" "$LOG")"
printf '%s' "$L" | grep -qE "^LVRF req POST /api/institutions/:institutionId/hypotheses $C [0-9]+ms session=n$" && [ "$C" != "200" ] && [ "$C" != "201" ] \
  && ok "a foreign-origin write, refused by the origin guard ($C): '$L'" || bad "foreign origin -> $C: '$L'"
N="$(nlines "$LOG")"
C="$(code -b "$W/jar" "$BASE/api/no-such-thing/$UUID?q=MARKQUERY4")"; sleep 0.3
L="$(lines_after "$N" "$LOG")"
printf '%s' "$L" | grep -qE "^LVRF req GET \(no route\) $C [0-9]+ms session=y$" && ok "a path no route matches logs '(no route)', never itself: '$L'" || bad "no route -> $C: '$L'"
N="$(nlines "$LOG")"
C="$(code -X POST "${CT[@]}" -d '{not json MARKBODY5' "$BASE/api/institutions/$UUID/hypotheses")"; sleep 0.3
L="$(lines_after "$N" "$LOG")"
printf '%s' "$L" | grep -qE "^LVRF req POST /api/institutions/:institutionId/hypotheses $C [0-9]+ms session=n$" && ok "a body that is not JSON ($C), refused before routing: '$L'" || bad "bad json -> $C: '$L'"

step "4. Never a value: body, query string, cookies, header, password, session token, ids, IP"
REQ="$(grep '^LVRF req ' "$LOG")"
for m in MARKQUERY1 MARKQUERY2 MARKQUERY3 MARKQUERY4 MARKBODY MARKCOOKIE1 MARKCOOKIE2 MARKHEADER "$PW" "$UUID" "$INST" "$EMAIL" 'q=' '?' '127.0.0.1' 'evil.example' 'Origin' 'cookie'; do
  printf '%s' "$REQ" | grep -qiF -- "$m" && bad "the log carries '$m'" || ok "not in any request line: '${m:0:24}'"
done
[ -n "$TOKEN" ] && { grep -qF -- "$TOKEN" "$LOG" && bad "the session token is in the log" || ok "the session token is in no line of the log"; } || bad "no session token in the jar"
grep -qF -- "$PW" "$LOG" && bad "the password is in the log" || ok "the password is in no line of the whole log (not only request lines)"

step "5. Every route resolves to its own pattern, unauthenticated (the 401 path)"
ROUTES="$(node scripts/list_api_routes.mjs --all)"
MISS=0; TOTAL=0
while read -r METHOD PATTERN; do
  [ -n "$METHOD" ] || continue
  TOTAL=$((TOTAL + 1))
  CONCRETE="$(printf '%s' "$PATTERN" | sed -E "s#:[A-Za-z_]+#$UUID#g")"
  N="$(nlines "$LOG")"
  if [ "$METHOD" = "GET" ]; then curl -s -o /dev/null "$BASE$CONCRETE"; else curl -s -o /dev/null -X "$METHOD" "${CT[@]}" -d '{}' "$BASE$CONCRETE"; fi
  sleep 0.15
  L="$(lines_after "$N" "$LOG")"
  printf '%s' "$L" | grep -qE "^LVRF req $METHOD $(printf '%s' "$PATTERN" | sed 's/[.]/\\./g') [0-9]{3} [0-9]+ms session=n$" || { MISS=$((MISS + 1)); echo "    MISS  $METHOD $PATTERN -> '$L'"; }
done <<< "$ROUTES"
[ "$MISS" = "0" ] && ok "all $TOTAL routes (list_api_routes --all) logged as their own pattern, with no value" || bad "$MISS of $TOTAL routes did not resolve to their pattern"
printf '%s' "$(grep '^LVRF req ' "$LOG")" | grep -qF "$UUID" && bad "  ...an id from a concrete path reached the log" || ok "  ...and the id put into every concrete path appears in no line"

step "6. Deliberate breaks"
restore() { cp "$W/requestLog.ts.orig" "$LOGLIB"; cmp -s "$W/requestLog.ts.orig" "$LOGLIB" && ok "  ...$LOGLIB restored byte-identical" || bad "  ...restore differs"; }
edit() {  # OLD NEW
  python3 - "$LOGLIB" "$1" "$2" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
# B1 — log the concrete path instead of the pattern: ids reach the log.
edit '${routePattern(app, req.method, path)}' '${path}'
stop_server; start_server "$W/b1.log"
curl -s -o /dev/null "$BASE/api/institutions/$UUID/pov"; sleep 0.3
grep '^LVRF req ' "$W/b1.log" | grep -qF "$UUID" && ok "B1: logging the concrete path puts the id in the log — the pattern is what keeps it out" || bad "B1: not caught"
restore
# B2 — the pattern from req.route only: a request refused before routing (a 401) loses its route.
edit '${routePattern(app, req.method, path)}' '${req.route ? req.baseUrl + req.route.path : "(no route)"}'
stop_server; start_server "$W/b2.log"
curl -s -o /dev/null "$BASE/api/institutions/$UUID/pov"; sleep 0.3
grep '^LVRF req ' "$W/b2.log" | grep -qE '^LVRF req GET \(no route\) 401 ' && ok "B2: with req.route alone, a 401 logs '(no route)' — today's blind spot; resolving the pattern is what names it" || bad "B2: not caught: $(grep '^LVRF req ' "$W/b2.log")"
restore
stop_server
cmp -s "$W/requestLog.ts.orig" "$LOGLIB" && ok "$LOGLIB byte-identical to before the run" || bad "$LOGLIB differs"

echo
echo "  a 401, as the journal will show it:"
grep -m1 -E '^LVRF req GET /api/institutions/:institutionId/pov 401 ' "$LOG" | sed 's/^/    /'
grep -m1 -E '^LVRF req POST /api/institutions/:institutionId/hypotheses 401 ' "$LOG" | sed 's/^/    /'
echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
