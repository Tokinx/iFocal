// 全局配置文件，用于存储所有页面共享的配置选项
import {
  DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID,
  DEFAULT_MACHINE_TRANSLATE_CHANNELS,
  normalizeMachineTranslateChannels,
  normalizeMachineTranslateDefaultChannelId,
} from '@/shared/machine-translation';

// 支持的语言列表
export const SUPPORTED_LANGUAGES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' }
];

export function getLanguageLabel(value: string): string {
  const code = String(value || '').trim();
  if (!code) return '';
  const found = SUPPORTED_LANGUAGES.find((lang) => lang.value === code);
  return found ? found.label : code;
}

// 支持的任务类型
export const SUPPORTED_TASKS = [
  { value: 'translate', label: '翻译' },
  { value: 'chat', label: '聊天' },
  { value: 'summarize', label: '总结' }
];

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';

// 任务专属设置类型
export interface TaskSettings {
  enableContext: boolean;      // 启用上下文
  enableStreaming: boolean;     // 启用流式响应
  enableReasoning: boolean;     // 启用思考模式
  enableFileUpload: boolean;    // 启用文件上传
  reasoningEffort: ReasoningEffort; // 思考等级
}

// 默认任务设置（按任务类型）
export const DEFAULT_TASK_SETTINGS: Record<string, TaskSettings> = {
  translate: {
    enableContext: false,
    enableStreaming: false,
    enableReasoning: false,
    enableFileUpload: false,
    reasoningEffort: DEFAULT_REASONING_EFFORT
  },
  chat: {
    enableContext: true,
    enableStreaming: true,
    enableReasoning: false,
    enableFileUpload: true,
    reasoningEffort: DEFAULT_REASONING_EFFORT
  },
  summarize: {
    enableContext: false,
    enableStreaming: false,
    enableReasoning: true,
    enableFileUpload: false,
    reasoningEffort: DEFAULT_REASONING_EFFORT
  }
};

function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  const v = String(value || '').toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'xhigh') {
    return v;
  }
  return DEFAULT_REASONING_EFFORT;
}

function normalizeTaskSetting(task: string, raw: any): TaskSettings {
  const fallback = DEFAULT_TASK_SETTINGS[task] || DEFAULT_TASK_SETTINGS.translate;
  return {
    enableContext: typeof raw?.enableContext === 'boolean' ? raw.enableContext : fallback.enableContext,
    enableStreaming: typeof raw?.enableStreaming === 'boolean' ? raw.enableStreaming : fallback.enableStreaming,
    enableReasoning: typeof raw?.enableReasoning === 'boolean' ? raw.enableReasoning : fallback.enableReasoning,
    enableFileUpload: typeof raw?.enableFileUpload === 'boolean' ? raw.enableFileUpload : fallback.enableFileUpload,
    reasoningEffort: normalizeReasoningEffort(raw?.reasoningEffort ?? fallback.reasoningEffort),
  };
}

