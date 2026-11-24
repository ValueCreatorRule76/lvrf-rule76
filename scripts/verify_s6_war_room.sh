#!/usr/bin/env bash
#
# S6 (3.1; LVRF_PLAN §25) — the War Room (`/book`), its read GET /api/book, and the band on Accounts home.
#
#   ./scripts/verify_s6_war_room.sh [out_dir]
#
# Clones `lvrf_prodcopy` (sign-in data neutralised) to `lvrf_verifys6`, migrated and hardened, dropped on exit. Three
# phases, each walked THROUGH THE PAGE as the steward signed in by session (scripts/lib/s6_walk.mjs):
#   P0  prod's shape: no member (every customer account is a reference example), "Not in the book", the band empty.
#   P1  the steward unmarks Curia, by its route (POST /api/reference-examples/:id/retire, a fixture act on the clone):
#       one member, book confidence its run.
#   P2  one unclassified customer account (by route), a hypothesis on Curia's live outcome (state_hypothesis, by
#       route), and that outcome committed BY ROUTE with a promised measurement date in the past (§26: the commit
#       states it; a standing commitment is withdrawn by route first, as the database fixes the date). Curia in focus.
# Every figure the page shows is read here from SQL, apart from the client and the route (EXP).
# D1: no money on the page, in the band or in GET /api/book (every key, every string). A coverage gate fails any section
# that prints no line (S5's lesson).
# DELIBERATE BREAKS, each against the clean P2 pass, files restored byte-identical:
#   B1 money on the page  B2 a money field in the route  B3 a reference example counted  B4 the lowest recorded run
#   shown as the book's score  B5 "on time" where no date was promised  B6 a sideways scroll at 390
#   B7 the band shows refuted alone

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

VERIFY_DB=lvrf_verifys6
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3371; VITE_PORT=5371; CDP_PORT=9481
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_s6.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
PAGE=client/src/pages/WarRoomPage.tsx; BANDC=client/src/components/BookBand.tsx; ROUTE=server/routes/book.ts; COHORT=server/routes/cohort.ts
EDITED=("$PAGE" "$BANDC" "$ROUTE" "$COHORT")
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
walk() {  # SECTIONS TAG LOG
  VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" EXP="$W/exp.json" TAG="$2" node scripts/lib/s6_walk.mjs "$1" > "$3" 2>&1 \
    || echo "FAIL  $2: the walk crashed: $(tail -3 "$3" | tr '\n' ' ')" >> "$3"
}
tally() {
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; esac; done < "$1"
  grep -q '^DONE ' "$1" || bad "the walk did not finish: $(tail -3 "$1" | tr '\n' ' ')"
}
cover() {  # LOG PHRASE... — every section's checks ran (a section printing nothing must not pass)
  local log="$1"; shift
  for want in "$@"; do grep -qF "$want" "$log" && ok "coverage: ran — $want" || bad "coverage: no line for — $want"; done
}
broke() {  # SECTIONS TAG EXPECTED_FAILURE_TEXT LABEL
  sleep 4; walk "$1" "$2" "$W/$2.log"
  grep -Eq "^FAIL  $2: .*($3)" "$W/$2.log" && ok "$4" || bad "$2: not caught: $(grep -m3 '^FAIL' "$W/$2.log" | tr '\n' ' ')"
}

# §26: commit an outcome by route with its measurement promised DAYS_AGO days ago (committed 60 days ago), by its
# account's customer-side committer of record; a standing commitment is withdrawn by route first.
withdraw_commitment() {  # OUTCOME
  curl -s -o "$W/cp.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" \
    -d '{"reason":"Verification: withdrawn to commit with a promised date (S6 fixture, §26)."}' "$BASE/api/value-outcomes/$1/commitment/withdraw" | grep -q '^200$'
}
commit_promised() {  # OUTCOME DAYS_AGO
  local o="$1" ago="$2" who on by
  # the committer: a customer-side person who committed on this account (Curia's of record), else the first named
  who="$(q "SELECT p.id FROM persons p JOIN value_outcomes o ON o.id = '$o' AND p.institution_id = o.institution_id
             WHERE p.deleted_at IS NULL AND NOT p.simulated
             ORDER BY EXISTS (SELECT 1 FROM value_outcomes c WHERE c.committed_by_person_id = p.id) DESC, p.created_at LIMIT 1")"
  [ "$(q "SELECT committed_at IS NOT NULL FROM value_outcomes WHERE id = '$o'")" = "t" ] && { withdraw_commitment "$o" || return 1; }
  on="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date - 60, 'YYYY-MM-DD')")"; by="$(q "SELECT to_char((now() AT TIME ZONE 'UTC')::date - $ago, 'YYYY-MM-DD')")"
  curl -s -o "$W/cp.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" \
    -d "{\"target_value\":1.0,\"committed_by_person_id\":\"$who\",\"committed_at\":\"${on}T12:00:00Z\",\"promised_measured_on\":\"$by\",\"commitment_note\":\"Verification: S6 fixture commitment (§26).\",\"attribution_method\":\"contribution_only\",\"measure_class\":\"capability_performance\"}" \
    "$BASE/api/value-outcomes/$o/commit" | grep -q '^201$'
}

