import { useCallback, useEffect, useState } from 'react';
import type { AdminStatsDTO, SubmittedQuestionDTO } from '../../../shared/types.ts';
import { errorText, get, post } from '../api.ts';
import { useApp } from '../ctx.ts';
import { Btn, CategoryBadge, Empty, PageHeader, Spinner } from '../ui.tsx';
import { fa, num } from '../util.ts';

type Filter = 'pending' | 'reported';

const DIFFICULTY = ['آسان', 'متوسط', 'سخت'];

export function Admin() {
  const { back, toast } = useApp();
  const [filter, setFilter] = useState<Filter>('pending');
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [items, setItems] = useState<SubmittedQuestionDTO[] | null>(null);
  const [levels, setLevels] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(0);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        get<AdminStatsDTO>('/admin/stats'),
        get<SubmittedQuestionDTO[]>(`/admin/questions?filter=${filter}`),
      ]);
      setStats(s);
      setItems(list);
    } catch (err) {
      toast(errorText(err), 'error');
      setItems([]);
    }
  }, [filter, toast]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const act = async (id: number, action: 'approve' | 'reject' | 'dismiss'): Promise<void> => {
    setBusy(id);
    try {
      await post(`/admin/questions/${id}`, { action, difficulty: levels[id] ?? 2 });
      await load();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(0);
    }
  };

  const cells: [string, number][] = stats
    ? [
        ['کاربران', stats.users],
        ['فعال امروز', stats.activeToday],
        ['کل دوئل‌ها', stats.matches],
        ['دوئل در جریان', stats.activeMatches],
        ['سوال تأییدشده', stats.questions],
        ['در انتظار بررسی', stats.pending],
      ]
    : [];

  return (
    <div className="page">
      <PageHeader title="پنل مدیریت" onBack={back} />

      <section className="stats">
        {cells.map(([label, value]) => (
          <div key={label} className="stat">
            <b>{num(value)}</b>
            <small>{label}</small>
          </div>
        ))}
      </section>

      <div className="segmented">
        <button type="button" className={filter === 'pending' ? 'is-active' : ''} onClick={() => setFilter('pending')}>
          در انتظار {stats ? `(${fa(stats.pending)})` : ''}
        </button>
        <button type="button" className={filter === 'reported' ? 'is-active' : ''} onClick={() => setFilter('reported')}>
          گزارش‌شده {stats ? `(${fa(stats.reported)})` : ''}
        </button>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty emoji="✨" text={filter === 'pending' ? 'سوالی در انتظار بررسی نیست.' : 'سوال گزارش‌شده‌ای نیست.'} />
      ) : (
        <div className="review">
          {items.map((q) => (
            <article key={q.id} className="review__card">
              <header>
                <p>{q.text}</p>
              </header>
              <ul>
                {q.options.map((text, i) => (
                  <li key={i} className={i === q.correct ? 'is-correct' : ''}>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <div className="admin-meta">
                <CategoryBadge id={q.category} />
                {q.author && <small className="muted">از {q.author.name}</small>}
                {filter === 'reported' && <small className="muted">{fa(q.reports ?? 0)} گزارش</small>}
              </div>
              {filter === 'pending' ? (
                <>
                  <div className="segmented segmented--small">
                    {DIFFICULTY.map((label, i) => (
                      <button
                        type="button"
                        key={label}
                        className={(levels[q.id] ?? 2) === i + 1 ? 'is-active' : ''}
                        onClick={() => setLevels((m) => ({ ...m, [q.id]: i + 1 }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="admin-actions">
                    <Btn small block kind="primary" loading={busy === q.id} onClick={() => void act(q.id, 'approve')}>
                      ✅ تأیید
                    </Btn>
                    <Btn small block kind="danger" disabled={busy === q.id} onClick={() => void act(q.id, 'reject')}>
                      ❌ رد
                    </Btn>
                  </div>
                </>
              ) : (
                <div className="admin-actions">
                  <Btn small block kind="soft" loading={busy === q.id} onClick={() => void act(q.id, 'dismiss')}>
                    سوال درست است
                  </Btn>
                  <Btn small block kind="danger" disabled={busy === q.id} onClick={() => void act(q.id, 'reject')}>
                    حذف از بازی
                  </Btn>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
