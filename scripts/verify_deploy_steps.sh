#!/usr/bin/env bash
#
# lvrf-deploy.sh steps 6–8: no silent stop — local verification. Touches no
# database, no service and no network beyond a throwaway local git repo.
#
#   ./scripts/verify_deploy_steps.sh
#
# WHY. The S4 deploy (19 Nov 2026) ended after "lvrf-api is active" with no
# message and exit 7: the API was still loading its routers when step 7's
# first curl ran, and under `set -e` a failing command substitution ends the
# script on the spot (BUILD_STATUS.md, "S4 closed").
#
# HOW. As verify_deploy_reexec.sh: a bare "origin" repo and a "box" clone,
# the real scripts/lvrf-deploy.sh copied in with REPO_DIR pointed at the box.
# Every outside command the script calls is a stub on PATH: npm, npx, node,
# psql, sudo, systemctl, stat, find (GNU flags the Mac lacks) and curl. The
# curl stub refuses connections (exit 7, status 000) until STUB_UP_AFTER
# seconds after the stubbed `systemctl restart`, as the box's API does for
# 2–3 s. Cases:
#   A. the API answers 3 s after the restart: the deploy waits, runs every
#      step-7 check and ends "deploy OK" (the S4 race, fixed);
#   B. the API never answers: one clear DEPLOY FAILED line after 30 s;
#   C. the vhost refuses (curl exit 7): reported as vhost=000, not silent;
#   D. the health body lacks origin_check: reported as <none>, not silent;
#   E. an unguarded failure (step 8's find): the ERR trap names the line;
#   F. positive control: main's script before the fix (7f889b4), under the
#      same stubs as A, stops silently after "is active", exit 7 — the
#      failure Brad saw.

set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$PWD/scripts/lvrf-deploy.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
T="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_deploy_steps.XXXXXX")"
cleanup() { rm -rf "$T"; }
. scripts/lib/finish.sh
trap finish EXIT

mkdir -p "$T/bin" "$T/state"

# ---- stubs -----------------------------------------------------------------
stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$T/bin/$1"; chmod +x "$T/bin/$1"; }
stub npm  'exit 0'
stub npx  'exit 0'
stub node 'exit 0'
stub stat 'echo 9999999999'
stub sudo '"$@"'
stub psql 'case "$*" in *precheck_steward_grants*) echo 0 ;; *"FROM persons"*) echo 00000000-0000-4000-8000-000000000001 ;; esac'
stub find '[ "${STUB_FIND_FAIL:-}" = 1 ] && exit 3; case "$*" in *.js*) echo index-STUB.js ;; *.css*) echo index-STUB.css ;; esac'
stub systemctl "S=\"$T/state\""'
case "$1" in
  restart) date +%s > "$S/restarted_at" ;;
  is-active) echo active ;;
