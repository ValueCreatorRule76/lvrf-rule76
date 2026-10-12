#!/usr/bin/env bash
#
# Q4c1b — retiring a pack entry (POST /api/industry-measures/:id/retire,
# migration 0032), retired entries on the pack page, and the R4 caveats aid.
# Local verification.
#
#   ./scripts/verify_pack_entry_retire.sh [screenshot_dir]
#
# Clone `lvrf_verifyretire` (createdb -T lvrf -O lvrf_app), migrated and
# hardened, dropped on exit. API with the header actor
# (LVRF_ALLOW_ACTOR_HEADER=1, this throwaway server only); the page through
# Vite and headless Chrome, signed in by SESSION (scripts/lib/
# pack_research_walk.mjs). Fixtures go through the real routes, not SQL:
# the entries are parsed and accepted, the claim and the pack basis are
# made by the routes that make them in use.
#
# DELIBERATE BREAKS edit a source file in place and restore it
# byte-identical (cmp); the EXIT trap restores them too. The CHECK break
# runs inside a rolled-back transaction.

set -euo pipefail
cd "$(dirname "$0")/.."
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifyretire
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3073; VITE_PORT=5175; CDP_PORT=9335
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_retire.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ROUTE=server/routes/industryMeasureRetire.ts
CARDS=client/src/components/PackResearch.tsx
PAGE=client/src/pages/IndustryPackPage.tsx
for f in "$ROUTE" "$CARDS" "$PAGE"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$ROUTE" "$CARDS" "$PAGE"; do
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
req() {  # METHOD PATH [BODY] [ACTOR] — status in $CODE, body in $W/r.json
  if [ "$1" = GET ]; then
    CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: ${4:-$S}" "$BASE$2")"
  else
    CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: ${4:-$S}" -d "$3" "$BASE$2")"
  fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message??JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING] [ACTOR]
  req "$1" "$2" "$3" "${7:-$S}"
  local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 300)"; fi
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate (0032), harden"
dropdb --if-exists "$VERIFY_DB"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }
N_TRIG="$(q "SELECT count(DISTINCT trigger_name || '.' || event_object_table) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$N_TRIG" = "$EXPECT_TRIGGERS" ] && ok "$N_TRIG distinct triggers (unchanged by 0032)" || bad "triggers: $N_TRIG, expected $EXPECT_TRIGGERS"
VALID="$(q "SELECT convalidated FROM pg_constraint WHERE conname = 'industry_measures_retirement_is_complete'")"
LEGACY_RETIRED="$(q "SELECT count(*) FROM industry_measures WHERE status = 'retired' AND retired_by_person_id IS NULL")"
{ [ "$LEGACY_RETIRED" -gt 0 ] && [ "$VALID" = "f" ]; } || { [ "$LEGACY_RETIRED" = "0" ] && [ "$VALID" = "t" ]; } \
  && ok "the CHECK is present: validated '$VALID' ($LEGACY_RETIRED legacy retired test rows in this clone; none are rewritten)" || bad "CHECK state: validated $VALID with $LEGACY_RETIRED legacy rows"
OUT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs || true)"
case "$OUT" in "schema drift: none"*0032_retire_pack_entry*) ok "D2: $OUT" ;; *) bad "D2: $OUT" ;; esac

step "3. Fixtures, through the routes"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@retire.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant'), ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
read -r IND SLUG <<< "$(q "SELECT id || ' ' || slug FROM industries WHERE tenant_id = '$TEN' AND slug = 'information-technology'")"
# Another tenant's entry, for the 404.
read -r IND_X TEN_X <<< "$(q "SELECT id || ' ' || tenant_id FROM industries WHERE tenant_id <> '$TEN' ORDER BY slug LIMIT 1")"
M_X="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN_X', '$IND_X', 'Other tenant entry (verification)', '%', 'increase', 'd', 'w', true, 'r', 'c', 'Verification fixture, not a source.') RETURNING id" | head -1)"
start_server && ok "API up on $PORT"

