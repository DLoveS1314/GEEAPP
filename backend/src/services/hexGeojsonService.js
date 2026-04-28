/**
 * @fileoverview GeoJSON normalization helpers for HexRemap datasets.
 *
 * This module is deliberately independent from Express and PostgreSQL so import
 * validation, edge derivation, and DB row-to-GeoJSON reconstruction can be
 * tested or reused without network and database side effects.
 */

function createError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function nullableInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPolygonRing(geometry) {
  if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates?.[0])) {
    return [];
  }

  const ring = geometry.coordinates[0]
    .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map((point) => [Number(point[0]), Number(point[1])]);

  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      ring.pop();
    }
  }

  return ring;
}

function getSignedArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function getGeometryBounds(geometry) {
  const ring = getPolygonRing(geometry);
  if (!ring.length) return null;

  return ring.reduce(
    (bounds, [lon, lat]) => [
      Math.min(bounds[0], lon),
      Math.min(bounds[1], lat),
      Math.max(bounds[2], lon),
      Math.max(bounds[3], lat),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
}

function boundsToPolygon(bounds) {
  if (!bounds) return null;
  const [minLon, minLat, maxLon, maxLat] = bounds;

  return {
    type: 'Polygon',
    coordinates: [[
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ]],
  };
}

function mergeBounds(current, next) {
  if (!next) return current;
  if (!current) return next;

  return [
    Math.min(current[0], next[0]),
    Math.min(current[1], next[1]),
    Math.max(current[2], next[2]),
    Math.max(current[3], next[3]),
  ];
}

function buildEdges(geometry) {
  const ring = getPolygonRing(geometry);
  if (ring.length !== 6) return Array(6).fill(null);

  // The edge contract requires north-first and counter-clockwise ordering;
  // normalizing the ring avoids depending on source GeoJSON winding direction.
  const orderedRing = getSignedArea(ring) >= 0 ? ring : [...ring].reverse();
  const edges = orderedRing.map((start, index) => {
    const end = orderedRing[(index + 1) % orderedRing.length];
    return {
      start,
      end,
      midpoint: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
    };
  });

  const northIndex = edges.reduce((bestIndex, edge, index) => {
    const best = edges[bestIndex];
    if (edge.midpoint[1] > best.midpoint[1]) return index;
    if (edge.midpoint[1] === best.midpoint[1] && edge.midpoint[0] < best.midpoint[0]) return index;
    return bestIndex;
  }, 0);

  return edges.map((_edge, index) => edges[(northIndex + index) % edges.length]);
}

function getCenterFallback(geometry) {
  const bounds = getGeometryBounds(geometry);
  if (!bounds) return [null, null];
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

function normalizeFeature(feature, index) {
  if (!feature || feature.type !== 'Feature' || !feature.geometry) {
    throw createError(`GeoJSON feature at index ${index} is not a valid Feature.`);
  }
  if (feature.geometry.type !== 'Polygon') {
    throw createError(`GeoJSON feature at index ${index} must be a Polygon hexagon.`);
  }

  const properties = feature.properties || {};
  const [fallbackLon, fallbackLat] = getCenterFallback(feature.geometry);
  const centerLon = nullableNumber(properties.center_lon) ?? fallbackLon;
  const centerLat = nullableNumber(properties.center_lat) ?? fallbackLat;
  const edges = buildEdges(feature.geometry);

  return {
    level: nullableInteger(properties.level),
    col: nullableInteger(properties.col),
    row: nullableInteger(properties.row),
    centerLon,
    centerLat,
    dem: nullableNumber(properties.dem),
    landcover: nullableInteger(properties.landcover ?? properties.landconver),
    edges,
    geometry: feature.geometry,
    propertiesRaw: properties,
    bounds: getGeometryBounds(feature.geometry),
  };
}

export function prepareCellsFromGeojson(geojson) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw createError('GeoJSON must be a FeatureCollection.');
  }

  let bounds = null;
  const cells = geojson.features.map((feature, index) => {
    const cell = normalizeFeature(feature, index);
    bounds = mergeBounds(bounds, cell.bounds);
    return cell;
  });

  return {
    cells,
    bounds,
    boundsGeometry: boundsToPolygon(bounds),
  };
}

export function datasetRowToPayload(row) {
  if (!row) return null;

  const bounds = row.min_lon == null
    ? null
    : [Number(row.min_lon), Number(row.min_lat), Number(row.max_lon), Number(row.max_lat)];

  return {
    id: row.id,
    name: row.name,
    sourceFile: row.source_file,
    featureCount: Number(row.feature_count) || 0,
    bounds,
    visible: Boolean(row.visible),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToFeature(row, options = {}) {
  const properties = {
    ...(row.properties_raw || {}),
    level: row.level,
    col: row.col,
    row: row.row,
    center_lon: row.center_lon,
    center_lat: row.center_lat,
    dem: row.dem,
    landcover: row.landcover,
    'edge-1': row.edge_1,
    'edge-2': row.edge_2,
    'edge-3': row.edge_3,
    'edge-4': row.edge_4,
    'edge-5': row.edge_5,
    'edge-6': row.edge_6,
  };

  if (options.includeInternalId) {
    properties.__cell_id = row.id;
  }

  return {
    type: 'Feature',
    properties,
    geometry: row.geometry,
  };
}

export function rowsToFeatureCollection(rows, options = {}) {
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => rowToFeature(row, options)),
  };
}

export function parseBoundsParams(query) {
  const { minLon, minLat, maxLon, maxLat } = query || {};
  if ([minLon, minLat, maxLon, maxLat].some((value) => value === undefined || value === '')) {
    return null;
  }

  const bounds = [minLon, minLat, maxLon, maxLat].map(Number);
  if (!bounds.every(Number.isFinite) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
    throw createError('Bounds must be valid [minLon, minLat, maxLon, maxLat] values.');
  }

  return bounds;
}
