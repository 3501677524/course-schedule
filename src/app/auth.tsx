/** 账号登录/注册：手机号 + 密码（basic_auth，手机号作为登录标识） */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Button, Card } from '@/components/ui';
import { Field, TextField } from '@/components/Field';
import { useTheme } from '@/components/theme';
import { useAuth } from '@/hooks/useAuth';
import { signIn, signUp } from '@/services/cloudSync';

export default function AuthScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { session, authReady } = useAuth();

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 已登录（含从后台恢复的会话）自动返回上一页；⚠️ Hook 必须在组件顶层无条件调用
  useEffect(() => {
    if (authReady && session) {
      console.info('[auth-page] 已有会话，自动返回');
      router.back();
    }
  }, [authReady, session, router]);

  const submit = async () => {
    if (busy) return;
    setError('');
    if (!/^1[3-9]\d{9}$/.test(phone.replace(/[\s-]/g, ''))) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (tab === 'register' && password !== password2) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    try {
      if (tab === 'register') {
        await signUp(phone, password);
      } else {
        await signIn(phone, password);
      }
      console.info(`[auth-page] ${tab === 'register' ? '注册' : '登录'}成功，返回上一页`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '700' }}>‹ 返回</Text>
          </Pressable>
        </View>

        <Text style={[styles.h1, { color: colors.text }]}>账号登录</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          登录后即可加入班级、拉取管理员发布的课表。手机号仅作为登录标识，本机课表数据不会自动上传。
        </Text>

        <Card style={{ marginTop: 18 }}>
          <View style={styles.tabRow}>
            <ChipBtn label="登录" active={tab === 'login'} onPress={() => { setTab('login'); setError(''); }} />
            <ChipBtn label="注册" active={tab === 'register'} onPress={() => { setTab('register'); setError(''); }} />
          </View>

          <Field label="手机号">
            <TextField value={phone} onChangeText={setPhone} placeholder="11 位手机号" keyboardType="phone-pad" />
          </Field>
          <Field label="密码" hint={tab === 'register' ? '至少 6 位' : undefined}>
            <TextField value={password} onChangeText={setPassword} placeholder="输入密码" />
          </Field>
          {tab === 'register' ? (
            <Field label="确认密码">
              <TextField value={password2} onChangeText={setPassword2} placeholder="再输入一次" />
            </Field>
          ) : null}

          {error ? <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}

          <Button label={busy ? '处理中…' : tab === 'register' ? '注册并登录' : '登录'} disabled={busy} onPress={() => void submit()} />
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ChipBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.tabBtn, { backgroundColor: active ? colors.primary : colors.cardSoft, borderColor: active ? colors.primary : colors.border }]}>
      <Text style={{ color: active ? colors.onPrimary : colors.textSecondary, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', marginTop: 8 },
  sub: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
});
