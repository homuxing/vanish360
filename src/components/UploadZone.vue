<script setup lang="ts">
import { ref } from 'vue'
import { useEditorState } from '../composables/useEditorState'

const { loadImage } = useEditorState()
const isDragging = ref(false)

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && /\.(jpe?g)$/i.test(file.name)) {
    loadImage(file)
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleClick() {
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
  <div
    class="flex-1 flex items-center justify-center bg-gray-50"
    @drop.prevent="handleDrop"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
  >
    <div
      @click="handleClick"
      :class="[
        'w-96 h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors',
        isDragging ? 'border-gray-500 bg-gray-100' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-100'
      ]"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <div class="text-center">
        <p class="text-sm font-medium text-gray-600">拖拽全景图到此处，或点击选择</p>
        <p class="text-xs text-gray-400 mt-1">支持 JPG / JPEG 格式</p>
      </div>
    </div>
  </div>
</template>
