-- HexRemap PostgreSQL schema.
-- Run with: npm run db:init

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS hex_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_file text,
  feature_count integer NOT NULL DEFAULT 0,
  bounds geometry(Polygon, 4326),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS hex_cells (
  id bigserial PRIMARY KEY,
  dataset_id uuid NOT NULL REFERENCES hex_datasets(id) ON DELETE CASCADE,
  level integer,
  col integer,
  row integer,
  center_lon double precision,
  center_lat double precision,
  dem double precision,
  landcover integer,
  edge_1 jsonb,
  edge_2 jsonb,
  edge_3 jsonb,
  edge_4 jsonb,
  edge_5 jsonb,
  edge_6 jsonb,
  geometry geometry(Polygon, 4326) NOT NULL,
  properties_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hex_datasets_deleted_idx ON hex_datasets(deleted_at);
CREATE INDEX IF NOT EXISTS hex_cells_dataset_idx ON hex_cells(dataset_id);
CREATE UNIQUE INDEX IF NOT EXISTS hex_cells_dataset_grid_uidx ON hex_cells(dataset_id, level, col, row);
CREATE INDEX IF NOT EXISTS hex_cells_geometry_gix ON hex_cells USING gist(geometry);
CREATE INDEX IF NOT EXISTS hex_cells_center_idx ON hex_cells(center_lon, center_lat);
