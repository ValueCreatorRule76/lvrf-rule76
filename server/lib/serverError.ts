import type { Response } from 'express';

/**
 * Q4k (L29, 12 Oct 2026) — the one answer for an error a route did not
 * expect. Postgres's own text (a foreign-key, not-null or type error) names
 * relations and constraints; the person gets a plain sentence, and the raw
 * error goes to the server log only. A data error from the request is a 422;
 * anything else is a 500. Check and unique violations never reach here:
 * handleGovernanceError (refusal.ts) answers them first, in their own words.
 */
const PLAIN_DATA_ERROR: Record<string, string> = {
  '23503': "That refers to something that doesn't exist here; nothing was written.",
  '23502': 'A required value is missing; nothing was written.',
  '22P02': "A value isn't in the expected form; nothing was written.",
  '22007': "A date or time isn't in the expected form; nothing was written.",
  '22008': 'A date or time is out of range; nothing was written.',
  '22003': 'A number is out of range; nothing was written.',
  '22001': 'A value is longer than allowed; nothing was written.',
};

export function respondServerError(res: Response, err: unknown): void {
  console.error('LVRF: unexpected error (answered plainly; raw text logged here only):', err);
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  const plain = PLAIN_DATA_ERROR[code];
  if (plain) {
    res.status(422).json({ message: plain });
    return;
  }
  res.status(500).json({ message: 'Something went wrong on the server; nothing was saved.' });
}
