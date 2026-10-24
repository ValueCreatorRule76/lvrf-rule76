#!/usr/bin/env bash
#
# 2.0 item 3 — cohort roll-up, local verification. Dev Mac only.
#
#   ./scripts/verify_cohort.sh
#
# Runs against `lvrf_verifycohort`, a `make_clone` clone (createdb -T lvrf, then db/ownership.sql)
# dropped on exit (governed rows cannot be deleted, so test accounts never
# go into the real local lvrf). Stop `npm run dev` first. No migration is
# involved — this item adds a read route only.
#
# The checks are arithmetic, not snapshots: whatever the clone holds, the
# composite must equal the minimum member, members must be sorted weakest
# first, the tenant's own account must be absent, and an account added
# with no engagement must become the floor at 0 with no band.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

# drizzle.config.ts accepts only ^lvrf(_[a-z0-9]+)?$ — one underscore at most.
VERIFY_DB=lvrf_verifycohort
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3098
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
COHORT=server/routes/cohort.ts
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_cohort.XXXXXX")"
cp "$COHORT" "$W/cohort.ts.orig"
VITE_PORT=5198; CDP_PORT=9348; VITE_PID=""; CHROME_PID=""
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  cmp -s "$W/cohort.ts.orig" "$COHORT" || { cp "$W/cohort.ts.orig" "$COHORT"; echo "  (EXIT trap restored $COHORT)"; }
  sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; rm -rf "$W"
}
. scripts/lib/finish.sh
trap finish EXIT

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone local lvrf -> ${VERIFY_DB}"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
# Q4n reads reference_example_markers (0036): the clone is migrated to the
# newest migration and hardened, as every other verify clone is.
migrate_clone "$VERIFY_DB" > /tmp/lvrf_cohort_migrate.log 2>&1 && ok "migrated as lvrf_migrate" || { bad "migrate: $(tail -3 /tmp/lvrf_cohort_migrate.log)"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening"; exit 1; }

step "3. API against the clone, port ${PORT}"
start_server() {
  LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_cohort_server.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
}
stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; sleep 1; }
start_server
curl -s -o /dev/null "$BASE/api/health" && ok "server up" || { bad "server did not start"; exit 1; }
ACTOR="$(psql -At -d "$VERIFY_DB" -c "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND simulated = false AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
TENANT_SELF="$(psql -At -d "$VERIFY_DB" -c "SELECT string_agg(id::text, ',') FROM institutions WHERE is_tenant_self AND deleted_at IS NULL")"

