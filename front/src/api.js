/**
 * @fileoverview 前端 API 客户端模块
 * 
 * 封装与后端服务器的所有 HTTP 通信，提供：
 * - 统一的错误处理
 * - API 端点抽象
 * 
 * @module api
 */

/**
 * 通用请求函数
 * 
 * 处理响应状态检查和错误解析
 * 
 * @function request
 * @param {string} path - API 路径（如 '/api/health'）
 * @returns {Promise<any>} 解析后的 JSON 数据
 * @throws {Error} 当响应状态非 2xx 或 JSON 解析失败时
 */
async function request(path) {
  const response = await fetch(path);

  // 检查 HTTP 状态码
  if (!response.ok) {
    // 尝试解析错误响应体
    const payload = await response.json().catch(() => ({}));
    // 构建错误消息
    throw new Error(payload.error || payload.detail || `Request failed: ${response.status}`);
  }

  // 解析并返回 JSON
  return response.json();
}

/**
 * 获取图层目录列表
 * 
 * @function fetchLayers
 * @returns {Promise<{layers: Array}>} 包含图层数组的响应对象
 * 
 * 响应示例：
 * {
 *   "layers": [
 *     { "id": "sentinel-rgb", "name": "Sentinel-2 RGB", ... },
 *     { "id": "ndvi", "name": "Sentinel-2 NDVI", ... }
 *   ]
 * }
 */
export function fetchLayers() {
  return request('/api/gee/layers');
}

/**
 * 根据 ID 获取单个图层详情
 * 
 * @function fetchLayer
 * @param {string} layerId - 图层 ID（如 'sentinel-rgb'）
 * @returns {Promise<Object>} 图层配置对象
 * 
 * 响应示例：
 * {
 *   "id": "sentinel-rgb",
 *   "name": "Sentinel-2 RGB",
 *   "url": "https://earthengine.googleapis.com/...",
 *   "center": [116.55, 40.1],
 *   "zoom": 8,
 *   ...
 * }
 */
export function fetchLayer(layerId) {
  return request(`/api/gee/layers/${layerId}`);
}

/**
 * 健康检查
 * 
 * @function fetchHealth
 * @returns {Promise<Object>} 服务状态信息
 * 
 * 响应示例：
 * {
 *   "ok": true,
 *   "service": "gee-openlayers-server",
 *   "gee": {
 *     "initialized": true,
 *     "projectId": "your-project-id"
 *   },
 *   "timestamp": "..."
 * }
 */
export function fetchHealth() {
  return request('/api/health');
}

/**
 * 获取 L0 级别 DEM 六角格数据
 * 
 * @function fetchL0DemGeojson
 * @returns {Promise<GeoJSON>} GeoJSON FeatureCollection
 * 
 * 响应示例：
 * {
 *   "type": "FeatureCollection",
 *   "features": [
 *     {
 *       "type": "Feature",
 *       "geometry": { "type": "Polygon", ... },
 *       "properties": { "dem": 1250 }
 *     },
 *     ...
 *   ]
 * }
 */
export function fetchL0DemGeojson() {
  return request('/api/gee/dem/l0');
}
