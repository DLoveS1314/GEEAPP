<template>
  <div class="app-shell">
    <aside class="sidebar">
      <!-- Header -->
      <div class="sidebar-header">
        <p class="eyebrow">Google Earth Engine</p>
        <h1>HexGrid<br/>Explorer</h1>
        <p class="summary">
          六角格地理空间分析与可视化工作台
        </p>
      </div>

      <!-- Controls -->
      <div class="card">
        <p class="card-title">数据源</p>
        <div class="controls-grid">
          <div>
            <span class="field-label">GEE 图层</span>
            <select id="datasourceSelect" v-model="selectedDatasourceId" @change="loadLayer">
              <option v-for="source in availableDataSources" :key="source.id" :value="source.id">
                {{ source.name }}
              </option>
            </select>
          </div>
          <button class="btn btn-primary btn-full" @click="reloadLayer" :disabled="isBusy || !selectedDatasourceId">
            加载图层
          </button>
        </div>
      </div>

      <!-- Hexagon actions -->
      <div class="card">
        <p class="card-title">六角格操作</p>
        <div class="controls-grid">
          <div>
            <span class="field-label">数据库表名</span>
            <input
              v-model.trim="hexTableName"
              type="text"
              placeholder="例如 taoyuan_l4"
              :disabled="isBusy"
            />
          </div>
          <FilePickerDialog 
            label="导入六角格到数据库" 
            title="选择 GeoJSON 六角格文件"
            :disabled="isBusy || !hexTableName"
            @file-selected="handleFileSelected"
          />
        </div>
      </div>

      <!-- Layer panel -->
      <LayerPanel 
        v-if="mapLayers.length"
        :layers="mapLayers"
        @visibility-change="handleVisibilityChange"
        @dem-settings="handleDemSettings"
        @export-layer="handleExportLayer"
        @delete-layer="handleDeleteLayer"
        @zoom-layer="handleZoomLayer"
        @sample-dem="handleSampleDemLayer"
        @sample-landcover="handleSampleLandcoverLayer"
        @render-layer="handleRenderLayer"
      />

      <!-- Metadata -->
      <div v-if="currentDatasource || currentLayer" class="card">
        <p class="card-title">图层信息</p>
        <dl class="meta-grid">
          <dt>名称</dt>
          <dd>{{ currentDatasource?.name || currentLayer?.name || '-' }}</dd>
          <dt>类型</dt>
          <dd>{{ currentDatasource?.type || currentLayer?.datasourceType || '-' }}</dd>
          <dt>数据集</dt>
          <dd>{{ currentDatasource?.dataset || currentLayer?.dataset || '-' }}</dd>
          <dt v-if="currentLayer?.projectId">Project</dt>
          <dd v-if="currentLayer?.projectId">{{ currentLayer.projectId }}</dd>
          <dt>说明</dt>
          <dd>{{ currentDatasource?.description || currentLayer?.description || '-' }}</dd>
        </dl>
      </div>

      <!-- Status -->
      <div class="status-panel">
        <p class="card-title">状态</p>
        <p :class="{ error: statusError }">{{ statusMessage }}</p>
      </div>
    </aside>

    <main class="map-wrap">
      <div ref="mapRef" id="map" aria-label="Map"></div>
      <div class="coord-display">
        <span>LON {{ mouseCoord.lon }}</span>
        <span>LAT {{ mouseCoord.lat }}</span>
      </div>
    </main>

    <div v-if="showDemSettings" class="modal-overlay" @click="showDemSettings = false">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h2>DEM 渲染设置</h2>
          <button class="close-btn" @click="showDemSettings = false">&times;</button>
        </div>
        <DemSettings 
          :layer="activeLayer"
          @save="saveDemSettings"
          @cancel="showDemSettings = false"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  deleteHexDataset,
  fetchDataSources,
  fetchHexDatasetGeojson,
  fetchHexDatasets,
  fetchLayer,
  importHexDataset,
  sampleHexDatasetDemBatch,
  sampleHexDatasetLandcoverBatch,
  updateHexDatasetVisibility
} from './api.js'
import { useMap } from './useMap.js'
import LayerPanel from './components/LayerPanel.vue'
import DemSettings from './components/DemSettings.vue'
import FilePickerDialog from './components/FilePickerDialog.vue'

