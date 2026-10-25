import express, { type RequestHandler } from 'express';

/**
 * P2 (LVRF_PLAN §10; P2-D5) — JSON bodies. A research import carries the whole
 * pasted text, so the two research-results routes take up to 1 MB (the route
 * itself refuses a paste over 512 KB, in words); every other body keeps
 * Express's default 100 KB.
 */
const IMPORT_PATH = /^\/api\/(institutions|industries)\/[^/]+\/research-results$/;

export function jsonBodies(): RequestHandler {
  const importJson = express.json({ limit: '1mb' });
  const defaultJson = express.json();
  return (req, res, next) => (IMPORT_PATH.test(req.path) ? importJson : defaultJson)(req, res, next);
}
