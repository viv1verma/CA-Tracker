import { API_BASE_URL } from '../config/env';
import { ApiError, type ApiErrorKind } from './types';

type TokenGetter = () => string | null;
type BranchGetter = () => string | null;
type UnauthorizedHandler = (kind: ApiErrorKind, message: string) => void;

let getToken: TokenGetter = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};
let getBranch: BranchGetter = () => null;

/** Wired once by the auth provider so the client stays free of React imports. */
export function configureApi(opts: {
  getToken: TokenGetter;
  onUnauthorized: UnauthorizedHandler;
  getBranch?: BranchGetter;
}) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
  if (opts.getBranch) getBranch = opts.getBranch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Polling/refresh calls set this; the server does NOT refresh the idle timer for them. */
  background?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Maps a 401 body onto a specific reason so the UI can explain what happened. */
function classify401(payload: { error?: string } | null): { kind: ApiErrorKind; message: string } {
  const code = payload?.error ?? '';
  if (code === 'SESSION_IDLE')
    return { kind: 'idle', message: 'Signed out after 5 minutes of inactivity.' };
  if (code === 'SESSION_SUPERSEDED')
    return { kind: 'superseded', message: 'This account was opened on another device.' };
  return { kind: 'auth', message: code || 'Session expired. Please sign in again.' };
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, background = false, signal, timeoutMs = 15000 } = opts;
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  // Identifies this app to the backend. The server keeps the browser's 5-minute
  // idle logout but exempts mobile, and issues this client a longer-lived token.
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Client': 'mobile' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (background) headers['X-Background'] = '1';
  // Branch scoping, exactly as the web switcher does it: 'all' means no header.
  const branch = getBranch();
  if (branch && branch !== 'all') headers['X-Active-Branch'] = encodeURIComponent(branch);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort());

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e as Error)?.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'The request timed out.'
        : `Cannot reach the GARP server at ${API_BASE_URL}. Is it running, and is the address right for this device?`,
      'network',
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let payload: any = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { /* non-JSON body */ }
  }

  if (res.ok) return payload as T;

  if (res.status === 401) {
    const { kind, message } = classify401(payload);
    onUnauthorized(kind, message);           // let the app clear its session
    throw new ApiError(message, kind, 401);
  }
  if (res.status === 403)
    throw new ApiError(payload?.error ?? 'You do not have access to this.', 'forbidden', 403);

  throw new ApiError(
    payload?.error ?? `Request failed (${res.status}).`,
    res.status >= 500 ? 'server' : 'unknown',
    res.status,
  );
}

export const api = {
  get: <T>(p: string, o?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(p, { ...o, method: 'GET' }),
  post: <T>(p: string, body?: unknown, o?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(p, { ...o, method: 'POST', body }),
  put: <T>(p: string, body?: unknown, o?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(p, { ...o, method: 'PUT', body }),
  /** `body` is optional — DELETE /api/push/device names the token to remove. */
  del: <T>(p: string, body?: unknown, o?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(p, { ...o, method: 'DELETE', body }),
};
