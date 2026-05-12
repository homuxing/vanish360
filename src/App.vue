<script setup lang="ts">
import { ref, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import ToolBar from './components/ToolBar.vue'
import UploadZone from './components/UploadZone.vue'
import PanoViewer from './components/PanoViewer.vue'
import DownloadModal from './components/DownloadModal.vue'
import ProcessingModal from './components/ProcessingModal.vue'
import ImageLoadingModal from './components/ImageLoadingModal.vue'
import { useEditorState } from './composables/useEditorState'
import { processInpainting } from './utils/inpainting'
import { loadModel, isModelCached, modelLoaded } from './utils/model'

const {
  hasImage,
  strokes,
  isProcessing,
  imageWidth,
  imageHeight,
  processedImageData,
  originalImage,
  imageLoading,
  imageLoadError,
  commitErase,
  getCurrentImageForProcessing,
} = useEditorState()

const showDownloadPrompt = ref(false)
const showDownloading = ref(false)
const showProcessingModal = ref(false)
const processingStatus = ref('')
const processingProgress = ref(0)

// 进入页面检测模型是否已缓存
onMounted(async () => {
  const cached = await isModelCached()
  if (!cached) {
    showDownloadPrompt.value = true
  } else {
    await loadModel()
  }
})

async function handleStartDownload(url: string) {
  showDownloadPrompt.value = false
  showDownloading.value = true
  try {
    await loadModel(url)
  } catch {
    // modelError 已设置
  } finally {
    showDownloading.value = false
  }
}

async function handleErase() {
  const source = getCurrentImageForProcessing()
  if (!source || strokes.value.length === 0) return
  if (!modelLoaded.value) return

  isProcessing.value = true
  showProcessingModal.value = true
  processingStatus.value = '正在进行 AI 消除...'
  processingProgress.value = 0

  try {
    await new Promise(resolve => setTimeout(resolve, 50))

    const result = await processInpainting(
      source,
      strokes.value,
      (current, total) => {
        processingProgress.value = Math.round((current / total) * 100)
        processingStatus.value = `AI 消除中 (${current}/${total})`
      }
    )
    commitErase(result)
  } catch (error: any) {
    console.error('消除处理失败:', error)
    alert('消除处理失败: ' + (error.message || '未知错误'))
  } finally {
    isProcessing.value = false
    showProcessingModal.value = false
  }
}

async function handleExport() {
  const width = imageWidth.value
  const height = imageHeight.value

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  if (processedImageData.value) {
    ctx.putImageData(processedImageData.value, 0, 0)
  } else if (originalImage.value) {
    ctx.drawImage(originalImage.value, 0, 0)
  } else {
    return
  }

  canvas.toBlob(
    (blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'vanish360_export.jpg'
      a.click()
      URL.revokeObjectURL(url)
    },
    'image/jpeg',
    1.0
  )
}
</script>

<template>
  <div class="h-screen w-screen flex flex-col overflow-hidden bg-white">
    <TopBar @export="handleExport" />
    <div class="flex flex-1 overflow-hidden">
      <ToolBar :model-loaded="modelLoaded" @erase="handleErase" />
      <UploadZone v-if="!hasImage" />
      <PanoViewer v-else />
    </div>

    <DownloadModal
      :show-prompt="showDownloadPrompt"
      :show-downloading="showDownloading"
      @download="handleStartDownload"
      @close="showDownloading = false"
    />

    <ProcessingModal
      :visible="showProcessingModal"
      :status="processingStatus"
      :progress="processingProgress"
    />

    <ImageLoadingModal
      :visible="imageLoading || !!imageLoadError"
      :error="imageLoadError"
    />
  </div>
</template>
