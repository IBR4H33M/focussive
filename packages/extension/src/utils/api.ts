// ============================================================
// Focussive Extension — API Client
// ============================================================

const API_URL = 'http://localhost:3000';

async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('focussive_token');
  return result.focussive_token || null;
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

interface RequestOptions {
  method?: string;
  body?: unknown;
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data as T;
}

// Auth
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

// Sessions
export const sessionApi = {
  getActive: () => apiRequest<{ data: unknown[] }>('/sessions/active'),
  getUpcoming: () => apiRequest<{ data: unknown[] }>('/sessions/upcoming'),
};

// Violations
export const violationApi = {
  create: (body: unknown) =>
    apiRequest('/violations', { method: 'POST', body }),
};
