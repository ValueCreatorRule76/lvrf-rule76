// S3 (3.1; LVRF_PLAN §22) — the browser walk for scripts/verify_s3_print_family.sh, over the Chrome DevTools Protocol.
// Signs in by session as the steward; THROWAWAY CLONE ONLY. Each mode prints JSON on its last line (the script reads
// it) after PASS/FAIL lines of its own.
//
//   node scripts/lib/s3_walk.mjs inspect PATH NAME   load PATH; in print media, check the page (below); print to PDF
//                                                     at $OUT/NAME.pdf; write the screen text at $OUT/NAME.screen.txt
//   node scripts/lib/s3_walk.mjs text PATH NAME      the screen text only (for the deployed code's side)
//   node scripts/lib/s3_walk.mjs probe PATH          a case read, to find a run the CFO lens shows (JSON)
//
// inspect's checks, in print media:
//   banners   the cover's banners are the same element as the body pages' (thead), at least as large, as heavy, and
//             in the same colours (Brad's condition 1)
//   display   Bebas display type carries measured numbers and headings only; no status word in display (change 2)
//   contrast  every visible text element meets AA on its background (4.5:1; 3:1 at large sizes)
//   network   no request leaves the app's own origin (condition 2: no outside font, nor anything else)
//   furniture the cover, the close (disclaimer before the smaller tagline), the record line with the full hash
import { writeFileSync } from 'node:fs';

const [MODE, PATH, NAME] = process.argv.slice(2);
const E = process.env;
const APP = `http://localhost:${E.VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0;
const pend = new Map();
const requests = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Network.requestWillBeSent') requests.push({ url: m.params.request.url, type: m.params.type });
});
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 25000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${APP}/` });
await waitFor(`document.readyState === 'complete'`);
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await send('Page.navigate', { url: `${APP}/` });
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
await waitFor(`document.body.textContent.includes('Signed in as')`);

if (MODE === 'probe') {
  const r = await ev(`fetch(${JSON.stringify(PATH)}).then(r=>r.json())`);
  console.log(JSON.stringify({ refused: r?.cfo?.refused ?? null, lens: r?.lens ?? null }));
  process.exit(0);
}

requests.length = 0;
await send('Page.navigate', { url: `${APP}${PATH}` });
if (MODE === 'cold' && E.HOLD_FONT) {
  // Hold the named face's requests unanswered, as a slow first fetch is at the moment a person prints.
  await send('Fetch.enable', { patterns: [{ urlPattern: `*${E.HOLD_FONT}*`, requestStage: 'Request' }] });
}
if (MODE === 'cold') {
  // A person's first print (S3 Gate C finding, Brad, 19 Nov 2026): the page as loaded on screen, then printed at once,
  // with no print-media emulation or DOM read first (each of which loads the print-only faces and hid the fault).
  // Run in a fresh Chrome profile. PRINT_BG=0 is the print dialog's default, "Background graphics" off.
  await waitFor(`!!document.querySelector('[data-testid=value-case],[data-testid=pov]') && document.fonts.status === 'loaded'`, 30000);
  await waitFor(`![...document.querySelectorAll('[data-testid=value-case] p,[data-testid=pov] p')].some(p=>p.textContent.trim()==='loading')`, 20000);
  await sleep(1500);
  // Read BEFORE the print, as the page stands when a person presses Print or ⌘P: which faces have loaded, and each
  // face's font-display (under "block" a face still loading prints invisible text).
  const before = await ev(`({ loaded: [...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family.replace(/"/g,'')+' '+f.weight),
    displays: [...new Set([...document.fonts].map(f=>f.family.replace(/"/g,'')+' '+f.weight+' '+f.display))],
    record_line: (document.querySelector('[data-testid=print-record-line]')||{getAttribute:()=>null}).getAttribute('data-record-line'),
    banners: { body: [...document.querySelectorAll('[data-testid=print-header] [data-testid=banners] > div')].map(d=>({ text: d.textContent.trim() })) } })`);
  const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: E.PRINT_BG !== '0', displayHeaderFooter: false });
  writeFileSync(`${E.OUT}/${NAME}.pdf`, Buffer.from(pdf.result.data, 'base64'));
  writeFileSync(`${E.OUT}/${NAME}.json`, JSON.stringify(before));
  console.log(JSON.stringify(before));
  process.exit(0);
}
const ready = await waitFor(`!!document.querySelector('[data-testid=value-case],[data-testid=pov]') && document.fonts.status === 'loaded'`, 30000);
// Let the parts that load after the document (the confidence curve, the gap register) settle.
await waitFor(`![...document.querySelectorAll('[data-testid=value-case] p,[data-testid=pov] p')].some(p=>p.textContent.trim()==='loading')`, 20000);
await sleep(1500);
if (!ready) { console.log(JSON.stringify({ error: 'the page did not load' })); process.exit(0); }

