#!/usr/bin/env bash
#
# S3 (3.1; LVRF_PLAN §22, approved by Brad 19 Nov 2026 with D1–D9, C1–C9 and his mock-up changes) — the printed value
# case and POV in the CVAF family. Local verification, Gate A.
#
#   ./scripts/verify_s3_print_family.sh [out_dir]
#
# Clones `lvrf_prodcopy` to `lvrf_verifys3`, dropped on exit (KEEP_DB=1 keeps it). No server change and no migration:
# the API is this checkout's. Two clients serve it: this checkout's, and the deployed code's (main, in a temporary
# worktree), so each document's screen text can be compared word for word. Prints with headless Chrome
# (Page.printToPDF, the browser's print, O-D5). Every file a break edits is restored byte-identical.
#
# Each document (the case under the default lens, refused by the CFO lens, shown by the CFO lens (a fixture); a POV) is checked:
#   - in print media (scripts/lib/s3_walk.mjs): the cover's banners are the body pages' element, as large, as heavy, as
#     coloured (condition 1); display type carries measured numbers and headings only (change 2); every text element at
#     AA; no request outside the app's origin, fonts included (condition 2); no CSS Grid; the close in order, its
#     tagline smaller than its heading (change 3);
#   - in its PDF: on EVERY page, the banners, the FULL record hash equal to the stored payload_hash (change 1), "Page n of
#     N", the record line at the foot (change 4), no browser header or footer; the three faces embedded (condition 2);
#   - its screen text equal to the deployed code's (no content changed).
# Breaks, each with its positive control: B1 a smaller cover banner; B2 the hash dropped from the body pages; B3 a small
# gold label on paper; B4 a hex in a print piece; B5 Grid in a printed page; B6 a changed word; B9 merged or moved lines; B10 a seam on the cover; B7 a status word in
# display; B8 an outside font.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found at $CHROME"; exit 1; }
command -v pdftotext > /dev/null && command -v pdffonts > /dev/null || { echo "REFUSING: poppler not found"; exit 1; }

VERIFY_DB=lvrf_verifys3
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
PORT=3341; VITE_PORT=5341; MAIN_PORT=5342; CDP_PORT=9441; CDP_COLD=9443
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_s3.XXXXXX")"
OUT="${1:-$W/out}"; mkdir -p "$OUT"
CSS=client/src/index.css; FAM=client/src/components/print/PrintFamily.tsx; TXT=client/src/components/print/printText.ts
POVP=client/src/pages/PovPage.tsx; CASEP=client/src/pages/ValueCasePage.tsx; HTML=client/index.html; MAIN=client/src/main.tsx
EDITED=("$CSS" "$FAM" "$TXT" "$POVP" "$CASEP" "$HTML" "$MAIN")
for f in "${EDITED[@]}"; do cp "$f" "$W/$(basename "$f").orig"; done
PASS=0; FAIL=0; CHROME_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
has()  { grep "$@" > /dev/null; }   # grep -q's early exit SIGPIPEs the writer (pdftotext), failing the pipe under pipefail
by_port() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }
stop_port() { local p; p="$(by_port "$1")"; [ -n "$p" ] && kill $p 2>/dev/null || true; for _ in $(seq 1 20); do [ -z "$(by_port "$1")" ] && return 0; sleep 0.25; done; }
cleanup() {
  stop_port "$PORT"; stop_port "$VITE_PORT"; stop_port "$MAIN_PORT"
  [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
  for f in "${EDITED[@]}"; do cmp -s "$W/$(basename "$f").orig" "$f" || { cp "$W/$(basename "$f").orig" "$f"; echo "  (EXIT trap restored $f)"; }; done
  [ -d "$W/main" ] && git worktree remove --force "$W/main" > /dev/null 2>&1 || true
  git worktree prune > /dev/null 2>&1 || true
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
walk() { VITE_PORT="${2:-$VITE_PORT}" CDP_PORT="$CDP_PORT" OUT="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" node scripts/lib/s3_walk.mjs $1 | tail -1; }
# PDF checks: one line per check, PASS/FAIL, for DOC (its PDF and its walk JSON), the stored hash HASH(es).
pdfcheck() {  # NAME HASH... — every page: the banners, the hashes, "Page n of N", the record line at the foot
  python3 -I - "$OUT/$1.pdf" "$OUT/$1.json" "${@:2}" <<'PY'
import sys, subprocess, json, re, os
pdf, js, *hashes = sys.argv[1:]; r = json.load(open(js))
info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
pages = int(re.search(r'Pages:\s+(\d+)', info).group(1)); H = float(re.search(r'Page size:\s+[\d.]+ x ([\d.]+)', info).group(1))
nows = lambda s: re.sub(r'\s+', '', s)
ban = [b['text'] for b in (r['banners']['body'] or [])]
fails = {'banners': [], 'hash': [], 'pageno': [], 'foot': [], 'whole': [], 'browser': [], 'seam': []}
rl = [nows(l) for l in (r.get('record_line') or '').split('\n') if l.strip()]
for p in range(1, pages + 1):
    t = subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), '-layout', pdf, '-'], capture_output=True, text=True).stdout; T = nows(t)
    if os.environ.get('NO_BANNERS') == '1':
        if ban or 'UNVERIFIED' in T or 'OUTSIDE-IN' in T: fails['banners'].append(p)
    elif not ban or not all(nows(b) in T for b in ban): fails['banners'].append(p)
    if not all(h in T for h in hashes): fails['hash'].append(p)
    if nows(f'Page {p} of {pages}') not in T: fails['pageno'].append(p)
    bb = subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), '-bbox', pdf, '-'], capture_output=True, text=True).stdout
    ys = [float(y) for y, w in re.findall(r'yMin="([\d.]+)"[^>]*>([^<]*)</word>', bb) if w[:12] == hashes[0][:12]]
    Tw = T.replace(nows(f'Page {p} of {pages}'), '', 1)  # the page number can fall between its words
    if not rl or not all(l in Tw for l in rl): fails['whole'].append(p)  # no line of the record line clipped
    if not ys or max(ys) < H - 1.4 * 72: fails['foot'].append(p)  # in the bottom margin band (at most 1.4in; a POV's is the tallest)
    if re.search(r'\b\d{1,2}/\d{1,2}/\d{2}\b', t) or re.search(r'^\s*LVRF\s*$', t, re.M) or 'localhost:' in t: fails['browser'].append(p)
