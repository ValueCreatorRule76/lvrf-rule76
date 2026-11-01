#!/usr/bin/env bash
#
# L41 + L42 + L47 — evidence the score reads is final; source_verified set only by an opening; what evidence is
# about; runs seal what a recompute needs; account evidence (LVRF_PLAN §13; migration 0045; hardening.sql section
# 30; Brad's D1–D8 and four conditions, 1 Nov 2026). Local verification.
#
#   ./scripts/verify_evidence_final.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy` to `lvrf_verifyl41`, migrated and hardened, dropped on exit. Every guard stays on.
# DELIBERATE BREAKS, every file restored byte-identical, every function restored by re-applying hardening.sql:
#   B1  a final column added to the allowlist: the column check catches it
#   B2  the about guard switched to read nothing: the guard check catches it
#   B3  the grant guard not asking for an opening: the role check catches it
#   B4  the route taking source_verified again: the database still refuses it
#   B5  the batch without its count check: a count that was off is accepted, and caught
#   B6  v3 without verified_unopened: the seal check catches it
#   B7  the opening without its attester-document check: evidence_attestation_opened refuses it (condition 1)
#   B8  the opening refusing nothing on a statement observation: the form guard refuses it
#   B9  the route opening a simulated row: evidence_final refuses it (Brad, 1 Nov 2026)

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

VERIFY_DB=lvrf_verifyl41
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3105; VITE_PORT=5205; CDP_PORT=9365
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_l41.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
PRODUCE=server/routes/produceRun.ts; CITE=server/routes/evidenceCitation.ts; AEV=server/routes/accountEvidence.ts; OEV=server/routes/outcomeEvidence.ts
EDITED=("$PRODUCE" "$CITE" "$AEV" "$OEV")
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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "183" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 183 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
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

step "2. Clone the prod copy; migrate through 0045; harden; what 0045 changes"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
EV0="$(q "SELECT count(*) || '|' || md5(string_agg(md5(e::text), '' ORDER BY id)) FROM evidence e")"
AUD0="$(q "SELECT count(*) FROM audit_log WHERE table_name = 'evidence'")"
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (through 0045_l41_evidence_final)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "183" ] && ok "183 triggers (181 + evidence_final, value_outcome_evidence_about_guard)" || bad "triggers: $(trig)"
[ "$(q "SELECT count(*) FROM information_schema.triggers WHERE trigger_schema = 'public'")" = "284" ] && ok "  ...284 information_schema rows (281 + 3)" || bad "  ...rows"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 46 migrations, newest 0045_l41_evidence_final" && ok "drift: none, with evidence_verified_opened waiting ($DRIFT)" || bad "drift: $DRIFT"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | grep -qE "^105 CHECKs in the database: 105 with a plain sentence, 0 without; 0 stale" && ok "every CHECK has its plain sentence ($PLAIN)" || bad "plain: $PLAIN"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'evidence'")" = "$AUD0" ] && ok "0045 and hardening write no evidence row: the audit log gains nothing (L41-D3)" || bad "audit grew"
[ "$(q "SELECT count(*) || '|' || md5(string_agg(md5((to_jsonb(e) - 'about_institution_id' - 'about_other_party' - 'attester_document')::text), '' ORDER BY id)) FROM evidence e")" = "${EV0%%|*}|$(q "SELECT md5(string_agg(md5((to_jsonb(e) - 'about_institution_id' - 'about_other_party' - 'attester_document')::text), '' ORDER BY id)) FROM evidence e")" ] && ok "  ...all ${EV0%%|*} rows kept" || bad "  ...rows"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "  ...every run byte-identical" || bad "  ...a run changed"
[ "$(q "SELECT convalidated FROM pg_constraint WHERE conname = 'evidence_about_stated'")" = "f" ] && ok "evidence_about_stated binds new rows, not yet validated (condition 4)" || bad "about CHECK"
[ -z "$(q "SELECT 1 FROM pg_constraint WHERE conname = 'evidence_verified_opened'")" ] && ok "evidence_verified_opened waits: 4 rows break it" || bad "verified CHECK present"
[ "$(q "SELECT count(*) FROM evidence WHERE source_verified AND NOT citation_resolved")" = "4" ] && ok "  ...the 4 rows, as the report found" || bad "  ...not 4"

