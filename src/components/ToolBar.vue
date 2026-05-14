<script setup lang="ts">
import { useEditorState } from '../composables/useEditorState'

const { mode, brushSize, hasImage, canUndo, canRedo, setMode, setBrushSize, undo, redo } = useEditorState()

function handleBrushSizeChange(e: Event) {
  setBrushSize(Number((e.target as HTMLInputElement).value))
}
</script>

<template>
  <aside
    v-if="hasImage"
    class="w-16 flex flex-col items-center py-4 gap-4 border-r border-gray-200 bg-white shrink-0"
  >
    <button
      @click="setMode('view')"
      :class="[
        'w-10 h-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer',
        mode === 'view' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'
      ]"
      title="视角模式 (V)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>

    <button
      @click="setMode('brush')"
      :class="[
        'w-10 h-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer',
        mode === 'brush' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'
      ]"
      title="画笔模式 (B)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>

    <div class="w-8 h-px bg-gray-200"></div>

    <div v-if="mode === 'brush'" class="flex flex-col items-center gap-1">
      <input
        type="range"
        min="5"
        max="200"
        :value="brushSize"
        @input="handleBrushSizeChange"
        class="w-10 h-20 appearance-none cursor-pointer"
        style="writing-mode: vertical-lr; direction: rtl;"
        title="画笔大小"
      />
      <span class="text-xs text-gray-500">{{ brushSize }}</span>
    </div>

    <div v-if="mode === 'brush'" class="w-8 h-px bg-gray-200"></div>

    <button
      @click="undo()"
      :disabled="!canUndo"
      :class="[
        'w-10 h-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer',
        canUndo ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
      ]"
      title="撤销 (Ctrl+Z)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    </button>

    <button
      @click="redo()"
      :disabled="!canRedo"
      :class="[
        'w-10 h-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer',
        canRedo ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
      ]"
      title="重做 (Ctrl+Shift+Z)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
      </svg>
    </button>
  </aside>
</template>
