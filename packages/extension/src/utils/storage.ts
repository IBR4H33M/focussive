// ============================================================
// Focussive Extension — Storage Helpers
// ============================================================

export interface StoredSession {
  id: string;
  name: string;
  duration: number;
  start_time: string;
  started_at?: string;
  browser_focus: boolean;
  blocked_websites: string[];
  violations_count: number;
  allowlist: Array<{ app_name?: string; website_name?: string }>;
}

export async function getActiveSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.local.get('active_session');
  return result.active_session || null;
}

export async function setActiveSession(session: StoredSession | null): Promise<void> {
  if (session) {
    await chrome.storage.local.set({ active_session: session });
  } else {
    await chrome.storage.local.remove('active_session');
  }
}

export async function getUpcomingSessions(): Promise<StoredSession[]> {
  const result = await chrome.storage.local.get('upcoming_sessions');
  return result.upcoming_sessions || [];
}

export async function setUpcomingSessions(sessions: StoredSession[]): Promise<void> {
  await chrome.storage.local.set({ upcoming_sessions: sessions });
}

export async function getBlockedTimers(): Promise<Record<string, number>> {
  const result = await chrome.storage.local.get('blocked_timers');
  return result.blocked_timers || {};
}

export async function setBlockedTimer(url: string, timestamp: number): Promise<void> {
  const timers = await getBlockedTimers();
  timers[url] = timestamp;
  await chrome.storage.local.set({ blocked_timers: timers });
}

export async function clearBlockedTimer(url: string): Promise<void> {
  const timers = await getBlockedTimers();
  delete timers[url];
  await chrome.storage.local.set({ blocked_timers: timers });
}
