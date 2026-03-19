// 公共 AI 适配与提示词构造工具
import { getLanguageLabel } from '@/shared/config';

export type PromptTemplates = {
  translate: string;
  chat: string;
  summarize: string;
};

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplates = {
  translate: '请先识别输入文本的语言：如果输入语言与{{targetLang}}相同，则翻译为{{prevLang}}；否则翻译为{{targetLang}}。仅返回译文，不要添加解释。\n\n{{text}}',
  chat: '请使用{{targetLang}}回答以下内容：\n\n{{text}}',
  summarize: '请使用{{targetLang}}对以下内容进行简洁准确的要点总结，仅返回总结结果，不要添加额外说明。\n\n{{text}}'
};

function pickTemplate(input: unknown, fallback: string): string {
  const value = String(input ?? '').trim();
  return value || fallback;
}

function resolveTemplate(task: string, templates: Partial<PromptTemplates> | undefined): string {
  const t = templates && typeof templates === 'object' ? templates : {};
  if (task === 'translate') {
    // 智能双向翻译：如果用户输入的是目标语言，则翻译为 prevLang；否则翻译为 targetLang
    return pickTemplate(t.translate, DEFAULT_PROMPT_TEMPLATES.translate);
  }
  if (task === 'chat') return pickTemplate(t.chat, DEFAULT_PROMPT_TEMPLATES.chat);
  if (task === 'summarize') return pickTemplate(t.summarize, DEFAULT_PROMPT_TEMPLATES.summarize);
  return '请基于以下内容给出有帮助的回答：\n\n{{text}}';
}

function renderTemplate(task: string, text: string, lang: string, templates: Partial<PromptTemplates> | undefined, prevLang?: string) {
  const targetCode = (lang || 'zh-CN').trim();
  const prevCode = (prevLang || 'en').trim();
  const targetLabel = getLanguageLabel(targetCode);
  const prevLabel = getLanguageLabel(prevCode);
  const vars: Record<string, string> = {
    '{{targetLang}}': targetLabel || targetCode,
    '{{prevLang}}': prevLabel || prevCode,
    '{{text}}': (text || '').trim()
  };
  const tpl = resolveTemplate(task, templates);
  return Object.keys(vars).reduce((acc, key) => acc.split(key).join(vars[key]), tpl);
}

export function makePrompt(task: string, text: string, lang: string, templates: Partial<PromptTemplates> | undefined, prevLang?: string) {
  return renderTemplate(task, text, lang, templates, prevLang);
}

export function makePromptParts(
  task: string,
  text: string,
  lang: string,
  templates: Partial<PromptTemplates> | undefined,
  prevLang?: string
) {
  const textMarker = '__IFOCAL_USER_TEXT_MARKER__';
  const rendered = renderTemplate(task, textMarker, lang, templates, prevLang);
  const hasMarker = rendered.includes(textMarker);
  const systemPrompt = hasMarker
    ? rendered.split(textMarker).join('').trim()
    : rendered.trim();
  const userPrompt = String(text || '').trim();
  return {
    systemPrompt,
    userPrompt
  };
}

export function makeMessage(
  model: string,
  prompt: string,
  systemPrompt = '',
  context?: Array<{ role: string, content: string }>,
  systemPromptCompatMode = false
) {
  void model;
  const system = String(systemPrompt || '').trim();
  const userPrompt = String(prompt || '');
  const history = Array.isArray(context) ? context : [];

  if (system && !systemPromptCompatMode) {
    return [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: userPrompt }
    ];
  }

  const mergedPrompt = system && systemPromptCompatMode
    ? `${system}\n\n${userPrompt}`
    : userPrompt;
  return [
    ...history,
    { role: 'user', content: mergedPrompt }
  ];
}
