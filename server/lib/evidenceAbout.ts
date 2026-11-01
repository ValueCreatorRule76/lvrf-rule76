import type { PoolClient } from 'pg';
import { EvidenceFormError } from './evidenceFormBody.js';

/**
 * L41 (LVRF_PLAN §13; L41-D1) — what evidence is about, read the same way by every route that takes it:
 *   about: "account"                     this account;
 *   about: { institution_id: "<uuid>" }  another account of this tenant;
 *   about: { other_party: "<name>" }     a company that is not an account.
 * Required: a body that does not say is refused in one plain sentence, which the caller records. The database
 * holds the same shape (evidence_about_stated), so this is the first of two guards, never the only one.
 */
export interface EvidenceAbout { aboutInstitutionId: string | null; aboutOtherParty: string | null }

const SAY = 'Say what this evidence is about: this account, another account, or another company, named.';
const MIN_PARTY = 3;

export async function parseAbout(client: PoolClient, about: unknown, ownInstitutionId: string, tenantId: string): Promise<EvidenceAbout> {
  if (about === 'account') return { aboutInstitutionId: ownInstitutionId, aboutOtherParty: null };
  if (typeof about !== 'object' || about === null || Array.isArray(about)) throw new EvidenceFormError(SAY);
  const a = about as Record<string, unknown>;
  const hasInstitution = a.institution_id !== undefined && a.institution_id !== null;
  const hasParty = a.other_party !== undefined && a.other_party !== null;
  if (hasInstitution === hasParty) throw new EvidenceFormError(SAY);
  if (hasParty) {
    const name = typeof a.other_party === 'string' ? a.other_party.trim() : '';
    if (name.length < MIN_PARTY) throw new EvidenceFormError(`Name the company this evidence is about, in at least ${MIN_PARTY} characters.`);
    return { aboutInstitutionId: null, aboutOtherParty: name };
  }
  const { rows: [found] } = await client.query<{ id: string }>(
    `SELECT id FROM institutions WHERE id::text = $1 AND tenant_id = $2 AND deleted_at IS NULL`, [String(a.institution_id), tenantId]);
  if (!found) throw new EvidenceFormError('The account named as what this evidence is about is not an account of this tenant.');
  return { aboutInstitutionId: found.id, aboutOtherParty: null };
}
