/**
 * @fileoverview HexRemap PostgreSQL-backed dataset routes.
 *
 * These endpoints turn uploaded/local GeoJSON files into persistent datasets,
 * expose database-backed GeoJSON for the map, and write DEM / landcover samples
 * back into reserved columns on each hex cell.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import {
  countDatasetCells,
  createDatasetWithCells,
  getDataset,
  getDatasetRows,
  listDatasets,
  softDeleteDataset,
  updateDatasetVisibility,
  updateDemValues,
  updateLandcoverValues,
} from '../repositories/hexRepository.js';
import {
  parseBoundsParams,
  prepareCellsFromGeojson,
  rowsToFeatureCollection,
} from '../services/hexGeojsonService.js';
import {
  BATCH_SIZE,
  sampleDemForHexagons,
  sampleLandcoverForHexagons,
} from '../services/geeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const dataDir = path.resolve(backendRoot, 'data');

const router = Router();

function createError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function resolveDataFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw createError('filePath is required.', 400);
  }

  const resolvedPath = path.resolve(backendRoot, filePath);
  if (!resolvedPath.startsWith(dataDir)) {
    throw createError('Files outside backend/data are not allowed.', 403);
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (ext !== '.geojson' && ext !== '.json') {
    throw createError('Only .geojson or .json files can be imported.', 400);
  }

  return resolvedPath;
}

function getBatchIndex(body) {
  const batchIndex = Number(body?.batchIndex || 0);
  if (!Number.isInteger(batchIndex) || batchIndex < 0) {
    throw createError('batchIndex must be a non-negative integer.', 400);
  }
  return batchIndex;
}

function getSampleValues(sampledGeojson, propertyName) {
  return (sampledGeojson.features || [])
    .map((feature) => ({
      id: Number(feature.properties?.__cell_id),
      value: feature.properties?.[propertyName],
    }))
    .filter((item) => Number.isInteger(item.id) && item.value !== undefined);
}

function stripInternalCellIds(features) {
  return (features || []).map((feature) => {
    const { __cell_id, ...properties } = feature.properties || {};
    return { ...feature, properties };
  });
}

router.get('/datasets', async (_req, res, next) => {
  try {
    const datasets = await listDatasets();
    res.json({ datasets });
  } catch (error) {
    next(error);
  }
});

router.post('/import-file', async (req, res, next) => {
  try {
    const { filePath, name, tableName } = req.body || {};
    const importTableName = tableName || name;
    if (!importTableName || typeof importTableName !== 'string' || !importTableName.trim()) {
      throw createError('Table name is required.', 400);
    }

    const resolvedPath = resolveDataFile(filePath);
    const raw = await fs.readFile(resolvedPath, 'utf8');
    const geojson = JSON.parse(raw);
    const { cells, boundsGeometry } = prepareCellsFromGeojson(geojson);
    const dataset = await createDatasetWithCells({
      name: importTableName,
      sourceFile: path.relative(backendRoot, resolvedPath).replace(/\\/g, '/'),
      cells,
      boundsGeometry,
    });

    res.status(201).json({ dataset });
  } catch (error) {
    if (error.code === 'ENOENT') {
      error.status = 404;
      error.message = 'GeoJSON file was not found under backend/data.';
    }
    if (error instanceof SyntaxError) {
      error.status = 400;
      error.message = 'GeoJSON file contains invalid JSON.';
    }
    next(error);
  }
});

router.get('/datasets/:datasetId/geojson', async (req, res, next) => {
  try {
    const dataset = await getDataset(req.params.datasetId);
    if (!dataset) throw createError('Dataset was not found.', 404);

    const bounds = parseBoundsParams(req.query);
    const rows = await getDatasetRows(req.params.datasetId, {
      bounds,
      limit: req.query.limit,
      offset: req.query.offset,
      maxLimit: req.query.all === 'true' ? 200000 : 50000,
    });

    res.type('application/geo+json').json({
      dataset,
      geojson: rowsToFeatureCollection(rows),
      returnedCount: rows.length,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/datasets/:datasetId/visibility', async (req, res, next) => {
  try {
    const updated = await updateDatasetVisibility(req.params.datasetId, req.body?.visible);
    if (!updated) throw createError('Dataset was not found.', 404);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/datasets/:datasetId', async (req, res, next) => {
  try {
    const deleted = await softDeleteDataset(req.params.datasetId);
    if (!deleted) throw createError('Dataset was not found.', 404);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/datasets/:datasetId/dem/sample-batch', async (req, res, next) => {
  try {
    const dataset = await getDataset(req.params.datasetId);
    if (!dataset) throw createError('Dataset was not found.', 404);

    const batchIndex = getBatchIndex(req.body);
    const totalCount = await countDatasetCells(req.params.datasetId);
    const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
    const rows = await getDatasetRows(req.params.datasetId, {
      limit: BATCH_SIZE,
      maxLimit: BATCH_SIZE,
      offset: batchIndex * BATCH_SIZE,
    });

    if (rows.length === 0) {
      return res.json({ features: [], batchIndex, totalBatches, totalCount, done: true });
    }

    const batchGeojson = rowsToFeatureCollection(rows, { includeInternalId: true });
    const sampled = await sampleDemForHexagons(batchGeojson, {
      datasourceId: req.body?.datasourceId,
      scale: req.body?.scale || 30,
    });
    await updateDemValues(req.params.datasetId, getSampleValues(sampled, 'dem'));

    res.json({
      features: stripInternalCellIds(sampled.features),
      batchIndex,
      totalBatches,
      totalCount,
      done: batchIndex + 1 >= totalBatches,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/datasets/:datasetId/landcover/sample-batch', async (req, res, next) => {
  try {
    const dataset = await getDataset(req.params.datasetId);
    if (!dataset) throw createError('Dataset was not found.', 404);

    const batchIndex = getBatchIndex(req.body);
    const totalCount = await countDatasetCells(req.params.datasetId);
    const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
    const rows = await getDatasetRows(req.params.datasetId, {
      limit: BATCH_SIZE,
      maxLimit: BATCH_SIZE,
      offset: batchIndex * BATCH_SIZE,
    });

    if (rows.length === 0) {
      return res.json({ features: [], batchIndex, totalBatches, totalCount, done: true });
    }

    const batchGeojson = rowsToFeatureCollection(rows, { includeInternalId: true });
    const sampled = await sampleLandcoverForHexagons(batchGeojson, {
      datasourceId: req.body?.datasourceId,
    });
    await updateLandcoverValues(req.params.datasetId, getSampleValues(sampled, 'landcover'));

    res.json({
      features: stripInternalCellIds(sampled.features),
      batchIndex,
      totalBatches,
      totalCount,
      done: batchIndex + 1 >= totalBatches,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
