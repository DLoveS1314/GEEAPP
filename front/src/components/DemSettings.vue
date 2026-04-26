<template>
  <div class="dem-settings">
    <div class="form-group">
      <label for="colorRamp">颜色渐变方案</label>
      <select id="colorRamp" v-model="settings.colorRamp">
        <option value="default">默认 (蓝 - 黄 - 红)</option>
        <option value="terrain">地形 (绿 - 棕 - 白)</option>
        <option value="spectral">光谱 (彩虹色)</option>
      </select>
      <div class="color-preview">
        <div class="preview-bar" :style="previewStyle"></div>
      </div>
    </div>

    <div class="form-group">
      <label for="minDem">最小高程 (米)</label>
      <input 
        id="minDem"
        type="number" 
        v-model.number="settings.minDem"
        @input="validateRange"
      />
    </div>

    <div class="form-group">
      <label for="maxDem">最大高程 (米)</label>
      <input 
        id="maxDem"
        type="number" 
        v-model.number="settings.maxDem"
        @input="validateRange"
      />
    </div>

    <div class="form-group">
      <label>
        <input type="checkbox" v-model="settings.showContours" />
        显示等高线
      </label>
    </div>

    <div class="form-group" v-if="settings.showContours">
      <label for="contourInterval">等高线间距 (米)</label>
      <input 
        id="contourInterval"
        type="number" 
        v-model.number="settings.contourInterval"
        min="1"
      />
    </div>

    <div class="form-group">
      <label>
        <input type="checkbox" v-model="settings.smoothTransitions" />
        平滑过渡
      </label>
    </div>

    <div class="actions">
      <button type="button" class="btn-cancel" @click="$emit('cancel')">取消</button>
      <button type="button" class="btn-save" @click="handleSave">保存</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  layer: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['save', 'cancel'])

const initialConfig = props.layer.demConfig || {
  colorRamp: 'default',
  minDem: 0,
  maxDem: 5000,
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
  emit('save', {
    ...settings.value
  })
}
</script>

<style scoped>
.dem-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  color: #8ba7e8;
}

.form-group input[type="number"],
.form-group select {
  background: rgba(9, 17, 31, 0.8);
  border: 1px solid rgba(160, 191, 255, 0.2);
  border-radius: 8px;
  padding: 10px 12px;
  color: #eff4ff;
  font-size: 14px;
}

.form-group input[type="checkbox"] {
  margin-right: 8px;
}

.form-group label:has(input[type="checkbox"]) {
  display: flex;
  align-items: center;
  color: #eff4ff;
  cursor: pointer;
}

.color-preview {
  margin-top: 8px;
}

.preview-bar {
  height: 30px;
  border-radius: 6px;
  border: 1px solid rgba(160, 191, 255, 0.2);
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  padding-top: 20px;
  border-top: 1px solid rgba(160, 191, 255, 0.14);
}

.actions button {
  flex: 1;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: rgba(139, 167, 232, 0.15);
  border: 1px solid rgba(139, 167, 232, 0.3);
  color: #8ba7e8;
}

.btn-cancel:hover {
  background: rgba(139, 167, 232, 0.25);
}

.btn-save {
  background: linear-gradient(135deg, #3b82f6, #22c55e);
  border: none;
  color: #03101d;
}

.btn-save:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
</style>
