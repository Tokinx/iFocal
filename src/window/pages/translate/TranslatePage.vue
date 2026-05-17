<template>
  <div class="flex flex-col h-full min-h-0 rounded-1xl bg-white border border-olive-300/60 shadow-xs overflow-hidden">
    <TranslateTopBar
      :source-lang="store.sourceLang.value"
      :target-lang="store.targetLang.value"
      :source-lang-options="store.sourceLangOptions.value"
      :target-lang-options="store.targetLangOptions.value"
      :disabled="!store.sourceText.value.trim()"
      @update:sourceLang="(v) => (store.sourceLang.value = v)"
      @update:targetLang="(v) => (store.targetLang.value = v)"
      @swapLanguages="store.swapLanguages"
      @translate="store.translateAll" />

    <div class="flex flex-1 min-h-0 gap-3 p-3">
      <div class="w-1/2 min-w-0">
        <TranslateSourcePanel
          :model-value="store.sourceText.value"
          @update:modelValue="(v) => (store.sourceText.value = v)"
          @translate="store.translateAll" />
      </div>
      <div class="w-1/2 min-w-0">
        <TranslateChannelList
          :cards="store.cards.value"
          :titles="store.cardTitleMap.value"
          :machine-channels="store.machineChannels.value"
          :grouped-ai-models="store.groupedAiModels.value"
          :ensure-runtime="store.ensureRuntime"
          @reorder="store.reorderCards"
          @add="store.addCard"
          @refresh="store.refreshCard"
          @toggleCollapsed="store.toggleCardCollapsed"
          @remove="store.removeCard" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import TranslateTopBar from './components/TranslateTopBar.vue'
import TranslateSourcePanel from './components/TranslateSourcePanel.vue'
import TranslateChannelList from './components/TranslateChannelList.vue'
import { useTranslatePage } from './useTranslatePage'

const store = useTranslatePage()

onMounted(() => {
  void store.loadAll()
})
</script>
