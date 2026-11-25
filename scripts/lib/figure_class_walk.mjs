// S7a (LVRF_PLAN §33) — the published figure's class on the page, for scripts/verify_figure_class.sh.
//
//   node scripts/lib/figure_class_walk.mjs SECTION[,SECTION]
//
//   record    on E.INST, card 01c's "Record a source…": no class for an observation; for a vendor publication the field,
//             its unmet line, the chosen class's two lines in the ruled wording (E.RULED, JSON), their contrast, and the
//             confirmation naming the class; at E.WIDTH, no sideways scroll
//   filing    the same form, a public filing: the field offered, optional (nothing unmet without it)
//   supersede on E.INST, "Supersede…" on row E.ROW: the field, required for a vendor publication
//   own       on E.SELF (your own company's): a vendor publication offers no class
//   w6        on E.INST, W6's "Add evidence": the field for a vendor publication
const SECTIONS = (process.argv[2] ?? 'lists').split(',');
const E = process.env;
const TAG = E.TAG ?? 'class';
const APP = `http://localhost:${E.VITE_PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const check = (c, m, d = '') => { const line = `${c ? 'PASS' : 'FAIL'}  ${TAG}: ${m}${!c && d ? ` — ${String(d).slice(0, 300)}` : ''}`; out.push(line); console.log(line); };
const t = await (await fetch(`http://127.0.0.1:${E.CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++n; const to = setTimeout(() => { pend.delete(id); r({ timeout: true }); }, 15000); pend.set(id, (m) => { clearTimeout(to); r(m); }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expr, ms = 25000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(200); } return false; };
const go = async (path) => { await send('Page.navigate', { url: `${APP}${path}` }); await sleep(300); await waitFor(`document.readyState === 'complete'`); };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: Number(E.WIDTH ?? 1280), height: 900, deviceScaleFactor: 1, mobile: Number(E.WIDTH ?? 1280) < 600 });

await go('/');
await ev(`fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>null)`);
await go('/');
await waitFor(`!!document.querySelector('input[type=password]')`);
await ev(`(()=>{const set=(sel,v)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set('input[type=email]',${JSON.stringify(E.S_EMAIL)});set('input[type=password]',${JSON.stringify(E.PW)});return true})()`);
await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Sign in').click()`);
if (!(await waitFor(`document.body.textContent.includes('Signed in as')`))) { check(false, 'signed in through the page'); console.log('DONE 0 1'); process.exit(0); }



const openAccount = async (inst) => {
  await go(`/accounts/${inst}`);
  await waitFor(`!!document.querySelector('[data-testid=account-detail]') || !!document.querySelector('[data-testid=record-source-open]')`, 30000);
  await ev(`(()=>{document.querySelectorAll('[data-testid=account-detail]').forEach(d=>{d.open=true});return true})()`); await sleep(800);
};
const setIn = (scope, sel, value) => ev(`(()=>{const el=${scope}?.querySelector(${JSON.stringify(sel)});if(!el)return false;
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
const RULED = JSON.parse(E.RULED);
const contrast = (sel) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;
  const rgb=(c)=>c.match(/[\\d.]+/g).slice(0,3).map(Number);const lum=(c)=>{const v=rgb(c).map(x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)});return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]};
  let b=el,bg='rgba(0, 0, 0, 0)';while(b&&(bg=getComputedStyle(b).backgroundColor)==='rgba(0, 0, 0, 0)')b=b.parentElement;if(bg==='rgba(0, 0, 0, 0)')bg='rgb(255, 255, 255)';
  const a=lum(getComputedStyle(el).color),c=lum(bg);return Math.round(((Math.max(a,c)+0.05)/(Math.min(a,c)+0.05))*100)/100})()`);
const fill = async (f, kind) => {
  await setIn(f, '[data-testid=source-kind]', kind); await sleep(200);
  await setIn(f, '[data-testid=source-summary]', E.SUMMARY); await setIn(f, '[data-testid=source-provenance]', 'Northstar Learning case study (fixture, not a source)');
};
const unmet = (f) => ev(`${f}?.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`);

