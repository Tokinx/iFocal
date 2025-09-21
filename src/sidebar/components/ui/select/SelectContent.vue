<template>
  <div
    v-if="ctx.open.value"
    ref="menu"
    class="absolute z-50 mt-1 w-full rounded-md border bg-popover text-foreground shadow-md"
    role="listbox"
  >
    <div class="max-h-60 overflow-auto py-1">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { SelectCtxKey } from './context';

const ctx = inject(SelectCtxKey);
if (!ctx) throw new Error('SelectContent must be used within Select');

const menu = ref<HTMLElement | null>(null);

function handleDocumentMouseDown(event: MouseEvent) {
  const root = menu.value?.parentElement;
  if (!root) return;
  if (!root.contains(event.target as Node)) ctx.close();
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentMouseDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown, true);
});
</script>
