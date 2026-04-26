import { reactive } from 'vue';
import { DEFAULT_PROMPT_TEMPLATES, type PromptTemplates } from '@/shared/ai';

export const PROMPT_TEMPLATES_STORAGE_KEY = 'promptTemplates' as const;

export type Templates = Partial<PromptTemplates>;

export const defaultTemplates: PromptTemplates = { ...DEFAULT_PROMPT_TEMPLATES };
export const promptTemplates = reactive<Templates>({});

export function normalizePromptTemplates(value: unknown): PromptTemplates {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    translate: String(input.translate ?? defaultTemplates.translate).trim() || defaultTemplates.translate,
    chat: String(input.chat ?? defaultTemplates.chat).trim() || defaultTemplates.chat,
    summarize: String(input.summarize ?? defaultTemplates.summarize).trim() || defaultTemplates.summarize,
  };
}

export function initTemplates(initial?: Templates) {
  Object.assign(promptTemplates, normalizePromptTemplates(initial));
}

export async function loadPromptTemplates(): Promise<PromptTemplates> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get([PROMPT_TEMPLATES_STORAGE_KEY], (items: any) => {
        resolve(normalizePromptTemplates(items?.promptTemplates));
      });
    } catch {
      resolve({ ...defaultTemplates });
    }
  });
}

export async function savePromptTemplates(templates?: Templates): Promise<PromptTemplates> {
  const next = normalizePromptTemplates(templates ?? promptTemplates);
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set({ promptTemplates: next }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        Object.assign(promptTemplates, next);
        resolve(next);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function resetPromptTemplates(): Promise<PromptTemplates> {
  const next = { ...defaultTemplates };
  Object.assign(promptTemplates, next);
  return savePromptTemplates(next);
}
