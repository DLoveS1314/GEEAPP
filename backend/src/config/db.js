/**
 * @fileoverview PostgreSQL connection pool for HexRemap persistence.
 *
 * The application never stores credentials in source code. Runtime connection
 * settings must come from DATABASE_URL or the standard PG* environment
 * variables supported by node-postgres.
 */

import pg from 'pg';

const { Pool } = pg;

function getSslConfig() {
  return process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined;
}

function getDatabaseUrlPassword() {
  if (!process.env.DATABASE_URL) return undefined;

  try {
    return new URL(process.env.DATABASE_URL).password;
  } catch {
    return undefined;
  }
}

function createPoolConfig() {
  const ssl = getSslConfig();
  const envPassword = process.env.PGPASSWORD;

  if (process.env.DATABASE_URL) {
    const urlPassword = getDatabaseUrlPassword();

    return {
      connectionString: process.env.DATABASE_URL,
      // node-postgres requires SCRAM passwords to be strings. If DATABASE_URL
      // omits the password, PGPASSWORD can still provide it explicitly.
      ...(urlPassword ? {} : envPassword !== undefined ? { password: String(envPassword) } : {}),
      ssl,
    };
  }

  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: envPassword !== undefined ? String(envPassword) : undefined,
    ssl,
  };
}

function createReadableDbError(error) {
  if (error?.code === '3D000') {
    const readable = new Error(
      'PostgreSQL database does not exist. Create the hexremap database first, then run npm run db:init in backend.'
    );
    readable.status = 500;
    readable.cause = error;
    return readable;
  }

  if (error?.code === '28P01') {
    const readable = new Error(
      'PostgreSQL authentication failed. Check DATABASE_URL or PGUSER/PGPASSWORD in backend/.env.'
    );
    readable.status = 500;
    readable.cause = error;
    return readable;
  }

  if (error?.code === '42P01') {
    const readable = new Error(
      'HexRemap database schema is not initialized. Run npm run db:init in backend after configuring DATABASE_URL.'
    );
    readable.status = 500;
    readable.cause = error;
    return readable;
  }

  if (error?.code === '42883' && String(error?.message || '').toLowerCase().includes('st_')) {
    const readable = new Error(
      'PostGIS functions are unavailable. Install/enable PostGIS for the configured database, then run npm run db:init.'
    );
    readable.status = 500;
    readable.cause = error;
    return readable;
  }

  if (String(error?.message || '').includes('client password must be a string')) {
    const readable = new Error(
      'PostgreSQL password is missing or invalid. Set DATABASE_URL with a password, or set PGPASSWORD as a string in backend/.env.'
    );
    readable.status = 500;
    readable.cause = error;
    return readable;
  }

  return error;
}

/**
 * Shared PostgreSQL pool. When DATABASE_URL is absent, pg falls back to PGHOST,
 * PGPORT, PGDATABASE, PGUSER, and PGPASSWORD, which keeps local development and
 * deployment configuration out of the repository.
 */
export const pool = new Pool(createPoolConfig());

export async function query(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (error) {
    throw createReadableDbError(error);
  }
}

/**
 * Runs a group of SQL operations inside a transaction and guarantees that the
 * client is released even when a route throws.
 */
export async function withTransaction(callback) {
  const client = await pool.connect().catch((error) => {
    throw createReadableDbError(error);
  });

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw createReadableDbError(error);
  } finally {
    client.release();
  }
}
