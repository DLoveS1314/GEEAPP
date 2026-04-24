import { Router } from 'express';
import { ensureEarthEngineInitialized } from '../config/gee.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const gee = await ensureEarthEngineInitialized();

    res.json({
      ok: true,
      service: 'gee-openlayers-server',
      gee: {
        initialized: true,
        projectId: gee.projectId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      service: 'gee-openlayers-server',
      gee: {
        initialized: false,
      },
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
