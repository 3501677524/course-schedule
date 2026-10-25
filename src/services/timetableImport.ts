/**
 * 周课表 xlsx 导入：解析「按周课表(含日期)」格式的 Excel（每周一块：
 * 「第 N 周」标题行 + 「节次/时间/周一..周日」表头行 + 10 个节次行，
 * 格子内容如「数据库基础\n格物楼410-1 · 胡梦迪」），
 * 合并为学期 / 作息 / 课程写入 SQLite。
 */
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import * as repo from './repo';
import type { Course, PeriodSlot } from '../types';

export interface TimetablePlan {
  fileName: string;
  semesterName: string;
  startDate: string; // YYYY-MM-DD（第 1 周周一）
  totalWeeks: number;
  periods: Array<Omit<PeriodSlot, 'id'>>;
  courses: Array<Omit<Course, 'id'>>;
  warnings: string[];
}

const PALETTE = ['#2f7d63', '#4a7fb5', '#b5651d', '#7b5ea7', '#c8452f', '#2f8d8a', '#8a6d3b', '#556b2f', '#9457a0', '#3b7ea1'];

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** 全角 → 半角（数字、冒号、连字符、波浪号、空格等），并统一各种破折号为半角 '-' */
function toHalfWidth(s: string): string {
  return s
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/[—–－~～至到]/g, '-');
}

/** 单个时间点归一化：'8:45' / '08:45:00' / '0.364583'（Excel 时间小数）→ 'HH:mm' */
function normalizeClock(raw: string): string | null {
  const s = toHalfWidth(raw).trim();
  if (!s) return null;
  // Excel 把时间存成一天的比例（0~1 的小数）
  if (/^0?\.\d+$/.test(s) || /^[01](\.\d+)?$/.test(s)) {
    const frac = Number(s);
    if (Number.isFinite(frac) && frac >= 0 && frac < 1) {
      const total = Math.round(frac * 24 * 60);
      return `${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}`;
    }
  }
  const m = s.match(/^(\d{1,2})\s*[:：]\s*(\d{1,2})(?:\s*[:：]\s*\d{1,2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null;
  return `${pad2(h)}:${pad2(mi)}`;
}

/**
 * 时间区间归一化：兼容 '08:45-09:15'、'8:45~9:15'、'08:45－09:15'、'08:45:00-09:15:00'、
 * '08:45 至 09:15'、Excel 时间小数等写法。
 * ⚠️ 用户「只改了上课时间就导入失败」的根因：原实现只认半角 '-' 的 HH:mm-HH:mm，
 * 手改时间时输入法打出全角连字符/波浪号、或 Excel 把单元格存成时间类型，整行就被静默跳过。
 */
export function normalizeTimeRange(raw: string): { start: string; end: string } | null {
  const s = toHalfWidth(raw).trim();
  if (!s) return null;
  const parts = s.split('-').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const start = normalizeClock(parts[0]);
  const end = normalizeClock(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

/** 节次号归一化：兼容 '1'、'1.'、'1、'、'第1节'、'1节'、' 1 '，返回 1..20 或 null */
export function parsePeriodIndex(cell: unknown): number | null {
  if (cell == null) return null;
  const s = toHalfWidth(String(cell)).trim();
  if (!s) return null;
  const m = s.match(/^第?\s*(\d{1,2})\s*[.、．)）节]?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : null;
}

/** 课程格子解析结果 */
export interface CourseCell {
  name: string;
  room: string;
  teacher: string;
}

/**
 * 课程格子解析：按优先级兼容多种写法
 *  1. 「课名\n教室 · 教师」（标准格式）
 *  2. 「课名\n教室」（无教师）
 *  3. 「课名 教室 教师」（空格/制表符分隔，取最后两段）
 *  4. 「课名」（只有课名）
 * 课名为空才返回 null。
 */
export function parseCourseCell(raw: string): CourseCell | null {
  const text = String(raw ?? '').replace(/\r/g, '').trim();
  if (!text) return null;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const name = lines[0];
    const rest = lines.slice(1).join(' ');
    // 优先按「·」拆教室 / 教师
    const dot = rest.split(/[·•・]/).map((p) => p.trim()).filter(Boolean);
    if (dot.length >= 2) return { name, room: dot[0], teacher: dot.slice(1).join(' ') };
    // 无「·」时按空白拆：最后一段当教师，其余当教室
    const seg = rest.split(/\s+/).filter(Boolean);
    if (seg.length >= 2) return { name, room: seg.slice(0, -1).join(' '), teacher: seg[seg.length - 1] };
    return { name, room: rest, teacher: '' };
  }
  // 单行：尝试「课名 教室 教师」
  const seg = text.split(/\s+/).filter(Boolean);
  if (seg.length >= 3) return { name: seg[0], room: seg[1], teacher: seg.slice(2).join(' ') };
  return { name: text, room: '', teacher: '' };
}

/** 从「2026/9/7 — 9/13」「2026-09-07 ~ ...」等文本里取第一个合法日期 */
function firstDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d : null;
}

/** 把离散周次列表折叠成若干连续区间 */
function collapseWeeks(list: number[]): Array<[number, number]> {
  const sorted = [...new Set(list)].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w === last[1] + 1) last[1] = w;
    else out.push([w, w]);
  }
  return out;
}

/** 周次集合是否等差交替（单/双周课），是则返回 'odd'/'even'；允许首周后接一段连续周（如 4,8,10…18 中 4→8 为假期跳段） */
function parityOf(sorted: number[]): 'odd' | 'even' | null {
  if (sorted.length < 3) return null;
  const start = sorted[sorted.length - 1] % 2 === 1 ? sorted[0] + 1 : sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const step = sorted[i] - sorted[i - 1];
    if (step === 2) continue;
    // 首个间隔若与起始奇偶衔接（即跳过的是另一奇偶的开头几周），视为假期跳段
    if (i === 1 && step > 2 && sorted[i] % 2 === start % 2) continue;
    return null;
  }
  return start % 2 === 1 ? 'odd' : 'even';
}

