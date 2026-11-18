#!/usr/bin/env bash
#
# S2 (3.1; LVRF_PLAN §21, approved by Brad 18 Nov 2026 with D1–D10 as recommended and §21.0's conditions) — research
# with Claude. Local verification, Gate A.
#
#   ./scripts/verify_s2_ai_research.sh [screenshot_dir]
#
# NO REAL MODEL IS CALLED (Brad, 18 Nov 2026). The research process (dist/research-sidecar.mjs) talks to a local stand-in
# (scripts/lib/fakeAnthropic.mjs) through ANTHROPIC_BASE_URL, with a placeholder key; outside production the process
# refuses to start with a key and no stand-in, so nothing here can reach Anthropic.
#
# Clones `lvrf_prodcopy` (the 14 Nov copy) to `lvrf_verifys2`, migrated (0051) and hardened (section 36), dropped on exit
# (KEEP_DB=1 keeps it). Fixtures through the routes (L39). The steward's acts through the page, by session (clear, send,
# import, withdraw). Every break (§21.7, S2-1 to S2-16) with its positive control; every file a break edits is restored
# byte-identical.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
for f in .env .env.migrate client/.env; do
  [ -f "$f" ] && grep -q '^ANTHROPIC_API_KEY=' "$f" && { echo "REFUSING: $f holds ANTHROPIC_API_KEY; no key belongs on this Mac (S2, D2)"; exit 1; }
done
[ -z "${ANTHROPIC_API_KEY:-}" ] || { echo "REFUSING: ANTHROPIC_API_KEY is set in this shell; no key belongs on this Mac (S2, D2)"; exit 1; }
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifys2
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
RESEARCH_URL="postgresql://lvrf_research@localhost:5432/${VERIFY_DB}"   # the research process's own role (peer on the box)
PORT=3321; VITE_PORT=5321; CDP_PORT=9421; FAKE_PORT=3329
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_s2.XXXXXX")"
SOCKDIR="$(mktemp -d /tmp/lvrfs2.XXXXXX)"; SOCK="$SOCKDIR/r.sock"   # a unix socket path must stay under 104 characters
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
TS="$(date +%s)"
MARK="s2verify$TS"
PLACEHOLDER="sk-ant-PLACEHOLDER-s2-gate-a-$TS-0000000000000000"
SIDECAR_SRC=server/research/sidecar/main.ts; AIR=server/research/aiResearch.ts; COMPOSE=server/routes/accountResearch.ts
EDITED=("$SIDECAR_SRC" "$AIR" "$COMPOSE")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
by_port() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }
stop_port() { local p; p="$(by_port "$1")"; [ -n "$p" ] && kill $p 2>/dev/null || true; for _ in $(seq 1 20); do [ -z "$(by_port "$1")" ] && return 0; sleep 0.25; done; }
stop_sidecar() { pkill -f "research-sidecar.mjs $MARK" 2>/dev/null || true; for _ in $(seq 1 20); do pgrep -f "research-sidecar.mjs $MARK" > /dev/null || return 0; sleep 0.25; done; }
cleanup() {
  stop_port "$PORT"; stop_port "$VITE_PORT"; stop_port "$FAKE_PORT"; stop_sidecar
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "${EDITED[@]}"; do
    cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; npm run -s build:research > /dev/null 2>&1 || true; }
  done
  sleep 1; [ -n "${KEEP_DB:-}" ] || dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT

q() { psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1"; }
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
runs_md5() { q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE id IN (SELECT unnest(string_to_array('$RUN_IDS0', ','))::uuid)"; }
AS="${AS:-}"
req() {  # METHOD PATH [BODY] — by the actor header ($AS, default the steward); status in $CODE, body in $W/r.json
  local who="${AS:-$S}"
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: $who" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "origin: http://localhost:$VITE_PORT" -H "x-actor-person-id: $who" -d "$3" "$BASE$2")"; fi
  cp "$W/r.json" "$W/resp.$(date +%s%N).json" 2>/dev/null || true
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING]
  req "$1" "$2" "$3"
  local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 500)"; fi
}
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
fake_next() { curl -s -o /dev/null -X POST "http://127.0.0.1:$FAKE_PORT/__next" -d "$1"; }
fake_count() { curl -s "http://127.0.0.1:$FAKE_PORT/__count" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).count))'; }
fake_last() { tail -1 "$W/fake.log"; }
start_fake() { stop_port "$FAKE_PORT"; (node scripts/lib/fakeAnthropic.mjs "$FAKE_PORT" "$W/fake.log" > "$W/fake.out" 2>&1 < /dev/null &); for _ in $(seq 1 40); do curl -s -o /dev/null "http://127.0.0.1:$FAKE_PORT/__count" && return 0; sleep 0.25; done; bad "the stand-in did not start"; exit 1; }
start_sidecar() {  # [ENV=VALUE ...] — with the placeholder key and the stand-in unless overridden
  stop_sidecar
  (env LVRF_RESEARCH_SOCKET="$SOCK" ANTHROPIC_API_KEY="$PLACEHOLDER" ANTHROPIC_BASE_URL="http://127.0.0.1:$FAKE_PORT" LVRF_RESEARCH_TIMEOUT_MS=6000 \
    LVRF_RESEARCH_DATABASE_URL="$RESEARCH_URL" LVRF_RESEARCH_MONTHLY_USD=500 LVRF_RESEARCH_DAILY_LIMIT=50 "$@" \
    node dist/research-sidecar.mjs "$MARK" >> "$W/sidecar.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 40); do [ -S "$SOCK" ] && curl -s -o /dev/null --unix-socket "$SOCK" http://x/status && return 0; sleep 0.25; done
}
start_server() {  # [ENV=VALUE ...]
  stop_port "$PORT"
  (env LVRF_RESEARCH_SOCKET="$SOCK" LVRF_RESEARCH_TIMEOUT_MS=6000 \
    LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" "$@" \
    npx tsx server/index.ts >> "$W/server.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start: $(tail -5 "$W/server.log")"; exit 1
}
wait_call() {  # CALL_ID — until it is no longer running; prints the state
  local st=""
  for _ in $(seq 1 80); do req GET "/api/research-ai/calls/$1"; st="$(rj b.state)"; [ "$st" != running ] && break; sleep 0.5; done
  echo "$st"
}
walk() { SHOTS="$SHOTS" VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" DB="$VERIFY_DB" S_EMAIL="$S_EMAIL" PW="$PW" INST="$INST" node scripts/lib/s2_walk.mjs "$@" > "$W/walk.out" 2>&1 || true
  cat "$W/walk.out"; PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.out" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.out" || true))); }
newprompt_ind() { req POST "/api/industries/$IND/research-prompts" '{}'; rj b.prompt_id; }
newprompt_inst() { req POST "/api/institutions/$INST/research-prompts" '{}'; rj b.prompt_id; }
measure() {  # PROMPT_ID [AI_SOURCED] — a valid one-measure pack answer for that prompt
  node -e "const m={name:'Stand-in measure '+process.argv[1].slice(0,8),unit:'%',direction:'increase',definition:'A stand-in definition precise enough to compute.',why_it_pays:'A stand-in mechanism.',confounders:'Stand-in confounders.',citation:'Stand-in citation, page 1.',addressable_by_workforce_capability:{value:true,why:'Stand-in reasoning.'},caveats:[]};
  console.log(JSON.stringify({prompt_id:process.argv[1],industry:'manufacturing',research_query:'q',query_as_executed:'q',research_tool:'the model says it is something else',ai_sourced:process.argv[2]!=='false',measures:[m],measures_tested_and_excluded_as_unaddressable:[]}))" "$1" "${2:-true}"
}
answer() { node -e "console.log(JSON.stringify({mode:process.argv[1],text:process.argv[2]??undefined,delay_ms:process.argv[3]?Number(process.argv[3]):undefined}))" "$@"; }
call_on() {  # PROMPT_ID — POST the call; CALL is its id when 202
  req POST "/api/research-ai/prompts/$1/calls" '{}'; CALL=""; [ "$CODE" = 202 ] && CALL="$(rj b.call_id)"; true
}
refusals_n() { q "SELECT count(*) FROM refusals WHERE endpoint LIKE '%research-ai%'"; }
calls_n() { q "SELECT count(*) FROM research_calls"; }

step "1. Typecheck, build, and the module boundary"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"
npm run -s build:research && [ -s dist/research-sidecar.mjs ] && ok "the research process bundles to one file (dist/research-sidecar.mjs)" || { bad "build:research"; exit 1; }
SDKFILES="$(grep -rl --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' "@anthropic-ai/sdk" server client/src scripts | grep -v '^scripts/verify_s2_ai_research.sh$' | sort || true)"
[ "$SDKFILES" = "$SIDECAR_SRC" ] && ok "S2-16 control: only $SIDECAR_SRC imports @anthropic-ai/sdk" || bad "S2-16: SDK importers: $SDKFILES"
edit "$AIR" "import { createHash } from 'node:crypto';" "import { createHash } from 'node:crypto';
import '@anthropic-ai/sdk';"
SDKFILES="$(grep -rl --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' "@anthropic-ai/sdk" server client/src scripts | grep -v '^scripts/verify_s2_ai_research.sh$' | sort || true)"
[ "$SDKFILES" != "$SIDECAR_SRC" ] && ok "S2-16 break: a second file importing the SDK is caught ($(echo $SDKFILES | tr '\n' ' '))" || bad "S2-16 break not caught"
restore "$AIR"
[ "$(grep -c '"@anthropic-ai/sdk": "1.6.0"' package.json)" = "1" ] && ok "D8: the SDK pinned to exactly 1.6.0" || bad "D8: the SDK pin"

