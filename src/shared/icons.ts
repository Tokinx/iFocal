// 简单的 icon 映射，统一管理 proicons 图标名称
// 备注：已验证可用的 proicons 包含：bolt、pencil、chat、info、bug

export function iconOfNav(id: string): string {
  switch (id) {
    case 'assistant':
      return 'proicons:chat';
    case 'channels':
      return 'proicons:sparkle-2';
    case 'models':
      return 'proicons:pencil-sparkle';
    case 'keys':
      return 'proicons:keyboard';
    case 'others':
      return 'proicons:paintbrush-2-sparkle';
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
      // 使用 material-symbols 作为补充集合
      return 'material-symbols:content-copy-outline-rounded';
    case 'delete':
      return 'material-symbols:delete-outline-rounded';
    case 'resend':
      return 'material-symbols:refresh-rounded';
    case 'edit':
      return 'proicons:pencil';
    case 'test':
      return 'proicons:bug';
    case 'save':
      return 'material-symbols:check-small-rounded';
    case 'reset':
      return 'material-symbols:restart-alt-rounded';
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
