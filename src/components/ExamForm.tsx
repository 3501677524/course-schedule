/** 考试编辑表单 */
import { useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import type { ExamItem } from '@/types';
import { useApp } from '@/hooks/useAppData';
import { Button } from './ui';
import { Field, Picker, TextField, Toggle2, DateTimeField } from './formBits';

const KINDS = ['期中', '期末', '补考', '重修', '其他'];

export function ExamForm({ initial, onDone }: { initial?: ExamItem | null; onDone: () => void }) {
  const { semester, saveExam } = useApp();
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [kind, setKind] = useState(initial?.examKind ?? '期末');
  const [datetime, setDatetime] = useState(initial?.datetime ?? new Date(Date.now() + 86400000).toISOString());
  const [room, setRoom] = useState(initial?.room ?? '');
  const [seat, setSeat] = useState(initial?.seat ?? '');
  const [remindOn, setRemindOn] = useState((initial?.remindOn ?? 1) === 1);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!semester) { Alert.alert('提示', '请先创建学期'); return; }
    if (!subject.trim()) { Alert.alert('提示', '请填写考试科目'); return; }
    setSaving(true);
    try {
      await saveExam({
        id: initial?.id,
        semesterId: semester.id,
        subject: subject.trim(),
        examKind: kind,
        datetime,
        room: room.trim(),
        seat: seat.trim(),
        remindOn: remindOn ? 1 : 0,
      });
      onDone();
    } catch (e) {
      console.warn('[ExamForm] 保存失败', e);
      Alert.alert('提示', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  function Text2({ children }: { children: ReactNode }) {
    return <Text style={{ fontSize: 13, color: '#8b948f' }}>{children}</Text>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Field label="考试科目"><TextField value={subject} onChangeText={setSubject} placeholder="如：高等数学（上）" /></Field>
        <Field label="考试类型"><Picker options={KINDS.map((k) => ({ label: k, value: k }))} value={kind} onChange={setKind} /></Field>
        <Field label="考试时间"><DateTimeField value={datetime} onChange={setDatetime} /></Field>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1.4 }}><Field label="考场"><TextField value={room} onChangeText={setRoom} placeholder="如：一教 301" /></Field></View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}><Field label="座位"><TextField value={seat} onChangeText={setSeat} placeholder="选填" /></Field></View>
        </View>
        <Field label="考前提醒" hint="开启后将在考前 1 天与考前 1 小时各推送一次本地通知">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Toggle2 on={remindOn} onChange={setRemindOn} />
            <Text2>{remindOn ? '已开启双重提醒' : '已关闭提醒'}</Text2>
          </View>
        </Field>
        <Button label={saving ? '保存中…' : '保存考试'} onPress={() => void submit()} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