mk() { printf '{"name":"%s","unit":"%%","direction":"increase","definition":"d","why_it_pays":"w","confounders":"c","citation":"Verification citation, not a source.","addressable_by_workforce_capability":{"value":true,"why":"y"}}' "$1"; }
accept_all() {  # NAMES... — generate a prompt, parse the names, accept each as S
  req POST "/api/industries/$IND/research-prompts" '{}'; local P; P="$(rj b.prompt_id)"
  local ms=""; for n in "$@"; do ms="$ms${ms:+,}$(mk "$n")"; done
  req POST "/api/industries/$IND/research-results" "{\"prompt_id\":\"$P\",\"industry\":\"$SLUG\",\"research_query\":\"q\",\"query_as_executed\":\"qe\",\"research_tool\":\"Retire verification tool\",\"measures\":[$ms]}"
  [ "$CODE" = "201" ] || { bad "fixture parse: $CODE $(said)"; exit 1; }
  for id in $(rj "b.results.map(r=>r.id).join(' ')"); do
    req POST "/api/research-results/$id/accept" '{"review_note":"Verification: accepted as a fixture."}'
    [ "$CODE" = "200" ] || { bad "fixture accept: $CODE $(said)"; exit 1; }
  done
}
accept_all "Retire E1 plain" "Retire E2 claimed" "Retire E3 basis" "Retire E4 claimed by a retired capability" "Retire E5 browser" "Retire E6 break"
eid() { q "SELECT id FROM industry_measures WHERE industry_id = '$IND' AND name = '$1' AND deleted_at IS NULL"; }
E1="$(eid 'Retire E1 plain')"; E2="$(eid 'Retire E2 claimed')"; E3="$(eid 'Retire E3 basis')"; E4="$(eid 'Retire E4 claimed by a retired capability')"
# An account classified Information Technology, with a person, a capability claiming E2 and E4, and a metric based on E3.
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Retire verification account $TS\",\"industry_slug\":\"$SLUG\",\"classification_note\":\"Verification: classified for the dependency cases.\"},\"persons\":[{\"full_name\":\"Owner (verification)\",\"email\":\"owner.$TS@retire.example\",\"title\":\"Verification owner\"}]}" 201 "an IT-classified account with a person"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Retire verification capability\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: attached for the dependency cases.\"}" 201 "an offering creates the capability"
CAP="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E2\",\"claim\":\"Verification: the capability claims E2.\"}" 201 "the capability claims E2"
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_percipio_platform\",\"capability_name\":\"Retire verification capability (to be retired)\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: a second capability.\"}" 201 "a second capability"
CAP2="$(rj b.capability_id)"
expect POST "/api/capabilities/$CAP2/industry-measures" "{\"industry_measure_id\":\"$E4\",\"claim\":\"Verification: the second capability claims E4.\"}" 201 "the second capability claims E4"
q "UPDATE capabilities SET deleted_at = now(), status = 'retired' WHERE id = '$CAP2'" > /dev/null
expect POST "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"Retire verification engagement\",\"engagement_owner_person_id\":\"$OWNER\",\"metric\":{\"name\":\"Retire verification metric $TS\",\"unit\":\"%\",\"direction\":\"increase\",\"source_system\":\"verification system of record\"},\"capability_name\":\"Retire verification capability\",\"baseline_value\":0,\"baseline_measured_at\":\"2026-10-01T00:00:00Z\"}" 201 "a value outcome creates a metric (baseline 0: zero is data)"
METRIC="$(rj b.business_metric_id)"
expect POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E3\",\"claim\":\"Verification: the capability claims E3 for the basis.\"}" 201 "the capability claims E3 (so the basis is allowed)"
expect POST "/api/business-metrics/$METRIC/pack-basis" "{\"industry_measure_id\":\"$E3\",\"basis_note\":\"Verification: E3 as the pack basis.\"}" 201 "the metric takes E3 as its pack basis"

