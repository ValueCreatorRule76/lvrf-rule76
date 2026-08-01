import { defineConfig } from 'drizzle-kit';

/**
 * Target guard.
 *
 * drizzle-kit reads DATABASE_URL from whatever .env is in the working
 * directory. With more than one Rule76 project on this machine, a wrong
 * terminal tab is enough to point a migration at the wrong database — and the
 * failure is silent until it isn't.
 *
 * This config refuses to load unless the target is an LVRF database. It costs
 * nothing and removes an entire class of accident.
 */
const url = process.env.DATABASE_URL ?? '';

if (!url) {
  throw new Error(
    'DATABASE_URL is not set. Expected an LVRF database — check you are in the ' +
    'lvrf-rule76 directory and that .env exists.',
  );
}

// Accept only a database literally named lvrf (optionally suffixed: lvrf_test).
const dbName = url.split('/').pop()?.split('?')[0] ?? '';
if (!/^lvrf(_[a-z0-9]+)?$/.test(dbName)) {
  throw new Error(
    `Refusing to run against database "${dbName}".\n` +
    `LVRF migrations may only target a database named lvrf (or lvrf_*).\n` +
    `Check which directory this terminal is in, and which .env it is reading.`,
  );
}

// Production is a different host. Warn loudly rather than block — deploying is
// legitimate, doing it by accident is not.
if (!/@(localhost|127\.0\.0\.1)[:\/]/.test(url)) {
  console.warn(
    `\n  ⚠  DATABASE_URL points at a REMOTE host, not localhost.\n` +
    `     Target: ${url.replace(/:\/\/[^@]*@/, '://***@')}\n` +
    `     Confirm you intend to migrate production, and that pg_dump ran first.\n`,
  );
}

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  // Retained from the original config — prompts before executing statements.
  strict: true,
});
