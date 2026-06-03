<template>
  <section class="mt-2 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/75 bg-white shadow-xs">
    <header class="flex h-8 items-center gap-2 border-b border-slate-100 px-2 text-xs text-slate-500">
      <Icon icon="ri:history-line" class="h-4 w-4" />
      <span class="font-medium text-slate-600">历史记录</span>
      <span class="ml-auto tabular-nums">{{ records.length }}</span>
    </header>
    <ScrollArea :class="compact ? 'h-32' : 'h-48'">
      <div v-if="records.length" class="divide-y divide-slate-100">
        <button v-for="record in records" :key="record.id" type="button"
          class="block w-full px-2 py-2 text-left transition-colors hover:bg-slate-50"
          :class="record.id === activeRecordId ? 'bg-blue-50/70' : ''"
          @click="$emit('restore', record.id)">
          <div class="flex items-center gap-2 text-[11px] text-slate-400">
            <span>{{ formatTime(record.createdAt) }}</span>
            <span class="h-1 w-1 rounded-full bg-slate-300" />
            <span>{{ record.sourceLang }} → {{ record.targetLang }}</span>
            <span class="ml-auto tabular-nums">{{ record.cards.length }} 渠道</span>
          </div>
          <div class="mt-1 truncate text-xs font-medium text-slate-700" :title="record.sourceText">
            {{ record.sourceText }}
          </div>
        </button>
      </div>
      <div v-else class="px-3 py-6 text-center text-xs text-slate-400">
        暂无历史记录
      </div>
    </ScrollArea>
  </section>
</template>

<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TranslateHistoryRecord } from '../useTranslatePage'

defineProps<{
  records: TranslateHistoryRecord[]
  activeRecordId: string
  compact?: boolean
}>()

defineEmits<{
  (e: 'restore', recordId: string): void
}>()

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff >= 0 && diff < 60000) return '刚刚'
  if (diff >= 0 && diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff >= 0 && diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>
