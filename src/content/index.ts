// 注意：为避免打包为 ESM 并在内容脚本环境报错，这里不再使用 import 语句。
// 页面（非 Shadow DOM）内插入模式所需的全局加载样式，避免仅注入到 Shadow 导致动画丢失
import { createWrapper as sharedCreateWrapper, applyWrapperResult as sharedApplyWrapperResult, updateBreakForTranslated } from '@/shared/tx-dom';
const DOC_STYLE = `
.ifocal-target-wrapper{display:inline-flex;vertical-align:middle}
.ifocal-tx{display:inline;overflow-wrap:anywhere;word-break:break-word;hyphens:auto}
@keyframes ifocal-spin{to{transform:rotate(360deg)}}
.ifocal-loading{width:16px;height:16px;border:2px solid rgba(15,23,42,0.18);margin-left:5px;border-top-color:#0f172a;border-radius:50%;animation:ifocal-spin 1s linear infinite;display:inline-block;vertical-align:middle;line-height:1}
`;

// 样式通过 Shadow DOM 注入；语言列表通过后台消息读取。
let uiHost: HTMLElement | null = null;
let uiShadow: ShadowRoot | null = null;
const SHADOW_STYLE = `
:host{ all: initial; }
:host ::-webkit-scrollbar {width: 10px;height: 10px;}
:host ::-webkit-scrollbar-thumb {background-color: #656D78;background-clip: padding-box;border: 3px solid transparent;border-radius:5px;}
.ifocal-overlay{position:absolute;z-index:2147483647;max-width:420px;width:100%;background:rgba(255,255,255,0.88);border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,0.18);color:#0f172a;line-height:1.55;backdrop-filter:saturate(180%) blur(12px);-webkit-backdrop-filter:saturate(180%) blur(12px);pointer-events:auto}
.ifocal-overlay-body{white-space:pre-wrap;max-height:50vh;overflow-y:auto;position:relative;padding:0 12px 12px;}
.ifocal-overlay-header{cursor:move;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:12px 12px 0;}
.ifocal-header-left{display:flex;align-items:center;gap:8px}
.ifocal-dd-wrap{position:relative}
.ifocal-dd-btn{height:28px;padding:0 10px;font-size:12px;border:none;border-radius:24px;background:rgba(0,0,0,0.05);color:#0f172a;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ifocal-dd-menu{position:absolute;top:110%;left:0;min-width:200px;max-height:600px;overflow:auto;background:#fff;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.12);font-size:12px;padding:6px;z-index:3}
.ifocal-dd-item{padding:8px 10px;border-radius:8px;cursor:pointer}
.ifocal-dd-item:hover{background:rgba(15,23,42,.06)}
.ifocal-dd-item .title{font-weight:600;line-height:1.1}
.ifocal-dd-item .sub{opacity:.65;font-size:12px;line-height:1.1}
.ifocal-close{height:28px;width:28px;border:none;border-radius:24px;background:unset;color:#6a6a6a;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.ifocal-close:hover{background:rgba(15,23,42,.06)}
.copy-btn{position:absolute;top:4px;right:4px;height:24px;width:28px;border:1px solid rgba(15,23,42,0.15);border-radius:6px;background:rgba(255,255,255,0.9);cursor:pointer;opacity:0;transition:opacity .15s ease}
.ifocal-overlay:hover .copy-btn{opacity:1}
.ifocal-dot{position:absolute;width:10px;height:10px;border-radius:50%;background:#0f172a;opacity:.9;cursor:pointer;box-shadow:0 0 0 2px rgba(255,255,255,.9);z-index:2147483647;pointer-events:auto}
.hidden{display:none}

/* 全文翻译进度气泡（固定右上角） */
.ifocal-tx-progress{position:fixed;right:12px;top:12px;z-index:2147483647;background:rgba(15,23,42,0.88);color:#fff;font-size:12px;padding:8px 10px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px}
.ifocal-tx-progress .bar{position:relative;width:120px;height:6px;background:rgba(255,255,255,.2);border-radius:4px;overflow:hidden}
.ifocal-tx-progress .bar .inner{position:absolute;left:0;top:0;bottom:0;background:#22c55e;width:0%}
.ifocal-tx-progress .meta{opacity:.85}

${DOC_STYLE}
`;

function ensureDocLoadingStyle() {
  try {
    if (document.getElementById('ifocal-loading-style')) return;
    const s = document.createElement('style');
    s.id = 'ifocal-loading-style';
    s.textContent = DOC_STYLE;
    (document.head || document.documentElement || document.body)?.appendChild(s);
  } catch {}
}

