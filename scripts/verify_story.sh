#!/usr/bin/env bash
#
# S7b (LVRF_PLAN §27, approved by Brad 24 Nov 2026; issuing and withdrawing the steward's acts only, and Compounding
# ruled, 25 Nov 2026) — the story of record.
#
#   ./scripts/verify_story.sh [out_dir]
#
#   1. A clone of the prod copy (taken after Brad's six Curia rows) migrated to 0055 and hardened: story_records and its
#      four triggers, 233 in all; every run and evidence row byte-identical; drift none at 0055.
#   2. Curia's draft, read against SQL: stage Reference, never Decision; the six real runs and none of the sixteen
#      exercises; each run's current errata, in lvrf_erratum_line's words; the 214 finding; the six current classed rows,
#      each with its class's ruled lines, basis inferred, verified; no commitment; every figure a ledger entry; the
#      client copy refused.
#   3. The page: the draft (DRAFT, no Print, the headline's errata beside its score at the same size and weight, no
#      result words, every ledger number with its entry, 390); issued through the page by the steward; the issued
#      story re-rendered twice byte-identical; the full hash and "Prepared by … with LVRF" on every printed page.
#   4. Issuing and withdrawing: the hash is the database's sha256 of what it prints; the act with its evidence heads; a
#      re-read byte-identical; another staff member refused (403); withdrawal the only change, once; "Newer evidence
#      exists" once a cited row is superseded, nothing else changing.
#   5. The database, as lvrf_app, rolled back: a wrong hash, a reference account issued as Decision, a client copy of a
#      reference example, a non-steward issuer, an edit, a second withdrawal, a delete, and a story with no act.
#   6. A fixture account (not a reference example): Decision ("Story of record: decision", no Results, no result
#      words); a verified actual opens Realization ("Success story", Results); a correction of the same row sealed in
#      a second run is still ONE measurement (Realization); a second engagement verified on its own row opens
#      Compounding.
#   Breaks: B1 the headline score printed without its adjacent errata; B2 "Results" (and its words) below Realization;
#   B3 a figure with no ledger entry; B4 a reference example computed as Decision (the database refuses issuing it,
#   its refusal recorded); B5 Print on a draft; B6 an erratum dropped; B7 a plan code on screen; B8 "Success story"
#   below Realization; B9 a corrected row counted as a second measurement.

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

VERIFY_DB=lvrf_verifystory
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3461; VITE_PORT=5461; CDP_PORT=9581
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_story.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
PAGE=client/src/pages/StoryPage.tsx; COMP=server/lib/story.ts
EDITED=("$PAGE" "$COMP")
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
ACT="${S:-}"
req() {  # METHOD PATH [BODY] — status in $CODE, body in $W/r.json, as $ACT (the steward unless set)
  local who="${ACT:-$S}"
  if [ "$1" = GET ]; then CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -H "x-actor-person-id: $who" "$BASE$2")"
  else CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $who" -d "$3" "$BASE$2")"; fi
}
rj() { node -e "const b=require('$W/r.json'); console.log($1)"; }
said() { node -e "try{const b=require('$W/r.json');console.log(b.message!==undefined?b.message:JSON.stringify(b))}catch{console.log('')}"; }
expect() {  # METHOD PATH BODY STATUS LABEL [SUBSTRING]
  req "$1" "$2" "$3"; local m; m="$(said)"
  if [ "$CODE" = "$4" ] && { [ -z "${6:-}" ] || printf '%s' "$m" | grep -qF -- "$6"; }; then ok "$5 -> $CODE"; else bad "$5 -> $CODE (expected $4${6:+ naming \"$6\"})  $(printf '%s' "$m" | head -c 300)"; fi
}
sqlrefused() {  # LABEL SQL NEEDLE [ACTOR]
  local out; out="$(printf "BEGIN;\nSET LOCAL ROLE lvrf_app;\nSELECT set_config('lvrf.actor_person_id', '%s', true);\n%s;\nSET CONSTRAINTS ALL IMMEDIATE;\nROLLBACK;\n" "${4:-$S}" "$2" | psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1 → refused by the database: \"$3\"" || bad "$1: not refused as expected: $(printf '%s' "$out" | tail -2)"
}
trig() { q "SELECT count(DISTINCT t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal"; }
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
  env VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT_DIR="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" TAG="$tag" "$@" node scripts/lib/story_walk.mjs "$s" > "$log" 2>&1 \
    || echo "FAIL  $tag: the walk crashed: $(tail -3 "$log" | tr '\n' ' ')" >> "$log"
}
tally() {
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$1"
  grep -q '^DONE' "$1" || bad "the walk did not finish: $(tail -3 "$1" | tr '\n' ' ')"
}
fails() { grep -c '^FAIL' "$1" || true; }
broke() {  # LABEL LOG NEEDLE — a break is caught when the walk FAILS on the named check
  grep -q "^FAIL .*$3" "$2" && ok "$1: caught — $(grep -m1 "^FAIL .*$3" "$2" | cut -c1-200)" || bad "$1: NOT caught ($(fails "$2") failures): $(grep -m1 '^FAIL' "$2" | cut -c1-200)"
}
draft() { req GET "/api/institutions/$1/story-draft${2:+?audience=$2}"; cp "$W/r.json" "$W/draft.json"; }
dj() { node -e "const b=require('$W/draft.json'); const p=b.payload; console.log($1)"; }
LOG="$W/main.log"; exec > >(tee "$LOG") 2>&1

