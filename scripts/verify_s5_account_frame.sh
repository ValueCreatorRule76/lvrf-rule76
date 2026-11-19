#!/usr/bin/env bash
#
# S5 (3.1; LVRF_PLAN §24) — the account frame. Presentation only: no route, table, trigger or CHECK changes.
#
#   ./scripts/verify_s5_account_frame.sh [out_dir]
#
# Clones `lvrf_prodcopy` (restored by restore_prod_copy.sh, sign-in data neutralised) to `lvrf_verifys5`, migrated and
# hardened, dropped on exit: it carries the tenant's own account, two reference-example customer accounts (one
# classified with 22 runs across a live and a retired engagement), locked and marked runs. One unclassified customer
# account is created through the route as a fixture. Everything else goes THROUGH THE PAGE, as the steward signed in by
# session (a fixture credential on the clone only): the walk is scripts/lib/s5_walk.mjs. D6's classification is the one
# act, made through the frame's "Classify as…" and S1's form.
#
# The facts the frame must show are read here from SQL (EXP), independently of the client's derivation.
# DELIBERATE BREAKS edit a client file in place, each with its positive control (the clean pass), and restore it
# byte-identical:
#   B1 the frame shows the held account on another account's run (the run page declares no account)
#   B2 the focus kept after "Leave"
#   B3 the frame printing
#   B4 a sideways scroll at 390
#   B5 "Classify as…" offered on a classified account
#   B6 the confidence without its run named
#   B7 the "You're now in" notice said on every page, not once

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
command -v pdftotext > /dev/null || { echo "REFUSING: poppler (pdftotext) not found"; exit 1; }
psql -X -At -d lvrf_prodcopy -c "SELECT 1" > /dev/null 2>&1 || { echo "REFUSING: lvrf_prodcopy is missing (run scripts/restore_prod_copy.sh)"; exit 1; }

VERIFY_DB=lvrf_verifys5
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3351; VITE_PORT=5351; CDP_PORT=9451
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_s5.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
RUNP=client/src/pages/RunPage.tsx; FOCUS=client/src/components/AccountFocus.tsx; FRAMEC=client/src/components/AccountFrame.tsx; LIB=client/src/lib/accountFrame.ts
EDITED=("$RUNP" "$FOCUS" "$FRAMEC" "$LIB")
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
walk() {  # SECTIONS TAG LOG
  VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_PORT" OUT="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" EXP="$W/exp.json" TAG="$2" node scripts/lib/s5_walk.mjs "$1" > "$3" 2>&1 \
    || echo "FAIL  $2: the walk crashed: $(tail -3 "$3" | tr '\n' ' ')" >> "$3"
}
tally() {  # LOG — the walk's lines into this script's tally
  while IFS= read -r line; do case "$line" in PASS*) ok "${line#PASS  }" ;; FAIL*) bad "${line#FAIL  }" ;; NOTE*) echo "  $line" ;; esac; done < "$1"
  grep -q '^DONE ' "$1" || bad "the walk did not finish: $(tail -3 "$1" | tr '\n' ' ')"
}
broke() {  # SECTIONS TAG EXPECTED_FAILURE_TEXT LABEL
  sleep 4; walk "$1" "$2" "$W/$2.log"
  grep -Eq "^FAIL  $2: .*($3)" "$W/$2.log" && ok "$4" || bad "$2: not caught: $(grep -m3 '^FAIL' "$W/$2.log" | tr '\n' ' ')"
}

step "1. Typecheck, build, tokens"
(cd client && npx tsc -b) > "$W/tsc.log" 2>&1 && ok "client tsc -b" || bad "client tsc: $(head -5 "$W/tsc.log")"
node scripts/check_design_tokens.mjs > "$W/tokens.log" 2>&1 && ok "check_design_tokens: no hex outside the token files ($(tail -1 "$W/tokens.log"))" || bad "check_design_tokens: $(tail -5 "$W/tokens.log")"
H="$(grep -nE '#[0-9A-Fa-f]{3,8}\b' client/src/components/AccountFrame.tsx client/src/components/AccountFocus.tsx client/src/lib/accountFrame.ts || true)"
[ -z "$H" ] && ok "the frame's three files restate no hex value" || bad "a hex in the frame: $H"

