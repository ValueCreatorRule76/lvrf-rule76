#!/usr/bin/env bash
#
# C2c — withdrawing a link with no replacement; a confirmation before a correction or a withdrawal;
# the run page's correction and erratum controls apart; one request per submit; a supersession reason
# that repeats the erratum refused (LVRF_PLAN §11; Brad's ruling, 26 Oct 2026). Local verification.
#
#   ./scripts/verify_c2c.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data neutralised) to
# `lvrf_verifyc2c` with make_clone, migrated and hardened, dropped on exit. L39: every fixture is the
# script's own, built through the routes. THE CURIA MISTAKE is the fixture case: a reference engagement
# whose outcome sealed a filing about the tenant as its impact basis, in two runs, then retired, and a
# later live engagement; the steward corrects that filing to the baseline by mistake (as on prod,
# 26 Oct 2026, 17:01), cannot correct it back, and withdraws it with no replacement from the run page.
# DELIBERATE BREAKS, every file restored byte-identical, every function restored by re-applying hardening.sql:
#   B8   the withdraw route's steward check removed: the database refuses X
#   B9   the withdraw route's act removed: the commit is refused (no governance act), nothing written
#   B10  the run page's withdraw form without its confirmation: a request goes before any confirmation
#   B11  the run page's two controls without their lines: the sections check catches it
#   B12  the form's one-request guard removed: a double click sends two requests
#   B13  the erratum route's repeat check removed: the database refuses the repeating reason
#   B14  the database's repeat check removed too (on the clone): the repeating reason is accepted

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyc2c
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3102; VITE_PORT=5202; CDP_PORT=9362
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_c2c.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
CORR=server/routes/corrections.ts; BENCH=client/src/components/workbench/Workbench.tsx; FORM=client/src/components/GovernedForm.tsx
EDITED=("$CORR" "$BENCH" "$FORM")
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
# A write the database must refuse / accept: in a transaction rolled back, as the actor named.
sqlrefused() {  # LABEL SQL EXPECTED_SUBSTRING [ACTOR]
  local out; out="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "${4:-$S}" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
sqlaccepted() {  # SQL [ACTOR]
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nROLLBACK;\n" "${2:-$S}" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1 || true
}
fnbreak() {  # FUNCTION OLD NEW: one piece of a hardening.sql function replaced, on the clone only
  python3 - "$W/fnbreak.sql" "$1" "$2" "$3" <<'PY'
import re, sys
out, name, a, b = sys.argv[1:5]
s = open('db/hardening.sql').read()
fn = re.search(r"CREATE OR REPLACE FUNCTION " + name + r"\(\).*?\nEND \$\$;\n", s, re.S).group(0)
assert fn.count(a) == 1, a
open(out, 'w').write(fn.replace(a, b))
PY
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/fnbreak.sql" > /dev/null
}
reharden() {
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "167" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 167 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}
link_of() { q "SELECT coalesce(string_agg(supports || ':' || CASE WHEN withdrawn_at IS NULL THEN 'current' ELSE 'withdrawn' END, ',' ORDER BY withdrawn_at NULLS LAST), '') FROM value_outcome_evidence WHERE value_outcome_id = '$1' AND evidence_id = '$2'"; }
seals() { q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE r.id IN ('$R1', '$R2')"; }

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc.log")"
(cd client && npx tsc -b) > "$W/tsc2.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc2.log")"

step "2. Clone the prod copy; migrate; harden (no migration: hardening's errata guard and lineage only)"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "167" ] && ok "167 triggers (C2c adds none)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"

