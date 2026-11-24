#!/usr/bin/env bash
#
# §32 (Brad's rulings, 24 Nov 2026: D1-D7, two additions) — a person's email is optional; stored as its own trimmed lower
# case, unique ignoring case; a credential needs one; the same name on an account is warned, the confirmation recorded;
# Measure by's earliest day is the day after Committed on.
#
#   ./scripts/verify_person_email.sh [out_dir]
#
#   1. A clone of the prod copy migrated to 0053 and hardened: email nullable; persons_email_key unique on lower(email);
#      persons_email_normalized; confirmed_distinct_from; every person byte-identical but the new column (null); 229
#      triggers; drift none at 0053; runs byte-identical.
#   2. The routes: a person with no email (null), with a mixed-case email (stored lower), an empty one (null); an email
#      taken in another case refused in plain words; account inputs without an email (admitted) and an assessment naming
#      an email no submitted person has (refused, nothing written); sign-in with the steward's email in capitals.
#   3. The same name: refused (409) naming who is there, nothing written; admitted with different_from, which the row
#      records; no other row records it; the same name on another account admitted; different_from with no one to
#      differ from refused.
#   4. The database, as lvrf_app, rolled back: a credential for the email-less person refused, for one with an email
#      accepted; confirmed_distinct_from changed refused; set naming someone of another name refused; a mixed-case email
#      refused (persons_email_normalized); the same email again refused (unique).
#   5. The page: card 01b's form, the warning, "Choose them", "This is a different person" and its confirmation; W1's
#      form; Measure by's earliest day.
#   Breaks: B1 the route's same-name check (two same-name persons added with no warning), B2 the credential rule (a
#   credential for the email-less person accepted), B3 the route's normalization (the database still refuses a
#   mixed-case email), B4 Measure by's earliest day back to the commit day.

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

VERIFY_DB=lvrf_verifyemail
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3441; VITE_PORT=5441; CDP_PORT=9551
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_email.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
SPINE=client/src/components/OutcomeSpine.tsx; INPUTS=server/routes/institutionInputs.ts; PIN=server/lib/personInput.ts
EDITED=("$SPINE" "$INPUTS" "$PIN")
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
  env VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT_DIR="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" TAG="$tag" "$@" node scripts/lib/person_email_walk.mjs "$s" > "$log" 2>&1 \
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

step "1. Clone the prod copy, migrate to 0053, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
PERS0="$(q "SELECT md5(string_agg(md5(to_jsonb(p)::text), '' ORDER BY id)) FROM persons p")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated to 0053" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "229" ] && ok "229 triggers: §32 section 38 adds person_credentials_needs_email and persons_email_rules" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 54 migrations, newest 0053_s32_person_email" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every run byte-identical" || bad "a run changed"
[ "$(q "SELECT md5(string_agg(md5((to_jsonb(p) - 'confirmed_distinct_from')::text), '' ORDER BY id)) FROM persons p")" = "$PERS0" ] && [ "$(q "SELECT count(*) FROM persons WHERE confirmed_distinct_from IS NOT NULL")" = "0" ] \
  && ok "every person byte-identical but the new column, null on every row" || bad "persons changed"
[ "$(q "SELECT attnotnull FROM pg_attribute WHERE attrelid = 'persons'::regclass AND attname = 'email'")" = "f" ] && ok "persons.email is optional" || bad "email still NOT NULL"
q "SELECT pg_get_indexdef('persons_email_key'::regclass)" | grep -q "UNIQUE INDEX persons_email_key ON public.persons USING btree (lower(email))" && ok "persons_email_key: unique on lower(email)" || bad "index: $(q "SELECT pg_get_indexdef('persons_email_key'::regclass)")"
[ "$(q "SELECT count(*) FROM pg_constraint WHERE conname = 'persons_email_normalized' AND convalidated")" = "1" ] && ok "persons_email_normalized: validated (every email on the copy is its own trimmed lower case)" || bad "normalized check"

