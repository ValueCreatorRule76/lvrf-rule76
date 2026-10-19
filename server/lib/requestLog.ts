import type { Express, NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE } from './session.js';

/**
 * L31 (19 Oct 2026) — one line per /api request, to stdout (the journal on
 * the box), so a silent outcome can be traced from the box:
 *
 *   LVRF req POST /api/institutions/:institutionId/hypotheses 201 14ms session=y
 *
 * method · route PATTERN · status · duration · whether a session cookie was
 * presented (y/n). A request the client abandons before the response is
 * finished logs "aborted" in place of the status.
 *
 * NEVER LOGGED: the concrete path (ids), the query string, the body, any
 * cookie or header value, the IP address. The pattern comes from the app's
 * own routes, so a value in the path cannot reach the log; a path that
 * matches no route logs "(no route)", never itself. scripts/verify_request_log.sh
 * sends markers in each of those places and proves none appears.
 *
 * THE PATTERN FOR A REQUEST REFUSED BEFORE ROUTING. A 401 from requireActor
 * (or a 403/415 from the origin guard) never reaches a route, so req.route is
 * unset — today's blind spot (19 Oct 2026: a save that never arrived could
 * not be told from a 401). The pattern is resolved here by matching the path
 * against the app's mounted routers, in mount order, as Express would, with
 * each layer's compiled path matcher: a pure function that reads nothing and
 * mutates nothing (unlike Layer#match, which writes the layer's params).
 * Mounts are static strings; a mount with a parameter is refused as
 * "(param mount)" so a concrete value could never be logged from one.
 * The verify script checks every route list_api_routes.mjs reports resolves
 * to itself, so a change in Express's internals fails Gate A, not the log.
 */

type Matcher = (path: string) => false | { path: string; params: Record<string, unknown> };
interface RouteLayer { route?: { path: string; methods: Record<string, boolean> }; matchers?: Matcher[] }
interface MountLayer { handle?: { stack?: RouteLayer[] }; matchers?: Matcher[] }

export function routePattern(app: Express, method: string, path: string): string {
  const stack = ((app as unknown as { router?: { stack?: MountLayer[] } }).router?.stack) ?? [];
  const m = method.toLowerCase();
  for (const layer of stack) {
    const routes = layer.handle?.stack;
    if (!routes || !layer.matchers) continue;
    const mount = layer.matchers.map((f) => f(path)).find((r) => r !== false);
    if (!mount) continue;
    if (Object.keys(mount.params).length > 0) return '(param mount)';
    const rest = path.slice(mount.path.length) || '/';
    for (const rl of routes) {
      if (!rl.route || !rl.matchers) continue;
      const methods = rl.route.methods;
      if (!(methods[m] || methods._all || (m === 'head' && methods.get))) continue;
      if (rl.matchers.some((f) => f(rest) !== false)) {
        return mount.path + (rl.route.path === '/' ? '' : rl.route.path);
      }
    }
  }
  return '(no route)';
}

function hasSessionCookie(req: Request): boolean {
  const header = req.get('cookie');
  if (!header) return false;
  return header.split(';').some((part) => {
    const eq = part.indexOf('=');
    return eq > 0 && part.slice(0, eq).trim() === SESSION_COOKIE;
  });
}

export function requestLog(app: Express) {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split('?')[0];
    if (!path.startsWith('/api')) { next(); return; }
    const started = process.hrtime.bigint();
    const session = hasSessionCookie(req) ? 'y' : 'n';
    let logged = false;
    const log = (status: string) => {
      if (logged) return;
      logged = true;
      const ms = Number((process.hrtime.bigint() - started) / 1_000_000n);
      console.log(`LVRF req ${req.method} ${routePattern(app, req.method, path)} ${status} ${ms}ms session=${session}`);
    };
    res.on('finish', () => log(String(res.statusCode)));
    res.on('close', () => { if (!res.writableFinished) log('aborted'); });
    next();
  };
}
