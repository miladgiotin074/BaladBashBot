// هستهٔ پرسش و پاسخ: ساخت سوالِ در حال پخش، داوری پاسخ و کمک‌ها
import { EXTRA_TIME_MS, LIFELINES } from '../../shared/constants.ts';
import type { LifelineId } from '../../shared/constants.ts';
import type { AnswerDTO, LifelineDTO, QuestionDTO } from '../../shared/types.ts';
import { get, now, run } from '../db.ts';
import type { InstanceRow } from '../db.ts';
import { bad, clamp, parseJson, sample, shuffle } from '../util.ts';
import { spendCoins } from './economy.ts';
import { getQuestion, optionsOf } from './questions.ts';

/** مهلت اضافه برای جبران تأخیر شبکه */
const GRACE_MS = 2500;

export type Ctx = InstanceRow['ctx'];

export function getInstance(id: number): InstanceRow | undefined {
  return get<InstanceRow>('SELECT * FROM instances WHERE id = ?', id);
}

export function createInstance(
  userId: number,
  ctx: Ctx,
  ctxId: number,
  slot: number,
  questionId: number,
  limitMs: number,
): InstanceRow {
  const perm = shuffle([0, 1, 2, 3]);
  const r = run(
    `INSERT INTO instances (user_id, ctx, ctx_id, slot, question_id, perm, asked_at, limit_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId,
    ctx,
    ctxId,
    slot,
    questionId,
    JSON.stringify(perm),
    now(),
    limitMs,
  );
  return getInstance(r.lastId)!;
}

/** سوالی که پرسیده شده ولی هنوز جواب نگرفته */
export function pendingInstance(userId: number, ctx: Ctx, ctxId: number): InstanceRow | undefined {
  return get<InstanceRow>(
    `SELECT * FROM instances
     WHERE user_id = ? AND ctx = ? AND ctx_id = ? AND answered_at IS NULL
     ORDER BY slot LIMIT 1`,
    userId,
    ctx,
    ctxId,
  );
}

export function isExpired(inst: InstanceRow, at: number = now()): boolean {
  return at > inst.asked_at + inst.limit_ms + GRACE_MS;
}

function permOf(inst: InstanceRow): number[] {
  return parseJson<number[]>(inst.perm, [0, 1, 2, 3]);
}

function correctIndexOf(inst: InstanceRow): number {
  return permOf(inst).indexOf(getQuestion(inst.question_id).correct);
}

/** ثبت پاسخ (یا تمام شدن زمان با choice = -1) */
export function finalize(inst: InstanceRow, choice: number): AnswerDTO {
  const correctIndex = correctIndexOf(inst);
  const removed = parseJson<number[]>(inst.removed, []);
  const at = now();
  const valid = Number.isInteger(choice) && choice >= 0 && choice < 4 && !removed.includes(choice);
  const timedOut = !valid || isExpired(inst, at);
  const finalChoice = timedOut ? -1 : choice;
  const correct = finalChoice === correctIndex;

  const r = run(
    'UPDATE instances SET answered_at = ?, choice = ?, is_correct = ? WHERE id = ? AND answered_at IS NULL',
    Math.min(at, inst.asked_at + inst.limit_ms),
    finalChoice,
    correct ? 1 : 0,
    inst.id,
  );
  if (r.changes > 0) {
    run('UPDATE questions SET shown = shown + 1, right = right + ? WHERE id = ?', correct ? 1 : 0, inst.question_id);
    run('UPDATE users SET answered = answered + 1, correct = correct + ? WHERE id = ?', correct ? 1 : 0, inst.user_id);
  }
  return { correct, correctIndex, choice: finalChoice, timedOut };
}

/** نتیجهٔ سوالی که قبلاً جواب داده شده */
export function verdictOf(inst: InstanceRow): AnswerDTO {
  return {
    correct: inst.is_correct === 1,
    correctIndex: correctIndexOf(inst),
    choice: inst.choice ?? -1,
    timedOut: (inst.choice ?? -1) < 0,
  };
}

export function toQuestionDTO(
  inst: InstanceRow,
  extra: Pick<QuestionDTO, 'index' | 'total' | 'round' | 'lives' | 'score'>,
): QuestionDTO {
  const q = getQuestion(inst.question_id);
  const options = optionsOf(q);
  const perm = permOf(inst);
  return {
    instanceId: inst.id,
    ctx: inst.ctx,
    text: q.text,
    options: perm.map((i) => options[i] ?? ''),
    category: q.category,
    difficulty: q.difficulty,
    limitMs: inst.limit_ms,
    remainingMs: Math.max(0, inst.asked_at + inst.limit_ms - now()),
    removed: parseJson<number[]>(inst.removed, []),
    used: parseJson<LifelineId[]>(inst.used, []),
    ...extra,
  };
}

/** تبدیل انتخابِ نمایش‌داده‌شده به شمارهٔ گزینهٔ اصلی سوال */
export function originalChoice(inst: InstanceRow): number | null {
  if (inst.choice === null || inst.choice < 0) return inst.choice === null ? null : -1;
  return permOf(inst)[inst.choice] ?? -1;
}

export function useLifeline(userId: number, inst: InstanceRow, type: LifelineId): LifelineDTO {
  if (!LIFELINES[type]) throw bad('bad_lifeline', 'این کمک وجود ندارد');
  if (inst.answered_at !== null || isExpired(inst)) throw bad('too_late', 'زمان این سوال تمام شده');
  const used = parseJson<LifelineId[]>(inst.used, []);
  if (used.includes(type)) throw bad('lifeline_used', 'این کمک را برای این سوال استفاده کرده‌ای');

  const correctIndex = correctIndexOf(inst);
  const removed = parseJson<number[]>(inst.removed, []);
  const coins = spendCoins(userId, LIFELINES[type].cost);
  used.push(type);
  const usedJson = JSON.stringify(used);

  if (type === 'fifty') {
    const wrong = [0, 1, 2, 3].filter((i) => i !== correctIndex && !removed.includes(i));
    const next = [...removed, ...sample(wrong, 2)];
    run('UPDATE instances SET removed = ?, used = ? WHERE id = ?', JSON.stringify(next), usedJson, inst.id);
    return { type, coins, removed: next };
  }

  if (type === 'time') {
    const limitMs = inst.limit_ms + EXTRA_TIME_MS;
    run('UPDATE instances SET limit_ms = ?, used = ? WHERE id = ?', limitMs, usedJson, inst.id);
    return { type, coins, limitMs, remainingMs: Math.max(0, inst.asked_at + limitMs - now()) };
  }

  // نظر بقیه: درصدها بر اساس آمار واقعی پاسخ‌ها (اگر به اندازهٔ کافی باشد)
  run('UPDATE instances SET used = ? WHERE id = ?', usedJson, inst.id);
  const q = getQuestion(inst.question_id);
  const base = q.shown >= 20 ? q.right / q.shown : [0.78, 0.62, 0.48][q.difficulty - 1] ?? 0.6;
  const share = clamp(base + (Math.random() - 0.5) * 0.12, 0.3, 0.92);
  const others = [0, 1, 2, 3].filter((i) => i !== correctIndex && !removed.includes(i));
  const weights = others.map(() => 0.3 + Math.random());
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const audience = [0, 0, 0, 0];
  let left = 100;
  others.forEach((idx, k) => {
    const value = Math.round(((1 - share) * 100 * weights[k]!) / weightSum);
    audience[idx] = value;
    left -= value;
  });
  audience[correctIndex] = Math.max(0, left);
  return { type, coins, audience };
}
