// صفحهٔ بازی: انتخاب موضوع و پاسخ به سوال‌ها (مشترک بین دوئل، چالش روزانه و بقا)
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DAILY_QUESTIONS, LIFELINES, ROUNDS, SURVIVAL_LIVES, categoryOf } from '../../../shared/constants.ts';
import type { LifelineId } from '../../../shared/constants.ts';
import type { AnswerDTO, LifelineDTO, NextDTO } from '../../../shared/types.ts';
import { errorText, post } from '../api.ts';
import { useApp } from '../ctx.ts';
import type { PlaySource } from '../ctx.ts';
import { sfx } from '../sound.ts';
import { haptic, setClosingConfirmation } from '../tg.ts';
import { Btn, CategoryBadge, CoinIcon, Empty, Spinner } from '../ui.tsx';
import { fa, num } from '../util.ts';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
const RING = 2 * Math.PI * 27;
const LIFELINE_ORDER: LifelineId[] = ['fifty', 'time', 'audience'];

export function Play({ source }: { source: PlaySource }) {
  const { me, setMe, back, toast, confirm, setGuard, refresh } = useApp();
  const [step, setStep] = useState<NextDTO | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<AnswerDTO | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const [used, setUsed] = useState<LifelineId[]>([]);
  const [audience, setAudience] = useState<number[] | null>(null);
  const [leftMs, setLeftMs] = useState(0);
  const [limitMs, setLimitMs] = useState(1);
  const [coins, setCoins] = useState(me.coins);
  const [lives, setLives] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [helping, setHelping] = useState(false);

  const alive = useRef(true);
  const started = useRef(false);
  const answering = useRef(false);
  const deadline = useRef(0);
  const lastTick = useRef(0);
  const inQuestion = useRef(false);

  const nextPath =
    source.ctx === 'duel' ? `/matches/${source.matchId}/next` : source.ctx === 'daily' ? '/daily/next' : '/survival/next';
  const firstPath = source.ctx === 'survival' && source.fresh ? '/survival/start' : nextPath;

  const leave = useCallback(() => {
    inQuestion.current = false;
    setGuard(null);
    setClosingConfirmation(false);
    refresh().catch(() => undefined);
    back();
  }, [back, refresh, setGuard]);

  const apply = useCallback(
    (next: NextDTO) => {
      if (next.state === 'wait' || next.state === 'finished') {
        leave();
        return;
      }
      setStep(next);
      setChoosing(null);
      inQuestion.current = next.state === 'question';
      if (next.state === 'question') {
        const q = next.question;
        setPicked(null);
        setVerdict(null);
        setAudience(null);
        setRemoved(q.removed);
        setUsed(q.used);
        setLimitMs(q.limitMs);
        setLeftMs(q.remainingMs);
        deadline.current = performance.now() + q.remainingMs;
        lastTick.current = 0;
        answering.current = false;
        if (q.lives !== null) setLives(q.lives);
        if (q.score !== null) setScore(q.score);
      }
    },
    [leave],
  );

  const load = useCallback(
    async (path: string) => {
      try {
        const next = await post<NextDTO>(path);
        if (!alive.current) return;
        setError('');
        apply(next);
      } catch (err) {
        if (alive.current) setError(errorText(err));
      }
    },
    [apply],
  );

  useEffect(() => {
    alive.current = true;
    if (!started.current) {
      started.current = true;
      void load(firstPath);
    }
    return () => {
      alive.current = false;
    };
  }, [load, firstPath]);

  // نگهبان خروج وسط سوال
  useEffect(() => {
    setClosingConfirmation(true);
    setGuard(() =>
      inQuestion.current
        ? confirm({
            title: 'از بازی خارج می‌شوی؟',
            text: 'اگر وسط سوال بروی، زمان همین سوال می‌سوزد.',
            yes: 'خروج',
            no: 'می‌مانم',
            danger: true,
          })
        : Promise.resolve(true),
    );
    return () => {
      setGuard(null);
      setClosingConfirmation(false);
    };
  }, [confirm, setGuard]);

  const question = step?.state === 'question' ? step.question : null;
  const instanceId = question?.instanceId ?? 0;

  const submit = useCallback(
    async (choice: number) => {
      if (answering.current || !instanceId) return;
      answering.current = true;
      setPicked(choice);
      try {
        const res = await post<AnswerDTO>('/answer', { instanceId, choice });
        if (!alive.current) return;
        inQuestion.current = false;
        setVerdict(res);
        if (res.correct) {
          sfx.correct();
          haptic('success');
        } else {
          sfx.wrong();
          haptic('error');
        }
        if (res.lives !== undefined) setLives(res.lives);
        if (res.score !== undefined) setScore(res.score);
        await sleep(res.correct ? 1100 : 1800);
        if (alive.current) await load(nextPath);
      } catch (err) {
        if (!alive.current) return;
        toast(errorText(err), 'error');
        setPicked(null);
        await sleep(1500);
        answering.current = false;
      }
    },
    [instanceId, load, nextPath, toast],
  );

  // تایمر
  const running = question !== null && verdict === null;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const left = Math.max(0, deadline.current - performance.now());
      setLeftMs(left);
      const sec = Math.ceil(left / 1000);
      if (sec > 0 && sec <= 5 && sec !== lastTick.current && !answering.current) {
        lastTick.current = sec;
        sfx.tick();
      }
      if (left <= 0) void submit(-1);
    }, 100);
    return () => window.clearInterval(timer);
  }, [running, submit]);

  const useHelp = async (type: LifelineId): Promise<void> => {
    if (!question || verdict || answering.current || helping || used.includes(type)) return;
    if (coins < LIFELINES[type].cost) {
      toast('سکهٔ کافی نداری', 'error');
      return;
    }
    setHelping(true);
    try {
      const res = await post<LifelineDTO>('/lifeline', { instanceId: question.instanceId, type });
      if (!alive.current) return;
      haptic('select');
      setCoins(res.coins);
      setMe({ ...me, coins: res.coins });
      setUsed((list) => [...list, type]);
      if (res.removed) setRemoved(res.removed);
      if (res.audience) setAudience(res.audience);
      if (res.remainingMs !== undefined && res.limitMs !== undefined) {
        deadline.current = performance.now() + res.remainingMs;
        setLimitMs(res.limitMs);
        setLeftMs(res.remainingMs);
      }
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setHelping(false);
    }
  };

  const choose = async (category: string): Promise<void> => {
    if (choosing || source.ctx !== 'duel') return;
    setChoosing(category);
    haptic('select');
    try {
      const next = await post<NextDTO>(`/matches/${source.matchId}/category`, { category });
      if (alive.current) apply(next);
    } catch (err) {
      if (!alive.current) return;
      toast(errorText(err), 'error');
      setChoosing(null);
    }
  };

  const exit = (): void => back();

  // ───────── حالت‌های بارگذاری و خطا ─────────
  if (error && !step) {
    return (
      <div className="page page--play">
        <Empty emoji="😕" text={error}>
          <Btn onClick={() => void load(firstPath)}>تلاش دوباره</Btn>
          <Btn kind="ghost" onClick={leave}>
            بازگشت
          </Btn>
        </Empty>
      </div>
    );
  }
  if (!step) {
    return (
      <div className="page page--play">
        <Spinner label="در حال آماده‌سازی…" />
      </div>
    );
  }

  // ───────── انتخاب موضوع ─────────
  if (step.state === 'choose') {
    return (
      <div className="page page--play">
        <header className="play-top">
          <button type="button" className="icon-btn" onClick={exit} aria-label="بستن">
            ✕
          </button>
          <span className="play-top__title">
            دور {fa(step.round + 1)} از {fa(ROUNDS)}
          </span>
          <span className="icon-btn icon-btn--blank" />
        </header>
        <div className="choose">
          <h2>موضوع این دور را انتخاب کن</h2>
          <p className="muted">هر دوی شما به سه سوال از همین موضوع جواب می‌دهید.</p>
          <div className="choose__list">
            {step.options.map((id) => {
              const cat = categoryOf(id);
              if (!cat) return null;
              return (
                <button
                  type="button"
                  key={id}
                  className={`choose__card${choosing === id ? ' is-picked' : ''}`}
                  style={{ '--cat': cat.color } as CSSProperties}
                  disabled={choosing !== null}
                  onClick={() => void choose(id)}
                >
                  <span className="choose__emoji">{cat.emoji}</span>
                  <b>{cat.title}</b>
                  {choosing === id && <span className="spinner spinner--small" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!question) return null;

  // ───────── سوال ─────────
  const seconds = Math.ceil(leftMs / 1000);
  const ratio = Math.min(1, leftMs / limitMs);
  const urgency = seconds <= 5 ? 'danger' : ratio < 0.5 ? 'warn' : 'ok';
  const total = question.total;

  let title: string;
  if (source.ctx === 'duel') title = `دور ${fa((question.round ?? 0) + 1)} از ${fa(ROUNDS)}`;
  else if (source.ctx === 'daily') title = 'چالش روزانه';
  else title = 'بقا';

  const verdictText = verdict
    ? verdict.correct
      ? 'آفرین! درست بود ✅'
      : verdict.timedOut
        ? 'زمان تمام شد ⏰'
        : 'اشتباه بود ❌'
    : '';

  return (
    <div className="page page--play">
      <header className="play-top">
        <button type="button" className="icon-btn" onClick={exit} aria-label="بستن">
          ✕
        </button>
        <span className="play-top__title">{title}</span>
        <span className="pill pill--coin">
          <CoinIcon /> <b>{num(coins)}</b>
        </span>
      </header>

      <div className="play-meta">
        {source.ctx === 'survival' ? (
          <>
            <span className="lives">
              {Array.from({ length: SURVIVAL_LIVES }, (_, i) => (
                <i key={i} className={i < (lives ?? 0) ? 'on' : ''}>
                  ❤️
                </i>
              ))}
            </span>
            <span className="play-meta__score">امتیاز: {fa(score ?? 0)}</span>
          </>
        ) : (
          <span className="steps">
            {Array.from({ length: total ?? DAILY_QUESTIONS }, (_, i) => (
              <i key={i} className={i + 1 < question.index ? 'done' : i + 1 === question.index ? 'now' : ''} />
            ))}
          </span>
        )}
      </div>

      <div className={`timer timer--${urgency}`}>
        <svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true">
          <circle className="timer__track" cx="32" cy="32" r="27" />
          <circle
            className="timer__bar"
            cx="32"
            cy="32"
            r="27"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - ratio)}
          />
        </svg>
        <b>{fa(Math.max(0, seconds))}</b>
      </div>

      <section className="qcard" key={question.instanceId}>
        <CategoryBadge id={question.category} />
        <p>{question.text}</p>
      </section>

      <section className="options">
        {question.options.map((text, i) => {
          const isRemoved = removed.includes(i);
          let state = '';
          if (verdict) {
            if (i === verdict.correctIndex) state = ' is-correct';
            else if (i === verdict.choice) state = ' is-wrong';
            else state = ' is-dim';
          } else if (isRemoved) state = ' is-removed';
          else if (picked === i) state = ' is-picked';
          const share = audience && !isRemoved ? audience[i] ?? 0 : null;
          return (
            <button
              type="button"
              key={i}
              className={`option${state}`}
              disabled={isRemoved || picked !== null || verdict !== null}
              onClick={() => {
                haptic('tap');
                void submit(i);
              }}
            >
              {share !== null && <i className="option__share" style={{ width: `${share}%` }} />}
              <span>{text}</span>
              {share !== null && <small>{fa(share)}٪</small>}
            </button>
          );
        })}
      </section>

      <p className={`verdict${verdict ? (verdict.correct ? ' verdict--ok' : ' verdict--no') : ''}`}>{verdictText}</p>

      <footer className="lifelines">
        {LIFELINE_ORDER.map((type) => {
          const item = LIFELINES[type];
          const isUsed = used.includes(type);
          return (
            <button
              type="button"
              key={type}
              className={`lifeline${isUsed ? ' is-used' : ''}`}
              disabled={isUsed || verdict !== null || picked !== null || helping}
              onClick={() => void useHelp(type)}
            >
              <span className="lifeline__emoji">{item.emoji}</span>
              <b>{item.title}</b>
              <small>
                <CoinIcon size={13} /> {fa(item.cost)}
              </small>
            </button>
          );
        })}
      </footer>
    </div>
  );
}
