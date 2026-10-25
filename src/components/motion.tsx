/** 动效基元与图表：级联进场、数字滚动、环形进度、条形进度、按压回弹
 *
 * 性能取向：所有可视动画都跑在 Reanimated UI 线程（withTiming / entering 布局动画），
 * JS 线程不再逐帧 setState；进场动画通过「聚焦重播」机制在每次进入页面时重新播放。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp as ReFadeInUp,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import type { ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTheme } from './theme';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** 让 svg 原生组件接受 animatedProps（官方推荐做法，替代 createAnimatedComponent） */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** 进场动画的「重播档位」：屏幕每次获得焦点时 +1。
 *  Tabs 默认不卸载页面，因此不能依赖 mount 触发；改为聚焦计数驱动重播。
 *  ⚠️ 只能在「屏幕组件」（src/app/** 的默认导出）顶层调用一次：
 *  expo-router 的 useFocusEffect 内部依赖 useNavigation，脱离导航上下文会抛异常；
 *  上一版用 try/catch 包裹导致 Hook 数量在两次渲染间变化，触发 Invalid hook call。
 *  因此这里不做任何条件包裹，FadeInUp/PageFade 也不再自行调用，改由页面把 runId 作为 prop 下发。 */
export function useReplayId(): number {
  const [runId, setRunId] = useState(0);
  const replay = useCallback(() => {
    console.info('[motion] 屏幕重新聚焦，进场动画重播（runId+1）');
    setRunId((n) => n + 1);
  }, []);
  useFocusEffect(replay);
  return runId;
}

/** 进场：淡入 + 上移，delayMs 用于列表级联。
 *  runId 由所在屏幕顶层的 useReplayId() 下发，每次进入页面 key 变化 → 重新播放进场动画。
 *  ⚠️ 本组件不得自行调用导航类 Hook（Hook 必须留在屏幕顶层，否则 React 槽位错位报 Invalid hook call）。 */
export function FadeInUp({
  children,
  delayMs = 0,
  distance = 18,
  runId = 0,
}: {
  children: ReactNode;
  delayMs?: number;
  distance?: number;
  runId?: number;
}) {
  const entering = useMemo(
    () => (distance > 12 ? FadeInDown : ReFadeInUp).duration(420).delay(delayMs).easing(EASE),
    [delayMs, distance],
  );
  return (
    <Animated.View key={runId} entering={Platform.OS === 'web' ? undefined : entering}>
      {children}
    </Animated.View>
  );
}

/** 数字滚动：value 变化时平滑过渡。
 *  UI 线程推进动画，JS 侧以 ~30fps 轮询 shared value，且只在整数显示值真正变化时 setState。 */
export function CountUp({ value, style, suffix, prefix }: { value: number; style?: object; suffix?: string; prefix?: string }) {
  const [shown, setShown] = useState(value);
  const progress = useSharedValue(1);
  const fromRef = useRef(value);
  const toRef = useRef(value);
  const lastInt = useRef(Math.round(value));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const from = lastInt.current;
    if (from === value) return;
    fromRef.current = from;
    toRef.current = value;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 700, easing: EASE });
    // 轮询把 UI 线程进度映射为整数文本：仅在整数变化时更新 React 状态
    if (timerRef.current == null) {
      timerRef.current = setInterval(() => {
        const p = Math.min(1, Math.max(0, progress.value));
        const next = Math.round(fromRef.current + (toRef.current - fromRef.current) * p);
        if (next !== lastInt.current) {
          lastInt.current = next;
          setShown(next);
        }
        if (p >= 1 && timerRef.current != null) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          if (lastInt.current !== toRef.current) {
            lastInt.current = toRef.current;
            setShown(toRef.current);
          }
        }
      }, 33);
    }
  }, [value, progress]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <Text style={style}>
      {prefix}
      {shown}
      {suffix}
    </Text>
  );
}

