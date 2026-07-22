<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        :class="[
          'h-8 min-w-0 shrink-0 rounded-xl border border-slate-300/50 px-3 shadow-xs',
          bgClass,
          blurClass,
          buttonClass,
        ]"
        :aria-label="ariaLabel"
      >
        <span class="truncate text-sm">{{ currentLabel }}</span>
        <Icon icon="ri:arrow-down-s-line" class="h-5 w-5 shrink-0" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :align="align" :class="['max-h-80 min-w-36 overflow-auto', bgClass, blurClass]">
      <DropdownMenuItem
        v-for="option in options"
        :key="option.value"
        class="cursor-pointer"
        @click="emit('update:modelValue', option.value)"
      >
        <span class="truncate">{{ option.label }}</span>
        <Icon v-if="modelValue === option.value" icon="ri:check-line" class="ml-auto h-4 w-4" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/ui/icon/Icon.vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: Array<{ value: string; label: string }>
    fallbackLabel?: string
    align?: 'start' | 'center' | 'end'
    ariaLabel?: string
    bgClass?: string
    blurClass?: string
    buttonClass?: string
  }>(),
  {
    fallbackLabel: '',
    align: 'end',
    ariaLabel: '选择语言',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const currentLabel = computed(() => {
  return (
    props.options.find((option) => option.value === props.modelValue)?.label || props.fallbackLabel || props.modelValue
  )
})
</script>
