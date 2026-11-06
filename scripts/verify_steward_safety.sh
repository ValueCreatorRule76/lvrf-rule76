#!/usr/bin/env bash
#
# Steward safety (Brad, 5 Nov 2026; LVRF_PLAN §19; ships in B4's Gate B). Local verification.
#
#   ./scripts/verify_steward_safety.sh [screenshot_dir]
#
# Clones `lvrf_prodcopy`, migrated and hardened; walks the tenant's own card 01c and the Manufacturing pack page as
# the steward, reading the record for what it must show. Every confirmation in the client is read for the item it
# names. DELIBERATE BREAKS, every file restored byte-identical, each must be caught:
#   S1  superseded rows listed among the current ones
#   S2  a muted row's acts shown without "Show actions"
#   S3  the withdrawals zone removed from card 01c
#   S4  a confirmation that names no short id

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }

VERIFY_DB=lvrf_verifystewardsafety
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3110; VITE_PORT=5210; CDP_PORT=9370
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_ssafe.XXXXXX")"
SHOTS="${1:-$W/shots}"; mkdir -p "$SHOTS"
CARD=client/src/components/AccountEvidence.tsx
EDITED=("$CARD")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; SERVER_PID=""; VITE_PID=""; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
cleanup() {
  stop_server
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "${EDITED[@]}"; do
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
sqlrefused() {  # LABEL SQL NEEDLE — in a rolled-back transaction
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1: refused ($3)" || bad "$1: $out"
}
sqllands() {  # LABEL SQL NEEDLE — a break: the statement lands (rolled back)
  local out; out="$(printf 'BEGIN;\n%s;\nROLLBACK;\n' "$2" | psql -X -v ON_ERROR_STOP=1 -d "$VERIFY_DB" 2>&1 || true)"
  printf '%s' "$out" | grep -qF -- "$3" && ok "$1" || bad "$1: $out"
}
verdict() { q "SELECT lvrf_hypothesis_verdict(h) FROM value_hypotheses h WHERE id = '$1'"; }

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
  psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard2.log" 2>&1 && [ "$(trig)" = "209" ] \
    && ok "  ...hardening.sql re-applied: every function as declared, 209 triggers" || bad "  ...re-harden: $(grep -m2 ERROR "$W/hard2.log")"
}

step "1. Typecheck"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone the prod copy; migrate; harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated" || { bad "migrate: $(tail -5 "$W/migrate.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "hardened" || { bad "hardening: $(grep -m2 ERROR "$W/hard.log")"; exit 1; }

step "3. Every confirmation names what it acts on"
# A confirmation of an act on an existing row names its short id; one that creates a row, or a batch listed above it
# with short ids, names it in words. The second list is closed: a new confirmation must be added to it on purpose.
NAMED_IN_WORDS='C3Batches.tsx:Record {plural
C3Batches.tsx:Mark {chosen.length}
C3Batches.tsx:State what {data.count}
C3Batches.tsx:Supersede {plan.count}
CustomerRoles.tsx:Name {person.full_name}
IndustriesListCard.tsx:Add the industry
PackResearch.tsx:Exclude &ldquo;
CaseInputs.tsx:Plan “
Workbench.tsx:Record that the {chosen.label}
PoliciesPage.tsx:Set {keys[key]}
PoliciesPage.tsx:Ratify the CFO lens'
confirms() { python3 - <<'PY2'
import re, glob
for f in sorted(glob.glob('client/src/**/*.tsx', recursive=True)):
    s = open(f).read()
    for m in re.finditer(r'confirm=\{', s):
        i = m.end(); d = 1; j = i
        while d and j < len(s):
            d += {'{': 1, '}': -1}.get(s[j], 0); j += 1
        blk = ' '.join(s[i:j - 1].split())
        if blk.startswith('confirm ?'): continue  # the form that passes its caller's confirmation through
        has = 'slice(0, 8)' in blk or 'short(o.id)' in blk or '<ShortId' in blk or 'shortId(' in blk or 'payload_hash' in blk
        t = re.search(r'data-testid="confirm-text">(.{0,40})', blk)
        print(('ID' if has else 'WORDS') + '\t' + f.split('/')[-1] + ':' + (t.group(1) if t else blk[:40]))
PY2
}
allowed() { local c="$1"; while IFS= read -r a; do [ -n "$a" ] && case "$c" in "$a"*) return 0 ;; esac; done <<< "$NAMED_IN_WORDS"; return 1; }
confirms > "$W/confirms.txt"
UNEXPECTED="$(grep '^WORDS' "$W/confirms.txt" | cut -f2 | while IFS= read -r c; do allowed "$c" || echo "$c"; done)"
[ -z "$UNEXPECTED" ] && ok "$(grep -c '^ID' "$W/confirms.txt") confirmations name a short id; $(grep -c '^WORDS' "$W/confirms.txt") name a new row or a listed batch in words" || bad "a confirmation names no short id: $UNEXPECTED"

