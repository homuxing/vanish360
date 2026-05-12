<script setup lang="ts">
import Modal from './Modal.vue'

defineProps<{
  visible: boolean
  error: string | null
}>()

function reload() {
  window.location.reload()
}
</script>

<template>
  <Modal :visible="visible">
    <!-- 加载中状态 -->
    <template v-if="!error">
      <div class="w-10 h-10 border-3 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
      <p class="text-sm font-medium text-gray-700">正在加载图片...</p>
    </template>

    <!-- 错误状态 -->
    <template v-else>
      <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div class="text-center">
        <p class="text-sm font-medium text-gray-700">图片加载失败</p>
        <p class="text-xs text-gray-500 mt-1">{{ error }}</p>
      </div>
      <button
        @click="reload"
        class="w-full px-4 py-2 text-sm rounded-md bg-gray-800 text-white hover:bg-gray-700 transition-colors cursor-pointer"
      >
        刷新页面
      </button>
    </template>
  </Modal>
</template>
