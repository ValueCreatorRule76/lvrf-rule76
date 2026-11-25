#!/usr/bin/env bash
#
# §29 (Brad's rulings, 24 Nov 2026: D1-D7, the verifier included, four additions) — only a customer-side person at the
# account commits to a target or verifies an actual, by the one rule credit reads (lvrf_customer_side_reason).
#
#   ./scripts/verify_customer_committer.sh [out_dir]
#
#   On a clone of the prod copy, migrated and hardened:
#   1. Curia's e3fb0061 (committed 30 Aug 2026 by a person who is not customer-side) is byte-identical after hardening.
#   2. The route: a committer and a verifier with no role are refused (422) in D3's sentence, nothing written; a
#      customer-side person commits and verifies. The account, simulated and deleted checks stay ahead of it.
#   3. The database, as lvrf_app: the same commit, a changed committer, the same verification and an INSERT carrying a
#      committer are refused; the customer-side person is accepted.
#   4. A role revoked after the commitment leaves it standing, and later steps on it still pass.
#   5. The page: the lists offer only customer-side people; an account with none prints D2's sentence with its link to
#      the roles card, Commit disabled; the roles card adds a person; Curia's e3fb0061 prints D5's line; the tenant's
#      own page prints its sentence, with no link.
#   Breaks, each caught by its own section: R1 the route's commit check, R2 the route's verify check, D1 the
#   database's committer clause, D2 its verifier clause, F1 the form's filter.

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

VERIFY_DB=lvrf_verifyside
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3411; VITE_PORT=5411; CDP_PORT=9521
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_side.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
SPINE=client/src/components/OutcomeSpine.tsx; WALKR=server/routes/outcomeWalk.ts
EDITED=("$SPINE" "$WALKR")
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
SENT_C="Only a customer-side person at the account can commit to a target."
SENT_V="Only a customer-side person at the account can verify an actual."
DBSENT_C="only a customer-side person at the account can commit to a target."
DBSENT_V="only a customer-side person at the account can verify an actual."

step "1. Clone the prod copy, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
CURIA_O="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE 'e3fb0061%'")"; CURIA="$(q "SELECT institution_id FROM value_outcomes WHERE id = '$CURIA_O'")"
ROW0="$(q "SELECT md5(to_jsonb(o)::text) FROM value_outcomes o WHERE id = '$CURIA_O'")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (no migration in §29)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "229" ] && ok "229 triggers (§29 adds none; §32 section 38: +2)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 55 migrations, newest 0054_s7a_figure_class" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every run byte-identical after hardening" || bad "a run changed"
[ "$(q "SELECT md5(to_jsonb(o)::text) FROM value_outcomes o WHERE id = '$CURIA_O'")" = "$ROW0" ] && ok "Curia's e3fb0061 byte-identical after hardening (D5: the rule never reads it)" || bad "e3fb0061 changed"
[ "$(q "SELECT lvrf_customer_side_reason(committed_by_person_id, institution_id) FROM value_outcomes WHERE id = '$CURIA_O'")" = "no customer-side role named from a source" ] \
  && ok "  ...its committer is not customer-side: no customer-side role named from a source" || bad "  ...e3fb0061's committer: $(q "SELECT lvrf_customer_side_reason(committed_by_person_id, institution_id) FROM value_outcomes WHERE id = '$CURIA_O'")"
CURIA_OPEN="$(q "SELECT vo.id FROM value_outcomes vo JOIN engagements g ON g.id = vo.engagement_id WHERE vo.institution_id = '$CURIA' AND vo.committed_at IS NULL AND g.deleted_at IS NULL AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL LIMIT 1")"
SELF="$(q "SELECT id FROM institutions WHERE is_tenant_self AND deleted_at IS NULL LIMIT 1")"
SO="$(q "SELECT vo.id FROM value_outcomes vo JOIN engagements g ON g.id = vo.engagement_id WHERE vo.institution_id = '$SELF' AND vo.committed_at IS NULL AND g.deleted_at IS NULL AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL LIMIT 1")"
[ -n "$CURIA_OPEN" ] && [ -n "$SO" ] && ok "Curia's open outcome ${CURIA_OPEN:0:8} and the tenant's own ${SO:0:8}, both uncommitted" || bad "open outcomes: '$CURIA_OPEN' '$SO'"

