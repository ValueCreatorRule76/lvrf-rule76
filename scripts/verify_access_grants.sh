#!/usr/bin/env bash
#
# 3.0 Band A item 1, deploy A — access grants are records; the scripts that
# write them; must_change and change-password. Sign-in enforcement (deploy
# B) is covered by verify_grant_enforcement.sh. Local verification.
#
#   ./scripts/verify_access_grants.sh
#
# Clone `lvrf_verifygrants` (createdb -T lvrf -O lvrf_app), migrated to the
# latest and hardened, dropped on exit. The access scripts read passwords
# without echo, so they are driven through a pseudo-terminal
# (scripts/lib/pty_answer.py), which also fails a run that echoes any
# answer or an argon2 hash. Every address and password is a placeholder.

set -euo pipefail
cd "$(dirname "$0")/.."
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifygrants
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3081
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_grants.XXXXXX")"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W"; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }
qerr() { psql -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1" 2>&1 || true; }

# run SCRIPT ANSWERS... -- ARGS...  -> output in $OUT, exit in $RC, $LEAK
run() {
  local script="$1"; shift
  : > "$W/answers"
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do printf '%s\n' "$1" >> "$W/answers"; shift; done
  [ "${1:-}" = "--" ] && shift
  OUT="$(DATABASE_URL="$VERIFY_URL" python3 scripts/lib/pty_answer.py "$W/answers" -- npx tsx "scripts/$script" "$@" 2>&1)"
  RC="$(echo "$OUT" | sed -n 's/^--- exit \([-0-9]*\) .*/\1/p' | tail -1)"
  LEAK="$(echo "$OUT" | grep -o 'secret echoed: [A-Za-z]*' | tail -1 | cut -d' ' -f3)"
}
said() { echo "$OUT" | grep -q -- "$1"; }
noleak() { [ "$LEAK" = "False" ] && ok "  ...no password or hash in the output" || bad "  ...a secret was echoed"; }

step "1. Typecheck (server and scripts)"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
npx tsc -p tsconfig.scripts.json --noEmit && ok "scripts tsc" || bad "scripts tsc"

step "2. Clone, migrate to latest (0029), harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$T triggers" || bad "triggers $T (expected $EXPECT_TRIGGERS)"
[ "$(q "SELECT string_agg(trigger_name, ',' ORDER BY trigger_name) FROM (SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE event_object_table = 'access_grants') t")" = "access_grants_audit,access_grants_no_delete,access_grants_steward_only" ] && ok "access_grants: _audit, _no_delete, _steward_only" || bad "access_grants triggers wrong"
[ "$(q "SELECT count(*) FROM person_credentials WHERE must_change")" = "0" ] && ok "must_change defaults false on every existing credential" || bad "must_change not false"

step "3. Fixtures: a fresh tenant with no steward"
TS="$(date +%s)"
TEN="$(q "INSERT INTO tenants (name) VALUES ('Band A tenant ($TS)') RETURNING id" | head -1)"
S_EMAIL="steward.$TS@banda.example"; X_EMAIL="other.$TS@banda.example"; Y_EMAIL="nogrant.$TS@banda.example"
S="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Steward S (verification)', '$S_EMAIL') RETURNING id" | head -1)"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Staff X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
Y="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Staff Y (verification)', '$Y_EMAIL') RETURNING id" | head -1)"
INST="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TEN', 'Account (verification $TS)') RETURNING id" | head -1)"
CUST="$(q "INSERT INTO persons (institution_id, full_name, email) VALUES ('$INST', 'Customer (verification)', 'cust.$TS@account.example') RETURNING id" | head -1)"
RETIRED_EMAIL="retired.$TS@banda.example"
q "INSERT INTO persons (tenant_id, full_name, email, deleted_at) VALUES ('$TEN', 'Retired R (verification)', '$RETIRED_EMAIL', now())" > /dev/null
OTHER_TEN="$(q "INSERT INTO tenants (name) VALUES ('Other tenant ($TS)') RETURNING id" | head -1)"
PW_S="steward-password-$TS"; PW_S2="steward-breakglass-$TS"; PW_X="x-password-$TS"; PW_Y="y-password-$TS"
hash() { node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$1"; }
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$X', '$(hash "$PW_X")', 'verify'), ('$Y', '$(hash "$PW_Y")', 'verify')" > /dev/null
[ -n "$S" ] && [ -n "$X" ] && [ -n "$Y" ] && [ -n "$CUST" ] && ok "tenant, steward-to-be S (no password yet), staff X and Y (with passwords), a customer, a retired person" || { bad "fixtures"; exit 1; }

step "4. set_password: initial setup while the tenant has no steward"
run set_password.ts "$PW_S" "$PW_S" -- "$S_EMAIL"
[ "$RC" = "0" ] && said "initial setup (no steward yet)" && ok "S's first password set — mode: initial setup" || bad "initial setup: $OUT"
noleak

step "5. set_steward: the named person's own password is the proof"
run set_steward.ts "wrong-1" "wrong-2" "wrong-3" -- "$S_EMAIL"
[ "$RC" = "1" ] && said "was not proven" && [ "$(q "SELECT steward_person_id IS NULL FROM tenants WHERE id = '$TEN'")" = "t" ] && ok "three wrong passwords -> refused, no steward set" || bad "wrong pw: $OUT"
run set_steward.ts "$PW_X" -- "$X_EMAIL"
[ "$(q "SELECT steward_person_id FROM tenants WHERE id = '$TEN'")" = "$X" ] && { ok "naming X with X's own password works (the proof is the named person's)"; q "UPDATE tenants SET steward_person_id = NULL WHERE id = '$TEN'" > /dev/null; } || bad "X as steward: $OUT"
AUD0="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"
run set_steward.ts "$PW_S" -- "$S_EMAIL"
[ "$RC" = "0" ] && [ "$(q "SELECT steward_person_id FROM tenants WHERE id = '$TEN'")" = "$S" ] && ok "S named steward with S's password" || bad "set_steward S: $OUT"
[ "$(q "SELECT count(*) FROM audit_log WHERE id > $AUD0 AND table_name = 'tenants' AND operation = 'update' AND actor_person_id = '$S' AND new_row->>'steward_person_id' = '$S'")" = "1" ] && ok "  ...tenants_audit: update, actor = S (self-attested)" || bad "  ...audit row missing"
noleak
run set_steward.ts "$PW_X" -- "$X_EMAIL"
[ "$RC" = "1" ] && said "already has a steward" && ok "a second steward -> refused" || bad "second steward: $OUT"

step "6. set_password after the steward exists: break-glass for the steward only"
run set_password.ts "$PW_X" "$PW_X" -- "$X_EMAIL"
[ "$RC" = "1" ] && said "is not the steward" && ok "X -> refused (grant_access / reset_password need the steward's password)" || bad "set_password X: $OUT"
run set_password.ts "$PW_S2" "$PW_S2" -- "$S_EMAIL"
[ "$RC" = "0" ] && said "break-glass (the steward)" && ok "S -> break-glass allowed (SSH is the trust root, stated)" || bad "break-glass: $OUT"
PW_S="$PW_S2"

step "7. grant_access: refusals before anything is written"
P0="$(q "SELECT count(*) FROM persons")"; G0="$(q "SELECT count(*) FROM access_grants")"
run grant_access.ts -- "new.$TS@banda.example" --reason "short"
[ "$RC" = "1" ] && said "at least 12" && ok "a short reason -> refused" || bad "short reason: $OUT"
run grant_access.ts -- "new.$TS@banda.example" --reason "Verification: a new analyst"
[ "$RC" = "1" ] && said "--name" && ok "a new person without --name -> refused" || bad "no name: $OUT"
run grant_access.ts -- "not-an-email" --reason "Verification: a new analyst" --name "N"
[ "$RC" = "1" ] && said "not a plausible email" && ok "an implausible address -> refused" || bad "implausible: $OUT"
run grant_access.ts -- "$(echo "$RETIRED_EMAIL" | tr '[:lower:]' '[:upper:]')" --reason "Verification: a new analyst" --name "N"
[ "$RC" = "1" ] && said "0 current persons" && ok "an email matching a retired person case-insensitively -> refused (unique across ALL persons)" || bad "retired email: $OUT"
run grant_access.ts "wrong-1" "wrong-2" "wrong-3" -- "new.$TS@banda.example" --reason "Verification: a new analyst" --name "New Analyst N"
[ "$RC" = "1" ] && said "was not proven" && ok "three wrong steward passwords -> refused" || bad "wrong steward pw: $OUT"
[ "$(q "SELECT count(*) FROM persons")" = "$P0" ] && [ "$(q "SELECT count(*) FROM access_grants")" = "$G0" ] && ok "  ...no person and no grant written by any refusal" || bad "a refused grant wrote rows"

step "8. grant_access: the bootstrap — the steward's own grant"
CRED_S="$(q "SELECT id FROM person_credentials WHERE person_id = '$S' AND revoked_at IS NULL")"
run grant_access.ts "$PW_S" -- "$S_EMAIL" --reason "Bootstrap: the steward's own grant"
[ "$RC" = "0" ] && said "the bootstrap" && ok "S grants S" || bad "bootstrap: $OUT"
[ "$(q "SELECT count(*) FROM access_grants WHERE person_id = '$S' AND granted_by_person_id = '$S' AND revoked_at IS NULL")" = "1" ] && ok "  ...one current grant, granted_by = S" || bad "  ...grant row wrong"
[ "$(q "SELECT id || '|' || must_change FROM person_credentials WHERE person_id = '$S' AND revoked_at IS NULL")" = "$CRED_S|false" ] && ok "  ...S keeps their own password (same credential row, must_change false)" || bad "  ...S's credential changed"
noleak

step "9. grant_access: a new person, and an existing one"
NEW_EMAIL="New.Analyst.$TS@BandA.example"; PW_N0="starting-n-$TS"
run grant_access.ts "$PW_S" "$PW_N0" "$PW_N0" -- "$NEW_EMAIL" --reason "Verification: a new analyst" --name "New Analyst N"
N="$(q "SELECT id FROM persons WHERE email = '$NEW_EMAIL'")"
[ "$RC" = "0" ] && [ -n "$N" ] && ok "N created and granted" || bad "grant N: $OUT"
[ "$(q "SELECT tenant_id FROM persons WHERE id = '$N'")" = "$TEN" ] && ok "  ...N is vendor staff of the steward's tenant" || bad "  ...N's tenant wrong"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'persons' AND record_id = '$N' AND operation = 'insert' AND actor_person_id = '$S'")" = "1" ] && ok "  ...persons_audit: insert, actor = S" || bad "  ...person audit wrong"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'access_grants' AND record_id = (SELECT id::text FROM access_grants WHERE person_id = '$N') AND operation = 'insert' AND actor_person_id = '$S'")" = "1" ] && ok "  ...access_grants_audit: insert, actor = S" || bad "  ...grant audit wrong"
[ "$(q "SELECT set_via || '|' || must_change FROM person_credentials WHERE person_id = '$N' AND revoked_at IS NULL")" = "grant|true" ] && ok "  ...a starting password: set_via grant, must_change true" || bad "  ...N's credential wrong"
noleak
run grant_access.ts "$PW_S" "x" -- "$NEW_EMAIL" --reason "Verification: a second grant"
[ "$RC" = "1" ] && said "already has a current grant" && ok "N again -> refused (one current grant)" || bad "second grant: $OUT"
# X has a password and a live session from before any grant.
curl -s -o /dev/null -c "$W/x.jar" -H 'content-type: application/json' -d "{\"email\":\"$X_EMAIL\",\"password\":\"$PW_X\"}" "$BASE/api/auth/login" || true
q "INSERT INTO sessions (token_hash, person_id, expires_at, absolute_expires_at) VALUES ('verify-x-$TS', '$X', now() + interval '1 hour', now() + interval '1 day')" > /dev/null
PW_X0="starting-x-$TS"
run grant_access.ts "$PW_S" "$PW_X0" "$PW_X0" -- "$X_EMAIL" --reason "Verification: an existing staff member"
[ "$RC" = "0" ] && ok "X (existing, with a password and a session) granted" || bad "grant X: $OUT"
[ "$(q "SELECT count(*) FROM person_credentials WHERE person_id = '$X' AND revoked_at IS NULL AND set_via = 'grant' AND must_change")" = "1" ] && [ "$(q "SELECT count(*) FROM person_credentials WHERE person_id = '$X'")" = "2" ] && ok "  ...X's old password revoked, a starting one set" || bad "  ...X credentials wrong"
[ "$(q "SELECT count(*) FROM sessions WHERE person_id = '$X' AND revoked_at IS NULL")" = "0" ] && ok "  ...X's sessions ended" || bad "  ...X session still live"

