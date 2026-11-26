// S7b (LVRF_PLAN §27) — the story of record on the page, for scripts/verify_story.sh.
//
//   node scripts/lib/story_walk.mjs SECTION[,SECTION]
//
//   draft    /accounts/E.INST/story: the DRAFT banner, no Print; the stage strip at E.STAGE; the title E.TITLE; the headline
//            score and each of its errata (E.HEADLINE_ERRATA, JSON ids) in ONE element, the same computed size and weight;
//            below Realization no "achieved", "realized" or result word outside the asks, and no Results section; every
//            ledger number on the page has its entry, and none is missing; at E.WIDTH no sideways scroll; a screenshot
//   issue    the same page as the steward: "Issue this story…", its confirmation in full, "Yes, issue it"; prints the new id
//   issued   /stories/E.STORY: Print offered; the full hash on the page; the banners; the one page and the full story; the
//            headline as in draft; a screenshot of each form
//   html     /stories/E.STORY: prints the md5 of the story body's markup (a re-render is byte-identical)
//   refused  /accounts/E.INST/story?audience=client: the refusal for a reference example, no issue control
//   current  S7b.2 (LVRF_PLAN §36): /accounts/E.INST/story (E.AUDIENCE) while E.CURRENT is current: E.EXPECT_CURRENT
//            'same' shows "Issued as <id> on E.CURRENT_ON (UTC). Nothing on the record has changed since.", 'changed'
//            shows "The record has changed since <id> was issued. Withdraw it to issue the new story.", each with the id
//            linked to /stories/E.CURRENT and no issue control; 'none' shows the issue control and neither line
//   withdraw /stories/E.STORY as the steward: "Withdraw…", the reason E.REASON, "Yes, withdraw it"; the withdrawn note
// issue takes E.AUDIENCE (internal unless 'client').
//
// S7b.1 (LVRF_PLAN §35), in every body read:
//   E.FINDING_OWNERS  JSON {finding id: engagement id}, from SQL: on the full form each finding sits inside the measure
//                     block of its own engagement (v2), or, with E.EXPECT_V=1, in "Findings on the record" under none
//   reading order     on the full form each ledger number first appears in order, 1, 2, 3, none skipped (v2); on the
//                     one page, ascending
//   gutter            each banner on screen starts its text at least 16 px from the left edge
//   # column          printed (print media at 701 px, US Letter's width less its margins), each two-digit # is one line
//   words             the heading, its note and the timeline note say "line", not "engagement"; the stage strip's "needs a second
//                     verified actual, from a separate measurement"; "Prepared by …" for E.TENANT as E.EXPECT_V seals it;
//                     on an issued story, "composer version N" in the record line and "for E.TENANT's people" on the cover
const SECTIONS = (process.argv[2] ?? 'draft').split(',');
const E = process.env;
const TAG = E.TAG ?? 'story';
const APP = `http://localhost:${E.VITE_PORT}`;
const WIDTH = Number(E.WIDTH ?? 1280);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (c, m, d = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${TAG}: ${m}${!c && d ? ` — ${String(d).slice(0, 300)}` : ''}`);
const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; const to = setTimeout(() => { pend.delete(id); r({ timeout: true }); }, 15000); pend.set(id, (m) => { clearTimeout(to); r(m); }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 25000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(200); } return false; };
const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
const shot = async (name) => {
  if (!E.OUT_DIR) return;
  const h = await ev('document.documentElement.scrollHeight');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: Math.max(900, h), deviceScaleFactor: 1, mobile: WIDTH < 600 });
  await sleep(300);
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${E.OUT_DIR}/${name}-${WIDTH}.png`, Buffer.from(s.result.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: WIDTH < 600 });
};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: WIDTH < 600 });

await go('/');
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await go('/');
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await waitFor(`document.body.textContent.includes('Signed in as')`))) { check(false, 'signed in through the page'); console.log('DONE'); process.exit(0); }

