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
export type GroupMode = 'sequential' | 'random';

export interface HighlightSettings {
  enabled: boolean;
  mode: HighlightMode;
  color: string;          // 纯色
  gradientFrom: string;   // 渐变起始色
  gradientTo: string;     // 渐变结束色
  colors: string[];       // 颜色组
  groupMode: GroupMode;   // 颜色组模式
}

export const highlightSettingsItem = storage.defineItem<HighlightSettings>('local:langeasyHighlightSettings', {
  fallback: {
    enabled: true,
    mode: 'solid',
    color: '#ff3b30',
    gradientFrom: '#ff3b30',
    gradientTo: '#ff9500',
    colors: [
      '#E63946', // 红
      '#D62828', // 绯红
      '#E76F51', // 珊瑚
      '#FB5607', // 橙红
      '#F08A24', // 琥珀
      '#D4A017', // 金色
      '#6BAE3F', // 草绿
      '#2A9D8F', // 青绿
      '#00B4A6', // 松石
      '#118AB2', // 海蓝
      '#1E88E5', // 天蓝
      '#3A86FF', // 亮蓝
      '#4361EE', // 靛蓝
      '#7B2CBF', // 深紫
      '#9D4EDD', // 薰衣草
      '#B5179E', // 品红
      '#F72585', // 玫红
      '#EF476F', // 蔷薇
      '#8338EC', // 紫罗兰
      '#06B88A', // 薄荷
    ],
    groupMode: 'sequential',
  },
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
