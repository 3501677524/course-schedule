/** 我的：设置直接平铺（外观 / 课表与作息 / 学习辅助 / 提醒 / 数据） */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, PageHeader } from '@/components/Screen';
import { FullSheet } from '@/components/FullSheet';
import { Badge, Button, Card, Chip, EmptyState, Loading, Row, SectionTitle, Toggle } from '@/components/ui';
import { DateField, Field, NumberField, Picker, TextField, TimeField } from '@/components/Field';
import { ExamPanel } from '@/components/ExamPanel';
import { HomeworkPanel } from '@/components/HomeworkPanel';
import { FadeInUp, useReplayId } from '@/components/motion';
import { useApp } from '@/hooks/useAppData';
import { useAuth } from '@/hooks/useAuth';
import { CloudClassPanel } from '@/components/CloudClassPanel';
import { AccountPanel } from '@/components/AccountPanel';
import { AgreementText } from '@/components/AgreementText';
import { UpdatePanel } from '@/components/UpdatePanel';
import { BackgroundSheet } from '@/components/BackgroundSheet';
import { CURRENT_VERSION } from '@/services/updateCheck';
import { CITY_PRESETS, findCity } from '@/services/weather';
import { LOCATION_CITY_KEY, useWeather } from '@/hooks/useWeather';
import { ACCENT_ORDER, PALETTES, useTheme } from '@/components/theme';
import { WEEKDAY_LABELS, formatDateCN, parityLabel } from '@/utils/datetime';
import { freeSlotsOfDay, semesterStats } from '@/services/schedule';
import { buildDaySchedule } from '@/services/schedule';
import { coursesToCsv, buildIcs, examsToIcs, homeworkToCsv } from '@/services/exporters';
import { exportBackup, importBackup, restoreDefaultTimetable } from '@/services/repo';
import { DEFAULT_COURSES, DEFAULT_PERIODS, DEFAULT_SEMESTER } from '@/services/defaultTimetable';
import { pickBackup, writeAndShare } from '@/services/files';
import { shareTemplate } from '@/services/templateAsset';
import { applyTimetablePlan, diagnoseTimetableFile, pickAndParseTimetable, type TimetablePlan } from '@/services/timetableImport';
import { parseTimetableText } from '@/services/timetableTextImport';
import * as Clipboard from 'expo-clipboard';
import { notificationPermissionHint, prepareNotifications } from '@/services/notifications';
import type { AccentKey, AppSettings, CalendarEvent, PeriodSlot, Semester } from '@/types';

type Sheet = null | 'course' | 'period' | 'semester' | 'calendar' | 'remind' | 'data' | 'stats' | 'exam' | 'homework' | 'weather' | 'about' | 'cloud' | 'update' | 'account' | 'background';

/** 各二级面板的标题（供全屏 Sheet 头部展示） */
const SHEET_TITLES: Record<Exclude<Sheet, null>, string> = {
  course: '课程管理',
  period: '学校作息',
  semester: '多学期管理',
  calendar: '校历与调课',
  remind: '上课与考试提醒',
  data: '数据备份与迁移',
  stats: '学期数据统计',
  exam: '考试安排',
  homework: '作业管理',
  weather: '天气与生活建议',
  cloud: '班级课表云同步',
  update: '检查更新',
  account: '我的账号',
  about: '关于软件',
  background: '背景与外观',
};

/** 背景模式的中文标签（一级菜单行项右侧展示当前值） */
const BG_MODE_LABELS: Record<AppSettings['bgMode'], string> = {
  theme: '跟随主题',
  solid: '纯色',
  gradient: '渐变',
  image: '图片',
};

