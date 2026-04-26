/**
 * @fileoverview Google Earth Engine 服务层
 * 
 * 本文件提供 Earth Engine 核心业务逻辑：
 * - 构建 Sentinel-2 RGB 和 NDVI 图层
 * - 生成地图瓦片 URL
 * - 管理图层目录
 * 
 * @module services/geeService
 */

import ee from '@google/earthengine';
import { ensureEarthEngineInitialized } from '../config/gee.js';

// ========== 地理范围配置 ==========

/**
 * 北京地区的经纬度边界
 * 
 * 格式：[最小经度, 最小纬度, 最大经度, 最大纬度]
 */
const beijingBounds = [115.7, 39.4, 117.6, 40.8];

/**
 * 地图默认中心点
 * 
 * 经度 116.55, 纬度 40.1（北京中心区域）
 */
const defaultCenter = [116.55, 40.1];

// ========== 错误处理 ==========

/**
 * 创建带有 HTTP 状态码的错误对象
 * 
 * @function createError
 * @param {string} message - 错误消息
 * @param {number} status - HTTP 状态码
 * @param {Error} [cause] - 原始错误
 * @returns {Error} 包含 status 和 cause 属性的错误对象
 */
function createError(message, status = 500, cause) {
  const error = new Error(message);
  error.status = status;
  error.cause = cause;
  return error;
}

// ========== 地图瓦片处理 ==========

/**
 * 获取图像的马赛克（map）数据
 * 
 * 将 GEE 图像转换为可在 Web 地图中显示的瓦片图层
 * 
 * @function getMapData
 * @param {ee.Image} image - Earth Engine 图像对象
 * @param {Object} visualization - 可视化参数（波段、范围等）
 * @returns {Promise<Object>} 包含 mapid、token、urlFormat 等信息的对象
 */
function getMapData(image, visualization) {
  return new Promise((resolve, reject) => {
    // 异步调用 GEE API 生成地图
    image.getMap(visualization, (map, error) => {
      if (error) {
        reject(createError('Failed to generate Earth Engine map tiles.', 502, error));
        return;
      }

      resolve(map);
    });
  });
}

/**
 * 从 GEE map 对象构建瓦片 URL
 * 
 * 支持新旧两种 GEE API 格式：
 * - 新项目格式：projects/{projectId}/map/{mapid}
 * - 传统格式：/map/{mapid}/tiles/{z}/{x}/{y}
 * 
 * @function getTileUrl
 * @param {Object} map - GEE 返回的 map 对象
 * @param {string} projectId - GCP 项目 ID
 * @returns {string|null} 可用于 XYZ 图层的瓦片 URL 模板
 */
function getTileUrl(map, projectId) {
  // 优先使用 API 直接返回的 URL 格式
  if (map.urlFormat) return map.urlFormat;
  if (map.url_format) return map.url_format;
  if (map.tile_fetcher?.url_format) return map.tile_fetcher.url_format;

  // 如果没有预生成的 URL，则手动构建
  if (!map.mapid) return null;

  // 对 mapid 进行 URL 编码（处理包含斜杠的情况）
  const encodedMapId = String(map.mapid)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  
  // 构建 token 查询参数（如果有）
  const tokenQuery = map.token ? `?token=${encodeURIComponent(map.token)}` : '';

  // 根据 mapid 格式决定使用哪种 URL 模式
  if (String(map.mapid).startsWith('projects/')) {
    // 新版 GEE API 格式
    return `https://earthengine.googleapis.com/v1/${encodedMapId}/tiles/{z}/{x}/{y}${tokenQuery}`;
  }

  // 传统 GEE API 格式
  return `https://earthengine.googleapis.com/map/${encodedMapId}/{z}/{x}/{y}${tokenQuery}`;
}

/**
 * 构建图层响应数据
 * 
 * 将 GEE 图像转换为前端可用的图层配置对象
 * 
 * @function buildLayerPayload
 * @param {string} name - 图层名称
 * @param {Function} imageFactory - 生成 ee.Image 的工厂函数
 * @param {Object} visualization - 可视化参数
 * @param {Object} [metadata={}] - 额外元数据
 * @returns {Promise<Object>} 包含 url、center、zoom 等信息的图层配置
 */
