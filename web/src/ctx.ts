import { createContext, useContext } from 'react';
import type { AppConfigDTO, HomeDTO, MeDTO } from '../../shared/types.ts';

export type PlaySource =
  | { ctx: 'duel'; matchId: number }
  | { ctx: 'daily' }
  | { ctx: 'survival'; fresh: boolean };

export type Route =
  | { name: 'home' }
  | { name: 'leaderboard' }
  | { name: 'shop' }
  | { name: 'profile'; id?: number }
  | { name: 'match'; id: number }
  | { name: 'play'; source: PlaySource }
  | { name: 'review'; matchId: number; round: number }
  | { name: 'daily' }
  | { name: 'survival' }
  | { name: 'factory' }
  | { name: 'admin' }
  | { name: 'help' };

export type TabName = 'home' | 'leaderboard' | 'shop' | 'profile';

export interface ConfirmOptions {
  title: string;
  text?: string;
  yes?: string;
  no?: string;
  danger?: boolean;
}

export interface AppCtx {
  me: MeDTO;
  config: AppConfigDTO;
  home: HomeDTO;
  setMe(me: MeDTO): void;
  /** گرفتن دوبارهٔ اطلاعات خانه (پروفایل، بازی‌ها و…) */
  refresh(): Promise<void>;
  toast(text: string, kind?: 'info' | 'success' | 'error'): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
  go(route: Route): void;
  replace(route: Route): void;
  back(): void;
  tab(name: TabName): void;
  /** نگهبان خروج: اگر false برگرداند، بازگشت انجام نمی‌شود */
  setGuard(guard: (() => Promise<boolean>) | null): void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext is missing');
  return ctx;
}
