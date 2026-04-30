// 注意：为避免打包为 ESM 并在内容脚本环境报错，这里不再使用 import 语句。
// 页面（非 Shadow DOM）内插入模式所需的全局加载样式，避免仅注入到 Shadow 导致动画丢失
const DOC_STYLE = `
.ifocal-target-wrapper{word-break: break-word;user-select: text;}
.ifocal-target-block-wrapper{display: inline-block;margin: 8px 0;}
.ifocal-target-inline-wrapper{}
.ifocal-tx{display:inline;overflow-wrap:anywhere;word-break:break-word;hyphens:auto}
.ifocal-fullpage-translation{display:block;margin-top:6px}
@keyframes ifocal-spin{to{transform:rotate(360deg)}}
.ifocal-loading{width:12px;height:12px;border:2px solid rgba(15,23,42,0.18);border-top-color:#0f172a;border-radius:50%;animation:ifocal-spin .8s linear infinite;display:inline-block;vertical-align:middle;line-height:1;flex:0 0 auto}
.ifocal-loading-wrap{display:flex;align-items:center;justify-content:center;min-height:56px}
`;

// 复制共享 DOM 工具到内容脚本（避免 import 引发 ESM 报错）
function needsLineBreak(tag: string) {
  return ['p', 'div', 'section', 'article', 'li', 'td', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
}
function shouldInsertBreakFromSource(text: string): boolean {
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
  const needBr = shouldInsertBreakFromSource(source || '');
  if (needBr) {
    if (exists) {
      if (wrapper) {
        if (exists.parentElement !== wrapper || (wrapper as any).firstChild !== exists) {
          try { (wrapper as any).insertBefore(exists, (wrapper as any).firstChild || null); } catch {}
        }
      } else {
        if (exists.parentElement !== blockEl) {
          try { blockEl.appendChild(exists); } catch {}
        }
      }
      return;
    }
    const br = document.createElement('br');
    br.className = 'ifocal-target-break';
    if (wrapper) {
      try { (wrapper as any).insertBefore(br, (wrapper as any).firstChild || null); } catch { blockEl.appendChild(br); }
    } else if (blockEl.firstChild) {
      blockEl.insertBefore(br, blockEl.firstChild);
    } else {
      blockEl.appendChild(br);
    }
  } else if (exists) {
    exists.remove();
  }
}
function sharedCreateWrapper(id: string, targetLang: string): HTMLElement {
  const wrapper = document.createElement('font');
  wrapper.className = 'notranslate ifocal-target-wrapper';
  wrapper.setAttribute('data-tx-id', id);
  try { wrapper.setAttribute('data-tx-done', '0'); } catch {}
  if (targetLang) wrapper.setAttribute('lang', targetLang);
  return wrapper as unknown as HTMLElement;
}
function sharedApplyWrapperLoading(wrapper: HTMLElement, sourceText?: string) {
  try {
    wrapper.innerHTML = '';
    const block = wrapper.closest('p,div,section,article,li,td,a,h1,h2,h3,h4,h5,h6') as HTMLElement | null;
    let needBr = false;
    if (block && sourceText) {
      const tag = (block.tagName || 'div').toLowerCase();
      needBr = needsLineBreak(tag) && shouldInsertBreakFromSource(sourceText);
    }
    if (needBr && block && sourceText) {
      updateBreakForTranslated(block, sourceText);
    } else {
      const spacer = document.createElement('font');
      spacer.className = 'notranslate';
      spacer.innerHTML = '&nbsp;&nbsp;';
      wrapper.appendChild(spacer);
    }
    const styleName = (wrapper.getAttribute('data-tx-style') || '').trim() || 'ifocal-target-style-dotted';
    const typeClass = needBr ? 'ifocal-target-block-wrapper' : 'ifocal-target-inline-wrapper';
    const loadingWrapper = document.createElement('font');
    loadingWrapper.className = `notranslate ${typeClass} ${styleName}`.trim();
    const spin = document.createElement('span');
    spin.className = 'ifocal-loading';
    spin.setAttribute('aria-label', 'Loading translation');
    loadingWrapper.appendChild(spin);
    wrapper.appendChild(loadingWrapper);
  } catch {}
}
function sharedApplyWrapperResult(wrapper: HTMLElement, text: string, targetLang?: string, _wrapperStyle?: string, sourceText?: string) {
  try {
    if (targetLang) wrapper.setAttribute('lang', targetLang);
    const rtl = targetLang && /^(ar|he|fa|ur|yi)(-|$)/i.test(targetLang);
    if (rtl) wrapper.setAttribute('dir', 'rtl'); else wrapper.removeAttribute('dir');
    wrapper.innerHTML = '';
    const block = wrapper.closest('p,div,section,article,li,td,a,h1,h2,h3,h4,h5,h6') as HTMLElement | null;
    let needBr = false;
    if (block && sourceText) {
      const tag = (block.tagName || 'div').toLowerCase();
      needBr = needsLineBreak(tag) && shouldInsertBreakFromSource(sourceText);
    }
    if (needBr) {
      updateBreakForTranslated(block!, sourceText!);
    } else {
      const spacer = document.createElement('font');
      spacer.className = 'notranslate';
      spacer.innerHTML = '&nbsp;&nbsp;';
      wrapper.appendChild(spacer);
    }
    const styleName = (wrapper.getAttribute('data-tx-style') || '').trim() || 'ifocal-target-style-dotted';
    const typeClass = needBr ? 'ifocal-target-block-wrapper' : 'ifocal-target-inline-wrapper';
    const resultWrapper = document.createElement('font');
    resultWrapper.className = `notranslate ${typeClass} ${styleName}`.trim();
    const inner = document.createElement('font');
    inner.className = 'notranslate ifocal-target-inner';
    inner.textContent = text;
    resultWrapper.appendChild(inner);
    wrapper.appendChild(resultWrapper);
    try { wrapper.setAttribute('data-tx-done', '1'); } catch {}
    if (block && sourceText) {
      try {
        const pending = block.querySelector('font.ifocal-target-wrapper[data-tx-done="0"]');
        block.setAttribute('aria-busy', pending ? 'true' : 'false');
      } catch {}
    }
  } catch {}
}

// 样式通过 Shadow DOM 注入；语言列表通过后台消息读取。
let uiHost: HTMLElement | null = null;
let uiShadow: ShadowRoot | null = null;
const SHADOW_STYLE = `
.ifocal-overlay{position:absolute;z-index:2147483647;max-width:420px;width:100%;background:rgba(255,255,255,0.88);border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,0.18);color:#0f172a;line-height:1.55;backdrop-filter:saturate(180%) blur(12px);-webkit-backdrop-filter:saturate(180%) blur(12px);pointer-events:auto}
.ifocal-overlay-body{white-space:pre-wrap;max-height:50vh;overflow-y:auto;position:relative;padding:0 12px 12px;}
.ifocal-status-overlay{position:fixed;right:16px;bottom:16px;top:auto;left:auto;width:280px;max-width:calc(100vw - 32px);min-width:0;border-radius:10px;background:rgba(255,255,255,0.96);box-shadow:0 10px 24px rgba(15,23,42,0.14);pointer-events:none}
.ifocal-status-overlay .ifocal-overlay-body{max-height:30vh;padding:10px 12px;font-size:12px;line-height:1.45}
.ifocal-overlay-header{cursor:move;display:flex;align-items:center;justify-content:space-between;padding:12px;}
.ifocal-header-left{display:flex;align-items:center;gap:8px}
.ifocal-dd-wrap{position:relative}
.ifocal-dd-btn{height:28px;padding:0 10px;font-size:12px;border:none;border-radius:24px;background:rgba(0,0,0,0.05);color:#0f172a;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ifocal-dd-btn::after{content:'▾';font-size: 14px;line-height: 1;opacity: .25;transform: scaleX(2);}
.ifocal-dd-menu{position:absolute;top:110%;left:0;max-width:200px;max-height:200px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;background:#fff;border-radius:5px;box-shadow:0 8px 24px rgba(15,23,42,.12);font-size:12px;padding:5px 0;z-index:3}
.ifocal-dd-item{padding: 0 10px;cursor: pointer;height: 32px;display: flex;align-items: center;}
.ifocal-dd-item:hover{background:rgba(15,23,42,.06)}
.ifocal-dd-item .title{font-weight: 600;white-space: nowrap;overflow: hidden;text-overflow: ellipsis;width: 100%;}
.ifocal-dd-item .sub{opacity:.65;font-size:12px;line-height:1.1}
.ifocal-close{height:28px;width:28px;border:none;border-radius:24px;background:unset;color:#6a6a6a;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.ifocal-close:hover{background:rgba(15,23,42,.06)}
.copy-btn{position:absolute;top:4px;right:4px;height:24px;width:28px;border:1px solid rgba(15,23,42,0.15);border-radius:6px;background:rgba(255,255,255,0.9);cursor:pointer;opacity:0;transition:opacity .15s ease}
.ifocal-overlay:hover .copy-btn{opacity:1}
.ifocal-dot{position:absolute;width:10px;height:10px;border-radius:50%;background:#0f172a;opacity:.9;cursor:pointer;box-shadow:0 0 0 2px rgba(255,255,255,.9);z-index:2147483647;pointer-events:auto}
@keyframes ifocal-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
.ifocal-skeleton-line{height:12px;border-radius:6px;margin:10px 0;background:linear-gradient(90deg, rgba(15,23,42,0.08) 25%, rgba(15,23,42,0.14) 37%, rgba(15,23,42,0.08) 63%);background-size:400% 100%;animation:ifocal-shimmer 1.2s ease-in-out infinite}
.ifocal-skeleton-line:first-child{margin-top:0}
.ifocal-skeleton-line:last-child{margin-bottom:0}
.hidden{display:none}
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
// 本地最小默认预设（与 DEFAULT_CONFIG 保持一致的两项）
const DEFAULT_TARGET_STYLE_PRESETS = [
  {
    name: 'ifocal-target-style-dotted',
    description: '点状下划线',
    css: `.ifocal-target-inline-wrapper.ifocal-target-style-dotted .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-dotted .ifocal-target-inner{
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
    css: `.ifocal-target-inline-wrapper.ifocal-target-style-highlight .ifocal-target-inner,
.ifocal-target-block-wrapper.ifocal-target-style-highlight .ifocal-target-inner{
  background-color: yellow;
  font-family: inherit;
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
    console.warn('failed to init shadow root', error);
    return (document as any);
  }
  return uiShadow!;
}
console.log('content script ready');

type OverlayHandle = {
  root: HTMLElement;
  setText: (text: string) => void;
  append: (text: string) => void;
  setLoading: (flag: boolean) => void;
  _body?: HTMLElement;
  _port?: chrome.runtime.Port | null;
};

type ChannelPair = { channel: string; model: string } | null;
type SelectionTranslationMode = 'ai' | 'machine';
type OverlayTranslateRunner = (overlay: OverlayHandle, task: string, text: string, pair: ChannelPair, lang: string, prevLang?: string) => void;
type FullPageTarget = { element: HTMLElement; text: string };

type StorageConfig = {
  channels?: Array<{ name: string; models?: string[] }>;
  defaultModel?: ChannelPair;
  translateTargetLang?: string;
  prevLanguage?: string;
  selectionTranslationMode?: SelectionTranslationMode;
  mtDefaultChannelId?: string;
  wrapperStyleName?: string;
  targetStylePresets?: Array<{ name: string; css: string }>;
};

function parseModelSpec(spec: string | null | undefined): { modelId: string; displayName: string } {
  const raw = String(spec || '').trim();
  if (!raw) return { modelId: '', displayName: '' };
  const [idPart, namePart] = raw.split('#', 2);
  const modelId = (idPart || '').trim();
  const displayName = (namePart || idPart || '').trim();
  return { modelId, displayName };
}

function channelHasModelId(channel: { models?: string[] } | null | undefined, modelId: string): boolean {
  const id = String(modelId || '').trim();
  if (!id) return false;
  const models = Array.isArray(channel?.models) ? channel!.models! : [];
  return models.some((m) => parseModelSpec(m).modelId === id);
}

function normalizeSelectionTranslationMode(value: unknown): SelectionTranslationMode {
  return value === 'machine' ? 'machine' : 'ai';
}

function firstModelIdFromChannel(channel: { models?: string[] } | null | undefined): string | null {
  const models = Array.isArray(channel?.models) ? channel!.models! : [];
  for (const model of models) {
    const id = parseModelSpec(model).modelId;
    if (id) return id;
  }
  return null;
}

function resolveModelDisplayName(cfg: StorageConfig, pair: ChannelPair): string {
  if (!pair) return '';
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  const channel = channels.find((c) => c.name === pair.channel);
  if (!channel || !Array.isArray(channel.models)) return pair.model;
  for (const spec of channel.models) {
    const parsed = parseModelSpec(spec);
    if (parsed.modelId === pair.model) return parsed.displayName || parsed.modelId;
  }
  return pair.model;
}

let hoveredElement: HTMLElement | null = null;
let hoverInInputArea = false;
let actionKey = 'Alt';
let displayMode: 'insert' | 'overlay' = 'insert';
let enableSelectionTranslation = true;
let selectionTranslationMode: SelectionTranslationMode = 'ai';
let lastOverlay: OverlayHandle | null = null;
let keydownCooldown = false;
let fullPageTranslateRunning = false;

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

type OverlayLoadingStyle = 'spinner' | 'skeleton';

function createOverlayAt(left: number, top: number, loadingStyle: OverlayLoadingStyle = 'spinner') {
  const shadow = ensureUiRoot();
  const root = document.createElement('div');
  root.className = 'ifocal-overlay';
  root.style.left = `${Math.max(0, Math.round(left))}px`;
  root.style.top = `${Math.max(0, Math.round(top))}px`;

  const body = document.createElement('div');
  body.className = 'ifocal-overlay-body';
  (shadow as unknown as HTMLElement).appendChild(root);
  root.appendChild(body);

  let loadingNode: HTMLElement | null = null;
  const overlay: OverlayHandle = {
    root,
    _body: body,
    setText(text) {
      body.textContent = text;
    },
    append(text) {
      body.textContent = `${body.textContent || ''}${text}`;
    },
    setLoading(flag) {
      if (flag) {
        if (!loadingNode) {
          body.innerHTML = '';
          if (loadingStyle === 'skeleton') {
            const skeletonWrap = document.createElement('div');
            skeletonWrap.className = 'ifocal-skeleton-wrap';
            const widths = ['72%', '96%', '64%'];
            widths.forEach((w) => {
              const line = document.createElement('div');
              line.className = 'ifocal-skeleton-line';
              line.style.width = w;
              skeletonWrap.appendChild(line);
            });
            body.appendChild(skeletonWrap);
            loadingNode = skeletonWrap;
          } else {
            const loadingWrap = document.createElement('div');
            loadingWrap.className = 'ifocal-loading-wrap';
            const spin = document.createElement('span');
            spin.className = 'ifocal-loading';
            spin.setAttribute('aria-label', 'Loading translation');
            loadingWrap.appendChild(spin);
            body.appendChild(loadingWrap);
            loadingNode = loadingWrap;
          }
        }
      } else if (loadingNode) {
        body.innerHTML = '';
        loadingNode = null;
      }
    }
  };
  lastOverlay = overlay;
  return overlay;
}

// 语言列表：默认回退（不再从后台获取）
type Lang = { value: string; label: string };
let SUPPORTED_LANGUAGES: Lang[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' }
];

// 重载 
function readHotkeys() {
  try {
    chrome.storage.sync.get(['actionKey', 'hoverKey', 'selectKey', 'displayMode', 'enableSelectionTranslation', 'selectionTranslationMode'], (items) => {
      if (items?.actionKey) actionKey = items.actionKey;
      else if (items?.hoverKey) actionKey = items.hoverKey;
      else if (items?.selectKey) actionKey = items.selectKey;
      if (items?.displayMode === 'overlay' || items?.displayMode === 'insert') {
        displayMode = items.displayMode;
      }
      enableSelectionTranslation = typeof items?.enableSelectionTranslation === 'boolean' ? items.enableSelectionTranslation : true;
      selectionTranslationMode = normalizeSelectionTranslationMode(items?.selectionTranslationMode);
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      if (changes.actionKey) actionKey = changes.actionKey.newValue || 'Alt';
      if (changes.displayMode) {
        const mode = changes.displayMode.newValue as 'insert' | 'overlay';
        displayMode = mode || 'insert';
      }
      if (changes.enableSelectionTranslation) enableSelectionTranslation = !!changes.enableSelectionTranslation.newValue;
      if (changes.selectionTranslationMode) selectionTranslationMode = normalizeSelectionTranslationMode(changes.selectionTranslationMode.newValue);
    });
  } catch (error) {
    console.warn('failed to read hotkeys', error);
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
      // 更新已存在的包裹结构
      try {
        const wrappers = document.querySelectorAll('font.ifocal-target-wrapper[data-tx-style]');
        wrappers.forEach((w) => {
          try { (w as HTMLElement).setAttribute('data-tx-style', nextName); } catch {}
          const found = (w as HTMLElement).querySelector('font.ifocal-target-inline-wrapper, font.ifocal-target-block-wrapper') as HTMLElement | null;
          if (found) {
            const typeClass = found.classList.contains('ifocal-target-block-wrapper') ? 'ifocal-target-block-wrapper' : 'ifocal-target-inline-wrapper';
            found.className = `notranslate ${typeClass} ${nextName}`;
          }
        });
      } catch {}
    }
  });
} catch {}

function isIfocalElement(target: EventTarget | Node | null): boolean {
  try {
    const n = target as any;
    const el: HTMLElement | null = n instanceof HTMLElement ? n : (n?.parentElement || null);
    if (!el) return false;
    // inside our shadow host
    if (uiHost && (el === uiHost || el.closest('#ifocal-host'))) return true;
    // overlay/dot or wrappers in light DOM
    if (el.closest('.ifocal-overlay')) return true;
    if (el.closest('.ifocal-dot')) return true;
    if (el.closest('font.ifocal-target-wrapper')) return true;
    if (el.closest('font.ifocal-target-inline-wrapper')) return true;
    if (el.closest('font.ifocal-target-block-wrapper')) return true;
    if (el.closest('font.ifocal-target-inner')) return true;
    // selection nodes within shadow root of our host
    const root = (n?.getRootNode?.() || null) as any;
    if (root && root instanceof ShadowRoot) {
      const host = (root as ShadowRoot).host as HTMLElement | undefined;
      if (host && host.id === 'ifocal-host') return true;
    }
  } catch {}
  return false;
}

function isInputArea(target: EventTarget | Node | null): boolean {
  try {
    const n = target as any;
    const el: HTMLElement | null = n instanceof HTMLElement ? n : (n?.parentElement || null);
    if (!el) return false;
    if (isIfocalElement(el)) return false;
    if (el.isContentEditable) return true;
    const editableHost = el.closest('[contenteditable]');
    if (editableHost) {
      const editableValue = String(editableHost.getAttribute('contenteditable') || '').toLowerCase();
      if (editableValue !== 'false') return true;
    }
    if (el.closest('input, textarea, select')) return true;
    if (el.closest('[role="textbox"]')) return true;
  } catch {}
  return false;
}

function getDeepActiveElement(): Element | null {
  try {
    let active: Element | null = document.activeElement;
    while (active && (active as any).shadowRoot?.activeElement) {
      active = (active as any).shadowRoot.activeElement as Element | null;
    }
    return active;
  } catch {
    return document.activeElement;
  }
}

function findTextBlockElement(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return null;
  if (isInputArea(element)) return null;
  const BLOCK_TAGS = new Set(['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (isIfocalElement(current)) return null;
    if (isExcludedTranslateElement(current)) return null;
    const text = (current.innerText || '').trim();
    if (text && BLOCK_TAGS.has(current.tagName)) return current;
    current = current.parentElement;
  }
  return element;
}

document.addEventListener('mouseover', (event) => {
  hoverInInputArea = isInputArea(event.target);
  if (hoverInInputArea) {
    hoveredElement = null;
    return;
  }
  hoveredElement = findTextBlockElement(event.target);
});

document.addEventListener('mouseout', (event) => {
  const nextTarget = (event as MouseEvent).relatedTarget;
  if (nextTarget) {
    hoverInInputArea = isInputArea(nextTarget);
    if (hoverInInputArea) {
      hoveredElement = null;
      return;
    }
    hoveredElement = findTextBlockElement(nextTarget as EventTarget);
    return;
  }
  hoveredElement = null;
  hoverInInputArea = false;
});

document.addEventListener('mouseup', (ev) => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  const anchor = getSelectionAnchorNode();
  if (isIfocalElement(ev.target as any) || isIfocalElement(anchor) || isExcludedTranslateElement(ev.target as any) || isExcludedTranslateElement(anchor)) {
    overlayAutoFollow = false;
    hideSelectionDot();
    maybeDetachScrollListener();
    return;
  }
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
});

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';
  const anchor = getSelectionAnchorNode();
  if (!text || isIfocalElement(anchor) || isExcludedTranslateElement(anchor)) {
    if (text && (isIfocalElement(anchor) || isExcludedTranslateElement(anchor))) {
      overlayAutoFollow = false;
      maybeDetachScrollListener();
    }
    hideSelectionDot();
  } else {
    if (selectionUpdateTimer) window.clearTimeout(selectionUpdateTimer);
    selectionUpdateTimer = window.setTimeout(() => {
      attachScrollListenerForSelection();
      updateSelectionDotPosition();
    }, SELECTION_DOT_UPDATE_DELAY);
  }
});

// 触控端：在触摸结束时也做一次最终刷新
document.addEventListener('touchend', (ev) => {
  try {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    const anchor = getSelectionAnchorNode();
    if (isIfocalElement(ev.target as any) || isIfocalElement(anchor) || isExcludedTranslateElement(ev.target as any) || isExcludedTranslateElement(anchor)) {
      overlayAutoFollow = false;
      hideSelectionDot();
      maybeDetachScrollListener();
      return;
    }
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
  } catch {}
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key !== actionKey || keydownCooldown) return;
  if (event.repeat || event.isComposing) return;
  const activeEl = getDeepActiveElement();
  if (isInputArea(activeEl)) return;
  if (isInputArea(event.target)) return;
  if (hoverInInputArea) return;
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
  const anchor = selection.anchorNode;
  if (isIfocalElement(anchor) || isExcludedTranslateElement(anchor)) return null;
  const rects = range.getClientRects();
  const last = rects && rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  if (last && last.width >= 0 && last.height >= 0) return last as DOMRect;
  return null;
}

function getSelectionAnchorNode(): Node | null {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return range.commonAncestorContainer || null;
  } catch {
    return null;
  }
}

function attachScrollListenerForSelection() {
  try {
    const anchor = getSelectionAnchorNode();
    if (isIfocalElement(anchor)) return;
    const el = anchor instanceof HTMLElement ? anchor : (anchor ? (anchor.parentElement as HTMLElement | null) : null);
    const container = el ? (el.closest('.overflow-auto, .overflow-scroll') as HTMLElement | null) : null;
    const target = container || document;
    const listener = () => updateSelectionDotPosition();
    if (currentScrollContainer && currentScrollHandler) {
      try { currentScrollContainer.removeEventListener('scroll', currentScrollHandler as any, true); } catch {}
    }
    if (container) {
      container.addEventListener('scroll', listener, true);
      currentScrollContainer = container; currentScrollHandler = listener;
    } else {
      // fallback: 监听 document 元素滚动
      document.addEventListener('scroll', listener, true);
      currentScrollContainer = document.documentElement as any; currentScrollHandler = listener as any;
    }
  } catch {}
}
function maybeDetachScrollListener() {
  if (!currentScrollContainer || !currentScrollHandler) return;
  try { currentScrollContainer.removeEventListener('scroll', currentScrollHandler as any, true); } catch {}
  currentScrollContainer = null; currentScrollHandler = null;
}

function normalizePageText(text: string): string {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

const TRANSLATE_EXCLUDED_SELECTOR = 'script,style,noscript,code,pre,kbd,samp,var,textarea,input,select,option,svg,canvas';

function isExcludedTranslateElement(target: EventTarget | Node | null): boolean {
  try {
    const node = target as Node | null;
    const element = node instanceof HTMLElement
      ? node
      : (node?.parentElement || null);
    if (!element) return false;
    return !!element.closest(TRANSLATE_EXCLUDED_SELECTOR);
  } catch {
    return false;
  }
}

function extractTranslatableText(element: HTMLElement): string {
  try {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(`${TRANSLATE_EXCLUDED_SELECTOR}, .ifocal-fullpage-translation, .ifocal-overlay, .ifocal-dot, #ifocal-host, [aria-hidden="true"], [hidden]`)
      .forEach((node) => node.remove());
    return normalizePageText(clone.textContent || '');
  } catch {
    return normalizePageText(element.innerText || element.textContent || '');
  }
}

