<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  defaultChecked?: boolean
  modelValue?: boolean
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const checked = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultChecked ?? false
})
</script>

<template>
  <input
    type="checkbox"
    v-model="checked"
    :class="cn('h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', props.class)"
  />
  
</template>

