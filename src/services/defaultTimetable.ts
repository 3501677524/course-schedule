/**
 * 内置默认课表（2603025 班 · 由「2603025班学期周课表_v3.xlsx」离线解析生成）
 *
 * ⚠️ 数据唯一事实来源是 timetableImport.parseTimetableRows 的解析结果，
 * 不要手工增删改课程行——手抄曾把周一第 1 节错写成「数据库基础」（真实为
 * 「大学生心理健康教育」），且漏掉停课周导致第 5-7 周显示幽灵课。
 * 若课表更新，重新解析 xlsx 后整表替换本文件即可。
 */
import type { Course, PeriodSlot, Semester } from '@/types';

export const DEFAULT_SEMESTER: Omit<Semester, 'id'> = {
  name: '2026-2027学年第1学期（2603025班）',
  startDate: '2026-09-07',
  totalWeeks: 20,
  isCurrent: 1,
};

/** 作息：每天 10 节（含晚自习两段） */
export const DEFAULT_PERIODS: Array<Omit<PeriodSlot, 'id'>> = [
  { index: 1, startTime: '08:30', endTime: '09:15', isBreak: 0 },
  { index: 2, startTime: '09:25', endTime: '10:10', isBreak: 0 },
  { index: 3, startTime: '10:30', endTime: '11:15', isBreak: 0 },
  { index: 4, startTime: '11:25', endTime: '12:10', isBreak: 0 },
  { index: 5, startTime: '14:00', endTime: '14:45', isBreak: 0 },
  { index: 6, startTime: '14:55', endTime: '15:40', isBreak: 0 },
  { index: 7, startTime: '16:00', endTime: '16:45', isBreak: 0 },
  { index: 8, startTime: '16:55', endTime: '17:40', isBreak: 0 },
  { index: 9, startTime: '19:00', endTime: '19:45', isBreak: 0 },
  { index: 10, startTime: '19:45', endTime: '20:30', isBreak: 0 },
];

/** semesterId 由落库时统一补齐；weeks = 显式上课周（空档周不渲染课程） */
type C = Omit<Course, 'id' | 'semesterId'>;

const GAP = '第 3-4、8-19 周上课（中间周停课）';

