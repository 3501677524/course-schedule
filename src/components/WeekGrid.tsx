/** 本周网格课表：横轴周一~周日，纵轴节次，自动适配单双周与校历 */
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { Course, PeriodSlot, ScheduledCourse } from '@/types';
import { courseTint, useTheme } from './theme';
import { WEEKDAY_LABELS } from '@/utils/datetime';

const CELL_H = 46;
const TIME_COL = 42;

export function WeekGrid({
  grid, periods, week, onCellPress,
}: {
  grid: ScheduledCourse[][];
  periods: PeriodSlot[];
  week: number | null;
  onCellPress?: (courseId: number) => void;
}) {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cellW = Math.max(72, Math.min(96, (width - 32 - TIME_COL) / 7));
  const teachingPeriods = useMemo(() => [...periods].sort((a, b) => a.index - b.index), [periods]);

  // 建立 weekday -> (periodIndex -> courses) 映射（同一格可能有多门）
  const map = useMemo(() => {
    const m: Record<number, Record<number, ScheduledCourse[]>> = {};
    for (let d = 0; d < 7; d += 1) {
      m[d] = {};
      for (const c of grid[d] ?? []) {
        for (let p = c.startPeriod; p <= c.endPeriod; p += 1) {
          if (!m[d][p]) m[d][p] = [];
          m[d][p].push(c);
        }
      }
    }
    return m;
  }, [grid]);

  if (week == null || teachingPeriods.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ fontSize: 32 }}>🗓️</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>无法显示课表</Text>
        <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>请先在「我的 → 学期管理」设置开学日期</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* 表头 */}
        <View style={styles.headRow}>
          <View style={[styles.timeCol, { width: TIME_COL }]} />
          {WEEKDAY_LABELS.map((label, i) => (
            <View key={label} style={[styles.headCell, { width: cellW, borderColor: colors.border }]}>
              <Text style={[styles.headText, { color: colors.textSecondary }]}>{label}</Text>
            </View>
          ))}
        </View>
        {teachingPeriods.map((p) => (
          <View key={p.id} style={styles.gridRow}>
            <View style={[styles.timeCol, { width: TIME_COL }]}>
              <Text style={[styles.periodNum, { color: colors.textMuted }]}>{p.index}</Text>
              <Text style={[styles.periodTime, { color: colors.textMuted }]}>{p.startTime}</Text>
            </View>
            {WEEKDAY_LABELS.map((_, d) => {
              const items = map[d]?.[p.index] ?? [];
              const anchor = items.find((c) => c.startPeriod === p.index);
              const isContinuation = items.length > 0 && !anchor;
              const conflict = items.length > 1 && !!anchor;
              return (
                <View key={`${d}-${p.index}`} style={[styles.cell, { width: cellW, height: CELL_H, borderColor: colors.border }]}>
                  {isContinuation ? (
                    <View style={[styles.filler, { backgroundColor: `${anchorColor(items, colors, mode).color}22` }]} />
                  ) : anchor ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => (onCellPress ? onCellPress(anchor.id) : router.push(`/detail/course/${anchor.id}`))}
                      style={({ pressed }) => [
                        styles.courseBox,
                        { backgroundColor: courseTint(anchor.color, mode).bg, opacity: pressed ? 0.8 : 1 },
                      ]}
                    >
                      <Text style={[styles.courseName, { color: courseTint(anchor.color, mode).fg }]} numberOfLines={2}>
                        {anchor.name}
                      </Text>
                      <Text style={[styles.courseRoom, { color: courseTint(anchor.color, mode).fg }]} numberOfLines={1}>
                        {anchor.room}
                      </Text>
                      {conflict ? <Text style={styles.conflictMark}>❗</Text> : null}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function anchorColor(items: ScheduledCourse[], _colors: unknown, _mode: string) {
  return items[0] ?? { color: '#888888' };
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', marginBottom: 4 },
  headCell: { paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  headText: { fontSize: 12.5, fontWeight: '700' },
  gridRow: { flexDirection: 'row' },
  timeCol: { alignItems: 'center', justifyContent: 'center', height: CELL_H },
  periodNum: { fontSize: 12, fontWeight: '700' },
  periodTime: { fontSize: 9, marginTop: 1 },
  cell: { borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, padding: 2 },
  courseBox: { flex: 1, borderRadius: 7, padding: 4, justifyContent: 'center' },
  filler: { flex: 1, borderRadius: 7, minHeight: 4 },
  courseName: { fontSize: 10.5, fontWeight: '700', lineHeight: 13 },
  courseRoom: { fontSize: 9, marginTop: 2, opacity: 0.85 },
  conflictMark: { position: 'absolute', top: 1, right: 2, fontSize: 9 },
  empty: { alignItems: 'center', paddingVertical: 44, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center' },
});
