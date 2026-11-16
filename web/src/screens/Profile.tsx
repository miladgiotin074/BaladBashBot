import { useEffect, useState } from 'react';
import { ACHIEVEMENTS, AVATARS, CATEGORIES, REWARDS, levelTitle } from '../../../shared/constants.ts';
import type { MeDTO, ProfileDTO } from '../../../shared/types.ts';
import { errorText, get, post } from '../api.ts';
import { useApp } from '../ctx.ts';
import { setSoundEnabled, soundEnabled } from '../sound.ts';
import { haptic, shareLink } from '../tg.ts';
import { Avatar, Btn, Empty, LevelPill, PageHeader, Progress, Sheet, Spinner } from '../ui.tsx';
import { fa, num, percent } from '../util.ts';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="setting" onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span>{label}</span>
      <i className={`switch${value ? ' is-on' : ''}`} />
    </button>
  );
}

export function Profile({ id }: { id?: number }) {
  const { me, config, setMe, back, go, toast } = useApp();
  const own = id === undefined || id === me.id;
  const targetId = own ? me.id : id;
  const [data, setData] = useState<ProfileDTO | null>(null);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(false);
  const [sound, setSound] = useState(soundEnabled());

  useEffect(() => {
    let active = true;
    get<ProfileDTO>(`/profile/${targetId}`)
      .then((d) => active && setData(d))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [targetId]);

  const update = async (path: string, body: unknown): Promise<void> => {
    try {
      const res = await post<{ me: MeDTO }>(path, body);
      setMe(res.me);
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  const invite = async (): Promise<void> => {
    if (!config.inviteLink) {
      toast('لینک دعوت هنوز آماده نیست', 'error');
      return;
    }
    const shared = await shareLink(config.inviteLink, 'بیا توی «بلد باش» دوئل اطلاعات عمومی بدیم! بلدی؟ ثابت کن 😎');
    if (!shared) toast('لینک دعوت کپی شد', 'success');
  };

  if (error) {
    return (
      <div className="page">
        {!own && <PageHeader title="پروفایل" onBack={back} />}
        <Empty emoji="😕" text={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        {!own && <PageHeader title="پروفایل" onBack={back} />}
        <Spinner />
      </div>
    );
  }

  const player = own ? me : data.player;
  const earned = new Set(data.achievements.map((a) => a.key));
  const stats: [string, string][] = [
    ['دوئل', num(data.games)],
    ['برد', num(data.wins)],
    ['درصد برد', `${fa(percent(data.wins, data.games))}٪`],
    ['دقت پاسخ', `${fa(percent(data.correct, data.answered))}٪`],
    ['بهترین برد پیاپی', num(data.bestWinStreak)],
    ['رکورد بقا', num(data.survivalBest)],
  ];
  const cats = CATEGORIES.map((c) => {
    const row = data.categories.find((x) => x.category === c.id);
    return { ...c, answered: row?.answered ?? 0, correct: row?.correct ?? 0 };
  });

  return (
    <div className="page page--profile">
      {!own && <PageHeader title="پروفایل" onBack={back} />}

      <section className="profile-head">
        <button type="button" className="profile-head__avatar" disabled={!own} onClick={() => setPicker(true)}>
          <Avatar player={player} size={92} />
          {own && <i>✏️</i>}
        </button>
        <h1>{player.name}</h1>
        <p className="profile-head__title">
          <LevelPill level={player.level} /> {data.player.isBot ? 'حریف تمرینی' : levelTitle(player.level)}
        </p>
        {own && (
          <div className="profile-head__xp">
            <Progress value={me.levelInto / me.levelNeed} />
            <small>
              {fa(me.levelInto)} / {fa(me.levelNeed)} امتیاز تا سطح {fa(me.level + 1)}
            </small>
          </div>
        )}
        <div className="profile-head__pills">
          <span className="pill">
            🏆 <b>{num(data.trophies)}</b>
          </span>
          {data.rank > 0 && (
            <span className="pill">
              رتبه <b>{num(data.rank)}</b>
            </span>
          )}
        </div>
      </section>

      <section className="stats">
        {stats.map(([label, value]) => (
          <div key={label} className="stat">
            <b>{value}</b>
            <small>{label}</small>
          </div>
        ))}
      </section>

      <section className="section">
        <h3 className="section__title">مهارت در موضوع‌ها</h3>
        <div className="cat-stats">
          {cats.map((c) => (
            <div key={c.id} className="cat-stat">
              <span className="cat-stat__name">
                {c.emoji} {c.title}
              </span>
              <Progress value={c.answered ? c.correct / c.answered : 0} color={c.color} />
              <small>{c.answered ? `${fa(percent(c.correct, c.answered))}٪` : '—'}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h3 className="section__title">
          مدال‌ها
          <span className="badge badge--soft">
            {fa(earned.size)} از {fa(ACHIEVEMENTS.length)}
          </span>
        </h3>
        <div className="medals">
          {ACHIEVEMENTS.map((a) => (
            <div key={a.key} className={`medal${earned.has(a.key) ? ' is-earned' : ''}`} title={a.desc}>
              <span>{a.emoji}</span>
              <b>{a.title}</b>
              <small>{a.desc}</small>
            </div>
          ))}
        </div>
      </section>

      {own && (
        <>
          <section className="section">
            <h3 className="section__title">دعوت دوستان</h3>
            <div className="card invite">
              <p>
                با هر دوستی که دعوت کنی و اولین دوئلش را تمام کند <b>{fa(REWARDS.referralInviter)} سکه</b> می‌گیری؛ دوستت
                هم {fa(REWARDS.referralInvitee)} سکه هدیه می‌گیرد.
              </p>
              <Btn kind="primary" block onClick={() => void invite()}>
                📨 دعوت از دوستان
              </Btn>
            </div>
          </section>

          <section className="section">
            <h3 className="section__title">تنظیمات</h3>
            <div className="card settings">
              <Toggle
                label="🔔 اعلان نوبت و نتیجه در ربات"
                value={me.notify}
                onChange={(v) => void update('/me/settings', { notify: v })}
              />
              <Toggle
                label="🔊 صدای بازی"
                value={sound}
                onChange={(v) => {
                  setSoundEnabled(v);
                  setSound(v);
                }}
              />
              <button type="button" className="setting" onClick={() => go({ name: 'help' })}>
                <span>❓ راهنمای بازی</span>
                <i className="chev">‹</i>
              </button>
              {me.isAdmin && (
                <button type="button" className="setting" onClick={() => go({ name: 'admin' })}>
                  <span>🛠 پنل مدیریت</span>
                  <i className="chev">‹</i>
                </button>
              )}
            </div>
          </section>
        </>
      )}

      <Sheet open={picker} onClose={() => setPicker(false)}>
        <h2>آواتارت را انتخاب کن</h2>
        <div className="avatar-grid">
          <button
            type="button"
            className={me.avatar === 0 ? 'is-active' : ''}
            onClick={() => {
              haptic('select');
              void update('/me/avatar', { avatar: 0 });
              setPicker(false);
            }}
          >
            <Avatar player={{ ...me, avatar: 0 }} size={52} />
          </button>
          {AVATARS.map((_, i) => (
            <button
              type="button"
              key={i}
              className={me.avatar === i + 1 ? 'is-active' : ''}
              onClick={() => {
                haptic('select');
                void update('/me/avatar', { avatar: i + 1 });
                setPicker(false);
              }}
            >
              <Avatar player={{ ...me, avatar: i + 1 }} size={52} />
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
