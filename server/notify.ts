// اعلان‌های ربات به بازیکن‌ها
import { REWARDS } from '../shared/constants.ts';
import type { Outcome } from '../shared/types.ts';
import { send } from './bot.ts';
import { getUser, now } from './db.ts';
import { escapeHtml, fa } from './util.ts';

/** اگر بازیکن همین الان داخل مینی‌اپ باشد، اعلانِ نوبت لازم نیست */
const IN_APP_WINDOW_MS = 20_000;

function canNotify(userId: number, skipIfOnline = false): boolean {
  const u = getUser(userId);
  if (!u || u.is_bot || !u.notify || !u.can_notify) return false;
  if (skipIfOnline && now() - u.last_seen < IN_APP_WINDOW_MS) return false;
  return true;
}

export function notifyTurn(userId: number, matchId: number, opponentName: string): void {
  if (!canNotify(userId, true)) return;
  void send(userId, `🎯 نوبت توئه!\n<b>${escapeHtml(opponentName)}</b> حرکتش را انجام داد.`, {
    text: '⚔️ بزن بریم',
    startParam: `match_${matchId}`,
  });
}

export function notifyJoined(userId: number, matchId: number, joinerName: string): void {
  if (!canNotify(userId, true)) return;
  void send(userId, `🤝 <b>${escapeHtml(joinerName)}</b> دعوت دوئل تو را قبول کرد!`, {
    text: '⚔️ مشاهدهٔ بازی',
    startParam: `match_${matchId}`,
  });
}

export function notifyResult(
  userId: number,
  matchId: number,
  outcome: Outcome,
  myScore: number,
  oppScore: number,
  opponentName: string,
  reason: 'normal' | 'timeout' | 'resign',
): void {
  if (!canNotify(userId, true)) return;
  const head = outcome === 'win' ? '🏆 بردی!' : outcome === 'draw' ? '🤝 مساوی شد!' : '😕 این بار باختی…';
  const why =
    reason === 'timeout'
      ? outcome === 'win'
        ? '\nحریف سر وقت بازی نکرد.'
        : '\nمهلت نوبتت تمام شد.'
      : reason === 'resign' && outcome === 'win'
        ? '\nحریف انصراف داد.'
        : '';
  void send(
    userId,
    `${head}\nدوئل با <b>${escapeHtml(opponentName)}</b>: ${fa(myScore)} – ${fa(oppScore)}${why}`,
    { text: '👀 دیدن نتیجه', startParam: `match_${matchId}` },
  );
}

export function notifyRematch(userId: number, code: string, fromName: string): void {
  if (!canNotify(userId)) return;
  void send(userId, `🔁 <b>${escapeHtml(fromName)}</b> درخواست بازی دوباره داده!`, {
    text: '⚔️ قبول می‌کنم',
    startParam: `duel_${code}`,
  });
}

export function notifyReferral(inviterId: number, friendName: string): void {
  if (!canNotify(inviterId)) return;
  void send(
    inviterId,
    `🎁 دوستت <b>${escapeHtml(friendName)}</b> اولین دوئلش را تمام کرد.\n${fa(REWARDS.referralInviter)} سکه جایزه گرفتی!`,
    { text: '🎮 بازی کن' },
  );
}

export function notifyQuestionReviewed(userId: number, approved: boolean): void {
  if (!canNotify(userId)) return;
  void send(
    userId,
    approved
      ? `✅ سوالی که فرستاده بودی تأیید شد و ${fa(REWARDS.questionApproved)} سکه جایزه گرفتی. دمت گرم!`
      : '❌ سوالی که فرستاده بودی تأیید نشد. دوباره امتحان کن!',
    { text: '🎮 بازی کن' },
  );
}