# What the War Room must show, from SQL alone (FOCUS: the account held in focus, or empty).
expect() {
  q "WITH mem AS (
       SELECT i.id, i.name FROM institutions i
        WHERE i.tenant_id = '$TENANT' AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL AND NOT i.is_tenant_self
          AND NOT EXISTS (SELECT 1 FROM reference_example_markers m WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL)),
     live_o AS (
       SELECT o.* FROM value_outcomes o JOIN engagements e ON e.id = o.engagement_id AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL
        WHERE o.deleted_at IS NULL AND o.superseded_by_id IS NULL AND o.institution_id IN (SELECT id FROM mem)),
     hyp AS (
       SELECT h.institution_id, lvrf_hypothesis_verdict(h) AS v, (h.falsifier_due - (now() AT TIME ZONE 'UTC')::date) AS d
         FROM value_hypotheses h JOIN live_o o ON o.id = h.value_outcome_id WHERE h.deleted_at IS NULL AND h.superseded_by_id IS NULL),
     -- per (member, current engagement): its run of record, as book confidence reads it
     cm AS (
       SELECT m.id, m.name, e.id AS eng,
              (SELECT r.confidence_score FROM value_runs r WHERE r.engagement_id = e.id AND r.deleted_at IS NULL AND r.locked_at IS NOT NULL
                  AND lvrf_system_exercise_mark('value_runs', r.id) IS NULL ORDER BY r.run_number DESC LIMIT 1) AS score,
              (SELECT r.confidence_band FROM value_runs r WHERE r.engagement_id = e.id AND r.deleted_at IS NULL AND r.locked_at IS NOT NULL
                  AND lvrf_system_exercise_mark('value_runs', r.id) IS NULL ORDER BY r.run_number DESC LIMIT 1) AS band
         FROM mem m LEFT JOIN engagements e ON e.institution_id = m.id AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL)
     SELECT json_build_object(
       'focus', NULLIF('${FOCUS:-}', ''),
       'members', coalesce((SELECT json_agg(x ORDER BY x->>'name') FROM (SELECT json_build_object(
          'id', m.id, 'name', m.name,
          'due30', (SELECT count(*) FROM hyp WHERE institution_id = m.id AND v = 'open' AND d BETWEEN 0 AND 30),
          'due60', (SELECT count(*) FROM hyp WHERE institution_id = m.id AND v = 'open' AND d BETWEEN 31 AND 60),
          'due90', (SELECT count(*) FROM hyp WHERE institution_id = m.id AND v = 'open' AND d BETWEEN 61 AND 90),
          'past_due', (SELECT count(*) FROM hyp WHERE institution_id = m.id AND v = 'open' AND d < 0),
          'open', (SELECT count(*) FROM hyp WHERE institution_id = m.id AND v = 'open'),
          'confirmed', (SELECT count(*) FROM hyp WHERE institution_id = m.id AND v IN ('survived', 'survived_post_hoc')),
          'refuted', (SELECT count(*) FROM hyp WHERE institution_id = m.id AND v IN ('refuted', 'refuted_post_hoc')),
          'outcomes', (SELECT count(*) FROM live_o WHERE institution_id = m.id),
          'late', (SELECT count(*) FROM live_o WHERE institution_id = m.id AND promised_measured_at IS NOT NULL AND now() >= (((promised_measured_at AT TIME ZONE 'UTC')::date + 1) + time '12:00') AT TIME ZONE 'UTC' AND actual_measured_at IS NULL),
          'no_promise', (SELECT count(*) FROM live_o WHERE institution_id = m.id AND promised_measured_at IS NULL AND actual_measured_at IS NULL),
          'measured', EXISTS (SELECT 1 FROM live_o WHERE institution_id = m.id AND actual_measured_at IS NOT NULL),
          'promised_future', EXISTS (SELECT 1 FROM live_o WHERE institution_id = m.id AND promised_measured_at IS NOT NULL),
          'head', (SELECT json_build_object('run_number', r.run_number, 'score', r.confidence_score, 'band', r.confidence_band,
                     'stage_label', CASE r.terminal_value_stage WHEN 'baseline' THEN 'Baseline set' WHEN 'attach' THEN 'Capability attached' WHEN 'model' THEN 'Value modelled'
                       WHEN 'commit' THEN 'Target committed' WHEN 'measure' THEN 'Actual measured' WHEN 'verify' THEN 'Verified' ELSE 'Returned to the record' END,
                     'cod', CASE WHEN coalesce((r.payload->>'payloadVersion')::int, 1) >= 5 AND r.payload->'case'->'cost_of_delay'->>'status' IN ('stated', 'refused')
                                 THEN r.payload->'case'->'cost_of_delay'->>'status' END)
                     FROM value_runs r
                    WHERE r.engagement_id = (SELECT e.id FROM engagements e WHERE e.institution_id = m.id AND e.superseded_by_id IS NULL
                                               AND EXISTS (SELECT 1 FROM value_outcomes vo WHERE vo.engagement_id = e.id AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL)
                                             ORDER BY e.created_at DESC, e.id DESC LIMIT 1)
                      AND r.deleted_at IS NULL AND r.locked_at IS NOT NULL AND lvrf_system_exercise_mark('value_runs', r.id) IS NULL
                    ORDER BY r.run_number DESC LIMIT 1),
          'no_confidence', CASE WHEN NOT EXISTS (SELECT 1 FROM value_runs vr JOIN engagements e ON e.id = vr.engagement_id WHERE e.institution_id = m.id AND vr.deleted_at IS NULL)
                                THEN 'No run yet: no computed confidence' ELSE 'No locked run yet: no computed confidence' END) AS x
          FROM mem m) s), '[]'::json),
       'floor', CASE WHEN NOT EXISTS (SELECT 1 FROM mem) THEN 'empty' WHEN EXISTS (SELECT 1 FROM cm WHERE score IS NULL) THEN 'unmeasured' ELSE 'run' END,
       'floor_score', (SELECT min(score) FROM cm), 'floor_band', (SELECT band FROM cm WHERE score IS NOT NULL ORDER BY score LIMIT 1),
       'unmeasured', coalesce((SELECT json_agg(DISTINCT name) FROM cm WHERE score IS NULL), '[]'::json),
       'verified', (SELECT count(*) FROM live_o WHERE realization = 'verified'),
       'status_line', (SELECT string_agg(n || ' ' || CASE realization::text WHEN 'not_realized' THEN 'not realized' ELSE realization::text END, ' · ' ORDER BY first)
                         FROM (SELECT realization, count(*) AS n, min(created_at) AS first FROM live_o GROUP BY realization) z),
       'outside', coalesce((SELECT json_agg(json_build_object('id', i.id, 'name', i.name, 'reason', CASE WHEN i.is_tenant_self THEN 'own_account' ELSE 'reference_example' END) ORDER BY i.is_tenant_self, i.name)
                    FROM institutions i WHERE i.tenant_id = '$TENANT' AND i.deleted_at IS NULL AND i.superseded_by_id IS NULL
                      AND (i.is_tenant_self OR EXISTS (SELECT 1 FROM reference_example_markers m WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL))), '[]'::json))" > "$W/exp.json"
  node -e "const e=require('$W/exp.json');console.log('   members:',e.members.map(m=>m.name+' (due '+m.due30+'/'+m.due60+'/'+m.due90+', late '+m.late+', head '+(m.head?m.head.run_number+' '+m.head.score:'none')+')').join('; ')||'none','| floor',e.floor,'| outside',e.outside.map(o=>o.name).join(', '))"
}

