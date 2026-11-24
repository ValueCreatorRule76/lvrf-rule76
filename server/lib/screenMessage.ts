// §30 D4 (Brad, 24 Nov 2026): a hardening message's "LVRF: <table>:" prefix leaves the screen, not the record. The
// prefix tells an operator in psql which table refused; the person reads the sentence. `refusals.message` keeps the
// raw text (handleGovernanceError records it before answering), so earlier refusals are never rewritten.
import type { NextFunction, Request, Response } from 'express';

// "LVRF: <table>: " (with the row's id where the message names one), or a bare "LVRF: " (lvrf_block_ai_actual's).
const PREFIX = /^LVRF: (?:[a-z_]+(?: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?: )?/;

/** The sentence a person reads: the prefix dropped and its first letter capitalized; anything else unchanged. */
export function screenMessage(text: string): string {
  if (!PREFIX.test(text)) return text;
  const t = text.replace(PREFIX, '');
  // A sentence's first word is capitalized; a message that begins with an id or a name is left as it is.
  return /^[a-z]+\b/.test(t) && !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

const onScreen = (v: unknown): unknown => (typeof v === 'string' ? screenMessage(v) : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? screenMessage(x) : x)) : v);

/** Every JSON response: its top-level `message`, and each line of `blockers` and `issues`, as the person reads them. */
export function screenMessages() {
  return (_req: Request, res: Response, next: NextFunction) => {
    const json = res.json.bind(res);
    res.json = (body?: unknown) => {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const b = body as Record<string, unknown>;
        if ('message' in b || 'blockers' in b || 'issues' in b) {
          const out = { ...b };
          for (const k of ['message', 'blockers', 'issues']) if (k in out) out[k] = onScreen(out[k]);
          return json(out);
        }
      }
      return json(body);
    };
    next();
  };
}
