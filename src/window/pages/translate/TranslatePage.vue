<template>
  <TooltipProvider :delay-duration="200">
    <div class="flex flex-col h-full min-h-0 rounded-1xl bg-white border border-olive-300/60 shadow-xs overflow-hidden">
      <TranslateTopBar
        :source-lang="store.sourceLang.value"
        :target-lang="store.targetLang.value"
        :source-lang-options="store.sourceLangOptions.value"
        :target-lang-options="store.targetLangOptions.value"
        :disabled="!store.sourceText.value.trim()"
        :watch-clipboard="store.watchClipboard.value"
        :auto-translate="store.autoTranslate.value"
        :machine-channels="store.machineChannels.value"
        :grouped-ai-models="store.groupedAiModels.value"
        :cards="store.cards.value"
        @update:sourceLang="(v) => (store.sourceLang.value = v)"
        @update:targetLang="(v) => (store.targetLang.value = v)"
        @update:watchClipboard="(v) => (store.watchClipboard.value = v)"
        @update:autoTranslate="(v) => (store.autoTranslate.value = v)"
        @swapLanguages="store.swapLanguages"
        @translate="store.translateAll"
        @addChannel="store.addCard" />

      <div ref="bodyEl" class="flex flex-1 min-h-0 gap-3 p-2"
        :class="isCompact ? 'flex-col' : 'flex-row'">
        <div :class="isCompact ? 'shrink-0 w-full' : 'w-1/2 min-w-0'">
          <TranslateSourcePanel
            :compact="isCompact"
            :model-value="store.sourceText.value"
            @update:modelValue="(v) => (store.sourceText.value = v)"
            @translate="store.translateAll" />
        </div>
        <div :class="isCompact ? 'flex-1 min-h-0 w-full' : 'w-1/2 min-w-0'">
          <TranslateChannelList
            :cards="store.cards.value"
            :titles="store.cardTitleMap.value"
            :subtitles="store.cardSubtitleMap.value"
            :ensure-runtime="store.ensureRuntime"
            @reorder="store.reorderCards"
            @refresh="store.refreshCard"
            @toggleCollapsed="store.toggleCardCollapsed"
            @remove="store.removeCard" />
        </div>
      </div>
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import TranslateTopBar from './components/TranslateTopBar.vue'
import TranslateSourcePanel from './components/TranslateSourcePanel.vue'
import TranslateChannelList from './components/TranslateChannelList.vue'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useTranslatePage } from './useTranslatePage'

const store = useTranslatePage()

const bodyEl = ref<HTMLDivElement | null>(null)
const { width } = useElementSize(bodyEl)
const isCompact = computed(() => width.value > 0 && width.value < 640)

onMounted(() => {
  void store.loadAll()
})
</script>