/** 从文件名/标题行提取班级名（如「2603025班学期周课表」→「2603025班」） */
function extractClass(fileName: string, titleLine: string): string {
  for (const s of [titleLine, fileName]) {
    const m = s.match(/(\d{5,}班)/);
    if (m) return m[1];
  }
  return '';
}

/** 合并单元格区域（对齐 xlsx 的 Range：s/e 为 {r,c} 0-based 地址） */
export interface CellRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/**
 * 把工作表读成二维字符串数组。
 * ⚠️ 真机「导入失败：总行数 1、合并区域 202」的根因：固定壳里 xlsx 解析出的
 * `ws['!ref']` 可能残缺（只覆盖 A1）甚至缺失，而 `sheet_to_json` 完全依赖 `!ref`
 * 决定扫描范围——ref 残缺时只返回 1 行、ref 缺失时返回 0 行，于是「第 N 周」块、
 * 节次行全部读不到，报「未能在文件中找到开学日期」。
 * ✅ 修复：不信任 `!ref`，用所有单元格键（A1/B5/…）反算真实的最大行列重建范围，
 * 再与 `!ref` 取并集，保证不漏行。
 */
export function readSheetRows(ws: XLSX.WorkSheet): string[][] {
  const keys = Object.keys(ws).filter((k) => !k.startsWith('!'));
  let maxR = -1;
  let maxC = -1;
  for (const k of keys) {
    const cell = (ws as Record<string, unknown>)[k];
    if (!cell || typeof cell !== 'object') continue;
    let d: { r: number; c: number };
    try {
      d = XLSX.utils.decode_cell(k);
    } catch {
      continue;
    }
    if (Number.isFinite(d.r) && d.r > maxR) maxR = d.r;
    if (Number.isFinite(d.c) && d.c > maxC) maxC = d.c;
  }
  // 合并区域也可能超出单元格键范围（合并区里只有锚点有值）
  for (const m of ((ws['!merges'] ?? []) as CellRange[])) {
    if (m?.e?.r > maxR) maxR = m.e.r;
    if (m?.e?.c > maxC) maxC = m.e.c;
  }
  const declared = typeof ws['!ref'] === 'string' ? XLSX.utils.decode_range(ws['!ref']) : null;
  if (declared) {
    if (declared.e.r > maxR) maxR = declared.e.r;
    if (declared.e.c > maxC) maxC = declared.e.c;
  }
  if (maxR < 0 || maxC < 0) {
    console.warn('[timetable] 工作表里没有任何单元格，!ref=', ws['!ref']);
    return [];
  }
  const ref = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  console.info(`[timetable] 工作表范围：声明 !ref=${ws['!ref'] ?? '(缺失)'}，按单元格重建=${ref}（${keys.length} 个单元格）`);
  const patched: XLSX.WorkSheet = { ...ws, '!ref': ref };
  return XLSX.utils.sheet_to_json<string[]>(patched, { header: 1, raw: false, defval: '' });
}

