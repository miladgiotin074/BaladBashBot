import { Bot, GrammyError, InlineKeyboard } from 'grammy';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { COIN_PACKS, REWARDS, ROUNDS, QUESTIONS_PER_ROUND, levelInfo, levelTitle } from '../shared/constants.ts';
import { config, isAdmin } from './config.ts';
import { all, get, getUser, now, run, tx } from './db.ts';
import type { MatchRow, UserRow } from './db.ts';
import { addCoins, displayName, rankOf } from './game/economy.ts';
import { runtime, shareLink, webAppUrl } from './state.ts';
import { referrerFrom, upsertUser } from './users.ts';
import { escapeHtml, fa } from './util.ts';

let bot: Bot | null = null;

function clientOptions(): Record<string, unknown> {
  const client: Record<string, unknown> = {};
  if (config.apiRoot) client.apiRoot = config.apiRoot;
  if (config.proxyUrl) {
    const agent = config.proxyUrl.startsWith('socks')
      ? new SocksProxyAgent(config.proxyUrl)
      : new HttpsProxyAgent(config.proxyUrl);
    client.baseFetchConfig = { agent, compress: true };
  }
  return client;
}

function playKeyboard(text = '🎮 شروع بازی', startParam?: string): InlineKeyboard | undefined {
  const url = webAppUrl(startParam);
  return url ? new InlineKeyboard().webApp(text, url) : undefined;
}

