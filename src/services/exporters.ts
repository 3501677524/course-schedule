/** 导出：ICS 日历 / CSV(Excel) / JSON 备份；导入 JSON 备份 */
import type { Course, ExamItem, HomeworkItem, PeriodSlot, ScheduledCourse } from '@/types';
import { WEEKDAY_LABELS, courseMatchesWeek, pad2 } from '@/utils/datetime';

function esc(v: string): string {
  return (v ?? '').toString().replace(/"/g, '""');
}

export function coursesToCsv(courses: Course[], periods: PeriodSlot[]): string {
  const header = ['课程名', '教师', '教室', '学分', '课程类型', '考核方式', '星期', '节次', '起止周', '单双周'];
  const parityText = (p: string) => (p === 'odd' ? '单周' : p === 'even' ? '双周' : '全周');
  const periodText = (c: Course) => {
    const first = periods.find((p) => p.index === c.startPeriod);
    const last = periods.find((p) => p.index === c.endPeriod);
    return `${c.startPeriod}-${c.endPeriod} 节${first && last ? ` (${first.startTime}-${last.endTime})` : ''}`;
  };
  const lines = [header.join(',')];
  for (const c of courses) {
    lines.push([
      esc(c.name), esc(c.teacher), esc(c.room), String(c.credit), esc(c.courseType), esc(c.examType),
      WEEKDAY_LABELS[c.weekday - 1] ?? '', periodText(c), `第${c.startWeek}-${c.endWeek}周`, parityText(c.weekParity),
    ].join(','));
  }
  // BOM 让 Excel 正确识别 UTF-8 中文
  return `\uFEFF${lines.join('\r\n')}`;
}

export function homeworkToCsv(items: HomeworkItem[]): string {
  const lines = [['作业', '关联课程', '截止时间', '状态', '备注'].join(',')];
  for (const h of items) {
    lines.push([
      esc(h.title), esc(h.courseName), h.dueAt.replace('T', ' ').slice(0, 16),
      h.done === 1 ? '已完成' : '未完成', esc(h.note),
    ].join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

function icsStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return parts.join('\r\n');
}

/** 把某天已排定的课转换成 ICS VEVENT（RRULE 由调用方按周展开，简单可靠） */
export function buildIcs(courses: Course[], periods: PeriodSlot[], weeks: number[], mondayOfFirstWeek: Date): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//课程表//CN', 'CALSCALE:GREGORIAN'];
  let uid = 0;
  for (const c of courses) {
    const first = periods.find((p) => p.index === c.startPeriod);
    const last = periods.find((p) => p.index === c.endPeriod);
    if (!first || !last) continue;
    const [sh, sm] = first.startTime.split(':').map(Number);
    const [eh, em] = last.endTime.split(':').map(Number);
    for (const week of weeks) {
      // 统一走 courseMatchesWeek：显式上课周（导入的停课周）优先，避免导出幽灵课
      if (!courseMatchesWeek(c, week)) continue;
      const day = new Date(mondayOfFirstWeek.getTime());
      day.setDate(mondayOfFirstWeek.getDate() + (week - 1) * 7 + (c.weekday - 1));
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm, 0);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em, 0);
      uid += 1;
      lines.push(
        'BEGIN:VEVENT',
        `UID:kebiao-${uid}@local`,
        `DTSTAMP:${icsStamp(new Date())}`,
        `DTSTART:${icsStamp(start)}`,
        `DTEND:${icsStamp(end)}`,
        fold(`SUMMARY:${c.name}`),
        fold(`LOCATION:${c.room}`),
        fold(`DESCRIPTION:${c.teacher ? `教师：${c.teacher}\n` : ''}节次：${c.startPeriod}-${c.endPeriod}`),
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function examsToIcs(exams: ExamItem[]): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//课程表//CN', 'CALSCALE:GREGORIAN'];
  exams.forEach((e, i) => {
    const d = new Date(e.datetime);
    if (Number.isNaN(d.getTime())) return;
    lines.push(
      'BEGIN:VEVENT',
      `UID:exam-${i + 1}@local`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(d)}`,
      fold(`SUMMARY:${e.examKind}考试：${e.subject}`),
      fold(`LOCATION:${e.room}${e.seat ? `（座位 ${e.seat}）` : ''}`),
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** 今日课程用于迷你展示的纯文本摘要 */
export function daySummary(courses: ScheduledCourse[]): string {
  if (courses.length === 0) return '今日无课';
  return courses.map((c) => `${c.startTimeText} ${c.name} @${c.room}`).join('\n');
}
