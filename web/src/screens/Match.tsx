import { useCallback, useEffect, useRef, useState } from 'react';
import { ROUNDS } from '../../../shared/constants.ts';
import type { MatchDTO } from '../../../shared/types.ts';
import { errorText, get, post } from '../api.ts';
import { useApp } from '../ctx.ts';
import { sfx } from '../sound.ts';
import { copyText, haptic, shareLink } from '../tg.ts';
import { Avatar, Btn, CategoryBadge, Coins, Dots, Empty, LevelPill, PageHeader, Spinner } from '../ui.tsx';
import { duration, fa } from '../util.ts';

const OUTCOME = {
  win: { title: 'بردی! 🎉', tone: 'win' },
  loss: { title: 'این بار نشد…', tone: 'loss' },
  draw: { title: 'مساوی شد!', tone: 'draw' },
} as const;

export function Match({ id }: { id: number }) {
  const { me, go, back, replace, toast, confirm, refresh } = useApp();
  const [match, setMatch] = useState<MatchDTO | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const settled = useRef(false);
  const celebrated = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await get<MatchDTO>(`/matches/${id}`);
      setMatch(data);
      setError('');
      settled.current = data.status === 'finished' || data.status === 'cancelled';
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden && !settled.current) void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  // جشن پایان بازی (فقط یک بار)
  const outcome = match?.status === 'finished' ? match.outcome : null;
  useEffect(() => {
    if (!outcome || celebrated.current) return;
    celebrated.current = true;
    if (outcome === 'loss') sfx.lose();
    else sfx.win();
    haptic(outcome === 'loss' ? 'warning' : 'success');
    refresh().catch(() => undefined);
  }, [outcome, refresh]);

  if (!match) {
    return (
      <div className="page">
        <PageHeader title="دوئل" onBack={back} />
        {error ? (
          <Empty emoji="😕" text={error}>
            <Btn onClick={() => void load()}>تلاش دوباره</Btn>
          </Empty>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  const act = async (name: string, fn: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(name);
    try {
      await fn();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const resign = async (): Promise<void> => {
    const waiting = match.status === 'waiting';
    const ok = await confirm({
      title: waiting ? 'این بازی لغو شود؟' : 'انصراف می‌دهی؟',
      text: waiting ? undefined : 'با انصراف، این دوئل را می‌بازی.',
      yes: waiting ? 'لغو بازی' : 'انصراف',
      no: 'ادامه می‌دهم',
      danger: true,
    });
    if (!ok) return;
    await act('resign', async () => {
      const data = await post<MatchDTO>(`/matches/${id}/resign`);
      setMatch(data);
      settled.current = true;
      if (data.status === 'cancelled') {
        void refresh().catch(() => undefined);
        back();
      }
    });
  };

  const rematch = (): Promise<void> =>
    act('rematch', async () => {
      const fresh = await post<MatchDTO>(`/matches/${id}/rematch`);
      if (fresh.opponent === null) toast('درخواست بازی دوباره برای حریف فرستاده شد', 'success');
      replace({ name: 'match', id: fresh.id });
    });

  const invite = async (): Promise<void> => {
    if (match.shareLink) {
      const shared = await shareLink(match.shareLink, `${me.name} تو را به دوئل «بلد باش» دعوت کرده! بلدی؟ ثابت کن 😎`);
      if (!shared) toast('لینک دعوت کپی شد', 'success');
    } else {
      const copied = await copyText(match.code);
      toast(copied ? 'کد دعوت کپی شد' : `کد دعوت: ${match.code}`, 'success');
    }
  };

  const open = match.status === 'waiting' || match.status === 'active';
  const canPlay = open && (match.phase === 'choose' || match.phase === 'play');
  const result = match.result;
  const waitingFriend = match.status === 'waiting' && match.mode === 'friend';

  let banner: { title: string; text?: string; tone: string };
  if (match.status === 'finished' && match.outcome) {
    const why =
      match.endReason === 'timeout'
        ? match.outcome === 'win'
          ? 'حریف سر وقت بازی نکرد.'
          : 'مهلت نوبتت تمام شد.'
        : match.endReason === 'resign'
          ? match.outcome === 'win'
            ? 'حریف انصراف داد.'
            : 'انصراف دادی.'
          : undefined;
    banner = { ...OUTCOME[match.outcome], text: why };
  } else if (match.status === 'cancelled') {
    banner = { title: 'این بازی لغو شد', tone: 'wait' };
  } else if (canPlay) {
    banner = {
      title: 'نوبت توئه!',
      text: match.deadline
        ? `${duration(match.deadline - Date.now())} فرصت داری`
        : match.opponent
          ? undefined
          : 'تا حریف برسد، دور اول را بازی کن.',
      tone: 'go',
    };
  } else if (!match.opponent) {
    banner = waitingFriend
      ? { title: 'منتظر دوستت…', text: 'دعوت‌نامه را برایش بفرست تا بازی شروع شود.', tone: 'wait' }
      : { title: 'در جست‌وجوی حریف…', text: 'به‌محض پیدا شدن حریف خبرت می‌کنیم.', tone: 'wait' };
  } else {
    banner = { title: `منتظر ${match.opponent.name}…`, text: 'وقتی بازی کرد، ربات خبرت می‌کند.', tone: 'wait' };
  }

  return (
    <div className="page page--match">
      <PageHeader
        title={match.mode === 'friend' ? 'دوئل دوستانه' : 'دوئل'}
        onBack={back}
        right={
          open && (
            <button type="button" className="icon-btn" onClick={() => void resign()} aria-label="انصراف" title="انصراف">
              🏳️
            </button>
          )
        }
      />

      <section className="versus">
        <div className="versus__side">
          <Avatar player={me} size={68} />
          <b>{me.name}</b>
          <LevelPill level={me.level} />
        </div>
        <div className="versus__score">
          <span>{fa(match.myScore)}</span>
          <i>:</i>
          <span>{fa(match.oppScore)}</span>
        </div>
        <button
          type="button"
          className="versus__side"
          disabled={!match.opponent}
          onClick={() => match.opponent && go({ name: 'profile', id: match.opponent.id })}
        >
          <span className={match.opponent ? '' : 'pulse'}>
            <Avatar player={match.opponent} size={68} />
          </span>
          <b>{match.opponent?.name ?? '؟؟؟'}</b>
          {match.opponent ? (
            match.opponent.isBot ? (
              <span className="tag">حریف تمرینی</span>
            ) : (
              <LevelPill level={match.opponent.level} />
            )
          ) : (
            <span className="tag">در انتظار</span>
          )}
        </button>
      </section>

      <section className={`banner banner--${banner.tone}`}>
        <b>{banner.title}</b>
        {banner.text && <small>{banner.text}</small>}
        {result && (
          <div className="banner__rewards">
            <Coins value={result.coins} sign />
            <span>⭐ +{fa(result.xp)}</span>
            <span>
              🏆 {result.trophies >= 0 ? '+' : '−'}
              {fa(Math.abs(result.trophies))}
            </span>
          </div>
        )}
        {result?.perfect && <small>💎 بازی بی‌نقص!</small>}
      </section>

      <section className="rounds">
        {match.rounds.map((r) => (
          <button
            type="button"
            key={r.idx}
            className="round"
            disabled={!r.canReview}
            onClick={() => go({ name: 'review', matchId: match.id, round: r.idx })}
          >
            <Dots cells={r.mine} />
            <span className="round__mid">
              {r.category ? (
                <CategoryBadge id={r.category} />
              ) : (
                <span className="round__pending">
                  دور {fa(r.idx + 1)} از {fa(ROUNDS)}
                </span>
              )}
              <small>{r.category ? `دور ${fa(r.idx + 1)}` : r.chooser === 'me' ? 'انتخاب موضوع با تو' : 'انتخاب موضوع با حریف'}</small>
            </span>
            <Dots cells={r.theirs} />
          </button>
        ))}
        <p className="rounds__hint">برای مرور سوال‌های هر دور، بعد از بازی روی آن بزن.</p>
      </section>

      <footer className="page__footer">
        {waitingFriend && (
          <>
            <Btn kind={canPlay ? 'soft' : 'accent'} block onClick={() => void invite()}>
              📨 ارسال دعوت‌نامه
            </Btn>
            <p className="code-line">
              کد دعوت: <b dir="ltr">{match.code}</b>
            </p>
          </>
        )}
        {canPlay && (
          <Btn kind="accent" block onClick={() => go({ name: 'play', source: { ctx: 'duel', matchId: match.id } })}>
            {match.phase === 'choose' ? '🎯 انتخاب موضوع و بازی' : '▶️ بازی کن'}
          </Btn>
        )}
        {match.status === 'finished' && (
          <>
            <Btn kind="accent" block loading={busy === 'rematch'} onClick={() => void rematch()}>
              🔁 بازی دوباره
            </Btn>
            <Btn kind="ghost" block onClick={back}>
              بازگشت
            </Btn>
          </>
        )}
      </footer>
    </div>
  );
}
