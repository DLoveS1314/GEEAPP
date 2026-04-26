/**
 * @fileoverview OpenLayers 地图管理模块
 * 
 * 使用 Vue Composition API 封装地图操作，提供：
 * - 地图初始化和图层管理
 * - DEM 六角格渲染与样式切换
 * - 图层可见性控制
 * 
 * @module useMap
 */

import { ref } from 'vue'
import Map from 'ol/Map.js'
import View from 'ol/View.js'
import TileLayer from 'ol/layer/Tile.js'
import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import XYZ from 'ol/source/XYZ.js'
import GeoJSON from 'ol/format/GeoJSON.js'
import { fromLonLat, transformExtent } from 'ol/proj.js'
import { Fill, Stroke, Style, Text } from 'ol/style.js'

// ========== 模块级变量 ==========

/**
 * 地图实例
 * 
 * 整个应用只有一个地图实例
 */
let map = null

/**
 * Google Earth Engine 图层
 * 
 * 显示 Sentinel-2 RGB 或 NDVI 影像
 */
let geeLayer = null

/**
 * DEM 六角格矢量图层
 * 
 * 显示带高程值的六边形网格
 */
let demHexLayer = null

// ========== DEM 渲染样式 ==========

/**
 * 根据高程值计算渲染颜色
 * 
 * 支持多种颜色渐变方案和高程范围配置
 * 
 * @function getDemColor
 * @param {number} dem - 高程值（米）
 * @param {Object} config - 样式配置
 * @param {string} config.colorRamp - 颜色渐变方案 ('default' | 'terrain' | 'spectral')
 * @param {number} config.minDem - 最小高程值
 * @param {number} config.maxDem - 最大高程值
 * @param {boolean} config.smoothTransitions - 是否平滑过渡
 * @returns {string} RGBA 颜色字符串
 * 
 * 颜色方案说明：
 * - default: 蓝→浅蓝→黄→橙→红（低到高）
 * - terrain: 深绿→浅绿→棕→灰→白（地形色）
 * - spectral: 紫→蓝→青→绿→黄→红（光谱色）
 */
function getDemColor(dem, config = {}) {
  const {
    colorRamp = 'default',
    minDem = 0,
    maxDem = 5000,
    smoothTransitions = true
  } = config

  // 处理无效高程值
  if (!Number.isFinite(dem)) return 'rgba(120, 120, 120, 0.35)'

  // 定义颜色渐变方案（RGB 值数组）
  const colorRamps = {
    default: [
      [44, 123, 182],   // 深蓝色（低海拔）
      [171, 217, 233],  // 浅蓝色
      [255, 255, 191],  // 浅黄色
      [253, 174, 97],   // 橙色
      [215, 25, 28]     // 深红色（高海拔）
    ],
    terrain: [
      [0, 51, 0],       // 深绿色（植被）
      [34, 102, 34],    // 绿色
      [102, 153, 51],   // 浅绿色
      [153, 153, 102],  // 棕褐色
      [204, 153, 102],  // 棕色
      [153, 153, 153],  // 灰色（岩石）
      [255, 255, 255]   // 白色（雪线）
    ],
    spectral: [
      [153, 0, 153],    // 紫色
      [0, 0, 255],      // 蓝色
      [0, 255, 255],    // 青色
      [0, 255, 0],      // 绿色
      [255, 255, 0],    // 黄色
      [255, 0, 0]       // 红色
    ]
  }

  const colors = colorRamps[colorRamp] || colorRamps.default
  const range = maxDem - minDem
  
  // 边界值处理
  if (dem <= minDem) {
    const c = colors[0]
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.7)`
  }
  if (dem >= maxDem) {
    const c = colors[colors.length - 1]
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.7)`
  }

  // 线性插值计算颜色
  const normalizedDem = (dem - minDem) / range
  const segmentCount = colors.length - 1
  const segmentIndex = Math.min(
    Math.floor(normalizedDem * segmentCount),
    segmentCount - 1
  )
  const segmentT = (normalizedDem * segmentCount) - segmentIndex

  const c1 = colors[segmentIndex]
  const c2 = colors[segmentIndex + 1]

  // RGB 线性插值
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * segmentT)
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * segmentT)
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * segmentT)

  return `rgba(${r}, ${g}, ${b}, 0.7)`
}