step "2. Clone the 14 Nov copy; migrate (0051); harden (section 36)"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUN_IDS0="$(q "SELECT string_agg(id::text, ',' ORDER BY id) FROM value_runs")"
N_RUNS0="$(q "SELECT count(*) FROM value_runs")"
RUNS0="$(runs_md5)"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated: 0051_s2_ai_research" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "226" ] && ok "226 triggers by pg_trigger (S2 section 36: +16)" || bad "triggers: $(trig)"
for t in research_clearances_guard research_clearances_immutable research_clearances_audit research_clearances_no_delete research_clearances_act_present \
         research_calls_guard research_calls_immutable research_calls_audit research_calls_no_delete research_imports_call_matches \
         research_call_claims_guard research_call_claims_immutable research_call_claims_audit research_call_claims_no_delete \
         research_process_refusals_immutable research_process_refusals_no_delete; do
  [ "$(q "SELECT count(*) FROM hardening_manifest WHERE trigger_name = '$t'")" = "1" ] || bad "  ...$t not in the manifest"
done; ok "  ...the sixteen new triggers, each in the hardening manifest"
[ "$(runs_md5)" = "$RUNS0" ] && ok "every one of the $N_RUNS0 sealed runs byte-identical after 0051 and section 36" || bad "a sealed run changed"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 52 migrations, newest 0051_s2_ai_research" && ok "drift: $DRIFT" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^149 CHECKs in the database: 149 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN (S2: +18)" || bad "plain: $PLAIN"
OWN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_ownership.ts 2>&1 | tail -1)"
printf '%s' "$OWN" | grep -q "lvrf_app owns nothing" && ok "ownership: $OWN" || bad "ownership: $OWN"
HASHES() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1; }
H0="$(HASHES)"; printf '%s' "$H0" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "check_run_hashes, all: $H0" || bad "hashes: $H0"
# S2-10: insert-only at the role.
for t in research_clearances research_calls research_call_claims research_process_refusals; do
  for op in "UPDATE $t SET id = id" "DELETE FROM $t" "TRUNCATE $t"; do
    OUT="$(psql -X -At "$VERIFY_URL" -c "$op" 2>&1 || true)"
    printf '%s' "$OUT" | grep -q "permission denied" || bad "S2-10: lvrf_app: $op -> $OUT"
  done
done; ok "S2-10: UPDATE, DELETE and TRUNCATE on research_clearances, research_calls, research_call_claims and research_process_refusals refused as lvrf_app (permission denied)"
for t in research_calls research_call_claims research_process_refusals research_clearances; do
  for op in "UPDATE $t SET id = id" "DELETE FROM $t" "TRUNCATE $t"; do
    OUT="$(psql -X -At "$RESEARCH_URL" -c "$op" 2>&1 || true)"
    printf '%s' "$OUT" | grep -q "permission denied" || bad "S2-10: lvrf_research: $op -> $OUT"
  done
done; ok "  ...and as lvrf_research, the research process's role"
[ "$(psql -X -At "$VERIFY_URL" -c "SELECT has_table_privilege('lvrf_app','research_call_claims','INSERT') OR has_table_privilege('lvrf_app','research_process_refusals','INSERT')")" = "f" ] \
  && ok "  ...lvrf_app cannot claim a call or write a process refusal: only the research process can" || bad "  ...lvrf_app privileges on the process's tables"
[ "$(psql -X -At "$RESEARCH_URL" -c "SELECT has_table_privilege('research_calls','INSERT') AND has_table_privilege('research_call_claims','INSERT') AND has_table_privilege('research_process_refusals','INSERT') AND NOT has_table_privilege('governance_acts','INSERT') AND NOT has_table_privilege('refusals','INSERT') AND NOT has_table_privilege('research_prompts','INSERT') AND NOT has_table_privilege('evidence','SELECT') AND NOT has_table_privilege('persons','SELECT')")" = "t" ] \
  && ok "  ...lvrf_research: INSERT on its three tables only; no acts, no refusals, no prompts, and it cannot read evidence or persons" || bad "  ...lvrf_research privileges"
q "GRANT UPDATE ON research_calls TO lvrf_research" > /dev/null
OWNB="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_ownership.ts 2>&1 | tail -3 | tr '\n' ' ' || true)"
printf '%s' "$OWNB" | grep -q "lvrf_research holds UPDATE on public.research_calls" && ok "  ...break: lvrf_research given UPDATE on research_calls is named by the ownership check (deploy step 5d)" || bad "  ...ownership break: $OWNB"
q "REVOKE UPDATE ON research_calls FROM lvrf_research" > /dev/null
printf '%s' "$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_ownership.ts 2>&1 | tail -1)" | grep -q "lvrf_app owns nothing" && ok "  ...control: revoked, the check is clean" || bad "  ...ownership control"
[ "$(psql -X -At "$VERIFY_URL" -c "SELECT has_table_privilege('lvrf_app','research_calls','INSERT') AND has_table_privilege('lvrf_app','research_clearances','INSERT') AND NOT has_table_privilege('lvrf_app','research_calls','UPDATE') AND NOT has_table_privilege('lvrf_app','research_clearances','UPDATE')")" = "t" ] \
  && ok "  ...control: lvrf_app holds INSERT and SELECT on both, and no UPDATE" || bad "  ...privileges"
# S2-14: every new CHECK refuses its NULL case (triggers off, so the CHECK alone answers).
S="$(q "SELECT steward_person_id FROM tenants WHERE steward_person_id IS NOT NULL LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
nullcase() {  # LABEL CONSTRAINT SQL
  local out; out="$(printf "BEGIN;\nSET LOCAL session_replication_role = replica;\n%s;\nROLLBACK;\n" "$3" | psql -X -q -At -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -q "violates check constraint \"$2\"" && ok "S2-14: $1 -> refused by $2" || bad "S2-14: $1 -> $(printf '%s' "$out" | head -c 200)"
}
PR="$(q "SELECT id FROM research_prompts ORDER BY generated_at LIMIT 1")"; PRSHA="$(q "SELECT prompt_sha256 FROM research_prompts WHERE id = '$PR'")"
CLR="INSERT INTO research_clearances (tenant_id, kind, institution_id, industry_id, model, retention_class, disclosure_text, disclosure_sha256, withdraws_clearance_id, reason, person_id)"
nullcase "a clearance naming no subject" research_clearances_one_subject "$CLR VALUES ('$TEN', 'clearance', NULL, NULL, 'claude-opus-5-5', 'standard', repeat('d', 120), encode(sha256(convert_to(repeat('d', 120), 'UTF8')), 'hex'), NULL, 'A reason long enough.', '$S')"
nullcase "a clearance with no disclosure" research_clearances_disclosure_kept "$CLR VALUES ('$TEN', 'clearance', NULL, (SELECT id FROM industries LIMIT 1), 'claude-opus-5-5', 'standard', NULL, NULL, NULL, 'A reason long enough.', '$S')"
nullcase "a clearance with a disclosure and no SHA-256" research_clearances_disclosure_kept "$CLR VALUES ('$TEN', 'clearance', NULL, (SELECT id FROM industries LIMIT 1), 'claude-opus-5-5', 'standard', repeat('d', 120), NULL, NULL, 'A reason long enough.', '$S')"
nullcase "a withdrawal naming no clearance" research_clearances_withdrawal_names "$CLR VALUES ('$TEN', 'withdrawal', NULL, (SELECT id FROM industries LIMIT 1), 'claude-opus-5-5', 'standard', NULL, NULL, NULL, 'A reason long enough.', '$S')"
CALLS="INSERT INTO research_calls (tenant_id, kind, prompt_id, prompt_sha256, sent_call_id, clearance_id, model, retention_class, settings, outcome, answer_text, answer_sha256, error_type, cost_usd, person_id)"
nullcase "a sent call naming no clearance" research_calls_sent_complete "$CALLS VALUES ('$TEN', 'sent', '$PR', '$PRSHA', NULL, NULL, 'claude-opus-5-5', 'standard', '{}'::jsonb, NULL, NULL, NULL, NULL, NULL, '$S')"
nullcase "a sent call with no settings" research_calls_sent_complete "$CALLS VALUES ('$TEN', 'sent', '$PR', '$PRSHA', NULL, gen_random_uuid(), 'claude-opus-5-5', 'standard', NULL, NULL, NULL, NULL, NULL, NULL, '$S')"
nullcase "a result with no outcome" research_calls_result_complete "$CALLS VALUES ('$TEN', 'result', '$PR', '$PRSHA', gen_random_uuid(), NULL, 'claude-opus-5-5', 'standard', NULL, NULL, NULL, NULL, NULL, 0, '$S')"
nullcase "a result with no cost" research_calls_result_complete "$CALLS VALUES ('$TEN', 'result', '$PR', '$PRSHA', gen_random_uuid(), NULL, 'claude-opus-5-5', 'standard', NULL, 'refused', NULL, NULL, NULL, NULL, '$S')"
nullcase "an answered result with no answer" research_calls_answer_kept "$CALLS VALUES ('$TEN', 'result', '$PR', '$PRSHA', gen_random_uuid(), NULL, 'claude-opus-5-5', 'standard', NULL, 'answered', NULL, NULL, NULL, 0, '$S')"
nullcase "an answer with no SHA-256" research_calls_answer_kept "$CALLS VALUES ('$TEN', 'result', '$PR', '$PRSHA', gen_random_uuid(), NULL, 'claude-opus-5-5', 'standard', NULL, 'answered', 'x', NULL, NULL, 0, '$S')"
nullcase "a failed result naming no error" research_calls_error_named "$CALLS VALUES ('$TEN', 'result', '$PR', '$PRSHA', gen_random_uuid(), NULL, 'claude-opus-5-5', 'standard', NULL, 'failed', NULL, NULL, NULL, 0, '$S')"
nullcase "a call with a malformed prompt SHA-256" research_calls_prompt_sha256_shape "$CALLS VALUES ('$TEN', 'sent', '$PR', 'x', NULL, gen_random_uuid(), 'claude-opus-5-5', 'standard', '{}'::jsonb, NULL, NULL, NULL, NULL, NULL, '$S')"
nullcase "a result whose cost is negative" research_calls_result_complete "$CALLS VALUES ('$TEN', 'result', '$PR', '$PRSHA', gen_random_uuid(), NULL, 'claude-opus-5-5', 'standard', NULL, 'refused', NULL, NULL, NULL, -0.01, '$S')"
nullcase "a process refusal with an unknown code" research_process_refusals_code_known "INSERT INTO research_process_refusals (code, reason, payload) VALUES ('x', 'A reason long enough.', '{}'::jsonb)"
nullcase "a process refusal whose payload is not an object" research_process_refusals_payload_object "INSERT INTO research_process_refusals (code, reason, payload) VALUES ('not_sent', 'A reason long enough.', '[]'::jsonb)"
nullcase "a process refusal with a short reason" research_process_refusals_reason_stated "INSERT INTO research_process_refusals (code, reason, payload) VALUES ('not_sent', 'short', '{}'::jsonb)"
nullcase "a call to a model kept by an unknown class" research_calls_retention_known "$CALLS VALUES ('$TEN', 'sent', '$PR', '$PRSHA', NULL, gen_random_uuid(), 'claude-opus-5-5', 'forever', '{}'::jsonb, NULL, NULL, NULL, NULL, NULL, '$S')"
# Zero is data: a cost of 0 is accepted by its CHECK (with the triggers off, as above).
OUT="$(printf "BEGIN;\nSET LOCAL session_replication_role = replica;\n%s;\nSELECT 'LANDED';\nROLLBACK;\n" "$CALLS VALUES ('$TEN', 'result', '$PR', '$PRSHA', gen_random_uuid(), NULL, 'claude-opus-5-5', 'standard', NULL, 'refused', NULL, NULL, NULL, 0, '$S')" | psql -X -q -At -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -q LANDED && ok "  ...control: a refused result costing 0 lands (zero is data)" || bad "  ...a zero cost: $OUT"

