// حالت بقا: تا وقتی جان داری جواب بده؛ هر اشتباه یک جان کم می‌کند.
import { REWARDS, SURVIVAL_LIVES, SURVIVAL_TIME_MS } from '../../shared/constants.ts';
import type { LeaderboardDTO, NextDTO, SurvivalDTO } from '../../shared/types.ts';
import { all, get, mustUser, now, run, tx } from '../db.ts';
import type { InstanceRow, UserRow } from '../db.ts';
import { addCoins, addXp, checkStatAchievements, toPlayer } from './economy.ts';
import { createInstance, finalize, isExpired, pendingInstance, toQuestionDTO } from './engine.ts';
import { pickSurvival } from './questions.ts';

interface RunRow {
  id: number;
  user_id: number;
  score: number;
  lives: number;
  pos: number;
  finished: number;
  coins: number;
  xp: number;
  record: number;
  started_at: number;
  finished_at: number | null;
}

function activeRun(uid: number): RunRow | undefined {
  return get<RunRow>('SELECT * FROM survival_runs WHERE user_id = ? AND finished = 0 ORDER BY id DESC LIMIT 1', uid);
}

function getRun(id: number): RunRow | undefined {
  return get<RunRow>('SELECT * FROM survival_runs WHERE id = ?', id);
}

function finish(r: RunRow): void {
  if (r.finished) return;
  const user = mustUser(r.user_id);
  const coins = r.score * REWARDS.survivalCoinPerCorrect;
  const xp = r.score * REWARDS.survivalXpPerCorrect;
  const record = r.score > user.survival_best;
  run(
    'UPDATE survival_runs SET finished = 1, coins = ?, xp = ?, record = ?, finished_at = ? WHERE id = ?',
    coins,
    xp,
    record ? 1 : 0,
    now(),
    r.id,
  );
  if (record) run('UPDATE users SET survival_best = ? WHERE id = ?', r.score, r.user_id);
  addCoins(r.user_id, coins);
  addXp(r.user_id, xp);
  checkStatAchievements(r.user_id);
}

function board(uid: number): LeaderboardDTO {
  const top = all<UserRow>(
    'SELECT * FROM users WHERE is_bot = 0 AND survival_best > 0 ORDER BY survival_best DESC, xp DESC LIMIT 30',
  );
  const rows = top.map((u, i) => ({ rank: i + 1, player: toPlayer(u), value: u.survival_best }));
  const me = mustUser(uid);
  if (me.survival_best <= 0) return { rows, me: null };
  const better =
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM users
       WHERE is_bot = 0 AND (survival_best > ? OR (survival_best = ? AND xp > ?))`,
      me.survival_best,
      me.survival_best,
      me.xp,
    )?.c ?? 0;
  return { rows, me: { rank: better + 1, player: toPlayer(me), value: me.survival_best } };
}

export function survivalState(uid: number): SurvivalDTO {
  const active = activeRun(uid);
  const last = get<RunRow>(
    'SELECT * FROM survival_runs WHERE user_id = ? AND finished = 1 ORDER BY id DESC LIMIT 1',
    uid,
  );
  return {
    best: mustUser(uid).survival_best,
    active: active ? { score: active.score, lives: active.lives } : null,
    last: last ? { score: last.score, coins: last.coins, xp: last.xp, record: last.record === 1 } : null,
    board: board(uid),
  };
}

/** شروع یک دور تازه (دور نیمه‌کارهٔ قبلی بسته می‌شود) */
export function survivalStart(uid: number): NextDTO {
  return tx(() => {
    const old = activeRun(uid);
    if (old) finish(old);
    run('INSERT INTO survival_runs (user_id, lives, started_at) VALUES (?, ?, ?)', uid, SURVIVAL_LIVES, now());
    return survivalNext(uid);
  });
}

function questionDTO(inst: InstanceRow, r: RunRow) {
  return toQuestionDTO(inst, { index: inst.slot + 1, total: null, round: null, lives: r.lives, score: r.score });
}

export function survivalNext(uid: number): NextDTO {
  return tx(() => {
    let r = activeRun(uid);
    if (!r) return { state: 'finished' };

    const pending = pendingInstance(uid, 'survival', r.id);
    if (pending) {
      if (!isExpired(pending)) return { state: 'question', question: questionDTO(pending, r) };
      survivalAfterAnswer(pending, finalize(pending, -1).correct);
      r = getRun(r.id)!;
      if (r.finished) return { state: 'finished' };
    }

    const questionId = pickSurvival(uid, r.id, r.pos);
    if (questionId === null) {
      // همهٔ سوال‌ها را جواب داده است
      finish(r);
      return { state: 'finished' };
    }
    return {
      state: 'question',
      question: questionDTO(createInstance(uid, 'survival', r.id, r.pos, questionId, SURVIVAL_TIME_MS), r),
    };
  });
}

export function survivalAfterAnswer(
  inst: InstanceRow,
  correct: boolean,
): { lives: number; score: number; finished: boolean } {
  const r = getRun(inst.ctx_id);
  if (!r || r.finished) return { lives: r?.lives ?? 0, score: r?.score ?? 0, finished: true };
  const lives = correct ? r.lives : r.lives - 1;
  const score = correct ? r.score + 1 : r.score;
  run('UPDATE survival_runs SET lives = ?, score = ?, pos = pos + 1 WHERE id = ?', lives, score, r.id);
  if (lives <= 0) finish({ ...r, lives, score });
  return { lives, score, finished: lives <= 0 };
}