step "1. Typecheck, tokens"
(cd client && npx tsc -b) > "$W/tsc.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc.log")"
npx tsc --noEmit -p tsconfig.json > "$W/tsc_s.log" 2>&1 && ok "server tsc" || bad "server tsc: $(head -5 "$W/tsc_s.log")"
node scripts/check_design_tokens.mjs > "$W/tokens.log" 2>&1 && ok "check_design_tokens: $(tail -1 "$W/tokens.log")" || bad "check_design_tokens: $(tail -5 "$W/tokens.log")"
H="$(grep -nE '#[0-9A-Fa-f]{3,8}\b' "$PAGE" "$BANDC" client/src/api/book.ts "$ROUTE" || true)"
[ -z "$H" ] && ok "the War Room's files restate no hex value" || bad "a hex: $H"
# The route selects no money: neither the sealed case's amount, rate nor currency, nor any currency column.
grep -nE "'amount'|'rate'|'currency'|currency_impact|currency_code|impact_basis|->'inputs'" "$ROUTE" > "$W/route_money.txt" && bad "GET /api/book's SQL reads money: $(head -2 "$W/route_money.txt")" || ok "GET /api/book's SQL reads no money column or sealed amount, rate or currency (D1)"

step "2. Clone the prod copy, migrate, harden; a session"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy && migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 \
  && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "cloned the prod copy, migrated, hardened" || { bad "clone"; exit 1; }
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
TENANT="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
start_server && ok "the API on the clone" || { bad "server"; exit 1; }
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done

