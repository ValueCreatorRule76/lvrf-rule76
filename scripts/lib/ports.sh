# Every script's ports are its own (Brad, 25 Nov 2026, from S7b's cross-check: a script whose Vite could not start on its
# fixed port was served by another run's Vite, from another checkout, and tested the wrong code without failing).
#
#   refuse_taken_ports    — before the script starts anything, and before its EXIT trap is set: each variable named
#                           PORT or *_PORT that holds a port number must have nothing answering on it, on 127.0.0.1 or
#                           ::1 (a connection is tried: whatever answers is what the script would have used; lsof only
#                           names it). If one is taken, the script stops with a plain failure naming the port and the
#                           process holding it. Its cleanup does not run, so it never stops another process's server.
port_answers() {  # PORT — true when something accepts a connection on it
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && return 0
  (exec 3<>"/dev/tcp/::1/$1") 2>/dev/null && return 0
  [ -n "$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true)" ]
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
