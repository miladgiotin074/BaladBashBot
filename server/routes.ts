import { Router } from 'express';
import type { Request, Response } from 'express';
import { AVATARS, COIN_PACKS, LIFELINES } from '../shared/constants.ts';
import type { LifelineId } from '../shared/constants.ts';
import type { HomeDTO } from '../shared/types.ts';
import { authMiddleware, currentUser, rateLimit } from './auth.ts';
import { createCoinInvoice } from './bot.ts';
import { config, isAdmin } from './config.ts';
import { mustUser, run } from './db.ts';
import { dailyNext, dailyState, playedToday } from './game/daily.ts';
import * as duel from './game/duel.ts';
import { checkStatAchievements, claimDailyBonus, takeNewAchievements, toMe } from './game/economy.ts';
import * as factory from './game/factory.ts';
import { lifeline, submitAnswer } from './game/play.ts';
import { profileOf, trophyBoard, weeklyBoard } from './game/social.ts';
import { survivalNext, survivalStart, survivalState } from './game/survival.ts';
import { runtime, shareLink } from './state.ts';
import { bad, forbidden } from './util.ts';

function intParam(value: unknown, name = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw bad('bad_param', `مقدار ${name} نامعتبر است`);
  return n;
}

function body(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}

function requireAdmin(res: Response): void {
  if (!isAdmin(currentUser(res).id)) throw forbidden('این بخش فقط برای مدیران است');
}

