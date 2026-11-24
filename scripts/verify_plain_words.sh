#!/usr/bin/env bash
#
# §28 (Brad's rulings, 24 Nov 2026, D1-D3) — plain words on screen: no "§", plan document name or slice/decision code
# in any string a page can show.
#
#   ./scripts/verify_plain_words.sh [out_dir]
#
#   1. scripts/check_plain_words.mjs: 0 hits over client strings, server strings and database messages; then each break
#      caught, the file restored byte-identical: B1 a "§" in a client string; B2 "(C3)" in an ask; B3 "(D2)" back in a
#      database message; B4 "tenant" in JSX text with an entity, B5 "tenant" in a client string (§29, Brad, 24 Nov 2026:
#      "tenant" is refused in client strings).
#   2. The words on the page, on a clone of the prod copy: card 01d's two sentences on Curia's commitment made before
#      attribution and promised dates were recorded; the value case's attribution line; "(UTC)" beside printed-on dates.
#   3. The rendered sweep: every page at 1280, its visible text scanned. A hit in app text fails; a hit in the record (a
#      person's own words, sealed text) is listed, never failed: the record is never rewritten (D1).

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
. scripts/lib/hypothesis.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifyplain
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3391; VITE_PORT=5391; CDP_PORT=9501
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_plain.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
SPINE=client/src/components/OutcomeSpine.tsx; GAPR=server/routes/gapRegister.ts; HARD=db/hardening.sql
EDITED=("$SPINE" "$GAPR" "$HARD")
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
  env VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT_DIR="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" TAG="$tag" "$@" node scripts/lib/plain_words_page.mjs "$s" > "$log" 2>&1 \
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
d() { q "SELECT to_char((now() AT TIME ZONE 'UTC')::date + ($1), 'YYYY-MM-DD')"; }  # a UTC date, N days from today
LOG="$W/main.log"; exec > >(tee "$LOG") 2>&1

step "1. Typecheck; the static check and its breaks"
(cd client && npx tsc -b) > "$W/tsc.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc.log")"
npx tsc --noEmit -p tsconfig.json > "$W/tsc_s.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc_s.log")"
node scripts/check_plain_words.mjs > "$W/plain.log" 2>&1 && ok "check_plain_words: $(tail -1 "$W/plain.log")" || bad "check_plain_words: $(grep -m5 HIT "$W/plain.log")"
plainbreak() {  # FILE OLD NEW LABEL WANT_PATH
  edit "$1" "$2" "$3"
  node scripts/check_plain_words.mjs > "$W/plainb.log" 2>&1 && bad "$4: not caught" || { grep -q "^HIT  $5" "$W/plainb.log" && ok "$4 → caught: $(grep -m1 "^HIT  $5" "$W/plainb.log" | cut -c1-110)" || bad "$4: caught elsewhere: $(grep -m2 HIT "$W/plainb.log")"; }
  restore "$1"
}
plainbreak "$SPINE" "'no promised date on record (committed before promised dates were recorded, 24 Nov 2026)'" "'no promised date on record (committed before §26)'" "B1: a \"§\" in a client string (card 01d)" "client/src/components/OutcomeSpine.tsx"
plainbreak "$GAPR" "The committer of record must be customer-side: a person of the account whose customer-side role is named from a source.';" "The committer of record must be customer-side: a person of the account whose customer-side role is named from a source (C3).';" "B2: \"(C3)\" in an ask" "server/routes/gapRegister.ts"
plainbreak "$HARD" "published, and not simulated.'" "published, and not simulated (D2).'" "B3: \"(D2)\" back in a database message" "db/hardening.sql"
# §29 (Brad, 24 Nov 2026): "tenant" is refused in client strings; B4 also proves JSX text with an entity is read.
plainbreak "$SPINE" "No one can commit to or verify your own company&apos;s outcomes yet" "No one can commit to or verify the tenant&apos;s own outcomes yet" "B4: \"tenant\" in JSX text with an entity (the tenant page's sentence)" "client/src/components/OutcomeSpine.tsx"
plainbreak "$SPINE" "Withdrawing is the steward's act — \${actor?.steward_name ?? \"the steward\"}'s alone." "Withdrawing is the steward's act — \${actor?.steward_name ?? \"the tenant's steward\"}'s alone." "B5: \"tenant\" in a client string (the steward fallback)" "client/src/components/OutcomeSpine.tsx"
node scripts/check_plain_words.mjs > /dev/null 2>&1 && ok "  ...clean again after the breaks" || bad "  ...not clean after the breaks"

