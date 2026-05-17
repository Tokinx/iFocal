<template>
  <div class="rounded-1xl border border-olive-200 bg-white shadow-xs overflow-hidden">
    <div class="flex items-center justify-between gap-2 px-3 py-2 bg-olive-50/60 border-b border-olive-200">
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="ifocal-drag-handle cursor-grab text-olive-400 hover:text-olive-600"
          title="拖动排序">
          <Icon icon="ri:drag-move-2-line" class="h-4 w-4" />
        </span>
        <Icon :icon="card.kind === 'machine' ? 'ri:translate-2' : 'proicons:sparkle-2'"
          :class="['h-4 w-4 shrink-0', card.kind === 'machine' ? 'text-emerald-600' : 'text-amber-700']" />
        <span class="truncate text-sm font-medium text-olive-700">{{ title }}</span>
      </div>
      <div class="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" class="h-7 w-7 text-olive-500 hover:bg-olive-100"
          :disabled="card.collapsed || runtime.loading"
          title="刷新" @click="$emit('refresh', card.id)">
          <Icon icon="ri:refresh-line" class="h-4 w-4" :class="runtime.loading ? 'animate-spin' : ''" />
        </Button>
        <Button variant="ghost" size="icon" class="h-7 w-7 text-olive-500 hover:bg-olive-100"
          :title="card.collapsed ? '展开' : '折叠'" @click="$emit('toggleCollapsed', card.id)">
          <Icon :icon="card.collapsed ? 'ri:arrow-down-s-line' : 'ri:arrow-up-s-line'" class="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" class="h-7 w-7 text-olive-500 hover:bg-olive-100"
          v-if="runtime.result"
          title="复制" @click="copyResult">
          <Icon icon="ri:file-copy-line" class="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" class="h-7 w-7 text-olive-500 hover:text-red-500 hover:bg-red-50"
          title="移除" @click="$emit('remove', card.id)">
          <Icon icon="ri:close-line" class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <div v-if="!card.collapsed" class="px-3 py-3 min-h-[64px] text-sm leading-relaxed">
      <div v-if="runtime.loading" class="flex items-center gap-2 text-olive-400">
        <span class="ifocal-loading"
          style="--ifocal-loading-size: 14px; --ifocal-loading-stroke: 2px; --ifocal-loading-color: currentColor;" />
        <span class="shimmer-text">翻译中…</span>
      </div>
      <div v-else-if="runtime.error" class="text-red-500 whitespace-pre-wrap">
        {{ runtime.error }}
      </div>
      <div v-else-if="runtime.result" class="whitespace-pre-wrap text-olive-800">
        {{ runtime.result }}
      </div>
      <div v-else class="text-olive-400 text-xs">
        点击「翻译」或「刷新」获取结果
      </div>
      <div v-if="runtime.durationMs > 0 && !runtime.loading"
        class="mt-2 text-[11px] text-olive-400">
        {{ (runtime.durationMs / 1000).toFixed(2) }}s
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import type { TranslateCardItem, TranslateCardRuntime } from '../useTranslatePage'

const props = defineProps<{
  card: TranslateCardItem
  runtime: TranslateCardRuntime
  title: string
}>()

defineEmits<{
  (e: 'refresh', id: string): void
  (e: 'toggleCollapsed', id: string): void
  (e: 'remove', id: string): void
}>()

async function copyResult() {
  try { await navigator.clipboard.writeText(props.runtime.result) } catch { /* ignore */ }
}
</script>