step "3. Fixtures and servers"
S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (S2 verification)', 'x.$TS@s2.example') RETURNING id" | head -1)"
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'S2 verification fixture grant')" > /dev/null
ok "the steward ($S_NAME) signs in with a fixture password; an authorized non-steward X"
IND="$(q "SELECT id FROM industries WHERE slug = 'manufacturing' AND tenant_id = '$TEN'")"
TEN_X="$(q "INSERT INTO tenants (name) VALUES ('Other tenant (S2 $TS)') RETURNING id" | head -1)"
INST_X="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TEN_X', 'Other tenant account (S2 $TS)') RETURNING id" | head -1)"
start_fake && ok "the stand-in for Anthropic's API on 127.0.0.1:$FAKE_PORT (no real model is called)"
start_server && ok "API up on $PORT (no research process yet)"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Verification Research Co $TS\",\"website\":\"https://example.com/s2-$TS\"}}" 201 "a fictional account, through the route"
INST="$(rj b.institution_id)"; INST_NAME="Verification Research Co $TS"
P_E1="$(newprompt_inst)"; [ -n "$P_E1" ] && ok "its entity-phase prompt ${P_E1:0:8}" || bad "no prompt"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1 < /dev/null &)
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
ok "vite on $VITE_PORT, headless Chrome on $CDP_PORT"
T0="$(q "SELECT now()")"

step "4. Off, four ways: nothing sent (S2-5 and its siblings)"
R0="$(refusals_n)"
expect POST "/api/research-ai/prompts/$P_E1/calls" '{}' 503 "no research process: refused" "Research with Claude is not set up on this server; copy the prompt and run it yourself."
req GET /api/health; [ "$(rj b.ai_research)" = "absent" ] && ok "  ...health reads ai_research \"absent\"" || bad "  ...health: $(cat "$W/r.json")"
WHY="Research with Claude is not set up on this server; copy the prompt and run it yourself." walk off
start_sidecar ANTHROPIC_API_KEY= ANTHROPIC_BASE_URL=
grep -q '\[ai-research\] off: no key' "$W/sidecar.log" && ok "S2-5: the research process starts without a key: \"[ai-research] off: no key\"" || bad "S2-5: $(tail -2 "$W/sidecar.log")"
expect POST "/api/research-ai/prompts/$P_E1/calls" '{}' 503 "S2-5 break: the key absent: refused" "(no key)"
req GET /api/health; [ "$(rj b.ai_research)" = "off" ] && ok "  ...health reads ai_research \"off\"" || bad "  ...health: $(cat "$W/r.json")"
start_sidecar
start_server LVRF_AI_RESEARCH=off
expect POST "/api/research-ai/prompts/$P_E1/calls" '{}' 503 "switched off (LVRF_AI_RESEARCH=off): refused" "switched off on this server"
start_server; start_sidecar LVRF_RESEARCH_MONTHLY_USD=
expect POST "/api/research-ai/prompts/$P_E1/calls" '{}' 503 "no monthly limit set: refused" "The research process has no monthly spend limit set"
[ "$(fake_count)" = "0" ] && [ "$(calls_n)" = "0" ] && ok "  ...the stand-in received 0 requests, and no research_calls row exists" || bad "  ...requests $(fake_count), calls $(calls_n)"
[ "$(( $(refusals_n) - R0 ))" = "4" ] && ok "  ...each refusal recorded (4, source route)" || bad "  ...refusals: $(( $(refusals_n) - R0 ))"
start_sidecar; start_server
req GET /api/health; [ "$(rj b.ai_research)" = "on" ] && ok "S2-5 control: with the placeholder key and a limit, health reads ai_research \"on\"" || bad "  ...health: $(cat "$W/r.json")"

step "5. Clearing the account (the steward's), and calls before it (S2-2, S2-13, S2-15)"
expect POST "/api/research-ai/prompts/$P_E1/calls" '{}' 403 "S2-2 break: the account not cleared: refused" "is not cleared for research with Claude Opus 5.5"
[ "$(fake_count)" = "0" ] && [ "$(calls_n)" = "0" ] && ok "  ...0 requests, no sent row" || bad "  ...requests $(fake_count)"
req GET "/api/research-ai/subjects/institution/$INST"; DISC="$(rj b.disclosure.text)"; DSHA="$(rj b.disclosure.sha256)"
WANT="$(N="$INST_NAME" npx tsx -e "import {createHash} from 'node:crypto'; import {MODELS,disclosureText} from './server/research/aiSettings.ts'; process.stdout.write(createHash('sha256').update(disclosureText(MODELS['claude-opus-5-5'],'account',process.env.N),'utf8').digest('hex'))" 2>/dev/null | tail -c 64)"
[ "$DSHA" = "$WANT" ] && [ "$DSHA" = "$(printf '%s' "$DISC" | shasum -a 256 | cut -d' ' -f1)" ] \
  && ok "the disclosure offered is §21.4's text for Opus 5.5, with the account's name (SHA-256 ${DSHA:0:12}…, the text's own)" || bad "the disclosure: offered $DSHA, code $WANT"
