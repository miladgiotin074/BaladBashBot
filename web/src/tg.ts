// پوشش سبک روی Telegram WebApp SDK.
// اگر اسکریپت تلگرام بارگذاری نشود (مثلاً telegram.org در دسترس نباشد) بازی همچنان با initData
// موجود در آدرس صفحه کار می‌کند؛ فقط امکاناتی مثل لرزش و دکمهٔ بازگشت تلگرام غیرفعال می‌شوند.

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  version: string;
  platform: string;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  disableVerticalSwipes?(): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  openInvoice(url: string, callback?: (status: string) => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
const BG = '#0d1030';

// آدرس را همان ابتدا نگه می‌داریم چون ممکن است بعداً تغییر کند
const initialHash = window.location.hash.slice(1);
const initialQuery = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(initialHash);

let wa: TgWebApp | null = null;

function loadSdk(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (window.Telegram?.WebApp) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
    window.setTimeout(resolve, timeoutMs);
  });
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // نسخه‌های قدیمی تلگرام بعضی متدها را ندارند
  }
}

export async function initTelegram(): Promise<void> {
  // در حالت ورود آزمایشی (مرورگر معمولی) منتظر اسکریپت تلگرام نمی‌مانیم
  const hasTelegramParams = hashParams.has('tgWebAppData') || hashParams.has('tgWebAppVersion');
  if (!hasTelegramParams && getDevAuth()) return;
  await loadSdk(3500);
  const app = window.Telegram?.WebApp;
  if (!app || !app.initData) return;
  wa = app;
  safe(() => app.ready());
  safe(() => app.expand());
  safe(() => app.setHeaderColor(BG));
  safe(() => app.setBackgroundColor(BG));
  safe(() => app.setBottomBarColor?.(BG));
  safe(() => app.disableVerticalSwipes?.());
}

export function inTelegram(): boolean {
  return wa !== null;
}

/** رشتهٔ initData برای احراز هویت در سرور */
export function getInitData(): string {
  if (wa?.initData) return wa.initData;
  return hashParams.get('tgWebAppData') ?? '';
}

/** پارامتر شروع (مثلاً duel_abc یا match_12) */
export function getStartParam(): string {
  const fromSdk = wa?.initDataUnsafe?.start_param;
  if (fromSdk) return fromSdk;
  const fromQuery = initialQuery.get('startapp') ?? initialQuery.get('tgWebAppStartParam');
  if (fromQuery) return fromQuery;
  const fromHash = hashParams.get('tgWebAppStartParam');
  if (fromHash) return fromHash;
  return new URLSearchParams(getInitData()).get('start_param') ?? '';
}

/** ورود آزمایشی در مرورگر: ‎?dev=123&name=علی (فقط وقتی سرور DEV_AUTH=true باشد) */
export function getDevAuth(): string | null {
  const id = initialQuery.get('dev');
  if (!id || !/^\d+$/.test(id)) return null;
  return `${id}:${encodeURIComponent(initialQuery.get('name') ?? '')}`;
}

type Haptic = 'tap' | 'select' | 'success' | 'error' | 'warning';

export function haptic(kind: Haptic): void {
  const app = wa;
  if (!app || !app.isVersionAtLeast('6.1')) return;
  safe(() => {
    if (kind === 'tap') app.HapticFeedback.impactOccurred('light');
    else if (kind === 'select') app.HapticFeedback.selectionChanged();
    else app.HapticFeedback.notificationOccurred(kind);
  });
}

export function setClosingConfirmation(on: boolean): void {
  const app = wa;
  if (!app) return;
  safe(() => (on ? app.enableClosingConfirmation() : app.disableClosingConfirmation()));
}

/** دکمهٔ بازگشت تلگرام؛ تابع برگشتی برای پاک کردن است */
export function bindBackButton(visible: boolean, onBack: () => void): () => void {
  const app = wa;
  if (!app || !app.isVersionAtLeast('6.1')) return () => undefined;
  if (!visible) {
    safe(() => app.BackButton.hide());
    return () => undefined;
  }
  safe(() => {
    app.BackButton.onClick(onBack);
    app.BackButton.show();
  });
  return () => safe(() => app.BackButton.offClick(onBack));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** اشتراک‌گذاری یک لینک در تلگرام. اگر ممکن نبود لینک کپی می‌شود و false برمی‌گردد. */
export async function shareLink(url: string, text: string): Promise<boolean> {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (wa) {
    const app = wa;
    let opened = true;
    try {
      app.openTelegramLink(shareUrl);
    } catch {
      opened = false;
    }
    if (opened) return true;
  }
  await copyText(url);
  return false;
}

export function openInvoice(link: string): Promise<string> {
  return new Promise((resolve) => {
    const app = wa;
    if (!app || !app.isVersionAtLeast('6.1')) {
      resolve('unsupported');
      return;
    }
    try {
      app.openInvoice(link, (status) => resolve(status));
    } catch {
      resolve('failed');
    }
  });
}
