import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './routes.js';
import { dbReady } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Builds the full Express application (API + static serving) shared by:
 *  - server.ts      → local development (Vite middleware + app.listen)
 *  - api/index.ts   → Vercel serverless entry (handler without app.listen)
 */
export function createApp(): express.Express {
  const app = express();

  // Block all request handling until the database snapshot is hydrated —
  // a cold-started serverless instance must not serve stale seed data.
  app.use((_req, _res, next) => {
    dbReady.then(
      () => next(),
      (err) => next(err)
    );
  });

  // Body parsers with generous limits for resume uploads
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // API router
  app.use('/api', apiRouter);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Production static assets (dev mode mounts Vite middlewares on top instead)
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  // Explicit 404s for missing /api/* and missing asset files — a JSON/asset
  // miss must never be answered with index.html (that masked broken assets).
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      next();
      return;
    }
    const wantsHtml = req.path === '/' || (!req.path.includes('.') && req.method === 'GET' && !req.path.startsWith('/api'));
    if (!wantsHtml) {
      res.status(404).json({ error: 'Not found', path: req.path });
      return;
    }
    next();
  });

  // SPA fallback for client-side routes
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });

  return app;
}
