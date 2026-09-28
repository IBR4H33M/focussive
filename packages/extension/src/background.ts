// ============================================================
// Focussive Extension — Background Service Worker
// ============================================================

import { sessionApi, violationApi, deviceApi, isAuthenticated } from './utils/api';
import {
  getActiveSession,
  setActiveSession,
  setUpcomingSessions,
  setBlockedTimer,
  clearBlockedTimer,
  getBlockedTimers,
  getDeviceId,
  getExtensionSettings,
  setExtensionSettings,
  type StoredSession,
} from './utils/storage';
import { isBlockedWebsite, getNextSessionOccurrence, isSessionInActiveWindow, getRemainingSeconds } from '@focussive/shared';
import type { ViolationResponseMessage } from './utils/messaging';

// --- Session Polling (every 5 seconds) ---

const POLL_INTERVAL_MS = 5000;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;
let lastSessionId: string | null = null;
let lastSessionName: string | null = null;
const skippedSessionIds = new Set<string>();

// Active break timer: { sessionId, breakId, endsAt }
let activeBreakTimer: { sessionId: string; breakId: string; timeoutId: ReturnType<typeof setTimeout> } | null = null;

async function pollSessions() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) return;

    const [activeRes, allRes] = await Promise.all([
      sessionApi.getActive(),
      sessionApi.getAll(),
    ]);

    const activeSessions = (activeRes.data as (StoredSession & {
      remaining_break_seconds?: number;
      is_on_break?: boolean;
      break_ends_at?: string | null;
    })[]) || [];
    const allSessions = (allRes.data as StoredSession[]) || [];
    const active = activeSessions.length > 0 ? activeSessions[0] : null;

    let normalizedStartedAt = active?.started_at;
    if (active?.start_time && (active as any).schedule && (active as any).schedule !== 'adhoc') {
      const [hStr, mStr] = active.start_time.split(':');
      const startD = new Date();
      startD.setHours(parseInt(hStr, 10) || 0, parseInt(mStr, 10) || 0, 0, 0);
      const endD = new Date(startD.getTime() + active.duration * 60_000);
      if (startD.getTime() <= Date.now() && Date.now() < endD.getTime()) {
        normalizedStartedAt = startD.toISOString();
      }
    }

    const storedSession: StoredSession | null = active ? {
      ...active,
      started_at: normalizedStartedAt || active.started_at,
      mobile_focus: (active as any).mobile_focus ?? false,
      browser_focus: active.browser_focus ?? true,
      blocked_websites: active.blocked_websites || [],
      violations_count: active.violations_count || 0,
      allowlist: active.allowlist || [],
      allow_breaks: active.allow_breaks || false,
      max_break_minutes: active.max_break_minutes,
      remaining_break_seconds: active.remaining_break_seconds ?? 0,
      break_used_seconds: (active as any).break_used_seconds ?? 0,
      is_on_break: active.is_on_break ?? false,
      break_started_at: (active as any).break_started_at ?? null,
      break_ends_at: active.break_ends_at ?? null,
    } : null;

    // Sync in-memory breakActive from API (catches breaks started from mobile)
    const wasBreakActive = breakActive;
    if (storedSession?.is_on_break) {
      breakActive = true;
    } else if (!activeBreakTimer) {
      // Only clear if we don't have a locally-managed timer
      breakActive = false;
    }

    if (wasBreakActive && !breakActive) {
      // Break just completed! Check all open tabs to re-block websites immediately
      checkAllTabs().catch(() => {});
    }

    // Notify on new active session
    if (storedSession && storedSession.id !== lastSessionId) {
      lastSessionId = storedSession.id;
      lastSessionName = storedSession.name;
      const settings = await getExtensionSettings();
      if (settings.desktop_notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-48.png'),
          title: 'Focus Session Active',
          message: `Focus session "${storedSession.name}" is now running. Distracting websites are blocked.`,
          priority: 2,
        });
      }
    } else if (!storedSession && lastSessionId) {
      let isSkipped = skippedSessionIds.has(lastSessionId);
      let sessionName = lastSessionName;

      // 1. Check allSessions list
      const prevSession = allSessions.find((s) => s.id === lastSessionId);
      if (prevSession) {
        if (!sessionName) sessionName = prevSession.name;
        if (prevSession.skipped_until && new Date(prevSession.skipped_until).getTime() > Date.now()) {
          isSkipped = true;
        }
      }

      // 2. If not found or not marked yet, fetch single session detail to confirm
      if (!isSkipped) {
        try {
          const detailRes = await sessionApi.getById(lastSessionId);
          const detail = (detailRes as any)?.data || detailRes;
          if (detail) {
            if (!sessionName) sessionName = detail.name;
            if (detail.skipped_until && new Date(detail.skipped_until).getTime() > Date.now()) {
              isSkipped = true;
            }
          }
        } catch {}
      }

      const settings = await getExtensionSettings();
      if (settings.desktop_notifications) {
        if (isSkipped) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon-48.png'),
            title: 'Session Skipped',
            message: sessionName
              ? `Focus session "${sessionName}" was skipped.`
              : 'Your focus session was skipped.',
            priority: 2,
          });
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon-48.png'),
            title: 'Session Completed',
            message: 'Your focus session has finished. Great job!',
            priority: 2,
          });
        }
      }

      skippedSessionIds.delete(lastSessionId);
      lastSessionId = null;
      lastSessionName = null;
    }

    await setActiveSession(storedSession);

    const now = new Date();
    const activeIds = new Set(activeSessions.map((s) => s.id));
    const pausedIds = new Set(
      allSessions.filter((s) => (s as any).status === 'paused').map((s) => s.id)
    );

    // Candidates for upcoming: all non-active, non-paused, non-completed, non-cancelled sessions
    const candidates = allSessions.filter(
      (s) =>
        (s as any).status !== 'completed' &&
        (s as any).status !== 'cancelled' &&
        !activeIds.has(s.id) &&
        !pausedIds.has(s.id) &&
        !isSessionInActiveWindow(s as any, now)
    );

    const validUpcomingSessions = candidates
      .map((s) => ({ session: s, nextOccurrence: getNextSessionOccurrence(s as any, now) }))
      .filter((item): item is { session: StoredSession; nextOccurrence: Date } => item.nextOccurrence !== null)
      .sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime())
      .map((item) => ({
        ...item.session,
        mobile_focus: (item.session as any).mobile_focus ?? false,
        browser_focus: item.session.browser_focus ?? true,
        blocked_websites: item.session.blocked_websites || [],
        violations_count: item.session.violations_count || 0,
        allowlist: item.session.allowlist || [],
        allow_breaks: item.session.allow_breaks || false,
        remaining_break_seconds: item.session.remaining_break_seconds ?? 0,
      }));

    await setUpcomingSessions(validUpcomingSessions);
  } catch (error) {
    console.error('[Focussive BG] Poll error:', error);
  }
}

