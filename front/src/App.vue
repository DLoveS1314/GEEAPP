<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-header">
        <p class="eyebrow">Google Earth Engine</p>
        <h1>Vue + OpenLayers</h1>
        <p class="summary">
          前端通过本地 Node.js 服务请求 Earth Engine 图层信息，再以 OpenLayers XYZ 图层方式加载。
        </p>
      </div>

      <div class="controls">
        <label class="field" for="datasourceSelect">
          <span>GEE 数据源</span>
          <select id="datasourceSelect" v-model="selectedDatasourceId" @change="loadLayer">
            <option v-for="source in availableDataSources" :key="source.id" :value="source.id">
              {{ source.name }}
            </option>
          </select>
        </label>

        <button type="button" @click="reloadLayer" :disabled="isBusy || !selectedDatasourceId">
          重新加载图层
        </button>
        <button type="button" @click="loadHexagons" :disabled="isBusy">
          加载六角格
        </button>
        <button type="button" @click="sampleDem(false)" :disabled="isBusy">
          采样 DEM
        </button>
        <button type="button" @click="sampleDem(true)" :disabled="isBusy">
          采样并保存
        </button>
        <button type="button" @click="toggleRawData" :disabled="!hexagonGeojson && !demGeojson" :class="{ active: rawDataVisible }">
          {{ rawDataVisible ? '显示 DEM 渲染' : '显示原始六角格' }}
        </button>
      </div>

      <div class="meta" v-if="currentDatasource || currentLayer">
        <dt>名称</dt>
        <dd>{{ currentDatasource?.name || currentLayer?.name || '-' }}</dd>
        <dt>类型</dt>
        <dd>{{ currentDatasource?.type || currentLayer?.datasourceType || '-' }}</dd>
        <dt>数据集</dt>
        <dd>{{ currentDatasource?.dataset || currentLayer?.dataset || '-' }}</dd>
        <dt>Project</dt>
        <dd>{{ currentLayer?.projectId || '-' }}</dd>
        <dt>说明</dt>
        <dd>{{ currentDatasource?.description || currentLayer?.description || '-' }}</dd>
      </div>

      <div class="status-panel">
        <strong>状态</strong>
        <p :class="{ error: statusError }">{{ statusMessage }}</p>
      </div>

      <LayerPanel 
        v-if="currentLayer"
        :layers="mapLayers"
        @visibility-change="handleVisibilityChange"
        @dem-settings="handleDemSettings"
        @export-layer="handleExportLayer"
      />
    </aside>

    <main class="map-wrap">
      <div ref="mapRef" id="map" aria-label="Map"></div>
    </main>

    <div v-if="showDemSettings" class="modal-overlay" @click="showDemSettings = false">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h2>DEM 渲染设置 - {{ activeLayer?.name }}</h2>
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

const mapRef = ref(null)
const selectedDatasourceId = ref('')
const availableDataSources = ref([])
const currentLayer = ref(null)
const statusMessage = ref('正在初始化...')
const statusError = ref(false)
const hexagonGeojson = ref(null)
const demGeojson = ref(null)
const showDemSettings = ref(false)
const activeLayer = ref(null)
const mapLayers = ref([])
const rawDataVisible = ref(false)
const isBusy = ref(false)
const demConfig = ref({
  colorRamp: 'default',
  minDem: 0,
  maxDem: 5000,
  showContours: false,
  contourInterval: 100,
  smoothTransitions: true
})

const {
  initMap,
  setGeeLayer,
  setDemHexagons,
  setRawHexagons,
  updateLayerVisibility,
  updateLayerDemStyle,
  setRawDataStyle,
  getViewBounds
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

async function loadHexagons() {
  isBusy.value = true
  setStatus('正在按当前视图加载 L4 六角格...')

  try {
    const bounds = requireViewBounds()
    const geojson = await fetchHexagonGeojson({ bounds, limit: 500 })
    hexagonGeojson.value = geojson
    demGeojson.value = null
    rawDataVisible.value = true
    setRawHexagons(geojson, { fit: false })
    setStatus(`已加载当前视图 L4 六角格 ${geojson.features?.length || 0} 个`)
    updateMapLayers()
  } catch (error) {
    setStatus(error.message, true)
  } finally {
    isBusy.value = false
  }
}

async function sampleDem(save = false) {
  isBusy.value = true
  setStatus(save ? '正在采样并保存 DEM 数据...' : '正在采样 DEM 数据...')

  try {
    const payload = hexagonGeojson.value
      ? { geojson: hexagonGeojson.value, save, datasourceId: 'dem-srtm', maxFeatures: 500 }
      : { bounds: requireViewBounds(), save, datasourceId: 'dem-srtm', limit: 500, maxFeatures: 500 }
    const result = await requestSampleDem(payload)

    demGeojson.value = result.hexagons
    rawDataVisible.value = false
    setDemHexagons(result.hexagons, demConfig.value, { fit: false })

    const savedMessage = result.savedPath ? `，已保存到 ${result.savedPath}` : ''
    setStatus(`DEM 采样完成，共 ${result.sampledCount || 0} 个六角格${savedMessage}`)
    updateMapLayers()
  } catch (error) {
    setStatus(`采样失败：${error.message}`, true)
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
      name: demGeojson.value ? 'DEM 采样六角格' : 'L4 六角格',
      type: 'dem',
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

<style scoped>
@import './style.css';

.sidebar {
  max-height: 100vh;
  overflow-y: auto;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.controls button {
  width: 100%;
}

.controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.controls button.active {
  background: linear-gradient(135deg, #22c55e, #3b82f6);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal {
  background: #0f1a30;
  border-radius: 16px;
  border: 1px solid rgba(160, 191, 255, 0.2);
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(160, 191, 255, 0.14);
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
}

.close-btn {
  background: transparent;
  border: none;
  color: #8ba7e8;
  font-size: 28px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #fff;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.modal-body pre {
  background: rgba(9, 17, 31, 0.8);
  padding: 16px;
  border-radius: 8px;
  overflow: auto;
  max-height: 60vh;
  font-size: 12px;
  color: #d7e4ff;
  border: 1px solid rgba(160, 191, 255, 0.14);
}
</style>
