#!/usr/bin/env bash
#
# The pack page shows the reviewer's note — local verification. Dev Mac only.
#
#   ./scripts/verify_pack_review.sh
#
# Clone `lvrf_verifyreview` (createdb -T lvrf -O lvrf_app), dropped on exit.
# Local lvrf has no real pack data, so the script makes one entry the way
# prod does: parse a one-measure research payload into an empty industry,
# accept it with a review note, then reads GET /api/industries/:slug/pack
# and checks the note, reviewer and research tool come back on that entry,
# and that a measure with no accepted result comes back with review: null.
# The clone is migrated to the repo's latest migration and hardened.
# Stop `npm run dev` first.

set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyreview
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3094
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
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone local lvrf -> ${VERIFY_DB}"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
# The server code may expect columns local lvrf does not have yet (0026's
# exclusion provenance, read by the pack route): migrate and harden the
# clone, never the real local lvrf.
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > /tmp/lvrf_review_migrate.log 2>&1 && ok "clone migrated to the latest migration" || { bad "migrate failed — see /tmp/lvrf_review_migrate.log"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /tmp/lvrf_review_hardening.log 2>&1 && ok "hardening.sql applied" || { bad "hardening failed"; exit 1; }

step "3. API against the clone, port ${PORT}"
LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_review_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }

ACTOR="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
# Band A item 2: the steward's acts (accept, reject, exclude, retire) need
# the actor to be the tenant's steward — name them, as the box's
# set_steward.ts would.
q "UPDATE tenants SET steward_person_id = '$ACTOR' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$ACTOR') AND steward_person_id IS NULL" > /dev/null
ACTOR_NAME="$(q "SELECT full_name FROM persons WHERE id = '$ACTOR'")"
# An industry of the actor's tenant with no current measures, so the name cannot collide.
read -r IND SLUG <<< "$(q "SELECT i.id || ' ' || i.slug FROM industries i
   JOIN persons p ON p.id = '$ACTOR' AND p.tenant_id = i.tenant_id
  WHERE NOT EXISTS (SELECT 1 FROM industry_measures m WHERE m.industry_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL)
  ORDER BY i.slug LIMIT 1")"
[ -n "$IND" ] || { bad "no empty industry in the clone"; exit 1; }
echo "  industry $SLUG ($IND)"

TOOL="Verification tool $(date +%s)"
# Q4b: a response names the prompt it answered, and that prompt's industry.
PROMPT_ID="$(curl -s -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" -d '{}' \
  "$BASE/api/industries/$IND/research-prompts" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).prompt_id||""))')"
[ -n "$PROMPT_ID" ] || { bad "no research prompt generated"; exit 1; }
NOTE="Verification note: confirm the threshold before relying on it."
PAYLOAD=$(cat <<JSON
{"prompt_id":"$PROMPT_ID","industry":"$SLUG","research_query":"Verification query","query_as_executed":"As asked","research_tool":"$TOOL",
 "measures":[{"name":"Verification measure","unit":"%","direction":"increase","definition":"A verification definition.",
   "why_it_pays":"A verification reason.","addressable_by_workforce_capability":{"value":true,"why":"A verification why."},
   "confounders":"Verification confounders.","citation":"Verification citation."}]}
JSON
)

step "4. Parse and accept with a review note"
C="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
  -d "$PAYLOAD" "$BASE/api/industries/$IND/research-results")"
[ "$C" = "201" ] && ok "parsed -> 201" || { bad "parse -> $C $(cat /tmp/lvrf_r.json)"; exit 1; }
# The id comes from the parse response, NOT from a read-back. actorContext
# commits on res 'finish', after the 201 is sent, so an immediate SELECT on
# another connection can run before the COMMIT and find nothing — which is
# how this line failed once, as /api/research-results//accept.
RR="$(node -e 'console.log(require("/tmp/lvrf_r.json").results[0].id)')"
[ -n "$RR" ] || { bad "parse response carried no result id"; exit 1; }
C="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
  -d "{\"review_note\":\"$NOTE\"}" "$BASE/api/research-results/$RR/accept")"
