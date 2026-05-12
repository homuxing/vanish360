<script setup lang="ts">
defineProps<{
  visible: boolean
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-xl px-8 py-6 flex flex-col items-center gap-4 shadow-lg w-80">
        <slot />
      </div>
    </div>
  </Teleport>
</template>
