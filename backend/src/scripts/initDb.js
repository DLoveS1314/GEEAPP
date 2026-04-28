/**
 * @fileoverview Initializes the HexRemap PostgreSQL schema.
 *
 * This script intentionally only initializes tables inside the configured
 * database. Creating the physical database remains an explicit operator action
 * because it requires elevated PostgreSQL permissions and is environment
 * specific.
 */

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '..', 'db', 'schema.sql');

function printInitHelp(error) {
  if (error?.code === '3D000') {
    console.error('HexRemap database does not exist.');
    console.error('Create the physical PostgreSQL database first, then rerun npm run db:init.');
    console.error('Example: psql -U postgres -d postgres -c "CREATE DATABASE hexremap;"');
    console.error('If PostGIS is not installed, install/enable PostGIS before rerunning schema initialization.');
    return;
  }

  if (error?.code === '28P01') {
    console.error('PostgreSQL authentication failed. Check DATABASE_URL or PGUSER/PGPASSWORD in backend/.env.');
    return;
  }

  if (error?.code === '42883' || String(error?.message || '').toLowerCase().includes('postgis')) {
    console.error('PostGIS is not available in the configured PostgreSQL database.');
    console.error('Install PostGIS, then rerun npm run db:init.');
    return;
  }

  console.error(error);
}

try {
  const schema = await fs.readFile(schemaPath, 'utf8');
  await pool.query(schema);
  console.log('HexRemap database schema initialized.');
} catch (error) {
  printInitHelp(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
