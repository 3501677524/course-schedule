/**
 * 云服务层：手机号+密码账号（basic_auth 虚拟邮箱方案）、班级加入/创建、
 * 本机 SQLite ↔ 云端 timetable_snapshots.payload 双向映射。
 * 所有读写走平台生成的 supabase Client；写操作必须 .select() 校验影响行数（防 RLS 静默失败）。
 */
import { supabase } from '../supabase/client';
import type { Session } from '@supabase/supabase-js';
import * as repo from './repo';
import type { CalendarEvent, Course, ExamItem, HomeworkItem, PeriodSlot, Semester } from '@/types';

/* ------------------------------ payload 结构 ----------------------------- */

/** 云端快照 payload：只含「共享课表」相关数据，个人设置/铃声/天气缓存不上云 */
export interface TimetablePayload {
  version: 1;
  exportedAt: string;
  semester: Pick<Semester, 'name' | 'startDate' | 'totalWeeks'>;
  periods: Array<Omit<PeriodSlot, 'id'>>;
  courses: Array<Omit<Course, 'id' | 'semesterId'>>;
  exams: Array<Omit<ExamItem, 'id' | 'semesterId'>>;
  homework: Array<Omit<HomeworkItem, 'id' | 'semesterId'>>;
  events: Array<Omit<CalendarEvent, 'id' | 'semesterId'>>;
}

export interface CloudSnapshotMeta {
  id: string;
  createdAt: string;
  semesterName: string;
  courseCount: number;
  uploaderName: string;
}

export interface ClassInfo {
  classId: string;
  code: string;
  name: string;
  isOwner: boolean;
}

/* --------------------------------- 账号 ---------------------------------- */

const PHONE_RE = /^1[3-9]\d{9}$/;

function normalizePhone(input: string): string {
  return input.replace(/[\s-]/g, '');
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => subscription.unsubscribe();
}

/** 注册：手机号作为登录标识，内部转 {phone}@meoo.local 虚拟邮箱（不展示给用户） */
export async function signUp(phone: string, password: string): Promise<void> {
  const p = normalizePhone(phone);
  if (!PHONE_RE.test(p)) throw new Error('请输入正确的 11 位手机号');
  if (password.length < 6) throw new Error('密码至少 6 位');
  console.info('[cloud-auth] 提交注册请求');
  const { data, error } = await supabase.auth.signUp({
    email: `${p}@meoo.local`,
    password,
    options: { data: { username: p } },
  });
  if (error) {
    console.warn('[cloud-auth] 注册失败', error.message);
    throw new Error(error.message.includes('already registered') || error.message.includes('already exists') ? '该手机号已注册，请直接登录' : `注册失败：${error.message}`);
  }
  if (!data.session) {
    // 理论上平台配置下会直接返回 session；没有则引导登录一次
    console.info('[cloud-auth] 注册成功但无会话，自动补登录');
    const login = await supabase.auth.signInWithPassword({ email: `${p}@meoo.local`, password });
    if (login.error) throw new Error(`注册成功，请再登录一次：${login.error.message}`);
  }
  console.info('[cloud-auth] 注册完成，会话就绪');
}

export async function signIn(phone: string, password: string): Promise<void> {
  const p = normalizePhone(phone);
  if (!PHONE_RE.test(p)) throw new Error('请输入正确的 11 位手机号');
  console.info('[cloud-auth] 提交登录请求');
  const { error } = await supabase.auth.signInWithPassword({ email: `${p}@meoo.local`, password });
  if (error) {
    console.warn('[cloud-auth] 登录失败', error.message);
    throw new Error(error.message === 'Invalid login credentials' ? '手机号或密码不正确' : `登录失败：${error.message}`);
  }
  console.info('[cloud-auth] 登录成功');
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  console.info('[cloud-auth] 已退出登录');
}

async function requireUid(): Promise<string> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error('请先登录');
  return session.user.id;
}

/* -------------------------------- 班级 ----------------------------------- */

