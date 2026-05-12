<script setup lang="ts">
import { useEditorState } from '../composables/useEditorState'

const { hasImage, loadImage } = useEditorState()

const emit = defineEmits<{
  export: []
}>()

function handleUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.jpg,.jpeg'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      loadImage(file)
    }
  }
  input.click()
}
</script>

<template>
  <header class="h-14 flex items-center justify-between px-5 border-b border-gray-200 bg-white shrink-0">
    <h1 class="text-lg font-semibold text-gray-800 tracking-tight">Vanish360</h1>
    <div class="flex items-center gap-3">
      <button
        @click="handleUpload"
        class="px-4 py-1.5 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        上传
      </button>
      <button
        v-if="hasImage"
        @click="emit('export')"
        class="px-4 py-1.5 text-sm font-medium rounded-md bg-gray-800 text-white hover:bg-gray-700 transition-colors cursor-pointer"
      >
        导出
      </button>
    </div>
  </header>
</template>
