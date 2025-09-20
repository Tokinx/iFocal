// options/options.js（UTF-8）

// DOM 元素
const hoverKeyInput = document.getElementById('hoverKey');
const translateTargetLangInput = document.getElementById('translateTargetLang');
const displayModeSelect = document.getElementById('displayMode');
const saveButton = document.getElementById('save');
const statusEl = document.getElementById('status');

const channelTypeEl = document.getElementById('channelType');
const channelNameEl = document.getElementById('channelName');
const apiUrlEl = document.getElementById('apiUrl');
const apiKeyEl = document.getElementById('apiKey');
const modelsEl = document.getElementById('models');
const addChannelBtn = document.getElementById('addChannelBtn');
const channelStatusEl = document.getElementById('channelStatus');
const channelsTbody = document.getElementById('channelsTbody');

const defaultModelSelect = document.getElementById('defaultModelSelect');
const translateModelSelect = document.getElementById('translateModelSelect');
const saveGlobalBtn = document.getElementById('saveGlobalBtn');
const globalStatusEl = document.getElementById('globalStatus');

// 数据形态
// channels: Array<{ name, type, apiUrl, apiKey, models: string[] }>
// defaultModel: { channel, model }
// translateModel: { channel, model }

function splitModels(input) {
  return (input || '')
    .split(',')
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

function renderChannels(channels) {
  channelsTbody.innerHTML = '';
  channels.forEach(ch => {
    const tr = document.createElement('tr');
    const selectHtml = `<select data-test-model="${ch.name}">${(ch.models||[]).map(m=>`<option value="${m}">${m}</option>`).join('')}</select>`;
    tr.innerHTML = `
      <td style="padding:6px 4px;">${ch.name}</td>
      <td style="padding:6px 4px;">${ch.type}</td>
      <td style="padding:6px 4px;">${(ch.models || []).join(', ')}</td>
      <td style="padding:6px 4px;">${selectHtml}</td>
      <td style="padding:6px 4px;">
        <button data-test="${ch.name}">测试</button>
        <button data-edit="${ch.name}">编辑</button>
        <button data-del="${ch.name}">删除</button>
      </td>`;
    channelsTbody.appendChild(tr);
  });

  channelsTbody.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-del');
      chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel'], (items) => {
        const list = Array.isArray(items.channels) ? items.channels : [];
        const filtered = list.filter(c => c.name !== name);
        const next = { channels: filtered };
        // 清理默认/翻译模型引用
        if (items.defaultModel && items.defaultModel.channel === name) next.defaultModel = null;
        if (items.translateModel && items.translateModel.channel === name) next.translateModel = null;
        if (items.activeModel && items.activeModel.channel === name) next.activeModel = null;
        chrome.storage.sync.set(next, () => loadAll());
      });
    });
  });

  channelsTbody.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => startEdit(btn.getAttribute('data-edit')));
  });

  channelsTbody.querySelectorAll('button[data-test]').forEach(btn => {
    btn.addEventListener('click', () => testChannel(btn.getAttribute('data-test')));
  });
}

function renderModelSelects(channels, defaultModel, translateModel) {
  const pairs = [];
  channels.forEach(ch => (ch.models || []).forEach(m => pairs.push({ channel: ch.name, model: m })));
  const toOption = (p) => `<option value="${p.channel}|${p.model}">${p.channel} • ${p.model}</option>`;
  const html = pairs.map(toOption).join('');
  defaultModelSelect.innerHTML = `<option value="">（未设置）</option>` + html;
  translateModelSelect.innerHTML = `<option value="">（未设置）</option>` + html;

  defaultModelSelect.value = joinPair(defaultModel) || '';
  translateModelSelect.value = joinPair(translateModel) || '';
}

