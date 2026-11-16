import {
  DAILY_QUESTIONS,
  DUEL_TIME_MS,
  LIFELINES,
  QUESTIONS_PER_ROUND,
  REWARDS,
  ROUNDS,
  SURVIVAL_LIVES,
} from '../../../shared/constants.ts';
import { useApp } from '../ctx.ts';
import { PageHeader } from '../ui.tsx';
import { fa } from '../util.ts';

export function Help() {
  const { back } = useApp();
  const items: [string, string, string][] = [
    [
      '⚔️',
      'دوئل',
      `هر دوئل ${fa(ROUNDS)} دور و هر دور ${fa(QUESTIONS_PER_ROUND)} سوال دارد. در هر دور یکی از دو بازیکن موضوع را انتخاب می‌کند و هر دو به همان سوال‌ها جواب می‌دهند. برای هر سوال ${fa(DUEL_TIME_MS / 1000)} ثانیه وقت داری. هر کس جواب درست بیشتری بدهد برنده است.`,
    ],
    [
      '🔔',
      'نوبت‌ها',
      'لازم نیست هم‌زمان آنلاین باشید. نوبتت را بازی کن و برو؛ وقتی حریف بازی کرد، ربات خبرت می‌کند. اگر کسی در مهلت تعیین‌شده بازی نکند، بازنده می‌شود.',
    ],
    [
      '🧰',
      'کمک‌ها',
      `با سکه می‌توانی کمک بگیری: «${LIFELINES.fifty.title}» (${fa(LIFELINES.fifty.cost)} سکه)، «${LIFELINES.time.title}» (${fa(LIFELINES.time.cost)} سکه) و «${LIFELINES.audience.title}» (${fa(LIFELINES.audience.cost)} سکه). هر کمک در هر سوال فقط یک بار.`,
    ],
    [
      '📅',
      'چالش روزانه',
      `هر روز ${fa(DAILY_QUESTIONS)} سوالِ یکسان برای همه. فقط یک بار فرصت داری و رتبه‌ات بر اساس تعداد جواب درست و سرعتت مشخص می‌شود.`,
    ],
    [
      '🛡️',
      'بقا',
      `${fa(SURVIVAL_LIVES)} جان داری و سوال‌ها کم‌کم سخت‌تر می‌شوند. تا وقتی جان داری ادامه بده و رکورد بزن.`,
    ],
    [
      '🏆',
      'جام و سطح',
      `با هر برد ${fa(REWARDS.win.trophies)} جام می‌گیری و با هر باخت ${fa(Math.abs(REWARDS.loss.trophies))} جام از دست می‌دهی. رده‌بندی کلی بر اساس جام است. با هر بازی امتیاز تجربه می‌گیری و سطحت بالا می‌رود.`,
    ],
    [
      '🪙',
      'سکه',
      'با برد در دوئل، جایزهٔ روزانه، چالش روزانه، مدال‌ها، دعوت دوستان و ساختن سوال سکه بگیر.',
    ],
    [
      '🤖',
      'حریف تمرینی',
      'اگر برای دوئل شانسی حریفی پیدا نشود، یک حریف تمرینی (ربات) وارد بازی می‌شود تا منتظر نمانی. این حریف‌ها با نشان 🤖 مشخص شده‌اند.',
    ],
  ];
  return (
    <div className="page">
      <PageHeader title="راهنمای بازی" onBack={back} />
      <div className="help">
        {items.map(([emoji, title, text]) => (
          <article key={title} className="card help__item">
            <span>{emoji}</span>
            <div>
              <b>{title}</b>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
