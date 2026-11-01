#!/usr/bin/env bash
#
# L50 + L52 — correcting what Gate B recorded (LVRF_PLAN §18; Brad, 1 Nov 2026): a No opening says why; the about
# control offers the tenant, every account and a typed company, and pre-fills nothing; a supersession batch with a
# dry run, whose marks carry and whose live links move. Local verification. L50 is in verify_value_hypotheses.
#
#   ./scripts/verify_supersession.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` to `lvrf_verifyl52`, migrated and hardened, replays Gate B's acts, dropped on exit. The real
# rows are corrected on the clone only. Every guard stays on.
# DELIBERATE BREAKS, every file restored byte-identical, every function restored by re-applying hardening.sql:
#   B1a  the route taking a No with no reason: the act guard refuses it
#   B1b  the act guard's rule taken out as well: it lands, so those two are what stop it
#   B2   the about control pre-filled: the walk catches it
#   B3   the mark not carried: evidence_final refuses the supersession
#   B4   a live link left behind: evidence_final refuses the supersession
#   B5   the plan check removed: a stale plan is accepted, so that check is what refuses it
#   B7   add an industry with the route's steward check removed: the database refuses
#   B8   the erratum route reading only the row's own link: no erratum once its link has moved
#   B9   the chain cut to one step: an erratum two steps on is stopped, so the walk is what carries it
#   B6   the frozen move's guard loosened: a withdrawn link from long ago could come back, so its "now" is what stops it

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
command -v pdftotext > /dev/null && command -v pdfinfo > /dev/null || { echo "REFUSING: pdftotext/pdfinfo (poppler) not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyl52
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3106; VITE_PORT=5206; CDP_PORT=9366
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_l52.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
CITE=server/routes/evidenceCitation.ts; AEV=server/routes/accountEvidence.ts; ABOUT=client/src/components/useAbout.tsx
IND=server/routes/industryAdd.ts; CORR=server/routes/corrections.ts
EDITED=("$CITE" "$AEV" "$ABOUT" "$IND" "$CORR")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
start_server() {
  LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start"; exit 1
}
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for p in $(lsof -ti tcp:$PORT,$VITE_PORT,$CDP_PORT 2>/dev/null); do kill "$p" 2>/dev/null || true; done
  for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
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
J() { node -e 'const a=process.argv.slice(1);const o={};for(let i=0;i<a.length;i+=2){let v=a[i+1];try{if(/^[\[{]|^-?\d+(\.\d+)?$|^(true|false|null)$/.test(v))v=JSON.parse(v)}catch{}o[a[i]]=v}console.log(JSON.stringify(o))' "$@"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
sqlrefused() {  # LABEL SQL EXPECTED_SUBSTRING [ACTOR]
  local out; out="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "${4:-$S}" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
sqlcommit() {  # SQL — kept on the clone, under the steward
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nCOMMIT;\n" "$S" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1
}
sqlaccepted() {  # SQL [ACTOR]
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nROLLBACK;\n" "${2:-$S}" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1 || true
}
fnbreak() {  # FUNCTION OLD NEW — a hardening.sql function with one piece replaced, on the clone only
  python3 - "$W/fnbreak.sql" "$1" "$2" "$3" <<'PY'
import re, sys
out, name, a, b = sys.argv[1:5]
s = open('db/hardening.sql').read()
m = re.search(r"CREATE OR REPLACE FUNCTION " + name + r"\(.*?\n(?:END )?\$\$;\n", s, re.S)
fn = m.group(0); assert fn.count(a) == 1, a
open(out, 'w').write(fn.replace(a, b))
PY
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/fnbreak.sql" > /dev/null
}
reharden() {
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "185" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 185 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}

appq() { PGOPTIONS="-c default_transaction_read_only=off" psql "$VERIFY_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
sqlapp() {  # LABEL SQL EXPECTED_SUBSTRING — as lvrf_app, the role the API runs as
  local out; out="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "$S" "$2" | appq 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused" || bad "$1: not refused: $(printf '%s' "$out" | tail -1)"
}
raw() { LVRF_RAW_CURL=1 expect "$@"; }

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc.log")"
(cd client && npx tsc -b) > "$W/tsc2.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc2.log")"

step "2. Clone the prod copy; migrate; harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "185" ] && ok "185 triggers: L50 and L52 add none; B1 adds two for industries" || bad "triggers: $(trig)"

step "3. Fixtures and the server"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
S_TITLE="$(q "SELECT lower(coalesce(title, '')) FROM persons WHERE id = '$S'")"
S_ROLE="$([ -n "$S_TITLE" ] && printf "the vendor's %s" "$S_TITLE" || printf "the vendor's staff")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', 'x.$TS@l52.example') RETURNING id" | head -1)"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
start_server && ok "API up on $PORT"
FORMQ() { J evidence_form quote quote_text 'Named in the fixture document as stated here.' how_read 'Read from the fixture document, page one (fixture).'; }
OC() { printf '/api/evidence/%s/open-citation' "$1"; }
ID() { q "SELECT id FROM evidence WHERE id::text LIKE '$1%'"; }
R9="$(ID 9765335f)"; R2="$(ID 271a449a)"; R1="$(ID 1632a5e0)"; RF="$(ID f9775317)"; RC="$(ID cee6fea9)"; RT="$(ID 423be7c6)"; RG="$(ID 092c46b6)"
SELF_INST="$(q "SELECT id FROM institutions WHERE is_tenant_self LIMIT 1")"; CURIA="$(q "SELECT institution_id FROM evidence WHERE id = '$R1'")"; SCOTTS="$(q "SELECT institution_id FROM evidence WHERE id = '$RT'")"
sf() { J about account kind public_filing provenance 'Fixture filing (not a source)' summary "$1" evidence_form quote quote_text 'Named in the fixture document as stated here.' how_read 'Read from the fixture document, page one (fixture).'; }
fixture() { expect POST "/api/institutions/$SELF_INST/evidence" "$(sf "$1")" 201 "a fixture row: $1"; FX="$(rj b.evidence_id)"; }

step "4. Gate B's acts, replayed on the clone: every row about its own account, as recorded"
expect GET /api/evidence/about-batch "" 200 "the about batch"
ITEMS="$(rj "JSON.stringify(b.rows.map(r=>({evidence_id:r.id,about:'account'})))")"
expect POST /api/evidence/about-batch "$(J expected_count 34 items "$ITEMS" reason 'Verification: as recorded at Gate B.')" 201 "34 stated"
expect POST "/api/evidence/$R1/withdraw-verification" "$(J reason 'Verification: as recorded at Gate B.')" 200 "1632a5e0 withdrawn"
expect POST "/api/evidence/$RF/withdraw-verification" "$(J reason 'Verification: as recorded at Gate B.')" 200 "f9775317 withdrawn"

step "5. A No opening says why (L52, 1): route and database"
expect POST "$(OC "$R2")" '{"source_verified":false}' 422 "a No with no reason: refused" "Say why the source does not support"
expect POST "$(OC "$R2")" '{"source_verified":false,"reason":"short"}' 422 "  ...a reason under 12 characters: refused" "at least 12"
expect POST "$(OC "$R2")" "$(node -e 'const f=JSON.parse(process.argv[1]);console.log(JSON.stringify({source_verified:true,reason:"Verification: a Yes takes no reason.",...f}))' "$(FORMQ)")" 422 "  ...a Yes with a reason: refused" "for an opening that does not support"
[ "$(q "SELECT citation_resolved FROM evidence WHERE id = '$R2'")" = "f" ] && ok "  ...nothing written by any of them" || bad "  ...a refused opening wrote"
expect POST "$(OC "$R2")" "$(J source_verified false reason 'Verification: the figures are not in the release.')" 200 "a No with its reason"
expect POST "$(OC "$R9")" "$(J source_verified false reason 'Verification: the figures are not in the release.')" 200 "  ...9765335f too, as recorded at Gate B"
[ "$(q "SELECT reason FROM governance_acts WHERE act = 'open_citation' AND subject_id = '$R2'")" = "Verification: the figures are not in the release." ] && ok "  ...the reason is on the act" || bad "  ...reason"
expect GET "/api/lineage/evidence/$R2" "" 200 "its lineage"
[ "$(rj "(Array.isArray(b)?b:b.steps).find(s=>s.kind==='open_citation').detail.reason")" = "Verification: the figures are not in the release." ] && ok "  ...and in its lineage" || bad "  ...lineage"
fixture "L52 row for the No break"; F1="$FX"
edit "$CITE" "if (!body.source_verified && reason.length < 12) {" "if (false as boolean) {"
stop_server; start_server
expect POST "$(OC "$F1")" '{"source_verified":false}' 422 "B1a: the route's check removed → the act guard refuses a No with no reason" "says why"
[ "$(q "SELECT citation_resolved FROM evidence WHERE id = '$F1'")" = "f" ] && ok "  ...and the opening went back with the act" || bad "  ...B1a wrote"
fnbreak lvrf_governance_act_guard "AND length(btrim(coalesce(NEW.reason, ''))) < 12 THEN" "AND false THEN"
expect POST "$(OC "$F1")" '{"source_verified":false}' 200 "B1b: the guard's rule removed as well → it lands: those two are what stop it"
restore "$CITE"; stop_server; start_server; reharden
fixture "L52 row after the No break"; F2="$FX"
expect POST "$(OC "$F2")" '{"source_verified":false}' 422 "  ...restored: refused again" "Say why the source does not support"

step "6. The about control (L52, 2)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "the steward signed in by session" || { bad "no session"; exit 1; }
cw() {  # MODE
  local log="$W/walk.$1.log"
  node scripts/lib/l41_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" > "$log" 2>&1; local rc=$?
  PASS=$((PASS + $(grep -c '^  PASS' "$log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$log" || true)))
  grep -E '^  (PASS|FAIL)' "$log" || true
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc (see $log)"
}
export SELF_INST CURIA
cw aboutcontrol
edit "$ABOUT" "  const [choice, setChoice] = useState('');
  const [party, setParty] = useState('');
  const other" "  const [choice, setChoice] = useState('account');
  const [party, setParty] = useState('');
  const other"
sleep 5
cw aboutprefilled
restore "$ABOUT"; sleep 5

step "7. The dry run (L52, 3): writes nothing, and says what happens"
DR=/api/evidence/supersession-batch/dry-run; SB=/api/evidence/supersession-batch
SNAP() { q "SELECT md5((SELECT string_agg(md5(e::text), '' ORDER BY id) FROM evidence e)) || (SELECT count(*) FROM system_exercise_marks) || '|' || (SELECT count(*) FROM value_outcome_evidence) || '|' || (SELECT count(*) FROM governance_acts)"; }
IT() {  # ROW ABOUT_JSON [noreading]
  node -e 'const [id,a,n]=process.argv.slice(1);const f=n?{}:{evidence_form:"quote",quote_text:"Named in the fixture document as stated here.",how_read:"Read from the fixture document, page one (fixture)."};console.log(JSON.stringify({evidence_id:id,about:JSON.parse(a),...f}))' "$1" "$2" "${3:-}"
}
SK="$(J institution_id "$SELF_INST")"; PARTY="$(J other_party 'Fixture Story Company Ltd')"
T1="Skillsoft-published case study naming Scotts Miracle-Gro: '75% reduction rate in recordable incidents' with Skillsoft EHS solutions; no period or baseline stated. A vendor claim about Scotts, not Scotts' own measurement."
T2="FY2027 guidance: revenue \$388-406M, adjusted EBITDA \$108-116M, TDS free cash flow \$14-22M."
T9="LTM DRR of 98%, one percentage point lower than the year ago period"
TX() { node -e 'const b=JSON.parse(process.argv[1]);b.summary=process.argv[2];console.log(JSON.stringify(b))' "$1" "$2"; }
EW="$(q "SELECT id FROM run_errata x WHERE evidence_id = '$RT' AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id) ORDER BY value_run_id" | paste -sd' ' -)"
E1="${EW%% *}"; E2="${EW##* }"
EI() { node -e 'console.log(JSON.stringify({erratum_id:process.argv[1],what_is_right:"It supports the impact basis only. A vendor claim about Scotts is never support for a baseline.",reason:"The link was corrected on 25 Oct 2026, because a vendor claim is never baseline support.",supersession_reason:"The earlier text misidentified the subject of the story."}))' "$1"; }
ERRATA="[$(EI "$E1"),$(EI "$E2")]"
BODY="{\"items\":[$(IT "$RC" "$SK"),$(IT "$RF" "$SK"),$(TX "$(IT "$RT" '"account"')" "$T1"),$(TX "$(IT "$R2" '"account"')" "$T2"),$(TX "$(IT "$R9" '"account"')" "$T9")],\"errata\":$ERRATA}"
ROW() { rj "b.rows.find(r=>r.evidence_id==='$1')$2"; }
S0="$(SNAP)"
expect GET "$SB" "" 200 "the list of rows"
[ "$(rj "b.rows.some(r=>r.id==='$RC')")" = "true" ] && ok "  ...offers the rows" || bad "  ...list"
expect POST "$DR" "$BODY" 403 "X runs the dry run" "steward" "$X"
expect POST "$DR" '{"items":[]}' 422 "no rows" "at least one row"
expect POST "$DR" "{\"items\":[$(IT "$RC" "$SK"),$(IT "$RC" "$SK")]}" 422 "a row twice" "each row once"
expect POST "$DR" "{\"items\":[$(IT "$RC" "$SK" noreading)]}" 200 "a legacy row with no reading"
[ "$(rj "b.can_submit")" = "false" ] && printf '%s' "$(ROW "$RC" ".blockers[0]")" | grep -q "records no reading" && ok "  ...stopped: a new row must record its reading (L52-D5)" || bad "  ...$(ROW "$RC" ".blockers")"
expect POST "$DR" "$BODY" 200 "the dry run"
[ "$(rj b.can_submit)|$(rj b.count)" = "true|7" ] && ok "  ...5 rows and 2 errata, nothing stopping them" || bad "  ...$(rj "JSON.stringify(b.rows.map(r=>r.blockers))")"
HASH="$(rj b.plan_hash)"
[ "$(ROW "$RC" ".current.about")|$(ROW "$RC" ".next.about")|$(ROW "$RC" ".mark.carries")|$(ROW "$RC" ".links.length")|$(ROW "$RC" ".withdrawn_links")|$(ROW "$RC" ".sealed_runs")" = "Curia|Skillsoft|true|0|1|16" ] && ok "  ...cee6fea9: about Curia → Skillsoft; the mark carries; no current link; 16 sealed runs" || bad "  ...cee6fea9: $(ROW "$RC" "")"
[ "$(ROW "$RF" ".next.about")|$(ROW "$RF" ".mark.carries")|$(ROW "$RF" ".withdrawn_links")|$(ROW "$RF" ".sealed_runs")" = "Skillsoft|true|2|10" ] && ok "  ...f9775317: about Skillsoft; the mark carries; 2 withdrawn links stay; 10 sealed runs" || bad "  ...f9775317"
[ "$(ROW "$RT" ".current.about")|$(ROW "$RT" ".next.about")|$(ROW "$RT" ".current.verified")|$(ROW "$RT" ".mark.carries")|$(ROW "$RT" ".links[0].supports")|$(ROW "$RT" ".links[0].moves")|$(ROW "$RT" ".links[0].frozen")|$(ROW "$RT" ".errata")|$(ROW "$RT" ".sealed_runs")" = "Scotts Miracle-Gro|Scotts Miracle-Gro|true|false|impact_basis|true|true|3|2" ] && ok "  ...423be7c6: about Scotts, kept; no mark; its impact-basis link carried on the frozen outcome; 3 errata and 2 runs stay" || bad "  ...423be7c6: $(ROW "$RT" "")"
[ "$(ROW "$RT" ".next.summary")" = "$T1" ] && ok "  ...its current and new text" || bad "  ...text"
[ "$(ROW "$R2" ".next.summary")|$(ROW "$R2" ".links[0].supports")|$(ROW "$R2" ".links[0].frozen")" = "$T2|impact_basis|false" ] && ok "  ...271a449a: the guidance only; its live link moves" || bad "  ...271a449a"
[ "$(ROW "$R9" ".next.summary")|$(ROW "$R9" ".links[0].supports")" = "$T9|baseline" ] && ok "  ...9765335f: the release's words; its baseline moves" || bad "  ...9765335f"
[ "$(rj "b.errata.length")|$(rj "b.errata.every(e=>e.current.what_is_right.includes('another company')&&!e.next.what_is_right.includes('another company'))")" = "2|true" ] && ok "  ...both errata: current and new text" || bad "  ...errata: $(rj "JSON.stringify(b.errata)")"
[ "$(SNAP)" = "$S0" ] && ok "  ...the dry runs wrote nothing" || bad "  ...a dry run wrote"
FACTED="$(q "SELECT e.id FROM evidence e JOIN institution_facts f ON f.evidence_id = e.id WHERE f.deleted_at IS NULL AND f.superseded_by_id IS NULL AND e.superseded_by_id IS NULL AND NOT e.ai_sourced LIMIT 1")"
FI="$(q "SELECT institution_id FROM evidence WHERE id = '$FACTED'")"
expect POST "$DR" "{\"items\":[$(IT "$FACTED" "$PARTY")]}" 200 "a row a current fact rests on"
printf '%s' "$(rj "b.rows[0].blockers.join()")" | grep -q "fact or entity rests" && ok "  ...stopped, saying why (L52-D9)" || bad "  ...$(rj "JSON.stringify(b.rows[0].blockers)")"
AI="$(q "SELECT e.id FROM evidence e JOIN research_results r ON r.evidence_id = e.id WHERE e.superseded_by_id IS NULL LIMIT 1")"
expect POST "$DR" "{\"items\":[$(IT "$AI" "$PARTY")]}" 200 "a row from a research result"
printf '%s' "$(rj "b.rows[0].blockers.join()")" | grep -q "corrected in research" && ok "  ...stopped: research is its path" || bad "  ...$(rj "JSON.stringify(b.rows[0].blockers)")"
expect POST "$DR" "{\"items\":[$(IT "$R9" "$PARTY")]}" 200 "a live baseline moved to a row about another company"
printf '%s' "$(rj "b.rows[0].blockers.join()")" | grep -q "needs evidence about that account" && ok "  ...stopped before any guard: the move could not stand" || bad "  ...$(rj "JSON.stringify(b.rows[0].blockers)")"
fixture "L52 row with a form"; F3="$FX"
expect POST "$DR" "{\"items\":[$(IT "$F3" '"account"' noreading)]}" 200 "a row with a form, restated as it stands"
printf '%s' "$(rj "b.rows[0].blockers.join()")" | grep -q "This changes nothing" && ok "  ...stopped: it changes nothing (L52-D6)" || bad "  ...$(rj "JSON.stringify(b.rows[0].blockers)")"
expect POST "$DR" "{\"errata\":[{\"erratum_id\":\"$E1\",\"supersession_reason\":\"Verification: nothing new here.\"}]}" 200 "an erratum restated as it stands"
printf '%s' "$(rj "b.errata[0].blockers.join()")" | grep -q "This changes nothing" && ok "  ...stopped" || bad "  ...$(rj "JSON.stringify(b.errata[0].blockers)")"
expect POST "$DR" "{\"items\":[$(IT "$R9" '"account"')]}" 200 "a legacy row, its about unchanged, with a reading"
[ "$(rj b.can_submit)" = "true" ] && ok "  ...allowed: the reading is the change" || bad "  ...$(rj "JSON.stringify(b.rows[0].blockers)")"
S0="$(SNAP)"
SUB() { node -e 'const b=JSON.parse(process.argv[1]);console.log(JSON.stringify({...b,expected_count:+process.argv[2],plan_hash:process.argv[3],reason:process.argv[4]}))' "$BODY" "$1" "$2" "$3"; }
expect POST "$SB" "$(SUB 7 "$HASH" short)" 422 "the batch with no real reason" "at least 12"
expect POST "$SB" "$(SUB 8 "$HASH" 'Verification: the count is off.')" 409 "the count off" "The count changed"
expect POST "$SB" "$(SUB 7 0000 'Verification: a stale plan.')" 409 "a stale plan" "changed since the dry run"
expect POST "$SB" "$(SUB 7 "$HASH" 'Verification: not the steward.')" 403 "X submits" "steward" "$X"
[ "$(SNAP)" = "$S0" ] && ok "  ...none of them wrote" || bad "  ...a refused batch wrote"

step "8. The batch, in the browser; the record after"
ER0="$(q "SELECT count(*) FROM run_errata")"
RC="$RC" RF="$RF" RT="$RT" R2="$R2" R9="$R9" E1="$E1" E2="$E2" T1="$T1" T2="$T2" T9="$T9" cw supersession
NC="$(q "SELECT superseded_by_id FROM evidence WHERE id = '$RC'")"; NF="$(q "SELECT superseded_by_id FROM evidence WHERE id = '$RF'")"; NT="$(q "SELECT superseded_by_id FROM evidence WHERE id = '$RT'")"
N2="$(q "SELECT superseded_by_id FROM evidence WHERE id = '$R2'")"; N9="$(q "SELECT superseded_by_id FROM evidence WHERE id = '$R9'")"
[ -n "$NC" ] && [ -n "$NF" ] && [ -n "$NT" ] && [ -n "$N2" ] && [ -n "$N9" ] && ok "5 rows superseded" || bad "superseded: $NC $NF $NT $N2 $N9"
ABT() { q "SELECT lvrf_evidence_about(about_institution_id, about_other_party) FROM evidence WHERE id = '$1'"; }
[ "$(ABT "$NC")|$(ABT "$NF")|$(ABT "$NT")|$(ABT "$N2")" = "Skillsoft|Skillsoft|Scotts Miracle-Gro|Skillsoft" ] && ok "  ...each new row about what was stated" || bad "  ...about: $(ABT "$NC") $(ABT "$NF") $(ABT "$NT")"
[ "$(q "SELECT summary FROM evidence WHERE id = '$NT'")" = "$T1" ] && [ "$(q "SELECT summary FROM evidence WHERE id = '$N2'")" = "$T2" ] && [ "$(q "SELECT summary FROM evidence WHERE id = '$N9'")" = "$T9" ] && ok "  ...with the new text" || bad "  ...text"
[ "$(ABT "$RC")" = "Curia" ] && [ "$(q "SELECT summary FROM evidence WHERE id = '$RT'")" != "$T1" ] && ok "  ...the old rows keep what they said" || bad "  ...old"
[ "$(q "SELECT count(*) FROM evidence WHERE id IN ('$NC','$NF','$NT','$N2','$N9') AND NOT source_verified AND NOT citation_resolved AND evidence_form = 'quote'")" = "5" ] && ok "  ...born unverified and unopened, with the reading (L52-D4)" || bad "  ...new rows"
[ "$(q "SELECT source_verified || '|' || citation_resolved FROM evidence WHERE id = '$R2'")" = "false|true" ] && ok "  ...the No openings stand as recorded on the old rows" || bad "  ...No"
[ "$(q "SELECT count(*) FROM system_exercise_marks m JOIN system_exercise_marks o ON o.reason = m.reason WHERE m.subject_id IN ('$NC','$NF') AND o.subject_id IN ('$RC','$RF')")" = "2" ] && ok "  ...both marks carried, with the same reason; each old row keeps its own" || bad "  ...marks"
[ "$(q "SELECT count(*) FROM system_exercise_marks WHERE subject_id IN ('$NT','$N2','$N9')")" = "0" ] && ok "  ...an unmarked row gains none" || bad "  ...a mark appeared"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'mark' AND subject_table = 'system_exercise_marks' AND subject_id IN (SELECT id FROM system_exercise_marks WHERE subject_id IN ('$NC','$NF'))")" = "2" ] && ok "  ...each mark with its act" || bad "  ...mark acts"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'supersede' AND subject_table = 'evidence' AND result_id IN ('$NC','$NF','$NT','$N2','$N9')")" = "5" ] && ok "  ...each supersession with its act" || bad "  ...acts"
[ "$(q "SELECT n.ai_sourced AND n.research_query = o.research_query AND n.research_tool = o.research_tool FROM evidence n, evidence o WHERE n.id = '$NT' AND o.id = '$RT'")" = "t" ] && ok "  ...423be7c6's AI origin carries (Q4k: permanent)" || bad "  ...AI origin"
[ "$(q "SELECT count(*) FROM value_outcome_evidence WHERE evidence_id = '$RT' AND withdrawn_at IS NOT NULL AND supports = 'impact_basis'")|$(q "SELECT count(*) FROM value_outcome_evidence WHERE evidence_id = '$NT' AND withdrawn_at IS NULL AND supports = 'impact_basis'")" = "1|1" ] && ok "  ...423be7c6's impact-basis link carried: the frozen outcome reads the new row" || bad "  ...frozen link: $(q "SELECT evidence_id, supports, withdrawn_at FROM value_outcome_evidence WHERE evidence_id IN ('$RT','$NT')")"
[ "$(q "SELECT count(*) FROM value_outcome_evidence WHERE evidence_id = '$N2' AND withdrawn_at IS NULL AND supports = 'impact_basis'")|$(q "SELECT count(*) FROM value_outcome_evidence WHERE evidence_id = '$N9' AND withdrawn_at IS NULL AND supports = 'baseline'")" = "1|1" ] && ok "  ...the live links moved" || bad "  ...live links"
[ -n "$(q "SELECT 1 FROM figure_checks WHERE evidence_id = '$N9' LIMIT 1")" ] && ok "  ...and the baseline checked against the reading" || bad "  ...no figure check"
[ "$(q "SELECT count(*) FROM run_errata")" = "$((ER0 + 2))" ] && ok "2 errata superseded: 2 new, none removed" || bad "errata: $(q "SELECT count(*) FROM run_errata")"
[ "$(q "SELECT count(*) FROM run_errata n JOIN run_errata o ON o.id = n.supersedes_id WHERE o.id IN ('$E1','$E2') AND n.evidence_id = o.evidence_id AND n.corrected_to_supports = o.corrected_to_supports AND n.recomputed_score = o.recomputed_score AND n.sealed_score = o.sealed_score AND n.what_is_right NOT LIKE '%another company%' AND n.supersession_reason = 'The earlier text misidentified the subject of the story.'")" = "2" ] && ok "  ...the correction kept, the reason fixed, the supersession reason recorded; the recompute unchanged" || bad "  ...errata text: $(q "SELECT what_is_right, supersession_reason, recomputed_score FROM run_errata ORDER BY recorded_at DESC LIMIT 2")"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'record_erratum' AND route = 'POST /api/evidence/supersession-batch'")" = "2" ] && ok "  ...each with its act" || bad "  ...erratum acts"
expect GET "/api/lineage/evidence/$RC" "" 200 "the old row's lineage"
[ "$(rj "(Array.isArray(b)?b:b.steps).find(s=>s.kind==='superseded_by').detail.about")" = "Skillsoft" ] && ok "  ...names what superseded it" || bad "  ...old lineage"
expect GET "/api/lineage/evidence/$NC" "" 200 "the new row's lineage"
[ "$(rj "(Array.isArray(b)?b:b.steps).find(s=>s.kind==='supersedes').detail.about")" = "Curia" ] && ok "  ...names what it replaced" || bad "  ...new lineage"
expect POST "$(OC "$N9")" '{"source_verified":true}' 200 "9765335f's successor opened Yes: its reading is already recorded"
[ "$(q "SELECT source_verified FROM evidence WHERE id = '$N9'")" = "t" ] && ok "  ...verified, by a person's opening" || bad "  ...opening"
# The addendum: an erratum follows its link down the chain, however many steps (Brad, 1 Nov 2026).
EF1="$(q "SELECT id FROM run_errata x WHERE supersedes_id = '$E1'")"; EF2="$(q "SELECT id FROM run_errata x WHERE supersedes_id = '$E2'")"
RECO="$(q "SELECT string_agg(coalesce(recomputed_score::text, 'none'), ',' ORDER BY id) FROM run_errata WHERE id IN ('$EF1', '$EF2')")"
EA() { node -e 'console.log(JSON.stringify({errata:[{erratum_id:process.argv[1],what_is_right:process.argv[2],supersession_reason:process.argv[3]}]}))' "$1" "$2" "$3"; }
ER1="$(EA "$EF1" 'It supports the impact basis only, as a vendor claim about Scotts Miracle-Gro.' 'The row text moved on, and the erratum follows one step down its chain.')"
# B8 — the route reading only the row's own link.
edit "$CORR" "evidence_id IN (SELECT lvrf_evidence_chain(e.id)) AND withdrawn_at IS NULL" "evidence_id = e.id AND withdrawn_at IS NULL"
stop_server; start_server
expect POST "/api/value-runs/$(q "SELECT value_run_id FROM run_errata WHERE id = '$EF1'")/errata" "$(J evidence_id "$RT" what_was_wrong 'Run 1 sealed the vendor publication as supporting the baseline.' what_is_right 'It supports the impact basis only, as a vendor claim.' reason 'Verification: the chain break, in the route.' supersedes_erratum_id "$EF1" supersession_reason 'Verification: the chain break, why.')" 422 "B8: the route reading only the row's own link → no erratum once the link moved" "no current link"
restore "$CORR"; stop_server; start_server
expect POST "$DR" "$ER1" 200 "the dry run: an erratum whose link has moved one step"
[ "$(rj b.can_submit)" = "true" ] && ok "  ...nothing stops it" || bad "  ...$(rj "JSON.stringify(b.errata)")"
H1="$(rj b.plan_hash)"
expect POST "$SB" "$(node -e 'const b=JSON.parse(process.argv[1]);console.log(JSON.stringify({...b,expected_count:1,plan_hash:process.argv[2],reason:"Verification: an erratum, a step down the chain."}))' "$ER1" "$H1")" 201 "the erratum superseded, its link one step on"
EN1="$(q "SELECT id FROM run_errata WHERE supersedes_id = '$EF1'")"
[ "$(q "SELECT n.evidence_id = o.evidence_id AND n.corrected_to_supports = o.corrected_to_supports AND n.recomputed_score IS NOT DISTINCT FROM o.recomputed_score AND n.sealed_score = o.sealed_score FROM run_errata n JOIN run_errata o ON o.id = n.supersedes_id WHERE n.id = '$EN1'")" = "t" ] && ok "  ...it still names the old row, and the recompute from that row's sealed item is unchanged" || bad "  ...recompute"
expect POST "/api/evidence/$NT/supersede" "$(node -e 'const f=JSON.parse(process.argv[1]);console.log(JSON.stringify({about:"account",kind:"vendor_publication",provenance:"Fixture second step of the chain (not a source)",summary:"The second step of the chain (fixture).",reason:"Verification: one step further down the chain.",...f}))' "$(FORMQ)")" 201 "a second supersession of that row: its link moves again"; NT2="$(rj b.evidence_id)"
[ "$(q "SELECT count(*) FROM value_outcome_evidence WHERE evidence_id = '$NT2' AND withdrawn_at IS NULL AND supports = 'impact_basis'")" = "1" ] && ok "  ...the frozen outcome's link follows, a second step" || bad "  ...second move"
[ "$(q "SELECT confidence FROM evidence WHERE id = '$NT2'")" = "$(q "SELECT confidence FROM evidence WHERE id = '$NT'")" ] && ok "  ...and the row's confidence carries on the single route" || bad "  ...confidence"
ER2="$(EA "$EF2" 'It supports the impact basis only, as a vendor claim, two steps down.' 'The erratum follows its link two steps down the chain.')"
expect POST "$DR" "$ER2" 200 "the dry run: an erratum whose link has moved two steps"
H2="$(rj b.plan_hash)"; [ "$(rj b.can_submit)" = "true" ] && ok "  ...nothing stops it (the chain, not one step)" || bad "  ...$(rj "JSON.stringify(b.errata)")"
# B9 — the guard reading only one step.
fnbreak lvrf_evidence_chain "    SELECT e.superseded_by_id FROM evidence e JOIN chain c ON e.id = c.id WHERE e.superseded_by_id IS NOT NULL" "    SELECT e.superseded_by_id FROM evidence e JOIN chain c ON e.id = c.id WHERE e.superseded_by_id IS NOT NULL AND c.id = p_evidence"
expect POST "$DR" "$ER2" 200 "B9: the chain cut to one step"
printf '%s' "$(rj "b.errata[0].blockers.join()")" | grep -q "no longer current" && ok "  ...caught: two steps on, the erratum is stopped, so the walk is what carries it" || bad "  ...B9: $(rj "JSON.stringify(b.errata)")"
reharden
expect POST "$DR" "$ER2" 200 "  ...restored"; H2="$(rj b.plan_hash)"
expect POST "$SB" "$(node -e 'const b=JSON.parse(process.argv[1]);console.log(JSON.stringify({...b,expected_count:1,plan_hash:process.argv[2],reason:"Verification: an erratum, two steps down the chain."}))' "$ER2" "$H2")" 201 "the erratum superseded, its link two steps on"
sqlrefused "an erratum on an evidence row that never had a correcting link" "INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, evidence_id, corrected_to_supports, what_was_wrong, what_is_right, reason, sealed_score, sealed_band, recompute_method, recorded_by_person_id) SELECT tenant_id, value_run_id, value_outcome_id, '$NT2', corrected_to_supports, what_was_wrong, what_is_right, reason, sealed_score, sealed_band, recompute_method, '$S' FROM run_errata WHERE id = '$EF1'" "an erratum is about a corrected link"
# The freeze holds but for that one move.
FO="$(q "SELECT value_outcome_id FROM value_outcome_evidence WHERE evidence_id = '$RF' LIMIT 1")"
sqlrefused "a new link on the frozen outcome, from a row with no supersession" "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$FO', '$R1', 'impact_basis')" "frozen"
sqlrefused "a successor taking a link withdrawn long ago: it does not come back" "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$FO', '$NF', 'impact_basis')" "frozen"
fnbreak lvrf_outcome_evidence_link_guard "AND l.supports = NEW.supports AND l.withdrawn_at = now()) THEN" "AND l.supports = NEW.supports) THEN"
sqlaccepted "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$FO', '$NF', 'impact_basis')" > "$W/b6.out" 2>&1 || true
grep -q ACCEPTED "$W/b6.out" && ok "B6: without \"withdrawn now\", a link withdrawn long ago comes back on the frozen outcome: that test is what stops it" || bad "B6: $(cat "$W/b6.out" | tail -1)"
reharden
RC="$RC" NC="$NC" cw corrected

