// content/content.js (UTF-8)

console.log('FloatingCopilot content script loaded');

let hoveredElement = null;
let actionKey = 'Alt'; // unified page translation hotkey
let displayMode = 'insert'; // insert | overlay (for hover, we always insert inside block)
let lastOverlay = null;
let keydownCooldown = false;

// Init: read settings
try {
  chrome.storage.sync.get(['actionKey', 'hoverKey', 'selectKey', 'displayMode'], (items) => {
    if (items && items.actionKey) actionKey = items.actionKey;
    else if (items && items.hoverKey) actionKey = items.hoverKey;
    else if (items && items.selectKey) actionKey = items.selectKey;
    if (items && items.displayMode) displayMode = items.displayMode;
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.actionKey) actionKey = changes.actionKey.newValue || 'Alt';
    if (areaName === 'sync' && changes.hoverKey && !changes.actionKey) actionKey = changes.hoverKey.newValue || 'Alt';
    if (areaName === 'sync' && changes.selectKey && !changes.actionKey) actionKey = changes.selectKey.newValue || 'Alt';
    if (areaName === 'sync' && changes.displayMode) displayMode = changes.displayMode.newValue || 'insert';
  });
} catch (e) {}

// Pick closest reasonable text block
function findTextBlockElement(el) {
  const BLOCK_TAGS = new Set(['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD']);
  const INVALID_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
  let cur = el;
  while (cur && cur !== document.body) {
    if (INVALID_TAGS.has(cur.tagName)) return null;
    const text = (cur.innerText || '').trim();
    if (BLOCK_TAGS.has(cur.tagName) && text.length >= 6) return cur;
    cur = cur.parentElement;
  }
  return el;
}

// Track hovered block
document.addEventListener('mouseover', (event) => {
  hoveredElement = findTextBlockElement(event.target);
});
document.addEventListener('mouseout', () => { hoveredElement = null; });

// Selection tracking (do not translate immediately)
let lastSelectionText = '';
let lastSelectionRect = null;
document.addEventListener('mouseup', () => {
  const sel = window.getSelection();
  const selectedText = (sel ? sel.toString() : '').trim();
  if (selectedText) {
    lastSelectionText = selectedText;
    lastSelectionRect = getSelectionRect();
    console.log(`Selection picked. Press ${actionKey} to translate.`);
  } else {
    lastSelectionText = '';
    lastSelectionRect = null;
  }
});

