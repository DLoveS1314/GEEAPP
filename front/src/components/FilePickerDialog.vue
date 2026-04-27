<template>
  <div class="file-picker-trigger">
    <button type="button" class="hexagon-btn" @click="openDialog" :disabled="disabled">
      <svg viewBox="0 0 100 100" class="hex-icon">
        <polygon points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5" fill="none" stroke="currentColor" stroke-width="4" />
        <text x="50" y="56" text-anchor="middle" fill="currentColor" font-size="14" font-weight="bold">+</text>
      </svg>
      <span class="btn-label">{{ label }}</span>
    </button>

    <div v-if="visible" class="modal-overlay" @click="closeDialog">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h2>{{ title }}</h2>
          <button class="close-btn" @click="closeDialog">&times;</button>
        </div>
        <div class="modal-body">
          <div class="file-list">
            <div class="file-list-header">
              <span class="current-path">{{ currentPath }}</span>
            </div>
            <div class="file-items">
              <div
                v-for="(item, index) in fileItems"
                :key="index"
                class="file-item"
                :class="{ selected: selectedIndex === index }"
                @click="selectItem(index)"
                @dblclick="activateItem(index)"
              >
                <span class="file-icon">{{ item.isDirectory ? '📁' : '📄' }}</span>
                <span class="file-name">{{ item.name }}</span>
              </div>
              <div v-if="fileItems.length === 0" class="file-empty">
                文件夹为空
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <span class="selected-info">{{ selectedInfo }}</span>
          <div class="footer-actions">
            <button type="button" class="btn-cancel" @click="closeDialog">取消</button>
            <button type="button" class="btn-save" @click="confirmSelection">选择</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  label: {
    type: String,
    default: '加载文件'
  },
  title: {
    type: String,
    default: '选择文件'
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['file-selected'])

const BASE_PATH = 'D:\\Code\\GEEAPP\\backend\\data'

const visible = ref(false)
const currentPath = ref(BASE_PATH)
const fileItems = ref([])
const selectedIndex = ref(-1)

const selectedInfo = computed(() => {
  if (selectedIndex.value < 0) return '未选择文件'
  const item = fileItems.value[selectedIndex.value]
  return item.isDirectory ? `已选择文件夹: ${item.name}` : `已选择: ${item.name}`
})

async function openDialog() {
  currentPath.value = BASE_PATH
  selectedIndex.value = -1
  await loadDirectory(BASE_PATH)
  visible.value = true
}

function closeDialog() {
  visible.value = false
  selectedIndex.value = -1
  fileItems.value = []
}

async function loadDirectory(dirPath) {
  try {
    const response = await fetch('/api/fs/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath })
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || '无法读取目录')
    }
    const data = await response.json()
    fileItems.value = (data.items || []).map((item, index) => ({
      ...item,
      _index: index
    }))
    currentPath.value = dirPath
  } catch (error) {
    fileItems.value = []
  }
}

function selectItem(index) {
  selectedIndex.value = index
}

function activateItem(index) {
  const item = fileItems.value[index]
  if (!item) return

  if (item.isDirectory) {
    const newPath = currentPath.value.replace(/\\+$/, '') + '\\' + item.name
    selectedIndex.value = -1
    loadDirectory(newPath)
  }
}

function confirmSelection() {
  if (selectedIndex.value < 0) return
  const item = fileItems.value[selectedIndex.value]
  if (item.isDirectory) return

  const fullPath = currentPath.value.replace(/\\+$/, '') + '\\' + item.name
  emit('file-selected', fullPath)
  closeDialog()
}
</script>

<style scoped>
.file-picker-trigger {
  width: 100%;
}

.hexagon-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(160, 191, 255, 0.2);
  background: linear-gradient(135deg, #3b82f6, #22c55e);
  color: #03101d;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.hexagon-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.hexagon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hex-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.btn-label {
  font-size: 14px;
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
  max-width: 700px;
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
  padding: 16px 24px;
  overflow-y: auto;
  flex: 1;
  min-height: 200px;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-top: 1px solid rgba(160, 191, 255, 0.14);
}

.selected-info {
  font-size: 13px;
  color: #8ba7e8;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.footer-actions button {
  padding: 10px 24px;
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

.file-list-header {
  margin-bottom: 12px;
}

.current-path {
  font-size: 12px;
  color: #8ba7e8;
  word-break: break-all;
}

.file-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.file-item:hover {
  background: rgba(59, 130, 246, 0.15);
}

.file-item.selected {
  background: rgba(59, 130, 246, 0.25);
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.file-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.file-name {
  font-size: 14px;
  color: #eff4ff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-empty {
  text-align: center;
  padding: 40px 0;
  color: #8ba7e8;
  font-size: 14px;
}
</style>