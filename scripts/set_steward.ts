/**
 * Name a tenant's steward — the person whose acts are Brad's alone (3.0
 * draft Q2/Q3, D4: tenants.steward_person_id).
 *
 *   npx tsx scripts/set_steward.ts <email>
 *
 * Run on the box from /srv/lvrf, once per tenant. BACK UP FIRST.
 *
 * - Refuses unless exactly one current, non-simulated vendor-staff person
 *   has that email (case-insensitive).
 * - Refuses if the tenant already has a steward. Changing the steward is a
 *   later, separate act; this script only names the first.
 * - THE NAMED PERSON'S PROOF: prompts for that person's own password and
 *   verifies it with argon2 against their current credential, before
 *   anything is written. Naming a steward needs the steward, not just SSH.
 * - One transaction, SELF-ATTESTED as set_email.ts is: lvrf.actor_person_id
 *   is the person named, so tenants_audit records them. The audit row is
 *   read back and checked (an update, the new steward, the actor); if it is
 *   missing or wrong, nothing is changed.
 */
import '../server/env.js';
import { connect, findStaff, inTransaction, lastAudit, provePassword, refuse } from './lib/cli.js';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || process.argv.length > 3) {
    console.error('Usage: npx tsx scripts/set_steward.ts <email>');
    process.exit(2);
  }
  const client = await connect();
  await inTransaction(client, async () => {
    const person = await findStaff(client, email.trim());
    const { rows: [tenant] } = await client.query<{ id: string; name: string; steward_person_id: string | null }>(
      'SELECT id, name, steward_person_id FROM tenants WHERE id = $1 FOR UPDATE',
      [person.tenant_id],
    );
    if (tenant.steward_person_id !== null) {
      refuse(`${tenant.name} already has a steward (${tenant.steward_person_id}). This script names the first steward only.`);
    }

    console.log(`Naming ${person.full_name} <${person.email}> steward of ${tenant.name}.`);
    await provePassword(client, person, 'Password of the person being named steward');

    await client.query('SELECT set_config($1, $2, true)', ['lvrf.actor_person_id', person.id]);
    const { rowCount } = await client.query(
      'UPDATE tenants SET steward_person_id = $1 WHERE id = $2 AND steward_person_id IS NULL',
      [person.id, tenant.id],
    );
    if (rowCount !== 1) throw new Error(`expected to update 1 tenant row, updated ${rowCount}`);

    const audit = await lastAudit(client, 'tenants', tenant.id);
    if (!audit || audit.operation !== 'update' || audit.actor !== person.id
        || audit.new_row?.steward_person_id !== person.id) {
      throw new Error('tenants_audit did not record this change as expected; nothing was changed');
    }
    console.log(`Done. ${person.full_name} is the steward of ${tenant.name}.`);
    console.log(`audit row id: ${audit.id} (tenants, update, actor = the steward, self-attested)`);
  });
}

void main();
