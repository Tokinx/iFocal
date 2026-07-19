<template>
  <div class="relative h-full min-h-0 flex-1 rounded-xl border-4 border-[#faf8f5] bg-white">
    <div class="flex h-full min-h-0 w-full overflow-hidden text-foreground">
      <ScrollArea class="min-h-0 flex-1 border-0  shadow-none">
        <main class="mx-auto max-w-180 py-8">
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
import { onMounted, provide } from 'vue'
import { buildStylePresetsCss } from '@/shared/style-presets'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SettingsNavId } from './components/SettingsNav.vue'
import AboutPanel from './components/panels/AboutPanel.vue'
import McpPanel from './components/panels/McpPanel.vue'
import MachineTranslatePanel from './components/panels/MachineTranslatePanel.vue'
import AiChannelsPanel from './components/panels/AiChannelsPanel.vue'
import OtherSettingsPanel from './components/panels/OtherSettingsPanel.vue'
import GeneralPanel from './components/panels/GeneralPanel.vue'
import { createSettingsStore, SETTINGS_STORE_KEY } from '@/window/pages/settings/composables/useSettingsStore'

const store = createSettingsStore()
provide(SETTINGS_STORE_KEY, store)

defineProps<{ nav: SettingsNavId }>()

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
