import { useEffect, useState } from 'react';
import { DAILY_QUESTIONS, REWARDS } from '../../../shared/constants.ts';
import type { DailyDTO } from '../../../shared/types.ts';
import { Board } from '../Board.tsx';
import { errorText, get } from '../api.ts';
import { useApp } from '../ctx.ts';
import { Btn, Coins, Empty, PageHeader, Spinner } from '../ui.tsx';
import { fa } from '../util.ts';

export function Daily() {
  const { back, go } = useApp();
  const [data, setData] = useState<DailyDTO | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    get<DailyDTO>('/daily')
      .then((d) => active && setData(d))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="page">
      <PageHeader title="چالش روزانه" onBack={back} />
      {error ? (
        <Empty emoji="😕" text={error} />
      ) : !data ? (
        <Spinner />
      ) : (
        <>
          <section className="feature feature--daily">
            <div className="feature__icon">📅</div>
            {data.finished ? (
              <>
                <h2>
                  {fa(data.score)} از {fa(data.total)}
                </h2>
                <p>
                  در {fa(Math.round(data.timeMs / 1000))} ثانیه
                  {data.score === data.total ? ' — بی‌نقص! 🌟' : ''}
                </p>
                {data.reward && (
                  <div className="feature__rewards">
                    <Coins value={data.reward.coins} sign />
                    <span>⭐ +{fa(data.reward.xp)}</span>
                  </div>
                )}
                <p className="muted">چالش فردا از نیمه‌شب آماده است.</p>
              </>
            ) : (
              <>
                <h2>{fa(DAILY_QUESTIONS)} سوال، فقط یک فرصت</h2>
                <p>
                  سوال‌های امروز برای همه یکی است. هر جواب درست {fa(REWARDS.dailyCoinPerCorrect)} سکه دارد و اگر همه را
                  درست بزنی {fa(REWARDS.dailyPerfectBonus)} سکهٔ اضافه می‌گیری.
                </p>
                <Btn kind="accent" block onClick={() => go({ name: 'play', source: { ctx: 'daily' } })}>
                  {data.played ? '▶️ ادامهٔ چالش' : '🚀 شروع چالش'}
                </Btn>
              </>
            )}
          </section>

          <section className="section">
            <h3 className="section__title">برترین‌های امروز</h3>
            <Board data={data.board} unit="از ۱۰" emptyText="هنوز کسی چالش امروز را تمام نکرده. اولین نفر باش!" />
          </section>
        </>
      )}
    </div>
  );
}