step "10. The database holds the rule, not only the scripts"
OUT="$(qerr "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$Y', '$TEN', '$X', 'Verification: granted by a non-steward')")"
case "$OUT" in *"only the tenant's steward may grant"*) ok "a grant by a non-steward, by SQL -> refused by access_grants_steward_only" ;; *) bad "non-steward grant: $OUT" ;; esac
OUT="$(qerr "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$CUST', '$TEN', '$S', 'Verification: a customer-side person')")"
case "$OUT" in *"not current, non-simulated vendor staff"*) ok "a grant to a customer-side person -> refused" ;; *) bad "customer grant: $OUT" ;; esac
OUT="$(qerr "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$Y', '$OTHER_TEN', '$S', 'Verification: the wrong tenant')")"
case "$OUT" in *"has no steward"*|*"not current, non-simulated vendor staff"*) ok "a grant naming another tenant -> refused" ;; *) bad "wrong tenant grant: $OUT" ;; esac
OUT="$(qerr "UPDATE access_grants SET reason = 'Verification: a rewritten reason' WHERE person_id = '$N'")"
case "$OUT" in *"only the revocation may be written"*) ok "rewriting a grant's reason -> refused" ;; *) bad "reason rewrite: $OUT" ;; esac
OUT="$(qerr "UPDATE access_grants SET revoked_at = now(), revoked_by_person_id = '$X', revocation_reason = 'Verification: revoked by a non-steward' WHERE person_id = '$N'")"
case "$OUT" in *"only the tenant's steward may revoke"*) ok "a revocation by a non-steward -> refused" ;; *) bad "non-steward revoke: $OUT" ;; esac
OUT="$(qerr "UPDATE access_grants SET revoked_at = now(), revoked_by_person_id = '$S' WHERE person_id = '$N'")"
case "$OUT" in *access_grants_revocation_complete*) ok "a revocation without a reason -> refused by the CHECK" ;; *) bad "partial revoke: $OUT" ;; esac
OUT="$(qerr "DELETE FROM access_grants WHERE person_id = '$N'")"
case "$OUT" in *"never deleted"*) ok "deleting a grant -> refused" ;; *) bad "delete: $OUT" ;; esac
OUT="$(qerr "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$N', '$TEN', '$S', 'Verification: a second current grant')")"
case "$OUT" in *access_grants_one_current*) ok "a second current grant -> refused (one current per person)" ;; *) bad "second current: $OUT" ;; esac

