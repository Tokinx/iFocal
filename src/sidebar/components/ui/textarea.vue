<template>
  <textarea
    v-bind="attrs"
    :class="[
      'flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      props.class ?? ''
    ]"
  />
</template>

<script setup lang="ts">
import { useAttrs } from 'vue';

const props = defineProps<{ class?: string }>();
const attrs = useAttrs();
</script>
