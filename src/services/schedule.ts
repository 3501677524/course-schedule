/** 排课计算：把课程 + 作息 + 校历换算成某天的实际课表 */
import type { CalendarEvent, ConflictPair, Course, PeriodSlot, ScheduledCourse } from '@/types';
import { courseMatchesWeek, timeToMinutes, weekdayOf } from '@/utils/datetime';

export interface PeriodRange {
  startMin: number;
  endMin: number;
}

/** 节次序号 -> 实际起止分钟（依赖自定义作息，改作息后自动生效） */
export function periodRange(periods: PeriodSlot[], startPeriod: number, endPeriod: number): PeriodRange | null {
  if (!Array.isArray(periods) || periods.length === 0) return null;
  const sorted = [...periods].sort((a, b) => a.index - b.index);
  const first = sorted.find((p) => p.index === startPeriod) ?? sorted[Math.min(startPeriod, sorted.length) - 1];
  const last = sorted.find((p) => p.index === endPeriod) ?? sorted[Math.min(endPeriod, sorted.length) - 1];
  if (!first || !last) return null;
  const startMin = timeToMinutes(first.startTime);
  const endMin = timeToMinutes(last.endTime);
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

export function minutesToText(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

/** 校历覆盖：某天是否停课、或改为按另一个 weekday 上课 */
export function calendarOverrideFor(events: CalendarEvent[], dateKey: string): CalendarEvent | null {
  if (!Array.isArray(events)) return null;
  return events.find((e) => e.date === dateKey) ?? null;
}

export interface DayScheduleInput {
  courses: Course[];
  periods: PeriodSlot[];
  events: CalendarEvent[];
  /** 该日期属于第几周；null 表示学期外 */
  week: number | null;
  date: Date;
}

export function buildDaySchedule(input: DayScheduleInput): ScheduledCourse[] {
  const { courses, periods, events, week, date } = input;
  if (!Array.isArray(courses) || week == null) return [];

  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const override = calendarOverrideFor(events, dateKey);
  if (override && (override.kind === 'holiday' || override.kind === 'weekOff')) return [];

  const effectiveWeekday = override?.kind === 'swap' && override.swapWeekday ? override.swapWeekday : weekdayOf(date);

  const result: ScheduledCourse[] = [];
  for (const c of courses) {
    if (c.weekday !== effectiveWeekday) continue;
    if (!courseMatchesWeek(c, week)) continue;
    const range = periodRange(periods, c.startPeriod, c.endPeriod);
    if (!range) continue;
    result.push({
      ...c,
      startMin: range.startMin,
      endMin: range.endMin,
      startTimeText: minutesToText(range.startMin),
      endTimeText: minutesToText(range.endMin),
    });
  }
  return result.sort((a, b) => a.startMin - b.startMin);
}

export type ClassStatus = 'past' | 'ongoing' | 'upcoming';

export function statusOf(course: ScheduledCourse, nowMin: number): ClassStatus {
  if (nowMin >= course.endMin) return 'past';
  if (nowMin >= course.startMin) return 'ongoing';
  return 'upcoming';
}

export function progressOf(course: ScheduledCourse, nowMin: number): number {
  if (nowMin <= course.startMin) return 0;
  if (nowMin >= course.endMin) return 1;
  return (nowMin - course.startMin) / (course.endMin - course.startMin);
}

/** 下一个即将到来的课程（今天） */
export function nextClass(courses: ScheduledCourse[], nowMin: number): ScheduledCourse | null {
  return courses.find((c) => c.startMin > nowMin) ?? null;
}

/** 当前正在进行中的课程 */
export function currentClass(courses: ScheduledCourse[], nowMin: number): ScheduledCourse | null {
  return courses.find((c) => nowMin >= c.startMin && nowMin < c.endMin) ?? null;
}

/** 冲突检测：同星期 + 周次区间有交集 + 节次区间重叠 */
export function detectConflicts(candidate: Partial<Course>, all: Course[]): ConflictPair[] {
  if (!Array.isArray(all)) return [];
  const weekday = candidate.weekday;
  const sp = candidate.startPeriod ?? 0;
  const ep = candidate.endPeriod ?? sp;
  const sw = candidate.startWeek ?? 1;
  const ew = candidate.endWeek ?? sw;
  if (!weekday || !sp) return [];

  const found: ConflictPair[] = [];
  for (const other of all) {
    if (candidate.id != null && other.id === candidate.id) continue;
    if (other.weekday !== weekday) continue;
    if (ew < other.startWeek || sw > other.endWeek) continue;
    if (ep < other.startPeriod || sp > other.endPeriod) continue;
    // 单双周互斥时不算冲突
    if (candidate.weekParity === 'odd' && other.weekParity === 'even') continue;
    if (candidate.weekParity === 'even' && other.weekParity === 'odd') continue;
    found.push({ a: candidate as Course, b: other });
  }
  return found;
}

/** 网格视图：按 weekday 分桶 */
export function buildWeekGrid(
  courses: Course[],
  periods: PeriodSlot[],
  events: CalendarEvent[],
  week: number | null,
  monday: Date,
): ScheduledCourse[][] {
  const grid: ScheduledCourse[][] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(monday.getTime());
    day.setDate(monday.getDate() + i);
    grid.push(buildDaySchedule({ courses, periods, events, week, date: day }));
  }
  return grid;
}

/** 本周每日空闲时段（以已排定的节次区间为基准） */
export function freeSlotsOfDay(dayCourses: ScheduledCourse[], dayStartMin: number, dayEndMin: number): Array<{ from: number; to: number }> {
  const busy = [...dayCourses].sort((a, b) => a.startMin - b.startMin);
  const free: Array<{ from: number; to: number }> = [];
  let cursor = dayStartMin;
  for (const c of busy) {
    if (c.startMin > cursor) free.push({ from: cursor, to: c.startMin });
    cursor = Math.max(cursor, c.endMin);
  }
  if (cursor < dayEndMin) free.push({ from: cursor, to: dayEndMin });
  return free.filter((f) => f.to - f.from >= 30);
}

/** 学期统计 */
export function semesterStats(courses: Course[], periods: PeriodSlot[]) {
  let totalSessions = 0;
  let totalCredit = 0;
  const byType = new Map<string, number>();
  for (const c of courses) {
    const weeks = Math.max(0, c.endWeek - c.startWeek + 1);
    const periodsCount = Math.max(1, c.endPeriod - c.startPeriod + 1);
    // ⚠️ 显式上课周按实际天数计，否则「第 3-4、8-19 周」这类停课课表会把节数算多
    const weekCount = Array.isArray(c.weeks) && c.weeks.length > 0 ? c.weeks.length : weeks;
    const factor = c.weekParity === 'all' || (Array.isArray(c.weeks) && c.weeks.length > 0) ? 1 : 0.5;
    totalSessions += weekCount * periodsCount * factor;
    totalCredit += c.credit;
    byType.set(c.courseType, (byType.get(c.courseType) ?? 0) + c.credit);
  }
  const range = periodRange(periods, 1, periods.length);
  return {
    courseCount: courses.length,
    totalSessions: Math.round(totalSessions),
    totalCredit: Math.round(totalCredit * 10) / 10,
    dailyMinutes: range ? range.endMin - range.startMin : 0,
    byType: Array.from(byType.entries()).map(([type, credit]) => ({ type, credit })),
  };
}
