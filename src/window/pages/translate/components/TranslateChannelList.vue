<template>
  <div class="flex h-full min-h-0 flex-col gap-2">
    <ScrollArea ref="scrollAreaRef" class="flex-1 min-h-0 relative">
      <draggable v-model="modelValueLocal" item-key="id" handle=".ifocal-drag-handle" :animation="180"
        ghost-class="ifocal-drag-ghost" class="space-y-2" @end="onDragEnd">
        <template #item="{ element }">
          <TranslateChannelCard :card="element" :runtime="ensureRuntime(element.id)" :title="titles[element.id] || ''"
            :subtitle="subtitles?.[element.id] || ''" @refresh="(id) => $emit('refresh', id)"
            @toggleCollapsed="(id) => $emit('toggleCollapsed', id)" @remove="(id) => $emit('remove', id)" />
        </template>
      </draggable>

      <div v-if="modelValueLocal.length === 0" class="text-center text-sm text-slate-400 py-12">
        请通过顶部「添加翻译渠道」按钮添加一个渠道开始
      </div>
      <div v-show="!atBottom"
        class="h-8 bg-gradient-to-t from-slate-50 to-transparent absolute bottom-0 left-0 right-0 pointer-events-none transition-opacity">
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null)
const atBottom = ref(false)
let viewportEl: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null

function updateAtBottom() {
  if (!viewportEl) return
  const { scrollTop, clientHeight, scrollHeight } = viewportEl
  // 内容不足以滚动时，视为已到底部，隐藏渐变
  if (scrollHeight <= clientHeight + 1) {
    atBottom.value = true
    return
  }
  atBottom.value = scrollTop + clientHeight >= scrollHeight - 1
}

function resolveViewport(): HTMLElement | null {
  const root = (scrollAreaRef.value as unknown as { $el?: HTMLElement } | null)?.$el
  if (!root) return null
  return root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
}

onMounted(async () => {
  await nextTick()
  viewportEl = resolveViewport()
  if (!viewportEl) return
  viewportEl.addEventListener('scroll', updateAtBottom, { passive: true })
  resizeObserver = new ResizeObserver(() => updateAtBottom())
  resizeObserver.observe(viewportEl)
  for (const child of Array.from(viewportEl.children)) {
    resizeObserver.observe(child as Element)
  }
  updateAtBottom()
})

onBeforeUnmount(() => {
  if (viewportEl) viewportEl.removeEventListener('scroll', updateAtBottom)
  resizeObserver?.disconnect()
  resizeObserver = null
  viewportEl = null
})

watch(
  () => props.cards,
  async () => {
    await nextTick()
    updateAtBottom()
  },
  { deep: true },
)
</script>

<style scoped>
.ifocal-drag-ghost {
  opacity: 0.4;
  background: rgba(180, 130, 60, 0.08);
}
</style>
