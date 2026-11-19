#!/usr/bin/env bash
#
# S1 (3.1; LVRF_PLAN §20, approved by Brad 15 Nov 2026 with D1–D4 as recommended) — a hypothesis is sealed with every
# run (R5-3.1a); links to the value case under both lenses; "one point" (R5-3.1e). Local verification, Gate A.
#
#   ./scripts/verify_s1_hypothesis_rule.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (the 14 Nov copy) to `lvrf_verifys1`, migrated (no migration: journal 51) and hardened
# (section 35), dropped on exit (KEEP_DB=1 keeps it). Fixtures through the routes (L39: built on the clone); the D1
# tenant path through the page, as the steward, by session. DELIBERATE BREAKS (every file restored byte-identical,
# every function and trigger restored by re-applying hardening.sql), each with its positive control:
#   H1  the route check removed: the trigger still refuses (422, its own sentence)
#   H2  the trigger removed: the route still refuses (409); a SQL insert lands, so the trigger is the database's half
#   H3  a withdrawn hypothesis counted as current (route and trigger): the run lands — caught
#   H4  a superseded hypothesis counted as current (route and trigger): the run lands — caught
#   H5  the case links dropped from the run page's header: caught on the page
#   H6  a percentage metric's ask reading "unit": caught in the case and on the page
#   H7  W7 rendered before the hypothesis step (Brad's ruling 1): caught on the page
#   H8  the tenant's pack-basis badge back to "Not applicable" whatever its basis: caught on the page
# Plus: every sealed run byte-identical after section 35 installs and at the end; check_run_hashes all; drift; the
# CHECK and trigger counts; NULL inputs to the trigger (no outcome named, not an id); a post hoc hypothesis satisfies
# the rule and is still marked post hoc; the D1 path with screens, and the case under the CFO lens printed.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
. scripts/lib/hypothesis.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }
command -v pdftotext > /dev/null && command -v pdfinfo > /dev/null || { echo "REFUSING: pdftotext/pdfinfo (poppler) not found"; exit 1; }

VERIFY_DB=lvrf_verifys1
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3311; VITE_PORT=5311; CDP_PORT=9411
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_s1.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
PRODUCE=server/routes/produceRun.ts; WB=client/src/components/workbench/Workbench.tsx; ASKS=server/lib/caseQuestions.ts
INSTPAGE=client/src/pages/InstitutionPage.tsx
EDITED=("$PRODUCE" "$WB" "$ASKS" "$INSTPAGE")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
# Servers are stopped by the port they listen on, never by a subshell's pid (the orphaned-vite lesson, 14 Nov 2026).
by_port() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }
stop_port() { local p; p="$(by_port "$1")"; [ -n "$p" ] && kill $p 2>/dev/null || true; for _ in $(seq 1 20); do [ -z "$(by_port "$1")" ] && return 0; sleep 0.25; done; }
cleanup() {
  stop_port "$PORT"; stop_port "$VITE_PORT"
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "${EDITED[@]}"; do
    cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }
  done
  sleep 1; [ -n "${KEEP_DB:-}" ] || dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT

q() { psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1"; }
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
runs_md5() { q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE id IN (SELECT unnest(string_to_array('$RUN_IDS0', ','))::uuid)"; }
req() {  # METHOD PATH [BODY] — as the steward, by the actor header; status in $CODE, body in $W/r.json
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: $S" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d "$3" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING]
  req "$1" "$2" "$3"
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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "227" ] \
    && ok "  ...hardening.sql re-applied: every function and trigger as declared, 227 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}
start_server() {
  stop_port "$PORT"
  (LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" \
    npx tsx server/index.ts > "$W/server.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start: $(tail -5 "$W/server.log")"; exit 1
}
# A run inserted by SQL, rolled back: what the trigger alone says. PAYLOAD is a jsonb expression.
runsql() {  # ENGAGEMENT PAYLOAD -> "LANDED" or the error line
  printf "BEGIN;\nINSERT INTO value_runs (tenant_id, engagement_id, run_number, terminal_value_stage, confidence_score, confidence_band, source_fixture, payload_hash, payload, walked_by_person_id) SELECT g.tenant_id, g.id, 9999, 'baseline', 0, 'low', 's1_sql', 'x', %s, '%s' FROM engagements g WHERE g.id = '%s';\nSELECT 'LANDED';\nROLLBACK;\n" "$2" "$S" "$1" \
    | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'LANDED|ERROR' | head -1 || true
}
walk() { SHOTS="$SHOTS" VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" DB="$VERIFY_DB" S_EMAIL="$S_EMAIL" PW="$PW" node scripts/lib/s1_walk.mjs "$@" > "$W/walk.out" 2>&1 || true
  cat "$W/walk.out"; PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.out" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.out" || true))); }
