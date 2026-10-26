#!/usr/bin/env bash
#
# C1 — correcting what a link supports; errata on sealed runs (LVRF_PLAN §9;
# migration 0040; hardening.sql section 26; Brad's ruling and C1-D1–D4, 25 Oct
# 2026). Local verification.
#
#   ./scripts/verify_corrections.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data
# neutralised, migrated to the latest) to `lvrf_verifycorr` with make_clone,
# hardened, dropped on exit.
# L39 (25 Oct 2026): the script builds its own fixtures and asserts on them, never on what prod
# holds. Scotts' shape is rebuilt through the routes on a fixture account ("Correction walk
# account (fixture)"): one engagement whose outcome sealed another company's filing as its
# baseline, in run 1 and again in run 2 (beside its own filing), then retired. Its link is
# corrected and its two runs given errata in a browser signed in by SESSION, as Brad did on prod.
# Other fixtures are invented ("Correction check account (fixture)"). Every write goes through the
# routes except the attempts the database must refuse, each in a transaction rolled back.
# DELIBERATE BREAKS, every file restored byte-identical and every function
# restored by re-applying hardening.sql:
#   B1  the erratum route's steward check removed: the database still refuses
#   B2  an UPDATE and a DELETE of an erratum
#   B3  a withdrawal with an 11-character reason
#   B4  a withdrawal with who but no when
#   B5  produce-run's withdrawn_at filter removed: a withdrawn link is sealed
#   B6  the vendor trigger's body removed (on the clone): a vendor baseline accepted
#   B7  the frozen-outcome guard relaxed (on the clone): a new link on a retired engagement accepted
#   B8  the erratum taken out of the printed header: the printed pages lose it
#   B9  a typed recompute score sent in the erratum body: refused
#   B10 (C1-D1) the correction route inserting before it withdraws: refused by the one-current index
#   B11 (C1-D3) a run sealed under another model version: the recompute refused
#   B12 (C1 review) the route's one-erratum-per-correction check removed: the unique index refuses
#   B13 (L39) the POV's correction note shown on vendor claims only: the corrected filing's line loses it
#   B14 (L39) the printed erratum line showing the sealed score as the recompute: run 1's pages catch it

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

VERIFY_DB=lvrf_verifycorr
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3098; VITE_PORT=5198; CDP_PORT=9358
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_corr.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
CORR=server/routes/corrections.ts; PRODUCE=server/routes/produceRun.ts; BENCH=client/src/components/workbench/Workbench.tsx; MODEL=server/spine/confidenceModel.ts
POVP=client/src/pages/PovPage.tsx
EDITED=("$CORR" "$PRODUCE" "$BENCH" "$MODEL" "$POVP")
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
# A write the database must refuse: in a transaction rolled back, as the actor named; print the error text.
sqlrefused() {  # LABEL SQL EXPECTED_SUBSTRING [ACTOR]
  local out; out="$(printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nROLLBACK;\n" "${4:-$S}" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
# A write that must SUCCEED (a break shown): in a transaction rolled back; prints ACCEPTED or the error.
sqlaccepted() {  # SQL [ACTOR]
  printf "BEGIN;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSELECT 'ACCEPTED';\nROLLBACK;\n" "${2:-$S}" "$1" | psql -X -q -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 | grep -E 'ACCEPTED|ERROR' | head -1 || true
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
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
# A hardening.sql function, with one piece of its body replaced, applied to the clone only.
fnbreak() {  # FUNCTION OLD NEW
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
    && ok "  ...hardening.sql re-applied: the function as declared, 167 triggers (with P2's section 27)" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
seals() { q "SELECT string_agg(r.id || ':' || md5(r::text), ' ' ORDER BY r.run_number) FROM value_runs r WHERE r.id IN ('$R1', '$R2')"; }

step "1. Typecheck"
npx tsc --noEmit -p . > "$W/tsc.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc.log")"
(cd client && npx tsc -b) > "$W/tsc2.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc2.log")"

step "2. Clone the prod copy; migrate (to the latest); harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT count(*) FROM value_runs")"
HASH0="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
printf '%s' "$HASH0" | grep -qE "^$RUNS0 runs: recompute matches $RUNS0, differs 0; embedded payloadHash matches $RUNS0, differs 0" && ok "before: check_run_hashes $HASH0" || bad "hashes before: $HASH0"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (through 0040_corrections and later)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "167" ] && ok "167 triggers by pg_trigger (135 + section 26's six + P2's 26)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
# (0040 orphaning nothing and leaving Scotts' runs byte-identical was proven at C1's Gate A, on a copy
# taken before it; prod has been past 0040 since. L39: nothing here reads what prod holds.)

step "3. Every reader of the link table filters on withdrawn_at (a code grep: a missed reader fails)"
python3 - > "$W/grep.txt" <<'PY'
import re, glob
files = sorted(glob.glob('server/**/*.ts', recursive=True)) + ['db/hardening.sql']
# Reads that are meant to see every link, whatever its state — named, each with its reason.
EXEMPT = {
  ('db/hardening.sql', 'l.supports = NEW.corrects_supports'): 'the guard: a correction names a predecessor in any state',
  # P2 (0041): lineage shows withdrawn links on purpose (struck through, with who and why); the act
  # guard asks only whether the link named exists, in any state.
  ('db/hardening.sql', 'l.evidence_id = NEW.result_id'): 'the act guard: the link an act names exists',
  ('db/hardening.sql', 'v.evidence_id = p_evidence'): 'lineage: every link of the evidence, withdrawn ones shown as withdrawn',
  ('db/hardening.sql', 'WHERE evidence_id = p_id) lo'): 'lineage: every outcome the evidence was ever linked to, for the runs that sealed it',
  ('db/hardening.sql', 'v.supports = p_figure OR v.corrects_supports = p_figure'): "lineage: every link of the outcome's figure, withdrawn ones shown as withdrawn",
}
bad = []; n = 0
for f in files:
    s = open(f).read()
    for m in re.finditer(r'(FROM|JOIN)\s+value_outcome_evidence\b', s):
        n += 1
        window = s[m.start(): m.start() + 700]
        stmt = re.split(r';|`\s*,|`\)', window)[0]
        if 'withdrawn_at' in stmt: continue
        if any(f == ef and key in stmt for (ef, key) in EXEMPT): continue
        bad.append(f"{f}:{s[:m.start()].count(chr(10)) + 1}")
    for m in re.finditer(r'\.from\(schema\.valueOutcomeEvidence\)', s):
        n += 1
        if 'withdrawnAt' not in s[m.start(): m.start() + 500]: bad.append(f"{f}:{s[:m.start()].count(chr(10)) + 1}")
print(n, ' '.join(bad))
PY
read -r NREADS UNFILTERED < <(cat "$W/grep.txt"; echo) || true
[ -z "${UNFILTERED:-}" ] && [ "${NREADS:-0}" -ge 15 ] && ok "$NREADS reads of value_outcome_evidence in server/ and hardening.sql: every one filters on withdrawn_at, or is a named exemption (C1's guard; P2's act guard and lineage, which show withdrawn links)" \
  || bad "a reader without the filter: ${UNFILTERED:-} (of $NREADS)"

