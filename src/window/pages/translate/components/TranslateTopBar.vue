<template>
  <header class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="h-8 rounded-xl px-3 bg-white hover:bg-slate-50">
            <span class="truncate text-sm">{{ sourceLangLabel }}</span>
            <Icon icon="ri:arrow-down-s-line" class="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="min-w-36 max-h-80 overflow-auto">
          <DropdownMenuItem v-for="lang in sourceLangOptions" :key="lang.value" class="cursor-pointer"
            @click="$emit('update:sourceLang', lang.value)">
            <span class="truncate">{{ lang.label }}</span>
            <Icon v-if="sourceLang === lang.value" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="h-6 w-6 rounded-lg text-slate-600 hover:bg-slate-100 -mx-1"
            :disabled="sourceLang === 'auto'" @click="$emit('swapLanguages')">
            <Icon icon="ri:arrow-left-right-line" class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>转换语言</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="h-8 rounded-xl px-3 bg-white hover:bg-slate-50">
            <span class="truncate text-sm">{{ targetLangLabel }}</span>
            <Icon icon="ri:arrow-down-s-line" class="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="min-w-36 max-h-80 overflow-auto">
          <DropdownMenuItem v-for="lang in targetLangOptions" :key="lang.value" class="cursor-pointer"
            @click="$emit('update:targetLang', lang.value)">
            <span class="truncate">{{ lang.label }}</span>
            <Icon v-if="targetLang === lang.value" icon="ri:check-line" class="ml-auto h-4 w-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button class="h-8 rounded-xl bg-blue-700 text-white hover:bg-blue-800" :disabled="disabled"
        @click="$emit('translate')">
        <Icon icon="ri:translate-2" class="h-4 w-4" />
        翻译
      </Button>
    </div>

    <div class="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" :aria-pressed="autoTranslate" :class="[
            'h-7 w-7 rounded-lg border border-slate-200',
            autoTranslate ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200' : 'text-slate-600 hover:bg-slate-100',
          ]" @click="$emit('update:autoTranslate', !autoTranslate)">
            <Icon icon="proicons:bolt" class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {{ autoTranslate ? '已开启自动翻译' : '自动翻译（输入停顿后自动触发）' }}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" :aria-pressed="watchClipboard" :class="[
            'h-7 w-7 rounded-lg border border-slate-200',
            watchClipboard ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200' : 'text-slate-600 hover:bg-slate-100',
          ]" @click="$emit('update:watchClipboard', !watchClipboard)">
            <Icon icon="ri:clipboard-line" class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {{ watchClipboard ? '已开启剪贴板监听' : '监听剪贴板（窗口聚焦时自动填入）' }}
        </TooltipContent>
      </Tooltip>

      <div class="h-5 w-px bg-slate-200" />

      <AddChannelDropdown :machine-channels="machineChannels" :grouped-ai-models="groupedAiModels" :cards="cards"
        @add="(kind, ref) => $emit('addChannel', kind, ref)">
        <template #trigger>
          <Button variant="ghost" size="icon" title="添加翻译渠道"
            class="h-7 w-7 rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-200">
            <Icon icon="ri:add-line" class="h-4 w-4" />
          </Button>
        </template>
      </AddChannelDropdown>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import AddChannelDropdown from './AddChannelDropdown.vue'
import type { MachineTranslateChannel } from '@/shared/machine-translation'
import type { TranslateCardItem, TranslateCardKind, TranslateLanguageOption } from '../useTranslatePage'

const props = defineProps<{
  sourceLang: string
  targetLang: string
  sourceLangOptions: TranslateLanguageOption[]
  targetLangOptions: TranslateLanguageOption[]
  disabled?: boolean
  watchClipboard: boolean
  autoTranslate: boolean
  machineChannels: MachineTranslateChannel[]
  groupedAiModels: Record<string, Array<{ key: string; channel: string; model: string }>>
  cards: TranslateCardItem[]
}>()

defineEmits<{
  (e: 'update:sourceLang', value: string): void
  (e: 'update:targetLang', value: string): void
  (e: 'update:watchClipboard', value: boolean): void
  (e: 'update:autoTranslate', value: boolean): void
  (e: 'swapLanguages'): void
  (e: 'translate'): void
  (e: 'addChannel', kind: TranslateCardKind, ref: string): void
}>()

const sourceLangLabel = computed(() => {
  return props.sourceLangOptions.find((l) => l.value === props.sourceLang)?.label || '自动检测'
})

const targetLangLabel = computed(() => {
  return props.targetLangOptions.find((l) => l.value === props.targetLang)?.label || props.targetLang
})
</script>
