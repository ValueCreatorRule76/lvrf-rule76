#!/usr/bin/env bash
#
# Q4b — one research contract (server/research/contracts.ts), a generated
# and immutable prompt (research_prompts, 0031), and a parse that requires
# the response to name its prompt. Local verification.
#
#   ./scripts/verify_research_contract.sh
#
# Clone `lvrf_verifycontract` (createdb -T lvrf -O lvrf_app), migrated and
# hardened, dropped on exit. The header is the actor
# (LVRF_ALLOW_ACTOR_HEADER=1 on this throwaway server only).
#
# Contract-driven, not hand-listed: every required field is read from
# INDUSTRY_MEASURE_CONTRACT, so a field added there is tested here without
# editing this file.
#
# DELIBERATE BREAKS (section 8) edit server/routes/industryResearch.ts in
# place, restart the server, and restore the file byte-identical (cmp). The
# EXIT trap restores it too, so an interrupted run cannot leave it broken.

set -euo pipefail
cd "$(dirname "$0")/.."
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifycontract
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3075
BASE="http://127.0.0.1:${PORT}"
ROUTE=server/routes/industryResearch.ts
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_contract.XXXXXX")"
cp "$ROUTE" "$W/route.orig"
CONTRACTS=server/research/contracts.ts; CHECKER=scripts/check_legacy_research.ts
cp "$CONTRACTS" "$W/contracts.orig"; cp "$CHECKER" "$W/checker.orig"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  cmp -s "$W/route.orig" "$ROUTE" || { cp "$W/route.orig" "$ROUTE"; echo "  (EXIT trap restored $ROUTE)"; }
  cmp -s "$W/contracts.orig" "$CONTRACTS" || { cp "$W/contracts.orig" "$CONTRACTS"; echo "  (EXIT trap restored $CONTRACTS)"; }
  cmp -s "$W/checker.orig" "$CHECKER" || { cp "$W/checker.orig" "$CHECKER"; echo "  (EXIT trap restored $CHECKER)"; }
  dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W"
}
trap cleanup EXIT
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
start_server() {
  env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && return 0; sleep 0.5; done
  bad "server did not start: $(tail -5 "$W/server.log")"; exit 1
}
# post PATH BODY [ACTOR] — status in $CODE, body in $W/r.json
post() {
  CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' \
    -H "x-actor-person-id: ${3:-$ACTOR}" -d "$2" "$BASE$1")"
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
# The message and every issue, unescaped, so a 5th-argument match can find an issue, not only the message.
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?[b.message,...(b.issues??[])].join(' | '):JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # PATH BODY STATUS LABEL [SUBSTRING]
  post "$1" "$2"
  local all; all="$(said)"
  if [ "$CODE" = "$3" ] && { [ -z "${5:-}" ] || printf '%s' "$all" | grep -qF -- "$5"; }; then
    ok "$4 -> $CODE"
  else
    bad "$4 -> $CODE (expected $3${5:+ naming \"$5\"})  $(printf '%s' "$all" | head -c 400)"
  fi
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"

step "2. Clone, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
LEGACY_BEFORE="$(psql -X -At -d lvrf -c "SELECT count(*) FROM research_results")"
createdb -T lvrf -O lvrf_app "$VERIFY_DB" && ok "cloned (local lvrf has $LEGACY_BEFORE research_results)"
DATABASE_URL="$VERIFY_URL" npx drizzle-kit migrate > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > "$W/harden.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep ERROR "$W/harden.log" | head -2)"; exit 1; }
N_TRIG="$(q "SELECT count(DISTINCT trigger_name || '.' || event_object_table) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$N_TRIG" = "$EXPECT_TRIGGERS" ] && ok "$N_TRIG distinct triggers, as hardening.sql's Total says" || bad "triggers: $N_TRIG, expected $EXPECT_TRIGGERS"
[ "$(q "SELECT string_agg(trigger_name, ',' ORDER BY trigger_name) FROM (SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE event_object_table = 'research_prompts') t")" = "research_prompts_audit,research_prompts_immutable,research_prompts_no_delete" ] \
  && ok "research_prompts: _audit, _immutable, _no_delete" || bad "research_prompts triggers wrong"
OUT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs || true)"
case "$OUT" in "schema drift: none"*) ok "D2: $OUT" ;; *) bad "D2: $OUT" ;; esac

step "3. The results that predate prompts (0031 left them as they were)"
[ "$(q "SELECT count(*) FILTER (WHERE NOT prompt_tracked AND prompt_id IS NULL AND contract_version IS NULL) || '/' || count(*) FROM research_results")" = "$LEGACY_BEFORE/$LEGACY_BEFORE" ] \
  && ok "all $LEGACY_BEFORE existing results: prompt_tracked false, no prompt, no version" || bad "legacy rows: $(q "SELECT count(*) FILTER (WHERE NOT prompt_tracked) || '/' || count(*) FROM research_results")"