step "4. The route"
RET='{"retirement_reason":"Verification: the agent flagged its own figure as unverified."}'
expect POST "/api/industry-measures/$E1/retire" "$RET" 403 "a non-steward" "Retiring a pack entry is the steward's act" "$X"
expect POST "/api/industry-measures/$E1/retire" '{"retirement_reason":"too short"}' 422 "a reason under 12 characters" "at least 12 characters"
expect POST "/api/industry-measures/$E1/retire" '{}' 422 "no reason"
expect POST "/api/industry-measures/$M_X/retire" "$RET" 404 "another tenant's entry" "industry measure $M_X not found"
expect POST "/api/industry-measures/not-a-uuid/retire" "$RET" 400 "a malformed id"
expect POST "/api/industry-measures/$E2/retire" "$RET" 409 "an entry a current capability claims" "the capability \"Retire verification capability\" at Retire verification account $TS claims it"
expect POST "/api/industry-measures/$E3/retire" "$RET" 409 "an entry a current metric uses as its pack basis" "the metric \"Retire verification metric $TS\" at Retire verification account $TS uses it as its pack basis"
expect POST "/api/industry-measures/$E4/retire" "$RET" 200 "an entry claimed only by a RETIRED capability: not blocked"
AUD0="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"
expect POST "/api/industry-measures/$E1/retire" "$RET" 200 "the steward retires E1"
[ "$(q "SELECT status || '|' || (deleted_at IS NOT NULL) || '|' || retired_by_person_id || '|' || retirement_reason FROM industry_measures WHERE id = '$E1'")" = "retired|true|$S|Verification: the agent flagged its own figure as unverified." ] \
  && ok "row: status retired, deleted_at set, retired by the steward, the reason as sent" || bad "row: $(q "SELECT status, deleted_at, retired_by_person_id, retirement_reason FROM industry_measures WHERE id = '$E1'")"
[ "$(q "SELECT review_state FROM research_results WHERE industry_measures_id = '$E1'")" = "accepted" ] && ok "the accepted research result stays accepted, still pointing at E1" || bad "the research result changed"
[ "$(q "SELECT count(*) FROM audit_log WHERE id > $AUD0 AND table_name = 'industry_measures' AND record_id = '$E1' AND actor_person_id = '$S' AND new_row->>'status' = 'retired'")" = "1" ] && ok "audited, with the steward as actor" || bad "no audit row"
expect POST "/api/industry-measures/$E1/retire" "$RET" 409 "retiring it again" "was already retired by $S_NAME"

step "5. The CHECK, by direct SQL"
E5="$(eid 'Retire E5 browser')"; E6="$(eid 'Retire E6 break')"
OUT="$(psql -X -d "$VERIFY_DB" -c "UPDATE industry_measures SET status = 'retired', deleted_at = now() WHERE id = '$E6'" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "industry_measures_retirement_is_complete" && ok "retired with no person or reason: refused by industry_measures_retirement_is_complete" || bad "$OUT"
OUT="$(psql -X -d "$VERIFY_DB" -c "UPDATE industry_measures SET deleted_at = now() WHERE id = '$E6'" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "industry_measures_retirement_is_complete" && ok "deleted_at without status retired: refused" || bad "$OUT"
OUT="$(psql -X -d "$VERIFY_DB" -c "UPDATE industry_measures SET status = 'retired', deleted_at = now(), retired_by_person_id = '$S', retirement_reason = 'short' WHERE id = '$E6'" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "industry_measures_retirement_is_complete" && ok "a reason under 12 characters: refused by the CHECK too" || bad "$OUT"
OUT="$(psql -X -d "$VERIFY_DB" -c "UPDATE industry_measures SET retired_by_person_id = '$S', retirement_reason = 'A reason without the retirement.' WHERE id = '$E6'" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "industry_measures_retirement_is_complete" && ok "who and why on a current entry: refused" || bad "$OUT"

step "6. The pack GET, exclusion, and return"
req GET "/api/industries/$SLUG/pack"
[ "$(rj "b.measures.some(m=>m.name==='Retire E1 plain')")" = "false" ] && [ "$(rj "JSON.stringify(b.retired.filter(r=>r.name==='Retire E1 plain').map(r=>[r.retired_by,r.retirement_reason,r.review_note,r.excluded]))")" = "[[\"$S_NAME\",\"Verification: the agent flagged its own figure as unverified.\",\"Verification: accepted as a fixture.\",false]]" ] \
  && ok "E1 leaves measures and appears in retired: who, why, its original review, not excluded" || bad "pack: $(head -c 400 "$W/r.json")"
