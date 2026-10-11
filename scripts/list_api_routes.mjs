#!/usr/bin/env node
//
// Every /api route the server mounts, one "METHOD /api/path" per line,
// sorted. Read from the source, statically: server/index.ts's
// app.use('/api/…', factory(pool)) mounts, and each factory's
// router.<method>('<path>') calls in server/routes/. Express 5 keeps a
// mount path inside a closure, so the running app cannot be asked.
//
// Used by verify_tenant_scope.sh's coverage guard (sign-in P3): every
// route listed here must have a tenant case there. It REFUSES — exit 1 —
// on anything it cannot read for certain (a mount it does not recognise,
// a factory it cannot find, a route path that is not a string literal,
// router.use / router.all / router.route), so a new route cannot slip past
// the guard by being written in a shape this parser skips.
//
//   node scripts/list_api_routes.mjs [--all] [--classify]
//
// Without --all, /api/health and /api/auth/* are left out: they run before
// requireActor and have no tenant.
//
// --classify (3.0 Band A item 2): each line gains " steward" when the
// route's router call passes requireSteward(pool) right after its path,
// else " -". verify_steward_acts.sh compares that with
// server/lib/stewardActs.ts's table.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');
const classify = process.argv.includes('--classify');
const fail = (msg) => { console.error(`list_api_routes: REFUSING: ${msg}`); process.exit(1); };

const index = readFileSync(join(root, 'server/index.ts'), 'utf8');

// factory name -> route file, from the imports
const fileOf = new Map();
for (const m of index.matchAll(/^import \{([^}]+)\} from '\.\/routes\/([A-Za-z]+)\.js';$/gm)) {
  for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) fileOf.set(name, m[2]);
}

// The middleware mounts on /api that are not routers. Anything else on
// /api must be a recognised factory mount.
const MIDDLEWARE = [/^app\.use\('\/api', originGuard\(origins\)\);$/, /^app\.use\('\/api', requireActor\(pool, actorHeader\)\);$/];
const EXEMPT = new Set(['/api/health', '/api/auth']);

const routes = [];
const factoriesSeen = new Set();
for (const line of index.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('app.use('))) {
  if (!line.startsWith("app.use('/api")) {
    if (/^app\.use\((express\.json\(\)|actorContext\(pool\))\);$/.test(line)) continue;
    fail(`unrecognised mount: ${line}`);
  }
  if (MIDDLEWARE.some((re) => re.test(line))) continue;
  const m = line.match(/^app\.use\('(\/api\/[a-z-]+)', (\w+)\(pool(?:, [\w.]+)*\)\);$/);
  if (!m) fail(`unrecognised /api mount: ${line}`);
  const [, mount, factory] = m;
  const file = fileOf.get(factory);
  if (!file) fail(`no import found for ${factory}`);
  factoriesSeen.add(factory);
  const src = readFileSync(join(root, 'server/routes', `${file}.ts`), 'utf8');
  const start = src.indexOf(`export function ${factory}(`);
  if (start === -1) fail(`export function ${factory} not found in server/routes/${file}.ts`);
  const next = src.indexOf('\nexport function ', start + 1);
  const body = src.slice(start, next === -1 ? undefined : next);
  for (const bad of body.matchAll(/router\.(use|all|route)\(/g)) fail(`router.${bad[1]}() in ${factory}: not readable by this guard`);
  const calls = [...body.matchAll(/router\.(get|post|put|patch|delete)\(/g)];
  const literal = [...body.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'\s*,\s*(requireSteward\(pool\)\s*,)?/g)];
  if (calls.length !== literal.length) fail(`${factory}: a route path that is not a string literal`);
  for (const [, method, path, steward] of literal) {
    const full = mount + (path === '/' ? '' : path);
    if (!all && EXEMPT.has(mount)) continue;
    routes.push(`${method.toUpperCase()} ${full}` + (classify ? (steward ? ' steward' : ' -') : ''));
  }
}
if (routes.length === 0) fail('no routes found');
console.log([...new Set(routes)].sort().join('\n'));
