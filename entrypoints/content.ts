import { fetchWord, escapeQuotes } from '@/lib/api';
import { isGetWordItem, isCtrlItem, isMiniModeItem, lastSelectedWordItem, themeItem, type ThemeMode } from '@/lib/storage';
import {
  isEnglishChar,
  isKoreanCharCode,
  hasTooManyKorean,
  hasTooManyChinese,
  countSpaces,
  extractEnglish,
} from '@/lib/text-utils';
import type { WordLookupResponse, LookupMessage, ResizeMessage, LookupReadyMessage } from '@/lib/types';
import { initHighlight } from '@/lib/highlight';

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  return mode === 'system' ? getSystemTheme() : mode;
}

/** 悬浮球边框色：跟随扩展主题 accent */
function miniBorderColor(mode: ThemeMode): string {
  return resolveTheme(mode) === 'dark' ? '#5ab0ff' : '#4a9eff';
}

export default defineContentScript({
  matches: ['<all_urls>'],
  async main(ctx) {
    // === 1. CSS Injection ===
    const style = document.createElement('style');
    style.textContent = `
      .langeasy-mini-icon {
        position: absolute;
        z-index: 999999;
        box-sizing: border-box;
        background: transparent;
        border: 1px solid var(--langeasy-mini-border, #5ab0ff);
        border-radius: 50%;
        width: 36px;
        height: 36px;
        padding: 0;
        box-shadow: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        animation: langeasyFadeIn 0.2s ease forwards;
        overflow: hidden;
      }
      .langeasy-mini-icon:hover {
        opacity: 0.9;
      }
      .langeasy-mini-icon img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: block;
      }
      @keyframes langeasyFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      [data-langeasy-highlight] {
        cursor: pointer;
      }
      [data-langeasy-highlight]:hover {
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    `;
    document.head.appendChild(style);

    function applyMiniTheme(mode: ThemeMode) {
      document.documentElement.style.setProperty('--langeasy-mini-border', miniBorderColor(mode));
    }

    // === 2. State Variables ===
    let mouseOverPopup = false;
    let currentWrapper: HTMLDivElement | null = null;
    const wrapperArray: HTMLDivElement[] = [];
    let lastInterpret = '';
    let pageX = 0, pageY = 0, screenX = 0, screenY = 0;
    let last_time = 0;
    let lastStartContainer: Node | null = null;
    let lastStartOffset = 0;
    let lastSelectedText: string | null = null;
    let pendingLookup: LookupMessage | null = null;
    let hoverOpenTimer: ReturnType<typeof setTimeout> | undefined;
    let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined;
    let lastHoverLemma: string | null = null;

    // === 3. Settings Cache (defaults match storage fallbacks) ===
    let isGetWord = true;
    let isCtrl = true;
    let isMiniMode = false;

    function getOption(key: string): boolean {
      switch (key) {
        case 'english_only': return true;
        case 'ctrl_only': return isCtrl;
        case 'dict_disable': return !isGetWord;
        case 'mini_mode': return isMiniMode;
        default: return false;
      }
    }

    // === 4. Popup Management ===

    function cleanWrappers(): boolean {
      mouseOverPopup = false;
      pendingLookup = null;
      if (currentWrapper) {
        while (wrapperArray.length) {
          document.body.removeChild(wrapperArray.pop()!);
        }
        currentWrapper = null;
        return true;
      }
      return false;
    }

    function deliverPendingLookup(iframeEl: HTMLIFrameElement) {
      if (!pendingLookup || !iframeEl.contentWindow) return;
      iframeEl.contentWindow.postMessage(pendingLookup, '*');
    }

    function createIframe(word: string, data: WordLookupResponse | null, pX: number, pY: number) {
      const innerW = window.innerWidth;
      const innerH = window.innerHeight;
      let left = 0;
      let top = 0;

      const wrapper = document.createElement('div');
      const iframeSrc = browser.runtime.getURL('/lookup.html');
      const iframe = document.createElement('iframe');
      iframe.setAttribute('src', iframeSrc);
      iframe.id = 'langeasyLexisIframe';
      iframe.setAttribute('scrolling', 'no');
      iframe.style.cssText = [
        'border: none',
        'display: block',
        'background: transparent',
        'width: 320px',
        'max-width: min(400px, 90vw)',
        'height: 0',
        'overflow: hidden',
        'vertical-align: top',
      ].join(';');
      wrapper.id = 'yddWrapper';
      wrapper.style.position = 'absolute';
      wrapper.style.zIndex = '99999';
      wrapper.style.overflow = 'visible';

      left = pX + 300 < innerW ? pX : pX - 300 - 20;
      wrapper.style.left = left + 'px';
      if (left + 300 > innerW) {
        left -= (left + 300 - innerW);
        wrapper.style.left = left + 'px';
      }

      top = pY + 150 + 20 < innerH ? pY : pY - 150 - 20;
      wrapper.style.top = (top + 10) + 'px';

      wrapper.onmouseover = () => { mouseOverPopup = true; };
      wrapper.onmouseout = () => { mouseOverPopup = false; };

      // 等 iframe 内 React 发出 lookup-ready 再投递，避免 onload 时 listener 尚未注册导致空白弹窗
      pendingLookup = { type: 'lookup', word, data };

      document.body.style.position = 'static';
      wrapper.appendChild(iframe);
      document.body.appendChild(wrapper);

      wrapperArray.push(wrapper);

      const wrapperEl = document.getElementById('yddWrapper');
      if (wrapperEl && top + 10 + wrapperEl.clientHeight < pY) {
        wrapper.style.top = (pY - wrapperEl.clientHeight) + 'px';
      }

      if (currentWrapper &&
          currentWrapper.style.top === wrapper.style.top &&
          currentWrapper.style.left === wrapper.style.left) {
        pendingLookup = null;
        document.body.removeChild(wrapper);
        wrapperArray.pop();
      } else {
        last_time = Math.round(Date.now());
        currentWrapper = wrapper;
      }
    }

    function showPopup(word: string, data: WordLookupResponse | null, pX: number, pY: number) {
      cleanWrappers();
      createIframe(word, data, pX, pY);
    }

    function handleResponse(word: string, response: WordLookupResponse, pX: number, pY: number) {
      if (response.wordlist && response.wordlist.length > 0) {
        lastInterpret = escapeQuotes(response.wordlist[0].interpret);
        showPopup(word, response, pX, pY);
      } else {
        showPopup(word, null, pX, pY);
      }
    }

    async function queryWord(word: string, pX: number, pY: number) {
      removeMiniIcon();
      try {
        const response = await fetchWord(word);
        if (response) {
          handleResponse(word, response, pX, pY);
        }
      } catch (e) {
        console.log('[bbdc] queryWord error:', e);
      }
    }

    function removeMiniIcon() {
      const icon = document.getElementById('langeasyMiniIcon');
      if (icon) {
        icon.style.display = 'none';
        ctx.setTimeout(() => {
          if (icon.parentNode) {
            icon.parentNode.removeChild(icon);
          }
        }, 0);
      }
    }

    function createMiniIcon(text: string, pX: number, pY: number) {
      removeMiniIcon();
      const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      const innerW = window.innerWidth;
      let left = window.scrollX + rect.right + 5;
      let top = window.scrollY + rect.top - 30;
      if (left + 24 > window.scrollX + innerW) {
        left = window.scrollX + innerW - 30;
      }
      if (top < window.scrollY + 5) {
        top = window.scrollY + 5;
      }

      const icon = document.createElement('div');
      icon.id = 'langeasyMiniIcon';
      icon.className = 'langeasy-mini-icon';
      const imgSrc = browser.runtime.getURL('/images/icon_128.png');
      icon.innerHTML = `<img src="${imgSrc}" alt="翻译">`;
      icon.style.left = left + 'px';
      icon.style.top = top + 'px';
      icon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        icon.style.display = 'none';
        queryWord(text, pX, pY);
        ctx.setTimeout(() => removeMiniIcon(), 0);
      });
      document.body.appendChild(icon);
    }

    // === 5. Event Listeners (注册在前，确保立即可用) ===

    // 高亮词悬浮 → 翻译弹窗（短延迟，避免扫过时误触）
    ctx.addEventListener(document, 'mouseover', (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;

      if (target.closest('#yddWrapper')) {
        if (hoverCloseTimer !== undefined) {
          clearTimeout(hoverCloseTimer);
          hoverCloseTimer = undefined;
        }
        return;
      }

      const hl = target.closest('[data-langeasy-highlight]') as HTMLElement | null;
      if (!hl) return;

      if (hoverCloseTimer !== undefined) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = undefined;
      }

      const lemma = (hl.dataset.langeasyLemma || hl.textContent || '').trim();
      if (!lemma) return;
      if (lemma === lastHoverLemma && currentWrapper) return;

      if (hoverOpenTimer !== undefined) clearTimeout(hoverOpenTimer);
      hoverOpenTimer = ctx.setTimeout(() => {
        hoverOpenTimer = undefined;
        lastHoverLemma = lemma;
        const rect = hl.getBoundingClientRect();
        const x = window.scrollX + rect.left;
        const y = window.scrollY + rect.bottom + 4;
        queryWord(lemma, x, y);
      }, 280);
    }, { capture: true });

    ctx.addEventListener(document, 'mouseout', (e: MouseEvent) => {
      const target = e.target as Element | null;
      const related = e.relatedTarget as Element | null;
      if (!target || typeof target.closest !== 'function') return;

      const leavingHl = target.closest('[data-langeasy-highlight]');
      const leavingPopup = target.closest('#yddWrapper');
      if (!leavingHl && !leavingPopup) return;

      const enteringHl = related && typeof related.closest === 'function'
        ? related.closest('[data-langeasy-highlight]')
        : null;
      const enteringPopup = related && typeof related.closest === 'function'
        ? related.closest('#yddWrapper')
        : null;
      if (enteringHl || enteringPopup) return;

      if (hoverOpenTimer !== undefined) {
        clearTimeout(hoverOpenTimer);
        hoverOpenTimer = undefined;
      }

      if (hoverCloseTimer !== undefined) clearTimeout(hoverCloseTimer);
      hoverCloseTimer = ctx.setTimeout(() => {
        hoverCloseTimer = undefined;
        if (!mouseOverPopup) {
          lastHoverLemma = null;
          cleanWrappers();
        }
      }, 220);
    }, { capture: true });

    // mousemove (capture=true) - Ctrl+hover word lookup
    ctx.addEventListener(document, 'mousemove', async (e: MouseEvent) => {
      if (getOption('ctrl_only') && e.ctrlKey) {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
          const startOffset = range.startOffset;
          let endOffset = range.endOffset;

          if (lastStartContainer !== range.startContainer || lastStartOffset !== startOffset) {
            lastStartContainer = range.startContainer;
            lastStartOffset = startOffset;
            const expandedRange = range.cloneRange();
            let text = '';

            const startData = (range.startContainer as CharacterData).data;
            if (startData) {
              let so = startOffset;
              while (so >= 1) {
                expandedRange.setStart(range.startContainer, --so);
                text = expandedRange.toString();
                if (!isEnglishChar(text.charAt(0))) {
                  expandedRange.setStart(range.startContainer, so + 1);
                  break;
                }
              }
            }

            const endData = (range.endContainer as CharacterData).data;
            if (endData) {
              while (endOffset < (range.endContainer as CharacterData).data.length) {
                expandedRange.setEnd(range.endContainer, ++endOffset);
                text = expandedRange.toString();
                if (!isEnglishChar(text.charAt(text.length - 1))) {
                  expandedRange.setEnd(range.endContainer, endOffset - 1);
                  break;
                }
              }
            }

            const selectedText = expandedRange.toString();
            if (lastSelectedText !== selectedText) {
              lastSelectedText = selectedText;
              if (selectedText.length >= 1) {
                ctx.setTimeout(() => {
                  const sel = window.getSelection();
                  if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(expandedRange);
                    pageX = e.pageX;
                    pageY = e.pageY;
                    screenX = e.screenX;
                    screenY = e.screenY;
                    queryWord(selectedText, e.pageX, e.pageY);
                  }
                }, 100);
              }
            }
          }
        }
      }
    }, { capture: true });

    // click - close popup (mini icon 改由 mousedown 关闭，避免划词后的 click 立刻清掉图标)
    ctx.addEventListener(document, 'click', () => {
      const wrapper = document.getElementById('yddWrapper');
      if (wrapper) {
        if (Math.round(Date.now()) - last_time > 200) {
          wrapper.style.display = 'none';
        }
      }
    });

    // mousedown - dismiss mini icon on next interaction (not the selection's trailing click)
    ctx.addEventListener(document, 'mousedown', (e: MouseEvent) => {
      const target = e.target as Element;
      if (target && target.id !== 'langeasyMiniIcon' && !target.closest('#langeasyMiniIcon')) {
        removeMiniIcon();
      }
    });

    // mouseup - selection translation (core)
    ctx.addEventListener(document, 'mouseup', async (e: MouseEvent) => {
      if (mouseOverPopup) return;

      if (currentWrapper) {
        if (Math.round(Date.now()) - last_time < 500) return;
        while (wrapperArray.length) {
          document.body.removeChild(wrapperArray.pop()!);
        }
        currentWrapper = null;
      }

      if (getOption('dict_disable')) return;
      if (!(getOption('ctrl_only') || !e.ctrlKey)) return;

      let text = String(window.getSelection()).trim();
      if (!text) return;

      if (getOption('english_only') && hasTooManyKorean(text)) return;
      if (getOption('english_only') && [...text].filter(c => isKoreanCharCode(c.charCodeAt(0))).length > 0) return;
      if (getOption('english_only') && hasTooManyChinese(text)) return;
      if (text.length > 2000) return;

      const spaces = countSpaces(text);
      if ((!hasTooManyChinese(text) && spaces >= 3) ||
          (hasTooManyChinese(text) && text.length > 4) ||
          (hasTooManyKorean(text) && text.length > 4)) {
        pageX = e.pageX; pageY = e.pageY; screenX = e.screenX; screenY = e.screenY;
        return;
      }

      if (getOption('english_only')) {
        text = extractEnglish(text);
      }

      if (text) {
        cleanWrappers();
        // 存入选中单词，供 popup 自动查询
        lastSelectedWordItem.setValue(text);
        pageX = e.pageX; pageY = e.pageY; screenX = e.screenX; screenY = e.screenY;

        if (getOption('mini_mode')) {
          createMiniIcon(text, e.pageX, e.pageY);
        } else {
          queryWord(text, e.pageX, e.pageY);
        }
      }
    });

    // message - iframe height adjustment + lookup-ready handshake
    ctx.addEventListener(window, 'message', (e: MessageEvent) => {
      const data = e.data as ResizeMessage | LookupReadyMessage | undefined;
      if (data && data.type === 'lookup-ready') {
        const iframe = document.querySelector<HTMLIFrameElement>('#langeasyLexisIframe');
        if (iframe?.contentWindow && e.source === iframe.contentWindow) {
          deliverPendingLookup(iframe);
        }
        return;
      }
      if (data && data.type === 'resize') {
        const iframe = document.querySelector<HTMLIFrameElement>('#langeasyLexisIframe');
        if (iframe) {
          // 按内容自适应高度；仅当超出视口时封顶并允许内部极细滚动
          const maxH = Math.max(120, Math.floor(window.innerHeight * 0.75));
          const h = Math.max(1, Math.min(data.height, maxH));
          iframe.style.height = h + 'px';
          iframe.style.overflow = data.height > maxH ? 'auto' : 'hidden';
          iframe.setAttribute('scrolling', data.height > maxH ? 'yes' : 'no');
        }
      }
    });

    // === 6. 异步加载设置（不阻塞事件监听器） ===
    let cleanupHighlight: (() => void) | null = null;
    (async () => {
      // F5 刷新 / 页面加载时立即同步生词本（force=true；数量一致时跳过分页）
      browser.runtime.sendMessage({ type: 'sync-wordbook', force: true }).catch(() => {});
      try {
        isGetWord = await isGetWordItem.getValue();
        isCtrl = await isCtrlItem.getValue();
        isMiniMode = await isMiniModeItem.getValue();
        applyMiniTheme(await themeItem.getValue());
      } catch (e) {
        console.log('[bbdc] initSettings error:', e);
      }
      // 初始化生词高亮
      try {
        cleanupHighlight = await initHighlight();
      } catch (e) {
        console.log('[bbdc] initHighlight error:', e);
      }
    })();

    // Watch for setting changes
    const unwatchGetWord = isGetWordItem.watch((v) => { isGetWord = v; });
    const unwatchCtrl = isCtrlItem.watch((v) => { isCtrl = v; });
    const unwatchMiniMode = isMiniModeItem.watch((v) => { isMiniMode = v; });
    const unwatchTheme = themeItem.watch((mode) => { applyMiniTheme(mode); });
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = () => {
      themeItem.getValue().then((mode) => {
        if (mode === 'system') applyMiniTheme(mode);
      });
    };
    mediaQuery.addEventListener('change', onSystemThemeChange);

    ctx.onInvalidated(() => {
      unwatchGetWord();
      unwatchCtrl();
      unwatchMiniMode();
      unwatchTheme();
      mediaQuery.removeEventListener('change', onSystemThemeChange);
      document.documentElement.style.removeProperty('--langeasy-mini-border');
      if (hoverOpenTimer !== undefined) clearTimeout(hoverOpenTimer);
      if (hoverCloseTimer !== undefined) clearTimeout(hoverCloseTimer);
      if (cleanupHighlight) cleanupHighlight();
    });
  },
});