export default function MineScreen() {
 const runId = useReplayId();
  const app = useApp();
  const auth = useAuth();
  const router = useRouter();
  const { colors, mode, bgDriven } = useTheme();
  // sheet：当前二级面板类型；sheetVisible：是否处于「显示态」。
  // 关闭时先置 visible=false 触发 FullSheet 下滑退场动画，动画结束 onClosed 再 setSheet(null) 卸载。
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // 一级菜单滚动位置记忆：sheet!==null 时一级菜单整块不渲染（Screen 被卸载），
  // 关闭面板后重新挂载的 ScrollView 会回到顶部。这里用 ref 记录偏移量（不触发重渲染），
  // 面板卸载后由 useEffect 在下一帧把 ScrollView 滚回原位置。
  const menuScrollRef = useRef<ScrollViewType | null>(null);
  const menuOffsetRef = useRef(0);
  const restoreOffsetRef = useRef<number | null>(null);
  // 一级菜单重新挂载时使用的初始偏移（首帧即定位，避免「先闪回顶部再被拉回」）
  const [initialOffset, setInitialOffset] = useState(0);

  useEffect(() => {
    if (sheet !== null) return;
    const target = restoreOffsetRef.current;
    if (target === null) return;
    restoreOffsetRef.current = null;
    // ⚠️ 闪屏根因：一级菜单在 sheet!==null 时整块卸载，关闭后重新挂载的 ScrollView 从 y=0 开始，
    // 等 setTimeout(0) 再 scrollTo 时首帧已经画在顶部 → 用户看到「极快回到顶部再被拉回」。
    // 修复：把偏移量作为 contentOffset 传给 ScrollView，首帧就落在原位置；再补一次 scrollTo 兜底
    // （部分平台 contentOffset 在内容高度未就绪时会被忽略）。
    setInitialOffset(target);
    const timer = setTimeout(() => {
      menuScrollRef.current?.scrollTo({ y: target, animated: false });
      console.info(`[mine] 二级面板已关闭，一级菜单滚动位置恢复到 y=${Math.round(target)}（首帧 contentOffset + 兜底 scrollTo）`);
    }, 0);
    return () => clearTimeout(timer);
  }, [sheet]);

  // ⚠️ 切 Tab 恢复一级菜单的根因：react-native-screens 下 mine screen 切走时不卸载（keep-alive），
  // sheet 状态会残留 → 切回「我的」仍停在二级面板。这里在屏幕失去焦点时强制收起面板并复位到一级菜单。
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (sheet !== null || sheetVisible) {
          console.info('[mine] 离开「我的」Tab，自动收起二级面板并复位到一级菜单');
          setSheetVisible(false);
          setSheet(null);
        }
      };
    }, [sheet, sheetVisible]),
  );

  if (app.loading) return <Screen><Loading text="正在读取本地数据…" /></Screen>;

  /** 请求关闭：只把 visible 置 false，让 FullSheet 播退场动画；真正卸载交给 onClosed */
  const close = () => {
    console.info(`[sheet] 请求关闭「${sheet === null ? '' : SHEET_TITLES[sheet]}」，播放退场动画`);
    setSheetVisible(false);
  };
  /** 退场动画播完：此时才卸载面板（一级菜单一直在背后挂载，无需重新定位） */
  const onSheetClosed = () => {
    console.info('[mine] 二级面板退场动画结束，卸载面板；一级菜单全程常驻，滚动位置无跳变');
    setSheet(null);
  };
  /** 立即关闭：跳转次级页等场景，直接卸载面板（不走退场动画），避免动画期间面板残留 */
  const closeNow = () => {
    console.info(`[sheet] 立即关闭「${sheet === null ? '' : SHEET_TITLES[sheet]}」（跳转子页，跳过退场动画）`);
    setSheetVisible(false);
    setSheet(null);
  };
  /** 打开面板：设置内容 + 立即进入显示态（触发进场动画） */
  const openSheet = (next: Exclude<Sheet, null>) => {
    // 打开前把当前滚动偏移量存起来，关闭面板后据此恢复（一级菜单此时即将被卸载）
    restoreOffsetRef.current = menuOffsetRef.current;
    console.info(`[mine] 打开二级面板「${SHEET_TITLES[next]}」，记录一级菜单滚动位置 y=${Math.round(menuOffsetRef.current)}`);
    setSheet(next);
    setSheetVisible(true);
  };
  const s = app.settings;

  // 二级面板存在时（含退场动画期间）：整屏只渲染 FullSheet（flex:1 + 内部独立 ScrollView），
  // 一级菜单不渲染——避免面板嵌在页面 ScrollView 里高度塌陷、无法滚动。
  // ⚠️ 深色模式闪白修复：这里必须保留一层与主题同色的不透明底衬 View。若直接裸返回
  // FullSheet，进场动画期间面板背后就是空的 mine screen 原生 Surface（Android 缺省白色），
  // 会透出白底；底衬铺 colors.bg 后无论动画播到哪一帧，背后都是深色。
  // ⚠️ 退场闪屏修复：退场动画期间（sheetVisible=false 但 sheet 仍非 null）一级菜单必须已经
  // 在面板背后挂载好，否则动画播完 onClosed 才挂载 → 用户先看到一帧空白/顶部，再被拉回原位。
  // 故这里把一级菜单作为底衬渲染在 FullSheet 之下（FullSheet 自带不透明全屏底衬，会完全遮住它），
  // 面板滑出时露出的就是已经定位在原滚动位置的一级菜单，视觉上自然衔接。
  if (sheet !== null) {
    console.info(`[mine] 渲染二级面板「${SHEET_TITLES[sheet]}」，一级菜单作为底衬常驻挂载（退场时直接露出，无闪屏）`);
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {renderMenu()}
        <FullSheet title={SHEET_TITLES[sheet]} visible={sheetVisible} onClosed={onSheetClosed} onRequestClose={close}>
          <SheetHost sheet={sheet} onClose={close} closeNow={closeNow} />
        </FullSheet>
      </View>
    );
  }

  return renderMenu();

  /** 一级菜单：面板打开期间也作为底衬常驻挂载（滚动位置不丢、退场时无需重新定位） */
  function renderMenu() {
    return (
      <Screen
        scrollRef={menuScrollRef}
        initialOffsetY={initialOffset}
        onScroll={(y) => {
          menuOffsetRef.current = y;
        }}
      >
      <FadeInUp runId={runId}>
        <PageHeader
          title="我的"
          subtitle={app.semester ? `${app.semester.name} · ${app.weekLabel}` : '尚未设置学期'}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={auth.session ? `当前账号 ${auth.displayName}` : '未登录，点击登录'}
              onPress={() => openSheet('account')}
              style={({ pressed }) => [
                styles.userChip,
                { backgroundColor: colors.cardSoft, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text numberOfLines={1} style={{ color: auth.session ? colors.text : colors.textMuted, fontSize: 12.5, fontWeight: '700', maxWidth: 120 }}>
                {auth.session ? auth.displayName || auth.account : '未登录'}
              </Text>
            </Pressable>
          }
        />
      </FadeInUp>

      {/* 外观：主题色 + 深浅模式，直接内联操作 */}
      <FadeInUp runId={runId} delayMs={60}>
      <SectionTitle title="外观" />
      <Card style={{ gap: 14 }}>
        <View>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: '700', marginBottom: 10 }}>主题色</Text>
          <View style={styles.accentRow}>
            {ACCENT_ORDER.map((key: AccentKey) => {
              const pal = PALETTES[key];
              const isActive = s.accentColor === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => void app.setSettings({ accentColor: key })}
                  style={styles.accentItem}
                >
                  <View
                    style={[
                      styles.accentDot,
                      { backgroundColor: pal[mode].primary },
                      isActive && styles.accentDotActive,
                      isActive && { borderColor: mode === 'dark' ? '#ffffff' : colors.text },
                    ]}
                  >
                    {isActive ? <Text style={{ color: pal[mode].onPrimary, fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
                  </View>
                  <Text style={{ color: isActive ? colors.text : colors.textMuted, fontSize: 11, marginTop: 5, fontWeight: isActive ? '700' : '500' }}>
                    {pal.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: '700', marginBottom: 10 }}>显示模式</Text>
          <View style={{ flexDirection: 'row' }}>
            <Chip label="跟随系统" active={s.themeMode === 'system'} onPress={() => void app.setSettings({ themeMode: 'system' })} />
            <Chip label="浅色" active={s.themeMode === 'light'} onPress={() => void app.setSettings({ themeMode: 'light' })} />
            <Chip label="深色" active={s.themeMode === 'dark'} onPress={() => void app.setSettings({ themeMode: 'dark' })} />
          </View>
          {bgDriven ? (
            <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 17, marginTop: 8 }}>
              已启用自定义背景，深浅模式由背景明暗自动决定（当前{mode === 'dark' ? '深色' : '浅色'}）。切回「跟随主题」背景即可手动切换。
            </Text>
          ) : null}
        </View>
        <Row
          label="背景与外观"
          hint="纯色 / 渐变 / 自定义图片"
          value={BG_MODE_LABELS[s.bgMode]}
          chevron
          onPress={() => openSheet('background')}
        />
        <Row label="触感反馈" hint="按钮、开关与打开二级菜单时的震动">
          <Toggle on={s.hapticsEnabled === 1} onChange={(v) => void app.setSettings({ hapticsEnabled: v ? 1 : 0 })} />
        </Row>
      </Card>
      </FadeInUp>

      <FadeInUp runId={runId} delayMs={120}>
      <SectionTitle title="课表与作息" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="课程管理" value={`${app.courses.length} 门`} chevron onPress={() => openSheet('course')} />
        <Row label="学校作息（节次时间）" value={`${app.periods.length} 节`} chevron onPress={() => openSheet('period')} />
        <Row label="学期管理" value={app.semesters.length ? `${app.semesters.length} 个学期` : '未设置'} chevron onPress={() => openSheet('semester')} />
        <Row label="校历与调课" value={`${app.events.length} 条安排`} chevron onPress={() => openSheet('calendar')} />
        <Row label="学期数据统计" value={`${app.courses.length} 门课`} chevron onPress={() => openSheet('stats')} />
      </Card>
      </FadeInUp>

      <FadeInUp runId={runId} delayMs={180}>
      <SectionTitle title="学习辅助" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="考试安排" value={`${app.exams.length} 场`} chevron onPress={() => openSheet('exam')} />
        <Row label="作业管理" value={`未完成 ${app.homework.filter((h) => h.done === 0).length} 项`} chevron onPress={() => openSheet('homework')} />
        <Row label="新增课程" value="手动排课" chevron onPress={() => router.push('/detail/course-edit')} />
      </Card>
      </FadeInUp>

      <FadeInUp runId={runId} delayMs={240}>
      <SectionTitle title="提醒" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="上课提醒" value={`前 ${s.classRemindMinutes} 分钟`} chevron onPress={() => openSheet('remind')} />
        <Row label="考试双重提醒" hint="考前 1 天 + 考前 1 小时">
          <Toggle on={s.examRemindOn === 1} onChange={(v) => void app.setSettings({ examRemindOn: v ? 1 : 0 })} />
        </Row>
      </Card>
      </FadeInUp>

      <FadeInUp runId={runId} delayMs={300}>
      <SectionTitle title="天气与生活建议" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="天气城市" hint="今日预览显示气温与带伞建议" value={app.settings.weatherCity ? undefined : '未设置'} chevron onPress={() => openSheet('weather')} />
      </Card>
      </FadeInUp>

      <FadeInUp runId={runId} delayMs={360}>
      <SectionTitle title="账号与云同步" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="账号登录 / 注册" hint="学号或账号 + 密码" value={auth.session ? auth.displayName || auth.account : '未登录'} chevron onPress={() => openSheet('account')} />
        <Row label="班级课表云同步" hint="管理员上传 · 同学拉取" chevron onPress={() => openSheet('cloud')} />
      </Card>
      </FadeInUp>

      <FadeInUp runId={runId} delayMs={420}>
      <SectionTitle title="数据" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="备份 / 恢复 / 导出" value="全本地" chevron onPress={() => openSheet('data')} />
      </Card>
      </FadeInUp>

      <FadeInUp runId={runId} delayMs={480}>
      <SectionTitle title="关于" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="关于软件" hint="开发人员与版本信息" chevron onPress={() => openSheet('about')} />
        <Row label="检查更新" hint="从开源仓库获取最新版本" chevron onPress={() => openSheet('update')} />
      </Card>
      </FadeInUp>

      <FadeInUp runId={runId} delayMs={540}>
      <View style={{ height: 16 }} />
      {!app.semester ? (
        <Button label="载入示例课表快速体验" variant="secondary" onPress={() => void app.seedSample().catch((e) => console.warn('[mine] 示例载入失败', e))} />
      ) : null}
      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 18, marginTop: 20, textAlign: 'center' }}>
        课表数据默认仅保存在本机 SQLite，断网完全可用；班级云同步为手动操作——管理员主动上传、同学主动拉取时才经过云端。{Platform.OS === 'web' ? '（网页预览用于查看界面，通知提醒需在手机安装包体验）' : notificationPermissionHint()}
      </Text>
      </FadeInUp>
      </Screen>
    );
  }
}

