<template>
  <div class="card">
    <p class="card-title">图层管理</p>
    
    <div class="layer-list">
      <div 
        v-for="layer in layers" 
        :key="layer.id" 
        class="layer-item"
        :class="{ 'layer-hidden': !layer.visible }"
      >
        <div class="layer-row">
          <!-- Visibility toggle -->
          <button 
            class="vis-btn" 
            :class="{ active: layer.visible }"
            @click="$emit('visibility-change', layer.id, !layer.visible)"
            :title="layer.visible ? '隐藏图层' : '显示图层'"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="layer.visible" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle v-if="layer.visible" cx="12" cy="12" r="3"/>
              <path v-else d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>

          <span class="layer-name">{{ layer.name }}</span>

          <div class="layer-badges">
            <span class="badge" :class="'badge-' + layer.type">
              {{ getLayerTypeLabel(layer.type) }}
            </span>
          </div>

          <div class="layer-actions">
            <button 
              v-if="layer.canSampleDem"
              class="text-btn"
              @click="$emit('sample-dem', layer.id)"
              title="采样 DEM 并写入数据库"
            >DEM</button>
            <button 
              v-if="layer.canSampleLandcover"
              class="text-btn"
              @click="$emit('sample-landcover', layer.id)"
              title="采样地表覆盖并写入数据库"
            >LC</button>
            <button 
              v-if="layer.canRenderDem"
              class="text-btn"
              :class="{ active: layer.renderMode === 'dem' }"
              @click="$emit('render-layer', layer.id, 'dem')"
              title="按 DEM 属性渲染"
            >按DEM</button>
            <button 
              v-if="layer.canRenderLandcover"
              class="text-btn"
              :class="{ active: layer.renderMode === 'landcover' }"
              @click="$emit('render-layer', layer.id, 'landcover')"
              title="按地表覆盖属性渲染"
            >按LC</button>
            <button 
              v-if="layer.canRenderRaw"
              class="text-btn"
              :class="{ active: layer.renderMode === 'raw' }"
              @click="$emit('render-layer', layer.id, 'raw')"
              title="恢复原始六角格渲染"
            >原始</button>
            <button 
              v-if="layer.canZoom"
              class="icon-btn"
              @click="$emit('zoom-layer', layer.id)"
              title="定位到图层"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="7"/>
                <line x1="12" y1="3" x2="12" y2="6"/>
                <line x1="12" y1="18" x2="12" y2="21"/>
                <line x1="3" y1="12" x2="6" y2="12"/>
                <line x1="18" y1="12" x2="21" y2="12"/>
              </svg>
            </button>
            <button 
              v-if="layer.hasDemSettings"
              class="icon-btn"
              @click="$emit('dem-settings', layer)"
              title="DEM 渲染设置"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <button 
              v-if="layer.canExport"
              class="icon-btn"
              @click="$emit('export-layer', layer.id)"
              title="导出 GeoJSON"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button 
              v-if="layer.canDelete"
              class="icon-btn icon-btn-danger"
              @click="$emit('delete-layer', layer.id)"
              title="删除图层"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/>
                <path d="M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Color ramp preview for DEM layers -->
        <div v-if="layer.hasDemSettings && layer.demConfig" class="ramp-section">
          <div class="ramp-bar" :style="getGradientStyle(layer.demConfig)"></div>
          <div class="ramp-labels">
            <span>{{ formatElevation(layer.demConfig.minDem) }}</span>
            <span>{{ formatElevation(layer.demConfig.maxDem) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  layers: {
    type: Array,
    required: true
  }
})

defineEmits([
  'visibility-change',
  'dem-settings',
  'export-layer',
  'delete-layer',
  'zoom-layer',
  'sample-dem',
  'sample-landcover',
  'render-layer'
])

function getLayerTypeLabel(type) {
  const labels = {
    gee: 'GEE',
    dem: 'DEM',
    landcover: 'LC',
    hex: 'HEX',
  }
  return labels[type] || type?.toUpperCase() || 'LAYER'
}

function formatElevation(val) {
  if (val == null || !Number.isFinite(val)) return '—'
  return `${Math.round(val)}m`
}

function getGradientStyle(config) {
  const colors = getDemColorRamp(config.colorRamp)
  const stops = colors.map((color, i) => {
    const percent = (i / (colors.length - 1)) * 100
    return `${color} ${percent}%`
  })
  return {
    background: `linear-gradient(90deg, ${stops.join(', ')})`
  }
}

function getDemColorRamp(rampName = 'default') {
  const ramps = {
    default: [
      'rgba(44, 123, 182, 0.7)',
      'rgba(171, 217, 233, 0.7)',
      'rgba(255, 255, 191, 0.7)',
      'rgba(253, 174, 97, 0.7)',
      'rgba(215, 25, 28, 0.7)'
    ],
    terrain: [
      'rgba(0, 51, 0, 0.8)',
      'rgba(34, 102, 34, 0.8)',
      'rgba(102, 153, 51, 0.8)',
      'rgba(153, 153, 102, 0.8)',
      'rgba(204, 153, 102, 0.8)',
      'rgba(153, 153, 153, 0.8)',
      'rgba(255, 255, 255, 0.8)'
    ],
    spectral: [
      'rgba(153, 0, 153, 0.7)',
      'rgba(0, 0, 255, 0.7)',
      'rgba(0, 255, 255, 0.7)',
      'rgba(0, 255, 0, 0.7)',
      'rgba(255, 255, 0, 0.7)',
      'rgba(255, 0, 0, 0.7)'
    ]
  }
  return ramps[rampName] || ramps.default
}
</script>

<style scoped>
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px;
  box-shadow: var(--shadow-card);
}

.card-title {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  margin: 0 0 12px;
  font-family: var(--font-mono);
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.layer-item {
  background: rgba(7, 11, 20, 0.4);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.layer-item:hover {
  border-color: var(--border-subtle);
  background: rgba(7, 11, 20, 0.55);
}

.layer-item.layer-hidden {
  opacity: 0.5;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.vis-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  padding: 0;
}

.vis-btn.active {
  background: rgba(45, 124, 246, 0.15);
  border-color: rgba(45, 124, 246, 0.3);
  color: var(--accent-blue);
}

.vis-btn:hover {
  border-color: var(--border-mid);
}

.layer-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layer-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.badge-gee {
  background: rgba(75, 139, 255, 0.15);
  color: var(--accent-blue);
}

.badge-dem {
  background: rgba(46, 213, 115, 0.15);
  color: var(--accent-green);
}

.badge-lc {
  background: rgba(245, 166, 35, 0.15);
  color: var(--accent-amber);
}

.badge-landcover {
  background: rgba(245, 166, 35, 0.15);
  color: var(--accent-amber);
}

.badge-hex {
  background: rgba(46, 213, 115, 0.15);
  color: var(--accent-green);
}

.layer-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.text-btn {
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(75, 139, 255, 0.08);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  padding: 0 7px;
  transition: all 0.15s;
}

.text-btn:hover,
.text-btn.active {
  background: rgba(75, 139, 255, 0.18);
  color: var(--accent-blue);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.icon-btn:hover {
  background: rgba(75, 139, 255, 0.12);
  color: var(--accent-blue);
}

.icon-btn-danger:hover {
  background: rgba(231, 76, 94, 0.12);
  color: var(--accent-red);
}

.ramp-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
}

.ramp-bar {
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
}

.ramp-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
  font-family: var(--font-mono);
}
</style>
