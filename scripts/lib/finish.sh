# The EXIT trap of every verify script: `. scripts/lib/finish.sh` after its
# cleanup() is defined, then `trap finish EXIT`, and `REACHED_TALLY=1` on the
# line after its final "==> N passed, M failed".
#
# Why (the early-exit audit, 19 Oct 2026): under macOS's bash 3.2, a fatal
# shell error (an unset variable under `set -u`, a bad substitution, a syntax
# error reached at run time) ends the script with $? = 0 inside the EXIT trap,
# even when the trap saves $? and exits with it. A script that stopped half-way
# therefore exited 0. With this trap, a script passes only if it reached its
# own tally and that tally passed.
#
# The script's own stdout and stderr are kept here (fds 8 and 9), because a
# script stopped by `set -e` inside a redirected function call (`q … > /dev/null`)
# runs its EXIT trap with that redirection still in place: the stop-early line
# would go to /dev/null while the exit stayed 1 (found 25 Oct 2026, P1).
exec 8>&1 9>&2
REACHED_TALLY=0
finish() {
  local rc=$?
  cleanup >&8 2>&9
  if [ "$REACHED_TALLY" != 1 ]; then
    echo "  FAIL  stopped before its final tally (a crash, an unset variable or an early exit); exit 1" >&8
    exit 1
  fi
  exit "$rc"
}
