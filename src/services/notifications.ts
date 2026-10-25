/** 本地通知：上课提醒 / 考试提醒（全部设备本地调度，无远程推送） */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AppSettings, Course, ExamItem, PeriodSlot } from '@/types';
import { toDateKey } from '@/utils/datetime';
import { buildDaySchedule } from './schedule';

const CHANNEL_REMIND = 'reminders';

let handlerInstalled = false;

export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function prepareNotifications(): Promise<boolean> {
  installNotificationHandler();
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_REMIND, {
        name: '课程与考试提醒',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }
    permission = await Notifications.requestPermissionsAsync();
    if (permission.granted) return true;
    permission = await Notifications.getPermissionsAsync();
    return (
      permission.granted ||
      permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    console.warn('[notifications] 通知权限初始化失败，提醒降级为 App 内提示', error);
    return false;
  }
}

export async function cancelAllScheduled(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.warn('[notifications] 取消历史预约失败', error);
  }
}

async function scheduleAt(triggerDate: Date, title: string, body: string, url: string): Promise<void> {
  if (triggerDate.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { url } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: CHANNEL_REMIND,
    },
  });
}

export interface RescheduleInput {
  settings: AppSettings;
  courses: Course[];
  periods: PeriodSlot[];
  exams: ExamItem[];
  events: Array<{ date: string; kind: string; swapWeekday: number | null }>;
  week: number | null;
  /** 当前学期 id，用于通知跳转 */
  semesterId: number;
}

/**
 * 重建全部预约通知：今日剩余课程提醒 + 考试双重提醒。
 * 受系统省电策略影响，不保证精确到秒；需保持 App 曾被打开过以创建预约。
 */
export async function rescheduleAll(input: RescheduleInput): Promise<boolean> {
  const granted = await prepareNotifications();
  if (!granted) return false;
  await cancelAllScheduled();

  const now = new Date();
  const events = input.events.map((e) => ({ ...e, semesterId: input.semesterId })) as never as Array<{
    id: number; semesterId: number; date: string; kind: 'holiday' | 'weekOff' | 'swap'; swapWeekday: number | null; title: string;
  }>;

  // 1) 今日剩余课程提醒
  const todayCourses = buildDaySchedule({
    courses: input.courses,
    periods: input.periods,
    events,
    week: input.week,
    date: now,
  });
  console.info(`[notifications] 开始重排提醒：今日 ${todayCourses.length} 节课，考试 ${input.exams.length} 场`);
  const lead = input.settings.classRemindMinutes;
  let classScheduled = 0;
  for (const c of todayCourses) {
    const remindMin = c.startMin - lead;
    const classDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    classDate.setMinutes(remindMin);
    if (classDate.getTime() > now.getTime()) {
      await scheduleAt(
        classDate,
        `${lead} 分钟后上课`,
        `${c.name} · ${c.room} · ${c.startTimeText}`,
        '/(tabs)',
      ).then(() => { classScheduled++; }).catch((e) => console.warn('[notifications] 上课提醒预约失败', e));
    }
  }

  // 2) 考试双重提醒：考前 1 天 08:00 + 考前 1 小时
  let examScheduled = 0;
  if (input.settings.examRemindOn === 1) {
    for (const exam of input.exams) {
      if (exam.remindOn !== 1) continue;
      const target = new Date(exam.datetime);
      if (Number.isNaN(target.getTime())) continue;
      const dayBefore = new Date(target.getTime() - 86400000);
      dayBefore.setHours(8, 0, 0, 0);
      await scheduleAt(
        dayBefore,
        '明天有考试',
        `${exam.subject} · ${target.getMonth() + 1}月${target.getDate()}日 ${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')} · ${exam.room}`,
        '/(tabs)/mine',
      ).then(() => { examScheduled++; }).catch((e) => console.warn('[notifications] 考前一天提醒预约失败', e));
      const hourBefore = new Date(target.getTime() - 3600000);
      await scheduleAt(
        hourBefore,
        '1 小时后开考',
        `${exam.subject} · 考场 ${exam.room}${exam.seat ? ` · 座位 ${exam.seat}` : ''}`,
        '/(tabs)/mine',
      ).catch((e) => console.warn('[notifications] 考前一小时提醒预约失败', e));
    }
  }

  console.info(`[notifications] 提醒重排完成：上课 ${classScheduled} 条、考试 ${examScheduled} 条`);
  return true;
}

export function notificationPermissionHint(): string {
  return Platform.OS === 'android'
    ? 'Android 省电策略与应用自启动限制可能延后提醒触发，建议在系统设置中把本应用加入白名单。'
    : 'iOS 的定时本地通知需要保持应用曾在前台运行过以创建预约。';
}

export { CHANNEL_REMIND, toDateKey };
