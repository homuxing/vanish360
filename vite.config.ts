import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

// 构建后将 onnxruntime-web 完整运行时文件复制到 dist/ort/
// 包括 JS 入口、proxy worker 逻辑、wasm 加载器、wasm 文件
function copyOrtFiles() {
  return {
    name: 'copy-ort-files',
    closeBundle() {
      const ortDist = resolve(__dirname, 'node_modules/onnxruntime-web/dist')
      const outDir = resolve(__dirname, 'dist/ort')
      mkdirSync(outDir, { recursive: true })

      const files = [
        'ort.wasm.min.mjs',              // 主入口（proxy worker 也用它）
        'ort-wasm-simd-threaded.mjs',    // WASM 加载器 + pthread worker
        'ort-wasm-simd-threaded.wasm',   // WASM 二进制
      ]
      for (const file of files) {
        const src = resolve(ortDist, file)
        if (existsSync(src)) {
          copyFileSync(src, resolve(outDir, file))
        }
      }
    }
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), copyOrtFiles()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // 不打包 onnxruntime-web，运行时从独立文件加载
      external: ['onnxruntime-web/wasm'],
      output: {
        paths: {
          'onnxruntime-web/wasm': '/ort/ort.wasm.min.mjs'
        }
      }
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  }
})
