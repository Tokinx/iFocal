// options/options.js（UTF-8）

// DOM 元素
const translateTargetLangInput = document.getElementById('translateTargetLang');
const displayModeSelect = document.getElementById('displayMode');
const saveButton = document.getElementById('save');
const statusEl = document.getElementById('status');
const actionKeyInput = document.getElementById('actionKey');
const wrapperStyleInput = document.getElementById('wrapperStyle');

const channelTypeEl = document.getElementById('channelType');
const channelNameEl = document.getElementById('channelName');
const apiUrlEl = document.getElementById('apiUrl');
const apiKeyEl = document.getElementById('apiKey');
const modelsEl = document.getElementById('models');
const addChannelBtn = document.getElementById('addChannelBtn');
const channelStatusEl = document.getElementById('channelStatus');
const channelsListEl = document.getElementById('channelsList');

const defaultModelSelect = document.getElementById('defaultModelSelect');
const translateModelSelect = document.getElementById('translateModelSelect');
const saveGlobalBtn = document.getElementById('saveGlobalBtn');
const globalStatusEl = document.getElementById('globalStatus');

// 数据形态说明
// channels: Array<{ name, type, apiUrl, apiKey, models: string[] }>
// defaultModel: { channel, model }
// translateModel: { channel, model }

function splitModels(input) {
  return (input || '')
    .split(/\r?\n|,/) // 支持按行或逗号分隔
    .map(s => s.trim())
    .filter(Boolean);
}

function joinPair(pair) {
  return pair && pair.channel && pair.model ? `${pair.channel}|${pair.model}` : '';
}

function parsePair(value) {
  if (!value) return null;
  const [channel, model] = value.split('|');
  if (!channel || !model) return null;
  return { channel, model };
}

