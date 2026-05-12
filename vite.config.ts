import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * onnxruntime-web 必须作为 external 独立部署，不能被 Vite 打包。
 *
 * 原因：onnxruntime-web 在 proxy=true 模式下，通过 import.meta.url 定位自身文件，
 * 然后用 new Worker(自身URL) 创建 proxy worker，Worker 内再相对加载 .mjs 和 .wasm 文件。
 * 如果被 Vite 合并到 bundle 中，import.meta.url 会指向打包后的 chunk（如 index-xxx.js），
 * 导致 Worker 无法找到原始的 ort.wasm.min.mjs、ort-wasm-simd-threaded.mjs/.wasm，
 * 最终报错：no available backend found. ERR: [wasm] [object ErrorEvent]
 *
 * 解决方案：将 onnxruntime-web/wasm 标记为 external，构建后将其运行时文件原样复制到 dist/ort/，
 * 保持文件间的相对路径关系不被破坏。
 */
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
