#!/usr/bin/env bash
#
# §30 (Brad's rulings, 24 Nov 2026: D1-D5, three of D3's lines changed) — plain words in server and database strings
# that can reach the screen: the plan-code pattern (with "D-M" and "Band A-E") and the word "tenant", and the
# "LVRF: <table>:" prefix off the screen, not the record.
#
#   ./scripts/verify_plain_server.sh [out_dir]
#
#   1. check_plain_words: 0 hits; B6 "tenant" back in a database RAISE, B7 "tenant" in a route's string, B8 "(D-M21)"
#      back in a client string, B9 a seed's string moved into a route, each caught; the seed's own string not read.
#   2. D3's approved sentences are in hardening.sql and the old ones are not; screenMessage's cases.
#   3. On a clone of the prod copy, migrated and hardened: 227 triggers; drift none; runs byte-identical; each changed
#      function's md5(prosrc) against 467f888's hardening.sql.
#   4. Through the routes: a refused measurement and a refused AI-sourced actual answer without the prefix; refusals
#      keeps the raw text; the gap register's line on that refusal prints without it. B10: the strip removed, caught.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
. scripts/lib/hypothesis.sh
. scripts/lib/customer_side.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyplainsrv
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3421; VITE_PORT=5421; CDP_PORT=9531
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_psrv.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
HARD=db/hardening.sql; IADD=server/routes/industryAdd.ts; CASEI=client/src/components/valueCase/CaseInputs.tsx; SCREEN=server/lib/screenMessage.ts
EDITED=("$HARD" "$IADD" "$CASEI" "$SCREEN")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
by_port() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }
stop_port() { local p; p="$(by_port "$1")"; [ -n "$p" ] && kill $p 2>/dev/null || true; for _ in $(seq 1 20); do [ -z "$(by_port "$1")" ] && return 0; sleep 0.25; done; }
cleanup() {
  stop_port "$PORT"; stop_port "$VITE_PORT"
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  sleep 1; [ -n "${KEEP_DB:-}" ] || dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1"; }
J() { node -e 'const a=process.argv.slice(1);const o={};for(let i=0;i<a.length;i+=2){let v=a[i+1];try{if(/^[\[{]|^-?\d+(\.\d+)?$|^(true|false|null)$/.test(v))v=JSON.parse(v)}catch{}o[a[i]]=v}console.log(JSON.stringify(o))' "$@"; }
req() {  # METHOD PATH [BODY] — status in $CODE, body in $W/r.json, as the steward
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: $S" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d "$3" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?b.message:JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING]
  req "$1" "$2" "$3"; local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 300)"; fi
}
# As lvrf_app, the actor set, in a transaction that is always rolled back.
sqlrefused() {  # LABEL SQL NEEDLE
  local out; out="$(printf "BEGIN;\nSET LOCAL ROLE lvrf_app;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "$S" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused by the database: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
sqlaccepted() {  # SQL
  printf "BEGIN;\nSET LOCAL ROLE lvrf_app;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nROLLBACK;\n" "$S" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1 || true
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
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
reharden() {
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "229" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 229 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}
edit() { python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; sleep 3; }
start_server() {
  LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
  for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done; return 1
}
restart_server() { stop_port "$PORT"; start_server; }
walk() {  # SECTIONS TAG LOG [ENV=VALUE...]
  local s="$1" tag="$2" log="$3"; shift 3
  env VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT_DIR="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" TAG="$tag" "$@" node scripts/lib/customer_side_walk.mjs "$s" > "$log" 2>&1 \
    || echo "FAIL  $tag: the walk crashed: $(tail -3 "$log" | tr '\n' ' ')" >> "$log"
}
tally() {
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$1"
  grep -q '^DONE ' "$1" || bad "the walk did not finish: $(tail -3 "$1" | tr '\n' ' ')"
}
cover() {  # LOG PHRASE...
  local log="$1"; shift
  for want in "$@"; do grep -qF -- "$want" "$log" && ok "coverage: ran — $want" || bad "coverage: no line for — $want"; done
}
LOG="$W/main.log"; exec > >(tee "$LOG") 2>&1
pw() { node scripts/check_plain_words.mjs > "$W/pw.log" 2>&1; }

step "1. check_plain_words and its breaks"
pw && ok "check_plain_words: $(tail -1 "$W/pw.log")" || bad "check_plain_words: $(grep -m5 HIT "$W/pw.log")"
pbreak() {  # FILE OLD NEW LABEL WANT_PATH
  edit "$1" "$2" "$3"
  pw && bad "$4: not caught" || { grep -q "^HIT  $5" "$W/pw.log" && ok "$4 → caught: $(grep -m1 "^HIT  $5" "$W/pw.log" | cut -c1-120)" || bad "$4: caught elsewhere: $(grep -m2 HIT "$W/pw.log")"; }
  restore "$1"
}
pbreak "$HARD" "'LVRF: industries: only the steward adds an industry.'" "'LVRF: industries: only the tenant''s steward adds an industry.'" 'B6: "tenant" back in a database RAISE' "db/hardening.sql"
pbreak "$IADD" '`Your company already has' '`This tenant already has' 'B7: "tenant" in a route'"'"'s string' "server/routes/industryAdd.ts"
pbreak "$CASEI" '<Card title="Share for review">' '<Card title="Share for review (D-M21)">' 'B8: "(D-M21)" back in a client string' "client/src/components/valueCase/CaseInputs.tsx"
pbreak "$IADD" '`Your company already has' '`Expected exactly one tenant named Skillsoft; your company already has' "B9: a seed's string moved into a route" "server/routes/industryAdd.ts"
grep -q "Expected exactly one tenant named 'Skillsoft'" server/seed/seedOffering*.ts && ! grep -q "server/seed" "$W/pw.log" && ok "  ...the seed's own string is not read (the seeds run from the command line only)" || bad "  ...the seed"
pw && ok "  ...clean again after the breaks" || bad "  ...not clean after the breaks"

step "2. D3's sentences, and the screen's"
for want in "only the steward adds an industry." "the account % is not one of your company''s accounts." "run % is not one of your company''s runs." "outcome % is not one of your company''s outcomes." "the engagement % is not one of your company''s engagements." \
  "the act''s subject is not in your company''s record." "is not a current, real member of your company''s staff" "the linker % is not a current member of your company''s staff." "is not in your company''s record.', NEW.result_table" \
  "This lever''s pack entry (%) is not in your company''s record." "This link''s lever or offering is not in your company''s record." "outcome % is not of this account." \
  "(your company''s staff, a vendor-side role, or sign-in credentials)" "only your company''s own people are linked" "a value of the same key in your company''s record." "a policy of the same persona in your company''s record." \
  "your company''s current one." "only the steward shares a run for review.'"; do
  grep -qF -- "$want" "$HARD" && ok "hardening says: $want" || bad "hardening lacks: $want"
done
[ "$(grep -E "RAISE|^ +'LVRF" "$HARD" | grep -c "tenant")" = "4" ] && [ "$(grep -E "RAISE|^ +'LVRF" "$HARD" | grep "tenant" | grep -vc "access_grants")" = "0" ] \
  && ok "no message says \"tenant\" but access_grants' 4 (operator-only, out)" || bad "messages with tenant: $(grep -E "RAISE|^ +'LVRF" "$HARD" | grep "tenant" | grep -v access_grants | head -3)"
SM() { npx tsx -e "import('./server/lib/screenMessage.ts').then(m=>console.log(m.screenMessage(process.argv[1])))" "$1" 2>&1 | tail -1; }
for c in "LVRF: industries: only the steward adds an industry.|Only the steward adds an industry." \
         "LVRF: evidence 0dbbd991-f84c-4b0c-bf8c-f67a2ba4a5d8: only the steward withdraws a verification.|Only the steward withdraws a verification." \
         "LVRF: AI-sourced evidence may not support a measured actual.|AI-sourced evidence may not support a measured actual." \
         "LVRF: value_outcomes: 0dbbd991-f84c-4b0c-bf8c-f67a2ba4a5d8 wrote a hypothesis|0dbbd991-f84c-4b0c-bf8c-f67a2ba4a5d8 wrote a hypothesis" \
         "Choose the attribution method.|Choose the attribution method."; do
  [ "$(SM "${c%%|*}")" = "${c#*|}" ] && ok "on screen: \"${c#*|}\"" || bad "screenMessage(${c%%|*}) = $(SM "${c%%|*}")"
done

step "3. Clone the prod copy, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (no migration in §30)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "229" ] && ok "229 triggers (§30 adds none; §32 section 38: +2)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 54 migrations, newest 0053_s32_person_email" && ok "drift: none" || bad "drift: $DRIFT"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every run byte-identical after hardening" || bad "a run changed"
git show 467f888:db/hardening.sql > "$W/hard_old.sql"
python3 - "$W/hard_old.sql" db/hardening.sql > "$W/changed.txt" <<'PY'
import re, sys, hashlib
def fns(p):
    s = open(p).read(); out = {}
    for m in re.finditer(r"CREATE OR REPLACE FUNCTION (\w+)\(.*?AS \$\$(.*?)\$\$;", s, re.S): out[m.group(1)] = hashlib.md5(m.group(2).encode()).hexdigest()
    return out
a, b = fns(sys.argv[1]), fns(sys.argv[2])
for k in sorted(b):
    if a.get(k) != b[k]: print(k, a.get(k, '-'), b[k])
PY
NCH="$(grep -c . "$W/changed.txt")"
MISM=0; while read -r fn old new; do [ "$(q "SELECT md5(prosrc) FROM pg_proc WHERE proname = '$fn'")" = "$new" ] || MISM=$((MISM + 1)); done < "$W/changed.txt"
[ "$NCH" -gt 0 ] && [ "$MISM" = "0" ] && ok "$NCH functions change, each md5(prosrc) on the clone as computed (listed in $OUT/changed_functions.txt)" || bad "changed functions: $NCH, mismatched $MISM"
cp "$W/changed.txt" "$OUT/changed_functions.txt"
sed -n '1,60p' "$W/changed.txt" | sed 's/^/    /'

step "4. Through the routes: the prefix off the screen, not the record"
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"
start_server && ok "API up on $PORT" || { bad "server: $(tail -5 "$W/server.log")"; exit 1; }
TS="$(date +%s)"
expect POST /api/account-inputs "$(J institution "$(J name "Wren Paper (§30 fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for §30.')" persons "[$(J full_name 'K30 owner (invented)' email "owner.$TS@k30.example" title Owner)]")" 201 "a fixture account"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K30 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
req POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name 'K30 engagement' engagement_owner_person_id "$OWNER" capability_name 'K30 capability' metric "$(J name 'K30 TRIR' unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)"
[ "$CODE" = "201" ] && O="$(rj b.value_outcome_id)" && ok "  ...an outcome ${O:0:8}" || { bad "outcome: $CODE $(said)"; exit 1; }
req POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name 'K30 engagement two' engagement_owner_person_id "$OWNER" capability_name 'K30 capability' metric "$(J name 'K30 LTIR' unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 0.9 baseline_measured_at 2025-09-30T00:00:00Z)"
[ "$CODE" = "201" ] && O2="$(rj b.value_outcome_id)" && ok "  ...a second outcome ${O2:0:8}, with no admissible actual (its actual's gap stays open)" || { bad "outcome two: $CODE $(said)"; exit 1; }
# An admissible actual (a system export, opened), so the measurement reaches the database's commit rule.
expect POST "/api/value-outcomes/$O/evidence" "$(J kind system_export provenance 'Fixture source for: K30 TRIR extract (not a source)' summary 'K30 TRIR extract (fixture)' supports actual confidence medium source_verified true ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.')" 201 "  ...an admissible actual, linked"
screen_checks() {  # TAG -> passes when both responses and the gap line are free of the prefix
  local tag="$1"
  req POST "/api/value-outcomes/$O/measure" "$(J actual_value 1.1 actual_measured_at 2026-11-01T12:00:00Z)"; M1="$(said)"
  [ "$CODE" = "422" ] && [ "${M1#LVRF:}" = "$M1" ] && printf '%s' "$M1" | grep -q "^No attribution method was stated at commit" && ok "$tag: a refused measurement reads \"${M1:0:70}…\" (422, no prefix)" || bad "$tag: measurement: $CODE $M1"
  LVRF_RAW_CURL=1 req POST "/api/value-outcomes/$O2/evidence" "$(J about account kind system_export provenance 'Fixture source for: K30 AI extract (not a source)' summary 'K30 TRIR by an AI tool (fixture)' supports actual confidence medium ai_sourced true research_query 'K30 TRIR' query_as_executed 'K30 TRIR FY26' research_tool 'Verification tool' simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.')"; M2="$(said)"
  [ "$CODE" = "422" ] && [ "${M2#LVRF:}" = "$M2" ] && printf '%s' "$M2" | grep -q "^AI-sourced evidence may not support a measured actual" && ok "$tag: a refused AI-sourced actual reads \"${M2:0:60}…\" (422, no prefix)" || bad "$tag: AI actual: $CODE $M2"
  req GET "/api/value-outcomes/$O2/gaps"; G="$(rj "JSON.stringify((b.gaps ?? b).filter?.(g => g.refusal_message).map(g => g.refusal_message) ?? [])")"
  printf '%s' "$G" | grep -q "AI-sourced evidence may not support a measured actual" && ! printf '%s' "$G" | grep -q '"LVRF:' && ok "$tag: the gap register's line on that refusal prints without the prefix" || bad "$tag: gaps: $(head -c 300 "$W/r.json")"
}
screen_checks D4
[ "$(q "SELECT count(*) FROM refusals WHERE value_outcome_id = '$O2' AND message LIKE 'LVRF: AI-sourced evidence may not support a measured actual.%'")" -ge 1 ] && ok "  ...refusals keeps the raw text, prefix and all (D4: the record unchanged)" || bad "  ...refusals: $(q "SELECT message FROM refusals WHERE value_outcome_id = '$O' ORDER BY refused_at DESC LIMIT 1")"
# B10 — the strip removed: the response check catches the prefix.
edit "$SCREEN" "  if (!PREFIX.test(text)) return text;" "  return text;"
restart_server
req POST "/api/value-outcomes/$O/measure" "$(J actual_value 1.1 actual_measured_at 2026-11-01T12:00:00Z)"
[ "${CODE}" = "422" ] && [ "$(said | cut -c1-5)" = "LVRF:" ] && ok "B10: the strip removed → caught: the response reads \"$(said | cut -c1-60)…\"" || bad "B10: not caught: $(said)"
restore "$SCREEN"; restart_server
screen_checks "  ...with it back"
step "5. Each D3 message no other script raises, raised here (as lvrf_app, rolled back), raw and as the screen reads it"
# Fixture rows of another company, by the superuser with triggers off (the clone only, rule 9): its tenant, an account, a
# lens policy and a policy value, so the database can be asked about rows that are not your company's.
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
TX="$(q "INSERT INTO tenants (name) VALUES ('Other company (§30 fixture, $TS)') RETURNING id" | head -1)"
IX="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TX', 'Other account (§30 fixture, $TS)') RETURNING id" | head -1)"
LX="$(printf "BEGIN;\nSET LOCAL session_replication_role = replica;\nINSERT INTO lens_policies SELECT (jsonb_populate_record(NULL::lens_policies, to_jsonb(l) || jsonb_build_object('id', gen_random_uuid(), 'tenant_id', '%s', 'supersedes_id', NULL))).* FROM lens_policies l LIMIT 1 RETURNING id;\nCOMMIT;\n" "$TX" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" | head -1)"
PX="$(printf "BEGIN;\nSET LOCAL session_replication_role = replica;\nINSERT INTO policy_values SELECT (jsonb_populate_record(NULL::policy_values, to_jsonb(v) || jsonb_build_object('id', gen_random_uuid(), 'tenant_id', '%s', 'supersedes_id', NULL))).* FROM policy_values v WHERE key = 'cost_of_delay_months' LIMIT 1 RETURNING id;\nCOMMIT;\n" "$TX" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" | head -1)"
[ -n "$TX" ] && [ -n "$IX" ] && [ -n "$LX" ] && [ -n "$PX" ] && ok "another company's fixture rows: its tenant, an account, a lens policy, a policy value" || bad "fixtures: '$TX' '$IX' '$LX' '$PX'"
RUN0="$(q "SELECT id FROM value_runs WHERE tenant_id = '$TEN' LIMIT 1")"; ENG0="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O'")"
LEV="$(q "SELECT id FROM value_levers WHERE tenant_id = '$TEN' AND deleted_at IS NULL LIMIT 1")"; OFF="$(q "SELECT id FROM offerings WHERE tenant_id = '$TEN' LIMIT 1")"
BM="$(q "SELECT business_metric_id FROM value_outcomes WHERE id = '$O'")"; EV0="$(q "SELECT evidence_id FROM value_outcome_evidence WHERE value_outcome_id = '$O' LIMIT 1")"
raised() {  # LABEL SQL NEEDLE(raw, after the prefix) [ACTOR] -> the raw message and its on-screen form both checked
  local out; out="$(printf "BEGIN;\nSET LOCAL ROLE lvrf_app;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "${4:-$S}" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  local raw; raw="$(printf '%s' "$out" | grep -m1 -o 'ERROR:  .*' | sed 's/^ERROR:  //')"
  if printf '%s' "$raw" | grep -qF -- "$3"; then
    local scr; scr="$(SM "$raw")"
    if [ "${scr#LVRF:}" = "$scr" ] && ! printf '%s' "$scr" | grep -qiE '\btenants?\b'; then ok "$1: \"$scr\""; else bad "$1: on screen \"$scr\""; fi
  else bad "$1: raised \"$raw\", wanted \"$3\""; fi
}
raised "the account (executive_summaries)" "INSERT INTO executive_summaries (tenant_id, institution_id, lens, body, author_person_id, drafted_with_ai) VALUES ('$TEN', '$IX', 'cfo', 'A summary for another company''s account, long enough.', '$S', false)" "the account $IX is not one of your company's accounts."
raised "the account (customer_role_grants)" "INSERT INTO customer_role_grants (tenant_id, institution_id, person_id, role, source_evidence_id, reason, granted_by_person_id) VALUES ('$TEN', '$IX', '$OWNER', 'metric_owner', '$EV0', 'Verification: another company''s account.', '$S')" "the account is not one of your company's accounts."
raised "the account (monetization_rates)" "INSERT INTO monetization_rates (tenant_id, institution_id, business_metric_id, rate, currency, per_unit, rate_kind, how_read, evidence_id, recorded_by_person_id) VALUES ('$TEN', '$IX', '$BM', 1, 'USD', 'unit', 'performance', 'Verification: read.', '$EV0', '$S')" "is not one of your company's accounts."
raised "the run (run_errata)" "INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, what_was_wrong, what_is_right, reason, sealed_score, sealed_band, recompute_method, recorded_by_person_id) VALUES ('$TX', '$RUN0', '$O', 'Verification: wrong.', 'Verification: right.', 'Verification: another company.', 0, 'low', 'Verification: method.', '$S')" "is not one of your company's runs."
raised "the outcome (outcome_withdrawals)" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TX', '$O', 'measurement', '{\"actual_value\":\"1.1\"}', 'Verification: another company.', '$S')" "is not one of your company's outcomes."
raised "the engagement (roadmap_milestones)" "INSERT INTO roadmap_milestones (tenant_id, engagement_id, title, due_on, owner_stated, planned_by_person_id) VALUES ('$TX', '$ENG0', 'Verification milestone', '2027-01-01', 'Verification owner', '$S')" "is not one of your company's engagements."
raised "a subject not in the record (system_exercise_marks)" "INSERT INTO system_exercise_marks (tenant_id, subject_table, subject_id, reason, marked_by_person_id) VALUES ('$TEN', 'value_runs', gen_random_uuid(), 'Verification: no such run.', '$S')" "is not in your company's record."
raised "a link's lever or offering (lever_offerings)" "INSERT INTO lever_offerings (tenant_id, value_lever_id, offering_id, basis, linked_by_person_id) VALUES ('$TX', '$LEV', '$OFF', 'Verification: another company.', '$S')" "This link's lever or offering is not in your company's record."
raised "the same key (policy_values)" "INSERT INTO policy_values (tenant_id, key, value, reason, set_by_person_id, supersedes_id) VALUES ('$TEN', 'cost_of_delay_months', 9, 'Verification: supersedes another company''s value.', '$S', '$PX')" "a value of the same key in your company's record."
raised "the same persona (lens_policies)" "INSERT INTO lens_policies (tenant_id, persona, min_confidence_score, admitted_bases, suppresses, refusal_text, reason, ratified_by_person_id, supersedes_id) SELECT '$TEN', persona, min_confidence_score, admitted_bases, suppresses, refusal_text, 'Verification: supersedes another company''s policy.', '$S', '$LX' FROM lens_policies WHERE id = '$LX'" "a policy of the same persona in your company's record."
# "your company's current one": a CFO-lens print request on S3's Northwind fixture (a locked run the CFO lens shows),
# naming another company's CFO lens policy, then a superseded one of your company's; the current one is accepted.
. scripts/lib/s3_cfo_fixture.sh
if cfo_fixture; then
  ok "S3's Northwind fixture: run ${FX_RUN:0:8} locked, a case the CFO lens shows"
  CUR="$(q "SELECT l.id FROM lens_policies l WHERE l.tenant_id = '$TEN' AND l.persona = 'cfo' AND NOT EXISTS (SELECT 1 FROM lens_policies s WHERE s.supersedes_id = l.id)")"
  PRQ() { printf "INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, disclosure, content_hash, payload, rendered_by_person_id, value_run_id, kind, lens, lens_policy_id) SELECT '%s', r.engagement_id, (r.payload->>'valueOutcomeId')::uuid, 'internal', r.payload_hash, '{}'::jsonb, '%s', r.id, 'print_request', 'cfo', '%s' FROM value_runs r WHERE r.id = '%s'" "$TEN" "$S" "$1" "$FX_RUN"; }
  [ "$(sqlaccepted "$(PRQ "$CUR")")" = "ACCEPTED" ] && ok "  ...a print request naming your company's current CFO lens policy is accepted (the control)" || bad "  ...the control: $(sqlaccepted "$(PRQ "$CUR")")"
  raised "another company's CFO lens policy (record_documents)" "$(PRQ "$LX")" "a CFO-lens print request names the CFO lens policy it applied, your company's current one."
  raised "a superseded CFO lens policy (record_documents)" "INSERT INTO lens_policies (tenant_id, persona, min_confidence_score, admitted_bases, suppresses, refusal_text, reason, ratified_by_person_id, supersedes_id) SELECT tenant_id, persona, min_confidence_score, admitted_bases, suppresses, refusal_text, 'Verification: a newer CFO lens, so the current one is superseded.', '$S', id FROM lens_policies WHERE id = '$CUR'; $(PRQ "$CUR")" "a CFO-lens print request names the CFO lens policy it applied, your company's current one."
else bad "S3's Northwind fixture could not be built"; fi
# The steward's acts no other script raises at the database: each by X, current staff of your company who is not the steward.
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Staff X (§30 fixture, invented)', 'x.$TS@k30.example') RETURNING id" | head -1)"
GRANT="$(q "SELECT id FROM customer_role_grants WHERE tenant_id = '$TEN' AND revoked_at IS NULL LIMIT 1")"
MARK="$(q "SELECT id FROM reference_example_markers WHERE tenant_id = '$TEN' AND retired_by_person_id IS NULL AND deleted_at IS NULL AND superseded_by_id IS NULL LIMIT 1")"
[ -n "$X" ] && [ -n "$GRANT" ] && [ -n "$MARK" ] && ok "X, and the rows X acts on: a role grant, a marker" || bad "fixtures: X '$X' grant '$GRANT' marker '$MARK'"
raised "naming a role, by X (customer_role_grants)" "INSERT INTO customer_role_grants (tenant_id, institution_id, person_id, role, source_evidence_id, reason, granted_by_person_id) SELECT tenant_id, institution_id, person_id, role, source_evidence_id, 'Verification: by X.', '$X' FROM customer_role_grants WHERE id = '$GRANT'" "only the steward names a customer-side role." "$X"
raised "revoking a role, by X (customer_role_grants)" "UPDATE customer_role_grants SET revoked_at = now(), revoked_by_person_id = '$X', revocation_reason = 'Verification: by X.' WHERE id = '$GRANT'" "only the steward revokes a role." "$X"
raised "unmarking a reference example, by X (reference_example_markers)" "UPDATE reference_example_markers SET retired_by_person_id = '$X', retirement_reason = 'Verification: by X.' WHERE id = '$MARK'" "only the steward may unmark a reference example." "$X"
# Two shapes no longer exist (the copy holds none, and their CHECKs are validated): a row from before "about" was
# recorded, and a row verified without an opening. Each in one transaction, rolled back whole: the CHECK dropped, such a
# row inserted (a copy of the fixture's actual), then X's act on it.
gone_shape() {  # LABEL CONSTRAINT ROW_JSON UPDATE_SET NEEDLE
  local id=aaaaaaaa-0000-4000-8000-000000000030 out raw
  out="$(printf "BEGIN;\nALTER TABLE evidence DROP CONSTRAINT %s;\nSET LOCAL session_replication_role = replica;\nINSERT INTO evidence SELECT (jsonb_populate_record(NULL::evidence, to_jsonb(e) || jsonb_build_object('id', '%s') || '%s'::jsonb)).* FROM evidence e WHERE e.id = '%s';\nSET LOCAL session_replication_role = origin;\nSET LOCAL ROLE lvrf_app;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\nUPDATE evidence SET %s WHERE id = '%s';\nROLLBACK;\n" "$2" "$id" "$3" "$EV0" "$X" "$4" "$id" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  raw="$(printf '%s' "$out" | grep -m1 -o 'ERROR:  .*' | sed 's/^ERROR:  //')"
  printf '%s' "$raw" | grep -qF -- "$5" && ok "$1: \"$(SM "$raw")\"" || bad "$1: raised \"$raw\""
  [ "$(q "SELECT count(*) FROM pg_constraint WHERE conname = '$2' AND convalidated")" = "1" ] && ok "  ...$2 is back, validated (the drop rolled back with the rest)" || bad "  ...$2 is not back"
}
gone_shape "what a row from before is about, by X (evidence)" evidence_about_stated '{"about_institution_id": null, "about_other_party": null}' "about_institution_id = institution_id" "only the steward states what a row from before this field is about."
gone_shape "withdrawing a verification, by X (evidence)" evidence_verified_opened '{"source_verified": true, "citation_resolved": false}' "source_verified = false" "only the steward withdraws a verification."
raised "withdrawing a measurement, by X (outcome_withdrawals)" "INSERT INTO outcome_withdrawals (tenant_id, value_outcome_id, kind, withdrawn_values, reason, withdrawn_by_person_id) VALUES ('$TEN', '$O', 'measurement', '{\"actual_value\":\"1.1\"}', 'Verification: by X.', '$X')" "only the steward withdraws a measurement or a commitment" "$X"
raised "a share for review, by X (record_documents)" "INSERT INTO record_documents (tenant_id, engagement_id, value_outcome_id, disclosure, content_hash, payload, rendered_by_person_id, value_run_id, kind, shared_with) SELECT '$TEN', r.engagement_id, (r.payload->>'valueOutcomeId')::uuid, 'shared_for_review', r.payload_hash, '{}'::jsonb, '$X', r.id, 'share_for_review', 'Pat Example (fixture)' FROM value_runs r WHERE r.id = '$FX_RUN'" "only the steward shares a run for review." "$X"
raised "a research clearance, by X (research_clearances)" "INSERT INTO research_clearances (tenant_id, kind, institution_id, model, retention_class, disclosure_text, disclosure_sha256, reason, person_id) VALUES ('$TEN', 'account', '$INST', 'claude', 'standard', 'Verification disclosure.', repeat('0', 64), 'Verification: by X.', '$X')" "only the steward clears an account or an industry for research with Claude" "$X"
# The rest of D3's rows, each raised by its own guard.
CUR_O="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE 'e3fb0061%'")"
raised "the act's subject (governance_acts)" "INSERT INTO governance_acts (tenant_id, act, subject_table, subject_id, actor_person_id, route) VALUES ('$TEN', 'validate', 'lens_policies', '$LX', '$S', 'POST /api/policies/lenses')" "the act's subject is not in your company's record."
raised "a document by a person not on your company's staff (record_documents)" "$(PRQ "$CUR" | sed "s/'$S', r.id, 'print_request'/'$OWNER', r.id, 'print_request'/")" "a print request is recorded by a current member of your company's staff, as themself." "$OWNER"
raised "a finding on another account's outcome (figure_findings)" "INSERT INTO figure_findings (tenant_id, institution_id, value_outcome_id, field, value, finding_text, reason, recorded_by_person_id) VALUES ('$TEN', '$INST', '$CUR_O', 'baseline_value', 1, 'The baseline has no source on record: verification.', 'Verification: another account''s outcome.', '$S')" "is not of this account."
raised "a lever not of your company (value_hypotheses)" "INSERT INTO value_hypotheses (tenant_id, institution_id, value_outcome_id, value_lever_id, statement, falsifier_reference, falsifier_due, falsifier_conditions, author_person_id) VALUES ('$TEN', '$INST', '$O', gen_random_uuid(), 'A statement long enough for the CHECK.', 'baseline', DATE '2027-06-30', 'on the same denominator', '$S')" "is not a current lever of your company."
raised "a clearance for another company's account (research_clearances)" "INSERT INTO research_clearances (tenant_id, kind, institution_id, model, retention_class, disclosure_text, disclosure_sha256, reason, person_id) VALUES ('$TEN', 'account', '$IX', 'claude', 'standard', 'Verification disclosure.', repeat('0', 64), 'Verification: another company''s account.', '$S')" "the account or industry is not a current one of your company."
raised "a call naming no prompt of your company (research_calls)" "INSERT INTO research_calls (tenant_id, kind, prompt_id, prompt_sha256, model, retention_class, person_id) VALUES ('$TEN', 'account', gen_random_uuid(), repeat('0', 64), 'claude', 'standard', '$S')" "the call names a prompt of your company, with that prompt's SHA-256."
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
cover "$LOG" 'the account (executive_summaries)' 'the run (run_errata)' 'the same persona (lens_policies)' 'a superseded CFO lens policy' "another company's CFO lens policy" 'naming a role, by X' 'a research clearance, by X' "the act's subject (governance_acts)" 'a call naming no prompt' 'B6: ' 'B7: ' 'B8: ' 'B9: ' 'B10: ' "the seed's own string is not read" 'hardening says: only the steward' 'functions change' 'a refused measurement reads' 'a refused AI-sourced actual reads' "the gap register's line" 'refusals keeps the raw text'

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