// The screen text of the document, from the live page in screen media, where every print-only piece (S3's cover, stats,
// close and record line; the thead and the old tfoot) is display:none and so out of innerText. The live page lays the
// text out, so its lines are the rendered lines: a merged line or a moved one changes the text (B9), as a changed
// word does (B6). (A detached clone has no layout; its innerText is one line, which hid both.)
const screenText = await ev(`(()=>{const root=document.querySelector('[data-testid=value-case],[data-testid=pov]');
  return root.innerText.replace(/[ \\t]+/g,' ').split('\\n').map(l=>l.trim()).filter(Boolean).join('\\n')})()`);
writeFileSync(`${E.OUT}/${NAME}.screen.txt`, screenText + '\n');
if (MODE === 'text') { console.log(JSON.stringify({ ok: true })); process.exit(0); }

await send('Emulation.setEmulatedMedia', { media: 'print' });
await sleep(800);
const report = await ev(`(()=>{
  const out = {};
  const cs = (el) => getComputedStyle(el);
  const visible = (el) => { const s = cs(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0; };
  // banners: the cover's against the body pages' (the repeated thead)
  const cover = document.querySelector('[data-testid=print-cover] [data-testid=cover-banners] [data-testid=banners]');
  const body = document.querySelector('[data-testid=print-header] [data-testid=banners]');
  const rows = (root) => root ? [...root.children].map(d => ({ id: d.getAttribute('data-testid'), text: d.textContent.trim(), size: parseFloat(cs(d).fontSize), weight: Number(cs(d).fontWeight), color: cs(d).color, family: cs(d).fontFamily })) : null;
  out.banners = { cover: rows(cover), body: rows(body) };
  // display type
  const STATUS = ['claimed','verified','unverified','realized','not realized','not measured','not committed','not recorded','open','needed','refused','partial','at risk','watch','healthy','warning','critical','gap','met','not met','answered','failed','pending','accepted','rejected','current','passed','not reached'];
  const disp = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('svg')) continue;
    const own = [...el.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join('').trim();
    if (!own) continue;
    if (!/Bebas/.test(cs(el).fontFamily)) continue;
    const tag = el.tagName.toLowerCase();
    const heading = ['h1','h2','h3'].includes(tag) || el.closest('h1,h2,h3');
    const word = own.toLowerCase().replace(/[^a-z ]/g,'').trim();
    const isNumber = /^[−+-]?[0-9][0-9.,]*$/.test(own.replace(/\\s/g,''));
    if (STATUS.includes(word) || (!heading && !isNumber)) disp.push({ tag, text: own.slice(0, 60), testid: el.getAttribute('data-testid') });
  }
  out.display = disp;
  // contrast
  const rgb = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(x=>parseFloat(x)); return { r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(cs(e).backgroundColor); if (c && c.a > 0) return c; } return { r:255, g:255, b:255, a:1 }; };
  const bad = []; let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('svg')) continue;
    const own = [...el.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join('').trim();
    if (!own) continue;
    const fg = rgb(cs(el).color); if (!fg) continue;
    const bg = bgOf(el); checked++;
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
    const px = parseFloat(cs(el).fontSize), bold = Number(cs(el).fontWeight) >= 600;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio + 1e-9 < need) bad.push({ text: own.slice(0, 50), ratio: Math.round(ratio*100)/100, need, color: cs(el).color, bg: 'rgb('+bg.r+', '+bg.g+', '+bg.b+')', px });
  }
  out.contrast = { checked, bad };
  // furniture
  const close = document.querySelector('[data-testid=print-close]');
  const h = close && close.querySelector('[data-testid=close-heading]'), dsc = close && close.querySelector('[data-testid=close-disclaimer]'), tg = close && close.querySelector('[data-testid=close-tagline]');
  out.close = close ? { order: !!(h && dsc && tg && (h.compareDocumentPosition(dsc) & 4) && (dsc.compareDocumentPosition(tg) & 4)), heading: h && parseFloat(cs(h).fontSize), tagline: tg && parseFloat(cs(tg).fontSize), disclaimer: dsc && dsc.textContent } : null;
  const rl = document.querySelector('[data-testid=print-record-line]');
  out.record_line = rl ? rl.getAttribute('data-record-line') : null;
  out.cover = !!document.querySelector('[data-testid=print-cover]') && visible(document.querySelector('[data-testid=print-cover]'));
  out.grid = [...document.querySelectorAll('[data-testid=value-case] *, [data-testid=pov] *')].filter(el => /grid/.test(cs(el).display)).length;
  return out;
})()`);
report.outside_requests = requests.filter((r) => !/^(http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:)/.test(r.url)).map((r) => r.url);
report.font_requests = requests.filter((r) => r.type === 'Font').map((r) => r.url);
const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
writeFileSync(`${E.OUT}/${NAME}.pdf`, Buffer.from(pdf.result.data, 'base64'));
console.log(JSON.stringify(report));
ws.close();
process.exit(0);