printf '%s' "$DISC" | grep -qF "deleted from Anthropic's systems within 30 days" && ok "  ...it states 30 days (Brad's ruling, the longer reading)" || bad "  ...30 days"
REASON="The client's agreement of 1 Nov 2026 allows research of what it publishes (verification fixture)."
AS="$X" expect POST "/api/research-ai/institutions/$INST/clearances" "{\"reason\":\"$REASON\",\"disclosure_sha256\":\"$DSHA\"}" 403 "a non-steward clearing: refused (the steward's act)" "is the steward's act"
expect POST "/api/research-ai/institutions/$INST/clearances" "{\"reason\":\"$INST_NAME\",\"disclosure_sha256\":\"$DSHA\"}" 422 "S2-13 break: the reason is the account's name: refused" "The reason is the account's name"
expect POST "/api/research-ai/institutions/$INST/clearances" "{\"reason\":\"$REASON\",\"disclosure_sha256\":\"$(printf '0%.0s' $(seq 1 64))\"}" 409 "a disclosure other than the one shown: refused" "reload the page and read it again"
expect POST "/api/research-ai/institutions/$INST/clearances" "{\"reason\":\"$REASON\",\"disclosure_sha256\":\"$DSHA\",\"extra\":1}" 400 "an unknown field: refused" "body.extra is not a field"
OUT="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "$S" "$CLR VALUES ('$TEN', 'clearance', '$INST', NULL, 'claude-opus-5-5', 'standard', \$d\$$DISC\$d\$, '$DSHA', NULL, '$INST_NAME', '$S')" | psql -X -q -At -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -q "the reason is the subject's name" && ok "  ...the database's half: a clearance whose reason is the subject's name, by SQL, refused (research_clearances_guard)" || bad "  ...guard: $OUT"
expect GET "/api/research-ai/subjects/institution/$INST_X" "" 404 "S2-15: another tenant's account: not found"
expect POST "/api/research-ai/institutions/$INST_X/clearances" "{\"reason\":\"$REASON\",\"disclosure_sha256\":\"$DSHA\"}" 404 "  ...clearing it: not found"
expect POST "/api/research-ai/prompts/00000000-0000-4000-8000-000000000000/calls" '{}' 404 "  ...an unknown prompt: not found"
REASON="$REASON" DISC="$DISC" walk clear
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'clear' AND subject_table = 'research_clearances' AND actor_person_id = '$S' AND at > '$T0'")" = "1" ] && ok "  ...one 'clear' act, the steward's" || bad "  ...clear acts"
expect POST "/api/research-ai/institutions/$INST/clearances" "{\"reason\":\"$REASON again\",\"disclosure_sha256\":\"$DSHA\"}" 409 "clearing it again: refused" "already cleared for Claude Opus 5.5"

