import {
  wordbookWordsItem,
  highlightSettingsItem,
  normalizeHighlightSettings,
  cssFromStops,
  wordColorIndex,
  type HighlightSettings,
} from './storage';
import { WORD_RE, findHighlightRanges } from './word-match';

// === 内部状态 ===
let observer: MutationObserver | null = null;
let wordSet: Set<string> = new Set();
let settings: HighlightSettings | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
let isHighlighting = false; // 防止 MutationObserver 级联
let storageListener: ((changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void) | null = null;
let runtimeListener: ((message: unknown) => void) | null = null;

// 需要跳过的标签
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
  'NOSCRIPT', 'CODE', 'PRE', 'OBJECT', 'EMBED',
]);

/** 视频字幕嵌入页（Bunny / Sprout 等）：只改文字颜色，避免撑开字幕背景 */
function isVideoCaptionHost(): boolean {
  const h = location.hostname;
  return (
    h === 'iframe.mediadelivery.net' ||
    h.endsWith('.mediadelivery.net') ||
    h === 'videos.sproutvideo.com' ||
    h.endsWith('.sproutvideo.com')
  );
}

function isVideoChrome(el: Element): boolean {
  const cls =
    typeof (el as HTMLElement).className === 'string'
      ? (el as HTMLElement).className
      : String((el as HTMLElement).className ?? '');
  const id = (el as HTMLElement).id || '';
  return (
    /\b(stats-hint|player-controls|control-bar|vjs-control|vjs-menu)\b/i.test(cls) ||
    /\b(control|stats)\b/i.test(id)
  );
}

function isSkippableText(node: Text): boolean {
  if (!node.textContent?.trim()) return true;
  let el: Element | null = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if ((el as HTMLElement).dataset?.langeasyHighlight) return true;
    // Sprout 等播放器 chrome（如 stats-hint）不是字幕，跳过
    if (isVideoCaptionHost() && isVideoChrome(el)) return true;
    el = el.parentElement;
  }
  return false;
}

/** 视频帧：优先只扫字幕容器，找不到再退回 body（仍会跳过 chrome） */
function getVideoHighlightRoots(): Node[] {
  const sels = [
    '[class*="caption"]',
    '[class*="Caption"]',
    '[class*="subtitle"]',
    '[class*="Subtitle"]',
    '.vjs-text-track-display',
    '.plyr__captions',
  ];
  const found: Element[] = [];
  const seen = new Set<Element>();
  for (const s of sels) {
    document.querySelectorAll(s).forEach((el) => {
      if (seen.has(el) || el.closest('.stats-hint')) return;
      seen.add(el);
      found.push(el);
    });
  }
  return found.length > 0 ? found : [document.body];
}

/** 收集文本节点（进入 open Shadow DOM；TreeWalker 默认进不去） */
function collectTextNodes(root: Node, out: Text[] = []): Text[] {
  if (root.nodeType === Node.TEXT_NODE) {
    const tn = root as Text;
    if (!isSkippableText(tn)) out.push(tn);
    return out;
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as HTMLElement;
    if (SKIP_TAGS.has(el.tagName) || el.dataset?.langeasyHighlight) return out;
    if (el.shadowRoot) collectTextNodes(el.shadowRoot, out);
  }
  const children = root.childNodes;
  for (let i = 0; i < children.length; i++) {
    collectTextNodes(children[i]!, out);
  }
  return out;
}

function forEachHighlightSpan(fn: (el: Element) => void, root: Document | ShadowRoot | Element = document): void {
  root.querySelectorAll('[data-langeasy-highlight]').forEach(fn);
  root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) forEachHighlightSpan(fn, el.shadowRoot);
  });
}