export const DEFAULT_COURSES: C[] = [
  // 周一
  { name: '大学生心理健康教育', teacher: '罗黎', room: '格物楼315-1', credit: 0, courseType: '必修', examType: '考试', weekday: 1, startPeriod: 1, endPeriod: 2, startWeek: 13, endWeek: 17, weekParity: 'all', weeks: [13, 14, 15, 16, 17], color: '#2f7d63', note: '' },
  { name: '信息技术应用创新', teacher: '梅晶', room: '乐学楼407-1', credit: 0, courseType: '必修', examType: '考试', weekday: 1, startPeriod: 3, endPeriod: 4, startWeek: 3, endWeek: 19, weekParity: 'all', weeks: [3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#4a7fb5', note: GAP },
  { name: 'Python程序基础', teacher: '邱辉', room: '格物楼305-1', credit: 0, courseType: '必修', examType: '考试', weekday: 1, startPeriod: 5, endPeriod: 6, startWeek: 3, endWeek: 19, weekParity: 'all', weeks: [3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#b5651d', note: GAP },
  // 周二
  { name: '大学英语1', teacher: '严英', room: '致知楼305-1', credit: 0, courseType: '必修', examType: '考试', weekday: 2, startPeriod: 3, endPeriod: 4, startWeek: 3, endWeek: 19, weekParity: 'all', weeks: [3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#7b5ea7', note: GAP },
  { name: '体育1', teacher: '杨诗俊', room: '运动场5', credit: 0, courseType: '必修', examType: '考试', weekday: 2, startPeriod: 5, endPeriod: 6, startWeek: 3, endWeek: 19, weekParity: 'all', weeks: [3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#c8452f', note: GAP },
  { name: '思想道德与法治', teacher: '燕妮', room: '致知楼115-1', credit: 0, courseType: '必修', examType: '考试', weekday: 2, startPeriod: 7, endPeriod: 8, startWeek: 8, endWeek: 19, weekParity: 'all', weeks: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#2f8d8a', note: '' },
  // 周三（大学英语双周；军事理论按周换老师，逐周一条）
  { name: '大学英语1', teacher: '严英', room: '致知楼305-1', credit: 0, courseType: '必修', examType: '考试', weekday: 3, startPeriod: 3, endPeriod: 4, startWeek: 4, endWeek: 18, weekParity: 'even', weeks: [4, 8, 10, 12, 14, 16, 18], color: '#7b5ea7', note: '隔周上课（第 4-18 周双周）' },
  { name: '军事理论', teacher: '柏极星', room: '正心楼106-1', credit: 0, courseType: '必修', examType: '考试', weekday: 3, startPeriod: 5, endPeriod: 6, startWeek: 13, endWeek: 13, weekParity: 'all', weeks: [13], color: '#8a6d3b', note: '' },
  { name: '军事理论', teacher: '张卫国', room: '正心楼106-1', credit: 0, courseType: '必修', examType: '考试', weekday: 3, startPeriod: 5, endPeriod: 6, startWeek: 14, endWeek: 14, weekParity: 'all', weeks: [14], color: '#8a6d3b', note: '' },
  { name: '军事理论', teacher: '翟小龙', room: '正心楼106-1', credit: 0, courseType: '必修', examType: '考试', weekday: 3, startPeriod: 5, endPeriod: 6, startWeek: 15, endWeek: 15, weekParity: 'all', weeks: [15], color: '#8a6d3b', note: '' },
  { name: '军事理论', teacher: '陈宸', room: '正心楼106-1', credit: 0, courseType: '必修', examType: '考试', weekday: 3, startPeriod: 5, endPeriod: 6, startWeek: 16, endWeek: 16, weekParity: 'all', weeks: [16], color: '#8a6d3b', note: '' },
  { name: '军事理论', teacher: '邓成刚', room: '正心楼106-1', credit: 0, courseType: '必修', examType: '考试', weekday: 3, startPeriod: 5, endPeriod: 6, startWeek: 17, endWeek: 17, weekParity: 'all', weeks: [17], color: '#8a6d3b', note: '' },
  { name: '军事理论', teacher: '陈楠', room: '正心楼106-1', credit: 0, courseType: '必修', examType: '考试', weekday: 3, startPeriod: 5, endPeriod: 6, startWeek: 18, endWeek: 18, weekParity: 'all', weeks: [18], color: '#8a6d3b', note: '' },
  { name: '军事理论', teacher: '刘菲', room: '正心楼106-1', credit: 0, courseType: '必修', examType: '考试', weekday: 3, startPeriod: 5, endPeriod: 6, startWeek: 19, endWeek: 19, weekParity: 'all', weeks: [19], color: '#8a6d3b', note: '' },
  // 周四
  { name: '数据库基础', teacher: '胡梦迪', room: '格物楼410-1', credit: 0, courseType: '必修', examType: '考试', weekday: 4, startPeriod: 1, endPeriod: 2, startWeek: 3, endWeek: 19, weekParity: 'all', weeks: [3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#556b2f', note: GAP },
  { name: '美育', teacher: '钱旺', room: '格物楼113-1', credit: 0, courseType: '必修', examType: '考试', weekday: 4, startPeriod: 3, endPeriod: 4, startWeek: 3, endWeek: 19, weekParity: 'all', weeks: [3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#9457a0', note: GAP },
  { name: '思想道德与法治', teacher: '燕妮', room: '致知楼316-1', credit: 0, courseType: '必修', examType: '考试', weekday: 4, startPeriod: 9, endPeriod: 10, startWeek: 8, endWeek: 19, weekParity: 'all', weeks: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#2f8d8a', note: '' },
  // 周五
  { name: '大学生心理健康教育', teacher: '罗黎', room: '格物楼315-1', credit: 0, courseType: '必修', examType: '考试', weekday: 5, startPeriod: 1, endPeriod: 2, startWeek: 13, endWeek: 17, weekParity: 'all', weeks: [13, 14, 15, 16, 17], color: '#2f7d63', note: '' },
  { name: '大学实用语文1', teacher: '张嫣然', room: '正心楼303-1', credit: 0, courseType: '必修', examType: '考试', weekday: 5, startPeriod: 3, endPeriod: 4, startWeek: 3, endWeek: 19, weekParity: 'all', weeks: [3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#3b7ea1', note: GAP },
  { name: '人工智能基础及应用', teacher: '李惠敏', room: '格物楼507-1', credit: 0, courseType: '必修', examType: '考试', weekday: 5, startPeriod: 5, endPeriod: 6, startWeek: 3, endWeek: 19, weekParity: 'all', weeks: [3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19], color: '#2f7d63', note: GAP },
];