step "2. Clone the prod copy, migrate, harden; a session; one unclassified customer account (a fixture, by route)"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" lvrf_prodcopy && migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 \
  && psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "cloned the prod copy, migrated, hardened" || { bad "clone"; exit 1; }
S="$(q "SELECT p.id FROM persons p JOIN tenants t ON t.steward_person_id = p.id LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"
HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
CODE="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d '{"institution":{"name":"Northwind Clinics (S5 frame check)"}}' "$BASE/api/account-inputs")"
[ "$CODE" = "201" ] && ok "an unclassified customer account, through the route (fixture)" || bad "new account -> $CODE"
NEW="$(node -e "console.log(require('$W/r.json').institution_id)")"
TENANT="$(q "SELECT tenant_id FROM persons WHERE id = '$S'")"
SLUG="$(q "SELECT slug FROM industries WHERE tenant_id = '$TENANT' ORDER BY (slug = 'healthcare') DESC, slug LIMIT 1")"
IND="$(q "SELECT name FROM industries WHERE tenant_id = '$TENANT' AND slug = '$SLUG'")"

step "3. What the frame must show, from SQL"
# Per account: as recorded; the headline run is the walk's engagement's (the latest one with a current outcome) latest
# locked run with no system-exercise mark; Runs (n) counts what GET /api/runs lists for the account.
q "SELECT json_build_object(
  'total_runs', (SELECT count(*) FROM value_runs WHERE deleted_at IS NULL AND tenant_id = '$TENANT'),
  'lineage', (SELECT json_build_object('table','evidence','id',id) FROM evidence WHERE institution_id IN (SELECT id FROM institutions WHERE tenant_id = '$TENANT') ORDER BY created_at LIMIT 1),
  'classify', json_build_object('id','$NEW','slug','$SLUG','name',$(printf "%s" "'${IND//\'/\'\'}'"),'note','S5 Gate A: the account is a regional operator of outpatient clinics, read from its public website (a fixture on a throwaway clone).'),
  'accounts', (SELECT json_agg(a ORDER BY a->>'label') FROM (
    SELECT json_build_object(
      'id', i.id, 'name', i.name, 'self', i.is_tenant_self, 'industry', ind.name, 'slug', ind.slug,
      'key', CASE WHEN i.is_tenant_self THEN 'self' WHEN i.id = '$NEW' THEN 'new' WHEN i.name LIKE 'Curia%' THEN 'curia' WHEN i.name LIKE 'Scotts%' THEN 'scotts' ELSE 'other' END,
      'label', CASE WHEN i.is_tenant_self THEN 'the tenant''s own account' WHEN i.id = '$NEW' THEN 'a new unclassified account' ELSE i.name END,
      'reference', EXISTS (SELECT 1 FROM reference_example_markers m WHERE m.institution_id = i.id AND m.status = 'active' AND m.deleted_at IS NULL),
      'classifiable', NOT i.is_tenant_self AND i.industry_id IS NULL AND NOT EXISTS (SELECT 1 FROM reference_example_markers m WHERE m.institution_id = i.id AND m.status = 'active' AND m.deleted_at IS NULL),
      'runs', (SELECT count(*) FROM value_runs vr JOIN engagements e ON e.id = vr.engagement_id WHERE e.institution_id = i.id AND vr.deleted_at IS NULL),
      'engagement', h.engagement_id,
      'head', CASE WHEN h.id IS NULL THEN NULL ELSE json_build_object('id', h.id, 'run_number', h.run_number, 'score', h.confidence_score, 'band', h.confidence_band) END,
      'older', (SELECT json_build_object('id', o.id, 'run_number', o.run_number) FROM value_runs o JOIN engagements e ON e.id = o.engagement_id
                 WHERE e.institution_id = i.id AND o.deleted_at IS NULL AND o.id <> h.id AND o.locked_at IS NOT NULL ORDER BY (o.run_number = h.run_number), o.run_number LIMIT 1),
      'no_confidence', CASE WHEN h.id IS NOT NULL THEN NULL
        WHEN NOT EXISTS (SELECT 1 FROM value_runs vr JOIN engagements e ON e.id = vr.engagement_id WHERE e.institution_id = i.id AND vr.deleted_at IS NULL) THEN 'No run yet: no computed confidence'
        ELSE 'No locked run yet: no computed confidence' END) AS a
    FROM institutions i LEFT JOIN industries ind ON ind.id = i.industry_id
    LEFT JOIN LATERAL (
      SELECT r.id, r.run_number, r.confidence_score, r.confidence_band, r.engagement_id FROM value_runs r
       WHERE r.engagement_id = (SELECT e.id FROM engagements e WHERE e.institution_id = i.id AND e.superseded_by_id IS NULL
                                   AND EXISTS (SELECT 1 FROM value_outcomes vo WHERE vo.engagement_id = e.id AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL)
                                 ORDER BY e.created_at DESC, e.id DESC LIMIT 1)
         AND r.deleted_at IS NULL AND r.locked_at IS NOT NULL AND lvrf_system_exercise_mark('value_runs', r.id) IS NULL
       ORDER BY r.run_number DESC LIMIT 1) h ON true
    WHERE i.deleted_at IS NULL AND i.superseded_by_id IS NULL AND i.tenant_id = '$TENANT') x))" > "$W/exp.json"
