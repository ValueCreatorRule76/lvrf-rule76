import { Router } from 'express';
import type { Pool } from 'pg';

export function healthRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'connected' });
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
