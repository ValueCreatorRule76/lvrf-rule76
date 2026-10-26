#!/usr/bin/env bash
#
# 3.0 Band A item 2, deploy C — the acts that are Brad's alone, through one
# shared check (server/lib/stewardActs.ts: requireSteward + the route
# classification). Local verification.
#
#   ./scripts/verify_steward_acts.sh
#
# Clone `lvrf_verifysteward` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated and
# hardened, dropped on exit. The tenant is local Skillsoft (it holds
# pending research results, industries and engagements); its first staff
# person is named steward S, and a second staff person X is granted access.
# Both sign in by session — no header.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifysteward
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3079
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_steward.XXXXXX")"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W"; }
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }
code() { local jar="$1" m="$2" p="$3"; shift 3; curl -s -o "$W/r.json" -w '%{http_code}' -X "$m" -b "$jar" -c "$jar" "$@" "$BASE$p"; }
rj() { node -e "try{const v=require('$W/r.json');console.log(String(v$1))}catch{console.log('')}"; }
JSON=(-H 'content-type: application/json')

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Coverage guard: every mutating route is classified, and the source agrees"
node scripts/list_api_routes.mjs --classify | grep -E '^(POST|PUT|PATCH|DELETE) ' > "$W/src.txt" || true
npx tsx -e "import('./server/lib/stewardActs.ts').then(m=>{for(const [r,c] of Object.entries(m.MUTATING_ROUTE_CLASS))console.log(r+' '+c)})" > "$W/table.txt"
SRC_N="$(wc -l < "$W/src.txt" | tr -d ' ')"
MISSING="$(while read -r m p cls; do grep -q "^$m $p " "$W/table.txt" || echo "$m $p"; done < "$W/src.txt")"
[ -z "$MISSING" ] && ok "all $SRC_N mutating routes are in MUTATING_ROUTE_CLASS" || bad "routes with NO classification: $(echo "$MISSING" | tr '\n' '|')"
EXTRA="$(while read -r m p cls; do grep -q "^$m $p " "$W/src.txt" || echo "$m $p"; done < "$W/table.txt")"
[ -z "$EXTRA" ] && ok "every classified route exists in the source" || bad "classified but not a route: $(echo "$EXTRA" | tr '\n' '|')"
WRONG="$(while read -r m p cls; do t="$(grep "^$m $p " "$W/table.txt" | awk '{print $3}')"; { [ "$t" = "steward" ] && [ "$cls" != "steward" ]; } || { [ "$t" = "authorized" ] && [ "$cls" = "steward" ]; } && echo "$m $p (table: $t, source: $cls)"; done < "$W/src.txt"; true)"
[ -z "$WRONG" ] && ok "steward routes carry requireSteward(pool); authorized routes do not" || bad "mismatch: $(echo "$WRONG" | tr '\n' '|')"
[ "$(grep -c ' steward$' "$W/table.txt")" = "15" ] && ok "15 steward-only routes: accept, reject, exclusions, engagement retire, pack-entry retire (Q4c1b), lever, lever-offering, withdraw a lever, withdraw a link (O1), mark, correct and unmark a reference example (O2), correct what an evidence link supports and record an erratum (C1), withdraw an evidence link (C2c) (ratify has no route; grant/revoke are scripts; model and thresholds are commit + deploy)" || bad "steward count: $(grep -c ' steward$' "$W/table.txt")"

step "3. Clone, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }

