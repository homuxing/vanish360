import * as ort from 'onnxruntime-web/wasm'
import { generateBinaryMask } from './mask'
import { getSession, loadModel } from './model'
import type { Stroke } from '../composables/useEditorState'

// 重新导出模型相关 API（保持向后兼容）
export { isModelCached, loadModel, modelLoading, modelProgress, modelLoaded, modelError, DEFAULT_MODEL_URL } from './model'

const LAMA_SIZE = 512
const MAX_PATCH_SIZE = 1280
const PATCH_PADDING = 96
const FEATHER_RADIUS = 12

interface Vec3 {
  x: number
  y: number
  z: number
}

interface Basis {
  center: Vec3
  east: Vec3
  north: Vec3
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len < 1e-8) return { x: 0, y: 0, z: 1 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

function uvToDir(u: number, v: number): Vec3 {
  const lon = (u - 0.5) * 2 * Math.PI
  const lat = (v - 0.5) * Math.PI
  const cosLat = Math.cos(lat)
  return {
    x: cosLat * Math.sin(lon),
    y: Math.sin(lat),
    z: cosLat * Math.cos(lon),
  }
}

function dirToUv(dir: Vec3): { u: number; v: number } {
  const n = normalize(dir)
  const lon = Math.atan2(n.x, n.z)
  const lat = Math.asin(Math.max(-1, Math.min(1, n.y)))
  let u = lon / (2 * Math.PI) + 0.5
  if (u < 0) u += 1
  if (u >= 1) u -= 1
  const v = lat / Math.PI + 0.5
  return { u, v }
}

function buildBasisFromStroke(stroke: Stroke): Basis {
  let sum = { x: 0, y: 0, z: 0 }
  for (const p of stroke.points) {
    sum = add(sum, uvToDir(p[0], p[1]))
  }

  let center = normalize(sum)
  if (stroke.points.length === 1) {
    center = uvToDir(stroke.points[0][0], stroke.points[0][1])
  }

  const worldUp: Vec3 = { x: 0, y: 1, z: 0 }
  const fallbackAxis: Vec3 = { x: 1, y: 0, z: 0 }
  let east = cross(worldUp, center)
  if (Math.hypot(east.x, east.y, east.z) < 1e-5) {
    east = cross(fallbackAxis, center)
  }
  east = normalize(east)
  const north = normalize(cross(center, east))

  return { center, east, north }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function angularDistance(a: Vec3, b: Vec3): number {
  return Math.acos(clamp(dot(a, b), -1, 1))
}

function computePatchHalfAngle(
  stroke: Stroke,
  basis: Basis,
  imageHeight: number
): number {
  let maxAngle = 0
  for (const [u, v] of stroke.points) {
    const dir = uvToDir(u, v)
    const angle = angularDistance(dir, basis.center)
    if (angle > maxAngle) maxAngle = angle
  }

  const brushRadiusPx = Math.max(1, stroke.size / 2)
  const brushRadiusAngle = (brushRadiusPx / imageHeight) * Math.PI
  const safety = 0.14

  return clamp(maxAngle + brushRadiusAngle + safety, 0.18, Math.PI * 0.48)
}

function computePatchSizeFromAngle(halfAngle: number, imageWidth: number): number {
  const pixelsPerRadian = imageWidth / (2 * Math.PI)
  const patchDiameter = 2 * halfAngle * pixelsPerRadian
  const target = Math.round(patchDiameter + PATCH_PADDING * 2)
  return Math.max(320, Math.min(MAX_PATCH_SIZE, target))
}

function sampleEquirectNearest(
  srcData: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  u: number,
  v: number,
  out: Uint8ClampedArray,
  outOffset: number
) {
  let sx = Math.round(u * srcWidth)
  if (sx < 0) sx = 0
  if (sx >= srcWidth) sx = srcWidth - 1

  let sy = Math.round((1 - v) * srcHeight)
  if (sy < 0) sy = 0
  if (sy >= srcHeight) sy = srcHeight - 1

  const idx = (sy * srcWidth + sx) * 4
  out[outOffset] = srcData[idx]
  out[outOffset + 1] = srcData[idx + 1]
  out[outOffset + 2] = srcData[idx + 2]
  out[outOffset + 3] = 255
}

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

function maskDataToTensor(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData
  const tensor = new Float32Array(width * height)

  for (let i = 0; i < width * height; i++) {
    tensor[i] = data[i * 4] > 128 ? 1.0 : 0.0
  }
  return tensor
}

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

function resizeToLama(source: ImageData): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = LAMA_SIZE
  canvas.height = LAMA_SIZE
  const ctx = canvas.getContext('2d')!

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = source.width
  srcCanvas.height = source.height
  srcCanvas.getContext('2d')!.putImageData(source, 0, 0)

  ctx.drawImage(srcCanvas, 0, 0, source.width, source.height, 0, 0, LAMA_SIZE, LAMA_SIZE)
  return ctx.getImageData(0, 0, LAMA_SIZE, LAMA_SIZE)
}

function resizeBack(source: ImageData, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = source.width
  srcCanvas.height = source.height
  srcCanvas.getContext('2d')!.putImageData(source, 0, 0)

  ctx.drawImage(srcCanvas, 0, 0, source.width, source.height, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

function runLamaOnPatch(
  session: ort.InferenceSession,
  patchImage: ImageData,
  patchMask: ImageData
): Promise<ImageData> {
  const image512 = resizeToLama(patchImage)
  const mask512 = resizeToLama(patchMask)

  const imageTensor = imageDataToTensor(image512)
  const maskTensor = maskDataToTensor(mask512)

  const inputNames = session.inputNames
  const feeds: Record<string, ort.Tensor> = {}
  feeds[inputNames[0]] = new ort.Tensor('float32', imageTensor, [1, 3, LAMA_SIZE, LAMA_SIZE])
  feeds[inputNames[1]] = new ort.Tensor('float32', maskTensor, [1, 1, LAMA_SIZE, LAMA_SIZE])

  return session.run(feeds).then((results) => {
    const outputKey = session.outputNames[0]
    const outputTensor = results[outputKey]
    const outputData = outputTensor.data as Float32Array
    const output512 = tensorToImageData(outputData, LAMA_SIZE, LAMA_SIZE)
    return resizeBack(output512, patchImage.width, patchImage.height)
  })
}

function buildPatch(
  srcImage: ImageData,
  srcMask: ImageData,
  stroke: Stroke
): {
  patchImage: ImageData
  patchMask: ImageData
  basis: Basis
  patchSize: number
  patchHalfAngle: number
} {
  const bounds = getMaskBounds(srcMask)
  if (!bounds) {
    throw new Error('未检测到有效蒙版')
  }

  const basis = buildBasisFromStroke(stroke)
  const patchHalfAngle = computePatchHalfAngle(stroke, basis, srcImage.height)
  const patchSize = computePatchSizeFromAngle(patchHalfAngle, srcImage.width)

  const patchImage = new ImageData(patchSize, patchSize)
  const patchMask = new ImageData(patchSize, patchSize)

  const srcPixels = srcImage.data
  const srcMaskPixels = srcMask.data
  const patchPixels = patchImage.data
  const patchMaskPixels = patchMask.data

  for (let py = 0; py < patchSize; py++) {
    const ny = ((py + 0.5) / patchSize) * 2 - 1
    for (let px = 0; px < patchSize; px++) {
      const nx = ((px + 0.5) / patchSize) * 2 - 1
      const idx = (py * patchSize + px) * 4

      const tanX = nx * Math.tan(patchHalfAngle)
      const tanY = ny * Math.tan(patchHalfAngle)
      const dir = normalize(add(add(basis.center, scale(basis.east, tanX)), scale(basis.north, -tanY)))

      const uv = dirToUv(dir)
      sampleEquirectNearest(srcPixels, srcImage.width, srcImage.height, uv.u, uv.v, patchPixels, idx)
      sampleEquirectNearest(srcMaskPixels, srcMask.width, srcMask.height, uv.u, uv.v, patchMaskPixels, idx)

      patchMaskPixels[idx + 3] = 255
    }
  }

  return {
    patchImage,
    patchMask,
    basis,
    patchSize,
    patchHalfAngle,
  }
}

function blendPatchBack(
  result: ImageData,
  original: ImageData,
  patchResult: ImageData,
  patchMask: ImageData,
  basis: Basis,
  patchSize: number,
  patchHalfAngle: number
) {
  const width = result.width
  const height = result.height
  const out = result.data
  const src = original.data
  const patch = patchResult.data
  const mask = patchMask.data

  const invTanHalf = 1 / Math.tan(patchHalfAngle)

  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width
      const dir = uvToDir(u, v)

      const z = dot(dir, basis.center)
      if (z <= 0) continue

      const tx = dot(dir, basis.east) / z
      const ty = -dot(dir, basis.north) / z
      const nx = tx * invTanHalf
      const ny = ty * invTanHalf
      if (Math.abs(nx) > 1 || Math.abs(ny) > 1) continue

      const px = Math.floor(((nx + 1) * 0.5) * patchSize)
      const py = Math.floor(((ny + 1) * 0.5) * patchSize)
      if (px < 0 || px >= patchSize || py < 0 || py >= patchSize) continue

      const patchIdx = (py * patchSize + px) * 4
      const maskVal = mask[patchIdx]
      if (maskVal <= 8) continue

      const dist = distanceToMaskEdge(mask, patchSize, patchSize, px, py, FEATHER_RADIUS)
      const alpha = Math.min(1, Math.max(0, dist / FEATHER_RADIUS))

      const dstIdx = (y * width + x) * 4
      out[dstIdx] = Math.round(patch[patchIdx] * alpha + src[dstIdx] * (1 - alpha))
      out[dstIdx + 1] = Math.round(patch[patchIdx + 1] * alpha + src[dstIdx + 1] * (1 - alpha))
      out[dstIdx + 2] = Math.round(patch[patchIdx + 2] * alpha + src[dstIdx + 2] * (1 - alpha))
      out[dstIdx + 3] = 255
    }
  }
}

function distanceToMaskEdge(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  limit: number
): number {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0
  const idx = (y * width + x) * 4
  if (mask[idx] <= 8) return 0

  let minDist = limit
  for (let r = 1; r <= limit; r++) {
    const left = x - r
    const right = x + r
    const top = y - r
    const bottom = y + r

    for (let xx = left; xx <= right; xx++) {
      if (top >= 0) {
        const i = (top * width + Math.max(0, Math.min(width - 1, xx))) * 4
        if (mask[i] <= 8) return r
      }
      if (bottom < height) {
        const i = (bottom * width + Math.max(0, Math.min(width - 1, xx))) * 4
        if (mask[i] <= 8) return r
      }
    }

    for (let yy = top + 1; yy <= bottom - 1; yy++) {
      if (yy < 0 || yy >= height) continue
      if (left >= 0) {
        const i = (yy * width + left) * 4
        if (mask[i] <= 8) return r
      }
      if (right < width) {
        const i = (yy * width + right) * 4
        if (mask[i] <= 8) return r
      }
    }

    minDist = r
  }

  return minDist
}

function getMaskBounds(maskData: ImageData): { x: number; y: number; w: number; h: number } | null {
  const { data, width, height } = maskData
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
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

function toImageData(source: HTMLImageElement | ImageBitmap | ImageData): ImageData {
  if (source instanceof ImageData) return source

  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0)
  return ctx.getImageData(0, 0, width, height)
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export async function processInpainting(
  source: HTMLImageElement | ImageBitmap | ImageData,
  stroke: Stroke,
  onProgress?: (current: number, total: number) => void
): Promise<ImageData> {
  const t0 = performance.now()

  let session = getSession()
  if (!session) {
    await loadModel()
    session = getSession()
  }
  if (!session) throw new Error('模型未加载')

  const srcImage = toImageData(source)
  const srcMask = generateBinaryMask([stroke], srcImage.width, srcImage.height)

  onProgress?.(1, 4)
  await yieldToBrowser()

  const { patchImage, patchMask, basis, patchSize, patchHalfAngle } = buildPatch(srcImage, srcMask, stroke)
  onProgress?.(2, 4)
  await yieldToBrowser()

  const patchResult = await runLamaOnPatch(session, patchImage, patchMask)
  onProgress?.(3, 4)
  await yieldToBrowser()

  const result = new ImageData(new Uint8ClampedArray(srcImage.data), srcImage.width, srcImage.height)
  blendPatchBack(result, srcImage, patchResult, patchMask, basis, patchSize, patchHalfAngle)
  onProgress?.(4, 4)

  console.log(`[processInpainting] patch=${patchSize}x${patchSize}, total ${(performance.now() - t0).toFixed(0)}ms`)
  return result
}
