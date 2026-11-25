// S7b (LVRF_PLAN §27), for scripts/verify_story.sh's B9: the stage the composer reads for one account, its runs limited to
// ONE engagement, so the Compounding condition is read on that engagement's runs alone (a row and its correction).
//   DATABASE_URL=… npx tsx scripts/lib/story_stage.mts TENANT INSTITUTION ENGAGEMENT
import pg from 'pg';
import { composeStory } from '../../server/lib/story.ts';
const [tenant, inst, eng] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const orig = pool.query.bind(pool) as (t: unknown, v?: unknown) => Promise<unknown>;
const limited = {
  query: (t: unknown, v?: unknown) => (typeof t === 'string' && t.includes('FROM value_runs r JOIN engagements g')
    ? orig(t.replace('WHERE g.institution_id = $1', `WHERE g.institution_id = $1 AND g.id = '${eng}'`), v) : orig(t, v)),
};
const p = await composeStory(limited as never, tenant, inst, 'internal');
console.log(p?.stage ?? 'none');
await pool.end();