step "1. Clone the prod copy, migrate to 0055, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
EV0="$(q "SELECT md5(string_agg(md5(e::text), '' ORDER BY id)) FROM evidence e")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated to 0055" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "233" ] && ok "233 triggers (section 39: +4)" || bad "triggers: $(trig)"
[ "$(q "SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'story_records'::regclass AND NOT tgisinternal")" = "story_records_act_present,story_records_audit,story_records_guard,story_records_no_delete" ] \
  && ok "story_records: guard, audit, no_delete, act_present" || bad "story_records triggers: $(q "SELECT string_agg(tgname, ',') FROM pg_trigger WHERE tgrelid = 'story_records'::regclass AND NOT tgisinternal")"
[ "$(q "SELECT has_table_privilege('lvrf_app','story_records','INSERT')::text || has_table_privilege('lvrf_app','story_records','UPDATE')::text || has_table_privilege('lvrf_app','story_records','DELETE')::text")" = "truetruefalse" ] \
  && ok "lvrf_app: insert and update on story_records, never delete" || bad "story_records grants"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 56 migrations, newest 0055_s7b_story_records" && ok "drift: none" || bad "drift: $DRIFT"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every run byte-identical" || bad "a run changed"
[ "$(q "SELECT md5(string_agg(md5(e::text), '' ORDER BY id)) FROM evidence e")" = "$EV0" ] && ok "every evidence row byte-identical" || bad "an evidence row changed"

step "2. Curia's draft, read against SQL"
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"; ACT="$S"
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"; TS="$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server && ok "API up on $PORT" || { bad "server: $(tail -5 "$W/server.log")"; exit 1; }
C="$(q "SELECT id FROM institutions WHERE name = 'Curia' AND deleted_at IS NULL AND superseded_by_id IS NULL")"
REAL="lvrf_system_exercise_mark('value_runs', r.id) IS NULL"
RUNS_SQL="$(q "SELECT string_agg(r.id::text, ',' ORDER BY r.id) FROM value_runs r JOIN engagements g ON g.id = r.engagement_id WHERE g.institution_id = '$C' AND r.locked_at IS NOT NULL AND r.deleted_at IS NULL AND $REAL")"
EXER="$(q "SELECT count(*) FROM value_runs r JOIN engagements g ON g.id = r.engagement_id WHERE g.institution_id = '$C' AND NOT ($REAL)")"
draft "$C"
[ "$CODE" = 200 ] && ok "Curia's draft composes -> 200" || bad "draft -> $CODE $(said)"
[ "$(dj 'p.stage')" = reference ] && ok "stage: reference (its marker), never Decision" || bad "stage: $(dj 'p.stage')"
[ "$(dj 'p.title')" = "Story of record" ] && ok "title: \"Story of record\"" || bad "title: $(dj 'p.title')"
[ "$(dj 'p.engagements.flatMap(g=>g.runs.map(r=>r.id)).sort().join(",")')" = "$RUNS_SQL" ] \
  && ok "the runs read are Curia's $(echo "$RUNS_SQL" | tr ',' '\n' | wc -l | tr -d ' ') real locked runs, none of its $EXER system exercises" || bad "runs differ from SQL"