step "3. Fixtures and the server"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"
S_TITLE="$(q "SELECT lower(coalesce(title, '')) FROM persons WHERE id = '$S'")"
S_ROLE="$([ -n "$S_TITLE" ] && printf "the vendor's %s" "$S_TITLE" || printf "the vendor's staff")"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', 'x.$TS@l41.example') RETURNING id" | head -1)"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) SELECT '$S', '$TEN', '$S', 'Verification fixture grant' WHERE NOT EXISTS (SELECT 1 FROM access_grants WHERE person_id = '$S' AND tenant_id = '$TEN' AND revoked_at IS NULL)" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
start_server && ok "API up on $PORT"
acct() {  # NAME PERSONS_JSON -> INST, ACCT, P0, P1
  ACCT="$1 $TS"
  expect POST /api/account-inputs "$(J institution "$(J name "$ACCT" industry_slug manufacturing classification_note 'Verification: classified for L41.')" persons "$2")" 201 "account: $1"
  INST="$(rj b.institution_id)"; P0="$(rj b.person_ids[0])"; P1="$(rj "b.person_ids[1] ?? ''")"
  expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'L41 capability' owner_person_id "$P0" is_primary false basis 'Verification: the solution.')" 201 "  ...its offering"
  CAP="$(rj b.capability_id)"
}
SRCSYS="Customer HRIS, supplied by the customer (fixture, not a source)"
outcome() {  # NAME OWNER BASELINE -> O, ENG, MET
  expect POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name "L41 engagement $1" engagement_owner_person_id "$2" capability_name 'L41 capability' metric "$(J name "L41 days to productivity $1" unit days direction decrease source_system "$SRCSYS" owner_person_id "$2")" baseline_value "$3" baseline_measured_at 2023-06-30T00:00:00Z)" 201 "outcome $1, baseline $3"
  O="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"; MET="$(rj b.business_metric_id)"
}
seal() { expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'VALIDATED BASELINE' note "$2" source_fixture l41_fixture)" 201 "  ...produced: $2"; RUN="$(rj b.value_run_id)"; expect POST "/api/value-runs/$RUN/lock" "$(J lock_reason 'Verification: sealed.')" 200 "  ...locked"; }
Q='"evidence_form":"quote","quote_text":"Named in the fixture document as stated here.","how_read":"Read from the fixture document, page one (fixture)."'
FORMQ() { J evidence_form quote quote_text 'Named in the fixture document as stated here.' how_read 'Read from the fixture document, page one (fixture).'; }
acct "L41 account (fixture)" "[$(J full_name 'L41 owner (fixture)' email "owner.$TS@l41.example" title Owner)]"; INSTA="$INST"; OWNER="$P0"; ACCTA="$ACCT"
acct "L41 other account (fixture)" "[$(J full_name 'L41 other (fixture)' email "other.$TS@l41.example" title Owner)]"; INSTB="$INST"; INST="$INSTA"
outcome A "$OWNER" 30; OA="$O"; ENGA="$ENG"
E="/api/value-outcomes/$OA/evidence"
src() { node -e 'const b=JSON.parse(process.argv[1]);const f=JSON.parse(process.argv[2]);console.log(JSON.stringify({...b,...f}))' "$1" "$(FORMQ)"; }

step "4. The routes stop taking source_verified; about is required (D1; condition 2 of C3b)"
raw POST "$E" "$(src "$(J about account kind public_filing provenance 'Fixture filing (not a source)' summary 'L41 raw' supports baseline source_verified true)")" 422 "outcome evidence with source_verified: refused" "is not taken"
raw POST "$E" "$(src "$(J kind public_filing provenance 'Fixture filing (not a source)' summary 'L41 raw' supports baseline)")" 422 "outcome evidence not saying what it is about: refused" "Say what this evidence is about"
raw POST "$E" "$(src "$(J about "$(J other_party Ab)" kind public_filing provenance 'Fixture filing (not a source)' summary 'L41 raw' supports impact_basis)")" 422 "  ...a company named in under 3 characters: refused" "in at least 3 characters"
raw POST "/api/institutions/$INSTA/facts" '{"kind":"system","value_text":"Workday","as_of":"2026-10-01","evidence_kind":"public_filing","provenance":"Fixture filing (not a source)","confidence":"medium","source_verified":true,"ai_sourced":false,"evidence_form":"quote","quote_text":"Workday is the system of record.","how_read":"Read from the fixture document, page one."}' 422 "a fact with source_verified: refused" "is not taken"
A="/api/institutions/$INSTA/evidence"
raw POST "$A" "$(src "$(J about account kind artifact provenance 'Fixture org chart (not a source)' summary 'L41 org chart' supports baseline)")" 400 "account evidence with supports: refused" "account evidence supports no outcome"
raw POST "$A" "$(src "$(J about account kind artifact provenance 'Fixture org chart (not a source)' summary 'L41 org chart' source_verified true)")" 400 "account evidence with source_verified: refused" "is not taken"
raw POST "$A" "$(src "$(J about account kind artifact provenance 'Fixture org chart (not a source)' summary 'L41 org chart' ai_sourced true)")" 400 "account evidence with ai_sourced: refused (one research path)" "by research"
raw POST "$A" "$(J about account kind observation provenance 'Fixture note (not a source)' summary 'L41 note' evidence_form statement)" 422 "an account observation as a statement: refused" "must rest on a quote or a locator"
raw POST "$A" "$(src "$(J about account kind artifact provenance 'Fixture org chart (not a source)' summary 'L41 org chart naming the owner')")" 201 "L47: account evidence recorded, with no outcome link"; ORG="$(rj b.evidence_id)"
[ "$(q "SELECT source_verified || '|' || citation_resolved || '|' || (about_institution_id = institution_id) || '|' || evidence_form || '|' || (SELECT count(*) FROM value_outcome_evidence l WHERE l.evidence_id = e.id) FROM evidence e WHERE id = '$ORG'")" = "false|false|true|quote|0" ] && ok "  ...born unverified, about this account, a quote, and no link" || bad "  ...row"
# B4 — the route taking source_verified again: the database still refuses.
edit "$OEV" "      const offeredVerified = body.source_verified !== undefined;" "      const offeredVerified = false as boolean;"
edit "$OEV" "VALUES (\$1, \$2, \$3, \$4, \$5, \$6, false, \$7," "VALUES (\$1, \$2, \$3, \$4, \$5, \$6, true, \$7,"
stop_server; start_server
raw POST "$E" "$(src "$(J about account kind public_filing provenance 'Fixture filing (not a source)' summary 'L41 B4' supports impact_basis)")" 422 "B4: the route writing source_verified true → the database refuses" "recorded unverified"
restore "$OEV"; stop_server; start_server

