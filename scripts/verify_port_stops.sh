#!/usr/bin/env bash
# Every script stops its servers by port (3.1, Brad 26 Nov 2026). Proves scripts/lib/ports.sh and finish.sh:
#   - the leak itself, as a control: a Vite started as `(cd client && npx vite …) & PID=$!` in a script with an EXIT trap
#     keeps listening when that pid is killed (its subshell is not exec'd);
#   - stop_port stops this checkout's Vite, API (npx tsx, also double-forked) and Chrome, with the npm exec and node
#     processes above each, and the port is free afterwards;
#   - owns_listener refuses a listener from another checkout, one under an lvrf-rule76-x/ path (Brad), and one naming
#     this checkout but another port; stop_port leaves each running and names it;
#   - through finish.sh, in a harness script: pass, fail, a crash, Ctrl-C (SIGINT to its process group) and SIGTERM each
#     leave its ports free; a listener from another checkout on the very port the script owns is left running and the
#     script fails naming its pid and command (Brad); a taken port still refuses the script before it starts anything;
#     SIGKILL (no trap can run) leaves its servers, which is what run_regression.sh's check is for.
# No database, no product file. Runs from the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
VITE_PORT=5212; API_PORT=5213; FOREIGN_PORT=5214; PREFIX_PORT=5215; OTHER_PORT=5216; H_PORT=5217; H_VITE_PORT=5218
CDP_PORT=5220
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "REFUSING: Chrome not found"; exit 1; }
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_port_stops.XXXXXX")"
PASS=0; FAIL=0; STARTED=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() {
  local p; for p in $STARTED; do kill "$p" 2>/dev/null || true; done   # the foreign listeners, each started here by pid
  sleep 0.5; rm -rf "$W"
}
. scripts/lib/finish.sh
trap finish EXIT

ROOT="$PORTS_ROOT"
OTHER="$(dirname "$ROOT")/lvrf-wt-other"     # another checkout's path: named in argv only, never created
JS="require('http').createServer((q,r)=>r.end('x')).listen(+(process.env.HOLD||process.env.PORT),'127.0.0.1')"
echo "$JS" > "$W/listen.cjs"
up()   { for _ in $(seq 1 120); do port_answers "$1" && return 0; sleep 0.25; done; return 1; }
free() { ! port_answers "$1" && [ -z "$(by_port "$1")" ]; }
gone() { [ -z "$(pgrep -f -- "$1" || true)" ]; }   # no process whose command line has $1
listen_as() {  # ENV=VALUE ARGV_PATH [EXTRA_ARGS] — a plain node listener started here; prints its pid (the caller keeps it)
  env "$1" node -e "$JS" "$2" ${3:-} > /dev/null 2>&1 < /dev/null & echo $!
}

step "1. The leak, as a control: killing the subshell's pid leaves Vite listening"
(cd client && npx vite --port "$VITE_PORT" --strictPort > "$W/vite.log" 2>&1) & VSUB=$!
up "$VITE_PORT" && ok "this checkout's Vite answers on $VITE_PORT" || bad "Vite did not start: $(tail -3 "$W/vite.log")"
kill "$VSUB" 2>/dev/null || true; sleep 2
port_answers "$VITE_PORT" && ok "  ...after kill \$VITE_PID (the subshell) it still answers: $(holder "$VITE_PORT")" \
  || bad "  ...the subshell kill stopped it: the control does not reproduce the leak"

step "2. stop_port stops this checkout's own servers, with the processes above each"
owns_listener "$VITE_PORT" && ok "owns_listener $VITE_PORT: the Vite names $ROOT/ and --port $VITE_PORT" || bad "Vite not owned"
OUT="$(stop_port "$VITE_PORT"; echo "LEFT=$PORTS_LEFT")"
[ "$OUT" = "LEFT=0" ] && ok "  ...stop_port $VITE_PORT: no FAIL line" || bad "  ...stop_port printed: $OUT"
free "$VITE_PORT" && ok "  ...$VITE_PORT is free" || bad "  ...$VITE_PORT still taken: $(holder "$VITE_PORT")"
gone "npm exec vite --port $VITE_PORT" && gone "node_modules/.bin/vite --port $VITE_PORT" \
  && ok "  ...no npm exec wrapper and no node child left" || bad "  ...left: $(pgrep -fl -- "vite --port $VITE_PORT" || true)"