ERR_SQL="$(q "SELECT string_agg(x.id::text || '=' || regexp_replace(lvrf_erratum_line(x.id), '^erratum: ', ''), '|' ORDER BY x.id) FROM run_errata x WHERE x.value_run_id IN (SELECT unnest(string_to_array('$RUNS_SQL', ','))::uuid) AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id)")"
ERR_API="$(dj 'p.engagements.flatMap(g=>g.runs.flatMap(r=>r.errata.map(x=>x.id+"="+x.line))).sort().join("|")')"
[ "$ERR_API" = "$ERR_SQL" ] && ok "every current erratum on those runs ($(echo "$ERR_SQL" | tr '|' '\n' | wc -l | tr -d ' ')), each in lvrf_erratum_line's words; no superseded one" || bad "errata differ from SQL"
[ "$(dj 'p.findings.map(f=>f.line).join("|")')" = "the baseline, 214 days, has no source on record" ] && ok "the finding: \"the baseline, 214 days, has no source on record\"" || bad "findings: $(dj 'p.findings.map(f=>f.line).join("|")')"
PUB_SQL="$(q "SELECT string_agg(id::text || ':' || published_figure_class || ':' || lvrf_evidence_basis(e) || ':' || source_verified::text, ',' ORDER BY id) FROM evidence e WHERE institution_id = '$C' AND deleted_at IS NULL AND superseded_by_id IS NULL AND published_figure_class IS NOT NULL")"
[ "$(dj 'p.published.map(e=>e.id+":"+e.class+":"+e.basis+":"+(e.open_state==="verified")).sort().join(",")')" = "$PUB_SQL" ] \
  && ok "the published rows: Curia's six current classed rows, each with its class, basis inferred, verified" || bad "published rows differ: $(dj 'p.published.map(e=>e.id.slice(0,8)+":"+e.class).join(",")')"