step "6. The call, through the page; its rows; the request exactly the prompt (S2-8, S2-9, S2-11)"
ENTITY='{"legal_name":"Verification Research Co Inc.","identifier_type":"sec_cik","identifier":"0000654321","registry_jurisdiction":null,"source_kind":"public_filing","citation":"EDGAR company record, CIK 0000654321 (fixture, not a source)","caveats":[],"quote":"Verification fixture sentence naming it, not a source.","how_read":"Verification fixture: read from the fixture sentence as written."}'
REGIME='{"value":"public_filer","basis":"Files a 10-K with the SEC.","as_of":"2024-09-30","source_kind":"public_filing","citation":"EDGAR filing index (fixture)","caveats":[],"quote":"Verification fixture sentence naming it, not a source.","how_read":"Verification fixture: read from the fixture sentence as written."}'
ENV_E="$(printf '{"prompt_id":"%s","institution":"%s","research_query":"q","query_as_executed":"qe","research_tool":"the model says otherwise","ai_sourced":true,"entity":%s,"disclosure_regime":%s,"facts":[],"not_found":[]}' "$P_E1" "$INST_NAME" "$ENTITY" "$REGIME")"
fake_next "$(answer answer "$ENV_E")"
walk send
C1="$(q "SELECT id FROM research_calls WHERE prompt_id = '$P_E1' AND kind = 'sent'")"
[ "$(q "SELECT (s.at < r.at)::text || '|' || r.outcome || '|' || (r.answer_sha256 = encode(sha256(convert_to('$(printf '%s' "$ENV_E" | sed "s/'/''/g")', 'UTF8')), 'hex'))::text || '|' || r.cost_usd || '|' || (s.person_id = '$S')::text FROM research_calls s JOIN research_calls r ON r.sent_call_id = s.id WHERE s.id = '$C1'")" = "true|answered|true|0.7300|true" ] \
  && ok "S2-9 control: the sent row before the result; answered; the answer kept byte for byte; cost \$0.73 (120,000 in at \$4, 9,000 out at \$20, 7 searches at \$0.01); the steward's" \
  || bad "S2-9: $(q "SELECT kind, outcome, cost_usd FROM research_calls WHERE prompt_id = '$P_E1' ORDER BY at")"
node -e "
const l=JSON.parse(require('fs').readFileSync('$W/fake.log','utf8').trim().split('\n').pop());
const keys=Object.keys(l.body).sort().join(',');
const sha=require('crypto').createHash('sha256').update(l.body.messages[0].content,'utf8').digest('hex');
console.log([keys, l.body.messages.length, l.body.messages[0].role, sha, l.body.model, JSON.stringify(l.body.output_config), JSON.stringify(l.body.tools), l.headers.authorization===('Bearer '+process.argv[1]), 'system' in l.body, 'metadata' in l.body, 'fallbacks' in l.body].join('|'))" "$PLACEHOLDER" > "$W/req1.txt"
IFS='|' read -r K1 NM ROLE SHA1 MODEL OC TOOLS AUTH SYS META FB < "$W/req1.txt"
[ "$K1|$NM|$ROLE|$SYS|$META|$FB" = "max_tokens,messages,model,output_config,stream,tools|1|user|false|false|false" ] && ok "S2-8: the request carries model, max_tokens, output_config, one user turn, tools and stream, and nothing else (no system prompt, no metadata, no fallbacks)" || bad "S2-8: keys $K1 $NM $ROLE $SYS $META $FB"
[ "$SHA1" = "$(q "SELECT prompt_sha256 FROM research_prompts WHERE id = '$P_E1'")" ] && ok "  ...its user turn is the stored prompt byte for byte (SHA-256 $SHA1)" || bad "  ...the user turn's SHA-256 $SHA1"
[ "$MODEL|$OC" = 'claude-opus-5-5|{"effort":"high"}' ] && ok "  ...to claude-opus-5-5 at effort high (D1, D10)" || bad "  ...model $MODEL $OC"
[ "$TOOLS" = '[{"type":"web_search_20260209","name":"web_search","max_uses":10,"blocked_domains":["lvrf-rule76.com"]},{"type":"web_fetch_20260209","name":"web_fetch","max_uses":6,"max_content_tokens":20000,"blocked_domains":["lvrf-rule76.com"]}]' ] && ok "  ...web search (10) and web fetch (6 of 20,000 tokens), lvrf-rule76.com blocked" || bad "  ...tools $TOOLS"
[ "$AUTH" = "true" ] && ok "S2-6 control: the stand-in saw the placeholder key in the authorization header (the SDK sends it as a Bearer token)" || bad "S2-6 control: the key header"
[ "$(fake_count)" = "1" ] && ok "  ...exactly one request reached the stand-in" || bad "  ...requests: $(fake_count)"
expect POST "/api/research-ai/prompts/$P_E1/calls" '{}' 409 "S2-11 break: a second call for the same prompt: refused" "was already sent"
[ "$(fake_count)" = "1" ] && ok "  ...nothing more sent" || bad "  ...requests: $(fake_count)"
walk import
IMP="$(q "SELECT id FROM research_imports WHERE call_id = (SELECT id FROM research_calls WHERE sent_call_id = '$C1')")"
[ -n "$IMP" ] && [ "$(q "SELECT count(*) || '|' || bool_and(r.research_tool = 'Claude Opus 5.5 (claude-opus-5-5) via the Claude API, with web search and web fetch, call ${C1:0:8}') || '|' || bool_and((r.raw_response->>'ai_sourced')::boolean) || '|' || bool_and(r.parsed_by_person_id = '$S') FROM research_results r WHERE r.import_id = '$IMP'")" = "2|true|true|true" ] \
  && ok "the import names the call; its 2 results record the research tool as the server states it, ai_sourced, parsed by the steward" || bad "the import: $(q "SELECT research_tool FROM research_results WHERE import_id = '$IMP'")"
R1="$(q "SELECT id FROM research_calls WHERE sent_call_id = '$C1'")"
expect POST "/api/institutions/$INST/research-results" "{\"call_id\":\"$R1\"}" 422 "importing the same answer again: refused" "is already imported"
OUT="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\nINSERT INTO research_imports (tenant_id, prompt_id, raw_text, raw_sha256, byte_length, imported_by_person_id, call_id) VALUES ('%s', '%s', 'x', encode(sha256(convert_to('x','UTF8')),'hex'), 1, '%s', '%s');\nROLLBACK;\n" "$S" "$TEN" "$P_E1" "$S" "$R1" | psql -X -q -At -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -q "research_imports_call_matches\|exactly that call's answer" && ok "  ...the database's half: an import naming the call with other text, by SQL, refused (research_imports_call_matches)" || bad "  ...$OUT"
for id in $(q "SELECT id FROM research_results WHERE import_id = '$IMP' ORDER BY field_name DESC"); do  # the entity before the regime
  req POST "/api/account-research-results/$id/accept" '{"review_note":"Verification: the CIK matches the fixture.","citation_opened":true}'
done
[ "$(q "SELECT count(*) FROM research_results WHERE import_id = '$IMP' AND review_state = 'accepted'")" = "2" ] && ok "review unchanged: a person accepts the entity and the regime, each with its citation opened" || bad "accepts: $(cat "$W/r.json")"
[ "$(q "SELECT bool_and(e.ai_sourced AND e.citation_resolved AND e.citation_resolved_by_person_id = '$S') FROM institution_entities n JOIN evidence e ON e.id = n.evidence_id WHERE n.institution_id = '$INST'")" = "t" ] && ok "  ...the entity's evidence is AI-sourced, its citation opened by the person who accepted it" || bad "  ...entity evidence"

step "7. D5 as ruled: a row not outside-in is left out (S2-1); a call refused only if one is still in the prompt (S2-1b, S2-1c)"
expect POST "/api/institutions/$INST/facts" '{"kind":"headcount","value_numeric":98765,"unit":"people","as_of":"2025-12-31","evidence_kind":"system_export","provenance":"The account'"'"'s HR export, shared by its sponsor (fixture)","source_reference":"HR export 2025-12 (fixture)","confidence":"medium","evidence_form":"quote","quote_text":"Headcount 98,765 (fixture export row).","how_read":"Verification fixture: read the export row as written."}' 201 "a fact resting on the account's own export (system_export)"
FCUST="$(rj b.fact_id)"
req GET "/api/research-ai/subjects/institution/$INST"
[ "$(rj "b.left_out_rows.map(r=>r.what+' '+r.label+' '+r.id+' '+r.why).join('|')")|$(rj b.customer_side_rows.length)" = "fact headcount $FCUST is system export evidence, the account's own record|0" ] \
  && ok "S2-1: the subject's view lists it as left out (its short id and why), and nothing the prompt carries fails" || bad "S2-1 view: $(rj 'JSON.stringify([b.left_out_rows,b.customer_side_rows])')"
P_F1="$(newprompt_inst)"; q "SELECT prompt_text FROM research_prompts WHERE id = '$P_F1'" > "$W/pf1.txt"
grep -qF "LEFT OUT (1): rows on record that do not rest on a published source" "$W/pf1.txt" && grep -qx -- "- headcount" "$W/pf1.txt" && ! grep -qF "98765" "$W/pf1.txt" \
  && ok "  ...the prompt names the kind left out and carries none of its value (98765 is not in the text)" || bad "  ...prompt text: $(grep -n 'LEFT OUT\|98765\|headcount' "$W/pf1.txt" | head -5)"
ROW="fact headcount (${FCUST:0:8}): is system export evidence" walk leftout
ENV_F="$(printf '{"prompt_id":"%s","institution":"%s","research_query":"q","query_as_executed":"qe","research_tool":"x","ai_sourced":true,"entity":%s,"facts":[],"not_found":[{"kind":"revenue","reason":"Not found in the fixture sources."}]}' "$P_F1" "$INST_NAME" "$ENTITY")"
fake_next "$(answer answer "$ENV_F")"
call_on "$P_F1"; [ "$CODE" = 202 ] && [ "$(wait_call "$CALL")" = answered ] && ok "S2-1 control: the call is sent with that row left out" || bad "S2-1: $CODE $(said)"
fake_last | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s).body.messages[0].content;process.exit(!c.includes("98765")&&c.includes("LEFT OUT (1)")?0:1)})' \
  && ok "  ...what reached the stand-in holds no part of the left-out row" || bad "  ...the left-out row reached the stand-in"
req GET "/api/research-ai/calls/$CALL"; RF1="$(rj b.result.id)"
expect POST "/api/institutions/$INST/research-results" "{\"call_id\":\"$RF1\"}" 201 "  ...its answer imported"
# S2-1b: the composer stops leaving the row out; the call-time test still refuses it.
edit "$COMPOSE" "  const facts = allFacts.filter((f) => !failing.has(f.id));" "  const facts = allFacts;"
start_server
P_F2="$(newprompt_inst)"; N0="$(fake_count)"; C0="$(calls_n)"
grep -qF "98765" <(q "SELECT prompt_text FROM research_prompts WHERE id = '$P_F2'") && ok "S2-1b break: with the composer's filter removed, the new prompt carries the row (98765 in its text)" || bad "S2-1b: the break did not take"
expect POST "/api/research-ai/prompts/$P_F2/calls" '{}' 409 "  ...and the call is refused, the row named: caught" "would still carry a row that $INST_NAME does not publish, so nothing is sent: fact headcount (${FCUST:0:8}) is system export evidence"
[ "$(fake_count)" = "$N0" ] && [ "$(calls_n)" = "$C0" ] && ok "  ...0 requests, no sent row" || bad "  ...requests $(fake_count) calls $(calls_n)"
restore "$COMPOSE"; start_server
P_F3="$(newprompt_inst)"
fake_next "$(answer answer "$(printf '%s' "$ENV_F" | sed "s/$P_F1/$P_F3/")")"
call_on "$P_F3"; [ "$CODE" = 202 ] && [ "$(wait_call "$CALL")" = answered ] && ok "S2-1b control: restored, the row is left out again and the call is sent" || bad "S2-1b control: $CODE $(said)"
# S2-1c: a carried row that fails D5, as the data holds it: Scotts's pinned entity (recorded before evidence forms).
SCO="$(q "SELECT id FROM institutions WHERE name = 'Scotts Miracle-Gro' AND deleted_at IS NULL AND superseded_by_id IS NULL")"
req GET "/api/research-ai/subjects/institution/$SCO"; DSHA_S="$(rj b.disclosure.sha256)"
[ "$(rj "b.customer_side_rows.map(r=>r.what).join(',')")|$(rj b.left_out_rows.length)" = "entity|7" ] \
  && ok "S2-1c: Scotts: its entity would still be carried and fails D5; its regime and six facts would be left out (7)" || bad "S2-1c view: $(rj 'JSON.stringify([b.customer_side_rows.map(r=>r.what+" "+r.why),b.left_out_rows.length])')"
expect POST "/api/research-ai/institutions/$SCO/clearances" "{\"reason\":\"Scotts research from its published filings only (fixture).\",\"disclosure_sha256\":\"$DSHA_S\"}" 201 "  ...the steward clears Scotts"
req POST "/api/institutions/$SCO/research-prompts" '{}'; P_S1="$(rj b.prompt_id)"
q "SELECT prompt_text FROM research_prompts WHERE id = '$P_S1'" > "$W/ps1.txt"
grep -qF "LEFT OUT (6)" "$W/ps1.txt" && grep -qF "DISCLOSURE REGIME: on record, but left out of this prompt" "$W/ps1.txt" && ok "  ...its facts prompt leaves out the regime and six facts, and says so" || bad "  ...$(grep -n 'LEFT OUT\|DISCLOSURE' "$W/ps1.txt")"
N0="$(fake_count)"
expect POST "/api/research-ai/prompts/$P_S1/calls" '{}' 409 "S2-1c break: the pinned entity cannot be left out: refused, named" "entity The Scotts Miracle-Gro Company"
[ "$(fake_count)" = "$N0" ] && ok "  ...0 requests" || bad "  ...sent"
P_F4="$(newprompt_inst)"
expect POST "/api/institutions/$INST/facts" '{"kind":"stated_priority","value_text":"Reduce rework (fixture)","as_of":"2025-12-31","evidence_kind":"public_filing","provenance":"FY2025 annual report, letter to shareholders (fixture)","source_reference":"https://example.com/ar-2025 (fixture)","confidence":"medium","evidence_form":"quote","quote_text":"Our priority is to reduce rework (fixture).","how_read":"Verification fixture: read from the letter as written."}' 201 "a further published fact recorded after a prompt"
expect POST "/api/research-ai/prompts/$P_F4/calls" '{}' 409 "  ...that prompt no longer carries what is on record: refused" "Generate a new prompt."

step "8. Outcomes (S2-9), the Console's limit (S2-4b), ai_sourced (S2-12), on a pack"
req GET "/api/research-ai/subjects/industry/$IND"; DSHA_I="$(rj b.disclosure.sha256)"
expect POST "/api/research-ai/industries/$IND/clearances" "{\"reason\":\"Pack research for manufacturing, from published sources only (fixture).\",\"disclosure_sha256\":\"$DSHA_I\"}" 201 "the steward clears the manufacturing pack (API; the page path is the account's, above)"
KI="$(rj b.clearance_id)"
outcome() {  # LABEL MODE EXPECTED_STATE [TEXT] [DELAY]
  local p; p="$(newprompt_ind)"
  fake_next "$(answer "$2" "${4:-$(measure "$p")}" "${5:-}")"
  call_on "$p"
  local st; st="$( [ "$CODE" = 202 ] && wait_call "$CALL" || echo "not sent: $CODE")"
  [ "$st" = "$3" ] && ok "$1 -> $st" || bad "$1 -> $st"
  LASTP="$p"
}
outcome "the model refuses (stop_reason refusal)" refusal refused
[ "$(rj b.result.stop_reason)|$(rj b.result.answer_sha256)" = "refusal|null" ] && ok "  ...no answer kept" || bad "  ...$(rj 'JSON.stringify(b.result)')"
outcome "cut short (max_tokens)" max_tokens truncated
outcome "an empty answer" empty failed
[ "$(rj b.result.error_type)" = "empty_answer" ] && ok "  ...error empty_answer" || bad "  ...$(rj b.result.error_type)"
outcome "the stream cut part-way" cut failed
outcome "slower than the timeout (shortened to 6 s)" slow timeout "" 9000
[ "$(rj b.result.error_type)" = "timeout" ] && ok "  ...error timeout" || bad "  ...$(rj b.result.error_type)"
N0="$(fake_count)"
outcome "pause_turn, continued once, then answered" pause_then_answer answered
[ "$(( $(fake_count) - N0 ))|$(rj b.result.usage.requests)" = "2|2" ] && ok "  ...two requests, the second continuing the first (the documented pattern)" || bad "  ...requests: $(( $(fake_count) - N0 ))"
outcome "S2-4b break: the Console's spend limit reached (Anthropic's error)" error failed
[ "$(rj b.result.error_type)|$(rj b.result.http_status)|$(rj b.result.cost_usd)" = "invalid_request_error|400|0" ] && ok "  ...recorded failed: invalid_request_error, HTTP 400, cost 0" || bad "  ...$(rj 'JSON.stringify(b.result)')"
RERR="$(rj b.result.id)"
expect POST "/api/industries/$IND/research-results" "{\"call_id\":\"$RERR\"}" 422 "  ...nothing to import: refused" "there is no answer to import"
grep -q "invalid_request_error" "$W/sidecar.log" && ! grep -q "You have reached your specified workspace" "$W/sidecar.log" "$W/server.log" && ok "  ...the logs name the error's type, never its message" || bad "  ...log lines"
P_A="$(newprompt_ind)"; fake_next "$(answer answer "$(measure "$P_A" false)")"; call_on "$P_A"; wait_call "$CALL" > /dev/null; req GET "/api/research-ai/calls/$CALL"; RA="$(rj b.result.id)"
expect POST "/api/industries/$IND/research-results" "{\"call_id\":\"$RA\"}" 422 "S2-12 break: an answer saying ai_sourced false: refused at parse" "body.ai_sourced must be true"
P_B="$(newprompt_ind)"; fake_next "$(answer answer "$(measure "$P_B")")"; call_on "$P_B"; wait_call "$CALL" > /dev/null; req GET "/api/research-ai/calls/$CALL"; RB="$(rj b.result.id)"
expect POST "/api/industries/$IND/research-results" "{\"call_id\":\"$RB\"}" 201 "S2-12 control: ai_sourced true: imported"
# The research process writes the result itself: an API restart part-way loses nothing.
P_I="$(newprompt_ind)"; fake_next "$(answer slow "$(measure "$P_I")" 3000)"; call_on "$P_I"; CI="$CALL"
start_server
sleep 5; req GET "/api/research-ai/calls/$CI"
[ "$(rj b.state)" = "answered" ] && ok "a call running when the API restarts still gets its result: the research process writes it" || bad "after an API restart: $(rj b.state)"
# The research process stopped part-way: the API records it failed; the claim stands, so the call is never sent again.
P_K="$(newprompt_ind)"; fake_next "$(answer slow "$(measure "$P_K")" 4000)"; call_on "$P_K"; CK="$CALL"
sleep 1; pkill -9 -f "research-sidecar.mjs $MARK" || true; sleep 0.5; start_sidecar   # a hard stop: an ordinary one lets the call finish
sleep 2; req GET "/api/research-ai/calls/$CK"
[ "$(rj b.state)|$(rj b.result.error_type)" = "failed|research_process_unreachable" ] && ok "the research process stopped part-way: the API records the call failed (research_process_unreachable)" || bad "process stopped: $(rj b.state) $(rj b.result.error_type)"
[ "$(q "SELECT count(*) FROM research_call_claims WHERE sent_call_id = '$CK'")" = "1" ] && ok "  ...its claim stands" || bad "  ...claim"

step "9. Spend (S2-4a), the day's limit, the model's clearance (S2-3), a withdrawn clearance (S2-3b)"
SPENT="$(q "SELECT sum(cost_usd) FROM research_calls WHERE kind = 'result'")"
start_sidecar LVRF_RESEARCH_MONTHLY_USD=5
P_S="$(newprompt_ind)"; N0="$(fake_count)"
expect POST "/api/research-ai/prompts/$P_S/calls" '{}' 429 "S2-4a break: spent \$$SPENT, the research process's limit \$5: one more capped call (\$2.74) would pass it: refused" "would pass the \$5.00 limit"
[ "$(fake_count)" = "$N0" ] && ok "  ...nothing sent (the limit is the research process's own, read by the API from its status)" || bad "  ...sent"
start_sidecar LVRF_RESEARCH_DAILY_LIMIT=1
expect POST "/api/research-ai/prompts/$P_S/calls" '{}' 429 "the day's limit for the pack (the process's, set to 1): refused" "the limit is 1 a day"
start_sidecar
fake_next "$(answer answer "$(measure "$P_S")")"
call_on "$P_S"; [ "$CODE" = 202 ] && [ "$(wait_call "$CALL")" = answered ] && ok "S2-4a control: within the limit and the day's, it sends" || bad "S2-4a control: $CODE $(said)"
start_sidecar LVRF_RESEARCH_MODEL=claude-fable-5-2
P_M="$(newprompt_ind)"; N0="$(fake_count)"
expect POST "/api/research-ai/prompts/$P_M/calls" '{}' 403 "S2-3 break: the process now runs Fable 5.2; the pack is cleared for Opus 5.5 only: refused" "is not cleared for research with Claude Fable 5.2"
[ "$(fake_count)" = "$N0" ] && ok "  ...nothing sent" || bad "  ...sent"
req GET "/api/research-ai/subjects/industry/$IND"; DSHA_F="$(rj b.disclosure.sha256)"; DISC_F="$(rj b.disclosure.text)"
printf '%s' "$DISC_F" | grep -qF "Covered Models: Anthropic keeps the prompt and the answer for at least 30 days for safety monitoring" && ok "  ...the disclosure offered now is Fable 5.2's (a Covered Model, at least 30 days)" || bad "  ...$DISC_F"
expect POST "/api/research-ai/industries/$IND/clearances" "{\"reason\":\"Cleared again for Fable 5.2, a Covered Model kept 30 days (fixture).\",\"disclosure_sha256\":\"$DSHA_F\"}" 201 "  ...a new clearance naming Fable 5.2"
fake_next "$(answer answer "$(measure "$P_M")")"
call_on "$P_M"; [ "$CODE" = 202 ] && [ "$(wait_call "$CALL")" = answered ] && ok "S2-3 control: cleared for that model, it sends" || bad "S2-3 control: $CODE $(said)"
[ "$(rj b.result.cost_usd)" = "1.39" ] && ok "  ...priced at Fable 5.2's rates: \$1.39 (120,000 in at \$8, 9,000 out at \$40, 7 searches)" || bad "  ...cost $(rj b.result.cost_usd)"
[ "$(fake_last | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).body.model))')" = "claude-fable-5-2" ] && ok "  ...to claude-fable-5-2" || bad "  ...model"
start_sidecar
CR="Pack research for manufacturing, from published sources only (fixture)."
expect POST "/api/research-ai/clearances/$KI/withdraw" "{\"reason\":\"$CR\"}" 422 "S2-13 break: a withdrawal whose reason repeats the clearance's: refused" "The reason repeats the clearance's own"
OUT="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "$S" "$CLR VALUES ('$TEN', 'withdrawal', NULL, '$IND', 'claude-opus-5-5', 'standard', NULL, NULL, '$KI', '$CR', '$S')" | psql -X -q -At -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -q "repeats the clearance" && ok "  ...the database's half: the same, by SQL, refused (research_clearances_guard)" || bad "  ...guard: $OUT"
AS="$X" expect POST "/api/research-ai/clearances/$KI/withdraw" '{"reason":"Withdrawn by someone else (fixture)."}' 403 "a non-steward withdrawing: refused" "is the steward's act"
expect POST "/api/research-ai/clearances/$KI/withdraw" '{"reason":"The pack is researched by hand for now (fixture)."}' 201 "the steward withdraws the Opus clearance"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'withdraw_clearance' AND subject_id = '$KI' AND result_table = 'research_clearances'")" = "1" ] && ok "  ...one 'withdraw_clearance' act, naming the clearance and the withdrawal" || bad "  ...act"
expect POST "/api/research-ai/clearances/$KI/withdraw" '{"reason":"A second withdrawal (fixture)."}' 409 "  ...withdrawing it again: refused" "already withdrawn"
P_W="$(newprompt_ind)"
expect POST "/api/research-ai/prompts/$P_W/calls" '{}' 403 "S2-3b break: the clearance withdrawn: refused" "is not cleared"
OUT="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\nINSERT INTO research_calls (tenant_id, kind, prompt_id, prompt_sha256, clearance_id, model, retention_class, settings, person_id) SELECT tenant_id, 'sent', id, prompt_sha256, '%s', 'claude-opus-5-5', 'standard', '{}'::jsonb, '%s' FROM research_prompts WHERE id = '%s';\nROLLBACK;\n" "$S" "$KI" "$S" "$P_W" | psql -X -q -At -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -q "the clearance was withdrawn" && ok "  ...the database's half: a sent row on the withdrawn clearance, by SQL, refused (research_calls_guard)" || bad "  ...guard: $OUT"
expect POST "/api/research-ai/industries/$IND/clearances" "{\"reason\":\"Cleared again for pack research, published sources only (fixture).\",\"disclosure_sha256\":\"$DSHA_I\"}" 201 "  ...cleared again"
fake_next "$(answer answer "$(measure "$P_W")")"
call_on "$P_W"; [ "$CODE" = 202 ] && [ "$(wait_call "$CALL")" = answered ] && ok "S2-3b control: cleared again, it sends" || bad "S2-3b control: $CODE $(said)"
CREASON="$(q "SELECT reason FROM research_clearances WHERE institution_id = '$INST' AND kind = 'clearance'")"
WREASON="The client asked us to pause research with Claude (verification fixture)." CREASON="$CREASON" walk withdraw
[ "$(q "SELECT count(*) FROM research_clearances WHERE institution_id = '$INST' AND kind = 'withdrawal' AND person_id = '$S'")" = "1" ] && ok "  ...the account's withdrawal recorded, the steward's" || bad "  ...withdrawal"

