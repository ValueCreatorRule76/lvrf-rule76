/**
 * Shared by the access scripts (3.0 Band A item 1): set_steward.ts,
 * grant_access.ts, revoke_access.ts, reset_password.ts and set_password.ts.
 *
 * THE TRUST ROOT, stated: these scripts run on the box over SSH and connect
 * as lvrf_app. What makes an act the steward's is not the OS user but the
 * steward's own password, argon2-verified against their current
 * credential, and access_grants_steward_only in the database. SSH plus the
 * postgres superuser can still bypass all of it — break-glass
 * set_password.ts can reset the steward's own password, and postgres can
 * disable any trigger. That is accepted and written down (BUILD_STATUS,
 * Band A), not hidden.
 */
import { stdin, stdout } from 'node:process';
import argon2 from 'argon2';
import pg from 'pg';

export const MIN_PASSWORD_LENGTH = 12;
export const MIN_REASON_LENGTH = 12;
export const MAX_EMAIL_LENGTH = 254;
// Deliberately loose, as set_email.ts: one @, something on each side, a
// dot in the domain, no whitespace. Deliverability is not the question.
export const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A refusal: rolled back like any failure, but reported as "Refused:". */
export class Refusal extends Error {}
export function refuse(message: string): never {
  throw new Refusal(message);
}

export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error('Run this in an interactive terminal: passwords are read without echo.'));
      return;
    }
    // Raw mode and the listener FIRST, the prompt after (set_password.ts,
    // P1 Gate A: a pty answering at once hung otherwise).
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
        if (c === '\u0003') {
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

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (expected in .env).');
    process.exit(2);
  }
  return url;
}

export async function connect(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  return client;
}

export interface StaffPerson {
  id: string;
  full_name: string;
  email: string;
  tenant_id: string;
}

/**
 * Exactly one CURRENT, non-simulated vendor-staff person with this email
 * (case-insensitive), or a refusal naming what was found instead.
 */
export async function findStaff(client: pg.Client, email: string): Promise<StaffPerson> {
  const { rows } = await client.query<StaffPerson & { simulated: boolean; tenant_id: string | null }>(
    `SELECT id, full_name, email, tenant_id, simulated FROM persons
      WHERE lower(email) = lower($1) AND deleted_at IS NULL AND superseded_by_id IS NULL`,
    [email],
  );
  if (rows.length !== 1) refuse(`${rows.length} current persons have email ${email}; expected exactly one.`);
  const p = rows[0];
  if (p.tenant_id === null) refuse(`${p.full_name} is a customer-side person. Only vendor staff sign in.`);
  if (p.simulated) refuse(`${p.full_name} is a simulated person.`);
  return { id: p.id, full_name: p.full_name, email: p.email, tenant_id: p.tenant_id };
}

/** The tenant's steward (tenants.steward_person_id), or null. */
export async function stewardOf(client: pg.Client, tenantId: string): Promise<StaffPerson | null> {
  const { rows: [s] } = await client.query<StaffPerson>(
    `SELECT p.id, p.full_name, p.email, p.tenant_id
       FROM tenants t JOIN persons p ON p.id = t.steward_person_id
      WHERE t.id = $1`,
    [tenantId],
  );
  return s ?? null;
}

/**
 * Prompts for `who`'s password (up to three tries) and verifies it with
 * argon2 against their CURRENT credential. Refuses — before anything is
 * written — on three failures or when they have no current credential.
 */
export async function provePassword(client: pg.Client, who: StaffPerson, label: string): Promise<void> {
  const { rows: [cred] } = await client.query<{ password_hash: string }>(
    'SELECT password_hash FROM person_credentials WHERE person_id = $1 AND revoked_at IS NULL',
    [who.id],
  );
  if (!cred) refuse(`${who.full_name} has no current password, so ${label} cannot be proven.`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const pw = await promptHidden(`${label} (${who.full_name}): `);
    if (await argon2.verify(cred.password_hash, pw)) return;
    console.error(attempt < 3 ? 'That password is not correct.' : 'Three incorrect passwords.');
  }
  refuse(`${label} was not proven; nothing was changed.`);
}

/** Prompts twice, without echo; at least 12 characters; never printed. */
export async function readNewPassword(prompt: string): Promise<string> {
  const first = await promptHidden(`${prompt}: `);
  if (first.length < MIN_PASSWORD_LENGTH) refuse(`the password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const second = await promptHidden('Again: ');
  if (first !== second) refuse('the two entries do not match.');
  return first;
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * The newest audit_log row for a record. ORDER BY a.id — the bigint, not
 * a text alias (set_email.ts, P1 Gate A).
 */
export async function lastAudit(
  client: pg.Client,
  table: string,
  recordId: string,
): Promise<{ id: string; operation: string; actor: string | null; new_row: Record<string, unknown> | null } | null> {
  const { rows: [a] } = await client.query<{ id: string; operation: string; actor: string | null; new_row: Record<string, unknown> | null }>(
    `SELECT a.id::text AS id, a.operation::text AS operation, a.actor_person_id::text AS actor, a.new_row
       FROM audit_log a WHERE a.table_name = $1 AND a.record_id = $2
      ORDER BY a.id DESC LIMIT 1`,
    [table, recordId],
  );
  return a ?? null;
}

/** Runs `fn` in one transaction; prints Refused:/Failed: and exits 1 on error. */
export async function inTransaction(client: pg.Client, fn: () => Promise<void>): Promise<void> {
  try {
    await client.query('BEGIN');
    await fn();
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof Refusal) console.error(`Refused: ${err.message}`);
    else console.error('Failed; nothing was changed.', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
