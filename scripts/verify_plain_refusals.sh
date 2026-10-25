#!/usr/bin/env bash
#
# Q4k (L29 widened, Q4k-D1; Brad, 12 Oct 2026) — refusals in plain words, and
# "Open the citation…" for AI-sourced outcome evidence. Local verification.
#
#   ./scripts/verify_plain_refusals.sh [screenshot_dir]
#
# Clone `lvrf_verifyq4k` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated and
# hardened, dropped on exit. API with the header actor
# (LVRF_ALLOW_ACTOR_HEADER=1, this throwaway server only); the page through
# Vite and headless Chrome, signed in by SESSION
# (scripts/lib/evidence_form_walk.mjs). Fixtures go through the routes.
# The probe CHECK and probe trigger below are ADDED on the clone to provoke
# errors no route can reach today; no guard is switched off by a fixture.
#
# DELIBERATE BREAKS edit a source file in place and restore it
# byte-identical (cmp; the EXIT trap too), or run in a rolled-back
# transaction.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifyq4k
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3078; VITE_PORT=5180; CDP_PORT=9340
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_q4k.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
ROUTE=server/routes/outcomeEvidence.ts
REFUSAL=server/lib/refusal.ts
CARD=client/src/components/workbench/AddEvidenceCard.tsx
for f in "$ROUTE" "$REFUSAL" "$CARD"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "$ROUTE" "$REFUSAL" "$CARD"; do
    cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }
  done
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true
  rm -rf "$W/chrome"
}
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
start_server() {
  LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start: $(tail -5 "$W/server.log")"; exit 1
}
req() {  # METHOD PATH [BODY] [ACTOR] — status in $CODE, body in $W/r.json
  if [ "$1" = GET ]; then
    CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: ${4:-$S}" "$BASE$2")"
  else
    CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: ${4:-$S}" -d "$3" "$BASE$2")"
  fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING] [ACTOR]
  req "$1" "$2" "$3" "${7:-$S}"
  local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 400)"; fi
}
noraw() {  # LABEL — the last response carries no Postgres text and no constraint or relation name
  if grep -qiE 'violates|check constraint|foreign key|relation "|not-null|_key|_fk' "$W/r.json"; then bad "  ...$1: Postgres text in the response: $(head -c 300 "$W/r.json")"; else ok "  ...$1: no Postgres text, no constraint or relation name"; fi
}
sqlrefused() {  # LABEL SQL NEEDLE — in a rolled-back transaction
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1: refused ($3)" || bad "$1: $out"
}
sqllands() {  # LABEL SQL NEEDLE — a break: the statement lands (rolled back)
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1" || bad "$1: $out"
}
coverage() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_plain_refusals.ts 2>&1 || true; }
SENTENCE="AI-sourced evidence is verified after its citation is opened, not when it's recorded"

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
npx tsc -p tsconfig.scripts.json --noEmit && ok "scripts tsc" || bad "scripts tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone, migrate, harden; the coverage check"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }
N_TRIG="$(q "SELECT count(DISTINCT trigger_name || '.' || event_object_table) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$N_TRIG" = "$EXPECT_TRIGGERS" ] && [ "$(q "SELECT count(*) FROM hardening_manifest")" = "$EXPECT_TRIGGERS" ] && ok "$N_TRIG triggers and manifest rows, as declared (the AI-origin rule is folded into an existing trigger)" || bad "triggers $N_TRIG"
OUT="$(coverage)"; N_CHECKS="$(q "SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace")"
[ "$OUT" = "$N_CHECKS CHECKs in the database: $N_CHECKS with a plain sentence, 0 without; 0 stale sentence(s)" ] && ok "coverage: $OUT" || bad "coverage: $OUT"
OUT="$(npx tsx -e "
import('./server/lib/plainChecks.ts').then((m) => {
  let bad = 0;
  for (const [k, v] of Object.entries(m.PLAIN_CHECK)) {
    const got = m.plainCheckMessage({ message: 'new row for relation \"t\" violates check constraint \"' + k + '\"', constraint: k });
    if (got !== v || got === m.NEUTRAL_CHECK || got.includes(k) || /violates|constraint|relation/.test(got)) { bad++; console.log('BAD ' + k); }
  }
  const lv = m.plainCheckMessage({ message: 'LVRF: a rule written for people.', constraint: 'x' });
  console.log(bad + ' bad of ' + Object.keys(m.PLAIN_CHECK).length + '; LVRF passes: ' + (lv === 'LVRF: a rule written for people.'));
});")"
[ "$OUT" = "0 bad of $N_CHECKS; LVRF passes: true" ] && ok "every sentence: returned for its CHECK's raw text, naming no constraint; an 'LVRF:' message passes unchanged" || bad "sentences: $OUT"

