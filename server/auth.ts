import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.ts';
import type { UserRow } from './db.ts';
import { referrerFrom, upsertUser } from './users.ts';
import type { TgUser } from './users.ts';
import { ApiError } from './util.ts';

/**
 * اعتبارسنجی initData مینی‌اپ طبق مستندات تلگرام:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string): { user: TgUser; startParam: string | null } | null {
  if (!config.botToken || !initData || initData.length > 8192) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheck = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheck).digest();
  const given = Buffer.from(hash, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > config.initDataMaxAgeSec) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as TgUser;
    if (!user || typeof user.id !== 'number' || user.id <= 0) return null;
    return { user, startParam: params.get('start_param') };
  } catch {
    return null;
  }
}

/** ورود آزمایشی برای توسعهٔ محلی: «dev <id>:<name>» — فقط وقتی DEV_AUTH=true و بدون پروکسی */
function verifyDev(req: Request, value: string): TgUser | null {
  if (!config.devAuth) return null;
  if (req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']) return null;
  const [idPart, namePart = ''] = value.split(':');
  const id = Number(idPart);
  if (!Number.isInteger(id) || id <= 0 || id > 1e12) return null;
  let name = '';
  try {
    name = decodeURIComponent(namePart);
  } catch {
    name = '';
  }
  return { id, first_name: name || `بازیکن ${id}` };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  let tg: TgUser | null = null;
  let startParam: string | null = null;

  if (header.startsWith('tma ')) {
    const verified = verifyInitData(header.slice(4));
    if (verified) {
      tg = verified.user;
      startParam = verified.startParam;
    }
  } else if (header.startsWith('dev ')) {
    tg = verifyDev(req, header.slice(4));
  }

  if (!tg) {
    next(new ApiError(401, 'unauthorized', 'ورود نامعتبر است. بازی را از داخل تلگرام باز کن.'));
    return;
  }
  res.locals.user = upsertUser(tg, referrerFrom(startParam)).user;
  next();
}

export function currentUser(res: Response): UserRow {
  return res.locals.user as UserRow;
}

// ───────── محدودیت تعداد درخواست ─────────
const WINDOW_MS = 10_000;
const MAX_REQUESTS = 90;
const buckets = new Map<number, { start: number; count: number }>();

setInterval(() => {
  const limit = Date.now() - WINDOW_MS;
  for (const [id, b] of buckets) if (b.start < limit) buckets.delete(id);
}, 60_000).unref();

export function rateLimit(_req: Request, res: Response, next: NextFunction): void {
  const id = currentUser(res).id;
  const t = Date.now();
  const b = buckets.get(id);
  if (!b || t - b.start > WINDOW_MS) {
    buckets.set(id, { start: t, count: 1 });
  } else if (++b.count > MAX_REQUESTS) {
    next(new ApiError(429, 'slow_down', 'یه کم آروم‌تر! چند ثانیه صبر کن.'));
    return;
  }
  next();
}
