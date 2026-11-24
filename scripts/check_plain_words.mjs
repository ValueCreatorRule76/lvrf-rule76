#!/usr/bin/env node
// §28 D1 (Brad, 24 Nov 2026): no plan code on screen. Reads every string a page can show and refuses any "§", plan
// document name or slice/decision code. Read-only; prints one line per hit and a summary; exits 1 on any hit.
//
//   node scripts/check_plain_words.mjs [--root DIR]
//
// What it reads:
//   client/src/**/*.ts(x)  every string literal and every JSX text run, comments stripped (data-testid and className
//                          values, imports and identifiers never print, so they are not read);
//   server/**/*.ts         every string literal outside comments (messages, refusals, asks, credit lines, findings),
//                          apart from SQL comment lines inside a query;
//   db/hardening.sql       every RAISE EXCEPTION message, and every other quoted literal outside comments (the
//                          computed lines a page prints: errata, banners, refusal reasons).
// The record itself (people's words, sealed text) is never read here: the rendered sweep lists those, and never fails
// on them (§28 D1).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : process.cwd();
export const PLAN_CODE = /§|LVRF_PLAN|AMENDMENT-\d|HEARTBEAT-REGISTER|\b(?:SS?[1-9]|B[1-9]|L\d{1,3}|C[1-9]b?|O-D\d+|O\d-D\d+|D\d{1,2}|P\d{1,2})\b/;

const walk = (dir, ext) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (n === 'node_modules' || n === 'dist') return [];
  return statSync(p).isDirectory() ? walk(p, ext) : ext.some((e) => p.endsWith(e)) ? [p] : [];
});
const lineOf = (src, i) => src.slice(0, i).split('\n').length;
// Blank out comments, keeping offsets (so line numbers stay true) and leaving strings alone.
function stripJsComments(src) {
  let out = ''; let i = 0; let q = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += d ?? ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const end = j < 0 ? src.length : j + 2; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (c === '/' && d === '/' && src[i - 1] !== ':') { const j = src.indexOf('\n', i); const end = j < 0 ? src.length : j; out += ' '.repeat(end - i); i = end; continue; }
    out += c; i++;
  }
  return out;
}
const hits = [];
const hit = (file, src, idx, text, where) => {
  const m = text.match(PLAN_CODE);
  if (m) hits.push(`${relative(ROOT, file)}:${lineOf(src, idx)}  [${m[0]}]  (${where})  ${text.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
};

// Client and server: string literals; client also JSX text.
for (const [dir, jsx] of [['client/src', true], ['server', false]]) {
  for (const f of walk(join(ROOT, dir), ['.ts', '.tsx'])) {
    const raw = readFileSync(f, 'utf8');
    let src = stripJsComments(raw);
    src = src.replace(/^\s*import\s.*$/gm, (s) => ' '.repeat(s.length));
    src = src.replace(/\b(data-testid|className|key|testid)=(["'])[^"']*\2/g, (s) => ' '.repeat(s.length));
    for (const m of src.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
      let t = m[0].slice(1, -1);
      if (/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(t)) continue;  // a query's text never prints
      if (/console\.(error|warn|log|info)\(\s*$/.test(src.slice(Math.max(0, m.index - 40), m.index))) continue;  // the server's own log
      if (/\bcode:\s*$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;  // a finding's id (D0-D4, F1-F4): sealed, printed as an id
      if (!jsx) t = t.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');  // SQL comment lines in a query
      hit(f, src, m.index, t, 'string');
    }
    // JSX text: a run between tags with no code in it (no ";", "=", "//" or a call).
    if (jsx) for (const m of src.matchAll(/>([^<>{}]*[A-Za-z§][^<>{}]*)</g)) if (!/[;=]|\/\/|\w\(/.test(m[1])) hit(f, src, m.index, m[1], 'JSX text');
  }
}
// hardening.sql: quoted literals outside "--" comments (RAISE messages included).
{
  const f = join(ROOT, 'db/hardening.sql');
  const raw = readFileSync(f, 'utf8');
  const src = raw.split('\n').map((l) => { const i = l.indexOf('--'); return i >= 0 && (l.slice(0, i).match(/'/g) ?? []).length % 2 === 0 ? l.slice(0, i) + ' '.repeat(l.length - i) : l; }).join('\n');
  for (const m of src.matchAll(/'(?:[^']|'')*'/g)) hit(f, src, m.index, m[0].slice(1, -1), 'database');
}

for (const h of hits) console.log(`HIT  ${h}`);
console.log(`plain words: ${hits.length === 0 ? 'no plan code in any string a page can show' : `${hits.length} plan code(s) in strings a page can show`}`);
process.exit(hits.length === 0 ? 0 : 1);
