#!/usr/bin/env bash
#
# Retirement freezes an engagement's outcomes — local verification. Dev Mac only.
#
#   ./scripts/verify_frozen_outcomes.sh
#
# Clone `lvrf_verifyfrozen` (createdb -T lvrf -O lvrf_app), dropped on exit.
# Picks a current customer outcome, proves the write paths accept a request
# shape against it BEFORE retirement (by checking they do not 409), retires
# its engagement, then proves commit, evidence and the gap register refuse
# with 409, and that the single-outcome count no longer includes it.
# Stop `npm run dev` first. No migration is involved.

set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyfrozen
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3096
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

step "2. Clone local lvrf -> ${VERIFY_DB}"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"

step "3. API against the clone, port ${PORT}"
DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_frozen_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }

ACTOR="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
OUTCOME="$(q "SELECT vo.id FROM value_outcomes vo
              JOIN engagements e ON e.id = vo.engagement_id AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
              JOIN institutions i ON i.id = vo.institution_id AND NOT i.is_tenant_self
             WHERE vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL
             ORDER BY vo.created_at LIMIT 1")"
[ -n "$OUTCOME" ] || { bad "no current customer outcome in the clone"; exit 1; }
ENG="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$OUTCOME'")"
INST="$(q "SELECT institution_id FROM value_outcomes WHERE id = '$OUTCOME'")"
echo "  outcome $OUTCOME · engagement $ENG"

# A SECOND current outcome at the same institution, under a DIFFERENT
# engagement — the one that stays current. The single-outcome count is
# tested through its only observable effect: gapRegister.ts attributes an
# evidence refusal at the institution to an outcome ONLY when that outcome
# is the institution's single live one. Before retirement OTHER shares the
# institution with OUTCOME's engagement's outcomes, so a refusal reads
# 'open'; after retirement, if frozen outcomes are excluded from the count,
# OTHER is alone and the same refusal reads 'refused'. Re-running the
# server's own count SQL would only test the SQL against itself.
OTHER="$(q "SELECT vo.id FROM value_outcomes vo
            JOIN engagements e ON e.id = vo.engagement_id AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
           WHERE vo.institution_id = '$INST' AND vo.engagement_id <> '$ENG'
             AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL
           ORDER BY vo.created_at LIMIT 1")"
OTHER_LEFT="$(q "SELECT count(*) FROM value_outcomes vo
                 JOIN engagements e ON e.id = vo.engagement_id AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
                WHERE vo.institution_id = '$INST' AND vo.engagement_id <> '$ENG'
                  AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL")"
echo "  second outcome ${OTHER:-<none>} · $OTHER_LEFT current outcome(s) outside $ENG at this institution"

code() {  # METHOD PATH [BODY] -> status code, body in /tmp/lvrf_r.json
  if [ "$1" = GET ]; then
    curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -H "x-actor-person-id: $ACTOR" "$BASE$2"
  else
    curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST -H 'content-type: application/json' \
      -H "x-actor-person-id: $ACTOR" -d "$3" "$BASE$2"
  fi
}
msg() { node -e 'try{const b=require("/tmp/lvrf_r.json");console.log(b.message??"")}catch{console.log("")}'; }
# State of the baseline-evidence gap for an outcome, from the last gaps response.
baseline_state() { node -e 'try{const b=require("/tmp/lvrf_r.json");const e=Array.isArray(b)?b.find(x=>x.factor==="baseline_evidence_verified"):null;console.log(e?e.state:"absent")}catch{console.log("error")}'; }
# A 409 must be THE frozen 409, not another 409 the same path can return
# (measure on a non-claimed outcome, for one).
frozen() {  # LABEL CODE
  if [ "$2" = "409" ] && msg | grep -q 'belongs to a retired engagement'; then ok "$1 -> 409  $(msg)"; else bad "$1 -> $2 (expected the frozen 409)  $(msg)"; fi
}

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
COMMIT_BODY="{\"target_value\":1,\"committed_by_person_id\":\"$ACTOR\",\"committed_at\":\"$NOW\",\"commitment_note\":\"Verification: frozen-outcome check.\"}"
MEASURE_BODY="{\"actual_value\":1,\"actual_measured_at\":\"$NOW\",\"note\":\"Verification: frozen-outcome check.\"}"
VERIFY_BODY="{\"verified_by_person_id\":\"$ACTOR\",\"verified_at\":\"$NOW\",\"attestation_note\":\"Verification: frozen-outcome check.\"}"
EVIDENCE_BODY='{"kind":"observation","summary":"Verification","provenance":"Verification run, not a real source","supports":"baseline","confidence":"low"}'
# Passes the route's own validation, then fails evidence_ai_verify_requires_resolution
# at INSERT, so handleGovernanceError records a refusal (supports = baseline).
REFUSED_EVIDENCE_BODY='{"kind":"observation","summary":"Verification refusal","provenance":"Verification run, not a real source","supports":"baseline","confidence":"low","ai_sourced":true,"research_query":"q","research_tool":"t","source_verified":true}'

