#!/usr/bin/env bash
#
# 0026 + POST /api/industries/:industryId/exclusions — local verification.
# Dev Mac only.
#
#   ./scripts/verify_exclusions.sh
#
# Clone `lvrf_verifyexcl` (createdb -T lvrf -O lvrf_app), migrated to 0026
# and hardened, dropped on exit. Exclusions are insert-only, so they are
# never tested on the real local lvrf. Stop `npm run dev` first.

set -euo pipefail
cd "$(dirname "$0")/.."
# The expected trigger total is read from db/hardening.sql's Verification
# block — the one place it is declared (CLAUDE.md: no file restates a
# canonical value). A migration that adds triggers updates that line, and
# every script follows.
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyexcl
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3093
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; }
trap cleanup EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }
# actorContext COMMITs on res 'finish', after the response is sent, so a row
# a 2xx just reported can be invisible to another connection for a moment.
# Ids come from responses; before reading a row's CONTENTS, wait for it.
visible() {  # TABLE ID
  for _ in $(seq 1 50); do [ "$(q "SELECT count(*) FROM $1 WHERE id = '$2'")" = "1" ] && return 0; sleep 0.1; done
  return 1
}
rj() { node -e "console.log(require('/tmp/lvrf_r.json')$1)"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate to 0026, harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate
[ "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name = 'industry_measure_exclusions' AND column_name IN ('proposed_by_research_tool','proposal_text')")" = "2" ] \
  && ok "provenance columns exist" || { bad "provenance columns missing"; exit 1; }
[ "$(q "SELECT count(*) FROM pg_indexes WHERE indexname = 'research_results_one_accepted_per_measure'")" = "1" ] \
  && ok "partial unique index exists" || bad "partial unique index missing"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /tmp/lvrf_hardening_0026.log 2>&1 && ok "hardening.sql applied" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$EXPECT_TRIGGERS distinct triggers (hardening.sql total)" || bad "triggers: $T (expected $EXPECT_TRIGGERS)"

step "3. API against the clone, port ${PORT}"
LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_excl_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }

ACTOR="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
# Band A item 2: the steward's acts (accept, reject, exclude, retire) need
# the actor to be the tenant's steward — name them, as the box's
# set_steward.ts would.
q "UPDATE tenants SET steward_person_id = '$ACTOR' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$ACTOR') AND steward_person_id IS NULL" > /dev/null
ACTOR_NAME="$(q "SELECT full_name FROM persons WHERE id = '$ACTOR'")"
read -r IND SLUG <<< "$(q "SELECT i.id || ' ' || i.slug FROM industries i
   JOIN persons p ON p.id = '$ACTOR' AND p.tenant_id = i.tenant_id
  WHERE NOT EXISTS (SELECT 1 FROM industry_measures m WHERE m.industry_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL)
  ORDER BY i.slug LIMIT 1")"
echo "  industry $SLUG ($IND)"

post() {  # PATH BODY EXPECTED LABEL [MESSAGE_SUBSTRING]
  # With a 5th argument the status alone is not enough: the message must
  # name THIS refusal, so a 409 for some other reason cannot pass for it.
  local code msg
  code="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST -H 'content-type: application/json' \
    -H "x-actor-person-id: $ACTOR" -d "$2" "$BASE$1")"
  msg="$(node -e 'try{const b=require("/tmp/lvrf_r.json");console.log(b.message??JSON.stringify(b))}catch{console.log("")}')"
  if [ "$code" = "$3" ] && { [ -z "${5:-}" ] || printf '%s' "$msg" | grep -qF -- "$5"; }; then
    ok "$4 -> $code  $msg"
  else
    bad "$4 -> $code (expected $3${5:+ naming \"$5\"})  $msg"
  fi
}
X="/api/industries/$IND/exclusions"