produce() {  # ENGAGEMENT NOTE STATUS LABEL [SUBSTRING]
  expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "$2" source_fixture s1_fixture)" "$3" "$4" "${5:-}"
  RUN=""; [ "$CODE" = "201" ] && RUN="$(rj b.value_run_id)"; true
}
count_runs() { q "SELECT count(*) FROM value_runs WHERE engagement_id = '$1'"; }

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone the 14 Nov copy; migrate; harden (section 35)"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUN_IDS0="$(q "SELECT string_agg(id::text, ',' ORDER BY id) FROM value_runs")"
N_RUNS0="$(q "SELECT count(*) FROM value_runs")"
RUNS0="$(runs_md5)"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (no new migration)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "227" ] && ok "227 triggers by pg_trigger (S1 section 35: +1, value_runs_hypothesis_current)" || bad "triggers: $(trig)"
[ "$(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")" = "350" ] && ok "  ...349 information_schema rows (S2: +20) (328 + 1: INSERT)" || bad "  ...rows: $(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$(q "SELECT string_agg(event_manipulation || ':' || action_timing, ',') FROM information_schema.triggers WHERE trigger_name = 'value_runs_hypothesis_current'")" = "INSERT:BEFORE" ] && ok "  ...value_runs_hypothesis_current: BEFORE INSERT only (a sealed run is never read by it)" || bad "  ...timing"
[ "$(q "SELECT count(*) FROM hardening_manifest WHERE trigger_name = 'value_runs_hypothesis_current'")" = "1" ] && ok "  ...in the hardening manifest" || bad "  ...manifest"
[ "$(runs_md5)" = "$RUNS0" ] && ok "every one of the $N_RUNS0 sealed runs byte-identical after section 35 installs" || bad "a sealed run changed"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 53 migrations, newest 0052_s4_form_confirmation" && ok "drift: none, no migration ($DRIFT)" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^158 CHECKs in the database: 158 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN (S1 adds no CHECK)" || bad "plain: $PLAIN"
OWN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_ownership.ts 2>&1 | tail -1)"
printf '%s' "$OWN" | grep -q "lvrf_app owns nothing" && ok "ownership: $OWN" || bad "ownership: $OWN"
HASHES() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1; }
H0="$(HASHES)"; printf '%s' "$H0" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "check_run_hashes, all: $H0" || bad "hashes: $H0"

step "3. Fixtures"
TS="$(date +%s)"
S="$(q "SELECT steward_person_id FROM tenants WHERE steward_person_id IS NOT NULL LIMIT 1")"
S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
ok "the steward ($S_NAME) signs in on the clone with a fixture password (the copy's own credential revoked there)"
# Curia's CURRENT engagement's outcome (its other engagement is retired, so a produce there is a 404 before the rule).
O_CUR="$(q "SELECT vo.id FROM value_outcomes vo JOIN engagements g ON g.id = vo.engagement_id JOIN institutions i ON i.id = g.institution_id WHERE i.name = 'Curia' AND g.deleted_at IS NULL AND g.superseded_by_id IS NULL AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL")"; E_CUR="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O_CUR'")"; C8="${O_CUR:0:8}"
M_CUR="$(q "SELECT bm.name FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id WHERE vo.id = '$O_CUR'")"
U_CUR="$(q "SELECT bm.unit FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id WHERE vo.id = '$O_CUR'")"
O_SCO="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE '6f4ba1fa%'")"; E_SCO="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O_SCO'")"
SK="$(q "SELECT id FROM institutions WHERE is_tenant_self")"
O_SK="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE 'f23ee6a8%'")"; E_SK="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$O_SK'")"
R2_SK="$(q "SELECT id FROM value_runs WHERE id::text LIKE '98a71a82%'")"; R_SCO="$(q "SELECT id FROM value_runs WHERE id::text LIKE 'ba5b5109%'")"
[ -n "$O_CUR" ] && [ -n "$O_SCO" ] && [ -n "$O_SK" ] && [ -n "$R2_SK" ] && ok "the copy's outcomes: Curia $C8 (current engagement, no hypothesis), Scotts 6f4ba1fa (one), Skillsoft f23ee6a8 (none); Skillsoft run 2 98a71a82" || { bad "the copy's rows"; exit 1; }
[ "$(q "SELECT count(*) FROM value_hypotheses WHERE value_outcome_id = '$O_CUR'")|$(q "SELECT count(*) FROM value_hypotheses WHERE value_outcome_id = '$O_SK'")|$(q "SELECT count(*) FROM value_hypotheses WHERE value_outcome_id = '$O_SCO' AND deleted_at IS NULL AND superseded_by_id IS NULL")" = "0|0|1" ] && ok "  ...as the copy holds them: 0, 0 and 1 current hypotheses" || bad "  ...hypothesis counts"
start_server && ok "API up on $PORT"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1 < /dev/null &)
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
ok "vite on $VITE_PORT, headless Chrome on $CDP_PORT"