# Prod's 13 are all accepted; local lvrf also carries September test rows,
# one of them deliberately off-contract and still pending. So: every
# ACCEPTED legacy row must validate; a finding on a row nobody accepted is
# printed, not failed — accept itself would refuse that row.
legacy() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/check_legacy_research.ts 2>&1 || true; }
OUT="$(legacy)"
ACC_FINDINGS="$(printf '%s\n' "$OUT" | grep '^LEGACY: .* (accepted, ' || true)"
[ -z "$ACC_FINDINGS" ] && printf '%s' "$OUT" | grep -q '^research results: ' \
  && ok "check_legacy_research: every accepted result validates against the version it was parsed under" || bad "check_legacy_research: $OUT"
printf '%s\n' "$OUT" | grep '^LEGACY: ' | sed 's/^/  NOTE  /' | cut -c1-220 || true
printf '%s\n' "$OUT" | tail -1 | sed 's/^/  NOTE  /'
ACC="$(q "SELECT id FROM research_results WHERE result_kind = 'industry_measure' AND review_state = 'accepted' ORDER BY id LIMIT 1")"
if [ -n "$ACC" ]; then
  q "SELECT raw_response::text FROM research_results WHERE id = '$ACC'" > "$W/acc.json"
  q "UPDATE research_results SET raw_response = raw_response - 'citation' WHERE id = '$ACC'" > /dev/null
  legacy | grep -qF "LEGACY: $ACC (accepted, v3): raw_response.citation is missing" && ok "break: an accepted row without its citation is named by the checker" || bad "break: the checker missed $ACC"
  echo "UPDATE research_results SET raw_response = :'raw'::jsonb WHERE id = '$ACC'" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -v raw="$(cat "$W/acc.json")" > /dev/null
  [ -z "$(legacy | grep '^LEGACY: .* (accepted, ' || true)" ] && ok "  ...restored: no accepted row fails" || bad "  ...restore"
fi

step "4. Fixtures and server"
ACTOR="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$ACTOR'")"
q "UPDATE tenants SET steward_person_id = '$ACTOR' WHERE id = '$TEN' AND steward_person_id IS NULL" > /dev/null
[ "$(q "SELECT steward_person_id = '$ACTOR' FROM tenants WHERE id = '$TEN'")" = "t" ] || { bad "the actor is not the tenant's steward"; exit 1; }
OTHER="$(q "INSERT INTO persons (tenant_id, full_name, email) VALUES ('$TEN', 'Not the steward (verification)', 'other.$(date +%s)@contract.example') RETURNING id" | head -1)"
read -r IND SLUG <<< "$(q "SELECT id || ' ' || slug FROM industries WHERE tenant_id = '$TEN' ORDER BY slug LIMIT 1")"
read -r IND2 SLUG2 <<< "$(q "SELECT id || ' ' || slug FROM industries WHERE tenant_id = '$TEN' AND id <> '$IND' ORDER BY slug LIMIT 1")"
IND_NAME="$(q "SELECT name FROM industries WHERE id = '$IND'")"
read -r IND_X TEN_X <<< "$(q "SELECT id || ' ' || tenant_id FROM industries WHERE tenant_id <> '$TEN' ORDER BY slug LIMIT 1")"
# A current entry and a retired one, so the prompt's list is tested both ways.
q "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
   VALUES ('$TEN', '$IND', 'Contract fixture: current entry', '%', 'increase', 'd', 'w', false, 'r', 'c', 'Verification fixture, not a source.'),
          ('$TEN', '$IND', 'Contract fixture: retired entry', '%', 'increase', 'd', 'w', true, 'r', 'c', 'Verification fixture, not a source.')" > /dev/null
q "UPDATE industry_measures SET deleted_at = now(), status = 'retired', retired_by_person_id = '$ACTOR', retirement_reason = 'Verification fixture: a retired entry.' WHERE industry_id = '$IND' AND name = 'Contract fixture: retired entry'" > /dev/null
q "INSERT INTO industry_measure_exclusions (tenant_id, industry_id, name, reason, excluded_by_person_id)
   VALUES ('$TEN', '$IND', 'Contract fixture: excluded', 'Verification: set by the market, not by capability.', '$ACTOR')" > /dev/null
[ -n "$OTHER" ] && [ -n "$IND2" ] && [ -n "$IND_X" ] && ok "actor (steward) and a second staff person; industries $SLUG and $SLUG2; another tenant's industry; one entry, one retired, one exclusion" || { bad "fixtures"; exit 1; }
start_server && ok "server up"