step "2. The session, the server, two fixture accounts"
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"; TS="$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server && ok "API up on $PORT" || { bad "server: $(tail -5 "$W/server.log")"; exit 1; }
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
OWNER_NAME='K29 owner (invented)'; NOROLE_NAME='K29 clerk (invented)'; LATER_NAME='K29 sponsor (invented)'
expect POST /api/account-inputs "$(J institution "$(J name "Kestrel Mills (§29 fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for §29.')" persons "[$(J full_name "$OWNER_NAME" email "owner.$TS@k29.example" title Owner),$(J full_name "$NOROLE_NAME" email "clerk.$TS@k29.example" title Clerk),$(J full_name "$LATER_NAME" email "sponsor.$TS@k29.example" title Sponsor)]")" 201 "a fixture account: an owner, a clerk with no role, a sponsor"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; NOROLE="$(rj b.person_ids[1])"; LATER="$(rj b.person_ids[2])"
make_customer_side "$INST" "$OWNER"
make_customer_side "$INST" "$LATER" executive_sponsor
LATER_GRANT="$(q "SELECT id FROM customer_role_grants WHERE person_id = '$LATER'")"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K29 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
expect POST /api/account-inputs "$(J institution "$(J name "Harrow Freight (§29 fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for §29.')" persons "[$(J full_name 'K29 driver (invented)' email "driver.$TS@k29.example" title Driver)]")" 201 "a second fixture account, with no customer-side person"
INST_E="$(rj b.institution_id)"; EP="$(rj b.person_ids[0])"
expect POST "/api/institutions/$INST_E/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K29 capability' owner_person_id "$EP" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
outcome() {  # INST OWNER NAME -> stdout: outcome id
  req POST "/api/institutions/$1/value-outcomes" "$(J engagement_name "K29 engagement $3" engagement_owner_person_id "$2" capability_name 'K29 capability' metric "$(J name "K29 TRIR $3" unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$2")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)"
  [ "$CODE" = "201" ] && rj b.value_outcome_id || { echo "ERR $CODE $(said)"; return 1; }
}
O_C="$(outcome "$INST" "$OWNER" commit)"; O_V="$(outcome "$INST" "$OWNER" verify)"; O_R="$(outcome "$INST" "$OWNER" revoke)"; O_B="$(outcome "$INST" "$OWNER" breaks)"; OE="$(outcome "$INST_E" "$EP" empty)"
for o in "$O_C" "$O_V" "$O_R" "$O_B" "$OE"; do case "$o" in ERR*) bad "an outcome: $o"; exit 1 ;; esac; done
ok "five fixture outcomes"
CB() { J target_value 1.0 committed_by_person_id "$1" committed_at 2026-11-20T12:00:00Z promised_measured_on 2027-05-01 commitment_note 'Verification: committed (§29 fixture).' attribution_method contribution_only measure_class capability_performance; }
VB() { J verified_by_person_id "$1" verified_at 2026-11-22T13:00:00Z attestation_note 'Verification: checked against the fixture system of record.'; }
EVA() { J kind system_export provenance 'Fixture source for: K29 actual (not a source)' summary 'K29 TRIR extract (fixture)' supports actual confidence medium source_verified true ai_sourced false simulated false evidence_form quote quote_text 'Verification fixture quote, not a source.' how_read 'Verification fixture: read from the fixture quote as written.'; }
state() { q "SELECT coalesce(committed_by_person_id::text, '-') || '|' || coalesce(verified_by_person_id::text, '-') || '|' || realization FROM value_outcomes WHERE id = '$1'"; }
acts() { q "SELECT (SELECT count(*) FROM governance_acts) || '|' || (SELECT count(*) FROM evidence)"; }

