#!/usr/bin/env bash
#
# 3.0 Band A item 1, deploy B — sign-in requires a current access grant;
# the deploy script's lockout pre-check; the bootstrap out of a lockout.
# Local verification.
#
#   ./scripts/verify_grant_enforcement.sh
#
# Clone `lvrf_verifyenforce` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated to the
# latest and hardened, dropped on exit. Placeholders throughout.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyenforce
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3080
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_enforce.XXXXXX")"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W"; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }
code() { local jar="$1" m="$2" p="$3"; shift 3; curl -s -o "$W/r.json" -w '%{http_code}' -X "$m" -b "$jar" -c "$jar" "$@" "$BASE$p"; }
rj() { node -e "try{const v=require('$W/r.json');console.log(String(v$1))}catch{console.log('')}"; }
JSON=(-H 'content-type: application/json')
login() { code "$1" POST /api/auth/login "${JSON[@]}" -d "{\"email\":\"$2\",\"password\":\"$3\"}"; }
hash() { node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$1"; }
precheck() { psql -X -At -d "$VERIFY_DB" -f scripts/precheck_steward_grants.sql; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
npx tsc -p tsconfig.scripts.json --noEmit && ok "scripts tsc" || bad "scripts tsc"

step "2. Clone, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$T triggers (deploy B adds none)" || bad "triggers $T"

step "3. Fixtures"
TS="$(date +%s)"
pw() { echo "pw-$1-$TS"; }
TEN="$(q "INSERT INTO tenants (name) VALUES ('Enforce tenant ($TS)') RETURNING id" | head -1)"
mk() { q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$1', '$2 (verification)', '$3') RETURNING id" | head -1; }
S="$(mk "$TEN" "Steward S" "s.$TS@enforce.example")"; X="$(mk "$TEN" "Granted X" "x.$TS@enforce.example")"
Y="$(mk "$TEN" "Ungranted Y" "y.$TS@enforce.example")"; Z="$(mk "$TEN" "Revoked Z" "z.$TS@enforce.example")"
for p in S X Y Z; do q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('${!p}', '$(hash "$(pw $p)")', 'verify')" > /dev/null; done
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
for p in S X Z; do q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('${!p}', '$TEN', '$S', 'Verification fixture grant')" > /dev/null; done
# A second tenant whose steward has a password but NO grant: the lockout.
TEN2="$(q "INSERT INTO tenants (name) VALUES ('Locked-out tenant ($TS)') RETURNING id" | head -1)"
S2_EMAIL="s2.$TS@locked.example"
S2="$(mk "$TEN2" "Steward S2" "$S2_EMAIL")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S2', '$(hash "$(pw S2)")', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S2' WHERE id = '$TEN2'" > /dev/null
# Y's session from before deploy B (a row the old code would have honoured).
q "INSERT INTO sessions (token_hash, person_id, expires_at, absolute_expires_at) VALUES ('$(printf 'y-token-%s' "$TS" | shasum -a 256 | cut -d' ' -f1)', '$Y', now() + interval '1 hour', now() + interval '1 day')" > /dev/null
ok "tenant: steward S (granted), X (granted), Y (password, no grant, an old session), Z (granted, to be revoked); tenant 2: steward S2 with a password and NO grant"

step "4. The lockout pre-check (scripts/precheck_steward_grants.sql)"
[ "$(precheck)" = "1" ] && ok "precheck = 1: tenant 2's steward has no grant" || bad "precheck: $(precheck)"
# The deploy script's own step 5b, run against this clone in a scratch dir:
# the same lines, extracted, so this tests what will run on the box.
mkdir -p "$W/box/scripts"; cp scripts/precheck_steward_grants.sql "$W/box/scripts/"
echo "DATABASE_URL=$VERIFY_URL" > "$W/box/.env"
{ echo 'set -euo pipefail; die(){ echo "DEPLOY FAILED: $*"; exit 1; }; log(){ echo "==> $*"; }'
  # Step 5b alone: from its header to the next step's (5c since Q4, else 6).
  awk '/^# 5b\. The lockout pre-check/{on=1} on && /^# (5c|6)\./{exit} on' scripts/lvrf-deploy.sh; echo 'echo "WOULD RESTART"'; } > "$W/box/step5b.sh"
grep -q 'precheck_steward_grants.sql' "$W/box/step5b.sh" || bad "step 5b not found in lvrf-deploy.sh"
L5B="$(grep -n '^# 5b\.' scripts/lvrf-deploy.sh | cut -d: -f1)"; LRS="$(grep -n '^sudo systemctl restart' scripts/lvrf-deploy.sh | cut -d: -f1)"
[ -n "$L5B" ] && [ "$L5B" -lt "$LRS" ] && ok "lvrf-deploy.sh runs the pre-check (line $L5B) before the restart (line $LRS)" || bad "pre-check is not before the restart"
OUT="$(cd "$W/box" && bash step5b.sh 2>&1 || true)"
case "$OUT" in *"DEPLOY FAILED: steward-grant pre-check: 1 tenant(s) would be locked out"*) ok "the deploy's step 5b refuses: 1 tenant would be locked out — no restart" ;; *) bad "step 5b: $OUT" ;; esac
case "$OUT" in *"WOULD RESTART"*) bad "  ...it went on to restart" ;; *) ok "  ...and stops before the restart" ;; esac

