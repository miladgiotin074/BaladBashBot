import type { ReactNode } from 'react';
import type { LeaderboardDTO, LeaderRowDTO } from '../../shared/types.ts';
import { useApp } from './ctx.ts';
import { Avatar, Empty } from './ui.tsx';
import { fa, num } from './util.ts';

const MEDALS = ['🥇', '🥈', '🥉'];

function Row({ row, unit, mine, onOpen }: { row: LeaderRowDTO; unit: ReactNode; mine: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`board__row${mine ? ' is-me' : ''}`} onClick={onOpen}>
      <span className="board__rank">{MEDALS[row.rank - 1] ?? fa(row.rank)}</span>
      <Avatar player={row.player} size={40} />
      <span className="board__name">
        <b>{row.player.name}</b>
        <small>{row.sub ?? `سطح ${fa(row.player.level)}`}</small>
      </span>
      <span className="board__value">
        {num(row.value)} {unit}
      </span>
    </button>
  );
}

/** جدول رده‌بندی؛ ردیف خودِ بازیکن اگر در فهرست نباشد پایین جدول سنجاق می‌شود */
export function Board({ data, unit, emptyText }: { data: LeaderboardDTO; unit: ReactNode; emptyText: string }) {
  const { me, go } = useApp();
  const open = (id: number): void => go({ name: 'profile', id });
  if (data.rows.length === 0) return <Empty emoji="🏁" text={emptyText} />;
  const listed = data.me ? data.rows.some((r) => r.player.id === data.me?.player.id) : true;
  return (
    <div className="board">
      {data.rows.map((row) => (
        <Row key={row.player.id} row={row} unit={unit} mine={row.player.id === me.id} onOpen={() => open(row.player.id)} />
      ))}
      {data.me && !listed && (
        <>
          <div className="board__gap">⋯</div>
          <Row row={data.me} unit={unit} mine onOpen={() => open(me.id)} />
        </>
      )}
    </div>
  );
}
