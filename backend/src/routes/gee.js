/**
 * @fileoverview Google Earth Engine API 路由
 *
 * 提供 JSON 数据源目录、GEE 瓦片图层、L4 六角格按视图范围读取，
 * 以及基于六角格中心点的 DEM 采样接口。
 *
 * @module routes/gee
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import {
  filterGeojsonByBounds,
  getDatasourceCatalog,
  getLayerById,
  getLayerCatalog,
  sampleDemForHexagons,
  sampleLandcoverForHexagons,
  getBatchCount,
  BATCH_SIZE,
} from '../services/geeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const l0DemPath = path.resolve(backendRoot, 'output', 'L0_dem.geojson');
const l4HexagonPath = path.resolve(backendRoot, 'data', 'L4.geojson');
const outputDir = path.resolve(backendRoot, 'output');

const router = Router();

function createError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseBoundsFromQuery(query) {
  const { minLon, minLat, maxLon, maxLat } = query;
  if ([minLon, minLat, maxLon, maxLat].some((value) => value === undefined)) {
    return null;
  }

  return [minLon, minLat, maxLon, maxLat].map(Number);
}

async function readL4Geojson() {
  const raw = await fs.readFile(l4HexagonPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * GET /api/gee/dem/l0
 *
 * 保留旧的预计算 L0 DEM 数据接口，作为历史数据或 fallback 使用。
 */
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

/**
 * GET /api/gee/datasources
 *
 * 返回 datasource JSON 中配置的数据源，不触发 GEE 初始化。
 */
router.get('/datasources', async (_req, res, next) => {
  try {
    const dataSources = await getDatasourceCatalog();
    res.json({ dataSources });
  } catch (error) {
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

/**
 * GET /api/gee/geojson/hexagons
 *
 * 按当前地图视图范围从 L4.geojson 读取六角格。L4 文件较大，因此必须
 * 提供 bounds 查询参数，并通过 limit 限制返回数量。
 */
router.get('/geojson/hexagons', async (req, res, next) => {
  try {
    const bounds = parseBoundsFromQuery(req.query);
    if (!bounds) {
      throw createError('Bounds query parameters are required for L4 hexagons.', 400);
    }

    const geojson = await readL4Geojson();
    const filtered = filterGeojsonByBounds(geojson, bounds, {
      limit: req.query.limit,
      maxLimit: 2000,
    });

    res.type('application/geo+json').json(filtered);
  } catch (error) {
    if (error instanceof SyntaxError) {
      error.status = 500;
      error.message = 'L4.geojson contains invalid JSON.';
    }

    next(error);
  }
});

/**
 * POST /api/gee/dem/sample
 *
 * 支持传入已加载 GeoJSON，或只传 bounds 后由后端读取 L4 子集。
 * save=true 时会把采样结果写入 backend/output，便于后续复用。
 */
router.post('/dem/sample', async (req, res, next) => {
  try {
    const { bounds, geojson, save } = req.body || {};
    let targetGeojson = geojson;

    if (!targetGeojson) {
      if (!bounds) {
        throw createError('Either geojson or bounds is required for DEM sampling.', 400);
      }

      const l4Geojson = await readL4Geojson();
      targetGeojson = filterGeojsonByBounds(l4Geojson, bounds, {
        limit: req.body?.limit || 500,
        maxLimit: 1000,
      });
    }

    const hexagons = await sampleDemForHexagons(targetGeojson, {
      datasourceId: req.body?.datasourceId,
      scale: req.body?.scale || 30,
    });

    const payload = {
      hexagons,
      sampledCount: hexagons.features.length,
    };

    if (save) {
      await fs.mkdir(outputDir, { recursive: true });
      const filename = `dem-sampled-${Date.now()}.geojson`;
      const absolutePath = path.join(outputDir, filename);
      await fs.writeFile(absolutePath, JSON.stringify(hexagons, null, 2), 'utf8');
      payload.savedPath = path.relative(backendRoot, absolutePath).replace(/\\/g, '/');
    }

    res.json(payload);
  } catch (error) {
    if (error instanceof SyntaxError) {
      error.status = 500;
      error.message = 'L4.geojson contains invalid JSON.';
    }

    next(error);
  }
});

router.post('/dem/sample-batch', async (req, res, next) => {
  try {
    const { geojson, batchIndex, datasourceId, scale } = req.body || {};

    if (!geojson || !Array.isArray(geojson.features)) {
      throw createError('geojson is required.', 400);
    }
    if (typeof batchIndex !== 'number' || batchIndex < 0) {
      throw createError('batchIndex is required.', 400);
    }

    const allFeatures = geojson.features;
    const totalBatches = getBatchCount(allFeatures.length);
    const offset = batchIndex * BATCH_SIZE;
    const batchFeatures = allFeatures.slice(offset, offset + BATCH_SIZE);

    if (batchFeatures.length === 0) {
      return res.json({ features: [], batchIndex, totalBatches, done: true });
    }

    const batchGeojson = { type: 'FeatureCollection', features: batchFeatures };
    const result = await sampleDemForHexagons(batchGeojson, { datasourceId, scale });

    res.json({
      features: result.features,
      batchIndex,
      totalBatches,
      done: batchIndex + 1 >= totalBatches,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/landcover/sample-batch', async (req, res, next) => {
  try {
    const { geojson, batchIndex, datasourceId } = req.body || {};

    if (!geojson || !Array.isArray(geojson.features)) {
      throw createError('geojson is required.', 400);
    }
    if (typeof batchIndex !== 'number' || batchIndex < 0) {
      throw createError('batchIndex is required.', 400);
    }

    const allFeatures = geojson.features;
    const totalBatches = getBatchCount(allFeatures.length);
    const offset = batchIndex * BATCH_SIZE;
    const batchFeatures = allFeatures.slice(offset, offset + BATCH_SIZE);

    if (batchFeatures.length === 0) {
      return res.json({ features: [], batchIndex, totalBatches, done: true });
    }

    const batchGeojson = { type: 'FeatureCollection', features: batchFeatures };
    const result = await sampleLandcoverForHexagons(batchGeojson, { datasourceId });

    res.json({
      features: result.features,
      batchIndex,
      totalBatches,
      done: batchIndex + 1 >= totalBatches,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
