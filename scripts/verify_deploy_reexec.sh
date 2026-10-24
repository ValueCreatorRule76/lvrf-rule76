#!/usr/bin/env bash
#
# lvrf-deploy.sh's self re-exec — local verification. Touches no database,
# no service, no network beyond a throwaway local git repo.
#
#   ./scripts/verify_deploy_reexec.sh
#
# HOW. A temp dir holds a bare "origin" repo and a "box" clone. The real
# scripts/lvrf-deploy.sh is copied in with ONE line changed — REPO_DIR,
# pointed at the box clone instead of /srv/lvrf — and committed there. A stub
# `npm` on PATH prints and exits non-zero, so every run stops at step 3
# (npm ci) right after the logic under test; nothing is built, restarted or
# deployed. Then:
#   A. a pull that CHANGES the script: exactly one re-exec; the new version
#      runs, skips the pull, and carries the first run's old HEAD;
#   B. a pull that does NOT change the script: no re-exec;
#   C. LVRF_DEPLOY_REEXEC=1 without the old HEAD: refused;
#   D. a re-run whose file is not HEAD's copy: refused — the guard that
#      makes a second re-exec impossible.

set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$PWD/scripts/lvrf-deploy.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
T="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_deploy_reexec.XXXXXX")"
cleanup() { rm -rf "$T"; }
. scripts/lib/finish.sh
trap finish EXIT

git init -q --bare "$T/origin.git"
git clone -q "$T/origin.git" "$T/work" 2>/dev/null
mkdir -p "$T/work/scripts" "$T/bin"
grep -c '^REPO_DIR="/srv/lvrf"$' "$SRC" > /dev/null || { echo "REFUSING: REPO_DIR line not found in $SRC"; exit 1; }
sed "s#^REPO_DIR=\"/srv/lvrf\"\$#REPO_DIR=\"$T/box\"#" "$SRC" > "$T/work/scripts/lvrf-deploy.sh"
chmod +x "$T/work/scripts/lvrf-deploy.sh"
printf '#!/usr/bin/env bash\necho "STUB npm $*"\nexit 97\n' > "$T/bin/npm"; chmod +x "$T/bin/npm"
g() { git -C "$T/work" -c user.name=verify -c user.email=verify@lvrf.example "$@"; }
g add -A && g commit -qm v1 && g push -q origin HEAD:main 2>/dev/null && g branch -q -u origin/main 2>/dev/null || true
V1="$(g rev-parse HEAD)"
git clone -q "$T/origin.git" "$T/box" 2>/dev/null
run() { (PATH="$T/bin:$PATH" "$@" 2>&1 || true); }

echo "==> A. A pull that changes lvrf-deploy.sh"
sed -i.bak 's/^set -euo pipefail$/set -euo pipefail\necho "MARKER v2 running"/' "$T/work/scripts/lvrf-deploy.sh" && rm -f "$T/work/scripts/lvrf-deploy.sh.bak"
grep -q 'MARKER v2 running' "$T/work/scripts/lvrf-deploy.sh" || { echo "could not build v2"; exit 1; }
g commit -qam v2 && g push -q origin HEAD:main 2>/dev/null
V2="$(g rev-parse HEAD)"
OUT="$(run "$T/box/scripts/lvrf-deploy.sh")"
echo "$OUT" | sed 's/^/    | /'
[ "$(echo "$OUT" | grep -c "pulled ${V1}..${V2}$")" = "1" ] && ok "first run pulled v1..v2" || bad "no 'pulled v1..v2'"
[ "$(echo "$OUT" | grep -c 'changed in this pull; re-running the new version')" = "1" ] && ok "exactly one re-exec" || bad "re-exec count wrong"
[ "$(echo "$OUT" | grep -c 'MARKER v2 running')" = "1" ] && ok "the NEW version ran (once)" || bad "v2 marker count: $(echo "$OUT" | grep -c 'MARKER v2 running')"
echo "$OUT" | grep -q "re-running the updated lvrf-deploy.sh; pulled ${V1}..${V2} by the first run" && ok "the re-run carries the first run's old HEAD and skips the pull" || bad "re-run line missing"
[ "$(echo "$OUT" | grep -c '^Updating ')" = "1" ] && ok "git pull ran once, not twice" || bad "pull ran twice"
echo "$OUT" | grep -q 'STUB npm ci' && ok "the re-run went on to step 3 (stubbed npm ci)" || bad "did not reach npm ci"

echo "==> B. A pull that does not change lvrf-deploy.sh"
echo "unrelated" > "$T/work/README.txt"; g add README.txt && g commit -qm v3 && g push -q origin HEAD:main 2>/dev/null
V3="$(g rev-parse HEAD)"
OUT="$(run "$T/box/scripts/lvrf-deploy.sh")"
echo "$OUT" | grep -q "pulled ${V2}..${V3}$" && ok "pulled v2..v3" || bad "no 'pulled v2..v3'"
echo "$OUT" | grep -q 're-running' && bad "re-exec'd although the script did not change" || ok "no re-exec when the script is unchanged"
echo "$OUT" | grep -q 'STUB npm ci' && ok "went straight on to step 3" || bad "did not reach npm ci"

echo "==> C. LVRF_DEPLOY_REEXEC=1 without the old HEAD"
OUT="$(run env LVRF_DEPLOY_REEXEC=1 "$T/box/scripts/lvrf-deploy.sh")"
echo "$OUT" | grep -q 'DEPLOY FAILED: LVRF_DEPLOY_REEXEC=1 without LVRF_DEPLOY_OLD_HEAD' && ok "refused: $(echo "$OUT" | grep -o 'DEPLOY FAILED: LVRF_DEPLOY_REEXEC=1 without[^—]*')" || bad "not refused: $OUT"
echo "$OUT" | grep -q 'STUB npm' && bad "it went on to build" || ok "nothing built"

echo "==> D. A re-run whose file is not HEAD's copy (the second-re-exec guard)"
echo '# edited after the pull' >> "$T/box/scripts/lvrf-deploy.sh"
OUT="$(run env LVRF_DEPLOY_REEXEC=1 LVRF_DEPLOY_OLD_HEAD="$V2" LVRF_DEPLOY_PULL_TIME="$(date +%s)" "$T/box/scripts/lvrf-deploy.sh")"
echo "$OUT" | grep -q 'DEPLOY FAILED: refusing a second re-exec' && ok "refused: the running script is not HEAD's copy" || bad "not refused: $OUT"
echo "$OUT" | grep -q 'STUB npm' && bad "it went on to build" || ok "nothing built"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