/** 查询当前用户已加入/创建的班级（classes ∪ class_members 两条来源合并去重） */
export async function getMyClass(): Promise<ClassInfo | null> {
  const uid = await requireUid();
  const { data: memberRows, error: e1 } = await supabase
    .from('class_members')
    .select('class_id, role, classes(id, code, name, owner_id)')
    .eq('user_id', uid);
  if (e1) throw new Error(`读取班级失败：${e1.message}`);
  const ownedFirst = (memberRows ?? []).find((r) => r.role === 'owner');
  const memberFirst = (memberRows ?? [])[0];
  const row = ownedFirst ?? memberFirst;
  const joined = Array.isArray(row?.classes) ? row.classes[0] : row?.classes;
  if (joined?.id) {
    return { classId: String(joined.id), code: String(joined.code), name: String(joined.name), isOwner: joined.owner_id === uid };
  }
  // 兜底：创建了班级但成员行意外缺失时按 owner 查
  const { data: owned, error: e2 } = await supabase.from('classes').select('id, code, name').eq('owner_id', uid).limit(1);
  if (e2) throw new Error(`读取班级失败：${e2.message}`);
  const o = (owned ?? [])[0];
  if (!o) return null;
  return { classId: String(o.id), code: String(o.code), name: String(o.name), isOwner: true };
}

/** 创建/加入时统一生成班级码：6 位大写、剔除易混字符（0/O、1/I/L） */
function genClassCode(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 6; i += 1) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** 用班级码加入班级（幂等：已在班直接返回现状） */
export async function joinClass(code: string): Promise<ClassInfo> {
  // 用户手输常带空格/换行/全角字符，且 RLS 下查不到与不存在无法区分，清洗必须做到极致
  const c = code.replace(/[\s\u3000]/g, '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  ).toUpperCase();
  if (!c) throw new Error('请输入班级码');
  console.info(`[cloud-class] 尝试加入班级：原始输入「${code}」→ 归一化「${c}」`);
  const uid = await requireUid();
  const { data: cls, error } = await supabase.from('classes').select('id, code, name, owner_id').eq('code', c).maybeSingle();
  if (error) {
    console.warn('[cloud-class] 班级码查询报错', error.message);
    throw new Error(`查询班级失败：${error.message}`);
  }
  if (!cls) {
    console.warn(`[cloud-class] 未命中班级码「${c}」（云端不存在该码，或该班尚未被本人加入而不可见）`);
    throw new Error('班级码不存在。请核对管理员手机「班级云同步」页面上显示的班级码（注意区分字母与数字），或直接让管理员把码重新发给你复制粘贴');
  }
  const classId = String(cls.id);
  const { data: existing } = await supabase.from('class_members').select('id').eq('class_id', classId).eq('user_id', uid).maybeSingle();
  if (!existing) {
    const { data: inserted, error: e2 } = await supabase
      .from('class_members')
      .insert({ class_id: classId, user_id: uid, role: cls.owner_id === uid ? 'owner' : 'member' })
      .select();
    if (e2) throw new Error(`加入班级失败：${e2.message}`);
    if (!inserted || inserted.length === 0) throw new Error('加入失败：权限策略拦截，请确认已登录');
    console.info(`[cloud-class] 已加入班级 ${cls.code}（${cls.name}）`);
  } else {
    console.info(`[cloud-class] 已在班级 ${cls.code} 中，跳过插入`);
  }
  return { classId, code: String(cls.code), name: String(cls.name), isOwner: cls.owner_id === uid };
}

/** 创建班级（创建者即管理员），班级码自动生成 */
export async function createClass(name: string): Promise<ClassInfo> {
  const n = name.trim();
  if (n.length < 2) throw new Error('班级名称至少 2 个字');
  const uid = await requireUid();
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = genClassCode();
    const { data, error } = await supabase
      .from('classes')
      .insert({ code, name: n, owner_id: uid })
      .select('id, code, name');
    if (error) {
      lastErr = error.message;
      if (error.message.includes('duplicate key') || error.code === '23505') continue; // 撞码重试
      throw new Error(`创建班级失败：${error.message}`);
    }
    if (!data || data.length === 0) throw new Error('创建失败：权限策略拦截，请确认已登录');
    const classId = String(data[0].id);
    const { error: e2 } = await supabase
      .from('class_members')
      .insert({ class_id: classId, user_id: uid, role: 'owner' })
      .select();
    if (e2) throw new Error(`班级已创建但成员登记失败：${e2.message}`);
    console.info(`[cloud-class] 创建班级 ${code}（${n}），创建者为管理员`);
    return { classId, code: String(data[0].code), name: String(data[0].name), isOwner: true };
  }
  throw new Error(`班级码重复，请稍后重试：${lastErr}`);
}

