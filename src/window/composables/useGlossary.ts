import { onMounted, ref, computed } from 'vue';
import { loadGlossary, parseGlossaryMixedText, parseGlossaryTermsText, serializeGlossaryTerms, stringifyGlossaryMixedText, saveGlossary as persistGlossary } from '@/shared/glossary';
import { useToast } from './useToast';

export function useGlossary() {
  const toast = useToast();
  const notTranslateText = ref('');
  const termsText = ref('');

  const glossaryAllText = computed({
    get() {
      return stringifyGlossaryMixedText({
        notTranslate: notTranslateText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
        terms: parseGlossaryTermsText(termsText.value),
      });
    },
    set(v: string) {
      const parsed = parseGlossaryMixedText(v);
      notTranslateText.value = parsed.notTranslate.join('\n');
      termsText.value = serializeGlossaryTerms(parsed.terms);
    },
  });

  async function syncGlossaryFromStorage() {
    try {
      const glossary = await loadGlossary();
      notTranslateText.value = glossary.notTranslate.join('\n');
      termsText.value = serializeGlossaryTerms(glossary.terms);
    } catch { }
  }

  async function saveGlossary() {
    try {
      await persistGlossary({
        notTranslate: notTranslateText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
        terms: parseGlossaryTermsText(termsText.value),
      });
      toast.success('词汇表已保存');
    } catch {
      toast.error('保存失败');
    }
  }

  onMounted(syncGlossaryFromStorage);

  return {
    notTranslateText,
    termsText,
    glossaryAllText,
    saveGlossary,
  };
}