const styles = StyleSheet.create({
  courseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  colorBar: { width: 4, height: 30, borderRadius: 2 },
  periodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  exportGrid: { gap: 10 },
  tipBox: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: { flexBasis: '47%', flexGrow: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  barTrack: { height: 7, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  barFill: { height: 7, borderRadius: 4 },
  freeTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
  accentRow: { flexDirection: 'row', justifyContent: 'space-between' },
  accentItem: { alignItems: 'center', width: '15%' },
  accentDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accentDotActive: { transform: [{ scale: 1.08 }] },
  cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  userChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, marginBottom: 2 },
});

function SheetHost({ sheet, onClose, closeNow }: { sheet: Sheet; onClose: () => void; closeNow: () => void }) {
  switch (sheet) {
    case 'course': return <CourseListSheet onClose={onClose} closeNow={closeNow} />;
    case 'period': return <PeriodSheet onClose={onClose} />;
    case 'semester': return <SemesterSheet onClose={onClose} />;
    case 'calendar': return <CalendarSheet onClose={onClose} />;
    case 'remind': return <RemindSheet onClose={onClose} />;
    case 'data': return <DataSheet onClose={onClose} />;
    case 'stats': return <StatsSheet onClose={onClose} />;
    case 'exam': return <ExamPanel onClose={onClose} />;
    case 'homework': return <HomeworkPanel onClose={onClose} />;
    case 'weather': return <WeatherSheet onClose={onClose} />;
    case 'cloud': return <CloudClassPanel onClose={onClose} />;
    case 'account': return <AccountPanel onClose={onClose} />;
    case 'update': return <UpdatePanel onClose={onClose} />;
    case 'about': return <AboutSheet onClose={onClose} />;
    case 'background': return <BackgroundSheet onClose={onClose} />;
    default: return null;
  }
}

/** 面板说明文字：标题已由全屏 Sheet 头部展示，这里只保留副标题 */
function SheetTitle({ desc }: { desc?: string }) {
  const { colors } = useTheme();
  if (!desc) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 18 }}>{desc}</Text>
    </View>
  );
}