step "4. The rule: no run without a current hypothesis (route and database)"
N="$(count_runs "$E_CUR")"
produce "$E_CUR" "Verification: no hypothesis." 409 "Curia $C8 has no hypothesis: produce-run refuses" "$M_CUR (outcome $C8) has no current hypothesis, and a run seals the hypothesis it tests. State a hypothesis… on this outcome first, then produce the run. Runs already sealed are unchanged."
[ "$(count_runs "$E_CUR")" = "$N" ] && ok "  ...nothing sealed" || bad "  ...a run was sealed"
[ "$(q "SELECT source || '|' || endpoint || '|' || (value_outcome_id = '$O_CUR') || '|' || (constraint_name IS NULL) FROM refusals ORDER BY refused_at DESC LIMIT 1")" = "route|POST /api/engagements/:engagementId/produce-run|true|true" ] && ok "  ...and the refusal is recorded (source route, the outcome named)" || bad "  ...refusal row: $(q "SELECT source, endpoint, constraint_name FROM refusals ORDER BY refused_at DESC LIMIT 1")"
P_CUR="jsonb_build_object('valueOutcomeId', '$O_CUR')"
R="$(runsql "$E_CUR" "$P_CUR")"; printf '%s' "$R" | grep -qF "LVRF: value_runs: outcome $C8 has no current hypothesis; a run seals the hypothesis it tests." && ok "the trigger: a SQL insert for Curia is refused in its own sentence" || bad "trigger: $R"
R="$(runsql "$E_CUR" "'{}'::jsonb")"; printf '%s' "$R" | grep -qF "a run names the outcome it seals; this one names none" && ok "  ...NULL input: a payload naming no outcome is refused" || bad "  ...no outcome: $R"
R="$(runsql "$E_CUR" "jsonb_build_object('valueOutcomeId', NULL)")"; printf '%s' "$R" | grep -qF "names none" && ok "  ...NULL input: valueOutcomeId null is refused" || bad "  ...null: $R"
R="$(runsql "$E_CUR" "jsonb_build_object('valueOutcomeId', 'not-an-id')")"; printf '%s' "$R" | grep -qF "names none" && ok "  ...valueOutcomeId not an id is refused (not a cast error)" || bad "  ...not an id: $R"
R="$(runsql "$E_SCO" "jsonb_build_object('valueOutcomeId', '$O_SCO')")"; [ "$R" = "LANDED" ] && ok "  ...positive control: Scotts' outcome, with its current hypothesis, lands (rolled back)" || bad "  ...Scotts control: $R"
# Brad's ruling 1 (15 Nov 2026): in the customer workspace, W7 and W8 follow "State a hypothesis…"; with none current,
# W7 says so and points to step 3 instead of offering a submit that would 409. Read here, while every run of the
# engagement is locked (an open run is W8's to lock, and W7 then offers nothing new).
INST_CUR="$(q "SELECT institution_id FROM value_outcomes WHERE id = '$O_CUR'")"
expect GET "/api/institutions/$INST_CUR/walk" "" 200 "the walk read reports the outcome's current hypotheses"
[ "$(rj "b.engagements.flatMap(e=>e.outcomes).find(o=>o.id==='$O_CUR').current_hypotheses")" = "0" ] && ok "  ...0 for Curia $C8" || bad "  ...current_hypotheses: $(rj "JSON.stringify(b.engagements.flatMap(e=>e.outcomes).map(o=>[o.id,o.current_hypotheses]))")"
INST="$INST_CUR" walk w7gate
# H7 — W7 rendered before the hypothesis step (the workspace's run target dropped: W7 falls back into the walk, step 2).
edit "$INSTPAGE" "targets={{ run: runEl, retire: retireEl }}" "targets={{ run: null, retire: retireEl }}"
sleep 3
INST="$INST_CUR" walk w7order
restore "$INSTPAGE"; sleep 3
INST="$INST_CUR" walk w7gate
state_hypothesis "$E_CUR" && H_A="$HYP_ID" && ok "the helper states a hypothesis on Curia (${H_A:0:8}), through the routes" || bad "helper on Curia"
produce "$E_CUR" "Verification: under a hypothesis." 201 "positive control: with it, the run is produced"; R_A="$RUN"
[ "$(q "SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'case'->'hypotheses') h WHERE h->>'id' = '$H_A' AND h->>'verdict' = 'open') AND jsonb_array_length(payload->'case'->'solutioning') = 1 FROM value_runs WHERE id = '$R_A'")" = "t" ] && ok "  ...and the run seals it (case.hypotheses, open; solutioning names it): D3, no new column" || bad "  ...seal: $(q "SELECT payload->'case'->'hypotheses' FROM value_runs WHERE id = '$R_A'")"
expect POST "/api/value-runs/$R_A/lock" "$(J lock_reason 'Verification: sealed under its hypothesis.')" 200 "  ...locked"

step "5. Withdrawn and superseded hypotheses are not current"
expect POST "/api/value-hypotheses/$H_A/withdraw" "$(J retirement_reason 'Verification: withdrawn for the rule.')" 200 "the hypothesis withdrawn"
produce "$E_CUR" "Verification: only a withdrawn one." 409 "  ...produce-run refuses: a withdrawn hypothesis is not current" "has no current hypothesis"
LEVER_CUR="$(q "SELECT value_lever_id FROM value_hypotheses WHERE id = '$H_A'")"
DUE="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 90, 'YYYY-MM-DD')")"
HB() { J value_outcome_id "$O_CUR" value_lever_id "$LEVER_CUR" statement "$1" falsifier_reference baseline falsifier_due "$DUE" falsifier_conditions ''; }
expect POST "/api/institutions/$(q "SELECT institution_id FROM value_outcomes WHERE id = '$O_CUR'")/hypotheses" "$(HB 'Verification: a second hypothesis, to be restated.')" 201 "a second hypothesis"; H_B="$(rj b.value_hypothesis_id)"
expect POST "/api/value-hypotheses/$H_B/supersede" "$(J statement 'Verification: the second hypothesis, restated.' falsifier_reference baseline falsifier_due "$DUE" falsifier_conditions '' supersession_reason 'Verification: restated for the rule.')" 201 "  ...restated: the old version superseded, the new one current"; H_C="$(rj b.value_hypothesis_id)"
produce "$E_CUR" "Verification: under the restated one." 201 "  ...positive control: the restated version is current, so the run is produced"
expect POST "/api/value-hypotheses/$H_C/withdraw" "$(J retirement_reason 'Verification: the restated one withdrawn.')" 200 "  ...the restated version withdrawn"
[ "$(q "SELECT string_agg(CASE WHEN deleted_at IS NOT NULL THEN 'withdrawn' WHEN superseded_by_id IS NOT NULL THEN 'superseded' ELSE 'current' END, ',' ORDER BY created_at) FROM value_hypotheses WHERE value_outcome_id = '$O_CUR'")" = "withdrawn,superseded,withdrawn" ] && ok "Curia now holds: withdrawn, superseded, withdrawn (none current)" || bad "state: $(q "SELECT string_agg(id::text, ',') FROM value_hypotheses WHERE value_outcome_id = '$O_CUR'")"
produce "$E_CUR" "Verification: none current." 409 "  ...produce-run refuses" "has no current hypothesis"
R="$(runsql "$E_CUR" "$P_CUR")"; printf '%s' "$R" | grep -qF "has no current hypothesis" && ok "  ...and so does the trigger" || bad "  ...trigger: $R"

