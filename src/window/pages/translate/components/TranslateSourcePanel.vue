<template>
  <div class="relative h-full w-full flex flex-col">
    <textarea
      ref="textareaEl"
      :value="modelValue"
      @input="onInput"
      @keydown.enter.exact.prevent="$emit('translate')"
      placeholder="输入或粘贴原文，回车开始翻译"
      class="flex-1 min-h-0 w-full resize-none rounded-1xl border border-olive-200 bg-white p-4 text-sm leading-relaxed shadow-xs outline-none focus:border-amber-700/50" />
    <div class="absolute bottom-2 right-3 flex items-center gap-1 text-[11px] text-olive-400 pointer-events-none">
      <span>{{ charCount }} 字符</span>
    </div>
    <div class="absolute top-2 right-2 flex items-center gap-1">
      <Button v-if="modelValue" variant="ghost" size="icon" class="h-7 w-7 text-olive-500 hover:bg-olive-100"
        title="清空" @click="$emit('update:modelValue', '')">
        <Icon icon="ri:close-line" class="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" class="h-7 w-7 text-olive-500 hover:bg-olive-100"
        title="从剪贴板粘贴" @click="pasteFromClipboard">
        <Icon icon="ri:clipboard-line" class="h-4 w-4" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'translate'): void
}>()

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const charCount = computed(() => props.modelValue.length)

function onInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  emit('update:modelValue', value)
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) emit('update:modelValue', text)
  } catch { /* ignore */ }
}
</script>
