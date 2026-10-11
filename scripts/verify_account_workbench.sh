#!/usr/bin/env bash
#
# Account workbench (0024) — local verification. Run on the dev Mac, from
# anywhere, as yourself (the Postgres superuser locally). Never on the VPS.
#
#   ./scripts/verify_account_workbench.sh                # verify on a throwaway copy
#   ./scripts/verify_account_workbench.sh --apply-local  # then back up and apply to local lvrf
#
# WHY A COPY: every governed table refuses DELETE, so test accounts written
# into the real local `lvrf` could never be removed. Steps 2-5 run against
# `lvrf_verify0024`, a `createdb -T lvrf` clone, which is dropped on exit.
# The clone needs nothing else connected to `lvrf` — stop `npm run dev` first.
#
# Exit status is non-zero if any check fails.

set -euo pipefail
cd "$(dirname "$0")/.."
# The expected trigger total is read from db/hardening.sql's Verification
# block — the one place it is declared (CLAUDE.md: no file restates a
# canonical value). A migration that adds triggers updates that line, and
# every script follows.
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

APPLY_LOCAL=false
[ "${1:-}" = "--apply-local" ] && APPLY_LOCAL=true

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in
  *@localhost:*|*@127.0.0.1:*) ;;
  *) echo "REFUSING: .env DATABASE_URL is not localhost"; exit 1 ;;
esac
case "$LOCAL_URL" in
  */lvrf) ;;
  *) echo "REFUSING: .env DATABASE_URL does not name the lvrf database"; exit 1 ;;
esac

# One underscore only: drizzle.config.ts accepts ^lvrf(_[a-z0-9]+)?$ and
# refuses anything else — lvrf_verify_0024 was refused at step 3.
VERIFY_DB=lvrf_verify0024
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3099
BASE="http://127.0.0.1:${PORT}"
PASS=0
FAIL=0
SERVER_PID=""

step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  sleep 1
  dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------
step "1. Typecheck — server and client"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

# ---------------------------------------------------------------------
step "2. Throwaway copy of local lvrf -> ${VERIFY_DB}"
dropdb --if-exists "$VERIFY_DB"
# -O lvrf_app: local lvrf is owned by lvrf_app, and .env connects as it. A
# clone owned by whoever ran createdb leaves lvrf_app without CREATE, and
# drizzle-kit migrate dies on CREATE SCHEMA drizzle with its error swallowed.
createdb -T lvrf -O lvrf_app "$VERIFY_DB"
ok "cloned"

# ---------------------------------------------------------------------
step "3. Migrate and harden the copy"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /tmp/lvrf_hardening_0024.log 2>&1 \
  && ok "hardening.sql applied" || { bad "hardening.sql failed — see /tmp/lvrf_hardening_0024.log"; exit 1; }

TRIGGERS="$(psql -At -d "$VERIFY_DB" -c "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$TRIGGERS" = "$EXPECT_TRIGGERS" ] && ok "$EXPECT_TRIGGERS distinct triggers (hardening.sql total)" || bad "expected $EXPECT_TRIGGERS distinct triggers, found $TRIGGERS"
FACT_TRIGGERS="$(psql -At -d "$VERIFY_DB" -c "SELECT string_agg(DISTINCT trigger_name, ',' ORDER BY trigger_name) FROM information_schema.triggers WHERE event_object_table = 'institution_facts'")"
[ "$FACT_TRIGGERS" = "institution_facts_audit,institution_facts_no_delete,institution_facts_supersession_sane,institution_facts_touch" ] \
  && ok "institution_facts has _audit, _no_delete, _supersession_sane, _touch" \
  || bad "institution_facts triggers: $FACT_TRIGGERS"

# ---------------------------------------------------------------------
step "4. API server against the copy, port ${PORT}"
DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do
  curl -s -o /dev/null "$BASE/api/health" && break
  sleep 0.5
