<template>
  <div class="modal-body">
    <div class="settings-grid">
      <!-- Color ramp selector -->
      <div class="field">
        <span class="field-label">颜色渐变</span>
        <select id="colorRamp" v-model="settings.colorRamp">
          <option value="default">蓝 — 黄 — 红</option>
          <option value="terrain">地形 (绿 — 棕 — 白)</option>
          <option value="spectral">光谱 (彩虹)</option>
        </select>
        <div class="preview-bar" :style="previewStyle"></div>
      </div>

      <!-- Elevation range -->
      <div class="field-row">
        <div class="field">
          <span class="field-label">最小高程</span>
          <input 
            type="number" 
            v-model.number="settings.minDem"
            @input="validateRange"
          />
        </div>
        <div class="field">
          <span class="field-label">最大高程</span>
          <input 
            type="number" 
            v-model.number="settings.maxDem"
            @input="validateRange"
          />
        </div>
      </div>

      <!-- Contours -->
      <div class="field">
        <label class="checkbox-label">
          <input type="checkbox" v-model="settings.showContours" />
          <span class="checkbox-track">
            <span class="checkbox-thumb"></span>
          </span>
          显示等高线
        </label>
      </div>

      <div v-if="settings.showContours" class="field">
        <span class="field-label">等高线间距 (米)</span>
        <input 
          type="number" 
          v-model.number="settings.contourInterval"
          min="1"
        />
      </div>

      <!-- Smooth transitions -->
      <div class="field">
        <label class="checkbox-label">
          <input type="checkbox" v-model="settings.smoothTransitions" />
          <span class="checkbox-track">
            <span class="checkbox-thumb"></span>
          </span>
          平滑过渡
        </label>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-full" @click="$emit('cancel')">取消</button>
      <button class="btn btn-primary btn-full" @click="handleSave">保存</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  layer: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['save', 'cancel'])

const initialConfig = props.layer.demConfig || {
  colorRamp: 'default',
  minDem: null,
  maxDem: null,
  showContours: false,
  contourInterval: 100,
  smoothTransitions: true
}

const settings = ref({ ...initialConfig })

const colorRamps = {
  default: [
    'rgba(44, 123, 182, 1)',
    'rgba(171, 217, 233, 1)',
    'rgba(255, 255, 191, 1)',
    'rgba(253, 174, 97, 1)',
    'rgba(215, 25, 28, 1)'
  ],
  terrain: [
    'rgba(0, 51, 0, 1)',
    'rgba(34, 102, 34, 1)',
    'rgba(102, 153, 51, 1)',
    'rgba(153, 153, 102, 1)',
    'rgba(204, 153, 102, 1)',
    'rgba(153, 153, 153, 1)',
    'rgba(255, 255, 255, 1)'
  ],
  spectral: [
    'rgba(153, 0, 153, 1)',
    'rgba(0, 0, 255, 1)',
    'rgba(0, 255, 255, 1)',
    'rgba(0, 255, 0, 1)',
    'rgba(255, 255, 0, 1)',
    'rgba(255, 0, 0, 1)'
  ]
}

const previewStyle = computed(() => {
  const colors = colorRamps[settings.value.colorRamp]
  const stops = colors.map((color, i) => {
    const percent = (i / (colors.length - 1)) * 100
    return `${color} ${percent}%`
  })
  return {
    background: `linear-gradient(90deg, ${stops.join(', ')})`
  }
})

function validateRange() {
  if (settings.value.minDem >= settings.value.maxDem) {
    settings.value.maxDem = settings.value.minDem + 1
  }
}

function handleSave() {
  emit('save', { ...settings.value })
}
</script>

<style scoped>
.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.field select,
.field input[type="number"] {
  background: rgba(7, 11, 20, 0.6);
  border: 1px solid var(--border-mid);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 13px;
}

.field select:focus,
.field input:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(75, 139, 255, 0.15);
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.preview-bar {
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  margin-top: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  user-select: none;
}

.checkbox-label input {
  display: none;
}

.checkbox-track {
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}

.checkbox-label input:checked + .checkbox-track {
  background: var(--accent-blue);
}

.checkbox-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.checkbox-label input:checked + .checkbox-track .checkbox-thumb {
  transform: translateX(16px);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}
</style>