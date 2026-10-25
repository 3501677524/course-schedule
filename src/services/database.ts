/**
 * 数据库初始化骨架（平台托管，业务代码不要绕开它拿句柄）
 *
 * 为什么存在这个文件——三条硬理由：
 *
 * 1. 迁移完成后才发布句柄。"opened 不等于 initialized"：openDatabaseAsync 返回后
 *    schema 可能还没建好，业务此时拿到句柄就查询，会得到 "no such table"。这个竞态
 *    在 Web 预览（wasm + Worker，IO 慢）下高概率出现，在真机上同样存在只是窗口更小。
 *    本骨架用 Promise 锁保证：句柄只在全部迁移执行完之后对外可见。
 *
 * 2. 全应用统一初始化入口。模块级单例 + 并发去重（in-flight Promise 复用）避免业务
 *    各自打开数据库、并发执行迁移或使用不一致的连接配置。SQLiteProvider/
 *    useSQLiteContext 是 Expo 官方支持的另一种架构；如果选用 Provider，应由 onInit
 *    统一管理迁移，并替代本骨架，不要对同一个数据库混用两套初始化入口。
 *
 * 3. 只用 async API。Web 预览环境没有 SharedArrayBuffer，sync 系（openDatabaseSync/
 *    execSync/getAllSync 等）会直接崩；Expo 官方也推荐 async 路径，async 等价物
 *    功能完全一致，禁用不损失任何能力。同理 withExclusiveTransactionAsync 在 Web
 *    实现中不受支持，事务一律用 withTransactionAsync。
 */
import * as SQLite from 'expo-sqlite';

export interface Migration {
  /** 递增整数版本号，从 1 开始；执行成功后写入 PRAGMA user_version */
  version: number;
  /** 该版本要执行的 DDL/DML 语句，整个版本在一个事务里原子执行 */
  statements: string[];
}

export const DB_NAME = 'app.db';

/**
 * 全部 schema 迁移都登记在这里（version 递增），业务代码不要在别处执行 DDL。
 * 示例：
 *   { version: 1, statements: ['CREATE TABLE IF NOT EXISTS todo (id INTEGER PRIMARY KEY, title TEXT NOT NULL)'] }
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS semester (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        total_weeks INTEGER NOT NULL DEFAULT 20,
        is_current INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS course (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        teacher TEXT NOT NULL DEFAULT '',
        room TEXT NOT NULL DEFAULT '',
        credit REAL NOT NULL DEFAULT 0,
        course_type TEXT NOT NULL DEFAULT '必修',
        exam_type TEXT NOT NULL DEFAULT '考试',
        weekday INTEGER NOT NULL DEFAULT 1,
        start_period INTEGER NOT NULL DEFAULT 1,
        end_period INTEGER NOT NULL DEFAULT 1,
        start_week INTEGER NOT NULL DEFAULT 1,
        end_week INTEGER NOT NULL DEFAULT 16,
        week_parity TEXT NOT NULL DEFAULT 'all',
        color TEXT NOT NULL DEFAULT '#4f8c74',
        note TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS exam (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        exam_kind TEXT NOT NULL DEFAULT '期末',
        datetime TEXT NOT NULL,
        room TEXT NOT NULL DEFAULT '',
        seat TEXT NOT NULL DEFAULT '',
        remind_on INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS homework (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        course_id INTEGER,
        course_name TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS period_slot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot_index INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_break INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS calendar_event (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semester_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'holiday',
        swap_weekday INTEGER,
        title TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_course_semester ON course (semester_id, weekday)',
      'CREATE INDEX IF NOT EXISTS idx_exam_semester ON exam (semester_id, datetime)',
      'CREATE INDEX IF NOT EXISTS idx_homework_semester ON homework (semester_id, due_at)',
      'CREATE INDEX IF NOT EXISTS idx_calendar_semester ON calendar_event (semester_id, date)',
    ],
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS campus_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_uri TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT ''
      )`,
      `CREATE TABLE IF NOT EXISTS room_marker (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        pos_x REAL NOT NULL DEFAULT 0.5,
        pos_y REAL NOT NULL DEFAULT 0.5,
        note TEXT NOT NULL DEFAULT ''
      )`,
    ],
  },
  {
    version: 3,
    statements: [
      // is_path=1 表示道路/路口锚点，仅参与离线路线连线；ratio 记录底图宽高比
      'ALTER TABLE room_marker ADD COLUMN is_path INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE campus_map ADD COLUMN ratio REAL NOT NULL DEFAULT 1.3333',
    ],
  },
  {
    version: 4,
    statements: [
      // ⚠️ 显式上课周列表：导入的课表存在「中间停课周」（如第 3-4、8-19 周上课），
      // 仅靠 start_week/end_week + week_parity 无法表达空档，会把停课周渲染成有课。
      // 空串 = 无显式列表，按区间+奇偶判定（老数据、手工课程不受影响）。
      'ALTER TABLE course ADD COLUMN weeks TEXT NOT NULL DEFAULT \'\'',
    ],
  },
];

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function validateMigrations(migrations: Migration[]): void {
  const versions = new Set<number>();

  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= 0) {
      throw new Error(`[database] 非法迁移版本号: ${String(migration.version)}`);
    }
    if (versions.has(migration.version)) {
      throw new Error(`[database] 重复的迁移版本号: ${migration.version}`);
    }
    versions.add(migration.version);

    for (const statement of migration.statements) {
      if (!statement.trim()) {
        throw new Error(`[database] 迁移 ${migration.version} 包含空 SQL`);
      }
    }
  }
}

async function runMigrations(handle: SQLite.SQLiteDatabase): Promise<void> {
  validateMigrations(MIGRATIONS);
  const row = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  const pending = MIGRATIONS
    .filter((migration) => migration.version > current)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await handle.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await handle.execAsync(statement);
      }
      await handle.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}

/**
 * 获取数据库句柄的唯一入口。可在任意处并发调用：
 * 已初始化直接返回；初始化进行中复用同一个 Promise；失败后允许重试。
 */
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const next = await SQLite.openDatabaseAsync(DB_NAME);
    try {
      // journal_mode / foreign_keys 都是连接级配置，SQLite 禁止在迁移事务内切换。
      await next.execAsync('PRAGMA journal_mode = WAL');
      await next.execAsync('PRAGMA foreign_keys = ON');
      await runMigrations(next);
      db = next; // 最后发布：迁移没跑完之前，任何调用方都拿不到句柄
      return next;
    } catch (error) {
      // 失败句柄从未对外发布，可以安全关闭，避免下次重试再打开同名句柄。
      try {
        await next.closeAsync();
      } catch {
        // 保留原始初始化错误。
      }
      throw error;
    }
  })();

  try {
    return await initPromise;
  } finally {
    if (!db) initPromise = null; // 初始化失败则重置，下一次调用可重试
  }
}
