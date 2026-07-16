import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  isGetWordItem, isCtrlItem, isMiniModeItem,
  syncIntervalItem, highlightSettingsItem, normalizeHighlightSettings,
  wordColorIndex,
  type ThemeMode, type HighlightSettings, type HighlightMode, type ColorGroupStops,
} from '@/lib/storage';
import { useTheme } from '@/lib/use-theme';
import { cn } from '@/lib/utils';

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: '系统' },
  { mode: 'light', label: '明亮' },
  { mode: 'dark', label: '暗色' },
];

const SYNC_INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '30秒' },
  { value: 60, label: '1分钟' },
  { value: 300, label: '5分钟' },
  { value: 600, label: '10分钟' },
  { value: 1800, label: '30分钟' },
  { value: 3600, label: '1小时' },
  { value: 21600, label: '6小时' },
  { value: 43200, label: '12小时' },
  { value: 86400, label: '24小时' },
];

/** 高亮方式：关闭在纯色左侧，默认纯色 */
const HIGHLIGHT_MODE_OPTIONS: { mode: HighlightMode | 'off'; label: string }[] = [
  { mode: 'off', label: '关闭' },
  { mode: 'solid', label: '纯色' },
  { mode: 'gradient', label: '渐变' },
  { mode: 'group', label: '颜色组' },
];

const PREVIEW_WORDS = ['welcome', 'hello', 'world'];
const MAX_GROUPS = 24;
const MAX_STOPS = 8;
const DEFAULT_NEW_COLOR = '#4a9eff';

