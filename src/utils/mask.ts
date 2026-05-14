import type { Stroke } from '../composables/useEditorState'

/**
 * 根据 UV 的 v 坐标计算纬度拉伸系数
 * 等距柱状投影中，纬度 φ 处水平方向角分辨率为赤道的 cos(φ) 倍
 * 为让球面上呈正圆，需在 equirectangular 中水平拉伸 1/cos(φ)
 */
export function getLatitudeScale(v: number): number {
  // v: UV 空间纵坐标
  // Three.js SphereGeometry: v=0 北极, v=1 南极
  // latitude = π * (v - 0.5)，范围 [-π/2, π/2]
  const latitude = Math.PI * (v - 0.5)
  const cosLat = Math.cos(latitude)
  // 不做 hard clamp —— 由 drawEllipseStamp 判断是否需要填充整条纬线
  return 1 / Math.max(cosLat, 0.001)
}

/**
 * 在指定 UV 位置绘制纬度补偿 stamp
 * 当椭圆水平跨度超过 canvas 宽度时，改为填充整条纬线带（球面上的正圆在极点附近就是如此）
 */
export function drawEllipseStamp(
  ctx: CanvasRenderingContext2D,
  u: number,
  v: number,
  baseRadius: number,
  canvasWidth: number,
  canvasHeight: number
) {
  const x = u * canvasWidth
  const y = (1 - v) * canvasHeight
  const hScale = getLatitudeScale(v)
  const hRadius = baseRadius * hScale

  // 如果水平半径超过 canvas 宽度的一半，椭圆已经 wrap 了整个经度
  // 直接填充对应纬度范围的矩形带（球面上确实是完整的一条带）
  if (hRadius * 2 >= canvasWidth) {
    const top = y - baseRadius
    const bottom = y + baseRadius
    ctx.fillRect(0, top, canvasWidth, bottom - top)
    return
  }

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(hScale, 1)
  ctx.beginPath()
  ctx.arc(0, 0, baseRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 如果椭圆超出 canvas 左右边界，在对侧绘制 wrap-around 部分
  // （equirectangular 在经度方向是环形连续的）
  if (x - hRadius < 0) {
    ctx.save()
    ctx.translate(x + canvasWidth, y)
    ctx.scale(hScale, 1)
    ctx.beginPath()
    ctx.arc(0, 0, baseRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  if (x + hRadius > canvasWidth) {
    ctx.save()
    ctx.translate(x - canvasWidth, y)
    ctx.scale(hScale, 1)
    ctx.beginPath()
    ctx.arc(0, 0, baseRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * 在两个 UV 点之间密集插值并绘制椭圆 stamp，形成连续笔迹
 */
export function drawSegmentWithStamps(
  ctx: CanvasRenderingContext2D,
  p0: [number, number, number],
  p1: [number, number, number],
  baseRadius: number,
  canvasWidth: number,
  canvasHeight: number
) {
  // 使用球面角距离来决定插值密度（避免极点处 u 跳跃导致插值过多）
  const dv = Math.abs(p1[1] - p0[1])
  // 对 du 做环绕修正
  let du = p1[0] - p0[0]
  if (du > 0.5) du -= 1
  if (du < -0.5) du += 1
  // 在球面上的近似角距离（用纬度中点处的 cos 修正经度差）
  const midV = (p0[1] + p1[1]) / 2
  const cosLat = Math.cos(Math.PI * (midV - 0.5))
  const angularDist = Math.sqrt((du * 2 * Math.PI * cosLat) ** 2 + (dv * Math.PI) ** 2)
  // baseRadius 对应的角度跨度（垂直方向: baseRadius / canvasHeight * π）
  const radiusAngle = (baseRadius / canvasHeight) * Math.PI
  const step = Math.max(radiusAngle * 0.3, 0.001)
  const count = Math.max(1, Math.ceil(angularDist / step))

  for (let j = 0; j <= count; j++) {
    const t = j / count
    // u 方向做环绕插值
    let u = p0[0] + du * t
    if (u < 0) u += 1
    if (u > 1) u -= 1
    const v = p0[1] + (p1[1] - p0[1]) * t
    drawEllipseStamp(ctx, u, v, baseRadius, canvasWidth, canvasHeight)
  }
}

/**
 * 在 Canvas 上绘制单条笔迹（使用纬度补偿椭圆 stamp）
 *
 * @param sizeScale 尺寸缩放系数。当目标 Canvas 不是全尺寸时（如 MASK_SCALE=0.25），
 *                  传入该比例使笔刷大小与 Canvas 匹配。
 */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
  color: string,
  sizeScale: number = 1
) {
  const points = stroke.points
  if (points.length === 0) return

  const baseRadius = (stroke.size * sizeScale) / 2
  ctx.fillStyle = color

  if (points.length === 1) {
    drawEllipseStamp(ctx, points[0][0], points[0][1], baseRadius, width, height)
    return
  }

  // 逐段密集插值绘制椭圆 stamp
  for (let i = 0; i < points.length - 1; i++) {
    drawSegmentWithStamps(ctx, points[i], points[i + 1], baseRadius, width, height)
  }
  // 确保最后一个点被绘制
  const last = points[points.length - 1]
  drawEllipseStamp(ctx, last[0], last[1], baseRadius, width, height)
}

/**
 * 在 Canvas 上绘制所有蒙版笔迹
 *
 * @param sizeScale 传给 drawStroke 的尺寸缩放系数
 */
export function drawMaskOnCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  currentStroke?: Stroke | null,
  color: string = 'rgba(255, 0, 0, 0.45)',
  clear: boolean = false,
  sizeScale: number = 1
) {
  if (clear) {
    ctx.clearRect(0, 0, width, height)
  }

  const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes

  for (const stroke of allStrokes) {
    drawStroke(ctx, stroke, width, height, color, sizeScale)
  }
}

/**
 * 仅绘制最后一笔（增量绘制用）
 */
export function drawLastStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
  color: string = 'rgba(255, 0, 0, 0.45)',
  sizeScale: number = 1
) {
  drawStroke(ctx, stroke, width, height, color, sizeScale)
}

/**
 * 生成二值蒙版（白色=需消除区域，黑色=保留区域）
 * 在全尺寸 Canvas 上绘制，sizeScale=1
 */
export function generateBinaryMask(
  strokes: Stroke[],
  width: number,
  height: number
): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, width, height)

  drawMaskOnCanvas(ctx, strokes, width, height, null, 'white')

  return ctx.getImageData(0, 0, width, height)
}