step "9. The single route: the same carrying; the breaks"
SR() { node -e 'const f=JSON.parse(process.argv[1]);console.log(JSON.stringify({about:"account",kind:process.argv[2],provenance:process.argv[3],summary:process.argv[4],reason:"Verification: a single supersession.",...f}))' "$(FORMQ)" "$(q "SELECT kind FROM evidence WHERE id = '$1'")" "$(q "SELECT provenance FROM evidence WHERE id = '$1'")" "$(q "SELECT summary FROM evidence WHERE id = '$1'")"; }
MK="$(q "SELECT e.id FROM evidence e JOIN system_exercise_marks m ON m.subject_id = e.id WHERE e.id::text LIKE '1c57c4e7%'")"
# B3 — the mark not carried.
edit "$AEV" "  if (mark) {
    const { rows: [m] }" "  if (mark && (false as boolean)) {
    const { rows: [m] }"
stop_server; start_server
expect POST "/api/evidence/$MK/supersede" "$(SR "$MK")" 422 "B3: the mark not carried → evidence_final refuses" "the mark carries"
[ "$(q "SELECT superseded_by_id IS NULL FROM evidence WHERE id = '$MK'")" = "t" ] && ok "  ...nothing written" || bad "  ...B3 wrote"
restore "$AEV"; stop_server; start_server
expect POST "/api/evidence/$MK/supersede" "$(SR "$MK")" 201 "  ...restored: the single route carries the mark"; NM="$(rj b.evidence_id)"
[ "$(q "SELECT count(*) FROM system_exercise_marks WHERE subject_id = '$NM'")" = "1" ] && ok "  ...on the new row" || bad "  ...no mark"
# B4 — a live link left behind.
edit "$AEV" "  for (const l of links.filter((x) => x.live)) await move(l);" "  for (const l of links.filter((x) => x.live && (false as boolean))) await move(l);"
stop_server; start_server
expect POST "/api/evidence/$N2/supersede" "$(SR "$N2")" 422 "B4: a live link left behind → evidence_final refuses" "the link moves"
[ "$(q "SELECT count(*) FROM value_outcome_evidence WHERE evidence_id = '$N2' AND withdrawn_at IS NULL")" = "1" ] && ok "  ...nothing written" || bad "  ...B4 wrote"
restore "$AEV"; stop_server; start_server
expect POST "/api/evidence/$N2/supersede" "$(SR "$N2")" 201 "  ...restored: the single route moves it too"; N22="$(rj b.evidence_id)"
OC9="$(q "SELECT value_outcome_id FROM value_outcome_evidence WHERE evidence_id = '$N9' AND withdrawn_at IS NULL")"
ENG9="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$OC9'")"
expect POST "/api/engagements/$ENG9/produce-run" "$(J banner_title 'L52 V3' note 'Verification: sealed after the move.' source_fixture l52_fixture)" 201 "a run after the move"
RUNN="$(rj b.value_run_id)"
[ "$(q "SELECT count(*) FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$RUNN' AND x->>'evidence_id' = '$N9'")|$(q "SELECT count(*) FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$RUNN' AND x->>'evidence_id' = '$R9'")" = "1|0" ] && ok "  ...the next run seals the new row, not the old" || bad "  ...seal"
# B5 — the plan check removed.
fixture "L52 row for the plan break"; F4="$FX"
PB="{\"items\":[$(IT "$F4" "$PARTY" noreading)]}"
edit "$AEV" "if (plan_hash !== b.plan_hash) throw" "if ((false as boolean) && plan_hash !== b.plan_hash) throw"
stop_server; start_server
expect POST "$SB" "$(node -e 'const b=JSON.parse(process.argv[1]);console.log(JSON.stringify({...b,expected_count:1,plan_hash:"0000",reason:"Verification: the plan break."}))' "$PB")" 201 "B5: the plan check removed → a stale plan is accepted: that check is what refuses it"
restore "$AEV"; stop_server; start_server