const mapRef = ref(null)
const selectedDatasourceId = ref('')
const availableDataSources = ref([])
const currentLayer = ref(null)
const statusMessage = ref('正在初始化...')
const statusError = ref(false)
const hexagonLayers = ref([])
const activeHexagonLayerId = ref(null)
const hexagonLayerSerial = ref(0)
const hexTableName = ref('')
const demGeojson = ref(null)
const landcoverGeojson = ref(null)
const showDemSettings = ref(false)
const activeLayer = ref(null)
const mapLayers = ref([])
const rawDataVisible = ref(false)
const isBusy = ref(false)
const geeLayerVisible = ref(true)
const analysisLayerVisible = ref(false)
const demConfig = ref({
  colorRamp: 'default',
  minDem: null,
  maxDem: null,
  showContours: false,
  contourInterval: 100,
  smoothTransitions: true
})

const {
  initMap,
  setGeeLayer,
  addRawHexagonLayer,
  clearAnalysisLayer,
  removeManagedLayer,
  zoomToLayer,
  updateLayerVisibility,
  updateManagedHexLayer,
  renderManagedHexLayer,
  updateLayerDemStyle,
  mouseCoord
} = useMap()

const currentDatasource = computed(() => {
  return availableDataSources.value.find((source) => source.id === selectedDatasourceId.value) || null
})

const activeHexagonLayer = computed(() => {
  const explicitLayer = hexagonLayers.value.find((layer) => layer.id === activeHexagonLayerId.value)
  return explicitLayer || null
})

function setStatus(message, isError = false) {
  statusMessage.value = message
  statusError.value = isError
}

function getFileName(filePath) {
  return filePath?.split(/[\\/]/).filter(Boolean).pop() || ''
}

function sanitizeDownloadName(name) {
  return name.replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'hexagons'
}

function makeDatasetLayer(dataset, options = {}) {
  return {
    id: `hex-${dataset.id}`,
    datasetId: dataset.id,
    name: `${dataset.name} (${dataset.featureCount})`,
    type: 'hex',
    visible: options.visible ?? false,
    geojson: options.geojson || null,
    featureCount: dataset.featureCount,
    bounds: dataset.bounds,
    colorIndex: options.colorIndex ?? hexagonLayerSerial.value++,
    renderMode: options.renderMode || 'raw',
    hasDem: options.hasDem || false,
    hasLandcover: options.hasLandcover || false,
  }
}

async function ensureHexLayerLoaded(layer, options = {}) {
  if (!layer?.datasetId) return layer?.geojson || null

  let geojson = layer.geojson
  if (!geojson) {
    const result = await fetchHexDatasetGeojson(layer.datasetId, { all: true, limit: 200000 })
    geojson = result.geojson
  }

  const visible = options.visible ?? layer.visible
  addRawHexagonLayer(layer.id, geojson, {
    fit: options.fit === true,
    colorIndex: layer.colorIndex,
    visible,
    renderMode: options.renderMode || layer.renderMode || 'raw',
    demConfig: demConfig.value,
  })

  hexagonLayers.value = hexagonLayers.value.map((item) => (
    item.id === layer.id ? { ...item, geojson, visible } : item
  ))

  return geojson
}

function mergeSampledFeatures(baseGeojson, sampledFeatures) {
  const sampledByKey = new Map()
  for (const feature of sampledFeatures) {
    const props = feature.properties || {}
    sampledByKey.set(`${props.level}:${props.col}:${props.row}`, props)
  }

  return {
    type: 'FeatureCollection',
    features: (baseGeojson?.features || []).map((feature) => {
      const props = feature.properties || {}
      const sampled = sampledByKey.get(`${props.level}:${props.col}:${props.row}`)
      return sampled
        ? { ...feature, properties: { ...props, ...sampled } }
        : feature
    })
  }
}

function updateHexLayerState(layerId, patch) {
  hexagonLayers.value = hexagonLayers.value.map((layer) => (
    layer.id === layerId ? { ...layer, ...patch } : layer
  ))
}

function setActiveHexLayer(layerId) {
  activeHexagonLayerId.value = layerId
  rawDataVisible.value = Boolean(layerId)
}

