/** 检查更新面板：显示本机版本、最新版本与更新说明，可跳转发布页下载 */
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Button, Card } from './ui';
import { useTheme } from './theme';
import { BUILD_ID, CURRENT_VERSION, checkForUpdate, openUpdatePage, type UpdateInfo } from '@/services/updateCheck';

export function UpdatePanel({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState('');

  async function run() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await checkForUpdate();
      setInfo(r);
      console.info(`[update] 检查完成：本机 ${CURRENT_VERSION} / 最新 ${r.latestVersion} / 有更新=${r.hasUpdate}`);
    } catch (e) {
      console.warn('[update] 检查更新失败', e);
      setError('网络不可用或仓库暂时无法访问，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function goDownload() {
    const url = info?.downloadUrl || info?.pageUrl || '';
    if (!url) return;
    console.info(`[update] 打开下载地址：${url}`);
    const ok = await openUpdatePage(url);
    if (!ok) Alert.alert('打开失败', `无法打开浏览器，请手动访问：\n${url}`);
  }

  return (
    <View>
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>当前版本</Text>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 4 }}>v{CURRENT_VERSION}</Text>
        {BUILD_ID ? (
          <Text
            selectable
            style={{ color: colors.textMuted, fontSize: 10.5, lineHeight: 16, marginTop: 6, textAlign: 'center', letterSpacing: 0.2 }}
          >
            构建号 {BUILD_ID}
          </Text>
        ) : null}
        {info ? (
          <Text style={{ color: info.hasUpdate ? colors.primary : colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 8 }}>
            {info.hasUpdate ? `发现新版本 v${info.latestVersion}` : '已是最新版本'}
          </Text>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 8 }}>点击下方按钮检查是否有新版本</Text>
        )}
      </Card>

      {busy ? (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 8 }}>正在检查更新…</Text>
        </View>
      ) : null}

      {error ? (
        <Text style={{ color: colors.warning, fontSize: 12.5, lineHeight: 19, marginTop: 12 }}>{error}</Text>
      ) : null}

      {info && info.hasUpdate ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 6 }}>
            更新说明 · v{info.latestVersion}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 20 }}>
            {info.notes || '该版本未提供详细说明，可前往发布页查看。'}
          </Text>
          {info.publishedAt ? (
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 8 }}>
              发布于 {info.publishedAt.slice(0, 10)}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <View style={{ gap: 10, marginTop: 14 }}>
        <Button label={busy ? '检查中…' : '检查更新'} disabled={busy} onPress={() => void run()} />
        {info?.hasUpdate ? (
          <Button label={info?.downloadUrl ? '下载新版本安装包' : '前往发布页下载'} variant="secondary" onPress={() => void goDownload()} />
        ) : null}
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 18, marginTop: 12 }}>
        版本信息来自开源仓库的发布记录；安装包需从发布页手动下载安装，App 内不会自动替换。构建号用于区分同版本号的不同构建，长按可复制。
      </Text>

      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
    </View>
  );
}