step "6. The breaks"
# H1 — the route check removed: the trigger refuses.
edit "$PRODUCE" "      if (hypothesesCurrent === 0) {" "      if (hypothesesCurrent === -1) {"
start_server
N="$(count_runs "$E_CUR")"
produce "$E_CUR" "Verification: H1." 422 "H1: the route check removed → caught by the trigger (422, its own sentence)" "LVRF: value_runs: outcome $C8 has no current hypothesis"
[ "$(count_runs "$E_CUR")" = "$N" ] && [ "$(q "SELECT source || '|' || constraint_name FROM refusals ORDER BY refused_at DESC LIMIT 1")" = "database|value_runs_hypothesis_current" ] && ok "  ...nothing sealed; the refusal recorded with the trigger's constraint name" || bad "  ...H1 record: $(q "SELECT source, constraint_name FROM refusals ORDER BY refused_at DESC LIMIT 1")"
state_hypothesis "$E_CUR" && H_D="$HYP_ID" || bad "  ...H1 control: no hypothesis stated"
produce "$E_CUR" "Verification: H1 control." 201 "  ...positive control under the break: with a hypothesis stated, the run is produced"
expect POST "/api/value-hypotheses/$H_D/withdraw" "$(J retirement_reason 'Verification: withdrawn after the H1 control.')" 200 "  ...that hypothesis withdrawn again (none current)"
restore "$PRODUCE"; start_server
# H2 — the trigger removed: the route refuses; SQL lands.
q "DROP TRIGGER value_runs_hypothesis_current ON value_runs" > /dev/null
[ "$(trig)" = "226" ] && ok "H2: the trigger dropped on the clone (226)" || bad "H2 drop"
produce "$E_CUR" "Verification: H2." 409 "H2: the trigger removed → caught by the route (409)" "has no current hypothesis"
R="$(runsql "$E_CUR" "$P_CUR")"; [ "$R" = "LANDED" ] && ok "  ...and a SQL insert lands without it (rolled back): the trigger is the database's half" || bad "  ...H2 SQL: $R"
reharden
R="$(runsql "$E_CUR" "$P_CUR")"; printf '%s' "$R" | grep -qF "has no current hypothesis" && ok "  ...positive control: restored, the same insert is refused" || bad "  ...H2 restore: $R"
# H3 — a withdrawn hypothesis counted as current (both halves): the run lands.
edit "$PRODUCE" "WHERE value_outcome_id = \$1 AND deleted_at IS NULL AND superseded_by_id IS NULL\`," "WHERE value_outcome_id = \$1 AND superseded_by_id IS NULL\`,"
fnbreak lvrf_run_hypothesis_current "WHERE h.value_outcome_id = o AND h.deleted_at IS NULL AND h.superseded_by_id IS NULL" "WHERE h.value_outcome_id = o AND h.superseded_by_id IS NULL"
start_server
produce "$E_CUR" "Verification: H3." 201 "H3: a withdrawn hypothesis counted as current → caught: a run lands with none current"
restore "$PRODUCE"; reharden; start_server
produce "$E_CUR" "Verification: H3 restored." 409 "  ...positive control: restored, refused again" "has no current hypothesis"
# H4 — a superseded hypothesis counted as current (both halves): the run lands.
edit "$PRODUCE" "WHERE value_outcome_id = \$1 AND deleted_at IS NULL AND superseded_by_id IS NULL\`," "WHERE value_outcome_id = \$1 AND deleted_at IS NULL\`,"
fnbreak lvrf_run_hypothesis_current "WHERE h.value_outcome_id = o AND h.deleted_at IS NULL AND h.superseded_by_id IS NULL" "WHERE h.value_outcome_id = o AND h.deleted_at IS NULL"
start_server
produce "$E_CUR" "Verification: H4." 201 "H4: a superseded hypothesis counted as current → caught: a run lands with none current"
restore "$PRODUCE"; reharden; start_server
produce "$E_CUR" "Verification: H4 restored." 409 "  ...positive control: restored, refused again" "has no current hypothesis"
# H5 — the case links dropped from the run page's header.
RUN="$R_A" TENANT_INST="$SK" walk links
edit "$WB" '<CaseLinks runId={run.id} testid="run-case-link" />' '{null}'
sleep 2
RUN="$R_A" walk nolink
restore "$WB"; sleep 2
RUN="$R_A" TENANT_INST="$SK" walk links
# H6 — a percentage metric's ask reading "unit".
WANT="one point of Dollar Retention Rate (trailing twelve months)"
expect GET "/api/value-runs/$R2_SK/case" "" 200 "Skillsoft run 2's case (%, no_rate among its sealed reasons)"
[ "$(rj "b.asks.find(a=>a.code==='no_rate').need")" = "What one point of Dollar Retention Rate (trailing twelve months) is worth to Skillsoft per year, stated by Skillsoft." ] && ok "  ...its ask reads \"What one point of Dollar Retention Rate (trailing twelve months) is worth to Skillsoft per year\"" || bad "  ...ask: $(rj "JSON.stringify(b.asks.find(a=>a.code==='no_rate'))")"
[ "$(rj "b.asks.find(a=>a.code==='no_rate').question")" = "What is one point of Dollar Retention Rate (trailing twelve months) worth to Skillsoft each year, and who in finance would stand behind that figure?" ] && ok "  ...and its question, \"What is one point of …\"" || bad "  ...question"
[ "$(rj "b.outcomes[0].rate_unit_word")" = "point" ] && ok "  ...the case carries the step (\"point\") for the page" || bad "  ...rate_unit_word: $(rj "b.outcomes[0].rate_unit_word")"
RUN="$R2_SK" EXPECT="$WANT" TAG=pct walk ask
U_SCO="$(q "SELECT payload->'businessMetric'->>'unit' FROM value_runs WHERE id = '$R_SCO'")"
expect GET "/api/value-runs/$R_SCO/case" "" 200 "Scotts' run ba5b5109 (unit \"$U_SCO\", not a percentage)"
[ "$(rj "b.outcomes[0].rate_unit_word")" = "$U_SCO" ] && ok "  ...a non-percentage unit's step is the unit itself (D2: \"one $U_SCO\")" || bad "  ...non-% step: $(rj "b.outcomes[0].rate_unit_word")"
expect GET "/api/value-runs/$R_A/case" "" 200 "Curia's run under its hypothesis (unit \"$U_CUR\")"
[ "$(rj "b.outcomes[0].rate_unit_word")" = "point" ] && ok "  ...a % unit's step is \"point\"" || bad "  ...Curia step: $(rj "b.outcomes[0].rate_unit_word")"
edit "$ASKS" "  if (/^(%|percent\\b|percentage\\b)/i.test(u)) return 'point';" "  if (/^(%|percent\\b|percentage\\b)/i.test(u)) return 'unit';"
start_server
expect GET "/api/value-runs/$R2_SK/case" "" 200 "H6: the percentage rule broken"
[ "$(rj "b.asks.find(a=>a.code==='no_rate').need.includes('one unit of Dollar Retention Rate')")" = "true" ] && ok "H6: a percentage metric's ask reading \"unit\" → caught: \"one unit of Dollar Retention Rate\" is not \"$WANT\"" || bad "H6 API"
RUN="$R2_SK" EXPECT="$WANT" BREAK=1 TAG=pct walk ask
restore "$ASKS"; start_server
expect GET "/api/value-runs/$R2_SK/case" "" 200 "  ...restored"
[ "$(rj "b.asks.find(a=>a.code==='no_rate').need.includes('$WANT')")" = "true" ] && ok "  ...positive control: \"$WANT\" again" || bad "  ...H6 restore"