/* ---------------------------- 快照：上传 / 拉取 ---------------------------- */

/** 从本机 SQLite 组装共享课表 payload（当前学期 + 全局作息） */
export async function buildLocalPayload(): Promise<TimetablePayload> {
  const semester = await repo.getCurrentSemester();
  if (!semester) throw new Error('本机还没有学期，请先添加或导入课表');
  const [periods, courses, exams, homework, events] = await Promise.all([
    repo.listPeriods(),
    repo.listCourses(semester.id),
    repo.listExams(semester.id),
    repo.listHomework(semester.id),
    repo.listCalendarEvents(semester.id),
  ]);
  if (courses.length === 0) throw new Error('当前学期没有课程，无需上传');
  const payload: TimetablePayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    semester: { name: semester.name, startDate: semester.startDate, totalWeeks: semester.totalWeeks },
    periods: periods.map(({ id: _id, ...rest }) => rest),
    courses: courses.map(({ id: _id, semesterId: _sid, ...rest }) => rest),
    exams: exams.map(({ id: _id, semesterId: _sid, ...rest }) => rest),
    homework: homework.map(({ id: _id, semesterId: _sid, courseId: _cid, ...rest }) => ({ ...rest, courseId: null })),
    events: events.map(({ id: _id, semesterId: _sid, ...rest }) => rest),
  };
  console.info(`[cloud-sync] 组装载荷：学期「${semester.name}」课程 ${payload.courses.length} 条、考试 ${payload.exams.length}、作业 ${payload.homework.length}、校历 ${payload.events.length}、作息 ${payload.periods.length} 节`);
  return payload;
}

/** 管理员上传快照（旧快照全部替换，班级里永远只有最新一份） */
export async function uploadSnapshot(): Promise<{ courseCount: number }> {
  const uid = await requireUid();
  const cls = await getMyClass();
  if (!cls) throw new Error('请先加入或创建班级');
  if (!cls.isOwner) throw new Error('只有班级管理员可以上传课表');
  const payload = await buildLocalPayload();
  const body = JSON.stringify(payload);
  if (body.length > 400_000) throw new Error('课表数据过大，无法上传云端');
  const { error: delErr } = await supabase.from('timetable_snapshots').delete().eq('class_id', cls.classId);
  if (delErr) console.warn('[cloud-sync] 清理旧快照失败（继续尝试上传）', delErr.message);
  const { data, error } = await supabase
    .from('timetable_snapshots')
    .insert({
      class_id: cls.classId,
      uploaded_by: uid,
      payload: payload as never,
      semester_name: payload.semester.name,
      course_count: payload.courses.length,
    })
    .select('id');
  if (error) throw new Error(`上传失败：${error.message}`);
  if (!data || data.length === 0) throw new Error('上传被权限策略拦截：仅班级管理员可上传课表');
  console.info(`[cloud-sync] 快照上传成功 snapshot=${data[0].id} 课程 ${payload.courses.length} 条`);
  return { courseCount: payload.courses.length };
}

