<template>
  <div class="w-full">
    <draggable
      v-model="modelValueLocal"
      item-key="id"
      handle=".ifocal-drag-handle"
      :animation="180"
      ghost-class="ifocal-drag-ghost"
      class="space-y-6"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <TranslateChannelCard
          :card="element"
          :runtime="ensureRuntime(element.id)"
          :title="titles[element.id] || ''"
          :subtitle="subtitles?.[element.id] || ''"
          @refresh="(id) => emit('refresh', id)"
          @toggleCollapsed="(id) => emit('toggleCollapsed', id)"
          @remove="(id) => emit('remove', id)"
        />
      </template>
    </draggable>

    <div v-if="modelValueLocal.length === 0" class="py-12 text-center text-sm text-slate-400">
      请先从输入框左上角选择翻译渠道
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import TranslateChannelCard from './TranslateChannelCard.vue'
import type { TranslateCardItem, TranslateCardRuntime } from '../useTranslatePage'

const props = defineProps<{
  cards: TranslateCardItem[]
  titles: Record<string, string>
  subtitles?: Record<string, string>
  ensureRuntime: (id: string) => TranslateCardRuntime
}>()

const emit = defineEmits<{
  (e: 'reorder', next: TranslateCardItem[]): void
  (e: 'refresh', id: string): void
  (e: 'toggleCollapsed', id: string): void
  (e: 'remove', id: string): void
}>()

const modelValueLocal = computed<TranslateCardItem[]>({
  get: () => props.cards,
  set: (next) => emit('reorder', next),
})

function onDragEnd() {
  emit('reorder', modelValueLocal.value)
}
</script>

<style scoped>
.ifocal-drag-ghost {
  opacity: 0.4;
  background: rgba(180, 130, 60, 0.08);
}
</style>
