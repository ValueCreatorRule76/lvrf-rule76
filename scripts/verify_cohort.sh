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
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; }
trap cleanup EXIT

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"

step "2. Clone local lvrf -> ${VERIFY_DB}"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"

step "3. API against the clone, port ${PORT}"
LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > /tmp/lvrf_verify_cohort_server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
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

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