step "5. The contract: columns, prompt, hash, immutability"
npx tsx -e "import('./server/research/contracts.ts').then(m=>console.log(JSON.stringify(m.INDUSTRY_MEASURE_CONTRACT)))" > "$W/contract.json"
CV="$(node -e "console.log(require('$W/contract.json').version)")"
COLS="$(node -e "const c=require('$W/contract.json');console.log(c.fields.flatMap(f=>f.kind==='object'?f.fields.map(s=>s.column):[f.column]).join(' '))")"
MISSING_COLS=""; for c in $COLS; do [ "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name = 'industry_measures' AND column_name = '$c'")" = "1" ] || MISSING_COLS="$MISSING_COLS $c"; done
[ -z "$MISSING_COLS" ] && ok "every contract field maps to an industry_measures column ($(echo "$COLS" | wc -w | tr -d ' '))" || bad "no column for:$MISSING_COLS"

expect "/api/industries/$IND/research-prompts" '{}' 201 "generate a prompt"
P1="$(rj b.prompt_id)"; rj b.prompt > "$W/p1.txt"
TV="$(npx tsx -e "import('./server/research/contracts.ts').then(m=>console.log(m.PROMPT_TEMPLATE_VERSION))")"
[ "$(rj "b.contract_version+'/'+b.template_version")" = "$CV/$TV" ] && ok "response: contract v$CV, template v$TV" || bad "versions: $(rj "b.contract_version+'/'+b.template_version")"
[ "$(rj b.prompt_sha256)" = "$(q "SELECT prompt_sha256 FROM research_prompts WHERE id = '$P1'")" ] \
  && [ "$(q "SELECT prompt_sha256 = encode(sha256(convert_to(prompt_text, 'UTF8')), 'hex') FROM research_prompts WHERE id = '$P1'")" = "t" ] \
  && [ "$(node -e "console.log(require('crypto').createHash('sha256').update(require('$W/r.json').prompt,'utf8').digest('hex'))")" = "$(rj b.prompt_sha256)" ] \
  && ok "stored hash = SHA-256 of the stored text = SHA-256 of the returned text" || bad "hash mismatch"
q "SELECT prompt_text FROM research_prompts WHERE id = '$P1'" > "$W/p1.db.txt"
diff -q <(cat "$W/p1.txt") "$W/p1.db.txt" > /dev/null && ok "returned text = stored text" || bad "returned text differs from stored"
NOT_IN=""; while read -r k; do grep -qF -- "$k" "$W/p1.txt" || NOT_IN="$NOT_IN | $k"; done < <(node -e "const c=require('$W/contract.json');for(const f of c.fields){console.log(f.key);console.log(f.prompt);if(f.kind==='object')for(const s of f.fields){console.log(s.key);console.log(s.prompt)}}")
[ -z "$NOT_IN" ] && ok "every contract field, and its sentence, is in the prompt" || bad "not in the prompt:$NOT_IN"
grep -qF -- "- Contract fixture: current entry (kept as not addressable)" "$W/p1.txt" && ! grep -qF "Contract fixture: retired entry" "$W/p1.txt" \
  && ok "lists the current entry; not the retired one" || bad "entries listed wrong"
grep -qF -- "- Contract fixture: excluded — Verification: set by the market, not by capability." "$W/p1.txt" && ok "lists the exclusion with its reason" || bad "exclusion not listed"
grep -qF "\"prompt_id\": \"$P1\"" "$W/p1.txt" && grep -qF "\"industry\": \"$SLUG\"" "$W/p1.txt" && ok "asks the agent to echo prompt_id and the slug" || bad "echo instruction missing"
[ "$(q "SELECT (listed_measure_ids = ARRAY(SELECT id FROM industry_measures WHERE industry_id = '$IND' AND deleted_at IS NULL AND superseded_by_id IS NULL))
          AND (listed_exclusion_ids = ARRAY(SELECT id FROM industry_measure_exclusions WHERE industry_id = '$IND'))
          AND generated_by_person_id = '$ACTOR' AND tenant_id = '$TEN' FROM research_prompts WHERE id = '$P1'")" = "t" ] \
  && ok "row: listed ids are the live entries and exclusions; generated by the actor; actor's tenant" || bad "row contents"
[ "$(q "SELECT count(*) FROM audit_log WHERE table_name = 'research_prompts' AND record_id = '$P1' AND operation = 'insert' AND actor_person_id = '$ACTOR'")" = "1" ] && ok "audit_log records the prompt with its actor" || bad "no audit row"

expect "/api/industries/$IND/research-prompts" '{}' 201 "generate again, nothing changed"
P1B="$(rj b.prompt_id)"; rj b.prompt | sed "s/$P1B/$P1/g" > "$W/p1b.txt"
cmp -s "$W/p1.txt" "$W/p1b.txt" && ok "deterministic: the same rows give the same text (only the id differs)" || bad "not deterministic: $(diff "$W/p1.txt" "$W/p1b.txt" | head -4)"
q "INSERT INTO industry_measure_exclusions (tenant_id, industry_id, name, reason, excluded_by_person_id)
   VALUES ('$TEN', '$IND', 'Contract fixture: a later exclusion', 'Verification: recorded after the first prompt.', '$ACTOR')" > /dev/null
