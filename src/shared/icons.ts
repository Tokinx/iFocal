export function iconOfNav(id: string): string {
  switch (id) {
    case 'assistant':
      // 兼容旧标识
      return 'proicons:chat';
    case 'channels':
      return 'proicons:sparkle-2';
    case 'settings':
      return 'proicons:pencil-sparkle';
    case 'debug':
      return 'proicons:bug';
    case 'keys':
      return 'proicons:keyboard';
    case 'about':
      return 'proicons:info';
    default:
      return 'proicons:info';
  }
}

export function iconOfFeature(id: string): string {
  switch (id) {
    case 'chat':
      return 'proicons:chat';
    case 'translate':
      return 'ri:translate-ai';
    case 'summarize':
      return 'proicons:pencil-sparkle';
    case 'analyze-page':
      return 'proicons:bullet-list-square';
    default:
      return 'proicons:info';
  }
}

export function iconOfRole(role: 'user' | 'assistant'): string {
  return role === 'user' ? 'proicons:pencil' : 'proicons:chat';
}

// 常用动作图标（若 proicons 无，对应可换其它集合）
export function iconOfAction(action: 'copy' | 'delete' | 'resend' | 'edit' | 'test' | 'save' | 'reset'): string {
  switch (action) {
    case 'copy':
      return 'proicons:copy';
    case 'delete':
      return 'proicons:delete';
    case 'resend':
      return 'proicons:arrow-clockwise';
    case 'edit':
      return 'proicons:pencil';
    case 'test':
      return 'proicons:bug';
    case 'save':
      return 'proicons:save';
    case 'reset':
      return 'proicons:alert-triangle';
    default:
      return 'proicons:info';
  }
}

// 渠道类型图标
export function iconOfChannelType(type: string): string {
  if (type === 'openai') return 'logos:openai-icon';
  if (type === 'gemini') return 'logos:google-gemini';
  if (type === 'openai-compatible') return 'proicons:chat';
  return 'proicons:info';
}