/** 班级最新快照的元信息（同学端展示用） */
export async function getLatestSnapshotMeta(): Promise<CloudSnapshotMeta | null> {
  const cls = await getMyClass();
  if (!cls) return null;
  const { data, error } = await supabase
    .from('timetable_snapshots')
    .select('id, created_at, semester_name, course_count, profiles(username)')
    .eq('class_id', cls.classId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`读取云端课表信息失败：${error.message}`);
  const row = (data ?? [])[0];
  if (!row) return null;
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    semesterName: String(row.semester_name ?? ''),
    courseCount: Number(row.course_count ?? 0),
    uploaderName: String(profile?.username ?? '未知'),
  };
}

/** 拉取班级最新快照并覆盖写入本机（同名学期复用，避免重复学期） */
export async function pullLatestSnapshotToLocal(): Promise<{ courseCount: number; semesterName: string }> {
  const cls = await getMyClass();
  if (!cls) throw new Error('请先加入班级');
  const { data, error } = await supabase
    .from('timetable_snapshots')
    .select('id, payload, semester_name, course_count')
    .eq('class_id', cls.classId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`拉取云端课表失败：${error.message}`);
  if (!data) throw new Error('班级还没有上传过课表，请联系管理员');
  const payload = data.payload as unknown as TimetablePayload;
  if (!payload || payload.version !== 1 || !Array.isArray(payload.courses)) {
    throw new Error('云端课表数据格式不正确，请联系管理员重新上传');
  }
  await applyPayloadToLocal(payload);
  console.info(`[cloud-sync] 已从班级 ${cls.code} 拉取并覆盖本机课表：课程 ${payload.courses.length} 条`);
  return { courseCount: payload.courses.length, semesterName: payload.semester.name };
}

/** 把云端 payload 落到本机 SQLite：学期按名复用、作息整体替换、课程/考试/作业/校历整表覆盖 */
async function applyPayloadToLocal(payload: TimetablePayload): Promise<void> {
  const semesters = await repo.listSemesters();
  const sameName = semesters.find((s) => s.name === payload.semester.name);
  let sid: number;
  if (sameName) {
    sid = await repo.saveSemester({
      id: sameName.id,
      name: payload.semester.name,
      startDate: payload.semester.startDate,
      totalWeeks: payload.semester.totalWeeks,
    });
    await repo.setCurrentSemester(sid);
    console.info(`[cloud-sync] 复用同名学期 id=${sid}`);
  } else {
    sid = await repo.saveSemester({
      name: payload.semester.name,
      startDate: payload.semester.startDate,
      totalWeeks: payload.semester.totalWeeks,
      isCurrent: 1,
    });
  }
  if (Array.isArray(payload.periods) && payload.periods.length > 0) {
    await repo.replacePeriods(payload.periods);
  }
  // 覆盖该学期旧数据（course/exam/homework/calendar_event 均按 semester_id 归属）
  const oldCourses = await repo.listCourses(sid);
  for (const c of oldCourses) await repo.deleteCourse(c.id);
  const oldExams = await repo.listExams(sid);
  for (const e of oldExams) await repo.deleteExam(e.id);
  const oldHw = await repo.listHomework(sid);
  for (const h of oldHw) await repo.deleteHomework(h.id);
  const oldEvents = await repo.listCalendarEvents(sid);
  for (const ev of oldEvents) await repo.deleteCalendarEvent(ev.id);

  for (const c of payload.courses) await repo.upsertCourse({ ...c, weeks: Array.isArray(c.weeks) ? c.weeks : [], semesterId: sid });
  for (const e of payload.exams ?? []) await repo.upsertExam({ ...e, semesterId: sid });
  for (const h of payload.homework ?? []) await repo.upsertHomework({ ...h, courseId: null, semesterId: sid });
  for (const ev of payload.events ?? []) await repo.upsertCalendarEvent({ ...ev, semesterId: sid });
  await repo.saveSetting('defaultTimetableSeeded', 1); // 已有数据，防止播种逻辑再插默认课表
}
