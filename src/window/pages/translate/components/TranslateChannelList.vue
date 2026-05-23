<template>
  <div class="flex h-full min-h-0 flex-col gap-2 -mr-2.5">
    <ScrollArea class="flex-1 min-h-0 pr-2.5">
      <draggable
        v-model="modelValueLocal"
        item-key="id"
        handle=".ifocal-drag-handle"
        :animation="180"
        ghost-class="ifocal-drag-ghost"
        class="space-y-2"
        @end="onDragEnd">
        <template #item="{ element }">
          <TranslateChannelCard
            :card="element"
            :runtime="ensureRuntime(element.id)"
            :title="titles[element.id] || ''"
            :subtitle="subtitles?.[element.id] || ''"
            @refresh="(id) => $emit('refresh', id)"
            @toggleCollapsed="(id) => $emit('toggleCollapsed', id)"
            @remove="(id) => $emit('remove', id)" />
        </template>
      </draggable>

      <div v-if="modelValueLocal.length === 0" class="text-center text-sm text-slate-400 py-12">
        请通过顶部「添加翻译渠道」按钮添加一个渠道开始
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { ScrollArea } from '@/components/ui/scroll-area'
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