node -e "const e=require('$W/exp.json');for(const a of e.accounts)console.log('  ',a.label,'|',a.industry??'unclassified','| ref',a.reference,'| runs',a.runs,'| head',a.head?a.head.run_number+' '+a.head.score+' '+a.head.band:a.no_confidence,'| classify',a.classifiable)"
node -e "const e=require('$W/exp.json');const k=e.accounts.map(a=>a.key).sort().join();process.exit(k==='curia,new,scotts,self'&&e.accounts.find(a=>a.key==='curia').older&&e.classify.slug?0:1)" \
  && ok "the clone holds what the walk needs: the tenant's own, Curia (with an older run), Scotts, the new account; an industry to classify into ($SLUG)" || bad "the clone's accounts: $(cat "$W/exp.json" | head -c 300)"
B4_ACTS="$(q "SELECT count(*) FROM governance_acts")"; B4_EVID="$(q "SELECT count(*) FROM evidence")"; B4_REF="$(q "SELECT count(*) FROM refusals")"

(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) &
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run --window-size=1280,900 about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$VITE_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done

step "4. Through the page, as the steward by session"
walk frame,held,shared,leave,tabs,phone,keys,contrast,print,classify,classified s5 "$W/main.log"
tally "$W/main.log"

step "5. The frame never prints (the PDFs' text), and the printed documents are S3's"
for f in "$OUT"/s5_print_*.pdf; do
  [ -f "$f" ] || { bad "no PDF printed"; break; }
  T="$(pdftotext -layout "$f" - 2>/dev/null)"
  if printf '%s' "$T" | grep -E "In focus|Leave the account|You're now in|Latest locked run|Pages ▸" > /dev/null; then bad "$(basename "$f"): the frame's words are in the PDF"; else ok "$(basename "$f"): none of the frame's words in the PDF ($(pdfinfo "$f" | awk '/^Pages/{print $2}') pages)"; fi
done
ok "S3's own print checks run unchanged in the full regression (verify_s3_print_family, verify_pov_print, verify_value_case); not repeated here"

