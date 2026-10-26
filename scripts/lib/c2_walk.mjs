// C2 — the browser walk of what a commitment's and a verification's attestation support, and of an
// erratum not recomputed, over the Chrome DevTools Protocol. Called by scripts/verify_c2.sh; prints
// "  PASS"/"  FAIL" lines it counts. The CDP preamble is corrections_walk.mjs's. Signs in by SESSION.
//
//   node scripts/lib/c2_walk.mjs MODE VITE_PORT CDP_PORT SHOTS TOKEN INST RUN PDF_NAME
//
// MODE:
//   supports   INST's walk (W6), its POV and RUN's page: the attestations read "supports the
//              commitment" and "supports the verification", never the impact basis
//   erratum    RUN's page at 1280 and 390: its erratum reads "Not recomputed: …" beside the sealed
//              score, and no other score; printed to SHOTS/PDF_NAME
import { writeFileSync } from 'node:fs';

const [MODE, VITE_PORT, CDP_PORT, SHOTS, TOKEN, INST, RUN, PDF_NAME] = process.argv.slice(2);
const APP = `http://localhost:${VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(`${m}${detail ? ` — ${detail}` : ''}`));

const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (await ev(expr)) return true; await sleep(200); } return false; };
await send('Network.enable');
await send('Network.setCookie', { name: 'lvrf_session', value: TOKEN, domain: 'localhost', path: '/', httpOnly: true });
const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
const open = async (path, ready, width = 1280) => {
  await viewport(width);
  await send('Page.navigate', { url: `${APP}${path}` });
  const shown = await waitFor(ready);
  await sleep(900);
  return shown;
};
const shot = async (name, width) => {
  const h = await ev('document.documentElement.scrollHeight');
  await viewport(width, Math.min(h, 12000)); await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  await viewport(width);
  console.log(`  shot  ${SHOTS}/${name}.png`);
};
const openFolds = () => ev(`document.querySelectorAll('[data-testid$=-toggle][aria-expanded=false]').forEach(b=>b.click()); document.querySelectorAll('details').forEach(d=>d.open=true)`);
const runReady = `!!document.querySelector('[data-testid=run-page] h1')`;

if (MODE === 'supports') {
  check(await open(`/accounts/${INST}`, `!!document.querySelector('[data-testid=w6]')`), 'the account page shows the walk (W6)');
  // Unfold the workspace step holding W6, as a reader would (corrections_walk.mjs's unfold).
  await ev(`(()=>{const el=document.querySelector('[data-testid=w6]');if(!el)return 0;let n=0;for(let p=el;p;p=p.parentElement){if(p.tagName==='DETAILS'&&!p.open){p.open=true;n++;}if(p.dataset&&p.dataset.open==='false'){p.querySelector('[data-step-toggle]')?.click();n++;}}return n})()`); await sleep(400);
  const w6 = await ev(`[...document.querySelectorAll('[data-testid=w6-evidence]')].map(li=>li.textContent)`);
  check(Array.isArray(w6) && w6.some((x) => x.startsWith('attestation · supports the commitment')) && w6.some((x) => x.startsWith('attestation · supports the verification')),
    'W6 lists the attestations as "supports the commitment" and "supports the verification"', JSON.stringify((w6 ?? []).map((x) => x.slice(0, 50))));
  check(Array.isArray(w6) && !w6.some((x) => x.startsWith('attestation · supports impact')), '  ...and neither as the impact basis');
  await shot('c2_walk_supports_1280', 1280);
  check(await open(`/accounts/${INST}/pov`, `!!document.querySelector('[data-testid=pov] h1')`), 'the POV opens');
  const pov = await ev(`document.querySelector('[data-testid=pov]').innerText`);
  check(/the commitment: /.test(pov) && /the verification: /.test(pov), 'the POV lists them as "the commitment: …" and "the verification: …"', '');
  await shot('c2_pov_supports_1280', 1280);
  for (const width of [1280, 390]) {
    check(await open(`/runs/${RUN}`, runReady, width), `the run page @${width} opens`);
    await openFolds(); await sleep(500);
    const sealed = await ev(`[...document.querySelectorAll('[data-testid=sealed-item]')].map(x=>x.innerText)`);
    check(Array.isArray(sealed) && sealed.some((x) => /supports the commitment/.test(x)) && sealed.some((x) => /supports the verification/.test(x)),
      `@${width}: the sealed evidence reads "supports the commitment" and "supports the verification"`, JSON.stringify((sealed ?? []).map((x) => x.slice(0, 80))));
    check((await ev('document.documentElement.scrollWidth')) <= width, `@${width}: no sideways scroll`);
    await shot(`c2_run_supports_${width}`, width);
  }
}

if (MODE === 'erratum') {
  const { SEALED } = process.env;
  for (const width of [1280, 390]) {
    check(await open(`/runs/${RUN}`, runReady, width), `the attested run @${width} opens`);
    await openFolds(); await sleep(500);
    const shown = `[...document.querySelectorAll('[data-testid=banners]')].find(x=>x.offsetParent!==null)`;
    const b = await ev(`(${shown})?.querySelector('[data-testid=banner-erratum]')?.textContent ?? ''`);
    check(b.includes("Not recomputed: this run's seal does not carry who attested its attested evidence") && b.includes(`(sealed: ${SEALED} / 100`),
      `@${width}: the erratum reads "Not recomputed: this run's seal does not carry who attested …" beside "(sealed: ${SEALED} / 100 …)"`, b.slice(-260));
    check(/it could feed only the sealed factor asking "Is the currency figure's derivation stated and supported\?", sealed at 10 of 10: "No currency figure claimed — nothing to substantiate\."/.test(b),
      `@${width}: …and quotes, from the seal, the one factor the item could feed and its sealed value`);
    check(!/Recomputed under model/.test(b) && !/with the correction: \d/.test(b), `@${width}: …and states no recomputed score`);
    const others = await ev(`(()=>{let t=document.body.innerText;
      for(const el of document.querySelectorAll('[data-testid=banner-erratum],[data-testid=banner-erratum-line],[data-testid=record-erratum]')){const x=el.innerText;if(x)t=t.split(x).join(' ');}
      return [...t.matchAll(/(\\d+(?:\\.\\d+)?)\\s*\\/\\s*100\\b/g)].map(m=>m[1])})()`);
    check(Array.isArray(others) && others.length >= 2 && others.every((x) => Number(x) === Number(SEALED)), `@${width}: every other score on the page is the sealed ${SEALED} / 100 (${others?.length} of them)`, JSON.stringify(others));
    await shot(`c2_run_not_recomputed_${width}`, width);
  }
  await open(`/runs/${RUN}`, runReady);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  writeFileSync(`${SHOTS}/${PDF_NAME}`, Buffer.from(pdf.result.data, 'base64'));
}

ws.close();
process.exit(0);
