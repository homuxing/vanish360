<script setup lang="ts">
import { ref } from 'vue'
import { useEditorState } from '../composables/useEditorState'

const { mode, brushSize, hasImage, hasMask, canUndo, canRedo, setMode, setBrushSize, undo, redo } = useEditorState()

const props = defineProps<{
  modelLoaded: boolean
}>()

const emit = defineEmits<{
  erase: []
}>()

const showToast = ref(false)
const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function handleEraseClick() {
  if (!hasMask.value) {
    showTip('用画笔涂抹消除内容')
    return
  }
  if (!props.modelLoaded) {
    showTip('模型正在加载，稍后再试')
    return
  }
  emit('erase')
}

function showTip(msg: string) {
  toastMessage.value = msg
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    showToast.value = false
  }, 2000)
}

function handleBrushSizeChange(e: Event) {
  setBrushSize(Number((e.target as HTMLInputElement).value))
}
</script>

<template>
  <aside
    v-if="hasImage"
    class="w-16 flex flex-col items-center py-4 gap-4 border-r border-gray-200 bg-white shrink-0"
  >
    <!-- 视角模式 -->
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

    <!-- 画笔模式 -->
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

    <!-- 分隔线 -->
    <div class="w-8 h-px bg-gray-200"></div>

    <!-- 画笔大小 -->
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

    <!-- 分隔线 -->
    <div v-if="mode === 'brush'" class="w-8 h-px bg-gray-200"></div>

    <!-- 消除按钮 -->
    <button
      @click="handleEraseClick"
      :class="[
        'w-10 h-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer',
        hasMask && modelLoaded ? 'text-red-500 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'
      ]"
      :title="!modelLoaded ? '模型加载中...' : '消除'"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>

    <!-- 撤销按钮 -->
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

    <!-- 重做按钮 -->
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

  <!-- Toast 轻提示 -->
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="showToast"
        class="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-lg z-50"
      >
        {{ toastMessage }}
      </div>
    </Transition>
  </Teleport>
</template>
