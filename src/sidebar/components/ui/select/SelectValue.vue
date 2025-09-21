<template>
  <span class="truncate">
    {{ label || props.placeholder || '' }}
  </span>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { SelectCtxKey } from './context';
const props = defineProps<{ placeholder?: string }>();
const ctx = inject(SelectCtxKey)!;
const label = computed(() => {
  const v = ctx.modelValue.value;
  const it = ctx.options.value.find(o => String(o.value) === String(v));
  return it?.label || '';
});
</script>

