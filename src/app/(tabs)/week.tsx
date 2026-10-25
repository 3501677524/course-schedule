/** 本周：网格课表 + 周次选择器（可回看第 1-N 周） */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { WeekGrid } from '@/components/WeekGrid';
import { Button, Card, Chip, Loading } from '@/components/ui';
import { FadeInUp, PageFade, useReplayId } from '@/components/motion';
import { useApp } from '@/hooks/useAppData';
import { buildWeekGrid } from '@/services/schedule';
import { computeWeekInfo, startOfWeekMonday, parityLabel, weeksText } from '@/utils/datetime';
import { useTheme } from '@/components/theme';

export default function WeekScreen() {
 const runId = useReplayId();
  const app = useApp();
  const router = useRouter();
  const { colors } = useTheme();
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const weekScrollRef = useRef<ScrollView>(null);

  const currentWeek = viewWeek ?? app.week;
  const totalWeeks = app.semester?.totalWeeks ?? 20;

  const mondayOfView = useMemo(() => {
    if (!app.semester || currentWeek == null) return new Date();
    const firstMonday = startOfWeekMonday(new Date(`${app.semester.startDate}T00:00:00`));
    const d = new Date(firstMonday.getTime());
    d.setDate(firstMonday.getDate() + (currentWeek - 1) * 7);
    return d;
  }, [app.semester, currentWeek]);

  const grid = useMemo(
    () => buildWeekGrid(app.courses, app.periods, app.events, currentWeek, mondayOfView),
    [app.courses, app.periods, app.events, currentWeek, mondayOfView],
  );

  const info = app.semester ? computeWeekInfo(app.semester.startDate, totalWeeks) : null;

  // 周次选择器自动定位到当前周：onLayout 只在挂载时触发一次，跨天后 app.week 变化需靠 effect 补滚
  useEffect(() => {
    if (viewWeek != null || currentWeek == null) return;
    const STEP = 48;
    const x = Math.max(0, (currentWeek - 1) * STEP - 120);
    console.info(`[week] 周次选择器自动定位到第 ${currentWeek} 周，scrollTo x=${x}`);
    const id = setTimeout(() => weekScrollRef.current?.scrollTo({ x, animated: true }), 60);
    return () => clearTimeout(id);
  }, [currentWeek, viewWeek]);
  const viewingWeekParity: 'odd' | 'even' = currentWeek != null && currentWeek % 2 === 0 ? 'even' : 'odd';

  const dayCounts = grid.map((g) => g.length);
  const weekTotal = dayCounts.reduce((a, b) => a + b, 0);

  if (app.loading) return <Screen><Loading text="正在读取课表…" /></Screen>;

  return (
    <Screen>
      <FadeInUp runId={runId}>
        <PageHeader title="本周课表" subtitle={info ? `当前 ${info.label}` : '未设置学期'} />
      </FadeInUp>

      {!app.semester ? (
        <FadeInUp runId={runId} delayMs={80}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>还没有学期</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>需要先设置开学日期才能按周显示课表。</Text>
            <Button label="去设置学期" onPress={() => router.push('/(tabs)/mine')} />
          </Card>
        </FadeInUp>
      ) : (
        <>
          <FadeInUp runId={runId} delayMs={80}>
            <Card style={styles.weekBar}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.weekBig, { color: colors.text }]}>第 {currentWeek ?? '-'} 周</Text>
                <Text style={[styles.weekSub, { color: colors.textMuted }]}>
                  {parityLabel(viewingWeekParity)} · 共 {weekTotal} 节课
                </Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setViewWeek(null)} style={[styles.todayBtn, { backgroundColor: colors.primarySoft }]}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>回到本周</Text>
              </Pressable>
            </Card>
          </FadeInUp>

          <FadeInUp runId={runId} delayMs={140}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 12, marginBottom: 14 }}
              contentContainerStyle={{ paddingHorizontal: 0 }}
              ref={weekScrollRef}
              onLayout={() => {
                // 进入页面自动把「当前周」Chip 滚到可视区中间；此前 Chip 行从第 1 周开始渲染，
                // 学期中后段打开本周页会看到选中态在最右侧甚至看不见，需要手动横滑。
                const target = currentWeek ?? app.week;
                if (target == null) return;
                // Chip 宽度约 13+13+字宽 ≈ 40，加 marginRight 8 → 步长约 48
                const STEP = 48;
                const x = Math.max(0, (target - 1) * STEP - 120);
                console.info(`[week] 周次选择器自动定位到第 ${target} 周，scrollTo x=${x}`);
                weekScrollRef.current?.scrollTo({ x, animated: false });
              }}
            >
              {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
                <Chip key={w} label={`${w}`} active={w === currentWeek} onPress={() => setViewWeek(w)} tint={colors.primary} />
              ))}
            </ScrollView>
          </FadeInUp>

          {/* 周次切换时网格交叉淡入（fadeKey 驱动，聚焦重播由 PageFade 内部处理） */}
          <PageFade runId={runId} fadeKey={`grid-${currentWeek ?? 'none'}`}>
            <WeekGrid grid={grid} periods={app.periods} week={currentWeek} />
          </PageFade>

          <View style={{ height: 16 }} />
          <FadeInUp runId={runId} delayMs={200}>
            <Card>
              <Text style={[styles.legendTitle, { color: colors.text }]}>图例与说明</Text>
              {app.courses.slice(0, 8).map((c) => (
                <View key={c.id} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                    {c.name} · {parityLabel(c.weekParity)} · {weeksText(c.startWeek, c.endWeek, c.weeks)}
                  </Text>
                </View>
              ))}
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 8, lineHeight: 17 }}>
                点击任意课程格子查看详情；单双周课程会按所选周次自动隐藏。
              </Text>
            </Card>
          </FadeInUp>

          <View style={{ height: 16 }} />
          <FadeInUp runId={runId} delayMs={260}>
            <Button label="＋ 新增课程" variant="secondary" onPress={() => router.push('/detail/course-edit')} />
          </FadeInUp>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  weekBar: { flexDirection: 'row', alignItems: 'center' },
  weekBig: { fontSize: 20, fontWeight: '800' },
  weekSub: { fontSize: 12.5, marginTop: 3 },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  legendTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});
