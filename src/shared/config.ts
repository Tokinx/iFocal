// 全局配置文件，用于存储所有页面共享的配置选项

// 支持的语言列表
export const SUPPORTED_LANGUAGES = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' }
];

// 支持的任务类型
export const SUPPORTED_TASKS = [
  { value: 'translate', label: '翻译' },
  { value: 'chat', label: '聊天' },
  { value: 'summarize', label: '总结' }
];

// 默认配置
export const DEFAULT_CONFIG = {
  // 语言设置
  translateTargetLang: 'zh-CN',
  prevLanguage: 'en', // 上一次选择的语言（用于智能双向翻译）

  // 任务设置
  defaultTask: 'translate',

  // 显示设置
  displayMode: 'insert' as 'insert' | 'overlay',
  // 划词：是否启用划词翻译（显示小圆点）
  enableSelectionTranslation: true,


  // 快捷键设置
  actionKey: 'Alt',

  // 其他设置
  autoPasteGlobalAssistant: false,

  // 会话管理
  maxSessionsCount: 50, // 最大会话保存数量
  enableContext: false, // 启用上下文
  contextMessagesCount: 5, // 上下文消息数量
  enableStreaming: false, // 启用流式响应

  // 思考模式
  enableReasoning: false, // 启用思考模式

  // 性能优化
  reduceVisualEffects: false, // 减弱视觉效果（关闭 backdrop-blur）

  // 新增：译文样式名称（应用到译文包裹元素），默认点状下划线
  wrapperStyleName: 'ifocal-target-style-dotted',
  // 新增：样式预设列表（可在设置页选择与编辑）
  targetStylePresets: [
    {
      name: 'ifocal-target-style-dotted',
      description: '点状下划线',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-dotted .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-dotted .ifocal-target-inner{
  background-image: linear-gradient(to right, rgba(71, 71, 71, 0.5) 30%, rgba(255, 255, 255, 0) 0%);
  background-position: bottom;
  background-size: 5px 1px;
  background-repeat: repeat-x;
  padding-bottom: 3px;
  font-family: inherit;
}`
    },
    {
      name: 'ifocal-target-style-highlight',
      description: '高亮背景',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-highlight .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-highlight .ifocal-target-inner{
  background-color: yellow;
  font-family: inherit;
}`
    }
  ]
};

// 配置键名列表，用于存储和读取
export const CONFIG_KEYS = [
  'translateTargetLang',
  'prevLanguage',
  'defaultTask',
  'displayMode',
  'enableSelectionTranslation',
  'actionKey',
  'autoPasteGlobalAssistant',
  'maxSessionsCount',
  'enableContext',
  'contextMessagesCount',
  'enableStreaming',
  'enableReasoning',
  'reduceVisualEffects',
  'wrapperStyleName',
  'targetStylePresets'
];

// 从 Chrome 存储中加载配置
export async function loadConfig(): Promise<typeof DEFAULT_CONFIG> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(CONFIG_KEYS, (items: any) => {
        const config = { ...DEFAULT_CONFIG };

        // 更新配置值
        CONFIG_KEYS.forEach(key => {
          if (items[key] !== undefined) {
            // 特殊处理：确保 targetStylePresets 为数组
            if (key === 'targetStylePresets') {
              (config as any)[key] = Array.isArray(items[key]) ? items[key] : DEFAULT_CONFIG.targetStylePresets;
            } else {
              (config as any)[key] = items[key];
            }
          }
        });

        resolve(config);
      });
    } catch (error) {
      console.error('加载配置失败:', error);
      resolve(DEFAULT_CONFIG);
    }
  });
}

// 保存配置到 Chrome 存储
export async function saveConfig(config: Partial<typeof DEFAULT_CONFIG>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set(config, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (error) {
      console.error('保存配置失败:', error);
      reject(error);
    }
  });
}

// 重置配置为默认值
export async function resetConfig(): Promise<void> {
  return saveConfig(DEFAULT_CONFIG);
}
