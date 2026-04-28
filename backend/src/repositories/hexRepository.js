/**
 * @fileoverview PostgreSQL repository for HexRemap datasets and cells.
 *
 * SQL is isolated here so route handlers can describe product behavior while
 * this module owns batching, PostGIS conversion, and transaction boundaries.
 */

import { query, withTransaction } from '../config/db.js';
import { datasetRowToPayload } from '../services/hexGeojsonService.js';

const INSERT_BATCH_SIZE = 250;

function createError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function toJsonParam(value) {
  return value == null ? null : JSON.stringify(value);
}

function datasetSelectSql(whereClause = '') {
  return `
    SELECT
      d.id,
      d.name,
      d.source_file,
      d.feature_count,
      d.visible,
      d.created_at,
      d.updated_at,
      ST_XMin(d.bounds::box3d) AS min_lon,
      ST_YMin(d.bounds::box3d) AS min_lat,
      ST_XMax(d.bounds::box3d) AS max_lon,
      ST_YMax(d.bounds::box3d) AS max_lat
    FROM hex_datasets d
    ${whereClause}
  `;
}

async function insertCells(client, datasetId, cells) {
  for (let offset = 0; offset < cells.length; offset += INSERT_BATCH_SIZE) {
    const batch = cells.slice(offset, offset + INSERT_BATCH_SIZE);
    const values = [];
    const placeholders = batch.map((cell, index) => {
      const base = index * 17;
      values.push(
        datasetId,
        cell.level,
        cell.col,
        cell.row,
        cell.centerLon,
        cell.centerLat,
        cell.dem,
        cell.landcover,
        toJsonParam(cell.edges[0]),
        toJsonParam(cell.edges[1]),
        toJsonParam(cell.edges[2]),
        toJsonParam(cell.edges[3]),
        toJsonParam(cell.edges[4]),
        toJsonParam(cell.edges[5]),
        JSON.stringify(cell.geometry),
        JSON.stringify(cell.propertiesRaw),
        new Date()
      );

      return `(
        $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4},
        $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8},
        $${base + 9}::jsonb, $${base + 10}::jsonb, $${base + 11}::jsonb,
        $${base + 12}::jsonb, $${base + 13}::jsonb, $${base + 14}::jsonb,
        ST_SetSRID(ST_GeomFromGeoJSON($${base + 15}), 4326),
        $${base + 16}::jsonb,
        $${base + 17}
      )`;
    });

    await client.query(
      `
        INSERT INTO hex_cells (
          dataset_id, level, col, row, center_lon, center_lat, dem, landcover,
          edge_1, edge_2, edge_3, edge_4, edge_5, edge_6,
          geometry, properties_raw, updated_at
        )
        VALUES ${placeholders.join(',')}
      `,
      values
    );
  }
}

export async function createDatasetWithCells({ name, sourceFile, cells, boundsGeometry }) {
  if (!name || typeof name !== 'string') {
    throw createError('Table name is required.', 400);
  }

  return withTransaction(async (client) => {
    const datasetResult = await client.query(
      `
        INSERT INTO hex_datasets (name, source_file, feature_count, bounds)
        VALUES ($1, $2, $3, CASE WHEN $4::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($4), 4326) END)
        RETURNING id
      `,
      [name.trim(), sourceFile || null, cells.length, boundsGeometry ? JSON.stringify(boundsGeometry) : null]
    );

    const datasetId = datasetResult.rows[0].id;
    await insertCells(client, datasetId, cells);

    const created = await client.query(
      `${datasetSelectSql('WHERE d.id = $1')}`,
      [datasetId]
    );

    return datasetRowToPayload(created.rows[0]);
  });
}

export async function listDatasets() {
  const result = await query(
    `${datasetSelectSql('WHERE d.deleted_at IS NULL')} ORDER BY d.created_at DESC`
  );
  return result.rows.map(datasetRowToPayload);
}

export async function getDataset(datasetId) {
  const result = await query(
    `${datasetSelectSql('WHERE d.id = $1 AND d.deleted_at IS NULL')}`,
    [datasetId]
  );
  return datasetRowToPayload(result.rows[0]);
}

export async function countDatasetCells(datasetId) {
  const result = await query(
    'SELECT count(*)::integer AS count FROM hex_cells WHERE dataset_id = $1',
    [datasetId]
  );
  return Number(result.rows[0]?.count || 0);
}

export async function getDatasetRows(datasetId, options = {}) {
  const params = [datasetId];
  const clauses = ['c.dataset_id = $1', 'd.deleted_at IS NULL'];

  if (options.bounds) {
    const [minLon, minLat, maxLon, maxLat] = options.bounds;
    params.push(minLon, minLat, maxLon, maxLat);
    clauses.push(`c.geometry && ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326)`);
    clauses.push(`ST_Intersects(c.geometry, ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326))`);
  }

  const limit = Math.min(Math.max(Number(options.limit) || 5000, 1), Number(options.maxLimit) || 50000);
  const offset = Math.max(Number(options.offset) || 0, 0);
  params.push(limit, offset);

  const result = await query(
    `
      SELECT
        c.id,
        c.dataset_id,
        c.level,
        c.col,
        c.row,
        c.center_lon,
        c.center_lat,
        c.dem,
        c.landcover,
        c.edge_1,
        c.edge_2,
        c.edge_3,
        c.edge_4,
        c.edge_5,
        c.edge_6,
        c.properties_raw,
        ST_AsGeoJSON(c.geometry)::json AS geometry
      FROM hex_cells c
      JOIN hex_datasets d ON d.id = c.dataset_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY c.id
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `,
    params
  );

  return result.rows;
}

export async function softDeleteDataset(datasetId) {
  const result = await query(
    `
      UPDATE hex_datasets
      SET deleted_at = now(), updated_at = now(), visible = false
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [datasetId]
  );

  return result.rowCount > 0;
}

export async function updateDatasetVisibility(datasetId, visible) {
  const result = await query(
    `
      UPDATE hex_datasets
      SET visible = $2, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `,
    [datasetId, Boolean(visible)]
  );

  return result.rowCount > 0;
}

async function updateSampleColumn(datasetId, values, columnName) {
  if (!values.length) return;

  await withTransaction(async (client) => {
    for (const item of values) {
      await client.query(
        `UPDATE hex_cells SET ${columnName} = $3, updated_at = now() WHERE dataset_id = $1 AND id = $2`,
        [datasetId, item.id, item.value]
      );
    }

    await client.query('UPDATE hex_datasets SET updated_at = now() WHERE id = $1', [datasetId]);
  });
}

export function updateDemValues(datasetId, values) {
  return updateSampleColumn(datasetId, values, 'dem');
}

export function updateLandcoverValues(datasetId, values) {
  return updateSampleColumn(datasetId, values, 'landcover');
}
