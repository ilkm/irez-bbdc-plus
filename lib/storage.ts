import { storage } from 'wxt/utils/storage';

// 三个设置项，键名与原始扩展完全一致
// local:langeasyIsGetWord — 划词翻译开关（默认 true）
// local:langeasyIsCtrl — Ctrl键指词开关（默认 true）
// local:langeasyIsMiniMode — 图标模式开关（默认 false）

export const isGetWordItem = storage.defineItem<boolean>('local:langeasyIsGetWord', {
  fallback: true,
});

export const isCtrlItem = storage.defineItem<boolean>('local:langeasyIsCtrl', {
  fallback: true,
});

export const isMiniModeItem = storage.defineItem<boolean>('local:langeasyIsMiniMode', {
  fallback: false,
});

// 主题模式（system 跟随系统，dark 深色，light 浅色，默认 system）
export type ThemeMode = 'system' | 'dark' | 'light';
export const themeItem = storage.defineItem<ThemeMode>('local:langeasyTheme', {
  fallback: 'system',
});

// 生词本单词集合（跨页面共享，chrome.storage.local 自动同步）
export const wordbookWordsItem = storage.defineItem<string[]>('local:langeasyWordbookWords', {
  fallback: [],
});

// 生词本同步间隔（秒，默认6小时=21600，范围30~86400）
export const syncIntervalItem = storage.defineItem<number>('local:langeasySyncInterval', {
  fallback: 21600,
});

// 最后选中的单词（content script → popup 自动查询）
export const lastSelectedWordItem = storage.defineItem<string>('local:langeasyLastSelectedWord', {
  fallback: '',
});

// 生词高亮设置
export type HighlightMode = 'solid' | 'gradient' | 'group';

/** 颜色组单项：1 色=纯色，≥2 色=渐变 */
export type ColorGroupStops = string[];

export interface HighlightSettings {
  enabled: boolean;
  mode: HighlightMode;
  color: string;                 // 纯色
  gradientColors: string[];      // 全局渐变色标（≥2）
  colorGroups: ColorGroupStops[]; // 颜色组（≥1 组；每组 ≥1 色）
  /** @deprecated 兼容旧纯色数组，读取时迁移到 colorGroups */
  colors?: string[];
  /** @deprecated 已改为按单词哈希固定配色 */
  groupMode?: 'sequential' | 'random';
  /** @deprecated 兼容旧存储，读取时迁移到 gradientColors */
  gradientFrom?: string;
  gradientTo?: string;
}

const DEFAULT_HIGHLIGHT: HighlightSettings = {
  enabled: true,
  mode: 'solid',
  color: '#ff3b30',
  gradientColors: ['#ff3b30', '#ff9500'],
  colorGroups: [
    ['#E63946'],
    ['#F08A24', '#FFD60A'],
    ['#6BAE3F'],
    ['#118AB2', '#3A86FF'],
    ['#7B2CBF'],
    ['#F72585', '#FF6B6B'],
    ['#06B88A'],
  ],
};

/** 按单词哈希取颜色组下标，保证同一单词颜色稳定 */
export function wordColorIndex(word: string, groupCount: number): number {
  if (groupCount <= 0) return 0;
  let h = 0;
  const s = word.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 31) + s.charCodeAt(i);
  }
  return Math.abs(h) % groupCount;
}

/** 由色标生成 CSS 文本样式片段（不含 base） */
export function cssFromStops(stops: string[]): string {
  if (!stops.length) return '';
  if (stops.length === 1) return `color: ${stops[0]};`;
  return (
    `background: linear-gradient(135deg, ${stops.join(', ')});` +
    `-webkit-background-clip: text; background-clip: text;` +
    `-webkit-text-fill-color: transparent;`
  );
}

/** 规范化高亮设置（兼容旧字段、保证数量下限） */
export function normalizeHighlightSettings(
  raw: Partial<HighlightSettings> | null | undefined,
): HighlightSettings {
  const base = { ...DEFAULT_HIGHLIGHT, ...raw };
  let gradientColors = Array.isArray(base.gradientColors) ? [...base.gradientColors] : [];
  if (gradientColors.length < 2) {
    const from = base.gradientFrom || DEFAULT_HIGHLIGHT.gradientColors[0];
    const to = base.gradientTo || DEFAULT_HIGHLIGHT.gradientColors[1];
    gradientColors = gradientColors.length === 1 ? [gradientColors[0], to] : [from, to];
  }

  let colorGroups: ColorGroupStops[] = [];
  if (Array.isArray(base.colorGroups) && base.colorGroups.length > 0) {
    colorGroups = base.colorGroups
      .map((g) => (Array.isArray(g) ? g.filter(Boolean) : []))
      .filter((g) => g.length > 0)
      .map((g) => [...g]);
  } else if (Array.isArray(base.colors) && base.colors.length > 0) {
    colorGroups = base.colors.filter(Boolean).map((c) => [c]);
  }
  if (colorGroups.length < 1) {
    colorGroups = DEFAULT_HIGHLIGHT.colorGroups.map((g) => [...g]);
  }

  const mode: HighlightMode =
    base.mode === 'gradient' || base.mode === 'group' || base.mode === 'solid'
      ? base.mode
      : 'solid';
  return {
    enabled: base.enabled !== false,
    mode,
    color: base.color || DEFAULT_HIGHLIGHT.color,
    gradientColors,
    colorGroups,
  };
}

export const highlightSettingsItem = storage.defineItem<HighlightSettings>('local:langeasyHighlightSettings', {
  fallback: DEFAULT_HIGHLIGHT,
});

// 便捷读取函数
export async function getSettings() {
  const [isGetWord, isCtrl, isMiniMode] = await Promise.all([
    isGetWordItem.getValue(),
    isCtrlItem.getValue(),
    isMiniModeItem.getValue(),
  ]);
  return { isGetWord, isCtrl, isMiniMode };
}

// 便捷写入函数
export async function setSetting(key: 'isGetWord' | 'isCtrl' | 'isMiniMode', value: boolean) {
  switch (key) {
    case 'isGetWord':
      await isGetWordItem.setValue(value);
      break;
    case 'isCtrl':
      await isCtrlItem.setValue(value);
      break;
    case 'isMiniMode':
      await isMiniModeItem.setValue(value);
      break;
  }
}