name = pdf.split('/')[-1]
# The cover's ink, unbroken: from the panel's top to the page's foot, no row without one ink pixel in it (a seam: even
# a grey antialiased one; a text row always keeps ink between its letters). At 144dpi, so a half-point edge shows.
pgm = subprocess.run(['pdftoppm', '-gray', '-r', '144', '-f', '1', '-l', '1', pdf], capture_output=True).stdout
hdr = pgm.split(b'\n', 3); w, h = map(int, hdr[1].split()); px = hdr[3]
light = [y / 2 for y in range(int(h * 0.3), h) if min(px[y * w:(y + 1) * w]) > 20]
if light: fails['seam'].append(1)
def line(k, what):
    print(('  PASS  ' if not fails[k] else '  FAIL  ') + f'{name}: {what} on every one of its {pages} pages' + (f' — missing on {fails[k]}' if fails[k] else ''))
line('banners', 'no disclosure banner (verified, on customer-side evidence: nothing to disclose)' if os.environ.get('NO_BANNERS') == '1' else 'the disclosure banners'); line('hash', f'the full record hash{"es" if len(hashes) > 1 else ""} ({", ".join(h[:12] + "…" for h in hashes)}), as stored')
line('pageno', '"Page n of N"'); line('foot', 'the record line at the foot of the page'); line('whole', 'every line of the record line, whole (none clipped)'); line('browser', 'no browser header or footer')
print(('  PASS  ' if not fails['seam'] else '  FAIL  ') + f'{name}: the cover\'s ink unbroken from its panel to the page foot' + (f' — light rows at {light[:3]}' if fails['seam'] else ''))
PY
}
domcheck() {  # NAME — the walk's JSON
  node -e "
const r = require('$OUT/$1.json'); const L = (c, m) => console.log((c ? '  PASS  ' : '  FAIL  ') + '$1: ' + m);
if (r.error) { L(false, r.error); process.exit(0); }
const sig = (a) => JSON.stringify((a || []).map((b) => [b.id, b.text]));
const cov = r.banners.cover || [], body = r.banners.body || [];
L((cov.length > 0 || process.env.NO_BANNERS === '1') && sig(cov) === sig(body) && cov.every((b, i) => b.size >= body[i].size && b.weight >= body[i].weight && b.color === body[i].color && b.family === body[i].family),
  'the cover carries the body pages\' banners, as large, as heavy, in the same face and colours (' + body.map((b) => b.id.replace('banner-', '') + ' ' + b.size + 'px').join(', ') + ')');
L(r.display.length === 0, 'display type carries measured numbers and headings only' + (r.display.length ? ': ' + JSON.stringify(r.display.slice(0, 3)) : ''));
L(r.contrast.bad.length === 0, 'every one of ' + r.contrast.checked + ' text elements at AA on its background' + (r.contrast.bad.length ? ': ' + JSON.stringify(r.contrast.bad.slice(0, 3)) : ''));
L(r.outside_requests.length === 0 && r.font_requests.length > 0 && r.font_requests.every((u) => /^http:\/\/localhost:\d+\/fonts\//.test(u)), 'no request outside the app; its ' + r.font_requests.length + ' font requests all to the app\'s own /fonts/' + (r.outside_requests.length ? ': ' + r.outside_requests.slice(0, 2).join(' ') : ''));
L(r.grid === 0, 'no CSS Grid in the printed document');
L(r.cover === true, 'the cover prints');
L(r.close && r.close.order && r.close.tagline < r.close.heading, 'the close: the disclaimer under its heading, then the tagline, smaller (' + (r.close ? r.close.tagline + 'px < ' + r.close.heading + 'px' : 'none') + ')');
"
}
fontcheck() {  # NAME
  local f; f="$(pdffonts "$OUT/$1.pdf" | tail -n +3 | awk '{print $1}' | sed 's/^[A-Z]*+//' | sort -u | tr '\n' ' ')"
  printf '%s' "$f" | grep -q BebasNeue-Regular && printf '%s' "$f" | grep -q 'Barlow-Regular' && printf '%s' "$f" | grep -q 'BarlowCondensed-SemiBold' \
    && ok "$1.pdf embeds Bebas Neue, Barlow and Barlow Condensed (fonts: $f)" || bad "$1.pdf fonts: $f"
}
textcheck() {  # NAME
  local nl; nl="$(wc -l < "$OUT/$1.screen.txt" | tr -d ' ')"
  [ "$nl" -ge 20 ] || { bad "$1: its screen text is $nl line(s): flattened, not the rendered lines"; return; }
  if cmp -s "$OUT/$1.screen.txt" "$OUT/$1.main.txt"; then ok "$1: its screen text is the deployed code's, word for word ($(wc -l < "$OUT/$1.screen.txt" | tr -d ' ') lines)"
  else bad "$1: its screen text differs from the deployed code's: $(diff "$OUT/$1.main.txt" "$OUT/$1.screen.txt" | head -4 | tr '\n' ' ')"; fi
}
inspect() {  # PATH NAME [HASH...]
  walk "inspect $1 $2" > "$OUT/$2.json"
  run_dom "$2"; [ -f "$OUT/$2.pdf" ] && pdfcheck "$2" "${@:3}" > "$W/pdf.out" && { cat "$W/pdf.out"; PASS=$((PASS + $(grep -c '^  PASS' "$W/pdf.out" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$W/pdf.out" || true))); } || true
}
tally() { PASS=$((PASS + $(grep -c '^  PASS' "$1" || true))); FAIL=$((FAIL + $(grep -c '^  FAIL' "$1" || true))); }
run_dom() { domcheck "$1" > "$W/dom.out"; cat "$W/dom.out"; tally "$W/dom.out"; }

step "1. Typecheck, lint, tokens"
npx tsc -p tsconfig.json --noEmit && ok "server tsc (no server change)" || bad "server tsc"
(cd client && npx tsc -b) && ok "client tsc -b" || bad "client tsc -b"
LINT="$(cd client && npm run -s lint 2>&1 | grep -c 'warning\|error' || true)"; [ "$LINT" = "1" ] && ok "client lint: the one existing warning (ActorContext.tsx), nothing new" || bad "client lint: $LINT lines"
node scripts/check_design_tokens.mjs > "$W/tok.out" && ok "$(cat "$W/tok.out")" || bad "tokens: $(cat "$W/tok.out")"
GRIDS="$(grep -nE "className=\"[^\"]*\bgrid\b" "$POVP" "$CASEP" client/src/components/print/*.tsx || true)"; [ -z "$GRIDS" ] && ok "no Grid class in the two printed pages or the print pieces (C7)" || bad "grid: $GRIDS"
[ "$(cat "$HTML" "$CSS" | grep -c 'fonts.googleapis\|fonts.gstatic' || true)" = "0" ] && ok "no Google Fonts link in index.html or index.css" || bad "a Google Fonts link remains"
for f in barlow-condensed/BarlowCondensed-SemiBold.ttf barlow-condensed/OFL.txt barlow/Barlow-Regular.ttf barlow/OFL.txt bebas-neue/BebasNeue-Regular.ttf bebas-neue/OFL.txt; do [ -s "client/public/fonts/$f" ] || bad "missing client/public/fonts/$f"; done; ok "each face self-hosted in client/public/fonts/, with its OFL licence"
grep -q '^| condensed | Barlow Condensed |' CLAUDE.md && grep -q 'display numerals \*\*on ink only\*\*' CLAUDE.md && ok "CLAUDE.md's token table names the condensed face (C4) and gold numerals on ink only (C9)" || bad "CLAUDE.md tokens"

step "2. Clone; servers (this checkout's client, and the deployed code's from a worktree of main)"
dropdb --if-exists "$VERIFY_DB"; make_clone "$VERIFY_DB" lvrf_prodcopy || { bad "clone"; exit 1; }
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 || { bad "migrate"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/hardening.sql > "$W/hard.log" 2>&1 && ok "cloned, migrated (nothing new), hardened" || { bad "hardening"; exit 1; }
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
S="$(q "SELECT steward_person_id FROM tenants WHERE steward_person_id IS NOT NULL LIMIT 1")"; S_EMAIL="$(q "SELECT email FROM persons WHERE id = '$S'")"
PW="verification-password-$(date +%s)"; HASH="$(node -e "import('argon2').then(a=>a.default.hash(process.argv[1],{type:a.default.argon2id})).then(h=>console.log(h))" "$PW")"
q "UPDATE person_credentials SET revoked_at = now() WHERE person_id = '$S' AND revoked_at IS NULL" > /dev/null
q "INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ('$S', '$HASH', 'verify')" > /dev/null
(LVRF_PUBLIC_ORIGIN="http://localhost:$VITE_PORT" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 < /dev/null &)
(cd client && LVRF_API_PROXY="$BASE" npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1 < /dev/null &)
git worktree add -q "$W/main" main 2> /dev/null && ln -s "$PWD/client/node_modules" "$W/main/client/node_modules" \
  && (cd "$W/main/client" && LVRF_API_PROXY="$BASE" npx vite --port "$MAIN_PORT" --strictPort > "$W/vite_main.log" 2>&1 < /dev/null &) \
  && ok "the deployed code's client (main, $(git rev-parse --short main)) from a worktree, on $MAIN_PORT" || bad "main worktree"
"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run about:blank > /dev/null 2>&1 & CHROME_PID=$!
for _ in $(seq 1 80); do /usr/bin/curl -s -o /dev/null "$BASE/api/health" && /usr/bin/curl -s -o /dev/null "http://localhost:$VITE_PORT/" && /usr/bin/curl -s -o /dev/null "http://localhost:$MAIN_PORT/" && /usr/bin/curl -s -o /dev/null "http://127.0.0.1:$CDP_PORT/json/version" && break; sleep 0.5; done
ok "API $PORT, vite $VITE_PORT and $MAIN_PORT, Chrome $CDP_PORT"
R2="$(q "SELECT id FROM value_runs WHERE id::text LIKE '98a71a82%'")"; H2="$(q "SELECT payload_hash FROM value_runs WHERE id = '$R2'")"
CU="$(q "SELECT id FROM institutions WHERE name = 'Curia'")"
# No run on the copy (nor on prod, 19 Nov 2026) meets the CFO lens: no outcome has a measured actual, and Curia's runs
# are reference examples, which the lens never reads. So the shown case is a synthetic fixture (Brad, 19 Nov 2026):
# a fictional account, its actual measured from a system export and verified by a named customer-side person, built
# through the routes on this clone only (scripts/lib/s3_cfo_fixture.sh). The sealed-run baseline is taken after it.
. scripts/lib/s3_cfo_fixture.sh
cfo_fixture && ok "the fixture: a fictional account's case, measured from a system export, verified by a named customer-side person; run ${FX_RUN:0:8} locked" || { bad "the CFO fixture"; exit 1; }
FXC="$(q "SELECT confidence_score::float >= 55 AND confidence_score::float >= (SELECT min_confidence_score::float FROM lens_policies WHERE tenant_id = (SELECT tenant_id FROM institutions WHERE id = '$FX_INST') AND persona = 'cfo' AND deleted_at IS NULL AND superseded_by_id IS NULL LIMIT 1) FROM value_runs WHERE id = '$FX_RUN'")"
[ "$FXC" = "t" ] && ok "  ...its computed confidence, $(q "SELECT trim_scale(confidence_score) FROM value_runs WHERE id = '$FX_RUN'") / 100, meets the ratified CFO lens's minimum" || bad "  ...confidence: $(q "SELECT confidence_score FROM value_runs WHERE id = '$FX_RUN'")"
walk "probe /api/value-runs/$FX_RUN/case?lens=cfo" | has '"refused":false' && ok "  ...and the CFO lens shows it (refused: false), read through the app's session" || bad "  ...the lens: $(walk "probe /api/value-runs/$FX_RUN/case?lens=cfo")"
RUNS0="$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")"
POVH="$(q "SELECT string_agg(payload_hash, ' ') FROM (SELECT DISTINCT ON (g.id) r.payload_hash FROM value_runs r JOIN engagements g ON g.id = r.engagement_id WHERE g.institution_id = '$CU' AND r.locked_at IS NOT NULL ORDER BY g.id, (lvrf_system_exercise_mark('value_runs', r.id) IS NOT NULL), r.run_number DESC) x")"

step "3. The four documents"
inspect "/runs/$R2/case" case_default "$H2"; fontcheck case_default
inspect "/runs/$R2/case?lens=cfo" case_cfo_refused "$H2"; fontcheck case_cfo_refused
inspect "/accounts/$CU/pov" pov_curia $POVH; fontcheck pov_curia
[ "$(q "SELECT lvrf_run_banners('$FX_RUN')->>'outside_in' || '|' || (lvrf_run_banners('$FX_RUN')->>'unverified')")" = "false|false" ] \
  && ok "the shown case's banners, as the database reads them: neither outside-in nor unverified, so the case prints none" || bad "the shown case's banners: $(q "SELECT lvrf_run_banners('$FX_RUN')")"
export NO_BANNERS=1; inspect "/runs/$FX_RUN/case?lens=cfo" case_cfo_shown "$FX_HASH"; unset NO_BANNERS; fontcheck case_cfo_shown
pdftotext "$OUT/case_cfo_shown.pdf" - | tr -s ' \n' ' ' | has "Its measured result was verified by a named person at Northwind Fabrication (fictional) against their own records." \
  && ok "the shown case's close prints the verified wording" || bad "the shown case's close: not the verified wording"
walk "text /runs/$R2/case case_default.main" "$MAIN_PORT" > /dev/null; mv "$OUT/case_default.main.screen.txt" "$OUT/case_default.main.txt"
walk "text /runs/$R2/case?lens=cfo case_cfo_refused.main" "$MAIN_PORT" > /dev/null; mv "$OUT/case_cfo_refused.main.screen.txt" "$OUT/case_cfo_refused.main.txt"
walk "text /accounts/$CU/pov pov_curia.main" "$MAIN_PORT" > /dev/null; mv "$OUT/pov_curia.main.screen.txt" "$OUT/pov_curia.main.txt"
walk "text /runs/$FX_RUN/case?lens=cfo case_cfo_shown.main" "$MAIN_PORT" > /dev/null; mv "$OUT/case_cfo_shown.main.screen.txt" "$OUT/case_cfo_shown.main.txt"
# §30 (Brad, 24 Nov 2026), declared: the card title "Share for review (D-M21)" reads "Share for review". The deployed
# code's text gets that one substitution, counted; every other line must still match word for word.
NDM=0; for t in case_default case_cfo_refused pov_curia case_cfo_shown; do c="$(grep -c '^Share for review (D-M21)$' "$OUT/$t.main.txt" || true)"; NDM=$((NDM + c)); sed -i '' 's/^Share for review (D-M21)$/Share for review/' "$OUT/$t.main.txt"; done
[ "$NDM" -ge 1 ] && ok "§30's declared change: \"Share for review (D-M21)\" → \"Share for review\" in the deployed code's text ($NDM line(s)); nothing else is allowed to differ" || ok "§30's wording is already the deployed code's (no substitution made)"
for n in case_default case_cfo_refused case_cfo_shown pov_curia; do textcheck "$n"; done
pdftotext "$OUT/case_cfo_shown.pdf" - | has "Why the CFO lens refuses" && bad "the shown case prints a refusal box" || ok "the case the CFO lens shows prints no refusal box"
[ "$(grep -c 'testid="cfo-refusal"' "$CASEP")" -ge 1 ] && pdftotext "$OUT/case_cfo_refused.pdf" - | has "Why the CFO lens refuses" && ok "the CFO lens's refusal prints, in its ink box" || bad "refusal box"
pdftotext -f 1 -l 1 "$OUT/case_default.pdf" - | tr -s ' \n' ' ' | has -i "VALUE CASE" && pdftotext -f 1 -l 1 "$OUT/pov_curia.pdf" - | tr -s ' \n' ' ' | has -i "POINT OF VIEW" && ok "page 1 of each is its cover, naming the document" || bad "covers"
pdftotext "$OUT/case_default.pdf" - | tr -s ' \n' ' ' | has "About this document This document renders from sealed run 2, record hash $H2. It is unverified until a named person at Skillsoft verifies" \
  && ok "the case's disclaimer as drafted, under its heading, naming the full hash" || bad "disclaimer text"

step "3b. A person's first print (S3 Gate C finding, Brad, 19 Nov 2026)"
# Brad's first print of run 3's default lens had no record line, kicker or tagline (all Barlow Condensed) and a white
# foot band. The cause: Barlow Condensed, used only in print, was first fetched when the print began; under
# font-display "block" its text laid out invisible and the browser's print did not wait; and the band is the page's
# background, which the dialog paints only with "Background graphics" on (its default is off). Gate A missed it: its
# walk emulated print media and read the DOM before printing (loading the face), headless printToPDF waits for fonts,
# and it always printed with backgrounds on. Headless Chrome cannot reproduce the dialog's timing, so the walk checks
# the invariants that failed, on the page as loaded on screen, in a fresh profile, before any print:
coldwalk() {  # NAME PATH -> $OUT/NAME.pdf (Background graphics off) and $OUT/NAME.json
  local prof; prof="$(mktemp -d "$W/cold.XXXXXX")"
  "$CHROME" --headless=new --remote-debugging-port="$CDP_COLD" --user-data-dir="$prof" --no-first-run about:blank > /dev/null 2>&1 & local cp=$!
  for _ in $(seq 1 40); do /usr/bin/curl -s -o /dev/null "http://127.0.0.1:$CDP_COLD/json/version" && break; sleep 0.25; done
  VITE_PORT="$VITE_PORT" CDP_PORT="$CDP_COLD" OUT="$OUT" S_EMAIL="$S_EMAIL" PW="$PW" PRINT_BG=0 node scripts/lib/s3_walk.mjs cold "$2" "$1" > /dev/null 2>&1 || true
  kill "$cp" 2>/dev/null; wait "$cp" 2>/dev/null || true
}
coldcheck() {  # NAME HASH — the invariants, then the print's every page
  node -e "
const r = require('$OUT/$1.json'); const L = (c, m) => console.log((c ? '  PASS  ' : '  FAIL  ') + '$1: ' + m);
L(['Barlow Condensed 400', 'Barlow Condensed 600'].every((f) => r.loaded.includes(f)), 'Barlow Condensed (400, 600) loaded on the page as it stands, before any print (loaded: ' + r.loaded.join(', ') + ')');
const blk = r.displays.filter((d) => / block\$/.test(d));
L(r.displays.length > 0 && blk.length === 0, 'no face set to font-display block, so a face still loading never prints invisible' + (blk.length ? ': ' + blk.join(', ') : ''));
" > "$W/cold.out"; cat "$W/cold.out"; tally "$W/cold.out"
  pdfcheck "$1" "$2" > "$W/coldpdf.out"; grep -E "hash|record line|ink unbroken|banners" "$W/coldpdf.out" | sed 's/^\(  [A-Z]*  \)/\1(Background graphics off) /' > "$W/coldpdf.sel"; cat "$W/coldpdf.sel"; tally "$W/coldpdf.sel"
}
coldwalk cold_default "/runs/$R2/case"; coldcheck cold_default "$H2"

step "4. Breaks, each with its positive control"
# B1: a cover banner smaller than the body pages'.
printf "\n@media print { [data-testid='cover-banners'] [data-testid='banners'] { font-size: 8px; } }\n" >> "$CSS"; sleep 3
walk "inspect /runs/$R2/case b1" > "$OUT/b1.json"; domcheck b1 | grep -q "FAIL  b1: the cover carries" && ok "B1 break: a cover banner at 8px against the body's 10.5px is caught" || bad "B1 not caught"
restore "$CSS"; walk "inspect /runs/$R2/case b1c" > "$OUT/b1c.json"; domcheck b1c | grep -q "PASS  b1c: the cover carries" && ok "B1 control: restored, the cover's banners match" || bad "B1 control"
# B2: the hash dropped from the body pages' record line.
edit "$FAM" '{`@page letter { margin-bottom: ${foot.body}pt; @bottom-left { content: ${content}; } } `' '{`@page letter { margin-bottom: ${foot.body}pt; @bottom-left { content: "no record line"; } } `'; sleep 3
walk "inspect /runs/$R2/case b2" > "$OUT/b2.json"; pdfcheck b2 "$H2" | grep -q "FAIL  b2.pdf: the full record hash" && ok "B2 break: the hash dropped from the body pages is caught, page by page" || bad "B2 not caught"
restore "$FAM"; walk "inspect /runs/$R2/case b2c" > "$OUT/b2c.json"; pdfcheck b2c "$H2" | grep -q "PASS  b2c.pdf: the full record hash" && ok "B2 control: restored, the full hash on every page" || bad "B2 control"
# B3: a small gold label on paper.
edit "$TXT" "print:tracking-[.2em] print:text-gold-ink'" "print:tracking-[.2em] print:text-gold'"; sleep 3
walk "inspect /runs/$R2/case b3" > "$OUT/b3.json"; domcheck b3 | grep -q "FAIL  b3: every one of" && ok "B3 break: the kicker in gold on paper (2.40:1) is caught by the contrast check" || bad "B3 not caught"
restore "$TXT"; walk "inspect /runs/$R2/case b3c" > "$OUT/b3c.json"; domcheck b3c | grep -q "PASS  b3c: every one of" && ok "B3 control: restored, --gold-ink, at AA" || bad "B3 control"
# B4: a hex in a print piece.
edit "$FAM" 'data-testid="cover-kicker">' 'data-testid="cover-kicker" style={{ color: "#C9A24A" }}>'
node scripts/check_design_tokens.mjs > "$W/tok.out" && bad "B4 not caught" || { grep -q "HEX in client/src/components/print/PrintFamily.tsx" "$W/tok.out" && ok "B4 break: a hex in PrintFamily.tsx is caught by check_design_tokens" || bad "B4: $(cat "$W/tok.out")"; }
restore "$FAM"; node scripts/check_design_tokens.mjs > /dev/null && ok "B4 control: restored, no hex" || bad "B4 control"
# B5: Grid in a printed page.
edit "$POVP" '<ol className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0 [&>li]:min-w-[calc(50%-0.375rem)] sm:flex-nowrap sm:[&>li]:min-w-0 sm:[&>li]:flex-1">' '<ol className="m-0 mt-1 grid list-none grid-cols-2 gap-1.5 p-0 sm:grid-cols-7">'; sleep 6
walk "inspect /accounts/$CU/pov b5" > "$OUT/b5.json"; domcheck b5 | grep -q "FAIL  b5: no CSS Grid" && grep -qE 'className="[^"]*\bgrid\b' "$POVP" && ok "B5 break: Grid in the POV's spine stages is caught, in print and in the source" || bad "B5 not caught (grid elements in print: $(node -e "console.log(require('$OUT/b5.json').grid)"))"
restore "$POVP"
# B6: a changed word in the content.
edit "$CASEP" '>What we need from you: the asks</h2>' '>What we need from you: asks</h2>'; sleep 3
walk "inspect /runs/$R2/case b6" > "$OUT/b6.json"; cp "$OUT/case_default.main.txt" "$OUT/b6.main.txt"; ( textcheck b6 ) > "$W/b6.out" || true
grep -q "FAIL  b6: its screen text differs" "$W/b6.out" && ok "B6 break: one word removed from a heading is caught by the comparison with the deployed code" || bad "B6 not caught: $(cat "$W/b6.out")"
restore "$CASEP"
# B9: the content's lines, not only its words. B9a merges lines (the glossary's entries run together as one line, the
# same words in the same order); B9b moves a block (the sources after the glossary). Each with its positive control.
GL='<div key={t} className="mb-1"><dt className="inline font-semibold">{t}: </dt><dd className="inline m-0 text-ink-70">{def}</dd></div>'
edit "$CASEP" "$GL" "$(printf '%s' "$GL" | sed 's/<div key={t} className="mb-1">/<span key={t} className="mb-1">/; s/<\/div>$/<\/span>/')"; sleep 3
walk "inspect /runs/$R2/case b9a" > "$OUT/b9a.json"; cp "$OUT/case_default.main.txt" "$OUT/b9a.main.txt"; ( textcheck b9a ) > "$W/b9a.out" || true
cmp -s <(tr -d ' \n' < "$OUT/b9a.screen.txt") <(tr -d ' \n' < "$OUT/b9a.main.txt") && grep -q "FAIL  b9a: its screen text differs" "$W/b9a.out" \
  && ok "B9a break: the glossary's lines merged ($(wc -l < "$OUT/b9a.main.txt" | tr -d ' ') lines to $(wc -l < "$OUT/b9a.screen.txt" | tr -d ' '); every character the same and in order) is caught by the line comparison" || bad "B9a not caught: $(cat "$W/b9a.out")"
restore "$CASEP"; walk "inspect /runs/$R2/case b9ac" > "$OUT/b9ac.json"; cp "$OUT/case_default.main.txt" "$OUT/b9ac.main.txt"
( textcheck b9ac ) > "$W/b9ac.out" || true; grep -q "PASS  b9ac: its screen text" "$W/b9ac.out" && ok "B9a control: restored, the lines match the deployed code's" || bad "B9a control: $(cat "$W/b9ac.out")"
python3 - "$CASEP" <<'PY'
import sys, re; p = sys.argv[1]; s = open(p).read()
src = re.search(r"\n            \{notes\.length > 0 && \(\n              <Section title=\"Sources\".*?</Section>\)\}\n", s, re.S).group(0)
glo = re.search(r"\n            <Section title=\"Glossary\".*?</Section>\n", s, re.S).group(0)
assert s.count(src) == 1 and s.count(glo) == 1 and s.index(src) < s.index(glo)
open(p, 'w').write(s.replace(src + glo, glo + src) if (src + glo) in s else s.replace(src, '').replace(glo, glo + src))
PY
sleep 3
walk "inspect /runs/$R2/case b9b" > "$OUT/b9b.json"; cp "$OUT/case_default.main.txt" "$OUT/b9b.main.txt"; ( textcheck b9b ) > "$W/b9b.out" || true
cmp -s <(sort "$OUT/b9b.screen.txt") <(sort "$OUT/b9b.main.txt") && grep -q "FAIL  b9b: its screen text differs" "$W/b9b.out" \
  && ok "B9b break: the sources moved after the glossary, every line the same, is caught by the line comparison" || bad "B9b not caught: $(cat "$W/b9b.out")"
restore "$CASEP"; walk "inspect /runs/$R2/case b9bc" > "$OUT/b9bc.json"; cp "$OUT/case_default.main.txt" "$OUT/b9bc.main.txt"
( textcheck b9bc ) > "$W/b9bc.out" || true; grep -q "PASS  b9bc: its screen text" "$W/b9bc.out" && ok "B9b control: restored, the lines match the deployed code's" || bad "B9b control: $(cat "$W/b9bc.out")"
# B10: white under the cover again (the page wrapper printed white, as before S3's fix): the seam check catches it.
edit "$CASEP" 'print:min-h-0 print:bg-transparent" data-testid="value-case"' 'print:min-h-0 print:bg-white" data-testid="value-case"'; sleep 3
walk "inspect /runs/$R2/case b10" > "$OUT/b10.json"; pdfcheck b10 "$H2" | grep -q "FAIL  b10.pdf: the cover's ink unbroken" && ok "B10 break: white under the cover is caught as a seam above its ink band" || bad "B10 not caught"
restore "$CASEP"; walk "inspect /runs/$R2/case b10c" > "$OUT/b10c.json"; pdfcheck b10c "$H2" | grep -q "PASS  b10c.pdf: the cover's ink unbroken" && ok "B10 control: restored, the cover's ink unbroken" || bad "B10 control"
# F1-F3 (S3 Gate C finding): the default lens of a real-shaped run (run 2), printed as a person's first print.
edit "$MAIN" "void loadPrintFonts()" "void 0"; sleep 3
coldwalk f1 "/runs/$R2/case"; coldcheck f1 "$H2" > "$W/f1.out" 2>&1 || true
grep -q "FAIL  f1: Barlow Condensed (400, 600) loaded" "$W/f1.out" && ok "F1 break: the print faces not loaded at start is caught: the face is not ready before the print" || bad "F1 not caught: $(head -3 "$W/f1.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/f1.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/f1.out" || true)))
restore "$MAIN"; coldwalk f1c "/runs/$R2/case"; coldcheck f1c "$H2" > "$W/f1c.out" 2>&1 || true
grep -q "PASS  f1c: Barlow Condensed (400, 600) loaded" "$W/f1c.out" && ok "F1 control: restored, the face loaded before any print" || bad "F1 control: $(head -3 "$W/f1c.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/f1c.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/f1c.out" || true)))
python3 - "$CSS" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read(); a = "font-family: 'Barlow Condensed'; font-style: normal; font-weight: 600; font-display: swap;"
assert s.count(a) == 1; open(p, 'w').write(s.replace(a, a.replace('swap', 'block')))
PY
sleep 3; coldwalk f2 "/runs/$R2/case"; coldcheck f2 "$H2" > "$W/f2.out" 2>&1 || true
grep -q "FAIL  f2: no face set to font-display block" "$W/f2.out" && ok "F2 break: Barlow Condensed back on font-display block is caught" || bad "F2 not caught: $(head -3 "$W/f2.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/f2.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/f2.out" || true)))
restore "$CSS"; coldwalk f2c "/runs/$R2/case"; coldcheck f2c "$H2" > "$W/f2c.out" 2>&1 || true
grep -q "PASS  f2c: no face set to font-display block" "$W/f2c.out" && ok "F2 control: restored, every face on font-display swap" || bad "F2 control: $(head -3 "$W/f2c.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/f2c.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/f2c.out" || true)))
edit "$CSS" "  html:has([data-testid='print-cover']) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" "  html:has([data-testid='print-cover']) { }"; sleep 3
coldwalk f3 "/runs/$R2/case"; coldcheck f3 "$H2" > "$W/f3.out" 2>&1 || true
grep -q "FAIL  (Background graphics off) f3.pdf: the cover's ink unbroken" "$W/f3.out" && ok "F3 break: the root's exact colours removed is caught: with Background graphics off the cover's foot band prints white" || bad "F3 not caught: $(grep ink "$W/f3.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/f3.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/f3.out" || true)))
restore "$CSS"; coldwalk f3c "/runs/$R2/case"; coldcheck f3c "$H2" > "$W/f3c.out" 2>&1 || true
grep -q "PASS  (Background graphics off) f3c.pdf: the cover's ink unbroken" "$W/f3c.out" && ok "F3 control: restored, the band prints ink with Background graphics off" || bad "F3 control: $(grep ink "$W/f3c.out")"
FAIL=$((FAIL - $(grep -c '^  FAIL' "$W/f3c.out" || true))); PASS=$((PASS - $(grep -c '^  PASS' "$W/f3c.out" || true)))
# B7: a status word in display type.
edit "$FAM" ': <div className="font-condensed text-[9pt] font-semibold uppercase leading-[25pt] tracking-[.08em] text-ink-70" data-testid="print-stat-words">' ': <div className="font-display text-[25pt] leading-none text-ink" data-testid="print-stat-words">'; sleep 3
walk "inspect /runs/$R2/case b7" > "$OUT/b7.json"; domcheck b7 | grep -q "FAIL  b7: display type" && ok "B7 break: \"not committed\" in Bebas display is caught" || bad "B7 not caught"
restore "$FAM"; walk "inspect /runs/$R2/case b7c" > "$OUT/b7c.json"; domcheck b7c | grep -q "PASS  b7c: display type" && ok "B7 control: restored, status words at label size" || bad "B7 control"
# B8: an outside font.
edit "$HTML" '</head>' '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&display=swap" /></head>'; sleep 3
walk "inspect /runs/$R2/case b8" > "$OUT/b8.json"; domcheck b8 | grep -q "FAIL  b8: no request outside" && ok "B8 break: a Google Fonts link is caught as an outside request at print time" || bad "B8 not caught"
restore "$HTML"; walk "inspect /runs/$R2/case b8c" > "$OUT/b8c.json"; domcheck b8c | grep -q "PASS  b8c: no request outside" && ok "B8 control: restored, no outside request" || bad "B8 control"

step "5. Nothing written"
[ "$(q "SELECT md5(string_agg(md5(r::text), '' ORDER BY id)) FROM value_runs r")" = "$RUNS0" ] && ok "every sealed run byte-identical" || bad "a run changed"

echo
echo "==> $PASS passed, $FAIL failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
