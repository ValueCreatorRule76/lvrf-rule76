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
//   refused  /accounts/E.INST/story?audience=client: the refusal for a reference example, no issue control
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
    await go(`/accounts/${E.INST}/story`);
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
    await body('issued, full');
    await shot('story-issued-full');
    await go(`/stories/${E.STORY}?form=onepage`);
    await waitFor(`document.querySelector('[data-testid=story-body]')?.dataset.form === 'onepage'`);
    await body('issued, one page');
    await shot('story-issued-onepage');
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
