/**
 * Grant a person access to LVRF — an act that is the steward's alone (3.0
 * draft Q2/Q3, D5). Band A item 1.
 *
 *   npx tsx scripts/grant_access.ts <email> --reason "<why>" [--name "<Full Name>"]
 *
 * Run on the box from /srv/lvrf.
 *
 * - THE ACTOR IS THE STEWARD, PROVEN BY THEIR PASSWORD: the tenant's steward
 *   (tenants.steward_person_id) is prompted for their own password, verified
 *   with argon2 against their current credential, before anything is
 *   written. Who is logged into the box does not matter.
 * - If no person has this email, one is created as vendor staff of the
 *   steward's tenant (--name required), audited. The email must be a
 *   plausible address and unique case-insensitively across ALL persons —
 *   current, retired or superseded — as set_email.ts requires.
 * - If the person exists, they must be current, non-simulated vendor staff
 *   of the steward's tenant, with no current grant.
 * - Writes the grant (access_grants: who, granted_by = the steward, when,
 *   why). access_grants_steward_only refuses any other grantor.
 * - STARTING PASSWORD: prompted twice from the steward, never printed, set
 *   with must_change = true; the holder must replace it at first sign-in.
 *   Any previous credential and session of theirs is revoked.
 * - THE BOOTSTRAP: the steward granting themselves (no current grant yet)
 *   is allowed by the same rule. Their own password is kept — no starting
 *   password, no must_change.
 * - One transaction; the grant's audit row (and the new person's) is read
 *   back and checked, or nothing is changed.
 */
import '../server/env.js';
import {
  connect, findStaff, hashPassword, inTransaction, lastAudit, MAX_EMAIL_LENGTH, MIN_REASON_LENGTH,
  PLAUSIBLE_EMAIL, provePassword, readNewPassword, refuse, stewardOf, type StaffPerson,
} from './lib/cli.js';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();
  const reason = arg('--reason');
  const name = arg('--name');
  if (!email || email.startsWith('--') || reason === undefined) {
    console.error('Usage: npx tsx scripts/grant_access.ts <email> --reason "<why>" [--name "<Full Name>"]');
    process.exit(2);
  }
  if (reason.trim().length < MIN_REASON_LENGTH) {
    console.error(`Refused: --reason must say why access is granted, in at least ${MIN_REASON_LENGTH} characters.`);
    process.exit(1);
  }

  const client = await connect();
  await inTransaction(client, async () => {
    const { rows: existing } = await client.query<{ id: string }>(
      'SELECT id FROM persons WHERE lower(email) = lower($1)',
      [email],
    );

    let grantee: StaffPerson;
    let tenantId: string;
    let created = false;
    if (existing.length > 0) {
      grantee = await findStaff(client, email);
      tenantId = grantee.tenant_id;
    } else {
      if (email.length > MAX_EMAIL_LENGTH || !PLAUSIBLE_EMAIL.test(email)) refuse(`"${email}" is not a plausible email address.`);
      if (!name || name.trim() === '') refuse('no person has this email; --name "<Full Name>" is required to create one.');
      const { rows: tenants } = await client.query<{ id: string }>(
        'SELECT id FROM tenants WHERE steward_person_id IS NOT NULL AND deleted_at IS NULL',
      );
      if (tenants.length !== 1) refuse(`expected exactly one tenant with a steward to create the person in, found ${tenants.length}.`);
      tenantId = tenants[0].id;
      grantee = { id: '', full_name: name.trim(), email, tenant_id: tenantId };
      created = true;
    }

    const steward = await stewardOf(client, tenantId);
    if (!steward) refuse('this tenant has no steward. Run scripts/set_steward.ts first.');
    const bootstrap = !created && grantee.id === steward.id;

    if (!created) {
      const { rows: [current] } = await client.query<{ id: string }>(
        'SELECT id FROM access_grants WHERE person_id = $1 AND revoked_at IS NULL',
        [grantee.id],
      );
      if (current) refuse(`${grantee.full_name} already has a current grant (${current.id}).`);
    }

    console.log(
      bootstrap
        ? `Granting the steward ${steward.full_name} their own access (the bootstrap).`
        : `Granting ${grantee.full_name} <${email}> access${created ? ' (a new vendor-staff person)' : ''}.`,
    );
    await provePassword(client, steward, 'Steward password');
    const starting = bootstrap ? null : await readNewPassword(`Starting password for ${grantee.full_name}`);

    await client.query('SELECT set_config($1, $2, true)', ['lvrf.actor_person_id', steward.id]);

    if (created) {
      const { rows: [p] } = await client.query<{ id: string }>(
        'INSERT INTO persons (tenant_id, full_name, email) VALUES ($1, $2, $3) RETURNING id',
        [tenantId, grantee.full_name, email],
      );
      grantee = { ...grantee, id: p.id };
      const pa = await lastAudit(client, 'persons', p.id);
      if (!pa || pa.operation !== 'insert' || pa.actor !== steward.id) {
        throw new Error('persons_audit did not record the new person as expected; nothing was changed');
      }
    }

    const { rows: [grant] } = await client.query<{ id: string }>(
      `INSERT INTO access_grants (person_id, tenant_id, granted_by_person_id, reason)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [grantee.id, tenantId, steward.id, reason.trim()],
    );

    if (starting !== null) {
      await client.query('UPDATE person_credentials SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL', [grantee.id]);
      await client.query(
        `INSERT INTO person_credentials (person_id, password_hash, set_via, must_change)
         VALUES ($1, $2, 'grant', true)`,
        [grantee.id, await hashPassword(starting)],
      );
      await client.query('UPDATE sessions SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL', [grantee.id]);
    }

    const ga = await lastAudit(client, 'access_grants', grant.id);
    if (!ga || ga.operation !== 'insert' || ga.actor !== steward.id) {
      throw new Error('access_grants_audit did not record the grant as expected; nothing was changed');
    }
    console.log(`Done. ${grantee.full_name} has access, granted by ${steward.full_name}.`);
    console.log(`person id:    ${grantee.id}${created ? ' (created)' : ''}`);
    console.log(`grant id:     ${grant.id}`);
    console.log(`audit row id: ${ga.id} (access_grants, insert, actor = the steward)`);
    console.log(
      starting === null
        ? 'Password unchanged (the steward keeps their own).'
        : 'Starting password set; it must be changed at first sign-in. Give it to them yourself — it is not shown here.',
    );
  });
}

void main();
