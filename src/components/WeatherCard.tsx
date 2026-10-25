/** 今日天气卡片：气温 / 天气 / 带伞与穿衣建议（缓存优先，失败降级旧数据） */
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { Card } from '@/components/ui';
import { useWeather } from '@/hooks/useWeather';

/** WMO 天气码 -> emoji（仅装饰用途） */
function iconFor(code: number): string {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2 || code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

export function WeatherCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const weather = useWeather();

  if (!weather.snapshot) {
    return (
      <Card style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 4, flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>
              {weather.loading ? '正在获取天气…' : '今日天气'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 18 }}>
              {weather.loading
                ? '首次加载需要几秒，之后 30 分钟内复用缓存'
                : '还没有选择城市，去「我的 · 天气城市」设置后自动显示气温、带伞与穿衣建议'}
            </Text>
          </View>
          {!weather.loading ? (
            <Text
              style={{ color: colors.primary, fontSize: 13, fontWeight: '700', marginLeft: 10 }}
              onPress={() => router.push('/(tabs)/mine')}
            >
              去设置 ›
            </Text>
          ) : null}
        </View>
      </Card>
    );
  }

  const snap = weather.snapshot;
  const advice = weather.advice;
  return (
    <Card style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.icon}>{iconFor(snap.code)}</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -1 }}>
              {snap.temp}°
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13.5, fontWeight: '600' }}>
              {snap.text} · {snap.tempMin}~{snap.tempMax}℃
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {snap.city} · 湿度 {snap.humidity}% · 风 {snap.windSpeed}km/h
            {weather.staleError ? ' · 网络不佳，展示上次数据' : ''}
          </Text>
        </View>
        {advice?.umbrella ? (
          <View style={[styles.umbrellaBadge, { backgroundColor: colors.dangerSoft }]}>
            <Text style={{ color: colors.danger, fontSize: 12.5, fontWeight: '800' }}>☂ 建议带伞</Text>
          </View>
        ) : (
          <View style={[styles.umbrellaBadge, { backgroundColor: colors.primarySoft }]}>
            <Text style={{ color: colors.success, fontSize: 12.5, fontWeight: '800' }}>不用带伞</Text>
          </View>
        )}
      </View>
      {advice ? (
        <View style={[styles.adviceBox, { backgroundColor: colors.cardSoft }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 19 }}>
            👕 {advice.clothing}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 19, marginTop: 2 }}>
            💡 {advice.summary}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 34 },
  umbrellaBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  adviceBox: { borderRadius: 10, padding: 10, gap: 2 },
});