function withDefaultApiUrl(type, url) {
  if (url && url.trim()) return url.trim();
  if (type === 'openai') return 'https://api.openai.com/v1';
  if (type === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta';
  return '';
}

function channelIcon(type){ if(type==='openai') return '🟦'; if(type==='gemini') return '🟪'; return '🟩'; }

function renderChannels(channels) {
  if (!channelsListEl) return;
  channelsListEl.innerHTML = '';
  const list = Array.isArray(channels) ? channels : [];

  const closeOtherEditors = () => {
    channelsListEl.querySelectorAll('[data-inline-editor]').forEach(panel => {
      panel.style.display = 'none';
      const statusEl = panel.querySelector('[data-status]');
      if (statusEl) statusEl.textContent = '';
      const apiKeyField = panel.querySelector('[data-field="apiKey"]');
      if (apiKeyField) apiKeyField.value = '';
    });
  };

  function fillEditor(panel, data) {
    panel.dataset.original = data && data.name ? data.name : '';
    const typeEl = panel.querySelector('[data-field="type"]');
    const nameEl = panel.querySelector('[data-field="name"]');
    const apiUrlEl = panel.querySelector('[data-field="apiUrl"]');
    const apiKeyEl = panel.querySelector('[data-field="apiKey"]');
    const modelsEl = panel.querySelector('[data-field="models"]');
    if (typeEl) typeEl.value = (data && data.type) || 'openai';
    if (nameEl) nameEl.value = (data && data.name) || '';
    if (apiUrlEl) apiUrlEl.value = (data && data.apiUrl) || '';
    if (apiKeyEl) apiKeyEl.value = '';
    if (modelsEl) modelsEl.value = Array.isArray(data && data.models) ? data.models.join('\n') : '';
  }

  function buildInlineEditor(card, data, detail) {
    const panel = document.createElement('div');
    panel.className = 'space-y-3';
    panel.dataset.inlineEditor = '1';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="form-group">
        <label class="label">类型</label>
        <select class="select" data-field="type">
          <option value="openai">OpenAI</option>
          <option value="gemini">Google Gemini</option>
          <option value="openai-compatible">OpenAI 兼容</option>
        </select>
      </div>
      <div class="form-group">
        <label class="label">名称</label>
        <input class="input" data-field="name" placeholder="如 my-openai" />
      </div>
      <div class="form-group">
        <label class="label">API URL</label>
        <input class="input" data-field="apiUrl" placeholder="默认地址可留空" />
      </div>
      <div class="form-group">
        <label class="label">API KEY</label>
        <input class="input" data-field="apiKey" placeholder="留空表示不修改" />
      </div>
      <div class="form-group">
        <label class="label">Models（每行一个）</label>
        <textarea class="textarea" data-field="models" style="height:100px;"></textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" data-save>保存</button>
        <button type="button" class="btn btn-ghost" data-cancel>取消</button>
        <span class="text-sm muted" data-status></span>
      </div>
    `;
    fillEditor(panel, data);

    panel._applyData = fresh => fillEditor(panel, fresh || {});
    panel._clearStatus = () => {
      const status = panel.querySelector('[data-status]');
      if (status) status.textContent = '';
      const apiKeyField = panel.querySelector('[data-field="apiKey"]');
      if (apiKeyField) apiKeyField.value = '';
    };

    const statusEl = panel.querySelector('[data-status]');
    const field = key => panel.querySelector(`[data-field="${key}"]`);

    panel.querySelector('[data-save]')?.addEventListener('click', () => {
      if (!statusEl) return;
      statusEl.textContent = '';
      const original = (panel.dataset.original || '').trim();
      const typeEl = field('type');
      const nameEl = field('name');
      const apiUrlEl = field('apiUrl');
      const apiKeyEl = field('apiKey');
      const modelsEl = field('models');
      const type = typeEl ? typeEl.value : 'openai';
      const name = nameEl ? (nameEl.value || '').trim() : '';
      const apiUrl = withDefaultApiUrl(type, apiUrlEl ? apiUrlEl.value : '');
      const apiKeyMaybe = apiKeyEl ? (apiKeyEl.value || '').trim() : '';
      const models = splitModels(modelsEl ? modelsEl.value : '');

      if (!name) { statusEl.textContent = '名称不能为空'; return; }
      if (!models.length) { statusEl.textContent = '请至少填写一个模型'; return; }
      if (type === 'openai-compatible' && !apiUrl) { statusEl.textContent = '自定义兼容渠道需要填写 API URL'; return; }

      chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'activeModel'], (items) => {
        const list = Array.isArray(items.channels) ? items.channels : [];
        if (!original) { statusEl.textContent = '原渠道不存在'; return; }
        if (name !== original && list.some(c => c.name === name)) { statusEl.textContent = '同名渠道已存在'; return; }
        const idx = list.findIndex(c => c.name === original);
        if (idx < 0) { statusEl.textContent = '原渠道不存在'; return; }
        const updated = { ...list[idx], type, name, apiUrl, models };
        if (apiKeyMaybe) updated.apiKey = apiKeyMaybe;
        const nextList = list.slice();
        nextList[idx] = updated;

        const next = { channels: nextList };
        ['defaultModel', 'translateModel', 'activeModel'].forEach(key => {
          const pair = items[key];
          if (pair && pair.channel === original) {
            next[key] = { channel: name, model: pair.model };
          }
        });

        chrome.storage.sync.set(next, () => {
          statusEl.textContent = '已保存';
          if (apiKeyEl) apiKeyEl.value = '';
          setTimeout(() => {
            statusEl.textContent = '';
            panel.style.display = 'none';
            if (detail && card.dataset.detailOpen === '1') detail.style.display = '';
            loadAll();
          }, 800);
        });
      });
    });

    panel.querySelector('[data-cancel]')?.addEventListener('click', () => {
      const original = panel.dataset.original || '';
      chrome.storage.sync.get(['channels'], (items) => {
        const list = Array.isArray(items.channels) ? items.channels : [];
        const latest = list.find(c => c.name === original) || data;
        fillEditor(panel, latest || {});
        panel._clearStatus();
        panel.style.display = 'none';
        if (detail) {
          if (card.dataset.detailOpen === '1') detail.style.display = '';
          else detail.style.display = 'none';
        }
      });
    });

    return panel;
  }

  list.forEach(ch => {
    const card = document.createElement('div');
    card.className = 'card p-3 space-y-3';
    card.setAttribute('data-card-name', ch.name);
    card.dataset.originalName = ch.name;
    card.dataset.detailOpen = '0';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between flex-wrap gap-2';

    const toggle = document.createElement('div');
    toggle.className = 'flex items-center gap-2 cursor-pointer';
    toggle.setAttribute('data-toggle', ch.name);
    toggle.innerHTML = `<span>${channelIcon(ch.type)}</span><span class="font-medium">${ch.name}</span>`;

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 flex-wrap';

    const modelSelect = document.createElement('select');
    modelSelect.className = 'select text-sm';
    modelSelect.setAttribute('data-test-model', ch.name);
    (ch.models || []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });

    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = 'btn btn-ghost';
    testBtn.textContent = '测试';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-ghost';
    editBtn.textContent = '编辑';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-ghost';
    delBtn.textContent = '删除';

    actions.append(modelSelect, testBtn, editBtn, delBtn);
    header.append(toggle, actions);
    card.appendChild(header);

    const detail = document.createElement('div');
    detail.className = 'mt-2 text-sm muted space-y-1';
    detail.setAttribute('data-body', ch.name);
    detail.style.display = 'none';
    detail.innerHTML = `
        <div>类型：${ch.type}</div>
        <div>API URL：${ch.apiUrl || '-'}</div>
        <div>Models：${(ch.models || []).join(', ') || '-'}</div>
    `;
    card.appendChild(detail);

    const editor = buildInlineEditor(card, ch, detail);
    card.appendChild(editor);

    toggle.addEventListener('click', () => {
      const open = detail.style.display === 'none';
      detail.style.display = open ? '' : 'none';
      card.dataset.detailOpen = open ? '1' : '0';
    });

    testBtn.addEventListener('click', () => testChannel(ch.name));

    delBtn.addEventListener('click', () => {
      const target = card.dataset.originalName || ch.name;
      chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'activeModel'], (items) => {
        const list = Array.isArray(items.channels) ? items.channels : [];
        const filtered = list.filter(c => c.name !== target);
        const next = { channels: filtered };
        if (items.defaultModel && items.defaultModel.channel === target) next.defaultModel = null;
        if (items.translateModel && items.translateModel.channel === target) next.translateModel = null;
        if (items.activeModel && items.activeModel.channel === target) next.activeModel = null;
        chrome.storage.sync.set(next, () => loadAll());
      });
    });

    editBtn.addEventListener('click', () => {
      closeOtherEditors();
      chrome.storage.sync.get(['channels'], (items) => {
        const list = Array.isArray(items.channels) ? items.channels : [];
        const latest = list.find(c => c.name === ch.name) || ch;
        const wasOpen = detail.style.display !== 'none';
        card.dataset.detailOpen = wasOpen ? '1' : '0';
        detail.style.display = 'none';
        editor._applyData(latest);
        editor._clearStatus();
        editor.style.display = '';
      });
    });

    channelsListEl.appendChild(card);
  });
}


function renderModelSelects(channels, defaultModel, translateModel) {
  const pairs = [];
  channels.forEach(ch => (ch.models || []).forEach(m => pairs.push({ channel: ch.name, model: m })));
  const toOption = (p) => `<option value="${p.channel}|${p.model}">${p.model} (${p.channel})</option>`;
  const html = pairs.map(toOption).join('');
  defaultModelSelect.innerHTML = `<option value="">（未设置）</option>` + html;
  translateModelSelect.innerHTML = `<option value="">（未设置）</option>` + html;

  defaultModelSelect.value = joinPair(defaultModel) || '';
  translateModelSelect.value = joinPair(translateModel) || '';
}

function loadAll() {
  chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'actionKey', 'hoverKey', 'selectKey', 'translateTargetLang', 'displayMode', 'wrapperStyle'], (items) => {
    const channels = Array.isArray(items.channels) ? items.channels : [];
    renderChannels(channels);
    renderModelSelects(channels, items.defaultModel || null, items.translateModel || null);
    const ak = items.actionKey || items.hoverKey || items.selectKey;
    if (ak && actionKeyInput) actionKeyInput.value = ak;
    if (items.hoverKey && !ak && actionKeyInput) actionKeyInput.value = items.hoverKey;
    if (items.translateTargetLang) translateTargetLangInput.value = items.translateTargetLang;
    if (items.displayMode) displayModeSelect.value = items.displayMode;
    if (wrapperStyleInput) wrapperStyleInput.value = items.wrapperStyle || 'background-image: linear-gradient(to right, rgba(71, 71, 71, 0.5) 30%, rgba(255, 255, 255, 0) 0%);\nbackground-position: bottom;\nbackground-size: 5px 1px;\nbackground-repeat: repeat-x;\npadding-bottom: 3px;\nfont-family: inherit;';
  });
}

// 添加渠道
function addChannel() {
  const type = channelTypeEl.value;
  const name = (channelNameEl.value || '').trim();
  let apiUrl = withDefaultApiUrl(type, apiUrlEl.value);
  const apiKey = (apiKeyEl.value || '').trim();
  const models = splitModels(modelsEl.value);

  if (!name) { channelStatusEl.textContent = '名称不能为空'; return; }
  if (!models.length) { channelStatusEl.textContent = '至少填写一个模型'; return; }
  if (type === 'openai-compatible' && !apiUrl) { channelStatusEl.textContent = '兼容类型需要填写 API URL'; return; }

  chrome.storage.sync.get(['channels'], (items) => {
    const list = Array.isArray(items.channels) ? items.channels : [];
    if (list.some(c => c.name === name)) { channelStatusEl.textContent = '渠道名称已存在'; return; }
    const next = [...list, { name, type, apiUrl, apiKey, models }];
    chrome.storage.sync.set({ channels: next }, () => {
      channelStatusEl.textContent = '已添加';
      setTimeout(() => channelStatusEl.textContent = '', 1200);
      channelNameEl.value = '';
      apiUrlEl.value = '';
      apiKeyEl.value = '';
      modelsEl.value = '';
      loadAll();
    });
  });
}

// 保存默认/翻译模型
function saveGlobal() {
  const defaultPair = parsePair(defaultModelSelect.value);
  const translatePair = parsePair(translateModelSelect.value);
  chrome.storage.sync.set({ defaultModel: defaultPair, translateModel: translatePair }, () => {
    globalStatusEl.textContent = '全局设置已保存';
    setTimeout(() => globalStatusEl.textContent = '', 1200);
  });
}

// 保存基础设置
function saveOptions() {
  const actionKey = (actionKeyInput && actionKeyInput.value || '').trim() || 'Alt';
  const translateTargetLang = (translateTargetLangInput.value || '').trim() || 'zh-CN';
  const displayMode = displayModeSelect.value || 'insert';
  const wrapperStyle = (wrapperStyleInput && wrapperStyleInput.value || '').trim();
  chrome.storage.sync.set({ actionKey, hoverKey: actionKey, selectKey: actionKey, translateTargetLang, displayMode, wrapperStyle }, () => {
    statusEl.textContent = '设置已保存';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // 初始化 Tabs
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    assistant: document.getElementById('panel-assistant'),
    channels: document.getElementById('panel-channels'),
    models: document.getElementById('panel-models'),
    keys: document.getElementById('panel-keys'),
    others: document.getElementById('panel-others'),
    about: document.getElementById('panel-about')
  };
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('tab-active'));
    btn.classList.add('tab-active');
    Object.values(panels).forEach(p => p.classList.remove('active'));
    const key = btn.getAttribute('data-tab');
    panels[key]?.classList.add('active');
  }));

  // 添加渠道卡片收起/展开
  const toggleAdd = document.getElementById('toggleAddCard');
  const collapseAdd = document.getElementById('collapseAddCard');
  const addCard = document.getElementById('addCard');
  if (toggleAdd) toggleAdd.addEventListener('click', () => { addCard.style.display = addCard.style.display === 'none' ? '' : 'none'; });
  if (collapseAdd) collapseAdd.addEventListener('click', () => { addCard.style.display = 'none'; });

  // 关于：版本
  const about = document.getElementById('about-version');
  try {
    const mf = chrome.runtime.getManifest();
    if (about && mf && mf.version) about.textContent = `版本：${mf.version}`;
  } catch {}

  // 其余初始化
  loadAll();
  loadAssistantModels();
});

addChannelBtn.addEventListener('click', addChannel);
saveGlobalBtn.addEventListener('click', saveGlobal);
saveButton.addEventListener('click', saveOptions);

// 编辑渠道逻辑

// Prompt 模板编辑
const tplTranslateEl = document.getElementById('tplTranslate');
const tplSummarizeEl = document.getElementById('tplSummarize');
const tplRewriteEl = document.getElementById('tplRewrite');
const tplPolishEl = document.getElementById('tplPolish');
const saveTemplatesBtn = document.getElementById('saveTemplatesBtn');
const resetTemplatesBtn = document.getElementById('resetTemplatesBtn');
const tplStatusEl = document.getElementById('tplStatus');

const DEFAULT_TEMPLATES = {
  translate: '请将以下内容高质量翻译为{{targetLang}}，只返回译文，不要添加多余说明：\n\n{{text}}',
  summarize: '请用{{targetLang}}对以下内容进行简洁准确的要点总结，只返回总结，不要添加多余说明：\n\n{{text}}',
  rewrite: '请用{{targetLang}}改写以下内容，使其表达清晰准确且保持原意：\n\n{{text}}',
  polish: '请用{{targetLang}}润色以下内容，使其更加自然流畅并提升可读性：\n\n{{text}}'
};

function loadTemplates() {
  chrome.storage.sync.get(['promptTemplates'], (items) => {
    const t = items.promptTemplates || {};
    if (tplTranslateEl) tplTranslateEl.value = t.translate || DEFAULT_TEMPLATES.translate;
    if (tplSummarizeEl) tplSummarizeEl.value = t.summarize || DEFAULT_TEMPLATES.summarize;
    if (tplRewriteEl) tplRewriteEl.value = t.rewrite || DEFAULT_TEMPLATES.rewrite;
    if (tplPolishEl) tplPolishEl.value = t.polish || DEFAULT_TEMPLATES.polish;
  });
}

function saveTemplates() {
  const promptTemplates = {
    translate: tplTranslateEl ? tplTranslateEl.value : DEFAULT_TEMPLATES.translate,
    summarize: tplSummarizeEl ? tplSummarizeEl.value : DEFAULT_TEMPLATES.summarize,
    rewrite: tplRewriteEl ? tplRewriteEl.value : DEFAULT_TEMPLATES.rewrite,
    polish: tplPolishEl ? tplPolishEl.value : DEFAULT_TEMPLATES.polish
  };
  chrome.storage.sync.set({ promptTemplates }, () => {
    if (tplStatusEl) {
      tplStatusEl.textContent = '模板已保存';
      setTimeout(() => tplStatusEl.textContent = '', 1500);
    }
  });
}

function resetTemplates() {
  if (tplTranslateEl) tplTranslateEl.value = DEFAULT_TEMPLATES.translate;
  if (tplSummarizeEl) tplSummarizeEl.value = DEFAULT_TEMPLATES.summarize;
  if (tplRewriteEl) tplRewriteEl.value = DEFAULT_TEMPLATES.rewrite;
  if (tplPolishEl) tplPolishEl.value = DEFAULT_TEMPLATES.polish;
  saveTemplates();
}

if (saveTemplatesBtn) saveTemplatesBtn.addEventListener('click', saveTemplates);
if (resetTemplatesBtn) resetTemplatesBtn.addEventListener('click', resetTemplates);
document.addEventListener('DOMContentLoaded', loadTemplates);

// 测试渠道有效性
function testChannel(name) {
  if (!name) return;
  channelStatusEl.textContent = `正在测试: ${name} …`;
  const sel = (typeof channelsListEl !== 'undefined' && channelsListEl) ? channelsListEl.querySelector(`select[data-test-model="${name}"]`) : null;
  const model = sel ? sel.value : undefined;
  chrome.runtime.sendMessage({ action: 'testChannel', channel: name, model }, (resp) => {
    if (!resp) { channelStatusEl.textContent = '测试失败：无响应'; return; }
    if (resp.ok) {
      channelStatusEl.textContent = `测试成功（返回片段）：${(resp.sample || '').slice(0, 60)}`;
    } else {
      channelStatusEl.textContent = `测试失败：${resp.error || '未知错误'}`;
    }
    setTimeout(() => channelStatusEl.textContent = '', 3000);
  });
}

// 助手页：与全局助手一致（流式输出）
const assistantInput = document.getElementById('assistant-input');
const assistantModel = document.getElementById('assistant-model');
const assistantTask = document.getElementById('assistant-task');
const assistantRun = document.getElementById('assistant-run');
const assistantResult = document.getElementById('assistant-result');
let assistantPort = null;

function renderAssistantModels(channels, active, fallback) {
  const pairs = [];
  channels.forEach(ch => (ch.models || []).forEach(m => pairs.push({ channel: ch.name, model: m })));
  assistantModel.innerHTML = pairs.map(p => `<option value="${p.channel}|${p.model}">${p.model} (${p.channel})</option>`).join('');
  const prefer = joinPair(active) || joinPair(fallback);
  if (prefer) assistantModel.value = prefer;
}

function loadAssistantModels() {
  if (!assistantModel) return;
  chrome.storage.sync.get(['channels', 'defaultModel', 'activeModel'], (items) => {
    const channels = Array.isArray(items.channels) ? items.channels : [];
    renderAssistantModels(channels, items.activeModel || null, items.defaultModel || null);
  });
}

function startAssistantStream() {
  if (!assistantInput) return;
  const text = assistantInput.value.trim(); if (!text) return;
  if (assistantPort) { try { assistantPort.disconnect(); } catch {} assistantPort = null; }
  assistantResult.textContent = '';
  const pair = parsePair(assistantModel.value);
  const task = (assistantTask && assistantTask.value) || 'translate';
  const msg = { type:'start', task, text };
  if (pair) Object.assign(msg, { channel: pair.channel, model: pair.model });
  const port = chrome.runtime.connect({ name: 'ai-stream' });
  assistantPort = port;
  port.onMessage.addListener((m) => {
    if (m.type === 'delta') assistantResult.textContent += m.text;
    else if (m.type === 'error') assistantResult.textContent += `\n[错误] ${m.error}`;
  });
  try { port.onDisconnect.addListener(() => { try { const err = chrome.runtime.lastError; if (err) { assistantResult.textContent += `\n[错误] ${err.message}`; } } catch {} }); } catch {}
  port.postMessage(msg);
}

if (assistantRun) assistantRun.addEventListener('click', startAssistantStream);
document.addEventListener('DOMContentLoaded', loadAssistantModels);
if (assistantModel) assistantModel.addEventListener('change', () => { if (assistantInput && assistantInput.value.trim()) startAssistantStream(); });
if (assistantTask) assistantTask.addEventListener('change', () => { if (assistantInput && assistantInput.value.trim()) startAssistantStream(); });
if (translateTargetLangInput) translateTargetLangInput.addEventListener('change', () => { if (assistantInput && assistantInput.value.trim()) startAssistantStream(); });

// 关于：导入导出
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

const STORAGE_KEYS = ['channels','defaultModel','translateModel','activeModel','actionKey','hoverKey','selectKey','translateTargetLang','displayMode','wrapperStyle','promptTemplates','autoPasteGlobalAssistant'];

function exportSettings() {
  chrome.storage.sync.get(STORAGE_KEYS, (items) => {
    const payload = JSON.stringify(items, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'floatingcopilot-settings.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function importSettingsFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || '{}'));
      const toSet = {};
      STORAGE_KEYS.forEach(k => { if (k in data) toSet[k] = data[k]; });
      chrome.storage.sync.set(toSet, () => { loadAll(); loadAssistantModels(); });
    } catch (e) {
      alert('导入失败：JSON 解析错误');
    }
  };
  reader.readAsText(file);
}

if (exportBtn) exportBtn.addEventListener('click', exportSettings);
if (importBtn) importBtn.addEventListener('click', () => importFile && importFile.click());
if (importFile) importFile.addEventListener('change', () => { const f = importFile.files && importFile.files[0]; if (f) importSettingsFromFile(f); });

// 全局助手：自动粘贴剪贴板
const autoPasteGlobal = document.getElementById('autoPasteGlobal');
function loadAutoPaste() {
  if (!autoPasteGlobal) return;
  chrome.storage.sync.get(['autoPasteGlobalAssistant'], (items) => {
    autoPasteGlobal.checked = !!items.autoPasteGlobalAssistant;
  });
  autoPasteGlobal.addEventListener('change', () => {
    chrome.storage.sync.set({ autoPasteGlobalAssistant: !!autoPasteGlobal.checked });
  });
}

document.addEventListener('DOMContentLoaded', loadAutoPaste);

