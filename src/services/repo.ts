/** 数据仓储层：全部读写走本地 SQLite，无任何网络请求 */
import { initDatabase } from './database';
import { DEFAULT_COURSES, DEFAULT_PERIODS, DEFAULT_SEMESTER } from './defaultTimetable';
import type {
  AppSettings,
  CalendarEvent,
  Course,
  ExamItem,
  HomeworkItem,
  PeriodSlot,
  Semester,
} from '@/types';

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    // ⚠️ 不能用 `Number(v) || fallback`——'0' 转成数字 0 是 falsy，会被错误回退成默认值，
    // 导致关闭开关（存 '0'）后 loadSettings 读回 1，UI 弹回开启（「开关关不上」的根因）。
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v);
}

/** SQLite 绑定值收窄：备份导入时把未知列值安全转换 */
function toBindValue(v: unknown): number | string | boolean | null | Uint8Array {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Uint8Array) return v;
  return String(v);
}

/* ------------------------------- semester ------------------------------- */

type SemesterRow = Record<string, unknown>;

function mapSemester(r: SemesterRow): Semester {
  return {
    id: num(r.id),
    name: str(r.name, '未命名学期'),
    startDate: str(r.start_date),
    totalWeeks: num(r.total_weeks, 20),
    isCurrent: num(r.is_current),
  };
}

export async function listSemesters(): Promise<Semester[]> {
  const db = await initDatabase();
  const rows = await db.getAllAsync<SemesterRow>('SELECT * FROM semester ORDER BY start_date DESC');
  return Array.isArray(rows) ? rows.map(mapSemester) : [];
}

export async function getCurrentSemester(): Promise<Semester | null> {
  const all = await listSemesters();
  if (!Array.isArray(all) || all.length === 0) return null;
  return all.find((s) => s.isCurrent === 1) ?? all[0];
}

export async function saveSemester(input: Partial<Semester> & { name: string; startDate: string }): Promise<number> {
  const db = await initDatabase();
  if (input.id) {
    await db.runAsync(
      'UPDATE semester SET name = ?, start_date = ?, total_weeks = ? WHERE id = ?',
      input.name,
      input.startDate,
      input.totalWeeks ?? 20,
      input.id,
    );
    return input.id;
  }
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM semester');
  const isFirst = num(count?.c) === 0;
  const res = await db.runAsync(
    'INSERT INTO semester (name, start_date, total_weeks, is_current) VALUES (?, ?, ?, ?)',
    input.name,
    input.startDate,
    input.totalWeeks ?? 20,
    isFirst || input.isCurrent === 1 ? 1 : 0,
  );
  if (input.isCurrent === 1) await setCurrentSemester(num(res.lastInsertRowId));
  return num(res.lastInsertRowId);
}

export async function setCurrentSemester(id: number): Promise<void> {
  const db = await initDatabase();
  await db.execAsync('UPDATE semester SET is_current = 0');
  await db.runAsync('UPDATE semester SET is_current = 1 WHERE id = ?', id);
}

export async function deleteSemester(id: number): Promise<void> {
  const db = await initDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM course WHERE semester_id = ?', id);
    await db.runAsync('DELETE FROM exam WHERE semester_id = ?', id);
    await db.runAsync('DELETE FROM homework WHERE semester_id = ?', id);
    await db.runAsync('DELETE FROM calendar_event WHERE semester_id = ?', id);
    await db.runAsync('DELETE FROM semester WHERE id = ?', id);
  });
}

/* --------------------------------- course -------------------------------- */

type CourseRow = Record<string, unknown>;

function mapCourse(r: CourseRow): Course {
  return {
    id: num(r.id),
    semesterId: num(r.semester_id),
    name: str(r.name, '未命名课程'),
    teacher: str(r.teacher),
    room: str(r.room),
    credit: num(r.credit),
    courseType: str(r.course_type, '必修'),
    examType: str(r.exam_type, '考试'),
    weekday: Math.min(7, Math.max(1, num(r.weekday, 1))),
    startPeriod: Math.max(1, num(r.start_period, 1)),
    endPeriod: Math.max(1, num(r.end_period, 1)),
    startWeek: Math.max(1, num(r.start_week, 1)),
    endWeek: Math.max(1, num(r.end_week, 16)),
    weekParity: (['all', 'odd', 'even'].includes(str(r.week_parity)) ? str(r.week_parity) : 'all') as Course['weekParity'],
    // 显式上课周（逗号分隔）；空串/非法值 → 空数组，回退到区间+奇偶判定
    weeks: parseWeeks(r.weeks),
    color: str(r.color, '#4f8c74'),
    note: str(r.note),
  };
}

