/**
 * @fileoverview Google Earth Engine 服务层
 *
 * 本文件负责从 JSON 配置读取 GEE 数据源、构建瓦片图层，并对视图内
 * L4 六角格执行中心点 DEM 采样。纯 JSON/GeoJSON 处理函数不初始化 GEE，
 * 避免普通数据读取被凭证或网络状态阻塞。
 *
 * @module services/geeService
 */

import ee from '@google/earthengine';
import { ensureEarthEngineInitialized } from '../config/gee.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

let datasourcesCache = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datasourcesPath = path.resolve(__dirname, '..', 'config', 'datasources.json');

const defaultCenter = [121.334757975, 25.09106329];
const defaultZoom = 11;
const defaultBounds = [121.16522535, 25.00072178, 121.5042906, 25.1814048];
const requiredDatasourceFields = ['id', 'name', 'type', 'description', 'dataset', 'visualization'];

function createError(message, status = 500, cause) {
  const error = new Error(message);
  error.status = status;
  error.cause = cause;
  return error;
}

function getMapData(image, visualization) {
  return new Promise((resolve, reject) => {
    image.getMap(visualization, (map, error) => {
      if (error) {
        reject(createError('Failed to generate Earth Engine map tiles.', 502, error));
        return;
      }

      resolve(map);
    });
  });
}

function getEeInfo(eeObject, message = 'Failed to read Earth Engine data.') {
  return new Promise((resolve, reject) => {
    eeObject.getInfo((result, error) => {
      if (error) {
        reject(createError(message, 502, error));
        return;
      }

      resolve(result);
    });
  });
}

function getTileUrl(map) {
  if (map.urlFormat) return map.urlFormat;
  if (map.url_format) return map.url_format;
  if (map.tile_fetcher?.url_format) return map.tile_fetcher.url_format;
  if (!map.mapid) return null;

  const encodedMapId = String(map.mapid)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const tokenQuery = map.token ? `?token=${encodeURIComponent(map.token)}` : '';

  if (String(map.mapid).startsWith('projects/')) {
    return `https://earthengine.googleapis.com/v1/${encodedMapId}/tiles/{z}/{x}/{y}${tokenQuery}`;
  }

  return `https://earthengine.googleapis.com/map/${encodedMapId}/{z}/{x}/{y}${tokenQuery}`;
}

function sanitizeDatasource(source) {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    description: source.description,
    dataset: source.dataset,
    visualization: source.visualization,
    defaultCenter: source.defaultCenter || defaultCenter,
    defaultZoom: source.defaultZoom || defaultZoom,
    bounds: source.bounds || defaultBounds,
  };
}

function validateDatasourceConfig(config) {
  if (!config || !Array.isArray(config.dataSources)) {
    throw createError('datasources.json must contain a dataSources array.', 500);
  }

  for (const [index, source] of config.dataSources.entries()) {
    const missingField = requiredDatasourceFields.find((field) => source[field] === undefined || source[field] === null);
    if (missingField) {
      throw createError(`datasources.json dataSources[${index}] is missing required field: ${missingField}.`, 500);
    }
  }
}

/**
 * 读取并缓存后端数据源配置。
 *
 * @returns {Promise<Array>} 已校验的数据源配置数组
 */
async function loadDatasourceConfig() {
  if (datasourcesCache) return datasourcesCache;

  try {
    const raw = await fs.readFile(datasourcesPath, 'utf8');
    const config = JSON.parse(raw);
    validateDatasourceConfig(config);
    datasourcesCache = config.dataSources.map(sanitizeDatasource);
    return datasourcesCache;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createError('datasources.json contains invalid JSON.', 500, error);
    }
    if (error.status) throw error;
    throw createError('Failed to load datasource configuration.', 500, error);
  }
}

function buildSentinelRgbImage(source) {
  return ee
    .ImageCollection(source.dataset)
    .filterDate('2024-04-01', '2024-10-31')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .median();
}

function buildLandcoverImage(source) {
  return ee.ImageCollection(source.dataset).first().select('Map');
}

function buildDemImage(source) {
  return ee.Image(source.dataset).select('elevation');
}

