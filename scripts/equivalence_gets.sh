#!/usr/bin/env bash
#
# Equivalence (Gate A): every deployed GET route, instantiated over every row of a prod copy, read from the deployed
# code and from this checkout's code, each on its own clone, compared byte for byte; any key the branch adds is named.
# Local only; nothing here touches prod or real local lvrf. Not a verify_* script (it is not part of the regression).
#
#   scripts/equivalence_gets.sh <deployed-commit> <snapshot.dump> [out_dir]
#
# Saved at B4 findings lens Gate A (Brad, 14 Nov 2026), replacing the hand-run harness of earlier gates (77 GETs, not
# kept). How it builds the two sides:
#   A  the deployed commit, checked out in a temporary worktree; its own scripts/restore_prod_copy.sh restores the
#      snapshot into lvrf_prodcopy (its migrations, its hardening), and A is a clone of that: the deployed state.
#   B  a clone of A, migrated as lvrf_migrate with this checkout's migrations, then db/ownership.sql and
#      db/hardening.sql: exactly what Gate B does to prod.
# Then this checkout's scripts/restore_prod_copy.sh restores lvrf_prodcopy again, so it is left as the regression
# expects it. The paths are every GET in scripts/list_api_routes.mjs at the deployed commit, filled from B's rows
# (scripts/lib/equivalence_paths.sh); routes the branch adds are reported, not compared. The actor is the tenant's steward.
# KEEP_CLONES=1 leaves lvrf_equiva (the deployed state) and lvrf_equivb for further reads.

set -euo pipefail
cd "$(dirname "$0")/.."
DEPLOYED="${1:?usage: $0 <deployed-commit> <snapshot.dump> [out_dir]}"; DUMP="${2:?usage: $0 <deployed-commit> <snapshot.dump> [out_dir]}"
OUT="${3:-$(mktemp -d "${TMPDIR:-/tmp}/lvrf_equiv.XXXXXX")}"; mkdir -p "$OUT"
[ -r "$DUMP" ] || { echo "REFUSING: cannot read $DUMP"; exit 1; }
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
. scripts/lib/clone.sh
# One suffix only: drizzle.config.ts accepts lvrf or lvrf_<suffix>.
A=lvrf_equiva; B=lvrf_equivb; PA="${EQUIV_PORT_A:-3191}"; PB="${EQUIV_PORT_B:-3192}"
WT="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_equiv_wt.XXXXXX")"
# The servers are stopped by the ports they listen on, never by a subshell's pid: killing the ( ... ) & wrapper leaves
# npx's node child running (found at this script's first run, 14 Nov 2026).
stop_port() { local p; for p in $(lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null); do kill "$p" 2>/dev/null || true; done; }
cleanup() {
  stop_port "$PA"; stop_port "$PB"
  git worktree remove --force "$WT/src" > /dev/null 2>&1 || true; rm -rf "$WT"
  if [ "${KEEP_CLONES:-}" != 1 ]; then sleep 1; dropdb --if-exists "$A" 2>/dev/null || true; dropdb --if-exists "$B" 2>/dev/null || true; fi
}
trap cleanup EXIT

