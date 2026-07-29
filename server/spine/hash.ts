import { createHash } from 'node:crypto';

/** Recursively sorts object keys so the same logical value always stringifies identically. */
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
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** §12 of HEARTBEAT-REGISTER: cryptographically hashed, tamper-evident. */
export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