async function bootstrap() {
  try {
    const { dataSources } = await fetchDataSources()
    availableDataSources.value = dataSources
    selectedDatasourceId.value = dataSources.find((source) => source.id === 'dem-srtm')?.id || dataSources[0]?.id || ''
    await loadPersistedHexDatasets()

    updateMapLayers()

    if (selectedDatasourceId.value) {
      await loadLayer()
    } else {
      setStatus('未找到可用 GEE 数据源', true)
    }
  } catch (error) {
    setStatus(error.message, true)
  }
}

async function loadPersistedHexDatasets() {
  try {
    const { datasets } = await fetchHexDatasets()
    hexagonLayers.value = (datasets || []).map((dataset) => makeDatasetLayer(dataset, { visible: false }))
  } catch (error) {
    setStatus(`数据库图层列表读取失败：${error.message}`, true)
  }
}

async function loadLayer() {
  if (!selectedDatasourceId.value) return

  isBusy.value = true
  setStatus('正在请求 Earth Engine 图层...')

  try {
    const layer = await fetchLayer(selectedDatasourceId.value)

    if (!layer.url) {
      throw new Error('Earth Engine did not return a tile URL.')
    }

    currentLayer.value = layer
    geeLayerVisible.value = true
    setGeeLayer(layer)
    setStatus(`图层已加载：${layer.name}`)
    updateMapLayers()
  } catch (error) {
    setStatus(error.message, true)
  } finally {
    isBusy.value = false
  }
}

async function reloadLayer() {
  await loadLayer()
}

async function loadHexagons(filePath = null) {
  if (!filePath) {
    setStatus('请选择 GeoJSON 文件导入数据库', true)
    return
  }
  if (!hexTableName.value) {
    hexTableName.value = getFileName(filePath).replace(/\.[^.]+$/, '').replace(/[^a-z0-9_]+/gi, '_')
  }

  isBusy.value = true
  setStatus('正在导入六角格到 PostgreSQL 数据表...')

  try {
    const { dataset } = await importHexDataset({
      filePath,
      tableName: hexTableName.value
    })
    const { geojson } = await fetchHexDatasetGeojson(dataset.id, { all: true, limit: 200000 })

    demGeojson.value = null
    landcoverGeojson.value = null
    analysisLayerVisible.value = false
    rawDataVisible.value = true

    // 数据库 ID 是图层的稳定身份；刷新页面后仍可通过数据集列表恢复。
    const nextLayer = makeDatasetLayer(dataset, { visible: true, geojson })
    clearAnalysisLayer()
    hexagonLayers.value = [...hexagonLayers.value, nextLayer]
    setActiveHexLayer(nextLayer.id)
    addRawHexagonLayer(nextLayer.id, geojson, { fit: true, colorIndex: nextLayer.colorIndex })
    setStatus(`已导入数据库并添加图层：${nextLayer.name}`)
    updateMapLayers()
  } catch (error) {
    setStatus(error.message, true)
  } finally {
    isBusy.value = false
  }
}

function handleFileSelected(filePath) {
  loadHexagons(filePath)
}

async function handleSampleDemLayer(layerId) {
  const targetLayer = hexagonLayers.value.find((layer) => layer.id === layerId)
  if (!targetLayer?.datasetId) {
    setStatus('请先导入数据库六角格图层', true)
    return
  }

  isBusy.value = true

  try {
    let geojson = await ensureHexLayerLoaded(targetLayer, { visible: true })
    let batchIndex = 0
    let totalBatches = 1
    const sampledFeatures = []

    setActiveHexLayer(layerId)
    setLayerVisibleState(layerId, true)

    while (batchIndex < totalBatches) {
      setStatus(`正在为 ${targetLayer.name} 采样 DEM 并写入数据库: ${batchIndex + 1}/${totalBatches}...`)
      const result = await sampleHexDatasetDemBatch(targetLayer.datasetId, {
        batchIndex,
        datasourceId: 'dem-srtm',
        scale: 30
      })

      totalBatches = result.totalBatches || 1
      sampledFeatures.push(...(result.features || []))
      geojson = mergeSampledFeatures(geojson, result.features || [])
      updateDemConfigFromFeatures(geojson.features)

      updateHexLayerState(layerId, {
        geojson,
        visible: true,
        hasDem: true,
        renderMode: 'dem'
      })
      updateManagedHexLayer(layerId, geojson, {
        renderMode: 'dem',
        demConfig: demConfig.value,
      })
      updateMapLayers()
      batchIndex += 1
    }

    setStatus(`DEM 采样已写入数据库，共 ${sampledFeatures.length} 个六角格`)
  } catch (error) {
    setStatus(`DEM 采样失败：${error.message}`, true)
  } finally {
    isBusy.value = false
  }
}

