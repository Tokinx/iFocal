import './style.css';

const LOG_PREFIX = '[FloatingCopilot]';

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
let lastOverlay: OverlayHandle | null = null;
let keydownCooldown = false;

let lastSelectionText = '';
let lastSelectionRect: DOMRect | null = null;
let selectionSyncTimer: number | undefined;
const SELECTION_SYNC_DELAY = 200;

function readHotkeys() {
  try {
    chrome.storage.sync.get(['actionKey', 'hoverKey', 'selectKey', 'displayMode'], (items) => {
      if (items?.actionKey) actionKey = items.actionKey;
      else if (items?.hoverKey) actionKey = items.hoverKey;
      else if (items?.selectKey) actionKey = items.selectKey;
      if (items?.displayMode === 'overlay' || items?.displayMode === 'insert') {
        displayMode = items.displayMode;
      }
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      if (changes.actionKey) actionKey = changes.actionKey.newValue || 'Alt';
      if (changes.displayMode) {
        const mode = changes.displayMode.newValue as 'insert' | 'overlay';
        displayMode = mode || 'insert';
      }
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} failed to read hotkeys`, error);
  }
}

readHotkeys();

function findTextBlockElement(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return null;
  const BLOCK_TAGS = new Set(['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD']);
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
    chrome.runtime.sendMessage({ source: 'floating-copilot', type: 'selection', text });
  }, SELECTION_SYNC_DELAY);
}

document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  if (selectedText) {
    lastSelectionText = selectedText;
    lastSelectionRect = getSelectionRect();
  } else {
    lastSelectionText = '';
    lastSelectionRect = null;
  }
  scheduleSelectionSync(selectedText);
});

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';
  scheduleSelectionSync(text);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== actionKey || keydownCooldown) return;
  event.preventDefault();
  keydownCooldown = true;
  window.setTimeout(() => {
    keydownCooldown = false;
  }, 800);
  if (lastSelectionText) {
    triggerSelectionTranslate();
    return;
  }
  if (hoveredElement) {
    toggleHoverTranslate(hoveredElement);
  }
});

function getSelectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect && rect.width >= 0 && rect.height >= 0) return rect;
  return null;
}

function createOverlayAt(x: number, y: number): OverlayHandle {
  if (lastOverlay?.root?.remove) lastOverlay.root.remove();
  const root = document.createElement('div');
  root.className = 'floating-copilot-overlay';
  root.style.left = `${Math.max(8, Math.floor(x))}px`;
  root.style.top = `${Math.max(8, Math.floor(y))}px`;

  const close = document.createElement('span');
  close.className = 'close-btn';
  close.textContent = '×';
  close.addEventListener('click', () => root.remove());
  root.appendChild(close);

  const body = document.createElement('div');
  body.style.whiteSpace = 'pre-wrap';
  body.style.maxHeight = '50vh';
  body.style.overflowY = 'auto';
  root.appendChild(body);

  document.body.appendChild(root);

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

function needsLineBreak(tag: string) {
  return tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article';
}

function toggleHoverTranslate(blockEl: HTMLElement) {
  if (!chrome?.runtime) return;
  try {
    if (displayMode === 'overlay') {
      const rect = blockEl.getBoundingClientRect();
      const overlay = createOverlayAt(rect.left, rect.bottom + 8);
      overlay.setLoading(true);
      const source = (blockEl.innerText || '').trim();
      chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'activeModel', 'translateTargetLang'], (cfg: StorageConfig) => {
        const reqPair = cfg.activeModel || null;
        const pair = pickPair(cfg, 'translate', reqPair);
        const lang = cfg.translateTargetLang || 'zh-CN';
        attachOverlayHeader(overlay, cfg, pair, lang, source);
        startStreamForOverlay(overlay, 'translate', source, pair, lang);
      });
      return;
    }

    const existWrapper = blockEl.querySelector<HTMLElement>('font.floating-copilot-target-wrapper.notranslate');
    if (existWrapper || blockEl.dataset.fcTranslated === '1') {
      existWrapper?.remove();
      const br = blockEl.querySelector('br.floating-copilot-target-break');
      br?.remove();
      blockEl.dataset.fcTranslated = '';
      return;
    }

    chrome.storage.sync.get(['translateTargetLang', 'wrapperStyle'], (cfg: StorageConfig) => {
      const langCode = (cfg.translateTargetLang || 'zh-CN').trim();
      const styleText = (cfg.wrapperStyle || '').trim();
      const wrapper = document.createElement('font');
      wrapper.className = 'notranslate floating-copilot-target-wrapper';
      wrapper.setAttribute('lang', langCode);
      if (styleText) wrapper.setAttribute('style', styleText);
      const tag = (blockEl.tagName || 'div').toLowerCase();
      if (needsLineBreak(tag)) {
        const br = document.createElement('br');
        br.className = 'floating-copilot-target-break';
        blockEl.appendChild(br);
      }
      const spin = document.createElement('div');
      spin.className = 'fc-spinner';
      wrapper.appendChild(spin);
      blockEl.appendChild(wrapper);

      const sourceText = (blockEl.innerText || '').trim();
      chrome.runtime.sendMessage({ action: 'performAiAction', task: 'translate', text: sourceText }, (response: { ok?: boolean; result?: string; error?: string } | undefined) => {
        blockEl.dataset.fcTranslated = '1';
        const msg = response && response.ok ? response.result : response?.error || '';
        wrapper.innerHTML = '';
        const inner = document.createElement('font');
        inner.textContent = msg || '';
        wrapper.appendChild(inner);
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
  const overlay = rect ? createOverlayAt(rect.left, rect.bottom + 8) : createOverlayAt(80, 80);
  overlay.setLoading(true);
  chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'activeModel', 'translateTargetLang'], (cfg: StorageConfig) => {
    const reqPair = cfg.activeModel || null;
    const pair = pickPair(cfg, 'translate', reqPair);
    const lang = cfg.translateTargetLang || 'zh-CN';
    attachOverlayHeader(overlay, cfg, pair, lang, lastSelectionText);
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
  const payload: Record<string, unknown> = { type: 'start', task, text };
  if (pair?.channel && pair.model) {
    payload.channel = pair.channel;
    payload.model = pair.model;
  }
  if (lang) payload.targetLang = lang;
  port.postMessage(payload);
}

function attachOverlayHeader(overlay: OverlayHandle, cfg: StorageConfig, pair: ChannelPair, lang: string, text: string) {
  const header = document.createElement('div');
  header.style.cursor = 'move';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.marginBottom = '8px';

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.alignItems = 'center';
  left.style.gap = '8px';

  const modelLabel = document.createElement('span');
  modelLabel.className = 'text-sm subtle';
  modelLabel.textContent = pair ? `${pair.model} (${pair.channel})` : 'No model';

  const langSelect = document.createElement('select');
  ['zh-CN', 'en', 'ja', 'ko', 'fr', 'es', 'de'].forEach((code) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = code;
    if (code === lang) option.selected = true;
    langSelect.appendChild(option);
  });

  left.appendChild(modelLabel);
  left.appendChild(langSelect);

  const right = document.createElement('div');
  const modelSelect = document.createElement('select');
  const pairs: ChannelPair[] = [];
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  channels.forEach((ch) => (ch.models || []).forEach((m) => pairs.push({ channel: ch.name, model: m })));
  pairs.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = `${p.channel}|${p.model}`;
    opt.textContent = `${p.model} (${p.channel})`;
    if (pair && p.channel === pair.channel && p.model === pair.model) opt.selected = true;
    modelSelect.appendChild(opt);
  });

  right.appendChild(modelSelect);

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
    startX = event.clientX;
    startY = event.clientY;
    startLeft = parseInt(overlay.root.style.left, 10) || 0;
    startTop = parseInt(overlay.root.style.top, 10) || 0;
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  });

  const outsideClick = (event: MouseEvent) => {
    if (!overlay.root.contains(event.target as Node)) {
      if (overlay._port) {
        try {
          overlay._port.disconnect();
        } catch (error) {
          console.warn(`${LOG_PREFIX} failed to disconnect port`, error);
        }
        overlay._port = null;
      }
      overlay.root.remove();
      document.removeEventListener('mousedown', outsideClick, true);
    }
  };
  window.setTimeout(() => document.addEventListener('mousedown', outsideClick, true), 0);

  langSelect.addEventListener('change', () => {
    const newLang = langSelect.value;
    chrome.storage.sync.set({ translateTargetLang: newLang }, () => {
      startStreamForOverlay(overlay, 'translate', text, parsePair(modelSelect.value), newLang);
    });
  });

  modelSelect.addEventListener('change', () => {
    const nextPair = parsePair(modelSelect.value);
    modelLabel.textContent = nextPair ? `${nextPair.model} (${nextPair.channel})` : 'No model';
    startStreamForOverlay(overlay, 'translate', text, nextPair, langSelect.value);
  });
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