step "4. Refusals"
post "$X" '{"name":"Payer mix","reason":"short"}' 422 "reason under 12 characters"
post "$X" '{"name":"Payer mix","reason":"Verification: set by contract and demographics.","proposed_by_research_tool":"t"}' 422 "tool without proposal text"
post "/api/industries/00000000-0000-0000-0000-000000000000/exclusions" '{"name":"Payer mix","reason":"Verification: unknown industry."}' 404 "unknown industry"
[ "$(q "SELECT count(*) FROM industry_measure_exclusions WHERE industry_id = '$IND'")" = "0" ] && ok "no row written by a refusal" || bad "a refusal wrote a row"
# The route refuses half a proposal before the CHECK is ever reached, so the
# CHECK itself is exercised directly: it must hold even if the route's own
# validation were removed.
if psql -q -d "$VERIFY_DB" -c "INSERT INTO industry_measure_exclusions (tenant_id, industry_id, name, reason, excluded_by_person_id, proposed_by_research_tool)
     SELECT tenant_id, id, 'Half a proposal', 'Verification: tool but no proposal text.', '$ACTOR', 'Verification tool' FROM industries WHERE id = '$IND'" > /tmp/lvrf_chk.log 2>&1; then
  bad "the CHECK allowed a tool with no proposal text"
else
  grep -q 'industry_measure_exclusions_proposal_is_complete' /tmp/lvrf_chk.log \
    && ok "CHECK industry_measure_exclusions_proposal_is_complete refuses half a proposal at the database" \
    || bad "insert refused, but not by the proposal CHECK: $(grep -o 'ERROR:.*' /tmp/lvrf_chk.log | head -1)"
fi

step "5. Record an exclusion with the research's proposal"
post "$X" '{"name":"Payer mix","reason":"Verification: set by employer coverage and contract negotiation, not workforce capability.","proposed_by_research_tool":"Verification tool","proposal_text":"Verification: the research said payer mix is exogenous."}' 201 "exclusion recorded"
EXCL_ID="$(rj .exclusion_id)"
visible industry_measure_exclusions "$EXCL_ID" || bad "exclusion $EXCL_ID never became visible"
[ "$(q "SELECT excluded_by_person_id = '$ACTOR' AND proposed_by_research_tool = 'Verification tool' AND reason LIKE 'Verification: set by%' FROM industry_measure_exclusions WHERE industry_id = '$IND' AND name = 'Payer mix'")" = "t" ] \
  && ok "row: excluded by the actor; reason and proposal stored separately" || bad "row contents wrong"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'industry_measure_exclusions' AND record_id = '$EXCL_ID' AND actor_person_id = '$ACTOR'")" -ge 1 ] && ok "audit_log records this exclusion ($EXCL_ID) with the actor" || bad "no attributed audit row for $EXCL_ID"
post "$X" '{"name":"Payer mix","reason":"Verification: a second exclusion of the same name."}' 409 "same name again" "industry_measure_exclusions_industry_name_key"