step "4. Fixtures and the server"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@corrections.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
SELF="$(q "SELECT id FROM institutions WHERE tenant_id = '$TEN' AND is_tenant_self AND deleted_at IS NULL LIMIT 1")"
O_SELF="$(q "SELECT vo.id FROM value_outcomes vo JOIN engagements g ON g.id = vo.engagement_id WHERE vo.institution_id = '$SELF' AND g.deleted_at IS NULL AND g.superseded_by_id IS NULL ORDER BY vo.created_at LIMIT 1")"
for v in S X TEN SELF O_SELF; do [ -n "${!v}" ] || { bad "fixture $v empty"; exit 1; }; done
ok "S = $S_NAME (steward), X (authorized, not the steward); the tenant's own account"
start_server && ok "API up on $PORT"
EVB() { printf '{"kind":"%s","provenance":"Fixture %s (not a source)","summary":"%s","supports":"%s","source_verified":%s,"ai_sourced":false,"simulated":false,"evidence_form":"quote","quote_text":"Our total recordable incident rate was 1.4 in FY25.","how_read":"The FY25 TRIR, from the fixture report, read as published."}' "$1" "$2" "$3" "$4" "${5:-false}"; }
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Correction check account (fixture) $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for C1.\"},\"persons\":[{\"full_name\":\"Fixture owner (invented)\",\"email\":\"owner.$TS@corrections.example\",\"title\":\"Owner\"}]}" 201 "a fixture account, with a customer-side owner"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
expect POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Correction capability\",\"owner_person_id\":\"$OWNER\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "  ...an offering attached, with its capability"
OUTB() { printf '{"engagement_name":"Correction engagement %s","engagement_owner_person_id":"%s","capability_name":"%s","metric":{"name":"Correction TRIR %s","unit":"incidents per 200,000 hours.","direction":"decrease","source_system":"verification system of record","owner_person_id":"%s"},"baseline_value":1.4,"baseline_measured_at":"2025-09-30T00:00:00Z"}' "$1" "$2" "${3:-Correction capability}" "$1" "$2"; }
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTB one "$OWNER")" 201 "a fixture outcome (engagement open)"
O_F="$(rj b.value_outcome_id)"; ENG_F="$(rj b.engagement_id)"
expect POST "/api/value-outcomes/$O_F/evidence" "$(EVB public_filing filing 'TRIR FY25 (fixture)' baseline true)" 201 "  ...its baseline evidence, source-verified"
EV_F="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$O_F/evidence" "$(EVB public_filing extract 'TRIR FY25 second source (fixture)' baseline)" 201 "  ...a second baseline item (for the SQL breaks)"
EV_F2="$(rj b.evidence_id)"

# L39 — Scotts' shape, built here: an account whose one engagement sealed another company's filing
# as its baseline (run 1, the only baseline item; run 2, beside the account's own filing), then retired.
WRONG="Another company's TRIR filing (fixture), linked as baseline in error"
expect POST /api/account-inputs "{\"institution\":{\"name\":\"Correction walk account (fixture) $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for C1 (L39).\"},\"persons\":[{\"full_name\":\"Fixture walk owner (invented)\",\"email\":\"walk.$TS@corrections.example\",\"title\":\"Owner\"}]}" 201 "the walk fixture account (Scotts' shape, L39)"
INST_W="$(rj b.institution_id)"; OWNER_W="$(rj b.person_ids[0])"
expect POST "/api/institutions/$INST_W/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Correction capability\",\"owner_person_id\":\"$OWNER_W\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}" 201 "  ...its offering"
CAP_W="$(rj b.capability_id)"
expect POST "/api/institutions/$INST_W/value-outcomes" "$(OUTB walk "$OWNER_W")" 201 "  ...its one outcome"
O_S="$(rj b.value_outcome_id)"; ENG_W="$(rj b.engagement_id)"; MET_W="$(rj b.business_metric_id)"
# The POV shows an outcome's evidence under its hypothesis, as Scotts' is: a pack entry, its lever,
# the capability's claim, the metric's basis and a hypothesis, each through its route.
IND_W="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
E_W="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation) VALUES ('$TEN', '$IND_W', 'Correction TRIR entry (fixture)', 'incidents per 200,000 hours', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders: plant mix, seasonality.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
expect POST "/api/capabilities/$CAP_W/industry-measures" "{\"industry_measure_id\":\"$E_W\",\"claim\":\"Verification: training reduces incidents.\"}" 201 "  ...the capability claims a fixture pack entry"
expect POST "/api/industry-measures/$E_W/levers" '{"name":"Hazard recognition (fixture)","mechanism":"Crews trained to recognise hazards stop unsafe tasks earlier.","leading_indicator":"Near-miss reports","citation":"Verification citation, not a source."}' 201 "  ...a lever on it (the steward)"
L_W="$(rj b.value_lever_id)"
expect POST "/api/business-metrics/$MET_W/pack-basis" "{\"industry_measure_id\":\"$E_W\",\"basis_note\":\"Verification: the same rate.\"}" 201 "  ...the metric based on the entry"
expect POST "/api/institutions/$INST_W/hypotheses" "{\"value_outcome_id\":\"$O_S\",\"value_lever_id\":\"$L_W\",\"statement\":\"Frontline hazard recognition reduces recordable injuries at this account.\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 365, 'YYYY-MM-DD')")\",\"falsifier_conditions\":\"on the same denominator, among the covered population\"}" 201 "  ...a hypothesis on the outcome"
expect POST "/api/value-outcomes/$O_S/evidence" "$(EVB public_filing 'other company filing' "$WRONG" baseline true)" 201 "  ...another company's filing linked as its baseline (the error), source-verified"
EV_V="$(rj b.evidence_id)"
expect POST "/api/engagements/$ENG_W/produce-run" '{"banner_title":"OUTSIDE-IN HYPOTHESIS","note":"Verification: run 1, the wrong link its only baseline.","source_fixture":"corrections"}' 201 "  ...run 1"
R1="$(rj b.value_run_id)"
expect POST "/api/value-runs/$R1/lock" '{"lock_reason":"Verification: run 1 sealed."}' 200 "  ...run 1 locked"
expect POST "/api/value-outcomes/$O_S/evidence" "$(EVB public_filing 'own filing' 'TRIR FY25 own filing (fixture)' baseline true)" 201 "  ...the account's own filing, as the baseline too"
EV_B="$(rj b.evidence_id)"
expect POST "/api/engagements/$ENG_W/produce-run" '{"banner_title":"OUTSIDE-IN HYPOTHESIS","note":"Verification: run 2, both baseline items.","source_fixture":"corrections"}' 201 "  ...run 2"
R2="$(rj b.value_run_id)"
expect POST "/api/value-runs/$R2/lock" '{"lock_reason":"Verification: run 2 sealed."}' 200 "  ...run 2 locked"
expect POST "/api/engagements/$ENG_W/retire" '{"retirement_reason":"Verification: retired, as Scotts was."}' 200 "  ...the engagement retired"
SEALS0="$(seals)"

