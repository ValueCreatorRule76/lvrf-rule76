/**
 * Revoke a person's access to LVRF — the steward's act (3.0 draft Q2/Q3,
 * D5). Band A item 1.
 *
 *   npx tsx scripts/revoke_access.ts <email> --reason "<why>"
 *
 * Run on the box from /srv/lvrf.
 *
 * - The actor is the tenant's steward, proven by their own password
 *   (argon2, current credential), before anything is written.
 * - Refuses to revoke the steward's own grant: that would lock the tenant
 *   out of every Brad-only act. (Break-glass is SSH, as stated in
 *   BUILD_STATUS.)
 * - In ONE transaction: the grant is revoked (who, when, why —
 *   access_grants_steward_only refuses any revoker but the steward), the
 *   person's current credential is revoked, and every session of theirs
 *   ends. A later grant sets a new starting password.
 * - The grant's audit row is read back and checked, or nothing is changed.
 */
import '../server/env.js';
import { connect, findStaff, inTransaction, lastAudit, MIN_REASON_LENGTH, provePassword, refuse, stewardOf } from './lib/cli.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  const reason = arg('--reason');
  if (!email || email.startsWith('--') || reason === undefined) {
    console.error('Usage: npx tsx scripts/revoke_access.ts <email> --reason "<why>"');
    process.exit(2);
  }
  if (reason.trim().length < MIN_REASON_LENGTH) {
    console.error(`Refused: --reason must say why access is revoked, in at least ${MIN_REASON_LENGTH} characters.`);
    process.exit(1);
  }
  const client = await connect();
  await inTransaction(client, async () => {
    const person = await findStaff(client, email);
    const steward = await stewardOf(client, person.tenant_id);
    if (!steward) refuse('this tenant has no steward.');
    if (steward.id === person.id) refuse(`${person.full_name} is the steward; the steward's own grant is not revoked here.`);
    const { rows: [grant] } = await client.query<{ id: string }>(
      'SELECT id FROM access_grants WHERE person_id = $1 AND revoked_at IS NULL FOR UPDATE',
      [person.id],
    );
    if (!grant) refuse(`${person.full_name} has no current grant.`);

    console.log(`Revoking access for ${person.full_name} <${person.email}>.`);
    await provePassword(client, steward, 'Steward password');

    await client.query('SELECT set_config($1, $2, true)', ['lvrf.actor_person_id', steward.id]);
    await client.query(
      `UPDATE access_grants SET revoked_at = now(), revoked_by_person_id = $1, revocation_reason = $2
        WHERE id = $3 AND revoked_at IS NULL`,
      [steward.id, reason.trim(), grant.id],
    );
    const creds = await client.query('UPDATE person_credentials SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL', [person.id]);
    const sess = await client.query('UPDATE sessions SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL', [person.id]);

    const audit = await lastAudit(client, 'access_grants', grant.id);
    if (!audit || audit.operation !== 'update' || audit.actor !== steward.id || audit.new_row?.revoked_by_person_id !== steward.id) {
      throw new Error('access_grants_audit did not record the revocation as expected; nothing was changed');
    }
    console.log(`Done. ${person.full_name}'s access is revoked by ${steward.full_name}.`);
    console.log(`grant id:     ${grant.id}`);
    console.log(`audit row id: ${audit.id} (access_grants, update, actor = the steward)`);
    console.log(`${creds.rowCount ?? 0} credential(s) and ${sess.rowCount ?? 0} session(s) revoked.`);
  });
}

void main();
