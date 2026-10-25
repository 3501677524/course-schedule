/** 底部导航：JS Tabs + react-native-svg 图标，保证 Web 预览与真机一致 */
import { Tabs } from 'expo-router';
import type { ColorValue, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from './theme';
import { useBackgroundBaseColor } from './AppBackground';
import { IconPop } from './motion';

function TabIcon({ d, color, size = 24 }: { d: string; color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={String(color)}>
      <Path d={d} />
    </Svg>
  );
}

const PATHS = {
  today: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm.5-13H11v6l5.2 3.1.8-1.3-4.5-2.7V7z',
  week: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5z',
  preview: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  mine: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v2h16v-2c0-3.3-4.7-5-8-5z',
};

/** 原生 Screen 容器底色：expo-router TabsProps 类型未收录 contentStyle，
 *  但底层 react-navigation bottom-tabs（native screens）会实际消费它——
 *  用辅助函数把整份 options 收敛为合法类型，避免逐键断言散落 */
const BG = (bg: string): ViewStyle => ({ backgroundColor: bg });
const tabOptions = (options: Record<string, unknown>) => options as never;

export function AppTabs() {
  const { colors } = useTheme();
  // 自定义背景（纯色/渐变/图片）时，原生容器层要铺背景代表色，否则过渡瞬间露白
  const bg = useBackgroundBaseColor();
  console.info(`[tabs] Tab 原生容器底色已应用：${bg}（深色切页白闪修复）`);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: { backgroundColor: colors.bgElevated, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // ⚠️ 深色切 Tab 白闪修复：react-native-screens 的每个 tab screen 是独立原生
        // Surface，缺省背景为白色；过渡瞬间 JS 内容尚未绘制就会露出白底。给每个
        // Tabs.Screen 传 contentStyle 把主题底色铺到原生容器上。
      }}
    >
      {/* 今日页（index）即打开软件的主界面；Tab 顺序为 今日/本周/今日预览/我的
          切换动画：图标弹跳（IconPop）+ 各页 FadeInUp 级联进场
          ⚠️ JS Tabs 的 screen 不能包 Animated 容器——会破坏 react-native-screens 的原生视图层级导致切页空白 */}
      <Tabs.Screen name="index" options={tabOptions({ title: '今日', contentStyle: BG(bg), tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => <IconPop active={focused}><TabIcon d={PATHS.today} color={color} /></IconPop> })} />
      <Tabs.Screen name="week" options={tabOptions({ title: '本周', contentStyle: BG(bg), tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => <IconPop active={focused}><TabIcon d={PATHS.week} color={color} /></IconPop> })} />
      <Tabs.Screen name="preview" options={tabOptions({ title: '今日预览', contentStyle: BG(bg), tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => <IconPop active={focused}><TabIcon d={PATHS.preview} color={color} /></IconPop> })} />
      {/* 考试、作业已收纳进「我的」，不再作为一级入口 */}
      <Tabs.Screen name="exam" options={tabOptions({ href: null, contentStyle: BG(bg) })} />
      <Tabs.Screen name="homework" options={tabOptions({ href: null, contentStyle: BG(bg) })} />
      <Tabs.Screen name="mine" options={tabOptions({ title: '我的', contentStyle: BG(bg), tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => <IconPop active={focused}><TabIcon d={PATHS.mine} color={color} /></IconPop> })} />
    </Tabs>
  );
}