step "3. The route (D3, D6)"
A0="$(acts)"
expect POST "/api/value-outcomes/$O_C/commit" "$(CB "$NOROLE")" 422 "a commit by $NOROLE_NAME (no role)" "$SENT_C $NOROLE_NAME is not: no customer-side role named from a source."
[ "$(state "$O_C")" = "-|-|claimed" ] && [ "$(acts)" = "$A0" ] && ok "  ...nothing written: no commitment, no act, no evidence row" || bad "  ...wrote: $(state "$O_C") $(acts) vs $A0"
[ "$(q "SELECT count(*) FROM refusals WHERE message LIKE 'LVRF: value_outcomes: only a customer-side person%'")" = "0" ] && ok "  ...and it was the route that answered: no database refusal recorded" || bad "  ...a database refusal was recorded"
expect POST "/api/value-outcomes/$O_C/commit" "$(CB "$S")" 422 "a commit by the steward (tenant staff): the account check stays ahead" "does not belong to institution"
expect POST "/api/value-outcomes/$O_C/commit" "$(CB "$EP")" 422 "a commit by a person of another account: the account check stays ahead" "does not belong to institution"
expect POST "/api/value-outcomes/$O_V/commit" "$(CB "$OWNER")" 201 "a commit by $OWNER_NAME (customer-side)"
expect POST "/api/value-outcomes/$O_V/evidence" "$(EVA)" 201 "  ...its actual's evidence"
expect POST "/api/value-outcomes/$O_V/measure" "$(J actual_value 1.1 actual_measured_at 2026-11-21T12:00:00Z)" 200 "  ...measured"
A0="$(acts)"
expect POST "/api/value-outcomes/$O_V/verify" "$(VB "$NOROLE")" 422 "a verification by $NOROLE_NAME (no role)" "$SENT_V $NOROLE_NAME is not: no customer-side role named from a source."
[ "$(state "$O_V")" = "$OWNER|-|measured" ] && [ "$(acts)" = "$A0" ] && ok "  ...nothing written" || bad "  ...wrote: $(state "$O_V") $(acts) vs $A0"

step "4. The database, as lvrf_app (D4, D6)"
UC() { printf "UPDATE value_outcomes SET target_value = 1.0, committed_by_person_id = '%s', committed_at = '2026-11-20T12:00:00Z', attribution_method = 'contribution_only', measure_class = 'capability_performance', promised_measured_at = '2027-05-01T12:00:00Z', value_stage = 'commit' WHERE id = '%s'" "$1" "$2"; }
sqlrefused "a commit by $NOROLE_NAME" "$(UC "$NOROLE" "$O_C")" "$DBSENT_C $NOROLE_NAME is not: no customer-side role named from a source."
[ "$(sqlaccepted "$(UC "$OWNER" "$O_C")")" = "ACCEPTED" ] && ok "  ...the same commit by $OWNER_NAME is accepted" || bad "  ...by the owner: $(sqlaccepted "$(UC "$OWNER" "$O_C")")"
sqlrefused "a committed row's committer changed to $NOROLE_NAME" "UPDATE value_outcomes SET committed_by_person_id = '$NOROLE' WHERE id = '$O_V'" "$DBSENT_C"
sqlrefused "a committed row's committer changed to the steward" "UPDATE value_outcomes SET committed_by_person_id = '$S' WHERE id = '$O_V'" "is not: vendor-side"
UV() { printf "UPDATE value_outcomes SET verified_by_person_id = '%s', verified_at = '2026-11-22T13:00:00Z', source_verified = true, realization = 'verified', value_stage = 'verify' WHERE id = '%s'" "$1" "$2"; }
sqlrefused "a verification by $NOROLE_NAME" "$(UV "$NOROLE" "$O_V")" "$DBSENT_V $NOROLE_NAME is not: no customer-side role named from a source."
[ "$(sqlaccepted "$(UV "$OWNER" "$O_V")")" = "ACCEPTED" ] && ok "  ...the same verification by $OWNER_NAME is accepted" || bad "  ...by the owner: $(sqlaccepted "$(UV "$OWNER" "$O_V")")"
INS() { printf "INSERT INTO value_outcomes SELECT (jsonb_populate_record(NULL::value_outcomes, to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'committed_by_person_id', '%s', 'engagement_id', (SELECT engagement_id FROM value_outcomes WHERE id = '%s')))).* FROM value_outcomes o WHERE o.id = '%s'" "$1" "$O_B" "$O_V"; }
sqlrefused "an INSERT carrying $NOROLE_NAME as committer" "$(INS "$NOROLE")" "$DBSENT_C"
[ "$(state "$O_V")" = "$OWNER|-|measured" ] && ok "  ...every refused write rolled back" || bad "  ...state: $(state "$O_V")"