// === 样式生成（按命中原形稳定配色；字幕页仅改 color，避免撑开背景） ===
function buildStyle(s: HighlightSettings, lemma: string): string {
  const colorOnly = (color: string) =>
    isVideoCaptionHost()
      ? // 字幕：只改字体颜色（用自定义标签避开播放器 span 样式）
        `color: ${color} !important; -webkit-text-fill-color: ${color} !important;`
      : `font: inherit; letter-spacing: inherit; word-spacing: inherit; vertical-align: baseline;` +
        `background: none; background-color: transparent; color: ${color};`;

  if (s.mode === 'solid') {
    return colorOnly(s.color);
  }
  if (s.mode === 'gradient') {
    const stops = s.gradientColors?.length
      ? s.gradientColors
      : ([s.gradientFrom, s.gradientTo].filter(Boolean) as string[]);
    if (isVideoCaptionHost()) {
      return colorOnly(stops[0] || s.color);
    }
    const base =
      'font: inherit; letter-spacing: inherit; word-spacing: inherit; vertical-align: baseline;' +
      'background: none; background-color: transparent;';
    return base + (cssFromStops(stops) || '');
  }
  const groups = s.colorGroups;
  if (!groups || groups.length === 0) {
    return colorOnly(s.color);
  }
  const stops = groups[wordColorIndex(lemma, groups.length)] ?? groups[0];
  if (isVideoCaptionHost()) {
    return colorOnly(stops[0] || s.color);
  }
  const base =
    'font: inherit; letter-spacing: inherit; word-spacing: inherit; vertical-align: baseline;' +
    'background: none; background-color: transparent;';
  return base + (cssFromStops(stops) || '');
}

function pushHighlightSpan(frags: Node[], text: string, lemma: string): void {
  // 字幕帧用自定义标签，避免命中播放器 `span { display:inline-block }` 撑高字幕底
  const span = isVideoCaptionHost()
    ? document.createElement('bbdc-hl')
    : document.createElement('span');
  span.dataset.langeasyHighlight = '1';
  span.dataset.langeasyLemma = lemma;
  const css = buildStyle(settings!, lemma) + (isVideoCaptionHost() ? '' : 'cursor: pointer;');
  span.style.cssText = css;
  span.textContent = text;
  frags.push(span);
}

// === DOM 扫描与高亮 ===
function highlightNode(root: Node): void {
  if (!settings || !settings.enabled || wordSet.size === 0) return;

  isHighlighting = true;
  try {
    const nodes = collectTextNodes(root);

    for (const tn of nodes) {
      const text = tn.textContent!;
      WORD_RE.lastIndex = 0;
      let last = 0;
      let m: RegExpExecArray | null;
      const frags: Node[] = [];
      let changed = false;

      while ((m = WORD_RE.exec(text)) !== null) {
        const surface = m[0];
        const ranges = findHighlightRanges(surface, wordSet);
        if (ranges.length === 0) continue;

        if (m.index > last) {
          frags.push(document.createTextNode(text.slice(last, m.index)));
        }

        let localLast = 0;
        for (const r of ranges) {
          if (r.start > localLast) {
            frags.push(document.createTextNode(surface.slice(localLast, r.start)));
          }
          pushHighlightSpan(frags, surface.slice(r.start, r.end), r.lemma);
          localLast = r.end;
        }
        if (localLast < surface.length) {
          frags.push(document.createTextNode(surface.slice(localLast)));
        }

        last = m.index + surface.length;
        changed = true;
      }

      if (changed) {
        if (last < text.length) frags.push(document.createTextNode(text.slice(last)));
        const p = tn.parentNode;
        if (p) {
          for (const f of frags) p.insertBefore(f, tn);
          p.removeChild(tn);
        }
      }
    }
  } finally {
    isHighlighting = false;
  }
}

// === 清除高亮（含 Shadow DOM） ===
function clearAll(): void {
  isHighlighting = true;
  try {
    forEachHighlightSpan((el) => {
      const p = el.parentNode;
      if (p) {
        p.replaceChild(document.createTextNode(el.textContent || ''), el);
        p.normalize();
      }
    });
  } finally {
    isHighlighting = false;
  }
}

async function refreshWordSetFromStorage(): Promise<void> {
  const words = await wordbookWordsItem.getValue();
  wordSet = new Set(words.map((w) => w.toLowerCase()));
}

function scheduleWordbookRepaint(): void {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    void (async () => {
      await refreshWordSetFromStorage();
      clearAll();
      if (settings?.enabled && wordSet.size > 0) {
        applyHighlight();
        if (!observer) setupObserver();
      } else if (observer) {
        observer.disconnect();
        observer = null;
      }
    })();
  }, 500);
}

// === 防抖应用：每次扫描前重读 storage，避免 watch 漏事件导致 wordSet 过期 ===
function applyHighlight(): void {
  if (!document.body) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void (async () => {
      await refreshWordSetFromStorage();
      if (!settings?.enabled || wordSet.size === 0) return;
      if (isVideoCaptionHost()) {
        for (const root of getVideoHighlightRoots()) {
          highlightNode(root);
        }
      } else {
        highlightNode(document.body);
      }
    })();
  }, 300);
}