step "10. S2-8 break: a process that changes the prompt is caught"
edit "$SIDECAR_SRC" "    messages: [{ role: 'user' as const, content: promptText }]," "    messages: [{ role: 'user' as const, content: promptText + '\n' }],"
npm run -s build:research
start_sidecar
P_X="$(newprompt_ind)"; fake_next "$(answer answer "$(measure "$P_X")")"; call_on "$P_X"; wait_call "$CALL" > /dev/null
SHAX="$(fake_last | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(require("crypto").createHash("sha256").update(JSON.parse(s).body.messages[0].content,"utf8").digest("hex")))')"
[ "$SHAX" != "$(q "SELECT prompt_sha256 FROM research_prompts WHERE id = '$P_X'")" ] && ok "S2-8 break: one appended line, and the request's SHA-256 no longer matches the stored prompt's: caught" || bad "S2-8 break not caught"
restore "$SIDECAR_SRC"; npm run -s build:research; start_sidecar
P_Y="$(newprompt_ind)"; fake_next "$(answer answer "$(measure "$P_Y")")"; call_on "$P_Y"; wait_call "$CALL" > /dev/null
SHAY="$(fake_last | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(require("crypto").createHash("sha256").update(JSON.parse(s).body.messages[0].content,"utf8").digest("hex")))')"
[ "$SHAY" = "$(q "SELECT prompt_sha256 FROM research_prompts WHERE id = '$P_Y'")" ] && ok "S2-8 control: restored, the request is the stored prompt again" || bad "S2-8 control"

