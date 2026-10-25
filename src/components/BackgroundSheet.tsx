/** 背景设置面板：跟随主题 / 纯色 / 渐变 / 自定义图片 + 遮罩强度 */
import { useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card, Chip, Row, SectionTitle } from './ui';
import { useTheme } from './theme';
import { useApp } from '@/hooks/useAppData';
import { GRADIENT_PRESETS, SOLID_PRESETS, BG_PALETTES, findGradient, isLightColor } from './AppBackground';
import { pickBackgroundImage } from '@/services/files';
import type { BgMode } from '@/types';

const MODES: Array<{ key: BgMode; label: string }> = [
  { key: 'theme', label: '跟随主题' },
  { key: 'solid', label: '纯色' },
  { key: 'gradient', label: '渐变' },
  { key: 'image', label: '图片' },
];

export function BackgroundSheet({ onClose }: { onClose: () => void }) {
  const { colors, mode } = useTheme();
  const app = useApp();
  const s = app.settings;
  const [busy, setBusy] = useState(false);

  async function pickImage() {
    setBusy(true);
    try {
      const uri = await pickBackgroundImage();
      if (!uri) {
        console.info('[background] 用户取消选择背景图片');
        return;
      }
      await app.setSettings({ bgImageUri: uri, bgMode: 'image' });
      console.info(`[background] 背景图片已设置：${uri}`);
    } catch (e) {
      console.warn('[background] 选择背景图片失败', e);
      Alert.alert('提示', '选择图片失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 14 }}>
        背景只影响页面底色；主题色、卡片与文字会自动适配背景明暗，保证可读性。
      </Text>

      <SectionTitle title="背景类型" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {MODES.map((m) => (
            <Chip
              key={m.key}
              label={m.label}
              active={s.bgMode === m.key}
              onPress={() => void app.setSettings({ bgMode: m.key })}
            />
          ))}
        </View>

        {s.bgMode === 'solid' ? (
          <View>
            <Text style={styles.label(colors.textSecondary)}>选择颜色</Text>
            <View style={styles.swatchRow}>
              {SOLID_PRESETS.map((c) => {
                const active = s.bgColor === c;
                return (
                  <Pressable
                    key={c}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => void app.setSettings({ bgColor: c })}
                    style={[
                      styles.swatch,
                      { backgroundColor: c, borderColor: active ? colors.primary : colors.border },
                      active && styles.swatchActive,
                    ]}
                  >
                    {active ? <Text style={{ color: isLightColor(c) ? '#171c1a' : '#ffffff', fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 8 }}>
              当前：{s.bgColor || '未选择（默认跟随主题）'}
            </Text>
          </View>
        ) : null}

        {s.bgMode === 'gradient' ? (
          <View>
            <Text style={styles.label(colors.textSecondary)}>选择渐变</Text>
            <View style={styles.gradGrid}>
              {GRADIENT_PRESETS.map((g) => {
                const active = s.bgGradient === g.key;
                const stops = mode === 'dark' ? g.dark : g.light;
                return (
                  <Pressable
                    key={g.key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => void app.setSettings({ bgGradient: g.key })}
                    style={styles.gradItem}
                  >
                    <LinearGradient
                      colors={stops}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.gradSwatch, { borderColor: active ? colors.primary : colors.border }, active && styles.swatchActive]}
                    />
                    <Text style={{ color: active ? colors.text : colors.textMuted, fontSize: 11, marginTop: 5, fontWeight: active ? '700' : '500' }}>
                      {g.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {s.bgMode === 'image' ? (
          <View>
            <Text style={styles.label(colors.textSecondary)}>自定义图片</Text>
            {s.bgImageUri ? (
              <Image source={{ uri: s.bgImageUri }} style={[styles.preview, { borderColor: colors.border }]} resizeMode="cover" />
            ) : (
              <View style={[styles.preview, styles.previewEmpty, { borderColor: colors.border, backgroundColor: colors.cardSoft }]}>
                <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>还没有选择图片</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Button label={s.bgImageUri ? '更换图片' : '选择图片'} variant="secondary" disabled={busy} onPress={() => void pickImage()} style={{ flex: 1 }} />
              {s.bgImageUri ? (
                <Button label="清除" variant="ghost" disabled={busy} onPress={() => void app.setSettings({ bgImageUri: '', bgMode: 'theme' })} style={{ flex: 1 }} />
              ) : null}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 8, lineHeight: 17 }}>
              建议选竖版图片，会自动铺满并裁切。图片保存在本机，不会上传。
            </Text>
            <Text style={styles.label(colors.textSecondary)}>图片明暗</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Chip label="深色图片" active={s.bgImageMode === 'dark'} onPress={() => void app.setSettings({ bgImageMode: 'dark' })} />
              <Chip label="浅色图片" active={s.bgImageMode === 'light'} onPress={() => void app.setSettings({ bgImageMode: 'light' })} />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 6, lineHeight: 17 }}>
              选深色图片时卡片与文字自动转深色，选浅色图片则转浅色，保证看得清。
            </Text>
          </View>
        ) : null}
      </Card>

      {/* 主题色：自定义背景时默认跟随背景主色，也可手动指定色系 */}
      {s.bgMode !== 'theme' ? (
        <>
          <SectionTitle title="主题色" />
          <Card style={{ gap: 12 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
              开关、进度条、英雄区与选中态的颜色。默认跟随背景主色，也可手动指定。
            </Text>
            <View style={styles.gradGrid}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: s.bgThemeKey === 'auto' }}
                onPress={() => void app.setSettings({ bgThemeKey: 'auto' })}
                style={styles.gradItem}
              >
                <View
                  style={[
                    styles.gradSwatch,
                    { backgroundColor: colors.primarySoft, borderColor: s.bgThemeKey === 'auto' ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center' },
                    s.bgThemeKey === 'auto' && styles.swatchActive,
                  ]}
                >
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>跟随背景</Text>
                </View>
                <Text style={{ color: s.bgThemeKey === 'auto' ? colors.text : colors.textMuted, fontSize: 11, marginTop: 5, fontWeight: s.bgThemeKey === 'auto' ? '700' : '500' }}>
                  自动
                </Text>
              </Pressable>
              {Object.entries(BG_PALETTES).map(([key, entry]) => {
                const active = s.bgThemeKey === key;
                const pal = mode === 'dark' ? entry.dark : entry.light;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => void app.setSettings({ bgThemeKey: key })}
                    style={styles.gradItem}
                  >
                    <View
                      style={[
                        styles.gradSwatch,
                        { backgroundColor: pal.primary, borderColor: active ? colors.text : colors.border, alignItems: 'center', justifyContent: 'center' },
                        active && styles.swatchActive,
                      ]}
                    >
                      {active ? <Text style={{ color: pal.onPrimary, fontSize: 14, fontWeight: '800' }}>✓</Text> : null}
                    </View>
                    <Text style={{ color: active ? colors.text : colors.textMuted, fontSize: 11, marginTop: 5, fontWeight: active ? '700' : '500' }}>
                      {entry.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </>
      ) : null}

      {s.bgMode === 'image' || s.bgMode === 'gradient' ? (
        <>
          <SectionTitle title="遮罩强度" />
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
              遮罩越强，背景越淡、文字越清晰。当前 {s.bgDim}%
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {[0, 20, 40, 60, 80].map((v) => (
                <Chip key={v} label={`${v}%`} active={s.bgDim === v} onPress={() => void app.setSettings({ bgDim: v })} />
              ))}
            </View>
          </Card>
        </>
      ) : null}

      <SectionTitle title="预览" />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ height: 120 }}>
          <BackgroundPreview />
        </View>
      </Card>

      <View style={{ marginTop: 18 }}>
        <Button label="返回" variant="secondary" onPress={onClose} />
      </View>
    </View>
  );
}

/** 面板内的小预览：与真实背景层同一套规则 */
function BackgroundPreview() {
  const { colors, mode } = useTheme();
  const { settings } = useApp();
  const dim = Math.min(Math.max(settings.bgDim, 0), 80) / 100;
  const base = settings.bgMode === 'solid' && settings.bgColor ? settings.bgColor : colors.bg;

  return (
    <View style={{ flex: 1, backgroundColor: base }}>
      {settings.bgMode === 'gradient' ? (
        <LinearGradient
          colors={mode === 'dark' ? findGradient(settings.bgGradient).dark : findGradient(settings.bgGradient).light}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {settings.bgMode === 'image' && settings.bgImageUri ? (
        <>
          <Image source={{ uri: settings.bgImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: dim }]} />
        </>
      ) : null}
      <View style={{ flex: 1, padding: 14, justifyContent: 'center', gap: 8 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>卡片标题</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>正文示例文字，检查可读性</Text>
        </View>
      </View>
    </View>
  );
}

const styles = {
  label: (color: string) => ({ color, fontSize: 12.5, fontWeight: '700' as const, marginBottom: 10 }),
  swatchRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  swatchActive: { transform: [{ scale: 1.08 }] },
  gradGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  gradItem: { alignItems: 'center' as const, width: '28%' as const },
  gradSwatch: { width: '100%' as const, height: 52, borderRadius: 12, borderWidth: 2 },
  preview: { width: '100%' as const, height: 120, borderRadius: 12, borderWidth: 1 },
  previewEmpty: { alignItems: 'center' as const, justifyContent: 'center' as const },
};

// 保留 Row 引用以便后续扩展（当前面板未使用行项）
void Row;
void Platform;