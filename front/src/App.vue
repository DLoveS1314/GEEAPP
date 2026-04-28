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
          <FilePickerDialog 
            label="加载六角格" 
            title="选择 GeoJSON 六角格文件"
            @file-selected="handleFileSelected"
          />
          <button class="btn btn-full" @click="sampleDem" :disabled="isBusy">
            采样 DEM
          </button>
          <button class="btn btn-full" @click="sampleLandcover" :disabled="isBusy || !hexagonGeojson">
            采样地表覆盖
          </button>
          <button 
            class="btn btn-full"
            :class="{ 'btn-accent': rawDataVisible }"
            @click="toggleRawData" 
            :disabled="!hexagonGeojson && !demGeojson"
          >
            {{ rawDataVisible ? '显示 DEM 渲染' : '显示原始六角格' }}
          </button>
        </div>
      </div>

      <!-- Layer panel -->
      <LayerPanel 
        v-if="currentLayer"
        :layers="mapLayers"
        @visibility-change="handleVisibilityChange"
        @dem-settings="handleDemSettings"
        @export-layer="handleExportLayer"
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
import { fetchDataSources, fetchHexagonGeojson, fetchLayer, sampleDem as requestSampleDem } from './api.js'
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
const hexagonGeojson = ref(null)
const demGeojson = ref(null)
const landcoverGeojson = ref(null)
const showDemSettings = ref(false)
const activeLayer = ref(null)
const mapLayers = ref([])
const rawDataVisible = ref(false)
const isBusy = ref(false)
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
  setDemHexagons,
  setRawHexagons,
  setLandcoverHexagons,
  updateLayerVisibility,
  updateLayerDemStyle,
  setRawDataStyle,
  getViewBounds,
  mouseCoord,
  selectedFeatureInfo
} = useMap()

const currentDatasource = computed(() => {
  return availableDataSources.value.find((source) => source.id === selectedDatasourceId.value) || null
})

function setStatus(message, isError = false) {
  statusMessage.value = message
  statusError.value = isError
}

function requireViewBounds() {
  const bounds = getViewBounds()
  if (!bounds) {
    throw new Error('无法获取当前地图视图范围')
  }
  return bounds
}

async function bootstrap() {
  try {
    const { dataSources } = await fetchDataSources()
    availableDataSources.value = dataSources
    selectedDatasourceId.value = dataSources.find((source) => source.id === 'dem-srtm')?.id || dataSources[0]?.id || ''

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
  isBusy.value = true
  setStatus(filePath ? '正在加载本地文件...' : '正在按当前视图加载 L4 六角格...')

  try {
    let geojson
    if (filePath) {
      const response = await fetch('/api/fs/read-geojson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || '读取文件失败')
      }
      geojson = await response.json()
    } else {
      const bounds = requireViewBounds()
      geojson = await fetchHexagonGeojson({ bounds, limit: 500 })
    }
    hexagonGeojson.value = geojson
    demGeojson.value = null
    landcoverGeojson.value = null
    rawDataVisible.value = true
    setRawHexagons(geojson, { fit: false })
    setStatus(`已加载六角格 ${geojson.features?.length || 0} 个`)
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

async function sampleDem() {
  isBusy.value = true
  const geojson = hexagonGeojson.value
  landcoverGeojson.value = null

  if (geojson?.features?.length > 500) {
    setStatus('正在批量采样 DEM（分批次）...')
    try {
      const totalFeatures = geojson.features.length
      const totalBatches = Math.ceil(totalFeatures / 500)
      const sampledFeatures = new Array(totalFeatures).fill(null)

      for (let i = 0; i < totalBatches; i++) {
        setStatus(`正在采样 DEM: 批次 ${i + 1}/${totalBatches}...`)
        const response = await fetch('/api/gee/dem/sample-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            geojson,
            batchIndex: i,
            datasourceId: 'dem-srtm',
            scale: 30
          })
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || `批次 ${i + 1} 采样失败`)
        }
        const result = await response.json()
        const offset = i * 500
        for (let j = 0; j < result.features.length; j++) {
          sampledFeatures[offset + j] = result.features[j]
        }

        const partialGeojson = {
          type: 'FeatureCollection',
          features: sampledFeatures.filter(Boolean)
        }
        demGeojson.value = partialGeojson
        rawDataVisible.value = false
        updateDemConfigFromFeatures(partialGeojson.features)
        setDemHexagons(partialGeojson, demConfig.value, { fit: false })
        updateMapLayers()
      }

      const allFiltered = sampledFeatures.filter(Boolean)
      setStatus(`DEM 采样完成，共 ${allFiltered.length} 个六角格`)
    } catch (error) {
      setStatus(`采样失败：${error.message}`, true)
    } finally {
      isBusy.value = false
    }
    return
  }

  setStatus('正在采样 DEM 数据...')

  try {
    const payload = geojson
      ? { geojson, save: false, datasourceId: 'dem-srtm', scale: 30 }
      : { bounds: requireViewBounds(), save: false, datasourceId: 'dem-srtm', limit: 500, scale: 30 }
    const result = await requestSampleDem(payload)

    demGeojson.value = result.hexagons
    rawDataVisible.value = false
    updateDemConfigFromFeatures(result.hexagons.features)
    setDemHexagons(result.hexagons, demConfig.value, { fit: false })

    setStatus(`DEM 采样完成，共 ${result.sampledCount || 0} 个六角格`)
    updateMapLayers()
  } catch (error) {
    setStatus(`采样失败：${error.message}`, true)
  } finally {
    isBusy.value = false
  }
}