expect "/api/industries/$IND/research-prompts" '{}' 201 "generate after a new exclusion"
P2="$(rj b.prompt_id)"; rj b.prompt | sed "s/$P2/$P1/g" > "$W/p2.txt"
grep -qF "Contract fixture: a later exclusion" "$W/p2.txt" && ! grep -qF "a later exclusion" "$W/p1.txt" && ! cmp -s "$W/p1.txt" "$W/p2.txt" \
  && [ "$(q "SELECT cardinality(listed_exclusion_ids) FROM research_prompts WHERE id = '$P2'")" = "2" ] \
  && [ "$(q "SELECT count(DISTINCT prompt_sha256) FROM research_prompts WHERE id IN ('$P1', '$P2')")" = "2" ] \
  && ok "the new exclusion is in the new prompt, not the old; different text, different hash; two exclusion ids listed" || bad "new exclusion not reflected"

UPD="$(psql -X -d "$VERIFY_DB" -c "UPDATE research_prompts SET prompt_text = prompt_text || ' ', prompt_sha256 = encode(sha256(convert_to(prompt_text || ' ', 'UTF8')), 'hex') WHERE id = '$P1'" 2>&1 || true)"
printf '%s' "$UPD" | grep -qF "is final" && ok "UPDATE refused: $(printf '%s' "$UPD" | grep -o 'research prompt [^.]*is final')" || bad "UPDATE not refused: $UPD"
DEL="$(psql -X -d "$VERIFY_DB" -c "DELETE FROM research_prompts WHERE id = '$P1'" 2>&1 || true)"
printf '%s' "$DEL" | grep -qF "cannot be deleted" && ok "DELETE refused" || bad "DELETE not refused: $DEL"
BADHASH="$(psql -X -d "$VERIFY_DB" -c "INSERT INTO research_prompts (tenant_id, industry_id, result_kind, contract_version, template_version, prompt_text, prompt_sha256, generated_by_person_id)
  VALUES ('$TEN', '$IND', 'industry_measure', $CV, 1, 'text', repeat('0', 64), '$ACTOR')" 2>&1 || true)"
printf '%s' "$BADHASH" | grep -qF "research_prompts_sha256_is_the_text" && ok "a hash that is not the text's: refused by research_prompts_sha256_is_the_text" || bad "bad hash accepted: $BADHASH"
expect "/api/industries/$IND_X/research-prompts" '{}' 404 "another tenant's industry" "industry $IND_X not found"

step "6. Parse requires the prompt, its version and its industry"
GOOD_M='{"name":"Contract measure","unit":"%","direction":"increase","definition":"d","why_it_pays":"w","confounders":"c","citation":"cite","addressable_by_workforce_capability":{"value":true,"why":"y"},"caveats":[]}'
body() {  # PROMPT_ID INDUSTRY [MEASURE] — PROMPT_ID "-" omits the key
  local pid=""; [ "$1" = "-" ] || pid="\"prompt_id\":\"$1\","
  printf '{%s"industry":"%s","research_query":"q","query_as_executed":"qe","research_tool":"Contract verification","measures":[%s]}' "$pid" "$2" "${3:-$GOOD_M}"
}
PARSE="/api/industries/$IND/research-results"
N0="$(q "SELECT count(*) FROM research_results")"
expect "$PARSE" "$(body - "$SLUG")" 422 "no prompt_id" "body.prompt_id is required"
expect "$PARSE" "$(body not-a-uuid "$SLUG")" 422 "prompt_id not a uuid" "body.prompt_id is required"
expect "$PARSE" "$(body 00000000-0000-4000-8000-000000000000 "$SLUG")" 422 "an unknown prompt_id" "is not a research prompt for industry $IND"
expect "/api/industries/$IND2/research-prompts" '{}' 201 "a prompt for $SLUG2"
P_IND2="$(rj b.prompt_id)"
expect "$PARSE" "$(body "$P_IND2" "$SLUG")" 422 "another industry's prompt" "body.prompt_id $P_IND2 is not a research prompt for industry $IND"
P_X="$(q "INSERT INTO research_prompts (tenant_id, industry_id, result_kind, contract_version, template_version, prompt_text, prompt_sha256, generated_by_person_id)
  VALUES ('$TEN_X', '$IND_X', 'industry_measure', $CV, 1, 'x', encode(sha256(convert_to('x', 'UTF8')), 'hex'), '$ACTOR') RETURNING id" | head -1)"
expect "$PARSE" "$(body "$P_X" "$SLUG")" 422 "another tenant's prompt" "body.prompt_id $P_X is not a research prompt for industry $IND"
OLDV=$((CV - 1))
P_OLD="$(q "INSERT INTO research_prompts (tenant_id, industry_id, result_kind, contract_version, template_version, prompt_text, prompt_sha256, generated_by_person_id)
  VALUES ('$TEN', '$IND', 'industry_measure', $OLDV, 1, 'a v$OLDV prompt', encode(sha256(convert_to('a v$OLDV prompt', 'UTF8')), 'hex'), '$ACTOR') RETURNING id" | head -1)"
