<script setup lang="ts">
import { ref } from 'vue'
import Modal from './Modal.vue'
import { modelProgress, modelError, DEFAULT_MODEL_URL } from '../utils/model'

defineProps<{
  showPrompt: boolean
  showDownloading: boolean
}>()

const emit = defineEmits<{
  download: [url: string]
  close: []
}>()

const isEditing = ref(false)

const customUrl = ref(DEFAULT_MODEL_URL)

function startEdit() {
  isEditing.value = true
}

function confirmEdit() {
  if (customUrl.value.trim()) {
    isEditing.value = false
  }
}

function handleDownload() {
  emit('download', customUrl.value.trim() || DEFAULT_MODEL_URL)
}
</script>

<template>
  <!-- 下载提示 -->
  <Modal :visible="showPrompt">
    <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
    <div class="text-center">
      <p class="text-sm font-medium text-gray-700">需要下载 AI 模型</p>
      <p class="text-xs text-gray-500 mt-1">消除功能需要下载约 200MB 的 LaMa 模型文件，下载后将缓存在浏览器中</p>
    </div>

    <!-- 下载源地址 -->
    <div class="w-full">
      <p class="text-xs text-gray-500 mb-1">下载源</p>
      <div v-if="!isEditing" class="flex items-center gap-1.5">
        <p class="text-xs text-gray-600 break-all flex-1 leading-relaxed">{{ customUrl }}</p>
        <button
          @click="startEdit"
          class="shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          title="修改下载地址"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>
      <div v-else class="flex items-center gap-1.5">
        <input
          v-model="customUrl"
          type="text"
          class="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:border-gray-500"
          placeholder="输入模型下载地址"
          @keyup.enter="confirmEdit"
        />
        <button
          @click="confirmEdit"
          class="shrink-0 px-2 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors cursor-pointer"
        >
          确定
        </button>
      </div>
    </div>

    <button
      @click="handleDownload"
      class="w-full px-4 py-2 text-sm rounded-md bg-gray-800 text-white hover:bg-gray-700 transition-colors cursor-pointer"
    >
      下载模型
    </button>
  </Modal>

  <!-- 下载进度 -->
  <Modal :visible="showDownloading">
    <div class="w-10 h-10 border-3 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
    <div class="text-center">
      <p class="text-sm font-medium text-gray-700">正在下载 AI 模型</p>
      <p class="text-xs text-gray-500 mt-1">首次使用需下载约 200MB 模型，下载后将缓存在本地</p>
    </div>
    <div class="w-full bg-gray-200 rounded-full h-2">
      <div
        class="bg-gray-800 h-2 rounded-full transition-all duration-300"
        :style="{ width: `${modelProgress}%` }"
      ></div>
    </div>
    <p class="text-xs text-gray-500">{{ modelProgress }}%</p>
    <div v-if="modelError" class="text-xs text-red-500 text-center">
      {{ modelError }}
      <button @click="emit('close')" class="block mt-2 text-gray-600 underline cursor-pointer">关闭</button>
    </div>
  </Modal>
</template>