function buildLandcoverSamplingImage(source) {
  return ee.ImageCollection(source.dataset).first().select('Map');
}

function buildImageFactory(source) {
  if (source.type === 'RGB') return () => buildSentinelRgbImage(source);
  if (source.type === 'LANDCOVER') return () => buildLandcoverImage(source);
  if (source.type === 'DEM') return () => buildDemImage(source);
  throw createError(`Unsupported datasource type: ${source.type}`, 400);
}

async function buildLayerPayload(source) {
  const { projectId } = await ensureEarthEngineInitialized();
  const map = await getMapData(buildImageFactory(source)(), source.visualization);
  const url = getTileUrl(map);

  return {
    id: source.id,
    name: source.name,
    type: 'xyz',
    url,
    mapId: map.mapid || null,
    token: map.token || '',
    projectId,
    attribution: 'Google Earth Engine',
    visParams: source.visualization,
    center: source.defaultCenter,
    zoom: source.defaultZoom,
    bounds: source.bounds,
    description: source.description,
    dataset: source.dataset,
    datasourceType: source.type,
  };
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function normalizeBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(isFiniteNumber)) {
    throw createError('Bounds must be [minLon, minLat, maxLon, maxLat].', 400);
  }

  const normalized = bounds.map(Number);
  if (normalized[0] >= normalized[2] || normalized[1] >= normalized[3]) {
    throw createError('Bounds min values must be smaller than max values.', 400);
  }

  return normalized;
}

function walkCoordinates(coordinates, points = []) {
  if (!Array.isArray(coordinates)) return points;
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    points.push([Number(coordinates[0]), Number(coordinates[1])]);
    return points;
  }

  for (const child of coordinates) walkCoordinates(child, points);
  return points;
}

function getGeometryBounds(geometry) {
  const points = walkCoordinates(geometry?.coordinates);
  if (points.length === 0) return null;

  return points.reduce(
    (acc, [lon, lat]) => [
      Math.min(acc[0], lon),
      Math.min(acc[1], lat),
      Math.max(acc[2], lon),
      Math.max(acc[3], lat),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
}

function intersectsBounds(featureBounds, bounds) {
  return featureBounds[0] <= bounds[2]
    && featureBounds[2] >= bounds[0]
    && featureBounds[1] <= bounds[3]
    && featureBounds[3] >= bounds[1];
}

function getFeatureCenter(feature) {
  const featureBounds = getGeometryBounds(feature.geometry);
  if (!featureBounds) return null;

  return [
    (featureBounds[0] + featureBounds[2]) / 2,
    (featureBounds[1] + featureBounds[3]) / 2,
  ];
}

/**
 * 根据经纬度范围过滤 GeoJSON FeatureCollection。
 *
 * @param {GeoJSON.FeatureCollection} geojson - 原始六角格数据
 * @param {Array<number>} bounds - [minLon, minLat, maxLon, maxLat]
 * @param {Object} options - limit 控制返回数量，避免一次返回过多 L4 要素
 * @returns {GeoJSON.FeatureCollection} 过滤后的 GeoJSON
 */
export function filterGeojsonByBounds(geojson, bounds, options = {}) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw createError('GeoJSON must be a FeatureCollection.', 400);
  }

  const normalizedBounds = normalizeBounds(bounds);
  const limit = Math.min(Math.max(Number(options.limit) || 500, 1), Number(options.maxLimit) || 2000);
  const features = [];

  for (const feature of geojson.features) {
    const featureBounds = getGeometryBounds(feature.geometry);
    if (featureBounds && intersectsBounds(featureBounds, normalizedBounds)) {
      features.push(feature);
      if (features.length >= limit) break;
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * 返回 JSON 配置中的所有数据源。
 *
 * @returns {Promise<Array>} 数据源目录
 */
export async function getDatasourceCatalog() {
  return loadDatasourceConfig();
}

export async function getLayerCatalog() {
  return loadDatasourceConfig();
}

export async function getLayerById(layerId) {
  const dataSources = await loadDatasourceConfig();
  const source = dataSources.find((item) => item.id === layerId);

  if (!source) {
    throw createError(`Unknown layer: ${layerId}`, 404);
  }

  return buildLayerPayload(source);
}

/**
 * 对六角格中心点进行 DEM 采样。
 *
 * 采样中心点比整面聚合更轻量，适合交互式视图刷新；返回时保持原始六角格
 * 几何不变，只在 properties 中补充 dem 字段。
 *
 * @param {GeoJSON.FeatureCollection} geojson - 待采样的六角格
 * @param {Object} options - 采样参数
 * @returns {Promise<GeoJSON.FeatureCollection>} 带 dem 属性的 GeoJSON
 */
const BATCH_SIZE = 500;

export async function sampleDemForHexagons(geojson, options = {}) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw createError('GeoJSON must be a FeatureCollection.', 400);
  }

  const dataSources = await loadDatasourceConfig();
  const demSource = dataSources.find((source) => source.id === (options.datasourceId || 'dem-srtm') || source.type === 'DEM');
  if (!demSource) {
    throw createError('No DEM datasource is configured.', 500);
  }

  await ensureEarthEngineInitialized();

  const allFeatures = geojson.features;
  const totalFeatures = allFeatures.length;
  const sampledByIndex = new Map();

  for (let offset = 0; offset < totalFeatures; offset += BATCH_SIZE) {
    const batch = allFeatures.slice(offset, offset + BATCH_SIZE);
    const pointFeatures = batch.map((feature, localIndex) => {
      const center = getFeatureCenter(feature);
      if (!center) return null;
      return ee.Feature(ee.Geometry.Point(center), { __index: offset + localIndex });
    }).filter(Boolean);

    if (pointFeatures.length === 0) continue;

    const samples = buildDemImage(demSource).sampleRegions({
      collection: ee.FeatureCollection(pointFeatures),
      scale: Number(options.scale) || 30,
      geometries: false,
    });
    const info = await getEeInfo(samples, 'Failed to sample DEM values at offset ' + offset);

    for (const sample of info.features || []) {
      const props = sample.properties || {};
      const index = Number(props.__index);
      const dem = props.elevation ?? props.dem ?? props.b1;
      if (Number.isInteger(index) && dem !== undefined && dem !== null) {
        sampledByIndex.set(index, Number(dem));
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures.map((feature, index) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        dem: sampledByIndex.has(index) ? sampledByIndex.get(index) : null,
      },
    })),
  };
}

