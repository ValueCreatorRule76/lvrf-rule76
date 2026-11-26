#!/usr/bin/env bash
# The regression runner ("every script stops its servers by port", 3.1, Brad 26 Nov 2026).
#
#   scripts/run_regression.sh                      every scripts/verify_*.sh, in name order
#   scripts/run_regression.sh scripts/verify_x.sh  just those, in the order given
#
# Runs each script in turn, its output to <run dir>/NN_<name>.log, and records it as PASS (exit 0), FAIL, NOT-RUN
# (exit 3: a precondition the copy does not meet) or REFUSED (the port guard: one of its ports was already taken).
#
# After each script, nothing may be listening on a watched port (5190-5220, plus every port any verify script declares
# in a PORT= or *_PORT= assignment), and no `npm exec vite|tsx` process may have appeared. If something is:
#   - the script FAILS (LEFTOVER), whatever its exit;
#   - a leftover listener is stopped only if owns_listener passes (ports.sh): its command line names this checkout or the
#     script's own temp dir (each script runs with TMPDIR set to a dir of its own, so its $W is under it), and names the
#     port. Then the run goes on;
#   - a leftover that is not owned (and a leftover wrapper that listens on nothing) is left running, and the run halts.
# Before the first script it refuses to start if a watched port is taken or a wrapper is running.
# Ctrl-C: the running script's own trap stops its servers; the runner checks for leftovers, then stops with the summary.
# Exit 0 only if every script passed or was NOT-RUN, with no leftover.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/ports.sh
ROOT="$PORTS_ROOT"
RUN="$(mktemp -d /tmp/lvrf_rr.XXXXXX)"   # short: each script's TMPDIR is under it, and unix-socket paths are limited
if [ "$#" -gt 0 ]; then SCRIPTS=("$@"); else SCRIPTS=(scripts/verify_*.sh); fi

WATCHED="$( { seq 5190 5220
  grep -ohE '[A-Z0-9_]*PORT=[0-9]+' scripts/verify_*.sh | awk -F= '$1 ~ /^([A-Z0-9]+_)*PORT$/ {print $2}'; } | sort -un)"
echo "$WATCHED" > "$RUN/watched_ports.txt"
listeners() {  # "port pid" for each listener on a watched port
  lsof -nP -iTCP -sTCP:LISTEN -Fpn 2>/dev/null | awk -v W="$RUN/watched_ports.txt" '
    BEGIN { while ((getline l < W) > 0) w[l] = 1 }
    /^p/ { pid = substr($0, 2) }
    /^n/ { n = split($0, a, ":"); p = a[n]; if (p in w) print p, pid }' | sort -u
}
wrappers() {  # "pid command" for each npm exec vite|tsx, or node running vite or tsx from a node_modules
  ps -ax -ww -o pid=,command= | awk '/npm exec (vite|tsx)( |$)|node_modules\/(\.bin\/(vite|tsx)|tsx\/dist\/)/ && !/awk/' \
    | sed 's/^ *//' | sort
}

L0="$(listeners)"; W0="$(wrappers)"
if [ -n "$L0" ] || [ -n "$W0" ]; then
  echo "REFUSING: before the first script, these are already running (stop them, then run again):"
  [ -n "$L0" ] && echo "$L0" | while read -r p pid; do echo "  port $p: pid $pid, $(ps -ww -o command= -p "$pid")"; done
  [ -n "$W0" ] && echo "$W0" | sed 's/^/  /'
  exit 1
fi