expect "$PARSE" "$(body "$P_OLD" "$SLUG")" 422 "a prompt generated against v$OLDV" "the prompt was generated against v$OLDV; the contract is now v$CV; generate a new prompt"
expect "$PARSE" "$(body "$P1" "$SLUG2")" 422 "body.industry is another industry" "body.industry is \"$SLUG2\", but prompt $P1 is for \"$SLUG\""
post "$PARSE" "$(body "$P_OLD" "$SLUG2")"
[ "$CODE" = "422" ] && [ "$(rj "b.issues.filter(i=>/generated against v$OLDV|answers a different industry/.test(i)).length")" = "2" ] \
  && ok "stale prompt AND wrong industry -> 422 naming both (every issue, not the first)" || bad "both: $CODE $(said | head -c 300)"
while IFS=$'\t' read -r path m; do
  expect "$PARSE" "$(body "$P1" "$SLUG" "$m")" 422 "contract: measures[0].$path missing" "measures[0].$path is missing. This response predates the current contract"
done < <(node -e "
const c=require('$W/contract.json'); const g=$GOOD_M;
for (const f of c.fields) {
  if (f.kind==='object') for (const s of f.fields) { const m=structuredClone(g); delete m[f.key][s.key]; console.log(f.key+'.'+s.key+'\t'+JSON.stringify(m)); }
  const m=structuredClone(g); delete m[f.key]; console.log(f.key+'\t'+JSON.stringify(m));
}")
[ "$(q "SELECT count(*) FROM research_results")" = "$N0" ] && ok "every refusal above wrote nothing ($N0 results before and after)" || bad "a refused parse wrote rows"

expect "$PARSE" "$(body "$P1" "$SLUG")" 201 "a conforming response to the current prompt"
RR_OK="$(rj b.results[0].id)"
[ "$(q "SELECT prompt_id = '$P1' AND contract_version = $CV AND prompt_tracked FROM research_results WHERE id = '$RR_OK'")" = "t" ] && ok "the result names prompt $P1, contract v$CV, prompt_tracked" || bad "result row: $(q "SELECT prompt_id, contract_version, prompt_tracked FROM research_results WHERE id = '$RR_OK'")"
expect "$PARSE" "$(body "$P1" "$(printf '%s' "$SLUG" | tr '[:lower:]' '[:upper:]')" "${GOOD_M/Contract measure/Contract measure 2}")" 201 "the slug in capitals"
RR_2="$(rj b.results[0].id)"
expect "$PARSE" "$(body "$P1" "  $IND_NAME " "${GOOD_M/Contract measure/Contract measure 3}")" 201 "the industry's name instead of its slug"
RR_3="$(rj b.results[0].id)"
NOPROMPT="$(psql -X -d "$VERIFY_DB" -c "INSERT INTO research_results (tenant_id, result_kind, industry_id, field_name, found, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id)
  VALUES ('$TEN', 'industry_measure', '$IND', 'direct', true, '{}'::jsonb, 'q', 'qe', 't', '$ACTOR')" 2>&1 || true)"
printf '%s' "$NOPROMPT" | grep -qF "research_results_prompt_named" && ok "a new result with no prompt, by direct SQL: refused by research_results_prompt_named" || bad "a promptless result was written: $NOPROMPT"
# The cut-off: an untracked row must have been parsed before it, and
# parsed_at is the server's, not the caller's.
CUTOFF="$(grep -o "parsed_at\" < '[^']*'" db/drizzle/0031_research_prompts.sql | grep -o "'.*'" | tr -d "'")"
UNTRACKED="INSERT INTO research_results (tenant_id, result_kind, industry_id, field_name, found, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_tracked"
OUT="$(psql -X -d "$VERIFY_DB" -c "$UNTRACKED) VALUES ('$TEN', 'industry_measure', '$IND', 'untracked', true, '{}'::jsonb, 'q', 'qe', 't', '$ACTOR', false)" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "research_results_untracked_predates_prompts" && ok "a new UNTRACKED row, by direct SQL: refused by research_results_untracked_predates_prompts (cut-off $CUTOFF)" || bad "an untracked row was written: $OUT"
OUT="$(psql -X -d "$VERIFY_DB" -c "$UNTRACKED, parsed_at) VALUES ('$TEN', 'industry_measure', '$IND', 'untracked', true, '{}'::jsonb, 'q', 'qe', 't', '$ACTOR', false, '2026-01-01')" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "research_results_untracked_predates_prompts" && ok "...and with parsed_at backdated to 2026-01-01: still refused (stamped now() on INSERT)" || bad "a backdated untracked row was written: $OUT"
PA="$(q "SELECT parsed_at FROM research_results WHERE id = '$RR_2'")"
OUT="$(psql -X -d "$VERIFY_DB" -c "UPDATE research_results SET prompt_tracked = false, parsed_at = '2026-01-01' WHERE id = '$RR_2'" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "research_results_untracked_predates_prompts" && [ "$(q "SELECT parsed_at FROM research_results WHERE id = '$RR_2'")" = "$PA" ] \
  && ok "an UPDATE making a new row untracked and backdating it: refused; parsed_at unchanged" || bad "untracking UPDATE: $OUT"