step "7. A post hoc hypothesis satisfies the rule, and is still marked post hoc"
PAST="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date - 1, 'YYYY-MM-DD')")"
expect POST "/api/institutions/$(q "SELECT institution_id FROM value_outcomes WHERE id = '$O_CUR'")/hypotheses" "$(J value_outcome_id "$O_CUR" value_lever_id "$LEVER_CUR" statement 'Verification: written after its due date (post hoc).' falsifier_reference baseline falsifier_due "$PAST" falsifier_conditions '')" 201 "a hypothesis due yesterday"
H_P="$(rj b.value_hypothesis_id)"; [ "$(rj b.post_hoc)" = "true" ] && ok "  ...computed post hoc (O2-D3)" || bad "  ...post_hoc: $(rj b.post_hoc)"
produce "$E_CUR" "Verification: post hoc." 201 "  ...it satisfies the rule: the run is produced"; R_P="$RUN"
[ "$(q "SELECT h->>'post_hoc' FROM value_runs r, jsonb_array_elements(r.payload->'case'->'hypotheses') h WHERE r.id = '$R_P' AND h->>'id' = '$H_P'")" = "true" ] && ok "  ...and the run seals it marked post hoc" || bad "  ...sealed post_hoc"

step "8. D1 — the tenant's own account gets a hypothesis path (rehearsed on the clone; through the page unless named)"
SLUG=learning-platforms
export IND_NAME='Learning platforms' SLUG IND_REASON="Skillsoft's own account needs a pack entry for its renewal measure (S1, LVRF_PLAN §20 D1)."
export QUERY='Dollar retention rate as a renewal measure for learning-platform vendors (rehearsal fixture)'
# The DRR entry exactly as Brad accepted it on prod (2bd87345, 15 Nov 2026 06:53 UTC, read read-only), so the print
# check below tests the real "why it pays" text, with the research's own dollar-per-point figures in it.
export DRR_NAME='Enterprise net (dollar) retention rate' METRIC_SK='Dollar Retention Rate (trailing twelve months)'
export DRR_JSON="$(cat scripts/fixtures/s1_drr_entry_prod.json)"
export ACCEPT_NOTE='Rehearsal: accepted for the tenant path (Gate A, not a source).'
# The lever, claim and basis texts are the drafts in BUILD_STATUS's S1 act session (Brad, 15 Nov 2026): each clause is
# what evidence 9a36e675 states (98% LTM DRR, one point lower than a year earlier) or is marked untested. The mechanism
# is Brad's final text (15 Nov 2026).
export LEVER_NAME='Value-based renewal execution'
export LEVER_MECH="Value-based renewal execution, not yet tested at Skillsoft: the hypothesis is that it raises dollar retention, which the Q1 FY2027 release reports as an LTM DRR of 98%, one percentage point lower than a year earlier."
# Before the lever (Brad, 15 Nov 2026): the Q2 FY2027 release recorded on card 01c and opened, Yes. The quote is the
# filing's Key Performance Metric definition, checked character for character against EDGAR's copy of ex_982157.htm
# (accession 0001437749-26-029980, SHA-256 22067cff…, 15 Nov 2026): 39 words, within the 40-word limit.
export Q2_SUMMARY='Skillsoft defines dollar retention rate (DRR) as subscription renewals, upgrades, churn and downgrades in a period over the beginning total renewable base of existing customers.'
export Q2_PROVENANCE='Skillsoft 8-K Ex. 99.1, Q2 FY2027 release, 9 Sep 2026 (SEC EDGAR)'
export Q2_REFERENCE='https://www.sec.gov/Archives/edgar/data/1774675/000143774926029980/ex_982157.htm'
export Q2_QUOTE='Dollar retention rate (“DRR”) - For existing customers at the beginning of a given period, DRR represents subscription renewals, upgrades, churn and downgrades in such period divided by the beginning total renewable base of such customers for such period.'
export Q2_HOW_READ='Exhibit 99.1 of the 8-K filed 9 Sep 2026 (accession 0001437749-26-029980), Key Performance Metric section, first bullet, first sentence. The release states no DRR figure.'
T_D1="$(q "SELECT clock_timestamp()")"
TENANT_INST="$SK" walk q2source
SQ="'"
Q2EV="$(q "SELECT id FROM evidence WHERE institution_id = '$SK' AND summary = '${Q2_SUMMARY//$SQ/$SQ$SQ}' AND deleted_at IS NULL AND superseded_by_id IS NULL")"
[ -n "$Q2EV" ] && ok "the Q2 FY2027 release recorded on card 01c, through the page (${Q2EV:0:8})" || { bad "the Q2 row"; exit 1; }
[ "$(q "SELECT kind = 'public_filing' AND about_institution_id = '$SK' AND evidence_form = 'quote' AND quote_text = '${Q2_QUOTE//$SQ/$SQ$SQ}' AND provenance = '$Q2_PROVENANCE' AND source_reference = '$Q2_REFERENCE' AND captured_by_person_id = '$S' AND NOT simulated FROM evidence WHERE id = '$Q2EV'")" = "t" ] \
  && ok "  ...a public filing about Skillsoft, quoting the definition verbatim, by the steward, not simulated" || bad "  ...Q2 row fields: $(q "SELECT kind, evidence_form, about_institution_id, left(quote_text, 60) FROM evidence WHERE id = '$Q2EV'")"