step "5. Every final column, by UPDATE, as lvrf_app (L41)"
for c in "kind = 'public_filing'" "summary = 'x'" "provenance = 'xxxxxxxxxxxxxxx'" "source_reference = 'x'" "confidence = 'high'" "simulated = true" "research_query = 'x'" "research_tool = 'x'" "attested_at = now()" "captured_at = now()" "captured_by_person_id = '$OWNER'" "institution_id = '$INSTB'"; do
  sqlapp "UPDATE evidence SET $c" "UPDATE evidence SET $c WHERE id = '$ORG'" "what it records is final"
done
sqlapp "attested_by_person_id set" "UPDATE evidence SET attested_by_person_id = '$OWNER', attested_at = now() WHERE id = '$ORG'" "what it records is final"
sqlapp "about changed once stated" "UPDATE evidence SET about_institution_id = '$INSTB' WHERE id = '$ORG'" "stated once"
sqlapp "verified by UPDATE, no opening" "UPDATE evidence SET source_verified = true WHERE id = '$ORG'" "only a person opening the source verifies it"
sqlapp "the attester's document, no opening" "UPDATE evidence SET attester_document = 'email' WHERE id = '$ORG'" "named in the opening"
INS="INSERT INTO evidence (institution_id, kind, summary, provenance, captured_by_person_id, evidence_form, quote_text, how_read"
VAL="VALUES ('$INSTA', 'artifact', 'x', 'xxxxxxxxxxxx', '$S', 'quote', 'q', 'Read from the fixture document, page one (fixture)'"
sqlapp "INSERT verified" "$INS, about_institution_id, source_verified) $VAL, '$INSTA', true)" "recorded unverified"
sqlapp "INSERT with the attester's document" "$INS, about_institution_id, attester_document) $VAL, '$INSTA', 'email')" "named when the attestation is opened"
# Gate A: a NULL-input refusal per new CHECK.
sqlapp "evidence_about_stated: both unset (NULL)" "$INS) $VAL)" "evidence_about_stated"
sqlapp "evidence_about_stated: both set" "$INS, about_institution_id, about_other_party) $VAL, '$INSTA', 'Another Co')" "evidence_about_stated"
sqlapp "evidence_about_stated: empty text" "$INS, about_other_party) $VAL, '  ')" "evidence_about_stated"
sqlapp "evidence_attester_document_known: an unknown document" "UPDATE evidence SET citation_resolved = true, citation_resolved_by_person_id = '$S', citation_resolved_at = now(), attester_document = 'fax' WHERE id = '$ORG'" "evidence_attester_document_known"
# B1 — a final column left out of the guard.
fnbreak lvrf_evidence_final "ARRAY['updated_at', 'status'," "ARRAY['kind', 'updated_at', 'status',"
[ "$(sqlaccepted "UPDATE evidence SET kind = 'public_filing' WHERE id = '$ORG'")" = "ACCEPTED" ] && ok "B1: a final column on the allowlist → caught: the update went through (rolled back)" || bad "B1: not accepted"
reharden

step "6. What evidence is about: baseline and actual support (L41)"
raw POST "$A" "$(src "$(J about "$(J institution_id "$INSTB")" kind public_filing provenance 'Fixture filing (not a source)' summary 'L41 about the other account')")" 201 "evidence about another account"; ABOUTB="$(rj b.evidence_id)"
raw POST "$A" "$(src "$(J about "$(J other_party 'Acme Fixture Co') " kind public_filing provenance 'Fixture filing (not a source)' summary 'L41 about another company')")" 201 "evidence about another company, named"; ABOUTC="$(rj b.evidence_id)"
[ "$(q "SELECT about_other_party FROM evidence WHERE id = '$ABOUTC'")" = "Acme Fixture Co" ] && ok "  ...its about reads as named" || bad "  ...about"
LEG="$(q "SELECT id FROM evidence WHERE about_institution_id IS NULL AND about_other_party IS NULL ORDER BY id LIMIT 1")"
for sup in baseline actual; do
  sqlapp "another account's evidence as $sup" "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OA', '$ABOUTB', '$sup')" "not about this account"
  sqlapp "another company's as $sup" "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OA', '$ABOUTC', '$sup')" "not about this account"
  sqlapp "a row with nothing stated as $sup" "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OA', '$LEG', '$sup')" "nothing yet stated"