async function handleSampleLandcoverLayer(layerId) {
  const targetLayer = hexagonLayers.value.find((layer) => layer.id === layerId)
  if (!targetLayer?.datasetId) {
    setStatus('请先导入数据库六角格图层', true)
    return
  }

  isBusy.value = true

  try {
    let geojson = await ensureHexLayerLoaded(targetLayer, { visible: true })
    let batchIndex = 0
    let totalBatches = 1
    const sampledFeatures = []

    setActiveHexLayer(layerId)
    setLayerVisibleState(layerId, true)

    while (batchIndex < totalBatches) {
      setStatus(`正在为 ${targetLayer.name} 采样地表覆盖并写入数据库: ${batchIndex + 1}/${totalBatches}...`)
      const result = await sampleHexDatasetLandcoverBatch(targetLayer.datasetId, {
        batchIndex,
        datasourceId: 'landcover'
      })

      totalBatches = result.totalBatches || 1
      sampledFeatures.push(...(result.features || []))
      geojson = mergeSampledFeatures(geojson, result.features || [])

      updateHexLayerState(layerId, {
        geojson,
        visible: true,
        hasLandcover: true,
        renderMode: 'landcover'
      })
      updateManagedHexLayer(layerId, geojson, { renderMode: 'landcover' })
      updateMapLayers()
      batchIndex += 1
    }

    setStatus(`地表覆盖采样已写入数据库，共 ${sampledFeatures.length} 个六角格`)
  } catch (error) {
    setStatus(`地表覆盖采样失败：${error.message}`, true)
  } finally {
    isBusy.value = false
  }
}

function updateMapLayers() {
  const layers = [
    {
      id: 'gee',
      name: currentLayer.value?.name || currentDatasource.value?.name || 'GEE 图层',
      type: 'gee',
      visible: geeLayerVisible.value,
      hasDemSettings: false,
      canZoom: Boolean(currentLayer.value)
    }
  ]

  // 图层面板使用轻量元数据渲染，GeoJSON 原文仍保存在 hexagonLayers 中供导出使用。
  layers.push(...hexagonLayers.value.map((layer) => ({
    id: layer.id,
    datasetId: layer.datasetId,
    name: layer.name,
    type: 'hex',
    visible: layer.visible,
    featureCount: layer.featureCount,
    bounds: layer.bounds,
    renderMode: layer.renderMode,
    hasDemSettings: false,
    canSampleDem: true,
    canSampleLandcover: true,
    canRenderRaw: true,
    canRenderDem: true,
    canRenderLandcover: true,
    canExport: true,
    canDelete: true,
    canZoom: true
  })))

  mapLayers.value = layers
}

async function handleVisibilityChange(layerId, visible) {
  const layer = mapLayers.value.find((item) => item.id === layerId)
  if (layer) {
    const hexLayer = hexagonLayers.value.find((item) => item.id === layerId)
    if (visible && hexLayer) {
      await ensureHexLayerLoaded(hexLayer, { visible: true })
      setActiveHexLayer(layerId)
    }

    layer.visible = visible
    setLayerVisibleState(layerId, visible)
    updateLayerVisibility(layerId, visible)

    if (hexLayer?.datasetId) {
      updateHexDatasetVisibility(hexLayer.datasetId, visible).catch((error) => {
        setStatus(`图层可见性保存失败：${error.message}`, true)
      })
    }
  }
}

function setLayerVisibleState(layerId, visible) {
  if (layerId === 'gee') {
    geeLayerVisible.value = visible
  } else if (layerId === 'dem') {
    analysisLayerVisible.value = visible
  } else {
    hexagonLayers.value = hexagonLayers.value.map((layer) => (
      layer.id === layerId ? { ...layer, visible } : layer
    ))
  }
}

