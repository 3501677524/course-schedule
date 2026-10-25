/** 作业面板：从一级 Tab 收纳进「我的」，逻辑与原作业页一致 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, EmptyState, Loading } from '@/components/ui';
import { HomeworkForm } from '@/components/HomeworkForm';
import { useApp } from '@/hooks/useAppData';
import { formatDateTime, daysUntil } from '@/utils/datetime';
import { useTheme } from '@/components/theme';
import type { HomeworkItem } from '@/types';

export function HomeworkPanel({ onClose }: { onClose?: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  const [editing, setEditing] = useState<HomeworkItem | null | 'new'>(null);
  const [showDone, setShowDone] = useState(false);

  const sorted = useMemo(() => {
    return [...app.homework].sort((a, b) => {
      if (a.done !== b.done) return a.done - b.done;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  }, [app.homework]);

  const visible = showDone ? sorted : sorted.filter((h) => h.done === 0);
  const doneCount = sorted.filter((h) => h.done === 1).length;

  if (app.loading) return <Loading text="正在读取作业…" />;

  if (editing !== null) {
    return (
      <View>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 12 }}>
          {editing === 'new' ? '新增作业' : '编辑作业'}
        </Text>
        <HomeworkForm initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        <Button label="返回列表" variant="ghost" onPress={() => setEditing(null)} style={{ marginTop: 6 }} />
      </View>
    );
  }

  function toggleDone(h: HomeworkItem) {
    void app.saveHomework({ ...h, done: h.done === 1 ? 0 : 1 }).catch((e) => console.warn('[homework] 更新失败', e));
  }

  function confirmDelete(h: HomeworkItem) {
    Alert.alert('删除作业', `确定删除「${h.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '确认删除', onPress: () => void app.removeHomework(h.id).catch((e) => console.warn('[homework] 删除失败', e)) },
    ]);
  }

  return (
    <View>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>作业管理</Text>
          <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 4 }}>
            未完成 {sorted.length - doneCount} 项 · 已完成 {doneCount} 项
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setShowDone((v) => !v)} style={{ padding: 6 }}>
          <Text style={{ color: colors.primary, fontSize: 13 }}>{showDone ? '隐藏已完成' : '看已完成'}</Text>
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="📚"
          title={showDone ? '没有已完成作业' : '暂无待完成作业'}
          desc="添加作业并关联课程，到期前会显示倒计时与逾期提醒"
          action={<Button label="＋ 新增作业" onPress={() => setEditing('new')} style={{ marginTop: 14 }} />}
        />
      ) : (
        visible.map((h) => {
          const overdue = h.done === 0 && new Date(h.dueAt).getTime() < Date.now();
          const soon = h.done === 0 && !overdue && daysUntil(h.dueAt) <= 2;
          return (
            <Card key={h.id} style={styles.item}>
              <Pressable accessibilityRole="checkbox" onPress={() => toggleDone(h)} style={[styles.checkbox, { borderColor: h.done === 1 ? colors.success : colors.border, backgroundColor: h.done === 1 ? colors.success : 'transparent' }]}>
                {h.done === 1 ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: h.done === 1 ? colors.textMuted : colors.text }]} numberOfLines={2}>
                  {h.title}
                </Text>
                <View style={styles.metaRow}>
                  {h.courseName ? <Badge label={h.courseName} bg={colors.cardSoft} fg={colors.textSecondary} /> : null}
                  <Text style={{ color: overdue ? colors.danger : soon ? colors.accent : colors.textMuted, fontSize: 12.5 }}>
                    {overdue ? '⚠️ 已逾期 · ' : ''}{formatDateTime(h.dueAt)}
                  </Text>
                </View>
                {h.note ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>{h.note}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" onPress={() => setEditing(h)} hitSlop={8} style={{ padding: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>✎</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => confirmDelete(h)} hitSlop={8} style={{ padding: 6 }}>
                <Text style={{ color: colors.danger, fontSize: 15 }}>✕</Text>
              </Pressable>
            </Card>
          );
        })
      )}

      {visible.length > 0 ? (
        <View style={{ height: 16 }}>
          <Button label="＋ 新增作业" variant="secondary" onPress={() => setEditing('new')} />
        </View>
      ) : null}

      {/* 收纳进「我的」全屏面板后没有别的出口，必须自带关闭按钮 */}
      {onClose ? (
        <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  item: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 11 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
});
