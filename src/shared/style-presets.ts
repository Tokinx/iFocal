import { DEFAULT_CONFIG } from '@/shared/config';

export interface TargetStylePreset {
  name: string;
  description: string;
  css: string;
}

export const DEFAULT_WRAPPER_STYLE_NAME = 'ifocal-target-style-dotted';
export const CUSTOM_STYLE_SELECTION = '__custom__';

export function parseStyleNameFromCss(css: string): string | '' {
  try {
    const matched = String(css || '').match(/\.ifocal\-target\-style\-([a-zA-Z0-9_\-]+)/);
    return matched ? `ifocal-target-style-${matched[1]}` : '';
  } catch {
    return '';
  }
}

export function normalizeTargetStylePresets(value: unknown): TargetStylePreset[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONFIG.targetStylePresets];
  return value
    .map((item) => {
      const name = String((item as any)?.name || '').trim();
      const css = String((item as any)?.css || '').trim();
      const description = String((item as any)?.description || '').trim();
      if (!name || !css) return null;
      return {
        name,
        css,
        description: description || name,
      } satisfies TargetStylePreset;
    })
    .filter(Boolean) as TargetStylePreset[];
}

export function mergeTargetStylePresets(
  incoming?: Array<Partial<TargetStylePreset>> | null,
  defaults?: Array<Partial<TargetStylePreset>> | null,
): TargetStylePreset[] {
  const byName = new Map<string, TargetStylePreset>();
  const base = normalizeTargetStylePresets(defaults ?? DEFAULT_CONFIG.targetStylePresets);
  const extra = normalizeTargetStylePresets(incoming ?? []);
  [...base, ...extra].forEach((preset) => {
    byName.set(preset.name, preset);
  });
  return Array.from(byName.values());
}

export function buildStylePresetsCss(list?: Array<Partial<TargetStylePreset>> | null): string {
  return mergeTargetStylePresets(list).map((preset) => String(preset.css || '')).join('\n');
}

export function resolveSelectedStylePresetCss(
  selection: string,
  presets?: Array<Partial<TargetStylePreset>> | null,
): string {
  const found = mergeTargetStylePresets(presets).find((preset) => preset.name === selection);
  return String(found?.css || '').trim();
}

export function upsertCustomStylePreset(
  presets: Array<Partial<TargetStylePreset>> | null | undefined,
  cssText: string,
  description = '自定义',
): { wrapperStyleName: string; presets: TargetStylePreset[] } {
  const name = parseStyleNameFromCss(cssText);
  if (!name) {
    throw new Error('自定义 CSS 必须包含 ifocal-target-style-* 类名');
  }

  const normalized = normalizeTargetStylePresets(presets ?? []);
  const nextPreset: TargetStylePreset = {
    name,
    description,
    css: String(cssText || '').trim(),
  };
  const index = normalized.findIndex((preset) => preset.name === name);
  if (index >= 0) normalized.splice(index, 1, nextPreset);
  else normalized.push(nextPreset);

  return {
    wrapperStyleName: name,
    presets: normalized,
  };
}
