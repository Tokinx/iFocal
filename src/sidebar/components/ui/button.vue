<template>
  <button
    v-bind="attrs"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background',
      sizeClass,
      variantClass,
      block ? 'w-full' : '',
      classes
    ]"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
type Size = 'default' | 'sm' | 'lg' | 'icon';

const props = defineProps<{ class?: string; block?: boolean; variant?: Variant; size?: Size; disabled?: boolean }>();
const attrs = useAttrs();

const classes = computed(() => props.class ?? '');
const disabled = computed(() => !!props.disabled);
const block = computed(() => !!props.block);

const sizeClass = computed(() => {
  const m = props.size ?? 'default';
  if (m === 'sm') return 'h-9 px-3 py-1.5 text-sm';
  if (m === 'lg') return 'h-11 px-5 py-3 text-base';
  if (m === 'icon') return 'h-10 w-10';
  return 'h-10 px-3 py-2 text-sm';
});

const variantClass = computed(() => {
  const v = props.variant ?? 'default';
  if (v === 'secondary') return 'bg-secondary text-foreground hover:bg-secondary/80 border border-border';
  if (v === 'destructive') return 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
  if (v === 'outline') return 'border border-input bg-background hover:bg-accent hover:text-foreground';
  if (v === 'ghost') return 'hover:bg-accent hover:text-foreground';
  if (v === 'link') return 'text-primary underline-offset-4 hover:underline';
  return 'bg-primary text-primary-foreground hover:bg-primary/90';
});
</script>