function inviteShareUrl(userId: number): string | null {
  const link = shareLink(`ref_${userId}`);
  if (!link) return null;
  const text = 'بیا توی «بلد باش» دوئل اطلاعات عمومی بدیم! بلدی؟ ثابت کن 😎';
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

const NOT_READY = '\n\n⚠️ مینی‌اپ هنوز راه‌اندازی نشده است. (مدیر ربات باید WEBAPP_URL را تنظیم کند.)';

function welcomeText(name: string): string {
  return (
    `سلام ${escapeHtml(name)} 👋\n` +
    'به <b>بلد باش</b> خوش اومدی!\n\n' +
    '⚔️ با دوستات یا حریف شانسی دوئل اطلاعات عمومی بده\n' +
    '📅 هر روز چالش روزانه رو بزن\n' +
    '🛡 توی حالت بقا رکورد بزن\n' +
    '🏆 و توی رده‌بندی بالا برو\n\n' +
    '<b>بلدی؟ ثابت کن!</b> 👇'
  );
}

const HELP_TEXT =
  '<b>راهنمای بلد باش</b>\n\n' +
  `⚔️ <b>دوئل:</b> هر بازی ${fa(ROUNDS)} دور و هر دور ${fa(QUESTIONS_PER_ROUND)} سوال دارد. ` +
  'در هر دور یکی از دو بازیکن موضوع را انتخاب می‌کند و هر دو به همان سوال‌ها جواب می‌دهند. ' +
  'هر کس جواب درست بیشتری بدهد برنده است.\n\n' +
  '⏱ برای هر سوال زمان محدودی داری. با سکه می‌توانی از کمک‌ها (حذف دو گزینه، زمان بیشتر، نظر بقیه) استفاده کنی.\n\n' +
  '📅 <b>چالش روزانه:</b> هر روز ۱۰ سوال یکسان برای همه؛ فقط یک بار فرصت داری.\n\n' +
  '🛡 <b>بقا:</b> تا وقتی جان داری جواب بده و رکورد بزن.\n\n' +
  '🪙 با برد، جایزهٔ روزانه، مدال‌ها و دعوت دوستان سکه بگیر.\n\n' +
  'دستورها:\n/start شروع\n/profile پروفایل من\n/top برترین‌ها\n/invite دعوت دوستان\n/help راهنما';

function profileText(u: UserRow): string {
  const lv = levelInfo(u.xp);
  const accuracy = u.answered ? Math.round((u.correct / u.answered) * 100) : 0;
  return (
    `👤 <b>${escapeHtml(displayName(u))}</b> — ${levelTitle(lv.level)}\n\n` +
    `⭐️ سطح: ${fa(lv.level)}\n` +
    `🏆 جام: ${fa(u.trophies)} (رتبهٔ ${fa(rankOf(u))})\n` +
    `🪙 سکه: ${fa(u.coins)}\n\n` +
    `⚔️ دوئل‌ها: ${fa(u.games)} | برد ${fa(u.wins)} | مساوی ${fa(u.draws)} | باخت ${fa(u.losses)}\n` +
    `🎯 دقت پاسخ‌ها: ${fa(accuracy)}٪\n` +
    `🔥 بهترین برد پیاپی: ${fa(u.best_win_streak)}\n` +
    `🛡 رکورد بقا: ${fa(u.survival_best)}`
  );
}

function register(b: Bot): void {
  b.command('start', async (ctx) => {
    if (!ctx.from || ctx.chat.type !== 'private') return;
    const payload = (ctx.match ?? '').trim();
    const { user } = upsertUser(ctx.from, referrerFrom(payload));
    run('UPDATE users SET can_notify = 1 WHERE id = ?', user.id);

    if (payload.startsWith('duel_')) {
      const code = payload.slice(5);
      const m = get<MatchRow>('SELECT * FROM matches WHERE code = ?', code);
      const host = m ? getUser(m.p1) : undefined;
      if (m && host && m.status === 'waiting' && m.p1 !== user.id && m.p2 === null) {
        const kb = playKeyboard('⚔️ قبول دعوت', `duel_${code}`);
        await ctx.reply(
          `⚔️ <b>${escapeHtml(displayName(host))}</b> تو را به دوئل دعوت کرده!\nآماده‌ای؟` + (kb ? '' : NOT_READY),
          { parse_mode: 'HTML', reply_markup: kb },
        );
        return;
      }
    }

    const kb = playKeyboard();
    const share = inviteShareUrl(user.id);
    if (kb && share) kb.row().url('👥 دعوت دوستان', share);
    await ctx.reply(welcomeText(displayName(user)) + (kb ? '' : NOT_READY), {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  });

  b.command('help', (ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'HTML', reply_markup: playKeyboard() }));

  b.command('profile', async (ctx) => {
    if (!ctx.from) return;
    const { user } = upsertUser(ctx.from);
    await ctx.reply(profileText(user), { parse_mode: 'HTML', reply_markup: playKeyboard('🎮 بازی کن') });
  });

  b.command('top', async (ctx) => {
    const rows = all<UserRow>(
      'SELECT * FROM users WHERE is_bot = 0 ORDER BY trophies DESC, xp DESC LIMIT 10',
    );
    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map(
      (u, i) => `${medals[i] ?? `${fa(i + 1)}.`} ${escapeHtml(displayName(u))} — ${fa(u.trophies)} 🏆`,
    );
    await ctx.reply(`<b>برترین‌های بلد باش</b>\n\n${lines.join('\n') || 'هنوز کسی بازی نکرده!'}`, {
      parse_mode: 'HTML',
      reply_markup: playKeyboard('🏆 رده‌بندی کامل', 'leaderboard'),
    });
  });

  b.command('invite', async (ctx) => {
    if (!ctx.from) return;
    const link = shareLink(`ref_${ctx.from.id}`);
    const share = inviteShareUrl(ctx.from.id);
    await ctx.reply(
      '👥 <b>دعوت دوستان</b>\n\n' +
        `با هر دوستی که با لینک تو وارد شود و اولین دوئلش را تمام کند، ${fa(REWARDS.referralInviter)} سکه می‌گیری ` +
        `و دوستت هم ${fa(REWARDS.referralInvitee)} سکه هدیه می‌گیرد.\n\n` +
        `لینک تو:\n${link ?? '—'}`,
      {
        parse_mode: 'HTML',
        reply_markup: share ? new InlineKeyboard().url('📤 ارسال برای دوستان', share) : undefined,
      },
    );
  });

  b.command('stats', async (ctx) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) return;
    const c = (sql: string, ...p: number[]) => get<{ c: number }>(sql, ...p)?.c ?? 0;
    const dayAgo = now() - 24 * 3600_000;
    await ctx.reply(
      '<b>آمار ربات</b>\n\n' +
        `👥 کاربران: ${fa(c('SELECT COUNT(*) AS c FROM users WHERE is_bot = 0'))}\n` +
        `🟢 فعال ۲۴ ساعت اخیر: ${fa(c('SELECT COUNT(*) AS c FROM users WHERE is_bot = 0 AND last_seen > ?', dayAgo))}\n` +
        `⚔️ کل دوئل‌ها: ${fa(c('SELECT COUNT(*) AS c FROM matches'))}\n` +
        `▶️ دوئل‌های در جریان: ${fa(c("SELECT COUNT(*) AS c FROM matches WHERE status = 'active'"))}\n` +
        `❓ سوالات تأییدشده: ${fa(c("SELECT COUNT(*) AS c FROM questions WHERE status = 'approved'"))}\n` +
        `🕓 سوالات در انتظار: ${fa(c("SELECT COUNT(*) AS c FROM questions WHERE status = 'pending'"))}`,
      { parse_mode: 'HTML' },
    );
  });

  b.command('paysupport', (ctx) =>
    ctx.reply('برای پیگیری پرداخت‌ها، شناسهٔ پرداخت و توضیح مشکل را برای پشتیبانی ربات بفرستید.'),
  );

  // ───────── پرداخت با ستاره‌های تلگرام ─────────
  b.on('pre_checkout_query', async (ctx) => {
    const q = ctx.preCheckoutQuery;
    const parsed = parsePayload(q.invoice_payload);
    const ok =
      config.starsShop &&
      parsed !== null &&
      q.currency === 'XTR' &&
      q.total_amount === parsed.pack.stars &&
      parsed.userId === q.from.id;
    await ctx.answerPreCheckoutQuery(ok, ok ? undefined : { error_message: 'این خرید معتبر نیست.' });
  });

  b.on('message:successful_payment', async (ctx) => {
    const sp = ctx.message.successful_payment;
    const parsed = parsePayload(sp.invoice_payload);
    if (!parsed) return;
    const credited = tx(() => {
      const r = run(
        'INSERT OR IGNORE INTO payments (user_id, pack, stars, coins, charge_id, at) VALUES (?, ?, ?, ?, ?, ?)',
        parsed.userId,
        parsed.pack.id,
        sp.total_amount,
        parsed.pack.coins,
        sp.telegram_payment_charge_id,
        now(),
      );
      if (r.changes === 0) return false;
      addCoins(parsed.userId, parsed.pack.coins);
      return true;
    });
    if (credited) {
      await ctx.reply(`✅ ${fa(parsed.pack.coins)} سکه به حسابت اضافه شد. نوش جان!`, {
        reply_markup: playKeyboard('🎮 ادامهٔ بازی'),
      });
    }
  });

  // ───────── مسدود/آزاد شدن ربات توسط کاربر ─────────
  b.on('my_chat_member', (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const status = ctx.myChatMember.new_chat_member.status;
    run('UPDATE users SET can_notify = ? WHERE id = ?', status === 'kicked' ? 0 : 1, ctx.chat.id);
  });

  b.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await ctx.reply('برای بازی دکمهٔ زیر را بزن 👇\nراهنما: /help', { reply_markup: playKeyboard() });
  });

  b.catch((err) => {
    console.error('[bot] خطا در پردازش به‌روزرسانی:', err.error);
  });
}

