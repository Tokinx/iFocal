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

// 任务专属设置类型
export interface TaskSettings {
  enableContext: boolean;      // 启用上下文
  enableStreaming: boolean;     // 启用流式响应
  enableReasoning: boolean;     // 启用思考模式
  enableFileUpload: boolean;    // 启用文件上传
}

// 默认任务设置（按任务类型）
export const DEFAULT_TASK_SETTINGS: Record<string, TaskSettings> = {
  translate: {
    enableContext: false,
    enableStreaming: false,
    enableReasoning: false,
    enableFileUpload: false
  },
  chat: {
    enableContext: true,
    enableStreaming: true,
    enableReasoning: false,
    enableFileUpload: true
  },
  summarize: {
    enableContext: false,
    enableStreaming: false,
    enableReasoning: true,
    enableFileUpload: false
  }
};

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
  contextMessagesCount: 5, // 上下文消息数量

  // 按任务分离的功能开关
  taskSettings: DEFAULT_TASK_SETTINGS,

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
  'contextMessagesCount',
  'taskSettings',
  'reduceVisualEffects',
  'wrapperStyleName',
  'targetStylePresets'
];

// 从 Chrome 存储中加载配置
export async function loadConfig(): Promise<typeof DEFAULT_CONFIG> {
  return new Promise((resolve) => {
    try {
      // 加载所有可能的键（包括旧的全局开关）
      const allKeys = [...CONFIG_KEYS, 'enableContext', 'enableStreaming', 'enableReasoning', 'enableFileUpload'];
      chrome.storage.sync.get(allKeys, (items: any) => {
        const config = { ...DEFAULT_CONFIG };

        // 更新配置值
        CONFIG_KEYS.forEach(key => {
          if (items[key] !== undefined) {
            // 特殊处理：确保 targetStylePresets 为数组
            if (key === 'targetStylePresets') {
              (config as any)[key] = Array.isArray(items[key]) ? items[key] : DEFAULT_CONFIG.targetStylePresets;
            }
            // 特殊处理：确保 taskSettings 为对象
            else if (key === 'taskSettings') {
              (config as any)[key] = typeof items[key] === 'object' && items[key] !== null
                ? { ...DEFAULT_TASK_SETTINGS, ...items[key] }
                : DEFAULT_TASK_SETTINGS;
            }
            else {
              (config as any)[key] = items[key];
            }
          }
        });

        // 兼容性迁移：如果存在旧的全局开关，迁移到新结构
        const hasOldSettings = items.enableContext !== undefined ||
                               items.enableStreaming !== undefined ||
                               items.enableReasoning !== undefined ||
                               items.enableFileUpload !== undefined;

        if (hasOldSettings && items.taskSettings === undefined) {
          console.log('检测到旧配置格式，正在迁移到新结构...');
          // 将旧的全局开关应用到所有任务
          const migratedSettings: Record<string, TaskSettings> = {};
          for (const task of ['translate', 'chat', 'summarize']) {
            migratedSettings[task] = {
              enableContext: items.enableContext ?? DEFAULT_TASK_SETTINGS[task].enableContext,
              enableStreaming: items.enableStreaming ?? DEFAULT_TASK_SETTINGS[task].enableStreaming,
              enableReasoning: items.enableReasoning ?? DEFAULT_TASK_SETTINGS[task].enableReasoning,
              enableFileUpload: items.enableFileUpload ?? DEFAULT_TASK_SETTINGS[task].enableFileUpload
            };
          }
          config.taskSettings = migratedSettings;

          // 异步保存迁移后的配置并清理旧键
          chrome.storage.sync.set({ taskSettings: migratedSettings }, () => {
            chrome.storage.sync.remove(['enableContext', 'enableStreaming', 'enableReasoning', 'enableFileUpload']);
            console.log('配置迁移完成');
          });
        }

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

// 获取特定任务的设置
export function getTaskSettings(config: typeof DEFAULT_CONFIG, task: string): TaskSettings {
  return config.taskSettings[task] || DEFAULT_TASK_SETTINGS[task] || DEFAULT_TASK_SETTINGS.translate;
}

// 更新特定任务的设置
export async function updateTaskSettings(task: string, settings: Partial<TaskSettings>): Promise<void> {
  const config = await loadConfig();
  const currentTaskSettings = config.taskSettings[task] || DEFAULT_TASK_SETTINGS[task] || DEFAULT_TASK_SETTINGS.translate;
  const updatedTaskSettings = { ...currentTaskSettings, ...settings };

  return saveConfig({
    taskSettings: {
      ...config.taskSettings,
      [task]: updatedTaskSettings
    }
  });
}
