import { useEffect, useRef, useCallback } from 'react';

export function useAutoRefresh(refreshFn, intervalMs = 30000) {
  const savedFn = useRef(refreshFn);
  savedFn.current = refreshFn;

  const refresh = useCallback(() => savedFn.current(), []);

  useEffect(() => {
    const id = setInterval(refresh, intervalMs);

    // Also refresh on tab visibility change and focus
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    const onFocus = () => refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, intervalMs]);
}
