/**
 * Set or replace a vendor staff member's sign-in password (0027, P1).
 *
 *   npx tsx scripts/set_password.ts <email>
 *
 * Run on the box from /srv/lvrf (it reads DATABASE_URL from .env, like the
 * server), or locally against a dev database. There is no sign-up route:
 * this script is the only writer of person_credentials.
 *
 * - Refuses unless exactly one CURRENT person has that email AND is vendor
 *   staff (tenant_id set), not simulated, not retired or superseded.
 *   Customer-side persons are subjects of the record, not users.
 * - Prompts twice, without echo. At least 12 characters.
 * - In one transaction: revokes the current credential (if any), inserts
 *   the new argon2id hash, and revokes every active session for that
 *   person — changing a password signs them out everywhere.
 * - Never prints the password or the hash.
 */
import '../server/env.js';
import { userInfo } from 'node:os';
import { stdin, stdout } from 'node:process';
import argon2 from 'argon2';
import pg from 'pg';

const MIN_LENGTH = 12;

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error('Run this in an interactive terminal: the password is read without echo.'));
      return;
    }
    // Raw mode and the listener FIRST, the prompt after. Written the other
    // way round, anything typed or pasted the instant the prompt appears
    // arrives while the terminal is still in cooked mode: it is echoed in
    // the clear, and lost when raw mode switches on (found at Gate A — a pty
    // driver answering immediately hung on "Again:").
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (c === '\u0003') { // Ctrl-C
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += c;
      }
    };
    stdin.on('data', onData);
    stdin.resume();
    stdout.write(question);
  });
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx scripts/set_password.ts <email>');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (expected in .env).');
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{
      id: string; full_name: string; tenant_id: string | null; simulated: boolean;
    }>(
      `SELECT id, full_name, tenant_id, simulated FROM persons
        WHERE lower(email) = lower($1) AND deleted_at IS NULL AND superseded_by_id IS NULL`,
      [email],
    );
    if (rows.length !== 1) {
      console.error(`Refused: ${rows.length} current persons have email ${email}; expected exactly one.`);
      process.exit(1);
    }
    const person = rows[0];
    if (person.tenant_id === null) {
      console.error(`Refused: ${person.full_name} is a customer-side person. Only vendor staff can sign in.`);
      process.exit(1);
    }
    if (person.simulated) {
      console.error(`Refused: ${person.full_name} is a simulated person.`);
      process.exit(1);
    }

    console.log(`Setting the sign-in password for ${person.full_name} <${email}>.`);
    const first = await promptHidden('New password: ');
    if (first.length < MIN_LENGTH) {
      console.error(`Refused: the password must be at least ${MIN_LENGTH} characters.`);
      process.exit(1);
    }
    const second = await promptHidden('Again: ');
    if (first !== second) {
      console.error('Refused: the two entries do not match.');
      process.exit(1);
    }

    const hash = await argon2.hash(first, { type: argon2.argon2id });
    const setVia = `cli:${userInfo().username}`;

    await client.query('BEGIN');
    const revokedCred = await client.query(
      'UPDATE person_credentials SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL',
      [person.id],
    );
    await client.query(
      'INSERT INTO person_credentials (person_id, password_hash, set_via) VALUES ($1, $2, $3)',
      [person.id, hash, setVia],
    );
    const revokedSessions = await client.query(
      'UPDATE sessions SET revoked_at = now() WHERE person_id = $1 AND revoked_at IS NULL',
      [person.id],
    );
    await client.query('COMMIT');

    console.log(
      `Done. ${revokedCred.rowCount ? 'Previous password revoked. ' : 'First password set. '}` +
      `${revokedSessions.rowCount ?? 0} active session(s) signed out.`,
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed; nothing was changed.', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void main();
