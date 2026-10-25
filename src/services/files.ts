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