function machineTranslateTexts(texts: string[], targetLang: string, channelId?: string): Promise<{ ok?: boolean; translations?: string[]; errors?: string[]; error?: string }> {
  return new Promise((resolve) => {
    const payload: any = {
      action: 'machineTranslateBatch',
      texts,
      sourceLang: 'auto',
      targetLang: targetLang || 'zh-CN',
      format: 'plain',
    };
    if (channelId) payload.channelId = channelId;
    try {
      chrome.runtime.sendMessage(payload, (resp: any) => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          resolve({ ok: false, error: runtimeError, translations: [], errors: [runtimeError] });
          return;
        }
        if (!resp) {
          resolve({ ok: false, error: '无响应', translations: [], errors: ['无响应'] });
          return;
        }
        resolve(resp);
      });
    } catch (error: any) {
      resolve({ ok: false, error: String(error?.message || error || '调用失败'), translations: [], errors: [String(error?.message || error || '调用失败')] });
    }
  });
}

function createFixedOverlay(loadingStyle: OverlayLoadingStyle = 'spinner') {
  const overlay = createOverlayAt(0, 0, loadingStyle);
  overlay.root.classList.add('ifocal-status-overlay');
  overlay.root.style.left = 'auto';
  overlay.root.style.top = 'auto';
  overlay.root.style.right = '16px';
  overlay.root.style.bottom = '16px';
  overlay.root.style.width = '280px';
  overlay.root.style.maxWidth = 'calc(100vw - 32px)';
  return overlay;
}