/**
 * 把 Excel 合并单元格的值回填到整个合并区域。
 * ⚠️ 课表丢时间的根因：连堂课（如 10:30-11:15 + 11:25-12:10）在 xlsx 里是
 * 「跨节次的纵向合并单元格」，课程文字只存在于合并区左上角，XLSX.utils.sheet_to_json
 * 不会下填，导致后续节次行读到空串 → 只能识别 startPeriod、endPeriod 永远等于它，
 * 课程时间被截断成第一节。这里先展开合并区，让每个被占用的节次行都拿到同一份课程文本。
 * 纯函数，便于在 Node 里对真实文件离线验证。
 */
export function fillMergedCells<T>(rows: T[][], merges: CellRange[]): T[][] {
  if (!Array.isArray(merges) || merges.length === 0) return rows;
  const out = rows.map((r) => (Array.isArray(r) ? r.slice() : []));
  let filled = 0;
  for (const m of merges) {
    const anchor = out[m.s.r]?.[m.s.c];
    if (anchor == null || String(anchor).trim() === '') continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!out[r]) continue;
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        if (out[r][c] == null || String(out[r][c]).trim() === '') {
          out[r][c] = anchor;
          filled++;
        }
      }
    }
  }
  console.info(`[timetable] 合并单元格展开：${merges.length} 个区域，回填 ${filled} 格（连堂跨节课程恢复完整时间）`);
  return out;
}

