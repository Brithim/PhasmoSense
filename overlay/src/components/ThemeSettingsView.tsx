import React from 'react';
import {
  Palette,
  Layout,
  Sliders,
  Volume2,
  VolumeX,
  Tv,
  Eye,
  EyeOff,
  Check,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  THEMES,
  ACCENT_COLORS,
  ThemeId,
  AccentColorId,
  HudLayoutMode,
} from '../theme/theme';

interface ThemeSettingsViewProps {
  currentTheme: ThemeId;
  onSelectTheme: (t: ThemeId) => void;
  currentAccent: AccentColorId;
  onSelectAccent: (a: AccentColorId) => void;
  hudLayout: HudLayoutMode;
  onSelectHudLayout: (l: HudLayoutMode) => void;
  uiScale: number;
  onChangeUiScale: (s: number) => void;
  hudOpacity: number;
  onChangeHudOpacity: (o: number) => void;
  crtScanlines: boolean;
  onToggleCrtScanlines: (enabled: boolean) => void;
  uiSoundEnabled: boolean;
  onToggleUiSound: (enabled: boolean) => void;
  streamerMode: boolean;
  onToggleStreamerMode: (enabled: boolean) => void;
  chromaKeyEnabled: boolean;
  onToggleChromaKey: (enabled: boolean) => void;
}