step "3. Fixtures and the server: the Curia mistake, built through the routes"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', 'x.$TS@c2c.example') RETURNING id" | head -1)"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
start_server && ok "API up on $PORT"
expect POST /api/account-inputs "$(J institution "$(J name "C2c fixture account (invented) $TS" industry_slug manufacturing classification_note 'Verification: classified for C2c.')" persons "[$(J full_name 'C2c owner (invented)' email "owner.$TS@c2c.example" title Owner)]")" 201 "a fixture account in Curia's shape"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'C2c capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...its offering"
OUTC() { J engagement_name "C2c engagement $1" engagement_owner_person_id "$OWNER" capability_name 'C2c capability' metric "$(J name "C2c days to productivity $1" unit 'days.' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 214 baseline_measured_at 2025-09-30T00:00:00Z; }
EVB() { J kind public_filing provenance "$3" summary "$1" supports "$2" source_verified true ai_sourced false simulated false evidence_form quote quote_text "$4" how_read 'Read as published (fixture).'; }
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTC reference)" 201 "the reference engagement's outcome"
O="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"; METRIC="C2c days to productivity reference"
expect POST "/api/value-outcomes/$O/evidence" "$(EVB 'C2c mean 214 days to productivity (fixture)' baseline 'Fixture HR extract (not a source)' 'Mean 214 days from promotion to full productivity.')" 201 "  ...its own baseline evidence"
EV_OWN="$(rj b.evidence_id)"
TENANT_FILING="Tenant Q1 FY2027 quarterly DRR 105 percent (fixture, about the tenant)"
expect POST "/api/value-outcomes/$O/evidence" "$(EVB "$TENANT_FILING" impact_basis 'Fixture tenant filing (not a source)' 'Quarterly DRR 105 percent.')" 201 "  ...a filing about the tenant, as its impact basis (as Curia run 21 seals Skillsoft's DRR filing)"
EV_T="$(rj b.evidence_id)"
expect POST "/api/engagements/$ENG/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note 'Verification: run 1.' source_fixture c2c)" 201 "  ...run 1"
R1="$(rj b.value_run_id)"; expect POST "/api/value-runs/$R1/lock" "$(J lock_reason 'Verification: run 1 sealed.')" 200 "  ...locked"
expect POST "/api/engagements/$ENG/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note 'Verification: run 2.' source_fixture c2c)" 201 "  ...run 2"
R2="$(rj b.value_run_id)"; expect POST "/api/value-runs/$R2/lock" "$(J lock_reason 'Verification: run 2 sealed.')" 200 "  ...locked"
expect POST "/api/engagements/$ENG/retire" "$(J retirement_reason 'Verification: the reference engagement retired, as Curia'"'"'s was.')" 200 "  ...the reference engagement retired"
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTC live)" 201 "  ...a later, live engagement with an outcome (the walk shows it)"
SEALS0="$(seals)"
CS() { printf '/api/value-outcomes/%s/evidence/%s/correct-support' "$1" "$2"; }
WD() { printf '/api/value-outcomes/%s/evidence/%s/withdraw' "$1" "$2"; }
expect POST "$(CS "$O" "$EV_T")" "$(J supports baseline reason 'Run 14 sealed the owner’s commitment attestation as supporting the impact basis.')" 201 "THE MISTAKE: the tenant's filing corrected to the baseline, with an erratum's wording (as on prod, 17:01)"
[ "$(link_of "$O" "$EV_T")" = "impact_basis:withdrawn,baseline:current" ] && ok "  ...a filing about the tenant now supports this outcome's baseline" || bad "  ...links: $(link_of "$O" "$EV_T")"
expect POST "$(CS "$O" "$EV_T")" "$(J supports impact_basis reason 'Verification: put it back to the impact basis.')" 409 "  ...and it cannot be corrected back (why C2c exists)" "a withdrawn link is not recorded again"

step "4. The withdraw route (C2c ruling 1)"
expect POST "$(WD "$O" "$EV_T")" "$(J reason 'Verification: X withdraws it.')" 403 "X withdraws a link" "steward" "$X"
expect POST "$(WD "$O" "$EV_T")" "$(J reason 'Verification: an extra field.' supports actual)" 400 "an unknown field" "body.supports is not a field of this request"
expect POST "$(WD "$O" "$EV_T")" "$(J reason 'Too short')" 422 "a 9-character reason" "Say why the link is withdrawn, in at least 12 characters."
expect POST "$(WD "$O" "$(q "SELECT gen_random_uuid()")")" "$(J reason 'Verification: no such link here.')" 404 "no such link" "no current link of evidence"
[ "$(link_of "$O" "$EV_T")" = "impact_basis:withdrawn,baseline:current" ] && ok "  ...none of them wrote" || bad "  ...links: $(link_of "$O" "$EV_T")"
# B8 — the route's steward check removed: the database refuses X.
edit "$CORR" "  router.post('/:outcomeId/evidence/:evidenceId/withdraw', requireSteward(pool), async" "  router.post('/:outcomeId/evidence/:evidenceId/withdraw', async"
stop_server; start_server
expect POST "$(WD "$O" "$EV_T")" "$(J reason 'Verification: B8, X withdraws it.')" 422 "B8: without the route's check, X's withdrawal → the database refuses" "only the tenant's steward withdraws a link" "$X"
restore "$CORR"
# B9 — the route's act removed: the deferred act check refuses the commit.
python3 - "$CORR" <<'PY'
import re, sys; p = sys.argv[1]; s = open(p).read()
a = re.search(r"      await recordAct\(client, req, 'POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/withdraw', \{.*?\n      \}\);\n", s, re.S).group(0)
open(p, 'w').write(s.replace(a, ''))
PY
stop_server; start_server
req POST "$(WD "$O" "$EV_T")" "$(J reason 'Verification: B9, no act recorded.')"
[ "$CODE" != "200" ] && said | grep -q "a withdrawal with no governance act recorded in this transaction" && [ "$(link_of "$O" "$EV_T")" = "impact_basis:withdrawn,baseline:current" ] && ok "B9: the withdrawal with no act → refused ($CODE: \"a withdrawal with no governance act recorded in this transaction\"), nothing written" || bad "B9: $CODE $(said) $(link_of "$O" "$EV_T")"
grep -q "COMMIT failed; the write was not saved. POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/withdraw · sqlstate 23514 · rule governance_act_present" "$W/server.log" && ok "  ...the journal names it, without values: \"COMMIT failed … rule governance_act_present\"; the response: \"a withdrawal with no governance act recorded in this transaction\"" || bad "  ...$(grep -m1 'COMMIT\|governance' "$W/server.log")"
restore "$CORR"; stop_server; start_server

