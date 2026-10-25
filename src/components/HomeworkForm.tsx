/** 作业编辑表单 */
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import type { HomeworkItem } from '@/types';
import { useApp } from '@/hooks/useAppData';
import { Button, Chip } from './ui';
import { DateTimeField, Field, TextField } from './formBits';

export function HomeworkForm({ initial, onDone }: { initial?: HomeworkItem | null; onDone: () => void }) {
  const { semester, courses, saveHomework } = useApp();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [courseId, setCourseId] = useState<number | null>(initial?.courseId ?? null);
  const [dueAt, setDueAt] = useState(initial?.dueAt ?? new Date(Date.now() + 86400000).toISOString());
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!semester) { Alert.alert('提示', '请先创建学期'); return; }
    if (!title.trim()) { Alert.alert('提示', '请填写作业内容'); return; }
    setSaving(true);
    try {
      const linked = courses.find((c) => c.id === courseId) ?? null;
      await saveHomework({
        id: initial?.id,
        semesterId: semester.id,
        title: title.trim(),
        courseId,
        courseName: linked?.name ?? '',
        dueAt,
        done: initial?.done ?? 0,
        note,
      });
      onDone();
    } catch (e) {
      console.warn('[HomeworkForm] 保存失败', e);
      Alert.alert('提示', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Field label="作业内容"><TextField value={title} onChangeText={setTitle} placeholder="如：高数习题集 P45-48" /></Field>
        <Field label="关联课程（可选）">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip label="不关联" active={courseId == null} onPress={() => setCourseId(null)} />
            {courses.map((c) => (
              <Chip key={c.id} label={c.name} active={courseId === c.id} onPress={() => setCourseId(c.id)} tint={c.color} />
            ))}
          </View>
        </Field>
        <Field label="截止时间"><DateTimeField value={dueAt} onChange={setDueAt} /></Field>
        <Field label="备注"><TextField value={note} onChangeText={setNote} multiline placeholder="选填" /></Field>
        <Button label={saving ? '保存中…' : '保存作业'} onPress={() => void submit()} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
