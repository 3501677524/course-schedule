/** 账号面板：展示登录标识与用户名，支持修改用户名、退出登录 */
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card } from './ui';
import { Field, TextField } from './Field';
import { useTheme } from './theme';
import { useAuth } from '@/hooks/useAuth';
import { signOut, updateDisplayName } from '@/services/cloudSync';

export function AccountPanel({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { session, account, displayName, authReady } = useAuth();

  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!authReady) {
    return (
      <View>
        <Card>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>正在读取账号信息…</Text>
        </Card>
        <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 14 }} />
      </View>
    );
  }

  if (!session) {
    return (
      <View>
        <Card>
          <Text style={[styles.title, { color: colors.text }]}>还没有登录</Text>
          <Text style={[styles.desc, { color: colors.textMuted }]}>
            用学号或自定账号登录后，可以加入班级、拉取管理员发布的课表，并在这里设置自己的用户名。
          </Text>
        </Card>
        <View style={{ gap: 10, marginTop: 14 }}>
          <Button label="去登录 / 注册" onPress={() => { onClose(); router.push('/auth'); }} />
          <Button label="返回" variant="ghost" onPress={onClose} />
        </View>
      </View>
    );
  }

  const save = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const next = await updateDisplayName(nameInput);
      console.info(`[account-panel] 用户名已保存为「${next}」`);
      setEditing(false);
      Alert.alert('已保存', `用户名已更新为「${next}」`);
    } catch (e) {
      console.warn('[account-panel] 修改用户名失败', e);
      setError(e instanceof Error ? e.message : '修改失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = () => {
    // 网页端 Alert.alert 不支持多按钮回调（确认按钮无响应），改用 window.confirm
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('确认退出登录？退出后班级云同步需要重新登录才能使用，本机课表数据不受影响。') : true;
      if (!ok) return;
      void signOut()
        .then(() => {
          console.info('[account-panel] 已退出登录');
          onClose();
        })
        .catch((e) => Alert.alert('退出失败', e instanceof Error ? e.message : String(e)));
      return;
    }
    Alert.alert('退出登录', '退出后班级云同步需要重新登录才能使用，本机课表数据不受影响。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认退出',
        onPress: () => {
          void signOut()
            .then(() => {
              console.info('[account-panel] 已退出登录');
              onClose();
            })
            .catch((e) => Alert.alert('退出失败', e instanceof Error ? e.message : String(e)));
        },
      },
    ]);
  };

  return (
    <View>
      <Card>
        <Text style={[styles.title, { color: colors.text }]}>{displayName || account}</Text>
        <Text style={[styles.desc, { color: colors.textMuted }]}>登录账号：{account}</Text>

        {editing ? (
          <View style={{ marginTop: 14 }}>
            <Field label="用户名" hint="2–16 位中文、字母、数字或下划线">
              <TextField value={nameInput} onChangeText={setNameInput} placeholder="输入新的用户名" />
            </Field>
            {error ? <Text style={{ color: colors.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label={busy ? '保存中…' : '保存'} disabled={busy} onPress={() => void save()} />
              <Button label="取消" variant="secondary" disabled={busy} onPress={() => { setEditing(false); setNameInput(displayName); setError(''); }} />
            </View>
          </View>
        ) : (
          <Button
            label="修改用户名"
            variant="secondary"
            style={{ marginTop: 14 }}
            onPress={() => { setNameInput(displayName); setError(''); setEditing(true); }}
          />
        )}
      </Card>

      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 18, marginTop: 12 }}>
        用户名只用于 App 内显示（「我的」页面右上角、班级课表发布者），不影响登录；登录请使用学号/账号。
      </Text>

      <View style={{ gap: 10, marginTop: 14 }}>
        <Button label="退出登录" variant="danger" onPress={doSignOut} />
        <Button label="返回" variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '800' },
  desc: { fontSize: 13, lineHeight: 20, marginTop: 6 },
});