done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start — see /tmp/lvrf_verify_server.log"; exit 1; }

ACTOR="$(psql -At -d "$VERIFY_DB" -c "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
SLUG="$(psql -At -d "$VERIFY_DB" -c "SELECT slug FROM industries ORDER BY slug LIMIT 1")"
[ -n "$ACTOR" ] && [ -n "$SLUG" ] || { bad "no tenant actor or no industry in the copy"; exit 1; }
echo "  actor $ACTOR · industry $SLUG"

# post PATH BODY EXPECTED_STATUS LABEL — prints the server's message on every row.
post() {
  local code
  code="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -X POST \
    -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
    -d "$2" "$BASE$1")"
  local msg
  msg="$(node -e 'try{const b=require("/tmp/lvrf_r.json");console.log(b.message??JSON.stringify(b))}catch{console.log("")}')"
  if [ "$code" = "$3" ]; then ok "$4 -> $code  $msg"; else bad "$4 -> $code (expected $3)  $msg"; fi
}
json() { node -e "console.log(require('/tmp/lvrf_r.json')$1)"; }

STAMP="$(date +%s)"
NAME_A="Verify 0024 A $STAMP"
NAME_D="Verify 0024 D $STAMP"

# ---------------------------------------------------------------------
step "5. Behaviour"

post /api/account-inputs \
  "{\"institution\":{\"name\":\"$NAME_A\",\"website\":\"https://example.com\",\"industry\":\"As stated at intake\",\"industry_slug\":\"$SLUG\",\"classification_note\":\"Verification: classified at create.\"}}" \
  201 "create + website + classify in one request"
INST="$(json .institution_id)"
[ "$(json .classification.industry_slug)" = "$SLUG" ] && ok "response carries the classification" || bad "classification missing from response"

post /api/account-inputs \
  "{\"institution\":{\"name\":\"Verify 0024 B $STAMP\",\"industry_slug\":\"$SLUG\"}}" \
  422 "slug without classification_note is refused"

post /api/account-inputs \
  "{\"institution\":{\"name\":\"Verify 0024 C $STAMP\",\"website\":\"ftp://example.com\"}}" \
  422 "non-http(s) website refused by institutions_website_is_url"

post /api/account-inputs \
  "{\"institution\":{\"name\":\"$NAME_D\",\"industry_slug\":\"no-such-industry\",\"classification_note\":\"Verification: unknown slug.\"}}" \
  404 "unknown slug refuses the whole create"
LEFT="$(psql -At -d "$VERIFY_DB" -c "SELECT count(*) FROM institutions WHERE name = '$NAME_D'")"
[ "$LEFT" = "0" ] && ok "refused create left no institution behind (rolled back)" || bad "refused create left $LEFT institution row(s)"

post "/api/institutions/$INST/industry" \
  "{\"industry_slug\":\"$SLUG\",\"classification_note\":\"Verification: second classification.\"}" \
  409 "classify endpoint still refuses a reclassification"

FACT_EV='"evidence_kind":"public_filing","provenance":"Verification run, not a real source","confidence":"low","source_verified":false,"ai_sourced":false'

post "/api/institutions/$INST/facts" \
  "{\"kind\":\"revenue\",\"value_numeric\":0,\"unit\":\"USD\",\"as_of\":\"2025-12-31\",$FACT_EV}" \
  201 "revenue of 0 USD accepted (zero is data)"
post "/api/institutions/$INST/facts" \
  "{\"kind\":\"system\",\"value_text\":\"Workday (HRIS)\",\"as_of\":\"2026-10-01\",$FACT_EV}" \
  201 "system fact accepted"
post "/api/institutions/$INST/facts" \
  "{\"kind\":\"headcount\",\"value_numeric\":12.5,\"unit\":\"people\",\"as_of\":\"2025-12-31\",$FACT_EV}" \
  422 "fractional headcount refused by CHECK"