step "4. Fixtures: steward S and authorized X, both granted"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@steward.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant'), ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
RR1="$(q "SELECT id FROM research_results WHERE tenant_id = '$TEN' AND review_state = 'pending' ORDER BY id LIMIT 1")"
RR2="$(q "SELECT id FROM research_results WHERE tenant_id = '$TEN' AND review_state = 'pending' ORDER BY id OFFSET 1 LIMIT 1")"
IND="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' ORDER BY slug LIMIT 1")"
INST="$(q "SELECT id FROM institutions WHERE tenant_id = '$TEN' AND NOT is_tenant_self AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
CUST="$(q "SELECT id FROM persons WHERE institution_id = '$INST' AND NOT simulated AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
ENG="$(q "INSERT INTO engagements (tenant_id, institution_id, name, owner_person_id) VALUES ('$TEN', '$INST', 'Retire target (verification $TS)', '$CUST') RETURNING id" | head -1)"
for v in S X RR1 RR2 IND INST ENG; do [ -n "${!v}" ] || { bad "fixture $v empty"; exit 1; }; done
ok "S = $S_NAME (steward), X (authorized); two pending research results, an industry, an engagement to retire"

step "5. Server; who the steward is"
env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=0 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; cat "$W/server.log"; exit 1; }
code "$W/s.jar" POST /api/auth/login "${JSON[@]}" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" > /dev/null
[ "$(rj .person.is_steward)" = "true" ] && ok "login: S is_steward true" || bad "S login is_steward: $(rj .person.is_steward)"
code "$W/x.jar" POST /api/auth/login "${JSON[@]}" -d "{\"email\":\"$X_EMAIL\",\"password\":\"$PW\"}" > /dev/null
code "$W/x.jar" GET /api/auth/me > /dev/null
[ "$(rj .person.is_steward)|$(rj .person.steward_name)" = "false|$S_NAME" ] && ok "me: X is_steward false, steward_name = $S_NAME" || bad "X me: $(cat "$W/r.json")"

step "6. X on each steward-only route: 403, the act and the steward named, nothing written"
AUD0="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"; REF0="$(q "SELECT count(*) FROM refusals")"
NOTE='{"review_note":"Verification: a review by a non-steward"}'
EXCL="{\"name\":\"Steward check $TS\",\"reason\":\"Verification: an exclusion by a non-steward\"}"
RET='{"retirement_reason":"Verification: a retirement by a non-steward"}'
check403() {  # LABEL PATH BODY ACT
  local C; C="$(code "$W/x.jar" POST "$2" "${JSON[@]}" -d "$3")"
  [ "$C" = "403" ] && [ "$(rj .code)" = "steward_only" ] && [ "$(rj .message)" = "$4 is the steward's act ($S_NAME)." ] \
    && ok "$1 -> 403: \"$(rj .message)\"" || bad "$1 -> $C $(cat "$W/r.json")"
}
check403 "accept" "/api/research-results/$RR1/accept" "$NOTE" "Accepting a pack entry"
check403 "reject" "/api/research-results/$RR2/reject" "$NOTE" "Rejecting a research result"
check403 "exclude" "/api/industries/$IND/exclusions" "$EXCL" "Excluding a measure from a pack"
check403 "retire" "/api/engagements/$ENG/retire" "$RET" "Retiring an engagement"
# requireSteward runs before any lookup, so a fixed id is enough here.
check403 "retire a pack entry" "/api/industry-measures/00000000-0000-4000-8000-000000000001/retire" "$RET" "Retiring a pack entry"
check403 "propose a lever" "/api/industry-measures/00000000-0000-4000-8000-000000000001/levers" '{"name":"x"}' "Proposing a value lever"
check403 "link a solution" "/api/value-levers/00000000-0000-4000-8000-000000000001/offerings" '{"offering_key":"x"}' "Linking a solution to a lever"
check403 "withdraw a lever" "/api/value-levers/00000000-0000-4000-8000-000000000001/retire" "$RET" "Withdrawing a value lever"
check403 "withdraw a link" "/api/lever-offerings/00000000-0000-4000-8000-000000000001/retire" "$RET" "Withdrawing a solution from a lever"
check403 "mark a reference example" "/api/institutions/00000000-0000-4000-8000-000000000001/reference-example" '{"kind":"demonstration"}' "Marking a reference example"
check403 "correct a marker" "/api/reference-examples/00000000-0000-4000-8000-000000000001/supersede" '{"kind":"demonstration"}' "Correcting a reference-example marker"
check403 "unmark" "/api/reference-examples/00000000-0000-4000-8000-000000000001/retire" "$RET" "Unmarking a reference example"
check403 "correct what a link supports (C1)" "/api/value-outcomes/00000000-0000-4000-8000-000000000001/evidence/00000000-0000-4000-8000-000000000002/correct-support" '{"supports":"impact_basis"}' "Correcting what a link supports"
check403 "withdraw an evidence link (C2c)" "/api/value-outcomes/00000000-0000-4000-8000-000000000001/evidence/00000000-0000-4000-8000-000000000002/withdraw" '{"reason":"Verification: X withdraws it."}' "Withdrawing an evidence link"
check403 "record an erratum (C1)" "/api/value-runs/00000000-0000-4000-8000-000000000001/errata" '{"evidence_id":"x"}' "Recording an erratum"
[ "$(q "SELECT coalesce(max(id), 0) FROM audit_log")" = "$AUD0" ] && ok "  ...no audit row from any of them (nothing written)" || bad "  ...a refused act wrote"
[ "$(q "SELECT count(*) FROM refusals")" = "$REF0" ] && ok "  ...and none recorded as a refusal" || bad "  ...recorded in refusals"
grep -q "LVRF steward-only act refused: actor $X POST /api/engagements/:id/retire" "$W/server.log" && ok "  ...logged at info: actor and route" || bad "  ...not logged"
[ "$(q "SELECT review_state FROM research_results WHERE id = '$RR1'")$(q "SELECT deleted_at IS NULL FROM engagements WHERE id = '$ENG'")" = "pendingt" ] && ok "  ...the research result is still pending; the engagement still current" || bad "  ...state changed"

