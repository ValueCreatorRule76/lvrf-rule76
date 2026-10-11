#!/usr/bin/env bash
#
# Q3a hygiene batch — L5 (compare: 500 -> 422 on a payload without the
# confidence block), L3 (0030: value_outcome_evidence.supports held to its
# three values by a CHECK). L2 (the panel label) is a client string, checked
# here by source and in the browser. Local verification.
#
#   ./scripts/verify_hygiene.sh
#
# Clone `lvrf_verifyhygiene` (createdb -T lvrf -O lvrf_app), migrated to the
# latest (0030) and hardened, dropped on exit. The header is the actor
# (LVRF_ALLOW_ACTOR_HEADER=1 on this throwaway server only).

set -euo pipefail
cd "$(dirname "$0")/.."
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyhygiene
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3078
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_hygiene.XXXXXX")"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W"; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }
qerr() { psql -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1" 2>&1 || true; }
code() { local m="$1" p="$2"; shift 2; curl -s -o "$W/r.json" -w '%{http_code}' -X "$m" -H "x-actor-person-id: $STAFF" "$@" "$BASE$p"; }
rj() { node -e "try{const v=require('$W/r.json');console.log(String(v$1))}catch{console.log('')}"; }
JSON=(-H 'content-type: application/json')

step "1. Typecheck; the L2 label"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
grep -q "human_commit_of_record: 'Named human committer of record'" client/src/components/workbench/ConfidenceInstrument.tsx && ok "L2: the panel reads 'Named human committer of record'" || bad "L2 label not changed"
grep -rq "Named human sponsor of record" client/src && bad "L2: 'sponsor of record' still in the client" || ok "L2: 'sponsor of record' is gone from the client"

step "2. Clone, migrate to latest (0030), harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > /dev/null && ok "migrated (every existing supports value passed the new CHECK)"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$T triggers (0030 adds none)" || bad "triggers $T"
[ "$(q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'value_outcome_evidence_supports_known'")" = "CHECK ((supports = ANY (ARRAY['baseline'::text, 'actual'::text, 'impact_basis'::text])))" ] && ok "CHECK value_outcome_evidence_supports_known present" || bad "CHECK missing or different"

step "3. L3 — the CHECK holds outside the route"
STAFF="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
OUTCOME="$(q "SELECT vo.id FROM value_outcomes vo JOIN engagements e ON e.id = vo.engagement_id WHERE vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL AND e.deleted_at IS NULL ORDER BY vo.created_at LIMIT 1")"
INST="$(q "SELECT institution_id FROM value_outcomes WHERE id = '$OUTCOME'")"
ev() { q "INSERT INTO evidence (institution_id, kind, summary, provenance, confidence, captured_by_person_id) VALUES ('$INST', 'observation', 'Hygiene fixture', 'Verification fixture, not a source', 'low', '$STAFF') RETURNING id" | head -1; }
for bad_value in Actual actuals ''; do
  OUT="$(qerr "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OUTCOME', '$(ev)', '$bad_value')")"
  case "$OUT" in *value_outcome_evidence_supports_known*) ok "supports '$bad_value', by SQL -> refused by the CHECK" ;; *) bad "supports '$bad_value': $OUT" ;; esac
done
for good in baseline impact_basis; do
  OUT="$(qerr "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OUTCOME', '$(ev)', '$good')")"
  case "$OUT" in "INSERT 0 1"*) ok "supports '$good' -> accepted" ;; *) bad "supports '$good': $OUT" ;; esac
done
OUT="$(qerr "UPDATE value_outcome_evidence SET supports = 'Actual' WHERE value_outcome_id = '$OUTCOME' AND supports = 'baseline'")"
case "$OUT" in *value_outcome_evidence_supports_known*) ok "an UPDATE to 'Actual' -> refused" ;; *) bad "update: $OUT" ;; esac

step "4. Server"
env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; cat "$W/server.log"; exit 1; }
C="$(code POST "/api/value-outcomes/$OUTCOME/evidence" "${JSON[@]}" -d '{"kind":"observation","summary":"x","provenance":"Verification run, not a real source","supports":"Actual","confidence":"low"}')"
[ "$C" = "422" ] && ok "the route still answers 'Actual' with its own 422: $(rj .message | cut -c1-60)…" || bad "route supports -> $C"

step "5. L5 — compare: a payload without the confidence block is a 422, not a 500"
read -r OLD1 OLD2 <<< "$(q "SELECT string_agg(id::text, ' ' ORDER BY run_number) FROM (SELECT id, run_number FROM value_runs WHERE payload->'confidence' IS NULL AND locked_at IS NOT NULL ORDER BY run_number LIMIT 2) r")"
if [ -n "${OLD1:-}" ] && [ -n "${OLD2:-}" ] && [ "$(q "SELECT count(DISTINCT engagement_id) FROM value_runs WHERE id IN ('$OLD1','$OLD2')")" = "1" ]; then
  C="$(code GET "/api/value-runs/$OLD1/compare/$OLD2")"
  [ "$C" = "422" ] && [ "$(rj .message)" = "value run $OLD1 predates the confidence block in its payload; it cannot be compared factor by factor" ] && ok "two locked runs without the block -> 422: \"$(rj .message)\"" || bad "old runs -> $C $(cat "$W/r.json")"
else
  bad "no pair of locked, block-less runs in one engagement in this clone to test with"
fi
# Two current runs: produce and lock two on a one-outcome engagement.
ENG="$(q "SELECT e.id FROM engagements e WHERE e.deleted_at IS NULL AND e.superseded_by_id IS NULL AND (SELECT count(*) FROM value_outcomes vo WHERE vo.engagement_id = e.id AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL) = 1 ORDER BY e.created_at LIMIT 1")"
NEWRUNS=()
for i in 1 2; do
  C="$(code POST "/api/engagements/$ENG/produce-run" "${JSON[@]}" -d "{\"source_fixture\":\"hygiene-$i\",\"note\":\"Hygiene verification run $i\"}")"
  RID="$(rj .value_run_id)"
  [ "$C" = "201" ] && NEWRUNS+=("$RID") || bad "produce-run $i -> $C $(cat "$W/r.json")"
  code POST "/api/value-runs/$RID/lock" "${JSON[@]}" -d '{"lock_reason":"Hygiene verification"}' > /dev/null
done
if [ "${#NEWRUNS[@]}" = "2" ]; then
  C="$(code GET "/api/value-runs/${NEWRUNS[0]}/compare/${NEWRUNS[1]}")"
  [ "$C" = "200" ] && [ "$(rj .model.comparable)" = "true" ] && ok "two current runs -> 200, scored by the same model" || bad "current runs -> $C $(head -c 200 "$W/r.json")"
fi

step "6. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
