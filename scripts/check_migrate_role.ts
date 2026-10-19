/**
 * OWN-1 — read-only: the migration connection is lvrf_migrate, acting as
 * lvrf_owner (ALTER ROLE lvrf_migrate SET role = 'lvrf_owner', db/ownership.sql),
 * so what a migration creates is owned by lvrf_owner. Exits 1 otherwise.
 * Run before every migration with the migration URL:
 *
 *   DATABASE_URL="$(grep '^MIGRATE_DATABASE_URL=' ~/.lvrf_migrate.env | cut -d= -f2-)" npx tsx scripts/check_migrate_role.ts
 */
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows: [r] } = await client.query<{ session_user: string; current_user: string }>('SELECT session_user, current_user');
await client.end();
const ok = r.session_user === 'lvrf_migrate' && r.current_user === 'lvrf_owner';
console.log(`${ok ? 'ok' : 'REFUSED'}: connected as ${r.session_user}, acting as ${r.current_user}${ok ? '' : ' (expected lvrf_migrate acting as lvrf_owner)'}`);
process.exit(ok ? 0 : 1);