# check.js FILE — prints PASS/FAIL lines for the structural rules.
cat > /tmp/lvrf_cohort_check.cjs <<'JS'
const v = require(process.argv[2]);
const selfIds = (process.argv[3] || '').split(',').filter(Boolean);
const out = [];
const t = (ok, msg) => out.push(`${ok ? 'PASS' : 'FAIL'}|${msg}`);
const cohorts = [['book', v.book], ...v.by_industry.map((x) => [x.industry.slug, x.cohort])];
for (const [name, c] of cohorts) {
  const recorded = c.members.filter((m) => m.status === 'run_of_record');
  const unmeasured = c.members.filter((m) => m.status !== 'run_of_record');
  const minStored = recorded.length ? Math.min(...recorded.map((m) => Number(m.confidence_score))) : null;
  if (unmeasured.length > 0) {
    t(c.composite.score === null && c.composite.floor === 'unmeasured',
      `${name}: ${unmeasured.length} unmeasured member(s), so composite score is null (${JSON.stringify(c.composite.score)}) and floor is unmeasured (${c.composite.floor})`);
  } else if (recorded.length > 0) {
    t(typeof c.composite.score === 'string' && Number(c.composite.score) === minStored,
      `${name}: composite ${JSON.stringify(c.composite.score)} equals the minimum stored score ${minStored}`);
  } else {
    t(c.composite.score === null && c.composite.floor === 'empty', `${name}: empty cohort has a null score`);
  }
  t(c.composite.lowest_recorded === null
      ? recorded.length === 0
      : Number(c.composite.lowest_recorded.confidence_score) === minStored,
    `${name}: lowest_recorded ${JSON.stringify(c.composite.lowest_recorded?.confidence_score ?? null)} equals the minimum stored score among runs of record (${minStored})`);
  t(c.members.every((m, i, a) => i === 0 || a[i - 1].sort_key <= m.sort_key), `${name}: members sorted weakest first`);
  t(unmeasured.every((m) => m.confidence_score === null && m.confidence_band === null), `${name}: every unmeasured member has null confidence_score and null band`);
  t(c.members.every((m) => m.status !== 'run_of_record' || m.locked_at !== null), `${name}: every run of record is locked`);
  t(c.composite.floor !== 'unmeasured' || c.composite.band === null, `${name}: an unmeasured floor has no band`);
  t(c.members.every((m) => !selfIds.includes(m.institution_id)), `${name}: tenant's own account absent`);
  t(!JSON.stringify(c).match(/"(average|mean|avg)"/i), `${name}: no average anywhere in the response`);
}
console.log(out.join('\n'));
JS
check() {
  curl -s -H "x-actor-person-id: $ACTOR" "$BASE/api/cohort" > /tmp/lvrf_cohort.json
  node /tmp/lvrf_cohort_check.cjs /tmp/lvrf_cohort.json "$TENANT_SELF" | while IFS='|' read -r r msg; do
    if [ "$r" = PASS ]; then echo "  PASS  $msg"; else echo "  FAIL  $msg"; fi
  done > /tmp/lvrf_cohort_lines.txt
  cat /tmp/lvrf_cohort_lines.txt
  PASS=$((PASS + $(grep -c '  PASS' /tmp/lvrf_cohort_lines.txt || true)))
  FAIL=$((FAIL + $(grep -c '  FAIL' /tmp/lvrf_cohort_lines.txt || true)))
}
json() { node -e "console.log(JSON.stringify(require('/tmp/lvrf_cohort.json')$1))"; }

step "4. Rules hold on the clone's existing data"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cohort")"
# Since sign-in P2a every /api read needs an actor: 401 from requireActor
# (it was the cohort route's own 422 in P1).
[ "$CODE" = "401" ] && ok "no actor -> 401" || bad "no actor -> $CODE"
check
echo "  book composite: $(json .book.composite.score) $(json .book.composite.band) floor=$(json .book.composite.floor) · $(json .book.measured_count)/$(json .book.member_count) measured · comparable=$(json .book.model.comparable)"
UNCLASSIFIED_BEFORE="$(json .unclassified_account_count)"

step "5. An account with no engagement becomes the floor"
NAME="Verify cohort $(date +%s)"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" \
  -d "{\"institution\":{\"name\":\"$NAME\"}}" "$BASE/api/account-inputs")"
[ "$CODE" = "201" ] && ok "created an account with no engagement" || bad "create -> $CODE"
check
[ "$(json .book.composite.score)" = "null" ] && ok "book composite score is null, not 0" || bad "book composite: $(json .book.composite.score)"
[ "$(json .book.composite.determined_by.institution_name)" = "\"$NAME\"" ] \
  && ok "the floor is set by the account just created ($NAME)" \
  || bad "determined_by: $(json .book.composite.determined_by.institution_name), expected \"$NAME\""
[ "$(json .book.composite.floor)" = '"unmeasured"' ] && ok "floor is unmeasured" || bad "floor: $(json .book.composite.floor)"
[ "$(json .book.composite.determined_by.status)" = '"no_engagement"' ] && ok "determined by a no_engagement member" || bad "determined_by: $(json .book.composite.determined_by.status)"
[ "$(json .unclassified_account_count)" = "$((UNCLASSIFIED_BEFORE + 1))" ] && ok "unclassified count went $UNCLASSIFIED_BEFORE -> $((UNCLASSIFIED_BEFORE + 1))" || bad "unclassified count: $(json .unclassified_account_count), expected $((UNCLASSIFIED_BEFORE + 1))"

