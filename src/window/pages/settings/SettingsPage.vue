<template>
  <div class="relative h-full min-h-0 flex-1 rounded-1xl overflow-hidden bg-white border border-olive-300/60 shadow-xs p-2">
    <WindowSettingsCenter embedded />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const WindowSettingsCenter = defineAsyncComponent(() => import('./WindowSettingsCenter.vue'))
</script>
