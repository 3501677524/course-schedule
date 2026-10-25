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

const CELL_RE = /^([^\n]+)\n(.+?)\s*·\s*([^·\s][^·]*)$/;
const PALETTE = ['#2f7d63', '#4a7fb5', '#b5651d', '#7b5ea7', '#c8452f', '#2f8d8a', '#8a6d3b', '#556b2f', '#9457a0', '#3b7ea1'];

function pad2(n: number): string { return String(n).padStart(2, '0'); }

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
  for (const block of weekTitleRows) {
    for (let i = block.row + 1; i < rows.length; i++) {
      const r = rows[i];
      const c0 = r?.[0];
      if (typeof c0 === 'string' && /^第\s*\d+\s*周/.test(c0)) break; // 下一周块
      const idx = Number(c0);
      if (Number.isFinite(idx) && idx >= 1 && idx <= 20 && typeof r?.[1] === 'string' && /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(r[1].trim())) {
        if (firstBlockHeaderRow < 0) firstBlockHeaderRow = i;
        if (!periodTimes.has(idx)) {
          periodTimes.set(idx, r[1].trim());
          periods.push({ index: idx, startTime: r[1].trim().split('-')[0].trim(), endTime: r[1].trim().split('-')[1].trim(), isBreak: 0 });
        } else if (periodTimes.get(idx) !== r[1].trim()) {
          warnings.push(`第 ${idx} 节课在不同周的上课时间不一致，已按第 1 周导入`);
        }
      }
    }
  }
  if (periods.length === 0) throw new Error('未能识别节次与时间列（需「节次 / 时间」两列，时间为 HH:mm-HH:mm）');
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
      const idx = Number(r?.[0]);
      if (!Number.isFinite(idx) || idx < 1 || idx > 20) continue;
      for (let col = 2; col <= 8; col++) {
        const v = r[col];
        if (typeof v !== 'string' || !v.trim()) continue;
        if (/^周[一二三四五六日]/.test(v.trim())) continue; // 表头行
        const m = v.trim().match(CELL_RE);
        if (!m) { unnamed++; continue; }
        const key: CellKey = { name: m[1].trim(), teacher: m[3].trim(), room: m[2].trim(), weekday: col - 1, startPeriod: idx };
        const id = `${key.name}|${key.teacher}|${key.room}|${key.weekday}|${key.startPeriod}`;
        const rec = occ.get(id) ?? { key, weeks: [], endPeriods: new Map<number, number>() };
        rec.weeks.push(block.week);
        rec.endPeriods.set(block.week, Math.max(rec.endPeriods.get(block.week) ?? idx, idx));
        occ.set(id, rec);
      }
    }
  }
  if (unnamed > 0) warnings.push(`有 ${unnamed} 个格子不符合「课程名\\n教室 · 教师」格式，已跳过`);
  if (occ.size === 0) throw new Error('未解析到任何课程格子');

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

/** 选取 xlsx 文件并解析（web 走 ArrayBuffer，原生走 File.read） */
export async function pickAndParseTimetable(): Promise<TimetablePlan | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '.xlsx', '.xls'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const picked = result.assets[0];
    const name = picked.name || '课表.xlsx';
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
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    // ⚠️ 连堂课在 xlsx 里是「跨节次的纵向合并单元格」，sheet_to_json 只在合并区左上角放值，
    // 后续节次行读到空串 → endPeriod 丢失、课程时间被截断成第一节（如 10:30-11:15 + 11:25-12:10
    // 只剩 10:30-11:15）。这里先按 !merges 把锚点值回填到整个合并区再解析。
    const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
    const merges = (ws['!merges'] ?? []) as CellRange[];
    console.info(`[timetable] 工作表合并区域 ${merges.length} 个，准备展开跨节次连堂单元格`);
    const rows = fillMergedCells(rawRows.map((r) => (r || []).map((c) => String(c ?? ''))), merges);
    console.info(`[timetable] 已读取 ${name}（sheet=${sheetName}，${rows.length} 行），开始解析`);
    const plan = parseTimetableRows(rows, name);
    console.info(`[timetable] 解析完成：学期「${plan.semesterName}」${plan.startDate} 起 ${plan.totalWeeks} 周，作息 ${plan.periods.length} 节，课程 ${plan.courses.length} 条，警告 ${plan.warnings.length} 条`);
    return plan;
  } catch (error) {
    console.warn('[timetable] 课表文件解析失败', error);
    return null;
  }
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
