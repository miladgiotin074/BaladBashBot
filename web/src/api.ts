import type { ApiErrorBody } from '../../shared/types.ts';
import { getDevAuth, getInitData } from './tg.ts';

export class ApiFail extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function authHeader(): string | null {
  const initData = getInitData();
  if (initData) return `tma ${initData}`;
  const dev = getDevAuth();
  return dev ? `dev ${dev}` : null;
}

export function hasAuth(): boolean {
  return authHeader() !== null;
}

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const auth = authHeader();
  if (auth) headers.Authorization = auth;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFail(0, 'network', 'اتصال برقرار نشد. اینترنتت را بررسی کن.');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiFail(res.status, err?.code ?? 'error', err?.message ?? 'خطایی رخ داد. دوباره امتحان کن.');
  }
  return data as T;
}

export const get = <T>(path: string): Promise<T> => api<T>('GET', path);
export const post = <T>(path: string, body: unknown = {}): Promise<T> => api<T>('POST', path, body);

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'خطایی رخ داد. دوباره امتحان کن.';
}