[ "$C" = "200" ] && ok "accepted -> 200" || { bad "accept -> $C $(cat /tmp/lvrf_r.json)"; exit 1; }

step "5. A measure with no review"
# NO API PATH CAN CREATE THIS. industry_measures rows are written only by
# POST /api/research-results/:id/accept, which links the accepted result in
# the same transaction. The row is inserted directly so the pack's
# review: null branch, and the page's "No review on record", are exercised
# at all. Same industry, so one pack response carries both entries.
q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays,
                                  addressable, addressable_reasoning, confounders, citation)
   SELECT tenant_id, id, 'Unreviewed verification measure', '%', 'decrease', 'Inserted directly.', 'Verification only.',
          false, 'Verification only.', 'None.', 'No citation — verification only.'
     FROM industries WHERE id = '$IND'" > /dev/null \
  && ok "inserted a measure with no research result (direct; no API path creates one)" || bad "could not insert the unreviewed measure"

step "6. The pack returns each entry's review"
curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/industries/$SLUG/pack" > /tmp/lvrf_pack.json
# rn NAME PATH -> JSON of that entry's field, or "NO_MEASURE".
rn() { node -e "const p=require('/tmp/lvrf_pack.json');const m=p.measures.find(x=>x.name===process.argv[1]);console.log(JSON.stringify(m?eval('m'+process.argv[2]):'NO_MEASURE'))" "$1" "$2"; }
r() { rn 'Verification measure' "$1"; }
[ "$(r .review.note)" = "\"$NOTE\"" ] && ok "review.note is the accept note" || bad "review.note: $(r .review.note)"
[ "$(r .review.reviewed_by)" = "\"$ACTOR_NAME\"" ] && ok "review.reviewed_by is $ACTOR_NAME" || bad "reviewed_by: $(r .review.reviewed_by)"
[ "$(r .review.research_tool)" = "\"$TOOL\"" ] && ok "review.research_tool is the payload's tool" || bad "research_tool: $(r .review.research_tool)"
[ "$(r .review.reviewed_at)" != "null" ] && ok "review.reviewed_at present" || bad "reviewed_at missing"
[ "$(r .citation)" = '"Verification citation."' ] && ok "the measure's own columns are unchanged" || bad "citation: $(r .citation)"
U="$(rn 'Unreviewed verification measure' .review)"
[ "$U" = "null" ] && ok "the unreviewed measure's review is null — no reviewer invented" || bad "unreviewed measure review: $U (expected null)"
[ "$(rn 'Unreviewed verification measure' .citation)" = '"No citation — verification only."' ] && ok "the unreviewed measure is still listed with its own columns" || bad "unreviewed measure missing from the pack"
# The reviewed entry, read again from the SAME response that now carries the
# unreviewed one beside it: the LEFT JOIN must not cross-attach a review.
[ "$(r .review.note)" = "\"$NOTE\"" ] && [ "$(r .review.reviewed_by)" = "\"$ACTOR_NAME\"" ] \
  && ok "the reviewed entry's review is unaffected by the unreviewed one beside it" || bad "reviewed entry changed: $(r .review)"

# NOT A TEST. Since 0026, research_results_one_accepted_per_measure makes a
# second accepted result for one measure impossible, so the join cannot
# return this entry twice and a count of 1 could not have been anything
# else. Reported, not counted. The index itself is tested where it can fail:
# verify_exclusions.sh step 7 tries to write the duplicate and expects the
# index to refuse it.
N="$(node -e "console.log(require('/tmp/lvrf_pack.json').measures.filter(x=>x.name==='Verification measure').length)")"
if [ "$N" = "1" ]; then
  echo "  NOTE  the reviewed entry appears once — not a test: research_results_one_accepted_per_measure (0026) rules out a duplicate, so this could not fail; the index is tested in verify_exclusions.sh"
else
  bad "the reviewed entry appears $N times — the join duplicated it"
fi

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
