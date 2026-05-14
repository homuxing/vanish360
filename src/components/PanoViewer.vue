<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useEditorState, type Stroke } from '../composables/useEditorState'
import { drawEllipseStamp, drawSegmentWithStamps } from '../utils/mask'

const props = defineProps<{
  canErase: boolean
}>()

const emit = defineEmits<{
  autoErase: [stroke: Stroke]
}>()

const {
  imageUrl,
  imageWidth,
  imageHeight,
  originalImage,
  mode,
  brushSize,
  currentStroke,
  processedImageData,
  startStroke,
  addPoint,
  endStroke,
  setMode,
  setBrushSize,
  undo,
  redo,
} = useEditorState()

const containerRef = ref<HTMLElement | null>(null)
const cursorRef = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let sphere: THREE.Mesh | null = null
let animationId: number | null = null

let baseTexture: THREE.CanvasTexture | null = null
let maskTexture: THREE.CanvasTexture | null = null
let shaderMaterial: THREE.ShaderMaterial | null = null

let maskCanvas: HTMLCanvasElement | null = null
let maskCtx: CanvasRenderingContext2D | null = null
const MASK_SCALE = 0.25

let isDrawing = false
let spacePressed = false
let maskDirty = false
let lastPointCount = 0

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform sampler2D baseMap;
  uniform sampler2D maskMap;
  uniform vec3 maskColor;
  uniform float maskOpacity;
  varying vec2 vUv;
  void main() {
    vec4 base = texture2D(baseMap, vUv);
    float mask = texture2D(maskMap, vUv).r;
    vec3 color = mix(base.rgb, maskColor, mask * maskOpacity);
    gl_FragColor = vec4(color, 1.0);
  }
