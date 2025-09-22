import { onUnmounted } from 'vue';

export type ToastType = 'success' | 'error' | 'info';

function ensureContainer() {
  let el = document.getElementById('__fc_toast_container__');
  if (!el) {
    el = document.createElement('div');
    el.id = '__fc_toast_container__';
    el.style.position = 'fixed';
    el.style.top = '12px';
    el.style.right = '12px';
    el.style.zIndex = '2147483647';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '8px';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
  }
  return el;
}

function makeToastEl(message: string, type: ToastType) {
  const el = document.createElement('div');
  el.style.pointerEvents = 'auto';
  el.style.minWidth = '200px';
  el.style.maxWidth = '420px';
  el.style.padding = '10px 12px';
  el.style.borderRadius = '8px';
  el.style.fontSize = '12px';
  el.style.lineHeight = '1.4';
  el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)';
  el.style.border = '1px solid rgba(148,163,184,0.35)';
  if (type === 'success') {
    el.style.background = 'rgba(16,185,129,0.1)';
    el.style.color = '#064e3b';
    el.style.borderColor = 'rgba(16,185,129,0.35)';
  } else if (type === 'error') {
    el.style.background = 'rgba(239,68,68,0.1)';
    el.style.color = '#7f1d1d';
    el.style.borderColor = 'rgba(239,68,68,0.35)';
  } else {
    el.style.background = 'rgba(226,232,240,0.5)';
    el.style.color = '#0f172a';
  }
  el.textContent = message;
  return el;
}

export function useToast() {
  const container = ensureContainer();

  function show(message: string, type: ToastType = 'info', duration = 1800) {
    const toast = makeToastEl(message, type);
    container.appendChild(toast);
    const timer = window.setTimeout(() => {
      try { container.removeChild(toast); } catch {}
    }, duration);
    // 清理
    onUnmounted(() => { window.clearTimeout(timer); try { container.removeChild(toast); } catch {} });
  }

  return {
    success: (m: string, d?: number) => show(m, 'success', d),
    error: (m: string, d?: number) => show(m, 'error', d),
    info: (m: string, d?: number) => show(m, 'info', d)
  };
}

