<template>
  <div class="relative inline-block w-full" ref="root">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { provide, ref, watch } from 'vue';
import type { SelectContext, SelectOption } from './context';
import { SelectCtxKey } from './context';

const props = defineProps<{ modelValue: string | number | null; placeholder?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string | number | null): void }>();

const value = ref<string | number | null>(props.modelValue ?? null);
watch(() => props.modelValue, v => { value.value = v ?? null; });

const open = ref(false);
const options = ref<SelectOption[]>([]);
const highlight = ref(-1);

function setValue(v: string | number) {
  value.value = v;
  emit('update:modelValue', v);
}

function toggle() {
  open.value = !open.value;
  if (open.value) syncHighlight();
}

function close() {
  open.value = false;
  highlight.value = -1;
}

function setHighlight(i: number) {
  highlight.value = i;
}

function moveHighlight(delta: number) {
  if (!options.value.length) return;
  let next = highlight.value;
  if (next < 0) next = options.value.findIndex(o => String(o.value) === String(value.value));
  if (next < 0) next = 0;
  next = (next + delta + options.value.length) % options.value.length;
  highlight.value = next;
}

function commitHighlight() {
  if (highlight.value >= 0 && highlight.value < options.value.length) {
    setValue(options.value[highlight.value].value);
    close();
  }
}

function register(opt: SelectOption) {
  const existing = options.value.findIndex(o => String(o.value) === String(opt.value));
  let idx = existing;
  if (existing >= 0) {
    options.value.splice(existing, 1, opt);
  } else {
    options.value.push(opt);
    idx = options.value.length - 1;
  }
  if (String(opt.value) === String(value.value)) {
    highlight.value = idx;
  } else if (open.value && highlight.value === -1) {
    highlight.value = idx;
  }
  return idx;
}

function syncHighlight() {
  const idx = options.value.findIndex(o => String(o.value) === String(value.value));
  highlight.value = idx >= 0 ? idx : (options.value.length ? 0 : -1);
}

provide<SelectContext>(SelectCtxKey, {
  modelValue: value,
  setValue,
  open,
  toggle,
  close,
  highlight,
  setHighlight,
  moveHighlight,
  commitHighlight,
  options,
  register
});

const root = ref<HTMLElement | null>(null);
</script>