function startPolling() {
  if (pollIntervalId) return;
  pollSessions(); // Immediate first poll
  pollIntervalId = setInterval(pollSessions, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

// --- Break Management ---

// Is a break currently active? Skip violation detection during breaks.
let breakActive = false;

async function handleStartBreak(sessionId: string, minutes: number) {
  try {
    const breakRes = await sessionApi.startBreak(sessionId, 'manual', minutes);

    // Clear any previous break timer
    if (activeBreakTimer) {
      clearTimeout(activeBreakTimer.timeoutId);
      activeBreakTimer = null;
    }
    chrome.alarms.clear(`break_timer_${sessionId}`).catch(() => {});

    breakActive = true;
    const durationMs = minutes * 60 * 1000;

    // Use chrome.alarms to guarantee wake-up in Manifest V3 even if service worker sleeps
    chrome.alarms.create(`break_timer_${sessionId}`, { when: Date.now() + durationMs });

    // Immediately poll and store updated break status
    await pollSessions();

    // Notify any open popup
    chrome.runtime.sendMessage({ type: 'BREAK_STARTED', minutes }).catch(() => {});

    const timeoutId = setTimeout(async () => {
      await endBreak(sessionId, breakRes.id);
    }, durationMs);

    activeBreakTimer = { sessionId, breakId: breakRes.id, timeoutId };
  } catch (error) {
    console.error('[Focussive BG] Start break error:', error);
  }
}

async function endBreak(sessionId: string, breakId?: string) {
  // Clear local break state immediately before API call
  breakActive = false;
  if (activeBreakTimer) {
    clearTimeout(activeBreakTimer.timeoutId);
    activeBreakTimer = null;
  }
  chrome.alarms.clear(`break_timer_${sessionId}`).catch(() => {});

  try {
    await sessionApi.endBreak(sessionId, breakId);
  } catch (error: any) {
    // 404 = break already closed by mobile/another client — not an error
    if (!error?.message?.includes('404') && error?.statusCode !== 404) {
      console.error('[Focussive BG] End break error:', error);
    }
  }

  // Always poll and re-block regardless of API result
  await pollSessions();
  chrome.runtime.sendMessage({ type: 'BREAK_ENDED' }).catch(() => {});
  // Re-check all open tabs immediately so blocked sites are blocked right away
  await checkAllTabs();
}

async function checkAllTabs() {
  try {
    const session = await getActiveSession();
    if (!session || !session.browser_focus) return;
    // Don't re-block during an active break (covers SW restart where breakActive is stale)
    if (breakActive || (session.is_on_break ?? false)) return;
    const blockedList = session.blocked_websites || [];
    if (blockedList.length === 0) return;

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url) {
        const isAllowlisted = session.allowlist?.some((item) => {
          if (item.website_name && tab.url!.includes(item.website_name)) return true;
          return false;
        });
        if (isAllowlisted) continue;

        if (isBlockedWebsite(tab.url, blockedList)) {
          const hostname = new URL(tab.url).hostname;
          const settings = await getExtensionSettings();
          const sessionRemaining = getRemainingSeconds(session as any);
          const effectiveBreakSeconds = Math.min(
            session.remaining_break_seconds ?? 0,
            Math.max(0, sessionRemaining - 1)
          );
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_OVERLAY',
            sessionId: session.id,
            websiteName: hostname,
            allowBreaks: session.allow_breaks || false,
            remainingBreakSeconds: effectiveBreakSeconds,
            settings,
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[Focussive BG] checkAllTabs error:', e);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('break_timer_')) {
    const sessionId = alarm.name.replace('break_timer_', '');
    const breakId = activeBreakTimer?.breakId;
    await endBreak(sessionId, breakId);
  }
});

// --- Tab Monitoring ---

const VIOLATION_DELAY_MS = 5000; // 5 seconds before triggering violation

async function checkTab(tabId: number, url: string) {
  // Skip if on a break — also check stored session in case SW restarted and
  // in-memory breakActive was reset to false while a break is still active.
  const sessionForBreakCheck = await getActiveSession();
  const isCurrentlyOnBreak = breakActive || (sessionForBreakCheck?.is_on_break ?? false);
  if (isCurrentlyOnBreak) return;

  const session = sessionForBreakCheck;
  if (!session || !session.browser_focus) return;

  const blockedList = session.blocked_websites || [];
  if (blockedList.length === 0) return;

  // Check if URL is in allowlist
  const isAllowlisted = session.allowlist?.some((item) => {
    if (item.website_name && url.includes(item.website_name)) return true;
    return false;
  });
  if (isAllowlisted) return;

  if (isBlockedWebsite(url, blockedList)) {
    // Start 5-second timer
    const timers = await getBlockedTimers();
    const hostname = new URL(url).hostname;

    if (!timers[hostname]) {
      await setBlockedTimer(hostname, Date.now());

      // After 5 seconds, check if still on blocked site
      setTimeout(async () => {
        try {
          // Re-check break status before showing overlay (including stored session fallback)
          const sessionCheck = await getActiveSession();
          if (breakActive || (sessionCheck?.is_on_break ?? false)) {
            await clearBlockedTimer(hostname);
            return;
          }
          const currentSession = await getActiveSession();
          const tab = await chrome.tabs.get(tabId);
          if (tab.url && isBlockedWebsite(tab.url, blockedList)) {
            const settings = await getExtensionSettings();
            const sessionToUse = currentSession || session;
            const sessionRemaining = getRemainingSeconds(sessionToUse as any);
            const effectiveBreakSeconds = Math.min(
              sessionToUse.remaining_break_seconds ?? 0,
              Math.max(0, sessionRemaining - 1)
            );
            // Pass break info and settings to overlay
            await chrome.tabs.sendMessage(tabId, {
              type: 'SHOW_OVERLAY',
              sessionId: session.id,
              websiteName: hostname,
              allowBreaks: sessionToUse.allow_breaks || false,
              remainingBreakSeconds: effectiveBreakSeconds,
              settings,
            });
          }
          await clearBlockedTimer(hostname);
        } catch {
          await clearBlockedTimer(hostname);
        }
      }, VIOLATION_DELAY_MS);
    }
  } else {
    // User navigated away, clear any pending timers
    const hostname = new URL(url).hostname;
    await clearBlockedTimer(hostname);
  }
}

// Tab activated
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await checkTab(activeInfo.tabId, tab.url);
    }
  } catch {
    // Tab may have been closed
  }
});

