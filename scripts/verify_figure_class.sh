#!/usr/bin/env bash
#
# S7a (LVRF_PLAN §33, approved by Brad 25 Nov 2026: D1-D7, D2 departing from §27 D5) — the published figure's class.
#
#   ./scripts/verify_figure_class.sh [out_dir]
#
#   1. A clone of the prod copy migrated to 0054 and hardened: the column nullable, its five values held; every existing
#      row's own fields unchanged, its class null; 233 triggers; drift none at 0054.
#   2. The wording: server/lib/figureClass.ts and client/src/lib/figureClass.ts equal each other and the ruled table.
#   3. The database, as lvrf_app, rolled back: a vendor publication on another account without a class refused, with
#      each of the five accepted; a public filing with or without one accepted; a class on an observation, or on your own
#      company's account, refused; the class changed refused (fixed at recording).
#   4. The routes: D4's refusals, nothing written; a classed vendor publication recorded, and superseded only with a
#      class; the outcome's evidence route the same.
#   5. The page: card 01c's record and supersede forms, W6's, your own company's; the ruled lines, contrast, the
#      confirmation, 390.
#   Breaks: B1 the database's required rule, B2 the class made editable, B3 the class missing from the confirmation, B4
#   the route's check (the database still refuses, its refusal recorded).

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

VERIFY_DB=lvrf_verifyfigclass
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3451; VITE_PORT=5451; CDP_PORT=9561
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_figclass.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
AEV=client/src/components/AccountEvidence.tsx; AER=server/routes/accountEvidence.ts
EDITED=("$AEV" "$AER")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
# stop_port and by_port are scripts/lib/ports.sh's (sourced by finish.sh): a listener is stopped only if it is this script's own.
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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "233" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 233 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
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
  env VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT_DIR="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" TAG="$tag" "$@" node scripts/lib/figure_class_walk.mjs "$s" > "$log" 2>&1 \
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
REQ="A vendor publication about another account says what kind of figure it gives."
REF="Only a vendor publication or a public filing about another account says what kind of figure it gives."
FIX="What kind of figure a source gives is fixed when it is recorded; correct it by supersession."

step "1. Clone the prod copy, migrate to 0054, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
EF="concat_ws('|', id, institution_id, kind, summary, provenance, source_reference, source_verified, citation_resolved, superseded_by_id, deleted_at, quote_text, how_read, about_institution_id, about_other_party)"
EV0="$(q "SELECT md5(string_agg(md5($EF), '' ORDER BY id)) FROM evidence")"
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated to 0054" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "233" ] && ok "233 triggers: S7a adds none" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 57 migrations, newest 0056_s7b2_one_current_story" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every run byte-identical" || bad "a run changed"
[ "$(q "SELECT md5(string_agg(md5($EF), '' ORDER BY id)) FROM evidence")" = "$EV0" ] && [ "$(q "SELECT count(*) FROM evidence WHERE published_figure_class IS NOT NULL")" = "0" ] \
  && ok "every existing evidence row's own fields unchanged, its class null" || bad "evidence changed"