[ "$(q "SELECT citation_resolved AND source_verified AND citation_resolved_by_person_id = '$S' FROM evidence WHERE id = '$Q2EV'")" = "t" ] && ok "  ...opened, Yes: source-verified, by the steward" || bad "  ...Q2 opening"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'open_citation' AND subject_id = '$Q2EV'")" = "1" ] && ok "  ...one open_citation act on it" || bad "  ...open_citation act"
export LEVER_IND='Share of Skillsoft renewals entered with a verified value case (not yet measured)'
export LEVER_CIT='Skillsoft 8-K Ex. 99.1, Q1 FY2027 release, 9 Jun 2026 (SEC EDGAR), evidence 9a36e675 (opened): “LTM DRR of 98%, one percentage point lower than the year ago period.”'
TENANT_INST="$SK" walk tenant1
IND="$(q "SELECT id FROM industries WHERE slug = '$SLUG'")"; ENTRY="$(q "SELECT id FROM industry_measures WHERE industry_id = '$IND' AND name = '$DRR_NAME' AND deleted_at IS NULL")"
LEVER="$(q "SELECT id FROM value_levers WHERE industry_measure_id = '$ENTRY' AND deleted_at IS NULL")"
[ -n "$IND" ] && [ -n "$ENTRY" ] && [ -n "$LEVER" ] && ok "  ...the industry ${IND:0:8}, its DRR entry ${ENTRY:0:8} and the lever ${LEVER:0:8} recorded" || { bad "  ...tenant1 rows"; exit 1; }
[ "$(q "SELECT proposed_by_person_id = '$S' FROM value_levers WHERE id = '$LEVER'")" = "t" ] && ok "  ...the lever is the steward's act" || bad "  ...lever proposer"
# Brad's ruling 2: classify, claim and basis through the controls on the tenant's own account (none by route).
CAP_SK="$(q "SELECT capability_id FROM value_outcomes WHERE id = '$O_SK'")"; BM_SK="$(q "SELECT business_metric_id FROM value_outcomes WHERE id = '$O_SK'")"
A_ROUTE0="$(q "SELECT count(*) FROM governance_acts")"
export CLASSIFY_NOTE='Rehearsal: classified only to carry its own value case; its renewal measure rests on this pack (S1, D1).'
export CAP_ID="$CAP_SK" ENTRY_ID="$ENTRY" OUTCOME="$O_SK"
export CLAIM="Claimed, not yet tested: that value-based renewal execution raises Skillsoft's dollar retention rate (98% LTM at Q1 FY2027). The hypothesis on this account's renewal outcome tests it."
export BASIS_NOTE="Skillsoft's DRR is its own measure, not this entry's cohort ARR rate. Its definition, from evidence ${Q2EV:0:8} (8-K Ex. 99.1, Q2 FY2027 release, 9 Sep 2026): “${Q2_QUOTE}” Its basis is stated; it is not compared across vendors."
TENANT_INST="$SK" walk tenantchain
CLAIM_SQL="${CLAIM//$SQ/$SQ$SQ}"
[ "$(q "SELECT industry_id = '$IND' FROM institutions WHERE id = '$SK'")" = "t" ] && ok "Skillsoft classified to ${IND_NAME}, by the page's \"Classify as…\"" || bad "classification"
[ "$(q "SELECT count(*) FROM capability_industry_measures WHERE capability_id = '$CAP_SK' AND industry_measure_id = '$ENTRY' AND claimed_by_person_id = '$S' AND claim = '$CLAIM_SQL'")" = "1" ] && ok "  ...the capability's claim on the DRR entry, by the steward, with its claim as typed" || bad "  ...claim"
[ "$(q "SELECT industry_measure_id = '$ENTRY' FROM business_metrics WHERE id = '$BM_SK'")" = "t" ] && ok "  ...the metric's pack basis on the DRR entry" || bad "  ...basis"
[ "$(q "SELECT count(*) FROM evidence WHERE institution_id = '$SK' AND summary = '${BASIS_NOTE//$SQ/$SQ$SQ}' AND provenance LIKE 'Asserted at pack basis by %'")" = "1" ] \
  && ok "  ...its basis note stored as typed, quoting the Q2 row's definition and naming it (${Q2EV:0:8})" || bad "  ...basis note not stored as typed"
