// The equivalence comparison (Gate A): each path GET against A (the deployed code on its own clone) and B (the branch on
// its clone), compared byte for byte; any key B adds is named.   node scripts/lib/equivalence_compare.mjs BASE_A BASE_B ACTOR PATHS_FILE OUT_DIR
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [A, B, actor, pathsFile, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const paths = readFileSync(pathsFile, 'utf8').split('\n').filter(Boolean);
const keys = (v, p = '$', acc = new Set()) => { if (v && typeof v === 'object') { for (const k of Object.keys(v)) { const q = Array.isArray(v) ? `${p}[]` : `${p}.${k}`; acc.add(q); keys(v[k], q, acc); } } return acc; };
const get = async (base, path) => { const r = await fetch(base + path, { headers: { 'X-Actor-Person-Id': actor, Accept: 'application/json' } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j, text: t }; };
let same = 0, diff = 0, added = 0, non200 = 0; const lines = [];
for (const p of paths) {
  const [a, b] = [await get(A, p), await get(B, p)];
  if (a.status !== 200 || b.status !== 200) non200++;
  const ident = a.status === b.status && a.text === b.text;
  const ka = keys(a.body), kb = keys(b.body); const plus = [...kb].filter((k) => !ka.has(k)); const minus = [...ka].filter((k) => !kb.has(k));
  if (plus.length) added++;
  if (ident) same++; else { diff++; const f = out + '/' + p.replace(/[^a-z0-9]+/gi, '_'); writeFileSync(f + '.A.json', a.text); writeFileSync(f + '.B.json', b.text); }
  lines.push(`${ident ? 'SAME' : 'DIFF'} ${a.status}/${b.status} ${p}${plus.length ? ' +' + plus.join(',') : ''}${minus.length ? ' -' + minus.join(',') : ''}`);
}
writeFileSync(out + '/report.txt', lines.join('\n') + '\n');
console.log(lines.filter((l) => !l.startsWith('SAME 200/200')).join('\n'));
console.log(`GETs ${paths.length}: identical ${same}, differing ${diff}, with added keys ${added}, non-200 on either side ${non200}`);