done
[ "$(sqlaccepted "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OA', '$ABOUTC', 'impact_basis')")" = "ACCEPTED" ] && ok "another company's evidence as the impact basis: accepted, as Scotts' vendor publication is" || bad "impact basis"
expect POST "$E" "$(src "$(J about "$(J other_party 'Acme Fixture Co')" kind public_filing provenance 'Fixture filing (not a source)' summary 'L41 baseline about another company' supports baseline)")" 422 "the route, the same: another company's evidence as baseline refused" "not about this account"
# B2 — the about guard reading nothing.
fnbreak lvrf_outcome_evidence_about_guard "IF about IS NULL OR about IS DISTINCT FROM own THEN" "IF false THEN"
[ "$(sqlaccepted "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$OA', '$ABOUTB', 'baseline')")" = "ACCEPTED" ] && ok "B2: the about guard reading nothing → caught: another account's evidence went in as baseline (rolled back)" || bad "B2"
reharden

step "7. The opening: the one act that verifies (L41; condition 1)"
OC() { echo "/api/evidence/$1/open-citation"; }
sqlapp "an opening with no act" "UPDATE evidence SET citation_resolved = true, citation_resolved_by_person_id = '$S', citation_resolved_at = now(), source_verified = true WHERE id = '$ORG'; COMMIT; BEGIN" "with no governance act"
expect POST "$(OC "$ORG")" '{"source_verified":true}' 200 "a person opens the org chart: verified, by an act"
[ "$(q "SELECT source_verified || '|' || citation_resolved || '|' || (citation_resolved_by_person_id = '$S') || '|' || (SELECT count(*) FROM governance_acts a WHERE a.act = 'open_citation' AND a.subject_id = e.id) FROM evidence e WHERE id = '$ORG'")" = "true|true|true|1" ] && ok "  ...who, and one act" || bad "  ...row"
expect POST "$(OC "$ORG")" '{"source_verified":true}' 409 "  ...a second opening refused" "already opened"
expect POST "$E" "$(J about account kind observation provenance 'Fixture note (not a source)' summary 'L41 statement observation' supports impact_basis evidence_form statement)" 201 "a statement observation, citing no source"; STOBS="$(rj b.evidence_id)"
expect POST "$(OC "$STOBS")" '{"source_verified":true}' 409 "  ...opening it refused" "nothing to open"
# Condition 1: an attestation.
expect POST "$A" "$(J about account kind attestation provenance 'Fixture attestation (not a source)' summary 'L41 attestation by the owner' attested_by_person_id "$OWNER" attested_at 2026-10-01T00:00:00Z evidence_form statement)" 201 "a statement attestation"; ATT="$(rj b.evidence_id)"
expect POST "$(OC "$ATT")" '{"source_verified":true}' 422 "  ...opened with no document: refused" "name the document from that person"
expect POST "$(OC "$ATT")" "$(node -e 'console.log(JSON.stringify({source_verified:true,attester_document:"fax"}))')" 422 "  ...a document that is not one of the three: refused" "name the document"
expect POST "$(OC "$ATT")" '{"source_verified":true,"attester_document":"email"}' 422 "  ...no quote or locator: refused, the attester's own words" "Say what this evidence rests on"
expect POST "$(OC "$ATT")" "$(node -e 'console.log(JSON.stringify({source_verified:true,attester_document:"email",evidence_form:"statement"}))')" 422 "  ...a statement again: refused, never the analyst's typing" "not a source for it"
# B7 — the document check removed: the database refuses (two guards).
edit "$CITE" "if (typeof body.attester_document !== 'string' || !ATTESTER_DOCUMENTS.includes(body.attester_document)) {" "if (false as boolean) {"
edit "$CITE" "          document = body.attester_document;" "          document = null;"
stop_server; start_server
expect POST "$(OC "$ATT")" "$(node -e 'const f=JSON.parse(process.argv[1]);console.log(JSON.stringify({source_verified:true,...f}))' "$(FORMQ)")" 422 "B7: the route's document check removed → evidence_attestation_opened refuses (condition 1)" "attester's own words"
restore "$CITE"; stop_server; start_server
expect POST "$(OC "$ATT")" "$(node -e 'const f=JSON.parse(process.argv[1]);console.log(JSON.stringify({source_verified:true,attester_document:"signed_statement",...f}))' "$(FORMQ)")" 200 "  ...from a signed statement, with a quote: verified"
[ "$(q "SELECT evidence_form || '|' || attester_document || '|' || source_verified FROM evidence WHERE id = '$ATT'")" = "quote|signed_statement|true" ] && ok "  ...the row took the quote, once, in the opening" || bad "  ...row"
sqlapp "the quote changed after" "UPDATE evidence SET quote_text = 'other words' WHERE id = '$ATT'" "final once recorded"
# B8 — the route refusing nothing on a statement observation: the form guard holds.
edit "$CITE" "if (e.evidence_form === 'statement' && e.kind === 'observation') {" "if (false as boolean) {"
stop_server; start_server
expect POST "$(OC "$STOBS")" "$(node -e 'const f=JSON.parse(process.argv[1]);console.log(JSON.stringify({source_verified:true,...f}))' "$(FORMQ)")" 422 "B8: the route's refusal removed → the form guard refuses a statement observation taking a quote" "final once recorded"
restore "$CITE"; stop_server; start_server
SIMR="$(q "SELECT id FROM evidence WHERE id::text LIKE 'eea43d9a%'")"
expect POST "$(OC "$SIMR")" '{"source_verified":false}' 409 "simulated evidence: there is no source to open" "no source to open"
sqlapp "  ...at the database, unverified" "UPDATE evidence SET citation_resolved = true, citation_resolved_by_person_id = '$S', citation_resolved_at = now() WHERE id = '$SIMR'" "no source to open"
sqlapp "  ...at the database, verified" "UPDATE evidence SET citation_resolved = true, citation_resolved_by_person_id = '$S', citation_resolved_at = now(), source_verified = true WHERE id = '$SIMR'" "no source to open"
# B9 — the route's refusal removed: the trigger holds (Brad, 1 Nov 2026).
edit "$CITE" "if (e.simulated) {" "if (false as boolean) {"
stop_server; start_server
expect POST "$(OC "$SIMR")" '{"source_verified":false}' 422 "B9: the route's refusal removed → evidence_final refuses a simulated opening" "no source to open"
[ "$(q "SELECT citation_resolved FROM evidence WHERE id = '$SIMR'")" = "f" ] && ok "  ...and nothing was written" || bad "  ...the row moved"
restore "$CITE"; stop_server; start_server
expect POST "$E" "$(src "$(J about account kind public_filing provenance 'Fixture filing (not a source)' summary 'L41 does not support' supports impact_basis)")" 201 "evidence that will not hold"; NOHOLD="$(rj b.evidence_id)"
expect POST "$(OC "$NOHOLD")" '{"source_verified":false}' 200 "  ...opened: it does not support it"
expect POST "$(OC "$NOHOLD")" '{"source_verified":true}' 409 "  ...and that is final" "already opened"
expect POST "/api/evidence/$NOHOLD/withdraw-verification" "$(J reason 'Verification: not a verified row.')" 409 "  ...a withdrawal refused on any row but a verified, unopened one" "opened by a person"
expect POST "/api/evidence/$STOBS/withdraw-verification" "$(J reason 'Verification: not a verified row.')" 409 "  ...and on an unverified one" "not verified"

step "8. The role's source (D6; L47)"
GR() { J person_id "$OWNER" role metric_owner source_evidence_id "$1" reason 'Verification: named from the fixture org chart.'; }
CR="/api/institutions/$INSTA/customer-roles"
raw POST "$A" "$(src "$(J about account kind artifact provenance 'Fixture org chart, unopened (not a source)' summary 'L41 unopened chart')")" 201 "a chart nobody opened"; UNOPENED="$(rj b.evidence_id)"
expect POST "$CR" "$(GR "$UNOPENED")" 422 "a role from a source nobody opened: refused" "opened by a person"
expect POST "$CR" "$(GR "$NOHOLD")" 422 "from a source opened and not supporting it: refused" "opened by a person"
expect POST "$(OC "$ABOUTC")" '{"source_verified":true}' 200 "another company's row opened"
expect POST "$CR" "$(GR "$ABOUTC")" 422 "from a source about another company: refused" "about this account"
raw POST "$A" "$(src "$(J about account kind artifact provenance 'Fixture chart to supersede (not a source)' summary 'L41 superseded chart')")" 201 "a chart to supersede"; SUP="$(rj b.evidence_id)"
expect POST "$(OC "$SUP")" '{"source_verified":true}' 200 "  ...opened"
expect POST "/api/evidence/$SUP/supersede" "$(src "$(J about account kind artifact provenance 'Fixture chart, corrected (not a source)' summary 'L41 corrected chart' reason 'Verification: the chart was the wrong year.')")" 201 "the steward supersedes it"; SUPNEW="$(rj b.evidence_id)"
expect POST "$CR" "$(GR "$SUP")" 422 "from a superseded source: refused" "current evidence"
[ "$(q "SELECT source_verified || '|' || citation_resolved FROM evidence WHERE id = '$SUPNEW'")" = "false|false" ] && ok "  ...its successor is born unverified" || bad "  ...successor"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'supersede' AND subject_id = '$SUP' AND result_id = '$SUPNEW' AND reason LIKE 'Verification:%'")" = "1" ] && ok "  ...one act, the reason on it" || bad "  ...act"
# B3 — the grant guard not asking for an opening.
fnbreak lvrf_customer_role_grant_guard "AND e.citation_resolved AND e.source_verified) THEN" ") THEN"
expect POST "$CR" "$(GR "$UNOPENED")" 201 "B3: the guard not asking for an opening → caught: a role went in from a source nobody opened"
GB="$(rj b.customer_role_grant_id)"
expect POST "/api/customer-roles/$GB/revoke" "$(J reason 'Verification: the break is over.')" 200 "  ...revoked"
reharden
expect GET "$CR" "" 200 "the roles card's list"
[ "$(rj "b.sources.map(s=>s.id).join()")" = "$ORG,$ATT" ] && ok "  ...offers only the opened, supporting, current rows about this account" || bad "  ...sources: $(rj 'b.sources.map(s=>s.summary).join("|")')"
expect POST "$CR" "$(GR "$ORG")" 201 "the role, from the opened chart"; GID="$(rj b.customer_role_grant_id)"
expect POST "/api/evidence/$ORG/supersede" "$(src "$(J about account kind artifact provenance 'Fixture chart, corrected (not a source)' summary 'L41 chart again' reason 'Verification: the chart was the wrong year.')")" 409 "a supersession refused while a role names it" "Revoke the role first"
sqlapp "  ...at the database too" "UPDATE evidence SET superseded_by_id = '$SUPNEW' WHERE id = '$ORG'" "Revoke the role first"

step "9. The about batch (D3; condition 2)"
SELF_INST="$(q "SELECT id FROM institutions WHERE is_tenant_self LIMIT 1")"
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
ABOUT_COUNT=34 ABOUT_OPEN=4 cw aboutbatch
B=/api/evidence/about-batch
expect GET "$B" "" 200 "the dry run"
[ "$(rj b.count)" = "34" ] && ok "  ...lists all 34 rows" || bad "  ...count: $(rj b.count)"
[ "$(rj "b.rows.every(r=>r.summary&&r.provenance&&r.account&&r.kind)")" = "true" ] && ok "  ...each with its own summary and source" || bad "  ...fields"
[ "$(rj "b.rows.filter(r=>r.proposed==='account').length")" = "30" ] && ok "  ...30 pre-filled, derived" || bad "  ...filled: $(rj "b.rows.filter(r=>r.proposed==='account').length")"
UNF="$(rj "b.rows.filter(r=>r.proposed===null).map(r=>r.id.slice(0,8)).sort().join()")"
[ "$UNF" = "092c46b6,423be7c6,cee6fea9,f9775317" ] && ok "  ...4 left open: the 2 exceptions and the 2 rows the rule cannot tell from them ($UNF)" || bad "  ...open: $UNF"
ITEMS="$(rj "JSON.stringify(b.rows.map(r=>({evidence_id:r.id,about:r.id.startsWith('423be7c6')?{other_party:'Fixture customer of the story'}:r.id.startsWith('f9775317')||r.id.startsWith('cee6fea9')?{institution_id:b.accounts.find(a=>a.name==='Skillsoft').id}:'account'})))")"
REASON='Verification: stated from each row, as the batch shows it.'
BODY() { node -e 'console.log(JSON.stringify({expected_count:+process.argv[1],items:JSON.parse(process.argv[2]),reason:process.argv[3]}))' "$1" "$2" "$3"; }
expect POST "$B" "$(BODY 33 "$ITEMS" "$REASON")" 409 "a count that changed: refused, nothing written" "The count changed"
[ "$(q "SELECT count(*) FROM evidence WHERE about_institution_id IS NULL AND about_other_party IS NULL")" = "34" ] && ok "  ...34 still wait" || bad "  ...rows moved"
expect POST "$B" "$(BODY 34 '[]' "$REASON")" 422 "the rows not all stated: refused" "every row"
expect POST "$B" "$(BODY 34 "$ITEMS" "$REASON")" 403 "not the steward: refused" "" "$X"
# B5 — the batch without its count check.
edit "$AEV" "if (rows.length !== b.expected_count) throw" "if (false as boolean) throw"
stop_server; start_server
expect POST "$B" "$(BODY 33 "$ITEMS" "$REASON")" 201 "B5: the count check removed → caught: a count that was off was accepted"
restore "$AEV"; stop_server; start_server
q "SELECT 1" > /dev/null
ACTS="$(q "SELECT count(*) FROM governance_acts WHERE act = 'state_about'")"
[ "$ACTS" = "34" ] && ok "  ...the 34 stated, one state_about act each, by the steward" || bad "  ...acts: $ACTS"
[ "$(q "SELECT count(*) FROM evidence WHERE about_institution_id IS NULL AND about_other_party IS NULL")" = "0" ] && ok "  ...none waits" || bad "  ...some wait"
[ "$(q "SELECT lvrf_evidence_about(about_institution_id, about_other_party) FROM evidence WHERE id::text LIKE '423be7c6%'")" = "Fixture customer of the story" ] && ok "  ...423be7c6 reads as named" || bad "  ...423be7c6"
[ "$(q "SELECT lvrf_evidence_about(about_institution_id, about_other_party) FROM evidence WHERE id::text LIKE 'f9775317%'")" = "Skillsoft" ] && ok "  ...f9775317 about Skillsoft, sitting on Curia" || bad "  ...f9775317"
sqlapp "stated again" "UPDATE evidence SET about_other_party = 'Other Co', about_institution_id = NULL WHERE id::text LIKE '423be7c6%'" "stated once"

step "10. The 4 rows, each opened or withdrawn, by a person (D4)"
CURIA="$(q "SELECT institution_id FROM evidence WHERE id::text LIKE '1632a5e0%'")"
expect GET "/api/institutions/$CURIA/pov" "" 200 "Curia's POV"
[ "$(rj "b.outcomes.flatMap(o=>o.withdrawn_links).filter(e=>e.verified_unopened).length")" = "3" ] && ok "  ...the POV reads verified_unopened on Curia's 3 links withdrawn by C3b's acts" || bad "  ...POV: $(rj "b.outcomes.flatMap(o=>o.withdrawn_links).length")"
expect GET "/api/lineage/evidence/$(q "SELECT id FROM evidence WHERE id::text LIKE '1632a5e0%'")" "" 200 "its lineage"
[ "$(rj "(Array.isArray(b)?b:b.steps).find(s=>s.kind==='evidence').detail.verified_unopened")" = "true" ] && ok "  ...the lineage says so" || bad "  ...lineage"
SELF_INST="$SELF_INST" CURIA_INST="$CURIA" UNOPENED_ROW="$(q "SELECT id FROM evidence WHERE id::text LIKE '9765335f%'")" \
  ROW_9="$(q "SELECT id FROM evidence WHERE id::text LIKE '9765335f%'")" ROW_2="$(q "SELECT id FROM evidence WHERE id::text LIKE '271a449a%'")" \
  ROW_1="$(q "SELECT id FROM evidence WHERE id::text LIKE '1632a5e0%'")" ROW_F="$(q "SELECT id FROM evidence WHERE id::text LIKE 'f9775317%'")" cw fourrows
# On this clone only: nothing here reaches prod. Curia's real rows, linked to its live outcome under a hypothesis.
LAR="$(q "SELECT value_outcome_id FROM (SELECT vo.id AS value_outcome_id FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id WHERE vo.institution_id = '$CURIA' AND bm.industry_measure_id IS NOT NULL AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL) x")"
LARM="$(q "SELECT bm.industry_measure_id FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id WHERE vo.id = '$LAR'")"
expect POST "/api/industry-measures/$LARM/levers" "$(J name 'Fixture lever (clone only)' mechanism 'A fixture mechanism, for the render check only.' leading_indicator 'Fixture indicator' citation 'Fixture citation, not a source')" 201 "a fixture lever on the clone"; FLEV="$(rj b.value_lever_id)"
expect POST "/api/institutions/$CURIA/hypotheses" "$(J value_outcome_id "$LAR" value_lever_id "$FLEV" statement 'A fixture hypothesis, for the render check on this clone only.' falsifier_reference baseline falsifier_due 2099-01-01 falsifier_conditions 'no better than the reference')" 201 "a fixture hypothesis on the clone"
for r in 1632a5e0 f9775317; do
  [ "$(sqlcommit "INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) SELECT '$LAR', id, 'impact_basis' FROM evidence WHERE id::text LIKE '$r%'")" = "ACCEPTED" ] && ok "  ...$r linked as impact basis, on the clone" || bad "  ...$r not linked"
