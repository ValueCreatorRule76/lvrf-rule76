#!/usr/bin/env bash
#
# 0025 — refusals name their value outcome; the gap register attributes
# only exact matches. Local verification, dev Mac only.
#
#   ./scripts/verify_refusal_attribution.sh
#
# Clone `lvrf_verifyrefusal` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated to
# the latest migration and hardened, dropped on exit. Needs an institution with two current
# outcomes under current engagements (local Northgate has two). Stop
# `npm run dev` first.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
# The expected trigger total is read from db/hardening.sql's Verification
# block — the one place it is declared (CLAUDE.md: no file restates a
# canonical value). A migration that adds triggers updates that line, and
# every script follows.
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyrefusal
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3095
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

step "2. Clone, migrate to latest, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB"
[ "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name = 'refusals' AND column_name = 'value_outcome_id'")" = "1" ] \
  && ok "refusals.value_outcome_id exists" || { bad "column missing after migrate"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /tmp/lvrf_hardening_0025.log 2>&1 && ok "hardening.sql applied" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$EXPECT_TRIGGERS distinct triggers (hardening.sql total)" || bad "triggers: $T (expected $EXPECT_TRIGGERS)"
LEGACY_NULLS="$(q "SELECT count(*) FROM refusals WHERE value_outcome_id IS NULL")"
[ "$LEGACY_NULLS" = "$(q "SELECT count(*) FROM refusals")" ] && ok "no back-fill: all $LEGACY_NULLS existing refusals have NULL value_outcome_id" || bad "existing refusals were back-filled"

step "3. API against the clone, port ${PORT}"
LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_refusal_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }

ACTOR="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
# A and B are chosen by what the gap register SAYS, not by age: both must
# currently list baseline_evidence_verified AND actual_evidence_verified as
# 'open'. An outcome without those factors would read 'absent', and every
# "not refused" / "unchanged" check below would pass on absent == absent
# without testing attribution at all.
q "SELECT vo.institution_id || ' ' || vo.id FROM value_outcomes vo
     JOIN engagements e ON e.id = vo.engagement_id AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
    WHERE vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL
    ORDER BY vo.institution_id, vo.created_at" > /tmp/lvrf_candidates.txt
read -r INST A B <<< "$(ACTOR="$ACTOR" BASE="$BASE" node -e '
  const lines = require("fs").readFileSync("/tmp/lvrf_candidates.txt", "utf8").trim().split("\n").filter(Boolean);
  (async () => {
    const byInst = new Map();
    for (const l of lines) {
      const [inst, id] = l.split(" ");
      const r = await fetch(`${process.env.BASE}/api/value-outcomes/${id}/gaps`, { headers: { "x-actor-person-id": process.env.ACTOR } });
      if (r.status !== 200) continue;
      const g = await r.json();
      const open = (f) => g.some((e) => e.factor === f && e.state === "open");
      if (open("baseline_evidence_verified") && open("actual_evidence_verified")) {
        const list = byInst.get(inst) ?? [];
        list.push(id);
        byInst.set(inst, list);
        if (list.length === 2) { console.log(inst, list[0], list[1]); return; }
      }
    }
    console.log("");
  })();
')"
[ -n "${B:-}" ] || { bad "no institution with two current outcomes whose baseline and actual evidence gaps are both open"; exit 1; }
echo "  institution $INST · outcome A $A · outcome B $B (both list baseline and actual evidence gaps as open)"

gap_state() {  # OUTCOME FACTOR
  curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/value-outcomes/$1/gaps" > /tmp/lvrf_gaps.json
  node -e 'try{const b=require("/tmp/lvrf_gaps.json");const e=Array.isArray(b)?b.find(x=>x.factor===process.argv[1]):null;console.log(e?e.state:"absent")}catch{console.log("error")}' "$2"
}

step "4. A refusal on A names A"
BEFORE_A="$(gap_state "$A" baseline_evidence_verified)"; BEFORE_B="$(gap_state "$B" baseline_evidence_verified)"
echo "  before: A baseline=$BEFORE_A · B baseline=$BEFORE_B"
C="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
  -d '{"kind":"observation","summary":"Verification","provenance":"Verification run, not a real source","supports":"baseline","confidence":"low","ai_sourced":true,"research_query":"q","research_tool":"t","source_verified":true}' \
  "$BASE/api/value-outcomes/$A/evidence")"
[ "$C" = "422" ] && ok "refusal provoked on A -> 422" || { bad "expected 422 provoking a refusal on A, got $C"; exit 1; }
[ "$(q "SELECT value_outcome_id FROM refusals ORDER BY refused_at DESC LIMIT 1")" = "$A" ] && ok "the new refusal row records value_outcome_id = A" || bad "refusal row does not name A"

step "5. Exact attribution"
SA="$(gap_state "$A" baseline_evidence_verified)"
[ "$SA" = "refused" ] && ok "A's baseline gap reads 'refused' — its own refusal" || bad "A baseline: $SA (expected refused)"
SB="$(gap_state "$B" baseline_evidence_verified)"
[ "$SB" = "open" ] && ok "B's baseline gap still reads 'open' — A's refusal is not B's" || bad "B baseline: $SB (expected open; was $BEFORE_B)"

step "6. A legacy refusal (no outcome id) is attributed to nobody"
# No API writes a NULL value_outcome_id for this endpoint any more, so the
# legacy shape is inserted directly — the same shape as prod's 30 August row.
TENANT="$(q "SELECT tenant_id FROM institutions WHERE id = '$INST'")"
q "INSERT INTO refusals (tenant_id, institution_id, actor_person_id, endpoint, subject_table, subject_id, sqlstate, constraint_name, message, attempted_payload)
   VALUES ('$TENANT', '$INST', '$ACTOR', 'POST /api/value-outcomes/:outcomeId/evidence', 'evidence', NULL, 'P0001', NULL,
           'Verification: legacy refusal with no outcome id.', '{\"supports\":\"actual\"}'::jsonb)" > /dev/null
for O in "$A" "$B"; do
  S="$(gap_state "$O" actual_evidence_verified)"
  [ "$S" = "open" ] && ok "outcome $O actual gap reads 'open', not the legacy refusal" || bad "outcome $O actual gap: $S (expected open)"
done

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
