/** 班级课表云同步面板：登录状态、加入/创建班级、管理员上传、同学拉取 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip } from './ui';
import { Field, TextField } from './Field';
import { useTheme } from './theme';
import { useApp } from '@/hooks/useAppData';
import { useAuth } from '@/hooks/useAuth';
import {
  createClass,
  getLatestSnapshotMeta,
  getMyClass,
  joinClass,
  pullLatestSnapshotToLocal,
  signOut,
  uploadSnapshot,
  type ClassInfo,
  type CloudSnapshotMeta,
} from '@/services/cloudSync';

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function CloudClassPanel({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const app = useApp();
  const { session, phone, authReady } = useAuth();

  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [meta, setMeta] = useState<CloudSnapshotMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'none' | 'join' | 'create'>('none');
  const [codeInput, setCodeInput] = useState('');
  const [nameInput, setNameInput] = useState('');

  const reload = useCallback(async (silent = false) => {
    if (!session) {
      setCls(null);
      setMeta(null);
      return;
    }
    try {
      const c = await getMyClass();
      setCls(c);
      setMeta(c ? await getLatestSnapshotMeta() : null);
    } catch (e) {
      if (!silent) Alert.alert('读取班级信息失败', e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  useEffect(() => {
    void reload(true);
  }, [reload]);

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      console.warn('[cloud-panel] 操作失败', e);
      Alert.alert('操作失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const doJoin = () =>
    guard(async () => {
      console.info(`[cloud-panel] 点击确认加入，输入班级码「${codeInput}」`);
      const c = await joinClass(codeInput);
      setMode('none');
      setCodeInput('');
      setCls(c);
      setMeta(await getLatestSnapshotMeta());
      Alert.alert('已加入班级', `「${c.name}」（班级码 ${c.code}）`);
    });

  const doCreate = () =>
    guard(async () => {
      const c = await createClass(nameInput);
      setMode('none');
      setNameInput('');
      setCls(c);
      setMeta(null);
      Alert.alert('班级已创建', `班级码：${c.code}\n把班级码发给同学，他们在「加入班级」里输入即可。你是管理员，可上传课表。`);
    });

  const doUpload = () =>
    guard(async () => {
      const r = await uploadSnapshot();
      setMeta(await getLatestSnapshotMeta());
      Alert.alert('上传成功', `已将本机课表（${r.courseCount} 门课程）发布到云端，同学可拉取最新课表。`);
    });

  const doPull = () =>
    guard(async () => {
      const m = meta ?? (await getLatestSnapshotMeta());
      Alert.alert(
        '拉取云端课表',
        `将用管理员上传的课表覆盖本机当前学期数据（${m ? `学期「${m.semesterName}」，${m.courseCount} 门课程` : ''}）。本机该学期的课程/考试/作业会被替换，个人提醒设置不受影响。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确认拉取',
            onPress: () => {
              void guard(async () => {
                const r = await pullLatestSnapshotToLocal();
                await app.refresh();
                Alert.alert('拉取完成', `已导入学期「${r.semesterName}」，共 ${r.courseCount} 门课程。`);
              });
            },
          },
        ],
      );
    });

  const doSignOut = () => {
    Alert.alert('退出登录', '退出后班级云同步功能不可用，本机课表数据不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认退出',
        onPress: () => {
          void (async () => {
            await signOut();
            setCls(null);
            setMeta(null);
          })();
        },
      },
    ]);
  };

  if (!authReady) {
    return (
      <View>
        <View style={{ paddingVertical: 24 }}>
          <ActivityIndicator color={colors.primary} />
        </View>
        <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
      </View>
    );
  }

  if (!session) {
    return (
      <View>
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>班级云同步</Text>
          <Text style={[styles.desc, { color: colors.textMuted }]}>
            当前未登录。在「我的 → 账号登录/注册」用手机号登录后，即可加入班级、拉取管理员发布的课表。
          </Text>
        </Card>
        <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 14 }} />
      </View>
    );
  }

  return (
    <View>
      <Card>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.text }]}>班级云同步</Text>
        <Chip label={`已登录 ${maskPhone(phone)}`} onPress={doSignOut} />
      </View>

      {!cls ? (
        <>
          <Text style={[styles.desc, { color: colors.textMuted }]}>
            你还没有加入任何班级。向班级管理员索要班级码加入；自己当管理员则先创建班级。
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: mode === 'none' ? 0 : 14 }}>
            <Button label="加入班级" variant={mode === 'join' ? 'primary' : 'secondary'} disabled={busy} onPress={() => setMode(mode === 'join' ? 'none' : 'join')} />
            <Button label="创建班级（我是管理员）" variant={mode === 'create' ? 'primary' : 'secondary'} disabled={busy} onPress={() => setMode(mode === 'create' ? 'none' : 'create')} />
          </View>
          {mode === 'join' ? (
            <>
              <Field label="班级码" hint="6 位字母数字，由管理员提供">
                <TextField value={codeInput} onChangeText={setCodeInput} placeholder="例如 A1B2C3" autoCapitalize="characters" autoCorrect={false} />
              </Field>
              <Button label="确认加入" disabled={busy || codeInput.replace(/\s/g, '').length < 6} onPress={doJoin} />
            </>
          ) : null}
          {mode === 'create' ? (
            <>
              <Field label="班级名称" hint="例如 2603025 班">
                <TextField value={nameInput} onChangeText={setNameInput} placeholder="输入班级名" />
              </Field>
              <Button label="创建班级" disabled={busy || nameInput.trim().length < 2} onPress={doCreate} />
            </>
          ) : null}
        </>
      ) : (
        <>
          <Text style={[styles.classLine, { color: colors.text }]}>
            {cls.name} · 班级码 {cls.code} {cls.isOwner ? '（我是管理员）' : '（成员）'}
          </Text>
          {cls.isOwner ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              同学加入时请输入上面这个班级码（长按可复制），注意区分字母与数字。
            </Text>
          ) : null}
          {meta ? (
            <Text style={[styles.desc, { color: colors.textSecondary }]}>
              云端最新课表：{meta.semesterName}，{meta.courseCount} 门课程，由 {maskPhone(meta.uploaderName)} 于 {fmtTime(meta.createdAt)} 发布。
            </Text>
          ) : (
            <Text style={[styles.desc, { color: colors.textMuted }]}>管理员还没有上传课表。</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {cls.isOwner ? (
              <Button label={busy ? '处理中…' : '上传本机课表到云端'} disabled={busy} onPress={doUpload} />
            ) : null}
            <Button label="拉取云端课表到本机" variant="secondary" disabled={busy || !meta} onPress={doPull} />
          </View>
          {cls.isOwner ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              上传会替换云端旧版本；同学在自己手机上点「拉取」才会更新，不会自动改动他们的数据。
            </Text>
          ) : null}
        </>
      )}
      </Card>
      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 14 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  classLine: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  desc: { fontSize: 13, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 10 },
});
