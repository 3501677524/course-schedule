/** 全屏二级面板：以「与屏幕等高的固定容器」呈现，背景不透明，彻底遮住一级菜单；
 *  Android 硬件返回键优先关闭面板而不是退回上一个 Tab。
 *  ⚠️ 不用 RN Modal：Modal 在 react-native-web 上没有实现，web 预览会整块空白。
 *  ⚠️ 不能嵌在页面 ScrollView 里：绝对定位的包含块是被内容撑开的滚动容器，面板高度会塌成
 *  内容高、随父级一起滚动（表现为「面板内无法上下滑动」「关掉后回到顶部」）。
 *  方案：mine.tsx 在 sheet!==null 时把本组件渲染为 Screen(scroll=false) 的唯一子节点，
 *  外层 flex:1 + 内部 ScrollView flex:1 独立滚动；同时注册 BackHandler 拦截系统侧滑/返回手势。 */
/* --------------------------------- 导入 --------------------------------- */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * 全屏二级面板容器（受控显隐 + 进出场动画）。
 * @param visible 父级控制的显示态；false 时播放下滑退场动画，动画结束调用 onClosed 让父级真正卸载
 * @param onClosed 退场动画播完后的回调（父级在此 setSheet(null)）
 * @param onRequestClose 请求关闭（硬件返回键触发）：父级把 visible 置 false，从而走退场动画
 * ⚠️ 关闭不再由本组件内部直接卸载，而是「播动画 → onClosed」，保证退出有动画。
 */
export function FullSheet({
  title,
  visible,
  onClosed,
  onRequestClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClosed: () => void;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // 进出场动画：整层从底部上滑打开、向下滑出关闭（跑在 UI 线程）。
  // ⚠️ FullSheet 是覆盖在页面上的 flex:1 全屏层，不是 Tabs/Stack 的 screen，
  // 因此可以安全包 Animated 容器，不会破坏 react-native-screens 的原生视图层级。
  // 关键：初始值恒为 0（哪怕 visible=true），这样挂载后 useEffect 才能观察到 0→1 的位移，
  // 真正播进场动画；若初始就是 1，withTiming(1→1) 没有变化、进场动画等于没播。
  // ⚠️ 深色模式「打开二级面板闪白屏」根因：本层原本还叠加 opacity 0→1 淡入，而 mine.tsx
  // 在 sheet!==null 时不渲染一级菜单，面板背后是空的原生 Screen Surface（Android 缺省白色）；
  // 淡入期间半透明面板让白底透出来 → 闪白。故彻底去掉 opacity，只做 translateY 位移，
  // 背景色始终 100% 不透明。
  const slide = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      console.info(`[sheet] 打开「${title}」，播放上滑进场动画（双层结构：静止底衬=${colors.bg} 铺满屏幕，位移层仅 translateY，深色闪白彻底根治）`);
      // 起点归零后动画到 1，形成可见的上滑位移。
      slide.value = withTiming(1, { duration: 280, easing: EASE });
    } else {
      console.info(`[sheet] 关闭「${title}」，播放下滑退场动画后卸载`);
      // ⚠️ finishCallback 运行在 UI 线程 worklet，调用 JS 回调必须经 runOnJS 桥接，否则报 _worklet 缺失。
      slide.value = withTiming(0, { duration: 240, easing: EASE }, () => runOnJS(onClosed)());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, title]);

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    // 硬件返回键：拦截默认行为（退回上一个 Tab），改为触发退场动画。
    // ⚠️ 必须返回 true 表示已处理，同时调用 onRequestClose 让父级把 visible 置 false——
    // 此前只 return true 不调用任何关闭逻辑，导致「手机返回键按了没反应」。
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      console.info(`[sheet] 硬件返回键关闭「${title}」，触发退场动画`);
      onRequestClose();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, title]);

  // ⚠️ 只位移、不淡入：opacity 会让深色模式下面板背后的白色原生 Surface 透出（闪白根因）。
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - slide.value) * 96 }],
  }));

  return (
    // ⚠️ 深色模式「打开二级面板仍闪白」的第二层根因：位移动画与背景不能是同一个 View。
    // 此前结构是 <View flex:1 bg><Animated.View flex:1 bg translateY/></View>——外层 View
    // 在 screen 内被 react-native-screens 的原生容器裁剪，而 Android 上每个 screen 是独立
    // 原生 Surface、缺省底色为**白色**；一旦 JS 侧这一帧还没绘制完（或底部 Tab 栏区域属于
    // screen 之外），露出的就是那层白。故本组件改为「自身即静止全屏底衬 + 内部位移层」：
    // backdrop 用 absoluteFill 铺满并永远不着色动画，sheet 只做 translateY，任何一帧
    // 屏幕范围内都有不透明主题底色。
    <View style={[styles.backdrop, { backgroundColor: colors.bg }]}>
      <Animated.View style={[styles.sheet, { backgroundColor: colors.bg }, animStyle]} pointerEvents={visible ? 'auto' : 'none'}>
        <View
          style={{
            flex: 1,
            paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 8),
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            {/* 关闭只保留内容底部那一个按钮：头部再放 ✕ 会出现「两个关闭键」；返回手势仍由 BackHandler 拦截 */}
          </View>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 静止全屏底衬：absoluteFill 铺满 screen，永远不参与动画，杜绝任何一帧露白
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // 面板本体：同样绝对定位铺满（与屏幕等高），只做 translateY 位移
  sheet: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  title: { flex: 1, fontSize: 19, fontWeight: '800' },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
});
