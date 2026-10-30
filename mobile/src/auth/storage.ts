import * as SecureStore from 'expo-secure-store';

/**
 * The JWT lives in the OS keystore (Android Keystore / iOS Keychain) via
 * expo-secure-store — never AsyncStorage, which is plain text on disk.
 */
const TOKEN_KEY = 'garp.auth.token';
const USER_KEY = 'garp.auth.user';
// The branch switcher's selection — the web app keeps this in localStorage.
const BRANCH_KEY = 'garp.active.branch';

export async function saveSession(token: string, user: unknown): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function loadSession(): Promise<{ token: string; user: unknown } | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return null;
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return { token, user: JSON.parse(raw) };
  } catch {
    await clearSession();      // corrupt payload — start clean rather than crash
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function saveBranch(branch: string): Promise<void> {
  await SecureStore.setItemAsync(BRANCH_KEY, branch);
}

export async function loadBranch(): Promise<string | null> {
  return SecureStore.getItemAsync(BRANCH_KEY);
}