LINES="$(node -e "
const src=require('fs').readFileSync('server/lib/figureClass.ts','utf8');
const m=[...src.matchAll(/value: '([a-z_]+)', label: '[^']+',\s*can: (['\"])(.*?)\2,\s*cannot: (['\"])(.*?)\4/gs)].map(x=>[x[1],x[3],x[5]]);
const p=require('$W/draft.json').payload; console.log(p.published.every(e=>{const r=m.find(x=>x[0]===e.class);return r&&r[1]===e.can&&r[2]===e.cannot}) && m.length===5)")"
[ "$LINES" = true ] && ok "each row's can and cannot lines are the ruled table's, word for word" || bad "the class lines differ from server/lib/figureClass.ts"
[ "$(dj 'p.engagements.every(g=>g.commitment===null)')" = true ] && ok "no commitment carried for a reference example (D3)" || bad "a commitment is carried"
[ "$(dj 'Object.values(p.refs).every(n=>p.ledger.some(l=>l.n===n)) && p.ledger.length===new Set(p.ledger.map(l=>l.n)).size')" = true ] && ok "every ledger reference has its entry ($(dj 'p.ledger.length') entries)" || bad "a ledger reference without its entry"
[ "$(dj 'p.engagements.every(g=>g.runs.every(r=>p.refs["run:"+r.id]!==undefined && r.errata.every(x=>p.refs["erratum:"+x.group]!==undefined))) && p.findings.every(f=>p.refs["finding:"+f.id]!==undefined) && p.published.every(e=>p.refs["evidence:"+e.id]!==undefined)')" = true ] \
  && ok "every figure the story prints is a ledger entry: each score, erratum, finding and published row" || bad "a figure without a ledger entry"
SC_SQL="$(q "SELECT string_agg(r.id::text || '=' || trim_scale(r.confidence_score)::text || '|' || r.payload_hash, ',' ORDER BY r.id) FROM value_runs r WHERE r.id IN (SELECT unnest(string_to_array('$RUNS_SQL', ','))::uuid)")"
[ "$(dj 'p.engagements.flatMap(g=>g.runs.map(r=>r.id+"="+r.score+"|"+r.payload_hash)).sort().join(",")')" = "$SC_SQL" ] && ok "each sealed score and hash as sealed, never recomputed" || bad "scores differ from SQL"
draft "$C" client
[ "$CODE" = 409 ] && grep -q "no client copy" "$W/r.json" && ok "the client copy of a reference example is refused (D4) -> 409" || bad "client copy -> $CODE $(said)"

step "3. The page: the draft, issued through the page, the issued story"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
R13="$(q "SELECT r.id FROM value_runs r JOIN engagements g ON g.id = r.engagement_id WHERE g.institution_id = '$C' AND r.payload_hash LIKE 'b15dd9b7209e%'")"
HE="$(q "SELECT json_agg(id) FROM run_errata x WHERE value_run_id = '$R13' AND NOT EXISTS (SELECT 1 FROM run_errata s WHERE s.supersedes_id = x.id)")"
CURIA=(INST="$C" STAGE=reference TITLE="Story of record" HEADLINE_ERRATA="$HE")
for w in 1280 390; do walk draft,refused "draft $w" "$W/d$w.log" WIDTH=$w "${CURIA[@]}"; tally "$W/d$w.log"; done
N0="$(q "SELECT count(*) FROM story_records")"
walk issue "issue" "$W/issue.log" "${CURIA[@]}"; tally "$W/issue.log"
ST="$(grep '^ISSUED' "$W/issue.log" | cut -d' ' -f2)"
[ "$(q "SELECT count(*) FROM story_records")" = "$((N0 + 1))" ] && ok "one story record written by issuing" || bad "story records: $(q "SELECT count(*) FROM story_records")"
SH="$(q "SELECT payload_hash FROM story_records WHERE id = '$ST'")"
for w in 1280 390; do walk issued "issued $w" "$W/i$w.log" WIDTH=$w STORY="$ST" HASH="$SH" "${CURIA[@]}"; tally "$W/i$w.log"; done
walk html "render 1" "$W/h1.log" STORY="$ST"; walk html "render 2" "$W/h2.log" STORY="$ST"
H1="$(grep '^HTML' "$W/h1.log" | cut -d' ' -f2)"; H2="$(grep '^HTML' "$W/h2.log" | cut -d' ' -f2)"
[ -n "$H1" ] && [ "$H1" = "$H2" ] && ok "the issued story re-renders byte-identical (its body's markup, md5 $H1)" || bad "re-render differs: $H1 vs $H2"

step "4. Issuing and withdrawing"
[ "$(q "SELECT (payload_hash = encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'))::text || stage || audience FROM story_records WHERE id = '$ST'")" = "truereferenceinternal" ] \
  && ok "the hash is sha256 of what the story prints; reference, internal" || bad "the seal"
[ "$(q "SELECT act || ':' || cardinality(evidence_ids) || ':' || (actor_person_id = '$S')::text FROM governance_acts WHERE subject_table = 'story_records' AND subject_id = '$ST'")" = "issue:6:true" ] \
  && ok "the steward's 'issue' act, naming the six evidence heads it sealed" || bad "the act: $(q "SELECT act || ':' || cardinality(evidence_ids) FROM governance_acts WHERE subject_id = '$ST'")"
req GET "/api/stories/$ST"; cp "$W/r.json" "$W/s1.json"; req GET "/api/stories/$ST"; cmp -s "$W/s1.json" "$W/r.json" && ok "a re-read is byte-identical" || bad "a re-read differs"
OTHER="$(q "INSERT INTO persons (tenant_id, full_name, email, simulated) VALUES ('$TEN', 'K7b staff member (invented)', 'staff.$TS@k7b.example', false) RETURNING id" | head -1)"
ACT="$OTHER"
expect POST "/api/institutions/$C/stories" '{"audience":"internal"}' 403 "another staff member issuing a story" "steward's act"
expect POST "/api/stories/$ST/withdraw" '{"reason":"Verification: not the steward."}' 403 "another staff member withdrawing it" "steward's act"
ACT="$S"
expect POST "/api/stories/$ST/withdraw" '{"reason":"short"}' 422 "a withdrawal without a 12-character reason" "at least 12 characters"
P0="$(q "SELECT md5(payload::text) || payload_hash FROM story_records WHERE id = '$ST'")"
expect POST "/api/stories/$ST/withdraw" '{"reason":"Verification: withdrawn, to prove it is the only change."}' 200 "the steward withdraws it"
[ "$(q "SELECT md5(payload::text) || payload_hash FROM story_records WHERE id = '$ST'")" = "$P0" ] && ok "withdrawal changes nothing it printed" || bad "the payload changed on withdrawal"
[ "$(q "SELECT count(*) FROM governance_acts WHERE subject_id = '$ST' AND act = 'withdraw'")" = 1 ] && ok "the 'withdraw' act" || bad "no withdraw act"
expect POST "/api/stories/$ST/withdraw" '{"reason":"Verification: a second withdrawal."}' 409 "a second withdrawal" "stays on the record"
req GET "/api/stories/$ST"; [ "$(rj 'b.withdrawn && b.withdrawn.reason')" = "Verification: withdrawn, to prove it is the only change." ] && ok "read back withdrawn, with its reason" || bad "withdrawn read: $(said)"
expect POST "/api/institutions/$C/stories" '{"audience":"internal"}' 201 "a second issue, for the newer-evidence check"; ST2="$(rj b.id)"
req GET "/api/stories/$ST2"; [ "$(rj 'b.newer_evidence')" = null ] && ok "no newer evidence while its rows are current" || bad "newer evidence early"
ROW="$(q "SELECT id FROM evidence WHERE institution_id = '$C' AND superseded_by_id IS NULL AND deleted_at IS NULL AND published_figure_class = 'activity_count' ORDER BY created_at LIMIT 1")"
SUP="$(node -e "const [kind,summary,prov,ref,q,how]=process.argv.slice(1);console.log(JSON.stringify({about:'account',kind,published_figure_class:'activity_count',summary:summary+' (verification restatement)',provenance:prov,source_reference:ref,evidence_form:'quote',quote_text:q,how_read:how,reason:'Verification: a newer head, so the story says so.'}))" \
  "$(q "SELECT kind FROM evidence WHERE id = '$ROW'")" "$(q "SELECT summary FROM evidence WHERE id = '$ROW'")" "$(q "SELECT provenance FROM evidence WHERE id = '$ROW'")" "$(q "SELECT source_reference FROM evidence WHERE id = '$ROW'")" "$(q "SELECT quote_text FROM evidence WHERE id = '$ROW'")" "$(q "SELECT how_read FROM evidence WHERE id = '$ROW'")")"
P2="$(q "SELECT md5(payload::text) FROM story_records WHERE id = '$ST2'")"
expect POST "/api/evidence/$ROW/supersede" "$SUP" 201 "  ...one of its cited rows superseded"
req GET "/api/stories/$ST2"; [ "$(rj 'b.newer_evidence && b.newer_evidence.note')" = "Newer evidence exists: re-issue to include it." ] && ok "\"Newer evidence exists: re-issue to include it.\"" || bad "newer evidence: $(said)"
[ "$(q "SELECT md5(payload::text) FROM story_records WHERE id = '$ST2'")" = "$P2" ] && ok "...and the issued story is unchanged" || bad "the story changed"

step "5. The database, as lvrf_app (rolled back)"
PAY="$(q "SELECT payload::text FROM story_records WHERE id = '$ST2'")"
INS() { printf "INSERT INTO story_records (tenant_id, institution_id, audience, stage, payload, payload_hash, issued_by_person_id) VALUES ('%s', '%s', '%s', '%s', \$p\$%s\$p\$::jsonb, %s, '%s')" "$TEN" "$C" "$1" "$2" "$3" "$4" "$5"; }
HX="encode(sha256(convert_to(\$p\$$PAY\$p\$::jsonb::text, 'UTF8')), 'hex')"
sqlrefused "a story whose hash is not what it prints" "$(INS internal reference "$PAY" "repeat('a', 64)" "$S")" "The story's hash is not the hash of what it prints."
PAYD="$(node -e "const p=JSON.parse(process.argv[1]);p.stage='decision';console.log(JSON.stringify(p))" "$PAY")"
sqlrefused "a reference example issued as Decision" "$(INS internal decision "$PAYD" "encode(sha256(convert_to(\$p\$$PAYD\$p\$::jsonb::text, 'UTF8')), 'hex')" "$S")" "This account is a reference example: its story is a reference story"
PAYC="$(node -e "const p=JSON.parse(process.argv[1]);p.audience='client';console.log(JSON.stringify(p))" "$PAY")"
sqlrefused "a client copy of a reference example" "$(INS client reference "$PAYC" "encode(sha256(convert_to(\$p\$$PAYC\$p\$::jsonb::text, 'UTF8')), 'hex')" "$S")" "story_records_reference_internal"
sqlrefused "a story issued by someone other than the steward" "$(INS internal reference "$PAY" "$HX" "$OTHER")" "Only the steward issues a story of record" "$OTHER"
sqlrefused "a story issued with no act recorded" "$(INS internal reference "$PAY" "$HX" "$S")" "a story issued with no governance act recorded"
sqlrefused "an issued story edited" "UPDATE story_records SET audience = 'internal', payload = payload || '{\"title\":\"Edited\"}'::jsonb WHERE id = '$ST2'" "A story is sealed when it is issued; it is withdrawn, never edited."
sqlrefused "a withdrawn story withdrawn again" "UPDATE story_records SET withdrawal_reason = 'Verification: again, and again.' WHERE id = '$ST'" "a withdrawn story stays on the record as it is"
sqlrefused "a withdrawal by someone other than the steward" "UPDATE story_records SET withdrawn_at = now(), withdrawn_by_person_id = '$OTHER', withdrawal_reason = 'Verification: not the steward.' WHERE id = '$ST2'" "Only the steward withdraws a story of record" "$OTHER"
sqlrefused "a story deleted" "DELETE FROM story_records WHERE id = '$ST2'" "it is withdrawn, never deleted"

step "6. A fixture account: Decision, Realization, one measurement corrected, Compounding"
expect POST /api/account-inputs "$(J institution "$(J name "Corbel Freight (S7b fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for S7b.')" persons "[$(J full_name 'K7b owner (invented)' email "owner.$TS@k7b.example" title Owner)]")" 201 "a fixture account"
INST="$(rj b.institution_id)"; OWNER="$(rj b.person_ids[0])"
make_customer_side "$INST" "$OWNER"
expect POST "/api/institutions/$INST/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K7b capability' owner_person_id "$OWNER" is_primary false basis 'Verification: EHS solution.')" 201 "  ...an offering, with its capability"
d() { q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + ($1), 'YYYY-MM-DD')"; }
DM="$(d -30)"; DV="$(d -1)"
outcome() {  # NAME -> stdout: outcome id, engagement id
  req POST "/api/institutions/$INST/value-outcomes" "$(J engagement_name "K7b engagement $1" engagement_owner_person_id "$OWNER" capability_name 'K7b capability' metric "$(J name "K7b TRIR $1" unit 'incidents per 200,000 hours' direction decrease source_system 'verification system of record' owner_person_id "$OWNER")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)"
  [ "$CODE" = "201" ] && echo "$(rj b.value_outcome_id) $(rj b.engagement_id)" || { echo "ERR $CODE $(said)"; return 1; }
}
read -r OA EA <<< "$(outcome A)"; read -r OB EB <<< "$(outcome B)"
case "$OA$OB" in *ERR*) bad "outcomes: $OA $OB"; exit 1 ;; esac
CB() { J target_value 1.0 committed_by_person_id "$OWNER" committed_at "${DM}T12:00:00Z" promised_measured_on "$(d 200)" commitment_note 'Verification: committed (S7b fixture).' attribution_method contribution_only measure_class capability_performance; }
EVA() { J kind system_export provenance "Fixture source for: K7b actual $1 (not a source)" summary "K7b TRIR extract $1 (fixture)" supports actual confidence medium source_verified true ai_sourced false simulated false evidence_form quote quote_text "Verification fixture quote $1, not a source." how_read 'Verification fixture: read from the fixture quote as written.'; }
VB() { J verified_by_person_id "$OWNER" verified_at "${DV}T13:00:00Z" attestation_note 'Verification: checked against the fixture system of record.'; }
seal() { state_hypothesis "$1" > /dev/null 2>&1 || true; expect POST "/api/engagements/$1/produce-run" "$(J banner_title 'OUTSIDE-IN HYPOTHESIS' note "$2" source_fixture s7b)" 201 "  ...produced: $2"; local run; run="$(rj b.value_run_id)"; expect POST "/api/value-runs/$run/lock" "$(J lock_reason 'Verification: sealed.')" 200 "  ...locked"; }
stage_is() {  # LABEL STAGE TITLE
  draft "$INST"
  [ "$(dj 'p.stage')" = "$2" ] && [ "$(dj 'p.title')" = "$3" ] && ok "$1: stage $2, \"$3\"" || bad "$1: stage $(dj 'p.stage'), \"$(dj 'p.title')\" (expected $2, \"$3\")"
}
expect POST "/api/value-outcomes/$OA/commit" "$(CB)" 201 "  ...A committed"
seal "$EA" "Verification: A committed"
stage_is "a locked run, no verified actual" decision "Story of record: decision"
walk draft "decision" "$W/dec.log" INST="$INST" STAGE=decision TITLE="Story of record: decision"; tally "$W/dec.log"
expect POST "/api/value-outcomes/$OA/evidence" "$(EVA a)" 201 "  ...A's actual evidence, row a"; RA="$(rj b.evidence_id)"
expect POST "/api/value-outcomes/$OA/measure" "$(J actual_value 1.1 actual_measured_at "${DV}T12:00:00Z")" 200 "  ...A measured"
expect POST "/api/value-outcomes/$OA/verify" "$(VB)" 200 "  ...A verified by a customer-side person"
seal "$EA" "Verification: A verified"
stage_is "a verified actual in a sealed run" realization "Success story"
walk draft "realization" "$W/rea.log" INST="$INST" STAGE=realization TITLE="Success story"; tally "$W/rea.log"
RES="$(dj 'p.engagements.filter(g=>g.result).length')"
[ "$RES" = 1 ] && ok "the result is carried for A's engagement" || bad "results: $RES"
SUPA="$(J about account kind system_export summary 'K7b TRIR extract a, corrected (fixture)' provenance 'Fixture source for: K7b actual a, corrected (not a source)' evidence_form quote quote_text 'Verification fixture quote a, corrected, not a source.' how_read 'Verification fixture: read from the corrected fixture quote as written.' reason 'Verification: the same measurement, corrected.')"
expect POST "/api/evidence/$RA/supersede" "$SUPA" 201 "  ...row a corrected by supersession (row a')"; RA2="$(rj b.evidence_id)"
seal "$EA" "Verification: A again, on the corrected row"
LAST="$(q "SELECT r.payload FROM value_runs r WHERE r.engagement_id = '$EA' ORDER BY r.run_number DESC LIMIT 1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);console.log(p.realization+':'+(p.evidence||[]).filter(e=>e.supports==='actual').map(e=>e.evidence_id).join(','))})")"
[ "$LAST" = "verified:$RA2" ] && ok "the second verified run seals the corrected row a' as its actual" || bad "the second run seals: $LAST (expected verified:$RA2)"
stage_is "a row and its correction in two verified runs: one measurement" realization "Success story"
expect POST "/api/value-outcomes/$OB/commit" "$(CB)" 201 "  ...B committed"
expect POST "/api/value-outcomes/$OB/evidence" "$(EVA b)" 201 "  ...B's actual evidence, its own row b"
expect POST "/api/value-outcomes/$OB/measure" "$(J actual_value 1.05 actual_measured_at "${DV}T12:00:00Z")" 200 "  ...B measured"
expect POST "/api/value-outcomes/$OB/verify" "$(VB)" 200 "  ...B verified"
seal "$EB" "Verification: B verified"
stage_is "a second verified run on a separate measurement" compounding "Success story"
walk draft "compounding" "$W/com.log" INST="$INST" STAGE=compounding TITLE="Success story"; tally "$W/com.log"
grep -q 'results-heading' "$PAGE" && ok "\"Results\" renders only at Realization and above (the walks above: absent at Decision)" || bad "no Results section in the page"