function normalizeTaskSettingsMap(raw: any): Record<string, TaskSettings> {
  const source = typeof raw === 'object' && raw !== null ? raw : {};
  const normalized: Record<string, TaskSettings> = {};
  for (const task of Object.keys(DEFAULT_TASK_SETTINGS)) {
    normalized[task] = normalizeTaskSetting(task, source[task]);
  }
  for (const task of Object.keys(source)) {
    if (!normalized[task]) normalized[task] = normalizeTaskSetting(task, source[task]);
  }
  return normalized;
}

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
  selectionTranslationMode: 'ai' as 'ai' | 'machine',


  // 快捷键设置
  actionKey: 'Alt',

  // 其他设置
  autoPasteGlobalAssistant: false,

  // 会话管理
  maxSessionsCount: 10, // 最大会话保存数量
  contextMessagesCount: 2, // 上下文消息数量

  // 按任务分离的功能开关
  taskSettings: DEFAULT_TASK_SETTINGS,

  // 性能优化
  reduceVisualEffects: false, // 减弱视觉效果（关闭 backdrop-blur）

  // 机器翻译渠道：用于后续网页全文翻译与批量翻译
  mtChannels: DEFAULT_MACHINE_TRANSLATE_CHANNELS,
  mtDefaultChannelId: DEFAULT_MACHINE_TRANSLATE_CHANNEL_ID,

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
    },
    {
      name: 'ifocal-target-style-blur-hover',
      description: '模糊效果',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-blur-hover .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-blur-hover .ifocal-target-inner{
  filter: blur(3px);
  transition: filter .18s ease;
  font-family: inherit;
}
.ifocal-target-inline-wrapper.ifocal-target-style-blur-hover:hover .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-blur-hover:hover .ifocal-target-inner{
  filter: blur(0);
}`
    },
    {
      name: 'ifocal-target-style-wavy',
      description: '波浪线',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-wavy .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-wavy .ifocal-target-inner{
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  font-family: inherit;
}`
    },
    {
      name: 'ifocal-target-style-muted',
      description: '弱化',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-muted .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-muted .ifocal-target-inner{
  opacity: .6;
  font-family: inherit;
}`
    },
    {
      name: 'ifocal-target-style-dashed-border',
      description: '虚线边框',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-dashed-border .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-dashed-border .ifocal-target-inner{
  border: 1px dashed currentColor;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: inherit;
}`
    },
    {
      name: 'ifocal-target-style-divider',
      description: '分割线',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-divider .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-divider .ifocal-target-inner{
  position: relative;
  display: inline-block;
  padding-top: 4px;
  margin-top: 4px;
  font-family: inherit;
}
.ifocal-target-inline-wrapper.ifocal-target-style-divider .ifocal-target-inner::before,
.ifocal-target-block-wrapper.ifocal-target-style-divider .ifocal-target-inner::before{
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  min-width: 24px;
  width: 100%;
  max-width: 30%;
  border-top: 1.5px solid currentColor;
  opacity: .45;
}`
    },
    {
      name: 'ifocal-target-style-italic',
      description: '斜体',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-italic .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-italic .ifocal-target-inner{
  font-style: italic;
  font-family: inherit;
}`
    },
    {
      name: 'ifocal-target-style-bold',
      description: '加粗',
      css: `.ifocal-target-inline-wrapper.ifocal-target-style-bold .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-bold .ifocal-target-inner{
  font-weight: 700;
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
  'selectionTranslationMode',
  'actionKey',
  'autoPasteGlobalAssistant',
  'maxSessionsCount',
  'contextMessagesCount',
  'taskSettings',
  'reduceVisualEffects',
  'mtChannels',
  'mtDefaultChannelId',
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
              (config as any)[key] = normalizeTaskSettingsMap(items[key]);
            }
            // 特殊处理：机器翻译渠道始终补齐内置免费渠道
            else if (key === 'mtChannels') {
              (config as any)[key] = normalizeMachineTranslateChannels(items[key]);
            }
            else {
              (config as any)[key] = items[key];
            }
          }
        });
        config.mtChannels = normalizeMachineTranslateChannels((config as any).mtChannels);
        config.mtDefaultChannelId = normalizeMachineTranslateDefaultChannelId((config as any).mtDefaultChannelId, config.mtChannels);

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
              enableFileUpload: items.enableFileUpload ?? DEFAULT_TASK_SETTINGS[task].enableFileUpload,
              reasoningEffort: DEFAULT_TASK_SETTINGS[task].reasoningEffort
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
  return normalizeTaskSetting(task, config.taskSettings?.[task]);
}

// 更新特定任务的设置
export async function updateTaskSettings(task: string, settings: Partial<TaskSettings>): Promise<void> {
  const config = await loadConfig();
  const currentTaskSettings = normalizeTaskSetting(task, config.taskSettings?.[task]);
  const updatedTaskSettings = normalizeTaskSetting(task, { ...currentTaskSettings, ...settings });

  return saveConfig({
    taskSettings: {
      ...config.taskSettings,
      [task]: updatedTaskSettings
    }
  });
}
