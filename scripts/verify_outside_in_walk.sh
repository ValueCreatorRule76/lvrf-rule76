#!/usr/bin/env bash
#
# Q4c2 — the outside-in walk card on the account page (LVRF_PLAN §4c) and
# its read, GET /api/institutions/:institutionId/walk. Local verification.
#
#   ./scripts/verify_outside_in_walk.sh [screenshot_dir]
#
# Clone `lvrf_verifywalk` (createdb -T lvrf -O lvrf_app), migrated and
# hardened, dropped on exit. API with the header actor
# (LVRF_ALLOW_ACTOR_HEADER=1, this throwaway server only); the page through
# Vite and headless Chrome, signed in by SESSION. FICTIONAL accounts only.
#
# DELIBERATE BREAKS edit a source file in place and restore it
# byte-identical (cmp); the EXIT trap restores them too.

set -euo pipefail
cd "$(dirname "$0")/.."
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifywalk
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3071; VITE_PORT=5177; CDP_PORT=9337
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_walk.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ROUTE=server/routes/outsideInWalk.ts
CARD=client/src/components/OutsideInWalk.tsx
EVCARD=client/src/components/workbench/AddEvidenceCard.tsx
REFUSAL=server/lib/refusal.ts
for f in "$ROUTE" "$CARD" "$EVCARD" "$REFUSAL"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$ROUTE" "$CARD" "$EVCARD" "$REFUSAL"; do
    cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }
  done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
trap cleanup EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
start_server() {
  LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start: $(tail -5 "$W/server.log")"; exit 1
}
req() {  # METHOD PATH [BODY] [ACTOR]
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: ${4:-$S}" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: ${4:-$S}" -d "$3" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING] [ACTOR]
  req "$1" "$2" "$3" "${7:-$S}"
  local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 400)"; fi
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate, harden; fixtures"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@walk.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant'), ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
IND_M="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
IND_O="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'retail'")"
MEAS() { q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$1', '$2', 'incidents per 200,000 hours', 'decrease', 'Recordable incidents x 200,000 / hours worked (fixture).', 'w', true, 'r', 'Fixture confounders: reporting practice, mix of work.', 'Verification fixture, not a source.') RETURNING id" | head -1; }
E_M="$(MEAS "$IND_M" "Walk TRIR (fixture)")"; E_O="$(MEAS "$IND_O" "Walk retail entry (fixture)")"
[ -n "$E_M" ] && [ -n "$E_O" ] && ok "steward S, authorized X; a manufacturing pack entry and a retail one (fixtures)" || { bad "fixtures"; exit 1; }
start_server && ok "API up on $PORT"
acct() { req POST /api/account-inputs "{\"institution\":{\"name\":\"$1 $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for the walk.\"}}"; rj b.institution_id; }
A_API="$(acct 'Walk API account')"; A_UI="$(acct 'Walk UI account')"; A_UI2="$(acct 'Walk UI account two')"
TEN_X="$(q "SELECT id FROM tenants WHERE id <> '$TEN' ORDER BY id LIMIT 1")"
INST_X="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TEN_X', 'Other tenant (walk verification $TS)') RETURNING id" | head -1)"

step "3. GET /api/institutions/:institutionId/walk"
expect GET "/api/institutions/$A_API/walk" "" 200 "the walk read on a fresh account"
[ "$(rj "[b.institution.industry_slug, b.persons.length, b.capabilities.length, b.engagements.length, b.pack.some(m=>m.id==='$E_M' && m.confounders.startsWith('Fixture confounders')), b.offerings.some(o=>o.offering_key==='skillsoft_compliance_suite')].join()")" = "manufacturing,0,0,0,true,true" ] \
  && ok "  ...nothing done yet; the manufacturing pack with confounders; the offering catalog" || bad "  ...$(head -c 300 "$W/r.json")"
expect GET "/api/institutions/$INST_X/walk" "" 404 "another tenant's account" "institution $INST_X not found"

