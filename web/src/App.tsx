import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACHIEVEMENTS } from '../../shared/constants.ts';
import type { HomeDTO, MatchDTO, MeDTO } from '../../shared/types.ts';
import { ApiFail, errorText, get, hasAuth, post } from './api.ts';
import { AppContext } from './ctx.ts';
import type { AppCtx, ConfirmOptions, Route, TabName } from './ctx.ts';
import { Admin } from './screens/Admin.tsx';
import { Daily } from './screens/Daily.tsx';
import { Factory } from './screens/Factory.tsx';
import { Help } from './screens/Help.tsx';
import { Home } from './screens/Home.tsx';
import { Leaderboard } from './screens/Leaderboard.tsx';
import { Match } from './screens/Match.tsx';
import { Play } from './screens/Play.tsx';
import { Profile } from './screens/Profile.tsx';
import { Review } from './screens/Review.tsx';
import { Shop } from './screens/Shop.tsx';
import { Survival } from './screens/Survival.tsx';
import { sfx } from './sound.ts';
import { bindBackButton, getStartParam, haptic, initTelegram } from './tg.ts';
import { Btn, Coins, Logo, Sheet } from './ui.tsx';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

interface Dialog extends ConfirmOptions {
  resolve(value: boolean): void;
}

const TABS: { name: TabName; label: string; icon: string }[] = [
  { name: 'home', label: 'خانه', icon: '🏠' },
  { name: 'leaderboard', label: 'رده‌بندی', icon: '🏆' },
  { name: 'shop', label: 'فروشگاه', icon: '🛍️' },
  { name: 'profile', label: 'پروفایل', icon: '👤' },
];

function routeKey(route: Route, depth: number): string {
  switch (route.name) {
    case 'match':
      return `match-${route.id}`;
    case 'profile':
      return `profile-${route.id ?? 'me'}`;
    case 'review':
      return `review-${route.matchId}-${route.round}`;
    case 'play':
      return `play-${depth}-${route.source.ctx}`;
    default:
      return route.name;
  }
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'leaderboard':
      return <Leaderboard />;
    case 'shop':
      return <Shop />;
    case 'profile':
      return <Profile id={route.id} />;
    case 'match':
      return <Match id={route.id} />;
    case 'play':
      return <Play source={route.source} />;
    case 'review':
      return <Review matchId={route.matchId} round={route.round} />;
    case 'daily':
      return <Daily />;
    case 'survival':
      return <Survival />;
    case 'factory':
      return <Factory />;
    case 'admin':
      return <Admin />;
    case 'help':
      return <Help />;
  }
}