// Unified hotkey behavior
document.addEventListener('keydown', (event) => {
  if (event.key !== actionKey || keydownCooldown) return;
  event.preventDefault();
  keydownCooldown = true; setTimeout(() => keydownCooldown = false, 800);

  if (lastSelectionText) {
    triggerSelectionTranslate();
    return;
  }
  if (hoveredElement) {
    toggleHoverTranslate(hoveredElement);
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

// Selection overlay helpers
function createOverlayAt(x, y) {
  if (lastOverlay && lastOverlay.root && lastOverlay.root.remove) lastOverlay.root.remove();
  const root = document.createElement('div');
  root.className = 'floating-copilot-overlay glass rounded-xl shadow-lg p-3 text-sm bg-white/70 backdrop-blur-md border';
  root.style.left = Math.max(8, Math.floor(x)) + 'px';
  root.style.top = Math.max(8, Math.floor(y)) + 'px';
  const close = document.createElement('span');
  close.className = 'close-btn';
  close.textContent = '\u00D7';
  close.addEventListener('click', () => root.remove());
  root.appendChild(close);
  const body = document.createElement('div');
  body.style.whiteSpace = 'pre-wrap';
  body.style.maxHeight = '50vh';
  body.style.overflowY = 'auto';
  root.appendChild(body);
  document.body.appendChild(root);
  let spinner = null;
  const api = {
    root,
    setText(t) { body.textContent = t; },
    append(t) { body.textContent += t; },
    setLoading(flag) {
      if (flag) {
        if (!spinner) {
          spinner = document.createElement('div');
          spinner.className = 'fc-spinner';
          body.innerHTML = '';
          body.appendChild(spinner);
        }
      } else {
        if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
        spinner = null;
      }
    }
  };
  lastOverlay = api;
  return api;
}

function showOverlayAt(x, y, text) {
  const ov = createOverlayAt(x, y);
  ov.setText(text || '');
  return ov;
}

// Hover translate: insert wrapper inside the same block
function toggleHoverTranslate(blockEl) {
  try {
    const existWrapper = blockEl.querySelector('font.floating-copilot-target-wrapper.notranslate');
    if (existWrapper || blockEl.dataset.fcTranslated === '1') {
      if (existWrapper && existWrapper.parentNode) existWrapper.parentNode.removeChild(existWrapper);
      const br = blockEl.querySelector('br.floating-copilot-target-break');
      if (br && br.parentNode) br.parentNode.removeChild(br);
      blockEl.dataset.fcTranslated = '';
      return;
    }

    chrome.storage.sync.get(['translateTargetLang', 'wrapperStyle'], (cfg) => {
      const langStr = (cfg.translateTargetLang || '中文').trim();
      const langCode = resolveLangCode(langStr);
      const styleText = (cfg.wrapperStyle || '').trim();

      const wrapper = document.createElement('font');
      wrapper.className = 'notranslate floating-copilot-target-wrapper';
      wrapper.setAttribute('lang', langCode);
      if (styleText) wrapper.setAttribute('style', styleText);

      const tag = (blockEl.tagName || 'DIV').toLowerCase();
      if (needsLineBreak(tag)) {
        const br = document.createElement('br');
        br.className = 'floating-copilot-target-break';
        blockEl.appendChild(br);
      }

      const spin = document.createElement('div');
      spin.className = 'fc-spinner';
      wrapper.appendChild(spin);
      blockEl.appendChild(wrapper);

      const text = (blockEl.innerText || '').trim();
      chrome.runtime.sendMessage({ action: 'performAiAction', task: 'translate', text }, (response) => {
        blockEl.dataset.fcTranslated = '1';
        const msg = response && response.ok ? response.result : (response && response.error) || '';
        wrapper.innerHTML = '';
        const inner = document.createElement('font');
        inner.textContent = msg || '';
        wrapper.appendChild(inner);
      });
    });
  } catch {}
}

function needsLineBreak(tag) {
  return tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article';
}

function resolveLangCode(name) {
  const s = (name || '').toLowerCase();
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(name)) return name;
  if (s.includes('中文') || s === 'chinese' || s === 'zh') return 'zh-CN';
  if (s.includes('english') || s === 'en' || s.includes('英语')) return 'en';
  if (s.includes('日本') || s.includes('日语') || s === 'ja') return 'ja';
  if (s.includes('한국') || s.includes('韩') || s === 'ko') return 'ko';
  if (s.includes('fran') || s.includes('法') || s === 'fr') return 'fr';
  if (s.includes('espa') || s.includes('西') || s === 'es') return 'es';
  if (s.includes('deut') || s.includes('德') || s === 'de') return 'de';
  return 'zh-CN';
}

// Selection streaming (overlay)
function pickPair(cfg, task, reqPair) {
  const channels = Array.isArray(cfg.channels) ? cfg.channels : [];
  function isValid(pair){ if(!pair||!pair.channel||!pair.model) return false; const ch=channels.find(c=>c.name===pair.channel); return !!(ch&&Array.isArray(ch.models)&&ch.models.includes(pair.model)); }
  if (isValid(reqPair)) return reqPair;
  if (task==='translate' && isValid(cfg.translateModel)) return cfg.translateModel;
  if (isValid(cfg.defaultModel)) return cfg.defaultModel;
  for (const ch of channels) { if (ch.models && ch.models.length) return { channel: ch.name, model: ch.models[0] }; }
  return null;
}

function triggerSelectionTranslate() {
  if (!lastSelectionText) return;
  const rect = lastSelectionRect || getSelectionRect();
  const overlay = rect ? createOverlayAt(rect.left, rect.bottom + 8) : null;
  if (!overlay) return;
  overlay.setLoading(true);
  chrome.storage.sync.get(['channels','defaultModel','translateModel','activeModel','translateTargetLang'], (cfg) => {
    const reqPair = cfg.activeModel || null;
    const pair = pickPair(cfg, 'translate', reqPair);
    const lang = cfg.translateTargetLang || 'zh-CN';
    attachOverlayHeader(overlay, cfg, pair, lang, lastSelectionText);
    startStreamForOverlay(overlay, 'translate', lastSelectionText, pair, lang);
  });
}

function startStreamForOverlay(overlay, task, text, pair, lang){
  if (overlay._port) { try { overlay._port.disconnect(); } catch(e){} overlay._port=null; }
  overlay.setLoading(true);
  const port = chrome.runtime.connect({ name:'ai-stream' });
  overlay._port = port;
  let first=true;
  port.onMessage.addListener((m)=>{
    if (m.type==='delta') { if(first){ overlay.setLoading(false); first=false; } overlay.append(m.text); }
    else if (m.type==='done') { /* noop */ }
    else if (m.type==='error') { overlay.setLoading(false); overlay.append('\n[Error] '+m.error); }
  });
  const msg = { type:'start', task, text };
  if (pair && pair.channel && pair.model) { msg.channel = pair.channel; msg.model = pair.model; }
  port.postMessage(msg);
}

function attachOverlayHeader(overlay, cfg, pair, lang, text){
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
  modelLabel.textContent = pair ? `${pair.channel} • ${pair.model}` : 'No model';
  const langSelect = document.createElement('select');
  ;['zh-CN','en','ja','ko','fr','es','de'].forEach(v=>{ const opt=document.createElement('option'); opt.value=v; opt.textContent=v; if(v===lang) opt.selected=true; langSelect.appendChild(opt); });
  left.appendChild(modelLabel);
  left.appendChild(langSelect);

  const right = document.createElement('div');
  const modelSelect = document.createElement('select');
  const pairs=[]; const channels = Array.isArray(cfg.channels)?cfg.channels:[];
  channels.forEach(ch => (ch.models||[]).forEach(m => pairs.push({channel:ch.name, model:m})));
  pairs.forEach(p=>{ const opt=document.createElement('option'); opt.value=`${p.channel}|${p.model}`; opt.textContent=`${p.channel} • ${p.model}`; if (pair && p.channel===pair.channel && p.model===pair.model) opt.selected=true; modelSelect.appendChild(opt); });
  right.appendChild(modelSelect);

  header.appendChild(left);
  header.appendChild(right);
  overlay.root.insertBefore(header, overlay.root.children[0]);

  // Dragging
  let dragging=false, sx=0, sy=0, sl=0, st=0;
  const mm=(e)=>{ if(!dragging) return; overlay.root.style.left = (sl + (e.clientX - sx))+'px'; overlay.root.style.top = (st + (e.clientY - sy))+'px'; };
  const mu=()=>{ dragging=false; document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); };
  header.addEventListener('mousedown',(e)=>{ dragging=true; sx=e.clientX; sy=e.clientY; sl=parseInt(overlay.root.style.left)||0; st=parseInt(overlay.root.style.top)||0; document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu); });

  // Outside click to close
  const outside=(e)=>{ if (!overlay.root.contains(e.target)) { if (overlay._port) { try{overlay._port.disconnect();}catch{} overlay._port=null; overlay.root.remove(); document.removeEventListener('mousedown',outside,true); } };
  setTimeout(()=>document.addEventListener('mousedown',outside,true),0);

  // Events: change lang/model -> restart
  langSelect.addEventListener('change', ()=>{
    const newLang = langSelect.value;
    chrome.storage.sync.set({ translateTargetLang: newLang }, () => {
      startStreamForOverlay(overlay, 'translate', text, parsePair(modelSelect.value), newLang);
    });
  });
  modelSelect.addEventListener('change', ()=>{
    const p = parsePair(modelSelect.value);
    modelLabel.textContent = p ? `${p.channel} • ${p.model}` : 'No model';
    startStreamForOverlay(overlay, 'translate', text, p, langSelect.value);
  });
}

function parsePair(value){ if(!value) return null; const [channel,model]=String(value).split('|'); if(!channel||!model) return null; return {channel,model}; }

// Esc close last overlay
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lastOverlay) {
    if (lastOverlay.root && lastOverlay.root.remove) lastOverlay.root.remove();
    else if (lastOverlay.remove) lastOverlay.remove();
    lastOverlay = null;
  }
});

}
