/**
 * 纯文本课表导入：把从聊天/网页/其他 App 复制来的表格文本（制表符或空格分列）
 * 还原成二维数组，再复用 timetableImport 的 parseTimetableRows 解析。
 *
 * 典型来源：微信/QQ 里别人发的课表、Excel 里框选复制的内容、网页表格复制。
 */
import { parseTimetableRows, type TimetablePlan } from './timetableImport';

/** 文本是否像一份课表（含「第 N 周」分块或含制表符的多行表格） */
export function looksLikeTimetable(text: string): boolean {
  const t = String(text ?? '');
  if (!t.trim()) return false;
  if (/第\s*\d+\s*周/.test(t)) return true;
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  return lines.length >= 3 && lines.some((l) => l.includes('\t'));
}

/** 文本 → 二维数组：优先按制表符分列，没有制表符时按 2 个以上空格分列 */
export function textToRows(text: string): string[][] {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  return lines.map((line) => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    // 连续 2+ 空格视为列分隔（单个空格可能是课程名内部空格）
    return line.split(/ {2,}/).map((c) => c.trim());
  });
}

export type TextImportResult =
  | { status: 'ok'; plan: TimetablePlan }
  | { status: 'error'; message: string };

/** 解析剪贴板/粘贴的课表文本 */
export function parseTimetableText(text: string, fileName = '剪贴板课表'): TextImportResult {
  if (!String(text ?? '').trim()) {
    return { status: 'error', message: '剪贴板里没有内容' };
  }
  if (!looksLikeTimetable(text)) {
    return {
      status: 'error',
      message: '剪贴板内容不像课表：需要包含「第 N 周」分块，或从 Excel 里框选复制出的制表符分隔表格',
    };
  }
  try {
    const rows = textToRows(text);
    const plan = parseTimetableRows(rows, fileName);
    console.info(
      `[timetable] 文本解析完成：${plan.startDate} 起 ${plan.totalWeeks} 周，作息 ${plan.periods.length} 节，课程 ${plan.courses.length} 条`,
    );
    return { status: 'ok', plan };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.warn('[timetable] 文本课表解析失败', error);
    return { status: 'error', message: raw };
  }
}