/** 环形进度：SVG 描边动画（UI 线程 animatedProps）+ 中心内容 */
export function RingProgress({
  progress,
  size = 132,
  stroke = 12,
  color,
  trackColor,
  from,
  to,
  children,
}: {
  progress: number; // 0-1
  size?: number;
  stroke?: number;
  color: string;
  trackColor: string;
  /** 渐变两端色，传入则描边使用渐变 */
  from?: string;
  to?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = useSharedValue(c);
  useEffect(() => {
    offset.value = withTiming(c * (1 - clamped), { duration: 950, easing: EASE });
  }, [clamped, c, offset]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));
  // 稳定 id：由尺寸与颜色派生，避免每次 render 重建 defs 导致 SVG 重绘
  const gid = useMemo(() => `rg_${size}_${stroke}_${from ?? color}_${to ?? ''}`.replace(/[^a-zA-Z0-9_]/g, ''), [size, stroke, from, to, color]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {from && to ? (
          <Defs>
            <SvgGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </SvgGradient>
          </Defs>
        ) : null}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={from && to ? `url(#${gid})` : color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}

/** 条形进度：填充层宽度直接等于 ratio%（左锚定，天然从左往右生长），
 *  再用一层与轨道同色的遮罩通过 left 百分比从「覆盖」滑到「移出」实现揭示动画。
 *  ⚠️ 不用 scaleX + transformOrigin：此前写 transformOriginX:0 不是有效样式键、被忽略，
 *  scaleX 以视图中心为原点 → 进度条表现为「从中间向两边扩散」。遮罩揭示方案不依赖缩放原点，
 *  在任何 RN/Reanimated 版本上都稳定从左往右填充。 */
export function BarProgress({ ratio, color, trackColor, height = 8 }: { ratio: number; color: string; trackColor: string; height?: number }) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const reveal = useSharedValue(0);
  useEffect(() => {
    console.info(`[bar-progress] 目标占比=${(clamped * 100).toFixed(1)}%，播放从左往右揭示动画`);
    reveal.value = withTiming(1, { duration: 900, easing: EASE });
  }, [clamped, reveal]);
  // 遮罩左边缘从 0% 平移到 100%（即完全移出填充区右侧），逐步露出下方彩色进度。
  // ⚠️ translateX 只接受像素数值、无法跟随容器宽度；改用 left 百分比定位才能覆盖任意宽度的进度条。
  const maskStyle = useAnimatedStyle(() => ({
    left: `${reveal.value * 100}%`,
  }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden', flex: 1 }}>
      {/* 彩色填充：宽度=ratio%，左锚定，永远从左边缘开始 */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${clamped * 100}%`,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
      {/* 揭示遮罩：与轨道同色，从左侧盖住未显示部分，随动画整体右移露出进度 */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            backgroundColor: trackColor,
          },
          maskStyle,
        ]}
      />
    </View>
  );
}

/** 按压回弹：Reanimated 共享值驱动 scale（children 支持节点或渲染函数两种写法） */
export function SpringPressable({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
}: {
  children: ReactNode | ((pressed: boolean) => ReactNode);
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: object;
}) {
  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        if (disabled) return;
        pressScale.value = withTiming(0.96, { duration: 120, easing: EASE });
      }}
      onPressOut={() => {
        pressScale.value = withTiming(1, { duration: 160, easing: EASE });
      }}
      style={[style, animStyle]}
    >
      {typeof children === 'function' ? children(false) : children}
    </Pressable>
  );
}

/** Tab 图标切换动画：聚焦时弹跳放大一次 + 轻微上移回弹（底部导航切换反馈） */
export function IconPop({ active, children }: { active: boolean; children: ReactNode }) {
  const pop = useSharedValue(1);
  const lift = useSharedValue(0);
  useEffect(() => {
    if (active) {
      pop.value = 1.22;
      pop.value = withTiming(1, { duration: 300, easing: EASE });
      lift.value = -4;
      lift.value = withTiming(0, { duration: 300, easing: EASE });
    }
  }, [active, pop, lift]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { translateY: lift.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** 页面级淡入：外部 key（如周次）或屏幕聚焦变化时整块淡入；runId 由屏幕顶层下发 */
export function PageFade({ children, runId = 0, fadeKey }: { children: ReactNode; runId?: number; fadeKey?: string | number }) {
  const entering = useMemo(() => ReFadeInUp.duration(320).easing(EASE), []);
  return (
    <Animated.View key={`${fadeKey ?? ''}-${runId}`} entering={Platform.OS === 'web' ? undefined : entering}>
      {children}
    </Animated.View>
  );
}

/** 主题色快捷获取（供页面在 JSX 外取 accent 时使用） */
export function useAccent() {
  return useTheme().accent;
}