# The API as s4 starts it: double-forked, so its npm exec is orphaned to launchd and no pid is kept.
(PORT="$API_PORT" npx tsx "$W/listen.cjs" > "$W/api.log" 2>&1 < /dev/null &)
up "$API_PORT" && ok "an API (npx tsx, double-forked) answers on $API_PORT" || bad "API did not start: $(tail -3 "$W/api.log")"
owns_listener "$API_PORT" && ok "  ...owned: its command line names $ROOT/ (tsx's loader), its environment PORT=$API_PORT" || bad "  ...API not owned"
OUT="$(stop_port "$API_PORT"; echo "LEFT=$PORTS_LEFT")"
[ "$OUT" = "LEFT=0" ] && free "$API_PORT" && ok "  ...stopped; $API_PORT is free" || bad "  ...$OUT $(holder "$API_PORT")"
gone "npm exec tsx $W/listen.cjs" && gone "$W/listen.cjs" && ok "  ...npm exec, tsx and its node child all gone" \
  || bad "  ...left: $(pgrep -fl -- "$W/listen.cjs" || true)"

"$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" --user-data-dir="$W/chrome" --no-first-run about:blank > /dev/null 2>&1 &
up "$CDP_PORT" && ok "Chrome answers on $CDP_PORT" || bad "Chrome did not start"
owns_listener "$CDP_PORT" && ok "  ...owned: --user-data-dir under the script's \$W, --remote-debugging-port=$CDP_PORT" || bad "  ...Chrome not owned"
OUT="$(stop_port "$CDP_PORT"; echo "LEFT=$PORTS_LEFT")"
[ "$OUT" = "LEFT=0" ] && free "$CDP_PORT" && ok "  ...stopped; $CDP_PORT is free" || bad "  ...$OUT $(holder "$CDP_PORT")"

step "3. owns_listener refuses what is not this script's; stop_port leaves it running and names it"
P_OTHER="$(listen_as "PORT=$FOREIGN_PORT" "$OTHER/server/index.ts")"; STARTED="$STARTED $P_OTHER"; up "$FOREIGN_PORT" || bad "the other checkout's listener did not start"
owns_listener "$FOREIGN_PORT" && bad "another checkout's listener ($OTHER/) counted as owned" || ok "another checkout ($OTHER/, PORT=$FOREIGN_PORT): not owned"
P_PREFIX="$(listen_as "PORT=$PREFIX_PORT" "$ROOT-x/server/index.ts")"; STARTED="$STARTED $P_PREFIX"; up "$PREFIX_PORT" || bad "the lvrf-rule76-x listener did not start"
owns_listener "$PREFIX_PORT" && bad "a listener under $ROOT-x/ counted as owned" || ok "a listener under $(basename "$ROOT")-x/ (PORT=$PREFIX_PORT): not owned (Brad)"
P_OPORT="$(listen_as "HOLD=$OTHER_PORT" "$ROOT/server/index.ts" "--port 5299")"; STARTED="$STARTED $P_OPORT"; up "$OTHER_PORT" || bad "the other-port listener did not start"
owns_listener "$OTHER_PORT" && bad "a listener naming --port 5299, on $OTHER_PORT, counted as owned" || ok "this checkout's path but --port 5299, listening on $OTHER_PORT: not owned"
for c in "$FOREIGN_PORT:$P_OTHER:$OTHER/server/index.ts" "$PREFIX_PORT:$P_PREFIX:$ROOT-x/server/index.ts" "$OTHER_PORT:$P_OPORT:--port 5299"; do
  p="${c%%:*}"; rest="${c#*:}"; pid="${rest%%:*}"; what="${rest#*:}"
  OUT="$(stop_port "$p"; echo "LEFT=$PORTS_LEFT")"
  printf '%s' "$OUT" | grep -F "port $p is held by pid $pid, which this script did not start" | grep -qF -- "$what" \
    && printf '%s' "$OUT" | grep -q "LEFT=1$" && ok "  ...stop_port $p: FAIL naming pid $pid and its command; PORTS_LEFT=1" || bad "  ...stop_port $p printed: $OUT"
  kill -0 "$pid" 2>/dev/null && port_answers "$p" && ok "  ...pid $pid left running, $p still answers" || bad "  ...pid $pid was stopped"
  kill "$pid" 2>/dev/null || true
