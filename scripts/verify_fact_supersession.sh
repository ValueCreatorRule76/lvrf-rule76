#!/usr/bin/env bash
#
# Fact supersession (0028) — a fact is corrected by a new fact, the old row
# kept with the reason. Local verification, dev Mac only.
#
#   ./scripts/verify_fact_supersession.sh
#
# Clone `lvrf_verifyfacts` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated to the
# latest (0028) and hardened, dropped on exit. The header is used as the
# actor (LVRF_ALLOW_ACTOR_HEADER=1 on this throwaway server only), as in
# the other verify scripts. The first correction it makes mirrors the real
# one — LVAF -> "LVRF (value realization records)" — on the clone only.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyfacts
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3082
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
R=/tmp/lvrf_facts_r.json
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -f "$R" /tmp/lvrf_facts_*.json /tmp/lvrf_facts_server.log; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }
qerr() { psql -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1" 2>&1 || true; }
code() {  # METHOD PATH [json] -> status; body in $R
  if [ $# -ge 3 ]; then
    curl -s -o "$R" -w '%{http_code}' -X "$1" -H 'content-type: application/json' -H "x-actor-person-id: $STAFF" -d "$3" "$BASE$2"
  else
    curl -s -o "$R" -w '%{http_code}' -X "$1" -H "x-actor-person-id: $STAFF" "$BASE$2"
  fi
}
msg() { node -e "try{console.log(require('$R').message??'')}catch{console.log('')}"; }
rj()  { node -e "console.log(require('$R')$1)"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone, migrate to latest (0028), harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$T triggers (0028 adds none)" || bad "triggers $T (expected $EXPECT_TRIGGERS)"
[ "$(q "SELECT count(*) FROM pg_constraint WHERE conname = 'institution_facts_supersession_reason'")" = "1" ] && ok "CHECK institution_facts_supersession_reason present" || bad "CHECK missing"
[ "$(q "SELECT count(*) FROM institution_facts WHERE (superseded_by_id IS NULL) <> (supersession_reason IS NULL)")" = "0" ] && ok "every existing fact satisfies the CHECK" || bad "existing rows violate the CHECK"

step "3. Fixtures and server"
STAFF="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
STAFF_NAME="$(q "SELECT full_name FROM persons WHERE id = '$STAFF'")"
TENANT="$(q "SELECT tenant_id FROM persons WHERE id = '$STAFF'")"
INST="$(q "SELECT id FROM institutions WHERE tenant_id = '$TENANT' AND NOT is_tenant_self AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
INST2="$(q "SELECT id FROM institutions WHERE tenant_id = '$TENANT' AND id <> '$INST' AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
[ -n "$STAFF" ] && [ -n "$INST" ] && [ -n "$INST2" ] && ok "staff, an account and a second account" || { bad "fixtures"; exit 1; }
env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_facts_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; cat /tmp/lvrf_facts_server.log; exit 1; }

EV='"evidence_kind":"observation","confidence":"low"'
P1='"provenance":"Recorded at the sign-in P2a verification write"'
code POST "/api/institutions/$INST/facts" "{\"kind\":\"system\",\"value_text\":\"LVAF\",\"as_of\":\"2026-10-11\",$EV,$P1}" > /dev/null
F1="$(rj .fact_id)"
[ -n "$F1" ] && [ "$F1" != "undefined" ] && ok "a system fact recorded with the typo: LVAF ($F1)" || { bad "could not record F1: $(msg)"; exit 1; }
SUP="/api/institutions/$INST/facts/$F1/supersede"
CORR="{\"value_text\":\"LVRF (value realization records)\",\"as_of\":\"2026-10-11\",$EV,\"provenance\":\"Same source as the original capture; it says LVRF\""
REASON='"supersession_reason":"Typed LVAF for LVRF at capture; the provenance says LVRF."'

step "4. Refused before anything is written"
FACTS0="$(q "SELECT count(*) FROM institution_facts")"; EV0="$(q "SELECT count(*) FROM evidence")"
C="$(code POST "$SUP" "$CORR}")"; [ "$C" = "422" ] && ok "no reason -> 422: $(msg)" || bad "no reason -> $C $(msg)"
C="$(code POST "$SUP" "$CORR,\"supersession_reason\":\"typo\"}")"; [ "$C" = "422" ] && ok "a 4-character reason -> 422" || bad "short reason -> $C $(msg)"
C="$(code POST "$SUP" "$CORR,$REASON,\"kind\":\"stated_priority\"}")"; [ "$C" = "422" ] && ok "changing the kind -> 422: $(msg | cut -c1-80)…" || bad "kind change -> $C $(msg)"
C="$(code POST "$SUP" "{\"value_text\":\"LVRF\",\"as_of\":\"2026-10-11\",$EV,\"provenance\":\"short\",$REASON}")"; [ "$C" = "422" ] && ok "a short provenance -> 422" || bad "short provenance -> $C"
C="$(code POST "/api/institutions/$INST2/facts/$F1/supersede" "$CORR,$REASON}")"; [ "$C" = "404" ] && ok "the fact via another account's path -> 404: $(msg)" || bad "wrong account -> $C $(msg)"
C="$(code POST "/api/institutions/$INST/facts/00000000-0000-4000-8000-000000000000/supersede" "$CORR,$REASON}")"; [ "$C" = "404" ] && ok "an unknown fact -> 404" || bad "unknown fact -> $C"
[ "$(q "SELECT count(*) FROM institution_facts")" = "$FACTS0" ] && [ "$(q "SELECT count(*) FROM evidence")" = "$EV0" ] && ok "  ...no fact and no evidence row written by any of them" || bad "a refused correction wrote rows"

