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

export function createWrapper(id: string, targetLang: string): HTMLElement {
  const wrapper = document.createElement('font');
  wrapper.className = 'notranslate ifocal-target-wrapper';
  wrapper.setAttribute('data-tx-id', id);
  try { wrapper.setAttribute('data-tx-done', '0'); } catch {}
  if (targetLang) wrapper.setAttribute('lang', targetLang);
  // 初始显示加载动效
  const spin = document.createElement('div');
  spin.className = 'ifocal-loading';
  wrapper.appendChild(spin);
  return wrapper as unknown as HTMLElement;
}

export function applyWrapperResult(wrapper: HTMLElement, text: string, targetLang?: string, _wrapperStyle?: string, sourceText?: string) {
  try {
    if (targetLang) wrapper.setAttribute('lang', targetLang);
    const rtl = targetLang && /^(ar|he|fa|ur|yi)(-|$)/i.test(targetLang);
    if (rtl) wrapper.setAttribute('dir', 'rtl'); else wrapper.removeAttribute('dir');

    // 清空加载占位
    wrapper.innerHTML = '';

    // 计算是否需要换行
    const block = wrapper.closest('p,div,section,article,li,td,a,h1,h2,h3,h4,h5,h6') as HTMLElement | null;
    let needBr = false;
    if (block && sourceText) {
      // 与 updateBreakForTranslated 保持一致的判定
      const tag = (block.tagName || 'div').toLowerCase();
      needBr = needsLineBreak(tag) && shouldInsertBreakFromSource(sourceText);
    }

    // A) 按需插入分隔符（换行或空格）
    if (needBr) {
      // 与原策略一致：优先让 updateBreakForTranslated 维护 <br>
      updateBreakForTranslated(block!, sourceText!);
    } else {
      // 无需换行：插入与原文分隔的空格占位
      const spacer = document.createElement('font');
      spacer.className = 'notranslate';
      spacer.innerHTML = '&nbsp;&nbsp;';
      wrapper.appendChild(spacer);
    }

    // B) 译文结构：inline-wrapper + inner
    const styleName = (wrapper.getAttribute('data-tx-style') || '').trim() || 'ifocal-target-style-dotted';
    const inlineWrapper = document.createElement('font');
    inlineWrapper.className = `notranslate ifocal-target-inline-wrapper ${styleName}`.trim();
    const inner = document.createElement('font');
    inner.className = 'notranslate ifocal-target-inner';
    inner.textContent = text;
    inlineWrapper.appendChild(inner);
    wrapper.appendChild(inlineWrapper);

    // 状态标记与 aria-busy 优化
    try { wrapper.setAttribute('data-tx-done', '1'); } catch {}
    if (block && sourceText) {
      // C) aria-busy 优化：若该块下不存在未完成的 wrapper，则移除 busy
      try {
        const pending = block.querySelector('font.ifocal-target-wrapper[data-tx-done="0"]');
        block.setAttribute('aria-busy', pending ? 'true' : 'false');
      } catch {}
    }
  } catch {}
}
