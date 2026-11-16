// ثابت‌های مشترک بین سرور و مینی‌اپ

export const CATEGORIES = [
  { id: 'general', title: 'اطلاعات عمومی', emoji: '🧠', color: '#8b6cff' },
  { id: 'history', title: 'تاریخ', emoji: '🏛️', color: '#d19a4a' },
  { id: 'geography', title: 'جغرافیا', emoji: '🌍', color: '#2aa7e0' },
  { id: 'science', title: 'علم و دانش', emoji: '🔬', color: '#19c6b5' },
  { id: 'literature', title: 'ادبیات', emoji: '📚', color: '#e0567a' },
  { id: 'sports', title: 'ورزش', emoji: '⚽', color: '#3ddc84' },
  { id: 'art', title: 'سینما و هنر', emoji: '🎬', color: '#f2618c' },
  { id: 'tech', title: 'فناوری', emoji: '💻', color: '#5b8def' },
  { id: 'nature', title: 'طبیعت و حیوانات', emoji: '🦁', color: '#8bc34a' },
  { id: 'math', title: 'ریاضی و هوش', emoji: '🧮', color: '#ffb627' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS: string[] = CATEGORIES.map((c) => c.id);

export function categoryOf(id: string | null | undefined) {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

// ───────── قوانین بازی ─────────
export const ROUNDS = 5;
export const QUESTIONS_PER_ROUND = 3;
export const TOTAL_QUESTIONS = ROUNDS * QUESTIONS_PER_ROUND;
export const CATEGORY_CHOICES = 3;

export const DUEL_TIME_MS = 15_000;
export const DAILY_TIME_MS = 15_000;
export const SURVIVAL_TIME_MS = 12_000;
export const EXTRA_TIME_MS = 10_000;

export const DAILY_QUESTIONS = 10;
export const SURVIVAL_LIVES = 3;
export const MAX_ACTIVE_MATCHES = 10;

export const START_COINS = 200;

export type LifelineId = 'fifty' | 'time' | 'audience';

export const LIFELINES: Record<LifelineId, { title: string; emoji: string; cost: number }> = {
  fifty: { title: 'حذف دو گزینه', emoji: '✂️', cost: 40 },
  time: { title: 'زمان بیشتر', emoji: '⏳', cost: 25 },
  audience: { title: 'نظر بقیه', emoji: '📊', cost: 30 },
};

// ───────── جایزه‌ها ─────────
export const REWARDS = {
  win: { coins: 40, xp: 60, trophies: 25 },
  draw: { coins: 15, xp: 30, trophies: 5 },
  loss: { coins: 5, xp: 10, trophies: -12 },
  xpPerCorrect: 8,
  perfectBonusCoins: 30,
  dailyCoinPerCorrect: 6,
  dailyXpPerCorrect: 12,
  dailyPerfectBonus: 50,
  survivalCoinPerCorrect: 2,
  survivalXpPerCorrect: 4,
  referralInviter: 150,
  referralInvitee: 100,
  questionApproved: 60,
};

// جایزهٔ ورود روزانه (چرخهٔ ۷ روزه)
export const DAILY_BONUS = [20, 30, 40, 50, 60, 80, 150];

export const AVATARS = [
  '🦊', '🐼', '🦁', '🐯', '🐨', '🐸', '🦉', '🐙', '🦄', '🐲',
  '🐧', '🦋', '🐬', '🦅', '🐺', '🦈', '🐝', '🦜', '🐢', '🦩',
];

export const AVATAR_COLORS = [
  '#ff8a3d', '#5b8def', '#ffb627', '#f2618c', '#19c6b5',
  '#3ddc84', '#8b6cff', '#e0567a', '#2aa7e0', '#d19a4a',
];

// ───────── سطح و لقب ─────────
export function xpNeedFor(level: number): number {
  return 80 + 40 * level;
}

export function levelInfo(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= xpNeedFor(level)) {
    rest -= xpNeedFor(level);
    level++;
  }
  return { level, into: rest, need: xpNeedFor(level) };
}

export function levelTitle(level: number): string {
  if (level >= 30) return 'بلدِ بلدها';
  if (level >= 20) return 'علّامه';
  if (level >= 15) return 'استاد';
  if (level >= 10) return 'دانا';
  if (level >= 6) return 'اهل مطالعه';
  if (level >= 3) return 'کنجکاو';
  return 'تازه‌وارد';
}

// ───────── مدال‌ها ─────────
export interface AchievementDef {
  key: string;
  title: string;
  desc: string;
  emoji: string;
  reward: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_win', title: 'اولین برد', desc: 'اولین دوئلت را ببر', emoji: '🥇', reward: 30 },
  { key: 'wins_10', title: 'ده‌تایی', desc: '۱۰ دوئل را ببر', emoji: '🏅', reward: 60 },
  { key: 'wins_50', title: 'حریف‌شکن', desc: '۵۰ دوئل را ببر', emoji: '🏆', reward: 150 },
  { key: 'wins_100', title: 'قهرمان', desc: '۱۰۰ دوئل را ببر', emoji: '👑', reward: 300 },
  { key: 'streak_3', title: 'روی دور', desc: '۳ برد پشت سر هم', emoji: '🔥', reward: 40 },
  { key: 'streak_5', title: 'توقف‌ناپذیر', desc: '۵ برد پشت سر هم', emoji: '⚡', reward: 80 },
  { key: 'streak_10', title: 'شکست‌ناپذیر', desc: '۱۰ برد پشت سر هم', emoji: '🌪️', reward: 200 },
  { key: 'perfect_match', title: 'بی‌نقص', desc: 'یک دوئل را با ۱۵ پاسخ درست تمام کن', emoji: '💎', reward: 100 },
  { key: 'correct_100', title: 'صدتایی', desc: '۱۰۰ پاسخ درست', emoji: '✅', reward: 50 },
  { key: 'correct_500', title: 'حافظهٔ فیل', desc: '۵۰۰ پاسخ درست', emoji: '🐘', reward: 150 },
  { key: 'correct_1000', title: 'دانشنامهٔ متحرک', desc: '۱۰۰۰ پاسخ درست', emoji: '📖', reward: 300 },
  { key: 'bonus_7', title: 'همیشه حاضر', desc: '۷ روز پیاپی جایزهٔ روزانه بگیر', emoji: '📅', reward: 70 },
  { key: 'daily_perfect', title: 'روزِ طلایی', desc: 'چالش روزانه را ۱۰ از ۱۰ بزن', emoji: '🌟', reward: 80 },
  { key: 'survival_20', title: 'جان‌سخت', desc: 'در حالت بقا به ۲۰ برس', emoji: '🛡️', reward: 60 },
  { key: 'survival_50', title: 'افسانه‌ای', desc: 'در حالت بقا به ۵۰ برس', emoji: '🗿', reward: 200 },
  { key: 'inviter', title: 'رفیق‌باز', desc: 'یک دوست را به بازی دعوت کن', emoji: '🤝', reward: 40 },
  { key: 'author', title: 'طراح سوال', desc: 'یک سوالِ تو تأیید شود', emoji: '✍️', reward: 50 },
  { key: 'level_5', title: 'سطح ۵', desc: 'به سطح ۵ برس', emoji: '🚀', reward: 50 },
  { key: 'level_10', title: 'سطح ۱۰', desc: 'به سطح ۱۰ برس', emoji: '🛰️', reward: 120 },
  { key: 'level_20', title: 'سطح ۲۰', desc: 'به سطح ۲۰ برس', emoji: '🌌', reward: 300 },
];

// ───────── فروشگاه ─────────
export const COIN_PACKS = [
  { id: 'small', title: 'کیسهٔ سکه', coins: 500, stars: 25, emoji: '👝' },
  { id: 'medium', title: 'صندوقچهٔ سکه', coins: 1500, stars: 60, emoji: '🧰' },
  { id: 'large', title: 'گنجِ سکه', coins: 5000, stars: 150, emoji: '💰' },
] as const;

export const QUESTION_LIMITS = { textMin: 10, textMax: 200, optionMax: 60 };
