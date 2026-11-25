#!/usr/bin/env node
/**
 * LVRF demo recorder: a captioned walkthrough of two examples, recorded to video.
 *   1. Skillsoft: run 3's value case, general lens, then the same run under the CFO lens (refused).
 *   2. Curia: the reference-example account, then its point of view.
 *
 * READ-ONLY BY CONSTRUCTION (CLAUDE.md rules 9 and 10). The recorded session blocks every
 * request that is not GET/HEAD/OPTIONS, so no click in this script can write to prod or
 * perform a steward act. It never presses Print (print-request is a governed write).
 *
 * Sign-in is done by you, by hand, in a separate unrecorded window. The script never sees
 * your LVRF password. The session cookie is held in a temp file for a second, then deleted.
 *
 * Colours and fonts come from the app's own Tailwind classes (bg-ink, text-gold, ...), so no
 * token value is restated here (CLAUDE.md, the one document registry rule).
 *
 * Usage (from this folder, on the Mac, with Google Chrome installed):
 *   npm install            # once; playwright-core uses your installed Chrome, downloads no browser
 *   npm run rehearse       # walk it through without recording
 *   npm run record         # record; the video lands in ~/Movies/LVRF demo/
 *
 * Environment (all optional):
 *   LVRF_URL               default https://lvrf-rule76.com
 *   LVRF_BASIC_USER/PASS   the Caddy basic_auth pair; asked for in the terminal if unset
 *   LVRF_SKILLSOFT_RUN_ID  go straight to this run instead of finding Skillsoft run 3 in Runs
 *   LVRF_DEMO_PACE         multiplies every pause (1.3 = slower, 0.7 = faster); default 1
 *   LVRF_DEMO_OUT          output folder; default ~/Movies/LVRF demo
 *   LVRF_DEMO_CARDS        the argument cards (PNG); default ~/lvrf-backups/demo-cards
 *   LVRF_DEMO_FINALE       the rendered PDF pages for the finale; default ~/lvrf-backups/demo-finale
 *                          (made from the S3 prints with: pdftoppm -r 200 -png <pdf> <prefix>)
 */
import { chromium } from 'playwright-core';
import { mkdir, rm, rename, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.env.LVRF_URL ?? 'https://lvrf-rule76.com').replace(/\/$/, '');
const OUT_DIR = process.env.LVRF_DEMO_OUT ?? path.join(os.homedir(), 'Movies', 'LVRF demo');
const PACE = Number(process.env.LVRF_DEMO_PACE ?? 1) || 1;
const REHEARSE = process.argv.includes('--rehearse');
const VIEWPORT = { width: 1440, height: 900 };
const FINALE_DIR = process.env.LVRF_DEMO_FINALE ?? path.join(os.homedir(), 'lvrf-backups', 'demo-finale');
const CARDS_DIR = process.env.LVRF_DEMO_CARDS ?? path.join(os.homedir(), 'lvrf-backups', 'demo-cards');
// The argument cards (rendered by cards/build.py), with seconds on screen. Cards carry no caption bar: they speak for themselves.
const OPENING_CARDS = [
  ['01-catalyst', 12], ['02-why-now', 13], ['03-not-just-ve', 12], ['04-principles', 13],
  ['05-architecture', 13], ['06-ai-assist', 14], ['07-heartbeat-packs', 13], ['08-spine', 13],
];
const FINALE_ORIGIN = 'https://lvrf-demo.invalid';

