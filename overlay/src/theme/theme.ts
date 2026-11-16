export type ThemeId = 'modern' | 'journal' | 'crt' | 'oled';
export type AccentColorId = 'sky' | 'cyan' | 'emerald' | 'violet' | 'amber' | 'crimson';
export type HudLayoutMode = 'vertical' | 'horizontal';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  badge: string;
  description: string;
  // Outer frame styling
  containerBg: string;
  cardBg: string;
  cardBorder: string;
  headerBg: string;
  // Typography
  fontClass: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Specific badges
  evidenceNormal: string;
  evidenceConfirmed: string;
  evidenceSuspected: string;
  evidenceRuledOut: string;
  // Unique aesthetic features
  hasScanlines: boolean;
  paperTexture?: boolean;
}

export interface AccentColorConfig {
  id: AccentColorId;
  name: string;
  hex: string;
  textClass: string;
  lightTextClass: string;
  bgClass: string;
  hoverBgClass: string;
  borderClass: string;
  glowClass: string;
  activeBadgeClass: string;
  bannerBgClass: string;
  bannerGradient: string;
}

export const ACCENT_COLORS: Record<AccentColorId, AccentColorConfig> = {
  sky: {
    id: 'sky',
    name: 'Sky Blue',
    hex: '#38bdf8',
    textClass: 'text-sky-400',
    lightTextClass: 'text-sky-300',
    bgClass: 'bg-sky-500',
    hoverBgClass: 'hover:bg-sky-400',
    borderClass: 'border-sky-500/40',
    glowClass: 'shadow-sky-500/25',
    activeBadgeClass: 'bg-sky-500/20 border-sky-400/50 text-sky-200',
    bannerBgClass: 'bg-sky-950/45 border-sky-500/35',
    bannerGradient: 'from-sky-950/80 via-neutral-900/90 to-neutral-900/90 border-sky-500/40',
  },
  cyan: {
    id: 'cyan',
    name: 'Cyber Cyan',
    hex: '#06b6d4',
    textClass: 'text-cyan-400',
    lightTextClass: 'text-cyan-300',
    bgClass: 'bg-cyan-500',
    hoverBgClass: 'hover:bg-cyan-400',
    borderClass: 'border-cyan-500/40',
    glowClass: 'shadow-cyan-500/25',
    activeBadgeClass: 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200',
    bannerBgClass: 'bg-cyan-950/45 border-cyan-500/35',
    bannerGradient: 'from-cyan-950/80 via-neutral-900/90 to-neutral-900/90 border-cyan-500/40',
  },
  emerald: {
    id: 'emerald',
    name: 'Ghost Emerald',
    hex: '#10b981',
    textClass: 'text-emerald-400',
    lightTextClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500',
    hoverBgClass: 'hover:bg-emerald-400',
    borderClass: 'border-emerald-500/40',
    glowClass: 'shadow-emerald-500/25',
    activeBadgeClass: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200',
    bannerBgClass: 'bg-emerald-950/45 border-emerald-500/35',
    bannerGradient: 'from-emerald-950/80 via-neutral-900/90 to-neutral-900/90 border-emerald-500/40',
  },
  violet: {
    id: 'violet',
    name: 'Spirit Violet',
    hex: '#a855f7',
    textClass: 'text-purple-400',
    lightTextClass: 'text-purple-300',
    bgClass: 'bg-purple-500',
    hoverBgClass: 'hover:bg-purple-400',
    borderClass: 'border-purple-500/40',
    glowClass: 'shadow-purple-500/25',
    activeBadgeClass: 'bg-purple-500/20 border-purple-400/50 text-purple-200',
    bannerBgClass: 'bg-purple-950/45 border-purple-500/35',
    bannerGradient: 'from-purple-950/80 via-neutral-900/90 to-neutral-900/90 border-purple-500/40',
  },
  amber: {
    id: 'amber',
    name: 'Sanity Amber',
    hex: '#f59e0b',
    textClass: 'text-amber-400',
    lightTextClass: 'text-amber-300',
    bgClass: 'bg-amber-500',
    hoverBgClass: 'hover:bg-amber-400',
    borderClass: 'border-amber-500/40',
    glowClass: 'shadow-amber-500/25',
    activeBadgeClass: 'bg-amber-500/20 border-amber-400/50 text-amber-200',
    bannerBgClass: 'bg-amber-950/45 border-amber-500/35',
    bannerGradient: 'from-amber-950/80 via-neutral-900/90 to-neutral-900/90 border-amber-500/40',
  },
  crimson: {
    id: 'crimson',
    name: 'Hunt Crimson',
    hex: '#ef4444',
    textClass: 'text-rose-400',
    lightTextClass: 'text-rose-300',
    bgClass: 'bg-rose-500',
    hoverBgClass: 'hover:bg-rose-400',
    borderClass: 'border-rose-500/40',
    glowClass: 'shadow-rose-500/25',
    activeBadgeClass: 'bg-rose-500/20 border-rose-400/50 text-rose-200',
    bannerBgClass: 'bg-rose-950/45 border-rose-500/35',
    bannerGradient: 'from-rose-950/80 via-neutral-900/90 to-neutral-900/90 border-rose-500/40',
  },
};