const BELOW = ['reference', 'decision'];
async function body(where) {
  const stage = await ev(`document.querySelector('[data-testid=story-body]')?.dataset.stage ?? null`);
  check(stage === E.STAGE, `${where}: the stage is ${E.STAGE}`, stage);
  const now = await ev(`[...document.querySelectorAll('[data-testid^=stage-][data-now=yes]')].map(x=>x.dataset.testid).join(',')`);
  check(now === `stage-${E.STAGE}`, `${where}: the stage strip marks ${E.STAGE} alone`, now);
  if (E.TITLE) {
    const title = await ev(`document.querySelector('[data-testid=story-title]')?.textContent ?? ''`);
    check(title === E.TITLE, `${where}: the title reads "${E.TITLE}"`, title);
  }
  // The headline: the score and its errata, one element, the same computed size and weight (Brad, 24 Nov 2026).
  const hl = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid=headline-score]')].map(p=>{
    const s=p.querySelector('[data-testid=sealed-score]'); const cs=getComputedStyle(s);
    return { run: p.dataset.run, size: cs.fontSize, weight: cs.fontWeight, errata: [...p.querySelectorAll('[data-testid=score-erratum]')].map(x=>{const c=getComputedStyle(x);return {id:x.dataset.erratum,size:c.fontSize,weight:c.fontWeight,text:x.textContent}}) };
  }))`));
  check(hl.length >= 1, `${where}: a headline score prints`, JSON.stringify(hl));
  if (E.HEADLINE_ERRATA) {
    const want = JSON.parse(E.HEADLINE_ERRATA).sort().join(',');
    const got = (hl[0]?.errata ?? []).map((x) => x.id).sort().join(',');
    check(got === want, `${where}: each of the headline run's current errata prints beside its score (${JSON.parse(E.HEADLINE_ERRATA).length})`, `${got} vs ${want}`);
  }
  const same = hl.every((h) => h.errata.every((x) => x.size === h.size && x.weight === h.weight));
  check(same, `${where}: each headline erratum is the score's size and weight`, JSON.stringify(hl.map((h) => [h.size, h.weight, h.errata.map((x) => [x.size, x.weight])])));
  const tl = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid=timeline-score]')].map(p=>{const s=getComputedStyle(p.querySelector('[data-testid=sealed-score]'));return [...p.querySelectorAll('[data-testid=score-erratum]')].every(x=>{const c=getComputedStyle(x);return c.fontSize===s.fontSize&&c.fontWeight===s.fontWeight})}))`));
  if (tl.length) check(tl.every(Boolean), `${where}: on the timeline, each run's errata are its score's size and weight (${tl.length} runs)`);
  if (BELOW.includes(E.STAGE)) {
    const words = await ev(`(()=>{const c=document.querySelector('[data-testid=story-body]').cloneNode(true);
      c.querySelectorAll('[data-testid=asks]').forEach(x=>x.remove());
      [...c.querySelectorAll('h2')].filter(h=>/results story/i.test(h.textContent)).forEach(h=>h.remove());
      const m=c.textContent.match(/\\b(achiev\\w*|reali[sz]ed|results?)\\b/i); return m?m[0]:''})()`);
    check(words === '', `${where}: below Realization, no "achieved", "realized" or result word outside the asks`, words);
    check(!(await ev(`!!document.querySelector('[data-testid=results-heading]')`)), `${where}: below Realization, "Results" does not render`);
    check(!/success story/i.test(await ev(`document.querySelector('[data-testid=story-body]').textContent`)), `${where}: below Realization, no "Success story"`);
  }
  const refs = JSON.parse(await ev(`JSON.stringify({ used: [...new Set([...document.querySelectorAll('[data-testid=ledger-ref]')].map(x=>x.dataset.n))], entries: [...document.querySelectorAll('[data-testid=ledger-entry]')].map(x=>x.dataset.n), missing: document.querySelectorAll('[data-testid=ledger-ref-missing]').length })`));
  const lacking = refs.used.filter((x) => !refs.entries.includes(x));
  check(refs.missing === 0 && lacking.length === 0 && refs.used.length > 0, `${where}: every figure's ledger number (${refs.used.length}) has its entry; none missing`, JSON.stringify({ lacking, missing: refs.missing }));
  const wide = await ev('document.documentElement.scrollWidth');
  check(wide <= WIDTH, `${where}: at ${WIDTH}, no sideways scroll`, wide);
  await s7b1(where);
}