step "5. A role revoked after the commitment (D1: checked when made)"
expect POST "/api/value-outcomes/$O_R/commit" "$(CB "$LATER")" 201 "a commit by $LATER_NAME (customer-side)"
expect POST "/api/customer-roles/$LATER_GRANT/revoke" "$(J reason 'Verification: revoked after the commitment (§29).')" 200 "  ...$LATER_NAME's role revoked"
[ "$(state "$O_R")" = "$LATER|-|claimed" ] && ok "  ...the commitment stands" || bad "  ...state: $(state "$O_R")"
expect POST "/api/value-outcomes/$O_R/evidence" "$(EVA)" 201 "  ...its actual's evidence, still admitted"
expect POST "/api/value-outcomes/$O_R/measure" "$(J actual_value 1.2 actual_measured_at 2026-11-21T12:00:00Z)" 200 "  ...measured: a later step on it is not refused"
[ "$(q "SELECT count(*) FROM value_outcomes WHERE id = '$O_R' AND committed_by_person_id = '$LATER' AND realization = 'measured'")" = "1" ] && ok "  ...committed by $LATER_NAME, measured" || bad "  ...after measure: $(state "$O_R")"
expect POST "/api/value-outcomes/$O_C/commit" "$(CB "$LATER")" 422 "  ...but a new commit by $LATER_NAME, role revoked, is refused" "$SENT_C $LATER_NAME is not: no customer-side role named from a source."
req GET "/api/institutions/$INST/outcome-spine"
[ "$(rj "b.outcomes.find(o=>o.id==='$O_R').committed_before_rule")" = "false" ] && ok "  ...and its card shows no before-the-rule line (a role was held)" || bad "  ...committed_before_rule: $(rj "b.outcomes.find(o=>o.id==='$O_R').committed_before_rule")"

step "6. The page"
WENV=(INST="$INST" OC="$O_C" OV="$O_V" OWNER_NAME="$OWNER_NAME" NOROLE_NAME="$NOROLE_NAME" INST_E="$INST_E" OE="$OE" CURIA="$CURIA" CURIA_O="$CURIA_O" CURIA_OPEN="$CURIA_OPEN" SELF="$SELF" SO="$SO" NEW_NAME='K29 controller (invented)' NEW_EMAIL="controller.$TS@k29.example")
walk lists,empty,curia,tenant,addperson page "$W/page.log" "${WENV[@]}"; tally "$W/page.log"
[ "$(q "SELECT count(*) FROM persons WHERE institution_id = '$INST_E' AND full_name = 'K29 controller (invented)' AND title = 'Plant controller' AND NOT simulated")" = "1" ] \
  && ok "  ...the roles card added K29 controller to the account (no role named: that is the steward's act, from a source)" || bad "  ...the person was not added"
[ "$(q "SELECT count(*) FROM customer_role_grants WHERE institution_id = '$INST_E'")" = "0" ] && ok "  ...and adding a person named no role" || bad "  ...a role was named"