step "5. The run page, in the browser: two controls apart; one erratum per double click; the withdrawal, confirmed first"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
login() { curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$1\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}'; }
TOKEN="$(login "$S_EMAIL")"
[ -n "$TOKEN" ] && ok "the steward signed in by session" || { bad "no session"; exit 1; }
WHY="Verification: a filing about the tenant is not this account's baseline; withdrawn with no replacement (C2c)."
cw() {  # MODE RUN [LOG]
  local log="$W/walk.${3:-$1}.log"
  LINK="$TENANT_FILING" METRIC="$METRIC" RUNS=2 WHY="$WHY" node scripts/lib/c2c_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" "$2" > "$log" 2>&1; local rc=$?
  if [ -z "${3:-}" ]; then
    PASS=$((PASS + $(grep -c '^  PASS' "$log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$log" || true)))
    grep -E '^  (PASS|FAIL)' "$log" || true
    [ "$rc" = "0" ] || bad "the $1 walk exited $rc (see $log)"
  fi
}
cw sections "$R2"
# B11 — the controls without their lines.
edit "$BENCH" '<span className="font-semibold text-ink">This run</span> — records, beside this sealed run, what it got wrong; it changes no link and no score.' ''
sleep 3; cw sections "$R2" b11
grep -q "^  FAIL  the erratum control reads" "$W/walk.b11.log" && ok "B11: the erratum control without its line → caught" || bad "B11: not caught: $(grep -m2 -E 'FAIL|PASS' "$W/walk.b11.log")"
restore "$BENCH"
sleep 3; cw erratum1 "$R1"
[ "$(q "SELECT count(*) FROM run_errata WHERE value_run_id = '$R1'")" = "1" ] && ok "  ...one erratum recorded on run 1" || bad "  ...run 1 errata: $(q "SELECT count(*) FROM run_errata WHERE value_run_id = '$R1'")"
# B12 — the one-request guard removed: a double click sends two requests.
edit "$FORM" "    if (inFlight.current || blockedLocally || !actor || !canSubmit || submitting) return;
    if (confirm && !confirming)" "    if (blockedLocally || !actor || !canSubmit || submitting) return;
    if (confirm && !confirming)"
edit "$FORM" "    if (inFlight.current || blockedLocally || !actor || !canSubmit) return;" "    if (blockedLocally || !actor || !canSubmit) return;"
sleep 3; cw erratum1 "$R2" b12
grep -q "^  FAIL  a double click on \"Record the erratum\" sends one request — 2 sent" "$W/walk.b12.log" && ok "B12: without the guard, a double click → caught: 2 requests sent" || bad "B12: not caught: $(grep -m2 -E 'FAIL|PASS  a double' "$W/walk.b12.log")"
[ "$(q "SELECT count(*) FROM run_errata WHERE value_run_id = '$R2'")" = "1" ] && ok "  ...(the second refused by one-erratum-per-correction: one recorded on run 2)" || bad "  ...run 2 errata: $(q "SELECT count(*) FROM run_errata WHERE value_run_id = '$R2'")"
restore "$FORM"