step "3. Fixtures, through the routes"
TS="$(date +%s)"
S="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
S_NAME="$(q "SELECT full_name FROM persons WHERE id = '$S'")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
X_EMAIL="x.$TS@q4k.example"
X="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Authorized X (verification)', '$X_EMAIL') RETURNING id" | head -1)"
PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify'), ('$X', '$HASH', 'verify')" > /dev/null
q "UPDATE tenants SET steward_person_id = '$S' WHERE id = '$TEN'" > /dev/null
q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$S', '$TEN', '$S', 'Verification fixture grant'), ('$X', '$TEN', '$S', 'Verification fixture grant')" > /dev/null
IND="$(q "SELECT id FROM industries WHERE tenant_id = '$TEN' AND slug = 'manufacturing'")"
E="$(q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
  VALUES ('$TEN', '$IND', 'Q4k TRIR (fixture)', 'incidents per 200,000 hours', 'decrease', 'Fixture definition.', 'w', true, 'r', 'Fixture confounders.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
TEN_X="$(q "SELECT id FROM tenants WHERE id <> '$TEN' ORDER BY id LIMIT 1")"
INST_X="$(q "INSERT INTO institutions (tenant_id, name) VALUES ('$TEN_X', 'Other tenant (q4k $TS)') RETURNING id" | head -1)"
P_X="$(q "INSERT INTO persons (institution_id, full_name, email) VALUES ('$INST_X', 'Other tenant person (q4k)', 'px.$TS@q4k.example') RETURNING id" | head -1)"
EV_X="$(q "INSERT INTO evidence (evidence_form, quote_text, how_read, institution_id, kind, summary, provenance, confidence, captured_by_person_id, ai_sourced, research_query, research_tool) VALUES ('quote', 'Verification fixture quote, not a source.', 'Verification fixture: read from the fixture quote as written.', '$INST_X', 'public_filing', 'Other tenant AI evidence', 'Verification fixture, not a source', 'low', '$P_X', true, 'q', 't') RETURNING id" | head -1)"
start_server && ok "API up on $PORT"
N=0
account() {  # NAME — sets INST, CAP, OUT (an outcome on the TRIR entry, baseline 1.4)
  N=$((N + 1))
  req POST /api/account-inputs "{\"institution\":{\"name\":\"$1 $TS\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"Verification: classified for Q4k.\"}}"; INST="$(rj b.institution_id)"
  req POST "/api/institutions/$INST/analyst-of-record" "{\"person_id\":\"$S\",\"title\":\"External analyst of record (verification)\"}"
  req POST "/api/institutions/$INST/offerings" "{\"offering_key\":\"skillsoft_compliance_suite\",\"capability_name\":\"Q4k capability $N\",\"owner_person_id\":\"$S\",\"is_primary\":false,\"basis\":\"Verification: EHS solution.\"}"; CAP="$(rj b.capability_id)"
  req POST "/api/capabilities/$CAP/industry-measures" "{\"industry_measure_id\":\"$E\",\"claim\":\"Verification: training reduces incidents.\"}"
  req POST "/api/institutions/$INST/value-outcomes" "{\"engagement_name\":\"Q4k engagement $N\",\"engagement_owner_person_id\":\"$S\",\"capability_name\":\"Q4k capability $N\",\"metric\":{\"name\":\"Q4k TRIR $N $TS\",\"unit\":\"incidents per 200,000 hours\",\"direction\":\"decrease\",\"source_system\":\"published disclosures\",\"owner_person_id\":\"$S\"},\"baseline_value\":1.4,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}"
  [ "$CODE" = "201" ] || { bad "fixture outcome: $CODE $(said)"; exit 1; }
  OUT="$(rj b.value_outcome_id)"; ENG="$(rj b.engagement_id)"; local met; met="$(rj b.business_metric_id)"
  req POST "/api/business-metrics/$met/pack-basis" "{\"industry_measure_id\":\"$E\",\"basis_note\":\"Verification: the same rate.\"}"
  [ "$CODE" = "201" ] || { bad "fixture basis: $CODE $(said)"; exit 1; }
}
EVB() {  # KIND SUMMARY SUPPORTS AI VERIFIED
  if [ "$4" = true ]; then
    printf '{"kind":"%s","provenance":"Fixture CR disclosures, page 21 (not a source)","summary":"%s","supports":"%s","confidence":"medium","evidence_form":"quote","quote_text":"Verification fixture quote, not a source.","how_read":"Verification fixture: read from the fixture quote as written.","source_verified":%s,"ai_sourced":true,"simulated":false,"research_query":"q","research_tool":"t"}' "$1" "$2" "$3" "$5"
  else
    printf '{"kind":"%s","provenance":"Fixture CR disclosures, page 21 (not a source)","summary":"%s","supports":"%s","confidence":"medium","evidence_form":"quote","quote_text":"Verification fixture quote, not a source.","how_read":"Verification fixture: read from the fixture quote as written.","source_verified":%s,"ai_sourced":false,"simulated":false}' "$1" "$2" "$3" "$5"
  fi
}
account "Q4k API account"; INST_API="$INST"; OUT_API="$OUT"; ENG_API="$ENG"
account "Q4k walk account"; INST_UI="$INST"; OUT_UI="$OUT"
ok "two accounts through the routes (analyst of record, capability, claim, outcome with baseline 1.4, pack basis); another tenant's AI evidence"

step "4. Refusals in plain words"
REF0="$(q "SELECT count(*) FROM evidence")"
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'AI and verified at once' baseline true true)" 422 "AI-sourced evidence recorded as verified: the route says why, first" "$SENTENCE"
noraw "AI-verified"
[ "$(q "SELECT count(*) FROM evidence")" = "$REF0" ] && ok "  ...nothing written" || bad "  ...a row was written"
[ "$(q "SELECT source || '|' || subject_table || '|' || value_outcome_id || '|' || (attempted_payload->>'supports') || '|' || (sqlstate IS NULL) FROM refusals ORDER BY refused_at DESC, id DESC LIMIT 1")" = "route|evidence|$OUT_API|baseline|true" ] \
  && ok "  ...and the attempt is RECORDED (source route, the outcome, the payload): the gap register reads it as refused" || bad "  ...refusal row: $(q "SELECT source, subject_table, value_outcome_id FROM refusals ORDER BY refused_at DESC LIMIT 1")"
