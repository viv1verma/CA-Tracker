import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, setToken, clearToken, getToken, setOnUnauthorized } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // the "me" object
  const [loading, setLoading] = useState(true);  // initial auth check
  const idleTimer = useRef(null);

  const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  // Idle watcher: reset on user activity, logout after 5 min
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(logout, IDLE_TIMEOUT);
  }, [logout]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    if (user) {
      events.forEach(e => window.addEventListener(e, resetIdle));
      resetIdle();
    }
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [user, resetIdle]);

  // Register unauthorized callback
  useEffect(() => {
    setOnUnauthorized(() => logout());
  }, [logout]);

  // Check existing token on mount
  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    api('GET', '/me').then(data => {
      if (data) setUser(data);
    }).catch(() => {
      clearToken();
    }).finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const data = await api('POST', '/login', { username, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  // Computed role helpers
  const isAdmin = user?.role === 'admin';
  const isMember = user?.role === 'member';
  const isClient = user?.role === 'client';
  const isItrClient = user?.role === 'itrclient';
  const isHrAdmin = isAdmin || !!user?.hrAdmin || (user?.name || '').trim().toLowerCase() === 'meenu jha';
  const canManage = isAdmin || !!user?.itrAdmin;
  const isPartner = isAdmin || (user?.designation || '').toLowerCase().includes('partner');
  const hasPayrollAccess = isAdmin || !!user?.payrollAccess || isHrAdmin;

  const value = {
    user, loading, login, logout,
    isAuthenticated: !!user,
    isAdmin, isMember, isClient, isItrClient,
    isHrAdmin, canManage, isPartner, hasPayrollAccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
