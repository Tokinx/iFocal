// 注意：为避免打包为 ESM 并在内容脚本环境报错，这里不再使用 import 语句。
// 样式通过 Shadow DOM 注入；语言列表通过后台消息读取。
let uiHost: HTMLElement | null = null;
let uiShadow: ShadowRoot | null = null;
const SHADOW_STYLE = `
:host{ all: initial; }
.ifocal-overlay{position:absolute;z-index:2147483647;max-width:420px;width:100%;background:rgba(255,255,255,0.88);border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,0.18);color:#0f172a;line-height:1.55;backdrop-filter:saturate(180%) blur(12px);-webkit-backdrop-filter:saturate(180%) blur(12px);pointer-events:auto}
.ifocal-overlay-body{white-space:pre-wrap;max-height:50vh;overflow-y:auto;position:relative;padding:0 12px 12px;}
.ifocal-overlay-header{cursor:move;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:12px 12px 0;}
.ifocal-header-left{display:flex;align-items:center;gap:8px}
.ifocal-dd-wrap{position:relative}
.ifocal-dd-btn{height:36px;padding:0 8px;font-size:12px;border:1px solid rgba(15,23,42,.12);border-radius:8px;background:rgba(255,255,255,.95);color:#0f172a;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ifocal-dd-menu{position:absolute;top:40px;left:0;min-width:220px;max-height:220px;overflow:auto;background:#fff;border:1px solid rgba(15,23,42,.12);border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.12);padding:6px;z-index:3}
.ifocal-dd-item{padding:8px 10px;border-radius:8px;cursor:pointer}
.ifocal-dd-item:hover{background:rgba(15,23,42,.06)}
.ifocal-dd-item .title{font-weight:600;line-height:1.1}
.ifocal-dd-item .sub{opacity:.65;font-size:12px;line-height:1.1}
.ifocal-close{height:24px;width:24px;border:1px solid rgba(15,23,42,.12);border-radius:6px;background:rgba(255,255,255,.9);color:#0f172a;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.ifocal-close:hover{background:rgba(15,23,42,.06)}
.copy-btn{position:absolute;top:4px;right:4px;height:24px;width:28px;border:1px solid rgba(15,23,42,0.15);border-radius:6px;background:rgba(255,255,255,0.9);cursor:pointer;opacity:0;transition:opacity .15s ease}
.ifocal-overlay:hover .copy-btn{opacity:1}
.ifocal-target-wrapper{background-image:linear-gradient(to right, rgba(71,71,71,.45) 30%, rgba(255,255,255,0) 0%);background-position:bottom;background-size:5px 1px;background-repeat:repeat-x;padding-bottom:3px;font-family:inherit}
@keyframes fc-spin{to{transform:rotate(360deg)}}
.fc-spinner{width:16px;height:16px;border:2px solid rgba(15,23,42,0.18);border-top-color:#0f172a;border-radius:50%;animation:fc-spin 1s linear infinite;display:inline-block;vertical-align:text-bottom}
.ifocal-dot{position:absolute;width:10px;height:10px;border-radius:50%;background:#0f172a;opacity:.9;cursor:pointer;box-shadow:0 0 0 2px rgba(255,255,255,.9);z-index:2147483647;pointer-events:auto}
.hidden{display:none}
`;

function ensureUiRoot(): ShadowRoot {
  if (uiShadow) return uiShadow;
  try {
    uiHost = document.getElementById('ifocal-host') as HTMLElement | null;
    if (!uiHost) {
      uiHost = document.createElement('div');
      uiHost.id = 'ifocal-host';
      uiHost.style.all = 'initial';
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
  wrapperStyle?: string;
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
const SELECTION_SYNC_DELAY = 200;
const SELECTION_DOT_UPDATE_DELAY = 120;
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
          spinner.className = 'fc-spinner';
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

function needsLineBreak(tag: string) {
  return ['p', 'div', 'section', 'article', 'li', 'td', 'a',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
}

function shouldInsertBreakFromSource(text: string): boolean {
  // 仅当译文中空格数量 > 3 时添加换行
  const spaces = (text.match(/ /g) || []).length;
  return spaces > 3;
}

function updateBreakForTranslated(blockEl: HTMLElement, source: string) {
  const tag = (blockEl.tagName || 'div').toLowerCase();
  const exists = blockEl.querySelector('br.ifocal-target-break');
  const wrapper = blockEl.querySelector('font.ifocal-target-wrapper.notranslate');
  if (!needsLineBreak(tag)) {
    if (exists) exists.remove();
    return;
  }
  const needBr = shouldInsertBreakFromSource(source);
  if (needBr) {
    if (exists) {
      // 确保 br 位于 wrapper 之前
      if (wrapper && exists.nextSibling !== wrapper) {
        blockEl.insertBefore(exists, wrapper);
      }
      return;
    }
    const br = document.createElement('br');
    br.className = 'ifocal-target-break';
    if (wrapper) blockEl.insertBefore(br, wrapper);
    else if (blockEl.firstChild) blockEl.insertBefore(br, blockEl.firstChild);
    else blockEl.appendChild(br);
  } else if (exists) {
    exists.remove();
  }
}

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

    chrome.storage.sync.get(['translateTargetLang', 'wrapperStyle'], (cfg: StorageConfig) => {
      const langCode = (cfg.translateTargetLang || 'zh-CN').trim();
      const styleText = (cfg.wrapperStyle || '').trim();
      const wrapper = document.createElement('font');
      wrapper.className = 'notranslate ifocal-target-wrapper';
      wrapper.setAttribute('lang', langCode);
      if (styleText) wrapper.setAttribute('style', styleText);
      const spin = document.createElement('div');
      spin.className = 'fc-spinner';
      wrapper.appendChild(spin);
      blockEl.appendChild(wrapper);

      const sourceText = (blockEl.innerText || '').trim();
      chrome.runtime.sendMessage({ action: 'performAiAction', task: 'translate', text: sourceText }, (response: { ok?: boolean; result?: string; error?: string } | undefined) => {
        // 读取 lastError 抑制“Unchecked runtime.lastError”告警
        // 即便忽略，也要先触达该属性以避免控制台噪音
        try { void chrome.runtime.lastError; } catch { }
        blockEl.dataset.fcTranslated = '1';
        const msg = response && response.ok ? response.result : response?.error || '';
        wrapper.innerHTML = '';
        const inner = document.createElement('font');
        inner.textContent = msg || '';
        wrapper.appendChild(inner);
        // 根据原文空格数决定是否插入换行（加载时不插入）
        updateBreakForTranslated(blockEl, sourceText || '');
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
