import { reactive } from 'vue';

export const defaultTemplates = {
  translate: '请将以下内容高质量翻译为{{targetLang}}，只返回译文，不要添加多余说明：\n\n{{text}}',
  chat: '请用{{targetLang}}回复：\n\n{{text}}',
  summarize: '请用{{targetLang}}对以下内容进行简洁准确的要点总结，只返回总结，不要添加多余说明：\n\n{{text}}'
};

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