step "4. The walk's routes (API), with the cases §4c names"
expect POST "/api/institutions/$A_API/inputs" "{\"persons\":[{\"full_name\":\"API Analyst (external analyst of record)\",\"email\":\"api.analyst.$TS@walk.example\",\"title\":\"External analyst of record\"}]}" 201 "W1: the analyst of record"
OWNER="$(rj b.person_ids[0])"
expect POST "/api/institutions/$A_API/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"API safety capability\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "W2: offering and capability"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E_O\",\"claim\":\"Verification: another industry's entry.\"}" 422 "W3: a claim on another industry's entry" "not Retail"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E_M\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "W3: the claim"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E_M\",\"claim\":\"again\"}" 409 "W3: a second claim (final)" "a claim is not amended"
expect POST "/api/institutions/$A_API/value-outcomes" "{\"engagement_name\":\"API walk — reference example, not an engagement\",\"engagement_owner_person_id\":\"$OWNER\",\"capability_name\":\"API safety capability\",\"metric\":{\"name\":\"API TRIR\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"API fixture disclosures\",\"owner_person_id\":\"$OWNER\"},\"baseline_value\":0,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}" 201 "W4: the outcome, baseline 0 (zero is data), no target"
OUT="$(rj b.value_outcome_id)"; MET="$(rj b.business_metric_id)"; ENG="$(rj b.engagement_id)"
[ "$(q "SELECT baseline_value::text || '|' || (target_value IS NULL) FROM value_outcomes WHERE id = '$OUT'")" = "0.0000|true" ] && ok "  ...stored 0, target null" || bad "  ...outcome row"
expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E_O\",\"basis_note\":\"v\"}" 422 "W5: a basis on another industry's entry" "not Retail"
expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E_M\",\"basis_note\":\"Verification: same rate.\"}" 201 "W5: the basis"
expect POST "/api/business-metrics/$MET/pack-basis" "{\"industry_measure_id\":\"$E_M\",\"basis_note\":\"again\"}" 409 "W5: a second basis (final)" "a basis is not amended"
EVB() { printf '{"kind":"%s","provenance":"Fixture CR disclosures, page 21 (not a source)","summary":"%s","supports":"%s","confidence":"medium","source_verified":false,"ai_sourced":false,"simulated":false}' "$1" "$2" "$3"; }
expect POST "/api/value-outcomes/$OUT/evidence" "$(EVB vendor_publication 'A vendor claim offered as the actual' actual)" 422 "W6: a vendor publication as the actual: refused by the database" "vendor-published evidence may not support a measured actual"
expect POST "/api/value-outcomes/$OUT/evidence" "$(EVB public_filing 'TRIR FY25 0 (fixture)' baseline)" 201 "W6: the baseline evidence, before any run"
expect POST "/api/value-outcomes/$OUT/evidence" "$(EVB vendor_publication 'Vendor claim: 75% reduction, no period (fixture)' impact_basis)" 201 "W6: the vendor claim as impact_basis"
expect POST "/api/engagements/$ENG/produce-run" '{"banner_title":"OUTSIDE-IN HYPOTHESIS","note":"Verification: an outside-in hypothesis from published material.","source_fixture":"walk_api_outside_in"}' 201 "W7: produce the run"
RUN="$(rj b.value_run_id)"
expect POST "/api/value-runs/$RUN/lock" '{"lock_reason":"Verification: first locked."}' 200 "W8: lock it"
expect POST "/api/value-runs/$RUN/lock" '{"lock_reason":"again"}' 409 "W8: a second lock" "is already locked"
expect POST "/api/engagements/$ENG/retire" '{"retirement_reason":"Verification: a reference example."}' 403 "W9: retire by a non-steward" "Retiring an engagement is the steward's act" "$X"
expect POST "/api/engagements/$ENG/retire" '{"retirement_reason":"Verification: a reference example, its run locked."}' 200 "W9: retire by the steward"
expect GET "/api/institutions/$A_API/walk" "" 200 "the walk read after every step"
[ "$(rj "[b.persons.length, b.capabilities[0].claims.length, b.engagements[0].retired, b.engagements[0].outcomes[0].metric.industry_measure_id==='$E_M', b.engagements[0].outcomes[0].evidence.map(e=>e.supports).sort().join('+'), b.engagements[0].runs[0].locked_at!==null].join()")" = "1,1,true,true,baseline+impact_basis,true" ] \
  && ok "  ...every step reflected: person, claim, basis, evidence, locked run, retired" || bad "  ...$(head -c 400 "$W/r.json")"

step "4b. W1 fix: an existing person as analyst of record; refusals in plain words"
A_W1="$(acct 'Walk W1 account')"
REF_W1="$(q "SELECT count(*) FROM refusals")"
expect POST "/api/institutions/$A_W1/inputs" "{\"persons\":[{\"full_name\":\"The steward, added again\",\"email\":\"$S_EMAIL\",\"title\":\"x\"}]}" 409 "adding someone already in LVRF (the steward's own email)" "$S_EMAIL is already in LVRF; select them instead of adding them again."
grep -qiE 'duplicate key|persons_email_key|constraint' "$W/r.json" && bad "  ...the response carries Postgres text or a constraint name: $(cat "$W/r.json")" || ok "  ...no Postgres text and no constraint name in the response"
[ "$(q "SELECT count(*) FROM refusals")" = "$((REF_W1 + 1))" ] && [ "$(q "SELECT constraint_name || '|' || sqlstate FROM refusals ORDER BY refused_at DESC, id DESC LIMIT 1")" = "persons_email_key|23505" ] \
  && ok "  ...recorded in refusals with the constraint, for the record (never shown)" || bad "  ...refusal row"
