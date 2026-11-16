import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORY_CHOICES, CATEGORY_IDS, DAILY_QUESTIONS, QUESTIONS_PER_ROUND } from '../../shared/constants.ts';
import { ROOT } from '../config.ts';
import { all, get, now, run, tx } from '../db.ts';
import type { QuestionRow } from '../db.ts';
import { parseJson, shiftDay, shuffle } from '../util.ts';

type SeedItem = [text: string, correct: string, w1: string, w2: string, w3: string, difficulty?: number];

/** وارد کردن بانک سوالات از فایل‌های JSON (فقط موارد جدید اضافه می‌شوند) */
export function seedQuestions(): { added: number; total: number } {
  let added = 0;
  tx(() => {
    for (const category of CATEGORY_IDS) {
      const file = resolve(ROOT, 'server/data/questions', `${category}.json`);
      if (!existsSync(file)) continue;
      const items = JSON.parse(readFileSync(file, 'utf8')) as SeedItem[];
      for (const item of items) {
        const [text, correct, w1, w2, w3, difficulty = 2] = item;
        const key = createHash('sha1').update(`${category}|${text}`).digest('hex').slice(0, 24);
        const options = shuffle([correct, w1, w2, w3]);
        const r = run(
          `INSERT OR IGNORE INTO questions (category, text, options, correct, difficulty, status, seed_key, created_at)
           VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)`,
          category,
          text,
          JSON.stringify(options),
          options.indexOf(correct),
          difficulty,
          key,
          now(),
        );
        added += r.changes;
      }
    }
  });
  const total = get<{ c: number }>("SELECT COUNT(*) AS c FROM questions WHERE status = 'approved'")?.c ?? 0;
  return { added, total };
}

export function getQuestion(id: number): QuestionRow {
  const q = get<QuestionRow>('SELECT * FROM questions WHERE id = ?', id);
  if (!q) throw new Error(`question ${id} not found`);
  return q;
}

export function optionsOf(q: QuestionRow): string[] {
  return parseJson<string[]>(q.options, []);
}

/** دسته‌هایی که به اندازهٔ یک دور سوال تأییدشده دارند */
function playableCategories(): string[] {
  const rows = all<{ category: string; c: number }>(
    "SELECT category, COUNT(*) AS c FROM questions WHERE status = 'approved' GROUP BY category",
  );
  const counts = new Map(rows.map((r) => [r.category, r.c]));
  return CATEGORY_IDS.filter((id) => (counts.get(id) ?? 0) >= QUESTIONS_PER_ROUND);
}

/** سه دستهٔ پیشنهادی برای یک دور (بدون تکرار دسته‌های قبلی همان بازی) */
export function pickCategories(used: string[]): string[] {
  const playable = playableCategories();
  const fresh = playable.filter((c) => !used.includes(c));
  const pool = fresh.length >= CATEGORY_CHOICES ? fresh : playable;
  return shuffle(pool).slice(0, CATEGORY_CHOICES);
}

/**
 * انتخاب سوال‌های یک دور: اول سوال‌هایی که هیچ‌کدام از دو بازیکن ندیده‌اند،
 * بعد آن‌هایی که قدیمی‌تر دیده شده‌اند.
 */
export function pickForRound(category: string, exclude: number[], userA: number, userB: number): number[] {
  const rows = all<{ id: number; last: number | null }>(
    `SELECT q.id AS id,
            (SELECT MAX(i.asked_at) FROM instances i
              WHERE i.question_id = q.id AND i.user_id IN (?, ?)) AS last
     FROM questions q
     WHERE q.category = ? AND q.status = 'approved'`,
    userA,
    userB,
    category,
  );
  const pool = shuffle(rows.filter((r) => !exclude.includes(r.id)));
  pool.sort((a, b) => (a.last ?? 0) - (b.last ?? 0));
  return pool.slice(0, QUESTIONS_PER_ROUND).map((r) => r.id);
}

/** سوال بعدی حالت بقا؛ با جلو رفتن بازی سخت‌تر می‌شود */
export function pickSurvival(userId: number, runId: number, pos: number): number | null {
  const maxDifficulty = pos < 5 ? 1 : pos < 15 ? 2 : 3;
  for (const limit of [maxDifficulty, 3]) {
    const row = get<{ id: number }>(
      `SELECT q.id AS id FROM questions q
       WHERE q.status = 'approved' AND q.difficulty <= ?
         AND q.id NOT IN (SELECT question_id FROM instances WHERE ctx = 'survival' AND ctx_id = ?)
       ORDER BY (SELECT COUNT(*) FROM instances i WHERE i.user_id = ? AND i.question_id = q.id) ASC, RANDOM()
       LIMIT 1`,
      limit,
      runId,
      userId,
    );
    if (row) return row.id;
  }
  return null;
}

/** سوال‌های چالش روزانه (برای همه یکسان) */
export function dailySet(day: string): number[] {
  const existing = get<{ question_ids: string }>('SELECT question_ids FROM daily_sets WHERE day = ?', day);
  if (existing) return parseJson<number[]>(existing.question_ids, []);

  return tx(() => {
    // سوال‌های هفتهٔ اخیر تکرار نشوند
    const recent = new Set<number>();
    const rows = all<{ question_ids: string }>('SELECT question_ids FROM daily_sets WHERE day >= ?', shiftDay(day, -7));
    for (const r of rows) for (const id of parseJson<number[]>(r.question_ids, [])) recent.add(id);

    const picked: number[] = [];
    const cats = shuffle(playableCategories());
    let guard = 0;
    while (picked.length < DAILY_QUESTIONS && cats.length > 0 && guard < 200) {
      const category = cats[guard % cats.length]!;
      guard++;
      const candidates = all<{ id: number }>(
        "SELECT id FROM questions WHERE category = ? AND status = 'approved' ORDER BY RANDOM() LIMIT 30",
        category,
      ).map((r) => r.id);
      const choice =
        candidates.find((id) => !picked.includes(id) && !recent.has(id)) ??
        candidates.find((id) => !picked.includes(id));
      if (choice !== undefined) picked.push(choice);
    }
    run('INSERT OR IGNORE INTO daily_sets (day, question_ids) VALUES (?, ?)', day, JSON.stringify(picked));
    return picked;
  });
}
