<template>
  <div class="relative" ref="root">
    <button
      type="button"
      :class="[
        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        props.class ?? ''
      ]"
      @click="toggle"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="commit()"
      @keydown.esc.prevent="open=false"
    >
      <span class="truncate">{{ selectedLabel || placeholder }}</span>
      <svg class="ml-2 h-4 w-4 opacity-70" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clip-rule="evenodd"/></svg>
    </button>
    <div v-if="open" class="absolute z-50 mt-1 w-full rounded-md border bg-popover text-foreground shadow-md">
      <ul class="max-h-60 overflow-auto py-1">
        <li
          v-for="(opt, idx) in items"
          :key="`${opt.value}`"
          @click="choose(opt.value)"
          @mousemove="highlight=idx"
          :class="[
            'px-3 py-2 cursor-pointer text-sm',
            isSelected(opt.value) ? 'bg-accent' : (highlight===idx ? 'bg-accent/70' : '')
          ]"
        >
          {{ opt.label }}
        </li>
      </ul>
    </div>
    <select ref="shadow" class="hidden"><slot /></select>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, useAttrs } from 'vue';

type Opt = { value: string | number; label: string };
const props = defineProps<{ modelValue: string | number | null; class?: string; options?: Opt[]; placeholder?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string | number | null): void }>();
const attrs = useAttrs();

const root = ref<HTMLElement | null>(null);
const shadow = ref<HTMLSelectElement | null>(null);
const open = ref(false);
const highlight = ref(-1);
const placeholder = computed(() => props.placeholder ?? 'Select…');

const slotOptions = ref<Opt[]>([]);
function parseShadowOptions() {
  const el = shadow.value;
  if (!el) { slotOptions.value = []; return; }
  const arr: Opt[] = [];
  for (const o of Array.from(el.options)) arr.push({ value: o.value, label: o.textContent || '' });
  slotOptions.value = arr;
}

let observer: MutationObserver | null = null;
onMounted(() => {
  parseShadowOptions();
  if (shadow.value) {
    observer = new MutationObserver(parseShadowOptions);
    observer.observe(shadow.value, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener('mousedown', onDocDown, true);
});
onBeforeUnmount(() => {
  if (observer) { observer.disconnect(); observer = null; }
  document.removeEventListener('mousedown', onDocDown, true);
});

function onDocDown(e: MouseEvent) { if (root.value && !root.value.contains(e.target as Node)) open.value = false; }

const items = computed<Opt[]>(() => Array.isArray(props.options) && props.options.length ? props.options : slotOptions.value);
const selectedLabel = computed(() => {
  const v = props.modelValue;
  const it = items.value.find(i => String(i.value) === String(v));
  return it?.label || '';
});

function toggle(){ open.value = !open.value; if (open.value) syncHighlight(); }
function syncHighlight(){ const idx = items.value.findIndex(i => String(i.value) === String(props.modelValue)); highlight.value = idx >= 0 ? idx : 0; }
function move(delta: number){ if (!open.value) { open.value = true; syncHighlight(); return; } const n = items.value.length; if (!n) return; highlight.value = ( (highlight.value + delta) + n ) % n; }
function commit(){ if (highlight.value >=0 && highlight.value < items.value.length) choose(items.value[highlight.value].value); }
function choose(val: string | number){ emit('update:modelValue', val); open.value = false; }
function isSelected(val: string | number){ return String(val) === String(props.modelValue); }
</script>

