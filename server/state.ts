import { config, hasHttpsWebApp } from './config.ts';

/** وضعیت زمان اجرا که بعد از اتصال ربات پر می‌شود */
export const runtime = {
  botUsername: '',
  botReady: false,
};

/** لینک قابل اشتراک‌گذاری در تلگرام */
export function shareLink(startParam: string): string | null {
  if (!runtime.botUsername) return null;
  const key = config.mainMiniApp ? 'startapp' : 'start';
  return `https://t.me/${runtime.botUsername}?${key}=${encodeURIComponent(startParam)}`;
}

/** آدرس مینی‌اپ برای دکمه‌های web_app (فقط HTTPS پذیرفته می‌شود) */
export function webAppUrl(startParam?: string): string | null {
  if (!hasHttpsWebApp()) return null;
  return startParam
    ? `${config.webAppUrl}/?startapp=${encodeURIComponent(startParam)}`
    : `${config.webAppUrl}/`;
}