q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'evidence_published_figure_class_known'" | grep -q "'license_count'::text, 'activity_count'::text, 'adjective'::text, 'outcome_without_baseline'::text, 'outcome_with_baseline'::text" \
  && ok "evidence_published_figure_class_known holds the five values" || bad "check: $(q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'evidence_published_figure_class_known'")"

step "2. The wording (D6)"
RULED='[{"value":"license_count","label":"License count","can":"how many seats were bought, and when, as the publisher states","cannot":"use, adoption, or any outcome"},{"value":"activity_count","label":"Activity count","can":"that the activity was recorded in the stated period, by the publisher'"'"'s system","cannot":"capability change, a business outcome, or a rate per person, unless a headcount is cited from the same source"},{"value":"adjective","label":"Adjective","can":"that the publisher described it so","cannot":"any figure"},{"value":"outcome_without_baseline","label":"Outcome without baseline","can":"the after-figure the publisher states","cannot":"a change, or what caused it"},{"value":"outcome_with_baseline","label":"Outcome with baseline","can":"the change the publisher states, as the publisher'"'"'s claim","cannot":"attribution to the learning, unless the publication states a method that can be checked"}]'
for side in server/lib client/src/lib; do
  GOT="$(npx tsx -e "import('./$side/figureClass.ts').then(m=>console.log(JSON.stringify(m.FIGURE_CLASSES)))" 2>&1 | tail -1 || true)"
  [ "$GOT" = "$RULED" ] && ok "$side/figureClass.ts: the ruled table, word for word (Brad, 25 Nov 2026)" || bad "$side wording: $GOT"
done

step "3. The fixtures, and the database as lvrf_app (D1-D3)"
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"; SELF="$(q "SELECT id FROM institutions WHERE is_tenant_self AND deleted_at IS NULL LIMIT 1")"
PW="verification-password-$(date +%s)"; TS="$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server && ok "API up on $PORT" || { bad "server: $(tail -5 "$W/server.log")"; exit 1; }
expect POST /api/account-inputs "$(J institution "$(J name "Halden Assay Labs (S7a fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for S7a.')" persons "[$(J full_name 'K33 owner (invented)' email "owner.$TS@k33.example" title Owner)]")" 201 "a fixture account"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
E_TRIR="$(q "SELECT m.id FROM industry_measures m JOIN industries i ON i.id = m.industry_id WHERE i.slug = 'manufacturing' AND i.tenant_id = '$TEN' AND m.name = 'Total Recordable Incident Rate (TRIR)'")"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K33 capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
expect POST "/api/capabilities/$(rj b.capability_id)/industry-measures" "$(J industry_measure_id "$E_TRIR" claim 'Verification: training improves safe behaviour.')" 201 "  ...its claim on the TRIR entry"
expect POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name 'K33 engagement' engagement_owner_person_id "$OWNER" capability_name 'K33 capability' metric "$(J name 'K33 TRIR' unit 'incidents per 200,000 hours' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)" 201 "  ...an outcome"
O="$(rj b.value_outcome_id)"; MO="$(rj b.business_metric_id)"
expect POST "/api/business-metrics/$MO/pack-basis" "$(J industry_measure_id "$E_TRIR" basis_note 'Verification: this account measures the same rate, per 200,000 hours.')" 201 "  ...its pack basis (W5), so W6 is open"
SRC() { J about account kind "$1" summary "$2" provenance 'Northstar Learning case study (fixture, not a source)' evidence_form quote quote_text "$3" how_read 'Page 2, the results panel (fixture).' ${4:+published_figure_class} ${4:+"$4"}; }
expect POST "/api/institutions/$INST/evidence" "$(SRC vendor_publication 'Audit findings fell from 31 to 12 (fixture)' 'Audit findings fell from 31 in 2023 to 12 in 2025.' outcome_with_baseline)" 201 "a classed vendor publication recorded (outcome with baseline)"
ROW="$(rj b.evidence_id)"
[ "$(q "SELECT published_figure_class FROM evidence WHERE id = '$ROW'")" = "outcome_with_baseline" ] && ok "  ...stored with its class" || bad "  ...class: $(q "SELECT published_figure_class FROM evidence WHERE id = '$ROW'")"
INS() { printf "INSERT INTO evidence SELECT (jsonb_populate_record(NULL::evidence, to_jsonb(e) || jsonb_build_object('id', gen_random_uuid(), 'kind', '%s', 'published_figure_class', %s, 'institution_id', '%s', 'about_institution_id', '%s'))).* FROM evidence e WHERE e.id = '${SRCROW:-$ROW}'" "$1" "$2" "${3:-$INST}" "${3:-$INST}"; }
sqlrefused "a vendor publication on another account, no class" "$(INS vendor_publication NULL)" "$REQ"
for c in license_count activity_count adjective outcome_without_baseline outcome_with_baseline; do
  [ "$(sqlaccepted "$(INS vendor_publication "'$c'")")" = "ACCEPTED" ] && ok "  ...with $c: accepted" || bad "  ...$c: $(sqlaccepted "$(INS vendor_publication "'$c'")")"
done
[ "$(sqlaccepted "$(INS public_filing NULL)")" = "ACCEPTED" ] && [ "$(sqlaccepted "$(INS public_filing "'adjective'")")" = "ACCEPTED" ] && ok "a public filing, with or without a class: accepted (optional)" || bad "public filing"
sqlrefused "a class on an observation" "$(INS observation "'adjective'")" "$REF"
sqlrefused "a class on your own company's account" "$(INS vendor_publication "'adjective'" "$SELF")" "$REF"
[ "$(sqlaccepted "$(INS vendor_publication NULL "$SELF")")" = "ACCEPTED" ] && ok "  ...a vendor publication on your own company's account, no class: accepted" || bad "  ...own, no class"
sqlrefused "the class changed after recording" "UPDATE evidence SET published_figure_class = 'adjective' WHERE id = '$ROW'" "$FIX"
sqlrefused "an unknown class" "$(INS vendor_publication "'testimonial'")" "evidence_published_figure_class_known"

step "4. The routes (D4)"
N0="$(q "SELECT count(*) FROM evidence")"
expect POST "/api/institutions/$INST/evidence" "$(SRC vendor_publication 'Hours completed in FY2025 (fixture)' '48,000 learning hours were completed in FY2025.')" 422 "a vendor publication without a class" "$REQ"
expect POST "/api/institutions/$INST/evidence" "$(SRC observation 'A site walk noted fewer stops (fixture)' 'Fewer unsafe-task stops were noted on the walk.' adjective)" 422 "a class on an observation" "$REF"
expect POST "/api/institutions/$INST/evidence" "$(SRC vendor_publication 'A testimonial (fixture)' 'The programme was praised by staff.' testimonial)" 422 "an unknown class" "Choose what kind of figure it gives"
expect POST "/api/institutions/$SELF/evidence" "$(SRC vendor_publication 'Own company publication (fixture)' 'Northstar reported record seat sales.' license_count)" 422 "a class on your own company's account" "$REF"
[ "$(q "SELECT count(*) FROM evidence")" = "$N0" ] && ok "  ...nothing written" || bad "  ...a row was written"
SUP() { J kind vendor_publication summary 'Audit findings fell from 31 to 12, corrected (fixture)' provenance 'Northstar Learning case study, page 2 (fixture, not a source)' evidence_form quote quote_text 'Audit findings fell from 31 in 2023 to 12 in 2025, the report says.' how_read 'Page 2, the results panel, second line (fixture).' about account reason 'Verification: the quote now gives the sentence in full.' ${1:+published_figure_class} ${1:+"$1"}; }
expect POST "/api/evidence/$ROW/supersede" "$(SUP)" 422 "superseding the classed row without a class" "$REQ"
expect POST "/api/evidence/$ROW/supersede" "$(SUP outcome_with_baseline)" 201 "superseded with its class"
ROW2="$(q "SELECT superseded_by_id FROM evidence WHERE id = '$ROW'")"
SRCROW="$ROW2"  # the current row, for the breaks' copies
[ "$(q "SELECT published_figure_class FROM evidence WHERE id = '$ROW2'")" = "outcome_with_baseline" ] && ok "  ...the successor holds its class" || bad "  ...successor: $(q "SELECT published_figure_class FROM evidence WHERE id = '$ROW2'")"
OEV() { J kind vendor_publication summary 'Northstar claims fewer incidents (fixture)' provenance 'Northstar Learning case study (fixture, not a source)' supports impact_basis confidence low source_verified false ai_sourced false simulated false evidence_form quote quote_text 'Customers saw fewer recordable incidents.' how_read 'Page 3, the claims panel (fixture).' ${1:+published_figure_class} ${1:+"$1"}; }
expect POST "/api/value-outcomes/$O/evidence" "$(OEV)" 422 "the outcome's evidence: a vendor publication without a class" "$REQ"
expect POST "/api/value-outcomes/$O/evidence" "$(OEV outcome_without_baseline)" 201 "  ...with one, recorded"

step "5. The page (D5, D7)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
WENV=(INST="$INST" SELF="$SELF" ROW="$ROW2" RULED="$RULED" SUMMARY="A vendor's figure (page fixture $TS)" WIDTH=1280)
walk record,filing,supersede,own,w6 page "$W/page.log" "${WENV[@]}"; tally "$W/page.log"
[ "$(q "SELECT count(*) FROM evidence WHERE summary = 'A vendor''s figure (page fixture $TS)' AND published_figure_class = 'outcome_with_baseline'")" = "1" ] && ok "  ...the page's source recorded with its class" || bad "  ...the page's source"
# 390: the same form, its width, and its confirmation.
walk record phone "$W/phone.log" INST="$INST" SELF="$SELF" ROW="$ROW2" RULED="$RULED" SUMMARY="A vendor's figure (phone fixture $TS)" WIDTH=390; tally "$W/phone.log"

step "6. Breaks, each caught by its own section"
# B1 — the database's required rule removed.
fnbreak lvrf_evidence_final "    IF NEW.published_figure_class IS NULL AND NEW.kind = 'vendor_publication' AND NOT own THEN" "    IF false THEN"
[ "$(sqlaccepted "$(INS vendor_publication NULL)")" = "ACCEPTED" ] && ok "B1: the required rule removed → caught: a vendor publication without a class accepted" || bad "B1"
reharden
# B2 — the class made editable.
fnbreak lvrf_evidence_final "  IF NEW.published_figure_class IS DISTINCT FROM OLD.published_figure_class THEN" "  IF false THEN"
python3 - "$W/fnbreak.sql" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read(); s=s.replace("'evidence_form', 'quote_text', 'locator', 'how_read'];","'evidence_form', 'quote_text', 'locator', 'how_read', 'published_figure_class'];",1); open(p,'w').write(s)
PY
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/fnbreak.sql" > /dev/null
[ "$(sqlaccepted "UPDATE evidence SET published_figure_class = 'adjective' WHERE id = '$ROW2'")" = "ACCEPTED" ] && ok "B2: the class made editable → caught: the change accepted" || bad "B2"
reharden
sqlrefused "  ...with it back" "UPDATE evidence SET published_figure_class = 'adjective' WHERE id = '$ROW2'" "$FIX"
# B3 — the class missing from the confirmation.
edit "$AEV" "    ...(fc.confirm ? [fc.confirm] : []),
" ""
sleep 4
walk record b3 "$W/b3.log" "${WENV[@]}"
grep -q "^FAIL  b3: record: the confirmation names the class" "$W/b3.log" && ok "B3: the class missing from the confirmation → caught" || bad "B3: not caught: $(grep -m3 -E 'FAIL' "$W/b3.log")"
restore "$AEV"
# B4 — the route's check removed: the database still refuses, its refusal recorded.
edit "$AER" "  if ('refuse' in cls) throw new Refusal(422, cls.refuse);" "  void cls;"
restart_server
DBR() { q "SELECT count(*) FROM refusals WHERE message LIKE 'LVRF: evidence: A vendor publication about another account%'"; }
N1="$(DBR)"; N0="$(q "SELECT count(*) FROM evidence")"
req POST "/api/institutions/$INST/evidence" "$(SRC vendor_publication 'Seats bought in 2024 (fixture)' '1,200 seats were bought in 2024.')"
[ "$CODE" = "422" ] && [ "$(DBR)" -gt "$N1" ] && [ "$(q "SELECT count(*) FROM evidence")" = "$N0" ] && ok "B4: the route's check removed → the database refused it, its refusal recorded, nothing written ($(said))" || bad "B4: $CODE $(said)"
restore "$AER"; restart_server
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
node scripts/check_plain_words.mjs > "$W/plain.log" 2>&1 && ok "plain words: $(tail -1 "$W/plain.log")" || bad "plain words: $(grep -m3 HIT "$W/plain.log")"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1 || true)"
printf '%s' "$PLAIN" | grep -qE "^165 CHECKs in the database: 165 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN" || bad "plain sentences: $PLAIN"
cover "$LOG" 'evidence_published_figure_class_known holds' 'the ruled table, word for word' 'a vendor publication on another account, no class' 'a class on your own company' 'the class changed after recording' \
  'a vendor publication without a class -> 422' 'superseded with its class' "the outcome's evidence" 'record: the confirmation names the class' 'record: the two lines pass contrast' 'filing: a public filing offers the class' \
  'supersede: the successor' "own: on your own company's account" 'w6: a vendor publication offers' 'phone: record: at 390, no sideways scroll' 'B1: ' 'B2: ' 'B3: ' 'B4: '

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