step "10. Add an industry (B1; Brad, 1 Nov 2026)"
IB() { J name "${1:-Utilities}" slug "${2:-utilities}" reason "${3:-Verification: a pack is to be researched for it.}"; }
I0="$(q "SELECT count(*) FROM industries")"
expect POST /api/industries "$(IB)" 403 "X adds an industry" "steward" "$X"
expect POST /api/industries "$(IB Utilities Utilities)" 422 "a slug that is not one" "lower-case letters"
expect POST /api/industries "$(IB Utilities utilities short)" 422 "a short reason" "at least 12"
expect POST /api/industries "$(IB U utilities)" 422 "no real name" "Name the industry"
expect POST /api/industries "$(node -e 'console.log(JSON.stringify({name:"Utilities",slug:"utilities",reason:"Verification: the extra field.",lifecycle:"active"}))')" 400 "a field it does not take"
SEEDED="$(q "SELECT slug FROM industries LIMIT 1")"; SEEDN="$(q "SELECT name FROM industries WHERE slug = '$SEEDED'")"
expect POST /api/industries "$(IB 'Another name' "$SEEDED")" 409 "a slug the tenant has" "already has"
expect POST /api/industries "$(IB "$SEEDN" another-slug)" 409 "a name the tenant has" "already has"
[ "$(q "SELECT count(*) FROM industries")" = "$I0" ] && ok "  ...none of them wrote" || bad "  ...a refused add wrote"
sqlrefused "an industry by SQL, not the steward" "INSERT INTO industries (tenant_id, name, slug) VALUES ('$TEN', 'By SQL', 'by-sql')" "only the tenant's steward" "$X"
AUTHSLUG="break-$TS"
# B7 — the route's steward check removed: the database refuses.
edit "$IND" "router.post('/', requireSteward(pool), async (req, res) => {" "router.post('/', async (req, res) => {"
stop_server; start_server
expect POST /api/industries "$(IB 'Break industry' "$AUTHSLUG")" 422 "B7: the route's check removed → the database refuses a non-steward" "only the tenant's steward" "$X"
[ "$(q "SELECT count(*) FROM industries")" = "$I0" ] && ok "  ...nothing written" || bad "  ...B7 wrote"
restore "$IND"; stop_server; start_server
INDWALK=1 cw addindustry
UT="$(q "SELECT id FROM industries WHERE slug = 'utilities'")"
[ -n "$UT" ] && ok "Utilities added through the page" || bad "no Utilities"
[ "$(q "SELECT count(*) || '|' || min(reason) FROM governance_acts WHERE act = 'add_industry' AND subject_id = '$UT'")" = "1|Verification: a pack is to be researched for it." ] && ok "  ...with its own act and reason" || bad "  ...act"
expect GET "/api/industries/utilities/pack" "" 200 "its pack page reads, empty"
expect POST "/api/industries/$UT/research-prompts" '{}' 201 "  ...and a pack research prompt can be generated: the Utilities research is unblocked"

step "11. What held"
DRIFT3="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT3" | grep -q "schema drift: none (journal 47 migrations" && ok "drift: none" || bad "drift: $DRIFT3"
HASH1="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
RUNS1="$(q "SELECT count(*) FROM value_runs")"
printf '%s' "$HASH1" | grep -qE "^$RUNS1 runs: recompute matches $RUNS1, differs 0; embedded payloadHash matches $RUNS1, differs 0" && ok "check_run_hashes: $HASH1" || bad "hashes: $HASH1"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE r.source_fixture IS DISTINCT FROM 'l52_fixture'")" = "$RUNS0" ] && ok "every older run byte-identical after all of this" || bad "an older run changed"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