INTERRUPTED=0
trap 'INTERRUPTED=1' INT
echo "Regression: ${#SCRIPTS[@]} scripts, at $(git rev-parse --short HEAD) on $(git branch --show-current); logs in $RUN"
echo "Watched: 5190-5220 and every declared port ($(echo "$WATCHED" | wc -l | tr -d ' ') in all)"
T0=$(date +%s); i=0; HALT=""
: > "$RUN/summary.txt"
row() { printf '%-3s %-36s %-9s %-5s %-12s %7s  %s\n' "$@" | tee -a "$RUN/summary.txt"; }
row "#" "script" "result" "exit" "tally" "time" "note"
for s in "${SCRIPTS[@]}"; do
  i=$((i + 1)); n="$(printf '%02d' "$i")"; name="$(basename "$s" .sh)"
  mkdir -p "$RUN/$n/tmp"; log="$RUN/${n}_$name.log"
  t=$(date +%s)
  TMPDIR="$RUN/$n/tmp" bash "$s" > "$log" 2>&1 < /dev/null; rc=$?
  secs=$(( $(date +%s) - t ))
  tally="$(grep -E '^==> [0-9]+ passed, [0-9]+ failed' "$log" | tail -1 | sed -E 's/^==> ([0-9]+) passed, ([0-9]+) failed.*/\1\/\2/')"
  # A script with another final line (verify_tenant_scope: "==> setup N passed, M failed; cases passed"): its PASS and
  # FAIL lines counted, marked ~. The result is still its exit code.
  [ -n "$tally" ] || tally="~$(grep -cE '^ *PASS ' "$log")/$(grep -cE '^ *FAIL ' "$log")"
  [ "$tally" = "~0/0" ] && tally=""
  if [ "$rc" = 0 ]; then res=PASS
  elif [ "$rc" = 3 ]; then res=NOT-RUN
  elif grep -q "is already taken (" "$log"; then res=REFUSED
  else res=FAIL; fi
  note=""
  sleep 1
  L="$(listeners)"; NW="$(comm -13 <(echo "$W0") <(wrappers))"
  if [ -n "$L" ] || [ -n "$NW" ]; then
    res=LEFTOVER
    while read -r p pid; do
      [ -n "$p" ] || continue
      if OWN_MARK="$RUN/$n/tmp" owned_pid "$pid" "$p"; then
        note="$note port $p (pid $pid, its own: stopped);"
        echo "  port $p: pid $pid, $(ps -ww -o command= -p "$pid")" >> "$RUN/${n}_leftovers.txt"
        OWN_MARK="$RUN/$n/tmp" stop_port "$p" >> "$RUN/${n}_leftovers.txt"
      else
        note="$note port $p (pid $pid, not its own: left running);"; HALT=1
        echo "  port $p: pid $pid, NOT OWNED, left running: $(ps -ww -o command= -p "$pid")" >> "$RUN/${n}_leftovers.txt"
      fi
    done <<< "$L"
    sleep 1
    NW="$(comm -13 <(echo "$W0") <(wrappers))"
    if [ -n "$NW" ]; then
      note="$note $(echo "$NW" | wc -l | tr -d ' ') wrapper(s) listening on nothing: left running;"; HALT=1
      echo "$NW" | sed 's/^/  wrapper, left running: /' >> "$RUN/${n}_leftovers.txt"
    fi
  fi
  row "$n" "$name" "$res" "$rc" "${tally:--}" "${secs}s" "${note# }"
  [ -n "$HALT" ] && { echo "HALTED: a leftover after $name is not its own (above; $RUN/${n}_leftovers.txt). Nothing was stopped that was not its own."; break; }
  [ "$INTERRUPTED" = 1 ] && { echo "INTERRUPTED (Ctrl-C) during $name"; break; }
done

c() { awk -v r="$1" 'NR > 1 && $3 == r' "$RUN/summary.txt" | wc -l | tr -d ' '; }
CHECKS="$(awk 'NR > 1 { sub(/^~/, "", $5); split($5, t, "/"); s += t[1] } END { print s + 0 }' "$RUN/summary.txt")"
echo
echo "==> $i of ${#SCRIPTS[@]} run in $(( ($(date +%s) - T0) / 60 )) min: $(c PASS) passed, $(c FAIL) failed, $(c NOT-RUN) not run, $(c REFUSED) refused by the port guard, $(c LEFTOVER) left a server running; $CHECKS checks passed"
echo "    after the run: $(listeners | wc -l | tr -d ' ') listeners on watched ports, $(wrappers | wc -l | tr -d ' ') npm exec/vite/tsx processes"
echo "    $RUN/summary.txt"
[ "$INTERRUPTED" = 1 ] && exit 130
[ -n "$HALT" ] && exit 2
[ "$(c FAIL)$(c REFUSED)$(c LEFTOVER)" = "000" ] && [ "$i" = "${#SCRIPTS[@]}" ]
