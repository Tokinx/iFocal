import { DEFAULT_PROMPT_TEMPLATES, type PromptTemplates } from '@/shared/ai';
import { DEFAULT_REASONING_EFFORT, DEFAULT_TASK_SETTINGS, type ReasoningEffort, type TaskSettings } from '@/shared/config';

export type AssistantPreset = 'chat' | 'translate' | 'summarize';

export interface AssistantSettings extends TaskSettings {
  enableClipboardListening: boolean;
  targetLang: string;
  prevLang: string;
}

export interface AssistantConfig {
  id: string;
  name: string;
  icon: string;
  preset: AssistantPreset;
  prompt: string;
  modelKey: string;
  settings: AssistantSettings;
  deletable: boolean;
  createdAt: number;
  updatedAt: number;
}

export const ASSISTANT_CONFIGS_STORAGE_KEY = 'assistantConfigs' as const;
export const ACTIVE_ASSISTANT_ID_STORAGE_KEY = 'activeAssistantId' as const;
export const DEFAULT_ASSISTANT_ID_STORAGE_KEY = 'defaultAssistantId' as const;

export const CHAT_ASSISTANT_ID = 'chat-assistant' as const;
export const TRANSLATE_ASSISTANT_ID = 'translate-expert' as const;
export const SUMMARY_ASSISTANT_ID = 'summary-content' as const;

export const ASSISTANT_PRESET_OPTIONS: Array<{ value: AssistantPreset; label: string; icon: string }> = [
  { value: 'chat', label: '聊天', icon: 'ri:chat-ai-line' },
  { value: 'translate', label: '翻译', icon: 'ri:translate-ai' },
  { value: 'summarize', label: '总结', icon: 'ri:quill-pen-ai-line' },
];

export const ASSISTANT_ICON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ri:chat-ai-line', label: '聊天' },
  { value: 'ri:translate-ai', label: '翻译' },
  { value: 'ri:quill-pen-ai-line', label: '总结' },
  { value: 'ri:lightbulb-ai-line', label: '灵感' },
  { value: 'ri:search-ai-line', label: '搜索' },
  { value: 'ri:file-ai-line', label: '文档' },
  { value: 'ri:apps-2-ai-line', label: '通用' },
  { value: 'ri:dvd-ai-line', label: '创作' },
  { value: 'proicons:bolt', label: '闪电' },
  { value: 'proicons:bug', label: '调试' },
  { value: 'ri:pencil-ai-line', label: '写作' },
  { value: 'ri:settings-4-line', label: '设置' },
];

const DEFAULT_ASSISTANT_DEFS: Array<{
  id: string;
  name: string;
  icon: string;
  preset: AssistantPreset;
  deletable: boolean;
}> = [
  { id: CHAT_ASSISTANT_ID, name: '聊天助手', icon: 'ri:chat-ai-line', preset: 'chat', deletable: false },
  { id: TRANSLATE_ASSISTANT_ID, name: '翻译专家', icon: 'ri:translate-ai', preset: 'translate', deletable: true },
  { id: SUMMARY_ASSISTANT_ID, name: '总结内容', icon: 'ri:quill-pen-ai-line', preset: 'summarize', deletable: true },
];

export const DEFAULT_ASSISTANT_ID = CHAT_ASSISTANT_ID;

export interface NormalizeAssistantOptions {
  templates?: Partial<PromptTemplates>;
  modelKeyByPreset?: Partial<Record<AssistantPreset, string>>;
  defaultModelKey?: string;
  defaultClipboardListening?: boolean;
  defaultTargetLang?: string;
  defaultPrevLang?: string;
  now?: number;
}

export function isAssistantPreset(value: unknown): value is AssistantPreset {
  return value === 'chat' || value === 'translate' || value === 'summarize';
}

export function assistantIdForPreset(preset: AssistantPreset): string {
  if (preset === 'translate') return TRANSLATE_ASSISTANT_ID;
  if (preset === 'summarize') return SUMMARY_ASSISTANT_ID;
  return CHAT_ASSISTANT_ID;
}

export function assistantPresetForTask(task: string): AssistantPreset {
  if (task === 'translate') return 'translate';
  if (task === 'summarize') return 'summarize';
  return 'chat';
}

export function assistantTaskForPreset(preset: AssistantPreset): 'chat' | 'translate' | 'summarize' {
  return preset;
}

export function assistantIconForPreset(preset: AssistantPreset): string {
  return ASSISTANT_PRESET_OPTIONS.find((item) => item.value === preset)?.icon || 'ri:chat-ai-line';
}

export function defaultAssistantNameForPreset(preset: AssistantPreset): string {
  return DEFAULT_ASSISTANT_DEFS.find((item) => item.preset === preset)?.name || '自定义助手';
}

export function defaultPromptForPreset(preset: AssistantPreset, templates?: Partial<PromptTemplates>): string {
  const source = templates && typeof templates === 'object' ? templates : {};
  const fallback = DEFAULT_PROMPT_TEMPLATES[preset];
  const value = String(source[preset] ?? fallback).trim();
  return value || fallback;
}

export function defaultSettingsForPreset(
  preset: AssistantPreset,
  defaults: Partial<Pick<AssistantSettings, 'enableClipboardListening' | 'targetLang' | 'prevLang'>> = {},
): AssistantSettings {
  return normalizeAssistantSettings(DEFAULT_TASK_SETTINGS[preset], preset, defaults);
}

