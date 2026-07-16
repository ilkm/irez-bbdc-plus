import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  isGetWordItem, isCtrlItem, isMiniModeItem,
  syncIntervalItem, highlightSettingsItem,
  type ThemeMode, type HighlightSettings, type HighlightMode, type GroupMode,
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

const HIGHLIGHT_MODE_OPTIONS: { mode: HighlightMode; label: string }[] = [
  { mode: 'solid', label: '纯色' },
  { mode: 'gradient', label: '渐变' },
  { mode: 'group', label: '颜色组' },
];

const PREVIEW_WORDS = ['welcome', 'hello', 'world'];

/** 生成预览样式 */
function previewStyle(s: HighlightSettings, index: number): React.CSSProperties {
  if (s.mode === 'solid') return { color: s.color };
  if (s.mode === 'gradient') return {
    background: `linear-gradient(135deg, ${s.gradientFrom}, ${s.gradientTo})`,
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };
  const colors = s.colors;
  if (colors.length === 0) return {};
  const i = s.groupMode === 'sequential' ? index % colors.length : Math.floor(Math.random() * colors.length);
  return { color: colors[i] };
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [isGetWord, setIsGetWord] = React.useState(true);
  const [isCtrl, setIsCtrl] = React.useState(true);
  const [isMiniMode, setIsMiniMode] = React.useState(false);
  const [syncInterval, setSyncInterval] = React.useState(21600);
  const [hl, setHl] = React.useState<HighlightSettings>(highlightSettingsItem.fallback);

  React.useEffect(() => {
    (async () => {
      setIsGetWord(await isGetWordItem.getValue());
      setIsCtrl(await isCtrlItem.getValue());
      setIsMiniMode(await isMiniModeItem.getValue());
      setSyncInterval(await syncIntervalItem.getValue());
      setHl(await highlightSettingsItem.getValue());
    })();

    const unwatchGetWord = isGetWordItem.watch(setIsGetWord);
    const unwatchCtrl = isCtrlItem.watch(setIsCtrl);
    const unwatchMiniMode = isMiniModeItem.watch(setIsMiniMode);
    const unwatchSyncInterval = syncIntervalItem.watch(setSyncInterval);
    const unwatchHl = highlightSettingsItem.watch(setHl);

    return () => {
      unwatchGetWord(); unwatchCtrl(); unwatchMiniMode();
      unwatchSyncInterval(); unwatchHl();
    };
  }, []);

  const updateHl = (partial: Partial<HighlightSettings>) => {
    const next = { ...hl, ...partial };
    setHl(next);
    highlightSettingsItem.setValue(next);
  };

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
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover-bg transition-colors cursor-pointer">
          <Checkbox id="hlEnabled" checked={hl.enabled}
            onCheckedChange={(v) => updateHl({ enabled: v })} />
          <Label htmlFor="hlEnabled">生词高亮</Label>
        </div>

        {hl.enabled && (
          <div className="px-2 py-1.5 space-y-2 animate-fade-in">
            {/* 高亮方式 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-primary/80">高亮方式</span>
              <div className="flex gap-1">
                {HIGHLIGHT_MODE_OPTIONS.map((opt) => (
                  <button key={opt.mode} onClick={() => updateHl({ mode: opt.mode })}
                    className={cn("px-2.5 py-1 rounded-md text-[11px] transition-all duration-200",
                      hl.mode === opt.mode ? "bg-accent/20 text-accent" : "text-secondary hover:text-primary")}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 纯色 */}
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

            {/* 渐变 */}
            {hl.mode === 'gradient' && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-primary/80">渐变色</span>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={hl.gradientFrom} onChange={(e) => updateHl({ gradientFrom: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-(--c-input-border) bg-transparent" />
                  <span className="text-secondary text-xs">→</span>
                  <input type="color" value={hl.gradientTo} onChange={(e) => updateHl({ gradientTo: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-(--c-input-border) bg-transparent" />
                </div>
              </div>
            )}

            {/* 颜色组 */}
            {hl.mode === 'group' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary/80">颜色组</span>
                  <div className="flex items-center gap-1.5">
                    {hl.colors.map((c, i) => (
                      <div key={i} className="relative">
                        <input type="color" value={c}
                          onChange={(e) => { const colors = [...hl.colors]; colors[i] = e.target.value; updateHl({ colors }); }}
                          className="w-6 h-6 rounded cursor-pointer border border-(--c-input-border) bg-transparent" />
                        {hl.colors.length > 1 && (
                          <button onClick={() => updateHl({ colors: hl.colors.filter((_, idx) => idx !== i) })}
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-error text-white flex items-center justify-center text-[8px] leading-none">
                            <X className="w-2 h-2" />
                          </button>
                        )}
                      </div>
                    ))}
                    {hl.colors.length < 8 && (
                      <button onClick={() => updateHl({ colors: [...hl.colors, '#4a9eff'] })}
                        className="w-6 h-6 rounded border border-dashed border-(--c-input-border) flex items-center justify-center text-secondary hover:text-primary">
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-primary/80">方式</span>
                  <div className="flex gap-1">
                    {(['sequential', 'random'] as GroupMode[]).map((m) => (
                      <button key={m} onClick={() => updateHl({ groupMode: m })}
                        className={cn("px-2.5 py-1 rounded-md text-[11px] transition-all duration-200",
                          hl.groupMode === m ? "bg-accent/20 text-accent" : "text-secondary hover:text-primary")}>
                        {m === 'sequential' ? '顺序' : '随机'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* 预览 */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-(--c-input-bg)">
              <span className="text-[10px] text-secondary">预览</span>
              <div className="flex gap-2">
                {PREVIEW_WORDS.map((w, i) => (
                  <span key={w} className="text-[11px] font-medium" style={previewStyle(hl, i)}>{w}</span>
                ))}
              </div>
            </div>
          </div>
        )}

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