// Tab URL changed
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    const url = changeInfo.url || tab.url;
    if (url) {
      await checkTab(tabId, url);
    }
  }
});

// --- Message Handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SESSION') {
    (async () => {
      const session = await getActiveSession();
      const { upcoming_sessions } = await chrome.storage.local.get('upcoming_sessions');
      sendResponse({
        activeSession: session,
        upcomingSessions: upcoming_sessions || [],
        breakActive,
      });
    })();
    return true; // Will respond asynchronously
  }

  if (message.type === 'SYNC_NOW') {
    (async () => {
      await pollSessions();
      const session = await getActiveSession();
      const { upcoming_sessions } = await chrome.storage.local.get('upcoming_sessions');
      const updatedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      await setExtensionSettings({ last_synced_at: updatedTime });
      sendResponse({
        success: true,
        timestamp: updatedTime,
        activeSession: session,
        upcomingSessions: upcoming_sessions || [],
      });
    })();
    return true;
  }

  if (message.type === 'VIOLATION_RESPONSE') {
    const msg = message as ViolationResponseMessage;
    handleViolationResponse(msg);
  }

  if (message.type === 'CLOSE_TAB') {
    if (sender.tab && sender.tab.id) {
      chrome.tabs.remove(sender.tab.id);
    }
  }

  if (message.type === 'START_BREAK') {
    handleStartBreak(message.sessionId, message.minutes);
  }

  if (message.type === 'END_BREAK') {
    const breakId = activeBreakTimer ? activeBreakTimer.breakId : undefined;
    endBreak(message.sessionId, breakId);
  }

  if (message.type === 'SKIP_SESSION') {
    (async () => {
      try {
        if (message.sessionId) {
          skippedSessionIds.add(message.sessionId);
        }
        const res = await sessionApi.skip(message.sessionId);
        sendResponse({ success: true, res });
        pollSessions().catch(() => {});
      } catch (err: any) {
        sendResponse({ success: false, error: err.message || 'Failed to skip' });
      }
    })();
    return true;
  }

  if (message.type === 'SESSION_SKIPPED') {
    if (message.sessionId) {
      skippedSessionIds.add(message.sessionId);
    }
    pollSessions().catch(() => {});
    sendResponse?.({ success: true });
    return true;
  }

  if (message.type === 'SYNC_NOW') {
    pollSessions().catch(() => {});
    sendResponse?.({ success: true });
    return true;
  }

  return false;
});