[ "$(q "SELECT count(*) FROM persons WHERE email = '$S_EMAIL'")" = "1" ] && ok "  ...no duplicate person" || bad "  ...duplicate"
CUST_W1="$(q "SELECT id FROM persons WHERE institution_id = '$A_API' ORDER BY created_at LIMIT 1")"
SIM_STAFF="$(q "INSERT INTO persons (tenant_id, full_name, email, simulated) VALUES ('$TEN', 'Simulated staff (walk verification)', 'sim.staff.$TS@walk.example', true) RETURNING id" | head -1)"
X_STAFF="$(q "SELECT id FROM persons WHERE tenant_id = '$TEN_X' ORDER BY created_at LIMIT 1")"
AOR="/api/institutions/$A_W1/analyst-of-record"
TITLE='External analyst of record — not an employee. Asserting from published material.'
expect POST "$AOR" "{\"person_id\":\"$S\",\"title\":\"$TITLE\",\"role\":\"verifier\"}" 400 "a field the route does not take (a role)" "body.role is not a field of this request"
expect POST "$AOR" "{\"person_id\":\"$S\",\"title\":\"x\"}" 422 "a title under 3 characters" "body.title must state the title on this account"
expect POST "$AOR" "{\"person_id\":\"$CUST_W1\",\"title\":\"$TITLE\"}" 422 "a customer's person (another account's)" "is not a current member of this tenant's staff"
[ -n "$X_STAFF" ] && expect POST "$AOR" "{\"person_id\":\"$X_STAFF\",\"title\":\"$TITLE\"}" 422 "another tenant's staff: read as unknown" "is not a current member of this tenant's staff"
expect POST "$AOR" "{\"person_id\":\"$SIM_STAFF\",\"title\":\"$TITLE\"}" 422 "simulated staff" "is not a current member of this tenant's staff"
expect POST "$AOR" "{\"person_id\":\"$S\",\"title\":\"$TITLE\"}" 201 "the steward named analyst of record on the account (an existing person, linked)"
LINK_W1="$(rj b.account_person_link_id)"
expect POST "$AOR" "{\"person_id\":\"$S\",\"title\":\"$TITLE\"}" 409 "named again" "is already the analyst of record"
expect GET "/api/institutions/$A_W1/walk" "" 200 "the walk read"
[ "$(rj "[b.analysts.length, b.analysts[0].id, b.analysts[0].title, b.persons.length, b.staff.some(p=>p.id==='$S')].join('|')")" = "1|$S|$TITLE|0|true" ] \
  && ok "  ...one analyst of record (the steward, with the title for this account); no person row on the account; the staff list to choose from" || bad "  ...$(head -c 300 "$W/r.json")"
