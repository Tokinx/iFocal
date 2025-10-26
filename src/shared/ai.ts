// 公共 AI 适配与提示词构造工具

export function makePrompt(task: string, text: string, lang: string, templates: any) {
  const t = templates && typeof templates === 'object' ? templates : {};
  const target = (lang || 'zh-CN').trim();
  const vars: Record<string, string> = { '{{targetLang}}': target, '{{text}}': (text || '').trim() };
  let tpl = '';
  if (task === 'translate') tpl = t.translate || 'Translate the following content to {{targetLang}}. Return the translation only.\n\n{{text}}';
  else if (task === 'chat') tpl = t.chat || 'Reply in {{targetLang}}:\n\n{{text}}';
  else if (task === 'summarize') tpl = t.summarize || 'Summarize the following content in {{targetLang}} with concise bullet points.\n\n{{text}}';
  else tpl = 'Provide a helpful answer for the following content:\n\n{{text}}';
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

