import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ee from '@google/earthengine';
import { ensureEarthEngineInitialized } from '../config/gee.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');

const inputPath = path.resolve(backendRoot, 'data', 'L0.geojson');
const outputDir = path.resolve(backendRoot, 'output');
const outputPath = path.resolve(outputDir, 'L0_dem.geojson');
const batchSize = Number(process.env.DEM_BATCH_SIZE || 1000);
const featureLimit = Number(process.env.DEM_LIMIT || 100);
const noDataValue = -9999;

function evaluate(serverObject) {
  return new Promise((resolve, reject) => {
    serverObject.evaluate((result, error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

function readCenter(feature, index) {
  const centerLon = Number(feature?.properties?.center_lon);
  const centerLat = Number(feature?.properties?.center_lat);

  if (!Number.isFinite(centerLon) || !Number.isFinite(centerLat)) {
    throw new Error(`Feature at index ${index} is missing valid center_lon/center_lat.`);
  }

  return { centerLon, centerLat };
}

function createPointCollection(features, startIndex) {
  const points = features.map((feature, offset) => {
    const inputIndex = startIndex + offset;
    const { centerLon, centerLat } = readCenter(feature, inputIndex);

    return ee.Feature(ee.Geometry.Point([centerLon, centerLat]), {
      input_index: inputIndex,
    });
  });

  return ee.FeatureCollection(points);
}

async function sampleDemBatch(demImage, features, startIndex) {
  const points = createPointCollection(features, startIndex);
  const samples = demImage.sampleRegions({
    collection: points,
    scale: 30,
    geometries: false,
  });

  const result = await evaluate(samples);
  const values = new Map();

  for (const sample of result.features || []) {
    const inputIndex = sample.properties.input_index;
    const elevation = sample.properties.elevation;
    values.set(inputIndex, elevation === noDataValue ? null : elevation);
  }

  return values;
}

async function main() {
  console.log(`[DEM] Reading ${inputPath}`);
  const raw = await fs.readFile(inputPath, 'utf8');
  const geojson = JSON.parse(raw);

  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Input file must be a GeoJSON FeatureCollection.');
  }

  geojson.features = geojson.features.slice(0, featureLimit);

  await ensureEarthEngineInitialized();

  const demImage = ee.Image('USGS/SRTMGL1_003')
    .select('elevation')
    .unmask(noDataValue);

  console.log(`[DEM] Sampling ${geojson.features.length} features with batch size ${batchSize}`);

  for (let start = 0; start < geojson.features.length; start += batchSize) {
    const end = Math.min(start + batchSize, geojson.features.length);
    const batch = geojson.features.slice(start, end);
    const values = await sampleDemBatch(demImage, batch, start);

    for (let index = start; index < end; index += 1) {
      geojson.features[index].properties = {
        ...geojson.features[index].properties,
        dem: values.has(index) ? values.get(index) : null,
      };
    }

    console.log(`[DEM] Processed ${end}/${geojson.features.length}`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(geojson)}\n`, 'utf8');

  console.log(`[DEM] Saved ${outputPath}`);
}

main().catch((error) => {
  console.error('[DEM] Failed:', error.message || error);
  if (error.stack) console.error(error.stack);
  process.exitCode = 1;
});
