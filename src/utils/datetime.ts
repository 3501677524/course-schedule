/** 纯函数：日期格式化、教学周计算、节次换算 */

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** YYYY-MM-DD（本地时区） */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const parts = key.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return new Date();
  }
  const [y, m, d] = parts as [number, number, number];
  return new Date(y, m - 1, d);
}

/** HH:mm -> 距 00:00 分钟数 */
export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':').map((p) => Number(p));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts[0] * 60 + parts[1];
}

export function minutesToTime(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** 1=周一 … 7=周日 */
export function weekdayOf(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/** 该日期所在周的周一 00:00 */
export function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = weekdayOf(copy);
  copy.setDate(copy.getDate() - (wd - 1));
  return copy;
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export interface WeekInfo {
  week: number | null; // null = 学期外
  parity: 'odd' | 'even';
  inSemester: boolean;
  label: string;
}

/** 以开学日期（第 1 周周一）为基准推算教学周 */
export function computeWeekInfo(startDateKey: string, totalWeeks: number, today: Date = new Date()): WeekInfo {
  if (!startDateKey || totalWeeks <= 0) {
    return { week: null, parity: 'odd', inSemester: false, label: '未设置学期' };
  }
  const start = startOfWeekMonday(parseDateKey(startDateKey));
  const thisMonday = startOfWeekMonday(today);
  const diffDays = Math.round((thisMonday.getTime() - start.getTime()) / 86400000);
  const week = Math.floor(diffDays / 7) + 1;
  if (week < 1 || week > totalWeeks) {
    return {
      week: null,
      parity: week % 2 === 0 ? 'even' : 'odd',
      inSemester: false,
      label: week > totalWeeks ? '假期 / 学期外' : '学期未开始',
    };
  }
  const parity: 'odd' | 'even' = week % 2 === 1 ? 'odd' : 'even';
  return {
    week,
    parity,
    inSemester: true,
    label: `第 ${week} 周 · ${parity === 'odd' ? '单周' : '双周'}`,
  };
}

/** 课程是否落在指定周次 */
export function courseMatchesWeek(
  course: { startWeek: number; endWeek: number; weekParity: string; weeks?: number[] },
  week: number,
): boolean {
  // ⚠️ 显式上课周优先：导入的课表常有「中间停课周」（如第 3-4、8-19 周上课），
  // 若只按 startWeek/endWeek 区间判定，第 5-7 周会被误判为有课（「第 7 周明明没课却显示有课」根因）。
  const explicit = Array.isArray(course.weeks) ? course.weeks : [];
  if (explicit.length > 0) return explicit.includes(week);
  if (week < course.startWeek || week > course.endWeek) return false;
  if (course.weekParity === 'odd') return week % 2 === 1;
  if (course.weekParity === 'even') return week % 2 === 0;
  return true;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDateCN(key: string): string {
  const d = parseDateKey(key);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 倒计时天数（向上取整，最小 0） */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 0;
  const ms = target.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export function minutesUntil(iso: string, from: Date = new Date()): number {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.max(0, Math.round((target.getTime() - from.getTime()) / 60000));
}

/** 秒数 -> 「X 天 X 小时 X 分」 */
export function humanizeDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days} 天 ${hours} 小时 ${mins} 分`;
  if (hours > 0) return `${hours} 小时 ${mins} 分`;
  if (mins > 0) return `${mins} 分 ${pad2(secs)} 秒`;
  return `${secs} 秒`;
}

export function parityLabel(parity: string): string {
  return parity === 'odd' ? '单周' : parity === 'even' ? '双周' : '全周';
}

/** 把连续整数列表折叠成「3-4、8-19」这样的区间文本 */
function foldRanges(sorted: number[]): string {
  const out: Array<[number, number]> = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w === last[1] + 1) last[1] = w;
    else out.push([w, w]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join('、');
}

/**
 * 上课周次展示文本：有显式上课周（导入的停课课表）时列出真实周次，
 * 避免显示成「第 3-19 周」而实际第 5-7 周没课。
 */
export function weeksText(startWeek: number, endWeek: number, weeks?: number[]): string {
  const list = Array.isArray(weeks) ? [...new Set(weeks.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b) : [];
  if (list.length === 0) return `第 ${startWeek}-${endWeek} 周`;
  // 完整连续区间仍按简洁写法展示
  if (list.length === endWeek - startWeek + 1 && list[0] === startWeek) return `第 ${startWeek}-${endWeek} 周`;
  return `第 ${foldRanges(list)} 周`;
}
