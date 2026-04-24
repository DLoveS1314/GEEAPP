import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap } from 'global-agent';
import ee from '@google/earthengine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(serverRoot, '..');

const defaultCredentialsPath = path.resolve(workspaceRoot, 'gee-service-account.json');
const credentialsPath = path.resolve(
  serverRoot,
  process.env.GEE_CREDENTIALS_PATH || '../gee-service-account.json'
);

let initPromise = null;
let proxyConfigured = false;

function configureProxy() {
  if (proxyConfigured) return;

  const proxyUrl = process.env.GEE_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return;

  const url = new URL(proxyUrl);
  proxyConfigured = true;

  process.env.HTTPS_PROXY = proxyUrl;
  process.env.HTTP_PROXY = proxyUrl;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.GEE_PROXY_INSECURE === '1' ? '0' : '1';

  bootstrap({
    environmentVariableNamespace: '',
  });

  console.log(`[GEE] Proxy configured: ${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`);
}

function createError(message, status = 500, cause) {
  const error = new Error(message);
  error.status = status;
  error.cause = cause;
  return error;
}

async function loadCredentials() {
  const resolvedPath = process.env.GEE_CREDENTIALS_PATH
    ? credentialsPath
    : defaultCredentialsPath;

  try {
    const raw = await fs.readFile(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed.client_email || !parsed.private_key) {
      throw createError('Earth Engine credentials are missing required fields.', 500);
    }

    return {
      credentials: parsed,
      filePath: resolvedPath,
    };
  } catch (error) {
    console.error('[GEE] Failed to load credentials from', resolvedPath);
    if (error.code === 'ENOENT') {
      throw createError(
        `Earth Engine credentials file was not found at ${resolvedPath}.`,
        500,
        error
      );
    }

    if (error instanceof SyntaxError) {
      throw createError('Earth Engine credentials file is not valid JSON.', 500, error);
    }

    throw error;
  }
}

function initializeEarthEngine(credentials, projectId) {
  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      credentials,
      () => {
        if (typeof ee.data.setProject === 'function') {
          ee.data.setProject(projectId);
        }

        ee.initialize(
          null,
          null,
          () => resolve(),
          (error) => reject(createError('Earth Engine initialization failed.', 502, error)),
          null,
          projectId
        );
      },
      (error) => {
        const message = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
        console.error('[GEE] authenticateViaPrivateKey failed:', message);
        reject(createError(`Earth Engine authentication failed: ${message}`, 502, error));
      }
    );
  });
}

export async function ensureEarthEngineInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      configureProxy();
      const { credentials, filePath } = await loadCredentials();
      const projectId = process.env.GEE_PROJECT_ID || credentials.project_id;

      if (!projectId) {
        throw createError('GEE_PROJECT_ID is required to initialize Earth Engine.', 500);
      }

      await initializeEarthEngine(credentials, projectId);

      return {
        projectId,
        credentialsFile: filePath,
      };
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}
