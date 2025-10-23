// 应用级常量配置（供后台/前端共享）
export const DEFAULT_RATE = { qps: 2, qpm: 120, maxConcurrent: 1 } as const;

// 一些模型不支持 system 角色；为最大化兼容，默认合并为 user 内容
export const NOT_SUPPORT_SYS_ROLE_MODELS = [
  'translate',
  'translate-*',
  'gemma-*',
  'qwen-mt-*'
];

