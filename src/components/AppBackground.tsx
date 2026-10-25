/** 自定义背景渲染层：纯色 / 渐变 / 图片，统一由 settings 驱动。
 *
 *  ⚠️ 设计约束（沿用「深色切 Tab 白闪」的教训）：
 *  背景层必须是**静止的 absoluteFill 底衬**，永远不参与任何动画；页面内容叠在它之上。
 *  任何一帧只要背景层没铺满，露出的就是 react-native-screens 的原生白色 Surface。
 *
 *  ⚠️ 可读性：图片/渐变背景上直接放文字会看不清，故统一叠一层「主题底色遮罩」，
 *  强度由 settings.bgDim（0~80）控制；纯色模式不叠遮罩（用户自己选的颜色）。
 */
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from './theme';
import { useApp } from '@/hooks/useAppData';

/** 渐变预设：每套给出深/浅两种模式下的两端色，保证与主题明暗一致 */
export interface GradientPreset {
  key: string;
  name: string;
  light: [string, string, string];
  dark: [string, string, string];
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { key: 'aurora', name: '极光', light: ['#e8f5ef', '#d6ecf7', '#f3e9f7'], dark: ['#0f1f1a', '#122430', '#1d1730'] },
  { key: 'sunset', name: '日落', light: ['#fdeee0', '#fbdcd0', '#f6e6f0'], dark: ['#2a1a12', '#33191c', '#241528'] },
  { key: 'ocean', name: '深海', light: ['#e3f0f8', '#d5e6f5', '#e8eef8'], dark: ['#0c1a26', '#0f2233', '#141d2e'] },
  { key: 'forest', name: '林间', light: ['#eaf3e6', '#dcecd8', '#eef2e2'], dark: ['#131f14', '#16261a', '#1a2418'] },
  { key: 'dusk', name: '暮色', light: ['#f0eaf8', '#e6e2f6', '#f6eaf2'], dark: ['#1a1526', '#1e1a30', '#251a2a'] },
  { key: 'mono', name: '素白', light: ['#f7f7f5', '#eeeeec', '#f4f4f2'], dark: ['#101211', '#151817', '#1a1d1c'] },
];

export function findGradient(key: string): GradientPreset {
  return GRADIENT_PRESETS.find((g) => g.key === key) ?? GRADIENT_PRESETS[0];
}

/** 背景色板：由背景本身推导出「强调色 + 深浅模式」，让开关、卡片、英雄区跟着背景走。
 *  ⚠️ 这是「用了蓝色渐变但开关还是绿色」的根因修复：此前主题色只由 accentColor 决定，
 *  与背景完全脱钩。现在自定义背景时主题色默认取背景主色，用户也可手动指定。 */
export interface BgPalette {
  /** 强调色（开关、进度条、选中态） */
  primary: string;
  /** 强调色浅底（次级按钮、标签底） */
  primarySoft: string;
  /** 英雄区渐变两端 */
  heroFrom: string;
  heroTo: string;
  /** 辅助强调色（第二进度条、待上课程图例） */
  accent: string;
  /** 强调色上的文字色 */
  onPrimary: string;
  /** 背景明暗：决定卡片/文字用深色还是浅色中性板 */
  mode: 'light' | 'dark';
}

/** 背景色板预设：与渐变预设一一对应，保证「选哪个渐变，主题色就是哪个色系」。
 *  ⚠️ 极光渐变本身是「绿→青→紫」的冷色渐变，主色必须取渐变里的青蓝，不能取绿，
 *  否则用户选了极光却看到满屏绿色卡片（这正是「极光渐变卡片是绿色」的根因）。 */
