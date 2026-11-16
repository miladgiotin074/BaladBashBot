// «سوال‌ساز»: ارسال سوال توسط بازیکن‌ها، گزارش سوال و بررسی توسط ادمین
import { CATEGORY_IDS, QUESTION_LIMITS, REWARDS } from '../../shared/constants.ts';
import type { AdminStatsDTO, SubmittedQuestionDTO } from '../../shared/types.ts';
import { all, defer, get, getUser, now, run, tx } from '../db.ts';
import type { QuestionRow } from '../db.ts';
import { notifyQuestionReviewed } from '../notify.ts';
import { bad, cleanText, notFound, parseJson } from '../util.ts';
import { addCoins, grant, toPlayer } from './economy.ts';

const MAX_PENDING_PER_USER = 5;

interface QuestionInput {
  category?: unknown;
  text?: unknown;
  options?: unknown;
  correct?: unknown;
}

function validate(input: QuestionInput): { category: string; text: string; options: string[]; correct: number } {
  const category = typeof input.category === 'string' ? input.category : '';
  if (!CATEGORY_IDS.includes(category)) throw bad('bad_category', 'موضوع سوال را انتخاب کن');
  const text = cleanText(input.text, QUESTION_LIMITS.textMax);
  if (text.length < QUESTION_LIMITS.textMin) throw bad('bad_text', 'متن سوال خیلی کوتاه است');
  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const options = rawOptions.map((o) => cleanText(o, QUESTION_LIMITS.optionMax));
  if (options.length !== 4 || options.some((o) => !o)) throw bad('bad_options', 'هر چهار گزینه را پر کن');
  if (new Set(options).size !== 4) throw bad('dup_options', 'گزینه‌ها نباید تکراری باشند');
  const correct = Number(input.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) throw bad('bad_correct', 'گزینهٔ درست را مشخص کن');
  return { category, text, options, correct };
}

function toDTO(q: QuestionRow, withAuthor = false): SubmittedQuestionDTO {
  const author = withAuthor && q.author_id ? getUser(q.author_id) : undefined;
  return {
    id: q.id,
    category: q.category,
    text: q.text,
    options: parseJson<string[]>(q.options, []),
    correct: q.correct,
    status: q.status,
    author: author ? toPlayer(author) : null,
    reports: q.reports,
    createdAt: q.created_at,
  };
}

export function submitQuestion(uid: number, input: QuestionInput): SubmittedQuestionDTO {
  return tx(() => {
    const data = validate(input);
    const pending =
      get<{ c: number }>("SELECT COUNT(*) AS c FROM questions WHERE author_id = ? AND status = 'pending'", uid)?.c ?? 0;
    if (pending >= MAX_PENDING_PER_USER) {
      throw bad('too_many_pending', 'چند سوالِ در انتظار بررسی داری؛ صبر کن تا بررسی شوند');
    }
    const r = run(
      `INSERT INTO questions (category, text, options, correct, difficulty, status, author_id, created_at)
       VALUES (?, ?, ?, ?, 2, 'pending', ?, ?)`,
      data.category,
      data.text,
      JSON.stringify(data.options),
      data.correct,
      uid,
      now(),
    );
    return toDTO(get<QuestionRow>('SELECT * FROM questions WHERE id = ?', r.lastId)!);
  });
}

export function myQuestions(uid: number): SubmittedQuestionDTO[] {
  return all<QuestionRow>('SELECT * FROM questions WHERE author_id = ? ORDER BY id DESC LIMIT 30', uid).map((q) =>
    toDTO(q),
  );
}

export function reportQuestion(uid: number, questionId: number, reason: unknown): void {
  tx(() => {
    const q = get<QuestionRow>('SELECT * FROM questions WHERE id = ?', questionId);
    if (!q) throw notFound('این سوال پیدا نشد');
    const r = run(
      'INSERT OR IGNORE INTO reports (question_id, user_id, reason, at) VALUES (?, ?, ?, ?)',
      questionId,
      uid,
      cleanText(reason, 200) || null,
      now(),
    );
    if (r.changes > 0) run('UPDATE questions SET reports = reports + 1 WHERE id = ?', questionId);
  });
}

// ───────── ادمین ─────────
export function adminList(filter: 'pending' | 'reported'): SubmittedQuestionDTO[] {
  const rows =
    filter === 'pending'
      ? all<QuestionRow>("SELECT * FROM questions WHERE status = 'pending' ORDER BY id LIMIT 50")
      : all<QuestionRow>(
          "SELECT * FROM questions WHERE status = 'approved' AND reports > 0 ORDER BY reports DESC, id LIMIT 50",
        );
  return rows.map((q) => toDTO(q, true));
}

export function adminReview(
  questionId: number,
  action: 'approve' | 'reject' | 'dismiss',
  edits: QuestionInput & { difficulty?: unknown },
): void {
  tx(() => {
    const q = get<QuestionRow>('SELECT * FROM questions WHERE id = ?', questionId);
    if (!q) throw notFound('این سوال پیدا نشد');

    if (action === 'dismiss') {
      run('UPDATE questions SET reports = 0 WHERE id = ?', q.id);
      run('DELETE FROM reports WHERE question_id = ?', q.id);
      return;
    }
    if (action === 'reject') {
      run("UPDATE questions SET status = 'rejected' WHERE id = ?", q.id);
      if (q.status === 'pending' && q.author_id) {
        const author = q.author_id;
        defer(() => notifyQuestionReviewed(author, false));
      }
      return;
    }

    // تأیید (ادمین می‌تواند هم‌زمان متن و گزینه‌ها را اصلاح کند)
    const hasEdits = edits.text !== undefined || edits.options !== undefined;
    const data = hasEdits
      ? validate({
          category: edits.category ?? q.category,
          text: edits.text ?? q.text,
          options: edits.options ?? parseJson<string[]>(q.options, []),
          correct: edits.correct ?? q.correct,
        })
      : null;
    const difficulty = Number(edits.difficulty);
    run(
      `UPDATE questions SET status = 'approved', category = ?, text = ?, options = ?, correct = ?, difficulty = ?
       WHERE id = ?`,
      data?.category ?? q.category,
      data?.text ?? q.text,
      data ? JSON.stringify(data.options) : q.options,
      data?.correct ?? q.correct,
      [1, 2, 3].includes(difficulty) ? difficulty : q.difficulty,
      q.id,
    );
    if (q.status === 'pending' && q.author_id) {
      const author = q.author_id;
      addCoins(author, REWARDS.questionApproved);
      grant(author, 'author');
      defer(() => notifyQuestionReviewed(author, true));
    }
  });
}

export function pendingCount(): number {
  return get<{ c: number }>("SELECT COUNT(*) AS c FROM questions WHERE status = 'pending'")?.c ?? 0;
}

export function adminStats(): AdminStatsDTO {
  const c = (sql: string, ...p: number[]): number => get<{ c: number }>(sql, ...p)?.c ?? 0;
  return {
    users: c('SELECT COUNT(*) AS c FROM users WHERE is_bot = 0'),
    activeToday: c('SELECT COUNT(*) AS c FROM users WHERE is_bot = 0 AND last_seen > ?', now() - 24 * 3600_000),
    matches: c('SELECT COUNT(*) AS c FROM matches'),
    activeMatches: c("SELECT COUNT(*) AS c FROM matches WHERE status = 'active'"),
    questions: c("SELECT COUNT(*) AS c FROM questions WHERE status = 'approved'"),
    pending: pendingCount(),
    reported: c("SELECT COUNT(*) AS c FROM questions WHERE status = 'approved' AND reports > 0"),
  };
}
