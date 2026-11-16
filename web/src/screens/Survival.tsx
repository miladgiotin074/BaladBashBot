import { useEffect, useState } from 'react';
import { REWARDS, SURVIVAL_LIVES } from '../../../shared/constants.ts';
import type { SurvivalDTO } from '../../../shared/types.ts';
import { Board } from '../Board.tsx';
import { errorText, get } from '../api.ts';
import { useApp } from '../ctx.ts';
import { Btn, Coins, Empty, PageHeader, Spinner } from '../ui.tsx';
import { fa } from '../util.ts';

export function Survival() {
  const { back, go } = useApp();
  const [data, setData] = useState<SurvivalDTO | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    get<SurvivalDTO>('/survival')
      .then((d) => active && setData(d))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, []);

  const play = (fresh: boolean): void => go({ name: 'play', source: { ctx: 'survival', fresh } });

  return (
    <div className="page">
      <PageHeader title="حالت بقا" onBack={back} />
      {error ? (
        <Empty emoji="😕" text={error} />
      ) : !data ? (
        <Spinner />
      ) : (
        <>
          <section className="feature feature--survival">
            <div className="feature__icon">🛡️</div>
            <h2>رکورد تو: {fa(data.best)}</h2>
            <p>
              {fa(SURVIVAL_LIVES)} جان داری. با هر اشتباه یکی کم می‌شود و سوال‌ها کم‌کم سخت‌تر می‌شوند. هر جواب درست{' '}
              {fa(REWARDS.survivalCoinPerCorrect)} سکه.
            </p>
            {data.last && (
              <div className="feature__last">
                <span>
                  آخرین بازی: <b>{fa(data.last.score)}</b> {data.last.record ? '🎉 رکورد جدید!' : ''}
                </span>
                <span className="feature__rewards">
                  <Coins value={data.last.coins} sign />
                  <span>⭐ +{fa(data.last.xp)}</span>
                </span>
              </div>
            )}
            {data.active ? (
              <>
                <Btn kind="accent" block onClick={() => play(false)}>
                  ▶️ ادامهٔ بازی ({fa(data.active.score)} امتیاز، {fa(data.active.lives)} جان)
                </Btn>
                <Btn kind="ghost" block onClick={() => play(true)}>
                  شروع از اول
                </Btn>
              </>
            ) : (
              <Btn kind="accent" block onClick={() => play(true)}>
                🚀 شروع
              </Btn>
            )}
          </section>

          <section className="section">
            <h3 className="section__title">رکوردداران بقا</h3>
            <Board data={data.board} unit="امتیاز" emptyText="هنوز رکوردی ثبت نشده. اولین رکورد را تو بزن!" />
          </section>
        </>
      )}
    </div>
  );
}
