<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const props = defineProps<{
  class?: HTMLAttributes['class']
  defaultChecked?: boolean
  modelValue?: boolean
  disabled?: boolean
  id?: string
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
  <SwitchRoot
    v-model="checked"
    :id="props.id"
    :disabled="props.disabled"
    :class="cn(
      'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      props.class
    )"
  >
    <SwitchThumb
      :class="cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
      )"
    />
  </SwitchRoot>
</template>

