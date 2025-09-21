import type { InjectionKey, Ref } from 'vue';

export type SelectOption = { value: string | number; label: string };

export interface SelectContext {
  modelValue: Ref<string | number | null>;
  setValue: (v: string | number) => void;
  open: Ref<boolean>;
  toggle: () => void;
  close: () => void;
  highlight: Ref<number>;
  setHighlight: (i: number) => void;
  moveHighlight: (delta: number) => void;
  commitHighlight: () => void;
  options: Ref<SelectOption[]>;
  register: (opt: SelectOption) => number; // returns index
}

export const SelectCtxKey: InjectionKey<SelectContext> = Symbol('SelectCtx');
