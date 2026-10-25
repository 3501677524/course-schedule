/** 检查更新：读取 GitHub 仓库的 Release / Tag 作为最新版本，与本机版本比对。
 *  ⚠️ 纯前端直连 GitHub 公共 API（无需密钥）；失败时降级为「无法检查」，不影响其它功能。 */
import { Linking } from 'react-native';

/** 开源仓库（与「关于软件 → 获取源码」同一地址） */
export const REPO_URL = 'https://github.com/3501677524/course-schedule';
const API_BASE = 'https://api.github.com/repos/3501677524/course-schedule';

/** 本机版本号：与 app.json 的 expo.version 保持一致 */
export const CURRENT_VERSION = '1.0.0';

export interface UpdateInfo {
  /** 最新版本号（去掉前缀 v） */
  latestVersion: string;
  /** 更新说明（Release 正文，可能为空） */
  notes: string;
  /** 发布时间 ISO 串，可能为空 */
  publishedAt: string;
  /** 发布页地址（Release 页或仓库页） */
  pageUrl: string;
  /** 是否有新版本 */
  hasUpdate: boolean;
}

/** 把 "v1.2.3" / "1.2" 归一成数字数组，便于逐段比较 */
function parseVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((s) => Number.parseInt(s, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** a > b 返回 true */
export function isNewer(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 查询最新版本：优先 Release，其次 Tag；都没有则视为「已是最新」 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  console.info(`[update] 开始检查更新，本机版本 ${CURRENT_VERSION}`);
  try {
    const release = (await fetchJson(`${API_BASE}/releases/latest`)) as {
      tag_name?: string;
      body?: string;
      published_at?: string;
      html_url?: string;
    };
    const latest = String(release.tag_name ?? '').replace(/^v/i, '');
    if (latest) {
      const info: UpdateInfo = {
        latestVersion: latest,
        notes: String(release.body ?? '').trim(),
        publishedAt: String(release.published_at ?? ''),
        pageUrl: String(release.html_url ?? REPO_URL),
        hasUpdate: isNewer(latest, CURRENT_VERSION),
      };
      console.info(`[update] Release 最新版本 ${latest}，是否有更新=${info.hasUpdate}`);
      return info;
    }
  } catch (e) {
    console.warn('[update] 读取 Release 失败，尝试 Tag', e);
  }

  try {
    const tags = (await fetchJson(`${API_BASE}/tags`)) as Array<{ name?: string }>;
    const names = Array.isArray(tags) ? tags.map((t) => String(t?.name ?? '').replace(/^v/i, '')).filter(Boolean) : [];
    const latest = names.sort((a, b) => (isNewer(a, b) ? -1 : 1))[0] ?? '';
    if (latest) {
      const info: UpdateInfo = {
        latestVersion: latest,
        notes: '',
        publishedAt: '',
        pageUrl: `${REPO_URL}/releases`,
        hasUpdate: isNewer(latest, CURRENT_VERSION),
      };
      console.info(`[update] Tag 最新版本 ${latest}，是否有更新=${info.hasUpdate}`);
      return info;
    }
  } catch (e) {
    console.warn('[update] 读取 Tag 失败', e);
  }

  console.info('[update] 仓库暂无 Release / Tag，视为已是最新');
  return {
    latestVersion: CURRENT_VERSION,
    notes: '',
    publishedAt: '',
    pageUrl: REPO_URL,
    hasUpdate: false,
  };
}

/** 打开更新页面（Release 页 / 仓库页） */
export async function openUpdatePage(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    console.warn('[update] 打开更新页面失败', e);
    return false;
  }
}