// 将预设样式注入到文档（供 ifocal-target-style-* 使用）
// 注意：为避免内容脚本出现 ESM import 报错，这里内置一份默认预设作为回退；
// 若存储里有自定义预设，将按名称覆盖默认项。
const DEFAULT_TARGET_STYLE_PRESETS = [
  {
    name: 'ifocal-target-style-dotted',
    description: '点状下划线',
    css: `.ifocal-target-inline-wrapper.ifocal-target-style-dotted{margin:8px 0;}
.ifocal-target-inline-wrapper.ifocal-target-style-dotted .ifocal-target-inner{
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
    css: `.ifocal-target-inline-wrapper.ifocal-target-style-highlight{margin:8px 0;}
.ifocal-target-inline-wrapper.ifocal-target-style-highlight .ifocal-target-inner{
  background-color: yellow;
  font-family: inherit;
}`
  },
  {
    name: 'ifocal-target-style-chip',
    description: '圆角标签',
    css: `.ifocal-target-inline-wrapper.ifocal-target-style-chip{margin:8px 0;}
.ifocal-target-inline-wrapper.ifocal-target-style-chip .ifocal-target-inner{
  display:inline-block;
  background-color:#f1f5f9;
  color:#0f172a;
  border:1px solid #e2e8f0;
  border-radius:999px;
  padding:2px 8px;
  font-size:0.95em;
}`
  },
  {
    name: 'ifocal-target-style-fadein',
    description: '淡入动画',
    css: `@keyframes ifocal-fadein{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}
.ifocal-target-inline-wrapper.ifocal-target-style-fadein{margin:8px 0;}
.ifocal-target-inline-wrapper.ifocal-target-style-fadein .ifocal-target-inner{
  animation: ifocal-fadein .35s ease;
}`
  },
  {
    name: 'ifocal-target-style-bubble',
    description: '气泡卡片',
    css: `.ifocal-target-inline-wrapper.ifocal-target-style-bubble{margin:8px 0;}
.ifocal-target-inline-wrapper.ifocal-target-style-bubble .ifocal-target-inner{
  display:inline-block;
  background:rgba(255,255,255,0.9);
  border:1px solid rgba(15,23,42,0.12);
  box-shadow:0 2px 10px rgba(15,23,42,0.08);
  border-radius:10px;
  padding:6px 8px;
}`
  },
  {
    name: 'ifocal-target-style-underline-solid',
    description: '实体下划线',
    css: `.ifocal-target-inline-wrapper.ifocal-target-style-underline-solid{margin:8px 0;}
.ifocal-target-inline-wrapper.ifocal-target-style-underline-solid .ifocal-target-inner{
  border-bottom:2px solid rgba(71,85,105,0.6);
  padding-bottom:2px;
}`
  }
];
function ensureTargetStylePresets(presets: Array<{ name: string; css: string }> | undefined | null) {
  try {
    const id = 'ifocal-target-style-presets';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    // 合并默认预设与存储预设：存储同名覆盖默认
    const defaults = DEFAULT_TARGET_STYLE_PRESETS as any[];
    const incoming = (presets && Array.isArray(presets)) ? presets : [];
    const byName = new Map<string, any>();
    defaults.forEach((p: any) => { if (p?.name) byName.set(String(p.name), p); });
    incoming.forEach((p: any) => { if (p?.name) byName.set(String(p.name), p); });
    const merged = Array.from(byName.values());
    const css = (merged || []).map((p: any) => String(p?.css || '')).join('\n');
    if (!css) return;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      el.textContent = css;
      (document.head || document.documentElement || document.body)?.appendChild(el);
    } else if (el.textContent !== css) {
      el.textContent = css;
    }
  } catch {}
}

function ensureUiRoot(): ShadowRoot {
  if (uiShadow) return uiShadow;
  try {
    uiHost = document.getElementById('ifocal-host') as HTMLElement | null;
    if (!uiHost) {
      uiHost = document.createElement('div');
      uiHost.id = 'ifocal-host';
      uiShadow = uiHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = SHADOW_STYLE;
      uiShadow.appendChild(style);
      (document.documentElement || document.body).appendChild(uiHost);
    } else {
      uiShadow = uiHost.shadowRoot || uiHost.attachShadow({ mode: 'open' });
      if (!uiShadow.querySelector('style')) {
        const style = document.createElement('style');
        style.textContent = SHADOW_STYLE;
        uiShadow.appendChild(style);
      }
    }
  } catch (error) {
    console.warn('[iFocal] failed to init shadow root', error);
    return (document as any);
  }
  return uiShadow!;
}
const LOG_PREFIX = '[iFocal]';

console.log(`${LOG_PREFIX} content script ready`);

type OverlayHandle = {
  root: HTMLElement;
  setText: (text: string) => void;
  append: (text: string) => void;
  setLoading: (flag: boolean) => void;
  _port?: chrome.runtime.Port | null;
};

type ChannelPair = { channel: string; model: string } | null;

type StorageConfig = {
  channels?: Array<{ name: string; models?: string[] }>;
  defaultModel?: ChannelPair;
  translateModel?: ChannelPair;
  activeModel?: ChannelPair;
  translateTargetLang?: string;
};

let hoveredElement: HTMLElement | null = null;
let actionKey = 'Alt';
let displayMode: 'insert' | 'overlay' = 'insert';
let enableSelectionTranslation = true;
let lastOverlay: OverlayHandle | null = null;
let keydownCooldown = false;

let lastSelectionText = '';
let lastSelectionRect: DOMRect | null = null;
let selectionSyncTimer: number | undefined;
let selectionUpdateTimer: number | undefined;
let selectionDot: HTMLElement | null = null;
const SELECTION_SYNC_DELAY = 100;
const SELECTION_DOT_UPDATE_DELAY = 100;
// 近祖滚动容器监听（仅监听一个，降低成本）
let currentScrollContainer: HTMLElement | null = null;
let currentScrollHandler: ((ev?: Event) => void) | null = null;
// overlay 是否跟随选区移动（点圆点创建的 overlay 默认跟随；用户拖拽后取消跟随）
let overlayAutoFollow = false;

// 语言列表：默认回退 + 后台拉取覆盖
type Lang = { value: string; label: string };
let SUPPORTED_LANGUAGES: Lang[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' }
];

try {
  chrome.runtime.sendMessage({ action: 'getSupportedLanguages' }, (resp: { ok?: boolean; data?: Lang[] } | undefined) => {
    try { void chrome.runtime.lastError; } catch {}
    if (resp && resp.ok && Array.isArray(resp.data)) SUPPORTED_LANGUAGES = resp.data as Lang[];
  });
} catch {}

// 重载 
function readHotkeys() {
  try {
    chrome.storage.sync.get(['actionKey', 'hoverKey', 'selectKey', 'displayMode', 'enableSelectionTranslation'], (items) => {
      if (items?.actionKey) actionKey = items.actionKey;
      else if (items?.hoverKey) actionKey = items.hoverKey;
      else if (items?.selectKey) actionKey = items.selectKey;
      if (items?.displayMode === 'overlay' || items?.displayMode === 'insert') {
        displayMode = items.displayMode;
      }
      enableSelectionTranslation = typeof items?.enableSelectionTranslation === 'boolean' ? items.enableSelectionTranslation : true;
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      if (changes.actionKey) actionKey = changes.actionKey.newValue || 'Alt';
      if (changes.displayMode) {
        const mode = changes.displayMode.newValue as 'insert' | 'overlay';
        displayMode = mode || 'insert';
      }
      if (changes.enableSelectionTranslation) enableSelectionTranslation = !!changes.enableSelectionTranslation.newValue;
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} failed to read hotkeys`, error);
  }
}

readHotkeys();

// 页面加载时注入译文样式预设（与 DOC_STYLE 一并）
try {
  chrome.storage.sync.get(['targetStylePresets'], (items: any) => {
    try { void chrome.runtime.lastError; } catch {}
    const presets = Array.isArray(items?.targetStylePresets) ? items.targetStylePresets : null;
    ensureTargetStylePresets(presets as any);
  });
} catch {}

// 当设置页更改样式预设或当前样式名时，实时注入并更新页面已有译文
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.targetStylePresets) {
      const next = changes.targetStylePresets.newValue as any[] | undefined | null;
      ensureTargetStylePresets(next || null);
    }
    if (changes.wrapperStyleName) {
      const nextName = String(changes.wrapperStyleName.newValue || '').trim() || 'ifocal-target-style-dotted';
      txWrapperStyleName = nextName;
      // 更新已存在的包裹结构
      try {
        const wrappers = document.querySelectorAll('font.ifocal-target-wrapper[data-tx-style]');
        wrappers.forEach((w) => {
          try { (w as HTMLElement).setAttribute('data-tx-style', nextName); } catch {}
          const inline = (w as HTMLElement).querySelector('font.ifocal-target-inline-wrapper') as HTMLElement | null;
          if (inline) inline.className = `notranslate ifocal-target-inline-wrapper ${nextName}`;
        });
      } catch {}
    }
  });
} catch {}

function findTextBlockElement(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return null;
  const BLOCK_TAGS = new Set(['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const INVALID_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (INVALID_TAGS.has(current.tagName)) return null;
    const text = (current.innerText || '').trim();
    if (BLOCK_TAGS.has(current.tagName) && text.length >= 6) return current;
    current = current.parentElement;
  }
  return element;
}

document.addEventListener('mouseover', (event) => {
  hoveredElement = findTextBlockElement(event.target);
});

document.addEventListener('mouseout', () => {
  hoveredElement = null;
});

function scheduleSelectionSync(text: string) {
  if (!chrome?.runtime?.sendMessage) return;
  window.clearTimeout(selectionSyncTimer);
  selectionSyncTimer = window.setTimeout(() => {
    chrome.runtime.sendMessage({ source: 'ifocal', type: 'selection', text });
  }, SELECTION_SYNC_DELAY);
}

document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  if (selectedText) {
    lastSelectionText = selectedText;
    lastSelectionRect = getSelectionRect();
    if (enableSelectionTranslation && lastSelectionRect) showSelectionDot(lastSelectionRect);
    attachScrollListenerForSelection();
  } else {
    lastSelectionText = '';
    lastSelectionRect = null;
    hideSelectionDot();
    maybeDetachScrollListener();
  }
  scheduleSelectionSync(selectedText);
});

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';
  if (!text) {
    hideSelectionDot();
  } else {
    if (selectionUpdateTimer) window.clearTimeout(selectionUpdateTimer);
    selectionUpdateTimer = window.setTimeout(() => {
      attachScrollListenerForSelection();
      updateSelectionDotPosition();
    }, SELECTION_DOT_UPDATE_DELAY);
  }
  scheduleSelectionSync(text);
});

