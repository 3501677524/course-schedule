/** 今日预览：启动主界面。环形图、学期进度、节假日倒计时与关键指标看板 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/hooks/useAppData';
import { useTheme } from '@/components/theme';
import { Button, Card, EmptyState, HeroCard, Loading, SectionTitle } from '@/components/ui';
import { BarProgress, CountUp, FadeInUp, RingProgress, useReplayId } from '@/components/motion';
import { WeatherCard } from '@/components/WeatherCard';
import { PageHeader, Screen } from '@/components/Screen';
import { buildDaySchedule, freeSlotsOfDay, semesterStats } from '@/services/schedule';
import {
  addDays, computeWeekInfo, formatDateCN, humanizeDuration, nowMinutes, parseDateKey,
  startOfWeekMonday, toDateKey, weekdayOf, WEEKDAY_LABELS,
} from '@/utils/datetime';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function PreviewTab() {
 const runId = useReplayId();
  const app = useApp();
  const { colors } = useTheme();
  const router = useRouter();

  const today = new Date();
  const todayKey = toDateKey(today);
  const nowMin = nowMinutes();

  const data = useMemo(() => {
    const sem = app.semester;
    const info = sem ? computeWeekInfo(sem.startDate, sem.totalWeeks, today) : null;
    const week = info?.week ?? null;

    const dayCourses = sem
      ? buildDaySchedule({ courses: app.courses, periods: app.periods, events: app.events, week, date: today })
      : [];
    const remainToday = dayCourses.filter((c) => c.endMin > nowMin).length;

    // 学期进度：按「天」精确计算，避免整数周导致第 1 周就跳到 5%、之后每整周才动一格
    // （原实现 week/totalWeeks 的精度问题：进度条与百分比长期与实际教学天数不符）
    const semDays = sem ? sem.totalWeeks * 7 : 0;
    let elapsedDays = 0;
    if (sem && semDays > 0) {
      const firstMonday = startOfWeekMonday(parseDateKey(sem.startDate));
      elapsedDays = Math.floor((startOfWeekMonday(today).getTime() - firstMonday.getTime()) / 86400000) + today.getDay() - 1;
      if (today.getDay() === 0) elapsedDays += 6; // 周日算作本周第 7 天
      elapsedDays = Math.min(Math.max(elapsedDays, 0), semDays);
    }
    const weekRatio = sem && week != null ? elapsedDays / semDays : 0;
    const weekOutRatio = sem && week != null ? (semDays - elapsedDays) / semDays : 0;
    console.info(`[preview] 学期进度按天计算：已过 ${elapsedDays}/${semDays} 天 = ${(weekRatio * 100).toFixed(1)}%（原整数周算法精度不足已修正）`);

    // 学期剩余节假日（校历中今天之后、且在学期区间内的 holiday）
    const semEnd = sem ? toDateKey(addDays(startOfWeekMonday(parseDateKey(sem.startDate)), sem.totalWeeks * 7 - 3)) : '';
    const futureHolidays = sem
      ? app.events
          .filter((e) => e.kind === 'holiday' && e.date > todayKey && (!semEnd || e.date <= semEnd))
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const holidayRatio = sem ? Math.min(1, futureHolidays.length / Math.max(1, app.events.filter((e) => e.kind === 'holiday').length)) : 0;

    return {
      info, week, dayCourses, remainToday, weekRatio, weekOutRatio,
      futureHolidays, holidayRatio,
    };
    // today/nowMin 只随分钟 tick 变化，依赖里保留 app.tick（现已降频为分钟档位）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.semester, app.courses, app.periods, app.events, app.tick, todayKey]);

  // 重计算量较小的指标独立成块：不依赖每分钟的 nowMin，避免每分钟重跑 6 次排课换算
  const stats2 = useMemo(() => {
    const sem = app.semester;
    const monday = startOfWeekMonday(new Date());
    let weekSessions = 0;
    if (sem) {
      const info = computeWeekInfo(sem.startDate, sem.totalWeeks);
      for (let i = 0; i < 5; i += 1) {
        const list = buildDaySchedule({ courses: app.courses, periods: app.periods, events: app.events, week: info.week, date: addDays(monday, i) });
        weekSessions += list.length;
      }
    }
    const pendingHw = app.homework.filter((h) => !h.done).length;
    const nextExam = [...app.exams]
      .filter((e) => new Date(e.datetime).getTime() > Date.now())
      .sort((a, b) => a.datetime.localeCompare(b.datetime))[0] ?? null;
    return { weekSessions, pendingHw, nextExam, stats: semesterStats(app.courses, app.periods) };
  }, [app.semester, app.courses, app.periods, app.events, app.homework, app.exams]);

  const freeCount = useMemo(() => {
    const dayRangeStart = app.periods.length ? 420 : 480;
    const dayRangeEnd = app.periods.length ? 1260 : 1200;
    return freeSlotsOfDay(data.dayCourses, dayRangeStart, dayRangeEnd).length;
  }, [data.dayCourses, app.periods]);

  if (app.loading) {
    // 数据未就绪时渲染加载占位，避免整页 return null 造成「短暂白屏」
    console.info('[preview] 数据加载中，展示加载占位（不再返回空白）');
    return (
      <Screen>
        <PageHeader title="今日预览" subtitle={greeting()} />
        <Loading text="正在读取课表数据…" />
      </Screen>
    );
  }

  if (!app.semester) {
    return (
      <Screen>
        <FadeInUp runId={runId}>
          <PageHeader title="今日预览" subtitle={greeting()} />
        </FadeInUp>
        <FadeInUp runId={runId} delayMs={80}>
          <Card>
            <EmptyState
              icon="📊"
              title="还没有学期数据"
              desc="先创建学期并导入示例课表，这里会展示今日课程、学期进度与节假日看板"
              action={<Button label="去「我的」创建学期" onPress={() => router.push('/(tabs)/mine')} />}
            />
          </Card>
        </FadeInUp>
      </Screen>
    );
  }

  const sem = app.semester;
  const totalToday = data.dayCourses.length;
  const ringProgress = totalToday === 0 ? 1 : data.remainToday / totalToday;
  const daysToSemEnd = Math.max(0, Math.round((new Date(toDateKey(addDays(startOfWeekMonday(parseDateKey(sem.startDate)), sem.totalWeeks * 7 - 3)) + 'T00:00:00').getTime() - today.getTime()) / 86400000));

  return (
    <Screen>
      <FadeInUp runId={runId}>
        <PageHeader title="今日预览" subtitle={`${greeting()}，${formatDateCN(todayKey)} ${WEEKDAY_LABELS[weekdayOf(today)]}`} />
      </FadeInUp>

      {/* 英雄区：学期周次 + 今日概况 */}
      <FadeInUp runId={runId} delayMs={60}>
        <HeroCard style={{ marginBottom: 4 }}>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: '600', letterSpacing: 1 }}>
            {sem.name}
          </Text>
          <Text style={{ color: '#ffffff', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 }}>
            {data.info?.inSemester ? `第 ${data.week} 周` : data.info?.label ?? '学期外'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13.5, marginTop: 6, lineHeight: 20 }}>
            {totalToday === 0
              ? '今天没有课安排，好好利用自由时间'
              : data.remainToday === 0
                ? `今天共 ${totalToday} 节课，已全部完成`
                : `今天共 ${totalToday} 节课，还剩 ${data.remainToday} 节`}
          </Text>
        </HeroCard>
      </FadeInUp>

      {/* 今日天气与出行建议 */}
      <FadeInUp runId={runId} delayMs={90}>
        <WeatherCard />
      </FadeInUp>

      {/* 今日剩余课程环形图 */}
      <FadeInUp runId={runId} delayMs={120}>
        <SectionTitle title="今日课程" right={<ChipStat label="空闲时段" value={`${freeCount}`} />} />
        <Card style={styles.ringRow}>
          <RingProgress
            progress={ringProgress}
            size={136}
            stroke={13}
            color={colors.primary}
            trackColor={colors.cardSoft}
            from={colors.heroFrom}
            to={colors.heroTo}
          >
            <View style={{ alignItems: 'center' }}>
              <CountUp value={data.remainToday} style={[styles.ringNum, { color: colors.text }]} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>剩余课程</Text>
            </View>
          </RingProgress>
          <View style={{ flex: 1, gap: 12, paddingLeft: 8 }}>
            <LegendRow color={colors.primary} label={`已完成 ${totalToday - data.remainToday} 节`} />
            <LegendRow color={colors.accent} label={`待上 ${data.remainToday} 节`} />
            <LegendRow color={colors.border} label={`全天 ${totalToday} 节`} />
            <Button
              label={totalToday > 0 ? '查看今日时间轴' : '去本周看看'}
              variant="secondary"
              onPress={() => router.push(totalToday > 0 ? '/(tabs)' : '/(tabs)/week')}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        </Card>
      </FadeInUp>

      {/* 学期进度 */}
      <FadeInUp runId={runId} delayMs={140}>
        <SectionTitle title="学期进度" />
        <Card style={{ gap: 14 }}>
          <View style={styles.progressBlock}>
            <View style={styles.progressHead}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>本学期已过</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                <CountUp value={Math.round(data.weekRatio * 100)} suffix="%" /> · 第 {data.week ?? 0}/{sem.totalWeeks} 周
              </Text>
            </View>
            <BarProgress ratio={data.weekRatio} color={colors.primary} trackColor={colors.cardSoft} />
          </View>
          <View style={styles.progressBlock}>
            <View style={styles.progressHead}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>剩余学期</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>
                <CountUp value={data.week == null ? sem.totalWeeks : Math.max(0, sem.totalWeeks - data.week)} suffix=" 周" /> · 约 {daysToSemEnd} 天
              </Text>
            </View>
            <BarProgress ratio={data.weekOutRatio} color={colors.accent} trackColor={colors.cardSoft} />
          </View>
        </Card>
      </FadeInUp>

      {/* 节假日 */}
      <FadeInUp runId={runId} delayMs={160}>
        <SectionTitle title="本学期剩余节假日" right={<ChipStat label="调休补课" value={`${app.events.filter((e) => e.kind === 'swap').length}`} />} />
        <Card style={styles.ringRow}>
          <RingProgress
            progress={data.holidayRatio}
            size={110}
            stroke={12}
            color={colors.warning}
            trackColor={colors.cardSoft}
          >
            <View style={{ alignItems: 'center' }}>
              <CountUp value={data.futureHolidays.length} style={[styles.ringNumSm, { color: colors.text }]} />
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>个假期</Text>
            </View>
          </RingProgress>
          <View style={{ flex: 1, paddingLeft: 10, gap: 8 }}>
            {data.futureHolidays.slice(0, 3).map((e) => (
              <View key={e.id} style={styles.eventRow}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={{ color: colors.warning, fontSize: 12.5, fontWeight: '700' }}>
                  {humanizeDuration(Math.max(0, (new Date(e.date + 'T00:00:00').getTime() - today.getTime()) / 86400000) * 1440)}
                </Text>
              </View>
            ))}
            {data.futureHolidays.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                暂无剩余节假日记录，可在校历中添加放假与调休安排
              </Text>
            ) : null}
            {data.futureHolidays.length > 3 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>另有 {data.futureHolidays.length - 3} 个假期未显示</Text>
            ) : null}
          </View>
        </Card>
      </FadeInUp>

      {/* 四宫格指标 */}
      <FadeInUp runId={runId} delayMs={180}>
        <SectionTitle title="关键指标" />
        <View style={styles.grid}>
          <MetricCell label="本周课节" value={stats2.weekSessions} unit="节" color={colors.primary} onPress={() => router.push('/(tabs)/week')} />
          <MetricCell label="今日空闲" value={freeCount} unit="段" color={colors.accent} onPress={() => router.push('/(tabs)')} />
          <MetricCell label="待完成作业" value={stats2.pendingHw} unit="项" color={colors.danger} onPress={() => router.push('/(tabs)/mine')} />
          <MetricCell
            label="最近考试"
            value={stats2.nextExam ? Math.max(0, Math.ceil((new Date(stats2.nextExam.datetime).getTime() - Date.now()) / 86400000)) : 0}
            unit={stats2.nextExam ? '天后' : '无'}
            color={colors.warning}
            sub={stats2.nextExam?.subject}
            onPress={() => router.push('/(tabs)/mine')}
          />
        </View>
      </FadeInUp>

      {/* 学分总览 */}
      <FadeInUp runId={runId} delayMs={200}>
        <Card style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
          <MiniStat label="在修课程" value={`${stats2.stats.courseCount} 门`} />
          <DividerLine />
          <MiniStat label="总学分" value={`${stats2.stats.totalCredit}`} />
          <DividerLine />
          <MiniStat label="学期总课节" value={`${stats2.stats.totalSessions}`} />
        </Card>
      </FadeInUp>
    </Screen>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

function ChipStat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.chipStat, { backgroundColor: colors.cardSoft, borderColor: colors.border }]}>
      <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: '600' }}>
        {label} <Text style={{ color: colors.text, fontWeight: '800' }}>{value}</Text>
      </Text>
    </View>
  );
}

function MetricCell({
  label, value, unit, color, sub, onPress,
}: { label: string; value: number; unit: string; color: string; sub?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Card style={[styles.metric, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
        <CountUp value={value} style={{ color, fontSize: 24, fontWeight: '800' }} />
        <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '600' }}>{unit}</Text>
      </View>
      {sub ? (
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{sub}</Text>
      ) : null}
      {onPress ? <View style={StyleSheet.absoluteFill}><Button label="" onPress={onPress} style={{ display: 'none' }} /></View> : null}
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}

function DividerLine() {
  const { colors } = useTheme();
  return <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 }} />;
}

const styles = StyleSheet.create({
  ringRow: { flexDirection: 'row', alignItems: 'center' },
  ringNum: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  ringNumSm: { fontSize: 26, fontWeight: '800' },
  progressBlock: { gap: 8 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { width: '47.5%', flexGrow: 1, padding: 14, gap: 2 },
  chipStat: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
});