step "6. Q4n: a reference example is not a customer engagement (O-D3)"
q() { psql -X -At -d "$VERIFY_DB" -c "$1"; }
post() {  # PATH BODY -> status in $CODE, body in /tmp/lvrf_cohort_post.json
  CODE="$(curl -s -o /tmp/lvrf_cohort_post.json -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $ACTOR" -d "$2" "$BASE$1")"
}
pj() { node -e "console.log(require('/tmp/lvrf_cohort_post.json')$1)"; }
inbook() { node -e "const v=require('/tmp/lvrf_cohort.json');const all=[v.book,...v.by_industry.map(x=>x.cohort)];console.log(all.some(c=>c.members.some(m=>m.institution_id==='$1')))"; }
TEN="$(q "SELECT tenant_id FROM persons WHERE id = '$ACTOR'")"
q "UPDATE tenants SET steward_person_id = '$ACTOR' WHERE id = '$TEN'" > /dev/null   # fixture: the actor is the steward (the marker is a steward's act)
check > /dev/null
R0="$(json .reference_example_count)"
TARGET="$(node -e "const v=require('/tmp/lvrf_cohort.json');const m=v.book.members.find(x=>x.status==='run_of_record')||v.book.members[0];console.log(m?m.institution_id:'')")"
TNAME="$(q "SELECT name FROM institutions WHERE id = '$TARGET'")"
[ -n "$TARGET" ] && [ "$(inbook "$TARGET")" = "true" ] && ok "before: '$TNAME' is in the book ($(json .book.member_count) members; $R0 reference examples left out)" || { bad "no book member to mark"; exit 1; }
post "/api/institutions/$TARGET/reference-example" '{"kind":"published_case_study","source_citation":"Verification citation for Q4n.","note":"Verification: a reference example, not an engagement."}'
[ "$CODE" = "201" ] && ok "the steward marks '$TNAME' a reference example -> 201" || { bad "mark -> $CODE $(cat /tmp/lvrf_cohort_post.json)"; exit 1; }
M="$(pj .reference_example_marker_id)"
check > /dev/null
[ "$(inbook "$TARGET")" = "false" ] && [ "$(json .reference_example_count)" = "$((R0 + 1))" ] \
  && ok "  ...marked: left out of the book and every industry cohort; reference_example_count $R0 -> $((R0 + 1))" || bad "  ...still counted: in book $(inbook "$TARGET"), count $(json .reference_example_count)"
post "/api/reference-examples/$M/retire" '{"retirement_reason":"Verification: unmarked, so it counts again."}'
check > /dev/null
[ "$CODE" = "200" ] && [ "$(inbook "$TARGET")" = "true" ] && [ "$(json .reference_example_count)" = "$R0" ] \
  && ok "  ...unmarked (the steward's act, $CODE): counted again; the count back to $R0" || bad "  ...after unmark: $CODE, in book $(inbook "$TARGET"), count $(json .reference_example_count)"
# Every customer account marked: the book has no live engagement, and says so.
for I in $(q "SELECT i.id FROM institutions i WHERE i.tenant_id = '$TEN' AND NOT i.is_tenant_self AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM reference_example_markers m WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL)"); do
  post "/api/institutions/$I/reference-example" '{"kind":"demonstration","source_citation":"Verification citation for Q4n.","note":"Verification: every account marked."}'
  [ "$CODE" = "201" ] || bad "marking $I -> $CODE"