step "4. The walk, as the steward"
S="$(q "SELECT steward_person_id FROM tenants t WHERE EXISTS (SELECT 1 FROM institutions i WHERE i.tenant_id = t.id AND i.is_tenant_self) LIMIT 1")"
S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
TS="$(date +%s)"; PW="verification-password-$TS"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
SELF="$(q "SELECT id FROM institutions WHERE is_tenant_self AND tenant_id = (SELECT tenant_id FROM persons WHERE id = '$S')")"
EXPECT="$(q "SELECT count(*) FILTER (WHERE e.superseded_by_id IS NULL) || '|' || count(*) FILTER (WHERE e.superseded_by_id IS NOT NULL) || '|' ||
  count(*) FILTER (WHERE e.superseded_by_id IS NULL AND (e.simulated OR lvrf_system_exercise_mark('evidence', e.id) IS NOT NULL)) FROM evidence e WHERE e.institution_id = '$SELF'")"
ok "card 01c on the copy, from the record: current|history|muted = $EXPECT"
start_server && ok "API up on $PORT"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$S_EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "the steward signed in by session" || { bad "no session"; exit 1; }
cw() {  # MODE
  local log="$W/walk.$1.$RANDOM.log"
  local rc=0; node scripts/lib/l41_walk.mjs "$1" "$VITE_PORT" "$CDP_PORT" "$SHOTS" "$TOKEN" > "$log" 2>&1 || rc=$?
  PASS=$((PASS + $(grep -c '^  PASS' "$log" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$log" || true)))
  grep -E '^  (PASS|FAIL)' "$log" || true
  [ "$rc" = "0" ] || bad "the $1 walk exited $rc (see $log)"
}
export SELF_INST="$SELF" EXPECT SLUG=manufacturing
cw stewardsafety

step "5. Deliberate breaks"
broke() {  # LABEL NEEDLE — the walk under a break: its FAIL line naming NEEDLE is the catch
  sleep 6
  local rc=0; node scripts/lib/l41_walk.mjs stewardsafety "$VITE_PORT" "$CDP_PORT" "$W/brk" "$TOKEN" > "$W/brk.log" 2>&1 || rc=$?
  grep -qF -- "FAIL  $2" "$W/brk.log" && ok "$1 → caught" || bad "$1: not caught ($(grep -c FAIL "$W/brk.log") FAIL lines; exit $rc)"
}
mkdir -p "$W/brk"
edit "$CARD" "  const current = rows.filter((e) => e.superseded_by_id === null);" "  const current = rows;"
broke "S1: superseded rows among the current ones" "current rows first"
restore "$CARD"
edit "$CARD" "  const [showActions, setShowActions] = useState(!muted);" "  const [showActions, setShowActions] = useState(true);"
broke "S2: a muted row's acts shown without \"Show actions\"" "  ...a muted row's acts wait"
restore "$CARD"
edit "$CARD" '          <div className="mt-2 border-l-[3px] border-warning pl-3" data-testid="danger-zone">' '          <div className="mt-2" data-testid="withdrawals">'
broke "S3: the withdrawals zone removed" "a withdrawal sits in the marked zone"
restore "$CARD"
edit "$CARD" 'confirm={<span data-testid="confirm-text">Withdraw {row.id.slice(0, 8)}, &ldquo;' 'confirm={<span data-testid="confirm-text">Withdraw &ldquo;'
confirms > "$W/confirms2.txt"
U2="$(grep '^WORDS' "$W/confirms2.txt" | cut -f2 | while IFS= read -r c; do allowed "$c" || echo "$c"; done)"
[ -n "$U2" ] && ok "S4: a confirmation without its short id → caught by the read: $U2" || bad "S4: not caught by the read"
broke "S4: ...and by the walk" "  ...its confirmation names the row and its short id"
restore "$CARD"
sleep 4

step "6. What held"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $SHOTS"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