// ── Captions: edit freely. Keep them qualitative: no figure appears here that the page itself doesn't show. ──
const C = {
  introTitle: 'LVRF',
  introSub: 'Learning Value Realization Framework, for Skillsoft',
  home: ['Accounts', 'The value engineer’s home: every account, its engagements, and where each one stands.'],
  warRoom: ['The War Room', 'Every live engagement in one view: what is due, confirmed, refuted or late.'],
  warRoomMoney: ['The War Room', 'It never sums or averages money across accounts. Each account’s case stands on its own evidence.'],
  storyOpen: ['Story of record · draft', 'Curia’s story, composed from real locked runs only. A draft is on screen only, and never prints.'],
  storyScore: ['A sealed score, with its erratum', 'Every sealed confidence prints with its correction beside it, the same size and weight. Nothing is recomputed or hidden.'],
  storyStage: ['The stage follows the evidence', 'A reference example stays a reference. Nothing is called a result until a verified actual says so.'],
  storyPublished: ['Each published figure, classed', 'What each figure can support, and what it cannot, with its source.'],
  runs: ['Runs', 'Every run is sealed when it’s locked. We’ll open Skillsoft’s run 3.'],
  run: ['Skillsoft · run 3', 'One run of record. From here, its value case.'],
  caseGeneral: ['Value case · general lens', 'Read from the run’s sealed payload. Nothing on this page is computed in the browser.'],
  caseScroll: ['Value case · general lens', 'A record that isn’t verified renders as unverified. The banner is never suppressed to make a document look finished.'],
  caseHash: ['The record line', 'Every printed page carries the disclosure banner and the run’s record hash.'],
  cfoSwitch: ['Same run · CFO lens', 'Now the same sealed run, read the way the customer’s CFO will read it.'],
  cfoRefused: ['Under the CFO lens', 'The CFO lens refuses this case and says why, each reason with the question that clears it.'],
  cfoAsks: ['What we need from you', 'The refusal turns into asks: the evidence that would let this case survive procurement.'],
  curiaHome: ['Curia', 'A reference example, built from published material. It is not an engagement, and the app says so everywhere.'],
  curiaMarker: ['Curia · reference example', 'The marker names its source, so no one mistakes it for customer evidence.'],
  povOpen: ['Curia · point of view', 'The document a value engineer brings to the account.'],
  povBanners: ['Point of view', 'Outside-in and unverified, and it says so on every page.'],
  povConfidence: ['Computed confidence', 'Earned from evidence with named provenance. It is not typed in.'],
  povNoHyp: ['Value hypothesis', 'No hypothesis stated yet. The supporting citation hasn’t been opened, so the record leaves it empty and says so, rather than inventing one.'],
  povChain: ['The chain', 'From the account’s outcome back to the evidence behind it.'],
  povRuns: ['Locked runs', 'Each locked run, with its full record hash, so any figure can be traced and recomputed.'],
  finaleTitle: 'The outputs',
  finaleSub: 'What the CFO receives, each printed from a sealed run.',
  outroTitle: 'AI assists the evidence. It never manufactures the value.',
  outroSub: 'LVRF · lvrf-rule76.com',
};

// ── Finale: the S3 prints, page by page. y = where the detail sits on the page (0 top, 1 bottom); s = zoom. ──
const FINALE = [
  { img: 'default-1.png', k: 'Skillsoft value case · page 1', t: 'Printed from sealed run 3. The disclosure banners lead every page.', secs: 4.5 },
  { img: 'default-1.png', zoom: { y: 0.971, s: 2.1 }, k: 'The record line', t: 'Every page carries the run’s full record hash, so the printout can be checked against the sealed record.', secs: 5.5 },
  { img: 'default-2.png', zoom: { y: 0.34, s: 1.9 }, k: 'Nothing invented', t: 'The target isn’t committed and the actual isn’t measured, so the page says so. The money at stake isn’t stated, and the page says why.', secs: 7 },
  { img: 'default-3.png', zoom: { y: 0.27, s: 1.9 }, k: 'A hypothesis that can be shown wrong', t: 'A named measure, its published baseline, and the date by which it would be proven wrong.', secs: 6 },
  { img: 'cfo-2.png', zoom: { y: 0.39, s: 1.9 }, k: 'Same run · CFO lens', t: 'Refused, for two reasons, said plainly on the page.', secs: 5 },
  { img: 'cfo-3.png', k: 'Why the CFO lens refuses', t: 'The refusal prints in full, in its own ink box.', secs: 3.5 },
  { img: 'cfo-3.png', zoom: { y: 0.26, s: 1.6 }, k: 'Why the CFO lens refuses', t: 'Each reason comes with the ask that clears it. A claimed impact with no source behind it is not shown.', secs: 7 },
  { img: 'curia-1.png', zoom: { y: 0.59, s: 1.9 }, k: 'Curia · point of view', t: 'An outside-in test, with its published source cited in full on page 1.', secs: 6 },
  { img: 'curia-3.png', zoom: { y: 0.21, s: 1.9 }, k: 'Value hypothesis', t: 'Printed as it stands: none stated yet.', secs: 4.5 },
  { img: 'curia-4.png', zoom: { y: 0.18, s: 1.8 }, k: 'Locked runs', t: 'Every locked run with its full record hash, and its errata printed beside it, not hidden.', secs: 6.5 },
];
function finaleHtml(cssHrefs) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>LVRF · outputs</title>
${cssHrefs.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n')}
<style>html,body{margin:0;height:100%;overflow:hidden}
#pg{position:absolute;left:0;top:0;transform-origin:0 0;opacity:0;box-shadow:0 24px 70px rgba(0,0,0,.55);
transition:transform 1.4s cubic-bezier(.4,0,.2,1),opacity .45s ease}</style></head>
<body class="bg-ink font-body"><img id="pg" alt="">
<script>
const pg = document.getElementById('pg');
function apply(z) {
  const vw = innerWidth, vh = innerHeight, h0 = vh * 0.9, w0 = h0 * 8.5 / 11, s = z ? z.s : 1;
  const x = (vw - w0 * s) / 2, y = z ? vh * 0.40 - z.y * h0 * s : vh * 0.05;
  pg.style.width = w0 + 'px'; pg.style.height = h0 + 'px';
  pg.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
}
window.__zoom = apply;
window.__show = async (src) => {
  pg.style.opacity = '0'; await new Promise((r) => setTimeout(r, 450));
  const t = pg.style.transition; pg.style.transition = 'none'; apply(null);
  pg.src = src; await pg.decode().catch(() => {});
  void pg.offsetWidth; pg.style.transition = t; pg.style.opacity = '1';
};
apply(null);
</script></body></html>`;
}

function slidesHtml(cssHrefs) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>LVRF</title>
${cssHrefs.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n')}
<style>html,body{margin:0;height:100%;overflow:hidden}
#s{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .6s ease}</style></head>
<body class="bg-ink"><img id="s" alt="">
<script>
const s = document.getElementById('s');
window.__slide = async (src) => {
  s.style.opacity = '0'; await new Promise((r) => setTimeout(r, 600));
  s.src = src; await s.decode().catch(() => {}); s.style.opacity = '1';
};
</script></body></html>`;
}

