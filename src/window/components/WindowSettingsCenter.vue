<script setup lang="ts">
import { onMounted, ref, provide } from 'vue';
import { buildStylePresetsCss } from '@/shared/style-presets';
import { ScrollArea } from '@/components/ui/scroll-area';
import SettingsNav, { type SettingsNavId } from './settings/SettingsNav.vue';
import AboutPanel from './settings/panels/AboutPanel.vue';
import McpPanel from './settings/panels/McpPanel.vue';
import MachineTranslatePanel from './settings/panels/MachineTranslatePanel.vue';
import AiChannelsPanel from './settings/panels/AiChannelsPanel.vue';
import OtherSettingsPanel from './settings/panels/OtherSettingsPanel.vue';
import GeneralPanel from './settings/panels/GeneralPanel.vue';
import { createSettingsStore, SETTINGS_STORE_KEY } from '@/window/composables/useSettingsStore';

withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false
})

const store = createSettingsStore();
provide(SETTINGS_STORE_KEY, store);

const nav = ref<SettingsNavId>('settings');

function ensureOptionPresetStyles(list?: Array<{ name: string; css: string }>) {
  try {
    const id = 'ifocal-option-style-presets';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = buildStylePresetsCss(list);
  } catch { }
}

onMounted(async () => {
  await store.load();
  ensureOptionPresetStyles((store.config.value as any).targetStylePresets);
});
</script>

<template>
  <div class="flex h-full min-h-0 w-full text-foreground">
    <SettingsNav v-model="nav" :embedded="embedded" />
    <ScrollArea class="flex-1 min-h-0">
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
</template>
