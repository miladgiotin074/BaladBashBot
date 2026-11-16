// ثبت پاسخ و استفاده از کمک‌ها — مشترک بین دوئل، چالش روزانه و بقا
import type { LifelineId } from '../../shared/constants.ts';
import type { AnswerDTO, LifelineDTO } from '../../shared/types.ts';
import { tx } from '../db.ts';
import { notFound } from '../util.ts';
import { dailyAfterAnswer } from './daily.ts';
import { afterAnswer as duelAfterAnswer } from './duel.ts';
import { finalize, getInstance, useLifeline, verdictOf } from './engine.ts';
import { survivalAfterAnswer } from './survival.ts';

export function submitAnswer(uid: number, instanceId: number, choice: number): AnswerDTO {
  return tx(() => {
    const inst = getInstance(instanceId);
    if (!inst || inst.user_id !== uid) throw notFound('این سوال پیدا نشد');
    // درخواست تکراری (مثلاً بعد از قطعی شبکه) همان نتیجهٔ قبلی را می‌گیرد
    if (inst.answered_at !== null) return verdictOf(inst);

    const verdict = finalize(inst, choice);
    if (inst.ctx === 'duel') duelAfterAnswer(inst, verdict.correct);
    else if (inst.ctx === 'daily') dailyAfterAnswer(inst);
    else Object.assign(verdict, survivalAfterAnswer(inst, verdict.correct));
    return verdict;
  });
}

export function lifeline(uid: number, instanceId: number, type: LifelineId): LifelineDTO {
  return tx(() => {
    const inst = getInstance(instanceId);
    if (!inst || inst.user_id !== uid) throw notFound('این سوال پیدا نشد');
    return useLifeline(uid, inst, type);
  });
}
