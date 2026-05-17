<script setup lang="ts">
import { useSettingsImport } from '@/window/pages/settings/composables/useSettingsImport';

const { importerRef, version, onExport, triggerImport, onImportChange } = useSettingsImport();
</script>

<template>
  <section :id="'opt-about'" class="space-y-4">
    <header class="flex items-center h-10 text-base font-semibold">关于插件</header>
    <div class="space-y-3 text-sm">
      <div>版本：{{ version }}</div>
      <div class="flex items-center gap-2">
        <Button class="bg-primary text-primary-foreground rounded-xl" @click="onExport">导出设置</Button>
        <Button variant="ghost" class="rounded-xl" @click="triggerImport">导入设置</Button>
        <input ref="importerRef" type="file" accept="application/json" class="hidden" @change="onImportChange" />
      </div>
    </div>
  </section>
</template>
