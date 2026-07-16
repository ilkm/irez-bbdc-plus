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

// 需要跳过的标签
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
  'NOSCRIPT', 'CODE', 'PRE', 'OBJECT', 'EMBED',
]);

// === 样式生成（按命中原形稳定配色） ===
function buildStyle(s: HighlightSettings, lemma: string): string {
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
  const groups = s.colorGroups;
  if (!groups || groups.length === 0) return base;
  const stops = groups[wordColorIndex(lemma, groups.length)] ?? groups[0];
  return base + (cssFromStops(stops) || '');
}

function pushHighlightSpan(frags: Node[], text: string, lemma: string): void {
  const span = document.createElement('span');
  span.dataset.langeasyHighlight = '1';
  span.dataset.langeasyLemma = lemma;
  span.style.cssText = buildStyle(settings!, lemma) + 'cursor: pointer;';
  span.textContent = text;
  frags.push(span);
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

// === 清除高亮 ===
function clearAll(): void {
  isHighlighting = true;
  try {
    document.querySelectorAll('[data-langeasy-highlight]').forEach((el) => {
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
  if (!document.body) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    highlightNode(document.body);
  }, 120);
}

function scheduleHighlight(root: Node): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    highlightNode(root);
  }, 80);
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

// === MutationObserver（含字幕 textContent / 文本节点更新） ===
function setupObserver(): void {
  if (observer) observer.disconnect();
  if (!document.body) return;
  observer = new MutationObserver((mutations) => {
    if (isHighlighting) return;
    for (const mut of mutations) {
      if (mut.type === 'characterData') {
        const parent = (mut.target as Text).parentElement;
        if (parent && !parent.dataset?.langeasyHighlight) {
          scheduleHighlight(parent);
        }
        continue;
      }
      for (const node of mut.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (!el.dataset?.langeasyHighlight) {
            highlightNode(node);
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          if (parent && !parent.dataset?.langeasyHighlight) {
            scheduleHighlight(parent);
          }
        }
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
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
    clearTimeout(updateTimer);
    clearTimeout(debounceTimer);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearAll();
  };
}
