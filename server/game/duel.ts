// دوئل نوبتی: ۵ دور، هر دور ۳ سوال. در هر دور یکی از بازیکن‌ها موضوع را انتخاب می‌کند
// و هر دو به همان سوال‌ها جواب می‌دهند.
import {
  DUEL_TIME_MS,
  MAX_ACTIVE_MATCHES,
  QUESTIONS_PER_ROUND as QPR,
  REWARDS,
  ROUNDS,
  TOTAL_QUESTIONS,
} from '../../shared/constants.ts';
import type {
  MatchDTO,
  MatchResultDTO,
  MatchSummaryDTO,
  NextDTO,
  Outcome,
  Phase,
  ReviewQuestionDTO,
  RoundDTO,
} from '../../shared/types.ts';
import { config } from '../config.ts';
import { all, defer, get, mustUser, now, run, tx } from '../db.ts';
import type { InstanceRow, MatchRow, RoundRow, UserRow } from '../db.ts';
import { notifyJoined, notifyReferral, notifyRematch, notifyResult, notifyTurn } from '../notify.ts';
import { shareLink } from '../state.ts';
import { bad, clamp, forbidden, makeCode, notFound, parseJson, pick, randInt } from '../util.ts';
import { randomBot } from './bots.ts';
import { addXp, checkStatAchievements, displayName, grant, payReferral, toPlayer } from './economy.ts';
import { createInstance, finalize, isExpired, originalChoice, pendingInstance, toQuestionDTO } from './engine.ts';
import { getQuestion, optionsOf, pickCategories, pickForRound } from './questions.ts';

const turnMs = (): number => config.turnTimeoutHours * 3600_000;
const WAITING_TTL_MS = 48 * 3600_000;

// ───────── دسترسی به داده ─────────
export function getMatch(id: number): MatchRow | undefined {
  return get<MatchRow>('SELECT * FROM matches WHERE id = ?', id);
}

function mustMatch(id: number): MatchRow {
  const m = getMatch(id);
  if (!m) throw notFound('این بازی پیدا نشد');
  return m;
}

function memberMatch(id: number, uid: number): MatchRow {
  const m = mustMatch(id);
  if (m.p1 !== uid && m.p2 !== uid) throw forbidden('این بازیِ تو نیست');
  return m;
}

function getRound(matchId: number, idx: number): RoundRow | undefined {
  return get<RoundRow>('SELECT * FROM rounds WHERE match_id = ? AND idx = ?', matchId, idx);
}

function answeredCount(matchId: number, uid: number): number {
  return (
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM instances
       WHERE ctx = 'duel' AND ctx_id = ? AND user_id = ? AND answered_at IS NOT NULL`,
      matchId,
      uid,
    )?.c ?? 0
  );
}

function roundAnswered(matchId: number, uid: number, idx: number): number {
  return (
    get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM instances
       WHERE ctx = 'duel' AND ctx_id = ? AND user_id = ? AND answered_at IS NOT NULL
         AND slot BETWEEN ? AND ?`,
      matchId,
      uid,
      idx * QPR,
      idx * QPR + QPR - 1,
    )?.c ?? 0
  );
}

/** انتخاب‌کنندهٔ موضوع هر دور: دورهای زوج بازیکن اول، دورهای فرد بازیکن دوم */
function chooserOf(m: MatchRow, idx: number): number | null {
  return idx % 2 === 0 ? m.p1 : m.p2;
}

export function phaseOf(m: MatchRow, uid: number): Phase {
  if (m.status === 'finished' || m.status === 'cancelled') return 'done';
  const idx = Math.floor(answeredCount(m.id, uid) / QPR);
  if (idx >= ROUNDS) return 'done';
  const round = getRound(m.id, idx);
  const chooser = chooserOf(m, idx);
  if (!round?.category) return chooser === uid ? 'choose' : 'wait';
  if (chooser === uid) return 'play';
  return chooser !== null && roundAnswered(m.id, chooser, idx) >= QPR ? 'play' : 'wait';
}

