<template>
  <article class="group w-full" :aria-busy="runtime.loading">
    <div class="flex min-h-7 items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger as-child>
            <button
              type="button"
              class="ifocal-drag-handle grid h-6 w-5 shrink-0 cursor-grab place-items-center rounded-md text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100 max-[760px]:opacity-100"
              aria-label="拖动排序"
            >
              <Icon icon="ri:drag-move-2-line" class="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>拖动排序</TooltipContent>
        </Tooltip>

        <Icon
          :icon="card.kind === 'machine' ? 'ri:translate-2' : 'proicons:sparkle-2'"
          :class="['h-4 w-4 shrink-0', card.kind === 'machine' ? 'text-emerald-700' : 'text-stone-700']"
        />
        <Tooltip v-if="subtitle" :delay-duration="100">
          <TooltipTrigger as-child>
            <span class="truncate text-xs font-medium text-slate-600">{{ title }}</span>
          </TooltipTrigger>
          <TooltipContent>{{ subtitle }}</TooltipContent>
        </Tooltip>
        <span v-else class="truncate text-xs font-medium text-slate-600">{{ title }}</span>
        <span v-if="runtime.durationMs > 0 && !runtime.loading" class="shrink-0 text-[11px] text-slate-400">
          {{ (runtime.durationMs / 1000).toFixed(2) }}s
        </span>
      </div>

      <div
        class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-[760px]:opacity-100"
      >
        <Tooltip v-if="!card.collapsed && (runtime.result || runtime.error)">
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 rounded-lg text-slate-400 hover:bg-slate-100"
              :disabled="runtime.loading"
              @click="emit('refresh', card.id)"
            >
              <Icon icon="ri:refresh-line" class="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重新翻译</TooltipContent>
        </Tooltip>
        <Tooltip v-if="!card.collapsed && runtime.result">
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 rounded-lg text-slate-400 hover:bg-slate-100"
              @click="copyResult"
            >
              <Icon icon="ri:file-copy-line" class="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>复制译文</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 rounded-lg text-slate-400 hover:bg-slate-100"
              @click="emit('toggleCollapsed', card.id)"
            >
              <Icon :icon="card.collapsed ? 'ri:arrow-down-s-line' : 'ri:arrow-up-s-line'" class="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ card.collapsed ? '展开' : '折叠' }}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
              @click="emit('remove', card.id)"
            >
              <Icon icon="ri:close-line" class="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>移除渠道</TooltipContent>
        </Tooltip>
      </div>
    </div>

    <div v-if="!card.collapsed" class="w-full pl-[2.6rem] pt-1 text-sm leading-relaxed">
      <div v-if="runtime.loading" class="py-1">
        <span class="shimmer-text text-xs">正在翻译...</span>
      </div>
      <div v-else-if="runtime.error" class="whitespace-pre-wrap text-red-600">{{ runtime.error }}</div>
      <div v-else-if="runtime.result" class="whitespace-pre-wrap text-slate-800">{{ runtime.result }}</div>
      <div v-else class="text-xs text-slate-400">译文会显示在这里</div>
    </div>
  </article>
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

const emit = defineEmits<{
  (e: 'refresh', id: string): void
  (e: 'toggleCollapsed', id: string): void
  (e: 'remove', id: string): void
}>()

async function copyResult() {
  try {
    await navigator.clipboard.writeText(props.runtime.result)
  } catch {
    // Clipboard access can be denied in restricted browser contexts.
  }
}
</script>
