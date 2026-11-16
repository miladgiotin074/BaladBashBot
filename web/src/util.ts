const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** تبدیل رقم‌ها به فارسی */
export function fa(value: number | string): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d);
}

/** عدد با جداکنندهٔ هزارگان و رقم فارسی */
export function num(value: number): string {
  return fa(Math.round(value).toLocaleString('en-US')).replace(/,/g, '٬');
}

export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** «۳ ساعت» ، «۱۲ دقیقه» */
export function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${fa(minutes)} دقیقه`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${fa(hours)} ساعت`;
  return `${fa(Math.round(hours / 24))} روز`;
}

export function ago(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'همین الان';
  return `${duration(diff)} پیش`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ───────── تنظیمات محلی ─────────
export function loadSetting(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(`bb:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveSetting(key: string, value: string): void {
  try {
    window.localStorage.setItem(`bb:${key}`, value);
  } catch {
    // در برخی وب‌ویوها ذخیره‌سازی در دسترس نیست
  }
}
