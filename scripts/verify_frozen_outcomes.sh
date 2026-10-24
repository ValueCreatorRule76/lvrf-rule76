#!/usr/bin/env bash
#
# Retirement freezes an engagement's outcomes — local verification. Dev Mac only.
#
#   ./scripts/verify_frozen_outcomes.sh
#
# Clone `lvrf_verifyfrozen` (make_clone: createdb -T lvrf, then db/ownership.sql), dropped on exit.
# Migrated to the repo's latest migration and hardened, so it runs against
# the code's schema even when local lvrf is behind. Picks a current customer
# outcome, retires its engagement, then proves commit, measure, verify,
# evidence and the gap register refuse with the frozen 409. A second outcome
# at the same institution checks exact refusal attribution (0025) across
# the retirement. Stop `npm run dev` first.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh

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
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone local lvrf -> ${VERIFY_DB}"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
# The server code may expect columns local lvrf does not have yet (0025's
# refusals.value_outcome_id, for one): migrate and harden the clone, never
# the real local lvrf.
migrate_clone "$VERIFY_DB" > /tmp/lvrf_frozen_migrate.log 2>&1 && ok "clone migrated to the latest migration" || { bad "migrate failed — see /tmp/lvrf_frozen_migrate.log"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /tmp/lvrf_frozen_hardening.log 2>&1 && ok "hardening.sql applied" || { bad "hardening failed"; exit 1; }

step "3. API against the clone, port ${PORT}"
LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_frozen_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }

ACTOR="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
# Band A item 2: the steward's acts (accept, reject, exclude, retire) need
# the actor to be the tenant's steward — name them, as the box's
# set_steward.ts would.
q "UPDATE tenants SET steward_person_id = '$ACTOR' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$ACTOR') AND steward_person_id IS NULL" > /dev/null
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
# engagement — the one that stays current. Since 0025 the gap register
# attributes an evidence refusal only to the outcome the refusal names, so
# OTHER's own refusal is 'refused' whether or not it has live siblings, and
# a refusal naming no outcome is never attributed — not even once OTHER is
# alone at the institution, which is exactly when the old guard misfired.
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
if [ -n "$OTHER" ]; then
  C="$(code POST "/api/value-outcomes/$OTHER/evidence" "$REFUSED_EVIDENCE_BODY")"
  [ "$C" = "422" ] && ok "refusal provoked on the second outcome -> 422  $(msg)" || bad "refusal -> $C (expected 422)  $(msg)"
  [ "$(q "SELECT value_outcome_id FROM refusals ORDER BY refused_at DESC LIMIT 1")" = "$OTHER" ] \
    && ok "the refusal row names the second outcome (value_outcome_id)" || bad "the refusal row does not name the second outcome"
  # Exact match (0025): the refusal is the second outcome's own, so it is
  # attributed at once — while OUTCOME's engagement's outcomes are still
  # live beside it. Under the old single-outcome guard this read 'open'.
  C="$(code GET "/api/value-outcomes/$OTHER/gaps")"; S="$(baseline_state)"
  [ "$S" = "refused" ] && ok "second outcome's baseline gap reads 'refused' at once — its own refusal, siblings or not" \
    || bad "second outcome's baseline gap: $S (expected refused; gaps -> $C)"

  # A refusal with NO outcome id — the shape every pre-0025 row has, prod's
  # 30 August row included. Written directly: no API path writes a NULL
  # value_outcome_id for the evidence endpoint any more. supports = 'actual',
  # so it cannot be confused with the baseline refusal above.
  q "INSERT INTO refusals (tenant_id, institution_id, actor_person_id, endpoint, subject_table,
                           subject_id, sqlstate, constraint_name, message, attempted_payload)
     SELECT i.tenant_id, i.id, '$ACTOR', 'POST /api/value-outcomes/:outcomeId/evidence', 'evidence',
            NULL, 'P0001', NULL, 'Verification: a refusal that names no outcome.',
            '{\"supports\":\"actual\"}'::jsonb
       FROM value_outcomes vo JOIN institutions i ON i.id = vo.institution_id
      WHERE vo.id = '$OTHER'" > /dev/null \
    && ok "NULL-id refusal recorded at the second outcome's institution (supports actual)" \
    || bad "could not record the NULL-id refusal"
  S="$(node -e 'try{const b=require("/tmp/lvrf_r.json");const e=Array.isArray(b)?b.find(x=>x.factor==="actual_evidence_verified"):null;console.log(e?e.state:"absent")}catch{console.log("error")}')"
  [ "$S" = "open" ] && ok "second outcome's actual gap reads 'open' — a refusal that names no outcome is never attributed" \
    || bad "second outcome's actual gap: $S (expected open) — a NULL-id refusal was attributed"
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

if [ -n "$OTHER" ]; then
  # Retiring a sibling engagement changes nothing about attribution now:
  # the second outcome's own refusal stays its own, and the NULL-id one
  # stays nobody's — even though the second outcome is now alone at the
  # institution, which under the old guard is what flipped attribution on.
  C="$(code GET "/api/value-outcomes/$OTHER/gaps")"; S="$(baseline_state)"
  [ "$S" = "refused" ] && ok "second outcome's baseline gap still reads 'refused' after the sibling engagement is retired" \
    || bad "second outcome's baseline gap after retirement: $S (expected refused; gaps -> $C)"
  S="$(node -e 'try{const b=require("/tmp/lvrf_r.json");const e=Array.isArray(b)?b.find(x=>x.factor==="actual_evidence_verified"):null;console.log(e?e.state:"absent")}catch{console.log("error")}')"
  [ "$S" = "open" ] && ok "second outcome's actual gap still reads 'open' — now alone at the institution, the NULL-id refusal is still not attributed" \
    || bad "second outcome's actual gap after retirement: $S (expected open) — a NULL-id refusal was attributed once the outcome was alone"
else
  echo "  NOTE  no second current outcome at the institution outside the retired engagement; attribution checks skipped"
fi

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
echo "    Not exercised here: metric re-validation skipping frozen outcomes — reviewed in code."
[ "$FAIL" -eq 0 ]