step "2. Clone the prod copy, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated (no migration in §26)" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 \
  && ok "hardened (0 ERROR lines)" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }
[ "$(trig)" = "229" ] && ok "229 triggers (§26 adds none; §32 section 38: +2)" || bad "triggers: $(trig)"
DRIFT="$(DATABASE_URL="$VERIFY_URL" node scripts/check_schema_drift.mjs 2>&1 | tail -1)"
printf '%s' "$DRIFT" | grep -q "schema drift: none (journal 54 migrations, newest 0053_s32_person_email" && ok "drift: none ($DRIFT)" || bad "drift: $DRIFT"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every run byte-identical after hardening" || bad "a run changed"
[ "$(q "SELECT count(*) FROM value_outcomes WHERE promised_measured_at IS NOT NULL")" = "0" ] && ok "no outcome on the copy carries a promised date (none backfilled)" || bad "a promised date on the copy"
CURIA_O="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE 'e3fb0061%'")"; CURIA="$(q "SELECT institution_id FROM value_outcomes WHERE id = '$CURIA_O'")"
[ "$(q "SELECT (committed_at IS NOT NULL) || '|' || (promised_measured_at IS NULL) FROM value_outcomes WHERE id = '$CURIA_O'")" = "true|true" ] \
  && ok "Curia's commitment e3fb0061 (30 Aug 2026, before §26) stands with no promised date (D2)" || bad "Curia's commitment: $(q "SELECT committed_at, promised_measured_at FROM value_outcomes WHERE id = '$CURIA_O'")"

step "3. The session and the server"
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
CURIA_O="$(q "SELECT id FROM value_outcomes WHERE id::text LIKE 'e3fb0061%'")"; CURIA="$(q "SELECT institution_id FROM value_outcomes WHERE id = '$CURIA_O'")"

step "4. The words on the page"
walk words p "$W/words.log" CURIA="$CURIA" CURIA_O="$CURIA_O" RUN13="$(q "SELECT r.id FROM value_runs r JOIN engagements g ON g.id = r.engagement_id WHERE g.institution_id = '$CURIA' AND r.run_number = 13")"; tally "$W/words.log"

grep -qF "'Attribution: not stated (committed before attribution was recorded, 6 Nov 2026).'" client/src/pages/ValueCasePage.tsx && ! grep -q "committed before B4" client/src/pages/ValueCasePage.tsx \
  && ok "the value case's attribution line for a commitment made before attribution was recorded reads the D2 words (in the source: no sealed run on the copy prints it)" || bad "the value case's attribution line"