step "5. The correction: LVAF -> LVRF (value realization records)"
AUD0="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"
C="$(code POST "$SUP" "$CORR,$REASON}")"
F2="$(rj .fact_id)"
[ "$C" = "201" ] && [ "$(rj .superseded_fact_id)" = "$F1" ] && ok "201: fact $F2 supersedes $F1" || bad "correction -> $C $(msg)"
[ "$(q "SELECT value_text FROM institution_facts WHERE id = '$F1'")" = "LVAF" ] && ok "the old row keeps its value: LVAF (the typo stays in history)" || bad "the old row was edited"
[ "$(q "SELECT superseded_by_id FROM institution_facts WHERE id = '$F1'")" = "$F2" ] && ok "  ...and points at its successor" || bad "superseded_by_id wrong"
[ "$(q "SELECT supersession_reason FROM institution_facts WHERE id = '$F1'")" = "Typed LVAF for LVRF at capture; the provenance says LVRF." ] && ok "  ...and carries the reason" || bad "reason not stored"
[ "$(q "SELECT kind || '|' || value_text || '|' || captured_by_person_id || '|' || (superseded_by_id IS NULL)::text || '|' || (supersession_reason IS NULL)::text FROM institution_facts WHERE id = '$F2'")" = "system|LVRF (value realization records)|$STAFF|true|true" ] && ok "the new fact: same kind, the corrected value, captured by the actor, current, no reason of its own" || bad "new fact wrong"
[ "$(q "SELECT evidence_id <> (SELECT evidence_id FROM institution_facts WHERE id = '$F1') FROM institution_facts WHERE id = '$F2'")" = "t" ] && ok "  ...with its own evidence row" || bad "evidence shared"
A="$(q "SELECT string_agg(table_name || ':' || operation || ':' || (actor_person_id = '$STAFF'), ',' ORDER BY id) FROM audit_log WHERE id > $AUD0 AND table_name IN ('institution_facts','evidence')")"
case "$A" in *"institution_facts:update:true"*) ok "audit: the old row's UPDATE, actor = the person correcting ($A)" ;; *) bad "audit rows: $A" ;; esac
case "$A" in *"institution_facts:insert:true"*) ok "audit: the new fact's INSERT, same actor" ;; *) bad "no insert audit: $A" ;; esac
C="$(code POST "$SUP" "$CORR,$REASON}")"; [ "$C" = "409" ] && [ "$(msg)" = "fact $F1 was already corrected by fact $F2; correct the current fact instead" ] && ok "correcting the old fact again -> 409, naming the current one" || bad "re-correct -> $C $(msg)"

step "6. The account view: the current fact, with its history"
code GET "/api/institutions/$INST/view" > /dev/null
V="$(node -e "
const v=require('$R'); const sys=v.facts.filter(f=>f.kind==='system');
const ids=sys.map(f=>f.id); const f=sys.find(f=>f.id==='$F2');
console.log([ids.includes('$F1'), ids.includes('$F2'), f?.history.length, f?.history[0]?.value_text, f?.history[0]?.supersession_reason, f?.history[0]?.superseded_by].join('|'))")"
[ "$V" = "false|true|1|LVAF|Typed LVAF for LVRF at capture; the provenance says LVRF.|$STAFF_NAME" ] && ok "only the current fact is listed; its history holds LVAF, the reason and who replaced it" || bad "view: $V"
F3="$(code POST "/api/institutions/$INST/facts/$F2/supersede" "{\"value_text\":\"LVRF\",\"as_of\":\"2026-10-11\",$EV,\"provenance\":\"Shortened to the product name only\",\"supersession_reason\":\"Name only; the description belongs elsewhere.\"}" > /dev/null; rj .fact_id)"
code GET "/api/institutions/$INST/view" > /dev/null
V="$(node -e "const f=require('$R').facts.find(f=>f.id==='$F3'); console.log(f?.history.map(h=>h.value_text).join(' < '))")"
[ "$V" = "LVRF (value realization records) < LVAF" ] && ok "a chain of two: the history is newest first ($V)" || bad "chain history: $V"

