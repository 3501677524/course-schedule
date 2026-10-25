import '../embeddedAssetResolver';
import { reportJsError } from '../jsErrorReporter';
import { Stack } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';

type WebRuntimeGlobal = typeof globalThis & {
  __ONEDAY_WEB_NATIVE_ERROR_SUPPRESSOR_INSTALLED__?: boolean;
};

const WEB_NATIVE_MODULE_ERROR_PATTERNS = [
  /Native module.*cannot be null/i,
  /Native module.*not available/i,
  /turboModuleProxy/i,
  /TurboModuleRegistry/i,
  /requireNativeModule/i,
];

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function isWebNativeModuleError(args: unknown[]): boolean {
  const message = formatConsoleArgs(args);
  return WEB_NATIVE_MODULE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function installWebNativeErrorSuppressor(): void {
  const runtimeGlobal = globalThis as WebRuntimeGlobal;
  if (runtimeGlobal.__ONEDAY_WEB_NATIVE_ERROR_SUPPRESSOR_INSTALLED__) return;
  runtimeGlobal.__ONEDAY_WEB_NATIVE_ERROR_SUPPRESSOR_INSTALLED__ = true;

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (isWebNativeModuleError(args)) {
      reportJsError('web-suppressed-console.error', args, false);
      console.warn('[web-native-module-unavailable]', ...args);
      return;
    }
    originalConsoleError(...args);
  };
}

// Web 端只降噪“原生模块不可用”这类模板环境问题。
// 普通 React/runtime 错误继续保留 RedBox，避免隐藏真实 bug。
if (Platform.OS === 'web') {
  installWebNativeErrorSuppressor();
}

export function ErrorBoundary({ error }: { error: Error }) {
  const isWeb = Platform.OS === 'web';

  return (
    <View style={styles.fallback}>
      <Text style={styles.emoji}>{isWeb ? '📱' : '🔧'}</Text>
      <Text style={styles.title}>
        {isWeb ? '该功能需要手机硬件支持' : '应用遇到错误'}
      </Text>
      <Text style={styles.msg}>
        {isWeb
          ? '网页端无法展示此功能，请扫码用手机预览完整体验'
          : '出现错误，让AI自动修复'}
      </Text>
      {error?.message && !isWeb && (
        <Text style={styles.errorDetail}>{error.message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffbeb',
    padding: 32,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 8,
    textAlign: 'center'
  },
  msg: {
    fontSize: 15,
    color: '#b45309',
    textAlign: 'center',
    lineHeight: 22
  },
  errorDetail: {
    marginTop: 16,
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

import { AppDataProvider, useApp } from '@/hooks/useAppData';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider, useTheme } from '@/components/theme';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FirstRunGate } from '@/components/FirstRunGate';

function RootStack() {
  const { settings } = useApp();
  // 已按需求彻底删除应用内开屏/启动屏驻留逻辑：不再 preventAutoHideAsync/hideAsync 门控，
  // 冷启动直接由构建器注入的原生闪屏过渡到 JS 首帧；深色切 Tab 白闪由 contentStyle 解决。
  return (
    <ThemeProvider themeMode={settings.themeMode} accent={settings.accentColor}>
      <ThemedShell />
    </ThemeProvider>
  );
}

/** 主题化外壳：把当前深/浅底色铺到「原生容器层」——
 *  ⚠️ 深色模式下切 Tab 白闪的根因：react-native-screens 在 Android 上每个 screen
 *  是独立原生 Surface，未声明背景时默认白色；页面内 Screen 的 colors.bg 要等 JS
 *  内容绘制才覆盖，过渡瞬间露出的就是那层白。故必须给 Stack/Tabs 的 contentStyle
 *  与根 View 同时上色；Android 三键导航条用 SDK 56 声明式 <NavigationBar style>。 */
function ThemedShell() {
  const { colors, mode } = useTheme();
  console.info(`[theme-shell] 容器底色=${colors.bg}，模式=${mode}`);
  return (
    // ⚠️ GestureHandlerRootView 必须是**带底色的最外层原生容器**：它包在 AppDataProvider
    // 之外、是整个 RN 视图树的根，此前只有 flex:1 而没有 backgroundColor——在 Android 上
    // 它对应一块独立原生 Surface，缺省为白色。打开「我的」二级面板（FullSheet）时，
    // mine screen 的内容被整屏替换，只要有一帧 JS 还没绘制完 colors.bg，透出来的就是
    // 这层白 → 表现为「深色模式点二级菜单还是闪一下白」。把它挪进 ThemedShell 内部并
    // 铺 colors.bg，从物理上消除这块白色表面。
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="auto" />
        {Platform.OS === 'android' ? <NavigationBar style={mode === 'dark' ? 'light' : 'dark'} /> : null}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        {/* 首次启动门控：未同意协议 / 未看指南时整屏覆盖在 Stack 之上（铺主题底色，深色不闪白） */}
        <FirstRunGate />
      </View>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <AppDataProvider>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </AppDataProvider>
  );
}