done
CURIA_INST="$CURIA" cw fourlinked
CZO="$(q "SELECT value_outcome_id FROM value_outcome_evidence WHERE evidence_id::text LIKE '9765335f%'")"
CZE="$(q "SELECT engagement_id FROM value_outcomes WHERE id = '$CZO'")"
expect POST "/api/engagements/$CZE/produce-run" "$(J banner_title 'L41 V3' note 'Verification: sealed with a row verified and unopened.' source_fixture l41_fixture)" 201 "a run while a row is verified and unopened"; RV="$(rj b.value_run_id)"
[ "$(q "SELECT x->>'verified_unopened' FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$RV' AND x->>'evidence_id' LIKE '9765335f%'")" = "true" ] && ok "condition 3: the v3 seal carries \"verified without the source being opened\" beside it" || bad "condition 3"
[ "$(q "SELECT payload->>'payloadVersion' FROM value_runs WHERE id = '$RV'")" = "3" ] && ok "  ...payloadVersion 3" || bad "  ...version"
RUN="$RV" cw seal
R9="$(q "SELECT id FROM evidence WHERE id::text LIKE '9765335f%'")"; R2="$(q "SELECT id FROM evidence WHERE id::text LIKE '271a449a%'")"; R1="$(q "SELECT id FROM evidence WHERE id::text LIKE '1632a5e0%'")"; RF="$(q "SELECT id FROM evidence WHERE id::text LIKE 'f9775317%'")"
expect POST "$(OC "$R9")" '{"source_verified":true}' 422 "opening a row from before forms with no reading: refused" "Say what this evidence rests on"
expect POST "$(OC "$R9")" "$(node -e 'console.log(JSON.stringify({source_verified:true,evidence_form:"locator",how_read:"The LTM rate, read from the fixture copy of the filing.",locator:{document:"Fixture Q1 filing",value:98,scale:"percent"}}))')" 200 "9765335f opened, with a locator"
[ "$(q "SELECT evidence_form || '|' || source_verified || '|' || citation_resolved FROM evidence WHERE id = '$R9'")" = "locator|true|true" ] && ok "  ...it moved from legacy, once" || bad "  ...row"
[ -n "$(q "SELECT 1 FROM figure_checks WHERE evidence_id = '$R9'")" ] && ok "  ...and its reading is checked against the figure it supports" || bad "  ...no figure check"
sqlapp "  ...the form back to legacy" "UPDATE evidence SET evidence_form = 'legacy', locator = NULL, how_read = NULL WHERE id = '$R9'" "final once recorded"
expect POST "$(OC "$R2")" '{"source_verified":false}' 200 "271a449a opened: not supported, so it stops being verified"
[ "$(q "SELECT source_verified || '|' || citation_resolved || '|' || evidence_form FROM evidence WHERE id = '$R2'")" = "false|true|legacy" ] && ok "  ...no reading is recorded" || bad "  ...row"
expect POST "$(OC "$R1")" '{"source_verified":true}' 409 "a row under a finding: its opening refused" "no source on record"
expect POST "/api/evidence/$R1/withdraw-verification" "$(J reason short)" 422 "a withdrawal with no reason: refused" "at least 12"
expect POST "/api/evidence/$R1/withdraw-verification" "$(J reason 'Verification: no source exists to open.')" 403 "not the steward: refused" "" "$X"
sqlapp "  ...at the database, not the steward" "SELECT set_config('lvrf.actor_person_id', '$X', true); UPDATE evidence SET source_verified = false WHERE id = '$R1'" "only the tenant's steward"
expect POST "/api/evidence/$R1/withdraw-verification" "$(J reason 'Verification: no source exists to open.')" 200 "1632a5e0 withdrawn"
expect POST "/api/evidence/$RF/withdraw-verification" "$(J reason 'Verification: it supports nothing now.')" 200 "f9775317 withdrawn"
[ "$(q "SELECT count(*) FROM evidence WHERE source_verified AND NOT citation_resolved")" = "0" ] && ok "no row is verified with no opening" || bad "rows remain"
[ "$(q "SELECT count(*) FROM governance_acts WHERE act = 'withdraw' AND subject_table = 'evidence'")" = "2" ] && ok "  ...each withdrawal with its act" || bad "  ...acts"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'evidence' AND record_id = '$R1' AND old_row->>'source_verified' = 'true' AND new_row->>'source_verified' = 'false'")" = "1" ] && ok "  ...and its history stands in the audit log" || bad "  ...audit"

