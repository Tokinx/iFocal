<template>
  <div class="relative h-full min-h-0 flex-1 overflow-hidden bg-white border border-olive-300/60 shadow-xs">
    <WindowSettingsCenter embedded />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const WindowSettingsCenter = defineAsyncComponent(() => import('../components/WindowSettingsCenter.vue'))
</script>