step "7. Zero is data"
code POST "/api/institutions/$INST/facts" "{\"kind\":\"headcount\",\"value_numeric\":12,\"unit\":\"people\",\"as_of\":\"2026-01-01\",$EV,\"provenance\":\"Verification headcount fixture\"}" > /dev/null
H1="$(rj .fact_id)"
C="$(code POST "/api/institutions/$INST/facts/$H1/supersede" "{\"value_numeric\":0,\"unit\":\"people\",\"as_of\":\"2026-01-01\",$EV,\"provenance\":\"Verification headcount fixture\",\"supersession_reason\":\"The count was of a closed site: zero.\"}")"
H2="$(rj .fact_id)"
[ "$C" = "201" ] && [ "$(q "SELECT value_numeric FROM institution_facts WHERE id = '$H2'")" = "0" ] && ok "a correction to 0 is stored as 0, not null" || bad "zero -> $C $(msg) / $(q "SELECT value_numeric FROM institution_facts WHERE id = '$H2'")"

step "8. Two corrections racing: exactly one wins, the loser writes nothing"
# Made deterministic: a psql session holds F3's row lock for 3 seconds, so
# both requests read F3 as current, insert their facts, and queue on the
# UPDATE. When the lock is released the first UPDATE wins; the second must
# be stopped by the guard (superseded_by_id IS NULL), not by luck.
FACTS1="$(q "SELECT count(*) FROM institution_facts")"
psql -q -d "$VERIFY_DB" -c "BEGIN; SELECT id FROM institution_facts WHERE id = '$F3' FOR UPDATE; SELECT pg_sleep(3); COMMIT;" > /dev/null &
LOCK_PID=$!
sleep 0.7
for i in 1 2; do
  curl -s -o "/tmp/lvrf_facts_race$i.json" -w '%{http_code}\n' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $STAFF" \
    -d "{\"value_text\":\"LVRF race $i\",\"as_of\":\"2026-10-11\",$EV,\"provenance\":\"Race verification $i\",\"supersession_reason\":\"Race verification, request $i.\"}" \
    "$BASE/api/institutions/$INST/facts/$F3/supersede" > "/tmp/lvrf_facts_race$i.code" &
  RACE_PIDS="${RACE_PIDS:-} $!"
done
# Wait for the two requests only — a bare `wait` would also wait for the
# server, which never exits.
for pid in $RACE_PIDS; do wait "$pid"; done
wait "$LOCK_PID"
CODES="$(cat /tmp/lvrf_facts_race1.code /tmp/lvrf_facts_race2.code | sort | tr '\n' ' ')"
[ "$CODES" = "201 409 " ] && ok "statuses: $CODES" || bad "race statuses: $CODES"
[ "$(q "SELECT count(*) FROM institution_facts")" = "$((FACTS1 + 1))" ] && ok "exactly one new fact — the loser's rolled back" || bad "fact count after race: $(q "SELECT count(*) FROM institution_facts") (was $FACTS1)"
[ "$(q "SELECT count(*) FROM institution_facts WHERE institution_id = '$INST' AND kind = 'system' AND superseded_by_id IS NULL")" = "1" ] && ok "one current system fact on the account" || bad "more than one current system fact"

step "9. The CHECK holds outside the route"
# A fresh, correctly ordered pair (X1 older, X2 newer), so the chain itself
# is valid and _supersession_sane passes — what refuses is the CHECK alone.
code POST "/api/institutions/$INST/facts" "{\"kind\":\"stated_priority\",\"value_text\":\"Check fixture one\",\"as_of\":\"2026-01-01\",$EV,\"provenance\":\"Verification CHECK fixture\"}" > /dev/null; X1="$(rj .fact_id)"
code POST "/api/institutions/$INST/facts" "{\"kind\":\"stated_priority\",\"value_text\":\"Check fixture two\",\"as_of\":\"2026-01-01\",$EV,\"provenance\":\"Verification CHECK fixture\"}" > /dev/null; X2="$(rj .fact_id)"
OUT="$(qerr "UPDATE institution_facts SET superseded_by_id = '$X2' WHERE id = '$X1'")"
case "$OUT" in *institution_facts_supersession_reason*) ok "superseded_by_id without a reason, by SQL -> refused by the CHECK" ;; *) bad "no-reason UPDATE: $OUT" ;; esac
OUT="$(qerr "UPDATE institution_facts SET superseded_by_id = '$X2', supersession_reason = 'short' WHERE id = '$X1'")"
case "$OUT" in *institution_facts_supersession_reason*) ok "a reason under 12 characters, by SQL -> refused by the CHECK" ;; *) bad "short reason UPDATE: $OUT" ;; esac
OUT="$(qerr "UPDATE institution_facts SET supersession_reason = 'A reason with no successor.' WHERE id = '$X1'")"
case "$OUT" in *institution_facts_supersession_reason*) ok "a reason on a current fact, by SQL -> refused by the CHECK" ;; *) bad "reason without successor: $OUT" ;; esac
OUT="$(qerr "UPDATE institution_facts SET superseded_by_id = '$X2', supersession_reason = 'Verification: a stated reason.' WHERE id = '$X1'")"
case "$OUT" in UPDATE\ 1*) ok "  ...and the same UPDATE WITH a reason is accepted (the CHECK refuses only what it should)" ;; *) bad "valid UPDATE refused: $OUT" ;; esac
OUT="$(qerr "DELETE FROM institution_facts WHERE id = '$F1'")"
case "$OUT" in *ERROR*) ok "the superseded row cannot be deleted" ;; *) bad "delete: $OUT" ;; esac

step "10. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