function setOverlayMessage(overlay: OverlayHandle, text: string) {
  overlay.setLoading(false);
  overlay.setText(text);
}

function setOverlayLoadingMessage(overlay: OverlayHandle, text: string) {
  const body = overlay._body;
  if (!body) {
    overlay.setLoading(true);
    return;
  }
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'ifocal-loading-wrap';
  wrap.style.justifyContent = 'flex-start';
  wrap.style.gap = '8px';
  wrap.style.minHeight = '0';
  const spin = document.createElement('span');
  spin.className = 'ifocal-loading';
  spin.setAttribute('aria-label', 'Loading translation');
  const label = document.createElement('span');
  label.textContent = text;
  wrap.appendChild(spin);
  wrap.appendChild(label);
  body.appendChild(wrap);
}

function shouldUseMachineTranslation(mode: unknown): boolean {
  return normalizeSelectionTranslationMode(mode) === 'machine';
}

function startMachineTranslateForOverlay(overlay: OverlayHandle, text: string, lang: string, channelId?: string) {
  overlay.setLoading(true);
  void machineTranslateTexts([text], lang, channelId).then((resp) => {
    overlay.setLoading(false);
    const translated = Array.isArray(resp?.translations) ? String(resp.translations[0] || '') : '';
    const error = Array.isArray(resp?.errors) ? String(resp.errors.find(Boolean) || '') : '';
    if ((resp?.ok || translated) && translated) {
      overlay.setText(translated);
      return;
    }
    overlay.setText(`【错误】${error || resp?.error || '未知错误'}`);
  });
}

