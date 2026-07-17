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
  // Bunny Stream 等字幕在跨域 iframe（如 iframe.mediadelivery.net）内
  allFrames: true,
  async main(ctx) {
    const isTopFrame = window === window.top;

    // === 1. CSS Injection ===
    const isVideoFrame =
      location.hostname === 'videos.sproutvideo.com' ||
      location.hostname.endsWith('.sproutvideo.com') ||
      location.hostname === 'iframe.mediadelivery.net' ||
      location.hostname.endsWith('.mediadelivery.net');

    const style = document.createElement('style');
    style.textContent = isVideoFrame
      ? `
      /* 字幕：自定义标签只着色，不触碰播放器 span 布局 */
      bbdc-hl[data-langeasy-highlight],
      [data-langeasy-highlight] {
        cursor: pointer;
        pointer-events: auto !important;
      }
      #yddWrapper {
        display: none !important; /* 视频帧内禁止本地弹窗，一律走顶层 */
      }
    `
      : `
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
        background: none !important;
        background-color: transparent !important;
        pointer-events: auto !important;
      }
      [data-langeasy-highlight]:hover {
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      #yddWrapper {
        z-index: 2147483647 !important;
        position: fixed !important;
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
    let hoverOpenTimer: number | undefined;
    let hoverCloseTimer: number | undefined;
    let lastHoverLemma: string | null = null;
    /** 从视频 iframe 打开的弹窗：鼠标无法从 iframe 移入顶层弹窗，禁止 mouseout 自动关闭 */
    let popupFromVideoFrame = false;
    /** queryWord 异步完成前暂存，避免 showPopup→cleanWrappers 清掉标志 */
    let pendingPopupFromVideoFrame = false;

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
      popupFromVideoFrame = false;
      if (currentWrapper) {
        while (wrapperArray.length) {
          const w = wrapperArray.pop()!;
          w.parentNode?.removeChild(w);
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

    const POPUP_WIDTH = 320;
    const POPUP_MARGIN = 8;
    const POPUP_ESTIMATE_H = 180;

    /** 将弹窗矩形限制在视口内，避免贴边时溢出屏幕 */
    function clampPopupBox(left: number, top: number, width: number, height: number) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(Math.max(1, width), Math.max(1, vw - POPUP_MARGIN * 2));
      const h = Math.min(Math.max(1, height), Math.max(1, vh - POPUP_MARGIN * 2));
      const maxLeft = Math.max(POPUP_MARGIN, vw - w - POPUP_MARGIN);
      const maxTop = Math.max(POPUP_MARGIN, vh - h - POPUP_MARGIN);
      return {
        left: Math.min(Math.max(left, POPUP_MARGIN), maxLeft),
        top: Math.min(Math.max(top, POPUP_MARGIN), maxTop),
      };
    }

    /** 优先锚点右下；空间不足则翻到左侧/上方，最后再 clamp */
    function placePopupNear(pX: number, pY: number, width: number, height: number) {
      let left = pX;
      let top = pY + 10;
      if (left + width + POPUP_MARGIN > window.innerWidth) {
        left = pX - width - 12;
      }
      if (top + height + POPUP_MARGIN > window.innerHeight) {
        top = pY - height - 10;
      }
      return clampPopupBox(left, top, width, height);
    }

    function applyPopupPosition(el: HTMLElement, left: number, top: number) {
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    }

    /** 内容高度变化后重新贴边，保证始终落在视口内 */
    function repositionCurrentPopup() {
      const wrapper = currentWrapper ?? document.getElementById('yddWrapper');
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const width = Math.max(rect.width || POPUP_WIDTH, 1);
      const height = Math.max(rect.height || POPUP_ESTIMATE_H, 1);
      const { left, top } = clampPopupBox(rect.left, rect.top, width, height);
      applyPopupPosition(wrapper, left, top);
    }

    function createIframe(word: string, data: WordLookupResponse | null, pX: number, pY: number) {
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
        `width: ${POPUP_WIDTH}px`,
        'max-width: min(400px, 90vw)',
        'height: 0',
        'overflow: hidden',
        'vertical-align: top',
      ].join(';');
      wrapper.id = 'yddWrapper';
      // 始终 fixed + 最大 z-index，保证在页面（含视频控件）最上层
      wrapper.style.position = 'fixed';
      wrapper.style.zIndex = '2147483647';
      wrapper.style.overflow = 'visible';

      const placed = placePopupNear(pX, pY, POPUP_WIDTH, POPUP_ESTIMATE_H);
      applyPopupPosition(wrapper, placed.left, placed.top);

      wrapper.onmouseover = () => { mouseOverPopup = true; };
      wrapper.onmouseout = () => { mouseOverPopup = false; };

      // 等 iframe 内 React 发出 lookup-ready 再投递，避免 onload 时 listener 尚未注册导致空白弹窗
      pendingLookup = { type: 'lookup', word, data };

      document.body.style.position = 'static';
      wrapper.appendChild(iframe);
      // 挂到 html 上，避免被页面 stacking context 压住
      (document.documentElement || document.body).appendChild(wrapper);

      wrapperArray.push(wrapper);

      if (currentWrapper &&
          currentWrapper.style.top === wrapper.style.top &&
          currentWrapper.style.left === wrapper.style.left) {
        pendingLookup = null;
        wrapper.parentNode?.removeChild(wrapper);
        wrapperArray.pop();
      } else {
        last_time = Math.round(Date.now());
        currentWrapper = wrapper;
      }
    }

    function showPopup(word: string, data: WordLookupResponse | null, pX: number, pY: number) {
      const fromVideo = pendingPopupFromVideoFrame;
      pendingPopupFromVideoFrame = false;
      cleanWrappers();
      createIframe(word, data, pX, pY);
      if (fromVideo) {
        popupFromVideoFrame = true;
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
      const iconSize = 36;
      const margin = 5;
      let left = window.scrollX + rect.right + 5;
      let top = window.scrollY + rect.top - 30;
      const maxLeft = window.scrollX + window.innerWidth - iconSize - margin;
      const maxTop = window.scrollY + window.innerHeight - iconSize - margin;
      left = Math.min(Math.max(window.scrollX + margin, left), Math.max(window.scrollX + margin, maxLeft));
      top = Math.min(Math.max(window.scrollY + margin, top), Math.max(window.scrollY + margin, maxTop));

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
        // 视频跨域 iframe：经 background 转到顶层打开弹窗（postMessage 不可靠）
        if (isVideoFrame && !isTopFrame) {
          browser.runtime
            .sendMessage({
              type: 'langeasy-frame-lookup',
              word: lemma,
              frameUrl: location.href,
              rect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              },
            })
            .catch((err) => {
              console.log('[bbdc] frame lookup relay failed:', err);
              try {
                window.top?.postMessage(
                  {
                    type: 'langeasy-lookup-from-frame',
                    word: lemma,
                    rect: {
                      left: rect.left,
                      top: rect.top,
                      right: rect.right,
                      bottom: rect.bottom,
                    },
                  },
                  '*',
                );
              } catch {
                /* ignore */
              }
            });
          return;
        }
        queryWord(lemma, rect.left, rect.bottom + 4);
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

      if (isVideoFrame && !isTopFrame) {
        // 不转发 close：顶层弹窗无法从 iframe 移入，自动关闭会导致弹窗闪退
        return;
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

    // mousemove / mouseup 划词仅顶层；iframe（字幕）用高亮悬浮查词即可
    if (isTopFrame) {
      // mousemove (capture=true) - Ctrl+hover word lookup
      ctx.addEventListener(document, 'mousemove', async (e: MouseEvent) => {
        if (getOption('ctrl_only') && e.ctrlKey) {
          // 优先标准 caretPositionFromPoint，回退非标准 caretRangeFromPoint
          const doc = document as Document & {
            caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
            caretRangeFromPoint?: (x: number, y: number) => Range | null;
          };
          let startContainer: Node | null = null;
          let startOffset = 0;
          let endContainer: Node | null = null;
          let endOffset = 0;

          if (typeof doc.caretPositionFromPoint === 'function') {
            const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);
            if (pos?.offsetNode) {
              startContainer = pos.offsetNode;
              startOffset = pos.offset;
              endContainer = pos.offsetNode;
              endOffset = pos.offset;
            }
          } else if (typeof doc.caretRangeFromPoint === 'function') {
            const range = doc.caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
              startContainer = range.startContainer;
              startOffset = range.startOffset;
              endContainer = range.endContainer;
              endOffset = range.endOffset;
            }
          }

          if (startContainer && endContainer) {
            if (lastStartContainer !== startContainer || lastStartOffset !== startOffset) {
              lastStartContainer = startContainer;
              lastStartOffset = startOffset;
              const expandedRange = document.createRange();
              expandedRange.setStart(startContainer, startOffset);
              expandedRange.setEnd(endContainer, endOffset);
              let text = '';

              const startData = (startContainer as CharacterData).data;
              if (startData) {
                let so = startOffset;
                while (so >= 1) {
                  expandedRange.setStart(startContainer, --so);
                  text = expandedRange.toString();
                  if (!isEnglishChar(text.charAt(0))) {
                    expandedRange.setStart(startContainer, so + 1);
                    break;
                  }
                }
              }

              const endData = (endContainer as CharacterData).data;
              if (endData) {
                while (endOffset < (endContainer as CharacterData).data.length) {
                  expandedRange.setEnd(endContainer, ++endOffset);
                  text = expandedRange.toString();
                  if (!isEnglishChar(text.charAt(text.length - 1))) {
                    expandedRange.setEnd(endContainer, endOffset - 1);
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
                      queryWord(selectedText, e.clientX, e.clientY);
                    }
                  }, 100);
                }
              }
            }
          }
        }
      }, { capture: true });

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
            const w = wrapperArray.pop()!;
            w.parentNode?.removeChild(w);
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
            queryWord(text, e.clientX, e.clientY);
          }
        }
      });
    }

    // click - close popup（视频帧弹窗也靠点击关闭）
    ctx.addEventListener(document, 'click', (e: MouseEvent) => {
      const wrapper = document.getElementById('yddWrapper');
      if (!wrapper) return;
      const t = e.target as Element | null;
      if (t && typeof t.closest === 'function' && t.closest('#yddWrapper')) return;
      if (Math.round(Date.now()) - last_time > 200) {
        lastHoverLemma = null;
        cleanWrappers();
      }
    });

    /** 顶层：按 frameUrl / 视频域名定位嵌入 iframe，把帧内坐标映射到页面 viewport */
    function findVideoFrameEl(frameUrl?: string): HTMLIFrameElement | null {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      if (frameUrl) {
        const bySrc = iframes.find((f) => {
          const src = f.src || '';
          return src === frameUrl || (src.length > 0 && frameUrl.includes(src)) || src.includes(frameUrl);
        });
        if (bySrc) return bySrc;
        try {
          const u = new URL(frameUrl);
          const byHost = iframes.find((f) => (f.src || '').includes(u.hostname));
          if (byHost) return byHost;
        } catch {
          /* ignore */
        }
      }
      return (
        document.querySelector<HTMLIFrameElement>(
          'iframe[src*="sproutvideo.com"], iframe[src*="mediadelivery.net"]',
        ) ?? null
      );
    }

    function openLookupFromVideoFrame(
      word: string,
      rect: { left: number; top: number; right: number; bottom: number },
      frameUrl?: string,
      source?: MessageEventSource | null,
    ) {
      let frameEl: HTMLIFrameElement | null = null;
      if (source) {
        document.querySelectorAll('iframe').forEach((f) => {
          try {
            if (f.contentWindow === source) frameEl = f;
          } catch {
            /* cross-origin compare still works for contentWindow === source */
          }
        });
      }
      if (!frameEl) frameEl = findVideoFrameEl(frameUrl);
      if (!frameEl) return;
      const ir = frameEl.getBoundingClientRect();
      const x = ir.left + rect.left;
      const y = ir.top + rect.bottom + 4;
      if (hoverCloseTimer !== undefined) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = undefined;
      }
      lastHoverLemma = word;
      pendingPopupFromVideoFrame = true;
      queryWord(word, x, y);
    }

    function scheduleCloseFromVideoFrame() {
      // 视频帧弹窗：忽略 iframe mouseout 关闭请求
      if (popupFromVideoFrame) return;
      if (hoverCloseTimer !== undefined) clearTimeout(hoverCloseTimer);
      hoverCloseTimer = ctx.setTimeout(() => {
        hoverCloseTimer = undefined;
        if (!mouseOverPopup) {
          lastHoverLemma = null;
          cleanWrappers();
        }
      }, 280);
    }

    // 顶层：接收 background 转发的视频帧查词（跨域 postMessage 不可靠时的主路径）
    if (isTopFrame) {
      browser.runtime.onMessage.addListener((message: unknown) => {
        const msg = message as {
          type?: string;
          word?: string;
          frameUrl?: string;
          rect?: { left: number; top: number; right: number; bottom: number };
        } | undefined;
        if (msg?.type === 'langeasy-frame-lookup' && msg.word && msg.rect) {
          openLookupFromVideoFrame(msg.word, msg.rect, msg.frameUrl);
          return;
        }
        if (msg?.type === 'langeasy-frame-lookup-close') {
          scheduleCloseFromVideoFrame();
        }
      });
    }

    // message - lookup iframe handshake + 视频帧转发查词到顶层
    ctx.addEventListener(window, 'message', (e: MessageEvent) => {
      const data = e.data as
        | ResizeMessage
        | LookupReadyMessage
        | {
            type?: string;
            word?: string;
            rect?: { left: number; top: number; right: number; bottom: number };
          }
        | undefined;

      // 顶层：接收 Sprout 等跨域视频 iframe 的悬浮查词（fallback）
      if (isTopFrame && data?.type === 'langeasy-lookup-from-frame' && data.word && data.rect) {
        openLookupFromVideoFrame(data.word, data.rect, undefined, e.source);
        return;
      }

      if (isTopFrame && data?.type === 'langeasy-lookup-close-from-frame') {
        scheduleCloseFromVideoFrame();
        return;
      }

      if (data && data.type === 'lookup-ready') {
        const iframe = document.querySelector<HTMLIFrameElement>('#langeasyLexisIframe');
        if (iframe?.contentWindow && e.source === iframe.contentWindow) {
          deliverPendingLookup(iframe);
        }
        return;
      }
      if (data && data.type === 'resize' && 'height' in data && typeof data.height === 'number') {
        const iframe = document.querySelector<HTMLIFrameElement>('#langeasyLexisIframe');
        if (iframe) {
          // 按内容自适应高度；仅当超出视口时封顶并允许内部极细滚动
          const maxH = Math.max(120, Math.floor(window.innerHeight * 0.75));
          const h = Math.max(1, Math.min(data.height, maxH));
          iframe.style.height = h + 'px';
          iframe.style.overflow = data.height > maxH ? 'auto' : 'hidden';
          iframe.setAttribute('scrolling', data.height > maxH ? 'yes' : 'no');
          // 高度变化后重新限制在视口内，避免贴底/贴顶溢出
          repositionCurrentPopup();
        }
      }
    });

    // === 6. 异步加载设置（不阻塞事件监听器） ===
    let cleanupHighlight: (() => void) | null = null;
    (async () => {
      // 仅顶层强制同步，避免每个视频 iframe 重复打 API
      if (isTopFrame) {
        browser.runtime.sendMessage({ type: 'sync-wordbook', force: true }).catch(() => {});
      }
      try {
        isGetWord = await isGetWordItem.getValue();
        isCtrl = await isCtrlItem.getValue();
        isMiniMode = await isMiniModeItem.getValue();
        applyMiniTheme(await themeItem.getValue());
      } catch (e) {
        console.log('[bbdc] initSettings error:', e);
      }
      // 初始化生词高亮（顶层 + Bunny 字幕 iframe）
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
