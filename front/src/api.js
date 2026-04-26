/**
 * @fileoverview 前端 API 客户端模块
 *
 * 集中封装后端 HTTP 通信，保持统一的 JSON 序列化、错误解析和接口命名。
 *
 * @module api
 */

async function request(path, options = {}) {
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  }

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  const response = await fetch(path, fetchOptions)

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || payload.detail || `Request failed: ${response.status}`)
  }

  return response.json()
}

function toQuery(params = {}) {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value)
    }
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export function fetchDataSources() {
  return request('/api/gee/datasources')
}

export function fetchLayers() {
  return request('/api/gee/layers')
}

export function fetchLayer(layerId) {
  return request(`/api/gee/layers/${layerId}`)
}

export function fetchHealth() {
  return request('/api/health')
}

export function fetchL0DemGeojson() {
  return request('/api/gee/dem/l0')
}

/**
 * 按当前视图范围读取 L4 六角格子集。
 *
 * @param {Object} params - bounds 为 [minLon, minLat, maxLon, maxLat]
 * @returns {Promise<GeoJSON.FeatureCollection>}
 */
export function fetchHexagonGeojson({ bounds, limit = 500 }) {
  const [minLon, minLat, maxLon, maxLat] = bounds
  return request(`/api/gee/geojson/hexagons${toQuery({ minLon, minLat, maxLon, maxLat, limit })}`)
}

/**
 * 触发后端 DEM 中心点采样。
 *
 * @param {Object} payload - 支持 geojson、bounds、save、limit 等字段
 * @returns {Promise<{hexagons: Object, sampledCount: number, savedPath?: string}>}
 */
export function sampleDem(payload) {
  return request('/api/gee/dem/sample', {
    method: 'POST',
    body: payload
  })
}
