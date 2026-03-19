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

export function makePrompt(task: string, text: string, lang: string, templates: Partial<PromptTemplates> | undefined, prevLang?: string) {
  const t = templates && typeof templates === 'object' ? templates : {};
  const targetCode = (lang || 'zh-CN').trim();
  const prevCode = (prevLang || 'en').trim();
  const targetLabel = getLanguageLabel(targetCode);
  const prevLabel = getLanguageLabel(prevCode);
  const vars: Record<string, string> = {
    '{{targetLang}}': targetLabel || targetCode,
    '{{prevLang}}': prevLabel || prevCode,
    '{{text}}': (text || '').trim()
  };
  let tpl = '';
  if (task === 'translate') {
    // 智能双向翻译：如果用户输入的是目标语言，则翻译为 prevLang；否则翻译为 targetLang
    tpl = pickTemplate(t.translate, DEFAULT_PROMPT_TEMPLATES.translate);
  }
  else if (task === 'chat') tpl = pickTemplate(t.chat, DEFAULT_PROMPT_TEMPLATES.chat);
  else if (task === 'summarize') tpl = pickTemplate(t.summarize, DEFAULT_PROMPT_TEMPLATES.summarize);
  else tpl = '请基于以下内容给出有帮助的回答：\n\n{{text}}';
  return Object.keys(vars).reduce((acc, key) => acc.split(key).join(vars[key]), tpl);
}

export function makeMessage(model: string, prompt: string, systemText = 'You are a helpful assistant.', context?: Array<{role: string, content: string}>) {
  // 如果有上下文，构建多轮对话消息
  if (context && Array.isArray(context) && context.length > 0) {
    return [
      { role: 'system', content: systemText },
      ...context,
      { role: 'user', content: prompt }
    ];
  }
  // 默认将 system 合并到 user 提高兼容性
  return [{ role: 'user', content: `${systemText}\n\n${prompt}` }];
}
