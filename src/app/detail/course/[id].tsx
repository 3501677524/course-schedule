/** 课程详情：老师、教室、学分、类型、考核方式、上课周次 */
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { Button, Card, EmptyState } from '@/components/ui';
import { useApp } from '@/hooks/useAppData';
import { courseTint, useTheme } from '@/components/theme';
import { WEEKDAY_LABELS, parityLabel, weeksText } from '@/utils/datetime';

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, mode } = useTheme();
  const app = useApp();

  const course = useMemo(() => app.courses.find((c) => c.id === Number(id)) ?? null, [app.courses, id]);
  const periods = useMemo(
    () => course ? app.periods.filter((p) => p.index >= course.startPeriod && p.index <= course.endPeriod).sort((a, b) => a.index - b.index) : [],
    [app.periods, course],
  );

  if (!course) {
    return (
      <Screen>
        <PageHeader title="课程详情" />
        <EmptyState icon="🔍" title="课程不存在或已删除" action={<Button label="返回" onPress={() => router.back()} style={{ marginTop: 12 }} />} />
      </Screen>
    );
  }

  const tint = courseTint(course.color, mode);

  function confirmDelete() {
    // ⚠️ Android 上 Alert 的「删除」按钮若用 style:'destructive'，会被渲染进系统弹窗的
    // 「外部操作条」（external action bar），该区域点击经常不触发 onPress——表现为
    // 「本周点课程 → 详情页删除键用不了」。改用普通按钮样式，onPress 稳定触发；
    // 确认弹窗本身已足够防误删。
    console.info(`[course-detail] 弹出删除确认，id=${String(course!.id)}`);
    Alert.alert('删除课程', `确定删除《${course!.name}》吗？该操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        onPress: () => {
          const target = course!;
          console.info(`[course-detail] 确认删除课程 id=${String(target.id)}《${target.name}》`);
          void app.removeCourse(target.id).then(() => {
            console.info('[course-detail] 删除成功，返回上一页');
            router.back();
          }).catch((e) => {
            console.warn('[course] 删除失败', e);
            Alert.alert('提示', '删除失败，请重试');
          });
        },
      },
    ]);
  }

  return (
    <Screen>
      {/* headerShown:false 的 Stack 没有系统返回键，页面自带显式返回按钮 */}
      <Pressable
        accessibilityRole="button"
        hitSlop={12}
        onPress={() => {
          console.info('[course-detail] 点击返回键，router.back()');
          router.back();
        }}
        style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '800', marginRight: 2 }}>‹</Text>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>返回</Text>
        </View>
      </Pressable>
      <PageHeader title={course.name} subtitle={`${WEEKDAY_LABELS[course.weekday - 1]} · ${course.startPeriod}-${course.endPeriod} 节`} />

      <Card style={{ backgroundColor: tint.bg, borderColor: course.color }}>
        <Text style={{ color: tint.fg, fontSize: 18, fontWeight: '800' }}>{course.name}</Text>
        <Text style={{ color: tint.fg, fontSize: 13, marginTop: 5, opacity: 0.9 }}>
          {course.courseType} · {parityLabel(course.weekParity)} · {weeksText(course.startWeek, course.endWeek, course.weeks)}
        </Text>
      </Card>

      <View style={{ height: 14 }} />
      <Card>
        <InfoRow label="任课教师" value={course.teacher || '未填写'} colors={colors} />
        <InfoRow label="上课教室" value={course.room || '未定'} colors={colors} />
        <InfoRow label="学分" value={course.credit ? `${course.credit}` : '—'} colors={colors} />
        <InfoRow label="课程类型" value={course.courseType} colors={colors} />
        <InfoRow label="考核方式" value={course.examType} colors={colors} />
        <InfoRow label="上课周次" value={`${weeksText(course.startWeek, course.endWeek, course.weeks)}（${parityLabel(course.weekParity)}）`} colors={colors} />
        <InfoRow label="备注" value={course.note || '无'} colors={colors} last />
      </Card>

      {periods.length > 0 ? (
        <>
          <View style={{ height: 14 }} />
          <Card>
            <Text style={[styles.secTitle, { color: colors.text }]}>实际时间（跟随自定义作息）</Text>
            {periods.map((p) => (
              <View key={p.id} style={styles.periodRow}>
                <Text style={{ color: colors.textMuted, fontSize: 12, width: 46 }}>第{p.index}节</Text>
                <Text style={{ color: colors.text, fontSize: 14, fontVariant: ['tabular-nums'] }}>{p.startTime} – {p.endTime}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <View style={{ height: 18 }} />
      <View style={styles.actions}>
        <Button label="编辑课程" onPress={() => router.push(`/detail/course-edit?id=${course.id}`)} style={{ flex: 1 }} />
        <Button label="删除" variant="danger" onPress={confirmDelete} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function InfoRow({ label, value, colors, last }: { label: string; value: string; colors: { textSecondary: string; text: string; border: string }; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Text style={{ color: colors.textSecondary, fontSize: 13.5, width: 78 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoRow: { flexDirection: 'row', paddingVertical: 11, alignItems: 'flex-start' },
  secTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  periodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  actions: { flexDirection: 'row', gap: 12 },
});