/* ------------------------------- 课程管理 ------------------------------- */
function CourseListSheet({ onClose, closeNow }: { onClose: () => void; closeNow: () => void }) {
  const app = useApp();
  const router = useRouter();
  const { colors } = useTheme();
  const grouped = useMemo(() => {
    const g: Record<number, typeof app.courses> = {};
    for (const c of app.courses) { (g[c.weekday] ??= []).push(c); }
    return g;
  }, [app.courses]);

  return (
    <View>
      <SheetTitle desc="手动增删改单节课程，支持周次范围、单双周与对应节次" />
      <Button label="＋ 新增课程" onPress={() => { closeNow(); router.push('/detail/course-edit'); }} style={{ marginBottom: 14 }} />
      {app.courses.length === 0 ? (
        <EmptyState icon="📚" title="还没有课程" desc="点击右上角新增，或先载入示例课表" />
      ) : (
        WEEKDAY_LABELS.map((label, i) => {
          const list = grouped[i + 1];
          if (!list || list.length === 0) return null;
          return (
            <View key={label} style={{ marginBottom: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
              {list.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => { closeNow(); router.push(`/detail/course/${c.id}`); }}>
                  <View style={[styles.courseRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.colorBar, { backgroundColor: c.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600' }}>{c.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                        {c.startPeriod}-{c.endPeriod} 节 · {c.room || '待定'} · 第{c.startWeek}-{c.endWeek}周（{parityLabel(c.weekParity)}）
                      </Text>
                    </View>
                    <Pressable accessibilityRole="button" hitSlop={10} onPress={() => Alert.alert('删除课程', `确定删除《${c.name}》？`, [
                      { text: '取消', style: 'cancel' },
                      { text: '确认删除', onPress: () => void app.removeCourse(c.id).catch((e) => console.warn('[mine] 删除课程失败', e)) },
                    ])}>
                      <Text style={{ color: colors.danger, fontSize: 16, paddingHorizontal: 6 }}>✕</Text>
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })
      )}
      <Button label="返回" variant="ghost" onPress={onClose} />
    </View>
  );
}

/* --------------------------------- 作息 -------------------------------- */
function PeriodSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  const [draft, setDraft] = useState<Array<Omit<PeriodSlot, 'id'>>>(app.periods.map((p) => ({ index: p.index, startTime: p.startTime, endTime: p.endTime, isBreak: p.isBreak })));

  function update(i: number, patch: Partial<PeriodSlot>) {
    setDraft((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function save() {
    try {
      await app.savePeriods(draft);
      Alert.alert('已保存', '作息更新后，所有课程的实际时间会自动同步');
      onClose();
    } catch (e) {
      console.warn('[mine] 作息保存失败', e);
      Alert.alert('提示', '保存失败，请重试');
    }
  }

  return (
    <View>
      <SheetTitle desc="自由修改每节课起止时间以适配不同院校；课程只存节次，时间随此表换算" />
      {draft.map((p, i) => (
        <View key={i} style={[styles.periodRow, { borderBottomColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, width: 42, fontWeight: '700' }}>{p.index}</Text>
          <TimeField value={p.startTime} onChange={(v) => update(i, { startTime: v })} />
          <Text style={{ color: colors.textMuted, marginHorizontal: 6 }}>–</Text>
          <TimeField value={p.endTime} onChange={(v) => update(i, { endTime: v })} />
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setDraft((prev) => prev.filter((_, idx) => idx !== i).map((x, j) => ({ ...x, index: j + 1 })))} style={{ marginLeft: 8 }}>
            <Text style={{ color: colors.danger }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button label="＋ 增加一节" variant="secondary" onPress={() => setDraft((prev) => [...prev, { index: prev.length + 1, startTime: '19:00', endTime: '19:45', isBreak: 0 }])} style={{ flex: 1 }} />
        <Button label="保存作息" onPress={() => void save()} style={{ flex: 1 }} />
      </View>
      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 8 }} />
    </View>
  );
}

/* -------------------------------- 学期 --------------------------------- */
function SemesterSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [weeks, setWeeks] = useState(18);
  const [editing, setEditing] = useState<Semester | null>(null);

  async function save() {
    if (!name.trim() || !startDate) { Alert.alert('提示', '请填写学期名称与开学日期'); return; }
    try {
      await app.saveSemester({ id: editing?.id, name: name.trim(), startDate, totalWeeks: weeks });
      setEditing(null); setName(''); setStartDate('');
    } catch (e) {
      console.warn('[mine] 学期保存失败', e);
      Alert.alert('提示', '保存失败，请重试');
    }
  }

  return (
    <View>
      <SheetTitle desc="本地保存多个学期课表，随时切换回看；开学日期用于自动识别当前教学周" />
      {app.semesters.map((s) => (
        <View key={s.id} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
          <Pressable accessibilityRole="button" onPress={() => void app.switchSemester(s.id).catch((e) => console.warn(e))} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{s.name}</Text>
              {s.isCurrent === 1 ? <Badge label="当前" bg={colors.primarySoft} fg={colors.primary} /> : null}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{formatDateCN(s.startDate)} 起 · {s.totalWeeks} 周</Text>
          </Pressable>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { setEditing(s); setName(s.name); setStartDate(s.startDate); setWeeks(s.totalWeeks); }} style={{ padding: 6 }}>
            <Text style={{ color: colors.textMuted }}>✎</Text>
          </Pressable>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => Alert.alert('删除学期', `将同时删除《${s.name}》下的课程、考试与作业`, [
            { text: '取消', style: 'cancel' },
            { text: '确认删除', onPress: () => void app.deleteSemester(s.id).catch((e) => console.warn(e)) },
          ])} style={{ padding: 6 }}>
            <Text style={{ color: colors.danger }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={{ marginTop: 14 }}>
        <Field label="学期名称"><TextField value={name} onChangeText={setName} placeholder="如：2026 秋季学期" /></Field>
        <Field label="开学日期（第 1 周周一）"><DateField value={startDate} onChange={setStartDate} /></Field>
        <Field label="总周数"><NumberField value={weeks} onChange={setWeeks} /></Field>
        <Button label={editing ? '更新学期' : '添加学期'} onPress={() => void save()} />
        {editing ? <Button label="取消编辑" variant="ghost" onPress={() => { setEditing(null); setName(''); setStartDate(''); }} style={{ marginTop: 6 }} /> : null}
      </View>
      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
    </View>
  );
}

/* ------------------------------- 校历调课 ------------------------------- */
function CalendarSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  const [kind, setKind] = useState<'holiday' | 'weekOff' | 'swap'>('holiday');
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [swapWeekday, setSwapWeekday] = useState('1');

  async function add() {
    if (!app.semester) { Alert.alert('提示', '请先创建学期'); return; }
    if (!date) { Alert.alert('提示', '请选择日期'); return; }
    try {
      await app.saveCalendarEvent({
        semesterId: app.semester.id,
        date,
        kind,
        swapWeekday: kind === 'swap' ? Number(swapWeekday) : null,
        title: title.trim() || (kind === 'holiday' ? '节假日停课' : kind === 'weekOff' ? '停课周' : '调课'),
      });
      setDate(''); setTitle('');
    } catch (e) {
      console.warn('[mine] 校历保存失败', e);
      Alert.alert('提示', '保存失败，请重试');
    }
  }

  return (
    <View>
      <SheetTitle desc="自定义节假日、停课周与调课安排，对应日期的课表显示会自动更新" />
      <Picker
        options={[{ label: '整日停课（节假日）', value: 'holiday' }, { label: '停课周', value: 'weekOff' }, { label: '调课（按其他星期上）', value: 'swap' }]}
        value={kind}
        onChange={(v) => setKind(v as typeof kind)}
      />
      <View style={{ marginTop: 8 }}>
        <Field label="日期"><DateField value={date} onChange={setDate} /></Field>
        {kind === 'swap' ? (
          <Field label="改为按哪个星期上课">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {WEEKDAY_LABELS.map((l, i) => (
                <Chip key={l} label={l} active={Number(swapWeekday) === i + 1} onPress={() => setSwapWeekday(String(i + 1))} />
              ))}
            </View>
          </Field>
        ) : null}
        <Field label="备注名称"><TextField value={title} onChangeText={setTitle} placeholder="如：国庆假期 / 运动会调休" /></Field>
        <Button label="添加安排" onPress={() => void add()} />
      </View>
      {app.events.length > 0 ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13, marginBottom: 6 }}>已记录 {app.events.length} 条</Text>
          {app.events.map((e: CalendarEvent) => (
            <View key={e.id} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{e.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {e.date} · {e.kind === 'holiday' ? '整日停课' : e.kind === 'weekOff' ? '停课周' : `按${WEEKDAY_LABELS[(e.swapWeekday ?? 1) - 1]}上课`}
                </Text>
              </View>
              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => void app.removeCalendarEvent(e.id).catch((x) => console.warn(x))}>
                <Text style={{ color: colors.danger, paddingHorizontal: 6 }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 12 }} />
    </View>
  );
}

/* -------------------------------- 提醒设置 ------------------------------- */
function RemindSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  return (
    <View>
      <SheetTitle desc="上课前弹出桌面通知显示课程名与教室；考试前 1 天与考前 1 小时双重提醒" />
      <Field label="上课前提醒时间">
        <Picker
          options={[{ label: '5 分钟', value: '5' }, { label: '10 分钟', value: '10' }, { label: '15 分钟', value: '15' }, { label: '20 分钟', value: '20' }]}
          value={String(app.settings.classRemindMinutes)}
          onChange={(v) => void app.setSettings({ classRemindMinutes: Number(v) })}
        />
      </Field>
      <Row label="考试双重提醒"><Toggle on={app.settings.examRemindOn === 1} onChange={(v) => void app.setSettings({ examRemindOn: v ? 1 : 0 })} /></Row>
      <Button label="检查并开启通知权限" variant="secondary" onPress={async () => {
        const ok = await prepareNotifications();
        Alert.alert(ok ? '通知已就绪' : '通知未授权', ok ? '预约提醒将在设定时间送达设备。' : '请在系统设置中允许本应用发送通知，否则提醒只能在 App 内显示。');
      }} style={{ marginTop: 12 }} />
      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 18, marginTop: 10 }}>{notificationPermissionHint()}</Text>
      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
    </View>
  );
}

/* ------------------------------ 备份与导出 ------------------------------ */
function DataSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  async function doExport(kindOf: 'json' | 'csv' | 'ics') {
    if (!app.semester) { Alert.alert('提示', '请先创建学期'); return; }
    setBusy(true);
    try {
      if (kindOf === 'json') {
        const payload = await exportBackup();
        const r = await writeAndShare(`课表备份_${app.semester.name}.json`, JSON.stringify(payload, null, 2), 'application/json');
        Alert.alert(r.ok ? '导出成功' : '导出失败', r.message);
      } else if (kindOf === 'csv') {
        const csv = coursesToCsv(app.courses, app.periods) + '\r\n\r\n' + homeworkToCsv(app.homework);
        const r = await writeAndShare(`课表_${app.semester.name}.csv`, csv, 'text/csv');
        Alert.alert(r.ok ? '导出成功' : '导出失败', `${r.message}\nCSV 可直接用 Excel / WPS 打开`);
      } else {
        const firstMonday = new Date(`${app.semester.startDate}T00:00:00`);
        const weeks = Array.from({ length: app.semester.totalWeeks }, (_, i) => i + 1);
        const ics = buildIcs(app.courses, app.periods, weeks, firstMonday) + '\r\n' + examsToIcs(app.exams).replace(/^BEGIN:VCALENDAR[\s\S]*?CALSCALE:GREGORIAN\r\n/, '').replace(/END:VCALENDAR\r?$/, '');
        const r = await writeAndShare(`课表_${app.semester.name}.ics`, ics, 'text/calendar');
        Alert.alert(r.ok ? '导出成功' : '导出失败', `${r.message}\n导入系统日历后可在日历中看到课程与考试`);
      }
    } catch (e) {
      console.warn('[mine] 导出失败', e);
      Alert.alert('提示', '导出失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    try {
      const payload = await pickBackup();
      if (!payload) { Alert.alert('已取消', '未选择备份文件，或文件格式不正确'); return; }
      Alert.alert('确认恢复', '导入会覆盖当前全部本地数据（课程、考试、作业、作息、学期）。确定继续吗？', [
        { text: '取消', style: 'cancel' },
        {
          text: '导入',
          onPress: () => {
            void importBackup(payload)
              .then(() => app.refresh())
              .then(() => Alert.alert('恢复成功', '数据已从备份文件恢复'))
              .catch((e) => { console.warn('[mine] 导入失败', e); Alert.alert('提示', '导入失败：备份文件校验未通过，现有数据未受影响'); });
          },
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  /** 导入「按周课表」xlsx：选文件 → 解析 → 预览确认 → 新建学期落库 */
  async function doImportTimetable() {
    setBusy(true);
    try {
      const picked = await pickAndParseTimetable();
      if (picked.status === 'canceled') return;
      if (picked.status === 'error') {
        console.warn(`[mine] 周课表导入失败：${picked.message}`);
        Alert.alert('导入失败', `${picked.message}\n\n请确认文件是「按周课表」格式的 Excel：每周一块「第 N 周」标题行 + 「节次 / 时间」两列 + 周一至周日七列，格子内容为「课程名（换行）教室 · 教师」。`);
        return;
      }
      confirmImportPlan(picked.plan);
    } finally {
      setBusy(false);
    }
  }

  /** 从剪贴板导入：读取复制的表格文本 → 解析 → 预览确认 */
  async function doImportFromClipboard() {
    setBusy(true);
    try {
      const text = await Clipboard.getStringAsync();
      const parsed = parseTimetableText(text);
      if (parsed.status === 'error') {
        console.warn(`[mine] 剪贴板课表导入失败：${parsed.message}`);
        Alert.alert('导入失败', parsed.message);
        return;
      }
      confirmImportPlan(parsed.plan);
    } catch (e) {
      console.warn('[mine] 读取剪贴板失败', e);
      Alert.alert('提示', '读取剪贴板失败，请重试或改用「导入课表（Excel）」');
    } finally {
      setBusy(false);
    }
  }

  /** 解析结果确认弹窗：展示学期/作息/课程统计与警告，确认后落库 */
  function confirmImportPlan(plan: TimetablePlan) {
    const detail =
      `学期：${plan.semesterName}\n` +
      `开学：${plan.startDate}（第 1 周周一），共 ${plan.totalWeeks} 周\n` +
      `作息：${plan.periods.length} 节课\n` +
      `课程：${plan.courses.length} 条\n\n` +
      (plan.warnings.length > 0 ? `注意：\n${plan.warnings.slice(0, 5).join('\n')}${plan.warnings.length > 5 ? `\n…等 ${plan.warnings.length} 条` : ''}\n\n` : '') +
      '将新建该学期并设为当前，同时覆盖作息表。原有学期数据保留，可在学期管理里切换或删除。确定导入吗？';
    Alert.alert('确认导入课表', detail, [
      { text: '取消', style: 'cancel' },
      {
        text: '导入',
        onPress: () => {
          console.info(`[mine] 开始导入周课表「${plan.fileName}」`);
          void applyTimetablePlan(plan)
            .then(() => app.refresh())
            .then(() => Alert.alert('导入成功', `已导入《${plan.semesterName}》：${plan.courses.length} 条课程安排`))
            .catch((e) => { console.warn('[mine] 周课表导入落库失败', e); Alert.alert('提示', '导入失败，现有数据未受影响，请重试'); });
        },
      },
    ]);
  }

  /** 强制把内置默认课表（2603025 班）覆盖写入当前数据 */
  function doRestoreDefault() {
    const detail = `学期：${DEFAULT_SEMESTER.name}\n开学：${formatDateCN(DEFAULT_SEMESTER.startDate)}（共 ${DEFAULT_SEMESTER.totalWeeks} 周）\n作息：${DEFAULT_PERIODS.length} 节\n课程：${DEFAULT_COURSES.length} 条\n\n注意：该学期的原有课程与作息将被覆盖，其它学期的数据不受影响。`;
    Alert.alert('设置为默认课表', detail, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认设置',
        onPress: () => {
          console.info('[mine] 用户确认「设置为默认课表」，开始覆盖写入');
          setBusy(true);
          void restoreDefaultTimetable()
            .then(() => app.refresh())
            .then(() => Alert.alert('已设置为默认课表', `${DEFAULT_SEMESTER.name}\n共 ${DEFAULT_COURSES.length} 条课程安排`))
            .catch((e) => { console.warn('[mine] 恢复默认课表失败', e); Alert.alert('提示', '设置失败，现有数据未受影响，请重试'); })
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  /** 诊断：把解析过程的中间结果直接展示出来，定位「导入失败」卡在哪一步 */
  async function doDiagnoseTimetable() {
    setBusy(true);
    try {
      const diag = await diagnoseTimetableFile();
      if (!diag) return;
      const lines = [
        `文件：${diag.fileName}`,
        `工作表：${diag.sheetName || '（未读到）'}`,
        `总行数：${diag.rowCount}　合并区域：${diag.mergeCount}`,
        `「第 N 周」块：${diag.weekBlocks} 个`,
        `节次行：${diag.periodRows} 行`,
        `识别作息：${diag.periods} 节`,
        `课程格子：${diag.courseCells} 个`,
        `解析课程：${diag.courses} 条`,
      ];
      if (diag.error) lines.push('', `失败原因：${diag.error}`);
      if (diag.warnings.length > 0) lines.push('', `警告 ${diag.warnings.length} 条：`, ...diag.warnings.slice(0, 3));
      console.info(`[mine] 课表诊断结果：${JSON.stringify({ ...diag, warnings: diag.warnings.length })}`);
      Alert.alert(diag.error ? '诊断：解析失败' : '诊断：解析通过', lines.join('\n'));
    } catch (e) {
      console.warn('[mine] 课表诊断异常', e);
      Alert.alert('诊断失败', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** 下载内置 Excel 课表模板（随 App 打包，不经过云端） */
  function doDownloadTemplate() {
    setBusy(true);
    void shareTemplate()
      .then((r) => Alert.alert(r.ok ? '模板已就绪' : '导出失败', `${r.message}\n按模板填好课程后用「导入课表（Excel）」导入`))
      .finally(() => setBusy(false));
  }

  return (
    <View>
      <SheetTitle desc="一键备份 / 恢复课表数据，支持导出 Excel(CSV) 与 ICS 日历文件" />
      {/* Excel 模板下载提示：引导用户用 AI 按模板格式写课表后再导入 */}
      <View style={[styles.tipBox, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}>
        <Text style={{ color: colors.primary, fontSize: 12.5, lineHeight: 19, fontWeight: '600' }}>
          提示：下载模板后，可以把模板交给 AI，让 AI 按模板格式把课表写进去，再用下方「导入课表（Excel）」一键导入。
        </Text>
      </View>
      <View style={styles.exportGrid}>
        <Button label="Excel 模板下载" variant="secondary" disabled={busy} onPress={() => doDownloadTemplate()} />
        <Button label="导入课表（Excel）" variant="secondary" disabled={busy} onPress={() => void doImportTimetable()} />
        <Button label="从剪贴板导入" variant="secondary" disabled={busy} onPress={() => void doImportFromClipboard()} />
        <Button label="导入诊断" variant="secondary" disabled={busy} onPress={() => void doDiagnoseTimetable()} />
        <Button label="设置为默认课表" variant="secondary" disabled={busy} onPress={() => doRestoreDefault()} />
        <Button label="导出 JSON 备份" variant="secondary" disabled={busy} onPress={() => void doExport('json')} />
        <Button label="导出 Excel(CSV)" variant="secondary" disabled={busy} onPress={() => void doExport('csv')} />
        <Button label="导出 ICS 日历" variant="secondary" disabled={busy} onPress={() => void doExport('ics')} />
        <Button label="从备份文件恢复" disabled={busy} onPress={() => void doImport()} />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 18, marginTop: 12 }}>
        导入课表支持 .xlsx / .xls，选完自动解析并弹确认框；时间列兼容 08:45-09:15、8:45~9:15、08:45－09:15 等写法。
        「从剪贴板导入」适用于别人发来的课表：先在聊天里复制表格内容，再点这里。
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 18, marginTop: 8 }}>
        {Platform.OS === 'web' ? '网页预览下导出为浏览器下载；手机端通过系统分享面板保存到文件或发送。' : '导出文件包含全部本地数据，请妥善保管。'}
      </Text>
      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
    </View>
  );
}

/* ------------------------------ 天气城市设置 ------------------------------ */
function WeatherSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  const weather = useWeather();
  const [usingLocation, setUsingLocation] = useState(false);

  async function pickByLocation() {
    setUsingLocation(true);
    try {
      // 定位模式：按真实坐标取天气并逆地理到区，比吸附最近城市精确
      await weather.refresh(LOCATION_CITY_KEY);
      if (app.settings.weatherCity !== LOCATION_CITY_KEY) {
        Alert.alert('提示', '未能切换为定位模式，请检查定位权限后重试');
        return;
      }
      console.info(`[mine] 已切换为定位模式（区级），当前展示：${weather.snapshot?.city ?? '等待获取'}`);
      Alert.alert('已按定位获取', `当前位置：${weather.snapshot?.city ?? '获取中…'}\n天气按你所在经纬度实时计算，可精确到区。`);
    } catch (e) {
      console.warn('[mine] 定位取天气失败', e);
      Alert.alert('提示', '定位失败，请手动选择城市');
    } finally {
      setUsingLocation(false);
    }
  }

  return (
    <View>
      <SheetTitle desc="支持「按定位精确到区」或手动选择城市；「今日预览」会显示气温、天气与带伞/穿衣建议。数据来自 Open-Meteo，需联网获取，30 分钟内自动复用缓存" />
      <Chip
        label={app.settings.weatherCity === LOCATION_CITY_KEY ? '📍 我的位置（精确到区）· 使用中' : '📍 用我的位置（精确到区）'}
        active={app.settings.weatherCity === LOCATION_CITY_KEY}
        onPress={() => void pickByLocation()}
      />
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10, marginBottom: 4 }}>或手动选择城市：</Text>
      <View style={styles.cityGrid}>
        {CITY_PRESETS.map((c) => (
          <Chip
            key={c.key}
            label={c.name}
            active={app.settings.weatherCity === c.key}
            onPress={() => void weather.refresh(c.key).catch((e) => console.warn('[mine] 切换天气城市失败', e))}
          />
        ))}
      </View>
      {weather.snapshot ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 19, marginTop: 12 }}>
          当前展示：{weather.snapshot.city} {weather.snapshot.temp}℃ · {weather.snapshot.text}
          {weather.advice?.umbrella ? ' · 今日建议带伞' : ' · 今日不用带伞'}
        </Text>
      ) : null}
      {weather.staleError ? (
        <Text style={{ color: colors.warning, fontSize: 12, marginTop: 6 }}>网络获取失败，展示的是上次缓存数据</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button label="用当前位置找城市" variant="secondary" disabled={usingLocation} onPress={() => void pickByLocation()} style={{ flex: 1 }} />
        <Button label="立即刷新" variant="secondary" disabled={weather.loading || !app.settings.weatherCity} onPress={() => void weather.refresh().catch((e) => console.warn('[mine] 天气刷新失败', e))} style={{ flex: 1 }} />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 11.5, lineHeight: 18, marginTop: 10 }}>
        {Platform.OS === 'web' ? '网页预览可以正常拉取天气；手机端首次使用需要允许网络访问。' : '定位仅在你点击按钮时请求一次权限，拒绝后可手动选择城市。'}
      </Text>
      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 10 }} />
    </View>
  );
}

/* -------------------------------- 关于软件 -------------------------------- */
/** 「关于软件」图标（用户上传的卡通形象，CDN 直链） */
const ABOUT_LOGO_URI =
  'https://conversation.cdn.meoo.host/conversations/372344987750408192/image/2026-10-24/1792858606738-IMG_20251003_133748.jpg?auth_key=b955690dc0b94be814bbf113972e65f15b2d60d24f4284617f8595949daa753b';

/** 开源仓库地址（「关于软件 → 获取源码」） */
const SOURCE_REPO_URL = 'https://github.com/3501677524/course-schedule';

/** 「遇到 bug 了？」反馈页配图（用户上传，CDN 直链） */
const BUG_REPORT_IMAGE_URI =
  'https://conversation.cdn.meoo.host/conversations/372344987750408192/image/2026-10-25/1792897510972-1792897369301.png?auth_key=11f6c2883387e99d6bb5365f4abd051988e9d66dd1940cd267564d468ef76a4e';

function AboutSheet({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const [showAgreement, setShowAgreement] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);

  /** 打开 GitHub 源码仓库（系统浏览器） */
  async function openSource() {
    console.info(`[about] 打开源码仓库：${SOURCE_REPO_URL}`);
    try {
      await Linking.openURL(SOURCE_REPO_URL);
    } catch (e) {
      console.warn('[about] 打开源码仓库失败', e);
      Alert.alert('打开失败', `无法打开浏览器，请手动访问：\n${SOURCE_REPO_URL}`);
    }
  }

  if (showAgreement) {
    return (
      <View>
        <SheetTitle desc="首次启动时已同意，可随时在此重新查看" />
        <AgreementText />
        <Button label="返回" variant="ghost" onPress={() => setShowAgreement(false)} style={{ marginTop: 18 }} />
      </View>
    );
  }

  if (showBugReport) {
    return (
      <View>
        <SheetTitle desc="遇到 bug 了？先看看这张图" />
        <Image
          source={{ uri: BUG_REPORT_IMAGE_URI }}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: colors.cardSoft }}
          resizeMode="contain"
          onError={(e) => console.warn('[about] 反馈配图加载失败:', (e.nativeEvent as { error?: string })?.error ?? 'unknown')}
        />
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 16, lineHeight: 23 }}>
          骗你的，根本没有这个接口
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 20, marginTop: 8 }}>
          本应用所有数据都保存在本机，没有上报通道，也没有 bug 收集服务。真遇到问题，欢迎到 GitHub 仓库提 issue，或者自己动手改——源码是公开的。
        </Text>
        <Button label="返回" variant="ghost" onPress={() => setShowBugReport(false)} style={{ marginTop: 18 }} />
      </View>
    );
  }

  return (
    <View>
      <SheetTitle desc="课程表 · 版本与开发信息" />
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Image
          source={{ uri: ABOUT_LOGO_URI }}
          style={{ width: 76, height: 76, borderRadius: 20, marginBottom: 12, backgroundColor: colors.cardSoft }}
          resizeMode="cover"
          onError={(e) => console.warn('[about] 图标加载失败:', (e.nativeEvent as { error?: string })?.error ?? 'unknown')}
        />
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>课程表</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>版本 {CURRENT_VERSION}</Text>
      </Card>

      <Card style={{ paddingVertical: 4, marginTop: 12 }}>
        <Row label="开发人员" value="任中轩" />
        <Row label="应用类型" value="课程表 / 上课提醒" />
        <Row label="支持平台" value="Android · iOS" />
        <Row label="数据存储" value="全本地 SQLite" />
      </Card>

      <Card style={{ paddingVertical: 4, marginTop: 12 }}>
        <Row label="获取源码" value="GitHub" chevron onPress={() => void openSource()} />
        <Row label="遇到 bug 了？" hint="点击反馈" chevron onPress={() => setShowBugReport(true)} />
        <Row label="用户须知与免责声明" chevron onPress={() => setShowAgreement(true)} />
      </Card>

      <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 20, marginTop: 16 }}>
        课程表是一款面向大学生的课程管理工具：支持手动排课与 Excel 课表导入、按节次自动换算上课时间、上课与考试提醒、考试与作业管理、校历调课、天气与生活建议等。所有数据仅保存在本机，断网完全可用，不上传任何服务器。
      </Text>

      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 18 }} />
    </View>
  );
}