req GET "/api/value-outcomes/$OUT_API/gaps"
[ "$(rj "b.filter(g=>g.state==='refused').length > 0")" = "true" ] && ok "  ...the gap register shows a refused ask for this outcome" || bad "  ...gaps: $(head -c 300 "$W/r.json")"
# An unmapped CHECK (added on the clone): the neutral sentence, never its name; and the coverage check fails on it.
q "ALTER TABLE evidence ADD CONSTRAINT verify_unmapped_probe CHECK (summary <> 'PROBE-UNMAPPED')" > /dev/null
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'PROBE-UNMAPPED' baseline false false)" 422 "a CHECK with no sentence: the neutral one" "That can't be recorded as entered; nothing was written."
noraw "unmapped CHECK"
[ "$(q "SELECT constraint_name FROM refusals ORDER BY refused_at DESC, id DESC LIMIT 1")" = "verify_unmapped_probe" ] && ok "  ...the constraint recorded in refusals, for the record" || bad "  ...refusal row"
OUT="$(coverage)"; printf '%s' "$OUT" | grep -qF "NO SENTENCE evidence.verify_unmapped_probe" && ok "B3: the coverage check fails on a CHECK with no sentence, naming it" || bad "coverage with the probe: $OUT"
q "ALTER TABLE evidence DROP CONSTRAINT verify_unmapped_probe" > /dev/null
OUT="$(coverage)"; case "$OUT" in *", 0 without; 0 stale"*) ok "  ...and passes again once it is gone" ;; *) bad "coverage after: $OUT" ;; esac
# Postgres's other errors (a probe trigger raises them; no route reaches them today): plain, raw text in the server log only.
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" > /dev/null <<'SQL'
CREATE FUNCTION verify_q4k_probe() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.summary = 'PROBE-FK' THEN RAISE EXCEPTION 'insert or update on table "evidence" violates foreign key constraint "probe_fk"' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF NEW.summary = 'PROBE-NN' THEN RAISE EXCEPTION 'null value in column "probe" of relation "evidence" violates not-null constraint' USING ERRCODE = 'not_null_violation'; END IF;
  IF NEW.summary = 'PROBE-XX' THEN RAISE EXCEPTION 'probe internal error in relation "evidence"' USING ERRCODE = 'XX000'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verify_q4k_probe BEFORE INSERT ON evidence FOR EACH ROW EXECUTE FUNCTION verify_q4k_probe();
