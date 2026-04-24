import ee from '@google/earthengine';
import { ensureEarthEngineInitialized } from '../config/gee.js';

const beijingBounds = [115.7, 39.4, 117.6, 40.8];
const defaultCenter = [116.55, 40.1];

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

async function buildLayerPayload(name, imageFactory, visualization, metadata = {}) {
  const { projectId } = await ensureEarthEngineInitialized();
  const image = imageFactory();
  const map = await getMapData(image, visualization);

  return {
    id: metadata.id,
    name,
    type: 'xyz',
    url: map.urlFormat || null,
    mapId: map.mapid || null,
    token: map.token || '',
    projectId,
    attribution: 'Google Earth Engine',
    visParams: visualization,
    center: metadata.center || defaultCenter,
    zoom: metadata.zoom || 8,
    bounds: metadata.bounds || beijingBounds,
    description: metadata.description || '',
    dataset: metadata.dataset || '',
  };
}

function getBeijingArea() {
  return ee.Geometry.Rectangle(beijingBounds);
}

function buildSentinelRgbImage() {
  const beijingArea = getBeijingArea();

  return ee
    .ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(beijingArea)
    .filterDate('2024-04-01', '2024-10-31')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .median()
    .clip(beijingArea);
}

function buildNdviImage() {
  const beijingArea = getBeijingArea();
  const image = ee
    .ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(beijingArea)
    .filterDate('2024-04-01', '2024-10-31')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .median()
    .clip(beijingArea);

  return image.normalizedDifference(['B8', 'B4']).rename('NDVI');
}

export async function getLayerCatalog() {
  await ensureEarthEngineInitialized();

  return [
    {
      id: 'sentinel-rgb',
      name: 'Sentinel-2 RGB',
      description: 'Beijing area composite from Sentinel-2 surface reflectance.',
      dataset: 'COPERNICUS/S2_SR_HARMONIZED',
    },
    {
      id: 'ndvi',
      name: 'Sentinel-2 NDVI',
      description: 'Beijing area NDVI derived from Sentinel-2 median composite.',
      dataset: 'COPERNICUS/S2_SR_HARMONIZED',
    },
  ];
}

export async function getLayerById(layerId) {
  if (layerId === 'sentinel-rgb') {
    return buildLayerPayload(
      'Sentinel-2 RGB',
      buildSentinelRgbImage,
      { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.1 },
      {
        id: 'sentinel-rgb',
        description: 'Sentinel-2 RGB median composite clipped to Beijing.',
        dataset: 'COPERNICUS/S2_SR_HARMONIZED',
      }
    );
  }

  if (layerId === 'ndvi') {
    return buildLayerPayload(
      'Sentinel-2 NDVI',
      buildNdviImage,
      { min: 0, max: 1, palette: ['#8b0000', '#f7fcf5', '#006d2c'] },
      {
        id: 'ndvi',
        description: 'NDVI visualization derived from Sentinel-2 composite clipped to Beijing.',
        dataset: 'COPERNICUS/S2_SR_HARMONIZED',
      }
    );
  }

  throw createError(`Unknown layer: ${layerId}`, 404);
}
