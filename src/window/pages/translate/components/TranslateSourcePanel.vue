<template>
  <div class="relative w-full flex flex-col"
    :class="compact ? '' : 'h-full'">
    <textarea
      :value="modelValue"
      @input="onInput"
      @keydown.enter.exact.prevent="$emit('translate')"
      placeholder="输入或粘贴原文，回车开始翻译"
      :class="[
        'w-full resize-none rounded-xl border border-olive-200 bg-white p-3 text-sm leading-relaxed shadow-xs outline-none focus:border-amber-700/50',
        compact ? 'min-h-30 max-h-60' : 'flex-1 min-h-0',
      ]" />
    <div class="absolute bottom-2 right-3 flex items-center gap-1 text-[11px] text-olive-400 pointer-events-none">
      <span>{{ charCount }} 字符</span>
    </div>
    <div class="absolute top-1 right-1 flex items-center gap-1">
      <Tooltip v-if="modelValue">
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon" class="h-5 w-5 rounded-lg text-olive-500 hover:bg-olive-100"
            @click="$emit('update:modelValue', '')">
            <Icon icon="ri:close-line" class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>清空</TooltipContent>
      </Tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const props = defineProps<{
  modelValue: string
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'translate'): void
}>()

const charCount = computed(() => props.modelValue.length)

function onInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  emit('update:modelValue', value)
}
</script>