step "11. Server"
env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=0 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; cat "$W/server.log"; exit 1; }
code() { local jar="$1" m="$2" p="$3"; shift 3; curl -s -o "$W/r.json" -w '%{http_code}' -X "$m" -b "$jar" -c "$jar" "$@" "$BASE$p"; }
rj() { node -e "try{const v=require('$W/r.json');console.log(String(v$1))}catch{console.log('')}"; }
JSON=(-H 'content-type: application/json')
login() { code "$1" POST /api/auth/login "${JSON[@]}" -d "{\"email\":\"$2\",\"password\":\"$3\"}"; }
# Deploy B enforces a grant at sign-in (verify_grant_enforcement.sh covers
# it fully); here, the one consequence for this script's people.
C="$(login "$W/y.jar" "$Y_EMAIL" "$PW_Y")"; [ "$C" = "401" ] && ok "Y, with a password and NO grant -> 401 (deploy B: a grant is required)" || bad "Y login -> $C"

step "12. must_change: a starting password reaches only me / change-password / logout"
C="$(login "$W/n1.jar" "$NEW_EMAIL" "$PW_N0")"; [ "$C" = "200" ] && [ "$(rj .person.must_change)" = "true" ] && ok "N signs in with the starting password; login says must_change" || bad "N login -> $C"
login "$W/n2.jar" "$NEW_EMAIL" "$PW_N0" > /dev/null
C="$(code "$W/n1.jar" GET /api/cohort)"; [ "$C" = "403" ] && [ "$(rj .code)" = "password_change_required" ] && ok "GET /api/cohort -> 403 password_change_required (reads too)" || bad "cohort -> $C $(rj .code)"
C="$(code "$W/n1.jar" POST "/api/institutions/$INST/facts" "${JSON[@]}" -d '{}')"; [ "$C" = "403" ] && ok "a write -> 403 as well" || bad "write -> $C"
C="$(code "$W/n1.jar" GET /api/auth/me)"; [ "$C" = "200" ] && [ "$(rj .person.must_change)" = "true" ] && ok "GET /api/auth/me -> 200, must_change true" || bad "me -> $C"

