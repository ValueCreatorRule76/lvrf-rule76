import { createHash } from 'node:crypto';

/**
 * P2 (LVRF_PLAN §10; P2-D5 with Brad's condition, 25 Oct 2026) — the pasted
 * research response arrives as TEXT ({ raw_text }) and is parsed here, on the
 * server, so the import stored is exactly the text that was parsed. This
 * module only reads: it writes nothing. research_imports is written by
 * industryResearch.ts and accountResearch.ts alone (CLAUDE.md, the research
 * boundary, P2-D8).
 *
 * A paste the parser refuses is recorded in refusals (source 'parser') by its
 * SHA-256 and byte length, never its text: `parserPayload` is what goes into
 * attempted_payload.
 */

export const MAX_IMPORT_BYTES = 524_288;

export interface ImportText {
  text: string;
  sha256: string;
  bytes: number;
  /** The parsed envelope, read by the route's existing validation unchanged. */
  body: Record<string, unknown>;
}

export class ImportTextError extends Error {
  constructor(public readonly issues: string[], public readonly parserPayload: Record<string, unknown>) {
    super(issues.join(' | '));
  }
}

const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** The body must be exactly { raw_text: "<the whole response, as pasted>" }. Throws ImportTextError. */
export function readImportText(reqBody: unknown): ImportText {
  if (typeof reqBody !== 'object' || reqBody === null || Array.isArray(reqBody)) {
    throw new ImportTextError(['body.raw_text is required: the whole response, pasted as it came'], {});
  }
  const b = reqBody as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => k !== 'raw_text');
  const text = b.raw_text;
  if (typeof text !== 'string' || text.trim() === '') {
    throw new ImportTextError([
      'body.raw_text is required: the whole response, pasted as it came. The server parses it, so the text stored is the text parsed.',
      ...extra.map((k) => `body.${k} is not taken: send the pasted text as raw_text, nothing else`),
    ], { fields: Object.keys(b) });
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  const sha256 = sha256Hex(text);
  const parserPayload = { raw_sha256: sha256, byte_length: bytes };
  const issues = extra.map((k) => `body.${k} is not taken: send the pasted text as raw_text, nothing else`);
  if (bytes > MAX_IMPORT_BYTES) {
    issues.push(`The pasted response is ${bytes.toLocaleString('en-GB')} bytes; at most ${MAX_IMPORT_BYTES.toLocaleString('en-GB')} are taken. Nothing was written.`);
  }
  if (issues.length > 0) throw new ImportTextError(issues, parserPayload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ImportTextError([`The pasted response is not JSON (${err instanceof Error ? err.message : 'unreadable'}). Paste the whole response, as it came.`], parserPayload);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ImportTextError(['The pasted response is JSON but not an object: paste the whole response, as it came.'], parserPayload);
  }
  return { text, sha256, bytes, body: parsed as Record<string, unknown> };
}
