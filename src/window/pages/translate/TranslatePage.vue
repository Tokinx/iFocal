<template>
  <TooltipProvider :delay-duration="200">
    <div class="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-xl border-4 border-[#faf8f5] bg-white p-2
      [&>header]:min-h-11 [&>header]:border-b [&>header]:border-stone-700/10 [&>header]:px-0.5 [&>header]:pb-2">
      <TranslateTopBar class="shrink-0" :source-lang="store.sourceLang.value" :target-lang="store.targetLang.value"
        :source-lang-options="store.sourceLangOptions.value" :target-lang-options="store.targetLangOptions.value"
        :disabled="!store.sourceText.value.trim()" :watch-clipboard="store.watchClipboard.value"
        :auto-translate="store.autoTranslate.value" :machine-channels="store.machineChannels.value"
        :grouped-ai-models="store.groupedAiModels.value" :cards="store.cards.value"
        @update:sourceLang="(v) => (store.sourceLang.value = v)"
        @update:targetLang="(v) => (store.targetLang.value = v)"
        @update:watchClipboard="(v) => (store.watchClipboard.value = v)"
        @update:autoTranslate="(v) => (store.autoTranslate.value = v)" @swapLanguages="store.swapLanguages"
        @translate="store.translateAll" @addChannel="store.addCard" />
      <div class="flex flex-1 min-h-0 gap-2" :class="isCompact ? 'flex-col' : 'flex-row'">
        <div :class="isCompact
          ? 'shrink-0 w-full min-w-0 flex flex-col'
          : 'w-0 flex-1 min-w-0 flex flex-col min-h-0'">
          <TranslateSourcePanel :compact="isCompact" :model-value="store.sourceText.value"
            @update:modelValue="(v) => (store.sourceText.value = v)" @translate="store.translateAll"
            :class="isCompact ? 'shrink-0' : 'flex-1 min-h-0'" />
        </div>
        <div :class="isCompact
          ? 'flex-1 min-h-0 w-full min-w-0 flex flex-col'
          : 'w-0 flex-1 min-w-0 flex flex-col min-h-0'">
          <TranslateChannelList :cards="store.cards.value" :titles="store.cardTitleMap.value"
            :subtitles="store.cardSubtitleMap.value" :ensure-runtime="store.ensureRuntime" @reorder="store.reorderCards"
            @refresh="store.refreshCard" @toggleCollapsed="store.toggleCardCollapsed" @remove="store.removeCard"
            class="flex-1 min-h-0" />
        </div>
      </div>
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useElementSize } from '@vueuse/core'
import TranslateTopBar from './components/TranslateTopBar.vue'
import TranslateSourcePanel from './components/TranslateSourcePanel.vue'
import TranslateChannelList from './components/TranslateChannelList.vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TRANSLATE_HISTORY_RESTORE_EVENT, useTranslatePage } from './useTranslatePage'

const store = useTranslatePage()
let loadPromise: Promise<void> | null = null

const { width } = useElementSize(document.body)
const isCompact = computed(() => width.value > 0 && width.value < 640)

async function handleSidebarHistoryRestore(event: Event) {
  const recordId = String((event as CustomEvent<{ recordId?: string }>).detail?.recordId || '')
  if (!recordId) return
  await loadPromise
  store.restoreHistory(recordId)
}

onMounted(() => {
  window.addEventListener(TRANSLATE_HISTORY_RESTORE_EVENT, handleSidebarHistoryRestore)
  loadPromise = store.loadAll()
})

onBeforeUnmount(() => window.removeEventListener(TRANSLATE_HISTORY_RESTORE_EVENT, handleSidebarHistoryRestore))
</script>
