import { useEffect, useState } from 'react';
import type { LeaderboardDTO } from '../../../shared/types.ts';
import { Board } from '../Board.tsx';
import { errorText, get } from '../api.ts';
import { haptic } from '../tg.ts';
import { Empty, Spinner } from '../ui.tsx';

type Kind = 'all' | 'weekly';

export function Leaderboard() {
  const [kind, setKind] = useState<Kind>('all');
  const [data, setData] = useState<LeaderboardDTO | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    get<LeaderboardDTO>(`/leaderboard?type=${kind}`)
      .then((d) => active && setData(d))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [kind]);

  const pick = (next: Kind): void => {
    haptic('select');
    setKind(next);
  };

  return (
    <div className="page">
      <header className="page-title">
        <h1>رده‌بندی</h1>
        <p className="muted">{kind === 'all' ? 'بر اساس جام‌های دوئل' : 'امتیاز این هفته (از شنبه)'}</p>
      </header>
      <div className="segmented">
        <button type="button" className={kind === 'all' ? 'is-active' : ''} onClick={() => pick('all')}>
          🏆 کلی
        </button>
        <button type="button" className={kind === 'weekly' ? 'is-active' : ''} onClick={() => pick('weekly')}>
          📆 هفتگی
        </button>
      </div>
      {error ? (
        <Empty emoji="😕" text={error} />
      ) : !data ? (
        <Spinner />
      ) : (
        <Board
          data={data}
          unit={kind === 'all' ? '🏆' : '⭐'}
          emptyText={kind === 'all' ? 'هنوز کسی در رده‌بندی نیست.' : 'این هفته هنوز کسی امتیاز نگرفته. اولین نفر باش!'}
        />
      )}
    </div>
  );
}
