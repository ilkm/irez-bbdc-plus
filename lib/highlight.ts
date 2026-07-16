import {
  wordbookWordsItem,
  highlightSettingsItem,
  normalizeHighlightSettings,
  cssFromStops,
  wordColorIndex,
  type HighlightSettings,
} from './storage';

// === 内部状态 ===
let observer: MutationObserver | null = null;
let wordSet: Set<string> = new Set();
let settings: HighlightSettings | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
let isHighlighting = false; // 防止 MutationObserver 级联

// 需要跳过的标签
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
  'NOSCRIPT', 'CODE', 'PRE', 'OBJECT', 'EMBED',
]);

// === 样式生成（按单词稳定配色） ===
function buildStyle(s: HighlightSettings, word: string): string {
  const base = 'font: inherit; letter-spacing: inherit; word-spacing: inherit; vertical-align: baseline;';
  if (s.mode === 'solid') {
    return `${base}color: ${s.color};`;
  }
  if (s.mode === 'gradient') {
    const stops = s.gradientColors?.length
      ? s.gradientColors
      : ([s.gradientFrom, s.gradientTo].filter(Boolean) as string[]);
    return base + (cssFromStops(stops) || '');
  }
  // group：按单词哈希固定到某一组（组内可为纯色或渐变）
  const groups = s.colorGroups;
  if (!groups || groups.length === 0) return base;
  const stops = groups[wordColorIndex(word, groups.length)] ?? groups[0];
  return base + (cssFromStops(stops) || '');
}

// === DOM 扫描与高亮 ===
function highlightNode(root: Node): void {
  if (!settings || !settings.enabled || wordSet.size === 0) return;

  isHighlighting = true;
  try {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.dataset.langeasyHighlight) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);

  const regex = /([a-zA-Z']+)/g;

  for (const tn of nodes) {
    const text = tn.textContent!;
    regex.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    const frags: Node[] = [];
    let changed = false;

    while ((m = regex.exec(text)) !== null) {
      if (wordSet.has(m[0].toLowerCase())) {
        if (m.index > last) frags.push(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement('span');
        span.dataset.langeasyHighlight = '1';
        span.style.cssText = buildStyle(settings, m[0]);
        span.textContent = m[0];
        frags.push(span);
        last = m.index + m[0].length;
        changed = true;
      }
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

// === 清除高亮 ===
function clearAll(): void {
  isHighlighting = true;
  try {
    document.querySelectorAll('[data-langeasy-highlight]').forEach(el => {
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

// === 防抖应用 ===
function applyHighlight(): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    highlightNode(document.body);
  }, 300);
}

// === MutationObserver ===
function setupObserver(): void {
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    if (isHighlighting) return; // 跳过高亮自身引起的 DOM 变更
    let hasNew = false;
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (!el.dataset?.langeasyHighlight) {
            hasNew = true;
            highlightNode(node);
          }
        }
      }
    }
    if (!hasNew && mutations.length > 5) {
      // 大量变更时重新扫描（可能是 SPA 路由切换）
      applyHighlight();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// === 初始化（在 content script 中调用） ===
export async function initHighlight(): Promise<() => void> {
  const [words, raw] = await Promise.all([
    wordbookWordsItem.getValue(),
    highlightSettingsItem.getValue(),
  ]);
  wordSet = new Set(words.map(w => w.toLowerCase()));
  settings = normalizeHighlightSettings(raw);

  if (settings.enabled && wordSet.size > 0) {
    applyHighlight();
    setupObserver();
  }

  // 监听生词本变化（跨页面同步，防抖避免增量同步频繁刷新）
  const unwatchWords = wordbookWordsItem.watch((w) => {
    wordSet = new Set(w.map(word => word.toLowerCase()));
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
  
  // 监听高亮设置变化（关闭/开启/颜色切换）
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

  // 返回清理函数
  return () => {
    unwatchWords();
    unwatchSettings();
    clearTimeout(updateTimer);
    clearTimeout(debounceTimer);
    if (observer) { observer.disconnect(); observer = null; }
    clearAll();
  };
}
