<template>
  <div
    :class="[
      'px-3 py-2 cursor-pointer text-sm',
      selected ? 'bg-accent' : (highlighted ? 'bg-accent/70' : ''),
      disabled ? 'opacity-50 pointer-events-none' : ''
    ]"
    role="option"
    :aria-selected="selected"
    @mouseenter="onHover"
    @mouseleave="ctx.setHighlight(-1)"
    @click="choose"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref, useSlots } from 'vue';
import { SelectCtxKey } from './context';
const props = defineProps<{ value: string | number; disabled?: boolean }>();
const ctx = inject(SelectCtxKey);
if (!ctx) throw new Error('SelectItem must be used within Select');

const slots = useSlots();
const index = ref(-1);

onMounted(() => {
  if (props.disabled) return;
  const label = extractLabel();
  index.value = ctx.register({ value: props.value, label });
});

const selected = computed(() => String(props.value) === String(ctx.modelValue.value));
const disabled = computed(() => !!props.disabled);
const highlighted = computed(() => ctx.highlight.value === index.value);

function extractLabel(): string {
  const nodes = slots.default?.() ?? [];
  return nodes.map(n => (typeof n.children === 'string' ? n.children : '')).join('').trim() || String(props.value);
}

function choose(){
  if (disabled.value) return;
  ctx.setValue(props.value);
  ctx.close();
}

function onHover(){
  if (disabled.value) return;
  if (index.value >= 0) ctx.setHighlight(index.value);
}
</script>