expect POST "/api/institutions/$A_W1/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"W1 safety capability\",\"owner_person_id\":\"$S\",\"is_primary\":false,\"basis\":\"Verification: owned by the analyst of record.\"}" 201 "the analyst of record owns the capability"
expect POST "/api/capabilities/$(rj b.capability_id)/industry-measures" "{\"industry_measure_id\":\"$E_M\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "  ...its claim"
expect POST "/api/institutions/$A_W1/value-outcomes" "{\"engagement_name\":\"W1 engagement\",\"engagement_owner_person_id\":\"$S\",\"capability_name\":\"W1 safety capability\",\"metric\":{\"name\":\"W1 TRIR\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"published disclosures\",\"owner_person_id\":\"$S\"},\"baseline_value\":1.4,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}" 201 "the analyst of record owns the engagement (vendor-side, as the schema says)"
OUT_W1="$(rj b.value_outcome_id)"
expect POST "/api/value-outcomes/$OUT_W1/commit" "{\"committed_by_person_id\":\"$S\",\"committed_at\":\"2026-10-01T00:00:00Z\",\"target_value\":1.2,\"commitment_note\":\"Verification: the analyst committing.\"}" 422 "but the analyst of record cannot COMMIT a target (not the customer's)" "committed_by_person_id does not belong to institution"
expect POST "/api/value-outcomes/$OUT_W1/evidence" "$(EVB system_export 'TRIR extract (fixture)' actual)" 201 "  ...(actual evidence)"
expect POST "/api/value-outcomes/$OUT_W1/measure" '{"actual_value":1.1,"actual_measured_at":"2026-10-12T12:00:00Z"}' 200 "  ...(measured)"
expect POST "/api/value-outcomes/$OUT_W1/verify" "{\"verified_by_person_id\":\"$S\",\"verified_at\":\"2026-10-12T13:00:00Z\",\"attestation_note\":\"Verification: the analyst verifying.\"}" 422 "and the analyst of record cannot VERIFY the actual (his own assertion)" "does not belong to institution"
OUT="$(printf 'BEGIN;\nINSERT INTO account_person_links (tenant_id, institution_id, person_id, role, title, linked_by_person_id) VALUES (%s, %s, %s, %s, %s, %s);\nROLLBACK;\n' "'$TEN'" "'$A_W1'" "'$CUST_W1'" "'analyst_of_record'" "'A title'" "'$S'" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "only the tenant's own people are linked to an account" && ok "the database refuses to link a customer's person (the guard)" || bad "guard: $OUT"
OUT="$(printf 'BEGIN;\nUPDATE account_person_links SET title = %s WHERE id = %s;\nROLLBACK;\n' "'A quietly changed title'" "'$LINK_W1'" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "only the withdrawal may be written" && ok "  ...and refuses an edited title (withdraw and link again)" || bad "edit: $OUT"
OUT="$(printf 'BEGIN;\nDELETE FROM account_person_links WHERE id = %s;\nROLLBACK;\n' "'$LINK_W1'" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "withdraw the link instead" && ok "  ...and refuses a DELETE" || bad "delete: $OUT"
expect POST "/api/account-person-links/$LINK_W1/retire" '{"retirement_reason":"Verification: the analyst steps back."}' 200 "the link withdrawn"
expect POST "/api/institutions/$A_W1/offerings" "{\"offering_key\":\"skillsoft_percipio_platform\",\"capability_name\":\"W1 second capability\",\"owner_person_id\":\"$S\",\"is_primary\":false,\"basis\":\"Verification: after the link is withdrawn.\"}" 422 "  ...after which he no longer owns new things here" "nor its analyst of record"

step "5. The card, in a browser (sign-in by session)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
walk() {  # MODE INST
  set +e  # pipefail would end the script on a failed walk before its code is read
  node scripts/lib/outside_in_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$2" "$S_EMAIL" "$X_EMAIL" "$PW" "$S_NAME" 2>&1 | tee "$W/walk.$1.log"; local rc=${PIPESTATUS[0]}; set -e
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc — a crash is a failure (see $W/walk.$1.log)"
}
walk steward-to-lock "$A_UI"
walk nonsteward-retire "$A_UI"

step "6. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
# B1 — the client's steward gate on W9 removed: X submits; the server still 403s.
edit "$CARD" "const stewardReason = actor?.is_steward ? undefined :" "const stewardReason = true ? undefined :"
sleep 5; walk break-retire-gate "$A_UI"; restore "$CARD"
sleep 3; walk steward-retire "$A_UI"
# B2 — the read's tenant check removed: another tenant's account is served.
edit "$ROUTE" "if (!inst || isOtherTenant(req, inst.tenant_id, { table: 'institutions', id: institutionId })) {" "if (!inst) {"
stop_server; start_server
expect GET "/api/institutions/$INST_X/walk" "" 200 "B2: without the tenant check, another tenant's walk is served — the check is what refuses it"
restore "$ROUTE"; stop_server; start_server
expect GET "/api/institutions/$INST_X/walk" "" 404 "B2 restored: 404 again"
# B3 — the evidence card's outcomeId path removed: evidence cannot be added before a run.
edit "$EVCARD" "  const outcomeId = outcomeIdProp ?? run?.payload.valueOutcomeId;" "  const outcomeId = run?.payload.valueOutcomeId ?? (outcomeIdProp && undefined);"
sleep 5; walk break-evidence "$A_UI2"; restore "$EVCARD"
# B4 — the plain-message mapping removed: Postgres's own text reaches the person.
edit "$REFUSAL" "res.status(status).json({ message: status === 409 ? plainUniqueMessage(err) : err.message });" "res.status(status).json({ message: err.message });"
stop_server; start_server
expect POST "/api/institutions/$A_W1/inputs" "{\"persons\":[{\"full_name\":\"The steward, again\",\"email\":\"$S_EMAIL\"}]}" 409 "B4: without the mapping, the raw Postgres text is shown — the mapping is what keeps it plain" "duplicate key value violates unique constraint \"persons_email_key\""
restore "$REFUSAL"; stop_server; start_server
expect POST "/api/institutions/$A_W1/inputs" "{\"persons\":[{\"full_name\":\"The steward, again\",\"email\":\"$S_EMAIL\"}]}" 409 "B4 restored: plain again" "is already in LVRF; select them instead"
for f in "$ROUTE" "$CARD" "$EVCARD" "$REFUSAL"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
