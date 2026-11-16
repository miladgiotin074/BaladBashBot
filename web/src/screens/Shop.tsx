import { useState } from 'react';
import { COIN_PACKS, LIFELINES, REWARDS } from '../../../shared/constants.ts';
import type { LifelineId } from '../../../shared/constants.ts';
import { errorText, post } from '../api.ts';
import { useApp } from '../ctx.ts';
import { sfx } from '../sound.ts';
import { openInvoice, shareLink } from '../tg.ts';
import { Btn, CoinIcon, Coins } from '../ui.tsx';
import { fa, num } from '../util.ts';

export function Shop() {
  const { me, config, home, go, tab, toast, refresh } = useApp();
  const [buying, setBuying] = useState('');

  const buy = async (packId: string): Promise<void> => {
    if (buying) return;
    setBuying(packId);
    try {
      const { link } = await post<{ link: string }>('/shop/invoice', { pack: packId });
      const status = await openInvoice(link);
      if (status === 'paid') {
        sfx.coin();
        toast('خرید انجام شد! سکه‌ها تا چند لحظهٔ دیگر اضافه می‌شوند.', 'success');
        window.setTimeout(() => void refresh().catch(() => undefined), 2500);
      } else if (status === 'unsupported') {
        toast('برای خرید، تلگرامت را به‌روز کن.', 'error');
      } else if (status === 'failed') {
        toast('پرداخت انجام نشد.', 'error');
      }
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBuying('');
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

  const bonus = me.dailyBonus;

  return (
    <div className="page">
      <header className="page-title">
        <h1>فروشگاه</h1>
      </header>

      <section className="wallet">
        <small>موجودی تو</small>
        <div className="wallet__amount">
          <CoinIcon size={34} />
          <b>{num(me.coins)}</b>
          <span>سکه</span>
        </div>
      </section>

      <section className="section">
        <h3 className="section__title">سکهٔ رایگان</h3>
        <div className="offers">
          <div className="offer">
            <span className="offer__icon">🎁</span>
            <span className="offer__body">
              <b>جایزهٔ روزانه</b>
              <small>{bonus.available ? 'جایزهٔ امروزت آماده است' : `${fa(bonus.streak)} روز پیاپی — فردا دوباره بیا`}</small>
            </span>
            <Btn small kind={bonus.available ? 'accent' : 'ghost'} disabled={!bonus.available} onClick={() => tab('home')}>
              {bonus.available ? <Coins value={bonus.amount} sign /> : 'گرفتی ✓'}
            </Btn>
          </div>
          <div className="offer">
            <span className="offer__icon">👥</span>
            <span className="offer__body">
              <b>دعوت دوستان</b>
              <small>برای هر دوست {fa(REWARDS.referralInviter)} سکه</small>
            </span>
            <Btn small kind="primary" onClick={() => void invite()}>
              دعوت
            </Btn>
          </div>
          <div className="offer">
            <span className="offer__icon">📅</span>
            <span className="offer__body">
              <b>چالش روزانه</b>
              <small>{home.dailyPlayed ? 'امروز بازی کردی' : `تا ${fa(10 * REWARDS.dailyCoinPerCorrect + REWARDS.dailyPerfectBonus)} سکه`}</small>
            </span>
            <Btn small kind={home.dailyPlayed ? 'ghost' : 'primary'} onClick={() => go({ name: 'daily' })}>
              {home.dailyPlayed ? 'نتیجه' : 'بازی'}
            </Btn>
          </div>
          <div className="offer">
            <span className="offer__icon">✍️</span>
            <span className="offer__body">
              <b>سوال‌ساز</b>
              <small>هر سوالِ تأییدشده {fa(REWARDS.questionApproved)} سکه</small>
            </span>
            <Btn small kind="primary" onClick={() => go({ name: 'factory' })}>
              بساز
            </Btn>
          </div>
        </div>
      </section>

      <section className="section">
        <h3 className="section__title">بسته‌های سکه</h3>
        <div className="packs">
          {COIN_PACKS.map((pack) => (
            <div key={pack.id} className="pack">
              <span className="pack__emoji">{pack.emoji}</span>
              <b>{pack.title}</b>
              <Coins value={pack.coins} size={20} />
              <Btn
                small
                block
                kind="accent"
                disabled={!config.starsShop}
                loading={buying === pack.id}
                onClick={() => void buy(pack.id)}
              >
                {config.starsShop ? `⭐ ${fa(pack.stars)}` : 'به‌زودی'}
              </Btn>
            </div>
          ))}
        </div>
        <p className="section__note">
          {config.starsShop ? 'پرداخت با ستاره‌های تلگرام (Telegram Stars) انجام می‌شود.' : 'خرید سکه به‌زودی فعال می‌شود.'}
        </p>
      </section>

      <section className="section">
        <h3 className="section__title">کمک‌های داخل بازی</h3>
        <div className="card price-list">
          {(Object.keys(LIFELINES) as LifelineId[]).map((key) => (
            <div key={key} className="price-list__row">
              <span>
                {LIFELINES[key].emoji} {LIFELINES[key].title}
              </span>
              <Coins value={LIFELINES[key].cost} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
