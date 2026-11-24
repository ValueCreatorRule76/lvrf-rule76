// §32 (Brad's rulings, 24 Nov 2026): a person's email is optional, and stored as its own trimmed lower case (0053's
// persons_email_normalized; unique ignoring case). The same name on the same account is warned, not refused: the
// person is added only when the request names each same-name person as different (different_from), and that is
// recorded on the new row (confirmed_distinct_from; lvrf_person_email_rules holds it in the database).
import type { PoolClient } from 'pg';

/** An email as stored: trimmed and lower-cased; none when absent or empty. */
export function normalEmail(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim().toLowerCase();
  return t === '' ? null : t;
}

/** The same name, as people compare names: trimmed, inner spaces single, case-folded (the database's own rule). */
export const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export interface SameName { id: string; full_name: string; title: string | null }

/** Current persons of the account with the same name. */
export async function sameNamePersons(client: PoolClient, institutionId: string, fullName: string): Promise<SameName[]> {
  const { rows } = await client.query<SameName>(
    `SELECT id, full_name, title FROM persons
      WHERE institution_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
        AND lower(regexp_replace(btrim(full_name), '\\s+', ' ', 'g')) = $2
      ORDER BY created_at`,
    [institutionId, nameKey(fullName)],
  );
  return rows;
}

/** The warning when a same-name person is not named as different: who is already there. */
export function sameNameMessage(existing: SameName[]): string {
  const who = existing.map((p) => `${p.full_name}${p.title ? `, ${p.title}` : ''}`).join('; ');
  return `${who} ${existing.length === 1 ? 'is' : 'are'} already recorded at this account. Choose them, or confirm this is a different person.`;
}
