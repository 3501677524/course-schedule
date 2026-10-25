/** 今日课程时间轴 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ScheduledCourse } from '@/types';
import { nowMinutes, WEEKDAY_LABELS, weekdayOf } from '@/utils/datetime';
import { courseTint, useTheme } from './theme';
import { Badge } from './ui';

export function Timeline({ courses }: { courses: ScheduledCourse[] }) {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const mins = nowMinutes();
  const todayLabel = WEEKDAY_LABELS[weekdayOf(new Date()) - 1];

  if (courses.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ fontSize: 34 }}>🗓️</Text>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>今天没有课</Text>
        <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>可以安排自习、运动或出门走走</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.dayMark}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        <Text style={[styles.dayText, { color: colors.text }]}>{todayLabel} · 共 {courses.length} 节</Text>
      </View>
      {courses.map((c, i) => {
        const status = mins >= c.endMin ? 'past' : mins >= c.startMin ? 'ongoing' : 'upcoming';
        const tint = courseTint(c.color, mode);
        const progress = status === 'ongoing' ? (mins - c.startMin) / (c.endMin - c.startMin) : 0;
        return (
          <View key={`${c.id}-${i}`} style={styles.rowWrap}>
            <View style={styles.rail}>
              <View style={[styles.railLine, { backgroundColor: status === 'past' ? colors.border : colors.primary, opacity: status === 'upcoming' ? 0.35 : 1 }]} />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/detail/course/${c.id}`)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: status === 'past' ? colors.cardSoft : colors.card,
                  borderColor: status === 'ongoing' ? c.color : colors.border,
                  borderWidth: status === 'ongoing' ? 2 : 1,
                  opacity: status === 'past' ? 0.62 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.cardTop}>
                <View style={[styles.timeBox, { backgroundColor: tint.bg }]}>
                  <Text style={[styles.timeMain, { color: tint.fg }]}>{c.startTimeText}</Text>
                  <Text style={[styles.timeSub, { color: tint.fg }]}>{c.endTimeText}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                    📍 {c.room || '未定教室'}{c.teacher ? ` · ${c.teacher}` : ''}
                  </Text>
                  {status === 'ongoing' ? (
                    <View style={[styles.progressTrack, { backgroundColor: colors.cardSoft }]}>
                      <View style={[styles.progressFill, { backgroundColor: c.color, width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                  ) : null}
                </View>
                {status === 'ongoing' ? <Badge label="进行中" bg={colors.dangerSoft} fg={colors.danger} /> : null}
                {status === 'past' ? <Badge label="已结束" bg={colors.cardSoft} fg={colors.textMuted} /> : null}
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dayMark: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dayText: { fontSize: 13, fontWeight: '700' },
  rowWrap: { flexDirection: 'row', marginBottom: 10 },
  rail: { width: 18, alignItems: 'center', paddingTop: 18 },
  railLine: { width: 2, flex: 1, borderRadius: 1, minHeight: 40 },
  card: { flex: 1, borderRadius: 14, padding: 13 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  timeBox: { width: 56, borderRadius: 10, paddingVertical: 7, alignItems: 'center' },
  timeMain: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timeSub: { fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'], opacity: 0.8 },
  name: { fontSize: 15.5, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 3 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: 4, borderRadius: 2 },
  empty: { alignItems: 'center', paddingVertical: 44, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyDesc: { fontSize: 13 },
});