step "7. S on the same routes: the steward's act goes through"
C="$(code "$W/s.jar" POST "/api/research-results/$RR2/reject" "${JSON[@]}" -d '{"review_note":"Verification: rejected by the steward"}')"; [ "$C" = "200" ] && ok "reject -> 200" || bad "S reject -> $C $(cat "$W/r.json")"
C="$(code "$W/s.jar" POST "/api/industries/$IND/exclusions" "${JSON[@]}" -d "$EXCL")"; [ "$C" = "201" ] && ok "exclude -> 201" || bad "S exclude -> $C $(cat "$W/r.json")"
C="$(code "$W/s.jar" POST "/api/engagements/$ENG/retire" "${JSON[@]}" -d '{"retirement_reason":"Verification: retired by the steward"}')"; [ "$C" = "200" ] && ok "retire -> 200" || bad "S retire -> $C $(cat "$W/r.json")"
C="$(code "$W/s.jar" POST "/api/research-results/$RR1/accept" "${JSON[@]}" -d '{"review_note":"Verification: accepted by the steward"}')"
[ "$C" != "403" ] && ok "accept -> $C (past the steward check; the review rules decide the rest)" || bad "S accept -> 403"

step "8. X on authorized routes: unaffected"
C="$(code "$W/x.jar" POST "/api/institutions/$INST/facts" "${JSON[@]}" -d '{"kind":"system","value_text":"Steward check","as_of":"2026-10-01","evidence_kind":"observation","confidence":"low","evidence_form":"quote","quote_text":"Verification fixture quote, not a source.","how_read":"Verification fixture: read from the fixture quote as written.","provenance":"Verification run, not a real source"}')"
[ "$C" = "201" ] && ok "X records a fact -> 201" || bad "X fact -> $C $(cat "$W/r.json")"
C="$(code "$W/x.jar" GET /api/cohort)"; [ "$C" = "200" ] && ok "X reads -> 200" || bad "X read -> $C"

step "9. Unchanged"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "trigger count unchanged ($T)" || bad "triggers: $T"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
