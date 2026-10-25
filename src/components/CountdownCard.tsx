/** 下节课倒计时卡 */
import { StyleSheet, Text, View } from 'react-native';
import type { AppSettings, ScheduledCourse } from '@/types';
import { humanizeDuration, nowMinutes } from '@/utils/datetime';
import { useTheme } from './theme';
import { Badge, Card } from './ui';

export function CountdownCard({
  next, current, courses, settings,
}: {
  next: ScheduledCourse | null;
  current: ScheduledCourse | null;
  courses: ScheduledCourse[];
  settings: AppSettings;
}) {
  const { colors } = useTheme();
  const now = new Date();
  const mins = nowMinutes(now);

  let headline = '今日课程已完成';
  let detail = '';
  if (courses.length === 0) {
    headline = '今日无课';
    detail = '好好休息或安排自习';
  } else if (current) {
    headline = `正在上《${current.name}》`;
    detail = `${current.room} · ${Math.max(0, Math.ceil(current.endMin - mins))} 分钟后下课`;
  } else if (next) {
    headline = `距离下节课还有 ${humanizeDuration((next.startMin - mins) * 60)}`;
    detail = `${next.name} · ${next.room} · ${next.startTimeText}`;
  }

  return (
    <View style={{ gap: 12 }}>
      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <Badge label={next || current ? '实时' : '今日'} bg={colors.primarySoft} fg={colors.primary} />
          {current ? <Badge label="进行中" bg={colors.dangerSoft} fg={colors.danger} /> : null}
        </View>
        <Text style={[styles.headline, { color: colors.text }]}>{headline}</Text>
        {detail ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text> : null}
        {next && !current ? (
          <View style={[styles.barTrack, { backgroundColor: colors.cardSoft }]}>
            <View
              style={[
                styles.barFill,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.min(100, Math.max(4, 100 - ((next.startMin - mins) / 240) * 100))}%`,
                },
              ]}
            />
          </View>
        ) : null}
      </Card>
      <Text style={{ display: settings.themeMode === 'system' ? 'none' : 'none' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8 },
  heroTop: { flexDirection: 'row', gap: 8 },
  headline: { fontSize: 19, fontWeight: '800', lineHeight: 26, fontVariant: ['tabular-nums'] },
  detail: { fontSize: 13.5, lineHeight: 20 },
  barTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 5, borderRadius: 3 },
});