q "UPDATE research_results SET parsed_at = '2026-01-01' WHERE id = '$RR_2'" > /dev/null
[ "$(q "SELECT parsed_at FROM research_results WHERE id = '$RR_2'")" = "$PA" ] && ok "parsed_at is frozen on UPDATE (a backdating UPDATE leaves it as it was)" || bad "parsed_at moved"
[ "$(q "SELECT count(*) FROM research_results WHERE NOT prompt_tracked AND parsed_at >= '$CUTOFF'")" = "0" ] && ok "no untracked row at or after the cut-off" || bad "an untracked row after the cut-off"

step "6b. Contract v4: caveats (Q4g)"
[ "$CV" = "4" ] && ok "the current contract is v4" || bad "contract version $CV"
expect "$PARSE" "$(body "$P1" "$SLUG" "${GOOD_M/\"caveats\":[]/\"caveats\":\"none\"}")" 422 "caveats not a list" "measures[0].caveats must be a list of strings ([] if there are none)"
expect "$PARSE" "$(body "$P1" "$SLUG" "${GOOD_M/\"caveats\":[]/\"caveats\":[\"ok\",\"  \"]}")" 422 "a blank caveat" "measures[0].caveats[1] must be a non-empty string"
expect "$PARSE" "$(body "$P1" "$SLUG" "$(printf '%s' "${GOOD_M/\"caveats\":[]/\"caveats\":[\"Secondary summary; reviewer should confirm.\"]}" | sed 's/Contract measure/Contract measure with a caveat/')")" 201 "a stated caveat"
RR_CAV="$(rj b.results[0].id)"
[ "$(q "SELECT raw_response->'caveats'->>0 FROM research_results WHERE id = '$RR_CAV'")" = "Secondary summary; reviewer should confirm." ] && ok "  ...kept verbatim in raw_response (review-only: no column)" || bad "  ...caveat not kept"
grep -qF '"caveats" is required on every measure' "$W/p1.txt" && grep -qF -- '- caveats (list of strings):' "$W/p1.txt" && ok "the v4 prompt asks for caveats, with its rule" || bad "prompt lacks caveats"
# A pending result parsed under v3 (from before Q4g) — inserted as one, since
# parse can no longer write v3: accept judges it against v4 and refuses it;
# the checker judges it against v3 and passes it.
V3_RAW="$(printf '%s' "$GOOD_M" | sed 's/,"caveats":\[\]//; s/Contract measure/A v3-era pending result/')"
RR_V3="$(q "INSERT INTO research_results (tenant_id, result_kind, industry_id, field_name, found, raw_response, research_query, query_as_executed, research_tool, parsed_by_person_id, prompt_id, contract_version)
  VALUES ('$TEN', 'industry_measure', '$IND', 'A v3-era pending result', true, '$V3_RAW'::jsonb, 'q', 'qe', 't', '$ACTOR', '$P_OLD', 3) RETURNING id" | head -1)"
expect "/api/research-results/$RR_V3/accept" '{"review_note":"Verification: a v3-era result."}' 422 "accepting a v3-era pending result (no caveats)" "raw_response.caveats is missing. This raw_response predates the accept mapping"
OUT="$(legacy)"
printf '%s' "$OUT" | grep -qF "$RR_V3" && bad "the checker flags the v3-era result: $(printf '%s' "$OUT" | grep -F "$RR_V3")" || ok "the checker passes the v3-era result against v3, the version it was parsed under"
printf '%s' "$OUT" | grep -qE 'v3: [0-9]+, v4: [0-9]+' && ok "  ...and reports both versions: $(printf '%s' "$OUT" | grep -oE '\(v3: [0-9]+, v4: [0-9]+\)')" || bad "  ...versions: $(printf '%s' "$OUT" | tail -1)"