function cssPropsFromStops(stops: string[]): React.CSSProperties {
  if (!stops.length) return {};
  if (stops.length === 1) return { color: stops[0] };
  return {
    background: `linear-gradient(135deg, ${stops.join(', ')})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };
}

/** 生成预览样式（颜色组按单词哈希，保证同词同色） */
function previewStyle(s: HighlightSettings, word: string): React.CSSProperties {
  if (!s.enabled) return { color: 'inherit', opacity: 0.45 };
  if (s.mode === 'solid') return { color: s.color };
  if (s.mode === 'gradient') return cssPropsFromStops(s.gradientColors);
  const groups = s.colorGroups;
  if (!groups.length) return {};
  const stops = groups[wordColorIndex(word, groups.length)] ?? groups[0];
  return cssPropsFromStops(stops);
}

/** 单行色标编辑器（全局渐变用） */
function ColorStopsEditor({
  label,
  colors,
  min,
  onChange,
}: {
  label: string;
  colors: string[];
  min: number;
  onChange: (colors: string[]) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-primary/80 pt-1 shrink-0">{label}</span>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {colors.map((c, i) => (
          <div key={i} className="relative">
            <input
              type="color"
              value={c}
              onChange={(e) => {
                const next = [...colors];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="w-6 h-6 rounded cursor-pointer border border-(--c-input-border) bg-transparent"
            />
            {colors.length > min && (
              <button
                type="button"
                onClick={() => onChange(colors.filter((_, idx) => idx !== i))}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-error text-white flex items-center justify-center leading-none"
              >
                <X className="w-2 h-2" />
              </button>
            )}
          </div>
        ))}
        {colors.length < MAX_STOPS && (
          <button
            type="button"
            onClick={() => onChange([...colors, DEFAULT_NEW_COLOR])}
            className="w-6 h-6 rounded border border-dashed border-(--c-input-border) flex items-center justify-center text-secondary hover:text-primary"
            title="添加色标"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/** 颜色组编辑器：每组可含 1+ 色标（≥2 为渐变），同词按哈希固定一组 */
function ColorGroupsEditor({
  groups,
  onChange,
}: {
  groups: ColorGroupStops[];
  onChange: (groups: ColorGroupStops[]) => void;
}) {
  const updateGroup = (gi: number, stops: string[]) => {
    const next = groups.map((g, i) => (i === gi ? stops : g));
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-primary/80">颜色组</span>
        <span className="text-[10px] text-secondary">同词同色 · 组内可渐变</span>
      </div>
      <div className="space-y-1.5">
        {groups.map((stops, gi) => (
          <div
            key={gi}
            className="flex items-center gap-1.5 rounded-md border border-(--c-input-border) px-1.5 py-1"
          >
            <span className="text-[10px] text-secondary w-4 shrink-0">{gi + 1}</span>
            <div className="flex flex-wrap items-center gap-1 flex-1">
              {stops.map((c, si) => (
                <div key={si} className="relative">
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => {
                      const next = [...stops];
                      next[si] = e.target.value;
                      updateGroup(gi, next);
                    }}
                    className="w-6 h-6 rounded cursor-pointer border border-(--c-input-border) bg-transparent"
                  />
                  {stops.length > 1 && (
                    <button
                      type="button"
                      onClick={() => updateGroup(gi, stops.filter((_, i) => i !== si))}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-error text-white flex items-center justify-center leading-none"
                    >
                      <X className="w-2 h-2" />
                    </button>
                  )}
                </div>
              ))}
              {stops.length < MAX_STOPS && (
                <button
                  type="button"
                  onClick={() => updateGroup(gi, [...stops, DEFAULT_NEW_COLOR])}
                  className="w-6 h-6 rounded border border-dashed border-(--c-input-border) flex items-center justify-center text-secondary hover:text-primary"
                  title="添加渐变色标"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
            {groups.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(groups.filter((_, i) => i !== gi))}
                className="text-secondary hover:text-error shrink-0 p-0.5"
                title="删除此组"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {groups.length < MAX_GROUPS && (
        <button
          type="button"
          onClick={() => onChange([...groups, [DEFAULT_NEW_COLOR]])}
          className="w-full py-1 rounded-md border border-dashed border-(--c-input-border) text-[11px] text-secondary hover:text-primary flex items-center justify-center gap-1"
        >
          <Plus className="w-3 h-3" />
          添加颜色组
        </button>
      )}
    </div>
  );
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [isGetWord, setIsGetWord] = React.useState(true);
  const [isCtrl, setIsCtrl] = React.useState(true);
  const [isMiniMode, setIsMiniMode] = React.useState(false);
  const [syncInterval, setSyncInterval] = React.useState(21600);
  const [hl, setHl] = React.useState<HighlightSettings>(() =>
    normalizeHighlightSettings(highlightSettingsItem.fallback),
  );

  React.useEffect(() => {
    (async () => {
      setIsGetWord(await isGetWordItem.getValue());
      setIsCtrl(await isCtrlItem.getValue());
      setIsMiniMode(await isMiniModeItem.getValue());
      setSyncInterval(await syncIntervalItem.getValue());
      setHl(normalizeHighlightSettings(await highlightSettingsItem.getValue()));
    })();

    const unwatchGetWord = isGetWordItem.watch(setIsGetWord);
    const unwatchCtrl = isCtrlItem.watch(setIsCtrl);
    const unwatchMiniMode = isMiniModeItem.watch(setIsMiniMode);
    const unwatchSyncInterval = syncIntervalItem.watch(setSyncInterval);
    const unwatchHl = highlightSettingsItem.watch((v) =>
      setHl(normalizeHighlightSettings(v)),
    );

    return () => {
      unwatchGetWord(); unwatchCtrl(); unwatchMiniMode();
      unwatchSyncInterval(); unwatchHl();
    };
  }, []);

  const updateHl = (partial: Partial<HighlightSettings>) => {
    const next = normalizeHighlightSettings({ ...hl, ...partial });
    setHl(next);
    highlightSettingsItem.setValue(next);
  };

  const selectMode = (mode: HighlightMode | 'off') => {
    if (mode === 'off') {
      updateHl({ enabled: false });
      return;
    }
    updateHl({ enabled: true, mode });
  };

  const activeMode: HighlightMode | 'off' = hl.enabled ? hl.mode : 'off';

  return (
    <div className="w-[340px] app-gradient-bg overflow-hidden text-[13px] font-sans text-primary animate-scale-in">
      {/* 透明标题栏 */}
      <div className="flex items-center px-3 py-2 border-b border-line bg-titlebar">
        <img src="/images/icon_48.png" width="18" height="18" className="mr-2 rounded" alt="logo" />
        <span className="text-[12px] text-accent font-medium">选项设置</span>
      </div>

      {/* 设置项 */}
      <div className="p-3 space-y-1">
        <p className="text-[11px] text-secondary mb-2">自定义你的查词体验</p>

        {/* 主题切换 */}
        <div className="flex items-center justify-between px-2 py-2 rounded-lg hover-bg transition-colors">
          <span className="text-xs text-primary/80">主题</span>
          <div className="flex gap-1">
            {THEME_OPTIONS.map((opt) => (
              <button key={opt.mode} onClick={() => setTheme(opt.mode)}
                className={cn("px-2.5 py-1 rounded-md text-[11px] transition-all duration-200",
                  theme === opt.mode ? "bg-accent/20 text-accent" : "text-secondary hover:text-primary")}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 同步间隔 */}
        <div className="flex items-center justify-between px-2 py-2 rounded-lg hover-bg transition-colors">
          <span className="text-xs text-primary/80">生词本同步</span>
          <select value={syncInterval} onChange={(e) => { const v = Number(e.target.value); setSyncInterval(v); syncIntervalItem.setValue(v); }}
            className="bg-(--c-input-bg) border border-(--c-input-border) text-primary text-[11px] rounded-md px-2 py-1 outline-none cursor-pointer">
            {SYNC_INTERVAL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        {/* === 生词高亮 === */}
        <div className="px-2 py-2 space-y-2 rounded-lg hover-bg transition-colors">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-primary/80 shrink-0">高亮方式</span>
            <div className="flex flex-wrap justify-end gap-1">
              {HIGHLIGHT_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => selectMode(opt.mode)}
                  className={cn(
                    "px-2 py-1 rounded-md text-[11px] transition-all duration-200",
                    activeMode === opt.mode ? "bg-accent/20 text-accent" : "text-secondary hover:text-primary",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {hl.enabled && (
            <div className="space-y-2 animate-fade-in">
              {hl.mode === 'solid' && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary/80">颜色</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={hl.color} onChange={(e) => updateHl({ color: e.target.value })}
                      className="w-7 h-7 rounded cursor-pointer border border-(--c-input-border) bg-transparent" />
                    <span className="text-[10px] text-secondary font-mono">{hl.color}</span>
                  </div>
                </div>
              )}

              {hl.mode === 'gradient' && (
                <ColorStopsEditor
                  label="渐变色"
                  colors={hl.gradientColors}
                  min={2}
                  onChange={(gradientColors) => updateHl({ gradientColors })}
                />
              )}

              {hl.mode === 'group' && (
                <ColorGroupsEditor
                  groups={hl.colorGroups}
                  onChange={(colorGroups) => updateHl({ colorGroups })}
                />
              )}

              {/* 预览 */}
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-(--c-input-bg)">
                <span className="text-[10px] text-secondary">预览</span>
                <div className="flex gap-2">
                  {PREVIEW_WORDS.map((w) => (
                    <span key={w} className="text-[11px] font-medium" style={previewStyle(hl, w)}>{w}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Checkbox: 划词翻译 */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover-bg transition-colors cursor-pointer">
          <Checkbox id="langeasyIsGetWord" checked={isGetWord}
            onCheckedChange={(v) => { setIsGetWord(v); isGetWordItem.setValue(v); }} />
          <Label htmlFor="langeasyIsGetWord">划词翻译</Label>
        </div>

        {/* Checkbox: 按Ctrl键指词 */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover-bg transition-colors cursor-pointer">
          <Checkbox id="langeasyIsCtrl" checked={isCtrl}
            onCheckedChange={(v) => { setIsCtrl(v); isCtrlItem.setValue(v); }} />
          <Label htmlFor="langeasyIsCtrl">按Ctrl键指词</Label>
        </div>

        {/* Checkbox: 图标模式 */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover-bg transition-colors cursor-pointer">
          <Checkbox id="langeasyIsMiniMode" checked={isMiniMode}
            onCheckedChange={(v) => { setIsMiniMode(v); isMiniModeItem.setValue(v); }} />
          <Label htmlFor="langeasyIsMiniMode">图标模式（划词后默认显示图标按钮）</Label>
        </div>
      </div>

      {/* 页脚 */}
      <div className="flex items-center justify-center px-3 py-2 text-[11px] border-t border-line">
        <a href="/popup.html" className="text-secondary hover:text-accent transition-colors">← 返回</a>
      </div>
    </div>
  );
}
