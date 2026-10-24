#!/usr/bin/env bash
#
# scripts/set_email.ts — local verification. Dev Mac only.
#
#   ./scripts/verify_set_email.sh
#
# Clone `lvrf_verifyemail` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated to the
# latest and hardened, dropped on exit. Every address used is a placeholder
# (.example / .invalid); no real address appears here.
# Stop `npm run dev` first.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
# The expected trigger total is read from db/hardening.sql's Verification
# block — the one place it is declared (CLAUDE.md: no file restates a
# canonical value).
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyemail
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3090
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
TMPCFG=tsconfig.tmp-verify-email.json
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -f "$TMPCFG"; }
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }
set_email() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/set_email.ts "$@" > /tmp/lvrf_se.out 2>&1; }

step "1. Typecheck (scripts/ is outside tsconfig.json's include, so a temporary config)"
printf '{ "extends": "./tsconfig.json", "include": ["scripts/set_email.ts", "server/**/*.ts"] }\n' > "$TMPCFG"
npx tsc -p "$TMPCFG" --noEmit && ok "set_email.ts and server typecheck" || bad "tsc"
rm -f "$TMPCFG"

step "2. Clone, migrate to latest, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /tmp/lvrf_hardening_email.log 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$EXPECT_TRIGGERS distinct triggers (hardening.sql total)" || bad "triggers: $T (expected $EXPECT_TRIGGERS)"

step "3. Fixtures"
STAFF="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
OLD="$(q "SELECT email FROM persons WHERE id = '$STAFF'")"
CUSTOMER_EMAIL="$(q "SELECT email FROM persons WHERE tenant_id IS NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
NEW="brad.verify.$(date +%s)@lvrf.example"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$STAFF', '$HASH', 'verify')" > /dev/null
# Band A deploy B: sign-in needs a current access grant. Name the staff person the
# tenant's steward (if none) and grant them access — the steward's own
# grant, the bootstrap shape access_grants_steward_only allows.
q "UPDATE tenants SET steward_person_id = '$STAFF' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$STAFF') AND steward_person_id IS NULL" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT p.id, p.tenant_id, t.steward_person_id, 'Verification fixture grant' FROM persons p JOIN tenants t ON t.id = p.tenant_id WHERE p.id = '$STAFF'" > /dev/null
CRED="$(q "SELECT id FROM person_credentials WHERE person_id = '$STAFF' AND revoked_at IS NULL")"
# A simulated VENDOR-STAFF person: no API path creates one, so inserted
# directly — the case P1's tests could not reach with local data.
SIM_EMAIL="sim.staff.$(date +%s)@lvrf.example"
SIM="$(q "INSERT INTO persons (tenant_id, full_name, email, simulated)
          SELECT tenant_id, '[SIM] Staff verification', '$SIM_EMAIL', true FROM persons WHERE id = '$STAFF' RETURNING id" | head -1)"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$SIM', '$HASH', 'verify')" > /dev/null
[ -n "$STAFF" ] && [ -n "$CRED" ] && [ -n "$SIM" ] && ok "staff ($OLD) with a credential; a simulated vendor-staff person with a credential" || bad "fixtures"
echo "  staff $STAFF · new address $NEW"

step "4. Refusals change nothing"
SNAP="SELECT md5(string_agg(row_to_json(p)::text, '|' ORDER BY id)) FROM persons p"
P_BEFORE="$(q "$SNAP")"; A_BEFORE="$(q "SELECT count(*) FROM audit_log")"
refused() {  # LABEL EXPECTED_SUBSTRING ARGS...
  local label="$1" want="$2"; shift 2
  if set_email "$@"; then bad "$label: exited 0"; return; fi
  if grep -q "Refused:" /tmp/lvrf_se.out && grep -qF -- "$want" /tmp/lvrf_se.out; then
    ok "$label -> $(grep -o 'Refused:.*' /tmp/lvrf_se.out | head -1)"
  else
    bad "$label: $(cat /tmp/lvrf_se.out)"
  fi
}
refused "unknown current email"           "0 current persons"       "nobody@example.invalid" "$NEW"
refused "customer-side current email"     "customer-side person"    "$CUSTOMER_EMAIL" "$NEW"
refused "simulated vendor-staff person"   "simulated person"        "$SIM_EMAIL" "$NEW"
refused "new email taken (other case)"    "already belongs"         "$OLD" "$(printf '%s' "$CUSTOMER_EMAIL" | tr '[:lower:]' '[:upper:]')"
refused "implausible new email"           "not a plausible"         "$OLD" "not-an-email"
refused "same email, other case"          "same as the current"     "$OLD" "$(printf '%s' "$OLD" | tr '[:lower:]' '[:upper:]')"
[ "$(q "$SNAP")" = "$P_BEFORE" ] && ok "persons unchanged by the refusals" || bad "a refusal changed persons"
[ "$(q "SELECT count(*) FROM audit_log")" = "$A_BEFORE" ] && ok "no audit rows written by the refusals" || bad "a refusal wrote audit rows"

