import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { getLayerById, getLayerCatalog } from '../services/geeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const l0DemPath = path.resolve(backendRoot, 'output', 'L0_dem.geojson');

const router = Router();

router.get('/dem/l0', async (_req, res, next) => {
  try {
    const raw = await fs.readFile(l0DemPath, 'utf8');
    res.type('application/geo+json').send(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      error.status = 404;
      error.message = 'DEM GeoJSON output was not found. Run npm run dem:l0 in backend first.';
    }

    next(error);
  }
});

router.get('/layers', async (_req, res, next) => {
  try {
    const layers = await getLayerCatalog();
    res.json({ layers });
  } catch (error) {
    next(error);
  }
});

router.get('/layers/:layerId', async (req, res, next) => {
  try {
    const layer = await getLayerById(req.params.layerId);
    res.json(layer);
  } catch (error) {
    next(error);
  }
});

export default router;
