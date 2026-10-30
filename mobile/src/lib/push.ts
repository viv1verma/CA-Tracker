import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Native Android push (FCM) — the device half only.
 *
 * This module obtains the **native FCM registration token** via
 * `getDevicePushTokenAsync()`. It deliberately does NOT use Expo push tokens
 * (`getExpoPushTokenAsync`), which would route delivery through Expo's servers,
 * and it has nothing to do with the web app's VAPID/web-push subscriptions.
 *
 * Nothing here talks to the GARP backend yet: no route accepts an FCM token.
 * `registerDeviceToken()` returns the token to its caller; wiring it to an
 * endpoint is a separate, backend-first change (see PUSH.md notes in the report).
 */

/** Android channel id. Must match the `channelId` the server sends in its FCM payload. */
export const ANDROID_CHANNEL_ID = 'garp-default';

/**
 * The token obtained during this app run. Logout needs it to remove exactly this
 * device — a DELETE with no token clears every device the account owns, which
 * would silently unsubscribe the user's other phone.
 */
let _lastToken: string | null = null;
export function getLastDeviceToken(): string | null { return _lastToken; }

export type PushTokenResult =
  | { ok: true; token: string }
  /** Everything that is not an error the user can act on: denied, unsupported, no module. */
  | { ok: false; reason: 'denied' | 'unsupported' | 'unavailable'; detail?: string };

/**
 * Foreground presentation. Without a handler a notification arriving while the
 * app is open is dropped silently; with one it is shown like any other. Set once
 * at module load — expo-notifications keeps a single global handler.
 *
 * `shouldShowAlert` is deprecated in SDK 57; banner + list replace it.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Expo Go cannot obtain a native FCM token (SDK 53+ removed remote push from it),
 * so asking would throw. A development or release build of this app can.
 */
function isSupportedRuntime(): boolean {
  if (Platform.OS !== 'android') return false;
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

/** Android 13+ shows a runtime prompt; older versions grant on install. */
async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  // Do not re-prompt once the user has said no — Android will not show the
  // dialog again anyway, and asking on every launch is user-hostile.
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * The channel carries the importance, sound and vibration for every GARP
 * notification. Creating it is idempotent; Android ignores repeat calls with the
 * same id, and a channel must exist before any notification can be shown.
 */
async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'GARP Tracker',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1a56db',
  });
}

/**
 * Permission → channel → native FCM token.
 *
 * Never throws: every failure path is a typed result, because a device that
 * cannot register for push must still be able to use the rest of the app.
 */
export async function registerDeviceToken(): Promise<PushTokenResult> {
  if (!isSupportedRuntime()) {
    return {
      ok: false,
      reason: 'unsupported',
      detail: Platform.OS !== 'android'
        ? `push is Android-only here (running ${Platform.OS})`
        : 'Expo Go cannot issue an FCM token — use a development or release build',
    };
  }
  try {
    if (!await ensurePermission()) return { ok: false, reason: 'denied' };
    await ensureChannel();
    const token = await Notifications.getDevicePushTokenAsync();
    // On Android `data` is the FCM registration string.
    const value = typeof token?.data === 'string' ? token.data : '';
    if (!value) return { ok: false, reason: 'unavailable', detail: 'empty device token' };
    _lastToken = value;
    return { ok: true, token: value };
  } catch (e) {
    // Missing google-services.json, no Play Services, no network: all land here.
    return { ok: false, reason: 'unavailable', detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Taps on a notification, while the app is running or backgrounded. Returns the
 * unsubscribe function. Cold-start taps are read separately with
 * `getLastNotificationResponseAsync()`, which the caller can add when there is
 * routing to perform — today there is no payload contract to route on.
 */
export function onNotificationTapped(
  handler: (data: Record<string, unknown>) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data;
    handler((data ?? {}) as Record<string, unknown>);
  });
  return () => sub.remove();
}