/**
 * 创建 DEM 渲染样式函数
 * 
 * @function createDemStyle
 * @param {Object} config - 样式配置（传递给 getDemColor）
 * @returns {Function} OpenLayers 样式函数
 * 
 * 样式函数签名：
 * @param {Feature} feature - OpenLayers 要素
 * @returns {Style} 样式对象
 */
function createDemStyle(config = {}) {
  return function(feature) {
    const dem = Number(feature.get('dem'))

    return new Style({
      fill: new Fill({
        color: getDemColor(dem, config),
      }),
      stroke: new Stroke({
        color: 'rgba(34, 34, 34, 0.85)',  // 深灰色边框
        width: 1,
      }),
    })
  }
}

/**
 * 创建原始数据显示样式
 * 
 * 显示六边形轮廓和高程值标签
 * 
 * @returns {Function} OpenLayers 样式函数
 */
function createRawDataStyle() {
  return function(feature) {
    const dem = Number(feature.get('dem'))
    // 格式化高程标签（如 "1250m"）
    const label = Number.isFinite(dem) ? `${Math.round(dem)}m` : ''

    return new Style({
      fill: new Fill({
        color: 'rgba(59, 130, 246, 0.15)',  // 半透明蓝色
      }),
      stroke: new Stroke({
        color: 'rgba(59, 130, 246, 0.9)',  // 蓝色边框
        width: 1.5,
      }),
      text: new Text({
        text: label,
        font: '11px Inter, Segoe UI, sans-serif',
        fill: new Fill({
          color: 'rgba(255, 255, 255, 0.95)',  // 白色文字
        }),
        stroke: new Stroke({
          color: 'rgba(0, 0, 0, 0.8)',  // 黑色文字描边（提高对比度）
          width: 2,
        }),
      }),
    })
  }
}

function createRawHexagonStyle() {
  return new Style({
    fill: new Fill({
      color: 'rgba(34, 197, 94, 0.08)',
    }),
    stroke: new Stroke({
      color: 'rgba(34, 197, 94, 0.9)',
      width: 1.2,
    }),
  })
}

// ========== Vue Composable ==========

/**
 * OpenLayers 地图管理 Composable
 * 
 * @function useMap
 * @returns {Object} 地图操作方法集合
 */
