/** 课程编辑表单（含冲突检测预警） */
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Course } from '@/types';
import { WEEKDAY_LABELS } from '@/utils/datetime';
import { detectConflicts } from '@/services/schedule';
import { useApp } from '@/hooks/useAppData';
import { useTheme } from './theme';
import { Button, Chip } from './ui';
import { Field, NumberField, Picker, TextField } from './Field';

const COLORS = ['#2f7d63', '#4a7fb5', '#b5651d', '#7b5ea7', '#c8452f', '#2f8d8a', '#8a7a2f', '#a34a72'];
const TYPES = ['必修', '选修', '限选', '实验', '公共课'];
const EXAM_TYPES = ['考试', '考查', '考察', '其他'];

export function CourseForm({ initial, onDone }: { initial?: Course | null; onDone: () => void }) {
  const { colors } = useTheme();
  const { semester, courses, saveCourse } = useApp();
  const [name, setName] = useState(initial?.name ?? '');
  const [teacher, setTeacher] = useState(initial?.teacher ?? '');
  const [room, setRoom] = useState(initial?.room ?? '');
  const [credit, setCredit] = useState(initial?.credit ?? 0);
  const [courseType, setCourseType] = useState(initial?.courseType ?? '必修');
  const [examType, setExamType] = useState(initial?.examType ?? '考试');
  const [weekday, setWeekday] = useState(String(initial?.weekday ?? 1));
  const [startPeriod, setStartPeriod] = useState(initial?.startPeriod ?? 1);
  const [endPeriod, setEndPeriod] = useState(initial?.endPeriod ?? 2);
  const [startWeek, setStartWeek] = useState(initial?.startWeek ?? 1);
  const [endWeek, setEndWeek] = useState(initial?.endWeek ?? semester?.totalWeeks ?? 16);
  const [parity, setParity] = useState(initial?.weekParity ?? 'all');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);

  const candidate = useMemo<Partial<Course>>(
    () => ({
      id: initial?.id,
      weekday: Number(weekday),
      startPeriod,
      endPeriod: Math.max(startPeriod, endPeriod),
      startWeek,
      endWeek: Math.max(startWeek, endWeek),
      weekParity: parity as Course['weekParity'],
    }),
    [initial, weekday, startPeriod, endPeriod, startWeek, endWeek, parity],
  );

  const conflicts = useMemo(() => detectConflicts(candidate, courses), [candidate, courses]);

  async function submit() {
    if (!semester) {
      Alert.alert('提示', '请先在「我的 → 学期管理」创建学期');
      return;
    }
    if (!name.trim()) {
      Alert.alert('提示', '请填写课程名称');
      return;
    }
    if (conflicts.length > 0) {
      const list = conflicts.map((c) => `《${c.b.name}》${WEEKDAY_LABELS[c.b.weekday - 1]} ${c.b.startPeriod}-${c.b.endPeriod}节`).join('\n');
      Alert.alert('时间冲突预警', `与以下课程时间重叠：\n${list}\n\n仍要保存吗？`, [
        { text: '返回修改', style: 'cancel' },
        { text: '仍然保存', onPress: () => void doSave() },
      ]);
      return;
    }
    await doSave();
  }

  async function doSave() {
    setSaving(true);
    try {
      await saveCourse({
        id: initial?.id,
        semesterId: semester!.id,
        name: name.trim(),
        teacher: teacher.trim(),
        room: room.trim(),
        credit,
        courseType,
        examType,
        weekday: Number(weekday),
        startPeriod,
        endPeriod: Math.max(startPeriod, endPeriod),
        startWeek,
        endWeek: Math.max(startWeek, endWeek),
        weekParity: parity as Course['weekParity'],
        // 手工编辑按区间+奇偶生效；若原课程带显式周列表，改动起止周/奇偶后应回到区间判定
        weeks: [],
        color,
        note,
      });
      onDone();
    } catch (error) {
      console.warn('[CourseForm] 保存失败', error);
      Alert.alert('提示', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Field label="课程名称">
          <TextField value={name} onChangeText={setName} placeholder="如：高等数学（上）" />
        </Field>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}><Field label="教师"><TextField value={teacher} onChangeText={setTeacher} placeholder="选填" /></Field></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Field label="教室"><TextField value={room} onChangeText={setRoom} placeholder="如：A302" /></Field></View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="学分"><NumberField value={credit} onChange={setCredit} step={0.5} /></Field>
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1.4 }}>
            <Field label="课程类型">
              <Picker options={TYPES.map((t) => ({ label: t, value: t }))} value={courseType} onChange={setCourseType} />
            </Field>
          </View>
        </View>
        <Field label="考核方式">
          <Picker options={EXAM_TYPES.map((t) => ({ label: t, value: t }))} value={examType} onChange={setExamType} />
        </Field>
        <Field label="上课星期">
          <View style={styles.chipRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Chip key={label} label={label} active={Number(weekday) === i + 1} onPress={() => setWeekday(String(i + 1))} tint={color} />
            ))}
          </View>
        </Field>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}><Field label="开始节次"><NumberField value={startPeriod} onChange={setStartPeriod} /></Field></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Field label="结束节次"><NumberField value={endPeriod} onChange={setEndPeriod} /></Field></View>
        </View>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}><Field label="起始周"><NumberField value={startWeek} onChange={setStartWeek} /></Field></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Field label="结束周"><NumberField value={endWeek} onChange={setEndWeek} /></Field></View>
        </View>
        <Field label="单双周">
          <Picker
            options={[{ label: '全周', value: 'all' }, { label: '仅单周', value: 'odd' }, { label: '仅双周', value: 'even' }]}
            value={parity}
            onChange={(v) => setParity(v as Course['weekParity'])}
          />
        </Field>
        <Field label="颜色标签">
          <View style={styles.chipRow}>
            {COLORS.map((c) => (
              <Chip key={c} label="" active={color === c} onPress={() => setColor(c)} tint={c} />
            ))}
          </View>
        </Field>
        <Field label="备注">
          <TextField value={note} onChangeText={setNote} multiline placeholder="选填" />
        </Field>

        {conflicts.length > 0 ? (
          <View style={[styles.warn, { backgroundColor: colors.dangerSoft }]}>
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>⚠️ 检测到 {conflicts.length} 处时间冲突</Text>
            {conflicts.slice(0, 3).map((c) => (
              <Text key={c.b.id} style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>
                与《{c.b.name}》重叠 · {WEEKDAY_LABELS[c.b.weekday - 1]} {c.b.startPeriod}-{c.b.endPeriod} 节
              </Text>
            ))}
          </View>
        ) : null}

        <Button label={saving ? '保存中…' : '保存课程'} onPress={() => void submit()} disabled={saving} style={{ marginTop: 8 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  twoCol: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  warn: { borderRadius: 12, padding: 12, marginTop: 6 },
});
