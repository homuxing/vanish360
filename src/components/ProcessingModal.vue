<script setup lang="ts">
import Modal from './Modal.vue'

defineProps<{
  visible: boolean
  status: string
  progress: number
}>()
</script>

<template>
  <Modal :visible="visible">
    <div class="w-10 h-10 border-3 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
    <p class="text-sm font-medium text-gray-700">{{ status }}</p>
    <div v-if="progress > 0" class="w-full bg-gray-200 rounded-full h-2">
      <div
        class="bg-gray-800 h-2 rounded-full transition-all duration-300"
        :style="{ width: `${progress}%` }"
      ></div>
    </div>
  </Modal>
</template>