step "5. Server: sign-in needs a current grant"
env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=0 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; cat "$W/server.log"; exit 1; }
C="$(login "$W/s.jar" "s.$TS@enforce.example" "$(pw S)")"; [ "$C" = "200" ] && ok "the steward, granted -> 200" || bad "S -> $C"
C="$(login "$W/x.jar" "x.$TS@enforce.example" "$(pw X)")"; [ "$C" = "200" ] && ok "X, granted -> 200" || bad "X -> $C"
C="$(login "$W/y.jar" "y.$TS@enforce.example" "$(pw Y)")"; MY="$(rj .message)"
C2="$(login "$W/w.jar" "x.$TS@enforce.example" "not-the-password")"; MW="$(rj .message)"
[ "$C" = "401" ] && [ "$C2" = "401" ] && [ "$MY" = "$MW" ] && ok "Y, right password but no grant -> 401, the same message as a wrong password (\"$MY\")" || bad "Y -> $C '$MY' vs wrong pw $C2 '$MW'"
printf 'localhost\tFALSE\t/\tFALSE\t0\tlvrf_session\ty-token-%s\n' "$TS" > "$W/yold.jar"
C="$(curl -s -o /dev/null -w '%{http_code}' -b "$W/yold.jar" "$BASE/api/auth/me")"; [ "$C" = "401" ] && ok "Y's session from before deploy B -> 401 (the session check needs a grant too)" || bad "Y old session -> $C"
C="$(curl -s -o /dev/null -w '%{http_code}' -b "$W/yold.jar" -H 'content-type: application/json' -d '{"current_password":"a","new_password":"b"}' "$BASE/api/auth/change-password")"; [ "$C" = "401" ] && ok "  ...and cannot reach change-password" || bad "Y change-password -> $C"

step "6. Revoking a grant ends a live session at its next request"
C="$(login "$W/z.jar" "z.$TS@enforce.example" "$(pw Z)")"; [ "$C" = "200" ] && ok "Z signs in" || bad "Z -> $C"
C="$(code "$W/z.jar" GET /api/cohort)"; [ "$C" = "200" ] && ok "  ...and reads" || bad "Z read -> $C"
q "UPDATE access_grants SET revoked_at = now(), revoked_by_person_id = '$S', revocation_reason = 'Verification: access ends' WHERE person_id = '$Z' AND revoked_at IS NULL" > /dev/null
[ "$(q "SELECT count(*) FROM sessions WHERE person_id = '$Z' AND revoked_at IS NULL")" = "1" ] && ok "only the grant was revoked (the session row is untouched)" || bad "session row changed"
C="$(code "$W/z.jar" GET /api/cohort)"; [ "$C" = "401" ] && ok "  ...Z's next read -> 401" || bad "  ...Z read after revoke -> $C"
C="$(code "$W/z.jar" GET /api/auth/me)"; [ "$C" = "401" ] && ok "  ...me -> 401" || bad "  ...me -> $C"
C="$(login "$W/z2.jar" "z.$TS@enforce.example" "$(pw Z)")"; [ "$C" = "401" ] && ok "  ...and Z cannot sign in again" || bad "  ...Z login -> $C"

step "7. The lockout, and the way out: the steward's own grant"
C="$(login "$W/s2.jar" "$S2_EMAIL" "$(pw S2)")"; [ "$C" = "401" ] && ok "S2, a steward with no grant -> 401 (locked out)" || bad "S2 -> $C"
printf '%s\n' "$(pw S2)" > "$W/ans"
OUT="$(DATABASE_URL="$VERIFY_URL" python3 scripts/lib/pty_answer.py "$W/ans" -- npx tsx scripts/grant_access.ts "$S2_EMAIL" --reason "Bootstrap: the steward's own grant" 2>&1)"
echo "$OUT" | grep -q -- '--- exit 0 · secret echoed: False' && echo "$OUT" | grep -q 'the bootstrap' && ok "grant_access.ts, S2's own password: the bootstrap grant (over SSH, the stated trust root)" || bad "bootstrap: $OUT"
[ "$(precheck)" = "0" ] && ok "precheck = 0 — the deploy may restart" || bad "precheck after bootstrap: $(precheck)"
OUT="$(cd "$W/box" && bash step5b.sh 2>&1 || true)"
case "$OUT" in *"steward-grant pre-check: 0 tenants locked out"*"WOULD RESTART"*) ok "the deploy's step 5b passes and goes on to restart" ;; *) bad "step 5b after: $OUT" ;; esac
C="$(login "$W/s2b.jar" "$S2_EMAIL" "$(pw S2)")"; [ "$C" = "200" ] && ok "S2 signs in" || bad "S2 after bootstrap -> $C"

step "8. A steward without a current password also fails the pre-check"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S2' AND revoked_at IS NULL" > /dev/null
[ "$(precheck)" = "0" ] && ok "tenant 2 now has no current password at all -> not counted (nobody there could sign in anyway)" || bad "precheck: $(precheck)"
q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN2', 'T2 staff (verification)', 't2.$TS@locked.example')" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) SELECT id, '$(hash x)', 'verify' FROM persons WHERE email = 't2.$TS@locked.example'" > /dev/null
[ "$(precheck)" = "1" ] && ok "a tenant with a staff password but a steward without one -> counted (1)" || bad "precheck: $(precheck)"

step "9. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
