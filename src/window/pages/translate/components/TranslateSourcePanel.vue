<template>
  <div class="relative w-full flex flex-col" :class="compact ? '' : 'h-full'">
    <Textarea v-model="inputValue" @keydown.enter.exact.prevent="$emit('translate')" placeholder="输入或粘贴原文，回车开始翻译"
      :class="[
        'w-full resize-none rounded-xl p-3 text-sm leading-relaxed outline-none',
        compact ? 'h-30' : 'flex-1 min-h-0',
      ]" />
    <div class="absolute bottom-2 right-3 flex items-center gap-1 text-[11px] text-slate-400 pointer-events-none">
      <span>{{ charCount }} 字符</span>
    </div>
    <div class="absolute top-1 right-1 flex items-center gap-1">
      <Button v-if="modelValue" variant="ghost" size="icon" class="h-5 w-5 rounded-lg text-slate-500 hover:bg-slate-100"
        @click="$emit('update:modelValue', '')">
        <Icon icon="ri:close-line" class="h-4 w-4" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  modelValue: string
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'translate'): void
}>()

const inputValue = computed<string>({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

const charCount = computed(() => props.modelValue.length)
</script>