// 触控端：在触摸结束时也做一次最终刷新
document.addEventListener('touchend', () => {
  try {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    if (selectedText) {
      lastSelectionText = selectedText;
      lastSelectionRect = getSelectionRect();
      if (enableSelectionTranslation && lastSelectionRect) showSelectionDot(lastSelectionRect);
      attachScrollListenerForSelection();
    } else {
      lastSelectionText = '';
      lastSelectionRect = null;
      hideSelectionDot();
      maybeDetachScrollListener();
    }
    scheduleSelectionSync(selectedText);
  } catch {}
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key !== actionKey || keydownCooldown) return;
  event.preventDefault();
  keydownCooldown = true;
  window.setTimeout(() => {
    keydownCooldown = false;
  }, 800);
  if (hoveredElement) {
    toggleHoverTranslate(hoveredElement);
  }
});

// 采用文档坐标定位（left/top 加上 scrollX/scrollY），无需随页面滚动更新。

function getSelectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  const last = rects && rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  if (last && last.width >= 0 && last.height >= 0) return last as DOMRect;
  return null;
}

function getSelectionAnchorNode(): Node | null {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    return sel.getRangeAt(0).startContainer as Node;
  } catch { return null; }
}

function isScrollable(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  const overflowY = cs.overflowY;
  const overflowX = cs.overflowX;
  const canY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight;
  const canX = (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') && el.scrollWidth > el.clientWidth;
  return canY || canX;
}

function nearestScrollableAncestor(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null = (node as HTMLElement) && (node as HTMLElement).nodeType === 1 ? (node as HTMLElement) : (node as any)?.parentElement || null;
  while (el) {
    if (isScrollable(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function detachScrollListener() {
  try { if (currentScrollContainer && currentScrollHandler) currentScrollContainer.removeEventListener('scroll', currentScrollHandler, true); } catch {}
  currentScrollContainer = null;
  currentScrollHandler = null;
}

function maybeDetachScrollListener() {
  if (!selectionDot && !overlayAutoFollow) detachScrollListener();
}

function attachScrollListenerForSelection() {
  const anchor = getSelectionAnchorNode();
  const container = nearestScrollableAncestor(anchor);
  if (container === currentScrollContainer) return;
  detachScrollListener();
  if (container) {
    currentScrollContainer = container;
    currentScrollHandler = () => updateSelectionDotPosition();
    container.addEventListener('scroll', currentScrollHandler, { passive: true, capture: true } as any);
  }
}

function createOverlayAt(x: number, y: number): OverlayHandle {
  const shadow = ensureUiRoot();
  if (lastOverlay?.root?.remove) lastOverlay.root.remove();
  const root = document.createElement('div');
  root.className = 'ifocal-overlay';
  root.style.left = `${Math.max(8, Math.floor(x))}px`;
  root.style.top = `${Math.max(8, Math.floor(y))}px`;

  const body = document.createElement('div');
  body.className = 'ifocal-overlay-body';
  root.appendChild(body);

  // Copy button: show only on overlay hover
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.title = 'Copy';
  copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  copyBtn.addEventListener('click', () => {
    try { navigator.clipboard.writeText(body.textContent || ''); } catch {}
  });
  body.appendChild(copyBtn);

  (shadow as unknown as HTMLElement).appendChild(root);

  let spinner: HTMLElement | null = null;
  const overlay: OverlayHandle = {
    root,
    setText(text) {
      body.textContent = text;
    },
    append(text) {
      body.textContent = `${body.textContent || ''}${text}`;
    },
    setLoading(flag) {
      if (flag) {
        if (!spinner) {
          spinner = document.createElement('div');
          spinner.className = 'ifocal-loading';
          body.innerHTML = '';
          body.appendChild(spinner);
        }
      } else if (spinner?.parentNode) {
        spinner.parentNode.removeChild(spinner);
        spinner = null;
      }
    }
  };

  lastOverlay = overlay;
  return overlay;
}

function showSelectionDot(rect: DOMRect) {
  const shadow = ensureUiRoot();
  try { hideSelectionDot(); } catch {}
  const dot = document.createElement('div');
  dot.className = 'ifocal-dot';
  const left = Math.floor(rect.right + window.scrollX - 6);
  const top = Math.floor(rect.top + window.scrollY - 12);
  dot.style.left = `${left}px`;
  dot.style.top = `${top}px`;
  const trigger = (ev: Event) => {
    ev.preventDefault(); ev.stopPropagation();
    const overlay = createOverlayAt(left - 8, top + 16);
    overlayAutoFollow = true;
    overlay.setLoading(true);
    chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'activeModel', 'translateTargetLang'], (cfg: StorageConfig) => {
      const reqPair = cfg.activeModel || null;
      const pair = pickPair(cfg, 'translate', reqPair);
      const lang = cfg.translateTargetLang || 'zh-CN';
      attachOverlayHeaderVue(overlay, cfg, pair, lang, lastSelectionText);
      startStreamForOverlay(overlay, 'translate', lastSelectionText, pair, lang);
    });
    hideSelectionDot();
  };
  dot.addEventListener('mousedown', trigger, { passive: false });
  dot.addEventListener('mouseup', trigger, { passive: false });
  dot.addEventListener('click', trigger, { passive: false });
  dot.addEventListener('touchstart', trigger, { passive: false });
  dot.addEventListener('touchend', trigger, { passive: false });
  (shadow as unknown as HTMLElement).appendChild(dot);
  selectionDot = dot;
}

let rafPending = false;
function updateSelectionDotPosition() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!lastSelectionText) return;
    const rect = getSelectionRect();
    if (!rect) { hideSelectionDot(); return; }
    const left = Math.floor(rect.right + window.scrollX - 6);
    const top = Math.floor(rect.top + window.scrollY - 12);
    if (selectionDot) {
      selectionDot.style.left = `${left}px`;
      selectionDot.style.top = `${top}px`;
    }
    if (overlayAutoFollow && lastOverlay?.root) {
      lastOverlay.root.style.left = `${left - 8}px`;
      lastOverlay.root.style.top = `${top + 16}px`;
    }
  });
}

function hideSelectionDot() {
  if (selectionDot && selectionDot.parentNode) selectionDot.parentNode.removeChild(selectionDot);
  selectionDot = null;
}

// updateBreakForTranslated 已抽取到共享模块