step "6. The record after the walk: one act, S1's, by the steward"
IND_ID_SET="$(q "SELECT i2.slug FROM institutions i JOIN industries i2 ON i2.id = i.industry_id WHERE i.id = '$NEW'")"
[ "$IND_ID_SET" = "$SLUG" ] && ok "the new account is classified as $SLUG" || bad "industry: '$IND_ID_SET'"
EV="$(q "SELECT count(*) FROM evidence WHERE institution_id = '$NEW' AND kind = 'observation' AND captured_by_person_id = '$S'")"
[ "$EV" = "1" ] && ok "  ...with its reasoning as one evidence row, the steward's" || bad "evidence rows for the new account: $EV"
D_EVID=$(( $(q "SELECT count(*) FROM evidence") - B4_EVID )); D_REF=$(( $(q "SELECT count(*) FROM refusals") - B4_REF ))
[ "$D_EVID" = "1" ] && [ "$D_REF" = "0" ] && ok "nothing else recorded: evidence +1, refusals +0" || bad "evidence +$D_EVID, refusals +$D_REF"
echo "  (governance acts: $B4_ACTS before, $(q "SELECT count(*) FROM governance_acts") after; S1's route records the classification as its evidence row)"

step "7. Deliberate breaks, each against the clean pass above"
# B1 — the run page declares no account: a shared link shows the run under the held account.
edit "$RUNP" "result.run.institution_id ? { kind: 'account', id: result.run.institution_id, belongs: 'this run belongs to it' } : { kind: 'unknown' });" "{ kind: 'none' });"
broke shared b1 'never the run under|frames Curia' 'B1: the run page declares no account → caught: the run shows under the held account'
restore "$RUNP"
# B2 — "Leave" keeps the focus.
edit "$FOCUS" "  const leave = useCallback(() => { setNotice(null); setHiddenAt(null); focusRef.current = null; apply(null); }, [apply]);" "  const leave = useCallback(() => { setNotice(null); setHiddenAt(null); }, []);"
broke leave b2 'it opens Accounts home with no frame|the focus is cleared' 'B2: the focus kept after "Leave" → caught'
restore "$FOCUS"
# B3 — the frame prints.
edit "$FRAMEC" '<div className="border-b border-ink bg-white print:hidden" role="region"' '<div className="border-b border-ink bg-white" role="region"'
broke print b3 'are not printed' 'B3: the frame printing → caught'
restore "$FRAMEC"
# B4 — a sideways scroll at 390.
edit "$FRAMEC" '<details ref={phone} className="group sm:hidden" data-testid="frame-phone">' '<details ref={phone} className="group min-w-[460px] sm:hidden" data-testid="frame-phone">'
broke phone b4 'no sideways scroll' 'B4: a sideways scroll at 390 → caught'
restore "$FRAMEC"
# B5 — "Classify as…" offered on a classified account (the new account, classified by the clean pass).
edit "$LIB" "    classifiable: !view.self && !reference && view.industry_id === null," "    classifiable: !view.self && !reference,"
broke classified b5 '"Classify as…" not offered' 'B5: "Classify as…" offered on a classified account → caught'
restore "$LIB"
# B6 — the confidence without its run named.
edit "$FRAMEC" '<span data-testid="frame-confidence-run">Latest locked run, run {d.confidence.run_number}:</span>' '<span data-testid="frame-confidence-run">Confidence:</span>'
broke frame b6 'the confidence names its run' 'B6: the confidence without its run → caught'
restore "$FRAMEC"
# B7 — the notice said on every page.
edit "$FOCUS" "    notice: notice && notice.at === location.key ? notice : null," "    notice,"
broke shared b7 'said once' 'B7: the "You'"'"'re now in" notice kept on the next page → caught'
restore "$FOCUS"
for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" && ok "$f byte-identical to before the run" || bad "$f differs"; done
echo "  screenshots and PDFs: $OUT"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
