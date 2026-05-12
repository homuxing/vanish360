import * as ort from 'onnxruntime-web'
import { generateBinaryMask } from './mask'
import { getSession, loadModel } from './model'
import type { Stroke } from '../composables/useEditorState'

// 重新导出模型相关 API（保持向后兼容）
export { isModelCached, loadModel, modelLoading, modelProgress, modelLoaded, modelError, DEFAULT_MODEL_URL } from './model'

// LaMa 模型固定输入尺寸
const LAMA_SIZE = 512

/**
 * 将 Canvas 区域缩放到 LaMa 输入尺寸
 */
function resizeToLama(
  sourceCanvas: HTMLCanvasElement,
  sx: number, sy: number, sw: number, sh: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = LAMA_SIZE
  canvas.height = LAMA_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, LAMA_SIZE, LAMA_SIZE)
  return canvas
}

/**
 * 将 ImageData 转为 NCHW 格式 Float32 张量 [1, 3, H, W]
 * LaMa 模型输入范围为 [0, 1]
 */
function imageDataToTensor(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData
  const tensor = new Float32Array(3 * width * height)
  const channelSize = width * height

  for (let i = 0; i < channelSize; i++) {
    tensor[i] = data[i * 4] / 255.0
    tensor[channelSize + i] = data[i * 4 + 1] / 255.0
    tensor[2 * channelSize + i] = data[i * 4 + 2] / 255.0
  }
  return tensor
}

/**
 * 将蒙版 ImageData 转为 NCHW 格式 Float32 张量 [1, 1, H, W]
 * LaMa 模型期望 mask: 0.0=保留, 1.0=需填充
 */
function maskDataToTensor(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData
  const tensor = new Float32Array(width * height)

  for (let i = 0; i < width * height; i++) {
    tensor[i] = data[i * 4] > 128 ? 1.0 : 0.0
  }
  return tensor
}

/**
 * 将模型输出张量写回 ImageData
 * 此 LaMa ONNX 模型输出范围为 [0, 255]
 */
function tensorToImageData(tensor: Float32Array, width: number, height: number): ImageData {
  const imageData = new ImageData(width, height)
  const channelSize = width * height

  for (let i = 0; i < channelSize; i++) {
    imageData.data[i * 4] = Math.round(Math.max(0, Math.min(255, tensor[i])))
    imageData.data[i * 4 + 1] = Math.round(Math.max(0, Math.min(255, tensor[channelSize + i])))
    imageData.data[i * 4 + 2] = Math.round(Math.max(0, Math.min(255, tensor[2 * channelSize + i])))
    imageData.data[i * 4 + 3] = 255
  }
  return imageData
}

/**
 * 对蒙版区域执行 LaMa inpainting
 */
