import { START_COINS } from '../shared/constants.ts';
import { getUser, mustUser, now, run, tx } from './db.ts';
import type { UserRow } from './db.ts';
import { cleanText } from './util.ts';

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/** ساخت یا به‌روزرسانی کاربر از روی اطلاعات تلگرام */
export function upsertUser(tg: TgUser, referrer: number | null = null): { user: UserRow; created: boolean } {
  return tx(() => {
    const firstName = cleanText(tg.first_name, 64) || 'بازیکن';
    const lastName = cleanText(tg.last_name, 64) || null;
    const username = cleanText(tg.username, 64) || null;
    const photo = typeof tg.photo_url === 'string' && tg.photo_url.startsWith('https://') ? tg.photo_url : null;
    const existing = getUser(tg.id);

    if (existing) {
      run(
        `UPDATE users SET first_name = ?, last_name = ?, username = ?,
                          photo_url = COALESCE(?, photo_url), last_seen = ?
         WHERE id = ?`,
        firstName,
        lastName,
        username,
        photo,
        now(),
        tg.id,
      );
      return { user: mustUser(tg.id), created: false };
    }

    let referredBy: number | null = null;
    if (referrer && referrer !== tg.id) {
      const inviter = getUser(referrer);
      if (inviter && !inviter.is_bot) referredBy = inviter.id;
    }
    run(
      `INSERT INTO users (id, first_name, last_name, username, photo_url, coins, referred_by, created_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tg.id,
      firstName,
      lastName,
      username,
      photo,
      START_COINS,
      referredBy,
      now(),
      now(),
    );
    return { user: mustUser(tg.id), created: true };
  });
}

/** استخراج شناسهٔ دعوت‌کننده از پارامتر شروع (ref_123) */
export function referrerFrom(startParam: string | null | undefined): number | null {
  const m = /^ref_(\d{1,16})$/.exec(startParam ?? '');
  return m ? Number(m[1]) : null;
}
