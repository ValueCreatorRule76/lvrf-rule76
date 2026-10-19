#!/usr/bin/env bash
#
# L26 — a run under a retired engagement keeps its account, marked
# engagement_retired, in GET /api/runs and GET /api/runs/:id. Local
# verification.
#
#   ./scripts/verify_runs_list.sh
#
# Clone `lvrf_verifyrunslist` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated and
# hardened, dropped on exit. The header is the actor
# (LVRF_ALLOW_ACTOR_HEADER=1 on this throwaway server only).

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyrunslist
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3076
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_runslist.XXXXXX")"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W"; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone, migrate, harden; retire one engagement that has runs"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
STAFF="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND NOT simulated AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
ENG_R="$(q "SELECT e.id FROM engagements e WHERE e.deleted_at IS NULL AND EXISTS (SELECT 1 FROM value_runs v WHERE v.engagement_id = e.id) ORDER BY e.created_at LIMIT 1")"
ENG_C="$(q "SELECT e.id FROM engagements e WHERE e.deleted_at IS NULL AND e.id <> '$ENG_R' AND EXISTS (SELECT 1 FROM value_runs v WHERE v.engagement_id = e.id) ORDER BY e.created_at LIMIT 1")"
INST_R="$(q "SELECT i.name FROM engagements e JOIN institutions i ON i.id = e.institution_id WHERE e.id = '$ENG_R'")"
RUN_R="$(q "SELECT id FROM value_runs WHERE engagement_id = '$ENG_R' ORDER BY run_number LIMIT 1")"
RUN_C="$(q "SELECT id FROM value_runs WHERE engagement_id = '$ENG_C' ORDER BY run_number LIMIT 1")"
N_R="$(q "SELECT count(*) FROM value_runs WHERE engagement_id = '$ENG_R' AND deleted_at IS NULL")"
q "UPDATE engagements SET deleted_at = now(), status = 'retired' WHERE id = '$ENG_R'" > /dev/null
[ -n "$RUN_R" ] && [ -n "$RUN_C" ] && ok "retired an engagement of '$INST_R' with $N_R runs; another engagement stays current" || { bad "fixtures"; exit 1; }

step "3. Server"
env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
get() { curl -s -H "x-actor-person-id: $STAFF" "$BASE$1" > "$W/r.json"; }

step "4. GET /api/runs"
get /api/runs
read -r RET_N RET_NAMED RET_FLAG CUR_FLAG <<< "$(node -e "
const rows=require('$W/r.json'); const r=rows.filter(x=>x.id && x.engagement_retired===true); const c=rows.filter(x=>x.id==='$RUN_C');
console.log(r.length, r.filter(x=>x.institution_name==='$INST_R').length, rows.every(x=>typeof x.engagement_retired==='boolean'), c[0] && c[0].engagement_retired===false)")"
[ "$RET_N" = "$N_R" ] && [ "$RET_NAMED" = "$N_R" ] && ok "the $N_R runs of the retired engagement: engagement_retired true, and still named '$INST_R'" || bad "retired rows: $RET_N flagged, $RET_NAMED named (expected $N_R)"
[ "$RET_FLAG" = "true" ] && ok "every row carries engagement_retired as a boolean" || bad "engagement_retired missing or not boolean"
[ "$CUR_FLAG" = "true" ] && ok "a run of a current engagement: engagement_retired false" || bad "current run flag"

step "5. GET /api/runs/:id"
get "/api/runs/$RUN_R"
[ "$(node -e "const r=require('$W/r.json');console.log(r.institution_name==='$INST_R' && r.engagement_retired===true)")" = "true" ] && ok "a retired engagement's run: account '$INST_R', engagement_retired true" || bad "run detail: $(head -c 200 "$W/r.json")"
get "/api/runs/$RUN_C"
[ "$(node -e "const r=require('$W/r.json');console.log(r.engagement_retired===false && r.institution_name!==null)")" = "true" ] && ok "a current engagement's run: engagement_retired false, account present" || bad "current run detail"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