export function App() {
  const [status, setStatus] = useState<'boot' | 'ready' | 'noauth' | 'fail'>('boot');
  const [failText, setFailText] = useState('');
  const [home, setHome] = useState<HomeDTO | null>(null);
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const guardRef = useRef<(() => Promise<boolean>) | null>(null);
  const toastId = useRef(0);

  const toast = useCallback<AppCtx['toast']>((text, kind = 'info') => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, text, kind }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2800);
  }, []);

  const refresh = useCallback(async () => {
    const data = await get<HomeDTO>('/home');
    setHome(data);
    if (data.newAchievements.length) setUnlocked((list) => [...list, ...data.newAchievements]);
  }, []);

  const setMe = useCallback((me: MeDTO) => {
    setHome((h) => (h ? { ...h, me } : h));
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })),
    [],
  );

  const go = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  const replace = useCallback((route: Route) => setStack((s) => [...s.slice(0, -1), route]), []);
  const tab = useCallback((name: TabName) => setStack([{ name }]), []);
  const back = useCallback(() => {
    const pop = (): void => setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: 'home' }]));
    const guard = guardRef.current;
    if (!guard) {
      pop();
      return;
    }
    void guard().then((ok) => {
      if (ok) pop();
    });
  }, []);
  const setGuard = useCallback<AppCtx['setGuard']>((guard) => {
    guardRef.current = guard;
  }, []);

  // ───────── راه‌اندازی ─────────
  const boot = useCallback(async () => {
    setStatus('boot');
    await initTelegram();
    if (!hasAuth()) {
      setStatus('noauth');
      return;
    }
    try {
      await refresh();
    } catch (err) {
      if (err instanceof ApiFail && err.status === 401) {
        setStatus('noauth');
      } else {
        setFailText(errorText(err));
        setStatus('fail');
      }
      return;
    }
    setStatus('ready');

    // پارامتر شروع: دعوت به دوئل، باز کردن یک بازی یا رده‌بندی
    const param = getStartParam();
    try {
      if (param.startsWith('duel_')) {
        const match = await post<MatchDTO>('/matches/join', { code: param.slice(5) });
        setStack([{ name: 'home' }, { name: 'match', id: match.id }]);
      } else if (/^match_\d+$/.test(param)) {
        setStack([{ name: 'home' }, { name: 'match', id: Number(param.slice(6)) }]);
      } else if (param === 'leaderboard') {
        setStack([{ name: 'leaderboard' }]);
      }
    } catch (err) {
      toast(errorText(err), 'error');
    }
  }, [refresh, toast]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const depth = stack.length;
  useEffect(() => bindBackButton(depth > 1, back), [depth, back]);

  const route = stack[depth - 1] ?? { name: 'home' };

  const ctx = useMemo<AppCtx | null>(
    () =>
      home
        ? { me: home.me, config: home.config, home, setMe, refresh, toast, confirm, go, replace, back, tab, setGuard }
        : null,
    [home, setMe, refresh, toast, confirm, go, replace, back, tab, setGuard],
  );

  if (status === 'boot' || (status === 'ready' && !ctx)) {
    return (
      <div className="splash">
        <div className="splash__logo">
          <Logo size={92} />
        </div>
        <h1 className="wordmark">بلد باش</h1>
        <p className="muted">بلدی؟ ثابت کن!</p>
        <span className="spinner" />
      </div>
    );
  }

  if (status === 'noauth') {
    return (
      <div className="splash">
        <Logo size={80} />
        <h1 className="wordmark">بلد باش</h1>
        <p className="splash__text">این بازی داخل تلگرام اجرا می‌شود. ربات را در تلگرام باز کن و دکمهٔ «شروع بازی» را بزن.</p>
      </div>
    );
  }

  if (status === 'fail' || !ctx) {
    return (
      <div className="splash">
        <Logo size={80} />
        <h1 className="wordmark">بلد باش</h1>
        <p className="splash__text">{failText || 'اتصال برقرار نشد.'}</p>
        <Btn onClick={() => void boot()}>تلاش دوباره</Btn>
      </div>
    );
  }

  const isTabRoot = depth === 1 && TABS.some((t) => t.name === route.name) && !(route.name === 'profile' && route.id);
  const medal = unlocked.length ? ACHIEVEMENTS.find((a) => a.key === unlocked[0]) : undefined;

  const closeDialog = (value: boolean): void => {
    dialog?.resolve(value);
    setDialog(null);
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className={`app${isTabRoot ? ' app--tabs' : ''}`}>
        <main className="screen" key={routeKey(route, depth)}>
          <Screen route={route} />
        </main>

        {isTabRoot && (
          <nav className="tabbar">
            {TABS.map((t) => (
              <button
                key={t.name}
                type="button"
                className={`tabbar__item${route.name === t.name ? ' is-active' : ''}`}
                onClick={() => {
                  haptic('select');
                  tab(t.name);
                }}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        )}

        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>

        <Sheet open={dialog !== null} onClose={() => closeDialog(false)} center>
          {dialog && (
            <>
              <h2>{dialog.title}</h2>
              {dialog.text && <p className="muted">{dialog.text}</p>}
              <div className="dialog__actions">
                <Btn kind="ghost" block onClick={() => closeDialog(false)}>
                  {dialog.no ?? 'نه'}
                </Btn>
                <Btn kind={dialog.danger ? 'danger' : 'primary'} block onClick={() => closeDialog(true)}>
                  {dialog.yes ?? 'آره'}
                </Btn>
              </div>
            </>
          )}
        </Sheet>

        <Sheet open={Boolean(medal) && dialog === null} center>
          {medal && (
            <div className="medal-pop">
              <div className="medal-pop__emoji">{medal.emoji}</div>
              <p className="muted">مدال تازه گرفتی!</p>
              <h2>{medal.title}</h2>
              <p>{medal.desc}</p>
              <div className="medal-pop__reward">
                <Coins value={medal.reward} sign size={22} />
              </div>
              <Btn
                kind="accent"
                block
                onClick={() => {
                  sfx.coin();
                  setUnlocked((list) => list.slice(1));
                }}
              >
                ایول!
              </Btn>
            </div>
          )}
        </Sheet>
      </div>
    </AppContext.Provider>
  );
}