step "5. The vendor trigger: a vendor publication about another company supports the impact basis only"
expect POST "/api/value-outcomes/$O_F/evidence" "$(EVB vendor_publication 'vendor case study' 'Vendor case study (fixture)' baseline)" 422 "a vendor publication on a customer account as the baseline, at the route" "it may support the impact basis only"
expect POST "/api/value-outcomes/$O_F/evidence" "$(EVB vendor_publication 'vendor case study' 'Vendor case study (fixture)' actual)" 422 "  ...as the actual" "vendor-published evidence may not support a measured actual"
expect POST "/api/value-outcomes/$O_F/evidence" "$(EVB vendor_publication 'vendor case study' 'Vendor case study (fixture)' impact_basis)" 201 "  ...as the impact basis: accepted"
EV_VEN="$(rj b.evidence_id)"
VEN_SQL() { printf "WITH e AS (INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form, quote_text, how_read) VALUES ('%s', 'vendor_publication', 'v', 'Verification vendor fixture', '%s', 'quote', 'Customers cut incidents by 75%%.', 'The vendor fixture headline, read as written.') RETURNING id) INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) SELECT '%s', id, '%s' FROM e" "$1" "$S" "$2" "$3"; }
sqlrefused "the same, at the database (baseline)" "$(VEN_SQL "$INST" "$O_F" baseline)" "it may support the impact basis only"
# The tenant's own account has only simulated customer persons, so no outcome can be opened there through
# the route; its existing outcome (engagement open) takes the link, in a transaction rolled back.
[ "$(sqlaccepted "$(VEN_SQL "$SELF" "$O_SELF" baseline)")" = "ACCEPTED" ] && ok "on the tenant's own account, a vendor publication about the vendor itself as its baseline: accepted (it is about itself)" || bad "tenant's own: $(sqlaccepted "$(VEN_SQL "$SELF" "$O_SELF" baseline)")"

step "6. C1-D1 at the database: one current link; a correction inserted before the withdrawal is refused"
CORR_SQL() { printf "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports, corrects_supports, corrected_by_person_id, correction_reason) VALUES ('%s', '%s', '%s', '%s', '%s', 'Verification: inserted before the withdrawal.')" "$1" "$2" "$3" "$4" "${5:-$S}"; }
sqlrefused "insert-before-withdraw on the walk fixture's wrong link (the correction, its predecessor still current)" "$(CORR_SQL "$O_S" "$EV_V" impact_basis baseline)" "value_outcome_evidence_one_current"
sqlrefused "insert-before-withdraw on a fixture link" "$(CORR_SQL "$O_F" "$EV_F" impact_basis baseline)" "value_outcome_evidence_one_current"
sqlrefused "a correction by X, not the steward" "UPDATE value_outcome_evidence SET withdrawn_by_person_id = '$S', withdrawn_at = now(), withdrawal_reason = 'Verification: withdrawn first.' WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F'; $(CORR_SQL "$O_F" "$EV_F" impact_basis baseline "$X")" "only the tenant's steward corrects what a link supports"
sqlrefused "a correction naming a support no link of it had" "UPDATE value_outcome_evidence SET withdrawn_by_person_id = '$S', withdrawn_at = now(), withdrawal_reason = 'Verification: withdrawn first.' WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F'; $(CORR_SQL "$O_F" "$EV_F" impact_basis actual)" "none supports actual"
sqlrefused "a link inserted already withdrawn" "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports, withdrawn_by_person_id, withdrawn_at, withdrawal_reason) VALUES ('$O_F', '$EV_F2', 'actual', '$S', now(), 'Verification: born withdrawn.')" "a link is recorded current"
sqlrefused "a withdrawal by X" "UPDATE value_outcome_evidence SET withdrawn_by_person_id = '$X', withdrawn_at = now(), withdrawal_reason = 'Verification: X withdraws it.' WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F2'" "only the tenant's steward withdraws a link" "$X"
sqlrefused "an edit of supports" "UPDATE value_outcome_evidence SET supports = 'impact_basis' WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F2'" "a link is never edited"
sqlrefused "B3: a withdrawal with an 11-character reason" "UPDATE value_outcome_evidence SET withdrawn_by_person_id = '$S', withdrawn_at = now(), withdrawal_reason = 'Eleven char' WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F2'" "value_outcome_evidence_withdrawal_complete"
sqlrefused "B4: a withdrawal with who but no when" "UPDATE value_outcome_evidence SET withdrawn_by_person_id = '$S', withdrawal_reason = 'Verification: who, and no when.' WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F2'" "value_outcome_evidence_withdrawal_complete"
sqlrefused "a DELETE of a link" "DELETE FROM value_outcome_evidence WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F2'" "hard DELETE is prohibited"