export const BG_PALETTES: Record<string, { name: string; light: BgPalette; dark: BgPalette }> = {
  aurora: {
    name: '极光青',
    light: { primary: '#2f7d8f', primarySoft: '#e0f0f3', heroFrom: '#2f7d8f', heroTo: '#4f9fb5', accent: '#8a76c9', onPrimary: '#ffffff', mode: 'light' },
    dark: { primary: '#5fc0d0', primarySoft: '#173238', heroFrom: '#173a42', heroTo: '#2f7d8f', accent: '#a896e8', onPrimary: '#0a1618', mode: 'dark' },
  },
  sunset: {
    name: '日落橙',
    light: { primary: '#b56a25', primarySoft: '#f8ecdd', heroFrom: '#b56a25', heroTo: '#d9944a', accent: '#3f7d6a', onPrimary: '#ffffff', mode: 'light' },
    dark: { primary: '#e8a45f', primarySoft: '#3a2a18', heroFrom: '#3a2817', heroTo: '#a8642a', accent: '#6fc3a8', onPrimary: '#1a120a', mode: 'dark' },
  },
  ocean: {
    name: '深海蓝',
    light: { primary: '#2f5f8f', primarySoft: '#e3edf6', heroFrom: '#2f5f8f', heroTo: '#4f86bd', accent: '#d9822b', onPrimary: '#ffffff', mode: 'light' },
    dark: { primary: '#6fb0e0', primarySoft: '#1b3247', heroFrom: '#1c3348', heroTo: '#2f5f8f', accent: '#eaa75a', onPrimary: '#0b141c', mode: 'dark' },
  },
  forest: {
    name: '林间绿',
    light: { primary: '#3f7d4a', primarySoft: '#e4f0e2', heroFrom: '#3f7d4a', heroTo: '#5fa268', accent: '#c07a3a', onPrimary: '#ffffff', mode: 'light' },
    dark: { primary: '#7cc487', primarySoft: '#1c3320', heroFrom: '#1b3a22', heroTo: '#3f7d4a', accent: '#e0a468', onPrimary: '#0c150e', mode: 'dark' },
  },
  dusk: {
    name: '暮色紫',
    light: { primary: '#6552a8', primarySoft: '#eceaf8', heroFrom: '#6552a8', heroTo: '#8a76c9', accent: '#c96f4a', onPrimary: '#ffffff', mode: 'light' },
    dark: { primary: '#a896e8', primarySoft: '#2a2545', heroFrom: '#282344', heroTo: '#5a4a95', accent: '#e0956f', onPrimary: '#12101f', mode: 'dark' },
  },
  mono: {
    name: '素雅灰',
    light: { primary: '#4a534f', primarySoft: '#eceeec', heroFrom: '#4a534f', heroTo: '#6f7a75', accent: '#8b948f', onPrimary: '#ffffff', mode: 'light' },
    dark: { primary: '#b2bcb7', primarySoft: '#242a28', heroFrom: '#2a302e', heroTo: '#4a534f', accent: '#7b8581', onPrimary: '#0f1211', mode: 'dark' },
  },
};

/** 纯色背景 → 色板：按背景明暗自动选深浅中性板，强调色取背景色的高饱和版本 */
export function paletteFromSolid(hex: string): BgPalette {
  const light = isLightColor(hex);
  const primary = light ? darken(hex, 0.42) : lighten(hex, 0.45);
  return {
    primary,
    primarySoft: light ? mix(hex, '#ffffff', 0.55) : mix(hex, '#000000', 0.45),
    heroFrom: primary,
    heroTo: light ? darken(hex, 0.2) : lighten(hex, 0.2),
    accent: light ? '#c07a3a' : '#e0a468',
    onPrimary: light ? '#ffffff' : '#0d1512',
    mode: light ? 'light' : 'dark',
  };
}

/** 图片背景 → 色板：无法取色，按用户选的明暗倾向给中性色板 */
export function paletteFromImage(mode: 'light' | 'dark'): BgPalette {
  return mode === 'dark'
    ? { primary: '#8fb8a8', primarySoft: '#1f2a26', heroFrom: '#1f2a26', heroTo: '#3a4a44', accent: '#d9a86a', onPrimary: '#0d1512', mode: 'dark' }
    : { primary: '#3f6b5c', primarySoft: '#e4efe9', heroFrom: '#3f6b5c', heroTo: '#5f8f7d', accent: '#c07a3a', onPrimary: '#ffffff', mode: 'light' };
}

/** 取当前背景对应的色板；bgMode='theme' 时返回 null（走原 accentColor 主题） */
export function resolveBgPalette(settings: {
  bgMode: string; bgColor: string; bgGradient: string; bgThemeKey: string; bgImageMode: 'light' | 'dark';
}, mode: 'light' | 'dark'): BgPalette | null {
  if (settings.bgMode === 'solid' && settings.bgColor) return paletteFromSolid(settings.bgColor);
  if (settings.bgMode === 'gradient') {
    const preset = findGradient(settings.bgGradient);
    const key = settings.bgThemeKey === 'auto' ? preset.key : settings.bgThemeKey;
    const entry = BG_PALETTES[key] ?? BG_PALETTES[preset.key] ?? BG_PALETTES.aurora;
    return mode === 'dark' ? entry.dark : entry.light;
  }
  if (settings.bgMode === 'image') return paletteFromImage(settings.bgImageMode);
  return null;
}

