import { DatabaseSync } from 'node:sqlite';
import type { StatementSync, SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.ts';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  photo_url TEXT,
  avatar INTEGER NOT NULL DEFAULT 0,
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_skill REAL,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  trophies INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  answered INTEGER NOT NULL DEFAULT 0,
  win_streak INTEGER NOT NULL DEFAULT 0,
  best_win_streak INTEGER NOT NULL DEFAULT 0,
  survival_best INTEGER NOT NULL DEFAULT 0,
  bonus_streak INTEGER NOT NULL DEFAULT 0,
  bonus_day TEXT,
  referred_by INTEGER,
  referral_paid INTEGER NOT NULL DEFAULT 0,
  notify INTEGER NOT NULL DEFAULT 1,
  can_notify INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_trophies ON users(trophies DESC);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  options TEXT NOT NULL,
  correct INTEGER NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'approved',
  author_id INTEGER,
  seed_key TEXT UNIQUE,
  shown INTEGER NOT NULL DEFAULT 0,
  right INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_cat ON questions(category, status);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL,
  p1 INTEGER NOT NULL,
  p2 INTEGER,
  status TEXT NOT NULL,
  turn INTEGER,
  score1 INTEGER NOT NULL DEFAULT 0,
  score2 INTEGER NOT NULL DEFAULT 0,
  winner INTEGER,
  end_reason TEXT,
  result TEXT,
  bot_at INTEGER,
  deadline INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_matches_p1 ON matches(p1, status);
CREATE INDEX IF NOT EXISTS idx_matches_p2 ON matches(p2, status);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status, mode);

CREATE TABLE IF NOT EXISTS rounds (
  match_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  cat_options TEXT NOT NULL,
  category TEXT,
  question_ids TEXT,
  PRIMARY KEY (match_id, idx)
);

CREATE TABLE IF NOT EXISTS instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ctx TEXT NOT NULL,
  ctx_id INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  perm TEXT NOT NULL,
  asked_at INTEGER NOT NULL,
  limit_ms INTEGER NOT NULL,
  removed TEXT NOT NULL DEFAULT '[]',
  used TEXT NOT NULL DEFAULT '[]',
  answered_at INTEGER,
  choice INTEGER,
  is_correct INTEGER,
  UNIQUE (user_id, ctx, ctx_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_instances_user_q ON instances(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_instances_ctx ON instances(ctx, ctx_id);

CREATE TABLE IF NOT EXISTS daily_sets (
  day TEXT PRIMARY KEY,
  question_ids TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  time_ms INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  UNIQUE (day, user_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_board ON daily_runs(day, finished, score DESC, time_ms ASC);

CREATE TABLE IF NOT EXISTS survival_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  lives INTEGER NOT NULL,
  pos INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  record INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_survival_user ON survival_runs(user_id, finished);

CREATE TABLE IF NOT EXISTS weekly (
  week TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, user_id)
);
CREATE INDEX IF NOT EXISTS idx_weekly_board ON weekly(week, points DESC);

CREATE TABLE IF NOT EXISTS achievements (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS reports (
  question_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reason TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (question_id, user_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  pack TEXT NOT NULL,
  stars INTEGER NOT NULL,
  coins INTEGER NOT NULL,
  charge_id TEXT NOT NULL UNIQUE,
  at INTEGER NOT NULL
);
`);

// ───────── ابزارهای کوئری ─────────
const cache = new Map<string, StatementSync>();

function stmt(sql: string): StatementSync {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

type P = SQLInputValue;

export function get<T = Record<string, unknown>>(sql: string, ...params: P[]): T | undefined {
  return stmt(sql).get(...params) as T | undefined;
}

export function all<T = Record<string, unknown>>(sql: string, ...params: P[]): T[] {
  return stmt(sql).all(...params) as T[];
}

export function run(sql: string, ...params: P[]): { changes: number; lastId: number } {
  const r = stmt(sql).run(...params);
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}

let depth = 0;
let effects: (() => void)[] = [];

function flush(list: (() => void)[]): void {
  for (const fn of list) {
    setImmediate(() => {
      try {
        fn();
      } catch (err) {
        console.error('[effect]', err);
      }
    });
  }
}

/** اجرای اتمیک؛ تراکنش‌های تودرتو در همان تراکنش بیرونی اجرا می‌شوند. */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    const list = effects;
    effects = [];
    flush(list);
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    effects = [];
    throw err;
  } finally {
    depth--;
  }
}

/** کاری که باید بعد از ثبت موفق تراکنش انجام شود (مثل ارسال اعلان) */
export function defer(fn: () => void): void {
  if (depth > 0) effects.push(fn);
  else flush([fn]);
}

export const now = (): number => Date.now();

// ───────── ردیف‌ها ─────────
export interface UserRow {
  id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  photo_url: string | null;
  avatar: number;
  is_bot: number;
  bot_skill: number | null;
  coins: number;
  xp: number;
  trophies: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  correct: number;
  answered: number;
  win_streak: number;
  best_win_streak: number;
  survival_best: number;
  bonus_streak: number;
  bonus_day: string | null;
  referred_by: number | null;
  referral_paid: number;
  notify: number;
  can_notify: number;
  created_at: number;
  last_seen: number;
}

export interface QuestionRow {
  id: number;
  category: string;
  text: string;
  options: string;
  correct: number;
  difficulty: number;
  status: 'approved' | 'pending' | 'rejected';
  author_id: number | null;
  seed_key: string | null;
  shown: number;
  right: number;
  reports: number;
  created_at: number;
}

export interface MatchRow {
  id: number;
  code: string;
  mode: 'random' | 'friend';
  p1: number;
  p2: number | null;
  status: 'waiting' | 'active' | 'finished' | 'cancelled';
  turn: number | null;
  score1: number;
  score2: number;
  winner: number | null;
  end_reason: 'normal' | 'timeout' | 'resign' | null;
  result: string | null;
  bot_at: number | null;
  deadline: number | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

export interface RoundRow {
  match_id: number;
  idx: number;
  cat_options: string;
  category: string | null;
  question_ids: string | null;
}

export interface InstanceRow {
  id: number;
  user_id: number;
  ctx: 'duel' | 'daily' | 'survival';
  ctx_id: number;
  slot: number;
  question_id: number;
  perm: string;
  asked_at: number;
  limit_ms: number;
  removed: string;
  used: string;
  answered_at: number | null;
  choice: number | null;
  is_correct: number | null;
}

export function getUser(id: number): UserRow | undefined {
  return get<UserRow>('SELECT * FROM users WHERE id = ?', id);
}

export function mustUser(id: number): UserRow {
  const u = getUser(id);
  if (!u) throw new Error(`user ${id} not found`);
  return u;
}