export async function sampleLandcoverForHexagons(geojson, options = {}) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw createError('GeoJSON must be a FeatureCollection.', 400);
  }

  const dataSources = await loadDatasourceConfig();
  const lcSource = dataSources.find((source) => source.id === (options.datasourceId || 'landcover') || source.type === 'LANDCOVER');
  if (!lcSource) {
    throw createError('No LANDCOVER datasource is configured.', 500);
  }

  await ensureEarthEngineInitialized();

  const allFeatures = geojson.features;
  const totalFeatures = allFeatures.length;
  const sampledByIndex = new Map();

  for (let offset = 0; offset < totalFeatures; offset += BATCH_SIZE) {
    const batch = allFeatures.slice(offset, offset + BATCH_SIZE);
    const pointFeatures = batch.map((feature, localIndex) => {
      const center = getFeatureCenter(feature);
      if (!center) return null;
      return ee.Feature(ee.Geometry.Point(center), { __index: offset + localIndex });
    }).filter(Boolean);

    if (pointFeatures.length === 0) continue;

    const samples = buildLandcoverSamplingImage(lcSource).sampleRegions({
      collection: ee.FeatureCollection(pointFeatures),
      scale: 10,
      geometries: false,
    });
    const info = await getEeInfo(samples, 'Failed to sample landcover values at offset ' + offset);

    for (const sample of info.features || []) {
      const props = sample.properties || {};
      const index = Number(props.__index);
      const lc = props.Map ?? props.landcover ?? props.b1;
      if (Number.isInteger(index) && lc !== undefined && lc !== null) {
        sampledByIndex.set(index, Number(lc));
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures.map((feature, index) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        landcover: sampledByIndex.has(index) ? sampledByIndex.get(index) : null,
      },
    })),
  };
}

export function getBatchCount(featureCount) {
  return Math.ceil(featureCount / BATCH_SIZE);
}

export { BATCH_SIZE };