function toggleHoverTranslate(blockEl: HTMLElement) {
  if (!chrome?.runtime) return;
  try {
    if (displayMode === 'overlay') {
      const rect = blockEl.getBoundingClientRect();
      const overlay = createOverlayAt(rect.left + window.scrollX, rect.bottom + window.scrollY + 8);
      overlay.setLoading(true);
      const source = (blockEl.innerText || '').trim();
      chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'activeModel', 'translateTargetLang'], (cfg: StorageConfig) => {
        const reqPair = cfg.activeModel || null;
        const pair = pickPair(cfg, 'translate', reqPair);
        const lang = cfg.translateTargetLang || 'zh-CN';
        attachOverlayHeaderVue(overlay, cfg, pair, lang, source);
        startStreamForOverlay(overlay, 'translate', source, pair, lang);
      });
      return;
    }

    const existWrapper = blockEl.querySelector<HTMLElement>('font.ifocal-target-wrapper.notranslate');
    if (existWrapper || blockEl.dataset.fcTranslated === '1') {
      existWrapper?.remove();
      const br = blockEl.querySelector('br.ifocal-target-break');
      br?.remove();
      blockEl.dataset.fcTranslated = '';
      return;
    }

    chrome.storage.sync.get(['translateTargetLang', 'wrapperStyleName', 'targetStylePresets'], (cfg: StorageConfig & any) => {
      const langCode = (cfg.translateTargetLang || 'zh-CN').trim();
      const styleName = (cfg.wrapperStyleName || 'ifocal-target-style-dotted').trim();
      ensureDocLoadingStyle();
      ensureTargetStylePresets(cfg.targetStylePresets as any[]);
      // 统一创建 wrapper，并标注样式名供 applyWrapperResult 使用
      const wrapper = sharedCreateWrapper(`inline_${Date.now()}`, langCode);
      try { wrapper.setAttribute('data-tx-style', styleName); } catch {}
      blockEl.appendChild(wrapper);

      const sourceText = (blockEl.innerText || '').trim();
      chrome.runtime.sendMessage({ action: 'performAiAction', task: 'translate', text: sourceText }, (response: { ok?: boolean; result?: string; error?: string } | undefined) => {
        try { void chrome.runtime.lastError; } catch { }
        blockEl.dataset.fcTranslated = '1';
        const msg = response && response.ok ? response.result : response?.error || '';
        sharedApplyWrapperResult(wrapper, msg || '', langCode, undefined, sourceText);
      });
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} toggleHoverTranslate failed`, error);
  }
}

function pickPair(cfg: StorageConfig, task: string, reqPair: ChannelPair): ChannelPair {
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  const isValid = (pair?: ChannelPair) => {
    if (!pair?.channel || !pair.model) return false;
    const channel = channels.find((c) => c.name === pair.channel);
    return !!(channel && Array.isArray(channel.models) && channel.models.includes(pair.model));
  };
  if (isValid(reqPair)) return reqPair;
  if (task === 'translate' && isValid(cfg.translateModel)) return cfg.translateModel!;
  if (isValid(cfg.defaultModel)) return cfg.defaultModel!;
  if (isValid(cfg.activeModel)) return cfg.activeModel!;
  for (const ch of channels) {
    if (Array.isArray(ch.models) && ch.models.length) return { channel: ch.name, model: ch.models[0]! };
  }
  return null;
}

function triggerSelectionTranslate() {
  if (!lastSelectionText) return;
  const rect = lastSelectionRect || getSelectionRect();
  const overlay = rect ? createOverlayAt(rect.left + window.scrollX, rect.bottom + window.scrollY + 8) : createOverlayAt(80, 80);
  overlay.setLoading(true);
  chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'activeModel', 'translateTargetLang'], (cfg: StorageConfig) => {
    const reqPair = cfg.activeModel || null;
    const pair = pickPair(cfg, 'translate', reqPair);
    const lang = cfg.translateTargetLang || 'zh-CN';
    attachOverlayHeaderVue(overlay, cfg, pair, lang, lastSelectionText);
    startStreamForOverlay(overlay, 'translate', lastSelectionText, pair, lang);
  });
}

function startStreamForOverlay(overlay: OverlayHandle, task: string, text: string, pair: ChannelPair, lang: string) {
  if (!chrome?.runtime?.connect) return;
  if (overlay._port) {
    try {
      overlay._port.disconnect();
    } catch (error) {
      console.warn(`${LOG_PREFIX} failed to disconnect port`, error);
    }
    overlay._port = null;
  }
  overlay.setText('');
  overlay.setLoading(true);
  const port = chrome.runtime.connect({ name: 'ai-stream' });
  overlay._port = port;
  let first = true;
  port.onMessage.addListener((message) => {
    if (message.type === 'delta') {
      if (first) {
        overlay.setLoading(false);
        first = false;
      }
      overlay.append(message.text as string);
    } else if (message.type === 'error') {
      overlay.setLoading(false);
      overlay.append(`\n[Error] ${message.error}`);
    }
  });
  // 连接失败或后台未就绪时，读取 lastError 以抑制控制台“Receiving end does not exist”
  try {
    port.onDisconnect.addListener(() => {
      try {
        const err = chrome.runtime.lastError;
        if (err) {
          overlay.setLoading(false);
          overlay.append(`\n[Error] ${err.message}`);
        }
      } catch { }
    });
  } catch { }
  const payload: Record<string, unknown> = { type: 'start', task, text };
  if (pair?.channel && pair.model) {
    payload.channel = pair.channel;
    payload.model = pair.model;
  }
  if (lang) payload.targetLang = lang;
  port.postMessage(payload);
}

function attachOverlayHeaderVue(overlay: OverlayHandle, cfg: StorageConfig, pair: ChannelPair, lang: string, text: string) {
  const header = document.createElement('div');
  header.className = 'ifocal-overlay-header';

  // 左侧：Models + Language（自定义下拉）
  const left = document.createElement('div');
  left.className = 'ifocal-header-left';

  // 自定义下拉使用预定义 CSS 类，减少内联样式

  // 模型下拉
  const modelWrap = document.createElement('div');
  modelWrap.className = 'ifocal-dd-wrap';
  const modelBtn = document.createElement('button');
  modelBtn.className = 'ifocal-dd-btn';
  modelBtn.textContent = pair ? `${pair.model}` : 'Models';
  const modelMenu = document.createElement('div');
  modelMenu.className = 'ifocal-dd-menu hidden';
  const pairs: ChannelPair[] = [];
  const list = Array.isArray(cfg.channels) ? cfg.channels : [];
  list.forEach((ch) => (ch.models || []).forEach((m) => pairs.push({ channel: ch.name, model: m })));
  pairs.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'ifocal-dd-item';
    item.innerHTML = `<div class="title">${p.model}</div><div class="sub">${p.channel}</div>`;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      modelBtn.textContent = p.model;
      startStreamForOverlay(overlay, 'translate', text, p, lang);
      modelMenu.classList.add('hidden');
    });
    modelMenu.appendChild(item);
  });
  modelBtn.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); modelMenu.classList.toggle('hidden'); });
  modelWrap.appendChild(modelBtn);
  modelWrap.appendChild(modelMenu);

  // 语言下拉（读取 shared 列表）
  const langWrap = document.createElement('div');
  langWrap.className = 'ifocal-dd-wrap';
  const langBtn = document.createElement('button');
  langBtn.className = 'ifocal-dd-btn';
  const currentLang = SUPPORTED_LANGUAGES.find(l => l.value === lang)?.label || lang;
  langBtn.textContent = currentLang || 'Language';
  const langMenu = document.createElement('div');
  langMenu.className = 'ifocal-dd-menu hidden';
  SUPPORTED_LANGUAGES.forEach((L) => {
    const item = document.createElement('div');
    item.className = 'ifocal-dd-item';
    item.textContent = `${L.label}`;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      chrome.storage.sync.set({ translateTargetLang: L.value }, () => {
        langBtn.textContent = L.label;
        startStreamForOverlay(overlay, 'translate', text, parsePair(modelBtn.textContent || ''), L.value);
      });
      langMenu.classList.add('hidden');
    });
    langMenu.appendChild(item);
  });
  langBtn.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); langMenu.classList.toggle('hidden'); });
  langWrap.appendChild(langBtn);
  langWrap.appendChild(langMenu);

  left.appendChild(modelWrap);
  left.appendChild(langWrap);

  // 右侧：Close Icon
  const right = document.createElement('div');
  const closeBtn = document.createElement('button');
  // 统一 Iconify 风格的内联 SVG 关闭图标
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>';
  closeBtn.title = 'Close';
  closeBtn.className = 'ifocal-close';
  closeBtn.addEventListener('click', () => {
    try { if (overlay._port) { overlay._port.disconnect(); overlay._port = null; } } catch { }
    try { overlay.root.remove(); } catch { }
    overlayAutoFollow = false;
    maybeDetachScrollListener();
  });
  right.appendChild(closeBtn);

  header.appendChild(left);
  header.appendChild(right);
  overlay.root.insertBefore(header, overlay.root.firstChild);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const handleMove = (event: MouseEvent) => {
    if (!dragging) return;
    overlay.root.style.left = `${startLeft + (event.clientX - startX)}px`;
    overlay.root.style.top = `${startTop + (event.clientY - startY)}px`;
  };

  const handleUp = () => {
    dragging = false;
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleUp);
  };

  header.addEventListener('mousedown', (event) => {
    dragging = true;
    overlayAutoFollow = false;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = parseInt(overlay.root.style.left, 10) || 0;
    startTop = parseInt(overlay.root.style.top, 10) || 0;
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  });

  const outsideClick = (event: MouseEvent) => {
    const path = (event as any).composedPath ? (event as any).composedPath() : [];
    if (!(path as any[]).includes(overlay.root)) {
      if (overlay._port) {
        try {
          overlay._port.disconnect();
        } catch (error) {
          console.warn(`${LOG_PREFIX} failed to disconnect port`, error);
        }
        overlay._port = null;
      }
      overlay.root.remove();
      overlayAutoFollow = false;
      maybeDetachScrollListener();
      document.removeEventListener('mousedown', outsideClick, true);
    }
  };
  window.setTimeout(() => document.addEventListener('mousedown', outsideClick, true), 0);

  // 点击 overlay 内其它区域，自动收起菜单
  const closeMenus = () => { modelMenu.classList.add('hidden'); langMenu.classList.add('hidden'); };
  overlay.root.addEventListener('click', (ev) => {
    const el = ev.target as HTMLElement;
    if (!el.closest('button')) closeMenus();
  }, true);
}

function parsePair(value: string | null | undefined): ChannelPair {
  if (!value) return null;
  const [channel, model] = String(value).split('|');
  if (!channel || !model) return null;
  return { channel, model };
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && lastOverlay?.root) {
    if (lastOverlay._port) {
      try {
        lastOverlay._port.disconnect();
      } catch (error) {
        console.warn(`${LOG_PREFIX} failed to disconnect port`, error);
      }
      lastOverlay._port = null;
    }
    lastOverlay.root.remove();
    lastOverlay = null;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-page-content') {
    const title = document.title || 'Current page';
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    const text = article?.textContent || main?.textContent || document.body?.innerText || '';
    sendResponse({ title, excerpt: text.slice(0, 2000) });
    return true;
  }
  return undefined;
});

// ============ 全文翻译编排器（MVP） ============
// 采集→ID→分桶→限流→批量→调用后台 translateBatch→按 id 回填
// 说明：为降低对现有页面影响，使用 <span class="ifocal-tx notranslate" data-tx-id> 包裹文本节点，保持 inline 流水布局；
// 并提供右上角进度气泡。此为 MVP，可后续接入缓存与 MutationObserver 复播。

type TxItem = { id: string; text: string; bucket: 'short' | 'medium' | 'long' };
type TxMap = Map<string, { text: string; nodes: HTMLElement[]; done?: boolean }>;

let txTargetLang = 'zh-CN';
// 已移除 wrapperStyle（外层内联样式）支持
let txWrapperStyleName = 'ifocal-target-style-dotted';
let txOnlyShort = false;
let txDisableCache = false;
let txMap: TxMap = new Map();
let qShort: string[] = []; // id 列表
let qMedium: string[] = [];
let qLong: string[] = [];
let qStrictShort: string[] = [];
let qStrictMedium: string[] = [];
let qStrictLong: string[] = [];
let inFlight = 0;
let completed = 0;
let total = 0;
let progressEl: HTMLElement | null = null;
let loopRunning = false;
// 调用计数（本轮）：
let callsShort = 0, callsMedium = 0, callsLong = 0;
let strictShort = 0, strictMedium = 0, strictLong = 0;
// B) 指标：命中缓存与时延
let cacheHits = 0;
let startTs = 0;
let firstReturnTs = 0;

function djb2Hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  // 转为无符号并以 8 字节十六进制表示
  return (h >>> 0).toString(16);
}

function normalizeText(s: string): string {
  return s.replace(/[\t\n\r ]+/g, ' ').trim();
}

function computeId(text: string, targetLang: string): string {
  const norm = normalizeText(text);
  return `tx_${targetLang}_${djb2Hash(norm)}`;
}

function isInOurUi(node: Node): boolean {
  const el = node instanceof HTMLElement ? node : (node.parentElement as HTMLElement | null);
  if (!el) return false;
  if (el.closest('#ifocal-host')) return true; // Shadow 宿主
  // 跳过我们插入的 wrapper 及其任何后代
  try { if ((el as Element).closest && (el as Element).closest('font.ifocal-target-wrapper, .ifocal-target-wrapper')) return true; } catch {}
  if (el.classList && (el.classList.contains('ifocal-target-wrapper') || el.classList.contains('ifocal-tx'))) return true;
  return false;
}

function isVisibleElement(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return false;
  return true;
}

const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT','SELECT','OPTION','CODE','PRE','CANVAS','SVG']);
// 块级段落选择器：将其内部 strong/em/i/b/span 等行内文本视为一个整体翻译单元
const BLOCK_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,dt,dd,figcaption,caption';

function processedBlockAncestor(node: Node): HTMLElement | null {
  try {
    const el = (node as any).parentElement as HTMLElement | null;
    if (!el) return null;
    const block = el.closest(BLOCK_SELECTOR) as HTMLElement | null;
    if (block && block.hasAttribute('data-tx-block-id')) return block;
    return null;
  } catch { return null; }
}

function wrapBlockElement(blockEl: HTMLElement, id: string): HTMLElement {
  ensureDocLoadingStyle();
  const wrapper = sharedCreateWrapper(id, txTargetLang);
  try { wrapper.setAttribute('data-tx-style', txWrapperStyleName); } catch {}
  try { blockEl.setAttribute('data-tx-block-id', id); } catch {}
  try { blockEl.setAttribute('aria-busy', 'true'); } catch {}
  try { blockEl.appendChild(wrapper); } catch {}
  return wrapper;
}

function wrapTextNode(node: Text, id: string): HTMLElement | null {
  const parent = node.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return null;
  // 跳过隐藏或我们自身 UI
  if (!isVisibleElement(parent) || isInOurUi(parent)) return null;
  const text = node.nodeValue || '';
  // 使用共享模块创建一致的包裹样式
  ensureDocLoadingStyle();
  const wrapper = sharedCreateWrapper(id, txTargetLang);
  try { wrapper.setAttribute('data-tx-style', txWrapperStyleName); } catch {}
  // 不替换原文本节点，保持原文可见；将 wrapper 插入到其后，待翻译完成后通过换行策略分隔原文/译文
  try { parent.insertBefore(wrapper, node.nextSibling); } catch { parent.appendChild(wrapper); }
  return wrapper as unknown as HTMLElement;
}

function bucketOf(text: string): 'short' | 'medium' | 'long' {
  const len = normalizeText(text).length;
  if (len <= 30) return 'short';
  if (len <= 120) return 'medium';
  return 'long';
}

function collectTranslatableSpans(root: ParentNode): TxItem[] {
  const items: TxItem[] = [];
  const nodes: Text[] = [];
  const filter = (node: Node): number => {
    if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
    const val = (node.nodeValue || '').trim();
    if (!val) return NodeFilter.FILTER_REJECT;
    const parent = node.parentElement;
    if (!parent) return NodeFilter.FILTER_REJECT;
    if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
    try { if ((parent as Element).closest && (parent as Element).closest('font.ifocal-target-wrapper, .ifocal-target-wrapper')) return NodeFilter.FILTER_REJECT; } catch {}
    if (isInOurUi(node)) return NodeFilter.FILTER_REJECT;
    if (!isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  };
  // 第一遍仅收集节点，避免遍历时修改 DOM 导致遗漏
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: filter } as any);
  let n: Node | null;
  let count = 0;
  const MAX_SCAN = 10000;
  while ((n = walker.nextNode())) {
    nodes.push(n as Text);
    if (++count >= MAX_SCAN) break;
  }
  // 第二遍逐个包裹与登记
  for (const textNode of nodes) {
    // 节点可能在前面操作中已被替换，需校验仍然存在且满足条件
    if (!(textNode.parentElement)) continue;
    if (filter(textNode) !== NodeFilter.FILTER_ACCEPT) continue;
    // 若存在块级祖先，优先对块级元素作为整体创建一个翻译单元
    try {
      const block = (textNode.parentElement as HTMLElement).closest(BLOCK_SELECTOR) as HTMLElement | null;
      if (block && !block.hasAttribute('data-tx-block-id')) {
        const whole = (block.innerText || '').trim();
        const normWhole = normalizeText(whole);
        if (normWhole) {
          const id = computeId(normWhole, txTargetLang);
          const w = wrapBlockElement(block, id);
          const exists = txMap.get(id);
          if (exists) exists.nodes.push(w); else {
            txMap.set(id, { text: normWhole, nodes: [w] });
            const bucket = bucketOf(normWhole);
            items.push({ id, text: normWhole, bucket });
          }
          // 块级已处理，跳过当前文本节点
          continue;
        }
      }
      // 若块级已处理，则跳过
      if (block && block.hasAttribute('data-tx-block-id')) continue;
    } catch {}
    const t = textNode.nodeValue || '';
    const norm = normalizeText(t);
    if (!norm) continue;
    const id = computeId(norm, txTargetLang);
    const span = wrapTextNode(textNode, id);
    if (!span) continue;
    const exists = txMap.get(id);
    if (exists) {
      exists.nodes.push(span);
    } else {
      txMap.set(id, { text: norm, nodes: [span] });
      const bucket = bucketOf(norm);
      items.push({ id, text: norm, bucket });
    }
  }
  return items;
}

function ensureProgressUi() {
  const shadow = ensureUiRoot();
  if (progressEl && document.contains(progressEl)) return progressEl;
  const el = document.createElement('div');
  el.className = 'ifocal-tx-progress';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="bar"><div class="inner" style="width:0%"></div></div><div class="meta">翻译中…</div>`;
  (shadow as unknown as HTMLElement).appendChild(el);
  progressEl = el;
  return el;
}

