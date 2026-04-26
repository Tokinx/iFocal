import { CONFIG_KEYS } from '@/shared/config';
import { GLOSSARY_STORAGE_KEYS } from '@/shared/glossary';
import { PROMPT_TEMPLATES_STORAGE_KEY } from '@/shared/prompt-templates';

export const EXTRA_SETTINGS_KEYS = [
  'channels',
  'defaultModel',
  'activeModel',
  'systemPrompt',
  'hoverKey',
  'selectKey',
] as const;

export const SETTINGS_EXPORT_KEYS = [
  ...CONFIG_KEYS,
  ...GLOSSARY_STORAGE_KEYS,
  PROMPT_TEMPLATES_STORAGE_KEY,
  ...EXTRA_SETTINGS_KEYS,
] as const;

export type SettingsExportKey = typeof SETTINGS_EXPORT_KEYS[number];
export type SettingsSnapshot = Partial<Record<SettingsExportKey, unknown>>;

export function sanitizeSettingsSnapshot(data: unknown): SettingsSnapshot {
  const input = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const snapshot: SettingsSnapshot = {};
  SETTINGS_EXPORT_KEYS.forEach((key) => {
    if (key in input) snapshot[key] = input[key];
  });
  return snapshot;
}

export async function loadSettingsSnapshot(): Promise<SettingsSnapshot> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get([...SETTINGS_EXPORT_KEYS], (items: any) => {
        resolve(sanitizeSettingsSnapshot(items));
      });
    } catch {
      resolve({});
    }
  });
}

export async function saveSettingsSnapshot(snapshot: unknown): Promise<SettingsSnapshot> {
  const sanitized = sanitizeSettingsSnapshot(snapshot);
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set(sanitized, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(sanitized);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function downloadSettingsSnapshot(snapshot: unknown, fileName = 'ifocal-settings.json') {
  const payload = JSON.stringify(sanitizeSettingsSnapshot(snapshot), null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function parseSettingsImportFile(file: File): Promise<SettingsSnapshot> {
  const text = await file.text();
  const parsed = JSON.parse(String(text || '{}'));
  return sanitizeSettingsSnapshot(parsed);
}
