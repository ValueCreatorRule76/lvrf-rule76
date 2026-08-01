import { createHash } from 'node:crypto';

/**
 * Recursively sorts object keys so the same logical value always stringifies
 * identically, and converts every number to a string first.
 *
 * db/CONFIDENCE_MODEL.md's canonicalisation rule: a whole-number float and an
 * integer are the same JSON number, but JSON.stringify(30) and a Python
 * json.dumps(30.0) — the same source value read back through two languages —
 * produce "30" and "30.0". Reconciling that formatting difference is a fix
 * you would have to keep maintaining and can barely test. Numbers-as-strings
 * removes the disagreement instead of chasing it: "30.0" is "30.0" everywhere.
 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  if (typeof value === 'number') return String(value);
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** §12 of HEARTBEAT-REGISTER: cryptographically hashed, tamper-evident. */
export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
