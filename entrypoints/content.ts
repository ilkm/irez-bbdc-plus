import { fetchWord, escapeQuotes } from '@/lib/api';
import { isGetWordItem, isCtrlItem, isMiniModeItem, lastSelectedWordItem } from '@/lib/storage';
import {
  isEnglishChar,
  isKoreanCharCode,
  hasTooManyKorean,
  hasTooManyChinese,
  countSpaces,
  extractEnglish,
} from '@/lib/text-utils';
import type { WordLookupResponse, LookupMessage, ResizeMessage } from '@/lib/types';
import { initHighlight } from '@/lib/highlight';

export default defineContentScript({
  matches: ['<all_urls>'],
  async main(ctx) {
    // === 1. CSS Injection ===
    const style = document.createElement('style');
    style.textContent = `
      .langeasy-mini-icon {
        position: absolute;
        z-index: 999999;
        background: #0f0f16;
        border: 1px solid rgba(74, 158, 255, 0.25);
        border-radius: 10px;
        width: 32px;
        height: 32px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 10px rgba(74,158,255,0.2);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        animation: langeasyFadeIn 0.2s ease forwards;
      }
      .langeasy-mini-icon:hover {
        border-color: rgba(74, 158, 255, 0.5);
        box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 16px rgba(74,158,255,0.4);
      }
      .langeasy-mini-icon img {
        width: 22px;
        height: 22px;
      }
      @keyframes langeasyFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);

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
      if (currentWrapper) {
        while (wrapperArray.length) {
          document.body.removeChild(wrapperArray.pop()!);
        }
        currentWrapper = null;
        return true;
      }
      return false;
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
      iframe.style.border = 'none';
      wrapper.id = 'yddWrapper';
      wrapper.style.position = 'absolute';
      wrapper.style.zIndex = '99999';

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

      document.body.style.position = 'static';
      wrapper.appendChild(iframe);
      document.body.appendChild(wrapper);

      const iframeEl = document.querySelector<HTMLIFrameElement>('#langeasyLexisIframe');
      if (iframeEl) {
        iframeEl.onload = () => {
          const message: LookupMessage = { type: 'lookup', word, data };
          iframeEl.contentWindow?.postMessage(message, '*');
        };
      }

      wrapperArray.push(wrapper);

      const wrapperEl = document.getElementById('yddWrapper');
      if (wrapperEl && top + 10 + wrapperEl.clientHeight < pY) {
        wrapper.style.top = (pY - wrapperEl.clientHeight) + 'px';
      }

      if (currentWrapper &&
          currentWrapper.style.top === wrapper.style.top &&
          currentWrapper.style.left === wrapper.style.left) {
        document.body.removeChild(wrapper);
        wrapperArray.pop();
      } else {
        last_time = Math.round(Date.now());
        currentWrapper = wrapper;
      }
    }

    function showPopup(word: string, data: WordLookupResponse | null, pX: number, pY: number) {
      cleanWrappers();
      const selection = window.getSelection();
      if (selection && selection.type) {
        createIframe(word, data, pX, pY);
      }
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

    // click - close popup and mini icon
    ctx.addEventListener(document, 'click', (e: MouseEvent) => {
      const wrapper = document.getElementById('yddWrapper');
      if (wrapper) {
        if (Math.round(Date.now()) - last_time > 200) {
          wrapper.style.display = 'none';
        }
      }
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

    // message - iframe height adjustment
    ctx.addEventListener(window, 'message', (e: MessageEvent) => {
      const data = e.data as ResizeMessage | undefined;
      if (data && data.type === 'resize') {
        const iframe = document.querySelector<HTMLIFrameElement>('#langeasyLexisIframe');
        if (iframe) {
          iframe.style.height = data.height + 'px';
        }
      }
    });

    // === 6. 异步加载设置（不阻塞事件监听器） ===
    let cleanupHighlight: (() => void) | null = null;
    (async () => {
      try {
        isGetWord = await isGetWordItem.getValue();
        isCtrl = await isCtrlItem.getValue();
        isMiniMode = await isMiniModeItem.getValue();
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

    ctx.onInvalidated(() => {
      unwatchGetWord();
      unwatchCtrl();
      unwatchMiniMode();
      if (cleanupHighlight) cleanupHighlight();
    });
  },
});
