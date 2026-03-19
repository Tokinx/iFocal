import { reactive } from 'vue';
import { DEFAULT_PROMPT_TEMPLATES, type PromptTemplates } from '@/shared/ai';

export const defaultTemplates: PromptTemplates = { ...DEFAULT_PROMPT_TEMPLATES };

export type Templates = Partial<typeof defaultTemplates>;

export const promptTemplates = reactive<Templates>({});

export function initTemplates(initial?: Templates) {
  Object.assign(promptTemplates, initial || {});
}

export function saveTemplates() {
  try { chrome.storage.sync.set({ promptTemplates: { ...promptTemplates } }); } catch {}
}

export function resetTemplates() {
  Object.assign(promptTemplates, defaultTemplates);
  saveTemplates();
}
