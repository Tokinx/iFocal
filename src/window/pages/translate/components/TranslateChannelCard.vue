<template>
  <div class="rounded-xl bg-white shadow-xs relative z-0">
    <div class="sticky top-0 z-10 bg-white">
      <div class="flex items-center justify-between gap-2 p-1.5 bg-olive-50/95 border backdrop-blur-sm rounded-t-xl"
        :class="card.collapsed ? 'rounded-b-xl' : 'border-b border-olive-200'">
        <div class="flex items-center gap-1.5 min-w-0">
          <Tooltip>
            <TooltipTrigger as-child>
              <span class="ifocal-drag-handle cursor-grab text-olive-400 hover:text-olive-600">
                <Icon icon="ri:drag-move-2-line" class="h-4 w-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent>拖动排序</TooltipContent>
          </Tooltip>
          <Icon :icon="card.kind === 'machine' ? 'ri:translate-2' : 'proicons:sparkle-2'"
            :class="['h-4 w-4 shrink-0', card.kind === 'machine' ? 'text-emerald-600' : 'text-amber-700']" />
          <Tooltip v-if="subtitle" :delay-duration="100">
            <TooltipTrigger as-child>
              <span class="truncate text-sm font-medium text-olive-700 cursor-default">{{ title }}</span>
            </TooltipTrigger>
            <TooltipContent>{{ subtitle }}</TooltipContent>
          </Tooltip>
          <span v-else class="truncate text-sm font-medium text-olive-700">{{ title }}</span>
        </div>
        <div class="flex items-center gap-0.5">
          <Tooltip v-if="!card.collapsed && (runtime.result || runtime.error)">
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="h-6 w-6 rounded-lg text-olive-500 hover:bg-olive-100"
                :disabled="runtime.loading" @click="$emit('refresh', card.id)">
                <Icon icon="ri:refresh-line" class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新</TooltipContent>
          </Tooltip>
          <Tooltip v-if="!card.collapsed && (runtime.result || runtime.error)">
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="h-6 w-6 rounded-lg text-olive-500 hover:bg-olive-100"
                @click="copyResult">
                <Icon icon="ri:file-copy-line" class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>复制</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon" class="h-6 w-6 rounded-lg text-olive-500 hover:bg-olive-100"
                @click="$emit('toggleCollapsed', card.id)">
                <Icon :icon="card.collapsed ? 'ri:arrow-down-s-line' : 'ri:arrow-up-s-line'" class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ card.collapsed ? '展开' : '折叠' }}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="icon"
                class="h-6 w-6 rounded-lg text-olive-500 hover:text-red-500 hover:bg-red-50"
                @click="$emit('remove', card.id)">
                <Icon icon="ri:close-line" class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>移除</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>

    <div v-if="!card.collapsed"
      class="p-2.5 text-sm leading-relaxed rounded-b-xl border border-t-0 border-olive-200">
      <div v-if="runtime.loading" class="flex items-center text-xs gap-2 text-olive-400">
        <span class="shimmer-text">正在翻译...</span>
      </div>
      <div v-else-if="runtime.error" class="text-xs text-red-500 whitespace-pre-wrap">
        {{ runtime.error }}
      </div>
      <div v-else-if="runtime.result" class="whitespace-pre-wrap text-olive-800">
        {{ runtime.result }}
      </div>
      <div v-else class="text-olive-400 text-xs">
        翻译结果
      </div>

      <div v-if="runtime.durationMs > 0 && !runtime.loading" class="mt-1 text-[11px] text-olive-400">
        {{ (runtime.durationMs / 1000).toFixed(2) }}s
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TranslateCardItem, TranslateCardRuntime } from '../useTranslatePage'

const props = defineProps<{
  card: TranslateCardItem
  runtime: TranslateCardRuntime
  title: string
  subtitle?: string
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
