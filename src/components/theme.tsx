/** 主题系统：深/浅模式 × 6 套预设主题色，统一色板、间距刻度与排版阶梯 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { AccentKey, AppSettings } from '@/types';
import { BG_PALETTES, cardTintFromPalette, findGradient, paletteFromImage, paletteFromSolid, type BgPalette } from './AppBackground';

export interface ThemeColors {
  bg: string;
  bgElevated: string;
  card: string;
  cardSoft: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  /** 英雄区渐变两端色 */
  heroFrom: string;
  heroTo: string;
  accent: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  onPrimary: string;
  tabInactive: string;
  /** 导航起点等次级强调色 */
  info: string;
  /** 更弱的占位/辅助文字 */
  textFaint: string;
}

interface Palette {
  name: string;
  light: Pick<ThemeColors, 'primary' | 'primarySoft' | 'heroFrom' | 'heroTo' | 'accent' | 'onPrimary'>;
  dark: Pick<ThemeColors, 'primary' | 'primarySoft' | 'heroFrom' | 'heroTo' | 'accent' | 'onPrimary'>;
}

/** 6 套预设主题色：中性底色由深/浅模式决定，强调色系随主题色变化 */
export const PALETTES: Record<AccentKey, Palette> = {
  inkGreen: {
    name: '墨绿',
    light: { primary: '#2f7d63', primarySoft: '#e2f0ea', heroFrom: '#2f7d63', heroTo: '#4fa583', accent: '#e0803a', onPrimary: '#ffffff' },
    dark: { primary: '#5fc39c', primarySoft: '#1d3730', heroFrom: '#1d4d3f', heroTo: '#2f7d63', accent: '#f0a468', onPrimary: '#0d1512' },
  },
  graphiteBlue: {
    name: '石墨蓝',
    light: { primary: '#2f5f8f', primarySoft: '#e3edf6', heroFrom: '#2f5f8f', heroTo: '#4f86bd', accent: '#d9822b', onPrimary: '#ffffff' },
    dark: { primary: '#6fb0e0', primarySoft: '#1b3247', heroFrom: '#1c3348', heroTo: '#2f5f8f', accent: '#eaa75a', onPrimary: '#0b141c' },
  },
  duskPurple: {
    name: '暮紫',
    light: { primary: '#6552a8', primarySoft: '#eceaf8', heroFrom: '#6552a8', heroTo: '#8a76c9', accent: '#c96f4a', onPrimary: '#ffffff' },
    dark: { primary: '#a896e8', primarySoft: '#2a2545', heroFrom: '#282344', heroTo: '#5a4a95', accent: '#e0956f', onPrimary: '#12101f' },
  },
  warmAmber: {
    name: '暖橙',
    light: { primary: '#b56a25', primarySoft: '#f8ecdd', heroFrom: '#b56a25', heroTo: '#d9944a', accent: '#3f7d6a', onPrimary: '#ffffff' },
    dark: { primary: '#e8a45f', primarySoft: '#3a2a18', heroFrom: '#3a2817', heroTo: '#a8642a', accent: '#6fc3a8', onPrimary: '#1a120a' },
  },
  celadon: {
    name: '青瓷',
    light: { primary: '#2f818d', primarySoft: '#e0f0f2', heroFrom: '#2f818d', heroTo: '#54a9b4', accent: '#cf7a4e', onPrimary: '#ffffff' },
    dark: { primary: '#6cc4cd', primarySoft: '#17383d', heroFrom: '#16383d', heroTo: '#2f818d', accent: '#eaa074', onPrimary: '#0a1618' },
  },
  wineRed: {
    name: '酒红',
    light: { primary: '#9c3f52', primarySoft: '#f7e6ea', heroFrom: '#9c3f52', heroTo: '#c06478', accent: '#4f8f7a', onPrimary: '#ffffff' },
    dark: { primary: '#e08a9c', primarySoft: '#3a1c25', heroFrom: '#3a1c25', heroTo: '#9c3f52', accent: '#7ac3a8', onPrimary: '#1a0d11' },
  },
};

export const ACCENT_ORDER: AccentKey[] = ['inkGreen', 'graphiteBlue', 'duskPurple', 'warmAmber', 'celadon', 'wineRed'];

const neutralLight = {
  bg: '#f5f6f3',
  bgElevated: '#ffffff',
  card: '#ffffff',
  cardSoft: '#f0f2ee',
  border: '#e3e6e0',
  text: '#171c1a',
  textSecondary: '#4a534f',
  textMuted: '#8b948f',
  danger: '#c8452f',
  dangerSoft: '#fbe9e5',
  success: '#2f7d63',
  warning: '#b8860b',
  tabInactive: '#9aa39e',
  info: '#4a7fb5',
  textFaint: '#c2c9c4',
};