export async function processInpainting(
  source: HTMLImageElement | ImageBitmap | ImageData,
  strokes: Stroke[],
  onProgress?: (current: number, total: number) => void
): Promise<ImageData> {
  console.log(`[processInpainting] 开始处理, 笔迹数: ${strokes.length}`)
  const t0 = performance.now()

  let session = getSession()
  if (!session) {
    console.log('[processInpainting] 模型未就绪, 正在加载...')
    await loadModel()
    session = getSession()
  }
  if (!session) throw new Error('模型未加载')

  let width: number
  let height: number

  const srcCanvas = document.createElement('canvas')
  if (source instanceof ImageData) {
    width = source.width
    height = source.height
    srcCanvas.width = width
    srcCanvas.height = height
    const srcCtx = srcCanvas.getContext('2d')!
    srcCtx.putImageData(source, 0, 0)
  } else {
    // HTMLImageElement 或 ImageBitmap
    width = source instanceof HTMLImageElement ? source.naturalWidth : source.width
    height = source instanceof HTMLImageElement ? source.naturalHeight : source.height
    srcCanvas.width = width
    srcCanvas.height = height
    const srcCtx = srcCanvas.getContext('2d')!
    srcCtx.drawImage(source, 0, 0)
  }
  console.log(`[processInpainting] 源图尺寸: ${width}x${height}`)

  // 生成二值蒙版
  const maskImageData = generateBinaryMask(strokes, width, height)
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const maskCtx = maskCanvas.getContext('2d')!
  maskCtx.putImageData(maskImageData, 0, 0)

  // 创建结果 Canvas
  const resultCanvas = document.createElement('canvas')
  resultCanvas.width = width
  resultCanvas.height = height
  const resultCtx = resultCanvas.getContext('2d')!
  resultCtx.drawImage(srcCanvas, 0, 0)

  // 找到蒙版的边界框
  const bounds = getMaskBounds(maskImageData)
  if (!bounds) {
    console.log('[processInpainting] 未检测到蒙版区域, 跳过处理')
    return resultCtx.getImageData(0, 0, width, height)
  }
  console.log(`[processInpainting] 蒙版边界框: x=${bounds.x}, y=${bounds.y}, w=${bounds.w}, h=${bounds.h}`)

  // 扩展 bounds 加 padding
  const padding = 64
  const bx = Math.max(0, bounds.x - padding)
  const by = Math.max(0, bounds.y - padding)
  const bw = Math.min(width - bx, bounds.w + padding * 2)
  const bh = Math.min(height - by, bounds.h + padding * 2)

  // 计算 tile
  const tileSize = LAMA_SIZE
  const overlap = 64
  const stepSize = tileSize - overlap * 2

  const tilesX = Math.max(1, Math.ceil(bw / stepSize))
  const tilesY = Math.max(1, Math.ceil(bh / stepSize))
  const totalTiles = tilesX * tilesY
  console.log(`[processInpainting] 分块: ${tilesX}x${tilesY} = ${totalTiles} tiles`)

  let processed = 0
  let inferenceTime = 0

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      let tileX = bx + tx * stepSize
      let tileY = by + ty * stepSize

      if (tileX + tileSize > width) tileX = Math.max(0, width - tileSize)
      if (tileY + tileSize > height) tileY = Math.max(0, height - tileSize)

      const tileW = Math.min(tileSize, width - tileX)
      const tileH = Math.min(tileSize, height - tileY)

      if (!tileHasMask(maskImageData, tileX, tileY, tileW, tileH, width)) {
        processed++
        continue
      }

      const tileImageCanvas = resizeToLama(srcCanvas, tileX, tileY, tileW, tileH)
      const tileMaskCanvas = resizeToLama(maskCanvas, tileX, tileY, tileW, tileH)

      const tileImageData = tileImageCanvas.getContext('2d')!.getImageData(0, 0, LAMA_SIZE, LAMA_SIZE)
      const tileMaskData = tileMaskCanvas.getContext('2d')!.getImageData(0, 0, LAMA_SIZE, LAMA_SIZE)

      const imageTensor = imageDataToTensor(tileImageData)
      const maskTensor = maskDataToTensor(tileMaskData)

      const inputNames = session.inputNames
      const feeds: Record<string, ort.Tensor> = {}
      feeds[inputNames[0]] = new ort.Tensor('float32', imageTensor, [1, 3, LAMA_SIZE, LAMA_SIZE])
      feeds[inputNames[1]] = new ort.Tensor('float32', maskTensor, [1, 1, LAMA_SIZE, LAMA_SIZE])

      const tInfer = performance.now()
      const results = await session.run(feeds)
      inferenceTime += performance.now() - tInfer

      const outputKey = session.outputNames[0]
      const outputTensor = results[outputKey]
      const outputData = outputTensor.data as Float32Array

      const outputImageData = tensorToImageData(outputData, LAMA_SIZE, LAMA_SIZE)

      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = LAMA_SIZE
      outputCanvas.height = LAMA_SIZE
      outputCanvas.getContext('2d')!.putImageData(outputImageData, 0, 0)

      blendTileResult(resultCtx, outputCanvas, maskCanvas, tileX, tileY, tileW, tileH)

      processed++
      onProgress?.(processed, totalTiles)
    }
  }

  const totalTime = performance.now() - t0
  console.log(`[processInpainting] 处理完成, 总耗时 ${totalTime.toFixed(0)}ms, 推理耗时 ${inferenceTime.toFixed(0)}ms, 处理 ${processed}/${totalTiles} tiles`)

  return resultCtx.getImageData(0, 0, width, height)
}

/**
 * 获取蒙版的包围盒
 */
function getMaskBounds(maskData: ImageData): { x: number; y: number; w: number; h: number } | null {
  const { data, width, height } = maskData
  let minX = width, minY = height, maxX = 0, maxY = 0
  let found = false

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if (data[idx] > 128) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (!found) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * 检查 tile 区域是否包含蒙版
 */
function tileHasMask(
  maskData: ImageData,
  tx: number, ty: number, tw: number, th: number,
  fullWidth: number
): boolean {
  const { data } = maskData
  const endX = Math.min(tx + tw, maskData.width)
  const endY = Math.min(ty + th, maskData.height)

  for (let y = ty; y < endY; y += 4) {
    for (let x = tx; x < endX; x += 4) {
      const idx = (y * fullWidth + x) * 4
      if (data[idx] > 128) return true
    }
  }
  return false
}

/**
 * 将 tile 推理结果混合回原图（仅蒙版区域）
 */
function blendTileResult(
  resultCtx: CanvasRenderingContext2D,
  outputCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  tileX: number, tileY: number,
  tileW: number, tileH: number
) {
  const tileSize = outputCanvas.width
  const resultData = resultCtx.getImageData(tileX, tileY, tileW, tileH)

  const scaledCanvas = document.createElement('canvas')
  scaledCanvas.width = tileW
  scaledCanvas.height = tileH
  const scaledCtx = scaledCanvas.getContext('2d')!
  scaledCtx.drawImage(outputCanvas, 0, 0, tileSize, tileSize, 0, 0, tileW, tileH)
  const scaledData = scaledCtx.getImageData(0, 0, tileW, tileH)

  const maskCropCanvas = document.createElement('canvas')
  maskCropCanvas.width = tileW
  maskCropCanvas.height = tileH
  const maskCropCtx = maskCropCanvas.getContext('2d')!
  maskCropCtx.drawImage(maskCanvas, tileX, tileY, tileW, tileH, 0, 0, tileW, tileH)
  const maskCropData = maskCropCtx.getImageData(0, 0, tileW, tileH)

  for (let i = 0; i < resultData.data.length; i += 4) {
    const maskVal = maskCropData.data[i]
    if (maskVal > 10) {
      resultData.data[i] = scaledData.data[i]
      resultData.data[i + 1] = scaledData.data[i + 1]
      resultData.data[i + 2] = scaledData.data[i + 2]
    }
  }

  resultCtx.putImageData(resultData, tileX, tileY)
}
