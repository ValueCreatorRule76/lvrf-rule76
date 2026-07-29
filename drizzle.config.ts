import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './db/drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
});
