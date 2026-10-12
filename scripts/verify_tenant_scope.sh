#!/usr/bin/env bash
#
# Sign-in P3 — every /api route answers for the actor's tenant only.
# Local verification, dev Mac only.
#
#   ./scripts/verify_tenant_scope.sh
#
# Clone `lvrf_verifyp3` (createdb -T lvrf -O lvrf_app), migrated to the
# latest and hardened, dropped on exit. Every address is a placeholder.
# Stop `npm run dev` first.
#
# Tenant A is the tenant of the first current vendor-staff person (in
# local lvrf, Skillsoft, which holds the data). Tenant B is created here,
# with one staff person, one account, one engagement and one industry.
# Both sign in; NO header is used — the session is the actor.
#
# The cases themselves are in verify_tenant_scope_cases.mjs, which this
# script runs once the server is up:
#   - COVERAGE GUARD: every route list_api_routes.mjs reads from the source
#     (all of /api except /api/health and /api/auth) must have a case, and
#     every case must be a real route;
#   - B against A's ids: the route's own not-found answer, and the SAME
#     request from A does not get it (so the row exists — only the tenant
#     differs); lists show B none of A's rows;
#   - ids of another tenant inside a request body: answered exactly as an
#     unknown id is;
#   - nothing written by B's requests (audit_log), no mismatch recorded as
#     a refusal, and every mismatch logged at warn with actor, tenant,
#     route and target id — and without the request body.

