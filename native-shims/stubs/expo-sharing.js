/**
 * expo-sharing 的 web 降级 stub
 *
 * 系统分享面板依赖原生。
 * 显式导出覆盖高频入口，长尾交给文件内 Proxy fallback：漏名只会让体验略糙，
 * 不会整页崩溃。升档时替换本文件实现并把 manifest 的 grade 改成 equivalent 即可。
 */

const { createStubApi, createStubModule } = require('../runtime/stub-factory');
const { createStubHook } = require('../runtime/hooks');

const PKG = 'expo-sharing';

function api(apiName) {
  return createStubApi({ package: PKG, apiName });
}

const isAvailableAsync = createStubApi({ package: PKG, apiName: 'isAvailableAsync', result: false, silent: true });
const shareAsync = api('shareAsync');

// 接收系统分享只在原生端可用。保持 hook 的返回形状，避免 Web 接收页解构时崩溃。
const emptyPayloads = [];
const noop = () => {};
const useIncomingShare = createStubHook(PKG, 'useIncomingShare', {
  result: {
    sharedPayloads: emptyPayloads,
    resolvedSharedPayloads: emptyPayloads,
    clearSharedPayloads: noop,
    isResolving: false,
    error: null,
    refreshSharePayloads: noop,
  },
});

module.exports = createStubModule(PKG, { isAvailableAsync, shareAsync, useIncomingShare });