function updateProgressUi() {
  if (!progressEl) return;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const inner = progressEl.querySelector('.inner') as HTMLElement | null;
  const meta = progressEl.querySelector('.meta') as HTMLElement | null;
  if (inner) inner.style.width = `${pct}%`;
  if (meta) meta.textContent = `翻译中… ${completed}/${total}`;
}

function removeProgressUiSoon() {
  window.setTimeout(() => { try { progressEl?.remove(); } catch {} progressEl = null; }, 1200);
}

function enqueue(items: TxItem[]) {
  for (const it of items) {
    if (it.bucket === 'short') qShort.push(it.id);
    else if (it.bucket === 'medium') qMedium.push(it.id);
    else qLong.push(it.id);
  }
}

function takeBatch(ids: string[], maxItems: number, maxChars: number): string[] {
  const picked: string[] = [];
  let chars = 0;
  while (ids.length && picked.length < maxItems) {
    const id = ids[0]!;
    const ent = txMap.get(id);
    const len = ent ? ent.text.length : 0;
    if (chars + len > maxChars && picked.length > 0) break;
    ids.shift();
    picked.push(id);
    chars += len;
  }
  return picked;
}

function applyWrapperResult(node: HTMLElement, text: string, sourceText?: string) {
  sharedApplyWrapperResult(node, text, txTargetLang, undefined, sourceText);
}