export function useMap() {
  const mapRef = ref(null)

  /**
   * 初始化地图
   * 
   * 创建 GEE 图层和六角格矢量图层，不再加载 OSM 底图。
   * 
   * @function initMap
   * @param {HTMLElement} target - 地图容器元素
   */
  function initMap(target) {
    if (!target) return

    // 创建 GEE 影像图层（初始为空，等待加载）
    geeLayer = new TileLayer({
      opacity: 0.85,
      visible: true,
    })

    // 创建 DEM 六角格矢量图层
    demHexLayer = new VectorLayer({
      source: new VectorSource(),
      style: createDemStyle(),
      opacity: 0.9,
      visible: true,
    })

    // 创建地图实例
    map = new Map({
      target,
      layers: [geeLayer, demHexLayer],
      view: new View({
        center: fromLonLat([121.334757975, 25.09106329]),
        zoom: 11,
      }),
    })

    // 保存地图引用到容器（便于组件访问）
    target.$map = map
    mapRef.value = map
  }

  /**
   * 设置 GEE 图层
   * 
   * @function setGeeLayer
   * @param {Object} layerConfig - 图层配置对象
   * @param {string} layerConfig.url - XYZ 瓦片 URL 模板
   * @param {string} layerConfig.attribution - 归属信息
   * @param {Array} [layerConfig.center] - 中心点经纬度
   * @param {number} [layerConfig.zoom] - 缩放级别
   */
  function setGeeLayer(layerConfig) {
    if (!geeLayer || !map) return

    // 创建 XYZ 瓦片源
    geeLayer.setSource(
      new XYZ({
        url: layerConfig.url,
        crossOrigin: 'anonymous',  // 允许跨域加载
        attributions: layerConfig.attribution,
      })
    )

    geeLayer.setVisible(true)

    // 平滑移动到指定视图
    const center = layerConfig.center || [121.334757975, 25.09106329]
    const zoom = layerConfig.zoom || 11

    map.getView().animate({
      center: fromLonLat(center),
      zoom,
      duration: 400,  // 400ms 动画
    })
  }

  /**
   * 设置 DEM 六角格数据
   * 
   * @function setDemHexagons
   * @param {GeoJSON} geojson - GeoJSON FeatureCollection
   * @param {Object} [config={}] - 样式配置
   * @param {Object} [options={}] - fit=false 时保留当前视图
   */
  function setDemHexagons(geojson, config = {}, options = {}) {
    if (!demHexLayer || !map) return

    // 解析 GeoJSON 并转换为地图坐标
    const source = new VectorSource({
      features: new GeoJSON().readFeatures(geojson, {
        featureProjection: 'EPSG:3857',  // Web Mercator 投影
      }),
    })

    demHexLayer.setSource(source)
    demHexLayer.setStyle(createDemStyle(config))

    // 如果有数据，调整视图适应范围
    if (options.fit !== false && source.getFeatures().length > 0) {
      map.getView().fit(source.getExtent(), {
        padding: [60, 60, 60, 60],  // 四边留白
        duration: 500,
        maxZoom: 10,
      })
    }
  }

  function setRawHexagons(geojson, options = {}) {
    if (!demHexLayer || !map) return

    const source = new VectorSource({
      features: new GeoJSON().readFeatures(geojson, {
        featureProjection: 'EPSG:3857',
      }),
    })

    demHexLayer.setSource(source)
    demHexLayer.setStyle(createRawHexagonStyle())

    if (options.fit !== false && source.getFeatures().length > 0) {
      map.getView().fit(source.getExtent(), {
        padding: [60, 60, 60, 60],
        duration: 500,
        maxZoom: 12,
      })
    }
  }

  /**
   * 添加图层
   * 
   * @function addLayer
   * @param {Layer} layer - OpenLayers 图层对象
   */
  function addLayer(layer) {
    if (!map) return
    map.addLayer(layer)
  }

  /**
   * 移除图层
   * 
   * @function removeLayer
   * @param {Layer} layer - OpenLayers 图层对象
   */
  function removeLayer(layer) {
    if (!map) return
    map.removeLayer(layer)
  }

  /**
   * 更新图层可见性
   * 
   * @function updateLayerVisibility
   * @param {string} layerId - 图层 ID ('gee' | 'dem')
   * @param {boolean} visible - 是否可见
   */
  function updateLayerVisibility(layerId, visible) {
    if (!map) return

    if (layerId === 'gee' && geeLayer) {
      geeLayer.setVisible(visible)
    } else if (layerId === 'dem' && demHexLayer) {
      demHexLayer.setVisible(visible)
    }
  }

  /**
   * 更新 DEM 渲染样式
   * 
   * @function updateLayerDemStyle
   * @param {Object} config - 样式配置（颜色渐变、高程范围等）
   */
  function updateLayerDemStyle(config) {
    if (!demHexLayer) return
    demHexLayer.setStyle(createDemStyle(config))
  }

  /**
   * 切换到原始数据显示模式
   * 
   * 显示六边形轮廓和高程标签
   * 
   * @function setRawDataStyle
   */
  function setRawDataStyle() {
    if (!demHexLayer) return
    demHexLayer.setStyle(createRawDataStyle())
  }

  /**
   * 获取当前视图经纬度范围。
   *
   * OpenLayers 视图使用 EPSG:3857，后端 GeoJSON/GEE 过滤使用 EPSG:4326。
   */
  function getViewBounds() {
    if (!map) return null

    const size = map.getSize()
    if (!size) return null

    const extent = map.getView().calculateExtent(size)
    return transformExtent(extent, 'EPSG:3857', 'EPSG:4326')
  }

  // 导出所有公共方法
  return {
    mapRef,
    initMap,
    setGeeLayer,
    setDemHexagons,
    setRawHexagons,
    addLayer,
    removeLayer,
    updateLayerVisibility,
    updateLayerDemStyle,
    setRawDataStyle,
    getViewBounds
  }
}