function parsePayload(payload: string): { pack: (typeof COIN_PACKS)[number]; userId: number } | null {
  const m = /^coins:([a-z]+):(\d+)$/.exec(payload);
  if (!m) return null;
  const pack = COIN_PACKS.find((p) => p.id === m[1]);
  return pack ? { pack, userId: Number(m[2]) } : null;
}

/** ساخت لینک پرداخت ستاره‌ای برای یک بستهٔ سکه */
export async function createCoinInvoice(userId: number, packId: string): Promise<string | null> {
  const pack = COIN_PACKS.find((p) => p.id === packId);
  if (!bot || !runtime.botReady || !pack) return null;
  return bot.api.createInvoiceLink(
    `${pack.title} — ${fa(pack.coins)} سکه`,
    `${fa(pack.coins)} سکه برای استفاده در بازی «بلد باش»`,
    `coins:${pack.id}:${userId}`,
    '',
    'XTR',
    [{ label: pack.title, amount: pack.stars }],
  );
}

/** ارسال پیام به کاربر (در صورت امکان همراه با دکمهٔ باز کردن مینی‌اپ) */
export async function send(
  userId: number,
  text: string,
  button?: { text: string; startParam?: string },
): Promise<void> {
  if (!bot || !runtime.botReady || userId <= 0) return;
  try {
    await bot.api.sendMessage(userId, text, {
      parse_mode: 'HTML',
      reply_markup: button ? playKeyboard(button.text, button.startParam) : undefined,
    });
  } catch (err) {
    if (err instanceof GrammyError && (err.error_code === 403 || /chat not found/i.test(err.description))) {
      run('UPDATE users SET can_notify = 0 WHERE id = ?', userId);
    } else {
      console.error('[bot] ارسال پیام ناموفق بود:', err instanceof Error ? err.message : err);
    }
  }
}

export async function startBot(): Promise<void> {
  if (!config.botToken) {
    console.warn('[bot] BOT_TOKEN تنظیم نشده؛ ربات تلگرام اجرا نمی‌شود (فقط مینی‌اپ/وب در دسترس است).');
    return;
  }
  const b = new Bot(config.botToken, { client: clientOptions() });
  register(b);
  bot = b;

  const connect = async (): Promise<void> => {
    try {
      await b.init();
      runtime.botUsername = b.botInfo.username;
      runtime.botReady = true;

      await b.api.setMyCommands([
        { command: 'start', description: 'شروع بازی' },
        { command: 'profile', description: 'پروفایل من' },
        { command: 'top', description: 'برترین‌ها' },
        { command: 'invite', description: 'دعوت دوستان' },
        { command: 'help', description: 'راهنما' },
      ]);
      const url = webAppUrl();
      if (url) {
        await b.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'بلد باش', web_app: { url } } });
      } else {
        console.warn('[bot] WEBAPP_URL باید یک آدرس https باشد تا دکمه‌های مینی‌اپ فعال شوند.');
      }

      console.log(`[bot] ربات @${runtime.botUsername} متصل شد.`);
      b.start({
        allowed_updates: ['message', 'pre_checkout_query', 'my_chat_member'],
      }).catch((err: unknown) => {
        runtime.botReady = false;
        console.error('[bot] دریافت به‌روزرسانی‌ها متوقف شد:', err instanceof Error ? err.message : err);
      });
    } catch (err) {
      console.error(
        '[bot] اتصال به تلگرام ناموفق بود؛ ۳۰ ثانیهٔ دیگر دوباره تلاش می‌شود.',
        err instanceof Error ? err.message : err,
      );
      setTimeout(() => void connect(), 30_000).unref();
    }
  };
  await connect();
}

export async function stopBot(): Promise<void> {
  if (bot && runtime.botReady) await bot.stop().catch(() => undefined);
}