export ENG="$E_SK" OUTCOME="$O_SK" LEVER_ID="$LEVER" NEXT=3 DUE="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 365, 'YYYY-MM-DD')")"
export STATEMENT='Value-based renewal execution holds Skillsoft dollar retention above its published baseline.'
export CONDITIONS='on the trailing twelve months, as Skillsoft reports it'
export BANNER='OUTSIDE-IN HYPOTHESIS' RUN_NOTE='Rehearsal: run 3, sealed with its hypothesis.' RUN_SOURCE='gate_a_s1_rehearsal' LOCK_REASON='Rehearsal: sealed with the hypothesis it tests.'
TENANT_INST="$SK" walk tenant2
R3="$(q "SELECT id FROM value_runs WHERE engagement_id = '$E_SK' AND run_number = 3")"
[ -n "$R3" ] && [ "$(q "SELECT locked_at IS NOT NULL FROM value_runs WHERE id = '$R3'")" = "t" ] && ok "Skillsoft run 3 (${R3:0:8}) produced and locked through card 05" || bad "run 3"
H_SK="$(q "SELECT id FROM value_hypotheses WHERE value_outcome_id = '$O_SK' AND deleted_at IS NULL AND superseded_by_id IS NULL")"
[ "$(q "SELECT author_person_id = '$S' AND falsifier_reference = 'baseline' AND trim_scale(reference_value)::text = '98' AND NOT post_hoc FROM value_hypotheses WHERE id = '$H_SK'")" = "t" ] && ok "  ...its hypothesis ${H_SK:0:8}: by the steward, referenced to the published 98% baseline, not post hoc" || bad "  ...hypothesis: $(q "SELECT falsifier_reference, reference_value, post_hoc FROM value_hypotheses WHERE id = '$H_SK'")"
[ "$(q "SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'case'->'hypotheses') h WHERE h->>'id' = '$H_SK') AND (payload->'case'->'pack_entry'->>'id') = '$ENTRY' FROM value_runs WHERE id = '$R3'")" = "t" ] && ok "  ...run 3 seals the hypothesis and the DRR pack entry" || bad "  ...run 3 seal"
PDF="$SHOTS/s1_d1_case_cfo.pdf"; HASH3="$(q "SELECT payload_hash FROM value_runs WHERE id = '$R3'")"
if [ -s "$PDF" ]; then
  PAGES="$(pdfinfo "$PDF" | awk '/^Pages:/{print $2}')"; GOOD=0
  for i in $(seq 1 "$PAGES"); do T="$(pdftotext -f "$i" -l "$i" "$PDF" - 2>/dev/null | tr '\n' ' ' | tr -s ' ')"
    printf '%s' "$T" | grep -qF "$HASH3" && printf '%s' "$T" | grep -qiE "unverified|not verified" && GOOD=$((GOOD + 1)); done
  [ "$GOOD" = "$PAGES" ] && ok "the case under the CFO lens printed: $PAGES page(s), every one with the disclosure banner and run 3's payload_hash" || bad "print: $GOOD of $PAGES pages carry both"
  # Stage 10 (S1): the entry's "why it pays" carries the research's own dollar-per-point arithmetic ($2.5M, $5.4M),
  # which must not print. The stored entry holds it (the control); the print, the case under both lenses and the seal do not.
  PT="$(pdftotext "$PDF" - | tr '\n' ' ')"
  [ "$(q "SELECT why_it_pays LIKE '%\$2.5M%' AND why_it_pays LIKE '%\$5.4M%' FROM industry_measures WHERE id = '$ENTRY'")" = "t" ] && ok "  ...control: the stored entry's why-it-pays holds \$2.5M and \$5.4M" || bad "  ...control: the fixture lacks the figures"
  printf '%s' "$PT" | grep -qE '2\.5 ?M|5\.4 ?M|dollar-per-point|one point of net retention' && bad "  ...the print carries the entry's dollar-per-point figures" || ok "  ...the print carries neither \$2.5M nor \$5.4M, nor the why-it-pays sentence"
  for L in '' '?lens=cfo'; do expect GET "/api/value-runs/$R3/case$L" "" 200 "  ...the case read${L:+ under the CFO lens}"; grep -qE '2\.5M|5\.4M' "$W/r.json" && bad "  ...it carries the figures" || ok "  ...and carries neither figure"; done
  [ "$(q "SELECT payload::text ~ '2\.5M|5\.4M' FROM value_runs WHERE id = '$R3'")" = "f" ] && ok "  ...run 3's seal carries neither (the chain seals the entry's fields, why-it-pays only inside its fingerprint)" || bad "  ...the seal carries them"
  # The lever's mechanism and leading indicator print on the case's "Value hypotheses" section (ValueCasePage:
  # "Through: … Watch first: …"). A case the CFO lens refuses does not print that section (run 3's does not), so the
  # case read carries them under both lenses as drafted, and any "Through:" line printed reads as drafted.
  PTS="$(printf '%s' "$PT" | tr -s ' ')"
  if printf '%s' "$PTS" | grep -qF "Through: "; then
    printf '%s' "$PTS" | grep -qF "Through: $LEVER_NAME. $LEVER_NAME, not yet tested at Skillsoft: the hypothesis is that it raises" \
      && printf '%s' "$PTS" | grep -qF "Watch first: Share of Skillsoft renewals entered with a verified value case (not yet measured)" \
      && ok "  ...the print carries the lever as drafted: \"not yet tested\", its indicator \"(not yet measured)\"" \
      || bad "  ...lever line: $(printf '%s' "$PTS" | grep -oE 'Through: .{0,240}' | head -1)"
  else ok "  ...the CFO print, a refused case, carries no lever line (its \"Value hypotheses\" section is not printed)"; fi
  for L in '' '?lens=cfo'; do expect GET "/api/value-runs/$R3/case$L" "" 200 "  ...the case read${L:+ under the CFO lens}, for the lever"
    [ "$(rj "b.hypotheses.filter(h=>h.lever && h.lever.mechanism===process.env.LEVER_MECH && h.lever.leading_indicator===process.env.LEVER_IND).length")" = "1" ] \
      && ok "  ...it carries the lever's mechanism and indicator as drafted (\"not yet tested\", \"(not yet measured)\")" || bad "  ...lever in the case read: $(rj "JSON.stringify(b.hypotheses.map(h=>h.lever))" | head -c 300)"; done
  [ "$(q "SELECT payload::text LIKE '%not yet tested at Skillsoft: the hypothesis is that it raises dollar retention%' FROM value_runs WHERE id = '$R3'")" = "t" ] && ok "  ...run 3's seal carries the mechanism as drafted" || bad "  ...the seal lacks the mechanism"
  pdftotext "$PDF" - | tr '\n' ' ' | grep -qF "one point of Dollar Retention Rate" && ok "  ...and its asks read \"one point of Dollar Retention Rate\"" || echo "  info  the printed case asks no rate (run 3's cost of delay names no no_rate)"