echo "==> A: $DEPLOYED, its own restore of $DUMP"
git worktree add -q --detach "$WT/src" "$DEPLOYED"
cp .env .env.migrate "$WT/src/"; ln -s "$PWD/node_modules" "$WT/src/node_modules"
(cd "$WT/src" && ./scripts/restore_prod_copy.sh "$DUMP") > "$OUT/restore_a.log" 2>&1 || { echo "FAIL  the deployed restore: $(tail -3 "$OUT/restore_a.log")"; exit 1; }
dropdb --if-exists "$A"; make_clone "$A" lvrf_prodcopy || { echo "FAIL  clone A"; exit 1; }
echo "==> B: A, migrated with this checkout's migrations as lvrf_migrate, then ownership.sql and hardening.sql"
dropdb --if-exists "$B"; make_clone "$B" "$A" || { echo "FAIL  clone B"; exit 1; }
migrate_clone "$B" > "$OUT/migrate_b.log" 2>&1 || { echo "FAIL  migrate B: $(tail -3 "$OUT/migrate_b.log")"; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 -d "$B" -f db/ownership.sql > /dev/null 2>&1 && psql -X -q -v ON_ERROR_STOP=1 -d "$B" -f db/hardening.sql > "$OUT/hardening_b.log" 2>&1 \
  || { echo "FAIL  harden B: $(grep -m2 ERROR "$OUT/hardening_b.log")"; exit 1; }
echo "==> lvrf_prodcopy restored again by this checkout's restore (as the regression expects it)"
./scripts/restore_prod_copy.sh "$DUMP" > "$OUT/restore_branch.log" 2>&1 || { echo "FAIL  the branch restore: $(tail -3 "$OUT/restore_branch.log")"; exit 1; }

start() {  # DIR DB PORT LOG — backgrounded with its own stdin and stdout, so nothing here waits on it
  [ -z "$(lsof -nP -t -iTCP:"$3" -sTCP:LISTEN 2>/dev/null)" ] || { echo "REFUSING: port $3 is already in use"; exit 1; }
  (cd "$1" && LVRF_PUBLIC_ORIGIN="http://localhost:5999" NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="${LOCAL_URL%/*}/$2" PORT="$3" npx tsx server/index.ts) < /dev/null > "$4" 2>&1 &
}
start "$WT/src" "$A" "$PA" "$OUT/server_a.log"; start "$PWD" "$B" "$PB" "$OUT/server_b.log"
for p in $PA $PB; do for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$p/api/health" && break; sleep 0.5; done; done
curl -s -o /dev/null "http://127.0.0.1:$PA/api/health" && curl -s -o /dev/null "http://127.0.0.1:$PB/api/health" || { echo "FAIL  a server did not start"; exit 1; }

ACTOR="$(psql -X -At -d "$B" -c "SELECT steward_person_id FROM tenants WHERE steward_person_id IS NOT NULL ORDER BY created_at LIMIT 1")"
(cd "$WT/src" && node scripts/list_api_routes.mjs | awk '$1 == "GET" {print $2}' | sort) > "$OUT/routes_a.txt"
node scripts/list_api_routes.mjs | awk '$1 == "GET" {print $2}' | sort > "$OUT/routes_b.txt"
ADDED="$(comm -13 "$OUT/routes_a.txt" "$OUT/routes_b.txt" | paste -sd' ' -)"; REMOVED="$(comm -23 "$OUT/routes_a.txt" "$OUT/routes_b.txt" | paste -sd' ' -)"
echo "  INFO  GET routes at $DEPLOYED: $(wc -l < "$OUT/routes_a.txt" | tr -d ' '); added by the branch (not compared): ${ADDED:-none}; removed: ${REMOVED:-none}"
bash scripts/lib/equivalence_paths.sh "$B" > "$OUT/paths.all"
# Keep only the paths whose route template exists at the deployed commit.
node -e '
const fs = require("fs"); const [routes, paths] = process.argv.slice(1).map((f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean));
const res = routes.map((r) => new RegExp("^" + r.replace(/:[A-Za-z]+/g, "[^/?]+") + "(\\?.*)?$"));
for (const p of paths) if (res.some((re) => re.test(p))) console.log(p);' "$OUT/routes_a.txt" "$OUT/paths.all" > "$OUT/paths.txt"
COVERED="$(node -e '
const fs = require("fs"); const [routes, paths] = process.argv.slice(1).map((f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean));
const miss = routes.filter((r) => !paths.some((p) => new RegExp("^" + r.replace(/:[A-Za-z]+/g, "[^/?]+") + "(\\?.*)?$").test(p)));
console.log(miss.length ? "not covered: " + miss.join(" ") : "every deployed GET route covered");' "$OUT/routes_a.txt" "$OUT/paths.txt")"
echo "  INFO  $COVERED"
node scripts/lib/equivalence_compare.mjs "http://127.0.0.1:$PA" "http://127.0.0.1:$PB" "$ACTOR" "$OUT/paths.txt" "$OUT"
echo "  report: $OUT/report.txt"
