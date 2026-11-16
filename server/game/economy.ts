import { ACHIEVEMENTS, DAILY_BONUS, REWARDS, levelInfo, levelTitle } from '../../shared/constants.ts';
import type { MeDTO, PlayerDTO } from '../../shared/types.ts';
import { isAdmin } from '../config.ts';
import { all, get, getUser, mustUser, now, run, tx } from '../db.ts';
import type { UserRow } from '../db.ts';
import { bad, shiftDay, tehranDay, tehranWeek } from '../util.ts';

// ───────── نمایش بازیکن ─────────
export function displayName(u: Pick<UserRow, 'first_name'>): string {
  const name = u.first_name.trim();
  return name.length > 22 ? `${name.slice(0, 21)}…` : name || 'بازیکن';
}

export function toPlayer(u: UserRow): PlayerDTO {
  return {
    id: u.id,
    name: displayName(u),
    avatar: u.avatar,
    photo: u.photo_url,
    level: levelInfo(u.xp).level,
    isBot: u.is_bot === 1,
  };
}

export function bonusState(u: UserRow): MeDTO['dailyBonus'] {
  const today = tehranDay();
  const available = u.bonus_day !== today;
  const continues = u.bonus_day === shiftDay(today, -1);
  const streak = available ? (continues ? u.bonus_streak + 1 : 1) : u.bonus_streak;
  const day = ((Math.max(1, streak) - 1) % DAILY_BONUS.length) + 1;
  return { available, day, amount: DAILY_BONUS[day - 1]!, streak };
}

export function toMe(u: UserRow): MeDTO {
  const lv = levelInfo(u.xp);
  return {
    ...toPlayer(u),
    username: u.username,
    title: levelTitle(lv.level),
    coins: u.coins,
    xp: u.xp,
    levelInto: lv.into,
    levelNeed: lv.need,
    trophies: u.trophies,
    games: u.games,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    correct: u.correct,
    answered: u.answered,
    winStreak: u.win_streak,
    bestWinStreak: u.best_win_streak,
    survivalBest: u.survival_best,
    notify: u.notify === 1,
    isAdmin: isAdmin(u.id),
    dailyBonus: bonusState(u),
  };
}

// ───────── سکه و امتیاز ─────────
export function addCoins(userId: number, amount: number): void {
  if (!amount) return;
  run('UPDATE users SET coins = MAX(0, coins + ?) WHERE id = ?', amount, userId);
}

export function spendCoins(userId: number, amount: number): number {
  const r = run('UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?', amount, userId, amount);
  if (r.changes === 0) throw bad('no_coins', 'سکهٔ کافی نداری');
  return mustUser(userId).coins;
}

export function addXp(userId: number, amount: number): void {
  if (amount <= 0) return;
  run('UPDATE users SET xp = xp + ? WHERE id = ?', amount, userId);
  run(
    `INSERT INTO weekly (week, user_id, points) VALUES (?, ?, ?)
     ON CONFLICT (week, user_id) DO UPDATE SET points = points + excluded.points`,
    tehranWeek(),
    userId,
    amount,
  );
}

// ───────── مدال‌ها ─────────
/** دادن یک مدال (اگر قبلاً نگرفته باشد). true یعنی تازه گرفته شد. */
export function grant(userId: number, key: string): boolean {
  const def = ACHIEVEMENTS.find((a) => a.key === key);
  if (!def) return false;
  const r = run('INSERT OR IGNORE INTO achievements (user_id, key, at) VALUES (?, ?, ?)', userId, key, now());
  if (r.changes === 0) return false;
  addCoins(userId, def.reward);
  return true;
}

/** بررسی مدال‌هایی که به آمار کلی بازیکن وابسته‌اند */
export function checkStatAchievements(userId: number): void {
  const u = getUser(userId);
  if (!u || u.is_bot) return;
  const level = levelInfo(u.xp).level;
  const rules: [string, boolean][] = [
    ['first_win', u.wins >= 1],
    ['wins_10', u.wins >= 10],
    ['wins_50', u.wins >= 50],
    ['wins_100', u.wins >= 100],
    ['streak_3', u.best_win_streak >= 3],
    ['streak_5', u.best_win_streak >= 5],
    ['streak_10', u.best_win_streak >= 10],
    ['correct_100', u.correct >= 100],
    ['correct_500', u.correct >= 500],
    ['correct_1000', u.correct >= 1000],
    ['bonus_7', u.bonus_streak >= 7],
    ['survival_20', u.survival_best >= 20],
    ['survival_50', u.survival_best >= 50],
    ['level_5', level >= 5],
    ['level_10', level >= 10],
    ['level_20', level >= 20],
  ];
  for (const [key, ok] of rules) if (ok) grant(userId, key);
}

/** مدال‌های دیده‌نشده را برمی‌گرداند و دیده‌شده علامت می‌زند */
export function takeNewAchievements(userId: number): string[] {
  const rows = all<{ key: string }>('SELECT key FROM achievements WHERE user_id = ? AND seen = 0 ORDER BY at', userId);
  if (rows.length) run('UPDATE achievements SET seen = 1 WHERE user_id = ? AND seen = 0', userId);
  return rows.map((r) => r.key);
}

// ───────── جایزهٔ روزانه ─────────
export function claimDailyBonus(userId: number): { amount: number; streak: number; day: number } {
  return tx(() => {
    const u = mustUser(userId);
    const state = bonusState(u);
    if (!state.available) throw bad('bonus_taken', 'جایزهٔ امروز را گرفته‌ای');
    run(
      'UPDATE users SET bonus_day = ?, bonus_streak = ?, coins = coins + ? WHERE id = ?',
      tehranDay(),
      state.streak,
      state.amount,
      userId,
    );
    checkStatAchievements(userId);
    return { amount: state.amount, streak: state.streak, day: state.day };
  });
}

// ───────── دعوت دوستان ─────────
/** بعد از اولین بازی کاملِ دعوت‌شده، به هر دو طرف جایزه می‌دهد. شناسهٔ دعوت‌کننده را برمی‌گرداند. */
export function payReferral(userId: number): number | null {
  const u = getUser(userId);
  if (!u || !u.referred_by || u.referral_paid) return null;
  const inviter = getUser(u.referred_by);
  run('UPDATE users SET referral_paid = 1 WHERE id = ?', userId);
  if (!inviter) return null;
  addCoins(userId, REWARDS.referralInvitee);
  addCoins(inviter.id, REWARDS.referralInviter);
  grant(inviter.id, 'inviter');
  return inviter.id;
}

export function rankOf(u: UserRow): number {
  const row = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM users
     WHERE is_bot = 0 AND (trophies > ? OR (trophies = ? AND xp > ?))`,
    u.trophies,
    u.trophies,
    u.xp,
  );
  return (row?.c ?? 0) + 1;
}
