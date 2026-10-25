/** 首次启动门控：未同意协议 → 协议页；已同意但未看指南 → 操作指南页；都满足 → 正常进入 App。
 *  ⚠️ 必须挂在 ThemeProvider 之内（需要主题色），且位于 Stack 之上（整屏覆盖，用户无法绕过）。
 *  ⚠️ 全屏层铺 colors.bg 不透明底色，不做透明度动画——Android 上任何未铺色的原生 Surface 缺省为白色。 */
import { useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/hooks/useAppData';
import { useTheme } from './theme';
import { AgreementText } from './AgreementText';
import { OnboardingGuide } from './OnboardingGuide';
import { Button } from './ui';

export function FirstRunGate() {
  const app = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  // ⚠️ 老用户「一闪而逝看到用户须知」的根因：AppDataProvider 初始 state 用 DEFAULT_SETTINGS
  // （agreementAccepted=0），门控在 loading 期间就按默认值判定「需要同意协议」并整屏渲染，
  // 等异步 load() 读到真实值 1 才卸载 → 老用户看到门控闪一下。
  // 修复：数据未加载完时一律不渲染门控，等真实 settings 到位后再判断。
  const needAgreement = app.settings.agreementAccepted !== 1;
  const needGuide = !needAgreement && app.settings.guideSeen !== 1;
  const active = !app.loading && (needAgreement || needGuide);

  // 门控期间拦截 Android 硬件返回键，避免用户退到空白页
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [active]);

  if (!active) return null;

  const accept = async () => {
    if (!checked || busy) return;
    setBusy(true);
    console.info('[first-run] 用户勾选并同意《用户须知与免责声明》，写入 agreementAccepted=1');
    try {
      await app.setSettings({ agreementAccepted: 1 });
    } finally {
      setBusy(false);
    }
  };

  const finishGuide = async () => {
    if (busy) return;
    setBusy(true);
    console.info('[first-run] 用户完成操作指南，写入 guideSeen=1');
    try {
      await app.setSettings({ guideSeen: 1 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={{ paddingTop: Math.max(insets.top, 12) + 8, paddingHorizontal: 20 }}>
        <Text style={[styles.title, { color: colors.text }]}>
          {needAgreement ? '用户须知与免责声明' : '欢迎使用课程表'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {needAgreement ? '首次使用前请阅读并同意以下条款' : '花 30 秒了解每个页面能做什么'}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {needAgreement ? <AgreementText /> : <OnboardingGuide />}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 14 }]}>
        {needAgreement ? (
          <>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => undefined);
                console.info(`[first-run] 协议勾选框切换：${checked ? '已勾选→未勾选' : '未勾选→已勾选'}`);
                setChecked((v) => !v);
              }}
              style={styles.checkRow}
            >
              <View
                style={[
                  styles.box,
                  { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' },
                ]}
              >
                {checked ? <Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
              </View>
              <Text style={[styles.checkLabel, { color: colors.textSecondary }]}>我已阅读并同意上述全部条款</Text>
            </Pressable>
            <Button
              label={busy ? '正在保存…' : '同意并继续'}
              disabled={!checked || busy}
              onPress={() => void accept()}
            />
            {!checked ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>请先勾选同意，才能继续使用</Text>
            ) : null}
          </>
        ) : (
          <Button label={busy ? '正在保存…' : '开始使用'} disabled={busy} onPress={() => void finishGuide()} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 900 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 6 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { fontSize: 13.5, flex: 1 },
  hint: { fontSize: 11.5, textAlign: 'center' },
});