set -euo pipefail
cd "$(dirname "$0")/.."
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyp3
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3087
LOG=/tmp/lvrf_p3_server.log
PASS=0; FAIL=0; SERVER_PID=""
ok()  { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
step() { echo; echo "==> $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -f "$LOG"; }
trap cleanup EXIT
q() { psql -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1"; }

step "1. Typecheck, and the route list reads cleanly"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
ROUTES="$(node scripts/list_api_routes.mjs)" && ok "list_api_routes: $(echo "$ROUTES" | wc -l | tr -d ' ') routes under requireActor" || { bad "list_api_routes refused"; exit 1; }

step "2. Clone, migrate to latest, harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$T triggers (no migration in P3)" || bad "triggers $T (expected $EXPECT_TRIGGERS)"

step "3. Fixtures: tenant A (existing), tenant B (created)"
TS="$(date +%s)"
STAFF_A="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TENANT_A="$(q "SELECT tenant_id FROM persons WHERE id = '$STAFF_A'")"
EMAIL_A="$(q "SELECT email FROM persons WHERE id = '$STAFF_A'")"
TENANT_B="$(q "INSERT INTO tenants (name) VALUES ('Tenant B (P3 verification $TS)') RETURNING id" | head -1)"
EMAIL_B="staff.b.$TS@tenant-b.example"
STAFF_B="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TENANT_B', 'Staff B (verification)', '$EMAIL_B') RETURNING id" | head -1)"
INST_B="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TENANT_B', 'Account B (verification $TS)') RETURNING id" | head -1)"
CUST_B="$(q "INSERT INTO persons (institution_id, full_name, email) VALUES ('$INST_B', 'Customer B (verification)', 'customer.b.$TS@account-b.example') RETURNING id" | head -1)"
ENG_B="$(q "INSERT INTO engagements (tenant_id, institution_id, name, owner_person_id) VALUES ('$TENANT_B', '$INST_B', 'Engagement B (verification)', '$CUST_B') RETURNING id" | head -1)"
SLUG_B="tenant-b-only-$TS"
IND_B="$(q "INSERT INTO industries (tenant_id, name, slug) VALUES ('$TENANT_B', 'Tenant B industry', '$SLUG_B') RETURNING id" | head -1)"
# A live pack measure of tenant B's — a fixture, labelled as one in every
# text column, on the throwaway clone only.
MEASURE_OTHER="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TENANT_B', '$IND_B', 'Tenant B measure (verification)', 'count', 'increase', 'Verification fixture.', 'Verification fixture.', true, 'Verification fixture.', 'Verification fixture.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$STAFF_A', '$HASH', 'verify'), ('$STAFF_B', '$HASH', 'verify')" > /dev/null
# Band A deploy B: sign-in needs a current access grant. Name A's staff person the
# tenant's steward (if none) and grant them access — the steward's own
# grant, the bootstrap shape access_grants_steward_only allows.
q "UPDATE tenants SET steward_person_id = '$STAFF_A' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$STAFF_A') AND steward_person_id IS NULL" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT p.id, p.tenant_id, t.steward_person_id, 'Verification fixture grant' FROM persons p JOIN tenants t ON t.id = p.tenant_id WHERE p.id = '$STAFF_A'" > /dev/null
# And B's staff person, the same way, for tenant B.
q "UPDATE tenants SET steward_person_id = '$STAFF_B' WHERE id = (SELECT tenant_id FROM persons WHERE id = '$STAFF_B') AND steward_person_id IS NULL" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT p.id, p.tenant_id, t.steward_person_id, 'Verification fixture grant' FROM persons p JOIN tenants t ON t.id = p.tenant_id WHERE p.id = '$STAFF_B'" > /dev/null

# Tenant A's rows, each the kind a route takes by id.
A1() { q "$1" | head -1; }
INST_A="$(A1 "SELECT id FROM institutions WHERE tenant_id = '$TENANT_A' AND NOT is_tenant_self AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at")"
INST_A_NAME="$(q "SELECT name FROM institutions WHERE id = '$INST_A'")"
INST_A_UNCLASSIFIED="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TENANT_A', 'Unclassified A (verification $TS)') RETURNING id" | head -1)"
CUST_A="$(A1 "SELECT id FROM persons WHERE institution_id = '$INST_A' AND NOT simulated AND deleted_at IS NULL ORDER BY created_at")"
EV_A="$(q "INSERT INTO evidence (institution_id, kind, summary, provenance, confidence, captured_by_person_id) VALUES ('$INST_A', 'observation', 'System: Fact A (verification)', 'Verification fixture, not a source', 'low', '$STAFF_A') RETURNING id" | head -1)"
FACT_A="$(q "INSERT INTO institution_facts (institution_id, kind, value_text, as_of, evidence_id, captured_by_person_id) VALUES ('$INST_A', 'system', 'Fact A (verification)', '2026-10-01', '$EV_A', '$STAFF_A') RETURNING id" | head -1)"
CAPNAME_A="$(A1 "SELECT name FROM capabilities WHERE institution_id = '$INST_A' AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at")"
ENG_A="$(A1 "SELECT e.id FROM engagements e WHERE e.tenant_id = '$TENANT_A' AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL AND (SELECT count(*) FROM value_runs v WHERE v.engagement_id = e.id AND v.locked_at IS NOT NULL) >= 2 ORDER BY e.created_at")"
ENG_A_RETIRE="$(q "INSERT INTO engagements (tenant_id, institution_id, name, owner_person_id) VALUES ('$TENANT_A', '$INST_A', 'Retire target A (verification $TS)', '$CUST_A') RETURNING id" | head -1)"
RUN_A="$(A1 "SELECT id FROM value_runs WHERE engagement_id = '$ENG_A' AND locked_at IS NOT NULL AND deleted_at IS NULL ORDER BY run_number DESC")"
RUN_A2="$(A1 "SELECT id FROM value_runs WHERE engagement_id = '$ENG_A' AND locked_at IS NOT NULL AND deleted_at IS NULL AND id <> '$RUN_A' ORDER BY run_number DESC")"
OUTCOME_A="$(A1 "SELECT vo.id FROM value_outcomes vo JOIN engagements e ON e.id = vo.engagement_id WHERE e.id = '$ENG_A' AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL ORDER BY vo.created_at")"
# Uncommitted, so a commit reaches its committed_by check.
OUTCOME_A_OPEN="$(A1 "SELECT vo.id FROM value_outcomes vo JOIN institutions i ON i.id = vo.institution_id WHERE i.tenant_id = '$TENANT_A' AND vo.committed_at IS NULL AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL ORDER BY vo.created_at")"
CAP_A="$(A1 "SELECT c.id FROM capabilities c JOIN institutions i ON i.id = c.institution_id WHERE i.tenant_id = '$TENANT_A' AND c.deleted_at IS NULL AND c.superseded_by_id IS NULL ORDER BY c.created_at")"
METRIC_A="$(A1 "SELECT bm.id FROM business_metrics bm JOIN institutions i ON i.id = bm.institution_id WHERE i.tenant_id = '$TENANT_A' AND NOT i.is_tenant_self AND bm.industry_measure_id IS NULL AND bm.deleted_at IS NULL AND bm.superseded_by_id IS NULL ORDER BY bm.created_at")"
METRIC_A_SELF="$(A1 "SELECT bm.id FROM business_metrics bm JOIN institutions i ON i.id = bm.institution_id WHERE i.tenant_id = '$TENANT_A' AND i.is_tenant_self AND bm.deleted_at IS NULL AND bm.superseded_by_id IS NULL ORDER BY bm.created_at")"
IND_A="$(A1 "SELECT id FROM industries WHERE tenant_id = '$TENANT_A' ORDER BY slug")"
SLUG_A="$(q "SELECT slug FROM industries WHERE id = '$IND_A'")"
# Q4c1b: a live pack entry of tenant A's, for the retire route's case — a
# fixture, labelled as one in every text column, on the throwaway clone only.
# Q4h: two pending account-research results of tenant A's (not-found
# fields, so accept needs no citation), for the account review routes' cases.
ARP_A="$(q "INSERT INTO research_prompts (tenant_id, institution_id, result_kind, phase, contract_version, template_version, prompt_text, prompt_sha256, generated_by_person_id)
  VALUES ('$TENANT_A', '$INST_A', 'institution_fact', 'entity', 1, 1, 'tenant scope fixture', encode(sha256(convert_to('tenant scope fixture', 'UTF8')), 'hex'), '$STAFF_A') RETURNING id" | head -1)"
