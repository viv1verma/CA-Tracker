import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, configureApi } from '../api/client';
import { endpoints } from '../api/endpoints';
import { ApiError, type AuthUser, type LoginResponse, type ApiErrorKind } from '../api/types';
import { getLastDeviceToken } from '../lib/push';
import { isPartner } from './permissions';
import { clearSession, loadBranch, loadSession, saveBranch, saveSession } from './storage';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** True while we restore a persisted session on cold start. */
  restoring: boolean;
  signingIn: boolean;
  error: string | null;
  /** Set when the server ended the session (idle / another device). */
  endedReason: string | null;
  /**
   * The branch context in force — 'all' or a branch name. Only partners/admins can
   * change it; branch-locked staff are pinned to their own branch server-side, and
   * this mirrors that so HO-only modules hide correctly.
   */
  branch: string;
  /** True when this identity may flip branches (mirrors the web switcher's visibility). */
  canSwitchBranch: boolean;
  setBranch: (b: string) => void;
  signIn: (username: string, password: string) => Promise<void>;
  /** Sets the password for an account flagged `mustChangePassword`, keeping the session. */
  completeFirstPasswordChange: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  // The API client reads the token through a ref so it never holds a stale copy.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  // Non-partners never scope by header — the server already pins them to their branch.
  const canSwitchBranch = isPartner(user);
  const branch = canSwitchBranch ? selectedBranch : (user?.branch || 'Greater Noida (HO)');
  const branchRef = useRef<string>(branch);
  branchRef.current = branch;

  const endSession = useCallback(async (reason: string | null) => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setEndedReason(reason);
    await clearSession();
  }, []);

  // Wire the API client once: it can read the token and force a sign-out on 401.
  useEffect(() => {
    configureApi({
      getToken: () => tokenRef.current,
      getBranch: () => branchRef.current,
      onUnauthorized: (kind: ApiErrorKind, message: string) => {
        if (kind === 'idle' || kind === 'superseded' || kind === 'auth') void endSession(message);
      },
    });
  }, [endSession]);

  // Cold start: restore the stored session, then confirm it is still valid.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const savedBranch = await loadBranch();
        if (savedBranch && !cancelled) setSelectedBranch(savedBranch);
        const stored = await loadSession();
        if (!stored || cancelled) return;
        tokenRef.current = stored.token;
        setToken(stored.token);
        setUser(stored.user as AuthUser);
        // Verify against the server — the token may have expired or been superseded.
        // Not a background call: restoring a session is the user actively returning.
        const me = await api.get<AuthUser>(endpoints.me);
        if (!cancelled && me) {
          setUser((prev) => ({ ...(prev as AuthUser), ...me }));
          await saveSession(stored.token, { ...(stored.user as AuthUser), ...me });
        }
      } catch {
        // onUnauthorized already cleared the session for 401s; anything else
        // (e.g. server down) keeps the stored session so the user can retry.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setSigningIn(true);
    setError(null);
    setEndedReason(null);
    try {
      const res = await api.post<LoginResponse>(endpoints.login, {
        username: username.trim(),
        password,
      });
      if (!res?.token) throw new ApiError('The server did not return a session token.', 'server');
      tokenRef.current = res.token;
      setToken(res.token);
      setUser(res.user);
      await saveSession(res.token, res.user);
      // The login response carries only the token's claims. /api/me adds what the
      // UI gates on — caps for staff, companies/dashboards/email for a client —
      // exactly as the web app's boot does right after logging in.
      try {
        const me = await api.get<AuthUser>(endpoints.me, { background: true });
        if (me) {
          const merged = { ...res.user, ...me };
          setUser(merged);
          await saveSession(res.token, merged);
        }
      } catch { /* the session is valid; the extra detail can wait for a refresh */ }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Sign in failed. Please try again.';
      setError(msg);
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const setBranch = useCallback((b: string) => {
    const next = b || 'all';
    setSelectedBranch(next);
    branchRef.current = next;
    void saveBranch(next);
  }, []);

  /**
   * The forced first-login password change. The server bumps the account's session
   * counter, which kills the token we used to make this very call, so it hands back
   * a replacement — swap it in rather than signing the user out.
   */
  const completeFirstPasswordChange = useCallback(async (newPassword: string) => {
    const res = await api.post<{ token: string; user: AuthUser }>(
      endpoints.passwordFirstChange, { newPassword },
    );
    if (!res?.token) throw new ApiError('The server did not return a new session token.', 'server');
    tokenRef.current = res.token;
    setToken(res.token);
    const next = { ...(res.user as AuthUser), mustChangePassword: false };
    setUser(next);
    await saveSession(res.token, next);
    // Pick up caps and the rest of the profile, exactly as signIn() does.
    try {
      const me = await api.get<AuthUser>(endpoints.me, { background: true });
      if (me) {
        const merged = { ...next, ...me };
        setUser(merged);
        await saveSession(res.token, merged);
      }
    } catch { /* the session is valid; the extra detail can wait for a refresh */ }
  }, []);

  /**
   * Intentional logout. POST /logout bumps the account's session counter so the
   * token stops working server-side; the local session is cleared either way, so
   * a user offline or on a dead server is never trapped in a signed-in state.
   */
  const signOut = useCallback(async () => {
    // Unregister first: /logout bumps the account's session counter, after which
    // this token can no longer authenticate. Only THIS device is named — a DELETE
    // without a token would unsubscribe the user's other devices too.
    const deviceToken = getLastDeviceToken();
    if (deviceToken) {
      try { await api.del(endpoints.pushDevice, { token: deviceToken }); }
      catch { /* best effort — a failed unregister must never block signing out */ }
    }
    try { await api.post(endpoints.logout, {}); } catch { /* revoke is best-effort */ }
    await endSession(null);
  }, [endSession]);

  const value = useMemo<AuthState>(
    () => ({
      user, token, restoring, signingIn, error, endedReason,
      branch, canSwitchBranch, setBranch,
      signIn, signOut, completeFirstPasswordChange, clearError: () => setError(null),
    }),
    [user, token, restoring, signingIn, error, endedReason, branch, canSwitchBranch, setBranch, signIn, signOut, completeFirstPasswordChange],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
