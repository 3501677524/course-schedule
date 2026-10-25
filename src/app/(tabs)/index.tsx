/** 今日：时间轴 + 下节课倒计时 */
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { CountdownCard } from '@/components/CountdownCard';
import { Timeline } from '@/components/Timeline';
import { Loading, Card } from '@/components/ui';
import { FadeInUp, useReplayId } from '@/components/motion';
import { useApp } from '@/hooks/useAppData';
import { buildDaySchedule, currentClass, nextClass } from '@/services/schedule';
import { formatDateCN, nowMinutes } from '@/utils/datetime';
import { useTheme } from '@/components/theme';

export default function TodayScreen() {
 const runId = useReplayId();
  const app = useApp();
  const router = useRouter();
  const { colors } = useTheme();

  const todayCourses = useMemo(
    () => buildDaySchedule({
      courses: app.courses,
      periods: app.periods,
      events: app.events,
      week: app.week,
      date: new Date(),
    }),
    [app.courses, app.periods, app.events, app.week],
  );

  // 明天若跨入下一周（今天是周一），需要用下一周的匹配结果
  const mins = nowMinutes();
  const cur = currentClass(todayCourses, mins);
  const nxt = nextClass(todayCourses, mins);

  if (app.loading) {
    return <Screen><Loading text="正在读取本地课表…" /></Screen>;
  }

  return (
    <Screen>
      <FadeInUp runId={runId}>
        <PageHeader
          title="今日课程"
          subtitle={`${formatDateCN(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`)} · ${app.weekLabel}`}
          right={
            <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/preview')} style={{ padding: 6 }}>
              {/* 与底部「今日预览」Tab 同款四宫格图标（AppTabs.tsx PATHS.preview） */}
              <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.primary}>
                <Path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
              </Svg>
            </Pressable>
          }
        />
      </FadeInUp>

      {!app.semester ? (
        <FadeInUp runId={runId} delayMs={80}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>还没有学期</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
              先创建学期并填写开学日期，才能自动识别当前教学周、匹配课程与推送上课提醒。
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/mine')} style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>去设置学期</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void app.seedSample()} style={{ backgroundColor: colors.primarySoft, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 }}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>载入示例课表</Text>
              </Pressable>
            </View>
          </Card>
        </FadeInUp>
      ) : (
        <>
          <FadeInUp runId={runId} delayMs={80}>
            <CountdownCard
              next={nxt}
              current={cur}
              courses={todayCourses}
              settings={app.settings}
            />
          </FadeInUp>
          <View style={{ height: 18 }} />
          <FadeInUp runId={runId} delayMs={160}>
            <Timeline courses={todayCourses} />
          </FadeInUp>
        </>
      )}
    </Screen>
  );
}