step "6. Cannot be both in the pack and excluded from it"
TOOL="Verification tool $(date +%s)"
post "/api/industries/$IND/research-prompts" '{}' 201 "generated a research prompt (Q4b)"
PROMPT_ID="$(rj .prompt_id)"
PAYLOAD="{\"prompt_id\":\"$PROMPT_ID\",\"industry\":\"$(q "SELECT slug FROM industries WHERE id = '$IND'")\",\"research_query\":\"q\",\"query_as_executed\":\"As asked\",\"research_tool\":\"$TOOL\",\"measures\":[
 {\"name\":\"In the pack\",\"unit\":\"%\",\"direction\":\"increase\",\"definition\":\"d\",\"why_it_pays\":\"w\",\"addressable_by_workforce_capability\":{\"value\":false,\"why\":\"y\"},\"confounders\":\"c\",\"citation\":\"x\",\"caveats\":[]},
 {\"name\":\"Payer mix\",\"unit\":\"%\",\"direction\":\"increase\",\"definition\":\"d\",\"why_it_pays\":\"w\",\"addressable_by_workforce_capability\":{\"value\":false,\"why\":\"y\"},\"confounders\":\"c\",\"citation\":\"x\",\"caveats\":[]}]}"
post "/api/industries/$IND/research-results" "$PAYLOAD" 201 "parsed two measures"
RR_IN="$(rj ".results.find(r=>r.field_name==='In the pack').id")"
RR_EX="$(rj ".results.find(r=>r.field_name==='Payer mix').id")"
post "/api/research-results/$RR_IN/accept" '{"review_note":"Verification: accepted."}' 200 "accept 'In the pack'"
M="$(rj .industry_measures_id)"
visible industry_measures "$M" || bad "accepted measure $M never became visible"
post "$X" '{"name":"In the pack","reason":"Verification: trying to exclude a current pack entry."}' 409 "excluding a current pack entry" "is a current entry in the"
post "/api/research-results/$RR_EX/accept" '{"review_note":"Verification: accepted."}' 409 "accepting an excluded name" "was excluded from this pack by"
[ "$(q "SELECT review_state FROM research_results WHERE id = '$RR_EX'")" = "pending" ] && ok "the refused accept left the result pending" || bad "refused accept changed the result"

step "7. One accepted review per measure is now a constraint"
if psql -q -d "$VERIFY_DB" -c "UPDATE research_results SET review_state = 'accepted', reviewed_by_person_id = '$ACTOR', review_note = 'dup', industry_measures_id = '$M' WHERE id = '$RR_EX'" > /tmp/lvrf_dup.log 2>&1; then
  bad "a second accepted result for the same measure was allowed"
else
  grep -q 'research_results_one_accepted_per_measure' /tmp/lvrf_dup.log \
    && ok "second accepted result for one measure refused by the index: $(grep -o 'ERROR:.*' /tmp/lvrf_dup.log | head -1)" \
    || bad "the UPDATE was refused, but not by research_results_one_accepted_per_measure: $(grep -o 'ERROR:.*' /tmp/lvrf_dup.log | head -1)"
fi

step "8. The pack returns the exclusion"
curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/industries/$SLUG/pack" > /tmp/lvrf_pack.json
r() { node -e "const p=require('/tmp/lvrf_pack.json');const x=(p.exclusions||[]).find(e=>e.name==='Payer mix');console.log(JSON.stringify(x?eval('x'+process.argv[1]):'NONE'))" "$1"; }
[ "$(r .excluded_by)" = "\"$ACTOR_NAME\"" ] && ok "exclusion listed, excluded_by $ACTOR_NAME" || bad "excluded_by: $(r .excluded_by)"
[ "$(r .proposal_text)" = '"Verification: the research said payer mix is exogenous."' ] && ok "proposal text returned verbatim, apart from reason" || bad "proposal_text: $(r .proposal_text)"
[ "$(node -e "console.log(require('/tmp/lvrf_pack.json').measures.some(m=>m.name==='Payer mix'))")" = "false" ] && ok "'Payer mix' is not a pack entry" || bad "'Payer mix' is also in the pack"
# An industry with no exclusions must return an EMPTY ARRAY, not a missing
# key or null — the shape prod's three packs will have after deploy.
OTHER_SLUG="$(q "SELECT i.slug FROM industries i JOIN persons p ON p.id = '$ACTOR' AND p.tenant_id = i.tenant_id
                 WHERE i.id <> '$IND' AND NOT EXISTS (SELECT 1 FROM industry_measure_exclusions x WHERE x.industry_id = i.id)
                 ORDER BY i.slug LIMIT 1")"
E="$(curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/industries/$OTHER_SLUG/pack" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);console.log(JSON.stringify(p.exclusions))})")"
[ "$E" = "[]" ] && ok "an industry with no exclusions ($OTHER_SLUG) returns exclusions: []" || bad "$OTHER_SLUG exclusions: $E (expected [])"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