step "7. Breaks, each caught by its own section"
# R1 — the route's commit check removed: the database still refuses, so the route section reads the database's words, not D3's.
edit "$WALKR" "      const sideRefusal = await customerSideRefusal(client, 'commit', committedByPersonId, outcome.institution_id);" "      const sideRefusal = null as string | null;"
restart_server
# §30: with the prefix off the screen, the database's sentence reads as the route's; who answered is told by the record:
# only a database refusal is recorded in refusals (handleGovernanceError), the route's own 422 is not.
DBR() { q "SELECT count(*) FROM refusals WHERE message LIKE 'LVRF: value_outcomes: only a customer-side person at the account can $1%'"; }
N0="$(DBR commit)"
req POST "/api/value-outcomes/$O_C/commit" "$(CB "$NOROLE")"; M="$(said)"
[ "$CODE" = "422" ] && [ "$(DBR commit)" -gt "$N0" ] && ok "R1: the route's commit check removed → caught: the database answered, its refusal recorded ($CODE: $(printf '%s' "$M" | head -c 100))" || bad "R1: not caught: $CODE $M"
[ "$(state "$O_C")" = "-|-|claimed" ] && ok "  ...and the database still refused it: nothing written" || bad "  ...R1 wrote: $(state "$O_C")"
restore "$WALKR"
# R2 — the route's verify check removed.
edit "$WALKR" "      const sideRefusal = await customerSideRefusal(client, 'verify', verifiedByPersonId, outcome.institution_id);" "      const sideRefusal = null as string | null;"
restart_server
N0="$(DBR verify)"
req POST "/api/value-outcomes/$O_V/verify" "$(VB "$NOROLE")"; M="$(said)"
[ "$CODE" = "422" ] && [ "$(DBR verify)" -gt "$N0" ] && ok "R2: the route's verify check removed → caught: the database answered, its refusal recorded ($CODE)" || bad "R2: not caught: $CODE $M"
[ "$(state "$O_V")" = "$OWNER|-|measured" ] && ok "  ...and the database still refused it" || bad "  ...R2 wrote: $(state "$O_V")"
restore "$WALKR"; restart_server
# D1, D2 — the database's clauses removed: the same writes are accepted.
fnbreak lvrf_block_simulated_attestor "       AND lvrf_customer_side_reason(NEW.committed_by_person_id, NEW.institution_id) IS NOT NULL THEN" "       AND false THEN"
[ "$(sqlaccepted "$(UC "$NOROLE" "$O_C")")" = "ACCEPTED" ] && ok "D1: the committer clause removed → caught: a commit by $NOROLE_NAME is accepted" || bad "D1: $(sqlaccepted "$(UC "$NOROLE" "$O_C")")"
reharden
fnbreak lvrf_block_simulated_attestor "       AND lvrf_customer_side_reason(NEW.verified_by_person_id, NEW.institution_id) IS NOT NULL THEN" "       AND false THEN"
[ "$(sqlaccepted "$(UV "$NOROLE" "$O_V")")" = "ACCEPTED" ] && ok "D2: the verifier clause removed → caught: a verification by $NOROLE_NAME is accepted" || bad "D2: $(sqlaccepted "$(UV "$NOROLE" "$O_V")")"
reharden
sqlrefused "  ...with both back" "$(UC "$NOROLE" "$O_C")" "$DBSENT_C"
# F1 — the form's filter removed.
edit "$SPINE" ".filter((p) => p.customer_side) }), () => setD('error'));" " }), () => setD('error'));"
sleep 4
walk lists f1 "$W/f1.log" "${WENV[@]}"
grep -q "^FAIL  f1: lists: \"Who commits\" offers $OWNER_NAME alone" "$W/f1.log" && ok "F1: the form's filter removed → caught: \"Who commits\" offers $NOROLE_NAME too" || bad "F1: not caught: $(grep -m3 -E 'PASS|FAIL' "$W/f1.log")"
restore "$SPINE"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
node scripts/check_plain_words.mjs > "$W/plain.log" 2>&1 && ok "plain words: $(tail -1 "$W/plain.log")" || bad "plain words: $(grep -m3 HIT "$W/plain.log")"
cover "$LOG" "e3fb0061 byte-identical after hardening" "a commit by $NOROLE_NAME (no role) -> 422" "a verification by $NOROLE_NAME (no role) -> 422" "refused by the database: \"$DBSENT_C" "an INSERT carrying" \
  "the commitment stands" 'offers K29 owner (invented) alone' 'empty: the commit form prints' 'links to card 01b' 'the link brings the roles card into view' 'addperson: confirmed' \
  'curia: e3fb0061 reads' "tenant: the commit form prints" 'R1: ' 'R2: ' 'D1: ' 'D2: ' 'F1: '

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