ARR_A="$(q "INSERT INTO research_results (tenant_id, result_kind, institution_id, field_name, found, not_found_reason, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version)
  VALUES ('$TENANT_A', 'institution_fact', '$INST_A', 'entity', false, 'Verification fixture.', '{\"subject\":\"not_found\",\"item\":{\"kind\":\"entity\",\"reason\":\"Verification fixture.\"},\"ai_sourced\":false}'::jsonb, 'q', 'qe', 't', '$STAFF_A', '$ARP_A', 1) RETURNING id" | head -1)"
ARR_A2="$(q "INSERT INTO research_results (tenant_id, result_kind, institution_id, field_name, found, not_found_reason, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version)
  VALUES ('$TENANT_A', 'institution_fact', '$INST_A', 'disclosure_regime', false, 'Verification fixture.', '{\"subject\":\"not_found\",\"item\":{\"kind\":\"disclosure_regime\",\"reason\":\"Verification fixture.\"},\"ai_sourced\":false}'::jsonb, 'q', 'qe', 't', '$STAFF_A', '$ARP_A', 1) RETURNING id" | head -1)"
MEASURE_A="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TENANT_A', '$IND_A', 'Tenant A measure (verification $TS)', 'count', 'increase', 'Verification fixture.', 'Verification fixture.', true, 'Verification fixture.', 'Verification fixture.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
# O1: a lever on that entry and a link on it, for the lever routes' cases.
# Proposed and linked by tenant A's steward: the database refuses anyone
# else (value_levers_steward_only, lever_offerings_steward_only).
LEVER_A="$(q "INSERT INTO value_levers (tenant_id, industry_measure_id, name, mechanism, leading_indicator, citation, proposed_by_person_id)
  SELECT '$TENANT_A', '$MEASURE_A', 'Tenant A lever (verification $TS)', 'Verification fixture.', 'Verification fixture.', 'Verification fixture, not a source.', steward_person_id FROM tenants WHERE id = '$TENANT_A' RETURNING id" | head -1)"
LINK_A="$(q "INSERT INTO lever_offerings (tenant_id, value_lever_id, offering_id, basis, linked_by_person_id)
  SELECT '$TENANT_A', '$LEVER_A', o.id, 'Verification fixture link.', t.steward_person_id FROM offerings o JOIN tenants t ON t.id = o.tenant_id
   WHERE o.tenant_id = '$TENANT_A' AND o.deleted_at IS NULL AND o.superseded_by_id IS NULL ORDER BY o.offering_key LIMIT 1 RETURNING id" | head -1)"
# The account OUTCOME_A belongs to (not necessarily INST_A), for the body-id case.
OUTCOME_A_INST="$(q "SELECT institution_id FROM value_outcomes WHERE id = '$OUTCOME_A'")"
MARKER_A="$(q "INSERT INTO reference_example_markers (tenant_id, institution_id, kind, source_citation, note, marked_by_person_id)
  SELECT '$TENANT_A', '$INST_A', 'demonstration', 'Verification fixture citation.', 'Verification fixture marker.', steward_person_id FROM tenants WHERE id = '$TENANT_A' RETURNING id" | head -1)"
# W1 fix: tenant A's staff named analyst of record on A's account (the
# guard admits it: A's own staff, linked by A's staff).
APL_A="$(q "INSERT INTO account_person_links (tenant_id, institution_id, person_id, role, title, linked_by_person_id)
  VALUES ('$TENANT_A', '$INST_A', '$STAFF_A', 'analyst_of_record', 'Verification analyst of record', '$STAFF_A') RETURNING id" | head -1)"