const V = Number(E.EXPECT_V ?? 2);
async function s7b1(where) {
  const form = await ev(`document.querySelector('[data-testid=story-body]')?.dataset.form ?? ''`);
  if (E.FINDING_OWNERS && form === 'full') {
    const owners = JSON.parse(E.FINDING_OWNERS);
    const got = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid=story-body] [data-testid=finding]')].map(f=>[f.dataset.finding, f.closest('[data-testid=measure]')?.dataset.engagement ?? null, !!f.closest('[data-testid=findings-unplaced]')]))`));
    const ids = Object.keys(owners).sort().join(',');
    check(got.map((x) => x[0]).sort().join(',') === ids, `${where}: each finding on the record prints once (${Object.keys(owners).length})`, JSON.stringify(got));
    if (V >= 2) check(got.length > 0 && got.every(([f, g]) => g !== null && g === owners[f]), `${where}: each finding sits inside the block of the engagement that owns its outcome`, JSON.stringify({ got, owners }));
    else check(got.every(([, g, u]) => g === null && u), `${where}: a version-1 story prints its findings under "Findings on the record", under no engagement`, JSON.stringify(got));
  }
  if (V >= 2) {
    const order = JSON.parse(await ev(`JSON.stringify((()=>{const seen=[];for(const x of document.querySelectorAll('[data-testid=story-body] [data-testid=ledger-ref]')){const n=Number(x.dataset.n);if(!seen.includes(n))seen.push(n)}return seen})())`));
    const entries = await ev(`document.querySelectorAll('[data-testid=ledger-entry]').length`);
    if (form === 'full') check(order.length === entries && order.every((n, i) => n === i + 1), `${where}: the ledger numbers first appear in reading order, 1 to ${entries}, none skipped`, JSON.stringify(order));
    else check(order.every((n, i) => i === 0 || n > order[i - 1]), `${where}: on the one page, the ledger numbers ascend`, JSON.stringify(order));
  }
  const gut = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid=banners] > div')].filter(d=>d.getClientRects().length>0).map(d=>{const w=document.createTreeWalker(d,NodeFilter.SHOW_TEXT);const t=w.nextNode();if(!t)return [d.dataset.testid,-1];const r=document.createRange();r.selectNodeContents(t);return [d.dataset.testid,Math.round(r.getClientRects()[0].left)]}))`));
  check(gut.length > 0 && gut.every(([, x]) => x >= 16), `${where}: each banner's text starts at least 16 px from the left edge (${gut.map(([t, x]) => `${t} ${x}`).join(', ')})`, JSON.stringify(gut));
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await send('Emulation.setDeviceMetricsOverride', { width: 701, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const cols = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid=ledger-n]')].filter(c=>c.textContent.trim().length>=2).map(c=>{const r=document.createRange();r.selectNodeContents(c);return [c.textContent.trim(), [...r.getClientRects()].filter(x=>x.width>0).length]}))`));
  await send('Emulation.setEmulatedMedia', { media: '' });
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: WIDTH < 600 });
  await sleep(400);
  if (cols.length) check(cols.every(([, n]) => n === 1), `${where}: printed, each two-digit ledger # is one line (${cols.length})`, JSON.stringify(cols.filter(([, n]) => n !== 1)));
  const lines = await ev(`document.querySelectorAll('[data-testid=headline]').length`);
  const head = await ev(`document.querySelector('[data-testid=headline-heading]')?.textContent ?? ''`);
  check(head === (lines > 1 ? 'Each line’s latest sealed run' : 'The latest sealed run'), `${where}: the headline's heading reads "${head}" over ${lines} line(s)`, head);
  if (lines > 1) {
    const hn = await ev(`document.querySelector('[data-testid=headline-note]')?.textContent ?? ''`);
    check(hn === 'No score is averaged or combined across lines.', `${where}: "No score is averaged or combined across lines."`, hn);
  }
  if (form === 'full') {
    const note = await ev(`document.querySelector('[data-testid=timeline-note]')?.textContent ?? ''`);
    check(note === 'Each line’s latest run is its score; earlier runs print here only.', `${where}: the timeline's note says "line"`, note);
    check(!/engagement/i.test(head + note), `${where}: neither the heading nor the note says "engagement"`);
  }
  const why = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-testid^=stage-] span')].map(x=>x.textContent).filter(t=>/^needs a second/.test(t)))`));
  if (E.STAGE !== 'compounding') check(why.length > 0 && why.every((t) => t === 'needs a second verified actual, from a separate measurement'), `${where}: the stage strip reads "needs a second verified actual, from a separate measurement"`, JSON.stringify(why));
  if (E.TENANT) {
    const prep = await ev(`document.querySelector('[data-testid=story-prepared]')?.textContent ?? ''`);
    const want = V >= 2 ? `Prepared by Rule 76 Consulting LLC for ${E.TENANT}, with LVRF` : `Prepared by ${E.TENANT} with LVRF`;
    check(prep === want, `${where}: "${want}"`, prep);
  }
}