async function sendBatch(bucket: 'short'|'medium'|'long', ids: string[]) {
  if (!ids.length) return;
  inFlight++;
  if (bucket === 'short') callsShort++; else if (bucket === 'medium') callsMedium++; else callsLong++;
  updateProgressUi();
  const items = ids.map(id => ({ id, text: txMap.get(id)!.text }));
  try {
    const resp = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ action: 'translateBatch', targetLang: txTargetLang, items, policy: { jsonOnly: true, preservePlaceholders: true, preserveNumbers: true }, constraints: { timeoutMs: 20000 } }, resolve);
    });
    try { void chrome.runtime.lastError; } catch {}
    if (resp && resp.ok && Array.isArray(resp.translations)) {
      const gotIds = new Set<string>(resp.translations.map((t: any) => String(t.id)));
      const missing = ids.filter(id => !gotIds.has(id));
      for (const t of resp.translations) {
        const entry = txMap.get(String(t.id));
        const text = String(t.text || '');
        if (!entry) continue;
        if (!firstReturnTs) firstReturnTs = Date.now();
        if (validateConsistency(entry.text, text)) {
          entry.done = true;
          if (!txDisableCache) cacheSet(String(t.id), text).catch(()=>{});
          for (const node of entry.nodes) {
            applyWrapperResult(node, text, entry.text);
          }
          completed++;
        } else {
          // 一致性校验失败：进入严格重试队列
          console.warn(`${LOG_PREFIX} consistency check failed for`, t.id);
          const b = bucketOf(entry.text);
          if (b === 'short') qStrictShort.push(String(t.id)); else if (b === 'medium') qStrictMedium.push(String(t.id)); else qStrictLong.push(String(t.id));
          scheduleStrictLoop();
        }
      }
      // 未返回项进入严格重试队列
      for (const id of missing) {
        const e = txMap.get(id);
        if (!e || e.done) continue;
        const b = bucketOf(e.text);
        if (b === 'short') qStrictShort.push(id); else if (b === 'medium') qStrictMedium.push(id); else qStrictLong.push(id);
      }
      updateProgressUi();
      scheduleStrictLoop();
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} batch failed: ${bucket}`, error);
    // 整批失败：全部进入严格重试
    for (const id of ids) {
      const e = txMap.get(id); if (!e || e.done) continue;
      const b = bucketOf(e.text);
      if (b === 'short') qStrictShort.push(id); else if (b === 'medium') qStrictMedium.push(id); else qStrictLong.push(id);
    }
    scheduleStrictLoop();
  } finally {
    inFlight--;
    if (completed >= total) removeProgressUiSoon();
  }
}

async function scheduleLoop() {
  if (!progressEl) ensureProgressUi();
  if (loopRunning) return;
  loopRunning = true;
  // A) 分桶安全切片与上限保护：按 items/字符上限拆分为最少批次
  const LIMIT = { short: { items: 80, chars: 4000 }, medium: { items: 40, chars: 3500 }, long: { items: 15, chars: 3000 } } as const;
  const runBucket = async (b: 'short'|'medium'|'long', q: string[]) => {
    while (completed < total && q.length) {
      const picked = takeBatch(q, LIMIT[b].items, LIMIT[b].chars);
      if (!picked.length) break;
      await sendBatch(b, picked);
      // 若有退避/限流，后台会节制；这里顺序等待可降低并发
    }
  };
  try {
    if (qShort.length) await runBucket('short', qShort);
    if (qMedium.length) await runBucket('medium', qMedium);
    if (qLong.length) await runBucket('long', qLong);
  } finally {
    loopRunning = false;
  }
}

async function sendBatchStrict(bucket: 'short'|'medium'|'long', ids: string[]) {
  if (!ids.length) return;
  inFlight++;
  if (bucket === 'short') strictShort++; else if (bucket === 'medium') strictMedium++; else strictLong++;
  updateProgressUi();
  const items = ids.map(id => ({ id, text: txMap.get(id)!.text }));
  try {
    const resp = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ action: 'translateBatch', targetLang: txTargetLang, items, policy: { jsonOnly: true, preservePlaceholders: true, preserveNumbers: true, strict: true }, constraints: { timeoutMs: 25000 } }, resolve);
    });
    try { void chrome.runtime.lastError; } catch {}
    if (resp && resp.ok && Array.isArray(resp.translations)) {
      const gotIds = new Set<string>(resp.translations.map((t: any) => String(t.id)));
      const missing = ids.filter(id => !gotIds.has(id));
      for (const t of resp.translations) {
        const entry = txMap.get(String(t.id));
        const text = String(t.text || '');
        if (!entry) continue;
        if (!firstReturnTs) firstReturnTs = Date.now();
        if (validateConsistency(entry.text, text)) {
          entry.done = true;
          if (!txDisableCache) cacheSet(String(t.id), text).catch(()=>{});
          for (const node of entry.nodes) {
            applyWrapperResult(node, text, entry.text);
          }
          completed++;
        } else {
          console.warn(`${LOG_PREFIX} strict consistency still failed for`, t.id);
          // A2：占位符兜底修复（在严格模式仍失败时）
          const fixed = fixPlaceholders(entry.text, text);
          entry.done = true;
          if (!txDisableCache) cacheSet(String(t.id), fixed).catch(()=>{});
          for (const node of entry.nodes) {
            applyWrapperResult(node, fixed, entry.text);
          }
          completed++;
        }
      }
      // 严格模式仍缺失：保持为未完成，后续用户可重试
      if (missing.length) console.warn(`${LOG_PREFIX} strict missing`, missing.length);
      updateProgressUi();
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} strict batch failed: ${bucket}`, error);
  } finally {
    inFlight--;
    if (completed >= total) removeProgressUiSoon();
  }
}