done
sleep 1
P_ROOT="$(listen_as "PORT=$PREFIX_PORT" "$ROOT/server/index.ts")"; STARTED="$STARTED $P_ROOT"; up "$PREFIX_PORT" || bad "the control listener did not start"
owns_listener "$PREFIX_PORT" && ok "control: the same listener under $(basename "$ROOT")/ is owned" || bad "control: the same listener under $ROOT/ not owned"
OUT="$(stop_port "$PREFIX_PORT"; echo "LEFT=$PORTS_LEFT")"
[ "$OUT" = "LEFT=0" ] && free "$PREFIX_PORT" && ! kill -0 "$P_ROOT" 2>/dev/null && ok "  ...and stop_port stops it" || bad "  ...$OUT"

step "4. Through finish.sh: a harness script that starts an API and a Vite the leaky way"
cat > "$W/harness.sh" <<'SH'
set -euo pipefail
cd "$1"; MODE="$2"; HW="$3"; mkdir -p "$HW"
H_PORT=5217; H_VITE_PORT=5218
PASS=0; FAIL=0; VITE_PID=""; SERVER_PID=""
cleanup() { [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true; [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; echo "  (cleanup ran)"; }
. scripts/lib/finish.sh
trap finish EXIT
up() { for _ in $(seq 1 120); do port_answers "$1" && return 0; sleep 0.25; done; echo "  FAIL  $1 did not answer"; exit 1; }
if [ "$MODE" = foreign ]; then
  (env PORT="$H_PORT" node -e "$JS" "$OTHER/server/index.ts" > /dev/null 2>&1 < /dev/null & echo $! > "$HW/foreign.pid")
  up "$H_PORT"
else
  PORT="$H_PORT" npx tsx "$HW/../listen.cjs" > "$HW/api.log" 2>&1 & SERVER_PID=$!
  (cd client && npx vite --port "$H_VITE_PORT" --strictPort > "$HW/vite.log" 2>&1) & VITE_PID=$!
  up "$H_PORT"; up "$H_VITE_PORT"
fi
echo ready > "$HW/ready"
case "$MODE" in wait) sleep 120 ;; crash) echo "$AN_UNSET_VARIABLE" ;; esac
[ "$MODE" = fail ] && FAIL=1 || PASS=1
echo "==> $PASS passed, $FAIL failed"
REACHED_TALLY=1
[ "$FAIL" = 0 ]
SH
# Each harness runs in its own process group with SIGINT at its default, as a script run from a terminal is: a process
# started with & from a script inherits SIGINT ignored, so without the reset a "Ctrl-C" here would never land.
harness() {  # MODE — runs it in its own process group; sets HRC, HOUT, HDIR
  HDIR="$W/h_$1"
  set +e; JS="$JS" OTHER="$OTHER" perl -e '$SIG{INT}=q(DEFAULT); setpgrp(0,0); exec @ARGV' bash "$W/harness.sh" "$ROOT" "$1" "$HDIR" > "$W/h_$1.out" 2>&1; HRC=$?; set -e
  HOUT="$(cat "$W/h_$1.out")"
}
both_free() { free "$H_PORT" && free "$H_VITE_PORT" && gone "vite --port $H_VITE_PORT" && gone "npm exec tsx $W/h_"; }
for m in pass fail crash; do
  harness "$m"
  case "$m" in pass) want=0 ;; *) want=1 ;; esac
  [ "$HRC" = "$want" ] && ok "$m: exit $HRC" || bad "$m: exit $HRC, wanted $want: $(tail -4 "$W/h_$m.out" | tr '\n' ' ')"
  both_free && ok "  ...$H_PORT and $H_VITE_PORT free; no npm exec, tsx or vite process left" \
    || { bad "  ...left: $(holder "$H_PORT") $(holder "$H_VITE_PORT")"; stop_port "$H_PORT"; stop_port "$H_VITE_PORT"; PORTS_LEFT=0; }
  printf '%s' "$HOUT" | grep -q "FAIL  port" && bad "  ...a port FAIL line: $HOUT" || true
done
printf '%s' "$(cat "$W/h_crash.out")" | grep -q "stopped before its final tally" && ok "crash: names that it stopped before its tally" || bad "crash: no stop-early line"

