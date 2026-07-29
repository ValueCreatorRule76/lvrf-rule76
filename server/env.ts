/**
 * Loads .env into process.env before any other module reads it. Import this
 * first, with no other imports ahead of it — ESM evaluates sibling imports in
 * declaration order, so this must run before db/pool.ts or anything else that
 * touches process.env.
 */
try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}