step "13. change-password"
cp() { code "$1" POST /api/auth/change-password "${JSON[@]}" -d "{\"current_password\":\"$2\",\"new_password\":\"$3\"}"; }
PW_N="own-password-n-$TS"
C="$(cp "$W/n1.jar" "not-the-password" "$PW_N")"; [ "$C" = "401" ] && ok "a wrong current password -> 401" || bad "wrong current -> $C"
C="$(cp "$W/n1.jar" "$PW_N0" "short")"; [ "$C" = "422" ] && ok "a new password under 12 -> 422" || bad "short -> $C"
C="$(cp "$W/n1.jar" "$PW_N0" "$PW_N0")"; [ "$C" = "422" ] && ok "the same password -> 422" || bad "same -> $C"
C="$(cp "$W/n1.jar" "$PW_N0" "$PW_N")"; [ "$C" = "200" ] && [ "$(rj .other_sessions_ended)" = "1" ] && ok "changed: 200, one other session ended" || bad "change -> $C $(cat "$W/r.json")"
C="$(code "$W/n1.jar" GET /api/cohort)"; [ "$C" = "200" ] && ok "  ...this session now reaches the app" || bad "  ...cohort after change -> $C"
C="$(code "$W/n2.jar" GET /api/auth/me)"; [ "$C" = "401" ] && ok "  ...the other session is signed out" || bad "  ...other session -> $C"
[ "$(q "SELECT set_via || '|' || must_change FROM person_credentials WHERE person_id = '$N' AND revoked_at IS NULL")" = "self|false" ] && ok "  ...credential: set_via self, must_change false" || bad "  ...credential wrong"
C="$(login "$W/n3.jar" "$NEW_EMAIL" "$PW_N0")"; [ "$C" = "401" ] && ok "  ...the starting password no longer works" || bad "  ...starting pw -> $C"
for i in 1 2 3 4 5; do cp "$W/n1.jar" "wrong-$i" "another-password-$TS" > /dev/null; done
C="$(cp "$W/n1.jar" "$PW_N" "another-password-$TS")"; [ "$C" = "429" ] && ok "five wrong current passwords -> 429 (throttled like sign-in)" || bad "throttle -> $C"