for sig in INT TERM; do
  HDIR="$W/h_wait_$sig"
  JS="$JS" OTHER="$OTHER" perl -e '$SIG{INT}=q(DEFAULT); setpgrp(0,0); exec @ARGV' bash "$W/harness.sh" "$ROOT" wait "$HDIR" > "$W/h_$sig.out" 2>&1 & HP=$!
  for _ in $(seq 1 160); do [ -f "$HDIR/ready" ] && break; sleep 0.25; done
  [ -f "$HDIR/ready" ] && ok "SIG$sig: the harness is up (API $H_PORT, Vite $H_VITE_PORT), mid-run" || bad "SIG$sig: harness not ready: $(tail -3 "$W/h_$sig.out")"
  kill -"$sig" -"$HP" 2>/dev/null || true   # to its whole process group, as Ctrl-C does
  set +e; wait "$HP"; HRC=$?; set -e
  [ "$HRC" != 0 ] && grep -q "stopped before its final tally" "$W/h_$sig.out" && ok "  ...exit $HRC, naming that it stopped before its tally" || bad "  ...exit $HRC: $(tail -3 "$W/h_$sig.out" | tr '\n' ' ')"
  both_free && ok "  ...$H_PORT and $H_VITE_PORT free; no npm exec, tsx or vite process left" \
    || { bad "  ...left: $(holder "$H_PORT") $(holder "$H_VITE_PORT")"; stop_port "$H_PORT"; stop_port "$H_VITE_PORT"; PORTS_LEFT=0; }
done

step "5. Brad's case: another checkout's listener on the very port the script owns"
harness foreign
FP="$(cat "$W/h_foreign/foreign.pid" 2>/dev/null || true)"; STARTED="$STARTED $FP"
[ "$HRC" = 1 ] && ok "the script fails (exit 1) although its tally passed" || bad "exit $HRC: $HOUT"
printf '%s' "$HOUT" | grep -F "port $H_PORT is held by pid $FP, which this script did not start" | grep -qF "$OTHER/server/index.ts" \
  && ok "  ...naming pid $FP and its command ($(basename "$OTHER")/server/index.ts)" || bad "  ...no FAIL naming pid $FP: $HOUT"
printf '%s' "$HOUT" | grep -q "(cleanup ran)" && ok "  ...its cleanup still ran" || bad "  ...cleanup did not run"
kill -0 "$FP" 2>/dev/null && port_answers "$H_PORT" && ok "  ...pid $FP left running; $H_PORT still answers" || bad "  ...pid $FP was stopped"
kill "$FP" 2>/dev/null || true; for _ in $(seq 1 20); do free "$H_PORT" && break; sleep 0.25; done

step "6. A taken port still refuses the script before it starts anything"
FP2="$(listen_as "PORT=$H_PORT" "$OTHER/server/index.ts")"; STARTED="$STARTED $FP2"; up "$H_PORT" || bad "listener did not start"
harness pass
[ "$HRC" = 1 ] && printf '%s' "$HOUT" | grep -q "port $H_PORT (H_PORT) is already taken" && ok "refused: port $H_PORT is already taken" || bad "exit $HRC: $HOUT"
printf '%s' "$HOUT" | grep -q "(cleanup ran)" && bad "  ...its cleanup ran" || ok "  ...its trap was never set: nothing stopped, nothing started"
kill -0 "$FP2" 2>/dev/null && ok "  ...pid $FP2 left running" || bad "  ...pid $FP2 was stopped"
kill "$FP2" 2>/dev/null || true; for _ in $(seq 1 20); do free "$H_PORT" && break; sleep 0.25; done

step "7. SIGKILL, as a control: no trap can run, so its servers are left (run_regression.sh's check catches this)"
HDIR="$W/h_kill"
JS="$JS" OTHER="$OTHER" perl -e '$SIG{INT}=q(DEFAULT); setpgrp(0,0); exec @ARGV' bash "$W/harness.sh" "$ROOT" wait "$HDIR" > "$W/h_kill.out" 2>&1 & HP=$!
for _ in $(seq 1 160); do [ -f "$HDIR/ready" ] && break; sleep 0.25; done
kill -9 "$HP" 2>/dev/null || true; set +e; wait "$HP"; set -e; sleep 1
port_answers "$H_PORT" && port_answers "$H_VITE_PORT" && ok "after SIGKILL to the script alone, $H_PORT and $H_VITE_PORT still answer" || bad "SIGKILL left nothing: the control does not hold"
OUT="$( (stop_port "$H_PORT"; stop_port "$H_VITE_PORT"; echo "LEFT=$PORTS_LEFT") )"
[ "$OUT" = "LEFT=0" ] && both_free && ok "  ...both owned and stopped by port, wrappers included" || bad "  ...$OUT"

step "8. Every port this script names is free"
for p in $(own_ports); do free "$p" || bad "$p still taken: $(holder "$p")"; done
ok "checked $(own_ports | wc -l | tr -d ' ') ports: $(own_ports | tr '\n' ' ')"

echo
echo "==> $PASS passed, $FAIL failed"
REACHED_TALLY=1
[ "$FAIL" = 0 ]
