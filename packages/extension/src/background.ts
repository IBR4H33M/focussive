// ============================================================
// Focussive Extension — Background Service Worker
// ============================================================

import { sessionApi, violationApi, isAuthenticated } from './utils/api';
import {
  getActiveSession,
  setActiveSession,
  setUpcomingSessions,
  setBlockedTimer,
  clearBlockedTimer,
  getBlockedTimers,
  type StoredSession,
} from './utils/storage';
import { isBlockedWebsite } from '@focussive/shared';
import type { ViolationResponseMessage } from './utils/messaging';

// --- Session Polling (every 5 seconds) ---

const POLL_INTERVAL_MS = 5000;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

async function pollSessions() {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) return;

    const [activeRes, upcomingRes] = await Promise.all([
      sessionApi.getActive(),
      sessionApi.getUpcoming(),
    ]);

    const activeSessions = activeRes.data as StoredSession[];
    const active = activeSessions.length > 0 ? activeSessions[0] : null;

    await setActiveSession(active ? {
      ...active,
      blocked_websites: active.blocked_websites || [],
      violations_count: active.violations_count || 0,
      allowlist: active.allowlist || [],
    } : null);

    await setUpcomingSessions(
      (upcomingRes.data as StoredSession[]).map((s) => ({
        ...s,
        blocked_websites: s.blocked_websites || [],
        violations_count: s.violations_count || 0,
        allowlist: s.allowlist || [],
      }))
    );
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

// --- Tab Monitoring ---

const VIOLATION_DELAY_MS = 5000; // 5 seconds before triggering violation

async function checkTab(tabId: number, url: string) {
  const session = await getActiveSession();
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
          const tab = await chrome.tabs.get(tabId);
          if (tab.url && isBlockedWebsite(tab.url, blockedList)) {
            // Inject overlay
            await chrome.tabs.sendMessage(tabId, {
              type: 'SHOW_OVERLAY',
              sessionId: session.id,
              websiteName: hostname,
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SESSION') {
    (async () => {
      const session = await getActiveSession();
      const { upcoming_sessions } = await chrome.storage.local.get('upcoming_sessions');
      sendResponse({
        activeSession: session,
        upcomingSessions: upcoming_sessions || [],
      });
    })();
    return true; // Will respond asynchronously
  }

  if (message.type === 'VIOLATION_RESPONSE') {
    const msg = message as ViolationResponseMessage;
    handleViolationResponse(msg);
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

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Focussive] Extension installed');
  startPolling();
});

chrome.runtime.onStartup.addListener(() => {
  startPolling();
});

// Start polling on load
startPolling();