// ───────── ساخت بازی و پیدا کردن حریف ─────────
function ensureCapacity(uid: number): void {
  const c =
    get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM matches WHERE (p1 = ? OR p2 = ?) AND status IN ('waiting', 'active')",
      uid,
      uid,
    )?.c ?? 0;
  if (c >= MAX_ACTIVE_MATCHES) {
    throw bad('too_many', 'تعداد بازی‌های بازت زیاد است؛ اول چندتا را تمام کن');
  }
}

function createMatch(uid: number, mode: MatchRow['mode'], p2: number | null = null): MatchRow {
  const t = now();
  const r = run(
    `INSERT INTO matches (code, mode, p1, p2, status, turn, deadline, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    makeCode(),
    mode,
    uid,
    p2,
    p2 === null ? 'waiting' : 'active',
    uid,
    p2 === null ? null : t + turnMs(),
    t,
    t,
  );
  return mustMatch(r.lastId);
}

/** نشاندن بازیکن دوم روی یک بازیِ منتظر */
function seat(m: MatchRow, uid: number): MatchRow {
  const t = now();
  const r = run(
    "UPDATE matches SET p2 = ?, status = 'active', deadline = ?, updated_at = ? WHERE id = ? AND p2 IS NULL AND status = 'waiting'",
    uid,
    t + turnMs(),
    t,
    m.id,
  );
  if (r.changes === 0) throw bad('full', 'این بازی دیگر در دسترس نیست');
  return refreshTurn(m.id);
}

export function startRandom(uid: number): MatchRow {
  return tx(() => {
    const own = get<MatchRow>(
      "SELECT * FROM matches WHERE p1 = ? AND status = 'waiting' AND mode = 'random' AND p2 IS NULL LIMIT 1",
      uid,
    );
    if (own) return own;
    ensureCapacity(uid);
    const candidate = get<MatchRow>(
      `SELECT m.* FROM matches m
       WHERE m.status = 'waiting' AND m.mode = 'random' AND m.p2 IS NULL AND m.p1 != ?
         AND NOT EXISTS (
           SELECT 1 FROM matches x
           WHERE x.status = 'active'
             AND ((x.p1 = m.p1 AND x.p2 = ?) OR (x.p1 = ? AND x.p2 = m.p1))
         )
       ORDER BY m.created_at LIMIT 1`,
      uid,
      uid,
      uid,
    );
    return candidate ? seat(candidate, uid) : createMatch(uid, 'random');
  });
}

export function startFriend(uid: number): MatchRow {
  return tx(() => {
    ensureCapacity(uid);
    return createMatch(uid, 'friend');
  });
}

export function joinByCode(uid: number, code: string): MatchRow {
  return tx(() => {
    const m = get<MatchRow>('SELECT * FROM matches WHERE code = ?', code);
    if (!m) throw notFound('این دعوت پیدا نشد');
    if (m.p1 === uid || m.p2 === uid) return m;
    if (m.status !== 'waiting' || m.p2 !== null) throw bad('full', 'این بازی دیگر در دسترس نیست');
    ensureCapacity(uid);
    const seated = seat(m, uid);
    const joiner = mustUser(uid);
    defer(() => notifyJoined(m.p1, m.id, displayName(joiner)));
    return seated;
  });
}

export function rematch(matchId: number, uid: number): MatchRow {
  return tx(() => {
    const m = memberMatch(matchId, uid);
    if (m.status !== 'finished' || m.p2 === null) throw bad('not_finished', 'این بازی هنوز تمام نشده');
    ensureCapacity(uid);
    const oppId = m.p1 === uid ? m.p2 : m.p1;
    if (mustUser(oppId).is_bot) return createMatch(uid, 'random', oppId);
    const fresh = createMatch(uid, 'friend');
    const me = mustUser(uid);
    defer(() => notifyRematch(oppId, fresh.code, displayName(me)));
    return fresh;
  });
}

// ───────── دورها ─────────
function matchRounds(matchId: number): RoundRow[] {
  return all<RoundRow>('SELECT * FROM rounds WHERE match_id = ? ORDER BY idx', matchId);
}

function ensureRound(m: MatchRow, idx: number): RoundRow {
  const existing = getRound(m.id, idx);
  if (existing) return existing;
  const used = matchRounds(m.id)
    .map((r) => r.category)
    .filter((c): c is string => c !== null);
  run(
    'INSERT INTO rounds (match_id, idx, cat_options) VALUES (?, ?, ?)',
    m.id,
    idx,
    JSON.stringify(pickCategories(used)),
  );
  return getRound(m.id, idx)!;
}

function setCategory(m: MatchRow, idx: number, category: string): void {
  const usedIds = matchRounds(m.id).flatMap((r) => parseJson<number[]>(r.question_ids, []));
  const ids = pickForRound(category, usedIds, m.p1, m.p2 ?? m.p1);
  if (ids.length < QPR) throw bad('no_questions', 'برای این موضوع سوال کافی نیست');
  run(
    'UPDATE rounds SET category = ?, question_ids = ? WHERE match_id = ? AND idx = ?',
    category,
    JSON.stringify(ids),
    m.id,
    idx,
  );
}

export function chooseCategory(matchId: number, uid: number, category: string): NextDTO {
  return tx(() => {
    const m = memberMatch(matchId, uid);
    if (phaseOf(m, uid) !== 'choose') throw bad('not_your_turn', 'الان نوبت انتخاب موضوع نیست');
    const idx = Math.floor(answeredCount(m.id, uid) / QPR);
    const round = ensureRound(m, idx);
    if (!parseJson<string[]>(round.cat_options, []).includes(category)) {
      throw bad('bad_category', 'این موضوع جزو گزینه‌ها نیست');
    }
    setCategory(m, idx, category);
    return next(matchId, uid);
  });
}

// ───────── جریان سوال‌ها ─────────
function questionDTO(inst: InstanceRow) {
  return toQuestionDTO(inst, {
    index: (inst.slot % QPR) + 1,
    total: QPR,
    round: Math.floor(inst.slot / QPR),
    lives: null,
    score: null,
  });
}

/** قدم بعدیِ بازیکن در این بازی: انتخاب موضوع، سوال بعدی، انتظار یا پایان */
export function next(matchId: number, uid: number): NextDTO {
  return tx(() => {
    let m = memberMatch(matchId, uid);
    if (m.status === 'finished' || m.status === 'cancelled') return { state: 'finished' };

    const pending = pendingInstance(uid, 'duel', m.id);
    if (pending) {
      if (!isExpired(pending)) return { state: 'question', question: questionDTO(pending) };
      // بازیکن وسط سوال بیرون رفته و زمان تمام شده است
      afterAnswer(pending, finalize(pending, -1).correct);
      m = mustMatch(m.id);
      if (m.status === 'finished') return { state: 'finished' };
    }

    const phase = phaseOf(m, uid);
    const answered = answeredCount(m.id, uid);
    const idx = Math.floor(answered / QPR);

    if (phase === 'choose') {
      const round = ensureRound(m, idx);
      return { state: 'choose', round: idx, options: parseJson<string[]>(round.cat_options, []) };
    }
    if (phase === 'play') {
      const ids = parseJson<number[]>(getRound(m.id, idx)?.question_ids, []);
      const questionId = ids[answered % QPR];
      if (questionId === undefined) throw bad('no_questions', 'سوالی برای این دور پیدا نشد');
      return { state: 'question', question: questionDTO(createInstance(uid, 'duel', m.id, answered, questionId, DUEL_TIME_MS)) };
    }
    return { state: 'wait' };
  });
}

/** بعد از ثبت هر پاسخ در دوئل صدا زده می‌شود */
export function afterAnswer(inst: InstanceRow, correct: boolean): void {
  const m = mustMatch(inst.ctx_id);
  if (m.status !== 'active' && m.status !== 'waiting') return;
  if (correct) {
    run(
      inst.user_id === m.p1
        ? 'UPDATE matches SET score1 = score1 + 1 WHERE id = ?'
        : 'UPDATE matches SET score2 = score2 + 1 WHERE id = ?',
      m.id,
    );
  }
  refreshTurn(m.id);
}

/** محاسبهٔ دوبارهٔ نوبت؛ اگر هر دو بازیکن تمام کرده باشند بازی را می‌بندد */
function refreshTurn(matchId: number): MatchRow {
  const m = mustMatch(matchId);
  if (m.status !== 'active' && m.status !== 'waiting') return m;

  const ph1 = phaseOf(m, m.p1);
  const ph2 = m.p2 !== null ? phaseOf(m, m.p2) : null;
  if (ph1 === 'done' && ph2 === 'done') return finishMatch(m, 'normal', null);

  const canMove = (p: Phase | null): boolean => p === 'choose' || p === 'play';
  const turn = canMove(ph1) ? m.p1 : canMove(ph2) ? m.p2 : null;
  const t = now();

  if (turn === m.turn) {
    run('UPDATE matches SET updated_at = ? WHERE id = ?', t, m.id);
    return mustMatch(m.id);
  }

  const turnUser = turn !== null ? mustUser(turn) : null;
  run(
    'UPDATE matches SET turn = ?, bot_at = ?, deadline = ?, updated_at = ? WHERE id = ?',
    turn,
    turnUser?.is_bot ? t + randInt(6, 18) * 1000 : null,
    m.status === 'active' && turn !== null ? t + turnMs() : null,
    t,
    m.id,
  );
  if (turnUser && !turnUser.is_bot && m.p2 !== null) {
    const other = mustUser(turn === m.p1 ? m.p2 : m.p1);
    defer(() => notifyTurn(turnUser.id, m.id, displayName(other)));
  }
  return mustMatch(m.id);
}

function finishMatch(m: MatchRow, reason: 'normal' | 'timeout' | 'resign', loserId: number | null): MatchRow {
  const t = now();
  if (m.p2 === null) {
    run("UPDATE matches SET status = 'cancelled', turn = NULL, deadline = NULL, updated_at = ? WHERE id = ?", t, m.id);
    return mustMatch(m.id);
  }
  const fresh = mustMatch(m.id);
  const p1 = fresh.p1;
  const p2 = m.p2;
  const scores = new Map<number, number>([
    [p1, fresh.score1],
    [p2, fresh.score2],
  ]);
  const winner =
    loserId !== null
      ? loserId === p1
        ? p2
        : p1
      : fresh.score1 > fresh.score2
        ? p1
        : fresh.score2 > fresh.score1
          ? p2
          : 0;

  const result: Record<string, MatchResultDTO> = {};
  for (const uid of [p1, p2]) {
    const u = mustUser(uid);
    const score = scores.get(uid) ?? 0;
    const outcome: Outcome = winner === 0 ? 'draw' : winner === uid ? 'win' : 'loss';
    const base = REWARDS[outcome];
    const perfect = reason === 'normal' && score === TOTAL_QUESTIONS;
    const coins = base.coins + (perfect ? REWARDS.perfectBonusCoins : 0);
    const xp = base.xp + score * REWARDS.xpPerCorrect;
    const trophies = Math.max(-u.trophies, base.trophies);
    const streak = outcome === 'win' ? u.win_streak + 1 : 0;

    run(
      `UPDATE users SET games = games + 1, wins = wins + ?, losses = losses + ?, draws = draws + ?,
                        win_streak = ?, best_win_streak = MAX(best_win_streak, ?),
                        coins = coins + ?, trophies = trophies + ?
       WHERE id = ?`,
      outcome === 'win' ? 1 : 0,
      outcome === 'loss' ? 1 : 0,
      outcome === 'draw' ? 1 : 0,
      streak,
      streak,
      coins,
      trophies,
      uid,
    );
    if (u.is_bot) {
      run('UPDATE users SET xp = xp + ? WHERE id = ?', xp, uid);
    } else {
      addXp(uid, xp);
      if (perfect) grant(uid, 'perfect_match');
      checkStatAchievements(uid);
      const inviter = payReferral(uid);
      if (inviter !== null) defer(() => notifyReferral(inviter, displayName(u)));
    }
    result[String(uid)] = { outcome, coins, xp, trophies, perfect };
  }

  run(
    `UPDATE matches SET status = 'finished', winner = ?, end_reason = ?, result = ?, turn = NULL,
                        deadline = NULL, bot_at = NULL, finished_at = ?, updated_at = ?
     WHERE id = ?`,
    winner,
    reason,
    JSON.stringify(result),
    t,
    t,
    m.id,
  );

  for (const uid of [p1, p2]) {
    const oppId = uid === p1 ? p2 : p1;
    const outcome = result[String(uid)]!.outcome;
    const oppName = displayName(mustUser(oppId));
    const mine = scores.get(uid) ?? 0;
    const theirs = scores.get(oppId) ?? 0;
    defer(() => notifyResult(uid, m.id, outcome, mine, theirs, oppName, reason));
  }
  return mustMatch(m.id);
}

export function resign(matchId: number, uid: number): MatchRow {
  return tx(() => {
    const m = memberMatch(matchId, uid);
    if (m.status === 'finished' || m.status === 'cancelled') throw bad('finished', 'این بازی تمام شده است');
    return finishMatch(m, 'resign', uid);
  });
}

// ───────── نمایش ─────────
type Cell = boolean | null;

interface Grid {
  mine: Cell[][];
  theirs: Cell[][];
  visible: boolean[];
  myScore: number;
  oppScore: number;
}

function loadGrid(m: MatchRow, uid: number): Grid {
  const blank = (): Cell[][] => Array.from({ length: ROUNDS }, () => Array<Cell>(QPR).fill(null));
  const mine = blank();
  const theirs = blank();
  const rows = all<{ user_id: number; slot: number; is_correct: number }>(
    "SELECT user_id, slot, is_correct FROM instances WHERE ctx = 'duel' AND ctx_id = ? AND answered_at IS NOT NULL",
    m.id,
  );
  for (const row of rows) {
    const target = row.user_id === uid ? mine : theirs;
    const line = target[Math.floor(row.slot / QPR)];
    if (line) line[row.slot % QPR] = row.is_correct === 1;
  }
  // نتیجهٔ حریف در هر دور فقط وقتی دیده می‌شود که خودم آن دور را بازی کرده باشم
  const visible = mine.map((line) => m.status === 'finished' || line.every((c) => c !== null));
  const count = (line: Cell[]): number => line.filter((c) => c === true).length;
  return {
    mine,
    theirs,
    visible,
    myScore: mine.reduce((sum, line) => sum + count(line), 0),
    oppScore: theirs.reduce((sum, line, i) => sum + (visible[i] ? count(line) : 0), 0),
  };
}

function summarize(m: MatchRow, uid: number, grid: Grid, opponent: UserRow | null): MatchSummaryDTO {
  return {
    id: m.id,
    code: m.code,
    mode: m.mode,
    status: m.status,
    opponent: opponent ? toPlayer(opponent) : null,
    myScore: grid.myScore,
    oppScore: grid.oppScore,
    turn: m.turn === null ? null : m.turn === uid ? 'me' : 'opp',
    outcome: m.status !== 'finished' ? null : m.winner === 0 ? 'draw' : m.winner === uid ? 'win' : 'loss',
    updatedAt: m.updated_at,
  };
}

function opponentOf(m: MatchRow, uid: number): UserRow | null {
  const oppId = m.p1 === uid ? m.p2 : m.p1;
  return oppId === null ? null : mustUser(oppId);
}

export function toSummary(m: MatchRow, uid: number): MatchSummaryDTO {
  return summarize(m, uid, loadGrid(m, uid), opponentOf(m, uid));
}

export function toMatchDTO(m: MatchRow, uid: number): MatchDTO {
  const grid = loadGrid(m, uid);
  const roundRows = matchRounds(m.id);
  const rounds: RoundDTO[] = [];
  for (let idx = 0; idx < ROUNDS; idx++) {
    const row = roundRows.find((r) => r.idx === idx);
    const visible = grid.visible[idx] ?? false;
    rounds.push({
      idx,
      category: row?.category ?? null,
      chooser: chooserOf(m, idx) === uid ? 'me' : 'opp',
      mine: grid.mine[idx] ?? [],
      theirs: visible ? (grid.theirs[idx] ?? []) : Array<Cell>(QPR).fill(null),
      canReview: Boolean(row?.question_ids) && visible,
    });
  }
  const results = parseJson<Record<string, MatchResultDTO>>(m.result, {});
  return {
    ...summarize(m, uid, grid, opponentOf(m, uid)),
    phase: phaseOf(m, uid),
    rounds,
    endReason: m.end_reason,
    result: results[String(uid)] ?? null,
    deadline: m.deadline,
    shareLink: m.status === 'waiting' && m.mode === 'friend' ? shareLink(`duel_${m.code}`) : null,
  };
}

export function matchFor(matchId: number, uid: number): MatchDTO {
  return toMatchDTO(memberMatch(matchId, uid), uid);
}

export function listMatches(uid: number): MatchSummaryDTO[] {
  const open = all<MatchRow>(
    "SELECT * FROM matches WHERE (p1 = ? OR p2 = ?) AND status IN ('waiting', 'active') ORDER BY updated_at DESC",
    uid,
    uid,
  );
  const done = all<MatchRow>(
    "SELECT * FROM matches WHERE (p1 = ? OR p2 = ?) AND status = 'finished' ORDER BY finished_at DESC LIMIT 10",
    uid,
    uid,
  );
  const list = [...open, ...done].map((m) => toSummary(m, uid));
  const weight = (s: MatchSummaryDTO): number => (s.status === 'finished' ? 2 : s.turn === 'me' ? 0 : 1);
  return list.sort((a, b) => weight(a) - weight(b) || b.updatedAt - a.updatedAt);
}

/** مرور سوال‌های یک دور همراه با پاسخ درست و انتخاب دو بازیکن */
export function review(matchId: number, uid: number, idx: number): ReviewQuestionDTO[] {
  const m = memberMatch(matchId, uid);
  const round = getRound(m.id, idx);
  const ids = parseJson<number[]>(round?.question_ids, []);
  if (!ids.length) throw notFound('این دور هنوز بازی نشده');
  if (m.status !== 'finished' && roundAnswered(m.id, uid, idx) < QPR) {
    throw forbidden('اول باید این دور را بازی کنی');
  }
  const insts = all<InstanceRow>(
    "SELECT * FROM instances WHERE ctx = 'duel' AND ctx_id = ? AND slot BETWEEN ? AND ?",
    m.id,
    idx * QPR,
    idx * QPR + QPR - 1,
  );
  return ids.map((qid, k) => {
    const q = getQuestion(qid);
    const slot = idx * QPR + k;
    const my = insts.find((i) => i.user_id === uid && i.slot === slot);
    const their = insts.find((i) => i.user_id !== uid && i.slot === slot);
    return {
      id: q.id,
      text: q.text,
      options: optionsOf(q),
      correct: q.correct,
      mine: my ? originalChoice(my) : null,
      theirs: their ? originalChoice(their) : null,
    };
  });
}

// ───────── حریف تمرینی (ربات) ─────────
function botAnswer(m: MatchRow, bot: UserRow, slot: number, questionId: number): void {
  const q = getQuestion(questionId);
  const chance = clamp((bot.bot_skill ?? 0.6) + (2 - q.difficulty) * 0.12, 0.15, 0.95);
  const correct = Math.random() < chance;
  const choice = correct ? q.correct : pick([0, 1, 2, 3].filter((i) => i !== q.correct));
  const t = now();
  const r = run(
    `INSERT OR IGNORE INTO instances
       (user_id, ctx, ctx_id, slot, question_id, perm, asked_at, limit_ms, answered_at, choice, is_correct)
     VALUES (?, 'duel', ?, ?, ?, '[0,1,2,3]', ?, ?, ?, ?, ?)`,
    bot.id,
    m.id,
    slot,
    questionId,
    t,
    DUEL_TIME_MS,
    t + randInt(2000, 9000),
    choice,
    correct ? 1 : 0,
  );
  if (r.changes > 0 && correct) {
    run(
      bot.id === m.p1
        ? 'UPDATE matches SET score1 = score1 + 1 WHERE id = ?'
        : 'UPDATE matches SET score2 = score2 + 1 WHERE id = ?',
      m.id,
    );
  }
}

function playBotTurn(matchId: number): void {
  const start = mustMatch(matchId);
  if (start.status !== 'active' || start.turn === null) return;
  const bot = mustUser(start.turn);
  if (!bot.is_bot) {
    run('UPDATE matches SET bot_at = NULL WHERE id = ?', matchId);
    return;
  }
  for (let guard = 0; guard < ROUNDS * 2 + 2; guard++) {
    const m = mustMatch(matchId);
    const phase = phaseOf(m, bot.id);
    const answered = answeredCount(m.id, bot.id);
    const idx = Math.floor(answered / QPR);
    if (phase === 'choose') {
      const round = ensureRound(m, idx);
      setCategory(m, idx, pick(parseJson<string[]>(round.cat_options, [])));
    } else if (phase === 'play') {
      const ids = parseJson<number[]>(getRound(m.id, idx)?.question_ids, []);
      for (let k = answered % QPR; k < QPR; k++) {
        const questionId = ids[k];
        if (questionId !== undefined) botAnswer(m, bot, idx * QPR + k, questionId);
      }
    } else {
      break;
    }
  }
  refreshTurn(matchId);
}

function safely(label: string, fn: () => void): void {
  try {
    tx(fn);
  } catch (err) {
    console.error(`[duel] ${label}:`, err);
  }
}

/** کار دوره‌ای: ورود ربات به بازی‌های بی‌حریف و بازی کردن نوبت ربات‌ها */
export function tickBots(): void {
  const t = now();
  const lonely = all<MatchRow>(
    `SELECT * FROM matches
     WHERE status = 'waiting' AND mode = 'random' AND p2 IS NULL AND turn IS NULL AND updated_at < ?`,
    t - config.botJoinDelaySec * 1000,
  );
  for (const m of lonely) safely('bot join', () => void seat(m, randomBot().id));

  const due = all<MatchRow>(
    "SELECT * FROM matches WHERE status = 'active' AND bot_at IS NOT NULL AND bot_at <= ?",
    t,
  );
  for (const m of due) safely('bot turn', () => playBotTurn(m.id));
}

/** کار دوره‌ای: بستن بازی‌هایی که مهلت نوبتشان گذشته */
export function tickTimeouts(): void {
  const t = now();
  const late = all<MatchRow>(
    "SELECT * FROM matches WHERE status = 'active' AND deadline IS NOT NULL AND deadline < ?",
    t,
  );
  for (const m of late) {
    safely('timeout', () => {
      const fresh = mustMatch(m.id);
      if (fresh.status === 'active' && fresh.turn !== null) finishMatch(fresh, 'timeout', fresh.turn);
    });
  }
  run(
    "UPDATE matches SET status = 'cancelled', turn = NULL, updated_at = ? WHERE status = 'waiting' AND updated_at < ?",
    t,
    t - WAITING_TTL_MS,
  );
}
