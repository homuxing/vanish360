import { ref, shallowRef, computed } from 'vue'

export type EditMode = 'view' | 'brush'

/** 单笔笔迹数据 */
export interface Stroke {
  /** UV 坐标点 [u, v, pressure] */
  points: [number, number, number][]
  /** 笔刷大小（像素） */
  size: number
}

const imageFile = shallowRef<File | null>(null)
const imageUrl = ref<string>('')
const imageWidth = ref(0)
const imageHeight = ref(0)
const originalImage = shallowRef<HTMLImageElement | ImageBitmap | null>(null)

const mode = ref<EditMode>('view')
const brushSize = ref(30)
const currentStroke = ref<Stroke | null>(null)

const isProcessing = ref(false)
const processedImageData = shallowRef<ImageData | null>(null)

/** 图片加载状态 */
const imageLoading = ref(false)
const imageLoadError = ref<string | null>(null)

/** 消除历史栈：每次成功消除后，将结果 push 到这里 */
const history = shallowRef<ImageData[]>([])
/** 当前指向 history 中的位置（-1 表示原图） */
const historyIndex = ref(-1)

const hasImage = computed(() => !!imageUrl.value)
const canUndo = computed(() => historyIndex.value >= 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

import ImageLoaderWorker from '../workers/imageLoader.worker.ts?worker'

export function useEditorState() {
  async function loadImage(file: File) {
    console.log(`[loadImage] 开始加载图片: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
    const t0 = performance.now()

    if (imageUrl.value) {
      URL.revokeObjectURL(imageUrl.value)
    }
    imageFile.value = file
    imageLoading.value = true
    imageLoadError.value = null

    try {
      const bitmap = await decodeImageInWorker(file)
      console.log(`[loadImage] Worker 解码完成: ${bitmap.width}x${bitmap.height}, 耗时 ${(performance.now() - t0).toFixed(0)}ms`)

      imageWidth.value = bitmap.width
      imageHeight.value = bitmap.height
      originalImage.value = bitmap
      // 重置编辑状态
      currentStroke.value = null
      processedImageData.value = null
      history.value = []
      historyIndex.value = -1
      mode.value = 'view'
      imageUrl.value = URL.createObjectURL(file)
      console.log(`[loadImage] 图片加载流程完成, 总耗时 ${(performance.now() - t0).toFixed(0)}ms`)
    } catch (err: any) {
      console.error(`[loadImage] 加载失败:`, err)
      imageLoadError.value = err.message || '图片加载失败'
    } finally {
      imageLoading.value = false
    }
  }

  /** 在 Worker 中解码图片，返回 ImageBitmap */
  function decodeImageInWorker(file: File): Promise<ImageBitmap> {
    return new Promise((resolve, reject) => {
      const worker = new ImageLoaderWorker()
      worker.onmessage = (e: MessageEvent) => {
        const { type, bitmap, message } = e.data
        if (type === 'success') {
          resolve(bitmap)
        } else {
          reject(new Error(message))
        }
        worker.terminate()
      }
      worker.onerror = () => {
        reject(new Error('Worker 执行异常'))
        worker.terminate()
      }
      worker.postMessage({ file })
    })
  }

  function setMode(newMode: EditMode) {
    mode.value = newMode
  }

  function setBrushSize(size: number) {
    brushSize.value = Math.max(5, Math.min(200, size))
  }

  function startStroke() {
    currentStroke.value = { points: [], size: brushSize.value }
  }

  function addPoint(u: number, v: number, pressure: number = 0.5) {
    if (currentStroke.value) {
      currentStroke.value.points.push([u, v, pressure])
    }
  }

  function endStroke(): Stroke | null {
    const stroke = currentStroke.value
    currentStroke.value = null
    if (!stroke || stroke.points.length === 0) {
      return null
    }
    return stroke
  }

  /** 撤销图片历史 */
  function undo() {
    if (historyIndex.value >= 0) {
      historyIndex.value--
      processedImageData.value = historyIndex.value >= 0
        ? history.value[historyIndex.value]
        : null
    }
  }

  /** 重做图片历史 */
  function redo() {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++
      processedImageData.value = history.value[historyIndex.value]
    }
  }

  function clearMask() {
    currentStroke.value = null
  }

  /** 消除成功后调用：将结果存入历史 */
  function commitErase(result: ImageData) {
    // 如果当前不在历史末尾（之前做过 undo），截断后面的历史
    const newHistory = history.value.slice(0, historyIndex.value + 1)
    newHistory.push(result)
    history.value = newHistory
    historyIndex.value = newHistory.length - 1
    processedImageData.value = result
    clearMask()
  }

  /**
   * 获取当前用于 inpainting 的源图像数据
   */
  function getCurrentImageForProcessing(): HTMLImageElement | ImageBitmap | ImageData | null {
    if (processedImageData.value) {
      return processedImageData.value
    }
    return originalImage.value
  }

  return {
    // State
    imageFile,
    imageUrl,
    imageWidth,
    imageHeight,
    originalImage,
    mode,
    brushSize,
    currentStroke,
    isProcessing,
    processedImageData,
    history,
    historyIndex,
    imageLoading,
    imageLoadError,
    // Computed
    hasImage,
    canUndo,
    canRedo,
    // Actions
    loadImage,
    setMode,
    setBrushSize,
    startStroke,
    addPoint,
    endStroke,
    undo,
    redo,
    clearMask,
    commitErase,
    getCurrentImageForProcessing,
  }
}
