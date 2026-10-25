/**
 * 内置 Excel 课表模板下载：模板随 App 打包（require 引入），不经过任何云端。
 *
 * ⚠️ metro.config.js 是平台维护文件、禁止修改，而 Metro 默认 assetExts 不含 xlsx，
 * require('*.xlsx') 会被当 JS 模块解析直接报错。zip 在默认 assetExts 白名单里，
 * 且 xlsx 本身就是 OOXML zip 容器——把模板以 .zip 扩展名放进 src/assets/ 即可
 * 走资产通道打包；导出时还原成 .xlsx 文件名与 spreadsheetml MIME，Excel/WPS 正常打开。
 *
 * ⚠️ 固定壳 Android 下 require 返回的 URI 经 embeddedAssetResolver 归一为
 * `asset:///assets/<hash>`，RN 网络层对「三斜杠」asset URI 支持不稳（fetch 直接抛错）。
 * 更关键的是：**expo-asset 的 downloadAsync() 内部同样是用 fetch 去拉这个 asset URI**，
 * 所以「先 downloadAsync 再 fetch」等于两次踩同一个坑，第二次仍可能失败——这正是
 * 上一版修复后「模板下载还是有问题」的根因。
 * ✅ 正确链路：直接用 expo-file-system 新 API `new File(uri)` 读安装包内资源
 * （`Paths.bundle` 即应用 bundle 目录，File 构造器接受任意 file:// / asset:// URI），
 * `file.bytes()` 拿 Uint8Array，全程不经过 RN 网络栈；web 端没有该原生能力，
 * 继续走 fetch + Blob 浏览器下载。
 */
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TEMPLATE_MODULE: number = require('../assets/2603025班学期周课表_模板.zip');

const FILE_NAME = '2603025班学期周课表_模板.xlsx';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 校验 zip/OOXML magic（PK\x03\x04），防止拿到半截文件或空文件后交给系统打开 */
function assertZipBytes(bytes: Uint8Array, where: string): void {
  if (bytes.length < 1000) throw new Error(`${where}仅拿到 ${bytes.length} 字节`);
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    throw new Error(`${where}内容不是有效的 xlsx/zip（magic=${bytes.slice(0, 4).join(',')}）`);
  }
}

/** 取模板字节：原生端走 expo-file-system 直读（不经网络栈），web 端走 fetch */
async function readTemplateBytes(): Promise<Uint8Array> {
  const asset = Asset.fromModule(TEMPLATE_MODULE);
  // 非原生包（如 web 预览）downloadAsync 原样返回 http URL；原生包会物化出 localUri
  await asset.downloadAsync().catch((e) => console.warn('[template] downloadAsync 跳过', e instanceof Error ? e.message : String(e)));
  const uri = asset.localUri ?? asset.uri;
  console.info(`[template] 待读取资源 uri=${uri}`);
  if (Platform.OS === 'web') {
    const resp = await fetch(uri);
    if (!resp.ok) throw new Error(`http ${resp.status}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    assertZipBytes(bytes, 'web 端');
    return bytes;
  }
  // ⚠️ 关键：asset:///… 这类安装包内 URI 由 expo-file-system 原生侧解析，比 fetch 稳。
  // 依次尝试：① 直接 new File(uri) 读；② Paths.bundle + 资源名；③ Paths.bundle + hash。
  const attempts: { label: string; make: () => File }[] = [
    { label: '原始 uri 直读', make: () => new File(uri) },
  ];
  if (asset.name) attempts.push({ label: `Paths.bundle/${asset.name}`, make: () => new File(Paths.bundle, asset.name) });
  const hashedName = asset.hash ? `${asset.hash}.zip` : null;
  if (hashedName) attempts.push({ label: `Paths.bundle/${hashedName}`, make: () => new File(Paths.bundle, hashedName) });

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const f = attempt.make();
      const bytes = f.bytesSync();
      assertZipBytes(bytes, attempt.label);
      console.info(`[template] 「${attempt.label}」读取成功 ${bytes.length} 字节（${f.uri}）`);
      return bytes;
    } catch (e) {
      lastError = e;
      console.warn(`[template] 「${attempt.label}」失败`, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('模板资源读取失败');
}

export async function shareTemplate(): Promise<{ ok: boolean; message: string }> {
  try {
    const bytes = await readTemplateBytes();
    if (Platform.OS === 'web') {
      const blob = new Blob([bytes as unknown as BlobPart], { type: MIME });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = FILE_NAME;
      a.click();
      URL.revokeObjectURL(url);
      console.info('[template] web 端已触发浏览器下载');
      return { ok: true, message: '已开始下载' };
    }
    const dest = new File(Paths.cache, FILE_NAME);
    if (dest.exists) dest.delete();
    dest.create();
    dest.write(bytes);
    console.info(`[template] 已写入缓存 ${dest.uri}（${dest.size} 字节）`);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(dest.uri, { mimeType: MIME, dialogTitle: '下载 Excel 课表模板' });
      console.info('[template] 已通过分享面板交付模板');
      return { ok: true, message: '已生成，可在分享面板选择「保存到文件 / 用 WPS·Excel 打开」' };
    }
    console.info(`[template] 分享不可用，已落盘 ${dest.uri}`);
    return { ok: true, message: `已保存到本地：${dest.uri}` };
  } catch (error) {
    // 失败原因必须进日志，否则端侧只能看到「导出失败」四个字无法定位
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn('[template] 模板导出失败', detail);
    return { ok: false, message: `模板导出失败：${error instanceof Error ? error.message : '请重试'}\n（技术信息：${detail}）` };
  }
}
