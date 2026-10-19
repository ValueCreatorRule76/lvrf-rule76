#!/usr/bin/env bash
#
# actorContext commits BEFORE the response — local verification. Dev Mac only.
#
#   ./scripts/verify_commit_before_response.sh
#
# Clone `lvrf_verifycommit` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated to the
# latest and hardened, dropped on exit. Stop `npm run dev` first.
#
# Two kinds of check:
#   DETERMINISTIC — a failing COMMIT. A clone-only DEFERRABLE constraint
#     trigger refuses, at COMMIT time, any exclusion named 'COMMIT-FAIL'.
#     The old middleware committed after the response, so this returned 201
#     while the row was rolled back. The new one must return 500 saying the
#     write was not committed, and no row may exist. This is the proof.
#   SUPPORTING — read-after-write. Many POSTs each followed immediately by
#     a GET that must see the row. The old code could pass this by luck, so
#     it is evidence, not proof.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifycommit
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3092
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone, migrate to latest, harden, add the clone-only COMMIT-time failure"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /tmp/lvrf_hardening_commit.log 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
# THIS CLONE ONLY. Never in a migration or hardening.sql.
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" <<'SQL'
CREATE FUNCTION verify_fail_at_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name = 'COMMIT-FAIL' THEN
    RAISE EXCEPTION 'verification: refused at COMMIT time' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER verify_fail_at_commit
  AFTER INSERT ON industry_measure_exclusions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_fail_at_commit();
SQL
ok "clone-only deferred trigger installed"

step "3. API against the clone, port ${PORT}"
LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_commit_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }

ACTOR="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
# Band A item 2: the steward's acts (accept, reject, exclude, retire) need
# the actor to be the tenant's steward — name them, as the box's
# set_steward.ts would.
q "UPDATE tenants SET steward_person_id = '$ACTOR' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$ACTOR') AND steward_person_id IS NULL" > /dev/null
read -r IND SLUG <<< "$(q "SELECT i.id || ' ' || i.slug FROM industries i JOIN persons p ON p.id = '$ACTOR' AND p.tenant_id = i.tenant_id ORDER BY i.slug LIMIT 1")"
X="/api/industries/$IND/exclusions"

step "4. DETERMINISTIC: a COMMIT that fails is not reported as success"
C="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
  -d '{"name":"COMMIT-FAIL","reason":"Verification: this must fail at COMMIT time."}' "$BASE$X")"
MSG="$(node -e 'try{console.log(require("/tmp/lvrf_r.json").message)}catch{console.log("")}')"
[ "$C" = "500" ] && ok "response is 500, not 201" || bad "response is $C (the old code returned 201 here)"
case "$MSG" in *"was not committed"*) ok "message says the write was not committed: $MSG" ;; *) bad "message: $MSG" ;; esac
[ "$(q "SELECT count(*) FROM industry_measure_exclusions WHERE name = 'COMMIT-FAIL'")" = "0" ] && ok "no row exists" || bad "a row exists"
# The old middleware did worse than answer 201: its COMMIT ran in
# res.once('finish') as `void finalize(...)`, so the failure was an
# unhandled rejection and the whole API process exited (seen at Gate A on
# 7df208c's actorContext.ts). The server must still be answering.
sleep 0.5
curl -s -o /dev/null "$BASE/api/health" && ok "the API process survived the failed COMMIT" || { bad "the API process died after the failed COMMIT"; exit 1; }
# A failed COMMIT must leave a trace on the server too, not only in the
# caller's 500: before, journalctl would have shown nothing.
grep -q 'LVRF: COMMIT failed; the write was not saved.' /tmp/lvrf_verify_commit_server.log \
  && ok "the server logged the failed COMMIT" || bad "no server-side log line for the failed COMMIT"

step "5. A normal write still succeeds, and a refusal still rolls back"
C="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
  -d '{"name":"Verification normal","reason":"Verification: an ordinary exclusion."}' "$BASE$X")"
[ "$C" = "201" ] && ok "normal write -> 201" || bad "normal write -> $C"
C="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
  -d '{"name":"Verification normal","reason":"Verification: duplicate, must be 409."}' "$BASE$X")"
[ "$C" = "409" ] && ok "duplicate -> 409" || bad "duplicate -> $C"
[ "$(q "SELECT count(*) FROM industry_measure_exclusions WHERE name = 'Verification normal'")" = "1" ] && ok "exactly one row" || bad "row count wrong"
C="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' "$BASE$X" -d '{}')"
# Since sign-in P2a, requireActor answers a request with no actor (401)
# before actorContext opens a transaction; it was actorContext's 422 in P1.
[ "$C" = "401" ] && ok "no actor -> 401 (requireActor, before any transaction)" || bad "no actor -> $C"

step "6. SUPPORTING: read-after-write, 25 times"
MISSES=0
for i in $(seq 1 25); do
  N="Verification raw $i $(date +%s%N)"
  curl -s -o /dev/null -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
    -d "{\"name\":\"$N\",\"reason\":\"Verification: read-after-write.\"}" "$BASE$X"
  curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/industries/$SLUG/pack" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.exit(JSON.parse(s).exclusions.some(x=>x.name===process.argv[1])?0:1))" "$N" \
    || MISSES=$((MISSES + 1))
done
[ "$MISSES" = "0" ] && ok "25 of 25 immediate reads saw the row just written" || bad "$MISSES of 25 immediate reads missed the row"

step "7. The pool is not leaking connections"
sleep 1
IDLE_TX="$(q "SELECT count(*) FROM pg_stat_activity WHERE datname = '$VERIFY_DB' AND state = 'idle in transaction'")"
[ "$IDLE_TX" = "0" ] && ok "no connection left idle in transaction" || bad "$IDLE_TX connection(s) idle in transaction"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
