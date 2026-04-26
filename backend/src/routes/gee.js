/**
 * @fileoverview Google Earth Engine API 路由
 * 
 * 本文件定义与 GEE 相关的 HTTP 接口：
 * - GET /api/gee/layers - 获取图层目录
 * - GET /api/gee/layers/:id - 获取指定图层
 * - GET /api/gee/dem/l0 - 获取 DEM 六角格 GeoJSON
 * 
 * @module routes/gee
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { getLayerById, getLayerCatalog } from '../services/geeService.js';

// 获取当前文件所在目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');

// DEM 数据文件路径：backend/output/L0_dem.geojson
const l0DemPath = path.resolve(backendRoot, 'output', 'L0_dem.geojson');

/**
 * 创建 Express 路由器
 */
const router = Router();

/**
 * GET /api/gee/dem/l0
 * 
 * 返回 L0 级别的 DEM 六角格 GeoJSON 数据
 * 
 * 该数据由脚本预先生成，包含六角格网几何及对应的高程值
 * 
 * @route {GET} /dem/l0
 * @returns {GeoJSON} FeatureCollection 格式的 DEM 数据
 */
router.get('/dem/l0', async (_req, res, next) => {
  try {
    // 读取预先计算的 DEM GeoJSON 文件
    const raw = await fs.readFile(l0DemPath, 'utf8');
    
    // 设置响应类型为 GeoJSON
    res.type('application/geo+json').send(raw);
  } catch (error) {
    // 文件不存在错误
    if (error.code === 'ENOENT') {
      error.status = 404;
      error.message = 'DEM GeoJSON output was not found. Run npm run dem:l0 in backend first.';
    }

    // 传递给错误处理中间件
    next(error);
  }
});

/**
 * GET /api/gee/layers
 * 
 * 获取所有可用图层的目录列表
 * 
 * @route {GET} /layers
 * @returns {Object} 包含 layers 数组的响应对象
 */
router.get('/layers', async (_req, res, next) => {
  try {
    // 从 GEE 服务获取图层目录
    const layers = await getLayerCatalog();
    res.json({ layers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gee/layers/:layerId
 * 
 * 根据 ID 获取单个图层的完整配置
 * 
 * @route {GET} /layers/:layerId
 * @param {string} layerId - 图层 ID（如 sentinel-rgb, ndvi）
 * @returns {Object} 图层配置对象，包含 url、center、zoom 等
 */
router.get('/layers/:layerId', async (req, res, next) => {
  try {
    // 根据 ID 获取图层详情
    const layer = await getLayerById(req.params.layerId);
    res.json(layer);
  } catch (error) {
    next(error);
  }
});

export default router;
