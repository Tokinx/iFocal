import { LOCAL_CHANNEL_TYPE, LOCAL_DEFAULT_CHANNEL_NAME } from '@/shared/local-llm-types';
import { modelIdFromSpec, parseModelSpec } from '@/shared/model-utils';

export const LOCAL_GEMINI_NANO_ENABLED_STORAGE_KEY = 'localGeminiNanoEnabled' as const;
export const PINNED_MODEL_KEYS_STORAGE_KEY = 'pinnedModelKeys' as const;
export const PINNED_MODELS_GROUP_NAME = '置顶' as const;

export type ModelCatalogChannel = {
  name: string;
  type?: string;
  providerId?: string;
  models?: string[];
};

export type ModelCatalogPair = {
  key: string;
  channel: string;
  model: string;
  modelId: string;
};

export function modelKeyOf(pair: { channel: string; model: string }): string {
  return `${String(pair.channel || '').trim()}|${modelIdFromSpec(pair.model)}`;
}

export function parseModelKey(value: unknown): { channel: string; model: string } | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const index = raw.indexOf('|');
  if (index <= 0) return null;
  const channel = raw.slice(0, index).trim();
  const model = raw.slice(index + 1).trim();
  if (!channel || !model) return null;
  return { channel, model };
}

export function isLocalGeminiNanoChannel(channel: unknown): boolean {
  const ch = channel as ModelCatalogChannel | null | undefined;
  if (!ch || typeof ch !== 'object') return false;
  if (ch.type !== LOCAL_CHANNEL_TYPE) return false;
  const provider = String(ch.providerId || '').trim();
  if (provider && provider !== 'gemini-nano') return false;
  return String(ch.name || '').trim() === LOCAL_DEFAULT_CHANNEL_NAME || provider === 'gemini-nano';
}

export function buildModelCatalogPairs(
  channels: ModelCatalogChannel[] | null | undefined,
  options: { includeLocalGeminiNano: boolean },
): ModelCatalogPair[] {
  const list = Array.isArray(channels) ? channels : [];
  const pairs: ModelCatalogPair[] = [];
  for (const ch of list) {
    if (!ch || !String(ch.name || '').trim()) continue;
    if (isLocalGeminiNanoChannel(ch) && !options.includeLocalGeminiNano) continue;
    const channelName = String(ch.name || '').trim();
    const models = Array.isArray(ch.models) ? ch.models : [];
    for (const spec of models) {
      if (typeof spec !== 'string') continue;
      const { modelId, displayName } = parseModelSpec(spec);
      if (!modelId) continue;
      pairs.push({
        key: modelKeyOf({ channel: channelName, model: modelId }),
        channel: channelName,
        model: displayName || modelId,
        modelId,
      });
    }
  }
  return pairs;
}

export function normalizePinnedModelKeys(raw: unknown, pairs: ModelCatalogPair[]): string[] {
  const available = new Set(pairs.map((pair) => pair.key));
  const seen = new Set<string>();
  const input = Array.isArray(raw) ? raw : [];
  const next: string[] = [];
  for (const item of input) {
    const key = String(item || '').trim();
    if (!key || seen.has(key) || !available.has(key)) continue;
    seen.add(key);
    next.push(key);
  }
  return next;
}

export function orderModelPairsByPins(pairs: ModelCatalogPair[], pinnedKeys: string[]): ModelCatalogPair[] {
  const byKey = new Map(pairs.map((pair) => [pair.key, pair] as const));
  const pinned = pinnedKeys.map((key) => byKey.get(key)).filter((pair): pair is ModelCatalogPair => !!pair);
  const pinnedSet = new Set(pinnedKeys);
  return [...pinned, ...pairs.filter((pair) => !pinnedSet.has(pair.key))];
}

export function groupModelPairs(
  pairs: ModelCatalogPair[],
  pinnedKeys: string[] = [],
): Record<string, ModelCatalogPair[]> {
  const groups: Record<string, ModelCatalogPair[]> = {};
  const pinnedSet = new Set(pinnedKeys);
  const pinned = pairs.filter((pair) => pinnedSet.has(pair.key));
  if (pinned.length) groups[PINNED_MODELS_GROUP_NAME] = pinned;
  for (const pair of pairs) {
    if (pinnedSet.has(pair.key)) continue;
    if (!groups[pair.channel]) groups[pair.channel] = [];
    groups[pair.channel].push(pair);
  }
  return groups;
}