else bad "no PDF printed"; fi
# The acts the D1 path writes, measured (for Gate C's count on prod). The rehearsal's own setup (the industry, the prompt,
# the import, the accept: done on prod already) is set aside; what is left is what Brad's act session writes after R1–R3.
D1_ACTS="$(q "SELECT string_agg(act::text || ':' || subject_table, ' ' ORDER BY at, id) FROM governance_acts WHERE at > '$T_D1' AND subject_table NOT IN ('industries', 'research_prompts', 'research_imports', 'research_results', 'industry_measures')")"
echo "  info  acts written by the D1 path after the setup: $D1_ACTS"
[ "$D1_ACTS" = "open_citation:evidence ratify:value_levers lock:value_runs" ] \
  && ok "  ...exactly three: the opening of the Q2 row, the lever, run 3's lock (recording a source, classify, the claim, the basis, the hypothesis and producing write none)" || bad "  ...D1 acts: $D1_ACTS"

# H8 — the pack-basis badge (D1): the tenant's own metric now rests on the DRR entry, so it reads "Pack basis".
TENANT_INST="$SK" METRIC="$METRIC_SK" walk badge
edit "$INSTPAGE" "  if (isTenantSelf && !industryMeasureId) {" "  if (isTenantSelf) {"
sleep 3
TENANT_INST="$SK" METRIC="$METRIC_SK" BREAK=1 walk badge
restore "$INSTPAGE"; sleep 3
TENANT_INST="$SK" METRIC="$METRIC_SK" walk badge

step "9. Every sealed run as it was; hashes"
[ "$(runs_md5)" = "$RUNS0" ] && ok "every one of the copy's $N_RUNS0 sealed runs byte-identical at the end: nothing re-ran, nothing changed" || bad "a sealed run changed"
H1F="$(HASHES)"; printf '%s' "$H1F" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "check_run_hashes, all (the copy's and the new): $H1F" || bad "hashes: $H1F"
[ "$(trig)" = "227" ] && ok "227 triggers at the end" || bad "triggers: $(trig)"

echo
echo "==> $PASS passed, $FAIL failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