step "7. Breaks"
CURIA_HE=(INST="$C" STAGE=reference TITLE="Story of record" HEADLINE_ERRATA="$HE")
echo "  B1: the headline score printed without its adjacent errata"
edit "$PAGE" "      {r.errata.map((x) => (" "      {(testid === 'headline-score' ? [] : r.errata).map((x) => ("
sleep 3; walk draft "B1" "$W/b1.log" "${CURIA_HE[@]}"; broke "B1" "$W/b1.log" "errata prints beside its score"; restore "$PAGE"
echo "  B2: \"Results\" below Realization"
edit "$PAGE" "      {reachedResult && (" "      {(reachedResult || true) && ("
sleep 3; walk draft "B2" "$W/b2.log" "${CURIA_HE[@]}"; broke "B2" "$W/b2.log" '"Results" does not render'; restore "$PAGE"
echo "  B3: a figure with no ledger entry"
edit "$COMP" "  for (const f of findings) add(" "  for (const f of findings.slice(1)) add("
restart_server; walk draft "B3" "$W/b3.log" "${CURIA_HE[@]}"; broke "B3" "$W/b3.log" "ledger number"; restore "$COMP"; restart_server
echo "  B4: a reference example computed as Decision"
edit "$COMP" "  if (marker) stage = 'reference';" "  if (marker && false) stage = 'reference';"
restart_server; draft "$C"; [ "$(dj 'p.stage')" = decision ] && ok "B4: caught by the draft check — stage $(dj 'p.stage'), not reference" || bad "B4: stage $(dj 'p.stage')"
RF0="$(q "SELECT count(*) FROM refusals WHERE message LIKE '%its story is a reference story%'")"
expect POST "/api/institutions/$C/stories" '{"audience":"internal"}' 422 "B4: ...and issuing it is refused by the database" "reference story"
[ "$(q "SELECT count(*) FROM refusals WHERE message LIKE '%its story is a reference story%'")" = "$((RF0 + 1))" ] && ok "B4: ...the database's refusal recorded" || bad "B4: no refusal recorded"
restore "$COMP"; restart_server
echo "  B5: Print on a draft"
edit "$PAGE" '                {issued && <p className="m-0 mb-2' '                <button type="button" data-testid="print-story">Print</button>{issued && <p className="m-0 mb-2'
sleep 3; walk draft "B5" "$W/b5.log" "${CURIA_HE[@]}"; broke "B5" "$W/b5.log" "no Print control"; restore "$PAGE"
echo "  B6: an erratum dropped"
edit "$COMP" "      WHERE x.value_run_id = ANY(\$1::uuid[]) AND NOT EXISTS" "      WHERE x.value_run_id = ANY(\$1::uuid[]) AND x.kind::text <> 'misstated_finding' AND NOT EXISTS"
restart_server; draft "$C"
[ "$(dj 'p.engagements.flatMap(g=>g.runs.flatMap(r=>r.errata.map(x=>x.id+"="+x.line))).sort().join("|")')" != "$ERR_SQL" ] && ok "B6: caught by the SQL comparison — the errata no longer match the record" || bad "B6: not caught"
walk draft "B6" "$W/b6.log" "${CURIA_HE[@]}"; broke "B6" "$W/b6.log" "errata prints beside its score"; restore "$COMP"; restart_server
echo "  B7: a plan code on screen"
edit "$PAGE" "the story of record</span>" "the story of record §27</span>"
node scripts/check_plain_words.mjs > "$W/b7.log" 2>&1 && bad "B7: not caught by check_plain_words" || ok "B7: caught — $(grep -m1 -i 'StoryPage' "$W/b7.log" | cut -c1-160)"
restore "$PAGE"; node scripts/check_plain_words.mjs > /dev/null 2>&1 && ok "  ...check_plain_words passes again" || bad "  ...check_plain_words fails after the restore"
echo "  B8: \"Success story\" below Realization"
edit "$COMP" "  if (stage === 'decision') return 'Story of record: decision';" "  if (stage === 'decision') return 'Success story';"
restart_server
expect POST /api/account-inputs "$(J institution "$(J name "Halden Works (S7b fixture, invented)" industry_slug manufacturing classification_note 'Verification: classified for S7b B8.')" persons "[$(J full_name 'K7b8 owner (invented)' email "owner8.$TS@k7b.example" title Owner)]")" 201 "  ...a Decision account for B8"
INST8="$(rj b.institution_id)"; OWNER8="$(rj b.person_ids[0])"; make_customer_side "$INST8" "$OWNER8"
expect POST "/api/institutions/$INST8/offerings" "$(J offering_key skillsoft_compliance_suite capability_name 'K7b8 capability' owner_person_id "$OWNER8" is_primary false basis 'Verification: EHS solution.')" 201 "  ...its offering"
req POST "/api/institutions/$INST8/value-outcomes" "$(J engagement_name "K7b8 engagement" engagement_owner_person_id "$OWNER8" capability_name 'K7b8 capability' metric "$(J name "K7b8 TRIR" unit 'incidents per 200,000 hours' direction decrease source_system 'verification system of record' owner_person_id "$OWNER8")" baseline_value 1.4 baseline_measured_at 2025-09-30T00:00:00Z)"
E8="$(rj b.engagement_id)"; seal "$E8" "Verification: B8 Decision"
walk draft "B8" "$W/b8.log" INST="$INST8" STAGE=decision TITLE="Story of record: decision"; broke "B8" "$W/b8.log" 'no "Success story"'
restore "$COMP"; restart_server
echo "  B9: a corrected row counted as a second measurement (read on engagement A alone: a row and its correction)"
edit "$COMP" ".map((e) => rootOf.get(e.evidence_id as string) ?? (e.evidence_id as string))));" ".map((e) => (e.evidence_id as string))));"
restart_server
STAGE_A="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/lib/story_stage.mts "$TEN" "$INST" "$EA" 2>&1 | tail -1)"
[ "$STAGE_A" = compounding ] && ok "B9: caught — with the condition removed, A's row and its correction read as two measurements (compounding)" || bad "B9: not caught — A alone reads $STAGE_A"
restore "$COMP"; restart_server
STAGE_A2="$(DATABASE_URL="$VERIFY_URL" npx tsx scripts/lib/story_stage.mts "$TEN" "$INST" "$EA" 2>&1 | tail -1)"
[ "$STAGE_A2" = realization ] && ok "  ...restored: A's row and its correction are one measurement (realization)" || bad "  ...restored, A alone reads $STAGE_A2"

step "8. The code restored, and the page passes again"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to the start" || bad "$f differs"; done
walk draft "after the breaks" "$W/after.log" "${CURIA_HE[@]}"; [ "$(fails "$W/after.log")" = 0 ] && ok "Curia's draft passes again after the breaks" || bad "after the breaks: $(grep -m1 '^FAIL' "$W/after.log")"
