/** 考试面板：从一级 Tab 收纳进「我的」，逻辑与原考试页一致 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, EmptyState, Loading } from '@/components/ui';
import { ExamForm } from '@/components/ExamForm';
import { useApp } from '@/hooks/useAppData';
import { daysUntil, formatDateTime, minutesUntil } from '@/utils/datetime';
import { useTheme } from '@/components/theme';
import type { ExamItem } from '@/types';

export function ExamPanel({ onClose }: { onClose?: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  const [editing, setEditing] = useState<ExamItem | null | 'new'>(null);

  const sorted = useMemo(() => {
    const now = Date.now();
    return [...app.exams].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
      .filter((e) => new Date(e.datetime).getTime() > now - 86400000);
  }, [app.exams]);

  const nearest = sorted[0] ?? null;

  if (app.loading) return <Loading text="正在读取考试安排…" />;

  if (editing !== null) {
    return (
      <View>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 12 }}>
          {editing === 'new' ? '新增考试' : '编辑考试'}
        </Text>
        <ExamForm initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        <Button label="返回列表" variant="ghost" onPress={() => setEditing(null)} style={{ marginTop: 6 }} />
      </View>
    );
  }

  return (
    <View>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>考试安排</Text>
        <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 4 }}>
          {app.semester ? `${app.semester.name} · 共 ${sorted.length} 场` : '未设置学期'}
        </Text>
      </View>

      {nearest ? (
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary, marginBottom: 14 }}>
          <Text style={{ color: `${colors.onPrimary}cc`, fontSize: 12.5, fontWeight: '600' }}>最近一场考试</Text>
          <Text style={{ color: colors.onPrimary, fontSize: 22, fontWeight: '800', marginTop: 4 }}>{nearest.subject}</Text>
          <Text style={{ color: `${colors.onPrimary}dd`, fontSize: 13.5, marginTop: 6 }}>
            {daysUntil(nearest.datetime) <= 0 && minutesUntil(nearest.datetime) <= 60
              ? `还有 ${minutesUntil(nearest.datetime)} 分钟开考`
              : `还有 ${daysUntil(nearest.datetime)} 天 · ${formatDateTime(nearest.datetime)}`}
          </Text>
          <Text style={{ color: `${colors.onPrimary}bb`, fontSize: 12.5, marginTop: 3 }}>
            📍 {nearest.room || '考场待定'}{nearest.seat ? ` · 座位 ${nearest.seat}` : ''}
          </Text>
        </Card>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          icon="📝"
          title="还没有考试安排"
          desc="添加考试后会自动计算倒计时，并在考前 1 天、考前 1 小时提醒你"
          action={<Button label="＋ 添加考试" onPress={() => setEditing('new')} style={{ marginTop: 14 }} />}
        />
      ) : (
        sorted.map((e) => {
          const d = daysUntil(e.datetime);
          const urgent = d <= 7;
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => setEditing(e)}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <Card style={styles.item}>
                <View style={{ flex: 1 }}>
                  <View style={styles.topRow}>
                    <Text style={[styles.subject, { color: colors.text }]} numberOfLines={1}>{e.subject}</Text>
                    <Badge label={e.examKind} bg={colors.cardSoft} fg={colors.textSecondary} />
                  </View>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>{formatDateTime(e.datetime)}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>📍 {e.room || '考场待定'}{e.seat ? ` · ${e.seat}` : ''}</Text>
                  {e.remindOn === 1 ? (
                    <Text style={[styles.remindTag, { color: colors.success }]}>🔔 已开启考前双重提醒</Text>
                  ) : null}
                </View>
                <View style={[styles.countBox, { backgroundColor: urgent ? colors.dangerSoft : colors.primarySoft }]}>
                  <Text style={[styles.countNum, { color: urgent ? colors.danger : colors.primary }]}>{d}</Text>
                  <Text style={[styles.countUnit, { color: urgent ? colors.danger : colors.primary }]}>天后</Text>
                </View>
              </Card>
            </Pressable>
          );
        })
      )}

      {sorted.length > 0 ? <View style={{ height: 16 }}><Button label="＋ 添加考试" variant="secondary" onPress={() => setEditing('new')} /></View> : null}

      {/* 收纳进「我的」全屏面板后没有别的出口，必须自带关闭按钮 */}
      {onClose ? (
        <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  subject: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  meta: { fontSize: 13, marginTop: 2 },
  remindTag: { fontSize: 12, marginTop: 5 },
  countBox: { width: 58, paddingVertical: 9, borderRadius: 12, alignItems: 'center', marginLeft: 12 },
  countNum: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  countUnit: { fontSize: 11, marginTop: 1 },
});
