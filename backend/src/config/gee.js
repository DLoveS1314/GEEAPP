/**
 * @fileoverview Google Earth Engine 配置和初始化模块
 * 
 * 本文件负责：
 * - 加载 GEE 服务账号凭证
 * - 配置代理服务器（如需要）
 * - 初始化 Earth Engine API
 * - 提供单例模式的初始化保证
 * 
 * @module config/gee
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap } from 'global-agent';
import ee from '@google/earthengine';

// 获取当前文件所在目录的路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(serverRoot, '..');

// ========== 凭证文件路径配置 ==========

/**
 * 默认的凭证文件路径
 * 
 * 位于项目根目录的 gee-service-account.json
 */
const defaultCredentialsPath = path.resolve(workspaceRoot, 'gee-service-account.json');

/**
 * 实际使用的凭证文件路径
 * 
 * 可通过环境变量 GEE_CREDENTIALS_PATH 自定义
 */
const credentialsPath = path.resolve(
  serverRoot,
  process.env.GEE_CREDENTIALS_PATH || '../gee-service-account.json'
);

// ========== 初始化状态管理 ==========

/**
 * Earth Engine 初始化 Promise 单例
 * 
 * 确保多次调用 initializeEarthEngine 时只执行一次初始化
 */
let initPromise = null;

/**
 * 代理配置标志
 * 
 * 防止重复配置代理
 */
let proxyConfigured = false;

// ========== 代理配置 ==========

/**
 * 配置 HTTP/HTTPS 代理
 * 
 * 当 GEE 代理环境变量存在时，设置 global-agent 以支持代理服务器
 * 
 * 支持的环境变量：
 * - GEE_PROXY: 自定义 GEE 代理地址
 * - HTTPS_PROXY / HTTP_PROXY: 标准代理地址
 * - GEE_PROXY_INSECURE: 设置为 '1' 时跳过 TLS 验证
 */
function configureProxy() {
  if (proxyConfigured) return;

  // 按优先级获取代理 URL
  const proxyUrl = process.env.GEE_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return;

  const url = new URL(proxyUrl);
  proxyConfigured = true;

  // 设置标准代理环境变量
  process.env.HTTPS_PROXY = proxyUrl;
  process.env.HTTP_PROXY = proxyUrl;
  
  // 根据配置决定是否跳过 TLS 证书验证
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.GEE_PROXY_INSECURE === '1' ? '0' : '1';

  // 引导 global-agent 接管 HTTP 请求
  bootstrap({
    environmentVariableNamespace: '',
  });

  console.log(`[GEE] Proxy configured: ${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`);
}

/**
 * 创建统一的错误对象
 * 
 * @function createError
 * @param {string} message - 错误消息
 * @param {number} status - HTTP 状态码
 * @param {Error} [cause] - 原始错误对象
 * @returns {Error} 带有 status 和 cause 属性的错误对象
 */
function createError(message, status = 500, cause) {
  const error = new Error(message);
  error.status = status;
  error.cause = cause;
  return error;
}

// ========== 凭证加载 ==========

/**
 * 从文件加载 GEE 服务账号凭证
 * 
 * @function loadCredentials
 * @returns {Promise<{credentials: Object, filePath: string}>} 凭证对象和文件路径
 * @throws {Error} 当文件不存在或 JSON 格式无效时抛出错误
 */
async function loadCredentials() {
  // 确定凭证文件路径
  const resolvedPath = process.env.GEE_CREDENTIALS_PATH
    ? credentialsPath
    : defaultCredentialsPath;

  try {
    // 读取并解析 JSON 凭证文件
    const raw = await fs.readFile(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw);

    // 验证必需字段是否存在
    if (!parsed.client_email || !parsed.private_key) {
      throw createError('Earth Engine credentials are missing required fields.', 500);
    }

    return {
      credentials: parsed,
      filePath: resolvedPath,
    };
  } catch (error) {
    console.error('[GEE] Failed to load credentials from', resolvedPath);
    
    // 文件不存在错误
    if (error.code === 'ENOENT') {
      throw createError(
        `Earth Engine credentials file was not found at ${resolvedPath}.`,
        500,
        error
      );
    }

    // JSON 解析错误
    if (error instanceof SyntaxError) {
      throw createError('Earth Engine credentials file is not valid JSON.', 500, error);
    }

    throw error;
  }
}

// ========== Earth Engine 初始化 ==========

/**
 * 使用私钥凭证初始化 Earth Engine
 * 
 * @function initializeEarthEngine
 * @param {Object} credentials - GEE 服务账号凭证对象
 * @param {string} projectId - GCP 项目 ID
 * @returns {Promise<void>} 初始化完成时解决的 Promise
 */
function initializeEarthEngine(credentials, projectId) {
  return new Promise((resolve, reject) => {
    // 通过私钥进行认证
    ee.data.authenticateViaPrivateKey(
      credentials,
      // 认证成功回调
      () => {
        // 设置 GCP 项目（如果 API 支持）
        if (typeof ee.data.setProject === 'function') {
          ee.data.setProject(projectId);
        }

        // 初始化 Earth Engine API
        ee.initialize(
          null,  // API 基础 URL（使用默认）
          null,  // 认证服务器 URL（使用默认）
          () => resolve(),  // 初始化成功回调
          (error) => reject(createError('Earth Engine initialization failed.', 502, error)),
          null,  // API 版本（使用默认）
          projectId
        );
      },
      // 认证失败回调
      (error) => {
        const message = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
        console.error('[GEE] authenticateViaPrivateKey failed:', message);
        reject(createError(`Earth Engine authentication failed: ${message}`, 502, error));
      }
    );
  });
}

/**
 * 确保 Earth Engine 已初始化（单例模式）
 * 
 * 多次调用此函数仅执行一次初始化，后续调用直接返回已缓存的结果
 * 
 * @function ensureEarthEngineInitialized
 * @returns {Promise<{projectId: string, credentialsFile: string}>} 初始化结果
 */
export async function ensureEarthEngineInitialized() {
  if (!initPromise) {
    // 首次调用，创建初始化 Promise
    initPromise = (async () => {
      // 配置代理（如果需要）
      configureProxy();
      
      // 加载凭证
      const { credentials, filePath } = await loadCredentials();
      
      // 获取项目 ID（环境变量优先于凭证文件）
      const projectId = process.env.GEE_PROJECT_ID || credentials.project_id;

      if (!projectId) {
        throw createError('GEE_PROJECT_ID is required to initialize Earth Engine.', 500);
      }

      // 执行初始化
      await initializeEarthEngine(credentials, projectId);

      return {
        projectId,
        credentialsFile: filePath,
      };
    })().catch((error) => {
      // 初始化失败时重置 Promise，允许重试
      initPromise = null;
      throw error;
    });
  }

  // 返回已存在的初始化 Promise
  return initPromise;
}