SQL
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'PROBE-FK' baseline false false)" 422 "a foreign-key error: plain" "That refers to something that doesn't exist here; nothing was written."
noraw "foreign key"
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'PROBE-NN' baseline false false)" 422 "a not-null error: plain" "A required value is missing; nothing was written."
noraw "not-null"
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'PROBE-XX' baseline false false)" 500 "any other error: plain" "Something went wrong on the server; nothing was saved."
noraw "internal"
grep -qF 'probe_fk' "$W/server.log" && ok "  ...the raw text is in the server log" || bad "  ...not logged"

step "5. Open the citation (Q4k-D1)"
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'Q4k AI baseline (fixture)' baseline true false)" 201 "AI-sourced evidence recorded unverified (by the steward)"
EV_AI="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'Q4k AI claim two (fixture)' impact_basis true false)" 201 "a second AI-sourced evidence row"
EV_AI2="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'Q4k person-recorded (fixture)' baseline false false)" 201 "evidence recorded by a person from its source"
EV_PLAIN="$(rj b.evidence_id)"
expect POST "/api/institutions/$INST_API/facts" '{"kind":"system","value_text":"Q4k fact system","as_of":"2026-09-30","evidence_kind":"public_filing","confidence":"medium","evidence_form":"quote","quote_text":"Verification fixture quote, not a source.","how_read":"Verification fixture: read from the fixture quote as written.","provenance":"Verification fixture, not a source","ai_sourced":true,"research_query":"q","research_tool":"t"}' 201 "an AI-sourced account fact (its evidence is research's)"
EV_FACT="$(q "SELECT evidence_id FROM institution_facts WHERE institution_id = '$INST_API' AND value_text = 'Q4k fact system'")"
expect POST "/api/engagements/$ENG_API/produce-run" '{"note":"Verification: Q4k run one, before the citation is opened.","source_fixture":"verify_q4k_1"}' 201 "run one, before the citation is opened"
R1="$(rj b.value_run_id)"
expect POST "/api/value-runs/$R1/lock" '{"lock_reason":"Verification: locked before the opening."}' 200 "  ...locked"
H1="$(q "SELECT payload_hash FROM value_runs WHERE id = '$R1'")"
[ "$(q "SELECT (e->>'citation_resolved') || '|' || (e->>'source_verified') || '|' || (e->>'basis') FROM value_runs, jsonb_array_elements(payload->'evidence') e WHERE id = '$R1' AND e->>'summary' = 'Q4k AI baseline (fixture)'")" = "false|false|assumed" ] \
  && ok "  ...it seals the AI evidence as it stood: citation not opened, unverified, basis assumed" || bad "  ...sealed: $(q "SELECT payload->'evidence' FROM value_runs WHERE id = '$R1'" | head -c 300)"