function createMachineOverlayRunner(channelId?: string): OverlayTranslateRunner {
  return (overlay, _task, text, _pair, lang) => {
    startMachineTranslateForOverlay(overlay, text, lang, channelId);
  };
}

function createSelectionRunner(cfg: StorageConfig): { runner: OverlayTranslateRunner; showModelSelector: boolean } {
  if (shouldUseMachineTranslation(cfg.selectionTranslationMode || selectionTranslationMode)) {
    return { runner: createMachineOverlayRunner(cfg.mtDefaultChannelId), showModelSelector: false };
  }
  return { runner: startStreamForOverlay, showModelSelector: true };
}

function applyInlineTranslationResult(wrapper: HTMLElement, text: string, targetLang: string, sourceText: string) {
  try {
    if (targetLang) wrapper.setAttribute('lang', targetLang);
    const rtl = targetLang && /^(ar|he|fa|ur|yi)(-|$)/i.test(targetLang);
    if (rtl) wrapper.setAttribute('dir', 'rtl'); else wrapper.removeAttribute('dir');
    wrapper.innerHTML = '';
    const styleName = (wrapper.getAttribute('data-tx-style') || '').trim() || 'ifocal-target-style-dotted';
    const spacer = document.createElement('font');
    spacer.className = 'notranslate';
    spacer.innerHTML = '&nbsp;&nbsp;';
    wrapper.appendChild(spacer);
    const resultWrapper = document.createElement('font');
    resultWrapper.className = `notranslate ifocal-target-inline-wrapper ${styleName}`.trim();
    const inner = document.createElement('font');
    inner.className = 'notranslate ifocal-target-inner';
    inner.textContent = text;
    resultWrapper.appendChild(inner);
    wrapper.appendChild(resultWrapper);
    try { wrapper.setAttribute('data-tx-done', '1'); } catch { }
    const block = wrapper.closest('p,div,section,article,li,td,a,h1,h2,h3,h4,h5,h6') as HTMLElement | null;
    if (block && sourceText) {
      try { block.setAttribute('aria-busy', 'false'); } catch {}
    }
  } catch {}
}

