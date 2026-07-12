// ============================================================
// Focussive Extension — API Client (with auto token refresh)
// ============================================================

const API_URL = 'http://localhost:3000';

// ─── Token helpers ────────────────────────────────────────────
async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('focussive_token');
  return result.focussive_token || null;
}

async function getRefreshToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('focussive_refresh_token');
  return result.focussive_refresh_token || null;
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ focussive_token: token });
}

export async function setRefreshToken(token: string): Promise<void> {
  await chrome.storage.local.set({ focussive_refresh_token: token });
}

export async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove(['focussive_token', 'focussive_refresh_token']);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

// ─── Token refresh ────────────────────────────────────────────
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refreshTok = await getRefreshToken();
  if (!refreshTok) return null;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshTok }),
    });

    if (!response.ok) {
      // Refresh token also expired — force re-login
      await clearTokens();
      return null;
    }

    const data = await response.json();
    await setToken(data.token);
    await setRefreshToken(data.refresh_token);
    return data.token;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh calls
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = doRefresh().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });
  return refreshPromise;
}

// ─── Core request ─────────────────────────────────────────────
interface RequestOptions {
  method?: string;
  body?: unknown;
  _isRetry?: boolean;
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  // Auto-refresh on 401 (token expired), then retry once
  if (response.status === 401 && !options._isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiRequest<T>(endpoint, { ...options, _isRetry: true });
    }
    // Refresh failed — throw so callers know we're unauthenticated
    throw new Error('Token expired');
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned invalid response for ${endpoint}`);
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }

  return data as T;
}

// ─── Auth ──────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<{ user: unknown; token: string; refresh_token: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  qrLogin: (code: string) =>
    apiRequest<{ user: unknown; token: string; refresh_token: string }>('/auth/qr-login', {
      method: 'POST',
      body: { code, device_type: 'extension' },
    }),

  verify: () => apiRequest<{ user: unknown }>('/auth/verify'),
};

// ─── Sessions ──────────────────────────────────────────────────
export const sessionApi = {
  getActive: () => apiRequest<{ data: unknown[] }>('/sessions/active'),
  getUpcoming: () => apiRequest<{ data: unknown[] }>('/sessions/upcoming'),

  startBreak: (sessionId: string, source: 'manual' | 'violation' = 'manual') =>
    apiRequest<{ id: string; remaining_break_seconds: number }>(
      `/sessions/${sessionId}/break/start`,
      { method: 'POST', body: { source } }
    ),

  endBreak: (sessionId: string, break_id?: string) =>
    apiRequest<{ remaining_break_seconds: number }>(
      `/sessions/${sessionId}/break/end`,
      { method: 'POST', body: { break_id } }
    ),
};

// ─── Violations ────────────────────────────────────────────────
export const violationApi = {
  create: (body: unknown) =>
    apiRequest('/violations', { method: 'POST', body }),
};
