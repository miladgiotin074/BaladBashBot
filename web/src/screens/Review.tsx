import { useEffect, useState } from 'react';
import type { ReviewQuestionDTO } from '../../../shared/types.ts';
import { errorText, get, post } from '../api.ts';
import { useApp } from '../ctx.ts';
import { Empty, PageHeader, Spinner } from '../ui.tsx';
import { fa } from '../util.ts';

export function Review({ matchId, round }: { matchId: number; round: number }) {
  const { back, toast, confirm } = useApp();
  const [items, setItems] = useState<ReviewQuestionDTO[] | null>(null);
  const [error, setError] = useState('');
  const [reported, setReported] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    get<ReviewQuestionDTO[]>(`/matches/${matchId}/rounds/${round}`)
      .then((data) => active && setItems(data))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [matchId, round]);

  const report = async (id: number): Promise<void> => {
    const ok = await confirm({
      title: 'گزارش این سوال؟',
      text: 'اگر سوال یا پاسخش اشتباه است گزارش بده تا بررسی شود.',
      yes: 'گزارش',
      no: 'بی‌خیال',
    });
    if (!ok) return;
    try {
      await post(`/questions/${id}/report`, {});
      setReported((list) => [...list, id]);
      toast('ممنون! گزارشت ثبت شد.', 'success');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  return (
    <div className="page">
      <PageHeader title={`مرور دور ${fa(round + 1)}`} onBack={back} />
      {error ? (
        <Empty emoji="😕" text={error} />
      ) : !items ? (
        <Spinner />
      ) : (
        <div className="review">
          {items.map((q, n) => (
            <article key={q.id} className="review__card">
              <header>
                <span className="review__num">{fa(n + 1)}</span>
                <p>{q.text}</p>
              </header>
              <ul>
                {q.options.map((text, i) => (
                  <li key={i} className={i === q.correct ? 'is-correct' : i === q.mine ? 'is-wrong' : ''}>
                    <span>{text}</span>
                    <span className="review__tags">
                      {q.mine === i && <i className="tag tag--me">تو</i>}
                      {q.theirs === i && <i className="tag tag--opp">حریف</i>}
                    </span>
                  </li>
                ))}
              </ul>
              <footer>
                <small className="muted">
                  {q.mine === null ? 'این سوال را بازی نکردی' : q.mine < 0 ? 'زمانت تمام شد ⏰' : ''}
                  {q.theirs !== null && q.theirs < 0 ? ' • زمان حریف تمام شد' : ''}
                </small>
                <button
                  type="button"
                  className="link-btn"
                  disabled={reported.includes(q.id)}
                  onClick={() => void report(q.id)}
                >
                  {reported.includes(q.id) ? 'گزارش شد ✓' : '🚩 گزارش سوال'}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
