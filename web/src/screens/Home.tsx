import { useEffect, useState } from 'react';
import { DAILY_BONUS } from '../../../shared/constants.ts';
import type { MatchDTO, MatchSummaryDTO, MeDTO } from '../../../shared/types.ts';
import { errorText, post } from '../api.ts';
import { useApp } from '../ctx.ts';
import { sfx } from '../sound.ts';
import { haptic } from '../tg.ts';
import { Avatar, Btn, CoinIcon, Coins, LevelPill, Progress, Sheet } from '../ui.tsx';
import { fa, num } from '../util.ts';

function statusOf(m: MatchSummaryDTO): { text: string; tone: 'go' | 'wait' | 'win' | 'loss' | 'draw' } {
  if (m.status === 'finished') {
    if (m.outcome === 'win') return { text: 'بردی', tone: 'win' };
    if (m.outcome === 'loss') return { text: 'باختی', tone: 'loss' };
    return { text: 'مساوی', tone: 'draw' };
  }
  if (m.turn === 'me') return { text: 'نوبت تو', tone: 'go' };
  if (!m.opponent) return { text: 'در انتظار حریف', tone: 'wait' };
  return { text: 'نوبت حریف', tone: 'wait' };
}

function MatchCard({ match, onOpen }: { match: MatchSummaryDTO; onOpen: () => void }) {
  const status = statusOf(match);
  return (
    <button type="button" className={`match-card match-card--${status.tone}`} onClick={onOpen}>
      <Avatar player={match.opponent} size={46} />
      <span className="match-card__body">
        <b>{match.opponent?.name ?? (match.mode === 'friend' ? 'منتظر دوستت…' : 'در جست‌وجوی حریف…')}</b>
        <small>{match.mode === 'friend' ? 'دوئل دوستانه' : 'دوئل شانسی'}</small>
      </span>
      <span className="match-card__score">
        {fa(match.myScore)} <i>–</i> {fa(match.oppScore)}
      </span>
      <span className={`chip chip--${status.tone}`}>{status.text}</span>
    </button>
  );
}