if (SECTIONS.includes('record') || SECTIONS.includes('filing')) {
  await openAccount(E.INST);
  await ev(`document.querySelector('[data-testid=record-source-open]')?.click()`); await sleep(400);
  const f = `document.querySelector('[data-testid=record-source]')`;
  check(await ev(`!!${f}`), 'record: card 01c\'s "Record a source…" opens');
  if (SECTIONS.includes('record')) {
    await fill(f, 'observation');
    check((await ev(`!${f}?.querySelector('[data-testid=figure-class]')`)) === true, 'record: an observation offers no class');
    await setIn(f, '[data-testid=source-kind]', 'vendor_publication'); await sleep(300);
    check((await ev(`!!${f}?.querySelector('[data-testid=figure-class]')`)) === true, 'record: a vendor publication offers "What kind of figure it gives"');
    check((await unmet(f)).includes('choose what kind of figure it gives'), 'record: until chosen, the form will not submit, and says why', await unmet(f));
    for (const c of RULED) {
      await setIn(f, '[data-testid=figure-class-select]', c.value); await sleep(150);
      const can = await ev(`${f}?.querySelector('[data-testid=figure-class-can]')?.textContent ?? ''`);
      const cannot = await ev(`${f}?.querySelector('[data-testid=figure-class-cannot]')?.textContent ?? ''`);
      check(can === `It can support: ${c.can}.` && cannot === `It cannot support: ${c.cannot}.`, `record: ${c.label}: its two lines, in the ruled wording`, `${can} | ${cannot}`);
    }
    const cc = await contrast(`[data-testid=figure-class-can]`), cx = await contrast(`[data-testid=figure-class-cannot]`);
    check(cc >= 4.5 && cx >= 4.5, `record: the two lines pass contrast (can ${cc}:1, cannot ${cx}:1, at least 4.5)`, `${cc} ${cx}`);
    await setIn(f, '[data-testid=figure-class-select]', 'outcome_with_baseline'); await sleep(200);
    const wide = await ev(`document.documentElement.scrollWidth`);
    check(wide <= Number(E.WIDTH), `record: at ${E.WIDTH}, no sideways scroll (${wide})`, wide);
    await setIn(f, '[data-testid=evidence-form-choice]', 'quote'); await sleep(250);
    await ev(`(()=>{const box=${f}.querySelector('[data-testid=evidence-form-input]');const tas=[...box.querySelectorAll('textarea')];
      const set=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
      set(tas[0],'Audit findings fell from 31 in 2023 to 12 in 2025.');set(tas[tas.length-1],'Page 2, the results panel, second line (fixture).');return tas.length})()`); await sleep(250);
    await setIn(f, '[data-testid=about-choice]', 'account'); await sleep(250);
    const u = await unmet(f);
    check(u === '', 'record: complete, nothing unmet', u);
    await ev(`${f}?.querySelector('button[type=submit]')?.click()`);
    check(await waitFor(`!!${f}?.querySelector('[data-testid=form-confirm]')`, 8000), 'record: it asks for confirmation');
    const ct = await ev(`${f}?.querySelector('[data-testid=form-confirm]')?.textContent ?? ''`);
    const w = RULED.find((c) => c.value === 'outcome_with_baseline');
    check(ct.includes('What kind of figure it gives') && ct.includes(`${w.label}. It can support: ${w.can}. It cannot support: ${w.cannot}.`), 'record: the confirmation names the class and its two lines', ct.slice(0, 400));
    await ev(`${f}?.querySelector('[data-testid=form-confirm-yes]')?.click()`);
    check(await waitFor(`!document.querySelector('[data-testid=record-source]')`, 15000), 'record: confirmed; recorded');
  }
  if (SECTIONS.includes('filing')) {
    await openAccount(E.INST);
    await ev(`document.querySelector('[data-testid=record-source-open]')?.click()`); await sleep(400);
    await setIn(f, '[data-testid=source-kind]', 'public_filing'); await sleep(300);
    const lab = await ev(`${f}?.querySelector('[data-testid=figure-class] span')?.textContent ?? null`);
    check(lab === 'What kind of figure it gives (optional for a public filing)', 'filing: a public filing offers the class, optional', lab);
    check(!(await unmet(f)).includes('figure'), 'filing: without one, nothing is unmet for it', await unmet(f));
  }
}

if (SECTIONS.includes('supersede')) {
  await openAccount(E.INST);
  const row = `document.querySelector('[data-testid=account-evidence-row][data-evidence="${E.ROW}"]')`;
  check(await waitFor(`!!${row}`, 20000), 'supersede: the classed row is listed');
  const shown = await ev(`${row}?.querySelector('[data-testid=evidence-figure-class]')?.textContent ?? null`);
  check(shown === ' · outcome with baseline', 'supersede: the row prints its class beside its kind', shown);
  await ev(`${row}?.querySelector('[data-testid=supersede-open]')?.click()`); await sleep(500);
  const f = `(${row}?.querySelector('[data-testid=supersede]'))`;
  await setIn(f, '[data-testid=source-kind]', 'vendor_publication'); await sleep(300);
  check((await ev(`!!(${f})?.querySelector('[data-testid=figure-class]')`)) === true, 'supersede: the successor of a vendor publication states its class');
  check((await ev(`(${f})?.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`)).includes('choose what kind of figure it gives'), 'supersede: required, and says so');
}

if (SECTIONS.includes('own')) {
  await openAccount(E.SELF);
  await ev(`document.querySelector('[data-testid=record-source-open]')?.click()`); await sleep(400);
  const f = `document.querySelector('[data-testid=record-source]')`;
  await setIn(f, '[data-testid=source-kind]', 'vendor_publication'); await sleep(300);
  check((await ev(`!!${f}`)) === true && (await ev(`!${f}?.querySelector('[data-testid=figure-class]')`)) === true, "own: on your own company's account, a vendor publication offers no class");
}

if (SECTIONS.includes('w6')) {
  await openAccount(E.INST);
  const w6 = `document.querySelector('[data-testid=w6]')`;
  check(await waitFor(`!!${w6}?.querySelector('form') || !!${w6}?.querySelector('select')`, 20000), 'w6: W6 offers "Add evidence"');
  await ev(`(()=>{const sel=[...${w6}.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='vendor_publication'));if(!sel)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(sel,'vendor_publication');sel.dispatchEvent(new Event('change',{bubbles:true}));return true})()`); await sleep(300);
  check((await ev(`!!${w6}?.querySelector('[data-testid=figure-class]')`)) === true, 'w6: a vendor publication offers "What kind of figure it gives"');
  check((await ev(`${w6}?.querySelector('[data-testid=form-unmet]')?.textContent ?? ''`)).includes('choose what kind of figure it gives'), 'w6: required, and says so');
}

console.log(`DONE ${out.filter((l) => l.startsWith('PASS')).length} ${out.filter((l) => l.startsWith('FAIL')).length}`);
ws.close();
process.exit(0);
