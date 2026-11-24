#!/usr/bin/env bash
#
# S4 (3.1; LVRF_PLAN §23, approved by Brad 19 Nov 2026): steward forms confirm every field in full, and a field may not
# repeat another. Gate A, on a THROWAWAY CLONE of the prod copy (rule 9); nothing here touches prod or real local lvrf.
#
#   1. Source: no confirmation cuts a value; the route's pairs are the CHECKs' pairs; each CHECK has its sentence.
#   2. Clone, migrate (0052), harden: 227 triggers, 158 CHECKs each with a plain sentence, drift none.
#   3. The database's half: each of the nine CHECKs refuses its pair and is definite under NULL; summary = quote is
#      accepted (D2); business_metrics_basis_note_own refuses a note that repeats the claim or the entry's name.
#   4. The route's half: the nine pairs, outcome evidence, supersede's reason and the basis note, each refused with its
#      sentence before the write, and recorded as the route's refusal.
#   5. Through the page, as the steward by session (scripts/lib/s4_walk.mjs): record, warn, refused, supersede, basis,
#      fullconfirm.
#   6. Breaks, each with its positive control:
#        B1 a cut put back in the confirmation        B2 the route's pair check removed (the CHECK still refuses)
#        B3 the route's basis check removed (the trigger still refuses)   B4 a CHECK dropped
#        B5 the form sends other than it shows (the c56a3d33 cut)        B6 another pair identical: refused, not warned
#        B7 the summary/quote warning removed          B8 a cut put back in an existing confirmation (the opening's)
#   7. Nothing else written: every sealed run byte-identical.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifys4
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3361; VITE_PORT=5361; CDP_PORT=9461
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_s4.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
CF=client/src/components/confirm/ConfirmFields.tsx; RP=client/src/components/confirm/repeats.ts; AE=client/src/components/AccountEvidence.tsx
SR=server/lib/repeatedFields.ts; PB=server/routes/metricPackBasis.ts
EDITED=("$CF" "$RP" "$AE" "$SR" "$PB")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
q()    { psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1"; }
stop_server() { local p; p="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"; [ -n "$p" ] && kill $p 2>/dev/null; sleep 1; }
start_server() {
  (LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 < /dev/null &)
  for _ in $(seq 1 80); do /usr/bin/curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done; return 1
}
finish() {
  for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for p in $(lsof -nP -iTCP:"$PORT" -iTCP:"$VITE_PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u); do kill "$p" 2>/dev/null || true; done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "${W:?}/chrome"
  [ "$FAIL$PASS" = "00" ] || true
}
trap finish EXIT
has()  { grep "$@" > /dev/null; }   # grep -q's early exit SIGPIPEs the writer, failing the pipe under pipefail
edit() { python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; sleep 3; }
post() {  # PATH BODY -> CODE, $W/r.json (as the steward, by the throwaway server's actor header)
  CODE="$(/usr/bin/curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d "$2" "$BASE$1")"
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
J() { node -e 'const a=process.argv.slice(1),o={};for(let i=0;i<a.length;i+=2){let v=a[i+1];try{if(/^(\[|\{|true$|false$|-?[0-9.]+$)/.test(v))v=JSON.parse(v)}catch{}o[a[i]]=v}console.log(JSON.stringify(o))' "$@"; }
walk() { VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" DB="$VERIFY_DB" S_EMAIL="$S_EMAIL" PW="$PW" INST="$INST" METRIC="$MO" METRIC_NAME="$MNAME" \
  CLAIM="$CLAIM" ENTRY="$ENTRY" LONG_SUMMARY="$LONG" SHOTS="$SHOTS" node scripts/lib/s4_walk.mjs "$1"; }
tally() { PASS=$((PASS + $(grep -c '^  PASS' "$1" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$1" || true))); }

step "1. Source"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"
LINT="$(cd client && npm run -s lint 2>&1 | grep -c 'warning\|error' || true)"; [ "$LINT" = "1" ] && ok "client lint: the one existing warning, nothing new" || bad "client lint: $LINT lines"
node scripts/check_design_tokens.mjs > "$W/tok.out" && ok "$(cat "$W/tok.out")" || bad "tokens: $(cat "$W/tok.out")"
CUTS="$(grep -rn 'confirm-text' client/src | grep -c 'slice(0, 80)' || true)"; [ "$CUTS" = "0" ] && ok "no confirmation cuts a value (no slice(0, 80) in any confirmation; short ids stay)" || bad "$CUTS confirmations still cut"
SRV="$(grep -o "check: 'evidence_[a-z_]*'" "$SR" | sed "s/check: '//; s/'//" | sort | tr '\n' ' ')"
SCH="$(grep -o "fieldsDiffer('evidence_[a-z_]*'" db/schema.ts | sed "s/fieldsDiffer('//; s/'//" | sort | tr '\n' ' ')"
[ "$SRV" = "$SCH" ] && [ "$(printf '%s' "$SRV" | wc -w | tr -d ' ')" = "9" ] && ok "the route's nine pairs are the nine CHECKs of 0052, by name" || bad "pairs: route [$SRV] schema [$SCH]"
! grep -q "'summary', 'quote_text'\|\['summary', 'quote_text'\]" "$SR" "$RP" && ok "summary against the quote is in neither pair list (D2: warned, not refused)" || bad "summary/quote is listed as a refused pair"

step "2. Clone, migrate (0052), harden"
dropdb --if-exists "$VERIFY_DB"; make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "0052 applied to the prod copy's rows: every evidence row already satisfies the nine CHECKs" || { bad "migrate: $(tail -3 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened (section 37)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
[ "$(trig)" = "229" ] && ok "229 triggers (§32 section 38: +2) (S4 section 37: +1)" || bad "triggers: $(trig)"
PLAIN="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1)"
printf '%s' "$PLAIN" | has -E "^158 CHECKs in the database: 158 with a plain sentence, 0 without; 0 stale" && ok "$PLAIN" || bad "plain: $PLAIN"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"; printf '%s' "$DRIFT" | has "schema drift: none (journal 54 migrations, newest 0053_s32_person_email" && ok "$DRIFT" || bad "drift: $DRIFT"
[ "$(q "SELECT count(*) FROM business_metrics WHERE pack_basis_evidence_id IS NOT NULL")" = "0" ] && ok "pack_basis_evidence_id: NULL on every metric of the copy (nothing backfilled, nothing orphaned)" || bad "pack_basis_evidence_id set on the copy"
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
S="$(q "SELECT steward_person_id FROM tenants WHERE steward_person_id IS NOT NULL LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"; HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server || { bad "API"; exit 1; }
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1 < /dev/null &)
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 80); do /usr/bin/curl -s -o /dev/null "http://localhost:$VITE_PORT/" && /usr/bin/curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
ok "API $PORT, vite $VITE_PORT, Chrome $CDP_PORT"

# The fixture: a fictional account, through the routes, with steps 1-4 of the walk done and the pack basis next.
TS="$(date +%s)"
post /api/account-inputs "{\"institution\":{\"name\":\"Harbor Instruments (fictional)\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"S4 fixture: a fictional account, classified to carry its own value case.\"},\"persons\":[{\"full_name\":\"Rae Lind (fictional)\",\"email\":\"rae.$TS@harbor.example\",\"title\":\"Director of Safety\"}]}"
[ "$CODE" = "201" ] || { bad "fixture account: $CODE $(cat "$W/r.json")"; exit 1; }
INST="$(rj b.institution_id)"; OWNER="$(rj 'b.person_ids[0]')"
ENTRY='Total Recordable Incident Rate (TRIR)'; E_TRIR="$(q "SELECT m.id FROM industry_measures m JOIN industries i ON i.id = m.industry_id WHERE i.slug = 'manufacturing' AND m.name = '$ENTRY'")"
post "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'Harbor safe-work capability' owner_person_id "$OWNER" is_primary false basis 'S4 fixture: EHS solution.')"; CAP="$(rj b.capability_id)"
CLAIM='S4 fixture claim: safe-work procedural training lowers the recordable incident rate at this account.'
post "/api/capabilities/$CAP/industry-measures" "$(J industry_measure_id "$E_TRIR" claim "$CLAIM")"; [ "$CODE" = "201" ] || bad "fixture claim: $CODE"
MNAME='Harbor TRIR'
post "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"Harbor safety engagement (fictional)\",\"engagement_owner_person_id\":\"$OWNER\",\"capability_name\":\"Harbor safe-work capability\",\"metric\":{\"name\":\"$MNAME\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"Harbor EHS system (fictional)\",\"owner_person_id\":\"$OWNER\"},\"baseline_value\":2.2,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}"
[ "$CODE" = "201" ] || { bad "fixture outcome: $CODE $(cat "$W/r.json")"; exit 1; }
OC="$(rj b.value_outcome_id)"; MO="$(rj b.business_metric_id)"
LONG="S4 fixture, a long what-it-states for the existing confirmations ($TS): $(printf 'the confirmation must quote all of this, never a cut of it; %.0s' $(seq 1 10))the end."
EVB() { J kind public_filing provenance "S4 fixture source: $1 (fictional, not a source)" summary "$2" about account evidence_form quote quote_text "Figure for $1 as filed." how_read "Read from the fixture filing, the $1 line, as written."; }
post "/api/institutions/$INST/evidence" "$(EVB long "$LONG")"; [ "$CODE" = "201" ] && ok "the fixture: a fictional account ($(echo "$INST" | cut -c1-8)), a claim on $ENTRY, an outcome whose metric has no basis yet, and a ${#LONG}-character source" || bad "fixture source: $CODE $(cat "$W/r.json")"

step "3. The database's half: nine CHECKs and one trigger"
TPL="$(q "SELECT id FROM evidence WHERE institution_id = '$INST' AND summary = \$\$${LONG}\$\$")"
ins() {  # SUMMARY PROVENANCE REFERENCE QUOTE HOWREAD -> the CHECK that refused, or OK
  local out; out="$(psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "INSERT INTO evidence SELECT (jsonb_populate_record(NULL::evidence, to_jsonb(e) || jsonb_build_object('id', gen_random_uuid(), 'summary', \$a\$$1\$a\$, 'provenance', \$a\$$2\$a\$, 'source_reference', NULLIF(\$a\$$3\$a\$, ''), 'quote_text', \$a\$$4\$a\$, 'how_read', \$a\$$5\$a\$))).* FROM evidence e WHERE e.id = '$TPL'" 2>&1 || true)"
  case "$out" in *'violates check constraint "'*) printf '%s' "$out" | sed -E 's/.*violates check constraint "([a-z_]+)".*/\1/' | head -1 ;; INSERT*) echo OK ;; *) echo "ERR $out" ;; esac
}
X='S4 db fixture: one value'; P='S4 db fixture source (fictional, not a source)'; R='https://example.invalid/s4/db'; QT='Figure as filed, for the db check.'; H='Read from the fixture filing for the database check.'
for spec in "evidence_summary_not_provenance|$X|$X|$R|$QT|$H" "evidence_summary_not_reference|$X|$P|$X|$QT|$H" "evidence_summary_not_how_read|$X|$P|$R|$QT|$X" \
            "evidence_provenance_not_reference|$X|$P|$P|$QT|$H" "evidence_provenance_not_quote|$X|$P|$R|$P|$H" "evidence_provenance_not_how_read|$X|$P|$R|$QT|$P" \
            "evidence_reference_not_quote|$X|$P|$R|$R|$H" "evidence_reference_not_how_read|$X|$P|$R|$QT|$R" "evidence_quote_not_how_read|$X|$P|$R|$QT|$QT"; do
  IFS='|' read -r want s p r qt h <<< "$spec"
  got="$(ins "$s" "$p" "$r" "$qt" "$h")"
  [ "$got" = "$want" ] && ok "  $want refuses its pair at the database" || bad "  $want: $got"
done
got="$(ins "  $(echo "$X" | tr 'a-z' 'A-Z')  " "$X" "$R" "$QT" "$H")"; [ "$got" = "evidence_summary_not_provenance" ] && ok "  compared trimmed, case-insensitive (D5): the value upper-cased and padded is refused against itself" || bad "  normalising: $got"
got="$(ins "$QT" "$P" "$R" "$QT" "$H")"; [ "$got" = "OK" ] && ok "  summary equal to the quote is accepted (D2: warned at the form, not refused)" || bad "  summary = quote: $got"
NULLS="$(for c in evidence_summary_not_provenance evidence_summary_not_reference evidence_summary_not_how_read evidence_provenance_not_reference evidence_provenance_not_quote evidence_provenance_not_how_read evidence_reference_not_quote evidence_reference_not_how_read evidence_quote_not_how_read; do
  def="$(q "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '$c'" | sed -E 's/^CHECK \(//; s/\)$//')"
  cols="$(printf '%s' "$def" | grep -oE 'btrim\(\(?[a-z_]+' | sed -E 's/btrim\(\(?//' | sort -u | tr '\n' ' ')"; set -- $cols
  q "SELECT bool_and(($def) IS TRUE) FROM (VALUES (NULL::text, 'x'::text), ('x', NULL), (NULL, NULL), ('', ''), (' ', 'x')) v($1, $2)"
done | sort -u)"
[ "$NULLS" = "t" ] && ok "  each of the nine is definite under NULL: NULL, empty or blank values read true, never NULL (a NULL-input refusal per CHECK)" || bad "  NULL definiteness: $NULLS"
NOTE_EV() { q "INSERT INTO evidence (institution_id, kind, summary, provenance, confidence, source_verified, ai_sourced, simulated, captured_by_person_id, evidence_form, about_institution_id) VALUES ('$INST', 'observation', \$a\$$1\$a\$, 'S4 db fixture: asserted at pack basis (fictional)', 'low', false, false, false, '$S', 'statement', '$INST') RETURNING id" | head -1; }
basis_sql() { psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "BEGIN; UPDATE business_metrics SET industry_measure_id = '$E_TRIR', pack_basis_evidence_id = '$1' WHERE id = '$MO'; ROLLBACK;" 2>&1 || true; }
E1="$(NOTE_EV "$CLAIM")"; basis_sql "$E1" | has "the pack basis note repeats the capability's claim on this entry" && ok "  business_metrics_basis_note_own refuses a note that repeats the claim (eed11e02's case)" || bad "  trigger: claim"
E2="$(NOTE_EV "$ENTRY")"; basis_sql "$E2" | has "the pack basis note repeats the entry's name" && ok "  ...and one that repeats the entry's name" || bad "  trigger: name"
E3="$(NOTE_EV 'S4 db fixture: the account reports this rate on the pack entry definition.')"; basis_sql "$E3" | has "ROLLBACK" && ! basis_sql "$E3" | has "ERROR" && ok "  ...and accepts a note of its own (control; rolled back)" || bad "  trigger control: $(basis_sql "$E3")"

step "4. The route's half (by the throwaway server's actor header: route checks, not the person's path)"
ROUTE0="$(q "SELECT count(*) FROM refusals WHERE source = 'route'")"
sentence() { grep -o "$1: '[^']*'\|$1: \"[^\"]*\"" server/lib/plainChecks.ts | sed -E "s/^$1: ['\"]//; s/['\"]$//"; }
for spec in "evidence_summary_not_provenance|summary|provenance" "evidence_summary_not_reference|summary|source_reference" "evidence_summary_not_how_read|summary|how_read" \
            "evidence_provenance_not_reference|provenance|source_reference" "evidence_provenance_not_quote|provenance|quote_text" "evidence_provenance_not_how_read|provenance|how_read" \
            "evidence_reference_not_quote|source_reference|quote_text" "evidence_reference_not_how_read|source_reference|how_read" "evidence_quote_not_how_read|quote_text|how_read"; do
  IFS='|' read -r ck a b <<< "$spec"
  V='S4 route fixture: the same value in two fields, long enough for every rule.'
  body="$(node -e '
    const [a,b,v]=process.argv.slice(1); const o={kind:"public_filing",summary:"S4 route fixture summary.",provenance:"S4 route fixture source (fictional, not a source)",source_reference:"https://example.invalid/s4/route",about:"account",evidence_form:"quote",quote_text:"Figure as filed, for the route check.",how_read:"Read from the fixture filing for the route check, as written."};
    o[a]=v; o[b]=v; console.log(JSON.stringify(o))' "$a" "$b" "$V")"
  post "/api/institutions/$INST/evidence" "$body"; got="$(rj b.message)"
  [ "$CODE" = "422" ] && [ "$got" = "$(sentence "$ck")" ] && ok "  POST evidence, $a = $b: 422, \"$got\"" || bad "  $ck: $CODE $got"
done
[ "$(q "SELECT count(*) FROM refusals WHERE source = 'route'")" = "$((ROUTE0 + 9))" ] && [ "$(q "SELECT count(*) FROM refusals WHERE source = 'route' AND sqlstate IS NULL AND message LIKE '%repeats%'")" -ge 9 ] && ok "  ...each recorded as the route's refusal, before any write (no sqlstate)" || bad "  route refusals: $(q "SELECT count(*) FROM refusals WHERE source = 'route'") from $ROUTE0"
post "/api/value-outcomes/$OC/evidence" "$(J kind observation provenance 'S4 route fixture: an outcome source (fictional, not a source)' summary 'S4 route fixture: an outcome source (fictional, not a source)' supports baseline confidence medium evidence_form statement about account)"
[ "$CODE" = "422" ] && [ "$(rj b.message)" = "$(sentence evidence_summary_not_provenance)" ] && ok "  POST outcome evidence, What it states = Where it came from: 422, the same sentence" || bad "  outcome evidence: $CODE $(rj b.message)"
OLD="$(q "SELECT id FROM evidence WHERE id = '$TPL'")"; OLDHOW="$(q "SELECT how_read FROM evidence WHERE id = '$OLD'")"
post "/api/evidence/$OLD/supersede" "$(J kind public_filing provenance 'S4 route fixture: the successor source (fictional)' summary 'S4 route fixture: the successor.' about account evidence_form quote quote_text 'Figure as refiled.' how_read 'Read from the refiled fixture, the same line, as written.' reason "$OLDHOW")"
[ "$CODE" = "422" ] && rj b.message | has "Why it is superseded repeats How it was read of the row it supersedes" && ok "  POST supersede, the reason = the old row's How it was read (the 15 Nov act): 422" || bad "  supersede reason (old): $CODE $(rj b.message)"
post "/api/evidence/$OLD/supersede" "$(J kind public_filing provenance 'S4 route fixture: the successor source (fictional)' summary 'S4 route fixture: the successor.' about account evidence_form quote quote_text 'Figure as refiled.' how_read 'Read from the refiled fixture, the same line, as written.' reason 'S4 route fixture: the successor.')"
[ "$CODE" = "422" ] && rj b.message | has "Why it is superseded repeats What it states of the new row" && ok "  ...and the reason = the new row's What it states: 422" || bad "  supersede reason (new): $CODE $(rj b.message)"
post "/api/business-metrics/$MO/pack-basis" "$(J industry_measure_id "$E_TRIR" basis_note "$CLAIM")"
[ "$CODE" = "422" ] && rj b.message | has "The pack basis note repeats the capability's claim on this entry" && ok "  POST pack-basis, the note = the claim: 422, before the trigger" || bad "  basis claim: $CODE $(rj b.message)"
post "/api/business-metrics/$MO/pack-basis" "$(J industry_measure_id "$E_TRIR" basis_note "$ENTRY")"
[ "$CODE" = "422" ] && rj b.message | has "The pack basis note repeats the entry's name" && ok "  ...the note = the entry's name: 422" || bad "  basis name: $CODE $(rj b.message)"
[ "$(q "SELECT count(*) FROM business_metrics WHERE id = '$MO' AND industry_measure_id IS NULL")" = "1" ] && ok "  ...and the metric still has no basis" || bad "  a basis was set"

step "5. Through the page, as the steward by session"
walk all > "$W/walk.out" 2>&1 || true; cat "$W/walk.out" | grep -E "PASS|FAIL|info"; tally "$W/walk.out"

step "6. Breaks, each with its positive control"
# A fresh source for each break that records: B1/B5 reuse the record part on a new summary tag (the walk's NOW).
# B1: a cut put back in the confirmation.
edit "$CF" "data-testid=\"confirm-value\">{v === '' ? '—' : v}" "data-testid=\"confirm-value\">{v === '' ? '—' : v.slice(0, 80)}"; sleep 4
walk record > "$W/b1.out" 2>&1 || true
has "FAIL  record: the confirmation shows every field byte for byte" "$W/b1.out" && ok "B1 break: a cut in the confirmation is caught (the 600-character What it states is not shown whole)" || bad "B1 not caught"
restore "$CF"; walk record > "$W/b1c.out" 2>&1 || true
! has "FAIL" "$W/b1c.out" && ok "B1 control: restored, every field in full" || bad "B1 control: $(grep FAIL "$W/b1c.out" | head -2)"
# B2: the route's pair check removed: the CHECK still refuses, but as the database's, after the route let it through.
edit "$SR" "  for (const p of EVIDENCE_PAIRS) if (same(v[p.a], v[p.b])) return PLAIN_CHECK[p.check];" "  for (const p of EVIDENCE_PAIRS) if (false && same(v[p.a], v[p.b])) return PLAIN_CHECK[p.check];"
stop_server; start_server
DB0="$(q "SELECT count(*) FROM refusals WHERE constraint_name = 'evidence_provenance_not_how_read'")"
post "/api/institutions/$INST/evidence" "$(J kind public_filing summary 'S4 B2: a summary.' provenance 'S4 B2: the same text twice, provenance and how-read.' about account evidence_form quote quote_text 'Figure as filed (B2).' how_read 'S4 B2: the same text twice, provenance and how-read.')"
[ "$CODE" = "422" ] && [ "$(q "SELECT count(*) FROM refusals WHERE constraint_name = 'evidence_provenance_not_how_read'")" = "$((DB0 + 1))" ] \
  && ok "B2 break: the route's check removed is caught: the database refused instead (evidence_provenance_not_how_read, 23514), so the CHECK is the second half" || bad "B2: $CODE $(rj b.message)"
restore "$SR"; stop_server; start_server
post "/api/institutions/$INST/evidence" "$(J kind public_filing summary 'S4 B2: a summary.' provenance 'S4 B2: the same text twice, provenance and how-read.' about account evidence_form quote quote_text 'Figure as filed (B2).' how_read 'S4 B2: the same text twice, provenance and how-read.')"
[ "$CODE" = "422" ] && [ "$(q "SELECT count(*) FROM refusals WHERE constraint_name = 'evidence_provenance_not_how_read'")" = "$((DB0 + 1))" ] && ok "B2 control: restored, the route refuses first (no database refusal added)" || bad "B2 control"
# A second metric with no basis, for B3 (the page walk has set the first one's; made after it, since the walk reads the newest outcome).
post "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"Harbor safety engagement, B3 (fictional)\",\"engagement_owner_person_id\":\"$OWNER\",\"capability_name\":\"Harbor safe-work capability\",\"metric\":{\"name\":\"Harbor TRIR, B3\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"Harbor EHS system (fictional)\",\"owner_person_id\":\"$OWNER\"},\"baseline_value\":2.2,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}"
[ "$CODE" = "201" ] || { bad "fixture outcome (B3): $CODE $(cat "$W/r.json")"; exit 1; }
MO3="$(rj b.business_metric_id)"
# B3: the route's basis check removed: the trigger still refuses.
edit "$PB" "      if (repeats) {" "      if (repeats && false) {"
stop_server; start_server
# §30: with the prefix off the screen, who answered is told by the record: only the database's refusal is recorded so.
DBR3() { q "SELECT count(*) FROM refusals WHERE message LIKE 'LVRF: business_metrics: the pack basis note repeats%'"; }
N3="$(DBR3)"
post "/api/business-metrics/$MO3/pack-basis" "$(J industry_measure_id "$E_TRIR" basis_note "$CLAIM")"
[ "$CODE" = "422" ] && rj b.message | has "The pack basis note repeats the capability's claim" && [ "$(DBR3)" -gt "$N3" ] && [ "$(q "SELECT count(*) FROM business_metrics WHERE id = '$MO3' AND industry_measure_id IS NULL")" = "1" ] \
  && ok "B3 break: the route's basis check removed is caught: the trigger refused it (business_metrics_basis_note_own), and no basis was set" || bad "B3: $CODE $(rj b.message)"
restore "$PB"; stop_server; start_server
N3="$(DBR3)"
post "/api/business-metrics/$MO3/pack-basis" "$(J industry_measure_id "$E_TRIR" basis_note "$CLAIM")"
[ "$CODE" = "422" ] && [ "$(DBR3)" = "$N3" ] && ok "B3 control: restored, the route refuses first (no database refusal recorded)" || bad "B3 control: $(rj b.message)"
# B4: a CHECK dropped.
q "ALTER TABLE evidence DROP CONSTRAINT evidence_quote_not_how_read" > /dev/null
P4="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 || true)"; D4="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 || true)"
printf '%s' "$P4" | has "STALE SENTENCE evidence_quote_not_how_read" && ! printf '%s' "$D4" | has "schema drift: none" && ok "B4 break: a CHECK dropped is caught (its sentence is stale; the schema drifts from 0052)" || bad "B4: $(printf '%s' "$P4" | tail -1) / $(printf '%s' "$D4" | tail -1)"
grep -o 'ALTER TABLE "evidence" ADD CONSTRAINT "evidence_quote_not_how_read" CHECK ([^;]*);' db/drizzle/0052_s4_form_confirmation.sql | sed 's/--> statement-breakpoint//' > "$W/b4.sql"
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/b4.sql" > /dev/null 2>&1
DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 | tail -1 | has "^158 CHECKs in the database: 158 with a plain sentence, 0 without; 0 stale" && ok "B4 control: re-added from 0052, 158 CHECKs, none stale" || bad "B4 control"
# B5: the form sends other than it shows (the c56a3d33 cut: 340 characters of the summary).
edit "$AE" "buildBody={() => ({ kind, summary: summary.trim(), provenance" "buildBody={() => ({ kind, summary: summary.trim().slice(0, 340), provenance"; sleep 4
walk record > "$W/b5.out" 2>&1 || true
has "FAIL  record: \"Confirm\" records exactly what was shown" "$W/b5.out" && ok "B5 break: a form that sends other than it shows is caught (the stored row is not what was confirmed)" || bad "B5 not caught: $(grep -E 'FAIL|records exactly' "$W/b5.out" | head -2)"
restore "$AE"; walk record > "$W/b5c.out" 2>&1 || true
! has "FAIL" "$W/b5c.out" && ok "B5 control: restored, what is stored is what was shown" || bad "B5 control: $(grep FAIL "$W/b5c.out" | head -2)"
# B6 (Brad): another pair identical is refused, not warned; widen the exemption to it and the walk sees it go through.
edit "$RP" "  ['provenance', 'source_reference'], ['provenance', 'quote_text'], ['provenance', 'how_read']," "  ['provenance', 'source_reference'], ['provenance', 'quote_text'],"; sleep 4
walk refused > "$W/b6.out" 2>&1 || true
has "FAIL  refused: another pair identical" "$W/b6.out" && ok "B6 break: another identical pair let through at the form is caught (Where it came from = How it was read must be refused, not warned)" || bad "B6 not caught"
restore "$RP"; walk refused > "$W/b6c.out" 2>&1 || true
! has "FAIL" "$W/b6c.out" && ok "B6 control: restored, the pair is refused at the form, with no request" || bad "B6 control: $(grep FAIL "$W/b6c.out" | head -2)"
# B7: the summary/quote warning removed.
edit "$AE" "  const warnings = summaryRepeatsQuote(texts) ? [SUMMARY_QUOTE_WARNING] : [];" "  const warnings: string[] = summaryRepeatsQuote(texts) && false ? [SUMMARY_QUOTE_WARNING] : [];"; sleep 4
walk warn > "$W/b7.out" 2>&1 || true
has "FAIL  warn: the confirmation warns" "$W/b7.out" && ok "B7 break: the summary/quote warning removed is caught" || bad "B7 not caught"
restore "$AE"; walk warn > "$W/b7c.out" 2>&1 || true
! has "FAIL" "$W/b7c.out" && ok "B7 control: restored, warned and recorded" || bad "B7 control: $(grep FAIL "$W/b7c.out" | head -2)"
# B8: a cut put back in an existing confirmation (the opening of a citation).
edit "$AE" "Record that you opened {row.id.slice(0, 8)}, &ldquo;{row.summary}&rdquo;" "Record that you opened {row.id.slice(0, 8)}, &ldquo;{row.summary.slice(0, 80)}&rdquo;"; sleep 4
walk fullconfirm > "$W/b8.out" 2>&1 || true
has "FAIL  fullconfirm" "$W/b8.out" && ok "B8 break: a cut in an existing confirmation is caught" || bad "B8 not caught"
restore "$AE"; walk fullconfirm > "$W/b8c.out" 2>&1 || true
! has "FAIL" "$W/b8c.out" && ok "B8 control: restored, the opening's confirmation quotes it in full" || bad "B8 control: $(grep FAIL "$W/b8c.out" | head -2)"

step "7. Nothing else written"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every sealed run byte-identical" || bad "a run changed"

echo
echo "==> $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