/** 卡片底色：自定义背景时不再用纯白/纯黑，而是「背景主色 + 中性底」的极淡混色，
 *  让卡片也带上背景色系（极光渐变 → 淡青卡片），而不是与背景脱节的灰白块。 */
export function cardTintFromPalette(pal: BgPalette, base: string): { card: string; cardSoft: string; border: string } {
  if (pal.mode === 'dark') {
    return {
      card: mix(base, pal.primary, 0.1),
      cardSoft: mix(base, pal.primary, 0.18),
      border: mix(base, pal.primary, 0.26),
    };
  }
  return {
    card: mix(base, pal.primary, 0.05),
    cardSoft: mix(base, pal.primary, 0.11),
    border: mix(base, pal.primary, 0.2),
  };
}

/** 判断颜色是否偏亮（用于决定中性板与勾选符号颜色） */
export function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 变暗：ratio 0~1 */
export function darken(hex: string, ratio: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r * (1 - ratio), g * (1 - ratio), b * (1 - ratio));
}

/** 变亮：ratio 0~1 */
export function lighten(hex: string, ratio: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio);
}

/** 混色：ratio 为 target 占比 */
export function mix(hex: string, target: string, ratio: number): string {
  const [r1, g1, b1] = parseHex(hex);
  const [r2, g2, b2] = parseHex(target);
  return toHex(r1 + (r2 - r1) * ratio, g1 + (g2 - g1) * ratio, b1 + (b2 - b1) * ratio);
}

/** 纯色预设：给用户几个省心的选择，也可自定义 */
export const SOLID_PRESETS: string[] = [
  '#f5f6f3', '#eef2f7', '#f7f0ea', '#f2eef7', '#eaf3ee', '#f7f2e6',
  '#0f1211', '#141a1f', '#1a1512', '#171325', '#101a16', '#1c1a14',
];

/** 背景层：铺满父容器，不参与动画。父容器需 position:relative 或直接作为根 */
export function AppBackground() {
  const { colors, mode } = useTheme();
  const { settings } = useApp();
  const bgMode = settings.bgMode;
  const dim = Math.min(Math.max(settings.bgDim, 0), 80) / 100;

  if (bgMode === 'solid' && settings.bgColor) {
    return <View style={[styles.fill, { backgroundColor: settings.bgColor }]} pointerEvents="none" />;
  }

  if (bgMode === 'gradient') {
    const preset = findGradient(settings.bgGradient);
    // 深浅由背景色板决定（浅色渐变配浅色底、深色渐变配深色底），不再跟随系统深浅
    const stops = mode === 'dark' ? preset.dark : preset.light;
    return (
      <View style={styles.fill} pointerEvents="none">
        <LinearGradient colors={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
      </View>
    );
  }

  if (bgMode === 'image' && settings.bgImageUri) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.bg }]} pointerEvents="none">
        <Image source={{ uri: settings.bgImageUri }} style={styles.fill} resizeMode="cover" />
        {/* 遮罩：保证文字可读，强度可调 */}
        <View style={[styles.fill, { backgroundColor: colors.bg, opacity: dim }]} />
      </View>
    );
  }

  // theme：跟随主题底色
  return <View style={[styles.fill, { backgroundColor: colors.bg }]} pointerEvents="none" />;
}

/** 当前背景的「代表色」：用于原生容器层（Stack contentStyle / Tabs contentStyle）铺底，
 *  避免过渡瞬间露出白色 Surface。渐变/图片取第一端色或主题底色。 */
export function useBackgroundBaseColor(): string {
  const { colors, mode } = useTheme();
  const { settings } = useApp();
  if (settings.bgMode === 'solid' && settings.bgColor) return settings.bgColor;
  if (settings.bgMode === 'gradient') {
    const preset = findGradient(settings.bgGradient);
    return (mode === 'dark' ? preset.dark : preset.light)[0];
  }
  return colors.bg;
}

/** 背景色板对应的「中性底色」：卡片/文字用哪套深浅板，由背景明暗决定 */
export function useBgNeutralMode(): 'light' | 'dark' {
  const { mode } = useTheme();
  return mode;
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});