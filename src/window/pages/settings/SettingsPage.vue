<template>
  <div class="relative h-full min-h-0 flex-1 bg-slate-50 p-2 rounded-l-4xl">
    <div class="flex h-full min-h-0 w-full text-foreground gap-2">
      <SettingsNav v-model="nav" embedded />
      <ScrollArea class="flex-1 min-h-0 rounded-1xl bg-white border border-slate-200/75 shadow-xs">
        <main class="px-4 py-2">
          <AiChannelsPanel v-if="nav === 'channels'" />
          <MachineTranslatePanel v-if="nav === 'machine'" />
          <McpPanel v-if="nav === 'mcp'" />
          <GeneralPanel v-if="nav === 'settings'" />
          <OtherSettingsPanel v-if="nav === 'debug'" />
          <AboutPanel v-if="nav === 'about'" />
        </main>
      </ScrollArea>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, provide, ref } from 'vue'
import { buildStylePresetsCss } from '@/shared/style-presets'
import { ScrollArea } from '@/components/ui/scroll-area'
import SettingsNav, { type SettingsNavId } from './components/SettingsNav.vue'
import AboutPanel from './components/panels/AboutPanel.vue'
import McpPanel from './components/panels/McpPanel.vue'
import MachineTranslatePanel from './components/panels/MachineTranslatePanel.vue'
import AiChannelsPanel from './components/panels/AiChannelsPanel.vue'
import OtherSettingsPanel from './components/panels/OtherSettingsPanel.vue'
import GeneralPanel from './components/panels/GeneralPanel.vue'
import { createSettingsStore, SETTINGS_STORE_KEY } from '@/window/pages/settings/composables/useSettingsStore'

const store = createSettingsStore()
provide(SETTINGS_STORE_KEY, store)

const nav = ref<SettingsNavId>('settings')

function ensureOptionPresetStyles(list?: Array<{ name: string; css: string }>) {
  try {
    const id = 'ifocal-option-style-presets'
    let el = document.getElementById(id) as HTMLStyleElement | null
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el) }
    el.textContent = buildStylePresetsCss(list)
  } catch { }
}

onMounted(async () => {
  await store.load()
  ensureOptionPresetStyles((store.config.value as any).targetStylePresets)
})
</script>
