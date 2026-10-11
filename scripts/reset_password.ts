/**
 * Reset a granted person's password to a new starting password — the
 * steward's act. Band A item 1.
 *
 *   npx tsx scripts/reset_password.ts <email>
 *
 * Run on the box from /srv/lvrf.
 *
 * - The actor is the tenant's steward, proven by their own password.
 * - The person must hold a CURRENT grant: a reset is not a way in.
 * - Not for the steward: they use the in-app change-password, or, if
 *   their password is lost, break-glass set_password.ts over SSH.
 * - In one transaction: the current credential is revoked, a new one is
 *   set with must_change = true (prompted twice from the steward, never
 *   printed), and every session of theirs ends.
 * - person_credentials is not audited (no hashes in audit_log, P1); the
 *   credential rows themselves — set_via 'reset', created, revoked — are
 *   the record.
 */
import '../server/env.js';
import { connect, findStaff, hashPassword, inTransaction, provePassword, readNewPassword, refuse, stewardOf } from './lib/cli.js';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  if (!email || process.argv.length > 3) {
    console.error('Usage: npx tsx scripts/reset_password.ts <email>');
    process.exit(2);
  }
  const client = await connect();
  await inTransaction(client, async () => {
    const person = await findStaff(client, email);
    const steward = await stewardOf(client, person.tenant_id);
    if (!steward) refuse('this tenant has no steward.');
    if (steward.id === person.id) {
      refuse('this is the steward. Use change-password in the app, or break-glass scripts/set_password.ts if the password is lost.');
    }
    const { rows: [grant] } = await client.query<{ id: string }>(
      'SELECT id FROM access_grants WHERE person_id = $1 AND revoked_at IS NULL',
      [person.id],
    );
    if (!grant) refuse(`${person.full_name} has no current grant; grant access first (scripts/grant_access.ts).`);

    console.log(`Resetting the password of ${person.full_name} <${person.email}>.`);
    await provePassword(client, steward, 'Steward password');
    const starting = await readNewPassword(`New starting password for ${person.full_name}`);

    await client.query('UPDATE person_credentials SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL', [person.id]);
    await client.query(
      `INSERT INTO person_credentials (person_id, password_hash, set_via, must_change) VALUES ($1, $2, 'reset', true)`,
      [person.id, await hashPassword(starting)],
    );
    const sess = await client.query('UPDATE sessions SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL', [person.id]);
    console.log(`Done. A starting password is set for ${person.full_name}; it must be changed at first sign-in. ${sess.rowCount ?? 0} session(s) ended.`);
  });
}

void main();