step "11. The re-run of hardening.sql completes both CHECKs (condition 4)"
DRIFT2="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1 || true)"
printf '%s' "$DRIFT2" | grep -q "evidence_verified_opened" && ok "before the re-run, drift names the CHECK now due: it cannot be left undone" || bad "drift before: $DRIFT2"
reharden
[ "$(q "SELECT convalidated FROM pg_constraint WHERE conname = 'evidence_about_stated'")" = "t" ] && ok "evidence_about_stated validated" || bad "about not validated"
[ "$(q "SELECT convalidated FROM pg_constraint WHERE conname = 'evidence_verified_opened'")" = "t" ] && ok "evidence_verified_opened added, valid" || bad "verified CHECK"
DRIFT3="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT3" | grep -q "schema drift: none (journal 46 migrations" && ok "drift: none ($DRIFT3)" || bad "drift: $DRIFT3"
PLAIN2="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN2" | grep -qE "^106 CHECKs in the database: 106 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN2" || bad "plain: $PLAIN2"
reharden
sqlrefused "evidence_verified_opened: verified, no opening, past the guard (NULL-free input)" "ALTER TABLE evidence DISABLE TRIGGER evidence_final; UPDATE evidence SET source_verified = true WHERE id = '$UNOPENED'" "evidence_verified_opened"

