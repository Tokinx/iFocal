<template>
  <ComposerFrame
    :model-value="modelValue"
    :can-send="Boolean(modelValue.trim())"
    :send-disabled="sendDisabled"
    :show-scroll-to-bottom-button="showScrollToBottomButton"
    expand-on-focus
    placeholder="输入或粘贴原文"
    aria-label="输入或粘贴原文"
    @update:modelValue="emit('update:modelValue', $event)"
    @send="emit('translate')"
    @scrollToBottom="emit('scrollToBottom')"
  >
    <template #toolbar>
      <AddChannelDropdown
        :machine-channels="machineChannels"
        :grouped-ai-models="groupedAiModels"
        :cards="cards"
        content-align="start"
        toggleable
        @add="(kind, ref) => emit('addChannel', kind, ref)"
        @remove="(id) => emit('removeChannel', id)"
      >
        <template #trigger>
          <Button
            variant="outline"
            class="h-8 min-w-0 max-w-[13rem] shrink rounded-xl border border-slate-300/50 px-3 font-normal shadow-xs"
            title="选择翻译渠道"
          >
            <Icon icon="ri:translate-2" class="h-4 w-4 shrink-0" />
            <span class="truncate text-sm">{{ channelLabel }}</span>
            <Icon icon="ri:arrow-down-s-line" class="h-5 w-5 shrink-0" />
          </Button>
        </template>
      </AddChannelDropdown>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8 shrink-0 rounded-xl border border-slate-300/50 shadow-xs"
            title="快捷功能"
            aria-label="快捷功能"
          >
            <Icon icon="ri:apps-2-ai-line" class="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-56">
          <div class="space-y-3 p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Icon icon="proicons:bolt" class="h-4 w-4" />
                <span class="text-sm font-medium">自动翻译</span>
              </div>
              <Switch :model-value="autoTranslate" @update:modelValue="emit('update:autoTranslate', !!$event)" />
            </div>
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <Icon icon="ri:clipboard-line" class="h-4 w-4" />
                <span class="text-sm font-medium">监听剪贴板</span>
              </div>
              <Switch :model-value="watchClipboard" @update:modelValue="emit('update:watchClipboard', !!$event)" />
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>

    <template #input-start>
      <Button
        v-if="modelValue"
        variant="ghost"
        size="icon"
        class="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100"
        title="清空原文"
        aria-label="清空原文"
        @click="emit('update:modelValue', '')"
      >
        <Icon icon="ri:eraser-line" class="h-4 w-4" />
      </Button>
      <span class="ml-1 text-[11px] text-slate-400">{{ charCount }} 字符</span>
    </template>
  </ComposerFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import ComposerFrame from '@/window/components/ComposerFrame.vue'
import AddChannelDropdown from './AddChannelDropdown.vue'
import type { MachineTranslateChannel } from '@/shared/machine-translation'
import type { TranslateCardItem, TranslateCardKind } from '../useTranslatePage'

const props = withDefaults(
  defineProps<{
    modelValue: string
    machineChannels: MachineTranslateChannel[]
    groupedAiModels: Record<string, Array<{ key: string; channel: string; model: string }>>
    cards: TranslateCardItem[]
    watchClipboard: boolean
    autoTranslate: boolean
    showScrollToBottomButton?: boolean
    sendDisabled?: boolean
    titles?: Record<string, string>
  }>(),
  {
    showScrollToBottomButton: false,
    sendDisabled: false,
    titles: () => ({}),
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:watchClipboard', value: boolean): void
  (e: 'update:autoTranslate', value: boolean): void
  (e: 'translate'): void
  (e: 'scrollToBottom'): void
  (e: 'addChannel', kind: TranslateCardKind, ref: string): void
  (e: 'removeChannel', id: string): void
}>()

const charCount = computed(() => props.modelValue.length)
const channelLabel = computed(() => {
  if (!props.cards.length) return '选择渠道'
  if (props.cards.length === 1) return props.titles[props.cards[0]!.id] || '翻译渠道'
  return `翻译渠道 · ${props.cards.length}`
})
</script>
