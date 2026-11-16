// اجزای مشترک رابط کاربری
import type { CSSProperties, ReactNode } from 'react';
import { AVATARS, AVATAR_COLORS, categoryOf } from '../../shared/constants.ts';
import type { PlayerDTO } from '../../shared/types.ts';
import { sfx } from './sound.ts';
import { haptic } from './tg.ts';
import { fa, num } from './util.ts';

type AvatarPlayer = Pick<PlayerDTO, 'id' | 'name' | 'avatar' | 'photo' | 'isBot'>;

export function Avatar({ player, size = 44 }: { player: AvatarPlayer | null; size?: number }) {
  const style: CSSProperties = { width: size, height: size, fontSize: size * 0.5 };
  if (!player) {
    return (
      <span className="avatar avatar--empty" style={style}>
        ?
      </span>
    );
  }
  const emoji = player.avatar > 0 ? AVATARS[player.avatar - 1] : undefined;
  const colorIndex = player.avatar > 0 ? player.avatar - 1 : Math.abs(player.id);
  const color = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  return (
    <span className="avatar" style={{ ...style, background: color }}>
      {emoji ? (
        emoji
      ) : player.photo ? (
        <img src={player.photo} alt="" referrerPolicy="no-referrer" />
      ) : (
        <b style={{ fontSize: size * 0.42 }}>{player.name.trim().charAt(0) || '?'}</b>
      )}
      {player.isBot && (
        <i className="avatar__bot" title="حریف تمرینی" style={{ fontSize: Math.max(10, size * 0.26) }}>
          🤖
        </i>
      )}
    </span>
  );
}

export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#f5a524" />
      <circle cx="12" cy="12" r="8.2" fill="#ffd166" stroke="#e08e0b" strokeWidth="1" />
      <path d="M8.2 12.4l2.6 2.6 5-5.6" fill="none" stroke="#b86a00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Coins({ value, size = 18, sign = false }: { value: number; size?: number; sign?: boolean }) {
  return (
    <span className="coins">
      <CoinIcon size={size} />
      <b>
        {sign && value > 0 ? '+' : ''}
        {num(value)}
      </b>
    </span>
  );
}

interface BtnProps {
  kind?: 'primary' | 'accent' | 'ghost' | 'danger' | 'soft';
  block?: boolean;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function Btn({ kind = 'primary', block, small, disabled, loading, onClick, children, className }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn btn--${kind}${block ? ' btn--block' : ''}${small ? ' btn--small' : ''}${className ? ` ${className}` : ''}`}
      disabled={disabled || loading}
      onClick={() => {
        haptic('tap');
        sfx.tap();
        onClick?.();
      }}
    >
      {loading ? <span className="spinner spinner--small" /> : children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="center-box">
      <span className="spinner" />
      {label && <p className="muted">{label}</p>}
    </div>
  );
}

export function Empty({ emoji, text, children }: { emoji: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__emoji">{emoji}</div>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function PageHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="page-header">
      {onBack ? (
        <button type="button" className="icon-btn" onClick={onBack} aria-label="بازگشت">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span className="icon-btn icon-btn--blank" />
      )}
      <h1>{title}</h1>
      <div className="page-header__right">{right}</div>
    </header>
  );
}

export function Sheet({
  open,
  onClose,
  children,
  center = false,
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  center?: boolean;
}) {
  if (!open) return null;
  return (
    <div className={`overlay${center ? ' overlay--center' : ''}`} onClick={onClose}>
      <div className={center ? 'dialog' : 'sheet'} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  return (
    <div className="progress">
      <i style={{ width, background: color }} />
    </div>
  );
}

export function CategoryBadge({ id, large = false }: { id: string | null; large?: boolean }) {
  const cat = categoryOf(id);
  if (!cat) return <span className="cat-badge cat-badge--blank">؟</span>;
  return (
    <span className={`cat-badge${large ? ' cat-badge--large' : ''}`} style={{ '--cat': cat.color } as CSSProperties}>
      <span>{cat.emoji}</span>
      {cat.title}
    </span>
  );
}

/** سه نقطهٔ نتیجهٔ یک دور: سبز درست، قرمز غلط، خاکستری هنوز بازی‌نشده */
export function Dots({ cells }: { cells: (boolean | null)[] }) {
  return (
    <span className="dots">
      {cells.map((c, i) => (
        <i key={i} className={c === null ? '' : c ? 'ok' : 'no'} />
      ))}
    </span>
  );
}

export function LevelPill({ level }: { level: number }) {
  return <span className="level-pill">{fa(level)}</span>;
}

export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2ee6d2" />
          <stop offset="1" stopColor="#0f8fb1" />
        </linearGradient>
      </defs>
      <g transform="translate(32 32)">
        <rect x="-20" y="-20" width="40" height="40" rx="7" fill="url(#logo-g)" />
        <rect x="-20" y="-20" width="40" height="40" rx="7" fill="url(#logo-g)" transform="rotate(45)" />
        <path d="M-10 1 L-2.5 8.5 L11 -8" fill="none" stroke="#0d1030" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
