// حریف‌های تمرینی: وقتی حریف واقعی پیدا نشود، یکی از این ربات‌ها وارد بازی می‌شود.
import { AVATARS } from '../../shared/constants.ts';
import { all, now, run, tx } from '../db.ts';
import type { UserRow } from '../db.ts';
import { pick } from '../util.ts';

const BOT_NAMES = [
  'آرش', 'سارا', 'نیما', 'مریم', 'کیان', 'نگار', 'پارسا', 'الناز', 'سینا', 'هستی',
  'بردیا', 'ترانه', 'مانی', 'یاسمن', 'آرمان', 'شیدا', 'کاوه', 'رها', 'امید', 'ملیکا',
];

export function seedBots(): void {
  tx(() => {
    BOT_NAMES.forEach((name, i) => {
      const id = -(i + 1);
      const skill = 0.45 + ((i * 7) % 8) * 0.05; // بین ۰٫۴۵ تا ۰٫۸
      const xp = 150 + ((i * 37) % 11) * 260;
      run(
        `INSERT OR IGNORE INTO users
           (id, first_name, avatar, is_bot, bot_skill, xp, coins, notify, can_notify, created_at, last_seen)
         VALUES (?, ?, ?, 1, ?, ?, 0, 0, 0, ?, ?)`,
        id,
        name,
        (i % AVATARS.length) + 1,
        skill,
        xp,
        now(),
        now(),
      );
    });
  });
}

export function randomBot(exclude: number[] = []): UserRow {
  const bots = all<UserRow>('SELECT * FROM users WHERE is_bot = 1');
  const pool = bots.filter((b) => !exclude.includes(b.id));
  return pick(pool.length ? pool : bots);
}
