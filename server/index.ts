import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { startBot, stopBot } from './bot.ts';
import { config, ROOT } from './config.ts';
import { db } from './db.ts';
import { seedBots } from './game/bots.ts';
import { tickBots, tickTimeouts } from './game/duel.ts';
import { seedQuestions } from './game/questions.ts';
import { apiRouter } from './routes.ts';
import { ApiError } from './util.ts';

// ───────── دادهٔ اولیه ─────────
const seeded = seedQuestions();
seedBots();
console.log(`[db] بانک سوالات: ${seeded.total} سوال تأییدشده${seeded.added ? ` (${seeded.added} سوال جدید اضافه شد)` : ''}`);

// ───────── سرور وب ─────────
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', express.json({ limit: '20kb' }), (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/api', apiRouter());
app.use('/api', (_req, _res, next) => {
  next(new ApiError(404, 'not_found', 'این مسیر وجود ندارد'));
});

const webDir = resolve(ROOT, 'dist/web');
const indexFile = resolve(webDir, 'index.html');

app.use(
  express.static(webDir, {
    index: false,
    setHeaders(res, filePath) {
      // فایل‌های داخل assets نام هش‌دار دارند و می‌توانند برای همیشه کش شوند
      res.setHeader(
        'Cache-Control',
        filePath.includes(`${resolve(webDir, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  }),
);

app.use((req, res, next) => {
  if (req.method !== 'GET') {
    next();
    return;
  }
  if (!existsSync(indexFile)) {
    res
      .status(503)
      .type('html')
      .send('<meta charset="utf-8"><p dir="rtl">مینی‌اپ هنوز ساخته نشده است. دستور <code>npm run build</code> را اجرا کنید.</p>');
    return;
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(indexFile);
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  const status = (err as { status?: number } | null)?.status;
  if (status === 400 || status === 413) {
    res.status(status).json({ error: { code: 'bad_request', message: 'درخواست نامعتبر است' } });
    return;
  }
  console.error('[http]', err);
  res.status(500).json({ error: { code: 'server_error', message: 'خطایی در سرور رخ داد. دوباره امتحان کن.' } });
});

const onListen = () => {
  const where = config.host ? `${config.host}:${config.port}` : `localhost:${config.port}`;
  console.log(`[http] سرور روی http://${where} بالا آمد.`);
  if (config.devAuth) {
    console.warn('[http] ⚠️  DEV_AUTH فعال است: ورود بدون تلگرام با ?dev=1 ممکن است. در محیط واقعی خاموشش کنید!');
  }
};
const server = config.host ? app.listen(config.port, config.host, onListen) : app.listen(config.port, onListen);

// ───────── کارهای دوره‌ای ─────────
const botTimer = setInterval(tickBots, 3000);
const timeoutTimer = setInterval(tickTimeouts, 60_000);

void startBot();

// ───────── خاموش شدن تمیز ─────────
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  clearInterval(botTimer);
  clearInterval(timeoutTimer);
  await stopBot();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
