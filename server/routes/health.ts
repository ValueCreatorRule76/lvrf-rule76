import { Router } from 'express';
import type { Pool } from 'pg';
import type { OriginCheck } from '../lib/origin.js';

/**
 * Unauthenticated (mounted before requireActor). Reports `origin_check` so
 * a missing LVRF_PUBLIC_ORIGIN in production is visible here and fails
 * lvrf-deploy.sh's smoke test instead of passing silently.
 */
export function healthRouter(pool: Pool, originMode: OriginCheck['mode']): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected', origin_check: originMode });
    } catch (err) {
      res.status(503).json({
        status: 'error',
        db: 'unreachable',
        message: err instanceof Error ? err.message : 'unknown error',
      });
    }
  });

  return router;
}
