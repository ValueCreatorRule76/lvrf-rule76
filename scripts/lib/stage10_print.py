# Stage 10 on a printed case or POV (S3 Gate C, 19 Nov 2026): READ-ONLY. pdftotext, pdffonts and pdftoppm read the
# PDF; nothing writes to it, re-saves it or copies it. The hashes and the citation come from prod, read-only.
#   python3 -I scripts/lib/stage10_print.py PDF "BANNER|BANNER" HASH [HASH...] [--citation TEXT]
import sys, subprocess, re
args = sys.argv[1:]; cit = None
if '--citation' in args: i = args.index('--citation'); cit = args[i + 1]; args = args[:i] + args[i + 2:]
pdf, banners, *hashes = args; banners = banners.split('|')
nows = lambda s: re.sub(r'\s+', '', s)
run = lambda *a: subprocess.run(a, capture_output=True, text=True).stdout
info = run('pdfinfo', pdf); n = int(re.search(r'Pages:\s+(\d+)', info).group(1)); H = float(re.search(r'Page size:\s+[\d.]+ x ([\d.]+)', info).group(1))
res = []
def chk(ok, what): res.append(ok); print(('  PASS  ' if ok else '  FAIL  ') + what)
bad = {k: [] for k in ['banners', 'hash', 'foot', 'pageno', 'browser']}
for p in range(1, n + 1):
    t = run('pdftotext', '-f', str(p), '-l', str(p), '-layout', pdf, '-'); T = nows(t)
    if not all(nows(b) in T for b in banners): bad['banners'].append(p)
    if not all(h in T for h in hashes): bad['hash'].append(p)
    if nows(f'Page {p} of {n}') not in T: bad['pageno'].append(p)
    bb = run('pdftotext', '-f', str(p), '-l', str(p), '-bbox', pdf, '-')
    ys = [float(y) for y, w in re.findall(r'yMin="([\d.]+)"[^>]*>([^<]*)</word>', bb) if w[:12] == hashes[0][:12]]
    if not ys or max(ys) < H - 1.4 * 72: bad['foot'].append(p)
    if re.search(r'\b\d{1,2}/\d{1,2}/\d{2}\b', t) or 'localhost' in t or 'lvrf-rule76.com' in t: bad['browser'].append(p)
for k, what in [('banners', 'the disclosure banners'), ('hash', 'the full record hash(es) ' + ', '.join(h[:8] + '…' + h[-5:] for h in hashes)),
                ('foot', 'the record line at the foot (in the bottom band)'), ('pageno', '"Page n of N"'), ('browser', 'no browser header or footer')]:
    chk(not bad[k], f'{what} on every one of {n} pages' + (f' — missing on {bad[k]}' if bad[k] else ''))
p1 = nows(run('pdftotext', '-f', '1', '-l', '1', pdf, '-'))
chk('RULE76·LEARNINGVALUEREALIZATION' in p1.upper() or 'Rule76·LearningValueRealization' in p1, 'the cover: the kicker "Rule 76 · Learning Value Realization" on page 1')
pgm = subprocess.run(['pdftoppm', '-gray', '-r', '144', '-f', '1', '-l', '1', pdf], capture_output=True).stdout
hdr = pgm.split(b'\n', 3); w, h = map(int, hdr[1].split()); px = hdr[3]
light = [y / 2 for y in range(int(h * 0.3), h) if min(px[y * w:(y + 1) * w]) > 20]
chk(not light, "the cover's ink unbroken from its panel to the page foot (the foot band prints ink)" + (f' — light rows from {light[0]}pt' if light else ''))
p1raw = nows(run('pdftotext', '-raw', '-f', '1', '-l', '1', pdf, '-'))  # -raw keeps a hyphen at a line end
if cit: chk(nows(cit) in p1raw, "the marker's full citation on page 1 (C1b)")
last = nows(run('pdftotext', '-f', str(n), '-l', str(n), pdf, '-'))
chk('Aboutthisdocument' in last and 'RULE76—NOEXCUSES.PLAYLIKEACHAMPION.' in last.upper() and last.index('Aboutthisdocument') < last.upper().index('RULE76—NOEXCUSES'),
    'the close on the last page: "About this document", then the tagline')
f = run('pdffonts', pdf)
faces = sorted(set(re.sub(r'^[A-Z]+\+', '', l.split()[0]) for l in f.splitlines()[2:] if l.strip()))
chk(all(any(x in fc for fc in faces) for x in ['BebasNeue', 'Barlow-Regular', 'BarlowCondensed']), 'fonts embedded: Bebas Neue, Barlow, Barlow Condensed (' + ' '.join(faces) + ')')
print(f'==> {sum(res)} passed, {len(res) - sum(res)} failed  ({pdf.split("/")[-1]}, {n} pages)')