export function createAssistantId(): string {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultAssistantConfigs(options: NormalizeAssistantOptions = {}): AssistantConfig[] {
  const now = options.now ?? Date.now();
  return DEFAULT_ASSISTANT_DEFS.map((def) => createAssistantConfig({
    id: def.id,
    name: def.name,
    icon: def.icon,
    preset: def.preset,
    prompt: defaultPromptForPreset(def.preset, options.templates),
    modelKey: options.modelKeyByPreset?.[def.preset] || options.defaultModelKey || '',
    settings: defaultSettingsForPreset(def.preset, {
      enableClipboardListening: options.defaultClipboardListening,
      targetLang: options.defaultTargetLang,
      prevLang: options.defaultPrevLang,
    }),
    deletable: def.deletable,
    createdAt: now,
    updatedAt: now,
  }, options));
}

export function createAssistantConfig(input: Partial<AssistantConfig> = {}, options: NormalizeAssistantOptions = {}): AssistantConfig {
  const preset = isAssistantPreset(input.preset) ? input.preset : 'chat';
  const now = options.now ?? Date.now();
  const id = String(input.id || createAssistantId()).trim();
  const isBuiltInChat = id === CHAT_ASSISTANT_ID;
  const name = String(input.name || defaultAssistantNameForPreset(preset)).trim() || defaultAssistantNameForPreset(preset);
  const prompt = String(input.prompt || defaultPromptForPreset(preset, options.templates)).trim() || defaultPromptForPreset(preset, options.templates);
  return {
    id,
    name,
    icon: normalizeAssistantIcon(input.icon, preset),
    preset,
    prompt,
    modelKey: String(input.modelKey || options.modelKeyByPreset?.[preset] || options.defaultModelKey || '').trim(),
    settings: normalizeAssistantSettings(input.settings, preset, {
      enableClipboardListening: options.defaultClipboardListening,
      targetLang: options.defaultTargetLang,
      prevLang: options.defaultPrevLang,
    }),
    deletable: isBuiltInChat ? false : typeof input.deletable === 'boolean' ? input.deletable : true,
    createdAt: Number(input.createdAt) || now,
    updatedAt: Number(input.updatedAt) || now,
  };
}

export function normalizeAssistantConfigs(raw: unknown, options: NormalizeAssistantOptions = {}): AssistantConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return createDefaultAssistantConfigs(options);
  }

  const normalized: AssistantConfig[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const assistant = createAssistantConfig(item as Partial<AssistantConfig>, options);
    if (!assistant.id || seen.has(assistant.id)) continue;
    seen.add(assistant.id);
    normalized.push(assistant);
  }

  if (!seen.has(CHAT_ASSISTANT_ID)) {
    normalized.unshift(createDefaultAssistantConfigs(options).find((item) => item.id === CHAT_ASSISTANT_ID)!);
  }

  return normalized.length ? normalized : createDefaultAssistantConfigs(options);
}

export function resolveAssistantId(candidate: unknown, assistants: AssistantConfig[], fallback = DEFAULT_ASSISTANT_ID): string {
  const id = String(candidate || '').trim();
  if (id && assistants.some((assistant) => assistant.id === id)) return id;
  if (assistants.some((assistant) => assistant.id === fallback)) return fallback;
  return assistants[0]?.id || DEFAULT_ASSISTANT_ID;
}

function normalizeAssistantSettings(
  raw: unknown,
  preset: AssistantPreset,
  defaults: Partial<Pick<AssistantSettings, 'enableClipboardListening' | 'targetLang' | 'prevLang'>> = {},
): AssistantSettings {
  const source = raw && typeof raw === 'object' ? raw as Partial<AssistantSettings> & Record<string, unknown> : {};
  const fallback = DEFAULT_TASK_SETTINGS[preset] || DEFAULT_TASK_SETTINGS.chat;
  const legacyClipboard = (source as any).autoPasteGlobalAssistant;
  const normalizedDefaultTargetLang = normalizeLanguageCode(defaults.targetLang, 'zh-CN');
  const normalizedDefaultPrevLang = normalizeLanguageCode(defaults.prevLang, 'en');
  return {
    enableContext: typeof source.enableContext === 'boolean' ? source.enableContext : fallback.enableContext,
    enableStreaming: typeof source.enableStreaming === 'boolean' ? source.enableStreaming : fallback.enableStreaming,
    enableReasoning: typeof source.enableReasoning === 'boolean' ? source.enableReasoning : fallback.enableReasoning,
    enableFileUpload: typeof source.enableFileUpload === 'boolean' ? source.enableFileUpload : fallback.enableFileUpload,
    enableClipboardListening:
      typeof source.enableClipboardListening === 'boolean'
        ? source.enableClipboardListening
        : typeof legacyClipboard === 'boolean'
          ? legacyClipboard
          : !!defaults.enableClipboardListening,
    targetLang: normalizeLanguageCode(source.targetLang, normalizedDefaultTargetLang),
    prevLang: normalizeLanguageCode(source.prevLang, normalizedDefaultPrevLang),
    reasoningEffort: normalizeReasoningEffort(source.reasoningEffort ?? fallback.reasoningEffort),
  };
}

function normalizeLanguageCode(value: unknown, fallback: string): string {
  const code = String(value || '').trim();
  return code || fallback;
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  const effort = String(value || '').toLowerCase();
  if (effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh') return effort;
  return DEFAULT_REASONING_EFFORT;
}

function normalizeAssistantIcon(value: unknown, preset: AssistantPreset): string {
  const icon = String(value || '').trim();
  if (icon && ASSISTANT_ICON_OPTIONS.some((item) => item.value === icon)) return icon;
  return assistantIconForPreset(preset);
}
