/** 全局数据上下文：学期 / 课程 / 作息 / 校历 / 考试 / 作业 / 设置 + 每秒时钟 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppSettings,
  CalendarEvent,
  Course,
  ExamItem,
  HomeworkItem,
  PeriodSlot,
  Semester,
} from '@/types';
import { DEFAULT_SETTINGS } from '@/services/repo';
import * as repo from '@/services/repo';
import { computeWeekInfo, startOfWeekMonday, toDateKey } from '@/utils/datetime';
import { rescheduleAll } from '@/services/notifications';

interface AppState {
  loading: boolean;
  semester: Semester | null;
  semesters: Semester[];
  courses: Course[];
  periods: PeriodSlot[];
  events: CalendarEvent[];
  exams: ExamItem[];
  homework: HomeworkItem[];
  settings: AppSettings;
  week: number | null;
  weekLabel: string;
  monday: Date;
  /** 每秒推进，用于倒计时与「进行中」状态 */
  tick: number;
  refresh: () => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  saveCourse: (c: Omit<Course, 'id'> & { id?: number }) => Promise<void>;
  removeCourse: (id: number) => Promise<void>;
  saveExam: (e: Omit<ExamItem, 'id'> & { id?: number }) => Promise<void>;
  removeExam: (id: number) => Promise<void>;
  saveHomework: (h: Omit<HomeworkItem, 'id'> & { id?: number }) => Promise<void>;
  removeHomework: (id: number) => Promise<void>;
  savePeriods: (slots: Array<Omit<PeriodSlot, 'id'>>) => Promise<void>;
  saveCalendarEvent: (e: Omit<CalendarEvent, 'id'> & { id?: number }) => Promise<void>;
  removeCalendarEvent: (id: number) => Promise<void>;
  saveSemester: (s: Partial<Semester> & { name: string; startDate: string }) => Promise<void>;
  switchSemester: (id: number) => Promise<void>;
  deleteSemester: (id: number) => Promise<void>;
  seedSample: () => Promise<void>;
}

const EMPTY: AppState = {
  loading: true,
  semester: null,
  semesters: [],
  courses: [],
  periods: [],
  events: [],
  exams: [],
  homework: [],
  settings: DEFAULT_SETTINGS,
  week: null,
  weekLabel: '未设置学期',
  monday: new Date(),
  tick: 0,
  refresh: async () => {},
  setSettings: async () => {},
  saveCourse: async () => {},
  removeCourse: async () => {},
  saveExam: async () => {},
  removeExam: async () => {},
  saveHomework: async () => {},
  removeHomework: async () => {},
  savePeriods: async () => {},
  saveCalendarEvent: async () => {},
  removeCalendarEvent: async () => {},
  saveSemester: async () => {},
  switchSemester: async () => {},
  deleteSemester: async () => {},
  seedSample: async () => {},
};