export function apiRouter(): Router {
  const r = Router();
  r.use(authMiddleware, rateLimit);

  // ───────── خانه و حساب کاربری ─────────
  r.get('/home', (_req, res) => {
    const uid = currentUser(res).id;
    checkStatAchievements(uid);
    const newAchievements = takeNewAchievements(uid);
    const home: HomeDTO = {
      me: toMe(mustUser(uid)),
      config: {
        botUsername: runtime.botUsername,
        inviteLink: shareLink(`ref_${uid}`),
        starsShop: config.starsShop && runtime.botReady,
      },
      matches: duel.listMatches(uid),
      dailyPlayed: playedToday(uid),
      newAchievements,
      pendingQuestions: isAdmin(uid) ? factory.pendingCount() : 0,
    };
    res.json(home);
  });

  r.post('/bonus', (_req, res) => {
    const uid = currentUser(res).id;
    const claimed = claimDailyBonus(uid);
    res.json({ ...claimed, me: toMe(mustUser(uid)) });
  });

  r.post('/me/avatar', (req, res) => {
    const uid = currentUser(res).id;
    const avatar = intParam(body(req).avatar, 'avatar');
    if (avatar < 0 || avatar > AVATARS.length) throw bad('bad_avatar', 'این آواتار وجود ندارد');
    run('UPDATE users SET avatar = ? WHERE id = ?', avatar, uid);
    res.json({ me: toMe(mustUser(uid)) });
  });

  r.post('/me/settings', (req, res) => {
    const uid = currentUser(res).id;
    const { notify } = body(req);
    if (typeof notify === 'boolean') run('UPDATE users SET notify = ? WHERE id = ?', notify ? 1 : 0, uid);
    res.json({ me: toMe(mustUser(uid)) });
  });

  // ───────── دوئل ─────────
  r.post('/matches/random', (_req, res) => {
    const uid = currentUser(res).id;
    res.json(duel.toMatchDTO(duel.startRandom(uid), uid));
  });

  r.post('/matches/friend', (_req, res) => {
    const uid = currentUser(res).id;
    res.json(duel.toMatchDTO(duel.startFriend(uid), uid));
  });

  r.post('/matches/join', (req, res) => {
    const uid = currentUser(res).id;
    const code = String(body(req).code ?? '').trim().toLowerCase();
    if (!/^[a-z0-9]{4,16}$/.test(code)) throw bad('bad_code', 'کد دعوت نامعتبر است');
    res.json(duel.toMatchDTO(duel.joinByCode(uid, code), uid));
  });

  r.get('/matches/:id', (req, res) => {
    res.json(duel.matchFor(intParam(req.params.id), currentUser(res).id));
  });

  r.post('/matches/:id/next', (req, res) => {
    res.json(duel.next(intParam(req.params.id), currentUser(res).id));
  });

  r.post('/matches/:id/category', (req, res) => {
    const category = String(body(req).category ?? '');
    res.json(duel.chooseCategory(intParam(req.params.id), currentUser(res).id, category));
  });

  r.post('/matches/:id/resign', (req, res) => {
    const uid = currentUser(res).id;
    res.json(duel.toMatchDTO(duel.resign(intParam(req.params.id), uid), uid));
  });

  r.post('/matches/:id/rematch', (req, res) => {
    const uid = currentUser(res).id;
    res.json(duel.toMatchDTO(duel.rematch(intParam(req.params.id), uid), uid));
  });

  r.get('/matches/:id/rounds/:idx', (req, res) => {
    const idx = intParam(req.params.idx, 'idx');
    res.json(duel.review(intParam(req.params.id), currentUser(res).id, idx));
  });

  // ───────── پاسخ و کمک‌ها (مشترک بین همهٔ حالت‌ها) ─────────
  r.post('/answer', (req, res) => {
    const { instanceId, choice } = body(req);
    res.json(submitAnswer(currentUser(res).id, intParam(instanceId, 'instanceId'), intParam(choice, 'choice')));
  });

  r.post('/lifeline', (req, res) => {
    const { instanceId, type } = body(req);
    if (typeof type !== 'string' || !(type in LIFELINES)) throw bad('bad_lifeline', 'این کمک وجود ندارد');
    res.json(lifeline(currentUser(res).id, intParam(instanceId, 'instanceId'), type as LifelineId));
  });

  // ───────── چالش روزانه ─────────
  r.get('/daily', (_req, res) => {
    res.json(dailyState(currentUser(res).id));
  });

  r.post('/daily/next', (_req, res) => {
    res.json(dailyNext(currentUser(res).id));
  });

  // ───────── بقا ─────────
  r.get('/survival', (_req, res) => {
    res.json(survivalState(currentUser(res).id));
  });

  r.post('/survival/start', (_req, res) => {
    res.json(survivalStart(currentUser(res).id));
  });

  r.post('/survival/next', (_req, res) => {
    res.json(survivalNext(currentUser(res).id));
  });

  // ───────── رده‌بندی و پروفایل ─────────
  r.get('/leaderboard', (req, res) => {
    const me = mustUser(currentUser(res).id);
    res.json(req.query.type === 'weekly' ? weeklyBoard(me) : trophyBoard(me));
  });

  r.get('/profile/:id', (req, res) => {
    res.json(profileOf(intParam(req.params.id)));
  });

  // ───────── سوال‌ساز ─────────
  r.get('/questions/mine', (_req, res) => {
    res.json(factory.myQuestions(currentUser(res).id));
  });

  r.post('/questions', (req, res) => {
    res.json(factory.submitQuestion(currentUser(res).id, body(req)));
  });

  r.post('/questions/:id/report', (req, res) => {
    factory.reportQuestion(currentUser(res).id, intParam(req.params.id), body(req).reason);
    res.json({ ok: true });
  });

  // ───────── مدیریت ─────────
  r.get('/admin/questions', (req, res) => {
    requireAdmin(res);
    res.json(factory.adminList(req.query.filter === 'reported' ? 'reported' : 'pending'));
  });

  r.post('/admin/questions/:id', (req, res) => {
    requireAdmin(res);
    const data = body(req);
    const action = data.action;
    if (action !== 'approve' && action !== 'reject' && action !== 'dismiss') {
      throw bad('bad_action', 'عملیات نامعتبر است');
    }
    factory.adminReview(intParam(req.params.id), action, data);
    res.json({ ok: true });
  });

  r.get('/admin/stats', (_req, res) => {
    requireAdmin(res);
    res.json(factory.adminStats());
  });

  // ───────── فروشگاه (ستاره‌های تلگرام) ─────────
  r.post('/shop/invoice', async (req, res) => {
    const packId = String(body(req).pack ?? '');
    if (!config.starsShop) throw bad('shop_off', 'فروشگاه فعلاً فعال نیست');
    if (!COIN_PACKS.some((p) => p.id === packId)) throw bad('bad_pack', 'این بسته وجود ندارد');
    const link = await createCoinInvoice(currentUser(res).id, packId);
    if (!link) throw bad('shop_unavailable', 'ساخت صورت‌حساب ممکن نشد؛ کمی بعد دوباره امتحان کن');
    res.json({ link });
  });

  return r;
}