function appendFullPageTranslation(element: HTMLElement, translatedText: string, targetLang: string, styleName: string) {
  const host = document.createElement('span');
  host.className = 'ifocal-fullpage-translation notranslate';
  host.setAttribute('data-ifocal-full-page', '1');

  const wrapper = sharedCreateWrapper(`fullpage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, targetLang);
  try { wrapper.setAttribute('data-tx-style', styleName); } catch {}
  if (targetLang) wrapper.setAttribute('lang', targetLang);
  if (/^(ar|he|fa|ur|yi)(-|$)/i.test(targetLang || '')) wrapper.setAttribute('dir', 'rtl');
  else wrapper.removeAttribute('dir');

  const resultWrapper = document.createElement('font');
  resultWrapper.className = `notranslate ifocal-target-block-wrapper ${styleName}`.trim();
  const inner = document.createElement('font');
  inner.className = 'notranslate ifocal-target-inner';
  inner.textContent = translatedText;
  resultWrapper.appendChild(inner);
  wrapper.appendChild(resultWrapper);
  host.appendChild(wrapper);
  element.appendChild(host);
}

function clearFullPageTranslations() {
  try {
    document.querySelectorAll('.ifocal-fullpage-translation[data-ifocal-full-page="1"]').forEach((node) => node.remove());
  } catch {}
}

function isVisibleForFullPageTranslate(element: HTMLElement): boolean {
  try {
    if (!element.isConnected) return false;
    if (isIfocalElement(element)) return false;
    if (isInputArea(element)) return false;
    if (isExcludedTranslateElement(element)) return false;
    if ((element.getAttribute('aria-hidden') || '').toLowerCase() === 'true') return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return element.getClientRects().length > 0;
  } catch {
    return false;
  }
}

const FULL_PAGE_CORE_SELECTOR = 'p,li,td,th,blockquote,h1,h2,h3,h4,h5,h6,figcaption,caption,summary,dt,dd';
const FULL_PAGE_FALLBACK_SELECTOR = 'div,section,article';
const FULL_PAGE_MAX_TEXT_LENGTH = 1200;

function collectFullPageTargets(): FullPageTarget[] {
  const targets: FullPageTarget[] = [];
  const seen = new Set<HTMLElement>();
  const pushTarget = (element: HTMLElement) => {
    if (seen.has(element)) return;
    if (!isVisibleForFullPageTranslate(element)) return;
    const text = extractTranslatableText(element);
    if (!text || text.length < 2 || text.length > FULL_PAGE_MAX_TEXT_LENGTH) return;
    if (element.querySelector('.ifocal-fullpage-translation[data-ifocal-full-page="1"]')) return;
    seen.add(element);
    targets.push({ element, text });
  };

  document.querySelectorAll(FULL_PAGE_CORE_SELECTOR).forEach((node) => {
    const element = node as HTMLElement;
    if (element.querySelector(FULL_PAGE_CORE_SELECTOR)) return;
    pushTarget(element);
  });

  document.querySelectorAll(FULL_PAGE_FALLBACK_SELECTOR).forEach((node) => {
    const element = node as HTMLElement;
    if (element.querySelector(FULL_PAGE_CORE_SELECTOR)) return;
    if (element.querySelector(FULL_PAGE_FALLBACK_SELECTOR)) return;
    pushTarget(element);
  });

  return targets;
}

async function translateFullPage() {
  if (fullPageTranslateRunning) {
    const overlay = createFixedOverlay();
    setOverlayMessage(overlay, '网页全文翻译正在执行，请稍候。');
    window.setTimeout(() => {
      try { overlay.root.remove(); } catch {}
    }, 1800);
    return { ok: false, error: 'running' };
  }

  fullPageTranslateRunning = true;
  const overlay = createFixedOverlay('spinner');
  overlay.setLoading(true);

  try {
    clearFullPageTranslations();
    const cfg = await new Promise<StorageConfig>((resolve) => {
      try {
        chrome.storage.sync.get(['translateTargetLang', 'mtDefaultChannelId', 'wrapperStyleName', 'targetStylePresets'], (items: any) => {
          resolve(items || {});
        });
      } catch {
        resolve({});
      }
    });
    const targetLang = String(cfg.translateTargetLang || 'zh-CN').trim() || 'zh-CN';
    const channelId = String(cfg.mtDefaultChannelId || '').trim() || undefined;
    const styleName = String(cfg.wrapperStyleName || 'ifocal-target-style-dotted').trim() || 'ifocal-target-style-dotted';

    ensureDocLoadingStyle();
    ensureTargetStylePresets(cfg.targetStylePresets || null);

    const targets = collectFullPageTargets();
    if (!targets.length) {
      setOverlayMessage(overlay, '未找到可翻译的网页正文。');
      window.setTimeout(() => {
        try { overlay.root.remove(); } catch {}
      }, 2200);
      return { ok: true, translated: 0, failed: 0 };
    }

    const batchSize = 20;
    let translatedCount = 0;
    let failedCount = 0;

    for (let start = 0; start < targets.length; start += batchSize) {
      const chunk = targets.slice(start, start + batchSize);
      setOverlayLoadingMessage(overlay, '网页全文翻译中...');
      const resp = await machineTranslateTexts(chunk.map((item) => item.text), targetLang, channelId);
      const translations = Array.isArray(resp?.translations) ? resp.translations : [];
      const errors = Array.isArray(resp?.errors) ? resp.errors : [];

      chunk.forEach((item, index) => {
        const translatedText = String(translations[index] || '').trim();
        const error = String(errors[index] || '').trim();
        if (translatedText) {
          appendFullPageTranslation(item.element, translatedText, targetLang, styleName);
          translatedCount += 1;
        } else if (error || resp?.error) {
          failedCount += 1;
        }
      });

      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    setOverlayMessage(overlay, '网页全文翻译完成');
    window.setTimeout(() => {
      try { overlay.root.remove(); } catch {}
    }, 2600);
    return { ok: true, translated: translatedCount, failed: failedCount };
  } catch (error: any) {
    setOverlayMessage(overlay, `网页全文翻译失败\n${String(error?.message || error || '未知错误')}`);
    return { ok: false, error: String(error?.message || error || '未知错误') };
  } finally {
    fullPageTranslateRunning = false;
  }
}

function showSelectionDot(rect: DOMRect) {
  const shadow = ensureUiRoot();
  try { hideSelectionDot(); } catch {}
  const dot = document.createElement('div');
  dot.className = 'ifocal-dot';
  const left = Math.floor(rect.right + window.scrollX - 12);
  const top = Math.floor(rect.top + window.scrollY - 12);
  dot.style.left = `${left}px`;
  dot.style.top = `${top}px`;
  const trigger = (ev: Event) => {
    ev.preventDefault(); ev.stopPropagation();
    const overlay = createOverlayAt(left, top + 16, 'skeleton');
    overlayAutoFollow = true;
    overlay.setLoading(true);
    chrome.storage.sync.get(['channels', 'defaultModel', 'translateTargetLang', 'prevLanguage', 'selectionTranslationMode', 'mtDefaultChannelId'], (cfg: StorageConfig) => {
      const pair = pickPair(cfg);
      const lang = cfg.translateTargetLang || 'zh-CN';
      const prevLang = cfg.prevLanguage || 'en';
      const { runner, showModelSelector } = createSelectionRunner(cfg);
      attachOverlayHeaderVue(overlay, cfg, pair, lang, prevLang, lastSelectionText, runner, showModelSelector);
      runner(overlay, 'translate', lastSelectionText, pair, lang, prevLang);
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
    const left = Math.floor(rect.right + window.scrollX - 12);
    const top = Math.floor(rect.top + window.scrollY - 12);
    if (selectionDot) {
      selectionDot.style.left = `${left}px`;
      selectionDot.style.top = `${top}px`;
    }
    if (overlayAutoFollow && lastOverlay?.root) {
      lastOverlay.root.style.left = `${left}px`;
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
      chrome.storage.sync.get(['channels', 'defaultModel', 'translateTargetLang', 'prevLanguage', 'selectionTranslationMode', 'mtDefaultChannelId'], (cfg: StorageConfig) => {
        const pair = pickPair(cfg);
        const lang = cfg.translateTargetLang || 'zh-CN';
        const prevLang = cfg.prevLanguage || 'en';
        const { runner, showModelSelector } = createSelectionRunner(cfg);
        attachOverlayHeaderVue(overlay, cfg, pair, lang, prevLang, source, runner, showModelSelector);
        runner(overlay, 'translate', source, pair, lang, prevLang);
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

    chrome.storage.sync.get(['translateTargetLang', 'wrapperStyleName', 'targetStylePresets', 'selectionTranslationMode', 'mtDefaultChannelId'], (cfg: StorageConfig & any) => {
      const sourceText = (blockEl.innerText || '').trim();
      const langCode = (cfg.translateTargetLang || 'zh-CN').trim();
      const styleName = (cfg.wrapperStyleName || 'ifocal-target-style-dotted').trim();
      ensureDocLoadingStyle();
      ensureTargetStylePresets(cfg.targetStylePresets as any[]);
      // 统一创建 wrapper，并标注样式名供 applyWrapperResult 使用
      const wrapper = sharedCreateWrapper(`inline_${Date.now()}`, langCode);
      try { wrapper.setAttribute('data-tx-style', styleName); } catch {}
      blockEl.appendChild(wrapper);
      sharedApplyWrapperLoading(wrapper, sourceText);
      try { blockEl.setAttribute('aria-busy', 'true'); } catch {}

      if (shouldUseMachineTranslation(cfg.selectionTranslationMode || selectionTranslationMode)) {
        void machineTranslateTexts([sourceText], langCode, cfg.mtDefaultChannelId).then((response) => {
          blockEl.dataset.fcTranslated = '1';
          const msg = Array.isArray(response?.translations) ? String(response.translations[0] || '') : '';
          const error = Array.isArray(response?.errors) ? String(response.errors.find(Boolean) || '') : '';
          const resultText = msg || (error || response?.error ? `【错误】${error || response?.error || '未知错误'}` : '');
          applyInlineTranslationResult(wrapper, resultText, langCode, sourceText);
        });
        return;
      }

      chrome.runtime.sendMessage({ action: 'performAiAction', task: 'translate', text: sourceText }, (response: { ok?: boolean; result?: string; error?: string } | undefined) => {
        try { void chrome.runtime.lastError; } catch { }
        blockEl.dataset.fcTranslated = '1';
        const msg = response && response.ok ? response.result : response?.error || '';
        sharedApplyWrapperResult(wrapper, msg || '', langCode, undefined, sourceText);
      });
    });
  } catch (error) {
    console.warn('toggleHoverTranslate failed', error);
  }
}

function pickPair(cfg: StorageConfig, reqPair?: ChannelPair): ChannelPair {
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  const normalizePair = (pair?: ChannelPair) => {
    if (!pair?.channel || !pair.model) return null;
    const modelId = parseModelSpec(pair.model).modelId;
    if (!modelId) return null;
    return { channel: pair.channel, model: modelId };
  };
  const isValid = (pair?: ChannelPair) => {
    const normalized = normalizePair(pair);
    if (!normalized) return false;
    const channel = channels.find((c) => c.name === normalized.channel);
    return !!(channel && channelHasModelId(channel, normalized.model));
  };
  if (isValid(reqPair)) return normalizePair(reqPair)!;
  if (isValid(cfg.defaultModel)) return normalizePair(cfg.defaultModel)!;
  for (const ch of channels) {
    const firstModelId = firstModelIdFromChannel(ch);
    if (firstModelId) return { channel: ch.name, model: firstModelId };
  }
  return null;
}

function triggerSelectionTranslate() {
  if (!lastSelectionText) return;
  const rect = lastSelectionRect || getSelectionRect();
  const overlay = rect ? createOverlayAt(rect.left + window.scrollX, rect.bottom + window.scrollY + 8, 'skeleton') : createOverlayAt(80, 80, 'skeleton');
  overlay.setLoading(true);
  chrome.storage.sync.get(['channels', 'defaultModel', 'translateTargetLang', 'prevLanguage', 'selectionTranslationMode', 'mtDefaultChannelId'], (cfg: StorageConfig) => {
    const pair = pickPair(cfg);
    const lang = cfg.translateTargetLang || 'zh-CN';
    const prevLang = cfg.prevLanguage || 'en';
    const { runner, showModelSelector } = createSelectionRunner(cfg);
    attachOverlayHeaderVue(overlay, cfg, pair, lang, prevLang, lastSelectionText, runner, showModelSelector);
    runner(overlay, 'translate', lastSelectionText, pair, lang, prevLang);
  });
}

function startStreamForOverlay(overlay: OverlayHandle, task: string, text: string, pair: ChannelPair, lang: string, prevLang?: string) {
  overlay.setLoading(true);
  const payload: any = { action: 'performAiAction', task, text };
  if (pair?.channel && pair.model) { payload.channel = pair.channel; payload.model = pair.model; }
  if (lang) payload.targetLang = lang;
  if (prevLang) payload.prevLang = prevLang;
  try {
    chrome.runtime.sendMessage(payload, (resp: any) => {
      try { void chrome.runtime.lastError; } catch { }
      overlay.setLoading(false);
      if (!resp) { overlay.setText('[错误] 无响应'); return; }
      if (resp.ok) overlay.setText(String(resp.result || ''));
      else overlay.setText(`【错误】${resp.error || '未知错误'}`);
    });
  } catch (e: any) {
    overlay.setLoading(false);
    overlay.setText(`【错误】${String(e?.message || e || '调用失败')}`);
  }
}

function attachOverlayHeaderVue(overlay: OverlayHandle, cfg: StorageConfig, pair: ChannelPair, lang: string, prevLang: string, text: string, runTranslate: OverlayTranslateRunner = startStreamForOverlay, showModelSelector = true) {
  const header = document.createElement('div');
  header.className = 'ifocal-overlay-header';
  let currentPair: ChannelPair = pair ? { ...pair } : null;
  let currentLangValue = lang;
  let currentPrevLangValue = prevLang;

  // 左侧：Models + Language（自定义下拉）
  const left = document.createElement('div');
  left.className = 'ifocal-header-left';

  // 自定义下拉使用预定义 CSS 类，减少内联样式

  const modelMenu = document.createElement('div');
  modelMenu.className = 'ifocal-dd-menu hidden';
  if (showModelSelector) {
    const modelWrap = document.createElement('div');
    modelWrap.className = 'ifocal-dd-wrap';
    const modelBtn = document.createElement('button');
    modelBtn.className = 'ifocal-dd-btn';
    modelBtn.textContent = currentPair ? resolveModelDisplayName(cfg, currentPair) : 'Models';
    const pairs: Array<{ channel: string; model: string; displayName: string }> = [];
    const list = Array.isArray(cfg.channels) ? cfg.channels : [];
    list.forEach((ch) => (ch.models || []).forEach((m) => {
      const parsed = parseModelSpec(m);
      if (!parsed.modelId) return;
      pairs.push({ channel: ch.name, model: parsed.modelId, displayName: parsed.displayName || parsed.modelId });
    }));
    pairs.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'ifocal-dd-item';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = p.displayName;
      item.appendChild(title);
      item.addEventListener('click', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        currentPair = { channel: p.channel, model: p.model };
        modelBtn.textContent = p.displayName;
        chrome.storage.sync.set({ defaultModel: currentPair }, () => {
          runTranslate(overlay, 'translate', text, currentPair, currentLangValue, currentPrevLangValue);
        });
        modelMenu.classList.add('hidden');
      });
      modelMenu.appendChild(item);
    });
    modelBtn.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); modelMenu.classList.toggle('hidden'); });
    modelWrap.appendChild(modelBtn);
    modelWrap.appendChild(modelMenu);
    left.appendChild(modelWrap);
  }

  // 语言下拉（读取 shared 列表）
  const langWrap = document.createElement('div');
  langWrap.className = 'ifocal-dd-wrap';
  const langBtn = document.createElement('button');
  langBtn.className = 'ifocal-dd-btn';
  const currentLangLabel = SUPPORTED_LANGUAGES.find(l => l.value === currentLangValue)?.label || currentLangValue;
  langBtn.textContent = currentLangLabel || 'Language';
  const langMenu = document.createElement('div');
  langMenu.className = 'ifocal-dd-menu hidden';
  SUPPORTED_LANGUAGES.forEach((L) => {
    const item = document.createElement('div');
    item.className = 'ifocal-dd-item';
    item.textContent = `${L.label}`;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      // 智能语言切换：将当前语言保存为 prevLanguage
      const oldLang = currentLangValue;
      chrome.storage.sync.set({ translateTargetLang: L.value, prevLanguage: oldLang }, () => {
        currentPrevLangValue = oldLang;
        currentLangValue = L.value;
        langBtn.textContent = L.label;
        runTranslate(overlay, 'translate', text, currentPair, currentLangValue, currentPrevLangValue);
      });
      langMenu.classList.add('hidden');
    });
    langMenu.appendChild(item);
  });
  langBtn.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); langMenu.classList.toggle('hidden'); });
  langWrap.appendChild(langBtn);
  langWrap.appendChild(langMenu);

  left.appendChild(langWrap);

  // 右侧：Close Icon
  const right = document.createElement('div');
  const closeBtn = document.createElement('button');
  // 统一线性风格的内联 SVG 关闭图标
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

  // 在面板内选择文字/交互时，停止“跟随选区”模式，避免面板追随自身内容漂移
  overlay.root.addEventListener('mousedown', () => {
    overlayAutoFollow = false;
  }, true);
  overlay.root.addEventListener('touchstart', () => {
    overlayAutoFollow = false;
  }, { passive: true, capture: true });

  const outsideClick = (event: MouseEvent) => {
    const path = (event as any).composedPath ? (event as any).composedPath() : [];
    if (!(path as any[]).includes(overlay.root)) {
      if (overlay._port) {
        try {
          overlay._port.disconnect();
        } catch (error) {
          console.warn('failed to disconnect port', error);
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && lastOverlay?.root) {
    if (lastOverlay._port) {
      try {
        lastOverlay._port.disconnect();
      } catch (error) {
        console.warn('failed to disconnect port', error);
      }
      lastOverlay._port = null;
    }
    lastOverlay.root.remove();
    lastOverlay = null;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'translateFullPage') {
    void translateFullPage().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error?.message || error || '未知错误') }));
    return true;
  }
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
