import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// 构建后将 onnxruntime-web 的 wasm 和 mjs 文件复制到 dist/assets
function copyOrtFiles() {
  return {
    name: 'copy-ort-files',
    closeBundle() {
      const ortDist = resolve(__dirname, 'node_modules/onnxruntime-web/dist')
      const outDir = resolve(__dirname, 'dist/assets')
      mkdirSync(outDir, { recursive: true })
      copyFileSync(
        resolve(ortDist, 'ort-wasm-simd-threaded.wasm'),
        resolve(outDir, 'ort-wasm-simd-threaded.wasm')
      )
      copyFileSync(
        resolve(ortDist, 'ort-wasm-simd-threaded.mjs'),
        resolve(outDir, 'ort-wasm-simd-threaded.mjs')
      )
    }
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), copyOrtFiles()],
  build: {
    chunkSizeWarningLimit: 2000,
  },
  resolve: {
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  }
})