/** 纯函数：工作表二维数组 → 导入计划（可在 Node 里用真实文件单测） */
export function parseTimetableRows(rows: string[][], fileName: string): TimetablePlan {
  const warnings: string[] = [];

  // 学期名：优先「X学年第Y学期」，并拼上班级名；起止日期与总周数
  let semM = '';
  let classM = '';
  let startDate: Date | null = null;
  let totalWeeks = 0;
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const line = (rows[i] || []).filter((c) => typeof c === 'string' && c.trim()).join(' ');
    if (!startDate) startDate = firstDate(line);
    const wm = line.match(/共\s*(\d+)\s*周/);
    if (wm) totalWeeks = Number(wm[1]);
    if (!semM) {
      const sm = line.match(/\d{4}\s*[-—–]\s*\d{4}\s*学年第?\s*\d+\s*学期/);
      if (sm) semM = sm[0].replace(/\s+/g, '');
    }
    if (!classM) {
      const cm = line.match(/\d{5,}班/);
      if (cm) classM = cm[0];
    }
  }
  if (!classM) classM = extractClass(fileName, '');
  const semesterName = semM ? `${semM}${classM ? `（${classM}）` : ''}` : `${classM || fileName.replace(/\.[^.]+$/, '')} 学期`;
  // 兜底：从各周标题行的日期范围取最早一天
  const weekTitleRows: Array<{ row: number; week: number }> = [];
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i]?.[0];
    if (typeof c === 'string') {
      const m = c.match(/^第\s*(\d+)\s*周/);
      if (m) weekTitleRows.push({ row: i, week: Number(m[1]) });
    }
  }
  if (!startDate && weekTitleRows.length > 0) startDate = firstDate((rows[weekTitleRows[0].row] || []).join(' '));
  if (!startDate) throw new Error('未能在文件中找到开学日期（第 1 周周一）');
  if (weekTitleRows.length > 0) totalWeeks = Math.max(totalWeeks, ...weekTitleRows.map((w) => w.week));

  // 作息：以第一周节次行为准（后续周不一致时记警告，仍按首周导入）
  const periods: Array<Omit<PeriodSlot, 'id'>> = [];
  const periodTimes = new Map<number, string>();
  let firstBlockHeaderRow = -1;
  let scannedRows = 0;
  let idxHits = 0;
  let timeMisses = 0;
  let firstTimeMissRow = -1;
  let firstTimeMissRaw = '';
  for (const block of weekTitleRows) {
    for (let i = block.row + 1; i < rows.length; i++) {
      const r = rows[i];
      const c0 = r?.[0];
      if (typeof c0 === 'string' && /^第\s*\d+\s*周/.test(c0)) break; // 下一周块
      const idx = parsePeriodIndex(c0);
      if (idx == null) continue;
      scannedRows++;
      idxHits++;
      // ⚠️ 时间列不一定在第 2 列：有的课表把「节次」和「时间」合并成一列，或前面多一列备注。
      // 逐列找第一个能解析成时间区间的单元格，避免整块作息识别失败。
      let range: { start: string; end: string } | null = null;
      let rawTime = '';
      for (let c = 1; c < Math.min(r?.length ?? 0, 5); c++) {
        const cell = r?.[c];
        if (typeof cell !== 'string' || !cell.trim()) continue;
        const parsed = normalizeTimeRange(cell);
        if (parsed) { range = parsed; rawTime = cell; break; }
        if (!rawTime) rawTime = cell;
      }
      if (!range) {
        timeMisses++;
        if (firstTimeMissRow < 0) { firstTimeMissRow = i + 1; firstTimeMissRaw = rawTime; }
        continue;
      }
      if (firstBlockHeaderRow < 0) firstBlockHeaderRow = i;
      const key = `${range.start}-${range.end}`;
      if (!periodTimes.has(idx)) {
        periodTimes.set(idx, key);
        periods.push({ index: idx, startTime: range.start, endTime: range.end, isBreak: 0 });
      } else if (periodTimes.get(idx) !== key) {
        warnings.push(`第 ${idx} 节课在不同周的上课时间不一致，已按第 1 周导入`);
      }
    }
  }
  if (timeMisses > 0) {
    warnings.push(`有 ${timeMisses} 行节次的时间列无法识别（首个在第 ${firstTimeMissRow} 行），已跳过这些节次`);
    console.warn(`[timetable] ${timeMisses} 行时间列无法识别，首个在第 ${firstTimeMissRow} 行，内容「${firstTimeMissRaw.slice(0, 40)}」`);
  }
  console.info(`[timetable] 作息扫描：扫描 ${scannedRows} 行，识别节次 ${idxHits} 个，成功解析时间 ${periods.length} 节`);
  if (periods.length === 0) {
    throw new Error(
      `未能识别节次与时间列：共扫描 ${scannedRows} 行，节次列识别到 ${idxHits} 个，时间列识别到 0 个` +
        (firstTimeMissRow > 0 ? `（首个问题行在第 ${firstTimeMissRow} 行，该行时间列内容是「${firstTimeMissRaw.slice(0, 40)}」）` : '') +
        '。时间列需形如 08:45-09:15（也支持 8:45~9:15、08:45－09:15、08:45:00-09:15:00）',
    );
  }
  periods.sort((a, b) => a.index - b.index);

  // 逐周扫描格子：key = name|teacher|room|weekday|startPeriod → 周次集合
  type CellKey = { name: string; teacher: string; room: string; weekday: number; startPeriod: number };
  const occ = new Map<string, { key: CellKey; weeks: number[]; endPeriods: Map<number, number> }>();
  let unnamed = 0;
  for (let b = 0; b < weekTitleRows.length; b++) {
    const block = weekTitleRows[b];
    const blockEnd = b + 1 < weekTitleRows.length ? weekTitleRows[b + 1].row : rows.length;
    for (let i = block.row + 1; i < blockEnd; i++) {
      const r = rows[i];
      const idx = parsePeriodIndex(r?.[0]);
      if (idx == null) continue;
      for (let col = 2; col <= 8; col++) {
        const v = r[col];
        if (typeof v !== 'string' || !v.trim()) continue;
        if (/^周[一二三四五六日]/.test(v.trim())) continue; // 表头行
        // 周标题行被合并单元格回填到第 2-8 列时，内容是日期区间，不是课程
        if (/^\d{4}\s*[/\-.]\s*\d{1,2}/.test(v.trim())) continue;
        const cell = parseCourseCell(v);
        if (!cell) { unnamed++; continue; }
        const key: CellKey = { name: cell.name, teacher: cell.teacher, room: cell.room, weekday: col - 1, startPeriod: idx };
        const id = `${key.name}|${key.teacher}|${key.room}|${key.weekday}|${key.startPeriod}`;
        const rec = occ.get(id) ?? { key, weeks: [], endPeriods: new Map<number, number>() };
        rec.weeks.push(block.week);
        rec.endPeriods.set(block.week, Math.max(rec.endPeriods.get(block.week) ?? idx, idx));
        occ.set(id, rec);
      }
    }
  }
  if (unnamed > 0) warnings.push(`有 ${unnamed} 个格子内容为空或无法识别课程名，已跳过`);
  if (occ.size === 0) throw new Error('未解析到任何课程格子（格子内容需至少包含课程名，如「数据库基础」或「数据库基础\\n格物楼410-1 · 胡梦迪」）');

  // 连堂合并：同星期、紧邻下一节、周次集合完全一致的同名同师课程合并为一门（endPeriod 扩展）
  const entries = [...occ.values()];
  const sigOf = (e: { weeks: number[] }) => [...new Set(e.weeks)].sort((a, b) => a - b).join(',');
  const mergedInto = new Set<number>();
  const courses: Array<Omit<Course, 'id'>> = [];
  const colorByName = new Map<string, string>();
  let colorIdx = 0;
  const sortedEntries = entries.sort((a, b) => a.key.weekday - b.key.weekday || a.key.startPeriod - b.key.startPeriod);
  for (let i = 0; i < sortedEntries.length; i++) {
    if (mergedInto.has(i)) continue;
    const cur = sortedEntries[i];
    let endPeriod = cur.key.startPeriod;
    const weeksSig = sigOf(cur);
    // 沿相邻节次逐级向后吃进连堂（每级都要求同位置只有一段候选，避免歧义）
    for (;;) {
      const hit = sortedEntries.findIndex(
        (n, j) =>
          !mergedInto.has(j) &&
          n.key.weekday === cur.key.weekday &&
          n.key.startPeriod === endPeriod + 1 &&
          n.key.name === cur.key.name &&
          n.key.teacher === cur.key.teacher &&
          sigOf(n) === weeksSig,
      );
      if (hit < 0) break;
      mergedInto.add(hit);
      endPeriod = sortedEntries[hit].key.startPeriod;
    }
    const ranges = collapseWeeks(cur.weeks);
    const sortedWeeks = [...new Set(cur.weeks)].sort((a, b) => a - b);
    const parity = parityOf(sortedWeeks);
    const colorKey = cur.key.name;
    if (!colorByName.has(colorKey)) colorByName.set(colorKey, PALETTE[colorIdx++ % PALETTE.length]);
    const base: Omit<Course, 'id'> = {
      semesterId: 0, // 落库时统一替换为新学期 id
      name: cur.key.name,
      teacher: cur.key.teacher,
      room: cur.key.room,
      credit: 0,
      courseType: '必修',
      examType: '考试',
      weekday: cur.key.weekday,
      startPeriod: cur.key.startPeriod,
      endPeriod,
      startWeek: sortedWeeks[0],
      endWeek: sortedWeeks[sortedWeeks.length - 1],
      weekParity: parity ?? 'all',
      // ⚠️ 必须写入真实上课周：只靠区间+奇偶无法表达「第 3-4、8-19 周」这类中间停课周，
      // 会导致第 5-7 周被渲染成有课（用户反馈「第 7 周全部无课却显示有课」的根因）。
      weeks: sortedWeeks,
      color: colorByName.get(colorKey)!,
      note: '',
    };
    if (parity) {
      courses.push({ ...base, note: `隔周上课（第 ${sortedWeeks[0]}-${sortedWeeks[sortedWeeks.length - 1]} 周${parity === 'odd' ? '单' : '双'}周）` });
      warnings.push(`《${cur.key.name}》在星期${'一二三四五六日'[cur.key.weekday - 1]}第${cur.key.startPeriod}节为隔周上课，已按${parity === 'odd' ? '单' : '双'}周导入`);
    } else if (ranges.length === 1) {
      courses.push(base);
    } else if (ranges.length === 2) {
      // 中间有停课周（如假期/实践周）：保留起止两段区间，备注写明实际周次。
      // ⚠️ base.weeks 已是真实上课周列表，排课只认它——startWeek/endWeek 之间的空档周
      // （如第 5-7 周）不会再被渲染成有课。
      courses.push({
        ...base,
        startWeek: ranges[0][0],
        endWeek: ranges[ranges.length - 1][1],
        note: `第 ${ranges.map((r) => `${r[0]}-${r[1]}`).join('、')} 周上课（中间周停课）`,
      });
      console.info(`[timetable] 《${cur.key.name}》星期${'一二三四五六日'[cur.key.weekday - 1]}第${cur.key.startPeriod}节存在停课周，显式上课周=${sortedWeeks.join(',')}`);
      warnings.push(`《${cur.key.name}》在星期${'一二三四五六日'[cur.key.weekday - 1]}第${cur.key.startPeriod}节的上课周次不连续，已合并为一门并在备注标明实际周次`);
    } else {
      // 3 段以上且非规律隔周：拆成多段，每段各自带本段的显式周列表，避免区间内出现无课的“幽灵周”
      ranges.forEach((rg, ri) => {
        courses.push({
          ...base,
          startWeek: rg[0],
          endWeek: rg[1],
          weeks: sortedWeeks.filter((w) => w >= rg[0] && w <= rg[1]),
          note: `第 ${rg[0]}-${rg[1]} 周（导入分段 ${ri + 1}/${ranges.length}，原课表存在停课周）`,
        });
      });
      warnings.push(`《${cur.key.name}》在星期${'一二三四五六日'[cur.key.weekday - 1]}第${cur.key.startPeriod}节的上课周次零散，已拆分为 ${ranges.length} 段`);
    }
  }

  const monday = new Date(startDate.getTime());
  // 若首日不是周一，回退到所在周周一
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return {
    fileName,
    semesterName,
    startDate: `${monday.getFullYear()}-${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`,
    totalWeeks,
    periods,
    courses,
    warnings,
  };
}

