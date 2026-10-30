import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the app talks to the GARP backend.
 *
 * Development keeps the local defaults (Android emulator reaches the host on
 * 10.0.2.2). A release build has NO fallback: the URL must be supplied through
 * the build environment as EXPO_PUBLIC_API_BASE_URL, and it must be HTTPS. A
 * misconfigured release fails loudly at startup rather than shipping an APK that
 * silently points at an address only an emulator can reach.
 *
 * Never put backend secrets here (JWT_SECRET, SMTP_PASS, WA_TOKEN, DB
 * credentials) — anything bundled ships to the device and is readable by anyone
 * holding the APK. The production URL is not a secret; it is public build config.
 */

/** Loopback, emulator-host and RFC1918 addresses — reachable only in development. */
function isLocalAddress(url: string): boolean {
  return /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url);
}

/** Trailing slashes are stripped so `${API_BASE_URL}${path}` never doubles up. */
const normalise = (url: string) => url.replace(/\/+$/, '');

function resolveBaseUrl(): string {
  // 1. Build environment. EXPO_PUBLIC_* is inlined at build time by Expo and is
  //    the only supported way to point a release build at a backend.
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  // 2. app.json → expo.extra.apiBaseUrl. Intentionally unset in the committed
  //    config so a release can never inherit a development address.
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  const configured = normalise(fromEnv || fromExtra || '');

  if (__DEV__) {
    if (configured) return configured;
    // Development fallback: the emulator/simulator reaching a local server.
    return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
  }

  // Release builds: configured, HTTPS and non-local, or nothing.
  if (!configured) {
    throw new Error(
      'API_BASE_URL is not configured. Set EXPO_PUBLIC_API_BASE_URL to the GARP '
      + 'backend HTTPS origin in the build environment (eas.json → build profile → env) '
      + 'and rebuild.',
    );
  }
  if (!configured.startsWith('https://')) {
    throw new Error(
      `API_BASE_URL must be HTTPS in a release build (got "${configured}"). `
      + 'Set EXPO_PUBLIC_API_BASE_URL to an https:// origin and rebuild.',
    );
  }
  if (isLocalAddress(configured)) {
    throw new Error(
      `API_BASE_URL points at a development address ("${configured}"), which no `
      + 'real device can reach. Set EXPO_PUBLIC_API_BASE_URL to the production origin and rebuild.',
    );
  }
  return configured;
}

export const API_BASE_URL = resolveBaseUrl();

/** True while pointed at a local backend — always false in a release build. */
export const IS_LOCAL_ONLY = isLocalAddress(API_BASE_URL);