OC="/api/evidence/$EV_AI/open-citation"
expect POST "$OC" '{"source_verified":true,"verified_by":"someone"}' 400 "a field the route does not take" "body.verified_by is not a field of this request"
expect POST "$OC" '{}' 422 "no answer to 'does the source say it?'" "body.source_verified must say whether the opened source supports"
expect POST "/api/evidence/$EV_PLAIN/open-citation" '{"source_verified":true}' 409 "evidence a person recorded: no citation to open" "Only AI-sourced evidence has a citation to open"
expect POST "/api/evidence/$EV_FACT/open-citation" '{"source_verified":true}' 409 "an account fact's evidence: opened in research, not here (D1)" "its citation is opened in the account's research"
expect POST "/api/evidence/$EV_X/open-citation" '{"source_verified":true}' 404 "another tenant's evidence" "evidence $EV_X not found"
AUD0="$(q "SELECT coalesce(max(id), 0) FROM audit_log")"
expect POST "$OC" '{"source_verified":true}' 200 "the RECORDER opens the citation and says the source supports it (the separation is AI vs a named human)"
[ "$(q "SELECT ai_sourced || '|' || citation_resolved || '|' || citation_resolved_by_person_id || '|' || (citation_resolved_at IS NOT NULL) || '|' || source_verified || '|' || lvrf_evidence_basis(e) FROM evidence e WHERE id = '$EV_AI'")" = "true|true|$S|true|true|published" ] \
  && ok "  ...the row: still ai_sourced; opened by the steward, with the time; source verified; basis now published" || bad "  ...row: $(q "SELECT ai_sourced, citation_resolved, citation_resolved_by_person_id, source_verified FROM evidence WHERE id = '$EV_AI'")"
[ "$(q "SELECT count(*) FROM audit_log WHERE id > $AUD0 AND table_name = 'evidence' AND record_id = '$EV_AI' AND actor_person_id = '$S'")" -ge 1 ] && ok "  ...audited, the steward as actor" || bad "  ...not audited"
expect POST "$OC" '{"source_verified":true}' 409 "opening it again" "This citation was already opened by $S_NAME"
expect POST "/api/evidence/$EV_AI2/open-citation" '{"source_verified":false}' 200 "another person (X) opens the second; the source does NOT support it" "" "$X"
[ "$(q "SELECT ai_sourced || '|' || citation_resolved || '|' || citation_resolved_by_person_id || '|' || source_verified FROM evidence WHERE id = '$EV_AI2'")" = "true|true|$X|false" ] \
  && ok "  ...opened by X, and it stays unverified" || bad "  ...EV_AI2 row"
sqlrefused "un-opening a citation" "UPDATE evidence SET citation_resolved = false, citation_resolved_by_person_id = NULL, citation_resolved_at = NULL, source_verified = false WHERE id = '$EV_AI'" "citation resolution is final"
sqlrefused "un-marking AI origin (opened)" "UPDATE evidence SET ai_sourced = false WHERE id = '$EV_AI'" "is AI-sourced, and stays so"
sqlrefused "un-marking AI origin (before any opening, on the other tenant's row)" "UPDATE evidence SET ai_sourced = false WHERE id = '$EV_X'" "is AI-sourced, and stays so"
[ "$(q "SELECT payload_hash FROM value_runs WHERE id = '$R1'")" = "$H1" ] && [ "$(q "SELECT (e->>'citation_resolved') || '|' || (e->>'basis') FROM value_runs, jsonb_array_elements(payload->'evidence') e WHERE id = '$R1' AND e->>'summary' = 'Q4k AI baseline (fixture)'")" = "false|assumed" ] \
  && ! (DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_run_hashes.ts 2>/dev/null || true) | grep -qF "MISMATCH $R1" \
  && ok "the LOCKED run one is unchanged: same hash, still 'not opened, assumed', and it recomputes to its hash" || bad "run one changed"
expect POST "/api/engagements/$ENG_API/produce-run" '{"note":"Verification: Q4k run two, after the opening.","source_fixture":"verify_q4k_2"}' 201 "run two, after the opening"
R2="$(rj b.value_run_id)"
[ "$(q "SELECT (e->>'citation_resolved') || '|' || (e->>'source_verified') || '|' || (e->>'basis') FROM value_runs, jsonb_array_elements(payload->'evidence') e WHERE id = '$R2' AND e->>'summary' = 'Q4k AI baseline (fixture)'")" = "true|true|published" ] \
  && ok "  ...it seals the opened state: citation opened, verified, published" || bad "  ...run two sealed"

