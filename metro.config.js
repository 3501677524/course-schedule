// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// expo-sqlite 的 web 实现依赖 wa-sqlite.wasm，需加入资源扩展名
if (config.resolver.assetExts) {
  config.resolver.assetExts.push('wasm');
}

// Web 端原生模块降级映射：与线上构建一致的 native-shims 方案
// 这些模块在 web 平台没有原生实现（或调用即崩），统一替换为本地 stub。
const SHIMS = {
  'expo-application': './native-shims/stubs/expo-application.js',
  'expo-file-system': './native-shims/stubs/expo-file-system.js',
  'expo-log-box': './native-shims/stubs/expo-log-box.js',
  '@expo/log-box': './native-shims/stubs/expo-log-box.js',
  '@expo/log-box/lib': './native-shims/stubs/expo-log-box.js',
  'expo-navigation-bar': './native-shims/stubs/expo-navigation-bar.js',
  'expo-notifications': './native-shims/stubs/expo-notifications.js',
  'expo-secure-store': './native-shims/stubs/expo-secure-store.js',
  'expo-sharing': './native-shims/stubs/expo-sharing.js',
  '@react-native-community/datetimepicker':
    './native-shims/stubs/react-native-community-datetimepicker.js',
};

const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = SHIMS[moduleName];
  if (shim && platform === 'web') {
    return context.resolveRequest(context, path.resolve(__dirname, shim), platform);
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