// ── Terminal helpers ──
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}
async function basicAuth() {
  let username = process.env.LVRF_BASIC_USER, password = process.env.LVRF_BASIC_PASS;
  if (username === undefined) username = await ask('Site (basic auth) username, blank if none: ');
  if (!username) return undefined;
  if (password === undefined) password = await ask('Site (basic auth) password: ', { hidden: true });
  return { username, password };
}

// ── In-page overlay: caption bar, full-screen title card, click highlight ──
function installOverlay() {
  const goldOf = () => {
    const probe = document.createElement('span'); probe.className = 'text-gold'; document.body.appendChild(probe);
    const c = getComputedStyle(probe).color; probe.remove(); return c;
  };
  window.__lvrfCaption = (kicker, text) => {
    let el = document.getElementById('lvrf-demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lvrf-demo-caption';
      el.className = 'bg-ink text-offwhite font-body border-gold';
      Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '32px', transform: 'translateX(-50%)', zIndex: '2147483646',
        width: 'min(900px, calc(100% - 96px))', padding: '14px 22px', borderLeftWidth: '5px', borderLeftStyle: 'solid',
        boxShadow: '0 10px 30px rgba(0,0,0,.28)', opacity: '0', transition: 'opacity .35s ease', pointerEvents: 'none',
        fontSize: '19px', lineHeight: '1.4',
      });
      el.innerHTML = '<div data-k class="text-gold uppercase" style="font-size:12px;letter-spacing:.16em;font-weight:600;margin-bottom:4px"></div><div data-t></div>';
      document.body.appendChild(el);
    }
    if (!text) { el.style.opacity = '0'; return; }
    el.style.opacity = '0';
    setTimeout(() => {
      el.querySelector('[data-k]').textContent = kicker ?? '';
      el.querySelector('[data-t]').textContent = text;
      el.style.opacity = '1';
    }, 180);
  };
  window.__lvrfCard = (title, sub) => {
    let el = document.getElementById('lvrf-demo-card');
    if (!title) { if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); } return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'lvrf-demo-card';
      el.className = 'bg-ink text-offwhite font-body';
      Object.assign(el.style, {
        position: 'fixed', inset: '0', zIndex: '2147483647', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 10%',
        opacity: '0', transition: 'opacity .5s ease',
      });
      document.body.appendChild(el);
    }
    el.innerHTML = '<div class="font-display text-gold" style="font-size:72px;line-height:1.05;letter-spacing:.02em"></div>' +
      '<div class="border-gold" style="width:96px;border-top-width:2px;border-top-style:solid;margin:22px 0"></div>' +
      '<div style="font-size:20px;opacity:.9;max-width:900px"></div>';
    el.children[0].textContent = title; el.children[2].textContent = sub ?? '';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  };
  window.__lvrfHighlight = (el, on) => {
    if (!el) return;
    if (on) { el.dataset.lvrfOutline = el.style.outline; el.style.outline = `3px solid ${goldOf()}`; el.style.outlineOffset = '3px'; }
    else { el.style.outline = el.dataset.lvrfOutline ?? ''; }
  };
}