async function handleViolationResponse(msg: ViolationResponseMessage) {
  try {
    await violationApi.create({
      session_id: msg.sessionId,
      website_name: msg.websiteName,
      duration_seconds: msg.durationSeconds,
      action_taken: msg.action,
    });

    // Refresh session data
    await pollSessions();
  } catch (error) {
    console.error('[Focussive BG] Violation log error:', error);
  }
}

// --- Heartbeat (every 30s) ---

const HEARTBEAT_INTERVAL_MS = 30_000;
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

async function sendHeartbeat() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) return;
    const deviceId = await getDeviceId();
    await deviceApi.heartbeat(deviceId);
  } catch (error) {
    console.error('[Focussive BG] Heartbeat error:', error);
  }
}

function startHeartbeat() {
  if (heartbeatIntervalId) return;
  sendHeartbeat(); // Immediate first heartbeat
  heartbeatIntervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

// --- Side Panel Setup ---

function setupSidePanel() {
  if ((chrome as any).sidePanel?.setPanelBehavior) {
    (chrome as any).sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err: any) => console.warn('[Focussive BG] sidePanel.setPanelBehavior error:', err));
  }
}

// Fallback for action click to guarantee side panel opens
chrome.action?.onClicked?.addListener((tab) => {
  if (tab.windowId && (chrome as any).sidePanel?.open) {
    (chrome as any).sidePanel.open({ windowId: tab.windowId }).catch((err: any) => {
      console.warn('[Focussive BG] sidePanel.open error:', err);
    });
  }
});

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Focussive] Extension installed');
  setupSidePanel();
  startPolling();
  startHeartbeat();
});

chrome.runtime.onStartup.addListener(() => {
  setupSidePanel();
  startPolling();
  startHeartbeat();
});

// Start on load
setupSidePanel();
startPolling();
startHeartbeat();