step "5. The change: an audited UPDATE, self-attested"
UPDATED_BEFORE="$(q "SELECT updated_at FROM persons WHERE id = '$STAFF'")"
PERSONS_BEFORE="$(q "SELECT count(*) || '|' || count(*) FILTER (WHERE superseded_by_id IS NOT NULL) FROM persons")"
if set_email "$OLD" "$NEW"; then ok "set_email exited 0"; else bad "set_email failed: $(cat /tmp/lvrf_se.out)"; fi
sed 's/^/    /' /tmp/lvrf_se.out
PRINTED_PERSON="$(grep -oE 'person id: +[0-9a-f-]{36}' /tmp/lvrf_se.out | grep -oE '[0-9a-f-]{36}')"
PRINTED_AUDIT="$(grep -oE 'audit row id: +[0-9]+' /tmp/lvrf_se.out | grep -oE '[0-9]+$')"
[ "$PRINTED_PERSON" = "$STAFF" ] && ok "printed person id is the same person" || bad "printed person id: $PRINTED_PERSON"
ROW="$(q "SELECT operation || '|' || (old_row->>'email') || '|' || (new_row->>'email') || '|' || actor_person_id || '|' || record_id FROM audit_log WHERE id = '$PRINTED_AUDIT'")"
[ "$ROW" = "update|$OLD|$NEW|$STAFF|$STAFF" ] && ok "audit row $PRINTED_AUDIT: update, $OLD -> $NEW, actor = the person, record = the person" || bad "audit row: $ROW"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'persons' AND record_id = '$STAFF' AND id > $(( PRINTED_AUDIT - 1 ))")" = "1" ] && ok "exactly one audit row for the change" || bad "audit row count for the change is wrong"
[ "$(q "SELECT email FROM persons WHERE id = '$STAFF'")" = "$NEW" ] && ok "same person id now has the new email" || bad "email not changed on $STAFF"
[ "$(q "SELECT updated_at > '$UPDATED_BEFORE'::timestamptz FROM persons WHERE id = '$STAFF'")" = "t" ] && ok "persons_touch advanced updated_at" || bad "updated_at not advanced"
[ "$(q "SELECT count(*) || '|' || count(*) FILTER (WHERE superseded_by_id IS NOT NULL) FROM persons")" = "$PERSONS_BEFORE" ] && ok "no supersession: no person added, none superseded ($PERSONS_BEFORE)" || bad "persons count or supersession changed"
[ "$(q "SELECT id || '|' || (revoked_at IS NULL) FROM person_credentials WHERE person_id = '$STAFF'")" = "$CRED|true" ] && ok "credential unchanged ($CRED, still current, the only one)" || bad "credential changed"
refused "old email no longer exists"      "0 current persons"       "$OLD" "another.$(date +%s)@lvrf.example"

step "6. Sign-in follows the new email"
DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_email_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }
login() { curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -c /tmp/lvrf_email_jar.txt -X POST -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" "$BASE/api/auth/login"; }
C="$(login "$NEW" "$PW")"
[ "$C" = "200" ] && ok "sign-in with the new email -> 200" || bad "new email sign-in -> $C"
C="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -b /tmp/lvrf_email_jar.txt "$BASE/api/auth/me")"
[ "$C" = "200" ] && [ "$(node -e 'console.log(require("/tmp/lvrf_r.json").person.id)')" = "$STAFF" ] && ok "/me -> the same person id" || bad "/me -> $C"
C="$(login "$OLD" "$PW")"
[ "$C" = "401" ] && ok "sign-in with the old email -> 401" || bad "old email sign-in -> $C"
C="$(login "$SIM_EMAIL" "$PW")"
[ "$C" = "401" ] && ok "a simulated vendor-staff person with a valid credential -> 401" || bad "simulated staff sign-in -> $C"
rm -f /tmp/lvrf_email_jar.txt /tmp/lvrf_se.out

step "7. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
