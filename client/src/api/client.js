const TOKEN_KEY = 'garp_tok';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// onUnauthorized callback — set by AuthContext to trigger logout
let _onUnauthorized = null;
export function setOnUnauthorized(fn) { _onUnauthorized = fn; }

export async function api(method, path, body, { timeout = 20000, background = false } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (background) opts.headers['X-Background'] = '1';
  if (body) opts.body = JSON.stringify(body);

  const ctrl = new AbortController();
  opts.signal = ctrl.signal;
  const timer = setTimeout(() => ctrl.abort(), timeout);

  let res;
  try {
    res = await fetch('/api' + path, opts);
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw Object.assign(new Error('Request timed out'), { status: 0 });
    throw Object.assign(new Error('Network error'), { status: 0 });
  }
  clearTimeout(timer);

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    if (res.status === 401 && path !== '/login') {
      if (data?.error === 'SESSION_SUPERSEDED') alert(data.message || 'Logged out — another device signed in.');
      if (_onUnauthorized) _onUnauthorized(data?.error);
      return;
    }
    const err = new Error(data?.error || 'Request failed');
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}
