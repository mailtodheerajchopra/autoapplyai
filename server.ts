// dotenv/config must be the FIRST import: environment must be populated
// before any module (storage, auth) reads process.env at init time.
import 'dotenv/config';
import express from 'express';
import { createApp } from './server/app.js';

async function startServer() {
  const app: express.Express = createApp();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Development mode with Vite middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log(`🚀 Development server mounted with Vite middlewares`);
  } else {
    console.log(`📦 Serving production build from ${process.cwd()}/dist`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ AutoApply AI backend server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
