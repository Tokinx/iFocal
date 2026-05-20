import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { LocalLlmProbeResult } from '@/shared/local-llm-types';

// 端侧模型在"渠道管理"页面的可见性：
//   - available / downloadable / downloading → 可见（用户能看到状态卡片或下载入口）
//   - 其他（no-language-model / no-offscreen-api / unavailable / probe-failed） → 不可见
//
// null = 探测中，渲染层应当先隐藏，等结果出来再决定。
export function useLocalChannelAvailability() {
  const visible = ref<boolean | null>(null);
  let aborted = false;

  async function probe() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'probeLocalLlm', providerId: 'gemini-nano' }) as LocalLlmProbeResult | undefined;
      if (aborted) return;
      const a = res?.availability;
      visible.value = a === 'available' || a === 'downloadable' || a === 'downloading';
    } catch {
      if (!aborted) visible.value = false;
    }
  }

  onMounted(() => { void probe(); });
  onBeforeUnmount(() => { aborted = true; });

  return { visible, recheck: probe };
}