export const ThemeSettingsView: React.FC<ThemeSettingsViewProps> = ({
  currentTheme,
  onSelectTheme,
  currentAccent,
  onSelectAccent,
  hudLayout,
  onSelectHudLayout,
  uiScale,
  onChangeUiScale,
  hudOpacity,
  onChangeHudOpacity,
  crtScanlines,
  onToggleCrtScanlines,
  uiSoundEnabled,
  onToggleUiSound,
  streamerMode,
  onToggleStreamerMode,
  chromaKeyEnabled,
  onToggleChromaKey,
}) => {
  const activeAccent = ACCENT_COLORS[currentAccent] || ACCENT_COLORS.sky;
  const activeTheme = THEMES[currentTheme] || THEMES.modern;

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-5 border ${activeTheme.cardBg} ${activeTheme.cardBorder}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Palette className={`w-5 h-5 ${activeAccent.textClass}`} />
          <h2 className="text-sm font-bold text-white">
            Themes & GUI Modernization
          </h2>
        </div>
        <span className="text-[11px] text-neutral-400 font-mono">
          Live Real-Time Theme Engine
        </span>
      </div>

      {/* 1. Theme Presets Gallery (4 Cards) */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-2">
          Visual Theme Preset
        </label>
        <div className="grid grid-cols-4 gap-3">
          {(Object.keys(THEMES) as ThemeId[]).map((tid) => {
            const th = THEMES[tid];
            const isSelected = currentTheme === tid;
            return (
              <button
                key={tid}
                onClick={() => onSelectTheme(tid)}
                className={`flex flex-col text-left p-3.5 rounded-xl border transition relative overflow-hidden ${
                  isSelected
                    ? `${activeAccent.borderClass} bg-black/60 ring-2 ring-white/10 shadow-lg`
                    : 'border-white/10 bg-black/30 hover:border-white/20'
                }`}
              >
                {isSelected && (
                  <span className={`absolute top-2 right-2 w-4 h-4 rounded-full ${activeAccent.bgClass} text-slate-950 flex items-center justify-center text-[10px] font-bold`}>
                    ✓
                  </span>
                )}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-bold text-white">{th.name}</span>
                  <span className="text-[9px] px-1 rounded bg-white/10 text-neutral-300 font-mono">
                    {th.badge}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug line-clamp-2">
                  {th.description}
                </p>

                {/* Theme preview swatch */}
                <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-1">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      tid === 'journal'
                        ? 'bg-[#d9b779]'
                        : tid === 'crt'
                        ? 'bg-[#4dfc4d]'
                        : tid === 'oled'
                        ? 'bg-neutral-100'
                        : 'bg-neutral-400'
                    }`}
                  />
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {tid === 'journal'
                      ? 'Parchment & Ink'
                      : tid === 'crt'
                      ? 'Phosphor Green'
                      : tid === 'oled'
                      ? 'True Black'
                      : 'Obsidian Neutral'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Custom Dynamic Accent Hue Palette */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-2">
          Accent Color Palette (Telemetry & Highlights)
        </label>
        <div className="grid grid-cols-6 gap-2">
          {(Object.keys(ACCENT_COLORS) as AccentColorId[]).map((aid) => {
            const acc = ACCENT_COLORS[aid];
            const isSelected = currentAccent === aid;
            return (
              <button
                key={aid}
                onClick={() => onSelectAccent(aid)}
                className={`py-2 px-2.5 rounded-xl border flex items-center gap-2 transition ${
                  isSelected
                    ? `${acc.activeBadgeClass} shadow-md font-bold`
                    : 'bg-black/30 border-white/10 text-neutral-300 hover:border-white/20'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: acc.hex }}
                />
                <span className="text-xs truncate">{acc.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Mini-HUD Form Factor & Sliders */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Mini-HUD Form Factor */}
        <div className="bg-black/35 border border-white/10 rounded-xl p-3.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-2 flex items-center gap-1.5">
            <Layout className={`w-3.5 h-3.5 ${activeAccent.textClass}`} /> Mini-HUD Form Factor
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSelectHudLayout('vertical')}
              className={`p-2.5 rounded-lg border text-left transition flex flex-col gap-0.5 ${
                hudLayout === 'vertical'
                  ? `${activeAccent.activeBadgeClass} font-bold`
                  : 'bg-black/30 border-white/10 text-neutral-400 hover:border-white/20'
              }`}
            >
              <span className="text-xs">Vertical Card (370px)</span>
              <span className="text-[10px] text-neutral-400 font-normal">
                Classic corner stacked widget
              </span>
            </button>

            <button
              onClick={() => onSelectHudLayout('horizontal')}
              className={`p-2.5 rounded-lg border text-left transition flex flex-col gap-0.5 ${
                hudLayout === 'horizontal'
                  ? `${activeAccent.activeBadgeClass} font-bold`
                  : 'bg-black/30 border-white/10 text-neutral-400 hover:border-white/20'
              }`}
            >
              <span className="text-xs">Ultra-Slim Dock</span>
              <span className="text-[10px] text-neutral-400 font-normal">
                Screen bottom/top low-profile ribbon
              </span>
            </button>
          </div>
        </div>

        {/* Right: UI Sliders (Scale & Opacity) */}
        <div className="bg-black/35 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1">
                <Sliders className={`w-3.5 h-3.5 ${activeAccent.textClass}`} /> UI Scaling ({Math.round(uiScale * 100)}%)
              </span>
              <span className="text-[10px] font-mono text-neutral-400">
                1080p / 1440p / 4K
              </span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.50"
              step="0.05"
              value={uiScale}
              onChange={(e) => onChangeUiScale(parseFloat(e.target.value))}
              style={{ accentColor: activeAccent.hex }}
              className="w-full cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
            />
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                Backdrop Opacity & Blur ({Math.round(hudOpacity * 100)}%)
              </span>
              <span className="text-[10px] font-mono text-neutral-400">
                Translucency
              </span>
            </div>
            <input
              type="range"
              min="0.40"
              max="1.0"
              step="0.05"
              value={hudOpacity}
              onChange={(e) => onChangeHudOpacity(parseFloat(e.target.value))}
              style={{ accentColor: activeAccent.hex }}
              className="w-full cursor-pointer h-1.5 bg-neutral-800 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* 4. Visual Effects & Streamer Broadcasting Suite */}
      <div className="grid grid-cols-4 gap-3">
        {/* CRT Scanline Toggle */}
        <button
          onClick={() => onToggleCrtScanlines(!crtScanlines)}
          className={`p-3 rounded-xl border text-left flex items-center justify-between transition ${
            crtScanlines
              ? 'bg-black/40 border-emerald-500/50 text-emerald-200'
              : 'bg-black/20 border-white/10 text-neutral-400'
          }`}
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5" /> CRT Scanlines
            </span>
            <span className="text-[10px] text-neutral-400">Phosphor raster overlay</span>
          </div>
          <span
            className={`w-3.5 h-3.5 rounded-full ${
              crtScanlines ? 'bg-emerald-400' : 'bg-neutral-800'
            }`}
          />
        </button>

        {/* Procedural Theme Audio FX */}
        <button
          onClick={() => onToggleUiSound(!uiSoundEnabled)}
          className={`p-3 rounded-xl border text-left flex items-center justify-between transition ${
            uiSoundEnabled
              ? `bg-black/40 ${activeAccent.borderClass} ${activeAccent.textClass}`
              : 'bg-black/20 border-white/10 text-neutral-400'
          }`}
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold flex items-center gap-1.5">
              {uiSoundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              Theme UI Audio
            </span>
            <span className="text-[10px] text-neutral-400">Paper rustles & relay clicks</span>
          </div>
          <span
            className={`w-3.5 h-3.5 rounded-full ${
              uiSoundEnabled ? activeAccent.bgClass : 'bg-neutral-800'
            }`}
          />
        </button>

        {/* Streamer Privacy Mode */}
        <button
          onClick={() => onToggleStreamerMode(!streamerMode)}
          className={`p-3 rounded-xl border text-left flex items-center justify-between transition ${
            streamerMode
              ? 'bg-black/40 border-purple-500/50 text-purple-200'
              : 'bg-black/20 border-white/10 text-neutral-400'
          }`}
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5" /> Streamer Privacy
            </span>
            <span className="text-[10px] text-neutral-400">Mask match history & keys</span>
          </div>
          <span
            className={`w-3.5 h-3.5 rounded-full ${
              streamerMode ? 'bg-purple-400' : 'bg-neutral-800'
            }`}
          />
        </button>

        {/* OBS Chroma-Key Mode */}
        <button
          onClick={() => onToggleChromaKey(!chromaKeyEnabled)}
          className={`p-3 rounded-xl border text-left flex items-center justify-between transition ${
            chromaKeyEnabled
              ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 font-bold'
              : 'bg-black/20 border-white/10 text-neutral-400'
          }`}
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> OBS Chroma-Key
            </span>
            <span className="text-[10px] text-neutral-400">Solid green window capture</span>
          </div>
          <span
            className={`w-3.5 h-3.5 rounded-full ${
              chromaKeyEnabled ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-neutral-800'
            }`}
          />
        </button>
      </div>
    </div>
  );
};