esac'
stub curl "S=\"$T/state\""'
echo "$*" >> "$S/curl.log"
now=$(date +%s); up=$(( $(cat "$S/restarted_at") + ${STUB_UP_AFTER:-0} ))
wants_code=0; case "$*" in *http_code*) wants_code=1 ;; esac
refuse() { [ "$wants_code" = 1 ] && printf 000; exit 7; }
[ "${STUB_UP_AFTER:-0}" = never ] && refuse
[ "$now" -lt "$up" ] && refuse
case "$*" in
  *https://*) [ "${STUB_VHOST_DOWN:-}" = 1 ] && refuse; printf 401 ;;
  */api/health*)
    if [ "${STUB_NO_ORIGIN:-}" = 1 ]; then body="{\"status\":\"ok\",\"actor_header\":\"off\"}"
    else body="{\"status\":\"ok\",\"db\":\"connected\",\"origin_check\":\"configured\",\"actor_header\":\"off\",\"ai_research\":\"off\"}"; fi
    case "$*" in *"/dev/null"*) ;; *) printf "%s\n" "$body" ;; esac
    [ "$wants_code" = 1 ] && printf 200 ;;
  */api/runs/*) printf 401 ;;
esac
exit 0'

# ---- the box ---------------------------------------------------------------
make_box() {  # NAME SCRIPT_SOURCE — a box clone running that script
  local n="$1" src="$2" w="$T/$1.work"
  git init -q --bare "$T/$n.git"
  git clone -q "$T/$n.git" "$w" 2>/dev/null
  mkdir -p "$w/scripts"
  grep -c '^REPO_DIR="/srv/lvrf"$' "$src" > /dev/null || { echo "REFUSING: REPO_DIR line not found in $src"; exit 1; }
  sed "s#^REPO_DIR=\"/srv/lvrf\"\$#REPO_DIR=\"$T/$n.box\"#" "$src" > "$w/scripts/lvrf-deploy.sh"
  chmod +x "$w/scripts/lvrf-deploy.sh"
  printf 'client/dist/\n.env\n' > "$w/.gitignore"
  git -C "$w" -c user.name=verify -c user.email=verify@lvrf.example add -A
  git -C "$w" -c user.name=verify -c user.email=verify@lvrf.example commit -qm v1
  git -C "$w" push -q origin HEAD:main 2>/dev/null
  git clone -q "$T/$n.git" "$T/$n.box" 2>/dev/null
  mkdir -p "$T/$n.box/client/dist/assets"
  echo '<html></html>' > "$T/$n.box/client/dist/index.html"
  echo 'DATABASE_URL=postgres://lvrf_app:stub@127.0.0.1:5432/lvrf' > "$T/$n.box/.env"
}
run() {  # NAME [VAR=VALUE ...] — run that box's deploy; prints output, then "EXIT <rc>"
  local n="$1"; shift
  rm -f "$T/state/curl.log"
  local rc=0
  env PATH="$T/bin:$PATH" "$@" "$T/$n.box/scripts/lvrf-deploy.sh" > "$T/out" 2>&1 || rc=$?
  cat "$T/out"; echo "EXIT $rc"
}
show() { echo "$1" | sed 's/^/    | /'; }

make_box new "$SRC"

echo "==> A. The API answers 3 s after the restart (the S4 race)"
START=$(date +%s); OUT="$(run new STUB_UP_AFTER=3)"; SECS=$(( $(date +%s) - START ))
show "$OUT"
echo "$OUT" | grep -q '^EXIT 0$' && ok "exit 0" || bad "exit: $(echo "$OUT" | tail -n1)"
echo "$OUT" | grep -qE 'lvrf-api is active and answering \(after [1-9][0-9]* refused tries' && ok "it waited: $(echo "$OUT" | grep -oE 'after [0-9]+ refused tries')" || bad "no wait recorded"
echo "$OUT" | grep -q 'api/health -> 200 (expect 200), origin_check=configured' && ok "health 200, origin_check configured" || bad "health line missing"
echo "$OUT" | grep -q 'actor_header=off (expect off)' && ok "actor_header off" || bad "actor_header line missing"
echo "$OUT" | grep -q 'with no session -> 401' && ok "no session -> 401" || bad "401 line missing"
echo "$OUT" | grep -q 'X-Actor-Person-Id (vendor staff), no session -> 401' && ok "header -> 401" || bad "header line missing"
echo "$OUT" | grep -q "lvrf-rule76.com/ -> 401" && ok "vhost -> 401" || bad "vhost line missing"
echo "$OUT" | grep -q '==> deploy OK' && ok "deploy OK" || bad "no deploy OK"
echo "$OUT" | grep -q 'DEPLOY FAILED' && bad "a DEPLOY FAILED line" || ok "no DEPLOY FAILED line"
[ "$SECS" -lt 10 ] && ok "done in ${SECS}s (waits only as long as the API takes)" || bad "took ${SECS}s"

echo "==> B. The API never answers"
START=$(date +%s); OUT="$(run new STUB_UP_AFTER=never)"; SECS=$(( $(date +%s) - START ))
show "$(echo "$OUT" | tail -n4)"
echo "$OUT" | grep -q '^EXIT 1$' && ok "exit 1" || bad "exit: $(echo "$OUT" | tail -n1)"
echo "$OUT" | grep -q 'DEPLOY FAILED: lvrf-api did not answer /api/health within 30s (state: active); see: journalctl -u lvrf-api -n 50' && ok "says so: did not answer within 30s" || bad "no clear failure line"
[ "$(echo "$OUT" | grep -c 'DEPLOY FAILED')" = "1" ] && ok "exactly one DEPLOY FAILED line (no trap line on a die)" || bad "DEPLOY FAILED count $(echo "$OUT" | grep -c 'DEPLOY FAILED')"
[ "$(grep -c 'max-time 2' "$T/state/curl.log")" = "60" ] && ok "60 tries" || bad "tries: $(grep -c 'max-time 2' "$T/state/curl.log")"
[ "$SECS" -ge 29 ] && [ "$SECS" -le 40 ] && ok "gave up after ${SECS}s" || bad "gave up after ${SECS}s"
echo "$OUT" | grep -q 'deploy OK' && bad "deploy OK printed" || ok "no deploy OK"

echo "==> C. The vhost refuses the connection"
OUT="$(run new STUB_VHOST_DOWN=1)"
show "$(echo "$OUT" | tail -n3)"
echo "$OUT" | grep -q '^EXIT 1$' && ok "exit 1" || bad "exit: $(echo "$OUT" | tail -n1)"
echo "$OUT" | grep -q "lvrf-rule76.com/ -> 000 (expect 401" && ok "the vhost line printed, 000" || bad "no vhost line"
echo "$OUT" | grep -q 'DEPLOY FAILED: unexpected response (health=200, api=401, header=401, vhost=000)' && ok "reported: vhost=000" || bad "not reported"

echo "==> D. The health body lacks origin_check"
OUT="$(run new STUB_NO_ORIGIN=1)"
show "$(echo "$OUT" | tail -n2)"
echo "$OUT" | grep -q '^EXIT 1$' && ok "exit 1" || bad "exit: $(echo "$OUT" | tail -n1)"
echo "$OUT" | grep -q 'origin_check=<none> (expect configured)' && ok "the health line printed, <none>" || bad "no health line"
echo "$OUT" | grep -q "DEPLOY FAILED: origin_check is '<none>', not 'configured'" && ok "reported by its own die" || bad "not reported"

echo "==> E. An unguarded failure (step 8's find fails)"
OUT="$(run new STUB_FIND_FAIL=1)"
show "$(echo "$OUT" | tail -n2)"
LINE="$(grep -n '^BUNDLE_JS=' "$SRC" | cut -d: -f1)"
echo "$OUT" | grep -q '^EXIT 0$' && bad "exit 0" || ok "non-zero exit ($(echo "$OUT" | tail -n1))"
echo "$OUT" | grep -qE "DEPLOY FAILED: line ${LINE} exited [1-9]" && ok "the trap names the line (${LINE}): $(echo "$OUT" | grep -oE 'line [0-9]+ exited [0-9]+')" || bad "no trap line for ${LINE}"

echo "==> F. Positive control: the script before the fix, under A's stubs"
git show 7f889b4:scripts/lvrf-deploy.sh > "$T/old-deploy.sh"
make_box old "$T/old-deploy.sh"
OUT="$(run old STUB_UP_AFTER=3)"
show "$(echo "$OUT" | tail -n3)"
echo "$OUT" | grep -q '^EXIT 7$' && ok "exit 7, as on the box" || bad "exit: $(echo "$OUT" | tail -n1)"
[ "$(echo "$OUT" | tail -n2 | head -n1)" = "==> lvrf-api is active" ] && ok "its last line is \"lvrf-api is active\": the silent stop reproduced" || bad "last line: $(echo "$OUT" | tail -n2 | head -n1)"
echo "$OUT" | grep -qE 'DEPLOY FAILED|api/health ->' && bad "it said something" || ok "nothing printed after it"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