const Ctx = createContext<AppState>(EMPTY);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AppState, keyof Pick<AppState,
    'refresh' | 'setSettings' | 'saveCourse' | 'removeCourse' | 'saveExam' | 'removeExam' |
    'saveHomework' | 'removeHomework' | 'savePeriods' | 'saveCalendarEvent' | 'removeCalendarEvent' |
    'saveSemester' | 'switchSemester' | 'deleteSemester' | 'seedSample'>>>({
    loading: true,
    semester: null,
    semesters: [],
    courses: [],
    periods: [],
    events: [],
    exams: [],
    homework: [],
    settings: DEFAULT_SETTINGS,
    week: null,
    weekLabel: '未设置学期',
    monday: new Date(),
    tick: 0,
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // 乐观更新 + 尾任务重跑：写库后的 load() 若撞上正在执行的旧轮次，必须等旧轮结束后
  // 再跑一轮（旧轮读到的是写库前的数据，直接复用会把 UI 覆盖回旧值——连续点开关时尤其明显）。
  const queuedLoads = useRef(0);
  const loadTail = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async () => {
    // 排队计数：正在跑旧轮时再请求 load，标记「旧轮结束后需重跑」——
    // 旧轮读到的是写库前的数据，直接复用会把乐观更新后的 UI 覆盖回旧值。
    if (queuedLoads.current > 0) {
      queuedLoads.current += 1;
      console.info(`[app] load 排队合并（待重跑 ${queuedLoads.current} 次），等尾任务完成后取最新库值`);
      return loadTail.current;
    }
    queuedLoads.current = 1;
    const run = async (): Promise<void> => {
      // 每轮开头清零：本轮期间新到达的 load() 会把计数抬到 >0，循环条件据此决定是否重跑
      queuedLoads.current = 0;
      do {
        try {
          // 空库首次启动：写入内置默认课表（2603025 班）；已有学期数据则自动跳过，之后不再覆盖作息
          await repo.seedDefaultTimetableIfEmpty();
          await repo.seedDefaultPeriodsIfEmpty();
          const [semesters, periods, settings] = await Promise.all([
            repo.listSemesters(),
            repo.listPeriods(),
            repo.loadSettings(),
          ]);
          const semester = semesters.find((s) => s.isCurrent === 1) ?? semesters[0] ?? null;
          let courses: Course[] = [];
          let events: CalendarEvent[] = [];
          let exams: ExamItem[] = [];
          let homework: HomeworkItem[] = [];
          if (semester) {
            [courses, events, exams, homework] = await Promise.all([
              repo.listCourses(semester.id),
              repo.listCalendarEvents(semester.id),
              repo.listExams(semester.id),
              repo.listHomework(semester.id),
            ]);
          }
          const info = semester ? computeWeekInfo(semester.startDate, semester.totalWeeks) : null;
          if (!mounted.current) return;
          setState((prev) => ({
            ...prev,
            loading: false,
            semesters,
            semester,
            periods,
            settings,
            courses,
            events,
            exams,
            homework,
            week: info?.week ?? null,
            weekLabel: info?.label ?? '未设置学期',
            monday: semester ? startOfWeekMonday(new Date()) : prev.monday,
          }));
          // 数据变化后重建预约通知（无权限时静默降级）
          if (semester) {
            void rescheduleAll({
              settings,
              courses,
              periods,
              exams,
              events,
              week: info?.week ?? null,
              semesterId: semester.id,
            }).catch((e) => console.warn('[app] 提醒重排失败', e));
          }
        } catch (error) {
          console.warn('[app] 数据加载失败，展示空态', error);
          if (mounted.current) setState((prev) => ({ ...prev, loading: false }));
        }
      } while (queuedLoads.current > 0 && mounted.current);
      // 本轮期间没有新的 load 请求：清零退出
      queuedLoads.current = 0;
    };
    const next = loadTail.current.then(() => run());
    loadTail.current = next;
    return next;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 分钟档位 tick：每 15 秒比对一次「当前分钟」，只有跨分钟才推进状态。
  // 倒计时与进行中高亮都按分钟粒度变化，无需每秒重渲染整棵页面树（性能优化点）。
  // ⚠️ useRef 必须在组件顶层调用，不能放进 useEffect 回调——否则 React 在 effect 执行时
  // 检测到 hook 越界，抛 Invalid hook call（首帧 throwInvalidHookError、次帧 exports.useRef）。
  const minuteRef = useRef(Math.floor(Date.now() / 60000));
  useEffect(() => {
    console.info('[app] 分钟档位 tick 启动（useRef 已移至组件顶层，修复 Invalid hook call）');
    const id = setInterval(() => {
      const m = Math.floor(Date.now() / 60000);
      if (m !== minuteRef.current) {
        minuteRef.current = m;
        if (mounted.current) setState((prev) => ({ ...prev, tick: prev.tick + 1 }));
      }
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const patch = useCallback((p: Partial<AppState>) => setState((prev) => ({ ...prev, ...p })), []);

  const value = useMemo<AppState>(() => ({
    ...state,
    refresh: load,
    setSettings: async (p) => {
      // 先乐观合入内存，开关/输入立即有反馈；再落库并后台串行补跑全量刷新
      if (mounted.current) setState((prev) => ({ ...prev, settings: { ...prev.settings, ...p } }));
      console.info(`[app] setSettings 乐观生效：${Object.keys(p).join(', ')}`);
      for (const [k, v] of Object.entries(p)) {
        await repo.saveSetting(k as keyof AppSettings, v as never);
      }
      await load();
    },
    saveCourse: async (c) => { await repo.upsertCourse(c); await load(); },
    removeCourse: async (id) => { await repo.deleteCourse(id); await load(); },
    saveExam: async (e) => { await repo.upsertExam(e); await load(); },
    removeExam: async (id) => { await repo.deleteExam(id); await load(); },
    saveHomework: async (h) => { await repo.upsertHomework(h); await load(); },
    removeHomework: async (id) => { await repo.deleteHomework(id); await load(); },
    savePeriods: async (slots) => { await repo.replacePeriods(slots); await load(); },
    saveCalendarEvent: async (e) => { await repo.upsertCalendarEvent(e); await load(); },
    removeCalendarEvent: async (id) => { await repo.deleteCalendarEvent(id); await load(); },
    saveSemester: async (s) => { await repo.saveSemester(s); await load(); },
    switchSemester: async (id) => { await repo.setCurrentSemester(id); await load(); },
    deleteSemester: async (id) => { await repo.deleteSemester(id); await load(); },
    seedSample: async () => {
      const today = new Date();
      const monday = startOfWeekMonday(today);
      const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
      const sid = await repo.saveSemester({ name: '示例学期', startDate: key, totalWeeks: 18, isCurrent: 1 });
      const sample: Array<Omit<Course, 'id'>> = [
        { semesterId: sid, name: '高等数学（上）', teacher: '王教授', room: 'A302', credit: 4, courseType: '必修', examType: '考试', weekday: 1, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16, weekParity: 'all', weeks: [], color: '#2f7d63', note: '' },
        { semesterId: sid, name: '大学英语', teacher: '李老师', room: 'B105', credit: 2, courseType: '必修', examType: '考试', weekday: 1, startPeriod: 3, endPeriod: 4, startWeek: 1, endWeek: 16, weekParity: 'odd', weeks: [], color: '#4a7fb5', note: '单周' },
        { semesterId: sid, name: '数据结构', teacher: '张副教授', room: 'C201', credit: 3.5, courseType: '必修', examType: '考试', weekday: 2, startPeriod: 1, endPeriod: 2, startWeek: 1, endWeek: 16, weekParity: 'all', weeks: [], color: '#b5651d', note: '' },
        { semesterId: sid, name: '线性代数', teacher: '陈老师', room: 'A105', credit: 3, courseType: '限选', examType: '考查', weekday: 3, startPeriod: 5, endPeriod: 6, startWeek: 2, endWeek: 17, weekParity: 'even', weeks: [], color: '#7b5ea7', note: '双周' },
        { semesterId: sid, name: '体育（篮球）', teacher: '赵教练', room: '体育馆', credit: 1, courseType: '必修', examType: '考查', weekday: 4, startPeriod: 7, endPeriod: 8, startWeek: 1, endWeek: 16, weekParity: 'all', weeks: [], color: '#c8452f', note: '' },
        { semesterId: sid, name: '大学物理实验', teacher: '孙老师', room: 'D403', credit: 1, courseType: '实验', examType: '考察', weekday: 5, startPeriod: 3, endPeriod: 4, startWeek: 1, endWeek: 12, weekParity: 'all', weeks: [], color: '#2f8d8a', note: '' },
      ];
      for (const c of sample) await repo.upsertCourse(c);
      const now = Date.now();
      await repo.upsertExam({ semesterId: sid, subject: '高等数学（上）期中', examKind: '期中', datetime: new Date(now + 3 * 86400000).toISOString(), room: '一教 301', seat: '12 排 5 号', remindOn: 1 });
      await repo.upsertExam({ semesterId: sid, subject: '大学英语期末', examKind: '期末', datetime: new Date(now + 40 * 86400000).toISOString(), room: '二教 105', seat: '', remindOn: 1 });
      await repo.upsertHomework({ semesterId: sid, title: '高数习题集 P45-48', courseId: null, courseName: '高等数学（上）', dueAt: new Date(now + 2 * 86400000).toISOString(), done: 0, note: '' });
      await repo.upsertHomework({ semesterId: sid, title: '数据结构第 3 章编程题', courseId: null, courseName: '数据结构', dueAt: new Date(now - 86400000).toISOString(), done: 0, note: '已逾期示例' });
      await load();
    },
  }), [state, load, patch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  return useContext(Ctx);
}
