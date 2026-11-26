# Every script's ports are its own (Brad, 25 Nov 2026, from S7b's cross-check: a script whose Vite could not start on its
# fixed port was served by another run's Vite, from another checkout, and tested the wrong code without failing).
#
#   refuse_taken_ports    — before the script starts anything, and before its EXIT trap is set: each variable named
#                           PORT or *_PORT that holds a port number must have nothing answering on it, on 127.0.0.1 or
#                           ::1 (a connection is tried: whatever answers is what the script would have used; lsof only
#                           names it). If one is taken, the script stops with a plain failure naming the port and the
#                           process holding it. Its cleanup does not run, so it never stops another process's server.
#
# Every script stops its servers by the port they listen on (Brad, 26 Nov 2026, from S7b.1's regression: nineteen Vites
# were left listening). A Vite started as `(cd client && npx vite …) & VITE_PID=$!` in a script with an EXIT trap is not
# exec'd by its subshell, so `kill "$VITE_PID"` stops the subshell only and leaves `npm exec vite` and its node child
# listening. finish.sh therefore stops every port the script names, on any exit (pass, fail, Ctrl-C, SIGTERM):
#
#   owns_listener PORT    — true when something listens on PORT and every listener is this script's own: its command
#                           line names this checkout ("<root>/", the slash included, so lvrf-rule76-x/ is not it) or the
#                           script's work dir ("$W/": Chrome's profile, s3's worktree of main), and its command line or
#                           its environment (PORT=N, read by `ps -E`) names PORT as its own. The checkout is read from the
#                           command line only: every process started here has PWD=<root> in its environment.
#   stop_port PORT        — stops PORT's listener and the node and `npm exec` processes above it (up to the first other
#                           process: the script's shell), only when it is the script's own. SIGTERM, up to 10 s, then
#                           SIGKILL; then confirms nothing answers. A listener that is not its own is left running and
#                           named in a FAIL line. Always returns 0 (cleanup runs under set -e and must still restore its
#                           files); a failure sets PORTS_LEFT=1, which finish.sh turns into the script's failure.
#   stop_own_ports        — stop_port on every port the script names; confirm_own_ports_free — a FAIL per port taken.
PORTS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
PORTS_LEFT=0
port_answers() {  # PORT — true when something accepts a connection on it
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
  (exec 3<>"/dev/tcp/::1/$1") 2>/dev/null && return 0
  [ -n "$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true)" ]
}
by_port() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | sort -u || true; }
own_ports() {  # each port number held by a PORT or *_PORT variable, once
  local v p
  for v in $(compgen -v | grep -E '^([A-Z0-9]+_)*PORT$'); do
    p="${!v}"
    case "$p" in ''|*[!0-9]*) continue ;; esac
    echo "$p"
  done | sort -un
}
holder() {  # PORT — "pid N, <command>" for its listener, for a FAIL line
  local pid; pid="$(by_port "$1" | head -1)"
  echo "${pid:+pid $pid, $(ps -ww -o command= -p "$pid" 2>/dev/null)}"
}
owned_pid() {  # PID PORT
  local argv full m named=0
  argv="$(ps -ww -o command= -p "$1" 2>/dev/null || true)"
  [ -n "$argv" ] || return 1
  for m in "$PORTS_ROOT/" ${W:+"$W/"} ${OWN_MARK:+"$OWN_MARK/"}; do
    case "$argv" in *"$m"*) named=1 ;; esac
  done
  [ "$named" = 1 ] || return 1
  case " $argv " in *" --port $2 "*|*" --port=$2 "*|*" --remote-debugging-port=$2 "*|*" $2 "*) return 0 ;; esac
  full="$(ps -E -ww -o command= -p "$1" 2>/dev/null || true)"
  case " ${full#"$argv"} " in *" PORT=$2 "*) return 0 ;; esac
  return 1
}
owns_listener() {  # PORT
  local pid any=0
  for pid in $(by_port "$1"); do owned_pid "$pid" "$1" || return 1; any=1; done
  [ "$any" = 1 ]
}
chain() {  # PID — the pid, then each node or `npm exec` process above it, up to the first that is neither
  local p="$1" c
  echo "$p"
  while :; do
    p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || true)"
    case "$p" in ''|0|1|"$$") return 0 ;; esac
    c="$(ps -ww -o command= -p "$p" 2>/dev/null || true)"
    case "$c" in "npm exec "*|node\ *|*/node\ *) echo "$p" ;; *) return 0 ;; esac
  done
}
stop_port() {  # PORT
  local port="$1" pid pids="" foreign=0 alive i
  for pid in $(by_port "$port"); do
    if owned_pid "$pid" "$port"; then pids="$pids $(chain "$pid" | tr '\n' ' ')"
    else
      foreign=1
      echo "  FAIL  port $port is held by pid $pid, which this script did not start ($(ps -ww -o command= -p "$pid" 2>/dev/null)): left running"
    fi
  done
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
    for i in $(seq 1 40); do
      alive=""; for pid in $pids; do kill -0 "$pid" 2>/dev/null && alive="$alive $pid"; done
      [ -z "$alive" ] && { [ "$foreign" = 1 ] || ! port_answers "$port"; } && break
      sleep 0.25
    done
    if [ -n "$alive" ]; then kill -9 $alive 2>/dev/null || true; sleep 1; fi
  fi
  if [ "$foreign" = 1 ]; then PORTS_LEFT=1
  elif port_answers "$port"; then
    echo "  FAIL  port $port is still taken after its stop ($(holder "$port"))"; PORTS_LEFT=1
  fi
  return 0
}
stop_own_ports() { local p; for p in $(own_ports); do stop_port "$p"; done; return 0; }
confirm_own_ports_free() {
  local p
  for p in $(own_ports); do
    port_answers "$p" && { echo "  FAIL  port $p is still taken as the script ends ($(holder "$p"))"; PORTS_LEFT=1; }
  done
  return 0
}
refuse_taken_ports() {
  local v p pid what taken=0
  for v in $(compgen -v | grep -E '^([A-Z0-9]+_)*PORT$'); do
    p="${!v}"
    case "$p" in ''|*[!0-9]*) continue ;; esac
    port_answers "$p" || continue
    pid="$(lsof -nP -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    what="${pid:+pid $pid, $(ps -o command= -p "$pid" 2>/dev/null | cut -c1-140)}"
    echo "  FAIL  port $p ($v) is already taken (${what:-a process lsof cannot name answers on it}): this script uses only its own servers. Stop that process, then run it again."
    taken=1
  done
  [ "$taken" = 0 ] || exit 1
}