[ "$(rj "b.measures.every(m=>typeof m.id==='string')")" = "true" ] && ok "current entries carry their id (for Retire this entry…)" || bad "ids missing"
expect POST "/api/industries/$IND/exclusions" '{"name":"Retire E1 plain","reason":"Verification: excluded after retirement."}' 201 "a retired name can now be excluded (the 409 path works)"
expect POST "/api/industries/$IND/exclusions" '{"name":"Retire E5 browser","reason":"Verification: a current entry."}' 409 "a CURRENT name still cannot be excluded" "a measure cannot be both in the pack"
req GET "/api/industries/$SLUG/pack"
[ "$(rj "b.retired.find(r=>r.name==='Retire E1 plain').excluded")" = "true" ] && ok "the retired list now says E1 was excluded since" || bad "excluded flag"
# Return: E4 (retired, not excluded) can come back as a new entry; E1 (excluded) cannot.
req POST "/api/industries/$IND/research-prompts" '{}'; P="$(rj b.prompt_id)"
req POST "/api/industries/$IND/research-results" "{\"prompt_id\":\"$P\",\"industry\":\"$SLUG\",\"research_query\":\"q\",\"query_as_executed\":\"qe\",\"research_tool\":\"t\",\"measures\":[$(mk 'Retire E4 claimed by a retired capability'),$(mk 'Retire E1 plain')]}"
R4="$(rj "b.results.find(r=>r.field_name.startsWith('Retire E4')).id")"; R1="$(rj "b.results.find(r=>r.field_name==='Retire E1 plain').id")"
expect POST "/api/research-results/$R4/accept" '{"review_note":"Verification: back with a verified citation."}' 200 "a retired, unexcluded name returns through a new accepted result"
[ "$(q "SELECT count(*) || '/' || count(*) FILTER (WHERE deleted_at IS NULL) FROM industry_measures WHERE industry_id = '$IND' AND name = 'Retire E4 claimed by a retired capability'")" = "2/1" ] && ok "  ...as a NEW row; the retired one stays retired" || bad "  ...rows"
expect POST "/api/research-results/$R1/accept" '{"review_note":"Verification: should be refused."}' 409 "an excluded name cannot return" "was excluded from this pack"

step "7. The page, in a browser"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
walk() {  # MODE ENTRY_NAME
  node scripts/lib/pack_research_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$SLUG" "$S_EMAIL" "$X_EMAIL" "$PW" "${2:-}" "$S_NAME" 2>&1 | tee "$W/walk.$1.log" || true
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
}
walk caveats
walk nonsteward-retire "Retire E5 browser"
walk retire "Retire E5 browser"

step "8. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
# B1 — the dependency check removed: a claimed entry is retired.
python3 - "$ROUTE" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read(); a = "if (claims.length > 0 || bases.length > 0) {"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, "if (false) {"))
PY
stop_server; start_server
expect POST "/api/industry-measures/$E2/retire" "$RET" 200 "B1: without the dependency check, the entry a current capability claims is retired — the check is what refuses it"
restore "$ROUTE"; stop_server; start_server
# B2 — the CHECK dropped (rolled back): a retirement with no person or reason lands.
OUT="$(printf 'BEGIN;\nALTER TABLE industry_measures DROP CONSTRAINT industry_measures_retirement_is_complete;\nUPDATE industry_measures SET status = %s, deleted_at = now() WHERE id = %s;\nROLLBACK;\n' "'retired'" "'$E6'" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "UPDATE 1" && ok "B2: without the CHECK, an entry is retired with no person and no reason — the CHECK is what holds it (rolled back)" || bad "B2: $OUT"
[ "$(q "SELECT count(*) FROM pg_constraint WHERE conname = 'industry_measures_retirement_is_complete'")$(q "SELECT deleted_at IS NULL FROM industry_measures WHERE id = '$E6'")" = "1t" ] && ok "  ...after B2: the CHECK is in place, E6 still current" || bad "  ...B2 left state"
# B3 — the client's tick gate removed: Accept is enabled without it.
python3 - "$CARDS" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read(); a = "(decision === 'reject' || caveatsRead)"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, "true"))
PY
sleep 2; walk break-tick; restore "$CARDS"
# B4 — the client's steward gate on "Retire this entry…" removed: the server still refuses.
python3 - "$PAGE" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read(); a = "const stewardReason = actor?.is_steward\n    ? undefined"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, "const stewardReason = true\n    ? undefined"))
PY
sleep 2; walk break-retire-gate "Retire E6 break"; restore "$PAGE"
for f in "$ROUTE" "$CARDS" "$PAGE"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
