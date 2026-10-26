-- ============================================================
-- 课程表 App · 自建 Supabase 数据库迁移脚本
-- ============================================================
-- 用途：把云同步（班级 / 成员 / 课表快照）从秒悟托管后端
--       迁移到你完全掌控的 Supabase 项目，并堵上「classes 表
--       匿名可读」的隐患。
--
-- 用法：
--   1. 到 supabase.com 注册并新建一个免费项目（选离你近的区）
--   2. 左侧 SQL Editor → New query → 粘贴本文件全部内容 → Run
--   3. 把 src/supabase/client.ts 里的 supabaseUrl 和
--      supabaseAnonKey 换成你新项目的值（Project Settings → API）
--   4. Auth → Providers 确认 Email 登录已开启（App 用虚拟邮箱登录）
--
-- App 代码无需其他改动，本脚本的表结构和权限策略与
-- cloudSync.ts 的每一条查询/写入一一对应。
-- ============================================================

-- ---------- 1. 建表 ----------

-- 用户公开档案：id 对应用户，username = 学号/账号，display_name = 昵称
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- 班级：code = 6 位班级码（加入凭证，唯一）
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 班级成员：一人可属多班；role = owner（管理员）/ member
create table if not exists public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (class_id, user_id)
);

-- 班级课表快照：payload 为完整课表 JSON（课程/考试/作业/校历/作息）
create table if not exists public.timetable_snapshots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  semester_name text,
  course_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 2. 新用户注册自动建档 ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', null)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. 索引 ----------

create index if not exists idx_classes_code on public.classes (code);
create index if not exists idx_classes_owner on public.classes (owner_id);
create index if not exists idx_members_user on public.class_members (user_id);
create index if not exists idx_members_class on public.class_members (class_id);
create index if not exists idx_snapshots_class on public.timetable_snapshots (class_id, created_at desc);

-- ---------- 4. 开启行级安全（RLS） ----------

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.timetable_snapshots enable row level security;

-- ---------- 5. 权限策略 ----------

-- profiles：
--   select 已登录用户可读（App 需显示「上传者」名字）
--   update 仅本人（改昵称）
create policy "profiles_select_authed"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- classes：
--   select 仅已登录用户可查（匿名不可读 —— 堵住原裸奔问题）
--   insert 仅本人创建
--   update / delete 仅管理员（owner）
create policy "classes_select_authed"
  on public.classes for select
  to authenticated
  using (true);

create policy "classes_insert_own"
  on public.classes for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "classes_update_owner"
  on public.classes for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "classes_delete_owner"
  on public.classes for delete
  to authenticated
  using (auth.uid() = owner_id);

-- class_members：
--   select 仅本人（App 只读自己的成员行）
--   insert 登录用户本人加入
--   update / delete 仅本人
create policy "members_select_own"
  on public.class_members for select
  to authenticated
  using (auth.uid() = user_id);

create policy "members_insert_self"
  on public.class_members for insert
  to authenticated
  with check (auth.uid() = user_id and role in ('owner', 'member'));

create policy "members_update_own"
  on public.class_members for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "members_delete_own"
  on public.class_members for delete
  to authenticated
  using (auth.uid() = user_id);

-- timetable_snapshots：
--   select 本班成员可读（拉取课表）
--   insert / delete 仅本班管理员（上传 / 清理旧快照）
create policy "snapshots_select_member"
  on public.timetable_snapshots for select
  to authenticated
  using (
    exists (
      select 1 from public.class_members cm
      where cm.class_id = timetable_snapshots.class_id
        and cm.user_id = auth.uid()
    )
  );

create policy "snapshots_insert_owner"
  on public.timetable_snapshots for insert
  to authenticated
  with check (
    exists (
      select 1 from public.class_members cm
      where cm.class_id = timetable_snapshots.class_id
        and cm.user_id = auth.uid()
        and cm.role = 'owner'
    )
  );

create policy "snapshots_delete_owner"
  on public.timetable_snapshots for delete
  to authenticated
  using (
    exists (
      select 1 from public.class_members cm
      where cm.class_id = timetable_snapshots.class_id
        and cm.user_id = auth.uid()
        and cm.role = 'owner'
    )
  );

-- ============================================================
-- 迁移完成自检：跑完上面全部内容后，可执行下面这条查询，
-- 应返回 4 张表 + 11 条策略（无报错即成功）。
--   select tablename from pg_tables where schemaname='public'
--     and tablename in ('profiles','classes','class_members','timetable_snapshots');
-- ============================================================
