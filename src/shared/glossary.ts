export type GlossaryTerms = Record<string, string>;

export interface GlossaryData {
  notTranslate: string[];
  terms: GlossaryTerms;
}

export const GLOSSARY_STORAGE_KEYS = ['glossaryNotTranslate', 'glossaryTerms'] as const;

export function normalizeGlossaryNotTranslate(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

export function normalizeGlossaryTerms(value: unknown): GlossaryTerms {
  if (!value || typeof value !== 'object') return {};
  const normalized: GlossaryTerms = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
    const k = String(key || '').trim();
    if (!k) return;
    normalized[k] = String(val || '').trim();
  });
  return normalized;
}

export function serializeGlossaryTerms(terms: GlossaryTerms): string {
  return Object.keys(terms).map((key) => `${key}=${terms[key]}`).join('\n');
}

export function parseGlossaryTermsText(text: string): GlossaryTerms {
  const terms: GlossaryTerms = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!key) continue;
    terms[key] = value;
  }
  return terms;
}

export function parseGlossaryMixedText(text: string): GlossaryData {
  const notTranslate: string[] = [];
  const terms: GlossaryTerms = {};

  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index > 0) {
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key) terms[key] = value;
    } else {
      notTranslate.push(trimmed);
    }
  }

  return { notTranslate, terms };
}

export function stringifyGlossaryMixedText(data: Partial<GlossaryData>): string {
  const notTranslate = normalizeGlossaryNotTranslate(data.notTranslate);
  const terms = normalizeGlossaryTerms(data.terms);
  const parts: string[] = [];
  if (notTranslate.length) parts.push('# 不译词: 一行一个', notTranslate.join('\n'));
  const termsText = serializeGlossaryTerms(terms);
  if (termsText) parts.push('# 术语映射: 每行 key=value', termsText);
  return parts.join('\n');
}

export async function loadGlossary(): Promise<GlossaryData> {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get([...GLOSSARY_STORAGE_KEYS], (items: any) => {
        resolve({
          notTranslate: normalizeGlossaryNotTranslate(items?.glossaryNotTranslate),
          terms: normalizeGlossaryTerms(items?.glossaryTerms),
        });
      });
    } catch {
      resolve({ notTranslate: [], terms: {} });
    }
  });
}

export async function saveGlossary(data: Partial<GlossaryData>): Promise<void> {
  const payload = {
    glossaryNotTranslate: normalizeGlossaryNotTranslate(data.notTranslate),
    glossaryTerms: normalizeGlossaryTerms(data.terms),
  };

  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.set(payload, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}