`

function initThree() {
  if (!containerRef.value) return

  const container = containerRef.value
  const w = container.clientWidth
  const h = container.clientHeight

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  container.appendChild(renderer.domElement)

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000)
  camera.position.set(0, 0, 0.01)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableZoom = true
  controls.enablePan = false
  controls.rotateSpeed = -0.3
  controls.zoomSpeed = 0.5
  controls.minDistance = 0.01
  controls.maxDistance = 0.01
  controls.enableDamping = true
  controls.dampingFactor = 0.1

  const geometry = new THREE.SphereGeometry(50, 64, 32)
  geometry.scale(-1, 1, 1)

  const placeholderMat = new THREE.MeshBasicMaterial({ color: 0x222222 })
  sphere = new THREE.Mesh(geometry, placeholderMat)
  scene.add(sphere)

  animate()
  window.addEventListener('resize', handleResize)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  if (!renderer || !scene || !camera || !controls) return

  controls.update()

  if (maskDirty && maskTexture) {
    maskTexture.needsUpdate = true
    maskDirty = false
  }

  renderer.render(scene, camera)
}

function handleResize() {
  if (!containerRef.value || !renderer || !camera) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function setupTextures() {
  if (!sphere) return
  const w = imageWidth.value
  const h = imageHeight.value
  if (!w || !h) return

  const baseCanvas = document.createElement('canvas')
  baseCanvas.width = w
  baseCanvas.height = h
  const baseCtx = baseCanvas.getContext('2d')!
  if (processedImageData.value) {
    baseCtx.putImageData(processedImageData.value, 0, 0)
  } else if (originalImage.value) {
    baseCtx.drawImage(originalImage.value, 0, 0, w, h)
  }

  if (baseTexture) baseTexture.dispose()
  baseTexture = new THREE.CanvasTexture(baseCanvas)
  baseTexture.minFilter = THREE.LinearFilter
  baseTexture.magFilter = THREE.LinearFilter

  const mw = Math.round(w * MASK_SCALE)
  const mh = Math.round(h * MASK_SCALE)
  maskCanvas = document.createElement('canvas')
  maskCanvas.width = mw
  maskCanvas.height = mh
  maskCtx = maskCanvas.getContext('2d')!
  maskCtx.clearRect(0, 0, mw, mh)

  if (maskTexture) maskTexture.dispose()
  maskTexture = new THREE.CanvasTexture(maskCanvas)
  maskTexture.minFilter = THREE.LinearFilter
  maskTexture.magFilter = THREE.LinearFilter

  if (shaderMaterial) shaderMaterial.dispose()
  shaderMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      baseMap: { value: baseTexture },
      maskMap: { value: maskTexture },
      maskColor: { value: new THREE.Vector3(1.0, 0.2, 0.2) },
      maskOpacity: { value: 0.5 },
    },
  })

  const oldMat = sphere.material as THREE.Material
  sphere.material = shaderMaterial
  oldMat.dispose()
}

function updateBaseTexture() {
  if (!baseTexture) return
  const canvas = baseTexture.image as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height

  if (processedImageData.value) {
    ctx.putImageData(processedImageData.value, 0, 0)
  } else if (originalImage.value) {
    ctx.drawImage(originalImage.value, 0, 0, w, h)
  }
  baseTexture.needsUpdate = true
}

function clearMaskCanvas() {
  if (!maskCtx || !maskCanvas) return
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
  maskDirty = true
}

function appendToMask() {
  if (!maskCtx || !maskCanvas || !currentStroke.value) return
  const stroke = currentStroke.value
  const points = stroke.points
  const mw = maskCanvas.width
  const mh = maskCanvas.height
  const baseRadius = (stroke.size * MASK_SCALE) / 2

  if (points.length === 0) {
    lastPointCount = 0
    return
  }

  maskCtx.fillStyle = 'white'
  const startIdx = Math.max(0, lastPointCount - 1)

  if (points.length === 1 && lastPointCount === 0) {
    drawEllipseStamp(maskCtx, points[0][0], points[0][1], baseRadius, mw, mh)
  } else {
    for (let i = startIdx; i < points.length - 1; i++) {
      drawSegmentWithStamps(maskCtx, points[i], points[i + 1], baseRadius, mw, mh)
    }
    if (lastPointCount < points.length) {
      const last = points[points.length - 1]
      drawEllipseStamp(maskCtx, last[0], last[1], baseRadius, mw, mh)
    }
  }

  lastPointCount = points.length
  maskDirty = true
}

function getUVFromEvent(e: MouseEvent): [number, number] | null {
  if (!containerRef.value || !camera || !sphere) return null

  const rect = containerRef.value.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera)

  const intersects = raycaster.intersectObject(sphere)
  if (intersects.length === 0 || !intersects[0].uv) return null

  return [intersects[0].uv.x, intersects[0].uv.y]
}

function updateInteractionMode() {
  if (!controls) return
  controls.enabled = (mode.value === 'view') || spacePressed
}

function screenBrushToImagePixels(): number {
  if (!containerRef.value || !camera) return brushSize.value
  const viewportWidth = containerRef.value.clientWidth
  const hFovRad = 2 * Math.atan(Math.tan((camera.fov * Math.PI / 180) / 2) * camera.aspect)
  const radiansPerPixel = hFovRad / viewportWidth
  const brushAngle = brushSize.value * radiansPerPixel
  const imagePixels = (brushAngle / (2 * Math.PI)) * imageWidth.value
  return Math.max(2, imagePixels)
}

function handleMouseDown(e: MouseEvent) {
  if (mode.value !== 'brush' || spacePressed || !props.canErase) return
  if (e.button !== 0) return

  const uv = getUVFromEvent(e)
  if (!uv) return

  clearMaskCanvas()
  isDrawing = true
  lastPointCount = 0
  startStroke()
  if (currentStroke.value) {
    currentStroke.value.size = screenBrushToImagePixels()
  }
  addPoint(uv[0], uv[1], 0.5)
  appendToMask()
}

function handleMouseMove(e: MouseEvent) {
  if (cursorRef.value && containerRef.value && mode.value === 'brush' && !spacePressed) {
    const rect = containerRef.value.getBoundingClientRect()
    cursorRef.value.style.left = `${e.clientX - rect.left}px`
    cursorRef.value.style.top = `${e.clientY - rect.top}px`
  }

  if (!isDrawing || mode.value !== 'brush' || spacePressed) return

  const uv = getUVFromEvent(e)
  if (!uv) return

  addPoint(uv[0], uv[1], 0.5)
  appendToMask()
}

function handleMouseUp() {
  if (!isDrawing) return
  isDrawing = false
  lastPointCount = 0

  const stroke = endStroke()
  if (!stroke || !props.canErase) {
    clearMaskCanvas()
    return
  }

  emit('autoErase', stroke)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement) return

  switch (e.key.toLowerCase()) {
    case 'v':
      setMode('view')
      break
    case 'b':
      setMode('brush')
      break
    case ' ':
      if (mode.value === 'brush') {
        e.preventDefault()
        spacePressed = true
        updateInteractionMode()
      }
      break
    case '[':
      setBrushSize(brushSize.value - 5)
      break
    case ']':
      setBrushSize(brushSize.value + 5)
      break
    case 'z':
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault()
        redo()
        clearMaskCanvas()
      } else if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        undo()
        clearMaskCanvas()
      }
      break
  }
}

function handleKeyUp(e: KeyboardEvent) {
  if (e.key === ' ') {
    spacePressed = false
    updateInteractionMode()
  }
}

function handleWheel(e: WheelEvent) {
  if (mode.value === 'brush' && !spacePressed) {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY > 0 ? -5 : 5
    setBrushSize(brushSize.value + delta)
  }
}

watch(mode, updateInteractionMode)

watch(processedImageData, () => {
  updateBaseTexture()
  clearMaskCanvas()
})

watch(imageUrl, async (url) => {
  if (!url) return
  await nextTick()
  if (!renderer) initThree()
  setupTextures()
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)

  if (imageUrl.value) {
    initThree()
    setupTextures()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('resize', handleResize)

  if (animationId !== null) cancelAnimationFrame(animationId)
  baseTexture?.dispose()
  maskTexture?.dispose()
  shaderMaterial?.dispose()
  if (sphere) sphere.geometry.dispose()
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
  controls?.dispose()
})
</script>

<template>
  <div class="flex-1 relative overflow-hidden bg-gray-900">
    <div
      ref="containerRef"
      class="w-full h-full"
      :class="[mode === 'brush' && !spacePressed ? 'cursor-none' : 'cursor-grab active:cursor-grabbing']"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @wheel="handleWheel"
    />

    <div
      v-if="mode === 'brush' && !spacePressed"
      ref="cursorRef"
      class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 border-2 border-red-400 rounded-full opacity-70"
      :style="{ width: `${brushSize}px`, height: `${brushSize}px` }"
    />
  </div>
</template>
