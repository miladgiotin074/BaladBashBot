import { useEffect, useState } from 'react';
import { CATEGORIES, QUESTION_LIMITS, REWARDS } from '../../../shared/constants.ts';
import type { SubmittedQuestionDTO } from '../../../shared/types.ts';
import { errorText, get, post } from '../api.ts';
import { useApp } from '../ctx.ts';
import { haptic } from '../tg.ts';
import { Btn, CategoryBadge, PageHeader } from '../ui.tsx';
import { fa } from '../util.ts';

const STATUS = {
  pending: { text: 'در انتظار بررسی', tone: 'wait' },
  approved: { text: 'تأیید شد', tone: 'win' },
  rejected: { text: 'تأیید نشد', tone: 'loss' },
} as const;

export function Factory() {
  const { back, toast } = useApp();
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [sending, setSending] = useState(false);
  const [mine, setMine] = useState<SubmittedQuestionDTO[]>([]);

  const loadMine = (): void => {
    get<SubmittedQuestionDTO[]>('/questions/mine')
      .then(setMine)
      .catch(() => undefined);
  };
  useEffect(loadMine, []);

  const ready =
    category !== '' && text.trim().length >= QUESTION_LIMITS.textMin && options.every((o) => o.trim().length > 0);

  const submit = async (): Promise<void> => {
    setSending(true);
    try {
      await post('/questions', { category, text, options, correct });
      haptic('success');
      toast('سوالت ثبت شد و بعد از بررسی وارد بازی می‌شود. ممنون!', 'success');
      setText('');
      setOptions(['', '', '', '']);
      setCorrect(0);
      loadMine();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="سوال‌ساز" onBack={back} />
      <p className="lead">
        سوال خودت را بساز! اگر تأیید شود وارد بازی می‌شود و <b>{fa(REWARDS.questionApproved)} سکه</b> جایزه می‌گیری.
      </p>

      <section className="form">
        <label className="form__label">موضوع</label>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip-btn${category === c.id ? ' is-active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.emoji} {c.title}
            </button>
          ))}
        </div>

        <label className="form__label" htmlFor="q-text">
          متن سوال
        </label>
        <textarea
          id="q-text"
          className="input"
          rows={3}
          maxLength={QUESTION_LIMITS.textMax}
          placeholder="مثلاً: بلندترین قلهٔ ایران کدام است؟"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <label className="form__label">گزینه‌ها (گزینهٔ درست را علامت بزن)</label>
        {options.map((value, i) => (
          <div key={i} className={`option-input${correct === i ? ' is-correct' : ''}`}>
            <button
              type="button"
              className="option-input__mark"
              onClick={() => setCorrect(i)}
              aria-label={`گزینهٔ ${fa(i + 1)} درست است`}
            >
              {correct === i ? '✓' : ''}
            </button>
            <input
              className="input"
              maxLength={QUESTION_LIMITS.optionMax}
              placeholder={`گزینهٔ ${fa(i + 1)}`}
              value={value}
              onChange={(e) => setOptions((list) => list.map((o, k) => (k === i ? e.target.value : o)))}
            />
          </div>
        ))}

        <Btn kind="accent" block disabled={!ready} loading={sending} onClick={() => void submit()}>
          ارسال سوال
        </Btn>
      </section>

      {mine.length > 0 && (
        <section className="section">
          <h3 className="section__title">سوال‌های من</h3>
          <div className="mine-list">
            {mine.map((q) => (
              <div key={q.id} className="mine-item">
                <p>{q.text}</p>
                <div>
                  <CategoryBadge id={q.category} />
                  <span className={`chip chip--${STATUS[q.status].tone}`}>{STATUS[q.status].text}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
