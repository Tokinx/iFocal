<template>
  <button
    type="button"
    :class="[
      'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      props.class ?? ''
    ]"
    @click="ctx.toggle()"
    @keydown="handleKeydown"
  >
    <slot />
    <svg class="ml-2 h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clip-rule="evenodd"/></svg>
  </button>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { SelectCtxKey } from './context';

const props = defineProps<{ class?: string }>();
const ctx = inject(SelectCtxKey);
if (!ctx) throw new Error('SelectTrigger must be used within Select');

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!ctx.open.value) ctx.toggle();
    ctx.moveHighlight(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!ctx.open.value) ctx.toggle();
    ctx.moveHighlight(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    ctx.commitHighlight();
  } else if (event.key === 'Escape') {
    ctx.close();
  }
}
</script>
