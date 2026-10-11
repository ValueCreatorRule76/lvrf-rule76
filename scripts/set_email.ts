/**
 * Change a vendor staff member's email — their sign-in identifier.
 *
 *   npx tsx scripts/set_email.ts <current email> <new email>
 *
 * Run on the box from /srv/lvrf (it reads DATABASE_URL from .env, like the
 * server), or locally against a dev database. This script is the only
 * writer of persons.email after a person is created.
 *
 * AN AUDITED UPDATE, NOT SUPERSESSION. 44 foreign keys point at persons.id
 * — runs, sign-offs, evidence, audit and refusal actors, credentials and
 * sessions. Superseding the person would give a new id and split all of
 * that history from the new identity, and a superseded person cannot sign
 * in. An email is a contact attribute of the same person, so the row is
 * updated in place and persons_audit records the change: old_row and
 * new_row in audit_log, with the actor.
 *
 * - Refuses unless exactly one CURRENT person has the current email
 *   (case-insensitive) AND is vendor staff (tenant_id set), not simulated.
 * - Refuses unless NO person — current, retired or superseded — already has
 *   the new email (case-insensitive). persons_email_key is case-sensitive
 *   and covers every row, so both are checked here, before the write.
 * - Refuses an implausible address and a no-op change.
 * - One transaction. The actor is SELF-ATTESTED: lvrf.actor_person_id is
 *   set to the person whose email changes, exactly as actorContext sets it
 *   for a request, so the audit row names them. The audit row is then read
 *   back and checked (old email, new email, actor); if it is missing or
 *   wrong, the change is rolled back.
 * - The person's id, credential and sessions are untouched. A signed-in
 *   session stays valid: it belongs to the person, not to the address.
 * - Prints the person id and the audit row id. Never prints a password or a
 *   hash; there are none here.
 */
import '../server/env.js';
import pg from 'pg';

// Deliberately loose: one @, something on each side, a dot in the domain,
// no whitespace. Deliverability is not this script's question.
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 254;

/** A refusal: rolled back like any failure, but reported as "Refused:". */
class Refusal extends Error {}

function refuse(message: string): never {
  throw new Refusal(message);
}

async function main(): Promise<void> {
  const [currentArg, newArg] = process.argv.slice(2);
  if (!currentArg || !newArg) {
    console.error('Usage: npx tsx scripts/set_email.ts <current email> <new email>');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (expected in .env).');
    process.exit(2);
  }
  const current = currentArg.trim();
  const next = newArg.trim();
  if (next.length > MAX_LENGTH || !PLAUSIBLE_EMAIL.test(next)) {
    console.error(`Refused: "${next}" is not a plausible email address.`);
    process.exit(1);
  }
  if (current.toLowerCase() === next.toLowerCase()) {
    console.error('Refused: the new email is the same as the current one.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE: a concurrent change to the same person waits here rather
    // than racing past the checks below.
    const { rows } = await client.query<{
      id: string; full_name: string; email: string; tenant_id: string | null; simulated: boolean;
    }>(
      `SELECT id, full_name, email, tenant_id, simulated FROM persons
        WHERE lower(email) = lower($1) AND deleted_at IS NULL AND superseded_by_id IS NULL
        FOR UPDATE`,
      [current],
    );
    if (rows.length !== 1) {
      refuse(`${rows.length} current persons have email ${current}; expected exactly one.`);
    }
    const person = rows[0];
    if (person.tenant_id === null) {
      refuse(`${person.full_name} is a customer-side person. Only vendor staff sign in, so only their email is changed here.`);
    }
    if (person.simulated) {
      refuse(`${person.full_name} is a simulated person.`);
    }

    const { rows: [{ taken }] } = await client.query<{ taken: number }>(
      'SELECT count(*)::int AS taken FROM persons WHERE lower(email) = lower($1)',
      [next],
    );
    if (taken > 0) {
      refuse(`${next} already belongs to a person (current, retired or superseded). Emails are unique.`);
    }

    // Self-attested: the person whose email changes is the actor on record.
    await client.query('SELECT set_config($1, $2, true)', ['lvrf.actor_person_id', person.id]);

    const { rowCount } = await client.query(
      'UPDATE persons SET email = $1 WHERE id = $2 AND email = $3',
      [next, person.id, person.email],
    );
    if (rowCount !== 1) {
      throw new Error(`expected to update 1 row, updated ${rowCount}`);
    }

    const { rows: [audit] } = await client.query<{
      id: string; old_email: string | null; new_email: string | null; actor: string | null; operation: string;
    }>(
      // ORDER BY a.id, the table's bigint — NOT the output column "id",
      // which is text here: sorted as text, '94' outranks '1003' and the
      // newest row is not the first (found at Gate A; the check below
      // caught it and rolled back).
      `SELECT a.id::text AS id, a.old_row ->> 'email' AS old_email, a.new_row ->> 'email' AS new_email,
              a.actor_person_id::text AS actor, a.operation::text AS operation
         FROM audit_log a
        WHERE a.table_name = 'persons' AND a.record_id = $1
        ORDER BY a.id DESC LIMIT 1`,
      [person.id],
    );
    if (!audit || audit.operation !== 'update' || audit.old_email !== person.email
        || audit.new_email !== next || audit.actor !== person.id) {
      throw new Error('persons_audit did not record this change as expected; nothing was changed');
    }

    await client.query('COMMIT');
    console.log(`Done. ${person.full_name}: ${person.email} -> ${next}`);
    console.log(`person id:    ${person.id} (unchanged)`);
    console.log(`audit row id: ${audit.id} (persons, update, actor = the person, self-attested)`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof Refusal) {
      console.error(`Refused: ${err.message}`);
    } else {
      console.error('Failed; nothing was changed.', err instanceof Error ? err.message : err);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
