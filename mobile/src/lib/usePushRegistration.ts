import { useEffect, useRef } from 'react';
import { api } from '../api/client';
import { endpoints } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { registerDeviceToken, type PushTokenResult } from './push';

/**
 * Runs the device-token registration once per signed-in account.
 *
 * Gating rules, in order:
 *  - no user            → nothing to register against
 *  - restoring session  → wait, so a cold start does not race the auth state
 *  - mustChangePassword → the account is gated server-side; leave it alone
 *
 * The `attemptedFor` ref keeps this to one attempt per account per app run, so a
 * re-render, a data refresh or a branch switch cannot re-trigger it. Signing out
 * and back in as someone else does re-run it, which is what we want.
 */
export function usePushRegistration(): void {
  const { user, restoring } = useAuth();
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    if (restoring || !user || user.mustChangePassword) return;
    if (attemptedFor.current === user.id) return;
    attemptedFor.current = user.id;

    let cancelled = false;
    (async () => {
      const result: PushTokenResult = await registerDeviceToken();
      if (cancelled) return;
      if (!result.ok) {
        // Permission denied or an unsupported runtime is normal, not an error:
        // the app keeps working, it simply will not receive notifications.
        console.log(`[push] not registered — ${result.reason}${result.detail ? ': ' + result.detail : ''}`);
        return;
      }
      try {
        // The device token is not a secret the way a password is, but it addresses
        // this handset — so it is never logged in full.
        await api.post(endpoints.pushDevice, { token: result.token, platform: 'android' });
        if (!cancelled) console.log('[push] device registered with the server');
      } catch (e) {
        // Push is an extra, never a gate: a failed registration must not surface
        // to the user, retry in a loop, or affect the session in any way.
        console.log('[push] server registration failed:', e instanceof Error ? e.message : String(e));
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.mustChangePassword, restoring]);   // eslint-disable-line react-hooks/exhaustive-deps
}
