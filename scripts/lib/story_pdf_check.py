#!/usr/bin/env python3
"""
S7b.1 (Brad, 26 Nov 2026): an issued story's printed pages, read from the PDF (poppler's pdftotext).

    python3 -I scripts/lib/story_pdf_check.py DIR NAME HASH

For every DIR/NAME_<form>_<scale>.pdf, with its .json written beside it by story_walk.mjs's "pdf" section, it prints
PASS/FAIL lines for:
  (1) the record line, whole, with the story's full hash, on every page (the margin box at the foot);
  (2) each ledger row on one page: some single page holds every word of its figure and its source, and its ids (a
      run hash wrapped over two lines is read whole from the page's words in order);
  (3) each heading on the same page as the first words of what follows it (its first four words of three letters or
      more: a footnote number runs into the word before it in the PDF's text).
Words are compared, not strings: pdftotext lays a table's cells out as separate blocks and interleaves them, so a cell
that wraps is never one string. A row's last line is its ids (short ids and run hashes, near-unique), so a row split at a
page break leaves those on the next page and fails (2).
"""
import glob, json, re, subprocess, sys, unicodedata

out, name, full_hash = sys.argv[1:4]
norm = lambda s: unicodedata.normalize('NFKC', s).lower()
nows = lambda s: re.sub(r'\s+', '', norm(s))
words = lambda s: [w for w in re.split(r'[^0-9a-z%]+', norm(s)) if w]

pdfs = sorted(glob.glob(f'{out}/{name}_*.pdf'))
if not pdfs:
    print(f'FAIL  pdf: no PDF named {name}_* in {out}')
for pdf in pdfs:
    tag = pdf.rsplit('/', 1)[-1][:-4]
    meta = json.load(open(pdf[:-4] + '.json'))
    info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    n = int(re.search(r'Pages:\s+(\d+)', info).group(1))
    text = [subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), '-layout', pdf, '-'], capture_output=True, text=True).stdout for p in range(1, n + 1)]
    flat = [nows(t) for t in text]
    bags = [set(words(t)) for t in text]
    joined = [''.join(words(t)) for t in text]  # the page's words in order, run together: a hash wrapped over two lines is whole here

    # (1) the record line, whole, and the full hash, on every page ("Page n of N" can fall between its words: removed first)
    rl = [nows(l) for l in meta['record_line'].split('\n') if l.strip()]
    miss = [p + 1 for p in range(n) if not (full_hash in flat[p] and rl and all(l in flat[p].replace(nows(f'Page {p + 1} of {n}'), '', 1) for l in rl))]
    print(('PASS  ' if not miss else 'FAIL  ') + f'{tag}: the record line, whole, with the full hash, on every one of its {n} pages'
          + (f' — missing on page(s) {miss}' if miss else ''))

    # (2) each ledger row on one page
    split = []
    for e in meta['ledger']:
        need = set(words(e['figure'] + ' ' + e['source']))
        ids = words(e['ids'])
        if not any(need <= bags[p] and all(i in joined[p] for i in ids) for p in range(n)):
            split.append(e['n'])
    print(('PASS  ' if not split else 'FAIL  ') + f'{tag}: each of its {len(meta["ledger"])} ledger rows on one page'
          + (f' — split: row(s) {split}' if split else ''))

    # (3) each heading with what follows it: the first six words of what follows are on a page that holds the heading
    strand = []
    for h in meta['headings']:
        hw = nows(h['heading'])
        alpha = [w for w in words(h['follow']) if w.isalpha() and len(w) >= 3]
        fw = set(alpha[:4] or words(h['follow'])[:3])
        pages = [p for p in range(n) if hw in flat[p]]
        if not pages or not any(fw <= bags[p] for p in pages):
            strand.append(h['heading'] + ('' if pages else ' (heading not found)'))
    print(('PASS  ' if not strand else 'FAIL  ') + f'{tag}: each of its {len(meta["headings"])} headings on the page of what follows it'
          + (f' — stranded: {strand}' if strand else ''))