function loadAll() {
  chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'hoverKey', 'translateTargetLang', 'displayMode'], (items) => {
    const channels = Array.isArray(items.channels) ? items.channels : [];
    renderChannels(channels);
    renderModelSelects(channels, items.defaultModel || null, items.translateModel || null);
    if (items.hoverKey) hoverKeyInput.value = items.hoverKey;
    if (items.translateTargetLang) translateTargetLangInput.value = items.translateTargetLang;
    if (items.displayMode) displayModeSelect.value = items.displayMode;
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

// 保存基础设置（仅 hoverKey）
function saveOptions() {
  const hoverKey = (hoverKeyInput.value || '').trim() || 'Alt';
  const translateTargetLang = (translateTargetLangInput.value || '').trim() || '中文';
  const displayMode = displayModeSelect.value || 'insert';
  chrome.storage.sync.set({ hoverKey, translateTargetLang, displayMode }, () => {
    statusEl.textContent = '设置已保存';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

document.addEventListener('DOMContentLoaded', loadAll);
addChannelBtn.addEventListener('click', addChannel);
saveGlobalBtn.addEventListener('click', saveGlobal);
saveButton.addEventListener('click', saveOptions);

// 编辑渠道逻辑
const editContainer = document.getElementById('editContainer');
const editOriginalNameEl = document.getElementById('editOriginalName');
const editChannelTypeEl = document.getElementById('editChannelType');
const editChannelNameEl = document.getElementById('editChannelName');
const editApiUrlEl = document.getElementById('editApiUrl');
const editApiKeyEl = document.getElementById('editApiKey');
const editModelsEl = document.getElementById('editModels');
const saveEditBtn = document.getElementById('saveEditBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editStatusEl = document.getElementById('editStatus');

function startEdit(name) {
  chrome.storage.sync.get(['channels'], (items) => {
    const list = Array.isArray(items.channels) ? items.channels : [];
    const ch = list.find(x => x.name === name);
    if (!ch) return;
    editOriginalNameEl.value = ch.name;
    editChannelTypeEl.value = ch.type || 'openai';
    editChannelNameEl.value = ch.name;
    editApiUrlEl.value = ch.apiUrl || '';
    editModelsEl.value = (ch.models || []).join(', ');
    editApiKeyEl.value = '';
    editContainer.style.display = '';
  });
}

function saveEdit() {
  const original = (editOriginalNameEl.value || '').trim();
  const type = editChannelTypeEl.value;
  const name = (editChannelNameEl.value || '').trim();
  const apiUrl = withDefaultApiUrl(type, editApiUrlEl.value);
  const apiKeyMaybe = (editApiKeyEl.value || '').trim();
  const models = splitModels(editModelsEl.value);

  if (!name) { editStatusEl.textContent = '名称不能为空'; return; }
  if (!models.length) { editStatusEl.textContent = '至少填写一个模型'; return; }
  if (type === 'openai-compatible' && !apiUrl) { editStatusEl.textContent = '兼容类型需要填写 API URL'; return; }

  chrome.storage.sync.get(['channels', 'defaultModel', 'translateModel', 'activeModel'], (items) => {
    const list = Array.isArray(items.channels) ? items.channels : [];
    if (name !== original && list.some(c => c.name === name)) { editStatusEl.textContent = '渠道名称已存在'; return; }
    const idx = list.findIndex(c => c.name === original);
    if (idx < 0) { editStatusEl.textContent = '原渠道不存在'; return; }
    const updated = { ...list[idx], type, name, apiUrl, models };
    if (apiKeyMaybe) updated.apiKey = apiKeyMaybe; // 不填则保留原值
    const nextList = list.slice();
    nextList[idx] = updated;

    const next = { channels: nextList };
    // 同步更新模型引用中的 channel 名称
    ['defaultModel', 'translateModel', 'activeModel'].forEach(k => {
      const pair = items[k];
      if (pair && pair.channel === original) {
        next[k] = { channel: name, model: pair.model };
      }
    });

    chrome.storage.sync.set(next, () => {
      editStatusEl.textContent = '已保存';
      setTimeout(() => { editStatusEl.textContent = ''; editContainer.style.display = 'none'; }, 800);
      loadAll();
    });
  });
}

function cancelEdit() {
  editContainer.style.display = 'none';
}

saveEditBtn.addEventListener('click', saveEdit);
cancelEditBtn.addEventListener('click', cancelEdit);

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

// 测试渠道有效性（简单调用首个模型）
function testChannel(name) {
  if (!name) return;
  channelStatusEl.textContent = `正在测试: ${name} …`;
  const sel = channelsTbody.querySelector(`select[data-test-model="${name}"]`);
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
