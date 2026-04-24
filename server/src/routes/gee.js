import { Router } from 'express';
import { getLayerById, getLayerCatalog } from '../services/geeService.js';

const router = Router();

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
