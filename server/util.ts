import { randomInt } from 'node:crypto';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const bad = (code: string, message: string): ApiError => new ApiError(400, code, message);
export const notFound = (message = 'پیدا نشد'): ApiError => new ApiError(404, 'not_found', message);
export const forbidden = (message = 'اجازهٔ این کار را نداری'): ApiError =>
  new ApiError(403, 'forbidden', message);

// ───────── زمان (به وقت تهران) ─────────
const TZ = 'Asia/Tehran';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** تاریخ امروز به وقت تهران: YYYY-MM-DD */
export function tehranDay(ts: number = Date.now()): string {
  return dayFmt.format(new Date(ts));
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** کلید هفته: تاریخ شنبهٔ همان هفته */
export function tehranWeek(ts: number = Date.now()): string {
  const dow = DOW.indexOf(dowFmt.format(new Date(ts)));
  const sinceSaturday = (dow + 1) % 7;
  return shiftDay(tehranDay(ts), -sinceSaturday);
}

// ───────── تصادفی ─────────
export function randInt(min: number, max: number): number {
  return randomInt(min, max + 1);
}

export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function sample<T>(input: readonly T[], n: number): T[] {
  return shuffle(input).slice(0, n);
}

export function pick<T>(input: readonly T[]): T {
  return input[randomInt(0, input.length)]!;
}

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeCode(len = 8): string {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return out;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function fa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]!);
}

/** پاک‌سازی متن ورودی کاربر */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