export function Home() {
  const { me, home, refresh, go, tab, toast, setMe } = useApp();
  const [busy, setBusy] = useState<'' | 'random' | 'friend'>('');
  const [bonusOpen, setBonusOpen] = useState(me.dailyBonus.available);
  const [claiming, setClaiming] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const joinByCode = async (): Promise<void> => {
    setJoining(true);
    try {
      const match = await post<MatchDTO>('/matches/join', { code: code.trim().toLowerCase() });
      setCodeOpen(false);
      setCode('');
      go({ name: 'match', id: match.id });
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setJoining(false);
    }
  };

  // به‌روزرسانی دوره‌ای فهرست بازی‌ها
  useEffect(() => {
    const tick = (): void => {
      if (!document.hidden) refresh().catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 6000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const start = async (mode: 'random' | 'friend'): Promise<void> => {
    if (busy) return;
    setBusy(mode);
    try {
      const match = await post<MatchDTO>(`/matches/${mode}`);
      go({ name: 'match', id: match.id });
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy('');
    }
  };

  const claimBonus = async (): Promise<void> => {
    setClaiming(true);
    try {
      const res = await post<{ amount: number; me: MeDTO }>('/bonus');
      setMe(res.me);
      sfx.coin();
      haptic('success');
      toast(`${fa(res.amount)} سکه گرفتی!`, 'success');
      setBonusOpen(false);
    } catch (err) {
      toast(errorText(err), 'error');
      setBonusOpen(false);
    } finally {
      setClaiming(false);
    }
  };

  const open = home.matches.filter((m) => m.status !== 'finished');
  const done = home.matches.filter((m) => m.status === 'finished');
  const myTurns = open.filter((m) => m.turn === 'me').length;
  const bonus = me.dailyBonus;

  return (
    <div className="page page--home">
      <header className="topbar">
        <button type="button" className="topbar__user" onClick={() => tab('profile')}>
          <Avatar player={me} size={48} />
          <span className="topbar__info">
            <b>{me.name}</b>
            <span className="topbar__level">
              <LevelPill level={me.level} />
              <Progress value={me.levelInto / me.levelNeed} />
            </span>
          </span>
        </button>
        <button type="button" className="pill" onClick={() => tab('leaderboard')}>
          🏆 <b>{num(me.trophies)}</b>
        </button>
        <button type="button" className="pill pill--coin" onClick={() => tab('shop')}>
          <CoinIcon /> <b>{num(me.coins)}</b>
        </button>
      </header>

      <section className="hero">
        <div className="hero__text">
          <h2>دوئل اطلاعات عمومی</h2>
          <p>۵ دور، ۱۵ سوال، یک برنده. بلدی؟ ثابت کن!</p>
        </div>
        <Btn kind="accent" block loading={busy === 'random'} disabled={busy !== ''} onClick={() => void start('random')}>
          ⚔️ شروع دوئل
        </Btn>
        <Btn kind="soft" block loading={busy === 'friend'} disabled={busy !== ''} onClick={() => void start('friend')}>
          👥 بازی با دوست
        </Btn>
        <button type="button" className="join-line" onClick={() => setCodeOpen(true)}>
          کد دعوت داری؟
        </button>
      </section>

      <section className="modes">
        <button type="button" className="mode mode--daily" onClick={() => go({ name: 'daily' })}>
          <span className="mode__icon">📅</span>
          <b>چالش روزانه</b>
          <small>{home.dailyPlayed ? 'امروز بازی کردی ✓' : '۱۰ سوال، فقط یک فرصت'}</small>
          {!home.dailyPlayed && <i className="mode__dot" />}
        </button>
        <button type="button" className="mode mode--survival" onClick={() => go({ name: 'survival' })}>
          <span className="mode__icon">🛡️</span>
          <b>بقا</b>
          <small>{me.survivalBest > 0 ? `رکورد تو: ${fa(me.survivalBest)}` : 'تا کجا دوام می‌آوری؟'}</small>
        </button>
        <button type="button" className="mode mode--factory" onClick={() => go({ name: 'factory' })}>
          <span className="mode__icon">✍️</span>
          <b>سوال‌ساز</b>
          <small>سوال بساز، سکه بگیر</small>
        </button>
        <button
          type="button"
          className="mode mode--bonus"
          onClick={() => (bonus.available ? setBonusOpen(true) : toast('جایزهٔ امروز را گرفته‌ای؛ فردا دوباره بیا!'))}
        >
          <span className="mode__icon">🎁</span>
          <b>جایزهٔ روزانه</b>
          <small>{bonus.available ? `${fa(bonus.amount)} سکه منتظر توست` : `${fa(bonus.streak)} روز پیاپی`}</small>
          {bonus.available && <i className="mode__dot" />}
        </button>
      </section>

      <section className="section">
        <h3 className="section__title">
          بازی‌های در جریان
          {myTurns > 0 && <span className="badge">{fa(myTurns)}</span>}
        </h3>
        {open.length === 0 ? (
          <p className="section__empty">هنوز بازی‌ای در جریان نیست. یک دوئل شروع کن!</p>
        ) : (
          <div className="match-list">
            {open.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={() => go({ name: 'match', id: m.id })} />
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section className="section">
          <h3 className="section__title">بازی‌های اخیر</h3>
          <div className="match-list">
            {done.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={() => go({ name: 'match', id: m.id })} />
            ))}
          </div>
        </section>
      )}

      <Sheet open={codeOpen} onClose={() => setCodeOpen(false)}>
        <h2>ورود با کد دعوت</h2>
        <p className="muted" style={{ textAlign: 'center' }}>
          کدی را که دوستت فرستاده وارد کن.
        </p>
        <input
          className="input"
          dir="ltr"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={16}
          placeholder="abcd2345"
          style={{ textAlign: 'center', letterSpacing: 3 }}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Btn kind="accent" block disabled={code.trim().length < 4} loading={joining} onClick={() => void joinByCode()}>
          ورود به بازی
        </Btn>
      </Sheet>

      <Sheet open={bonusOpen && bonus.available} onClose={() => setBonusOpen(false)}>
        <div className="bonus">
          <div className="bonus__gift">🎁</div>
          <h2>جایزهٔ روزانه</h2>
          <p className="muted">هر روز سر بزن تا جایزهٔ بزرگ‌تری بگیری.</p>
          <div className="bonus__days">
            {DAILY_BONUS.map((amount, i) => {
              const day = i + 1;
              const state = day < bonus.day ? 'done' : day === bonus.day ? 'today' : 'next';
              return (
                <div key={day} className={`bonus__day bonus__day--${state}`}>
                  <small>روز {fa(day)}</small>
                  <CoinIcon size={20} />
                  <b>{fa(amount)}</b>
                </div>
              );
            })}
          </div>
          <Btn kind="accent" block loading={claiming} onClick={() => void claimBonus()}>
            دریافت <Coins value={bonus.amount} />
          </Btn>
        </div>
      </Sheet>
    </div>
  );
}
