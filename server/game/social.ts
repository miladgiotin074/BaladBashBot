// رده‌بندی و پروفایل عمومی
import { levelInfo, levelTitle } from '../../shared/constants.ts';
import type { AchievementDTO, LeaderboardDTO, ProfileDTO } from '../../shared/types.ts';
import { all, get, getUser } from '../db.ts';
import type { UserRow } from '../db.ts';
import { notFound, tehranWeek } from '../util.ts';
import { rankOf, toPlayer } from './economy.ts';

export function trophyBoard(me: UserRow): LeaderboardDTO {
  const top = all<UserRow>('SELECT * FROM users WHERE is_bot = 0 ORDER BY trophies DESC, xp DESC LIMIT 50');
  return {
    rows: top.map((u, i) => ({ rank: i + 1, player: toPlayer(u), value: u.trophies })),
    me: { rank: rankOf(me), player: toPlayer(me), value: me.trophies },
  };
}

export function weeklyBoard(me: UserRow): LeaderboardDTO {
  const week = tehranWeek();
  const top = all<UserRow & { points: number }>(
    `SELECT u.*, w.points AS points
     FROM weekly w JOIN users u ON u.id = w.user_id
     WHERE w.week = ? AND u.is_bot = 0
     ORDER BY w.points DESC LIMIT 50`,
    week,
  );
  const mine = get<{ points: number }>('SELECT points FROM weekly WHERE week = ? AND user_id = ?', week, me.id);
  const points = mine?.points ?? 0;
  const better =
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM weekly w JOIN users u ON u.id = w.user_id
       WHERE w.week = ? AND u.is_bot = 0 AND w.points > ?`,
      week,
      points,
    )?.c ?? 0;
  return {
    rows: top.map((u, i) => ({ rank: i + 1, player: toPlayer(u), value: u.points })),
    me: points > 0 ? { rank: better + 1, player: toPlayer(me), value: points } : null,
  };
}

export function profileOf(targetId: number): ProfileDTO {
  const u = getUser(targetId);
  if (!u) throw notFound('این بازیکن پیدا نشد');
  const achievements = all<AchievementDTO>(
    'SELECT key, at FROM achievements WHERE user_id = ? ORDER BY at DESC',
    u.id,
  );
  const categories = all<{ category: string; answered: number; correct: number }>(
    `SELECT q.category AS category, COUNT(*) AS answered, COALESCE(SUM(i.is_correct), 0) AS correct
     FROM instances i JOIN questions q ON q.id = i.question_id
     WHERE i.user_id = ? AND i.answered_at IS NOT NULL
     GROUP BY q.category`,
    u.id,
  );
  return {
    player: toPlayer(u),
    title: levelTitle(levelInfo(u.xp).level),
    trophies: u.trophies,
    games: u.games,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    correct: u.correct,
    answered: u.answered,
    bestWinStreak: u.best_win_streak,
    survivalBest: u.survival_best,
    rank: u.is_bot ? 0 : rankOf(u),
    achievements,
    categories,
    joinedAt: u.created_at,
  };
}