/* -------------------------------- 统计 --------------------------------- */
function StatsSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const { colors } = useTheme();
  const stats = useMemo(() => semesterStats(app.courses, app.periods), [app.courses, app.periods]);
  const maxCredit = Math.max(1, ...stats.byType.map((t) => t.credit));

  const freeByDay = useMemo(() => {
    if (app.week == null) return [];
    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = new Date(app.monday.getTime());
      d.setDate(app.monday.getDate() + i);
      const dayCourses = buildDaySchedule({ courses: app.courses, periods: app.periods, events: app.events, week: app.week, date: d });
      const range = app.periods.length ? { from: 8 * 60, to: 20 * 60 } : { from: 0, to: 0 };
      return { weekday: i + 1, slots: freeSlotsOfDay(dayCourses, range.from, range.to) };
    });
  }, [app.courses, app.periods, app.events, app.week, app.monday]);

  return (
    <View>
      <SheetTitle desc="总课时、学分与必修/选修占比，以及本周每日空闲时段" />
      <View style={styles.statGrid}>
        <StatBox label="课程数" value={`${stats.courseCount}`} colors={colors} />
        <StatBox label="总学分" value={`${stats.totalCredit}`} colors={colors} />
        <StatBox label="本学期大课次数" value={`${stats.totalSessions}`} colors={colors} />
        <StatBox label="单日在校时长" value={`${Math.floor(stats.dailyMinutes / 60)}h${stats.dailyMinutes % 60}`} colors={colors} />
      </View>

      <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13, marginTop: 16, marginBottom: 8 }}>课程类型学分占比</Text>
      {stats.byType.map((t) => (
        <View key={t.type} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 12.5 }}>{t.type}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t.credit} 分</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.cardSoft }]}>
            <View style={[styles.barFill, { backgroundColor: colors.primary, width: `${(t.credit / maxCredit) * 100}%` }]} />
          </View>
        </View>
      ))}

      <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13, marginTop: 16, marginBottom: 8 }}>本周每日空闲时段（08:00-20:00）</Text>
      {freeByDay.map((d) => (
        <View key={d.weekday} style={{ marginBottom: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{WEEKDAY_LABELS[d.weekday - 1]}</Text>
          {d.slots.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>排满 / 无课表</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 3 }}>
              {d.slots.map((f, i) => (
                <View key={i} style={[styles.freeTag, { backgroundColor: colors.primarySoft }]}>
                  <Text style={{ color: colors.primary, fontSize: 11.5, fontVariant: ['tabular-nums'] }}>
                    {String(Math.floor(f.from / 60)).padStart(2, '0')}:{String(f.from % 60).padStart(2, '0')}–{String(Math.floor(f.to / 60)).padStart(2, '0')}:{String(f.to % 60).padStart(2, '0')}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ))}
      <Button label="返回" variant="ghost" onPress={onClose} style={{ marginTop: 14 }} />
    </View>
  );
}

function StatBox({ label, value, colors }: { label: string; value: string; colors: { cardSoft: string; text: string; textMuted: string } }) {
  return (
    <View style={[styles.statBox, { backgroundColor: colors.cardSoft }]}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 3 }}>{label}</Text>
    </View>
  );
}