step "7. Accept and reject: steward-only (Band A) and unchanged"
npx tsx -e "import('./server/lib/stewardActs.ts').then(m=>{const t=m.MUTATING_ROUTE_CLASS;console.log([t['POST /api/research-results/:id/accept'],t['POST /api/research-results/:id/reject'],t['POST /api/industries/:industryId/research-prompts'],t['POST /api/industries/:industryId/research-results']].join(' '))})" > "$W/cls.txt"
[ "$(cat "$W/cls.txt")" = "steward steward authorized authorized" ] && ok "MUTATING_ROUTE_CLASS: accept, reject steward; research-prompts, research-results authorized" || bad "classes: $(cat "$W/cls.txt")"
REVIEW_SRC() { awk '/^export function researchResultsReviewRouter/{p=1} p' ; }
git show 65f8486:"$ROUTE" | REVIEW_SRC > "$W/review.before"; REVIEW_SRC < "$ROUTE" > "$W/review.now"
[ -s "$W/review.before" ] && cmp -s "$W/review.before" "$W/review.now" && ok "researchResultsReviewRouter (accept, reject) is byte-identical to the Q4b refactor commit 65f8486 ($(wc -l < "$W/review.now" | tr -d ' ') lines)" || bad "the review router changed: $(diff "$W/review.before" "$W/review.now" | head -4)"
post "/api/research-results/$RR_2/accept" '{"review_note":"Verification: accepted."}' "$OTHER"
[ "$CODE" = "403" ] && ok "accept by a non-steward -> 403" || bad "non-steward accept -> $CODE $(said | head -c 200)"
post "/api/research-results/$RR_3/reject" '{"review_note":"Verification: rejected."}' "$OTHER"
[ "$CODE" = "403" ] && ok "reject by a non-steward -> 403" || bad "non-steward reject -> $CODE $(said | head -c 200)"
expect "/api/research-results/$RR_OK/accept" '{"review_note":"Verification: accepted."}' 200 "accept a prompt-tracked result, by the steward"
[ "$(q "SELECT m.name || '|' || m.status FROM research_results r JOIN industry_measures m ON m.id = r.industry_measures_id WHERE r.id = '$RR_OK'")" = "Contract measure|proposed" ] && ok "  ...a proposed industry_measures row" || bad "  ...no proposed row"
expect "/api/research-results/$RR_3/reject" '{"review_note":"Verification: rejected."}' 200 "reject a prompt-tracked result, by the steward"

step "8. Deliberate breaks"
break_route() {  # LABEL PERL_EXPR
  perl -0pi -e "$2" "$ROUTE"
  cmp -s "$W/route.orig" "$ROUTE" && { bad "break '$1' did not change $ROUTE"; return 1; }
  stop_server; start_server; echo "  (broken: $1)"
}
restore_route() {
  cp "$W/route.orig" "$ROUTE"; cmp -s "$W/route.orig" "$ROUTE" && ok "  ...restored byte-identical" || bad "  ...restore differs"
  stop_server; start_server
}
# B1 — the contract-version check removed: the stale prompt's response is written.
break_route "version check removed" 's/if \(prompt\.contract_version !== INDUSTRY_MEASURE_CONTRACT\.version\)/if (false)/'
post "$PARSE" "$(body "$P_OLD" "$SLUG" "${GOOD_M/Contract measure/Break one}")"
[ "$CODE" = "201" ] && ok "B1: without the version check, a v$OLDV prompt's response is written (201) — the check is what refuses it" || bad "B1: still $CODE — something else refused it: $(said | head -c 200)"
restore_route
expect "$PARSE" "$(body "$P_OLD" "$SLUG" "${GOOD_M/Contract measure/Break one again}")" 422 "B1 restored: refused again" "the prompt was generated against v$OLDV"
# B2 — the industry check removed: a response naming another industry is written.
break_route "industry check removed" 's/if \(bodyIndustry !== undefined && said/if (false \&\& said/'
post "$PARSE" "$(body "$P1" "$SLUG2" "${GOOD_M/Contract measure/Break two}")"
[ "$CODE" = "201" ] && ok "B2: without the industry check, a response for \"$SLUG2\" is written against $SLUG (201) — the check is what refuses it" || bad "B2: still $CODE: $(said | head -c 200)"
restore_route
expect "$PARSE" "$(body "$P1" "$SLUG2" "${GOOD_M/Contract measure/Break two again}")" 422 "B2 restored: refused again" "body.industry is \"$SLUG2\""
# B3 — a missing prompt_id let through by the route: the database refuses it.
break_route "prompt_id requirement removed" 's/if \(typeof promptId !== .string. \|\| !isUuid\(promptId\)\) \{/if (promptId === undefined) { \/\* broken \*\/ } else if (typeof promptId !== "string" || !isUuid(promptId)) {/'
post "$PARSE" "$(body - "$SLUG" "${GOOD_M/Contract measure/Break three}")"
[ "$CODE" != "201" ] && said | grep -qF "research_results_prompt_named" && ok "B3: with the route's check gone, research_results_prompt_named still refuses it ($CODE) — the second wall" || bad "B3: $CODE $(said | head -c 300)"
restore_route
expect "$PARSE" "$(body - "$SLUG")" 422 "B3 restored: the route refuses it first" "body.prompt_id is required"
# B4 — immutability: drop the trigger, the edit lands; re-harden, refused again.
q "DROP TRIGGER research_prompts_immutable ON research_prompts" > /dev/null
UPD="$(psql -X -d "$VERIFY_DB" -c "UPDATE research_prompts SET prompt_text = prompt_text || ' ', prompt_sha256 = encode(sha256(convert_to(prompt_text || ' ', 'UTF8')), 'hex') WHERE id = '$P1'" 2>&1 || true)"
printf '%s' "$UPD" | grep -qF "UPDATE 1" && ok "B4: without research_prompts_immutable, a prompt's text can be rewritten — the trigger is what holds it" || bad "B4: $UPD"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "  ...hardening.sql re-run" || bad "  ...re-harden failed"
UPD="$(psql -X -d "$VERIFY_DB" -c "UPDATE research_prompts SET prompt_text = prompt_text WHERE id = '$P1'" 2>&1 || true)"
printf '%s' "$UPD" | grep -qF "is final" && ok "B4 restored: UPDATE refused again" || bad "B4 restore: $UPD"
# B5 — the cut-off CHECK dropped (inside a transaction, rolled back): a new
# untracked row is written.
OUT="$(printf 'BEGIN;\n%s\n%s\nROLLBACK;\n' "ALTER TABLE research_results DROP CONSTRAINT research_results_untracked_predates_prompts;" "$UNTRACKED) VALUES ('$TEN', 'industry_measure', '$IND', 'B5', true, '{}'::jsonb, 'q', 'qe', 't', '$ACTOR', false);" \
  | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "INSERT 0 1" && ok "B5: without research_results_untracked_predates_prompts, a new untracked row is written — the CHECK is what refuses it (rolled back)" || bad "B5: $OUT"