/** 解析结果：成功带 plan，失败带用户可读的失败原因（不再静默返回 null） */
export type TimetablePickResult =
  | { status: 'ok'; plan: TimetablePlan }
  | { status: 'canceled' }
  | { status: 'error'; message: string };

/** 选取 xlsx 文件并解析（web 走 ArrayBuffer，原生走 File.read） */
export async function pickAndParseTimetable(): Promise<TimetablePickResult> {
  let stage = '选择文件';
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '.xlsx', '.xls'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return { status: 'canceled' };
    const picked = result.assets[0];
    const name = picked.name || '课表.xlsx';
    stage = '读取文件内容';
    let wb: XLSX.WorkBook;
    if (Platform.OS === 'web') {
      const resp = await fetch(picked.uri);
      const buf = await resp.arrayBuffer();
      wb = XLSX.read(buf, { type: 'array' });
    } else {
      // SDK 56 新 API：File 实现 Blob 接口，直接取 ArrayBuffer
      const file = new File(picked.uri);
      const buf = await file.arrayBuffer();
      wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    }
    stage = '打开工作表';
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error('文件里没有可读取的工作表');
    // ⚠️ 连堂课在 xlsx 里是「跨节次的纵向合并单元格」，sheet_to_json 只在合并区左上角放值，
    // 后续节次行读到空串 → endPeriod 丢失、课程时间被截断成第一节（如 10:30-11:15 + 11:25-12:10
    // 只剩 10:30-11:15）。这里先按 !merges 把锚点值回填到整个合并区再解析。
    const rawRows = readSheetRows(ws);
    const merges = (ws['!merges'] ?? []) as CellRange[];
    console.info(`[timetable] 工作表合并区域 ${merges.length} 个，准备展开跨节次连堂单元格`);
    const rows = fillMergedCells(rawRows.map((r) => (r || []).map((c) => String(c ?? ''))), merges);
    console.info(`[timetable] 已读取 ${name}（sheet=${sheetName}，${rows.length} 行），开始解析`);
    stage = '解析课表结构';
    const plan = parseTimetableRows(rows, name);
    console.info(`[timetable] 解析完成：学期「${plan.semesterName}」${plan.startDate} 起 ${plan.totalWeeks} 周，作息 ${plan.periods.length} 节，课程 ${plan.courses.length} 条，警告 ${plan.warnings.length} 条`);
    return { status: 'ok', plan };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.warn(`[timetable] 课表文件解析失败（阶段：${stage}）`, error);
    return { status: 'error', message: `${stage}失败：${raw}` };
  }
}

