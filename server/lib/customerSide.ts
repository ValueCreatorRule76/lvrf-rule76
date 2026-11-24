// §29 (Brad, 24 Nov 2026): only a customer-side person at the account commits to a target or verifies an actual.
// One rule, lvrf_customer_side_reason() (hardening, C3), the rule credit already reads, so a commitment and its credit
// never disagree. The database holds the same rule for every caller (lvrf_outcome_spine_guard).
import type { PoolClient } from 'pg';

export type SpineAct = 'commit' | 'verify';
const WHAT: Record<SpineAct, string> = { commit: 'commit to a target', verify: 'verify an actual' };

/** The refusal sentence, or null when the person is customer-side at the account. */
export async function customerSideRefusal(client: PoolClient, act: SpineAct, personId: string, institutionId: string): Promise<string | null> {
  const { rows: [r] } = await client.query<{ reason: string | null; full_name: string | null }>(
    `SELECT lvrf_customer_side_reason($1, $2) AS reason, (SELECT full_name FROM persons WHERE id = $1) AS full_name`,
    [personId, institutionId],
  );
  if (!r || r.reason === null) return null;
  return `Only a customer-side person at the account can ${WHAT[act]}. ${r.full_name ?? 'That person'} is not: ${r.reason}.`;
}