function handleDemSettings(layer) {
  activeLayer.value = layer
  showDemSettings.value = true
}

function saveDemSettings(config) {
  demConfig.value = config
  updateLayerDemStyle(config)
  updateMapLayers()
  showDemSettings.value = false
}

function updateDemConfigFromFeatures(features) {
  let min = Infinity
  let max = -Infinity
  for (const f of features) {
    const dem = Number(f.properties?.dem ?? f.get?.('dem'))
    if (Number.isFinite(dem)) {
      if (dem < min) min = dem
      if (dem > max) max = dem
    }
  }
  if (Number.isFinite(min)) {
    demConfig.value = { ...demConfig.value, minDem: min, maxDem: max }
  }
}

async function handleRenderLayer(layerId, renderMode) {
  const layer = hexagonLayers.value.find((item) => item.id === layerId)
  if (!layer) return

  try {
    const geojson = await ensureHexLayerLoaded(layer, {
      visible: true,
      renderMode,
    })

    if (renderMode === 'dem') {
      updateDemConfigFromFeatures(geojson.features || [])
    }

    const rendered = renderManagedHexLayer(layerId, renderMode, {
      demConfig: demConfig.value,
    })

    if (!rendered) {
      updateManagedHexLayer(layerId, geojson, {
        renderMode,
        demConfig: demConfig.value,
      })
    }

    setActiveHexLayer(layerId)
    updateHexLayerState(layerId, {
      geojson,
      visible: true,
      renderMode,
    })
    updateMapLayers()
    setStatus(`已按${renderMode === 'dem' ? ' DEM' : renderMode === 'landcover' ? '地表覆盖' : '原始属性'}渲染：${layer.name}`)
  } catch (error) {
    setStatus(`渲染失败：${error.message}`, true)
  }
}

async function handleExportLayer(layerId) {
  const layer = mapLayers.value.find((item) => item.id === layerId)
  const hexLayer = hexagonLayers.value.find((item) => item.id === layerId)
  let exportGeojson = layer?.type === 'landcover' ? landcoverGeojson.value : demGeojson.value

  if (hexLayer?.datasetId) {
    const result = await fetchHexDatasetGeojson(hexLayer.datasetId, { all: true, limit: 200000 })
    exportGeojson = result.geojson
  }

  if (!layer || !exportGeojson) {
    setStatus('当前图层没有可导出的 GeoJSON 数据', true)
    return
  }

  const blob = new Blob([JSON.stringify(exportGeojson, null, 2)], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeDownloadName(layer.name)}-${Date.now()}.geojson`
  a.click()
  URL.revokeObjectURL(url)
  setStatus(`图层已导出：${layer.name}`)
}

async function handleDeleteLayer(layerId) {
  const layer = hexagonLayers.value.find((item) => item.id === layerId)
  if (!layer) {
    setStatus('只能删除已加载的六角格图层', true)
    return
  }

  if (layer.datasetId) {
    await deleteHexDataset(layer.datasetId)
  }

  removeManagedLayer(layerId)
  hexagonLayers.value = hexagonLayers.value.filter((item) => item.id !== layerId)

  if (activeHexagonLayerId.value === layerId) {
    const fallbackLayer = hexagonLayers.value[hexagonLayers.value.length - 1]
    activeHexagonLayerId.value = fallbackLayer?.id || null
  }

  rawDataVisible.value = Boolean(activeHexagonLayerId.value)
  setStatus(`已从地图删除六角格图层：${layer.name}`)
  updateMapLayers()
}

async function handleZoomLayer(layerId) {
  const layer = mapLayers.value.find((item) => item.id === layerId)
  const hexLayer = hexagonLayers.value.find((item) => item.id === layerId)
  if (hexLayer) {
    await ensureHexLayerLoaded(hexLayer, { visible: hexLayer.visible })
    setActiveHexLayer(layerId)
  }

  if (!layer || !zoomToLayer(layerId)) {
    setStatus('当前图层没有可定位的范围', true)
    return
  }

  setStatus(`已定位到图层：${layer.name}`)
}

onMounted(() => {
  initMap(mapRef.value)
  bootstrap()
})
</script>

<style>
@import './style.css';
</style>
