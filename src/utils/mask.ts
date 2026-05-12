import type { Stroke } from '../composables/useEditorState'

/**
 * 将笔迹点从 UV 空间转换到像素空间
 */
function uvToPixel(u: number, v: number, width: number, height: number): [number, number] {
  const x = u * width
  const y = (1 - v) * height
  return [x, y]
}

/**
 * 在 Canvas 上绘制单条笔迹（使用圆形 lineCap 直线连接）
 */
function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
  color: string
) {
  if (stroke.points.length === 0) return

  const radius = stroke.size / 2

  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = stroke.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.points.length === 1) {
    // 单点画圆
    const [x, y] = uvToPixel(stroke.points[0][0], stroke.points[0][1], width, height)
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  // 多点连线
  ctx.beginPath()
  const [x0, y0] = uvToPixel(stroke.points[0][0], stroke.points[0][1], width, height)
  ctx.moveTo(x0, y0)

  for (let i = 1; i < stroke.points.length; i++) {
    const [x, y] = uvToPixel(stroke.points[i][0], stroke.points[i][1], width, height)
    ctx.lineTo(x, y)
  }
  ctx.stroke()
}

/**
 * 在 Canvas 上绘制所有蒙版笔迹
 */
export function drawMaskOnCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  currentStroke?: Stroke | null,
  color: string = 'rgba(255, 0, 0, 0.45)',
  clear: boolean = false
) {
  if (clear) {
    ctx.clearRect(0, 0, width, height)
  }

  const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes

  for (const stroke of allStrokes) {
    drawStroke(ctx, stroke, width, height, color)
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
  color: string = 'rgba(255, 0, 0, 0.45)'
) {
  drawStroke(ctx, stroke, width, height, color)
}

/**
 * 生成二值蒙版（白色=需消除区域，黑色=保留区域）
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
