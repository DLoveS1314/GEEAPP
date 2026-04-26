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
        <label class="field" for="layerSelect">
          <span>示例图层</span>
          <select id="layerSelect" v-model="selectedLayerId" @change="loadLayer">
            <option v-for="layer in availableLayers" :key="layer.id" :value="layer.id">
              {{ layer.name }}
            </option>
          </select>
        </label>

        <button type="button" @click="reloadLayer">重新加载图层</button>
        <button type="button" @click="toggleRawData" :disabled="!demGeojson" :class="{ active: rawDataVisible }">
          {{ rawDataVisible ? '隐藏原始数据' : '显示原始数据' }}
        </button>
        <button type="button" @click="sampleDem" :disabled="!demGeojson">
          采样
        </button>
      </div>

      <div class="meta" v-if="currentLayer">
        <dt>名称</dt>
        <dd>{{ currentLayer.name || '-' }}</dd>
        <dt>数据集</dt>
        <dd>{{ currentLayer.dataset || '-' }}</dd>
        <dt>Project</dt>
        <dd>{{ currentLayer.projectId || '-' }}</dd>
        <dt>说明</dt>
        <dd>{{ currentLayer.description || '-' }}</dd>
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
import { ref, onMounted, watch } from 'vue'
import { fetchHealth, fetchL0DemGeojson, fetchLayer, fetchLayers } from './api.js'
import { useMap } from './useMap.js'
import LayerPanel from './components/LayerPanel.vue'
import DemSettings from './components/DemSettings.vue'

const mapRef = ref(null)
const selectedLayerId = ref('')
const availableLayers = ref([])
const currentLayer = ref(null)
const statusMessage = ref('正在初始化...')
const statusError = ref(false)
const demGeojson = ref(null)
const showDemSettings = ref(false)
const activeLayer = ref(null)
const mapLayers = ref([])
const rawDataVisible = ref(false)

const { initMap, setGeeLayer, setDemHexagons, addLayer, removeLayer, updateLayerVisibility, updateLayerDemStyle, setRawDataStyle } = useMap()

function setStatus(message, isError = false) {
  statusMessage.value = message
  statusError.value = isError
}

async function bootstrap() {
  try {
    const [{ layers }, health] = await Promise.all([fetchLayers(), fetchHealth()])
    
    availableLayers.value = layers
    selectedLayerId.value = layers[0]?.id || ''
    
    setStatus(`后端就绪，当前 GEE Project: ${health.gee.projectId}`)
    
    if (layers[0]) {
      await loadLayer()
    }
    
    demGeojson.value = await fetchL0DemGeojson()
    setDemHexagons(demGeojson.value)
    
    updateMapLayers()
  } catch (error) {
    setStatus(error.message, true)
  }
}

async function loadLayer() {
  if (!selectedLayerId.value) return
  
  setStatus('正在请求 Earth Engine 图层...')
  
  try {
    const layer = await fetchLayer(selectedLayerId.value)
    
    if (!layer.url) {
      throw new Error('Earth Engine did not return a tile URL.')
    }
    
    currentLayer.value = layer
    setGeeLayer(layer)
    setStatus(`图层已加载：${layer.name}`)
    
    updateMapLayers()
  } catch (error) {
    setStatus(error.message, true)
  }
}

async function reloadLayer() {
  await loadLayer()
}

function toggleRawData() {
  if (rawDataVisible.value) {
    setDemHexagons(demGeojson.value)
    rawDataVisible.value = false
    setStatus('已切换为 DEM 渲染模式')
  } else {
    setRawDataStyle()
    rawDataVisible.value = true
    setStatus('已显示原始数据')
  }
}

async function sampleDem() {
  try {
    setStatus('正在采样 DEM 数据...')
    const center = mapRef.value?.$map?.getView()?.getCenter()
    
    if (!center) {
      setStatus('无法获取地图中心点', true)
      return
    }
    
    const response = await fetch('/api/gee/dem/sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        center: center,
        projection: 'EPSG:3857'
      })
    })
    
    const result = await response.json()
    
    if (result.hexagons) {
      setDemHexagons(result.hexagons)
      setStatus(`DEM 采样完成，共 ${result.hexagons.features?.length || 0} 个六边形`)
    }
  } catch (error) {
    setStatus(`采样失败：${error.message}`, true)
  }
}

function updateMapLayers() {
  mapLayers.value = [
    {
      id: 'base',
      name: '底图',
      type: 'base',
      visible: true,
      hasDemSettings: false
    },
    {
      id: 'gee',
      name: currentLayer.value?.name || 'GEE 图层',
      type: 'gee',
      visible: true,
      hasDemSettings: false
    },
    {
      id: 'dem',
      name: 'DEM 六边形',
      type: 'dem',
      visible: true,
      hasDemSettings: true,
      demConfig: {
        colorRamp: 'default',
        minDem: 0,
        maxDem: 5000
      }
    }
  ]
}

function handleVisibilityChange(layerId, visible) {
  const layer = mapLayers.value.find(l => l.id === layerId)
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
  if (activeLayer.value) {
    activeLayer.value.demConfig = config
    updateLayerDemStyle(config)
    showDemSettings.value = false
  }
}

function handleExportLayer(layerId) {
  const layer = mapLayers.value.find(l => l.id === layerId)
  if (layer && layer.type === 'dem' && demGeojson.value) {
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