/**
 * 诊断用：把解析过程的关键中间结果直接返回给界面展示。
 * 用户报「导入失败」但拿不到具体原因时，用它一次性看清卡在哪一步。
 */
export interface TimetableDiagnose {
  fileName: string;
  sheetName: string;
  rowCount: number;
  mergeCount: number;
  weekBlocks: number;
  periodRows: number;
  periods: number;
  courseCells: number;
  courses: number;
  warnings: string[];
  error: string | null;
}

export async function diagnoseTimetableFile(): Promise<TimetableDiagnose | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '.xlsx', '.xls'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const picked = result.assets[0];
  const name = picked.name || '课表.xlsx';
  const diag: TimetableDiagnose = {
    fileName: name, sheetName: '', rowCount: 0, mergeCount: 0, weekBlocks: 0,
    periodRows: 0, periods: 0, courseCells: 0, courses: 0, warnings: [], error: null,
  };
  try {
    let wb: XLSX.WorkBook;
    if (Platform.OS === 'web') {
      const resp = await fetch(picked.uri);
      wb = XLSX.read(await resp.arrayBuffer(), { type: 'array' });
    } else {
      const buf = await new File(picked.uri).arrayBuffer();
      wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    }
    diag.sheetName = wb.SheetNames[0] ?? '';
    const ws = wb.Sheets[diag.sheetName];
    if (!ws) throw new Error('文件里没有可读取的工作表');
    const rawRows = readSheetRows(ws);
    const merges = (ws['!merges'] ?? []) as CellRange[];
    diag.mergeCount = merges.length;
    const rows = fillMergedCells(rawRows.map((r) => (r || []).map((c) => String(c ?? ''))), merges);
    diag.rowCount = rows.length;
    for (const r of rows) {
      if (typeof r?.[0] === 'string' && /^第\s*\d+\s*周/.test(r[0])) diag.weekBlocks++;
      if (parsePeriodIndex(r?.[0]) != null) diag.periodRows++;
      for (let c = 2; c <= 8; c++) {
        const v = r?.[c];
        if (typeof v === 'string' && v.trim() && !/^周[一二三四五六日]/.test(v.trim()) && !/^\d{4}\s*[/\-.]\s*\d{1,2}/.test(v.trim())) diag.courseCells++;
      }
    }
    const plan = parseTimetableRows(rows, name);
    diag.periods = plan.periods.length;
    diag.courses = plan.courses.length;
    diag.warnings = plan.warnings;
    console.info(`[timetable] 诊断完成：${JSON.stringify({ ...diag, warnings: diag.warnings.length })}`);
  } catch (error) {
    diag.error = error instanceof Error ? error.message : String(error);
    console.warn('[timetable] 诊断失败', error);
  }
  return diag;
}

/** 确认导入后落库：新建学期 + 覆盖作息 + 批量插入课程 */
export async function applyTimetablePlan(plan: TimetablePlan): Promise<void> {
  const sid = await repo.saveSemester({ name: plan.semesterName, startDate: plan.startDate, totalWeeks: plan.totalWeeks, isCurrent: 1 });
  await repo.replacePeriods(plan.periods);
  for (const c of plan.courses) {
    await repo.upsertCourse({ ...c, semesterId: sid });
  }
  console.info(`[timetable] 导入落库完成：semesterId=${sid}，课程 ${plan.courses.length} 条`);
}
