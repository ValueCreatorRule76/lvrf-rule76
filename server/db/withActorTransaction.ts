import type { Pool, PoolClient } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema.js';

export type Db = NodePgDatabase<typeof schema>;

/**
 * Same mechanism as server/middleware/actorContext.ts, for code paths that
 * aren't Express requests (seed/spine scripts): one transaction, actor set
 * via SELECT set_config(...) before any write, so the audit trigger
 * attributes every row to a real person rather than NULL.
 */
export async function withActorTransaction<T>(
  pool: Pool,
  actorPersonId: string,
  fn: (db: Db, client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [
      'lvrf.actor_person_id',
      actorPersonId,
    ]);
    const db = drizzle(client, { schema });
    const result = await fn(db, client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
