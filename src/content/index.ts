console.log('[FloatingCopilot] content script ready');

document.addEventListener('selectionchange', () => {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';
  if (text) {
    chrome.runtime.sendMessage({ source: 'floating-copilot', type: 'selection', text });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'get-page-content') {
    const title = document.title || 'Current page';
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    const text = article?.textContent || main?.textContent || document.body?.innerText || '';
    sendResponse({ title, excerpt: text.slice(0, 2000) });
    return true;
  }
});
