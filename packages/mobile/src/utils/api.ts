// ============================================================
// Focussive Mobile — API Client
// ============================================================

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.apiUrl ||
  'http://localhost:3000';

const TOKEN_KEY = 'focussive_token';
const REFRESH_TOKEN_KEY = 'focussive_refresh_token';

// --- Token Storage ---

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// --- API Request Helper ---

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
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

  // Get response text first
  const text = await response.text();
  
  // Try to parse as JSON
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    // If JSON parsing fails, throw a more informative error
    console.error('Failed to parse JSON response:', text);
    throw new ApiError(
      `Server returned invalid JSON: ${text.substring(0, 100)}`,
      'INVALID_RESPONSE',
      response.status
    );
  }

  if (!response.ok) {
    throw new ApiError(data.error || 'Request failed', data.code || 'ERROR', response.status);
  }

  return data as T;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiError';
  }
}

// --- Auth API ---

export const authApi = {
  signup: (body: { email: string; name: string; password: string; passwordConfirm: string; age?: number }) =>
    apiRequest('/auth/signup', { method: 'POST', body }),

  login: (body: { email: string; password: string }) =>
    apiRequest('/auth/login', { method: 'POST', body }),

  qrGenerate: () =>
    apiRequest<{ code: string; expires_at: string; expires_in_seconds: number }>('/auth/qr-generate', { method: 'POST' }),

  qrLogin: (body: { code: string; device_type: string }) =>
    apiRequest('/auth/qr-login', { method: 'POST', body }),

  verify: () => apiRequest<{ user: Record<string, unknown> }>('/auth/verify'),
};

// --- Session API ---

export const sessionApi = {
  getAll: () => apiRequest<{ data: unknown[] }>('/sessions'),

  getById: (id: string) => apiRequest(`/sessions/${id}`),

  create: (body: Record<string, unknown>) =>
    apiRequest('/sessions', { method: 'POST', body }),

  update: (id: string, body: Record<string, unknown>) =>
    apiRequest(`/sessions/${id}`, { method: 'PUT', body }),

  delete: (id: string) =>
    apiRequest(`/sessions/${id}`, { method: 'DELETE' }),

  cancel: (id: string, reason?: string) =>
    apiRequest(`/sessions/${id}/cancel`, { method: 'POST', body: { reason } }),

  start: (id: string) =>
    apiRequest(`/sessions/${id}/start`, { method: 'POST' }),

  startBreak: (id: string, source: 'manual' | 'violation' = 'manual', minutes?: number) =>
    apiRequest<{ id: string; remaining_break_seconds: number }>(
      `/sessions/${id}/break/start`,
      { method: 'POST', body: { source, minutes } }
    ),

  endBreak: (id: string, break_id?: string) =>
    apiRequest<{ remaining_break_seconds: number }>(
      `/sessions/${id}/break/end`,
      { method: 'POST', body: { break_id } }
    ),

  getActive: () => apiRequest<{ data: unknown[] }>('/sessions/active'),

  getUpcoming: () => apiRequest<{ data: unknown[] }>('/sessions/upcoming'),
};

// --- Violation API ---

export const violationApi = {
  create: (body: Record<string, unknown>) =>
    apiRequest('/violations', { method: 'POST', body }),

  getBySession: (sessionId: string) =>
    apiRequest<{ data: unknown[] }>(`/sessions/${sessionId}/violations`),

  getStats: () => apiRequest('/violations/stats'),
};

// --- App Group API ---

export const appGroupApi = {
  getAll: () => apiRequest<{ data: unknown[] }>('/app-groups'),

  create: (body: { name: string; apps: unknown[] }) =>
    apiRequest('/app-groups', { method: 'POST', body }),

  update: (id: string, body: Record<string, unknown>) =>
    apiRequest(`/app-groups/${id}`, { method: 'PUT', body }),

  delete: (id: string) =>
    apiRequest(`/app-groups/${id}`, { method: 'DELETE' }),

  getApps: () => apiRequest<{ data: unknown[] }>('/app-groups/apps'),
};

// --- History API ---

export const historyApi = {
  getAll: (page = 1, limit = 20) =>
    apiRequest<{ data: unknown[]; total: number; page: number; limit: number }>(
      `/history?page=${page}&limit=${limit}`
    ),

  getById: (id: string) => apiRequest(`/history/${id}`),

  export: (body?: { session_ids?: string[]; start_date?: string; end_date?: string }) =>
    apiRequest('/history/export', { method: 'POST', body }),

  deleteOne: (id: string) =>
    apiRequest(`/history/${id}`, { method: 'DELETE' }),

  deleteAll: () =>
    apiRequest('/history', { method: 'DELETE' }),
};

// --- User API ---

export const userApi = {
  getProfile: () => apiRequest('/user/profile'),

  updateProfile: (body: { name?: string; age?: number }) =>
    apiRequest('/user/profile', { method: 'PUT', body }),

  updatePassword: (body: { current_password: string; new_password: string; new_password_confirm: string }) =>
    apiRequest('/user/password', { method: 'PUT', body }),

  deleteAccount: () =>
    apiRequest('/user/account', { method: 'DELETE' }),
};

// --- Device API ---

export const deviceApi = {
  register: (body: { device_type: string; device_token?: string; device_name?: string }) =>
    apiRequest('/devices/register', { method: 'POST', body }),

  remove: (id: string) =>
    apiRequest(`/devices/${id}`, { method: 'DELETE' }),
};

// --- Website Group API ---

export const websiteGroupApi = {
  getAll: () => apiRequest<{ data: unknown[] }>('/website-groups'),

  create: (body: { name: string; websites: string[] }) =>
    apiRequest('/website-groups', { method: 'POST', body }),

  update: (id: string, body: { name?: string; websites?: string[] }) =>
    apiRequest(`/website-groups/${id}`, { method: 'PUT', body }),

  delete: (id: string) =>
    apiRequest(`/website-groups/${id}`, { method: 'DELETE' }),
};

