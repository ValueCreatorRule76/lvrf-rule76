#!/usr/bin/env bash
#
# POST /api/engagements/:id/retire — local verification. Dev Mac only.
#
#   ./scripts/verify_engagement_retire.sh
#
# Runs against `lvrf_verifyretire`, a `make_clone` clone (createdb -T lvrf, then db/ownership.sql)
# dropped on exit — a retirement cannot be undone, so it is never tested on
# the real local lvrf. Stop `npm run dev` first. No migration is involved.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyretire
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3097
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; }
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone local lvrf -> ${VERIFY_DB}"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
# Q4n: the cohort reads reference_example_markers (0036), so the clone is
# migrated to the newest migration and hardened, as every other verify clone is.
migrate_clone "$VERIFY_DB" > /tmp/lvrf_retire_migrate.log 2>&1 || { echo "migrate failed: $(tail -3 /tmp/lvrf_retire_migrate.log)"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 || { echo "hardening failed"; exit 1; }

step "3. API against the clone, port ${PORT}"
LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_retire_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }

ACTOR="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
# Band A item 2: the steward's acts (accept, reject, exclude, retire) need
# the actor to be the tenant's steward — name them, as the box's
# set_steward.ts would.
q "UPDATE tenants SET steward_person_id = '$ACTOR' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$ACTOR') AND steward_person_id IS NULL" > /dev/null
# The CUSTOMER engagement with the most runs, so 'runs left in place' is a
# real test — and so 'gone from the cohort' is too: the cohort excludes the
# tenant's own account, so retiring a tenant-self engagement would pass that
# check whether or not retirement worked.
ENG="$(q "SELECT e.id FROM engagements e
          JOIN institutions i ON i.id = e.institution_id AND NOT i.is_tenant_self
          LEFT JOIN value_runs vr ON vr.engagement_id = e.id
          WHERE e.deleted_at IS NULL AND e.superseded_by_id IS NULL
          GROUP BY e.id ORDER BY count(vr.id) DESC LIMIT 1")"
RUNS_BEFORE="$(q "SELECT count(*) FROM value_runs WHERE engagement_id = '$ENG' AND deleted_at IS NULL")"
[ -n "$ENG" ] || { bad "no engagement in the clone"; exit 1; }
echo "  engagement $ENG · $RUNS_BEFORE runs"

post() {  # PATH BODY EXPECTED LABEL
  local code msg
  code="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST -H 'content-type: application/json' \
    -H "x-actor-person-id: $ACTOR" -d "$2" "$BASE$1")"
  msg="$(node -e 'try{const b=require("/tmp/lvrf_r.json");console.log(b.message??JSON.stringify(b))}catch{console.log("")}')"
  if [ "$code" = "$3" ]; then ok "$4 -> $code  $msg"; else bad "$4 -> $code (expected $3)  $msg"; fi
}

step "4. Refusals"
post "/api/engagements/$ENG/retire" '{}' 422 "no reason refused"
post "/api/engagements/$ENG/retire" '{"retirement_reason":"short"}' 422 "reason under 12 characters refused"
post "/api/engagements/00000000-0000-0000-0000-000000000000/retire" '{"retirement_reason":"Verification: unknown engagement."}' 404 "unknown engagement -> 404"
[ "$(q "SELECT deleted_at IS NULL FROM engagements WHERE id = '$ENG'")" = "t" ] && ok "refusals left the engagement current" || bad "a refusal retired it"
# Precondition for step 5's 'gone from the cohort': it must be in it first.
curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/cohort" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.exit(JSON.parse(s).book.members.some(m=>m.engagement_id==='$ENG')?0:1))" \
  && ok "is a cohort member before retirement" || bad "not a cohort member before retirement, so the cohort check below would prove nothing"

step "5. Retire"
post "/api/engagements/$ENG/retire" '{"retirement_reason":"Verification: retiring on a throwaway clone."}' 200 "retire"
# boolean || text renders 'true', not psql's 't' display form.
[ "$(q "SELECT status || '|' || (deleted_at IS NOT NULL) FROM engagements WHERE id = '$ENG'")" = "retired|true" ] && ok "status retired and deleted_at set" || bad "row state: $(q "SELECT status, deleted_at FROM engagements WHERE id = '$ENG'")"
[ "$(q "SELECT count(*) FROM value_runs WHERE engagement_id = '$ENG' AND deleted_at IS NULL")" = "$RUNS_BEFORE" ] && ok "all $RUNS_BEFORE runs left in place" || bad "runs changed"
EV="$(node -e 'console.log(require("/tmp/lvrf_r.json").evidence_id)')"
[ "$(q "SELECT captured_by_person_id = '$ACTOR' AND kind = 'observation' AND source_verified = false FROM evidence WHERE id = '$EV'")" = "t" ] && ok "reason recorded as an unverified observation by the actor" || bad "evidence row wrong"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'engagements' AND record_id = '$ENG' AND operation = 'soft_delete' AND actor_person_id = '$ACTOR'")" -ge 1 ] && ok "audit_log records a soft_delete with the actor" || bad "no attributed audit row"
curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/engagements" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.exit(JSON.parse(s).some(e=>e.id==='$ENG')?1:0))" \
  && ok "gone from /api/engagements" || bad "still listed in /api/engagements"
curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/cohort" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.exit(JSON.parse(s).book.members.some(m=>m.engagement_id==='$ENG')?1:0))" \
  && ok "gone from the cohort" || bad "still a cohort member"

step "6. After"
post "/api/engagements/$ENG/retire" '{"retirement_reason":"Verification: second retirement."}' 404 "retiring again -> 404"
if psql -q -d "$VERIFY_DB" -c "DELETE FROM engagements WHERE id = '$ENG'" > /tmp/lvrf_del.log 2>&1; then
  bad "hard DELETE allowed"
else
  ok "hard DELETE still refused: $(grep -o 'ERROR:.*' /tmp/lvrf_del.log | head -1)"
fi

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
