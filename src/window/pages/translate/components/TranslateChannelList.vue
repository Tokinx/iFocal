<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <ScrollArea class="flex-1 min-h-0">
      <draggable
        v-model="modelValueLocal"
        item-key="id"
        handle=".ifocal-drag-handle"
        :animation="180"
        ghost-class="ifocal-drag-ghost"
        class="space-y-3"
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

      <div v-if="modelValueLocal.length === 0" class="text-center text-sm text-olive-400 py-12">
        请添加一个翻译渠道开始
      </div>
    </ScrollArea>

    <div class="shrink-0">
      <AddChannelDropdown
        :machine-channels="machineChannels"
        :grouped-ai-models="groupedAiModels"
        :cards="modelValueLocal"
        @add="(kind, ref) => $emit('add', kind, ref)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { ScrollArea } from '@/components/ui/scroll-area'
import TranslateChannelCard from './TranslateChannelCard.vue'
import AddChannelDropdown from './AddChannelDropdown.vue'
import type { MachineTranslateChannel } from '@/shared/machine-translation'
import type { TranslateCardItem, TranslateCardKind, TranslateCardRuntime } from '../useTranslatePage'

const props = defineProps<{
  cards: TranslateCardItem[]
  titles: Record<string, string>
  subtitles?: Record<string, string>
  machineChannels: MachineTranslateChannel[]
  groupedAiModels: Record<string, Array<{ key: string; channel: string; model: string }>>
  ensureRuntime: (id: string) => TranslateCardRuntime
}>()

const emit = defineEmits<{
  (e: 'reorder', next: TranslateCardItem[]): void
  (e: 'add', kind: TranslateCardKind, ref: string): void
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
