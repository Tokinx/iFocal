<template>
  <select
    v-bind="attrs"
    :class="[
      'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      props.class ?? ''
    ]"
    v-model="localValue"
  >
    <slot />
  </select>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

const props = defineProps<{ modelValue: string | number | null; class?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string | number | null): void }>();
const attrs = useAttrs();

const localValue = computed({
  get: () => props.modelValue ?? '',
  set: (value) => emit('update:modelValue', value)
});
</script>