async function scheduleStrictLoop() {
  const MAX = { short: { items: 30, chars: 1800 }, medium: { items: 20, chars: 1500 }, long: { items: 8, chars: 1200 } } as const;
  let running = false;
  const pickNext = (): 'short'|'medium'|'long' => {
    if (qStrictShort.length) return 'short';
    if (qStrictMedium.length) return 'medium';
    if (qStrictLong.length) return 'long';
    return 'short';
  };
  const tick = async () => {
    if (completed >= total) { running = false; return; }
    if (!qStrictShort.length && !qStrictMedium.length && !qStrictLong.length) { running = false; return; }
    if (inFlight > 0) { window.setTimeout(tick, 250); return; }
    const b = pickNext();
    const ids = b === 'short' ? qStrictShort : (b === 'medium' ? qStrictMedium : qStrictLong);
    const limit = MAX[b];
    const picked = takeBatch(ids, limit.items, limit.chars);
    await sendBatchStrict(b, picked);
    window.setTimeout(tick, 150);
  };
  if (!running) { running = true; tick(); }
}

function fixPlaceholders(src: string, dst: string): string {
  try {
    const srcP = collectPlaceholders(src);
    const dstP = collectPlaceholders(dst);
    let out = dst;
    for (const p of srcP) {
      if (!dstP.includes(p)) {
        // 简单策略：在末尾补齐缺失占位符，避免语义破坏
        out = out + (out.endsWith('.') || out.endsWith('。') ? '' : ' ') + p;
      }
    }
    // A3：数字/URL 兜底，避免关键数字和链接缺失
    const sn = collectNumbers(src);
    for (const n of sn) { if (!out.includes(n)) out = out + ' ' + n; }
    const su = (src.match(/https?:\/\/[\w\-\.\/~%?#=&+]+/gi) || []);
    for (const u of su) { if (!out.includes(u)) out = out + ' ' + u; }
    return out;
  } catch { return dst; }
}

async function startFullTranslate() {
  // 读取目标语言
  try {
    const cfg: any = await new Promise(resolve => chrome.storage.sync.get(['translateTargetLang','txOnlyShort','txDisableCache','wrapperStyleName','targetStylePresets'], resolve));
    txTargetLang = cfg?.translateTargetLang || 'zh-CN';
    txOnlyShort = !!cfg?.txOnlyShort;
    txDisableCache = !!cfg?.txDisableCache;
    txWrapperStyleName = (cfg?.wrapperStyleName || 'ifocal-target-style-dotted').trim();
    ensureTargetStylePresets(cfg?.targetStylePresets || []);
  } catch {}
  // 清理旧状态
  txMap = new Map(); qShort = []; qMedium = []; qLong = []; inFlight = 0; completed = 0; total = 0;
  callsShort = callsMedium = callsLong = 0; strictShort = strictMedium = strictLong = 0;
  cacheHits = 0; startTs = Date.now(); firstReturnTs = 0;
  // 采集
  const items = collectTranslatableSpans(document.body || document.documentElement);
  enqueue(txOnlyShort ? items.filter(i => i.bucket === 'short') : items);
  total = items.length;
  if (!total) return;
  ensureProgressUi(); updateProgressUi();
  // 先尝试缓存命中
  await applyCacheForPending();
  if (completed >= total) { removeProgressUiSoon(); return; }
  ensureObserver();
  scheduleLoop();
}

// 消息触发
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'start-full-translate') {
    startFullTranslate();
    return;
  }
  if (message && message.type === 'get-tx-metrics') {
    try { (message as any); } catch {}
    const resp = {
      ok: true,
      completed, total, inFlight,
      calls: { short: callsShort, medium: callsMedium, long: callsLong, strictShort, strictMedium, strictLong },
      cacheHits,
      ttfbMs: firstReturnTs ? (firstReturnTs - startTs) : 0,
      totalMs: startTs ? (Date.now() - startTs) : 0
    };
    try { (window as any).chrome?.runtime?.sendMessage && chrome.runtime.sendMessage({ source: 'ifocal-content', type: 'tx-metrics', data: resp }); } catch {}
    return resp as any;
  }
});

