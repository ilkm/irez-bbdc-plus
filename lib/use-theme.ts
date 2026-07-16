import * as React from 'react';
import { themeItem, type ThemeMode } from './storage';

type ResolvedTheme = 'dark' | 'light';

/** 读取系统当前配色偏好 */
function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 将存储的主题模式解析为实际生效的 dark / light */
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

/** 将解析后的主题应用到 <html data-theme="..."> */
function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
}

/**
 * 主题管理 Hook
 * - theme: 存储的模式（system / dark / light）
 * - resolvedTheme: 实际生效的 dark / light
 * - setTheme: 切换模式
 */
export function useTheme() {
  const [theme, setThemeState] = React.useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>('dark');

  React.useEffect(() => {
    // 读取存储
    (async () => {
      const t = await themeItem.getValue();
      setThemeState(t);
      applyTheme(t);
      setResolvedTheme(resolveTheme(t));
    })();

    // 监听存储变化（跨页面同步）
    const unwatch = themeItem.watch((t) => {
      setThemeState(t);
      applyTheme(t);
      setResolvedTheme(resolveTheme(t));
    });

    // 监听系统主题变化（仅在 system 模式下生效）
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (themeItem.getValue && typeof themeItem.getValue === 'function') {
        // getValue 返回 Promise，在 system 模式下重新应用
        themeItem.getValue().then((mode) => {
          if (mode === 'system') {
            applyTheme('system');
            setResolvedTheme(getSystemTheme());
          }
        });
      }
    };
    mediaQuery.addEventListener('change', onSystemChange);

    return () => {
      unwatch();
      mediaQuery.removeEventListener('change', onSystemChange);
    };
  }, []);

  const setTheme = React.useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    applyTheme(mode);
    setResolvedTheme(resolveTheme(mode));
    themeItem.setValue(mode);
  }, []);

  return { theme, resolvedTheme, setTheme };
}