/** course.weeks 列（"3,4,8,9"）→ number[]；仅保留正整数 */
function parseWeeks(v: unknown): number[] {
  const s = str(v).trim();
  if (!s) return [];
  return s
    .split(/[,，\s]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 1);
}

export async function listCourses(semesterId: number): Promise<Course[]> {
  const db = await initDatabase();
  const rows = await db.getAllAsync<CourseRow>(
    'SELECT * FROM course WHERE semester_id = ? ORDER BY weekday, start_period',
    semesterId,
  );
  return Array.isArray(rows) ? rows.map(mapCourse) : [];
}

export async function getCourse(id: number): Promise<Course | null> {
  const db = await initDatabase();
  const row = await db.getFirstAsync<CourseRow>('SELECT * FROM course WHERE id = ?', id);
  return row ? mapCourse(row) : null;
}

export async function upsertCourse(c: Omit<Course, 'id'> & { id?: number }): Promise<number> {
  const db = await initDatabase();
  const args = [
    c.semesterId,
    c.name,
    c.teacher,
    c.room,
    c.credit,
    c.courseType,
    c.examType,
    c.weekday,
    c.startPeriod,
    c.endPeriod,
    c.startWeek,
    c.endWeek,
    c.weekParity,
    (c.weeks ?? []).join(','),
    c.color,
    c.note,
  ];
  if (c.id) {
    await db.runAsync(
      `UPDATE course SET semester_id=?, name=?, teacher=?, room=?, credit=?, course_type=?, exam_type=?,
       weekday=?, start_period=?, end_period=?, start_week=?, end_week=?, week_parity=?, weeks=?, color=?, note=? WHERE id=?`,
      ...args,
      c.id,
    );
    return c.id;
  }
  const res = await db.runAsync(
    `INSERT INTO course (semester_id, name, teacher, room, credit, course_type, exam_type,
     weekday, start_period, end_period, start_week, end_week, week_parity, weeks, color, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...args,
  );
  return num(res.lastInsertRowId);
}

export async function deleteCourse(id: number): Promise<void> {
  const db = await initDatabase();
  await db.runAsync('DELETE FROM course WHERE id = ?', id);
}

/* ---------------------------------- exam --------------------------------- */

type ExamRow = Record<string, unknown>;

function mapExam(r: ExamRow): ExamItem {
  return {
    id: num(r.id),
    semesterId: num(r.semester_id),
    subject: str(r.subject, '未命名考试'),
    examKind: str(r.exam_kind, '期末'),
    datetime: str(r.datetime),
    room: str(r.room),
    seat: str(r.seat),
    remindOn: num(r.remind_on, 1),
  };
}

export async function listExams(semesterId: number): Promise<ExamItem[]> {
  const db = await initDatabase();
  const rows = await db.getAllAsync<ExamRow>('SELECT * FROM exam WHERE semester_id = ? ORDER BY datetime', semesterId);
  return Array.isArray(rows) ? rows.map(mapExam) : [];
}

export async function upsertExam(e: Omit<ExamItem, 'id'> & { id?: number }): Promise<number> {
  const db = await initDatabase();
  if (e.id) {
    await db.runAsync(
      'UPDATE exam SET semester_id=?, subject=?, exam_kind=?, datetime=?, room=?, seat=?, remind_on=? WHERE id=?',
      e.semesterId, e.subject, e.examKind, e.datetime, e.room, e.seat, e.remindOn, e.id,
    );
    return e.id;
  }
  const res = await db.runAsync(
    'INSERT INTO exam (semester_id, subject, exam_kind, datetime, room, seat, remind_on) VALUES (?,?,?,?,?,?,?)',
    e.semesterId, e.subject, e.examKind, e.datetime, e.room, e.seat, e.remindOn,
  );
  return num(res.lastInsertRowId);
}

export async function deleteExam(id: number): Promise<void> {
  const db = await initDatabase();
  await db.runAsync('DELETE FROM exam WHERE id = ?', id);
}

/* -------------------------------- homework ------------------------------- */

type HomeworkRow = Record<string, unknown>;

function mapHomework(r: HomeworkRow): HomeworkItem {
  const courseIdRaw = r.course_id;
  return {
    id: num(r.id),
    semesterId: num(r.semester_id),
    title: str(r.title, '未命名作业'),
    courseId: courseIdRaw == null ? null : num(courseIdRaw),
    courseName: str(r.course_name),
    dueAt: str(r.due_at),
    done: num(r.done),
    note: str(r.note),
  };
}

export async function listHomework(semesterId: number): Promise<HomeworkItem[]> {
  const db = await initDatabase();
  const rows = await db.getAllAsync<HomeworkRow>(
    'SELECT * FROM homework WHERE semester_id = ? ORDER BY done, due_at',
    semesterId,
  );
  return Array.isArray(rows) ? rows.map(mapHomework) : [];
}

export async function upsertHomework(h: Omit<HomeworkItem, 'id'> & { id?: number }): Promise<number> {
  const db = await initDatabase();
  if (h.id) {
    await db.runAsync(
      'UPDATE homework SET semester_id=?, title=?, course_id=?, course_name=?, due_at=?, done=?, note=? WHERE id=?',
      h.semesterId, h.title, h.courseId, h.courseName, h.dueAt, h.done, h.note, h.id,
    );
    return h.id;
  }
  const res = await db.runAsync(
    'INSERT INTO homework (semester_id, title, course_id, course_name, due_at, done, note) VALUES (?,?,?,?,?,?,?)',
    h.semesterId, h.title, h.courseId, h.courseName, h.dueAt, h.done, h.note,
  );
  return num(res.lastInsertRowId);
}

export async function deleteHomework(id: number): Promise<void> {
  const db = await initDatabase();
  await db.runAsync('DELETE FROM homework WHERE id = ?', id);
}

/* ------------------------------ period slots ----------------------------- */

type PeriodRow = Record<string, unknown>;

function mapPeriod(r: PeriodRow): PeriodSlot {
  return {
    id: num(r.id),
    index: num(r.slot_index, 1),
    startTime: str(r.start_time, '08:00'),
    endTime: str(r.end_time, '08:45'),
    isBreak: num(r.is_break),
  };
}

export async function listPeriods(): Promise<PeriodSlot[]> {
  const db = await initDatabase();
  const rows = await db.getAllAsync<PeriodRow>('SELECT * FROM period_slot ORDER BY slot_index');
  return Array.isArray(rows) ? rows.map(mapPeriod) : [];
}

export async function replacePeriods(slots: Array<Omit<PeriodSlot, 'id'>>): Promise<void> {
  const db = await initDatabase();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM period_slot');
    for (const s of slots) {
      await db.runAsync(
        'INSERT INTO period_slot (slot_index, start_time, end_time, is_break) VALUES (?,?,?,?)',
        s.index, s.startTime, s.endTime, s.isBreak,
      );
    }
  });
}

/** 首次使用时写入一套常见高校作息（每天 8 节 + 午休段） */
export async function seedDefaultPeriodsIfEmpty(): Promise<void> {
  const existing = await listPeriods();
  if (existing.length > 0) return;
  const defaults: Array<Omit<PeriodSlot, 'id'>> = [
    { index: 1, startTime: '08:00', endTime: '08:45', isBreak: 0 },
    { index: 2, startTime: '08:55', endTime: '09:40', isBreak: 0 },
    { index: 3, startTime: '10:00', endTime: '10:45', isBreak: 0 },
    { index: 4, startTime: '10:55', endTime: '11:40', isBreak: 0 },
    { index: 5, startTime: '14:00', endTime: '14:45', isBreak: 0 },
    { index: 6, startTime: '14:55', endTime: '15:40', isBreak: 0 },
    { index: 7, startTime: '16:00', endTime: '16:45', isBreak: 0 },
    { index: 8, startTime: '16:55', endTime: '17:40', isBreak: 0 },
  ];
  await replacePeriods(defaults);
}

/* ----------------------------- calendar events --------------------------- */

type CalendarRow = Record<string, unknown>;

function mapCalendar(r: CalendarRow): CalendarEvent {
  const swap = r.swap_weekday;
  return {
    id: num(r.id),
    semesterId: num(r.semester_id),
    date: str(r.date),
    kind: (['holiday', 'weekOff', 'swap'].includes(str(r.kind)) ? str(r.kind) : 'holiday') as CalendarEvent['kind'],
    swapWeekday: swap == null ? null : num(swap),
    title: str(r.title),
  };
}

export async function listCalendarEvents(semesterId: number): Promise<CalendarEvent[]> {
  const db = await initDatabase();
  const rows = await db.getAllAsync<CalendarRow>(
    'SELECT * FROM calendar_event WHERE semester_id = ? ORDER BY date',
    semesterId,
  );
  return Array.isArray(rows) ? rows.map(mapCalendar) : [];
}

export async function upsertCalendarEvent(e: Omit<CalendarEvent, 'id'> & { id?: number }): Promise<number> {
  const db = await initDatabase();
  if (e.id) {
    await db.runAsync(
      'UPDATE calendar_event SET semester_id=?, date=?, kind=?, swap_weekday=?, title=? WHERE id=?',
      e.semesterId, e.date, e.kind, e.swapWeekday, e.title, e.id,
    );
    return e.id;
  }
  const res = await db.runAsync(
    'INSERT INTO calendar_event (semester_id, date, kind, swap_weekday, title) VALUES (?,?,?,?,?)',
    e.semesterId, e.date, e.kind, e.swapWeekday, e.title,
  );
  return num(res.lastInsertRowId);
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  const db = await initDatabase();
  await db.runAsync('DELETE FROM calendar_event WHERE id = ?', id);
}

/* ----------------------------- 默认课表播种 ------------------------------ */

/**
 * 空库首次启动时写入内置默认课表（2603025 班）。
 * 双重保护：settings.defaultTimetableSeeded 标记 + semester 计数——
 * 用户自建/导入过学期就绝不覆盖，避免备份恢复后凭空多出重复学期。
 */
export async function seedDefaultTimetableIfEmpty(): Promise<boolean> {
  const db = await initDatabase();
  const flag = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'defaultTimetableSeeded'");
  if (flag && num(flag.value) === 1) return false;
  const cnt = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM semester');
  if (num(cnt?.c) > 0) {
    // 已有学期（用户手工建/导入/备份恢复）：只补标记，不写任何数据
    await saveSetting('defaultTimetableSeeded', 1);
    console.info('[repo] 已存在学期数据，跳过默认课表播种');
    return false;
  }
  const sid = await saveSemester({ ...DEFAULT_SEMESTER, isCurrent: 1 });
  await replacePeriods(DEFAULT_PERIODS);
  for (const c of DEFAULT_COURSES) {
    await upsertCourse({ ...c, semesterId: sid });
  }
  await saveSetting('defaultTimetableSeeded', 1);
  console.info(`[repo] 已写入内置默认课表：学期「${DEFAULT_SEMESTER.name}」，课程 ${DEFAULT_COURSES.length} 条，作息 ${DEFAULT_PERIODS.length} 节`);
  return true;
}

/**
 * 手动「设置为默认课表」：强制把内置课表覆盖写入（同名学期复用，避免重复学期），
 * 并把作息替换为默认作息。其它学期的课程/考试/作业不受影响。
 */
export async function restoreDefaultTimetable(): Promise<void> {
  const db = await initDatabase();
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM semester WHERE name = ?', DEFAULT_SEMESTER.name);
  let sid: number;
  if (existing) {
    sid = num(existing.id);
    await db.runAsync(
      'UPDATE semester SET start_date = ?, total_weeks = ?, is_current = 1 WHERE id = ?',
      DEFAULT_SEMESTER.startDate, DEFAULT_SEMESTER.totalWeeks, sid,
    );
    await db.runAsync("UPDATE semester SET is_current = 0 WHERE id <> ?", sid);
    console.info(`[repo] 复用同名学期 id=${sid} 覆盖默认课表`);
  } else {
    sid = await saveSemester({ ...DEFAULT_SEMESTER, isCurrent: 1 });
  }
  await replacePeriods(DEFAULT_PERIODS);
  await db.runAsync('DELETE FROM course WHERE semester_id = ?', sid);
  for (const c of DEFAULT_COURSES) {
    await upsertCourse({ ...c, semesterId: sid });
  }
  await saveSetting('defaultTimetableSeeded', 1);
  console.info(`[repo] 已恢复默认课表：semesterId=${sid}，课程 ${DEFAULT_COURSES.length} 条（含显式上课周），作息 ${DEFAULT_PERIODS.length} 节`);
}

/* -------------------------------- settings ------------------------------- */

export const DEFAULT_SETTINGS: AppSettings = {
  classRemindMinutes: 10,
  examRemindOn: 1,
  themeMode: 'system',
  accentColor: 'inkGreen',
  weatherCity: '',
  weatherCache: '',
  defaultTimetableSeeded: 0,
  agreementAccepted: 0,
  guideSeen: 0,
  hapticsEnabled: 1,
  bgMode: 'theme',
  bgColor: '',
  bgGradient: 'aurora',
  bgImageUri: '',
  bgDim: 30,
  bgThemeKey: 'auto',
  bgImageMode: 'dark',
};

const ACCENT_KEYS: AppSettings['accentColor'][] = [
  'inkGreen', 'graphiteBlue', 'duskPurple', 'warmAmber', 'celadon', 'wineRed',
];

const BG_MODES: AppSettings['bgMode'][] = ['theme', 'solid', 'gradient', 'image'];

export async function loadSettings(): Promise<AppSettings> {
  const db = await initDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map = new Map<string, string>();
  if (Array.isArray(rows)) rows.forEach((r) => map.set(r.key, r.value));
  return {
    classRemindMinutes: num(map.get('classRemindMinutes'), DEFAULT_SETTINGS.classRemindMinutes),
    examRemindOn: num(map.get('examRemindOn'), DEFAULT_SETTINGS.examRemindOn),
    themeMode: (['light', 'dark', 'system'].includes(str(map.get('themeMode')))
      ? str(map.get('themeMode'))
      : DEFAULT_SETTINGS.themeMode) as AppSettings['themeMode'],
    accentColor: (ACCENT_KEYS.includes(str(map.get('accentColor')) as AppSettings['accentColor'])
      ? (str(map.get('accentColor')) as AppSettings['accentColor'])
      : DEFAULT_SETTINGS.accentColor),
    weatherCity: str(map.get('weatherCity'), ''),
    weatherCache: str(map.get('weatherCache'), ''),
    defaultTimetableSeeded: num(map.get('defaultTimetableSeeded'), DEFAULT_SETTINGS.defaultTimetableSeeded),
    agreementAccepted: num(map.get('agreementAccepted'), DEFAULT_SETTINGS.agreementAccepted),
    guideSeen: num(map.get('guideSeen'), DEFAULT_SETTINGS.guideSeen),
    hapticsEnabled: num(map.get('hapticsEnabled'), DEFAULT_SETTINGS.hapticsEnabled),
    bgMode: (BG_MODES.includes(str(map.get('bgMode')) as AppSettings['bgMode'])
      ? (str(map.get('bgMode')) as AppSettings['bgMode'])
      : DEFAULT_SETTINGS.bgMode),
    bgColor: str(map.get('bgColor'), ''),
    bgGradient: str(map.get('bgGradient'), DEFAULT_SETTINGS.bgGradient),
    bgImageUri: str(map.get('bgImageUri'), ''),
    bgDim: num(map.get('bgDim'), DEFAULT_SETTINGS.bgDim),
    bgThemeKey: str(map.get('bgThemeKey'), DEFAULT_SETTINGS.bgThemeKey),
    bgImageMode: (str(map.get('bgImageMode')) === 'light' ? 'light' : 'dark'),
  };
}

export async function saveSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  const db = await initDatabase();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    String(value),
  );
}

/* ---------------------------- backup / restore --------------------------- */

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
}

const BACKUP_TABLES = ['semester', 'course', 'exam', 'homework', 'period_slot', 'calendar_event', 'settings', 'campus_map', 'room_marker'];

export async function exportBackup(): Promise<BackupPayload> {
  const db = await initDatabase();
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  for (const t of BACKUP_TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${t}`);
    tables[t] = Array.isArray(rows) ? rows : [];
  }
  return { version: 1, exportedAt: new Date().toISOString(), tables };
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (!payload || payload.version !== 1 || !payload.tables) {
    throw new Error('备份文件格式不正确');
  }
  const db = await initDatabase();
  await db.withTransactionAsync(async () => {
    for (const t of [...BACKUP_TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${t}`);
    }
    for (const t of BACKUP_TABLES) {
      const rows = payload.tables[t];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const keys = Object.keys(row);
        if (keys.length === 0) continue;
        const cols = keys.join(', ');
        const marks = keys.map(() => '?').join(', ');
        await db.runAsync(`INSERT INTO ${t} (${cols}) VALUES (${marks})`, ...keys.map((k) => toBindValue(row[k])));
      }
    }
  });
}