export const THEMES: Record<ThemeId, ThemeConfig> = {
  modern: {
    id: 'modern',
    name: 'Modern Obsidian',
    badge: 'DEFAULT',
    description: 'Polished neutral obsidian dark glassmorphism with dynamic glowing accents.',
    containerBg: 'bg-[#08080c]/92 backdrop-blur-md',
    cardBg: 'bg-[#101017]/92 backdrop-blur-md',
    cardBorder: 'border-white/10',
    headerBg: 'bg-[#0c0c12]/95 border-white/10',
    fontClass: 'font-sans',
    textPrimary: 'text-neutral-100',
    textSecondary: 'text-neutral-300',
    textMuted: 'text-neutral-400',
    evidenceNormal: 'bg-[#161622]/80 border-white/10 text-neutral-400',
    evidenceConfirmed: 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-semibold',
    evidenceSuspected: 'bg-amber-500/25 border-amber-400 text-amber-200 animate-pulse',
    evidenceRuledOut: 'bg-rose-950/40 border-rose-800/60 text-rose-400/70 line-through',
    hasScanlines: false,
  },
  journal: {
    id: 'journal',
    name: 'Authentic Journal',
    badge: 'SKEUOMORPHIC',
    description: 'Vintage weathered parchment journal with typewriter font, ink stamps & paper page rustles.',
    containerBg: 'bg-[#181410]/95 backdrop-blur-sm',
    cardBg: 'bg-[#221c15]/95',
    cardBorder: 'border-[#4a3b2c] shadow-[inset_0_0_20px_rgba(0,0,0,0.4)]',
    headerBg: 'bg-[#201912] border-[#4a3b2c]',
    fontClass: 'font-serif tracking-normal',
    textPrimary: 'text-[#f5ebd7]',
    textSecondary: 'text-[#dfcca9]',
    textMuted: 'text-[#a89574]',
    evidenceNormal: 'bg-[#18130e]/80 border-[#3d3023] text-[#9e8b6b]',
    evidenceConfirmed: 'bg-[#142817]/90 border-[#2f6637] text-[#a9e4b3] font-bold shadow-sm',
    evidenceSuspected: 'bg-[#2b220d]/90 border-[#7d5d1c] text-[#f2cb77] animate-pulse',
    evidenceRuledOut: 'bg-[#2e1313]/90 border-[#662828] text-[#e08989] line-through decoration-2',
    hasScanlines: false,
    paperTexture: true,
  },
  crt: {
    id: 'crt',
    name: 'Tactical Truck CRT',
    badge: 'SURVEILLANCE',
    description: 'Military surveillance van CRT terminal with phosphor scanlines, monospace telemetry & relay clicks.',
    containerBg: 'bg-[#030903]/95',
    cardBg: 'bg-[#061406]/95',
    cardBorder: 'border-[#143d14] shadow-[0_0_15px_rgba(30,120,30,0.25)]',
    headerBg: 'bg-[#040e04] border-[#143d14]',
    fontClass: 'font-mono tracking-tight',
    textPrimary: 'text-[#4dfc4d]',
    textSecondary: 'text-[#38c938]',
    textMuted: 'text-[#238023]',
    evidenceNormal: 'bg-[#030903] border-[#0e290e] text-[#227022]',
    evidenceConfirmed: 'bg-[#0b240b] border-[#4dfc4d] text-[#76ff76] font-bold shadow-[0_0_8px_rgba(77,252,77,0.4)]',
    evidenceSuspected: 'bg-[#262406] border-[#d4cf28] text-[#f5f047] animate-pulse shadow-[0_0_8px_rgba(245,240,71,0.3)]',
    evidenceRuledOut: 'bg-[#240808] border-[#8a1c1c] text-[#eb5b5b] line-through',
    hasScanlines: true,
  },
  oled: {
    id: 'oled',
    name: 'OLED Pure Black',
    badge: 'ZERO BLEED',
    description: 'True #000000 contrast-maximized interface with sharp borders to minimize dark-room eye strain.',
    containerBg: 'bg-black',
    cardBg: 'bg-black',
    cardBorder: 'border-[#222222] shadow-none',
    headerBg: 'bg-black border-[#262626]',
    fontClass: 'font-sans',
    textPrimary: 'text-white',
    textSecondary: 'text-neutral-300',
    textMuted: 'text-neutral-400',
    evidenceNormal: 'bg-neutral-950 border-neutral-900 text-neutral-400',
    evidenceConfirmed: 'bg-emerald-950/60 border-emerald-400 text-emerald-200 font-bold',
    evidenceSuspected: 'bg-amber-950/60 border-amber-400 text-amber-200 animate-pulse',
    evidenceRuledOut: 'bg-neutral-950 border-rose-900/60 text-rose-400 line-through',
    hasScanlines: false,
  },
};