async function buildLayerPayload(name, imageFactory, visualization, metadata = {}) {
  // 确保 GEE 已初始化并获取项目 ID
  const { projectId } = await ensureEarthEngineInitialized();
  
  // 生成图像对象
  const image = imageFactory();
  
  // 获取地图瓦片信息
  const map = await getMapData(image, visualization);
  
  // 构建瓦片 URL
  const url = getTileUrl(map, projectId);

  return {
    id: metadata.id,
    name,
    type: 'xyz',  // 图层类型：XYZ 瓦片
    url,
    mapId: map.mapid || null,
    token: map.token || '',
    projectId,
    attribution: 'Google Earth Engine',  // 归属信息
    visParams: visualization,  // 可视化参数
    center: metadata.center || defaultCenter,  // 默认中心点
    zoom: metadata.zoom || 8,  // 默认缩放级别
    bounds: metadata.bounds || beijingBounds,  // 地理边界
    description: metadata.description || '',
    dataset: metadata.dataset || '',
  };
}

// ========== 地理边界处理 ==========

/**
 * 创建北京区域的矩形几何对象
 * 
 * @function getBeijingArea
 * @returns {ee.Geometry.Rectangle} Earth Engine 矩形几何对象
 */
function getBeijingArea() {
  return ee.Geometry.Rectangle(beijingBounds);
}

// ========== 图像构建函数 ==========

/**
 * 构建 Sentinel-2 RGB 合成图像
 * 
 * 获取 2024 年 4 月至 10 月期间云量低于 10% 的影像，
 * 使用中值合成生成无云 RGB 图像
 * 
 * @function buildSentinelRgbImage
 * @returns {ee.Image} Sentinel-2 中值合成 RGB 图像
 */
function buildSentinelRgbImage() {
  const beijingArea = getBeijingArea();

  return ee
    .ImageCollection('COPERNICUS/S2_SR_HARMONIZED')  // Sentinel-2 地表反射率harmonized 产品
    .filterBounds(beijingArea)  // 过滤北京区域
    .filterDate('2024-04-01', '2024-10-31')  // 生长季
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))  // 云量 < 10%
    .median()  // 中值复合，去除云和异常值
    .clip(beijingArea);  // 裁剪到研究区
}

/**
 * 构建 NDVI（归一化差异植被指数）图像
 * 
 * 使用近红外波段 (B8) 和红光波段 (B4) 计算 NDVI
 * NDVI = (NIR - Red) / (NIR + Red)
 * 
 * @function buildNdviImage
 * @returns {ee.Image} NDVI 图像
 */
function buildNdviImage() {
  const beijingArea = getBeijingArea();
  
  // 获取 Sentinel-2 中值合成影像
  const image = ee
    .ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(beijingArea)
    .filterDate('2024-04-01', '2024-10-31')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .median()
    .clip(beijingArea);

  // 计算 NDVI
  return image.normalizedDifference(['B8', 'B4']).rename('NDVI');
}

// ========== 对外导出函数 ==========

/**
 * 获取图层目录
 * 
 * 返回所有可用图层的简要信息列表
 * 
 * @function getLayerCatalog
 * @returns {Promise<Array>} 图层信息数组
 */
export async function getLayerCatalog() {
  // 确保 GEE 已初始化
  await ensureEarthEngineInitialized();

  return [
    {
      id: 'sentinel-rgb',
      name: 'Sentinel-2 RGB',
      description: 'Beijing area composite from Sentinel-2 surface reflectance.',
      dataset: 'COPERNICUS/S2_SR_HARMONIZED',
    },
    {
      id: 'ndvi',
      name: 'Sentinel-2 NDVI',
      description: 'Beijing area NDVI derived from Sentinel-2 median composite.',
      dataset: 'COPERNICUS/S2_SR_HARMONIZED',
    },
  ];
}

/**
 * 根据 ID 获取图层详细信息
 * 
 * @function getLayerById
 * @param {string} layerId - 图层 ID
 * @returns {Promise<Object>} 完整的图层配置对象
 * @throws {Error} 当图层 ID 不存在时抛出 404 错误
 */
export async function getLayerById(layerId) {
  if (layerId === 'sentinel-rgb') {
    return buildLayerPayload(
      'Sentinel-2 RGB',
      buildSentinelRgbImage,
      { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.1 },  // RGB 波段及拉伸参数
      {
        id: 'sentinel-rgb',
        description: 'Sentinel-2 RGB median composite clipped to Beijing.',
        dataset: 'COPERNICUS/S2_SR_HARMONIZED',
      }
    );
  }

  if (layerId === 'ndvi') {
    return buildLayerPayload(
      'Sentinel-2 NDVI',
      buildNdviImage,
      { min: 0, max: 1, palette: ['#8b0000', '#f7fcf5', '#006d2c'] },  // NDVI 色带
      {
        id: 'ndvi',
        description: 'NDVI visualization derived from Sentinel-2 composite clipped to Beijing.',
        dataset: 'COPERNICUS/S2_SR_HARMONIZED',
      }
    );
  }

  throw createError(`Unknown layer: ${layerId}`, 404);
}
