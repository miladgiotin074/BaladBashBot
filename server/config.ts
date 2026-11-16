import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const envFile = resolve(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

function num(name: string, fallback: number): number {
  const v = Number(env[name]);
  return Number.isFinite(v) && env[name] !== undefined && env[name] !== '' ? v : fallback;
}

function bool(name: string): boolean {
  return (env[name] ?? '').trim().toLowerCase() === 'true';
}

export const config = {
  port: num('PORT', 3000),
  /** اگر خالی باشد روی همهٔ رابط‌ها گوش می‌دهد. run.sh مقدار 127.0.0.1 می‌گذارد. */
  host: (env.HOST ?? '').trim(),
  botToken: (env.BOT_TOKEN ?? '').trim(),
  webAppUrl: (env.WEBAPP_URL ?? '').trim().replace(/\/+$/, ''),
  adminIds: (env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0),
  mainMiniApp: bool('MAIN_MINIAPP'),
  starsShop: bool('STARS_SHOP'),
  botJoinDelaySec: num('BOT_JOIN_DELAY_SEC', 20),
  turnTimeoutHours: num('TURN_TIMEOUT_HOURS', 24),
  dbPath: resolve(ROOT, env.DB_PATH ?? './data/baladbash.db'),
  proxyUrl: (env.PROXY_URL ?? '').trim(),
  apiRoot: (env.TELEGRAM_API_ROOT ?? '').trim(),
  devAuth: bool('DEV_AUTH'),
  /** اعتبار initData تلگرام (ثانیه) */
  initDataMaxAgeSec: num('INIT_DATA_MAX_AGE_SEC', 24 * 3600),
};

export function isAdmin(userId: number): boolean {
  return config.adminIds.includes(userId);
}

export const hasHttpsWebApp = (): boolean => config.webAppUrl.startsWith('https://');
