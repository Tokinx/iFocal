// content/content.js（UTF-8）

console.log('FloatingCopilot 内容脚本已加载');

let hoveredElement = null;
let hoverKey = 'Alt'; // 悬浮翻译的触发按键（可在设置中配置）
let displayMode = 'insert'; // insert | overlay
let lastOverlay = null;
let keydownCooldown = false;

// 初始化：读取设置中的热键
try {
  chrome.storage.sync.get(['hoverKey', 'displayMode'], (items) => {
    if (items && items.hoverKey) {
      hoverKey = items.hoverKey;
    }
    if (items && items.displayMode) {
      displayMode = items.displayMode;
    }
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.hoverKey) {
      hoverKey = changes.hoverKey.newValue || 'Alt';
    }
    if (areaName === 'sync' && changes.displayMode) {
      displayMode = changes.displayMode.newValue || 'insert';
    }
  });
} catch (e) {
  // 某些环境（非扩展）下无 storage，可忽略
}

// 选择更合理的文本块元素
function findTextBlockElement(el) {
  const BLOCK_TAGS = new Set(['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD']);
  const INVALID_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
  let cur = el;
  while (cur && cur !== document.body) {
    if (INVALID_TAGS.has(cur.tagName)) return null;
    const text = (cur.innerText || '').trim();
    if (BLOCK_TAGS.has(cur.tagName) && text.length >= 10) return cur;
    cur = cur.parentElement;
  }
  return el;
}

// 1) 悬浮逻辑：跟踪鼠标所在的文本块
document.addEventListener('mouseover', (event) => {
  hoveredElement = findTextBlockElement(event.target);
});

document.addEventListener('mouseout', () => {
  hoveredElement = null;
});

document.addEventListener('keydown', (event) => {
  if (event.key === hoverKey && hoveredElement && !keydownCooldown) {
    event.preventDefault();
    keydownCooldown = true; setTimeout(() => keydownCooldown = false, 800);
    const text = (hoveredElement.innerText || '').trim();
    if (text) {
      console.log(`悬浮按键触发，待处理文本: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`);
      // 未显式指定模型时，background 将优先选择“翻译模型”，否则回退默认模型
      chrome.runtime.sendMessage({ action: 'performAiAction', task: 'translate', text }, (response) => {
        if (!response) return;
        const msg = response.ok ? response.result : response.error;
        console.log('AI 响应:', msg);
        // 按设置选择显示方式
        if (displayMode === 'overlay') {
          const rect = hoveredElement.getBoundingClientRect();
          showOverlayAt(rect.left, rect.bottom + 8, msg || '');
        } else {
          showBlockResult(hoveredElement, msg || '');
        }
      });
    }
  }
});

// 2) 划词逻辑：记录用户选中的文本（预留：显示浮标/小窗）
document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  const selectedText = (selection ? selection.toString() : '').trim();
  if (selectedText) {
    console.log(`划词选中: ${selectedText.slice(0, 120)}${selectedText.length > 120 ? '…' : ''}`);
    const rect = getSelectionRect();
    const overlay = rect ? createOverlayAt(rect.left, rect.bottom + 8) : null;
    if (overlay) overlay.setText('正在翻译…');
    const port = chrome.runtime.connect({ name: 'ai-stream' });
    port.onMessage.addListener((m) => {
      if (!overlay) return;
      if (m.type === 'delta') {
        overlay.append(m.text);
      } else if (m.type === 'done') {
        // no-op
      } else if (m.type === 'error') {
        overlay.append('\n[错误] ' + m.error);
      }
    });
    port.postMessage({ type: 'start', task: 'translate', text: selectedText });
  }
});

function getSelectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect && rect.width >= 0 && rect.height >= 0) return rect;
  return null;
}

function createOverlayAt(x, y) {
  if (lastOverlay && lastOverlay.root && lastOverlay.root.remove) lastOverlay.root.remove();
  const root = document.createElement('div');
  root.className = 'floating-copilot-overlay';
  root.style.left = Math.max(8, Math.floor(x)) + 'px';
  root.style.top = Math.max(8, Math.floor(y)) + 'px';
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
  const api = {
    root,
    setText(t) { body.textContent = t; },
    append(t) { body.textContent += t; }
  };
  lastOverlay = api;
  return api;
}

function showBlockResult(blockEl, text) {
  try {
    // 移除旧结果
    const old = blockEl.__fc_result;
    if (old && old.parentNode) old.parentNode.removeChild(old);
    const box = document.createElement('div');
    box.className = 'floating-copilot-result';
    const close = document.createElement('span');
    close.textContent = '×';
    close.style.cursor = 'pointer';
    close.style.float = 'right';
    close.style.color = '#888';
    close.addEventListener('click', () => box.remove());
    const content = document.createElement('div');
    content.style.whiteSpace = 'pre-wrap';
    content.textContent = text;
    box.appendChild(close);
    box.appendChild(content);
    if (blockEl.nextSibling) {
      blockEl.parentNode.insertBefore(box, blockEl.nextSibling);
    } else {
      blockEl.parentNode.appendChild(box);
    }
    blockEl.__fc_result = box;
  } catch {}
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lastOverlay) {
    if (lastOverlay.root && lastOverlay.root.remove) lastOverlay.root.remove();
    else if (lastOverlay.remove) lastOverlay.remove();
    lastOverlay = null;
  }
});