step "11. S2-7: the research process in production"
NODE_ENV=production LVRF_RESEARCH_SOCKET="$SOCKDIR/p.sock" ANTHROPIC_BASE_URL=http://127.0.0.1:1 ANTHROPIC_API_KEY="$PLACEHOLDER" node dist/research-sidecar.mjs > "$W/p1.out" 2>&1 && bad "S2-7: started with a base URL in production" \
  || { grep -q "ANTHROPIC_BASE_URL is set; production talks to api.anthropic.com only." "$W/p1.out" && ok "S2-7 break: production with ANTHROPIC_BASE_URL refuses to start" || bad "S2-7: $(cat "$W/p1.out")"; }
NODE_ENV=production LVRF_RESEARCH_SOCKET="$SOCKDIR/p.sock" LVRF_APP_DIR="$PWD" node dist/research-sidecar.mjs > "$W/p2.out" 2>&1 && bad "D2: started as the app directory's owner" \
  || { grep -q "runs as the owner of $PWD; it must run as its own user (lvrf_research)" "$W/p2.out" && ok "D2 break: in production, running as the owner of the app directory refuses to start" || bad "D2: $(cat "$W/p2.out")"; }
NODE_ENV=production LVRF_RESEARCH_SOCKET="$SOCKDIR/p.sock" LVRF_APP_DIR=/usr node dist/research-sidecar.mjs > "$W/p3.out" 2>&1 && bad "D2: started from a file not root's" \
  || { grep -q "must be owned by root and writable by no one else" "$W/p3.out" && ok "D2 break: in production, a code file not root-owned (writable by its owner) refuses to start" || bad "D2: $(cat "$W/p3.out")"; }
LVRF_RESEARCH_SOCKET="$SOCKDIR/p.sock" LVRF_RESEARCH_DATABASE_URL="$RESEARCH_URL" ANTHROPIC_API_KEY="$PLACEHOLDER" node dist/research-sidecar.mjs > "$W/p4.out" 2>&1 && bad "a key with no stand-in started outside production" \
  || { grep -q "outside production, a key needs ANTHROPIC_BASE_URL" "$W/p4.out" && ok "outside production, a key with no stand-in refuses to start: nothing here can reach Anthropic" || bad "$(cat "$W/p4.out")"; }
grep -q "\[ai-research\] on: claude-opus-5-5" "$W/sidecar.log" && ok "S2-7 control: outside production, with the stand-in, it starts (\"[ai-research] on: claude-opus-5-5 …\")" || bad "S2-7 control"
curl -s --unix-socket "$SOCK" -X POST http://x/smoke > "$W/smoke.json"; fake_next "$(answer answer OK)"
curl -s --unix-socket "$SOCK" -X POST http://x/smoke > "$W/smoke2.json"
node -e "const a=require('$W/smoke.json'),b=require('$W/smoke2.json');process.exit((a.model||a.refused)&&b.refused==='once_a_minute'?0:1)" && ok "the smoke request (§21.6) answers, at most once a minute" || bad "smoke: $(cat "$W/smoke.json") $(cat "$W/smoke2.json")"
fake_last | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s).body;process.exit(b.messages[0].content==="Reply with the word OK."&&!b.tools?0:1)})' && ok "  ...a fixed sentence, no tools, no client data" || bad "  ...smoke request"

step "11b. S2-17: straight to the socket (Brad's question, 18 Nov 2026): the research process enforces, itself"
sock() { CODE="$(curl -s -o "$W/s.json" -w '%{http_code}' --unix-socket "$SOCK" -X POST http://x/call -H 'content-type: application/json' -d "$1")"; }
sj() { node -e "const b=require('$W/s.json'); console.log($1)"; }
pref() { q "SELECT count(*) FROM research_process_refusals"; }
# A sent row recorded through lvrf_app, its guard on (as the API would), for a new pack prompt: bypassing only the API's
# own checks, so the process alone decides.
sent_row() {  # PROMPT CLEARANCE [MODEL]
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\nINSERT INTO research_calls (tenant_id, kind, prompt_id, prompt_sha256, clearance_id, model, retention_class, settings, person_id) SELECT tenant_id, 'sent', id, prompt_sha256, '%s', '%s', 'standard', '{}'::jsonb, '%s' FROM research_prompts WHERE id = '%s' RETURNING id;\nCOMMIT;\n" \
    "$S" "$2" "${3:-claude-opus-5-5}" "$S" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 "$VERIFY_URL" | grep -E '^[0-9a-f-]{36}$' | tail -1
}
KP="$(q "SELECT k.id FROM research_clearances k WHERE k.industry_id = '$IND' AND k.kind = 'clearance' AND k.model = 'claude-opus-5-5' AND NOT EXISTS (SELECT 1 FROM research_clearances w WHERE w.withdraws_clearance_id = k.id) ORDER BY k.at DESC LIMIT 1")"
N0="$(fake_count)"; R0="$(pref)"
sock '{"call_id":"00000000-0000-4000-8000-000000000001","prompt_text":"anything at all"}'
[ "$CODE|$(sj b.refused)" = "400|bad_request" ] && ok "a request carrying its own prompt text: refused (400 bad_request); the process takes { call_id } alone and reads the prompt itself" || bad "text request: $CODE $(cat "$W/s.json")"
sock '{"call_id":"00000000-0000-4000-8000-000000000002"}'
[ "$CODE|$(sj b.refused)" = "404|not_sent" ] && ok "a call the API never recorded as sent: refused (404 not_sent)" || bad "unknown call: $CODE $(cat "$W/s.json")"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Uncleared Co $TS\"}}" 201 "an account that is never cleared"
INST2="$(rj b.institution_id)"
req POST "/api/institutions/$INST2/research-prompts" '{}'; P2="$(rj b.prompt_id)"
# The break Brad named: a sent row for the uncleared account. The database's guard refuses it (so the API cannot), so
# it is put in with the triggers off, naming the pack's clearance: what a request straight to the socket would rely on.
CU="$(printf "BEGIN;\nSET LOCAL session_replication_role = replica;\nINSERT INTO research_calls (tenant_id, kind, prompt_id, prompt_sha256, clearance_id, model, retention_class, settings, person_id) SELECT tenant_id, 'sent', id, prompt_sha256, '%s', 'claude-opus-5-5', 'standard', '{}'::jsonb, '%s' FROM research_prompts WHERE id = '%s' RETURNING id;\nCOMMIT;\n" "$KP" "$S" "$P2" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" | grep -E '^[0-9a-f-]{36}$' | tail -1)"
OUT="$(sent_row "$P2" "$KP" 2>&1 || true)"; printf '%s' "$OUT" | grep -q "relies on a clearance of its prompt's account or industry" && ok "  ...(through lvrf_app the database's guard refuses that sent row: the account is not the clearance's)" || bad "  ...the guard: $OUT"
sock "{\"call_id\":\"$CU\"}"
[ "$CODE|$(sj b.refused)" = "403|not_cleared" ] && ok "S2-17 break: straight to the socket, a call for an uncleared account: refused (403 not_cleared)" || bad "S2-17: $CODE $(cat "$W/s.json")"
[ "$(q "SELECT code || '|' || tenant_id || '|' || prompt_id || '|' || requested_call_id FROM research_process_refusals ORDER BY refused_at DESC LIMIT 1")" = "not_cleared|$TEN|$P2|$CU" ] \
  && ok "  ...its refusal written by the process: not_cleared, naming the tenant, the prompt and the call" || bad "  ...refusal row: $(q "SELECT code, tenant_id, prompt_id FROM research_process_refusals ORDER BY refused_at DESC LIMIT 1")"