# B6 — the parsed_at stamp dropped (rolled back): a backdated untracked row passes the CHECK.
OUT="$(printf 'BEGIN;\n%s\n%s\nROLLBACK;\n' "DROP TRIGGER research_results_touch ON research_results;" "$UNTRACKED, parsed_at) VALUES ('$TEN', 'industry_measure', '$IND', 'B6', true, '{}'::jsonb, 'q', 'qe', 't', '$ACTOR', false, '2026-01-01');" \
  | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
printf '%s' "$OUT" | grep -qF "INSERT 0 1" && ok "B6: without the parsed_at stamp, a row backdated to 2026-01-01 claims to predate prompts — the stamp is what makes the cut-off hold (rolled back)" || bad "B6: $OUT"
[ "$(q "SELECT count(*) FROM pg_constraint WHERE conname = 'research_results_untracked_predates_prompts'")$(q "SELECT count(*) FROM research_results WHERE field_name IN ('B5', 'B6')")" = "10" ] && ok "  ...after B5 and B6: the CHECK is in place, neither row exists" || bad "B5/B6 left state behind"
# B7 — Q4g: caveats removed from contract v4: a response without them is written.
python3 - "$CONTRACTS" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read()
i = s.index("      { key: 'caveats'"); j = s.index("either way.' },\n", i) + len("either way.' },\n")
open(p, 'w').write(s[:i] + s[j:])
PY
cmp -s "$W/contracts.orig" "$CONTRACTS" && bad "B7 did not change $CONTRACTS" || { stop_server; start_server; }
expect "$PARSE" "$(body "$P1" "$SLUG" "$(printf '%s' "$GOOD_M" | sed 's/,"caveats":\[\]//; s/Contract measure/Break seven/')")" 201 "B7: without caveats in the contract, a response without caveats is written — the field is what refuses it"
cp "$W/contracts.orig" "$CONTRACTS"; cmp -s "$W/contracts.orig" "$CONTRACTS" && ok "  ...$CONTRACTS restored byte-identical" || bad "  ...restore"
stop_server; start_server
expect "$PARSE" "$(body "$P1" "$SLUG" "$(printf '%s' "$GOOD_M" | sed 's/,"caveats":\[\]//; s/Contract measure/Break seven again/')")" 422 "B7 restored: refused again" "measures[0].caveats is missing"
# B8 — Q4g: the checker judging every row by the CURRENT contract: the v3 rows are named as failing.
python3 - "$CHECKER" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read()
a = "const contract = INDUSTRY_MEASURE_CONTRACTS[version];"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, "const contract = INDUSTRY_MEASURE_CONTRACTS[4];"))
PY
legacy | grep -qF "LEGACY: $RR_V3 (pending, v3): raw_response.caveats is missing" && ok "B8: judged by the current contract, the v3-era result is named as failing — judging by its own version is what keeps it valid" || bad "B8 not caught"
cp "$W/checker.orig" "$CHECKER"; cmp -s "$W/checker.orig" "$CHECKER" && ok "  ...$CHECKER restored byte-identical" || bad "  ...restore"
cmp -s "$W/route.orig" "$ROUTE" && ok "$ROUTE is byte-identical to before the run" || bad "$ROUTE differs"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
