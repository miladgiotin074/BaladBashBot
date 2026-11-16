// چالش روزانه: هر روز ۱۰ سوالِ یکسان برای همه؛ هر بازیکن فقط یک بار.
import { DAILY_QUESTIONS, DAILY_TIME_MS, REWARDS } from '../../shared/constants.ts';
import type { DailyDTO, LeaderboardDTO, LeaderRowDTO, NextDTO } from '../../shared/types.ts';
import { all, get, mustUser, now, run, tx } from '../db.ts';
import type { InstanceRow, UserRow } from '../db.ts';
import { fa, tehranDay } from '../util.ts';
import { addCoins, addXp, checkStatAchievements, grant, toPlayer } from './economy.ts';
import { createInstance, finalize, isExpired, pendingInstance, toQuestionDTO } from './engine.ts';
import { dailySet } from './questions.ts';

interface RunRow {
  id: number;
  day: string;
  user_id: number;
  score: number;
  time_ms: number;
  finished: number;
  coins: number;
  xp: number;
  started_at: number;
}

function getRun(day: string, uid: number): RunRow | undefined {
  return get<RunRow>('SELECT * FROM daily_runs WHERE day = ? AND user_id = ?', day, uid);
}

function answered(runId: number): number {
  return (
    get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM instances WHERE ctx = 'daily' AND ctx_id = ? AND answered_at IS NOT NULL",
      runId,
    )?.c ?? 0
  );
}

function row(rank: number, u: UserRow, score: number, timeMs: number): LeaderRowDTO {
  return { rank, player: toPlayer(u), value: score, sub: `${fa(Math.round(timeMs / 1000))} ثانیه` };
}

function board(day: string, uid: number): LeaderboardDTO {
  const top = all<UserRow & { r_score: number; r_time: number }>(
    `SELECT u.*, r.score AS r_score, r.time_ms AS r_time
     FROM daily_runs r JOIN users u ON u.id = r.user_id
     WHERE r.day = ? AND r.finished = 1
     ORDER BY r.score DESC, r.time_ms ASC LIMIT 30`,
    day,
  );
  const rows = top.map((u, i) => row(i + 1, u, u.r_score, u.r_time));
  const mine = getRun(day, uid);
  let me: LeaderRowDTO | null = null;
  if (mine?.finished) {
    const better =
      get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM daily_runs
         WHERE day = ? AND finished = 1 AND (score > ? OR (score = ? AND time_ms < ?))`,
        day,
        mine.score,
        mine.score,
        mine.time_ms,
      )?.c ?? 0;
    me = row(better + 1, mustUser(uid), mine.score, mine.time_ms);
  }
  return { rows, me };
}

export function dailyState(uid: number): DailyDTO {
  const day = tehranDay();
  const mine = getRun(day, uid);
  return {
    day,
    played: Boolean(mine),
    finished: Boolean(mine?.finished),
    score: mine?.score ?? 0,
    timeMs: mine?.time_ms ?? 0,
    total: DAILY_QUESTIONS,
    reward: mine?.finished ? { coins: mine.coins, xp: mine.xp } : null,
    board: board(day, uid),
  };
}

export function playedToday(uid: number): boolean {
  return Boolean(getRun(tehranDay(), uid)?.finished);
}

function questionDTO(inst: InstanceRow, total: number) {
  return toQuestionDTO(inst, { index: inst.slot + 1, total, round: null, lives: null, score: null });
}

function finish(run_: RunRow): void {
  const stats = get<{ score: number; time: number }>(
    `SELECT COALESCE(SUM(is_correct), 0) AS score, COALESCE(SUM(answered_at - asked_at), 0) AS time
     FROM instances WHERE ctx = 'daily' AND ctx_id = ?`,
    run_.id,
  ) ?? { score: 0, time: 0 };
  const perfect = stats.score >= DAILY_QUESTIONS;
  const coins = stats.score * REWARDS.dailyCoinPerCorrect + (perfect ? REWARDS.dailyPerfectBonus : 0);
  const xp = stats.score * REWARDS.dailyXpPerCorrect;
  run(
    'UPDATE daily_runs SET finished = 1, score = ?, time_ms = ?, coins = ?, xp = ? WHERE id = ? AND finished = 0',
    stats.score,
    Math.max(0, stats.time),
    coins,
    xp,
    run_.id,
  );
  addCoins(run_.user_id, coins);
  addXp(run_.user_id, xp);
  if (perfect) grant(run_.user_id, 'daily_perfect');
  checkStatAchievements(run_.user_id);
}

/** سوال بعدی چالش امروز (اولین فراخوانی، چالش را شروع می‌کند) */
export function dailyNext(uid: number): NextDTO {
  return tx(() => {
    const day = tehranDay();
    const ids = dailySet(day);
    let mine = getRun(day, uid);
    if (!mine) {
      run('INSERT INTO daily_runs (day, user_id, started_at) VALUES (?, ?, ?)', day, uid, now());
      mine = getRun(day, uid)!;
    }
    if (mine.finished) return { state: 'finished' };

    const pending = pendingInstance(uid, 'daily', mine.id);
    if (pending) {
      if (!isExpired(pending)) return { state: 'question', question: questionDTO(pending, ids.length) };
      finalize(pending, -1);
    }
    const pos = answered(mine.id);
    const questionId = ids[pos];
    if (questionId === undefined) {
      finish(mine);
      return { state: 'finished' };
    }
    return {
      state: 'question',
      question: questionDTO(createInstance(uid, 'daily', mine.id, pos, questionId, DAILY_TIME_MS), ids.length),
    };
  });
}

export function dailyAfterAnswer(inst: InstanceRow): void {
  const mine = get<RunRow>('SELECT * FROM daily_runs WHERE id = ?', inst.ctx_id);
  if (!mine || mine.finished) return;
  if (answered(mine.id) >= dailySet(mine.day).length) finish(mine);
}