step "3. P0, prod's shape: no member"
FOCUS=""; expect
node -e "process.exit(require('$W/exp.json').members.length===0?0:1)" && ok "P0: the clone, like prod, has no live customer account in the book" || bad "P0: members on the copy"
walk empty,money s6p0 "$W/p0.log"; tally "$W/p0.log"
cover "$W/p0.log" 'empty: "In the book" is 0' 'empty: "Not in the book" lists' 'empty: the band says' 'money: no money on the War Room' 'money: GET /api/book carries no money field'

step "4. P1: the steward unmarks Curia (a fixture act on the clone, by route)"
CURIA="$(q "SELECT id FROM institutions WHERE name = 'Curia' AND deleted_at IS NULL AND superseded_by_id IS NULL")"
MARK="$(q "SELECT id FROM reference_example_markers WHERE institution_id = '$CURIA' AND deleted_at IS NULL AND superseded_by_id IS NULL")"
CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d '{"retirement_reason":"S6 Gate A fixture on a throwaway clone: Curia counted as a live customer account for the War Room."}' "$BASE/api/reference-examples/$MARK/retire")"
[ "$CODE" = "200" ] || [ "$CODE" = "201" ] && ok "Curia unmarked, by the steward's route ($CODE)" || bad "unmark -> $CODE $(cat "$W/r.json")"
FOCUS=""; expect
walk book,band,money s6p1 "$W/p1.log"; tally "$W/p1.log"
cover "$W/p1.log" "book: its rows are book confidence's members" 'book: book confidence 10 / 100' 'outcomes read "No promised date on record"' 'band: confirmed and refuted together' 'money: and no string in it names money'

step "5. P2: an unclassified account; a hypothesis on Curia's outcome; a promised date in the past; Curia in focus"
CODE="$(curl -s -o "$W/r2.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d '{"institution":{"name":"Northwind Clinics (S6 fixture)"}}' "$BASE/api/account-inputs")"
[ "$CODE" = "201" ] && ok "an unclassified customer account, by route" || bad "new account -> $CODE"
ENG="$(q "SELECT e.id FROM engagements e WHERE e.institution_id = '$CURIA' AND e.deleted_at IS NULL AND e.superseded_by_id IS NULL AND EXISTS (SELECT 1 FROM value_outcomes vo WHERE vo.engagement_id = e.id AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL) ORDER BY e.created_at DESC LIMIT 1")"
state_hypothesis "$ENG" > "$W/hyp.log" 2>&1 && ok "a hypothesis on Curia's live outcome, by the routes (state_hypothesis), due in 90 days" || bad "state_hypothesis: $(tail -3 "$W/hyp.log")"
OUTC="$(q "SELECT id FROM value_outcomes WHERE engagement_id = '$ENG' AND deleted_at IS NULL AND superseded_by_id IS NULL AND actual_measured_at IS NULL ORDER BY created_at DESC LIMIT 1")"
# §26: the promised date is recorded by the commit route (a fixture act on the clone): committed 60 days ago, promised
# 20 days ago. A commitment already standing (made before §26) is withdrawn by route first: the database fixes its date.
commit_promised "$OUTC" 20 && ok "that outcome committed by route, its measurement promised 20 days ago (§26)" || bad "commit with a promised date: $(cat "$W/cp.json")"
FOCUS="$CURIA"; expect
walk book,band,money,phone,keys,contrast s6 "$W/main.log"; tally "$W/main.log"
cover "$W/main.log" 'book: book confidence "Not measured"' 'outcomes read "1 late: the promised day' 'outcomes read "No outcome yet"' 'marked "In focus"' 'the focused row and the frame above it' \
  'hypotheses due in words' 'band: hypotheses due in words' 'money: no money on the War Room' 'money: GET /api/book carries no money field' 'phone: the War Room, no sideways scroll' 'keys: Tab reaches every row' 'contrast: every text on the War Room'