step "2. The routes (D2, addition 2)"
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"; TS="$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server && ok "API up on $PORT" || { bad "server: $(tail -5 "$W/server.log")"; exit 1; }
SIGN="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "$(J email "  $(printf '%s' "$S_EMAIL" | tr 'a-z' 'A-Z') " password "$PW")" "$BASE/api/auth/login")"
[ "$SIGN" = "200" ] && ok "sign-in with the steward's email in capitals, with spaces: 200 (looked up by its normalized form)" || bad "sign-in: $SIGN"
expect POST /api/account-inputs "$(J institution "$(J name "Rowan Mill (§32 fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for §32.')" persons "[$(J full_name 'K32 owner (invented)' email "owner.$TS@k32.example" title Owner),$(J full_name 'K32 Pat Example (invented)' title 'Plant manager')]")" 201 "account inputs: a person with an email and one without"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"; PAT="$(rj b.person_ids[1])"
[ "$(q "SELECT coalesce(email, '-') FROM persons WHERE id = '$PAT'")" = "-" ] && ok "  ...the one without stored with no email" || bad "  ...email: $(q "SELECT email FROM persons WHERE id = '$PAT'")"
N_INST="$(q "SELECT count(*) FROM institutions")"
expect POST /api/account-inputs "$(J institution "$(J name "Rowan Mill two (§32 fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for §32.')" persons "[$(J full_name 'K32 learner (invented)' title Learner)]" assessments "[$(J person_email "learner.$TS@k32.example" capability_name 'K32 capability' score 3 ai_assisted false)]")" 422 "account inputs: an assessment naming an email no submitted person has" "A person an assessment names needs an email: the assessment finds its person by it."
[ "$(q "SELECT count(*) FROM institutions")" = "$N_INST" ] && ok "  ...nothing written" || bad "  ...an institution was written"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K32 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
ADD() { req POST "/api/institutions/$1/inputs" "{\"persons\":[$2]}"; }
ADD "$INST" "$(J full_name 'K32 Robin Example (invented)' title 'Controller')"; [ "$CODE" = "201" ] && ROBIN="$(rj b.person_ids[0])" && [ "$(q "SELECT coalesce(email, '-') FROM persons WHERE id = '$ROBIN'")" = "-" ] && ok "a person added with no email (201, email null)" || bad "no email: $CODE $(said)"
ADD "$INST" "$(J full_name 'K32 Mixed Case (invented)' email "  Mixed.Case.$TS@K32.Example " title 'Analyst, plant')"; [ "$CODE" = "201" ] && [ "$(q "SELECT email FROM persons WHERE id = '$(rj b.person_ids[0])'")" = "mixed.case.$TS@k32.example" ] && ok "a mixed-case email with spaces, stored trimmed and lower-cased" || bad "mixed: $CODE $(said) $(q "SELECT email FROM persons WHERE full_name = 'K32 Mixed Case (invented)'")"
ADD "$INST" "$(J full_name 'K32 Empty Email (invented)' email '' title 'Clerk')"; [ "$CODE" = "201" ] && [ "$(q "SELECT coalesce(email, '-') FROM persons WHERE id = '$(rj b.person_ids[0])'")" = "-" ] && ok "an empty email is no email" || bad "empty: $CODE $(said)"
expect POST "/api/institutions/$INST/inputs" "{\"persons\":[$(J full_name 'K32 Someone Else (invented)' email "MIXED.CASE.$TS@k32.EXAMPLE" title Clerk)]}" 409 "an email already taken, in another case" "is already in LVRF; select them instead"