done
NACC="$(q "SELECT count(*) FROM institutions WHERE tenant_id = '$TEN' AND NOT is_tenant_self AND deleted_at IS NULL AND superseded_by_id IS NULL")"
check
[ "$(json .book.composite.floor)" = '"empty"' ] && [ "$(json .book.member_count)" = "0" ] && [ "$(json .book.composite.score)" = "null" ] && [ "$(json .reference_example_count)" = "$NACC" ] \
  && ok "every customer account marked: the book is empty (floor empty, score null, 0 members), $NACC reference examples left out" || bad "empty book: floor $(json .book.composite.floor), members $(json .book.member_count), count $(json .reference_example_count)/$NACC"

# The card, in a browser, signed in by session.
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$ACTOR' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$ACTOR', '$HASH', 'verify')" > /dev/null
[ "$(q "SELECT count(*) FROM access_grants WHERE person_id = '$ACTOR' AND revoked_at IS NULL")" = "0" ] && q "INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason) VALUES ('$ACTOR', '$TEN', '$ACTOR', 'Verification fixture grant')" > /dev/null
EMAIL="$(q "SELECT email FROM persons WHERE id = '$ACTOR'")"
TOKEN="$(curl -s -c - -o /dev/null -X POST -H 'content-type: application/json' -H "Origin: http://localhost:$VITE_PORT" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" "$BASE/api/auth/login" | awk '$6 == "lvrf_session" {print $7}')"
[ -n "$TOKEN" ] && ok "signed in by session (sign-in route)" || bad "no session"
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VITE_PID=$!
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
cat > "$W/card.mjs" <<'JS'
import { writeFileSync } from 'node:fs';
const [CDP, VITE, TOKEN, SHOT] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
await send('Network.enable');
await send('Network.setCookie', { name: 'lvrf_session', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true });
await send('Page.navigate', { url: `http://localhost:${VITE}/` });
let ok = false; for (let i = 0; i < 75 && !ok; i++) { await sleep(200); ok = await ev("!!document.querySelector('[data-testid=book-empty]')"); }
const empty = await ev("document.querySelector('[data-testid=book-empty]')?.textContent ?? ''");
const scope = await ev("document.querySelector('[data-testid=book-scope]')?.textContent.replace(/\\s+/g,' ').trim() ?? ''");
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false }); await sleep(400);
const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SHOT, Buffer.from(r.result.data, 'base64'));
console.log(JSON.stringify({ empty, scope })); ws.close(); process.exit(0);
JS
CARD="$(node "$W/card.mjs" "$CDP_PORT" "$VITE_PORT" "$TOKEN" "${SHOT_DIR:-$W}/q4n_book_empty.png")"
node -e "const c=JSON.parse(process.argv[1]);process.exit(c.empty==='No live customer engagements.'?0:1)" "$CARD" && ok "the accounts page says 'No live customer engagements.' (no number)" || bad "card: $CARD"
node -e "const c=JSON.parse(process.argv[1]);process.exit(c.scope.includes('neither is a reference example ($NACC accounts are marked one)')||c.scope.includes('neither is a reference example ($NACC account is marked one)')?0:1)" "$CARD" && ok "  ...and says why: '$(node -e "console.log(JSON.parse(process.argv[1]).scope.slice(-120))" "$CARD")'" || bad "scope: $CARD"
echo "  screenshot: ${SHOT_DIR:-$W}/q4n_book_empty.png"

step "7. Deliberate break"
python3 - "$COHORT" <<'PY2'
import sys; p = sys.argv[1]; s = open(p).read()
a = """            AND NOT EXISTS (SELECT 1 FROM reference_example_markers m
                             WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL)
          ORDER BY i.name, e.name`,"""
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, "          ORDER BY i.name, e.name`,"))
PY2
stop_server; start_server; check > /dev/null
[ "$(inbook "$TARGET")" = "true" ] && ok "B1: without the marker filter, the marked accounts set the book again — the filter is what keeps them out" || bad "B1: not caught"
cp "$W/cohort.ts.orig" "$COHORT"; cmp -s "$W/cohort.ts.orig" "$COHORT" && ok "  ...$COHORT restored byte-identical" || bad "  ...restore differs"
stop_server

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
