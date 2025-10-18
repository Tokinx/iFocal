// 统一的 DOM 插入与换行策略（供内容脚本复用）

function needsLineBreak(tag: string) {
  return ['p', 'div', 'section', 'article', 'li', 'td', 'a',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
}

function shouldInsertBreakFromSource(text: string): boolean {
  const spaces = (text.match(/ /g) || []).length;
  return spaces > 3;
}

export function updateBreakForTranslated(blockEl: HTMLElement, source: string) {
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
        if (exists.parentElement !== wrapper || wrapper.firstChild !== exists) {
          try { wrapper.insertBefore(exists, wrapper.firstChild || null); } catch {}
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
      try { wrapper.insertBefore(br, wrapper.firstChild || null); } catch { blockEl.appendChild(br); }
    } else if (blockEl.firstChild) {
      blockEl.insertBefore(br, blockEl.firstChild);
    } else {
      blockEl.appendChild(br);
    }
  } else if (exists) {
    exists.remove();
  }
}

export function createWrapper(id: string, targetLang: string, wrapperStyle?: string): HTMLElement {
  const wrapper = document.createElement('font');
  wrapper.className = 'notranslate ifocal-target-wrapper';
  wrapper.setAttribute('data-tx-id', id);
  try { wrapper.setAttribute('data-tx-done', '0'); } catch {}
  if (targetLang) wrapper.setAttribute('lang', targetLang);
  if (wrapperStyle) try { wrapper.setAttribute('style', wrapperStyle); } catch {}
  const spin = document.createElement('div');
  spin.className = 'ifocal-loading';
  wrapper.appendChild(spin);
  return wrapper as unknown as HTMLElement;
}

export function applyWrapperResult(wrapper: HTMLElement, text: string, targetLang?: string, wrapperStyle?: string, sourceText?: string) {
  try {
    if (targetLang) wrapper.setAttribute('lang', targetLang);
    if (wrapperStyle) wrapper.setAttribute('style', wrapperStyle);
    const rtl = targetLang && /^(ar|he|fa|ur|yi)(-|$)/i.test(targetLang);
    if (rtl) wrapper.setAttribute('dir', 'rtl'); else wrapper.removeAttribute('dir');
    wrapper.innerHTML = '';
    const inner = document.createElement('font');
    inner.textContent = text;
    wrapper.appendChild(inner);
    try { wrapper.setAttribute('data-tx-done', '1'); } catch {}
    if (sourceText) {
      const block = wrapper.closest('p,div,section,article,li,td,a,h1,h2,h3,h4,h5,h6') as HTMLElement | null;
      if (block) updateBreakForTranslated(block, sourceText);
      // C) aria-busy 优化：若该块下不存在未完成的 wrapper，则移除 busy
      try {
        if (block) {
          const pending = block.querySelector('font.ifocal-target-wrapper[data-tx-done="0"]');
          block.setAttribute('aria-busy', pending ? 'true' : 'false');
        }
      } catch {}
    }
  } catch {}
}
