/** 通用 UI 原子组件：卡片、按钮、行项、空态、标签、分段选择（统一间距/圆角/投影与按压反馈） */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from './theme';
import { SpringPressable } from './motion';

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const { colors, mode } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          boxShadow: mode === 'dark' ? '0 1px 3px rgba(0,0,0,0.4)' : '0 2px 12px rgba(23,28,26,0.05)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** 渐变英雄卡：用于每页顶部强调区 */
export function HeroCard({ children, style }: { children: ReactNode; style?: object }) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={[colors.heroFrom, colors.heroTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, style]}
    >
      {children}
    </LinearGradient>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionInner}>
        <View style={[styles.sectionBar, { backgroundColor: colors.primary }]} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Button({
  label, onPress, variant = 'primary', disabled, style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: object;
}) {
  const { colors } = useTheme();
  const map = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.primarySoft, fg: colors.primary },
    ghost: { bg: 'transparent', fg: colors.textSecondary },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[variant];
  return (
    <SpringPressable
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={[styles.button, { backgroundColor: map.bg }, style]}
    >
      <Text style={[styles.buttonText, { color: map.fg }]}>{label}</Text>
    </SpringPressable>
  );
}

export function Chip({ label, active, onPress, tint }: { label: string; active?: boolean; onPress?: () => void; tint?: string }) {
  const { colors } = useTheme();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? (tint ?? colors.primary) : colors.cardSoft,
          borderColor: active ? (tint ?? colors.primary) : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? (tint ? '#fff' : colors.onPrimary) : colors.textSecondary }]}>
        {label}
      </Text>
    </Wrapper>
  );
}

export function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Row({
  label, value, onPress, chevron, danger, children, hint, hintStyle,
}: {
  label: string;
  value?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  children?: ReactNode;
  hint?: string;
  hintStyle?: object;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, flexShrink: 1 }}>
        <Text style={[styles.rowLabel, { color: danger ? colors.danger : colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text style={[{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }, hintStyle]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        {typeof value === 'string' ? (
          <Text style={[styles.rowValue, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text>
        ) : (
          value
        )}
        {children}
        {chevron ? <Text style={{ color: colors.textMuted, fontSize: 17, marginLeft: 6 }}>›</Text> : null}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <SpringPressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={{ width: '100%' }}
    >
      {content}
    </SpringPressable>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.cardSoft }]}>
        <Text style={styles.emptyIcon}>{icon}</Text>
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {desc ? <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>{desc}</Text> : null}
      {action}
    </View>
  );
}

export function Loading({ text }: { text?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      {text ? <Text style={[styles.loadingText, { color: colors.textMuted }]}>{text}</Text> : null}
    </View>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  const knob = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(knob, {
      toValue: on ? 1 : 0,
      duration: 220,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [on, knob]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={() => {
        console.info(`[ui] Toggle 点击生效：${on ? '开→关' : '关→开'}`);
        void Haptics.selectionAsync().catch(() => undefined);
        onChange(!on);
      }}
      style={[styles.toggle, { backgroundColor: on ? colors.primary : colors.cardSoft, borderColor: on ? colors.primary : colors.border }]}
    >
      <Animated.View
        style={[
          styles.toggleKnob,
          {
            backgroundColor: on ? colors.onPrimary : colors.textMuted,
            transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  hero: { borderRadius: 20, padding: 18, gap: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10, paddingHorizontal: 2 },
  sectionInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionBar: { width: 3, height: 15, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  button: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '700' },
  chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 20, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  chipText: { fontSize: 13, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', marginLeft: 12, flexShrink: 0 },
  rowValue: { fontSize: 14, maxWidth: 180 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  emptyIconWrap: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 },
  loadingText: { fontSize: 13 },
  toggle: { width: 46, height: 28, borderRadius: 14, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 2 },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, alignSelf: 'flex-start' },
});