// ── Main ──
const browser = await chromium.launch({
  channel: 'chrome', headless: false,
  args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height + 140}`],
});
const httpCredentials = await basicAuth();

// 1. Sign in by hand, unrecorded.
const signCtx = await browser.newContext({ viewport: VIEWPORT, httpCredentials });
const signPage = await signCtx.newPage();
await signPage.goto(BASE);
console.log('\nSign in to LVRF in the Chrome window. Recording starts by itself once Accounts home appears.');
await signPage.getByTestId('accounts-home').waitFor({ timeout: 10 * 60_000 });
const statePath = path.join(os.tmpdir(), `lvrf-demo-${process.pid}.json`);
await signCtx.storageState({ path: statePath });
await signCtx.close();

// 2. The recorded, read-only session.
if (!REHEARSE) await mkdir(OUT_DIR, { recursive: true });
const ctx = await browser.newContext({
  viewport: VIEWPORT, httpCredentials, storageState: statePath,
  ...(REHEARSE ? {} : { recordVideo: { dir: OUT_DIR, size: VIEWPORT } }),
});
await rm(statePath, { force: true });
const blocked = [];
await ctx.route('**/*', (route) => {
  const req = route.request();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
    blocked.push(`${req.method()} ${req.url()}`);
    return route.abort('blockedbyclient');
  }
  return route.continue();
});
await ctx.route(`${FINALE_ORIGIN}/**`, async (route) => {
  const name = path.basename(new URL(route.request().url()).pathname);
  if (name === 'finale.html') return route.fulfill({ contentType: 'text/html', body: finaleHtml(finaleCss) });
  if (name === 'slides.html') return route.fulfill({ contentType: 'text/html', body: slidesHtml(finaleCss) });
  if (new URL(route.request().url()).pathname.startsWith('/cards/')) {
    try { return route.fulfill({ contentType: 'image/png', body: await readFile(path.join(CARDS_DIR, name)) }); }
    catch { return route.fulfill({ status: 404, body: 'missing' }); }
  }
  try { return route.fulfill({ contentType: 'image/png', body: await readFile(path.join(FINALE_DIR, name)) }); }
  catch { return route.fulfill({ status: 404, body: 'missing' }); }
});
let finaleCss = [];
await ctx.addInitScript(installOverlay);
const page = await ctx.newPage();

const hold = (s) => page.waitForTimeout(s * 1000 * PACE);
const caption = async ([k, t], secs = 0) => { await page.evaluate(([a, b]) => window.__lvrfCaption(a, b), [k, t]); if (secs) await hold(secs); };
const card = async (t, s, secs) => { await page.evaluate(([a, b]) => window.__lvrfCard(a, b), [t, s]); if (secs) await hold(secs); };
const uncard = async () => { await page.evaluate(() => window.__lvrfCard(null)); await hold(0.6); };
const warn = (m) => console.warn(`  ! ${m}`);
async function visible(locator, timeout = 8000) {
  try { await locator.first().waitFor({ state: 'visible', timeout }); return true; } catch { return false; }
}
async function scrollTo(locator, block = 'start', secs = 1.4) {
  if (!(await visible(locator, 4000))) return false;
  await locator.first().evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
  await hold(secs);
  return true;
}
async function glide(px, secs = 2) { // slow, even scroll
  const steps = Math.max(1, Math.round(secs * 20));
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await page.waitForTimeout(50 * PACE); }
  await hold(0.4);
}
async function clickShown(locator) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded();
  await el.evaluate((e) => window.__lvrfHighlight(e, true));
  await hold(0.9);
  await el.evaluate((e) => window.__lvrfHighlight(e, false));
  await el.click();
}
async function cssHrefs() { return page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href)); }
async function showCards(list) {
  const have = [];
  for (const [n, secs] of list) { try { await access(path.join(CARDS_DIR, `${n}.png`)); have.push([n, secs]); } catch { warn(`Card missing: ${n}.png in ${CARDS_DIR}`); } }
  if (!have.length) return false;
  if (!page.url().endsWith('/slides.html')) { finaleCss = await cssHrefs(); await page.goto(`${FINALE_ORIGIN}/slides.html`); }
  for (const [n, secs] of have) { await page.evaluate((src) => window.__slide(src), `cards/${n}.png`); await hold(secs); }
  return true;
}
async function settle() { await page.waitForLoadState('networkidle').catch(() => {}); await hold(0.6); }

try {
  // Intro
  await page.goto(BASE + '/'); await settle();
  await card(C.introTitle, C.introSub, 4.5);
  if (await showCards(OPENING_CARDS)) { await page.goto(BASE + '/'); await settle(); }
  else await uncard();
  await caption(C.home, 4.5);

  // ── The War Room (read-only; no money anywhere on it) ──
  const band = page.getByTestId('band-open');
  if (await visible(band, 4000)) await clickShown(band); else await page.goto(BASE + '/book');
  if (await visible(page.getByTestId('war-room'), 10000)) {
    await settle();
    await caption(C.warRoom, 5);
    if (await scrollTo(page.getByTestId('book-tiles'), 'start')) await hold(1);
    if (await scrollTo(page.getByTestId('book-row').first(), 'center')) await caption(C.warRoomMoney, 5.5);
  } else warn('No War Room page; skipped');

  // ── Skillsoft: run 3 ──
  if (process.env.LVRF_SKILLSOFT_RUN_ID) {
    await page.goto(`${BASE}/runs/${process.env.LVRF_SKILLSOFT_RUN_ID}`);
  } else {
    await page.goto(BASE + '/runs'); await settle();
    await caption(C.runs, 3.5);
    const row = page.locator('tbody tr').filter({ hasText: 'Skillsoft' })
      .filter({ has: page.locator('td.font-mono').filter({ hasText: /^\s*3(?!\d)/ }) });
    if (await visible(row)) await clickShown(row);
    else throw new Error('Skillsoft run 3 not found in Runs. Set LVRF_SKILLSOFT_RUN_ID and rerun.');
  }
  await settle();
  await caption(C.run, 3.5);

  const caseLink = page.getByRole('link', { name: 'The value case', exact: true });
  if (await visible(caseLink, 4000)) await clickShown(caseLink);
  else { warn('No "The value case" link; going to /case directly'); await page.goto(page.url().replace(/\/$/, '') + '/case'); }
  await page.getByTestId('value-case').waitFor({ timeout: 15000 }); await settle();
  await caption(C.caseGeneral, 5);
  await glide(500, 2.5); await caption(C.caseScroll, 5);
  await glide(700, 3); await hold(2);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })); await hold(1.5);
  await caption(C.caseHash, 4.5);

  // Same run, CFO lens (a URL parameter: client-side only, no write)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await hold(1.2);
  await caption(C.cfoSwitch, 3);
  const cfo = page.getByTestId('lens-cfo');
  if (await visible(cfo)) await clickShown(cfo); else { warn('No CFO lens button'); }
  await page.locator('[data-testid="value-case"][data-lens="cfo"]').waitFor({ timeout: 15000 }).catch(() => warn('CFO lens did not load'));
  await settle();
  if (await scrollTo(page.getByTestId('cfo-refusal'), 'start')) await caption(C.cfoRefused, 6);
  else { await glide(500, 2); await caption(C.cfoRefused, 5); }
  const asks = page.getByText('What we need from you', { exact: false });
  if (await scrollTo(asks, 'start')) await caption(C.cfoAsks, 5.5); else warn('No "What we need from you" section');

  // ── Curia ──
  await caption(['', ''], 0);
  await page.goto(BASE + '/'); await settle();
  const curia = page.getByTestId('account-row').filter({ hasText: 'Curia' });
  if (!(await visible(curia))) throw new Error('No Curia row on Accounts home.');
  await caption(C.curiaHome, 4.5);
  await clickShown(curia); await settle();
  if (await scrollTo(page.getByTestId('ws-marker-banner'), 'center', 1)) await caption(C.curiaMarker, 5);
  // Step 6 holds the POV link and starts collapsed unless it is the account's current step.
  // Its toggle is local UI state only (no request).
  const povStep = page.getByTestId('ws-step-6');
  if ((await povStep.count()) && (await povStep.getAttribute('data-open')) !== 'true') {
    const toggle = povStep.locator('[data-step-toggle]');
    if (await visible(toggle, 4000)) { await clickShown(toggle); await hold(0.8); }
  }
  const povLink = page.locator('a[href$="/pov"]').filter({ hasText: 'Open the point of view' });
  if (await visible(povLink, 4000)) await clickShown(povLink);
  else { warn('No "Open the point of view" link; going to /pov directly'); await page.goto(page.url().replace(/\/$/, '') + '/pov'); }
  await page.getByTestId('pov').waitFor({ timeout: 15000 }); await settle();
  await caption(C.povOpen, 4);
  if (await scrollTo(page.getByTestId('banners'), 'start')) await caption(C.povBanners, 5);
  if (await scrollTo(page.getByTestId('confidence'), 'center')) await caption(C.povConfidence, 5);
  // The empty hypothesis box is shown on purpose (L48: the hypothesis waits for its opened citation).
  if (await scrollTo(page.getByText('[No hypothesis stated yet.]', { exact: true }), 'center')) await caption(C.povNoHyp, 7);
  else warn('No empty hypothesis box on the POV (has a hypothesis been stated?); skipped that caption');
  if (await scrollTo(page.getByTestId('chain'), 'start')) { await caption(C.povChain, 4); await glide(500, 2.5); await hold(1.5); }
  if (await scrollTo(page.getByTestId('locked-runs'), 'center')) await caption(C.povRuns, 5.5);

  // ── Curia's Story of record: the draft (a read; Issue… is the steward's act and is never pressed) ──
  await caption(['', ''], 0);
  await page.goto(page.url().replace(/\/pov(\?.*)?$/, '/story'));
  if (await visible(page.getByTestId('story-body'), 10000)) {
    await settle();
    await caption(C.storyOpen, 5);
    if (await scrollTo(page.getByTestId('sealed-score'), 'center')) await caption(C.storyScore, 6.5);
    if (await scrollTo(page.getByTestId('stage-strip'), 'center')) await caption(C.storyStage, 6);
    if (await scrollTo(page.getByTestId('published'), 'start')) { await caption(C.storyPublished, 5); await glide(400, 2); await hold(1.5); }
  } else warn('No Story of record page (S7b not deployed yet?); skipped');

  // ── Finale: the outputs ──
  await caption(['', ''], 0);
  const missing = [];
  for (const f of new Set(FINALE.map((x) => x.img))) { try { await access(path.join(FINALE_DIR, f)); } catch { missing.push(f); } }
  if (missing.length) warn(`Finale skipped: missing ${missing.join(', ')} in ${FINALE_DIR}`);
  else {
    finaleCss = await cssHrefs();
    if (!(await showCards([['09-outputs', 11]]))) await card(C.finaleTitle, C.finaleSub, 3.5);
    await page.goto(`${FINALE_ORIGIN}/finale.html`);
    await hold(0.5);
    let current = null;
    for (const st of FINALE) {
      if (st.img !== current) {
        await caption(['', ''], 0);
        await page.evaluate((src) => window.__show(src), st.img);
        current = st.img; await hold(0.8);
      }
      await page.evaluate((z) => window.__zoom(z), st.zoom ?? null);
      await hold(st.zoom ? 1.6 : 0.6);
      await caption([st.k, st.t], st.secs);
    }
    await caption(['', ''], 0);
    await page.evaluate(() => window.__zoom(null)); await hold(1.6);
  }

  // Close: the Defensible card, then the principle.
  await caption(['', ''], 0);
  await showCards([['10-defensible', 10]]);
  await card(C.outroTitle, C.outroSub, 5);
} catch (err) {
  console.error(`\nStopped: ${err.message}`);
  process.exitCode = 1;
}

const video = page.video();
await ctx.close();
await browser.close();

if (blocked.length) {
  console.log(`\nRead-only guard blocked ${blocked.length} request(s) (nothing was written):`);
  for (const b of blocked) console.log(`  ${b}`);
}
if (video) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '');
  const webm = path.join(OUT_DIR, `LVRF demo ${stamp}.webm`);
  await rename(await video.path(), webm);
  const mp4 = webm.replace(/\.webm$/, '.mp4');
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  if (ff.status === 0) console.log(`\nVideo: ${mp4}`);
  else console.log(`\nVideo: ${webm}\n(ffmpeg not found, so no .mp4. QuickTime won't open .webm; Chrome will, or run: brew install ffmpeg, then rerun.)`);
} else {
  console.log('\nRehearsal done (nothing recorded).');
}