step "6. Deliberate breaks, each against the clean P2 pass"
# B1 — money on the page.
edit "$PAGE" "Counts only: the War Room never sums or averages money across accounts." "Portfolio value: \$4.2M across the book."
broke money b1 'no money on the War Room' 'B1: a money figure on the War Room → caught'
restore "$PAGE"
# B2 — a money field in the route.
edit "$ROUTE" "        as_of: new Date().toISOString().slice(0, 10)," "        as_of: new Date().toISOString().slice(0, 10), total_value_usd: 0,"
restart_server; broke money b2 'GET /api/book carries no money field' 'B2: a money field in GET /api/book → caught'
restore "$ROUTE"
# B3 — a reference example counted (book confidence's own membership filter removed: the War Room follows it).
edit "$COHORT" "        AND NOT EXISTS (SELECT 1 FROM reference_example_markers m
                         WHERE m.institution_id = i.id AND m.deleted_at IS NULL AND m.superseded_by_id IS NULL)
      ORDER BY i.name, e.name\`," "      ORDER BY i.name, e.name\`,"
restart_server; broke book b3 "its rows are book confidence's members, and SQL's" 'B3: a reference example counted in the book → caught'
restore "$COHORT"; restart_server
# B4 — the lowest recorded run shown as the book's score (a number nobody measured as the floor).
edit "$PAGE" "        <span className={compact ? 'font-semibold' : 'block text-[15px] font-semibold text-ink'}>Not measured</span>" "        <span className={compact ? 'font-semibold' : 'block text-[15px] font-semibold text-ink'}>{c.lowest_recorded ? Number(c.lowest_recorded.confidence_score) : 0} / 100</span>"
broke book b4 'book confidence "Not measured"' 'B4: the lowest recorded run shown as the book'"'"'s score → caught'
restore "$PAGE"
# B5 — "on time" where no date was promised. Its positive control is P1 (Curia's row: "No promised date on record");
# for the break, the commitment is withdrawn by route (its date goes with it), so a row reaches that branch, and the
# outcome is committed again by route after.
withdraw_commitment "$OUTC" > /dev/null || bad "B5: the commitment's withdrawal: $(cat "$W/cp.json")"
edit "$PAGE" "  return { text: 'No promised date on record', tone: 'plain' };" "  return { text: 'On time', tone: 'plain' };"
broke book b5 'never "on time"|outcomes read "No promised date on record' 'B5: "On time" where nothing was promised → caught'
restore "$PAGE"
commit_promised "$OUTC" 20 || bad "B5: committed again: $(cat "$W/cp.json")"
# B6 — a sideways scroll at 390.
edit "$PAGE" '<div className="mt-4 sm:hidden" data-testid="book-cards">' '<div className="mt-4 min-w-[480px] sm:hidden" data-testid="book-cards">'
broke phone b6 'no sideways scroll' 'B6: a sideways scroll at 390 → caught'
restore "$PAGE"
# B7 — the band shows refuted alone.
edit "$BANDC" "<span data-testid=\"band-cr\"><b className=\"font-semibold\">{b.hypotheses.confirmed}</b> <span className={fig}>confirmed ·</span> <b className=\"font-semibold\">{b.hypotheses.refuted}</b> <span className={fig}>refuted</span></span>" "<span data-testid=\"band-cr\"><b className=\"font-semibold\">{b.hypotheses.refuted}</b> <span className={fig}>refuted</span></span>"
broke band b7 'confirmed and refuted together' 'B7: the band showing refuted alone → caught'
restore "$BANDC"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots: $OUT"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
