#!/usr/bin/env bash
#
# Q4c1 — the pack-research cards (client/src/components/PackResearch.tsx)
# and their read, GET /api/industries/:slug/research. Local verification.
#
#   ./scripts/verify_pack_research.sh [screenshot_dir]
#
# Clone `lvrf_verifypackresearch` (createdb -T lvrf -O lvrf_app), migrated
# and hardened, dropped on exit. Two parts:
#
#  A. The API, with the header actor (LVRF_ALLOW_ACTOR_HEADER=1 on this
#     throwaway server only): the read's shape, pending-only, the stale
#     flag, another tenant's slug, and the loop the cards drive.
#  B. A headless-Chrome walk of the page through Vite (LVRF_API_PROXY
#     points it at this server), signed in by SESSION as the steward S and
#     as an authorized non-steward X. Screenshots go to screenshot_dir
#     (default: a temp dir, printed) — look at them.
#
# DELIBERATE BREAKS edit a source file in place and restore it
# byte-identical (cmp); the EXIT trap restores them too.

set -euo pipefail
cd "$(dirname "$0")/.."
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME (part B needs it)"; exit 1; }

VERIFY_DB=lvrf_verifypackresearch
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3074; VITE_PORT=5174; CDP_PORT=9334
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_packresearch.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ROUTE=server/routes/industryResearch.ts
CARDS=client/src/components/PackResearch.tsx
FORM=client/src/components/GovernedForm.tsx
for f in "$ROUTE" "$CARDS" "$FORM"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$ROUTE" "$CARDS" "$FORM"; do
    cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }
  done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