const neutralDark = {
  bg: '#0f1211',
  bgElevated: '#171b1a',
  card: '#1b201f',
  cardSoft: '#242a28',
  border: '#2d3432',
  text: '#e9ede9',
  textSecondary: '#b2bcb7',
  textMuted: '#7b8581',
  danger: '#f0765f',
  dangerSoft: '#3a2320',
  success: '#5fc39c',
  warning: '#d9b24a',
  tabInactive: '#5b6561',
  info: '#6fb0e0',
  textFaint: '#454f4b',
};

interface ThemeValue {
  mode: 'light' | 'dark';
  accent: AccentKey;
  colors: ThemeColors;
  /** 当前主题色是否由自定义背景驱动（此时「显示模式」被背景锁定） */
  bgDriven: boolean;
}

const ThemeContext = createContext<ThemeValue>({
  mode: 'light',
  accent: 'inkGreen',
  colors: { ...neutralLight, ...PALETTES.inkGreen.light },
  bgDriven: false,
});

/** 由背景推导主题色板：渐变按预设色系、纯色按背景色、图片按明暗倾向。
 *  ⚠️ 这是「用了蓝色渐变但开关还是绿色」的修复点：自定义背景时强调色不再取 accentColor，
 *  而是取背景主色，开关/进度条/英雄区/卡片描边全部跟着背景走。 */
function paletteFromBackground(
  bg: Pick<AppSettings, 'bgMode' | 'bgColor' | 'bgGradient' | 'bgThemeKey' | 'bgImageMode'>,
  mode: 'light' | 'dark',
): BgPalette | null {
  if (bg.bgMode === 'solid' && bg.bgColor) return paletteFromSolid(bg.bgColor);
  if (bg.bgMode === 'gradient') {
    const preset = findGradient(bg.bgGradient);
    const key = bg.bgThemeKey === 'auto' ? preset.key : bg.bgThemeKey;
    const entry = BG_PALETTES[key] ?? BG_PALETTES[preset.key] ?? BG_PALETTES.aurora;
    return mode === 'dark' ? entry.dark : entry.light;
  }
  if (bg.bgMode === 'image') return paletteFromImage(bg.bgImageMode);
  return null;
}

export function ThemeProvider({
  children, themeMode, accent, background,
}: {
  children: ReactNode;
  themeMode: AppSettings['themeMode'];
  accent: AccentKey;
  /** 自定义背景设置：非「跟随主题」时由背景决定强调色与深浅模式 */
  background?: Pick<AppSettings, 'bgMode' | 'bgColor' | 'bgGradient' | 'bgThemeKey' | 'bgImageMode'>;
}) {
  const system = useColorScheme();
  const value = useMemo<ThemeValue>(() => {
    const systemMode: 'light' | 'dark' =
      themeMode === 'system' ? (system === 'dark' ? 'dark' : 'light') : themeMode;
    const bgPalette = background ? paletteFromBackground(background, systemMode) : null;
    // 自定义背景时：深浅模式由背景明暗决定（浅色背景配深色文字，反之亦然），
    // 强调色取背景主色 —— 用户不必再手动切「浅色/深色」，也不会出现蓝背景配绿开关。
    const mode: 'light' | 'dark' = bgPalette ? bgPalette.mode : systemMode;
    const palette = PALETTES[accent] ?? PALETTES.inkGreen;
    const base = mode === 'dark' ? neutralDark : neutralLight;
    const colors: ThemeColors = bgPalette
      ? {
          ...base,
          primary: bgPalette.primary,
          primarySoft: bgPalette.primarySoft,
          heroFrom: bgPalette.heroFrom,
          heroTo: bgPalette.heroTo,
          accent: bgPalette.accent,
          onPrimary: bgPalette.onPrimary,
          // 卡片/描边也带背景色系，避免「背景是极光青、卡片却是灰白」的割裂感
          ...cardTintFromPalette(bgPalette, base.card),
        }
      : { ...base, ...(mode === 'dark' ? palette.dark : palette.light) };
    // 关键日志：确认背景驱动是否生效、强调色与卡片色实际取到了什么（排查「极光渐变卡片还是绿色」）
    console.info(
      `[theme] 背景驱动=${bgPalette !== null} 模式=${mode} 强调色=${colors.primary} 卡片=${colors.card}`
      + (bgPalette ? `（背景色板 primary=${bgPalette.primary}）` : `（accentColor=${accent}）`),
    );
    return { mode, accent, colors, bgDriven: bgPalette !== null };
  }, [themeMode, accent, system, background]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** 全局间距刻度：统一卡片内边距与区块间隔 */
export const SP = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 } as const;

/** 排版阶梯：字号收敛到 5 档 */
export const TYPE = {
  display: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  body: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12.5, fontWeight: '500' },
  num: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
} as const;

/** 课程颜色在深色模式下的柔和处理 */
export function courseTint(color: string, mode: 'light' | 'dark'): { bg: string; fg: string } {
  if (mode === 'dark') {
    return { bg: `${color}33`, fg: color };
  }
  return { bg: `${color}1f`, fg: color };
}
