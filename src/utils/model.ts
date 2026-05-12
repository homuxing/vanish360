import * as ort from 'onnxruntime-web/wasm'
import { ref } from 'vue'

// 模型加载状态
export const modelLoading = ref(false)
export const modelProgress = ref(0)
export const modelLoaded = ref(false)
export const modelError = ref<string | null>(null)

let session: ort.InferenceSession | null = null

// IndexedDB 缓存配置
const DB_NAME = 'vanish360-model-cache'
const DB_VERSION = 1
const STORE_NAME = 'models'
const MODEL_KEY = 'lama_fp32'

/**
 * 打开 IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 从 IndexedDB 读取缓存的模型
 */
async function getCachedModel(): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(MODEL_KEY)
        request.onsuccess = () => resolve(request.result ?? null)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

/**
 * 将模型存入 IndexedDB
 */
async function cacheModel(buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.put(buffer, MODEL_KEY)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  } catch {
    // 缓存失败不影响正常流程
  }
}

/**
 * 下载模型文件并显示进度
 */
async function downloadModel(url: string): Promise<ArrayBuffer> {
  console.log(`[downloadModel] 开始下载模型: ${url}`)
  const t0 = performance.now()

  const response = await fetch(url)
  if (!response.ok) throw new Error(`下载模型失败: ${response.status}`)

  const contentLength = response.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : 0
  console.log(`[downloadModel] 模型大小: ${total > 0 ? (total / 1024 / 1024).toFixed(2) + 'MB' : '未知'}`)

  const reader = response.body!.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total > 0) {
      modelProgress.value = Math.round((loaded / total) * 100)
    }
  }

  const buffer = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }

  console.log(`[downloadModel] 下载完成, 实际大小: ${(loaded / 1024 / 1024).toFixed(2)}MB, 耗时 ${(performance.now() - t0).toFixed(0)}ms`)
  return buffer.buffer
}

/**
 * 检查 IndexedDB 中是否已有模型缓存
 */
export async function isModelCached(): Promise<boolean> {
  try {
    const db = await openDB()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.count(MODEL_KEY)
        request.onsuccess = () => resolve(request.result > 0)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

export const DEFAULT_MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx'

/**
 * 加载 LaMa ONNX 模型
 */
export async function loadModel(modelUrl: string = DEFAULT_MODEL_URL): Promise<void> {
  if (session || modelLoading.value) return

  console.log('[loadModel] 开始加载模型')
  const t0 = performance.now()

  modelLoading.value = true
  modelProgress.value = 0
  modelError.value = null

  try {
    ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4
    ort.env.wasm.simd = true
    ort.env.wasm.proxy = true
    // 指定绝对路径，解决 proxy Worker 内 import.meta.url 解析问题
    ort.env.wasm.wasmPaths = '/wasm/'

    let modelBuffer = await getCachedModel()

    if (modelBuffer) {
      console.log(`[loadModel] 从 IndexedDB 缓存加载, 大小: ${(modelBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`)
      modelProgress.value = 100
    } else {
      console.log('[loadModel] 缓存未命中, 开始下载')
      modelBuffer = await downloadModel(modelUrl)
      await cacheModel(modelBuffer)
      console.log('[loadModel] 模型已缓存到 IndexedDB')
    }

    console.log('[loadModel] 创建 InferenceSession...')
    const tSession = performance.now()
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'basic',
    })
    console.log(`[loadModel] InferenceSession 创建完成, 耗时 ${(performance.now() - tSession).toFixed(0)}ms`)

    modelLoaded.value = true
    console.log(`[loadModel] 模型加载流程完成, 总耗时 ${(performance.now() - t0).toFixed(0)}ms`)
  } catch (err: any) {
    console.error('[loadModel] 模型加载失败:', err)
    modelError.value = err.message || '模型加载失败'
    throw err
  } finally {
    modelLoading.value = false
  }
}

/**
 * 获取当前模型 session
 */
export function getSession(): ort.InferenceSession | null {
  return session
}