for (const s of SECTIONS) {
  if (s === 'draft') {
    await go(`/accounts/${E.INST}/story`);
    await waitFor(`!!document.querySelector('[data-testid=story-body]')`);
    check(await ev(`!!document.querySelector('[data-testid=banner-draft]')`), 'draft: marked DRAFT');
    check(!(await ev(`!!document.querySelector('[data-testid=print-story]')`)), 'draft: no Print control (only an issued story prints)');
    await body('draft');
    await shot('story-draft');
  }
  if (s === 'issue') {
    await go(`/accounts/${E.INST}/story${E.AUDIENCE === 'client' ? '?audience=client' : ''}`);
    await waitFor(`!!document.querySelector('[data-testid=issue-open]')`);
    await ev(`document.querySelector('[data-testid=issue-open]').click()`);
    await waitFor(`!!document.querySelector('[data-testid=issue-confirm]')`);
    const c = await ev(`document.querySelector('[data-testid=issue-confirm]').textContent`);
    check(/sealed when issued/.test(c) && /never edited/.test(c) && /withdrawn, never deleted/.test(c), 'issue: the confirmation says what issuing records, in full', c);
    await ev(`document.querySelector('[data-testid=issue-yes]').click()`);
    const okd = await waitFor(`!!document.querySelector('[data-testid=issued-note] a')`);
    const href = okd ? await ev(`document.querySelector('[data-testid=issued-note] a').getAttribute('href')`) : '';
    check(okd, 'issue: issued through the page', await ev(`document.querySelector('[data-testid=issue-note]')?.textContent ?? ''`));
    console.log(`ISSUED ${String(href).replace('/stories/', '')}`);
  }
  if (s === 'issued') {
    await go(`/stories/${E.STORY}`);
    await waitFor(`!!document.querySelector('[data-testid=story-body]')`);
    check(await ev(`!!document.querySelector('[data-testid=print-story]')`), 'issued: Print is offered');
    check(!(await ev(`!!document.querySelector('[data-testid=banner-draft]')`)), 'issued: not marked DRAFT');
    const hash = await ev(`document.querySelector('[data-testid=story-hash]')?.textContent ?? ''`);
    check(hash === `Story record hash ${E.HASH}`, 'issued: the full story record hash prints on the page', hash);
    const line = await ev(`document.querySelector('[data-testid=print-record-line]')?.dataset.recordLine ?? ''`);
    check(line.includes(`story record hash ${E.HASH}`) && line.includes('Prepared by '), 'issued: the record line on every printed page carries the full hash and "Prepared by … with LVRF"', line);
    check(line.includes(` · composer version ${V} · `), `issued: the record line names "composer version ${V}"`, line);
    if (E.TENANT) {
      const meta = await ev(`document.querySelector('[data-testid=cover-meta]')?.textContent ?? ''`);
      check(meta.endsWith(`for ${E.TENANT}’s people`), `issued: the cover reads "for ${E.TENANT}’s people"`, meta);
    }
    await body('issued, full');
    await shot('story-issued-full');
    await go(`/stories/${E.STORY}?form=onepage`);
    await waitFor(`document.querySelector('[data-testid=story-body]')?.dataset.form === 'onepage'`);
    await body('issued, one page');
    await shot('story-issued-onepage');
  }
  if (s === 'pdf') {
    // S7b.1 (Brad, 26 Nov 2026): /stories/E.STORY printed to PDF, both forms, at each of E.SCALES; beside each PDF a JSON
    // with what the page-by-page check needs: the record line, each ledger row (figure, source, ids), and each heading
    // with the start of the first content after it. Writes E.OUT_DIR/E.PDF_NAME_<form>_<scale>.{pdf,json}.
    const { writeFileSync } = await import('node:fs');
    for (const form of ['full', 'onepage']) {
      await go(`/stories/${E.STORY}${form === 'onepage' ? '?form=onepage' : ''}`);
      await waitFor(`document.querySelector('[data-testid=story-body]')?.dataset.form === ${JSON.stringify(form)}`);
      await ev(`document.fonts.ready.then(()=>true)`); await sleep(800);
      await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(300);
      const meta = JSON.parse(await ev(`JSON.stringify({
        record_line: document.querySelector('[data-testid=print-record-line]')?.dataset.recordLine ?? '',
        ledger: [...document.querySelectorAll('[data-testid=ledger-entry]')].map(tr=>{const td=tr.querySelectorAll('td');
          const ids=td[2].querySelector('[data-testid=ledger-ids]')?.innerText ?? '';
          const src=td[2].innerText; return { n: tr.dataset.n, figure: td[1].innerText, source: src.endsWith(ids) ? src.slice(0, src.length - ids.length) : src, ids }}),
        headings: [...document.querySelectorAll('[data-testid=story-body] h2, [data-testid=story-body] h3, [data-testid=print-close] h2')].map(h=>{
          let x=h.nextElementSibling; while (x && /^H[23]$/.test(x.tagName)) x=x.nextElementSibling;
          if (!x || !x.getClientRects().length) return null;
          // What follows: a table's first body row (its header row repeats on every page); a block that opens with its
          // own heading, the first thing after that heading (letter-spaced labels come apart into letters in the PDF).
          const first = (el) => {
            if (el.matches('table')) return el.tBodies[0]?.rows[0] ?? el;
            if (el.firstElementChild && /^H[23]$/.test(el.firstElementChild.tagName)) {
              let y = el.firstElementChild; while (y && /^H[23]$/.test(y.tagName)) y = y.nextElementSibling;
              return y ? first(y) : el;
            }
            return el;
          };
          return { heading: h.innerText.trim(), follow: first(x).innerText.trim() };
        }).filter(Boolean) })`));
      await send('Emulation.setEmulatedMedia', { media: '' }); await sleep(300);
      for (const scale of (E.SCALES ?? '1').split(',')) {
        const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, scale: Number(scale) });
        if (!pdf.result) { check(false, `pdf: ${form} at ${scale} printed`, JSON.stringify(pdf).slice(0, 200)); continue; }
        const base = `${E.OUT_DIR}/${E.PDF_NAME}_${form}_${scale}`;
        writeFileSync(`${base}.pdf`, Buffer.from(pdf.result.data, 'base64'));
        writeFileSync(`${base}.json`, JSON.stringify(meta));
        console.log(`PDF ${base}.pdf`);
      }
    }
  }
  if (s === 'html') {
    await go(`/stories/${E.STORY}`);
    await waitFor(`!!document.querySelector('[data-testid=story-body]')`);
    await sleep(500);
    const html = await ev(`document.querySelector('[data-testid=story-body]').outerHTML`);
    const { createHash } = await import('node:crypto');
    console.log(`HTML ${createHash('md5').update(html ?? '').digest('hex')}`);
  }
  if (s === 'current') {
    await go(`/accounts/${E.INST}/story${E.AUDIENCE === 'client' ? '?audience=client' : ''}`);
    await waitFor(`!!document.querySelector('[data-testid=story-body]')`);
    await sleep(300);
    const want = E.EXPECT_CURRENT;
    const id8 = String(E.CURRENT ?? '').slice(0, 8);
    const line = async (tid) => ev(`document.querySelector('[data-testid=${tid}]')?.textContent ?? null`);
    const href = async (tid) => ev(`document.querySelector('[data-testid=${tid}] a')?.getAttribute('href') ?? null`);
    const button = await ev(`!!document.querySelector('[data-testid=issue-open]')`);
    if (want === 'same') {
      const t = await line('issued-as');
      check(t === `Issued as ${id8} on ${E.CURRENT_ON} (UTC). Nothing on the record has changed since.`, `current: "Issued as ${id8} on ${E.CURRENT_ON} (UTC). Nothing on the record has changed since."`, t);
      check((await href('issued-as')) === `/stories/${E.CURRENT}`, `current: ${id8} links to its issued story`, await href('issued-as'));
      check(!(await line('record-changed')), 'current: not "The record has changed"');
    } else if (want === 'changed') {
      const t = await line('record-changed');
      check(t === `The record has changed since ${id8} was issued. Withdraw it to issue the new story.`, `current: "The record has changed since ${id8} was issued. Withdraw it to issue the new story."`, t);
      check((await href('record-changed')) === `/stories/${E.CURRENT}`, `current: ${id8} links to its issued story, where it is withdrawn`, await href('record-changed'));
      check(!(await line('issued-as')), 'current: not "Issued as"');
    }
    if (want === 'none') {
      check(button, 'current: no story is current, so "Issue this story…" is offered');
      check(!(await line('issued-as')) && !(await line('record-changed')), 'current: neither line');
    } else {
      check(!button, `current: no issue control while ${id8} is current`);
    }
    await shot(`story-current-${want}`);
  }
  if (s === 'withdraw') {
    await go(`/stories/${E.STORY}`);
    await waitFor(`!!document.querySelector('[data-testid=withdraw-open]')`);
    await ev(`document.querySelector('[data-testid=withdraw-open]').click()`);
    await waitFor(`!!document.querySelector('[data-testid=withdraw-reason]')`);
    await ev(`(()=>{const el=document.querySelector('[data-testid=withdraw-reason]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(E.REASON ?? '')});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    await sleep(200);
    await ev(`document.querySelector('[data-testid=withdraw-yes]').click()`);
    const w = await waitFor(`!!document.querySelector('[data-testid=withdrawn-note]')`);
    const t = w ? await ev(`document.querySelector('[data-testid=withdrawn-note]').textContent`) : '';
    check(w && t.includes(E.REASON ?? '\u0000'), 'withdraw: withdrawn through the page, with its reason', t);
    if (w) console.log(`WITHDRAWN ${E.STORY}`);
  }
  if (s === 'refused') {
    await go(`/accounts/${E.INST}/story?audience=client`);
    const r = await waitFor(`!!document.querySelector('[data-testid=draft-refused]')`);
    const m = r ? await ev(`document.querySelector('[data-testid=draft-refused]').textContent`) : '';
    check(/no client copy/.test(m), "refused: a reference example's client copy is refused, in plain words", m);
    check(!(await ev(`!!document.querySelector('[data-testid=issue-open]')`)), 'refused: no issue control');
  }
}
console.log('DONE');
ws.close(); process.exit(0);
