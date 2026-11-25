#!/usr/bin/env python3
"""
S7b Gate A (Brad, 25 Nov 2026): the coverage guard's second form, resolved, never assumed.

    python3 -I scripts/lib/act_route_resolves.py 'POST /api/stories/:id/withdraw'   -> exit 0 if it resolves, 1 if not

An act route passes this form only when ONE handler, in one source file, does all of these:
  - it is registered as router.<method>('<path>', ...) inside an exported router function;
  - server/index.ts mounts that function at a prefix such that METHOD + ' ' + prefix + path is the route asked for;
  - inside that same handler, `const endpoint = '<literal>'` names exactly that route;
  - inside that same handler, recordAct(client, req, endpoint, ...) is called.
Any other variable, a literal naming another route, or a recordAct outside the handler fails. Prints why on failure.
"""
import glob, re, sys

route = sys.argv[1]
method, path = route.split(' ', 1)
index = open('server/index.ts').read()
# app.use('/api/stories', storiesRouter(pool));
mounts = {}
for prefix, fn in re.findall(r"app\.use\('([^']+)',\s*(\w+)\(", index):
    mounts.setdefault(fn, []).append(prefix)

found = []
for f in sorted(glob.glob('server/routes/*.ts') + glob.glob('server/research/*.ts')):
    s = open(f).read()
    fns = [(m.start(), m.group(1)) for m in re.finditer(r'^export function (\w+)\(', s, re.M)]
    regs = [(m.start(), m.group(1).upper(), m.group(2)) for m in re.finditer(r"router\.(get|post|put|patch|delete)\('([^']+)'", s)]
    for i, (at, m, p) in enumerate(regs):
        end = regs[i + 1][0] if i + 1 < len(regs) else len(s)
        nxt = [a for a, _ in fns if a > at]
        if nxt: end = min(end, nxt[0])
        block = s[at:end]
        owner = [n for a, n in fns if a < at]
        if not owner: continue
        for prefix in mounts.get(owner[-1], []):
            registered = f'{m} {prefix}{p}'
            if registered != route: continue
            lit = re.search(r"const endpoint = '([^']+)'", block)
            call = re.search(r'recordAct\(client, req, endpoint,', block)
            found.append((f, owner[-1], registered, lit.group(1) if lit else None, bool(call)))

ok = [x for x in found if x[3] == route and x[4]]
if ok:
    print(f'resolves: {route} — {ok[0][0]} ({ok[0][1]}): const endpoint names it, and recordAct uses it, in its own handler')
    sys.exit(0)
if not found:
    print(f'no handler is registered as {route}')
else:
    for f, fn, reg, lit, call in found:
        print(f'{route} in {f} ({fn}): endpoint names {lit!r}; recordAct(client, req, endpoint, …) {"present" if call else "absent"} in the handler')
sys.exit(1)