// 控制台触发（便于调试）
(window as any).iFocalStartFullTranslate = startFullTranslate;

// ============ IndexedDB 缓存（简单 KV） ============
let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('ifocal-tx', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  return dbPromise;
}
async function cacheGet(id: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as any) || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}
async function cacheSet(id: string, value: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const req = store.put(value, id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}
async function cacheGetMany(ids: string[]): Promise<Map<string,string>> {
  const out = new Map<string,string>();
  await Promise.all(ids.map(async (id) => { const v = await cacheGet(id); if (typeof v === 'string') out.set(id, v); }));
  return out;
}

async function applyCacheForPending() {
  if (txDisableCache) return;
  const pendingIds = [...txMap.entries()].filter(([_, v]) => !v.done).map(([id]) => id);
  if (!pendingIds.length) return;
  const hit = await cacheGetMany(pendingIds);
  if (!hit.size) return;
  for (const [id, text] of hit.entries()) {
    const entry = txMap.get(id);
    if (!entry) continue;
    entry.done = true;
    for (const node of entry.nodes) applyWrapperResult(node, text, entry.text);
    completed++;
    cacheHits++;
  }
  updateProgressUi();
}

// ============ 一致性校验（占位符与数字） ============
function collectPlaceholders(s: string): string[] {
  const arr: string[] = [];
  // __VAR_1__ 风格
  (s.match(/__VAR_\d+__/g) || []).forEach(x => arr.push(x));
  // {name} 风格（排除 JSON 花括号的可能，近似处理）
  (s.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) || []).forEach(x => arr.push(x));
  // printf 风格
  (s.match(/%[sdif]/g) || []).forEach(x => arr.push(x));
  return arr;
}
function collectNumbers(s: string): string[] {
  // 仅收集“纯数字/分隔符”的片段，忽略紧随字母的形式（如 20k, 1st, 2nd, 3rd），避免误判
  const out: string[] = [];
  const re = /(\d[\d,\.\u066B\u066C]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const token = m[1];
    const next = s.charAt(m.index + token.length) || '';
    if (/[A-Za-z]/.test(next)) continue; // 忽略 20k/1st 等
    out.push(token);
  }
  return out;
}
function validateConsistency(src: string, dst: string): boolean {
  try {
    const sp = collectPlaceholders(src); const dp = collectPlaceholders(dst);
    for (const p of sp) if (!dp.includes(p)) return false;
    const sn = collectNumbers(src);
    for (const n of sn) if (!dst.includes(n)) return false;
    const su = (src.match(/https?:\/\/[\w\-\.\/~%?#=&+]+/gi) || []);
    for (const u of su) if (!dst.includes(u)) return false;
    return true;
  } catch { return true; }
}

// ============ DOM 变更复播（MutationObserver） ============
let mo: MutationObserver | null = null;
function ensureObserver() {
  if (mo) return;
  mo = new MutationObserver((records) => {
    let added = 0;
    for (const r of records) {
      if (r.type === 'childList') {
        r.addedNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) {
            const t = (n.nodeValue || '').trim(); if (!t) return;
            const p = (n as any).parentElement as HTMLElement | null;
            try { if (p && (p.closest && p.closest('font.ifocal-target-wrapper, .ifocal-target-wrapper'))) return; } catch {}
            // 若文本位于未处理的块级段落内，按块级处理
            try {
              const block = p ? p.closest(BLOCK_SELECTOR) as HTMLElement | null : null;
              if (block && !block.hasAttribute('data-tx-block-id')) {
                const whole = (block.innerText || '').trim();
                const normWhole = normalizeText(whole);
                if (normWhole) {
                  const id = computeId(normWhole, txTargetLang);
                  const w = wrapBlockElement(block, id);
                  const exist = txMap.get(id);
                  if (exist) exist.nodes.push(w); else {
                    txMap.set(id, { text: normWhole, nodes: [w] });
                    const b = bucketOf(normWhole);
                    if (b === 'short') qShort.push(id); else if (b === 'medium') qMedium.push(id); else qLong.push(id);
                    added++;
                  }
                  return;
                }
              }
            } catch {}
            // 否则按文本节点处理
            const norm = normalizeText(t);
            const id = computeId(norm, txTargetLang);
            if (!txMap.has(id)) {
              const span = wrapTextNode(n as Text, id);
              if (span) {
                txMap.set(id, { text: norm, nodes: [span] });
                const b = bucketOf(norm);
                if (b === 'short') qShort.push(id); else if (b === 'medium') qMedium.push(id); else qLong.push(id);
                added++;
              }
            }
          } else if (n.nodeType === Node.ELEMENT_NODE) {
            try { if ((n as Element).closest && (n as Element).closest('font.ifocal-target-wrapper, .ifocal-target-wrapper')) return; } catch {}
            const ni = collectTranslatableSpans(n as ParentNode);
            if (ni.length) { enqueue(ni); added += ni.length; }
          }
        });
      } else if (r.type === 'characterData') {
        const node = r.target as Text;
        if (!node || isInOurUi(node)) continue;
        try { const p = node.parentElement as HTMLElement | null; if (p && (p.closest && p.closest('font.ifocal-target-wrapper, .ifocal-target-wrapper'))) continue; } catch {}
        const t = (node.nodeValue || '').trim(); if (!t) continue;
        const norm = normalizeText(t);
        const id = computeId(norm, txTargetLang);
        if (!txMap.has(id)) {
          const span = wrapTextNode(node, id);
          if (span) {
            txMap.set(id, { text: norm, nodes: [span] });
            const b = bucketOf(norm);
            if (b === 'short') qShort.push(id); else if (b === 'medium') qMedium.push(id); else qLong.push(id);
            added++;
          }
        }
      }
    }
    if (added) {
      total += added;
      updateProgressUi();
      applyCacheForPending().then(() => { scheduleLoop(); });
    }
  });
  try { mo.observe(document.body || document.documentElement, { subtree: true, childList: true, characterData: true }); } catch {}
}