# Tenant B's own lever and summary, for the body-id cases.
LEVER_B="$(q "INSERT INTO value_levers (tenant_id, industry_measure_id, name, mechanism, leading_indicator, citation, proposed_by_person_id)
  SELECT tenant_id, id, 'Tenant B lever (verification)', 'Verification fixture.', 'Verification fixture.', 'Verification fixture, not a source.', '$STAFF_B' FROM industry_measures WHERE id = '$MEASURE_OTHER' RETURNING id" | head -1)"
SUMMARY_B="$(q "INSERT INTO executive_summaries (tenant_id, institution_id, lens, body, author_person_id, drafted_with_ai)
  VALUES ('$TENANT_B', '$INST_B', 'general', 'Tenant B summary, a verification fixture of sufficient length.', '$STAFF_B', false) RETURNING id" | head -1)"
RR_A="$(A1 "SELECT id FROM research_results WHERE tenant_id = '$TENANT_A' ORDER BY id")"
RR_A2="$(A1 "SELECT id FROM research_results WHERE tenant_id = '$TENANT_A' AND id <> '$RR_A' ORDER BY id")"
for v in STAFF_A TENANT_A TENANT_B STAFF_B INST_B CUST_B ENG_B IND_B MEASURE_OTHER INST_A INST_A_UNCLASSIFIED CUST_A CAPNAME_A FACT_A ENG_A ENG_A_RETIRE RUN_A RUN_A2 OUTCOME_A OUTCOME_A_OPEN CAP_A METRIC_A METRIC_A_SELF IND_A RR_A RR_A2 MEASURE_A LEVER_A LINK_A MARKER_A LEVER_B SUMMARY_B OUTCOME_A_INST APL_A ARR_A ARR_A2; do
  [ -n "${!v}" ] || { bad "fixture $v is empty"; exit 1; }
done
[ "$(q "SELECT count(*) FROM industries WHERE tenant_id = '$TENANT_B' AND slug = '$SLUG_A'")" = "0" ] || { bad "tenant B unexpectedly has slug $SLUG_A"; exit 1; }
ok "tenant A $TENANT_A (staff, account, engagement with 2 locked runs, outcome, capability, metrics, industry, research results)"
ok "tenant B $TENANT_B (staff, account, customer, engagement, industry); a measure of another tenant"

step "4. Server: development, header OFF — sessions only"
env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=0 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$LOG" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/api/health" && break; sleep 0.5; done
curl -s "http://127.0.0.1:$PORT/api/health" | grep -q '"actor_header":"off"' && ok "server up, actor_header off" || { bad "server did not start"; cat "$LOG"; exit 1; }