step "5. The rendered sweep: every page at 1280"
{
  echo /; echo /book; echo /runs; echo /packs; echo /policies
  q "SELECT '/accounts/' || id FROM institutions WHERE tenant_id = '$TEN' AND deleted_at IS NULL"
  q "SELECT '/accounts/' || id || '/pov' FROM institutions WHERE tenant_id = '$TEN' AND deleted_at IS NULL"
  q "SELECT '/packs/' || slug FROM industries"
  q "SELECT '/engagements/' || e.id || '/snapshots' FROM engagements e JOIN institutions i ON i.id = e.institution_id WHERE i.tenant_id = '$TEN'"
  q "SELECT '/runs/' || r.id FROM value_runs r WHERE lvrf_system_exercise_mark('value_runs', r.id) IS NULL"
  q "SELECT '/runs/' || r.id || '/case' FROM value_runs r WHERE lvrf_system_exercise_mark('value_runs', r.id) IS NULL AND r.locked_at IS NOT NULL"
  q "SELECT '/lineage/value_outcomes/' || id FROM value_outcomes WHERE deleted_at IS NULL"
} > "$W/paths.txt"
ok "$(wc -l < "$W/paths.txt" | tr -d ' ') pages to read"
env VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" S_EMAIL="$S_EMAIL" PW="$PW" PATHS="$W/paths.txt" node scripts/lib/plain_words_sweep.mjs > "$W/sweep.log" 2>&1 || echo "FAIL  sweep: crashed: $(tail -3 "$W/sweep.log" | tr '\n' ' ')" >> "$W/sweep.log"
grep -E '^(PASS|FAIL|NOTE)' "$W/sweep.log" | while IFS= read -r l; do echo "$l"; done
PASS=$((PASS + $(grep -c '^PASS' "$W/sweep.log" || true))); FAIL=$((FAIL + $(grep -c '^FAIL' "$W/sweep.log" || true)))
grep -q '^DONE' "$W/sweep.log" || bad "the sweep did not finish"
# Brad (24 Nov 2026): an unread page proves nothing. Every page is read, or the script fails (a page that hit the
# limit or did not answer has already failed above, by its own FAIL line).
NPATHS="$(grep -c . "$W/paths.txt")"; NREAD="$(grep -oE '^PASS  sweep: [0-9]+ pages read' "$W/sweep.log" | grep -oE '[0-9]+' || echo 0)"
[ "$NREAD" = "$NPATHS" ] && ok "coverage: all $NPATHS pages read" || bad "coverage: $NREAD of $NPATHS pages read: an unread page proves nothing"
# Classify: a hit whose text is in the record (the clone's data) is the record's own words; anything else is app text.
pg_dump -a -X -d "$VERIFY_DB" 2>/dev/null > "$W/data.sql" || pg_dump -a -d "$VERIFY_DB" > "$W/data.sql"
python3 - "$W/sweep.log" "$W/data.sql" > "$W/classified.txt" <<'PY'
import json, sys, re
data = open(sys.argv[2], encoding='utf-8', errors='replace').read()
data_n = re.sub(r'\s+', ' ', data.replace('\\n', ' '))
for line in open(sys.argv[1]):
    if not line.startswith('HIT '): continue
    h = json.loads(line[4:]); t = re.sub(r'\s+', ' ', h['text'])
    i = t.find(h['code']); a = max(0, i - 25); frag = t[a:i + len(h['code']) + 25].strip()
    rec = (frag in data_n) or (len(t) <= 40 and t in data_n) or h.get('mono')
    print(('RECORD' if rec else 'APP') + '\t' + h['path'] + '\t[' + h['code'] + ']\t' + t[:160])
PY
APPN="$(grep -c '^APP' "$W/classified.txt" || true)"; RECN="$(grep -c '^RECORD' "$W/classified.txt" || true)"
[ "$APPN" = "0" ] && ok "the sweep: 0 plan codes in app text" || { bad "the sweep: $APPN plan code(s) in app text"; grep '^APP' "$W/classified.txt" | sort -u | head -20; }
echo "  listed, not failed: $RECN hit(s) in the record's own words (people's text, sealed text, ids), by code and text:"
grep '^RECORD' "$W/classified.txt" | cut -f3,4 | sort | uniq -c | sort -rn | head -30 | sed 's/^/    /'
cover "$LOG" 'check_plain_words: plain words' 'B1: a "§" in a client string' 'B2: "(C3)" in an ask' 'B3: "(D2)" back' 'B4: "tenant" in JSX text' 'B5: "tenant" in a client string' 'pages to read' 'coverage: all' 'the sweep: 0 plan codes'

echo "  screenshots: $OUT"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