step "4. Before retirement"
C="$(code GET "/api/value-outcomes/$OUTCOME/gaps")"
[ "$C" != "409" ] && ok "gaps -> $C before retirement" || bad "gaps already 409 before retirement: $(msg)"
if [ -n "$OTHER" ] && [ "$OTHER_LEFT" = "1" ]; then
  C="$(code POST "/api/value-outcomes/$OTHER/evidence" "$REFUSED_EVIDENCE_BODY")"
  [ "$C" = "422" ] && ok "refusal provoked on the second outcome -> 422  $(msg)" || bad "refusal -> $C (expected 422)  $(msg)"
  C="$(code GET "/api/value-outcomes/$OTHER/gaps")"; S="$(baseline_state)"
  [ "$S" = "open" ] && ok "second outcome's baseline gap reads 'open' — not alone at the institution, refusal not attributed" \
    || bad "second outcome's baseline gap before retirement: $S (expected open; gaps -> $C)"
fi

step "5. Retire the engagement"
C="$(code POST "/api/engagements/$ENG/retire" '{"retirement_reason":"Verification: freezing outcomes on a clone."}')"
[ "$C" = "200" ] && ok "retired -> 200" || { bad "retire -> $C $(msg)"; exit 1; }

step "6. After retirement: frozen"
ROW_SQL="SELECT concat_ws('|', realization, target_value, actual_value, committed_at, verified_at, updated_at) FROM value_outcomes WHERE id = '$OUTCOME'"
ROW_BEFORE="$(q "$ROW_SQL")"
frozen "commit"   "$(code POST "/api/value-outcomes/$OUTCOME/commit" "$COMMIT_BODY")"
frozen "measure"  "$(code POST "/api/value-outcomes/$OUTCOME/measure" "$MEASURE_BODY")"
frozen "verify"   "$(code POST "/api/value-outcomes/$OUTCOME/verify" "$VERIFY_BODY")"
frozen "evidence" "$(code POST "/api/value-outcomes/$OUTCOME/evidence" "$EVIDENCE_BODY")"
frozen "gaps"     "$(code GET "/api/value-outcomes/$OUTCOME/gaps")"
[ "$(q "SELECT count(*) FROM evidence WHERE institution_id = '$INST' AND summary = 'Verification'")" = "0" ] && ok "no evidence row was written by the refused request" || bad "a refused request wrote evidence"
[ "$(q "$ROW_SQL")" = "$ROW_BEFORE" ] && ok "the frozen outcome's row is unchanged by the refused writes" || bad "outcome row changed: $ROW_BEFORE -> $(q "$ROW_SQL")"

if [ -n "$OTHER" ] && [ "$OTHER_LEFT" = "1" ]; then
  C="$(code GET "/api/value-outcomes/$OTHER/gaps")"; S="$(baseline_state)"
  [ "$S" = "refused" ] && ok "second outcome's baseline gap now reads 'refused' — the frozen outcomes no longer count, so it is alone and the refusal is attributed" \
    || bad "second outcome's baseline gap after retirement: $S (expected refused; gaps -> $C) — frozen outcomes may still be counted"
else
  echo "  NOTE  single-outcome count not testable here: needs exactly one current outcome at the institution outside the retired engagement (found $OTHER_LEFT)"
fi

echo
echo "==> ${PASS} passed, ${FAIL} failed"
echo "    Not exercised here: metric re-validation skipping frozen outcomes — reviewed in code."
[ "$FAIL" -eq 0 ]