step "6. The form and W6, in a browser"
expect POST "/api/value-outcomes/$OUT_UI/evidence" "$(EVB public_filing 'Walk AI evidence (fixture)' baseline true false)" 201 "(walk fixture: AI-sourced evidence on the walk account)"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > "$W/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
walk() {  # MODE
  set +e
  node scripts/lib/evidence_form_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$VERIFY_DB" "$INST_UI" "$S_EMAIL" "$X_EMAIL" "$PW" "$S_NAME" 2>&1 | tee "$W/walk.$1.log"; local rc=${PIPESTATUS[0]}; set -e
  PASS=$((PASS + $(grep -c '^  PASS' "$W/walk.$1.log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/walk.$1.log" || true)))
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc — a crash is a failure (see $W/walk.$1.log)"
}
walk form

step "7. Deliberate breaks"
restore() { cp "$W/$(basename "$1").orig" "$1"; cmp -s "$W/$(basename "$1").orig" "$1" && ok "  ...$1 restored byte-identical" || bad "  ...$1 restore differs"; }
edit() {  # FILE OLD NEW
  python3 - "$1" "$2" "$3" <<'PY'
import sys; p, a, b = sys.argv[1:4]; s = open(p).read()
assert s.count(a) == 1, a; open(p, 'w').write(s.replace(a, b))
PY
}
# B2 — the route's own refusal removed: the CHECK refuses, and the mapping says it in the same words.
edit "$ROUTE" "      if (aiSourced && sourceVerified) {" "      if (false) {"
stop_server; start_server
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'AI and verified, B2' baseline true true)" 422 "B2: without the route's refusal, the database's CHECK refuses — in the same plain words" "$SENTENCE"
noraw "B2"
[ "$(q "SELECT constraint_name FROM refusals ORDER BY refused_at DESC, id DESC LIMIT 1")" = "evidence_ai_verify_requires_resolution" ] && ok "  ...recorded with its constraint" || bad "  ...refusal row"
# B1 — and the mapping removed too: Postgres's own text reaches the person.
edit "$REFUSAL" "status === 409 ? plainUniqueMessage(err) : plainCheckMessage(err)" "status === 409 ? plainUniqueMessage(err) : err.message"
stop_server; start_server
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'AI and verified, B1' baseline true true)" 422 "B1: without the mapping, the raw CHECK text is shown — the mapping is what keeps it plain" 'violates check constraint "evidence_ai_verify_requires_resolution"'
restore "$REFUSAL"; restore "$ROUTE"; stop_server; start_server
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'AI and verified, restored' baseline true true)" 422 "  ...restored: plain again" "$SENTENCE"
# B5 — the plain answer for other errors removed: the foreign-key text reaches the person.
edit "$ROUTE" "      respondServerError(res, err);" "      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });"
stop_server; start_server
expect POST "/api/value-outcomes/$OUT_API/evidence" "$(EVB public_filing 'PROBE-FK' baseline false false)" 500 "B5: without respondServerError, the foreign-key text is shown — it is what keeps it plain" 'violates foreign key constraint "probe_fk"'
restore "$ROUTE"; stop_server; start_server
q "DROP TRIGGER verify_q4k_probe ON evidence; DROP FUNCTION verify_q4k_probe()" > /dev/null
# B6 — AI origin made forgettable: without the trigger, ai_sourced is cleared (rolled back).
sqllands "B6: without evidence_resolution_is_final, an opened AI-sourced row is re-marked as a person's (rolled back): the trigger is what keeps the origin" \
  "ALTER TABLE evidence DISABLE TRIGGER evidence_resolution_is_final; UPDATE evidence SET ai_sourced = false WHERE id = '$EV_AI'" "UPDATE 1"
[ "$(q "SELECT ai_sourced FROM evidence WHERE id = '$EV_AI'")" = "t" ] && ok "  ...after B6: still AI-sourced" || bad "  ...B6 left state"
# B4 — the form's lock removed: the route still refuses, in plain words.
edit "$CARD" "                disabled={aiSourced === 'true'}" "                disabled={false}"
edit "$CARD" "                value={aiSourced === 'true' ? 'false' : sourceVerified}" "                value={sourceVerified}"
edit "$CARD" "  const effectiveVerified: YesNo = aiSourced === 'true' ? 'false' : sourceVerified;" "  const effectiveVerified: YesNo = sourceVerified;"
sleep 5; walk break-gate; restore "$CARD"
for f in "$ROUTE" "$REFUSAL" "$CARD"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
