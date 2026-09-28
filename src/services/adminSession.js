// Client side of the /admin + /analytics password gate. The password is only
// ever checked by the backend (ADMIN_ACCESS_PASSWORD); a correct password
// gets an httpOnly session cookie the browser can't read. Nothing here stores
// the password or the token.
const API = import.meta.env.VITE_API_URL;
const BASE = `${API}/api/admin-auth`;

export const checkAdminSession = async () => {
  const res = await fetch(`${BASE}/session`, { credentials: 'include' });
  return res.ok;
};

// Resolves to { ok: true } or { ok: false, message }.
export const adminLogin = async (password) => {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, message: data.message || `Login failed (HTTP ${res.status})` };
};

export const adminLogout = () =>
  fetch(`${BASE}/logout`, { method: 'POST', credentials: 'include', keepalive: true }).catch(() => {});

// The admin and analytics pages make ~65 API calls with plain fetch(). Rather
// than editing every one, this makes requests to our own API carry the
// session cookie (credentials: 'include') unless the caller chose otherwise.
// Installed once; harmless for other requests since only admins have the cookie.
let fetchPatched = false;
export const includeCredentialsForApi = () => {
  if (fetchPatched || typeof window === 'undefined' || !API) return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (typeof url === 'string' && url.startsWith(API) && !(init && init.credentials)) {
      return originalFetch(input, { ...init, credentials: 'include' });
    }
    return originalFetch(input, init);
  };
};