trap cleanup EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
start_server() {
  # The browser walk's Vite runs on $VITE_PORT, not the dev default 5173, so
  # its origin is configured the way production's is (server/lib/origin.ts).
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
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@packresearch.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant'), ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
read -r IND SLUG <<< "$(q "SELECT id || ' ' || slug FROM industries WHERE tenant_id = '$TEN' AND slug = 'information-technology'")"
SLUG_X="$(q "SELECT slug FROM industries WHERE tenant_id <> '$TEN' AND slug NOT IN (SELECT slug FROM industries WHERE tenant_id = '$TEN') ORDER BY slug LIMIT 1")"
# A stale prompt (generated against contract v2), so the flag is tested.
P_STALE="$(q "INSERT INTO research_prompts (tenant_id, industry_id, result_kind, contract_version, template_version, prompt_text, prompt_sha256, generated_by_person_id, generated_at)
  VALUES ('$TEN', '$IND', 'industry_measure', 2, 1, 'a v2 prompt (verification fixture)', encode(sha256(convert_to('a v2 prompt (verification fixture)', 'UTF8')), 'hex'), '$S', now() - interval '1 day') RETURNING id" | head -1)"
[ -n "$IND" ] && [ -n "$X" ] && [ -n "$P_STALE" ] && [ -n "$SLUG_X" ] && ok "steward S ($S_NAME), authorized X, both granted; industry $SLUG; a stale v2 prompt; another tenant's slug $SLUG_X" || { bad "fixtures"; exit 1; }
start_server && ok "API up on $PORT"

step "3. GET /api/industries/:slug/research"
req GET "/api/industries/$SLUG/research"
[ "$CODE" = "200" ] && [ "$(rj "[b.industry.id===\"$IND\", b.contract_version_now===3, Array.isArray(b.prompts), Array.isArray(b.pending)].join()")" = "true,true,true,true" ] \
  && ok "200: industry, contract_version_now 3, prompts, pending" || bad "shape: $CODE $(head -c 300 "$W/r.json")"
[ "$(rj "b.prompts.find(p=>p.id===\"$P_STALE\")?.contract_version")" = "2" ] && ok "the stale prompt is listed with contract_version 2 (the card flags v2 ≠ v3)" || bad "stale prompt missing"
req GET "/api/industries/$SLUG_X/research"
[ "$CODE" = "404" ] && [ "$(rj b.message)" = "industry '$SLUG_X' not found" ] && ok "another tenant's slug -> 404 \"industry '$SLUG_X' not found\"" || bad "other tenant: $CODE $(cat "$W/r.json")"
req GET "/api/industries/$SLUG/pack"; cp "$W/r.json" "$W/pack.before.json"

step "4. The loop the cards drive (API)"
req POST "/api/industries/$IND/research-prompts" '{}' "$X"
[ "$CODE" = "201" ] && ok "generate as authorized X -> 201" || bad "generate: $CODE"
P1="$(rj b.prompt_id)"
M() { printf '{"name":"%s","unit":"%%","direction":"%s","definition":"d","why_it_pays":"w","confounders":"c","citation":"Verification citation","addressable_by_workforce_capability":{"value":true,"why":"y"}}' "$1" "$2"; }
BODY="{\"prompt_id\":\"$P1\",\"industry\":\"$SLUG\",\"research_query\":\"q\",\"query_as_executed\":\"qe\",\"research_tool\":\"API verification tool\",\"measures\":[$(M 'API measure one' increase),$(M 'API measure two' decrease)]}"
req POST "/api/industries/$IND/research-results" "$BODY" "$X"
[ "$CODE" = "201" ] && ok "parse as authorized X -> 201" || bad "parse: $CODE $(head -c 300 "$W/r.json")"
RR1="$(rj "b.results.find(r=>r.field_name==='API measure one').id")"; RR2="$(rj "b.results.find(r=>r.field_name==='API measure two').id")"
req GET "/api/industries/$SLUG/research"
[ "$(rj "b.pending.filter(p=>p.prompt_id===\"$P1\").map(p=>p.field_name).sort().join('|')")" = "API measure one|API measure two" ] && [ "$(rj "b.prompts.find(p=>p.id===\"$P1\").results_count")" = "2" ] \
  && ok "both pending, naming prompt $P1; the prompt counts 2 results" || bad "pending: $(head -c 300 "$W/r.json")"
req POST "/api/research-results/$RR1/accept" '{"review_note":"Verification: accepted."}' "$X"
[ "$CODE" = "403" ] && ok "accept as non-steward X -> 403 (the server is the authority)" || bad "X accept: $CODE"
req POST "/api/research-results/$RR1/accept" '{"review_note":"Verification: accepted."}'
[ "$CODE" = "200" ] && ok "accept as steward S -> 200" || bad "S accept: $CODE"
req POST "/api/research-results/$RR2/reject" '{"review_note":"Verification: rejected."}'
[ "$CODE" = "200" ] && ok "reject as steward S -> 200" || bad "S reject: $CODE"
req GET "/api/industries/$SLUG/research"
[ "$(rj "b.pending.filter(p=>p.id===\"$RR1\"||p.id===\"$RR2\").length")" = "0" ] && ok "pending only: the accepted and the rejected result are gone from the list" || bad "decided results still pending"
req POST "/api/industries/$IND/research-results" "{\"prompt_id\":\"$P1\",\"industry\":\"$SLUG\",\"research_query\":\"q\",\"query_as_executed\":\"qe\",\"research_tool\":\"t\",\"measures\":[{\"name\":\"no citation\"}]}" "$X"
[ "$CODE" = "422" ] && [ "$(rj "Array.isArray(b.issues) && b.issues.length > 1")" = "true" ] && ok "a refused parse returns its issues list ($(rj b.issues.length) issues) — what the card now renders" || bad "issues: $CODE"
req GET "/api/industries/$SLUG/pack"; cp "$W/r.json" "$W/pack.after.json"
node -e "const b=require('$W/pack.before.json'),a=require('$W/pack.after.json');const keys=o=>Object.keys(o).sort().join();process.exit(keys(b)===keys(a)&&keys(b.industry)===keys(a.industry)?0:1)" \
  && ok "the pack GET's shape is unchanged (industry, measures, exclusions); the accepted entry is on it: $(node -e "console.log(require('$W/pack.after.json').measures.some(m=>m.name==='API measure one'))")" || bad "pack shape changed"

step "5. The page, in a browser (sign-in by session)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
walk() {  # MODE — prints PASS/FAIL lines; counted here
  node scripts/lib/pack_research_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$SLUG" "$S_EMAIL" "$X_EMAIL" "$PW" "$P_STALE" "$S_NAME" 2>&1 | tee "$W/walk.$1.log" || true
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
}
walk full

step "6. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
# B1 — the client's steward gate removed: X's Accept is enabled, and the server still answers 403.
perl -0pi -e 's/const stewardReason = actor\?\.is_steward/const stewardReason = true/' "$CARDS"
cmp -s "$W/PackResearch.tsx.orig" "$CARDS" && bad "B1 did not change $CARDS"
sleep 2; walk break-steward-gate; restore "$CARDS"
# B2 — C0 removed: a refused parse shows no issues list.
perl -0pi -e 's/\{result\.status === .refused. && result\.issues && \(/{false \&\& result.status === "refused" \&\& result.issues \&\& (/' "$FORM"
cmp -s "$W/GovernedForm.tsx.orig" "$FORM" && bad "B2 did not change $FORM"
sleep 2; walk break-issues; restore "$FORM"
# B3 — the read's tenant check removed: another tenant's slug is found.
python3 - "$ROUTE" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
a = "'SELECT id, name, slug FROM industries WHERE slug = $1 AND tenant_id = $2',"
assert s.count(a) == 1
open(p, 'w').write(s.replace(a, "'SELECT id, name, slug FROM industries WHERE slug = $1 AND ($2::uuid IS NOT NULL OR true) ORDER BY tenant_id = $2 DESC LIMIT 1',"))
PY
if cmp -s "$W/industryResearch.ts.orig" "$ROUTE"; then bad "B3 did not change $ROUTE"; else
  stop_server; start_server
  req GET "/api/industries/$SLUG_X/research"
  [ "$CODE" = "200" ] && ok "B3: without the tenant predicate, another tenant's pack research is served (200) — the WHERE is what refuses it" || bad "B3: still $CODE"
  restore "$ROUTE"; stop_server; start_server
  req GET "/api/industries/$SLUG_X/research"
  [ "$CODE" = "404" ] && ok "B3 restored: 404 again" || bad "B3 restore: $CODE"
fi
for f in "$ROUTE" "$CARDS" "$FORM"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
