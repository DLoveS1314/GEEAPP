<template>
  <div class="layer-panel">
    <h3>图层管理</h3>
    
    <div class="layer-list">
      <div 
        v-for="layer in layers" 
        :key="layer.id" 
        class="layer-item"
        :class="{ 'layer-hidden': !layer.visible }"
      >
        <div class="layer-header">
          <label class="visibility-toggle">
            <input 
              type="checkbox" 
              :checked="layer.visible"
              @change="$emit('visibility-change', layer.id, $event.target.checked)"
            />
            <span class="toggle-icon">{{ layer.visible ? '👁' : '👁‍🗨' }}</span>
          </label>
          
          <span class="layer-name">{{ layer.name }}</span>
          
          <div class="layer-actions">
            <button 
              v-if="layer.hasDemSettings"
              class="action-btn"
              @click="$emit('dem-settings', layer)"
              title="DEM 渲染设置"
            >
              🎨
            </button>
            <button 
              v-if="layer.type === 'dem'"
              class="action-btn"
              @click="$emit('export-layer', layer.id)"
              title="导出"
            >
              📥
            </button>
          </div>
        </div>
        
        <div v-if="layer.hasDemSettings && layer.demConfig" class="layer-preview">
          <div class="color-ramp-preview">
            <div 
              class="color-bar"
              :style="getGradientStyle(layer.demConfig)"
            ></div>
            <div class="ramp-labels">
              <span>{{ layer.demConfig.minDem }}m</span>
              <span>{{ layer.demConfig.maxDem }}m</span>
            </div>
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

defineEmits(['visibility-change', 'dem-settings', 'export-layer'])

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
      'rgba(44, 123, 182, 0.62)',
      'rgba(171, 217, 233, 0.62)',
      'rgba(255, 255, 191, 0.66)',
      'rgba(253, 174, 97, 0.68)',
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
.layer-panel {
  margin-top: 20px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(16, 28, 51, 0.82);
  border: 1px solid rgba(160, 191, 255, 0.14);
}

.layer-panel h3 {
  margin: 0 0 16px;
  font-size: 16px;
  color: #8ba7e8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.layer-item {
  background: rgba(9, 17, 31, 0.6);
  border-radius: 10px;
  padding: 12px;
  border: 1px solid rgba(160, 191, 255, 0.1);
  transition: all 0.2s ease;
}

.layer-item.layer-hidden {
  opacity: 0.6;
}

.layer-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.visibility-toggle {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.visibility-toggle input {
  display: none;
}

.toggle-icon {
  font-size: 18px;
  filter: grayscale(0.3);
}

.layer-name {
  flex: 1;
  font-size: 14px;
  color: #eff4ff;
}

.layer-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #8ba7e8;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(59, 130, 246, 0.35);
  color: #fff;
}

.layer-preview {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(160, 191, 255, 0.08);
}

.color-ramp-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-bar {
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(160, 191, 255, 0.15);
}

.ramp-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #8ba7e8;
}
</style>