function waitForBody(): Promise<HTMLElement> {
  if (document.body) return Promise.resolve(document.body);
  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      if (document.body) {
        obs.disconnect();
        resolve(document.body);
      }
    });
    obs.observe(document.documentElement, { childList: true });
  });
}

/**
 * 普通网页：稳定观察（仅元素节点；大批量 DOM 变化时再整页补扫）。
 * 新增节点若带 open shadow，一并扫入。
 */
function setupStableObserver(): void {
  observer = new MutationObserver((mutations) => {
    if (isHighlighting) return;
    let hasNew = false;
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (!el.dataset?.langeasyHighlight) {
            hasNew = true;
            highlightNode(node);
            if (el.shadowRoot) highlightNode(el.shadowRoot);
          }
        }
      }
    }
    if (!hasNew && mutations.length > 5) {
      applyHighlight();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * 视频字幕 iframe：字幕 DOM 变更时快速重扫（播放/暂停均高亮）。
 */
function setupCaptionFrameObserver(): void {
  observer = new MutationObserver((mutations) => {
    if (isHighlighting) return;
    const roots = new Set<Node>();
    for (const mut of mutations) {
      if (mut.type === 'characterData') {
        const p = (mut.target as Text).parentElement;
        if (p && !p.dataset?.langeasyHighlight) roots.add(p);
        continue;
      }
      for (const node of mut.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (!el.dataset?.langeasyHighlight) roots.add(el);
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          if (!node.parentElement.dataset?.langeasyHighlight) {
            roots.add(node.parentElement);
          }
        }
      }
      if (mut.target instanceof HTMLElement && !mut.target.dataset?.langeasyHighlight) {
        roots.add(mut.target);
      }
    }
    if (roots.size === 0) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!settings?.enabled || wordSet.size === 0) return;
      for (const root of roots) {
        highlightNode(root);
      }
    }, 40);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function setupObserver(): void {
  if (observer) observer.disconnect();
  if (!document.body) return;
  if (isVideoCaptionHost()) {
    setupCaptionFrameObserver();
  } else {
    setupStableObserver();
  }
}

// === 初始化（在 content script 中调用） ===
export async function initHighlight(): Promise<() => void> {
  await waitForBody();
  const [words, raw] = await Promise.all([
    wordbookWordsItem.getValue(),
    highlightSettingsItem.getValue(),
  ]);
  wordSet = new Set(words.map((w) => w.toLowerCase()));
  settings = normalizeHighlightSettings(raw);

  if (settings.enabled && wordSet.size > 0) {
    applyHighlight();
    setupObserver();
  }

  const unwatchWords = wordbookWordsItem.watch((w) => {
    wordSet = new Set(w.map((word) => word.toLowerCase()));
    scheduleWordbookRepaint();
  });

  // 兜底：部分环境下 item.watch 会漏掉 background/其他页的写入
  storageListener = (changes, area) => {
    if (area !== 'local' || !changes.langeasyWordbookWords) return;
    scheduleWordbookRepaint();
  };
  browser.storage.onChanged.addListener(storageListener);

  runtimeListener = (message: unknown) => {
    const msg = message as { type?: string } | undefined;
    if (msg?.type === 'wordbook-local-updated') {
      scheduleWordbookRepaint();
    }
  };
  browser.runtime.onMessage.addListener(runtimeListener);

  const unwatchSettings = highlightSettingsItem.watch((newSettings) => {
    settings = normalizeHighlightSettings(newSettings);
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      clearAll();
      if (settings?.enabled && wordSet.size > 0) {
        applyHighlight();
        if (!observer) setupObserver();
      } else if (observer) {
        observer.disconnect();
        observer = null;
      }
    }, 500);
  });

  return () => {
    unwatchWords();
    unwatchSettings();
    if (storageListener) {
      browser.storage.onChanged.removeListener(storageListener);
      storageListener = null;
    }
    if (runtimeListener) {
      browser.runtime.onMessage.removeListener(runtimeListener);
      runtimeListener = null;
    }
    clearTimeout(updateTimer);
    clearTimeout(debounceTimer);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearAll();
  };
}