step "6. A supersession reason that repeats the erratum: refused (C2c ruling 4)"
E1="$(q "SELECT id FROM run_errata WHERE value_run_id = '$R1'")"
OWN_REASON="$(q "SELECT reason FROM run_errata WHERE id = '$E1'")"
SUPB() { J evidence_id "$EV_T" what_was_wrong "The tenant's own filing was sealed as support for this outcome's impact basis." what_is_right "It is a filing about the vendor, not about this account's figure." reason "$1" supersedes_erratum_id "$E1" supersession_reason "$2"; }
expect POST "/api/value-runs/$R1/errata" "$(SUPB 'Verification: a second erratum, for C2c.' "$OWN_REASON")" 422 "a supersession whose reason is the superseded erratum's own reason" "The reason for superseding repeats the erratum's own text"
expect POST "/api/value-runs/$R1/errata" "$(SUPB 'Verification: the same words, twice over.' '  verification: THE SAME words,   twice over ')" 422 "  ...or this erratum's own reason, in other case and spacing" "repeats the erratum's own text"
# B13 — the route's check removed: the database refuses.
edit "$CORR" "        if ([texts.wrong, texts.right, texts.reason, prev?.what_was_wrong, prev?.what_is_right, prev?.reason].some((t) => sameText(supersessionReason, t))) {" "        if (false) {"
stop_server; start_server
expect POST "/api/value-runs/$R1/errata" "$(SUPB 'Verification: a second erratum, for C2c.' "$OWN_REASON")" 422 "B13: without the route's check → the database refuses" "the reason for superseding repeats the erratum's own text"
restore "$CORR"; stop_server; start_server
# B14 — the database's check removed too (on the clone): the repeating reason is accepted.
SUP_SQL="INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, evidence_id, corrected_to_supports, supersedes_id, supersession_reason, what_was_wrong, what_is_right, reason, model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, recorded_by_person_id) SELECT tenant_id, value_run_id, value_outcome_id, evidence_id, corrected_to_supports, id, reason, what_was_wrong, what_is_right, 'Verification: a later erratum.', model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, recorded_by_person_id FROM run_errata WHERE id = '$E1'"
sqlrefused "the repeating reason, at the database" "$SUP_SQL" "the reason for superseding repeats the erratum's own text"
fnbreak lvrf_run_erratum_steward_only "  IF NEW.supersedes_id IS NOT NULL AND lvrf_same_text(" "  IF false AND lvrf_same_text("
[ "$(sqlaccepted "$SUP_SQL")" = "ACCEPTED" ] && ok "B14: the database's check removed → caught: the repeating reason is accepted (rolled back)" || bad "B14: $(sqlaccepted "$SUP_SQL")"
reharden
sqlrefused "  ...and refused again" "$SUP_SQL" "the reason for superseding repeats the erratum's own text"
expect POST "/api/value-runs/$R1/errata" "$(SUPB 'Verification: a second erratum, for C2c.' 'Verification: the first erratum named the filing too loosely.')" 201 "a supersession that says why the earlier erratum is superseded: recorded"

step "7. The withdrawal, from run 2's page (the Curia mistake undone)"
cw withdraw "$R2"
[ "$(link_of "$O" "$EV_T")" = "impact_basis:withdrawn,baseline:withdrawn" ] && ok "in the database: the tenant's filing has no current link to the outcome (both withdrawn)" || bad "links: $(link_of "$O" "$EV_T")"
[ "$(q "SELECT (withdrawn_by_person_id = '$S') || '|' || withdrawal_reason FROM value_outcome_evidence WHERE value_outcome_id = '$O' AND evidence_id = '$EV_T' AND supports = 'baseline'")" = "true|$WHY" ] && ok "  ...withdrawn by the steward, with the reason" || bad "  ...withdrawal row"
[ "$(q "SELECT count(*) || '|' || string_agg(act::text || ':' || (actor_person_id = '$S'), ',') FROM governance_acts WHERE subject_id = '$O' AND result_id = '$EV_T' AND act = 'withdraw'")" = "1|withdraw:true" ] && ok "  ...with its own act: withdraw, by the steward (P2)" || bad "  ...acts: $(q "SELECT act, count(*) FROM governance_acts WHERE subject_id = '$O' GROUP BY 1")"
[ "$(seals)" = "$SEALS0" ] && ok "  ...runs 1 and 2 byte-identical (md5 of each row)" || bad "  ...a run changed"
cw shared "$R1"
expect GET "/api/lineage/value_outcomes/$O?figure=baseline" "" 200 "the outcome's baseline lineage"
LIN="$(rj "b.steps.filter(s=>s.row_table==='value_outcome_evidence').map(s=>s.kind+':'+s.source+':'+(s.detail.supports||'')).join(',')")"
printf '%s' "$LIN" | grep -q "correct:act:baseline" && printf '%s' "$LIN" | grep -q "withdrawn:act:baseline" \
  && ok "  ...it reads the correction to the baseline, and its withdrawal, each from its own act (matched by evidence and moment): $LIN" || bad "  ...lineage: $LIN"

step "8. B10: the run page's withdraw form without its confirmation (the last, as it writes)"
edit "$BENCH" '            confirm={chosen && <span data-testid="confirm-text">Withdraw “' '            data-c2c-b10={chosen && <span data-testid="confirm-text">Withdraw “'
sleep 3; LINK_B10="C2c mean 214 days to productivity (fixture)"
LINK="$LINK_B10" METRIC="$METRIC" RUNS=2 WHY="Verification: B10, sent at once." node scripts/lib/c2c_walk.mjs confirm0 "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" "$R2" > "$W/walk.b10.log" 2>&1 || true
grep -q "^  FAIL    ...nothing is sent yet — 1 sent" "$W/walk.b10.log" && ok "B10: no confirmation → caught: the request went on the first press" || bad "B10: not caught: $(grep -m3 -E 'FAIL|PASS' "$W/walk.b10.log")"
restore "$BENCH"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
