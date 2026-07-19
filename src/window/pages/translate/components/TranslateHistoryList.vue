<template>
  <section class="mt-2 flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/75 bg-white shadow-xs">
    <header
      :class="['flex h-8 items-center gap-2 border-slate-100 px-2 text-xs text-slate-500', isExpand ? 'border-b' : '']"
      @click="isExpand = !isExpand">
      <Icon icon="ri:history-line" class="h-4 w-4" />
      <span class="font-medium text-slate-600">历史记录</span>
      <span class="ml-auto tabular-nums">{{ records.length }}</span>
    </header>
    <ScrollArea :class="[isExpand ? (compact ? 'h-32' : 'h-60') : 'h-0']">
      <div class="flex">
        <div v-if="records.length" class="divide-y divide-slate-100 w-0 flex-1">
          <button v-for="record in records" :key="record.id" type="button"
            class="block w-full px-2 py-2 text-left transition-colors hover:bg-slate-50"
            :class="record.id === activeRecordId ? 'bg-stone-200/70' : ''" @click="$emit('restore', record.id)">
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
      </div>
    </ScrollArea>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TranslateHistoryRecord } from '../useTranslatePage'

const props = defineProps<{
  records: TranslateHistoryRecord[]
  activeRecordId: string
  compact?: boolean
}>()

defineEmits<{
  (e: 'restore', recordId: string): void
}>()

const isExpand = ref(true)

// watch 监听 compact，如果 compact 变为 true，则自动收起历史记录；如果 compact 变为 false，则自动展开历史记录
watch(() => props.compact, (newVal) => {
  if (newVal) {
    isExpand.value = false
  } else {
    isExpand.value = true
  }
}, { immediate: true })

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
