/** 页面容器：统一背景、安全区、标题头 */
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export function Screen({
  children,
  scroll = true,
  scrollRef,
  onScroll,
  initialOffsetY,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** 外部持有的滚动容器引用（用于恢复滚动位置） */
  scrollRef?: React.RefObject<ScrollViewType | null>;
  onScroll?: (offsetY: number) => void;
  /** 首次布局时的初始滚动偏移：在首帧绘制前就定位，避免「先回到顶部再被拉回」的闪动 */
  initialOffsetY?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const body = <View style={{ paddingBottom: insets.bottom + 24 }}>{children}</View>;
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          contentOffset={initialOffsetY ? { x: 0, y: initialOffsetY } : undefined}
          onScroll={onScroll ? (e) => onScroll(e.nativeEvent.contentOffset.y) : undefined}
        >
          <View style={{ paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 16 : 8) }}>{body}</View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 16 : 8) }}>{body}</View>
      )}
    </View>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14, marginTop: 6 },
  title: { fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 4 },
});
