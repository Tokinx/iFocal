import { onMounted, ref } from 'vue';
import { downloadSettingsSnapshot, loadSettingsSnapshot, parseSettingsImportFile, saveSettingsSnapshot } from '@/shared/settings-import-export';
import { useToast } from './useToast';

export function useSettingsImport() {
  const toast = useToast();
  const importerRef = ref<HTMLInputElement | null>(null);
  const version = ref<string>('-');

  async function onExport() {
    try {
      const snapshot = await loadSettingsSnapshot();
      downloadSettingsSnapshot(snapshot);
      toast.success('已导出设置');
    } catch {
      toast.error('导出失败');
    }
  }

  function triggerImport() {
    importerRef.value?.click();
  }

  async function onImportChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const snapshot = await parseSettingsImportFile(file);
      await saveSettingsSnapshot(snapshot);
      toast.success('导入成功，正在刷新');
      window.location.reload();
    } catch {
      toast.error('导入失败：JSON 解析错误');
    }
  }

  onMounted(async () => {
    try {
      const v = (chrome as any)?.runtime?.getManifest?.()?.version;
      if (v) { version.value = v; return; }
    } catch { }
    try {
      const url = (chrome as any)?.runtime?.getURL?.('manifest.json');
      if (url) {
        const res = await fetch(url);
        if (res.ok) {
          const m = await res.json();
          version.value = String(m?.version || '-');
        }
      }
    } catch { }
  });

  return {
    importerRef,
    version,
    onExport,
    triggerImport,
    onImportChange,
  };
}
