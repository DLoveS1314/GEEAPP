/**
 * @fileoverview 健康检查 API 路由
 * 
 * 提供后端服务状态检查接口，用于：
 * - 前端确认后端服务是否可用
 * - 显示当前 GEE 项目信息
 * - 诊断 Earth Engine 初始化状态
 * 
 * @module routes/health
 */

import { Router } from 'express';
import { ensureEarthEngineInitialized } from '../config/gee.js';

/**
 * 创建 Express 路由器
 */
const router = Router();

/**
 * GET /api/health
 * 
 * 健康检查接口
 * 
 * 检查 Earth Engine 是否成功初始化，返回服务状态信息
 * 
 * @route {GET} /
 * @returns {Object} 包含服务状态、GEE 初始化状态、时间戳的响应对象
 * 
 * 成功响应示例：
 * {
 *   "ok": true,
 *   "service": "gee-openlayers-server",
 *   "gee": {
 *     "initialized": true,
 *     "projectId": "your-project-id"
 *   },
 *   "timestamp": "2026-04-26T10:00:00.000Z"
 * }
 * 
 * 失败响应示例：
 * {
 *   "ok": false,
 *   "service": "gee-openlayers-server",
 *   "gee": {
 *     "initialized": false
 *   },
 *   "error": "Error message",
 *   "timestamp": "2026-04-26T10:00:00.000Z"
 * }
 */
router.get('/', async (_req, res) => {
  try {
    // 尝试初始化/获取 GEE 状态
    const gee = await ensureEarthEngineInitialized();

    // 返回健康状态
    res.json({
      ok: true,
      service: 'gee-openlayers-server',
      gee: {
        initialized: true,
        projectId: gee.projectId,  // 返回当前使用的 GCP 项目 ID
      },
      timestamp: new Date().toISOString(),  // ISO 8601 格式时间戳
    });
  } catch (error) {
    // 如果初始化失败，返回错误状态
    res.status(error.status || 500).json({
      ok: false,
      service: 'gee-openlayers-server',
      gee: {
        initialized: false,
      },
      error: error.message,  // 错误描述
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
