#!/usr/bin/env python3
"""
Run a command under a pseudo-terminal and answer its hidden prompts, for
the verify scripts (the access scripts read passwords without echo, so
they refuse a pipe). Band A.

    pty_answer.py <answers-file> -- <command> [args...]

<answers-file> holds one answer per line, given in order, each one only
when a prompt appears (output ending in ": "). Prints the command's output
(answers are not echoed by the scripts), then a final line:

    --- exit <code> · secret echoed: <True|False>

"secret echoed" is True if any answer, or an argon2 hash, appears in the
output — the scripts must never print either. Times out after 120 s.
"""
import os, pty, re, select, signal, sys, time

answers_file = sys.argv[1]
assert sys.argv[2] == '--', 'usage: pty_answer.py <answers-file> -- <command...>'
cmd = sys.argv[3:]
answers = open(answers_file).read().split('\n')
if answers and answers[-1] == '':
    answers.pop()

pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)

out = b''
def deadline(_s, _f):
    try:
        os.kill(pid, 9)
    except Exception:
        pass
    sys.stdout.write(out.decode(errors='replace').replace('\r', ''))
    print('\n--- exit 124 · HUNG (no prompt answered or no exit within 120 s)')
    sys.exit(124)
signal.signal(signal.SIGALRM, deadline)
signal.alarm(120)

PROMPT = re.compile(rb'[^\n]*: $')
consumed = 0
i = 0
status = None
while True:
    r, _, _ = select.select([fd], [], [], 0.2)
    if r:
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        out += chunk
    tail = out[consumed:]
    if i < len(answers) and PROMPT.search(tail.split(b'\n')[-1]) and tail.split(b'\n')[-1].strip():
        time.sleep(0.05)
        os.write(fd, answers[i].encode() + b'\r')
        i += 1
        consumed = len(out)
    if not r:
        try:
            wpid, st = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            break
        if wpid:
            status = st
            # drain
            while True:
                try:
                    chunk = os.read(fd, 4096)
                except OSError:
                    break
                if not chunk:
                    break
                out += chunk
            break
if status is None:
    try:
        _, status = os.waitpid(pid, 0)
    except ChildProcessError:
        status = None
code = os.waitstatus_to_exitcode(status) if status is not None else -1
text = out.decode(errors='replace').replace('\r', '')
secrets = [a for a in answers if a]
leaked = any(s in text for s in secrets) or '$argon2id$' in text
sys.stdout.write(text)
print(f'\n--- exit {code} · secret echoed: {leaked}')
