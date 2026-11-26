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
#
# Every script stops its servers by port (ports.sh, Brad 26 Nov 2026): on any exit (pass, fail, Ctrl-C, SIGTERM), before
# its cleanup (so dropdb finds no connection), every port it names is stopped if the listener is its own, and after its
# cleanup each is confirmed free. A port still taken, or held by a process it did not start, fails the script even when
# its tally passed.
# Every script's ports are its own: a taken port stops the script here, before its EXIT trap is set (ports.sh).
. scripts/lib/ports.sh
refuse_taken_ports
exec 8>&1 9>&2
REACHED_TALLY=0
finish() {
  local rc=$?
  stop_own_ports >&8 2>&9
  cleanup >&8 2>&9
  confirm_own_ports_free >&8 2>&9
  if [ "$REACHED_TALLY" != 1 ]; then
    echo "  FAIL  stopped before its final tally (a crash, an unset variable, an early exit, or a signal such as Ctrl-C)" >&8
    exit 1
  fi
  if [ "$PORTS_LEFT" != 0 ]; then
    echo "  FAIL  a port it names was not free when it ended (above)" >&8
    exit 1
  fi
  exit "$rc"
}