step "4b. A hypothesis of tenant A's, through the real routes (no guard switched off)"
# Signed in as A's staff (by session). The chain is built by the routes
# that build it in use: an account in A's pack industry, a capability, its
# claim on MEASURE_A (a pack entry with a direction), an outcome with a
# recorded baseline, the metric's pack basis, then the hypothesis itself,
# on LEVER_A. value_hypotheses_guard checks it like any other.
JAR_A="$(mktemp "${TMPDIR:-/tmp}/lvrf_p3_jar.XXXXXX")"
PA() {  # PATH BODY — as A; status in $CODE, body in $PA_OUT
  PA_OUT="$(curl -s -b "$JAR_A" -c "$JAR_A" -w '\n%{http_code}' -X POST -H 'content-type: application/json' -d "$2" "http://127.0.0.1:$PORT$1")"
  CODE="${PA_OUT##*$'\n'}"; PA_OUT="${PA_OUT%$'\n'*}"
}
pj() { node -e "console.log(JSON.parse(process.argv[1])$1)" "$PA_OUT"; }
PA /api/auth/login "{\"email\":\"$EMAIL_A\",\"password\":\"$PW\"}"; [ "$CODE" = "200" ] || { bad "A sign-in: $CODE $PA_OUT"; exit 1; }
OFFERING_KEY_A="$(q "SELECT offering_key FROM offerings WHERE tenant_id = '$TENANT_A' AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY offering_key LIMIT 1")"
PA /api/account-inputs "{\"institution\":{\"name\":\"Tenant A hypothesis account (verification $TS)\",\"industry_slug\":\"$SLUG_A\",\"classification_note\":\"Verification: classified for the hypothesis fixture.\"},\"persons\":[{\"full_name\":\"Hypothesis owner (verification)\",\"email\":\"hyp.owner.$TS@account-a.example\",\"title\":\"Owner\"}]}"
[ "$CODE" = "201" ] || { bad "fixture account: $CODE $PA_OUT"; exit 1; }
INST_H="$(pj .institution_id)"; OWNER_H="$(pj .person_ids[0])"
PA "/api/institutions/$INST_H/offerings" "{\"offering_key\":\"$OFFERING_KEY_A\",\"capability_name\":\"Hypothesis capability (verification)\",\"owner_person_id\":\"$OWNER_H\",\"is_primary\":false,\"basis\":\"Verification: attached for the hypothesis fixture.\"}"
[ "$CODE" = "201" ] || { bad "fixture capability: $CODE $PA_OUT"; exit 1; }
CAP_H="$(pj .capability_id)"
PA "/api/capabilities/$CAP_H/industry-measures" "{\"industry_measure_id\":\"$MEASURE_A\",\"claim\":\"Verification: the capability claims the fixture entry.\"}"
[ "$CODE" = "201" ] || { bad "fixture claim: $CODE $PA_OUT"; exit 1; }
PA "/api/institutions/$INST_H/value-outcomes" "{\"engagement_name\":\"Hypothesis engagement (verification)\",\"engagement_owner_person_id\":\"$OWNER_H\",\"capability_name\":\"Hypothesis capability (verification)\",\"metric\":{\"name\":\"Hypothesis metric $TS\",\"unit\":\"count\",\"direction\":\"increase\",\"source_system\":\"verification system of record\",\"owner_person_id\":\"$OWNER_H\"},\"baseline_value\":0,\"baseline_measured_at\":\"2026-09-30T00:00:00Z\"}"
[ "$CODE" = "201" ] || { bad "fixture outcome: $CODE $PA_OUT"; exit 1; }
OUTCOME_H="$(pj .value_outcome_id)"; METRIC_H="$(pj .business_metric_id)"
PA "/api/business-metrics/$METRIC_H/pack-basis" "{\"industry_measure_id\":\"$MEASURE_A\",\"basis_note\":\"Verification: the fixture metric is the fixture entry.\"}"
[ "$CODE" = "201" ] || { bad "fixture pack basis: $CODE $PA_OUT"; exit 1; }
PA "/api/institutions/$INST_H/hypotheses" "{\"value_outcome_id\":\"$OUTCOME_H\",\"value_lever_id\":\"$LEVER_A\",\"statement\":\"Tenant A hypothesis, stated through the route for the checks.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"2030-01-01\",\"falsifier_conditions\":\"on the same population\"}"
[ "$CODE" = "201" ] || { bad "fixture hypothesis: $CODE $PA_OUT"; exit 1; }
HYP_A="$(pj .value_hypothesis_id)"
curl -s -b "$JAR_A" -o /dev/null -X POST -H 'content-type: application/json' -d '{}' "http://127.0.0.1:$PORT/api/auth/logout"; rm -f "$JAR_A"
[ "$(q "SELECT reference_value::text || '|' || (SELECT direction FROM industry_measures WHERE id = '$MEASURE_A') || '|' || author_person_id || '|' || lvrf_hypothesis_verdict(h) FROM value_hypotheses h WHERE id = '$HYP_A'")" = "0.0000|increase|$STAFF_A|open" ] \
  && ok "HYP_A $HYP_A stated by A through the route: reference 0 (recorded baseline), the entry's direction increase, verdict open" || { bad "HYP_A row"; exit 1; }
[ "$(q "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'O'")" = "0" ] && ok "no trigger is disabled on the clone" || bad "a disabled trigger"

step "5. The cases"
export BASE="http://127.0.0.1:$PORT" VERIFY_DB LOG PW EMAIL_A EMAIL_B TS
export STAFF_A TENANT_A TENANT_B STAFF_B INST_B CUST_B ENG_B IND_B SLUG_B MEASURE_OTHER INST_A INST_A_NAME INST_A_UNCLASSIFIED CUST_A CAPNAME_A FACT_A
export ENG_A ENG_A_RETIRE RUN_A RUN_A2 OUTCOME_A OUTCOME_A_OPEN CAP_A METRIC_A METRIC_A_SELF IND_A SLUG_A RR_A RR_A2 MEASURE_A LEVER_A LINK_A HYP_A MARKER_A LEVER_B SUMMARY_B OUTCOME_A OUTCOME_A_INST APL_A ARR_A ARR_A2
export ROUTES
if node scripts/verify_tenant_scope_cases.mjs; then CASES_OK=1; else CASES_OK=0; fi
# The driver prints its own PASS/FAIL lines and a final count line.

step "6. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> setup ${PASS} passed, ${FAIL} failed; cases $([ "$CASES_OK" = 1 ] && echo passed || echo FAILED)"
[ "$FAIL" -eq 0 ] && [ "$CASES_OK" = 1 ]
