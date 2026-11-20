/**
 * S5 (Brad, 19 Nov 2026): ONE read of an account's walk, GET /api/institutions/:id/walk, shared by every reader on the
 * page: the workspace's walk (OutsideInWalk), the tenant's chain (TenantChain), the Accounts home's rows and the
 * account frame. A reader that asks while a read is in flight, or within SHARE_MS of its answer, gets that same answer;
 * the frame never makes a second request for what the page has just read.
 *
 * Any write the API accepts (WROTE_EVENT) forgets every shared answer, so a read after a write is always fresh.
 * A network failure is shared as a rejection; an HTTP error is shared as its status and body.
 */
import { apiFetch, WROTE_EVENT } from '../api/http';

export interface WalkResponse { ok: boolean; status: number; body: unknown }

const SHARE_MS = 3000;
const shared = new Map<string, { p: Promise<WalkResponse>; done: number | null }>();

if (typeof window !== 'undefined') window.addEventListener(WROTE_EVENT, () => shared.clear());

export function readWalk(institutionId: string): Promise<WalkResponse> {
  const now = Date.now();
  const hit = shared.get(institutionId);
  if (hit && (hit.done === null || now - hit.done < SHARE_MS)) return hit.p;
  const entry: { p: Promise<WalkResponse>; done: number | null } = { p: Promise.resolve({ ok: false, status: 0, body: null }), done: null };
  entry.p = apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/walk`)
    .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }))
    .then((v) => { entry.done = Date.now(); return v; },
      (e) => { shared.delete(institutionId); throw e; });
  shared.set(institutionId, entry);
  return entry.p;
}