post "/api/institutions/$INST/facts" \
  "{\"kind\":\"revenue\",\"value_numeric\":-1,\"unit\":\"USD\",\"as_of\":\"2025-12-31\",$FACT_EV}" \
  422 "negative revenue refused by CHECK"
post "/api/institutions/$INST/facts" \
  "{\"kind\":\"revenue\",\"value_numeric\":10,\"unit\":\"usd\",\"as_of\":\"2025-12-31\",$FACT_EV}" \
  422 "non-ISO currency refused by CHECK"
post "/api/institutions/$INST/facts" \
  "{\"kind\":\"system\",\"value_text\":\"SAP\",\"as_of\":\"2026-10-01\",\"evidence_kind\":\"observation\",\"provenance\":\"short\",\"confidence\":\"low\"}" \
  422 "provenance under 12 characters refused"
post "/api/institutions/$INST/facts" \
  "{\"kind\":\"system\",\"value_text\":\"SAP\",\"as_of\":\"2026-10-01\",\"evidence_kind\":\"observation\",\"provenance\":\"Verification run, not a real source\",\"confidence\":\"low\",\"ai_sourced\":true}" \
  422 "AI-sourced without research query refused"
post "/api/institutions/$INST/facts" \
  "{\"kind\":\"system\",\"value_text\":\"SAP\",\"as_of\":\"2026-10-01\",\"evidence_kind\":\"observation\",\"provenance\":\"Verification run, not a real source\",\"confidence\":\"low\",\"ai_sourced\":true,\"research_query\":\"q\",\"research_tool\":\"t\",\"source_verified\":true}" \
  422 "AI-sourced cannot self-verify (AMENDMENT-005)"

CODE="$(curl -s -o /tmp/lvrf_r.json -w '%{http_code}' -H "x-actor-person-id: $ACTOR" "$BASE/api/institutions/$INST/view")"
[ "$CODE" = "200" ] && ok "view -> 200" || bad "view -> $CODE"
[ "$(json .institution.website)" = "https://example.com" ] && ok "view returns website" || bad "view website: $(json .institution.website)"
[ "$(json .facts.length)" = "2" ] && ok "view returns 2 current facts" || bad "view facts: $(json .facts.length)"
[ "$(json ".facts.find(f=>f.kind==='revenue').value_numeric")" = "0" ] && ok "revenue renders as 0, not null" || bad "revenue value: $(json ".facts.find(f=>f.kind==='revenue').value_numeric")"
[ "$(json ".facts.every(f=>f.source_verified===false)")" = "true" ] && ok "facts carry their evidence's unverified state" || bad "verification state wrong"

if psql -q -d "$VERIFY_DB" -c "DELETE FROM institution_facts" > /tmp/lvrf_del.log 2>&1; then
  bad "DELETE on institution_facts was allowed"
else
  ok "DELETE on institution_facts refused: $(grep -o 'ERROR:.*' /tmp/lvrf_del.log | head -1)"
fi

# ---------------------------------------------------------------------
echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] || exit 1

if $APPLY_LOCAL; then
  kill "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
  step "6. Apply to local lvrf (CLAUDE.md rule 8: back up first)"
  mkdir -p db/backups
  DUMP="db/backups/lvrf_pre_0024_$(date +%Y%m%d_%H%M%S).dump"
  pg_dump -Fc -d lvrf -f "$DUMP"
  echo "  backup: $DUMP"
  npx drizzle-kit migrate
  psql -v ON_ERROR_STOP=1 -q -d lvrf -f db/hardening.sql > /tmp/lvrf_hardening_local.log 2>&1
  LOCAL_TRIGGERS="$(psql -At -d lvrf -c "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
  echo "  local lvrf distinct triggers: $LOCAL_TRIGGERS (expect $EXPECT_TRIGGERS)"
  [ "$LOCAL_TRIGGERS" = "$EXPECT_TRIGGERS" ] || exit 1
fi