step "3. The same name (D4, addition 1)"
N0="$(q "SELECT count(*) FROM persons WHERE institution_id = '$INST'")"
expect POST "/api/institutions/$INST/inputs" "{\"persons\":[$(J full_name '  k32  PAT example (invented) ' title 'Site lead')]}" 409 "the same name (another case, extra spaces)" "K32 Pat Example (invented), Plant manager is already recorded at this account. Choose them, or confirm this is a different person."
[ "$(q "SELECT count(*) FROM persons WHERE institution_id = '$INST'")" = "$N0" ] && ok "  ...nothing written" || bad "  ...a person was written"
expect POST "/api/institutions/$INST/inputs" "{\"persons\":[$(J full_name 'K32 Pat Example (invented)' title 'Site lead' different_from "[\"$PAT\"]")]}" 201 "the same name, with different_from naming the existing person"
PAT2="$(rj b.person_ids[0])"
[ "$(q "SELECT confirmed_distinct_from::text FROM persons WHERE id = '$PAT2'")" = "{$PAT}" ] && ok "  ...the row records it: confirmed_distinct_from {${PAT:0:8}…}" || bad "  ...recorded: $(q "SELECT confirmed_distinct_from FROM persons WHERE id = '$PAT2'")"
[ "$(q "SELECT count(*) FROM persons WHERE confirmed_distinct_from IS NOT NULL")" = "1" ] && ok "  ...and no other row records one (written then, never otherwise)" || bad "  ...rows with it: $(q "SELECT count(*) FROM persons WHERE confirmed_distinct_from IS NOT NULL")"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'persons' AND record_id = '$PAT2' AND actor_person_id = '$S'")" -ge 1 ] && ok "  ...who confirmed it and when are the audit's (the steward, as actor)" || bad "  ...audit: $(q "SELECT count(*) FROM audit_log WHERE record_id = '$PAT2'")"
expect POST /api/account-inputs "$(J institution "$(J name "Rowan Mill three (§32 fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for §32.')" persons "[$(J full_name 'K32 owner three (invented)' email "owner3.$TS@k32.example" title Owner)]")" 201 "another account"
INST_W="$(rj b.institution_id)"
ADD "$INST_W" "$(J full_name 'K32 Pat Example (invented)' title 'Site lead')"; [ "$CODE" = "201" ] && ok "the same name on another account: admitted, no warning" || bad "another account: $CODE $(said)"
expect POST "/api/institutions/$INST/inputs" "{\"persons\":[$(J full_name 'K32 Nobody Like Them (invented)' different_from "[\"$PAT\"]")]}" 422 "different_from with no one of that name to differ from" "There is no one of that name at this account to confirm a different person from."

step "4. The database, as lvrf_app (D3, addition 1, addition 2)"
sqlrefused "a credential for the email-less person" "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$ROBIN', '$HASH', 'verify')" "A person signs in with their email; K32 Robin Example (invented) has none. Record an email for them first."
[ "$(sqlaccepted "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$OWNER', '$HASH', 'verify')")" = "ACCEPTED" ] && ok "  ...for a person with an email, accepted" || bad "  ...with email: $(sqlaccepted "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$OWNER', '$HASH', 'verify')")"
sqlrefused "confirmed_distinct_from changed after the person is added" "UPDATE persons SET confirmed_distinct_from = NULL WHERE id = '$PAT2'" "Who a person was confirmed distinct from is recorded when they are added, and never changes."
sqlrefused "confirmed_distinct_from set on an existing person" "UPDATE persons SET confirmed_distinct_from = ARRAY['$PAT']::uuid[] WHERE id = '$ROBIN'" "never changes"
sqlrefused "confirmed_distinct_from naming someone of another name" "INSERT INTO persons (institution_id, full_name, title, confirmed_distinct_from) VALUES ('$INST', 'K32 Robin Example (invented)', 'x', ARRAY['$PAT']::uuid[])" "A person is confirmed distinct from someone of the same account with the same name"
sqlrefused "a mixed-case email" "INSERT INTO persons (institution_id, full_name, email) VALUES ('$INST', 'K32 Upper (invented)', 'Upper.$TS@k32.example')" "persons_email_normalized"
sqlrefused "the same email again" "INSERT INTO persons (institution_id, full_name, email) VALUES ('$INST', 'K32 Again (invented)', 'mixed.case.$TS@k32.example')" "persons_email_key"