step "12. The seals, and the 23 Aug updates"
expect POST "/api/value-outcomes/$OA/evidence" "$(src "$(J about account kind system_export provenance 'Fixture export (not a source)' summary 'L41 baseline export' supports baseline)")" 201 "a baseline export"; BE="$(rj b.evidence_id)"
expect POST "$(OC "$BE")" '{"source_verified":true}' 200 "  ...opened"
seal "$ENGA" "Verification: v3."; RA="$RUN"
ITEM="$(q "SELECT (x->>'evidence_id' = '$BE') || '|' || (x->>'about') || '|' || (x->'opened'->>'by') || '|' || (x->>'verified_unopened') FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$RA' AND x->>'summary' = 'L41 baseline export'")"
[ "$ITEM" = "true|$ACCTA|$S_NAME|false" ] && ok "a v3 item seals its row, what it is about, and who opened it" || bad "item: $ITEM"
HASH1="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>&1 | tail -1)"
RUNS1="$(q "SELECT count(*) FROM value_runs")"
printf '%s' "$HASH1" | grep -qE "^$RUNS1 runs: recompute matches $RUNS1, differs 0; embedded payloadHash matches $RUNS1, differs 0" && ok "check_run_hashes, v3 with the rest: $HASH1" || bad "hashes: $HASH1"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r WHERE r.source_fixture IS DISTINCT FROM 'l41_fixture'")" = "$RUNS0" ] && ok "every older run byte-identical after all of this" || bad "an older run changed"
# B6 — v3 without verified_unopened.
edit "$PRODUCE" "        verified_unopened: r.source_verified && !r.citation_resolved,
" ""
stop_server; start_server
seal "$ENGA" "Verification: B6."; RB6="$RUN"
[ -z "$(q "SELECT x->>'verified_unopened' FROM value_runs r, jsonb_array_elements(r.payload->'evidence') x WHERE r.id = '$RB6' AND x->>'summary' = 'L41 baseline export'")" ] && ok "B6: v3 without verified_unopened → caught: the key is gone" || bad "B6"
restore "$PRODUCE"; stop_server; start_server
SIM="$(q "SELECT id FROM evidence WHERE id::text LIKE 'eea43d9a%'")"
expect GET "/api/lineage/evidence/$SIM" "" 200 "the lineage of a 23 Aug row"
[ "$(rj "(Array.isArray(b)?b:b.steps).filter(s=>s.kind==='migration_rule').map(s=>s.source+'|'+s.actor+'|'+s.detail.note).join()")" = "record|null|Set simulated by migration 0011's rule (provenance beginning [SIM]); no person acted." ] && ok "D7: it says a rule set simulated and no person acted; nothing was written" || bad "D7: $(rj "JSON.stringify((Array.isArray(b)?b:b.steps).map(s=>s.kind))")"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'evidence' AND actor_person_id IS NULL")" = "2" ] && ok "  ...the 2 no-actor updates stay the only ones: this slice added none" || bad "  ...no-actor updates: $(q "SELECT count(*) FROM audit_log WHERE table_name = 'evidence' AND actor_person_id IS NULL")"
expect GET "/api/lineage/evidence/$R9" "" 200 "9765335f's lineage"
[ "$(rj "(Array.isArray(b)?b:b.steps).filter(s=>s.kind==='state_about'||s.kind==='open_citation').map(s=>s.kind+':'+s.source).sort().join()")" = "open_citation:act,state_about:act" ] && ok "  ...its about and its opening, each an act" || bad "  ...steps"

step "13. The walk"
acct "L41 walk account (fixture)" "[$(J full_name 'L41 walk owner (fixture)' email "walk.$TS@l41.example" title Owner)]"
WALK_INST="$INST" WALK_PERSON='L41 walk owner (fixture)' cw source
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
