#!/usr/bin/env node
// UX-1 — design/mockups/tokens.css is the mock-ups' one copy of the Rule76
// tokens; CLAUDE.md is the authority. Exits 1 if any CLAUDE.md token is
// missing from tokens.css or differs from it, or if any other mock-up file
// (HTML or CSS) contains a hex colour instead of citing a token.
//
//   node scripts/check_design_tokens.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'design/mockups');
const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const canon = [...claude.matchAll(/^\| `(--[a-z0-9-]+)` \| `(#[0-9A-Fa-f]{6})` \|/gm)].map(([, k, v]) => [k, v.toUpperCase()]);
const css = readFileSync(join(dir, 'tokens.css'), 'utf8');
let bad = 0;
if (canon.length < 11) { console.log(`only ${canon.length} tokens read from CLAUDE.md's table`); bad++; }
for (const [k, v] of canon) {
  const m = css.match(new RegExp(`${k}:\\s*(#[0-9A-Fa-f]{6});`));
  if (!m) { console.log(`MISSING ${k} (CLAUDE.md ${v})`); bad++; }
  else if (m[1].toUpperCase() !== v) { console.log(`DIFFERS ${k}: tokens.css ${m[1]}, CLAUDE.md ${v}`); bad++; }
}
for (const f of readdirSync(dir).filter((f) => /\.(html|css)$/.test(f) && f !== 'tokens.css')) {
  const hits = readFileSync(join(dir, f), 'utf8').match(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![0-9A-Za-z-])/g);
  if (hits) { console.log(`HEX in ${f}: ${[...new Set(hits)].join(', ')} (cite a token)`); bad++; }
}
console.log(bad === 0 ? `design tokens: ${canon.length} CLAUDE.md tokens match tokens.css; no hex elsewhere in design/mockups` : `design tokens: ${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);
