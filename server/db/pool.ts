import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