async function sampleLandcover() {
  if (!hexagonGeojson.value) {
    setStatus('请先加载六角格', true)
    return
  }

  isBusy.value = true
  const geojson = hexagonGeojson.value
  const totalFeatures = geojson.features?.length || 0
  const totalBatches = Math.ceil(totalFeatures / 500)
  const sampledFeatures = new Array(totalFeatures).fill(null)

  try {
    for (let i = 0; i < totalBatches; i++) {
      setStatus(`正在采样地表覆盖: 批次 ${i + 1}/${totalBatches}...`)
      const response = await fetch('/api/gee/landcover/sample-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geojson,
          batchIndex: i,
          datasourceId: 'landcover'
        })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `批次 ${i + 1} 地表覆盖采样失败`)
      }

      const result = await response.json()
      const offset = i * 500
      for (let j = 0; j < result.features.length; j++) {
        sampledFeatures[offset + j] = result.features[j]
      }

      const partialGeojson = {
        type: 'FeatureCollection',
        features: sampledFeatures.filter(Boolean)
      }
      landcoverGeojson.value = partialGeojson
      demGeojson.value = null
      rawDataVisible.value = false
      setLandcoverHexagons(partialGeojson, { fit: false })
      updateMapLayers()
    }

    setStatus(`地表覆盖采样完成，共 ${sampledFeatures.filter(Boolean).length} 个六角格`)
  } catch (error) {
    setStatus(`地表覆盖采样失败：${error.message}`, true)
  } finally {
    isBusy.value = false
  }
}

function toggleRawData() {
  if (rawDataVisible.value && demGeojson.value) {
    setDemHexagons(demGeojson.value, demConfig.value, { fit: false })
    rawDataVisible.value = false
    setStatus('已切换为 DEM 渲染模式')
    return
  }

  if (hexagonGeojson.value) {
    setRawHexagons(hexagonGeojson.value, { fit: false })
    rawDataVisible.value = true
    setStatus('已显示原始 L4 六角格')
    return
  }

  if (demGeojson.value) {
    setRawDataStyle()
    rawDataVisible.value = true
    setStatus('已显示 DEM 采样标签')
  }
}

function updateMapLayers() {
  mapLayers.value = [
    {
      id: 'gee',
      name: currentLayer.value?.name || currentDatasource.value?.name || 'GEE 图层',
      type: 'gee',
      visible: true,
      hasDemSettings: false
    },
    {
      id: 'dem',
      name: landcoverGeojson.value ? '地表覆盖采样六角格' : (demGeojson.value ? 'DEM 采样六角格' : 'L4 六角格'),
      type: landcoverGeojson.value ? 'landcover' : 'dem',
      visible: true,
      hasDemSettings: Boolean(demGeojson.value),
      demConfig: demConfig.value
    }
  ]
}

function handleVisibilityChange(layerId, visible) {
  const layer = mapLayers.value.find((item) => item.id === layerId)
  if (layer) {
    layer.visible = visible
    updateLayerVisibility(layerId, visible)
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

function handleExportLayer(layerId) {
  const layer = mapLayers.value.find((item) => item.id === layerId)
  if (!layer || layer.type !== 'dem' || !demGeojson.value) {
    setStatus('当前没有可导出的 DEM 采样结果', true)
    return
  }

  const blob = new Blob([JSON.stringify(demGeojson.value, null, 2)], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dem-hexagons-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  setStatus('DEM 数据已导出')
}

onMounted(() => {
  initMap(mapRef.value)
  bootstrap()
})
</script>

<style>
@import './style.css';
</style>