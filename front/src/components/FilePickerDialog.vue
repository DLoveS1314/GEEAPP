<template>
  <div class="file-picker-wrap">
    <button type="button" class="btn btn-full" @click="openDialog" :disabled="disabled">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
        <line x1="12" y1="22" x2="12" y2="15.5"/>
        <polyline points="22 8.5 12 15.5 2 8.5"/>
      </svg>
      {{ label }}
    </button>

    <div v-if="visible" class="modal-overlay" @click="closeDialog">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h2>{{ title }}</h2>
          <button class="close-btn" @click="closeDialog">&times;</button>
        </div>
        <div class="modal-body">
          <!-- Upload zone -->
          <div class="upload-zone">
            <label 
              class="drop-target" 
              :class="{ 'is-active': isDragOver, 'is-success': uploadSuccess }"
              @dragover.prevent="isDragOver = true"
              @dragleave.prevent="isDragOver = false"
              @drop.prevent="onDrop"
            >
              <template v-if="uploading">
                <span class="upload-status">上传中...</span>
                <span class="upload-spinner"></span>
              </template>
              <template v-else-if="uploadSuccess">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <span>{{ uploadFileName }}</span>
              </template>
              <template v-else>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>拖拽或点击上传 .geojson / .json</span>
              </template>
              <input type="file" accept=".geojson,.json" hidden ref="fileInput" @change="onFileChange" />
            </label>
            <button v-if="uploadSuccess" class="btn btn-full" @click="refreshAfterUpload" style="margin-top: 8px;">
              刷新文件列表
            </button>
          </div>

          <!-- File browser -->
          <div class="browser">
            <div class="browser-header">
              <span class="browser-path">{{ currentPath }}</span>
            </div>
            <div class="browser-items">
              <div
                v-for="(item, index) in fileItems"
                :key="index"
                class="browser-item"
                :class="{ selected: selectedIndex === index }"
                @click="selectItem(index)"
                @dblclick="activateItem(index)"
              >
                <span class="item-icon">
                  <svg v-if="item.isDirectory" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </span>
                <span class="item-name">{{ item.name }}</span>
              </div>
              <div v-if="fileItems.length === 0" class="browser-empty">
                文件夹为空
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <span class="selection-info">{{ selectedInfo }}</span>
          <div class="footer-actions">
            <button class="btn" @click="closeDialog">取消</button>
            <button class="btn btn-primary" @click="confirmSelection">选择</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

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

const dataRelativePath = ref('')
const currentRelPath = ref('')
const visible = ref(false)
const fileItems = ref([])
const selectedIndex = ref(-1)
const currentPath = ref('')

const fileInput = ref(null)
const isDragOver = ref(false)
const uploading = ref(false)
const uploadSuccess = ref(false)
const uploadFileName = ref('')

const selectedInfo = computed(() => {
  if (selectedIndex.value < 0) return '未选择文件'
  const item = fileItems.value[selectedIndex.value]
  return item.isDirectory ? `已选择文件夹: ${item.name}` : `已选择: ${item.name}`
})

onMounted(async () => {
  try {
    const response = await fetch('/api/fs/data-path')
    const data = await response.json()
    if (data.path) dataRelativePath.value = data.path
  } catch {
    dataRelativePath.value = 'data'
  }
})

async function openDialog() {
  if (!dataRelativePath.value) {
    try {
      const response = await fetch('/api/fs/data-path')
      const data = await response.json()
      dataRelativePath.value = data.path || 'data'
    } catch {
      dataRelativePath.value = 'data'
    }
  }
  currentRelPath.value = dataRelativePath.value
  selectedIndex.value = -1
  uploadSuccess.value = false
  uploadFileName.value = ''
  await loadDirectory(dataRelativePath.value)
  visible.value = true
}

function closeDialog() {
  visible.value = false
  selectedIndex.value = -1
  fileItems.value = []
  isDragOver.value = false
  uploading.value = false
}

async function loadDirectory(relPath) {
  try {
    const response = await fetch('/api/fs/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relPath })
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || '无法读取目录')
    }
    const data = await response.json()
    fileItems.value = (data.items || []).map((item, index) => ({ ...item, _index: index }))
    currentRelPath.value = relPath
    currentPath.value = data.path
  } catch {
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
    const newPath = currentRelPath.value.replace(/[\\/]+$/, '') + '/' + item.name
    selectedIndex.value = -1
    loadDirectory(newPath)
  }
}

function confirmSelection() {
  if (selectedIndex.value < 0) return
  const item = fileItems.value[selectedIndex.value]
  if (item.isDirectory) return
  const fullRelPath = currentRelPath.value.replace(/[\\/]+$/, '') + '/' + item.name
  emit('file-selected', fullRelPath)
  closeDialog()
}

function onDrop(e) {
  isDragOver.value = false
  const files = e.dataTransfer.files
  if (files.length > 0) uploadFile(files[0])
}

function onFileChange(e) {
  const files = e.target.files
  if (files.length > 0) uploadFile(files[0])
  if (fileInput.value) fileInput.value.value = ''
}

async function uploadFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext !== 'geojson' && ext !== 'json') {
    alert('仅支持 .geojson 或 .json 文件')
    return
  }

  uploading.value = true
  uploadSuccess.value = false
  uploadFileName.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/fs/upload', { method: 'POST', body: formData })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || '上传失败')
    }
    const result = await response.json()
    uploadSuccess.value = true
    uploadFileName.value = result.fileName
  } catch (error) {
    alert(error.message)
  } finally {
    uploading.value = false
  }
}

async function refreshAfterUpload() {
  uploadSuccess.value = false
  uploadFileName.value = ''
  await loadDirectory(currentRelPath.value)
}
</script>

<style scoped>
.file-picker-wrap {
  width: 100%;
}

.upload-zone {
  margin-bottom: 16px;
}

.drop-target {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px 16px;
  border: 2px dashed var(--border-mid);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
  flex-wrap: wrap;
}

.drop-target:hover,
.drop-target.is-active {
  border-color: var(--accent-blue);
  background: rgba(75, 139, 255, 0.08);
  color: var(--text-secondary);
}

.drop-target.is-success {
  border-color: var(--accent-green);
  background: rgba(46, 213, 115, 0.06);
}

.upload-status {
  color: var(--text-secondary);
}

.upload-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-mid);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.browser {
  background: rgba(7, 11, 20, 0.4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.browser-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(7, 11, 20, 0.3);
}

.browser-path {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  word-break: break-all;
}

.browser-items {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.browser-items::-webkit-scrollbar {
  width: 4px;
}

.browser-items::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 2px;
}

.browser-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;
}

.browser-item:hover {
  background: rgba(75, 139, 255, 0.08);
}

.browser-item.selected {
  background: rgba(75, 139, 255, 0.15);
  border-left: 2px solid var(--accent-blue);
  padding-left: 12px;
}

.item-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.item-name {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-empty {
  text-align: center;
  padding: 32px 0;
  color: var(--text-muted);
  font-size: 13px;
}

.selection-info {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.footer-actions {
  display: flex;
  gap: 10px;
}
</style>