step "5. The page"
expect POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name 'K32 engagement' engagement_owner_person_id "$OWNER" capability_name 'K32 capability' metric "$(J name 'K32 TRIR' unit 'incidents per 200,000 hours.' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)" 201 "a fixture outcome, to commit"
OC="$(rj b.value_outcome_id)"
make_customer_side "$INST" "$OWNER"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
WENV=(INST="$INST" INST_W="$(q "SELECT institution_id FROM persons WHERE id = '$ROBIN'")" OC="$OC" DUP_TYPED='  k32  ROBIN example (invented) ' DUP_ID="$ROBIN" DUP_WHO='K32 Robin Example (invented), Controller' EARLIER="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date - 10, 'YYYY-MM-DD')")")
# W1 is next on an account with no person and no analyst of record yet.
req POST /api/account-inputs "{\"institution\":{\"name\":\"Rowan Mill four (§32 fixture, invented) $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for §32.\"}}"
[ "$CODE" = "201" ] && ok "an account with no one on it yet, for W1" || bad "empty account: $CODE $(said)"
WENV[1]="INST_W=$(rj b.institution_id)"
walk roles,distinct,w1,measureby page "$W/page.log" "${WENV[@]}"; tally "$W/page.log"
[ "$(q "SELECT count(*) FROM persons WHERE institution_id = '$INST' AND confirmed_distinct_from = ARRAY['$ROBIN']::uuid[] AND title = 'Site lead'")" = "1" ] && ok "  ...the page's distinct person recorded, confirmed distinct from K32 Robin Example" || bad "  ...not recorded"

step "6. Breaks, each caught by its own section"
# B1 — the route's same-name check removed: two same-name persons, no warning.
edit "$INPUTS" "        if (same.some((p) => !differentFrom.includes(p.id))) {" "        if (false) {"
restart_server
ADD "$INST" "$(J full_name 'K32 Owner (invented)' title 'Second owner')"
[ "$CODE" = "201" ] && [ "$(q "SELECT count(*) FROM persons WHERE institution_id = '$INST' AND lower(full_name) = 'k32 owner (invented)'")" = "2" ] && ok "B1: the route's same-name check removed → caught: a second K32 Owner added with no warning" || bad "B1: $CODE $(said)"
restore "$INPUTS"; restart_server
# B2 — the credential rule removed.
fnbreak lvrf_person_email_rules "    IF p.email IS NULL OR btrim(p.email) = '' THEN" "    IF false THEN"
[ "$(sqlaccepted "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$ROBIN', '$HASH', 'verify')")" = "ACCEPTED" ] && ok "B2: the credential rule removed → caught: a credential for the email-less person is accepted" || bad "B2"
reharden
# B3 — the route's normalization removed: the database still refuses a mixed-case email.
edit "$PIN" "  const t = v.trim().toLowerCase();" "  const t = v.trim();"
restart_server
ADD "$INST" "$(J full_name 'K32 Casey (invented)' email "Casey.$TS@K32.example" title Clerk)"
[ "$CODE" != "201" ] && [ "$(q "SELECT count(*) FROM persons WHERE full_name = 'K32 Casey (invented)'")" = "0" ] && ok "B3: the route's normalization removed → the database still refuses a mixed-case email ($CODE), nothing written" || bad "B3: $CODE $(said)"
restore "$PIN"; restart_server
# B4 — Measure by's earliest day back to the commit day.
edit "$SPINE" "value={v.by} min={v.on ? dayAfter(v.on) : undefined}" "value={v.by} min={v.on || undefined}"
sleep 4
walk measureby b4 "$W/b4.log" "${WENV[@]}"
grep -q "^FAIL  b4: measureby: Measure by's earliest day is" "$W/b4.log" && ok "B4: Measure by's earliest day back to the commit day → caught" || bad "B4: not caught: $(grep -m3 -E 'PASS|FAIL' "$W/b4.log")"
restore "$SPINE"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
node scripts/check_plain_words.mjs > "$W/plain.log" 2>&1 && ok "plain words: $(tail -1 "$W/plain.log")" || bad "plain words: $(grep -m3 HIT "$W/plain.log")"
cover "$LOG" 'persons.email is optional' 'sign-in with the steward' 'a person added with no email' 'stored trimmed and lower-cased' 'an email already taken, in another case' 'an assessment naming an email' \
  'the same name (another case' 'the row records it' 'no other row records one' 'a credential for the email-less person' 'confirmed_distinct_from changed' 'a mixed-case email' \
  'roles: "Choose them" opens the role form' 'distinct: the confirmation says it in full' "w1: W1's form is the shared one" "measureby: Measure by's earliest day is" 'B1: ' 'B2: ' 'B3: ' 'B4: '

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