step "7. The correction route: the steward's, in plain words"
CS() { printf '/api/value-outcomes/%s/evidence/%s/correct-support' "$1" "$2"; }
REF0="$(q "SELECT count(*) FROM refusals")"; WD0="$(q "SELECT count(*) FROM value_outcome_evidence WHERE withdrawn_at IS NOT NULL")"
expect POST "$(CS "$O_F" "$EV_F")" '{"supports":"impact_basis","reason":"Verification: X tries to correct it."}' 403 "X corrects a link" "steward" "$X"
expect POST "$(CS "$O_F" "$EV_F")" '{"supports":"impact_basis","reason":"Verification: an extra field.","withdrawn_at":"2026-01-01"}' 400 "an unknown field" "body.withdrawn_at is not a field of this request"
expect POST "$(CS "$O_F" "$EV_F")" '{"supports":"baseline","reason":"Verification: no change at all."}' 422 "the same support" "This link already supports the baseline; there is nothing to correct."
expect POST "$(CS "$O_F" "$EV_F")" '{"supports":"impact_basis","reason":"Too short"}' 422 "an 9-character reason" "in at least 12 characters"
expect POST "$(CS "$O_F" "$EV_F")" '{"supports":"attach","reason":"Verification: not a support value."}' 422 "an unknown support" "the baseline, the actual, the impact basis, the commitment or the verification"
expect POST "$(CS "$O_F" "$(q "SELECT gen_random_uuid()")")" '{"supports":"impact_basis","reason":"Verification: no such link."}' 404 "no such link" "no current link of evidence"
[ "$(q "SELECT count(*) FROM refusals")" -ge "$((REF0 + 4))" ] && ok "  ...the refusals recorded" || bad "  ...refusals $(q "SELECT count(*) FROM refusals") (was $REF0)"
[ "$(q "SELECT count(*) FROM value_outcome_evidence WHERE withdrawn_at IS NOT NULL")" = "$WD0" ] && ok "  ...nothing withdrawn by any of them" || bad "  ...a refused request withdrew a link"
expect POST "$(CS "$O_F" "$EV_F")" '{"supports":"impact_basis","reason":"Verification: this filing bases the impact, not the baseline."}' 201 "the steward corrects a fixture link (baseline → impact basis), engagement open"
[ "$(q "SELECT supports || '|' || (withdrawn_by_person_id = '$S') || '|' || (withdrawn_at::date = now()::date) || '|' || withdrawal_reason FROM value_outcome_evidence WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F' AND withdrawn_at IS NOT NULL")" = "baseline|true|true|Verification: this filing bases the impact, not the baseline." ] \
  && ok "  ...the old link withdrawn: who (the steward), when (today), why" || bad "  ...withdrawn row"
[ "$(q "SELECT supports || '|' || corrects_supports || '|' || (corrected_by_person_id = '$S') FROM value_outcome_evidence WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F' AND withdrawn_at IS NULL")" = "impact_basis|baseline|true" ] \
  && ok "  ...the new link current: impact_basis, correcting baseline, by the steward" || bad "  ...current row"
[ "$(q "SELECT count(*) FROM value_outcome_evidence WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F'")|$(q "SELECT count(*) FROM value_outcome_evidence WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F' AND withdrawn_at IS NULL")" = "2|1" ] \
  && ok "  ...two rows for the one piece of evidence, one current (C1-D1)" || bad "  ...rows"
expect POST "$(CS "$O_F" "$EV_F")" '{"supports":"baseline","reason":"Verification: back to what it was."}' 409 "correcting it back to the withdrawn support" "a withdrawn link is not recorded again"
sqlrefused "a second withdrawal of the withdrawn link" "UPDATE value_outcome_evidence SET withdrawal_reason = 'Verification: a better reason.' WHERE value_outcome_id = '$O_F' AND evidence_id = '$EV_F' AND withdrawn_at IS NOT NULL" "a withdrawal is final"

step "8. The readers: a withdrawn link supports nothing"
expect GET "/api/institutions/$INST/pov" "" 200 "the POV"
[ "$(rj "(()=>{const o=b.outcomes.find(o=>o.id==='$O_F');const e=o.evidence.filter(e=>e.evidence_id==='$EV_F');return e.length+'|'+e[0].supports+'|'+e[0].corrects_supports+'|'+o.withdrawn_links.length+'|'+o.withdrawn_links[0].supports})()")" = "1|impact_basis|baseline|1|baseline" ] \
  && ok "  ...lists the evidence once, as impact basis (corrected from baseline), and the withdrawn link apart" || bad "  ...POV: $(rj "JSON.stringify(b.outcomes.find(o=>o.id==='$O_F').evidence.map(e=>e.supports))")"
expect GET "/api/institutions/$INST/walk" "" 200 "the walk"
[ "$(rj "(()=>{const o=b.engagements.flatMap(e=>e.outcomes).find(o=>o.id==='$O_F');return o.evidence.filter(e=>e.id==='$EV_F').map(e=>e.supports).join(',')+'|'+o.withdrawn_links.map(l=>l.supports).join(',')})()")" = "impact_basis|baseline" ] \
  && ok "  ...the same: current impact_basis; withdrawn baseline" || bad "  ...walk"
expect GET "/api/value-outcomes/$O_F/gaps" "" 200 "the gap register"
GAPS="$(cat "$W/r.json")"
expect POST "/api/engagements/$ENG_F/produce-run" '{"banner_title":"CORRECTION CHECK","note":"Verification: a run after a correction.","source_fixture":"corrections"}' 201 "a run produced after the correction"
RF1="$(rj b.value_run_id)"
[ "$(q "SELECT string_agg(x->>'supports', ',' ORDER BY x->>'supports') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$RF1' AND x->>'summary' = 'TRIR FY25 (fixture)'")" = "impact_basis" ] \
  && ok "  ...it seals the evidence once, as impact basis: the withdrawn baseline link is not sealed" || bad "  ...sealed: $(q "SELECT payload->'evidence' FROM value_runs WHERE id = '$RF1'")"
BASE_EARNED="$(q "SELECT f->>'earned' FROM value_runs r, jsonb_array_elements(r.payload->'confidence'->'factors') f WHERE r.id = '$RF1' AND f->>'factor' = 'baseline_evidence_verified'")"
[ "$BASE_EARNED" = "0" ] && ok "  ...its baseline factor earns 0: the verified filing no longer counts for the baseline (the second item is unverified)" || bad "  ...baseline factor earned $BASE_EARNED"
printf '%s' "$GAPS" | grep -q 'baseline_evidence_verified' && ok "  ...and the gap register names the baseline evidence gap, as the run does" || bad "  ...gap register: $(printf '%s' "$GAPS" | head -c 300)"

step "9. The freeze, in the database (C1-D2): on the walk fixture's retired engagement, only the corrections"
[ "$(q "SELECT (g.deleted_at IS NOT NULL OR g.superseded_by_id IS NOT NULL) FROM value_outcomes vo JOIN engagements g ON g.id = vo.engagement_id WHERE vo.id = '$O_S'")" = "t" ] && ok "the walk fixture's outcome belongs to a retired engagement" || bad "the walk fixture's engagement not retired"
expect POST "/api/value-outcomes/$O_S/evidence" "$(EVB public_filing filing 'A new link (fixture)' baseline)" 409 "a new evidence link on the frozen outcome, at the route" "its outcomes are frozen"
sqlrefused "  ...at the database" "WITH e AS (INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form, quote_text, how_read) VALUES ('$INST_W', 'public_filing', 'f', 'Verification frozen fixture', '$S', 'quote', 'q', 'Verification: a new link on a frozen outcome.') RETURNING id) INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) SELECT '$O_S', id, 'baseline' FROM e" "its outcomes are frozen"

step "10. Brad's acts, in the browser as the steward (on the clone): correct the walk fixture's link; an erratum on run 2"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
login() { curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$1\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}'; }
TOKEN="$(login "$S_EMAIL")"; X_TOKEN="$(login "$X_EMAIL")"
[ -n "$TOKEN" ] && [ -n "$X_TOKEN" ] && ok "S and X signed in by session" || { bad "no session"; exit 1; }
walk() {  # MODE TOKEN RUN PDF_NAME
  node scripts/lib/corrections_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$2" "$INST_W" "$3" "$EV_V" "${4:-none.pdf}" "$WRONG" > "$W/walk.$1.log" 2>&1; local rc=$?
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
  grep -E '^  (PASS|FAIL)' "$W/walk.$1.log" || true
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc — a crash is a failure (see $W/walk.$1.log)"
}
walk acts "$TOKEN" "$R2"
[ "$(q "SELECT supports || '|' || (withdrawn_by_person_id = '$S') || '|' || (withdrawn_at::date = now()::date) || '|' || (length(withdrawal_reason) >= 12) FROM value_outcome_evidence WHERE value_outcome_id = '$O_S' AND evidence_id = '$EV_V' AND withdrawn_at IS NOT NULL")" = "baseline|true|true|true" ] \
  && ok "the walk fixture: the baseline link withdrawn — by the steward, today, with the reason" || bad "the walk fixture's withdrawn row"
[ "$(q "SELECT string_agg(supports || ':' || coalesce(corrects_supports, '-'), ',') FROM value_outcome_evidence WHERE value_outcome_id = '$O_S' AND evidence_id = '$EV_V' AND withdrawn_at IS NULL")" = "impact_basis:baseline" ] \
  && ok "the walk fixture: one current link, impact_basis, correcting baseline" || bad "the walk fixture's current link"
expect POST "$(CS "$O_S" "$EV_V")" '{"supports":"baseline","reason":"Verification: a second correction of it."}' 409 "correcting the walk fixture's link back to its withdrawn support, on the frozen outcome" "a withdrawn link is not recorded again"
# Scotts' link was a vendor publication; the vendor trigger now refuses one as a baseline, so the
# fixture's vendor case study (born impact basis) shows the trigger holding on a correction too.
expect POST "$(CS "$O_F" "$EV_VEN")" '{"supports":"baseline","reason":"Verification: a vendor claim corrected to baseline."}' 422 "a vendor publication corrected to the baseline" "it may support the impact basis only"
expect POST "$(CS "$O_F" "$EV_VEN")" '{"supports":"actual","reason":"Verification: a vendor claim corrected to actual."}' 422 "  ...to the actual" "may not support"
E2="$(q "SELECT id FROM run_errata WHERE value_run_id = '$R2'")"
[ -n "$E2" ] && ok "run 2: an erratum recorded through the page" || bad "run 2: no erratum"

step "11. The errata: the server's recompute, under the model the run was sealed with (C1-D3, C1-D4)"
ERR() { printf '{"evidence_id":"%s","what_was_wrong":"Another company'"'"'s filing was sealed as support for the baseline.","what_is_right":"It supports the impact basis only; the baseline rests on the account'"'"'s own filing.","reason":"Verification: Brad'"'"'s C1 ruling, point 1."%s}' "$1" "${2:-}"; }
expect POST "/api/value-runs/$R1/errata" "$(ERR "$EV_V")" 403 "X records an erratum on run 1" "steward" "$X"
expect POST "/api/value-runs/$R1/errata" "$(ERR "$EV_V" ',"recomputed_score":80')" 400 "B9: a typed recompute score in the body" "the recompute is the server's"
expect POST "/api/value-runs/$R1/errata" "$(ERR "$EV_V" ',"model_version":"0.9.0"')" 400 "  ...a typed model version" "the recompute is the server's"
expect POST "/api/value-runs/$R2/errata" "$(ERR "$EV_B")" 422 "an erratum naming evidence whose link was never corrected (run 2 sealed it)" "there is no correction to state"
expect POST "/api/value-runs/$RF1/errata" "$(ERR "$EV_F")" 409 "an erratum on an unlocked run" "an unlocked run is replaced, not corrected"
expect POST "/api/value-runs/$R1/errata" '{"evidence_id":"'"$EV_V"'","what_was_wrong":"short","what_is_right":"It supports the impact basis only.","reason":"Verification: a short text."}' 422 "an erratum with a 5-character 'what was wrong'" "in at least 12 characters"
expect POST "/api/value-runs/$R1/errata" "$(ERR "$EV_V")" 201 "the steward records the erratum on run 1 (C1-D4)"
E1="$(rj b.erratum_id)"
# The independent computation: from each run's SEALED payload, without the wrong row (Brad's ruling, point 4):
# the baseline factor is 25 × the best remaining baseline item's credit (1 if source-verified and not an
# attestation, else 0); the impact basis is full when no currency figure was claimed; every other factor as sealed.
indep() {
  q "SELECT payload FROM value_runs WHERE id = '$1'" | WRONG="$WRONG" node -e '
    const p = JSON.parse(require("fs").readFileSync(0, "utf8")); const c = p.confidence;
    const items = p.evidence.filter((e) => e.summary !== process.env.WRONG && e.supports === "baseline");
    if (items.some((e) => e.kind === "attestation")) { console.log("cannot: an attested baseline item"); process.exit(0); }
    if (p.claimedCurrencyImpact != null) { console.log("cannot: a currency figure was claimed"); process.exit(0); }
    const base = items.length === 0 ? 0 : 25 * Math.max(...items.map((e) => (e.source_verified ? 1 : 0)));
    const score = c.factors.reduce((s, f) => s + (f.factor === "baseline_evidence_verified" ? base : f.factor === "impact_basis_evidenced" ? 10 : Number(f.earned)), 0);
    console.log(`${score}|${score >= 80 ? "high" : score >= 55 ? "medium" : "low"}|${c.score}|${c.band}`);'
}
# What the fixture's design makes them: run 1 loses its only baseline item (25) and gains the impact
# basis (10); run 2 keeps its own filing. Computed from the sealed payloads, never typed.
WANT1="$(indep "$R1" | cut -d'|' -f1)"; WANT2="$(indep "$R2" | cut -d'|' -f1)"
SEALED1="$(indep "$R1" | cut -d'|' -f3)"; SEALED2="$(indep "$R2" | cut -d'|' -f3)"
[ -n "$WANT1" ] && [ "$WANT1" -lt "$SEALED1" ] && [ "$WANT2" -ge "$SEALED2" ] \
  && ok "the fixture's two shapes: run 1's recompute falls ($SEALED1 → $WANT1), run 2's does not ($SEALED2 → $WANT2)" || bad "the fixture's shapes: run 1 $SEALED1 → $WANT1, run 2 $SEALED2 → $WANT2"
for pair in "1:$R1:$E1:$WANT1:$SEALED1" "2:$R2:$E2:$WANT2:$SEALED2"; do
  IFS=: read -r N RID EID WANT SEALED <<< "$pair"
  STORED="$(q "SELECT recomputed_score::numeric::int || '|' || recomputed_band || '|' || sealed_score::numeric::int || '|' || sealed_band FROM run_errata WHERE id = '$EID'")"
  IND="$(indep "$RID")"
  [ "$STORED" = "$(printf '%s' "$IND" | awk -F'|' '{printf "%d|%s|%d|%s", $1, $2, $3, $4}')" ] && [ "${STORED%%|*}" = "$WANT" ] \
    && ok "run $N: the server's recompute ($STORED) equals the script's own, without the wrong row ($IND): $WANT / 100" || bad "run $N: stored $STORED, independent $IND, expected $WANT"
  [ "$(q "SELECT model_version || '|' || model_fingerprint || '|' || (recorded_by_person_id = '$S') || '|' || (recompute_method LIKE 'Recomputed under model 1.0.0 (d4cf8f31472a), the model this run was sealed with%') || '|' || (recompute_method LIKE '%The sealed run is unchanged.') FROM run_errata WHERE id = '$EID'")" = "1.0.0|d4cf8f31472a|true|true|true" ] \
    && ok "  ...stores model 1.0.0 (d4cf8f31472a), the one run $N sealed; the steward; the method, ending \"The sealed run is unchanged.\"" || bad "  ...run $N's erratum: $(q "SELECT model_version, recompute_method FROM run_errata WHERE id = '$EID'")"
  [ "$(q "SELECT (payload->'confidence'->>'modelVersion') || '|' || confidence_score::numeric::int FROM value_runs WHERE id = '$RID'")" = "1.0.0|$SEALED" ] && ok "  ...run $N's own sealed score is still $SEALED, under 1.0.0" || bad "  ...run $N sealed"
done
expect GET "/api/runs/$R2" "" 200 "GET the run"
[ "$(rj "b.errata.length + '|' + b.errata[0].recorded_by + '|' + Number(b.errata[0].recomputed_score)")" = "1|$S_NAME|$WANT2" ] && ok "  ...it carries the erratum: by $S_NAME, recomputed $WANT2" || bad "  ...errata: $(rj "JSON.stringify(b.errata)")"
sqlrefused "an erratum recorded by X, at the database" "INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, evidence_id, corrected_to_supports, what_was_wrong, what_is_right, reason, model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, recorded_by_person_id) SELECT tenant_id, value_run_id, value_outcome_id, evidence_id, corrected_to_supports, what_was_wrong, what_is_right, reason, model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, '$X' FROM run_errata WHERE id = '$E1'" "only the tenant's steward records an erratum" "$X"
sqlrefused "an erratum naming an outcome its run did not seal" "INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, evidence_id, corrected_to_supports, what_was_wrong, what_is_right, reason, model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, recorded_by_person_id) SELECT tenant_id, value_run_id, '$O_F', evidence_id, corrected_to_supports, what_was_wrong, what_is_right, reason, model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, '$S' FROM run_errata WHERE id = '$E1'" "is not the one run"
sqlrefused "B2: an UPDATE of an erratum" "UPDATE run_errata SET recomputed_score = 80 WHERE id = '$E1'" "is final"
sqlrefused "B2: a DELETE of an erratum" "DELETE FROM run_errata WHERE id = '$E1'" "cannot be deleted"

step "11b. One erratum per run and correction; an erratum is corrected only by one that supersedes it (Brad's C1 review)"
ECOPY() {  # FROM_ERRATUM RUN EVIDENCE SUPPORTS SUPERSEDES_SQL SUPERSESSION_REASON_SQL
  printf "INSERT INTO run_errata (tenant_id, value_run_id, value_outcome_id, evidence_id, corrected_to_supports, supersedes_id, supersession_reason, what_was_wrong, what_is_right, reason, model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, recorded_by_person_id) SELECT tenant_id, '%s', value_outcome_id, '%s', '%s', %s, %s, what_was_wrong, what_is_right, reason, model_version, model_fingerprint, sealed_score, sealed_band, recomputed_score, recomputed_band, recompute_method, recorded_by_person_id FROM run_errata WHERE id = '%s'" "$2" "$3" "$4" "$5" "$6" "$1"
}
[ "$(q "SELECT corrected_to_supports || '|' || (supersedes_id IS NULL) FROM run_errata WHERE id IN ('$E1', '$E2') GROUP BY 1")" = "impact_basis|true" ] \
  && ok "each erratum names its correction: the walk fixture's link, corrected to impact_basis; neither supersedes another" || bad "corrected_to_supports: $(q "SELECT corrected_to_supports, supersedes_id FROM run_errata")"
expect POST "/api/value-runs/$R2/errata" "$(ERR "$EV_V")" 409 "a second erratum for the same run and correction, at the route" "An erratum for this correction is already recorded on this run"
sqlrefused "  ...at the database" "$(ECOPY "$E2" "$R2" "$EV_V" impact_basis NULL NULL)" "run_errata_one_per_correction"
SUP() { printf ',"supersedes_erratum_id":"%s","supersession_reason":"%s"' "$1" "$2"; }
expect POST "/api/value-runs/$R1/errata" "$(ERR "$EV_V" "$(SUP "$E1" "Too short")")" 422 "superseding with a 9-character reason" "Say why the erratum is superseded, in at least 12 characters"
expect POST "/api/value-runs/$R2/errata" "$(ERR "$EV_V" "$(SUP "$E1" "Verification: run 1's erratum, named on run 2.")")" 409 "superseding another run's erratum, at the route" "That is not the current erratum for this correction on this run"
sqlrefused "  ...at the database" "$(ECOPY "$E2" "$R2" "$EV_V" impact_basis "'$E1'" "'Verification: run 1''s erratum, named on run 2.'")" "an erratum supersedes one of the same run and the same correction"
expect POST "/api/value-runs/$R1/errata" "$(ERR "$EV_V" ',"supersession_reason":"Verification: a reason with nothing named."')" 422 "a supersession reason with no erratum named" "name it"
sqlrefused "a supersession named with no reason, at the database" "$(ECOPY "$E2" "$R2" "$EV_V" impact_basis "'$E2'" NULL)" "run_errata_supersession_complete"
sqlrefused "an erratum about a link that was never corrected (the account's own filing), at the database" "$(ECOPY "$E2" "$R2" "$EV_B" baseline NULL NULL)" "an erratum is about a corrected link"
walk supersede "$TOKEN" "$R1"
E1B="$(q "SELECT id FROM run_errata WHERE supersedes_id = '$E1'")"
[ -n "$E1B" ] && [ "$(q "SELECT value_run_id || '|' || corrected_to_supports || '|' || recomputed_score::numeric::int || '|' || (recorded_by_person_id = '$S') || '|' || supersession_reason FROM run_errata WHERE id = '$E1B'")" = "$R1|impact_basis|$WANT1|true|Verification: the first erratum's wording was a draft." ] \
  && ok "run 1: the superseding erratum names E1, with the reason; the server's recompute again $WANT1; the steward's" || bad "superseding row: $(q "SELECT * FROM run_errata WHERE supersedes_id = '$E1'")"
[ "$(q "SELECT count(*) FROM run_errata WHERE id = '$E1'")" = "1" ] && ok "  ...E1 stays on the record (append-only)" || bad "  ...E1 gone"
expect POST "/api/value-runs/$R1/errata" "$(ERR "$EV_V" "$(SUP "$E1" "Verification: superseding E1 a second time.")")" 409 "superseding E1 again (already superseded), at the route" "That is not the current erratum for this correction on this run"
sqlrefused "  ...at the database" "$(ECOPY "$E1B" "$R1" "$EV_V" impact_basis "'$E1'" "'Verification: superseding E1 a second time.'")" "run_errata_superseded_once"
expect GET "/api/runs/$R1" "" 200 "GET run 1"
[ "$(rj "b.errata.length + '|' + b.errata.find(x=>x.id==='$E1').superseded_by_id + '|' + b.errata.find(x=>x.id==='$E1B').supersedes_id")" = "2|$E1B|$E1" ] \
  && ok "  ...returns both errata: E1 superseded by the new one, which names E1" || bad "  ...$(rj "JSON.stringify(b.errata.map(x=>[x.id,x.supersedes_id,x.superseded_by_id]))")"

step "11c. The score-changing case (Brad, L39): run 1's recompute differs from its sealed score"
# Scotts' runs never exercised it: each recomputed to its own sealed score. Here run 1 recomputes to
# WANT1 against SEALED1; on screen and on every printed page, every score but the erratum's is SEALED1.
WANT="$WANT1" SEALED="$SEALED1" node scripts/lib/corrections_walk.mjs score "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" "$INST_W" "$R1" "$EV_V" l39_run1.pdf "$WRONG" > "$W/walk.score.log" 2>&1 || bad "the score walk exited non-zero"
PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.score.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.score.log" || true))); grep -E '^  (PASS|FAIL)' "$W/walk.score.log" || true
if [ -f "$SHOTS/l39_run1.pdf" ]; then
  N1="$(pdfinfo "$SHOTS/l39_run1.pdf" | awk '/^Pages:/{print $2}')"; MISS=""; ODD=""
  for p in $(seq 1 "$N1"); do
    flat="$(pdftotext -f "$p" -l "$p" "$SHOTS/l39_run1.pdf" - 2>/dev/null | tr -d '[:space:]')"
    printf '%s' "$flat" | grep -qF "ERRATUM:recomputed$WANT1/100(sealed$SEALED1/100).Fulltextonpage1." || MISS="$MISS p$p"
    [ "$p" != 1 ] || printf '%s' "$flat" | grep -qF "withthecorrection:$WANT1/100·Low(sealed:$SEALED1/100·Low)" || MISS="$MISS p1:full"
    # Every other "n/100" on the page, with the erratum's own figures taken out: the sealed score only.
    rest="$(printf '%s' "$flat" | sed -e "s#recomputed$WANT1/100(sealed$SEALED1/100)##g" -e "s#withthecorrection:$WANT1/100·Low(sealed:$SEALED1/100·Low)##g")"
    for x in $(printf '%s' "$rest" | grep -oE '[0-9]+(\.[0-9]+)?/100' | cut -d/ -f1); do awk -v a="$x" -v b="$SEALED1" 'BEGIN{exit !(a+0 == b+0)}' || ODD="$ODD p$p:$x"; done
  done
  [ -z "$MISS" ] && ok "run 1 printed ($N1 pages): every page's erratum line reads \"recomputed $WANT1 / 100 (sealed $SEALED1 / 100)\"; page 1 \"with the correction: $WANT1 / 100 · Low (sealed: $SEALED1 / 100 · Low)\"" || bad "run 1 printed: missing$MISS"
  TALLY="$(for p in $(seq 1 "$N1"); do pdftotext -f "$p" -l "$p" "$SHOTS/l39_run1.pdf" - 2>/dev/null | tr -d '[:space:]' | sed -e "s#recomputed$WANT1/100(sealed$SEALED1/100)##g" -e "s#withthecorrection:$WANT1/100·Low(sealed:$SEALED1/100·Low)##g" | grep -oE '[0-9]+(\.[0-9]+)?/100' || true; done | sort | uniq -c | awk '{printf "%s%s ×%s", (NR > 1 ? ", " : ""), $2, $1}')"
  [ -z "$ODD" ] && [ -n "$TALLY" ] && ok "  ...and every other score on every printed page is the sealed $SEALED1 / 100 ($TALLY)" || bad "  ...other scores in print:$ODD (${TALLY:-none found})"
else bad "run 1: no PDF printed"; fi

step "12. C1-D2: the other legitimate acts on a retired engagement still succeed"
expect POST "/api/institutions/$INST/value-outcomes" "$(OUTB two "$OWNER")" 201 "a second fixture engagement and outcome"
O_F3="$(rj b.value_outcome_id)"; ENG_F3="$(rj b.engagement_id)"
expect POST "/api/value-outcomes/$O_F3/evidence" "$(EVB public_filing filing 'TRIR FY25 third (fixture)' baseline)" 201 "  ...its evidence"
expect POST "/api/engagements/$ENG_F3/produce-run" '{"note":"Verification: retire after lock.","source_fixture":"corrections"}' 201 "  ...a run"
expect POST "/api/value-runs/$(rj b.value_run_id)/lock" '{"lock_reason":"Verification: sealed before retirement."}' 200 "  ...locked"
expect POST "/api/engagements/$ENG_F3/retire" '{"retirement_reason":"Verification: retired under section 26."}' 200 "engagement retirement, under the new guard"
expect POST "/api/institutions/$INST/reference-example" '{"kind":"outside_in_test","source_citation":"Verification fixture citation (not a source)","note":"Verification: a marker on an account with a retired engagement."}' 201 "the reference-example marker, on that account"
ok "the erratum on a retired engagement's run: section 11 (runs 1 and 2, the walk fixture's engagement retired)"
expect POST "/api/value-outcomes/$O_F3/evidence" "$(EVB public_filing filing 'After retirement (fixture)' baseline)" 409 "  ...and a new link on that retired outcome still refused" "its outcomes are frozen"

step "13. The seals: every run hashes; runs 1 and 2 byte-identical"
HASH1="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
RUNS1="$(q "SELECT count(*) FROM value_runs")"
printf '%s' "$HASH1" | grep -qE "^$RUNS1 runs: recompute matches $RUNS1, differs 0; embedded payloadHash matches $RUNS1, differs 0" && ok "after every act: check_run_hashes $HASH1 (the $RUNS0 prod runs and this script's)" || bad "hashes after: $HASH1"
[ "$(seals)" = "$SEALS0" ] && ok "runs 1 and 2 byte-identical to when they were sealed, after the correction and every erratum (md5 of each whole row)" || bad "a fixture run changed"

step "14. The display: run 2 on screen (1280, 390) and in print; the POV; the walk; X's view"
walk display "$TOKEN" "$R2" c1_run2.pdf
walk nonsteward "$X_TOKEN" "$R2"
pages() {  # NAME PDF WANT(yes|no)
  local n p flat missing=""
  n="$(pdfinfo "$2" 2>/dev/null | awk '/^Pages:/{print $2}')"
  [ -n "$n" ] && [ "$n" -ge 2 ] || { bad "$1: the PDF has $n page(s); the per-page check needs at least 2"; return; }
  for p in $(seq 1 "$n"); do
    flat="$(pdftotext -f "$p" -l "$p" "$2" - 2>/dev/null | tr -d '[:space:]')"
    # C1b: every page carries the erratum's bounded line (and the disclosure); page 1 its full text.
    printf '%s' "$flat" | grep -qE "ERRATUM:recomputed[0-9.]+/100\(sealed[0-9.]+/100\)\.Fulltextonpage1\." && printf '%s' "$flat" | grep -qF "UNVERIFIED—thisrun'soutcomehasnoverifiedactual" || missing="$missing p$p"
    [ "$p" != "1" ] || printf '%s' "$flat" | grep -qF "Thesealedrecordbelowisunchanged." || missing="$missing p1:full-text"
  done
  if [ "$3" = yes ]; then [ -z "$missing" ] && ok "$1: the erratum's line and the disclosure on every one of $n printed pages, its full text on page 1, read page by page" || bad "$1: pages without the erratum:$missing (of $n)"
  else [ -n "$missing" ] && ok "$1: caught — pages without the erratum:$missing (of $n)" || bad "$1: not caught: every page still carries it"; fi
}
[ -f "$SHOTS/c1_run2.pdf" ] && pages "run 2 printed" "$SHOTS/c1_run2.pdf" yes || bad "no PDF printed"
P1T="$(pdftotext -f 1 -l 1 "$SHOTS/c1_run2.pdf" - 2>/dev/null | tr -d '[:space:]')"
SCORES2="$(q "SELECT recomputed_score::numeric::int || '/100·' || initcap(recomputed_band) || '(sealed:' || sealed_score::numeric::int || '/100·' || initcap(sealed_band) || ')' FROM run_errata WHERE id = '$E2'")"
printf '%s' "$P1T" | grep -qF "UNVERIFIED—thisrun'soutcomehasnoverifiedactual" && printf '%s' "$P1T" | grep -qF "$SCORES2" \
  && ok "  ...printed beside the disclosure banner, with \"$SCORES2\"" || bad "  ...page 1's banners: $(printf '%s' "$P1T" | head -c 300)"

step "15. Deliberate breaks"
# B1 — the erratum route's steward check removed: the database refuses X still.
edit "$CORR" "router.post('/:runId/errata', requireSteward(pool), async" "router.post('/:runId/errata', async"
stop_server; start_server
# (X supersedes run 1's current erratum, so the request passes every route check but the steward's.)
expect POST "/api/value-runs/$R1/errata" "$(ERR "$EV_V" "$(SUP "$E1B" "Verification: B1, X superseding it.")")" 422 "B1: without the route's check, X's erratum → the database refuses" "only the tenant's steward records an erratum" "$X"
restore "$CORR"
# B12 (C1 review) — the route's one-erratum-per-correction check removed: the database refuses.
edit "$CORR" "      if (supersedes === undefined && current) {" "      if (supersedes === undefined && current && false) {"
stop_server; start_server
expect POST "/api/value-runs/$R2/errata" "$(ERR "$EV_V")" 409 "B12: without the route's check, a second erratum on run 2 → the unique index refuses, in words" "An erratum for this correction is already recorded on this run; correct it with a new erratum that supersedes it."
[ "$(q "SELECT count(*) FROM run_errata WHERE value_run_id = '$R2'")" = "1" ] && ok "  ...nothing written" || bad "  ...B12 wrote"
restore "$CORR"
# B10 (C1-D1) — the route inserts the corrected link before it withdraws the old one.
python3 - "$CORR" <<'PY'
import re, sys; p = sys.argv[1]; s = open(p).read()
upd = re.search(r"      await client\.query\(\n        `UPDATE value_outcome_evidence SET withdrawn_by_person_id.*?\n      \);\n", s, re.S).group(0)
ins = re.search(r"      await client\.query\(\n        `INSERT INTO value_outcome_evidence \(value_outcome_id, evidence_id, supports, corrects_supports.*?\n      \);\n", s, re.S).group(0)
assert s.count(upd + ins) == 1; open(p, 'w').write(s.replace(upd + ins, ins + upd))
PY
stop_server; start_server
expect POST "$(CS "$O_F" "$EV_F2")" '{"supports":"impact_basis","reason":"Verification: B10, insert first."}' 409 "B10: insert-before-withdraw in the route → refused by the one-current index" "already has a current link to this outcome"
[ "$(q "SELECT count(*) FROM value_outcome_evidence WHERE evidence_id = '$EV_F2' AND withdrawn_at IS NOT NULL")" = "0" ] && ok "  ...nothing written" || bad "  ...B10 wrote"
restore "$CORR"
# B5 — produce-run counts a withdrawn link.
edit "$PRODUCE" "        WHERE voe.value_outcome_id = \$1 AND voe.withdrawn_at IS NULL  -- C1: a withdrawn link supports nothing" "        WHERE voe.value_outcome_id = \$1"
stop_server; start_server
expect POST "/api/value-runs/$RF1/lock" '{"lock_reason":"Verification: locked for B5."}' 200 "B5: (the fixture run locked)"
expect POST "/api/engagements/$ENG_F/produce-run" '{"note":"Verification: B5.","source_fixture":"corrections_b5"}' 201 "B5: a run with produce-run's filter removed"
[ "$(q "SELECT string_agg(x->>'supports', ',' ORDER BY x->>'supports') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$(rj b.value_run_id)' AND x->>'summary' = 'TRIR FY25 (fixture)'")" = "baseline,impact_basis" ] \
  && ok "B5: caught — the run seals the withdrawn baseline link beside the current one; the filter is what keeps it out" || bad "B5: not caught"
restore "$PRODUCE"; stop_server; start_server
# B6 — the vendor trigger's body removed (on the clone).
fnbreak lvrf_vendor_impact_only "  IF ev_kind = 'vendor_publication' AND NOT coalesce(own, false) AND NEW.supports IN ('baseline', 'actual') THEN" "  IF false THEN"
[ "$(sqlaccepted "$(VEN_SQL "$INST" "$O_F" baseline)")" = "ACCEPTED" ] && ok "B6: caught — without the vendor check, a vendor publication is accepted as a customer's baseline" || bad "B6: not caught"
reharden
sqlrefused "  ...and refused again" "$(VEN_SQL "$INST" "$O_F" baseline)" "it may support the impact basis only"
# B7 — the frozen-outcome guard relaxed (on the clone).
fnbreak lvrf_outcome_evidence_link_guard "    IF o.retired THEN" "    IF false THEN"
FROZEN_SQL="WITH e AS (INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form, quote_text, how_read) VALUES ('$INST_W', 'public_filing', 'f', 'Verification frozen fixture', '$S', 'quote', 'q', 'Verification: a new link on a frozen outcome.') RETURNING id) INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) SELECT '$O_S', id, 'baseline' FROM e"
[ "$(sqlaccepted "$FROZEN_SQL")" = "ACCEPTED" ] && ok "B7: caught — with the guard relaxed, a new link on the walk fixture's frozen outcome is accepted" || bad "B7: not caught"
reharden
sqlrefused "  ...and refused again" "$FROZEN_SQL" "its outcomes are frozen"
# B8 — the erratum taken out of the printed header (the dev server reloads the page).
edit "$BENCH" '<thead className="hidden print:table-header-group" data-testid="print-header"><tr className="print:table-row"><td className="p-0 print:table-cell"><RunBanners run={run} account={account} compact />' '<thead className="hidden print:table-header-group" data-testid="print-header"><tr className="print:table-row"><td className="p-0 print:table-cell"><RunBanners run={{ ...run, errata: [] }} account={account} compact />'
sleep 2; walk print "$TOKEN" "$R2" c1_run2_b8.pdf
pages "B8: the erratum out of the printed header" "$SHOTS/c1_run2_b8.pdf" no
restore "$BENCH"
# B13 (L39) — the POV's correction note on vendor claims only, as C1 had it: the corrected filing's line loses it.
edit "$POVP" '                <EvidenceRestsOn e={e} statedBy={e.stated_by} statedOn={e.stated_on} />
                <CorrectedNote e={e} />' '                <EvidenceRestsOn e={e} statedBy={e.stated_by} statedOn={e.stated_on} />'
sleep 2; node scripts/lib/corrections_walk.mjs povnote "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" "$INST_W" "$R2" "$EV_V" none.pdf "$WRONG" > "$W/walk.b13.log" 2>&1 || true
grep -q "^  PASS  the POV opens" "$W/walk.b13.log" && grep -q "^  FAIL  the corrected link's own line" "$W/walk.b13.log" \
  && ok "B13: the note on vendor claims only → caught: the corrected filing's line has no correction" || bad "B13: not caught: $(cat "$W/walk.b13.log" | head -3)"
restore "$POVP"
# B14 (L39) — the printed erratum line with the sealed score where the recompute belongs.
edit "$BENCH" '<>recomputed {Number(errata[0].recomputed_score)} / 100</>' '<>recomputed {Number(errata[0].sealed_score)} / 100</>'
sleep 2; walk print "$TOKEN" "$R1" l39_run1_b14.pdf
B14M=""; for p in $(seq 1 "$(pdfinfo "$SHOTS/l39_run1_b14.pdf" 2>/dev/null | awk '/^Pages:/{print $2}')"); do
  pdftotext -f "$p" -l "$p" "$SHOTS/l39_run1_b14.pdf" - 2>/dev/null | tr -d '[:space:]' | grep -qF "ERRATUM:recomputed$WANT1/100(sealed$SEALED1/100)." || B14M="$B14M p$p"; done
[ -n "$B14M" ] && [ -f "$SHOTS/l39_run1_b14.pdf" ] && ok "B14: the sealed score printed as the recompute → caught on pages:$B14M" || bad "B14: not caught"
restore "$BENCH"
# B11 (C1-D3) — a run sealed under another model: the recompute refuses, from the payload and from the source.
cat > "$W/rc.ts" <<TS
import { recomputeWithCorrection } from '$(pwd)/server/lib/recomputeRun.ts';
const p = JSON.parse(process.argv[2]); const m = JSON.parse(process.argv[3]);
const asSealed = recomputeWithCorrection(p, m, 'impact_basis');
const other = recomputeWithCorrection({ ...p, confidence: { ...p.confidence, modelVersion: '0.9.0' } }, m, 'impact_basis');
console.log(JSON.stringify([asSealed.ok ? 'ok:' + asSealed.score : 'refused', other.ok ? 'ok' : other.reason]));
TS
PAY="$(q "SELECT payload FROM value_runs WHERE id = '$R2'")"
MATCH="$(q "SELECT json_build_object('kind', kind, 'summary', summary, 'provenance', provenance) FROM evidence WHERE id = '$EV_V'")"
RC="$(npx tsx "$W/rc.ts" "$PAY" "$MATCH" 2>&1 | tail -1)"
printf '%s' "$RC" | grep -qF "[\"ok:$WANT2\",\"This run was sealed under model 0.9.0" && printf '%s' "$RC" | grep -qF 'It cannot be recomputed under the model it was sealed with.' \
  && ok "B11: a payload sealed under model 0.9.0 → refused: \"It cannot be recomputed under the model it was sealed with.\" (under its own: $WANT2)" || bad "B11 (payload): $RC"
edit "$MODEL" "export const MODEL_VERSION = '1.0.0'" "export const MODEL_VERSION = '1.0.1'"
RC2="$(npx tsx "$W/rc.ts" "$PAY" "$MATCH" 2>&1 | tail -1)"
printf '%s' "$RC2" | grep -qF '["refused",' && ok "B11: the server's model bumped to 1.0.1 → run 2's recompute refused (sealed under 1.0.0)" || bad "B11 (source): $RC2"
restore "$MODEL"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots and PDFs: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
