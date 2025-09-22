<template>
  <button
    v-bind="attrs"
    :class="[
      'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2',
      props.block ? 'w-full' : '',
      props.class ?? ''
    ]"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { useAttrs } from 'vue';

const props = defineProps<{ class?: string; block?: boolean }>();
const attrs = useAttrs();
</script>

