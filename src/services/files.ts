/** 文件读写与分享：备份导出/导入、ICS/CSV 导出、铃声选择 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import type { BackupPayload } from './repo';

export async function writeAndShare(name: string, content: string, mime: string): Promise<{ ok: boolean; message: string }> {
  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true, message: '已开始下载' };
    }
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
      return { ok: true, message: '已生成，可在分享面板保存或发送' };
    }
    return { ok: true, message: `已保存到本地：${file.uri}` };
  } catch (error) {
    console.warn('[files] 导出失败', error);
    return { ok: false, message: '导出失败，请重试' };
  }
}

export async function pickBackup(): Promise<BackupPayload | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const picked = result.assets[0];
    const file = new File(picked.uri);
    const text = await file.text();
    const parsed = JSON.parse(text) as BackupPayload;
    if (!parsed || parsed.version !== 1 || !parsed.tables) {
      throw new Error('bad shape');
    }
    return parsed;
  } catch (error) {
    console.warn('[files] 备份文件读取失败', error);
    return null;
  }
}

/** 选择本地音频作为铃声，返回持久化后的 uri（复制到 document 目录防被清理） */
export async function pickRingtone(): Promise<string | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*', '*/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const src = new File(result.assets[0].uri);
    const dest = new File(Paths.document, `ringtone_${Date.now()}.${src.name.split('.').pop() ?? 'm4a'}`);
    if (dest.exists) dest.delete();
    src.copy(dest);
    return dest.uri;
  } catch (error) {
    console.warn('[files] 铃声选择失败', error);
    return null;
  }
}

export function ringtoneExists(uri: string): boolean {
  if (!uri) return true; // 空串代表内置提示音
  try {
    if (Platform.OS === 'web') return true;
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** 选择本地图片作为 App 背景，返回持久化后的 uri（复制到 document 目录防缓存清理）。
 *  ⚠️ 用 DocumentPicker 而非 ImagePicker：固定壳下 ImagePicker 需要相册权限声明，
 *  而 DocumentPicker 走系统文件选择器，无需额外权限，且能同时选到相册导出的图片。 */
export async function pickBackgroundImage(): Promise<string | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const picked = result.assets[0];
    if (Platform.OS === 'web') return picked.uri;
    const src = new File(picked.uri);
    const ext = (src.name.split('.').pop() ?? 'jpg').toLowerCase();
    const dest = new File(Paths.document, `bg_${Date.now()}.${ext}`);
    if (dest.exists) dest.delete();
    src.copy(dest);
    console.info(`[files] 背景图片已持久化：${dest.uri}`);
    return dest.uri;
  } catch (error) {
    console.warn('[files] 背景图片选择失败', error);
    return null;
  }
}