[ "$(fake_count)" = "$N0" ] && [ "$(q "SELECT count(*) FROM research_call_claims WHERE sent_call_id = '$CU'")|$(q "SELECT count(*) FROM research_calls WHERE sent_call_id = '$CU'")" = "0|0" ] \
  && ok "  ...nothing sent: 0 requests, no claim, no result" || bad "  ...sent: requests $(( $(fake_count) - N0 ))"
[ "$(( $(pref) - R0 ))" = "3" ] && ok "  ...three refusals recorded by the process (the text request, the unknown call, the uncleared account)" || bad "  ...process refusals: $(( $(pref) - R0 ))"
P_D="$(newprompt_ind)"; CD="$(sent_row "$P_D" "$KP")"
fake_next "$(answer answer "$(measure "$P_D")")"
sock "{\"call_id\":\"$CD\"}"
[ "$CODE|$(sj b.outcome)" = "200|answered" ] && [ "$(( $(fake_count) - N0 ))" = "1" ] && ok "S2-17 control: a call recorded as sent, for a cleared pack, straight to the socket: sent (1 request) and answered" || bad "S2-17 control: $CODE $(cat "$W/s.json")"
[ "$(q "SELECT count(*) FROM research_call_claims c JOIN audit_log a ON a.table_name = 'research_call_claims' AND a.record_id = c.id::text WHERE c.sent_call_id = '$CD' AND a.actor_person_id = '$S'")|$(q "SELECT count(*) FROM research_calls r JOIN audit_log a ON a.table_name = 'research_calls' AND a.record_id = r.id::text WHERE r.sent_call_id = '$CD' AND r.person_id = '$S' AND a.actor_person_id = '$S' AND r.cost_usd > 0")" = "1|1" ] \
  && ok "  ...the process's claim before, and its result row after, each with its audit row naming the person who started it" || bad "  ...claim/result rows"
N1="$(fake_count)"
sock "{\"call_id\":\"$CD\"}"
[ "$CODE|$(sj b.refused)" = "409|already_claimed" ] && ok "the same call again: refused (409 already_claimed)" || bad "again: $CODE $(cat "$W/s.json")"
stop_sidecar; start_sidecar
sock "{\"call_id\":\"$CD\"}"
[ "$CODE|$(sj b.refused)|$(fake_count)" = "409|already_claimed|$N1" ] && ok "  ...and after the process restarts: the claim is on record, so it is never sent twice" || bad "  ...after restart: $CODE $(cat "$W/s.json")"
start_sidecar LVRF_RESEARCH_MONTHLY_USD=1
P_E="$(newprompt_ind)"; CE="$(sent_row "$P_E" "$KP")"
sock "{\"call_id\":\"$CE\"}"
[ "$CODE|$(sj b.refused)|$(fake_count)" = "429|spend|$N1" ] && ok "S2-17: past the process's own monthly limit (\$1): refused (429 spend), nothing sent" || bad "spend: $CODE $(cat "$W/s.json")"
start_sidecar LVRF_RESEARCH_DAILY_LIMIT=1
P_G="$(newprompt_ind)"; CG="$(sent_row "$P_G" "$KP")"
sock "{\"call_id\":\"$CG\"}"
[ "$CODE|$(sj b.refused)|$(fake_count)" = "429|daily_cap|$N1" ] && ok "S2-17: past the process's own daily cap (1): refused (429 daily_cap), nothing sent" || bad "daily: $CODE $(cat "$W/s.json")"
start_sidecar LVRF_RESEARCH_MODEL=claude-fable-5-2
P_H="$(newprompt_ind)"; CH="$(sent_row "$P_H" "$KP")"
sock "{\"call_id\":\"$CH\"}"
[ "$CODE|$(sj b.refused)|$(fake_count)" = "409|wrong_model|$N1" ] && ok "S2-17: a call for another model than the process runs: refused (409 wrong_model), nothing sent" || bad "model: $CODE $(cat "$W/s.json")"
start_sidecar
[ "$(q "SELECT string_agg(code, ' ' ORDER BY refused_at) FROM research_process_refusals")" = "bad_request not_sent not_cleared already_claimed already_claimed spend daily_cap wrong_model" ] \
  && ok "every socket refusal on record, in order, written by the process" || bad "process refusals: $(q "SELECT string_agg(code, ' ' ORDER BY refused_at) FROM research_process_refusals")"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'research_process_refusals'")" = "0" ] && ok "  ...a socket request has no person, so its refusal names none and writes no audit row (no actorless row)" || bad "  ...audit rows on process refusals"

step "12. S2-6: the key nowhere it should not be; the record"
LEAKS=0
for f in "$W/server.log" "$W/sidecar.log" "$W/vite.log" "$W/walk.out" "$W"/resp.*.json; do [ -f "$f" ] && grep -qF "$PLACEHOLDER" "$f" && { LEAKS=$((LEAKS+1)); echo "  leak in $f"; }; done
[ "$(q "SELECT count(*) FROM (SELECT new_row::text t FROM audit_log UNION ALL SELECT coalesce(old_row::text,'') FROM audit_log UNION ALL SELECT r::text FROM research_calls r UNION ALL SELECT r::text FROM research_clearances r UNION ALL SELECT r::text FROM research_process_refusals r UNION ALL SELECT f::text FROM refusals f UNION ALL SELECT g::text FROM governance_acts g) x WHERE t LIKE '%PLACEHOLDER%'")" = "0" ] || LEAKS=$((LEAKS+1))
grep -rqF "PLACEHOLDER-s2-gate-a-$TS" client/dist dist/server 2>/dev/null && LEAKS=$((LEAKS+1))
git grep -qF "PLACEHOLDER-s2-gate-a-$TS" && LEAKS=$((LEAKS+1))
[ "$LEAKS" = "0" ] && ok "S2-6: the placeholder key appears 0 times: the API's, the process's and vite's logs, every response body, audit_log, research_calls, research_clearances, refusals, governance_acts, the builds and the repo" || bad "S2-6: $LEAKS leak(s)"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name IN ('research_calls', 'research_clearances', 'research_imports', 'research_call_claims') AND actor_person_id IS NULL")" = "0" ] && ok "no audit row on the new tables without an actor" || bad "actorless audit rows"
[ "$(q "SELECT string_agg(s.id::text, ' ' ORDER BY s.at) FROM research_calls s WHERE s.kind = 'sent' AND s.at > '$T0' AND NOT EXISTS (SELECT 1 FROM research_calls r WHERE r.sent_call_id = s.id)")" = "$CU $CE $CG $CH" ] && ok "every sent call has its one result, but the four the process refused at the socket (none sent)" || bad "sent without result: $(q "SELECT count(*) FROM research_calls s WHERE kind='sent' AND NOT EXISTS (SELECT 1 FROM research_calls r WHERE r.sent_call_id = s.id)")"
ACTS="$(q "SELECT string_agg(act::text, ' ' ORDER BY at, id) FROM governance_acts WHERE at > '$T0' AND act IN ('clear', 'withdraw_clearance')")"
[ "$ACTS" = "clear clear clear clear withdraw_clearance clear withdraw_clearance" ] && ok "acts: clear (the account), clear (Scotts), clear (the pack), clear (the pack, Fable 5.2), withdraw_clearance (the pack), clear (the pack), withdraw_clearance (the account); a call writes none" || bad "acts: $ACTS"
[ "$(q "SELECT count(*) FROM governance_acts WHERE at > '$T0' AND (subject_table = 'research_calls' OR result_table = 'research_calls')")" = "0" ] && ok "  ...no act on research_calls (create-only, ROUTE_ACTS)" || bad "  ...acts on calls"
[ "$(q "SELECT round(sum(cost_usd), 4) = round(sum(((usage->>'input_tokens')::numeric * CASE model WHEN 'claude-fable-5-2' THEN 8 ELSE 4 END + (usage->>'output_tokens')::numeric * CASE model WHEN 'claude-fable-5-2' THEN 40 ELSE 20 END) / 1e6 + (usage->>'web_search_requests')::numeric * 0.01), 4) FROM research_calls WHERE kind = 'result'")" = "t" ] \
  && ok "every recorded cost is its usage at the prices read 18 Nov 2026" || bad "costs"

step "13. Every sealed run as it was; hashes"
[ "$(runs_md5)" = "$RUNS0" ] && ok "every one of the copy's $N_RUNS0 sealed runs byte-identical at the end" || bad "a sealed run changed"
H1F="$(HASHES)"; printf '%s' "$H1F" | grep -qE "differs 0; embedded payloadHash matches [0-9]+, differs 0" && ok "check_run_hashes, all: $H1F" || bad "hashes: $H1F"
[ "$(trig)" = "226" ] && ok "226 triggers at the end" || bad "triggers: $(trig)"

echo
echo "==> $PASS passed, $FAIL failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