step "14. revoke_access"
login "$W/n4.jar" "$NEW_EMAIL" "$PW_N" > /dev/null
run revoke_access.ts "$PW_S" -- "$S_EMAIL" --reason "Verification: the steward revoking themselves"
[ "$RC" = "1" ] && said "is the steward" && ok "the steward's own grant -> refused (no lockout)" || bad "self revoke: $OUT"
run revoke_access.ts "$PW_S" -- "$Y_EMAIL" --reason "Verification: no grant to revoke"
[ "$RC" = "1" ] && said "has no current grant" && ok "a person with no grant -> refused" || bad "Y revoke: $OUT"
run revoke_access.ts "$PW_S" -- "$NEW_EMAIL" --reason "Verification: access ends"
[ "$RC" = "0" ] && ok "N revoked" || bad "revoke N: $OUT"
[ "$(q "SELECT (revoked_by_person_id = '$S')::text || '|' || revocation_reason FROM access_grants WHERE person_id = '$N'")" = "true|Verification: access ends" ] && ok "  ...revoked_by S, with the reason" || bad "  ...revocation row wrong"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'access_grants' AND record_id = (SELECT id::text FROM access_grants WHERE person_id = '$N') AND operation = 'update' AND actor_person_id = '$S'")" = "1" ] && ok "  ...access_grants_audit: update, actor = S" || bad "  ...revocation audit wrong"
[ "$(q "SELECT count(*) FROM person_credentials WHERE person_id = '$N' AND revoked_at IS NULL")$(q "SELECT count(*) FROM sessions WHERE person_id = '$N' AND revoked_at IS NULL")" = "00" ] && ok "  ...credential and every session revoked, in the same transaction" || bad "  ...credential or session left"
C="$(code "$W/n4.jar" GET /api/auth/me)"; [ "$C" = "401" ] && ok "  ...N's live session -> 401 at the next request" || bad "  ...N session -> $C"
noleak

step "15. reset_password"
run reset_password.ts "$PW_S" "x" "x" -- "$NEW_EMAIL"
[ "$RC" = "1" ] && said "has no current grant" && ok "a person without a current grant -> refused (a reset is not a way in)" || bad "reset no grant: $OUT"
run reset_password.ts "$PW_S" "x" "x" -- "$S_EMAIL"
[ "$RC" = "1" ] && said "this is the steward" && ok "the steward -> refused (change-password or break-glass)" || bad "reset steward: $OUT"
PW_X1="reset-x-$TS"
login "$W/x2.jar" "$X_EMAIL" "$PW_X0" > /dev/null
run reset_password.ts "$PW_S" "$PW_X1" "$PW_X1" -- "$X_EMAIL"
[ "$RC" = "0" ] && [ "$(q "SELECT set_via || '|' || must_change FROM person_credentials WHERE person_id = '$X' AND revoked_at IS NULL")" = "reset|true" ] && ok "X reset: a new starting password, must_change true" || bad "reset X: $OUT"
C="$(code "$W/x2.jar" GET /api/auth/me)"; [ "$C" = "401" ] && ok "  ...X's sessions ended" || bad "  ...X session -> $C"
noleak

step "16. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
