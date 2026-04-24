import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import geeRouter from './routes/gee.js';

const __filename = fileURLToPath(import.meta.url);

export function createApp() {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

  app.use(
    cors({
      origin: frontendOrigin,
    })
  );
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({
      name: 'gee-openlayers-server',
      message: 'Earth Engine backend is running.',
      endpoints: [
        '/api/health',
        '/api/gee/layers',
        '/api/gee/layers/sentinel-rgb',
        '/api/gee/layers/ndvi',
      ],
    });
  });

  app.use('/api/health', healthRouter);
  app.use('/api/gee', geeRouter);

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    const detail = error.cause instanceof Error ? error.cause.message : undefined;

    res.status(status).json({
      error: error.message || 'Internal server error.',
      detail,
    });
  });

  return app;
}

export const app = createApp();

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  const port = Number(process.env.PORT || 3000);

  app.listen(port, () => {
    console.log(`GEE backend listening on http://localhost:${port}`);
  });
}
