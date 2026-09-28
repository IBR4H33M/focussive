// ============================================================
// Focussive Mobile — Session Context
// ============================================================

import React, {
  createContext,
  useContext,
  useState,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { sessionApi, appGroupApi, violationApi, historyApi } from '@/utils/api';
import { startMonitoring, stopMonitoring, hasRequiredPermissions, addListener, takeBreak, endBreak, syncBreakState } from '@focussive/app-blocker';
import { useAuth } from './AuthContext';
import { type Session, type AppGroup, ViolationAction, SessionStatus, isSessionInActiveWindow, getRemainingSeconds, getEffectiveSessionStartMs } from '@focussive/shared';
import { scheduleSessionReminders, notifySessionCompleted } from '@/utils/sessionReminders';
import {
  evaluateSessionQualityTier,
  recordEarnedTier,
  type QualityTierInfo,
} from '@/utils/gamification';

// Poll every 30 seconds — aggressive 5s polling was causing Supabase rate-limits
const POLL_INTERVAL_MS = 30_000;

export const skippedSessionIds = new Set<string>();
export function markSessionAsSkipped(sessionId: string) {
  skippedSessionIds.add(sessionId);
}

interface SessionState {
  activeSessions: Session[];
  upcomingSessions: Session[];
  allSessions: Session[];
  isLoading: boolean;
  error: string | null;
}

type SessionAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SESSIONS'; payload: { active: Session[]; upcoming: Session[]; all: Session[] } }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' };

export interface CompletedSessionTierData {
  tier: QualityTierInfo;
  sessionName: string;
  durationMinutes: number;
  violationsBlocked: number;
}

interface SessionContextType extends SessionState {
  refreshSessions: (silent?: boolean) => Promise<void>;
  handleBreak: (sessionId: string, minutes: number) => Promise<void>;
  completedSessionTierData: CompletedSessionTierData | null;
  dismissCompletedTierCard: () => void;
  triggerSessionComplete: (data: CompletedSessionTierData) => void;
}

const SessionContext = createContext<SessionContextType | null>(null);

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SESSIONS':
      return {
        ...state,
        activeSessions: action.payload.active,
        upcomingSessions: action.payload.upcoming,
        allSessions: action.payload.all,
        isLoading: false,
        error: null,
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fastTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cache app groups so we don't re-fetch every 30s when the session hasn't changed
  const cachedGroupsRef = useRef<AppGroup[] | null>(null);
  // Track which session ID the native service is currently running for.
  // undefined = never synced, null = explicitly stopped, string = running for that ID.
  const runningSessionIdRef = useRef<string | null | undefined>(undefined);
  const violationListenerRef = useRef<ReturnType<typeof addListener> | null>(null);
  const breakStartedListenerRef = useRef<ReturnType<typeof addListener> | null>(null);
  const breakEndedListenerRef = useRef<ReturnType<typeof addListener> | null>(null);
  const breakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [completedSessionTierData, setCompletedSessionTierData] = useState<CompletedSessionTierData | null>(null);
  const prevActiveSessionsRef = useRef<Session[]>([]);
  const allSessionsRef = useRef<Session[]>([]);
  const activeSessionsRef = useRef<Session[]>([]);

  const dismissCompletedTierCard = useCallback(() => {
    setCompletedSessionTierData(null);
  }, []);

  const triggerSessionComplete = useCallback((data: CompletedSessionTierData) => {
    recordEarnedTier(data.tier.key);
    setCompletedSessionTierData(data);
  }, []);

  const [state, dispatch] = useReducer(sessionReducer, {
    activeSessions: [],
    upcomingSessions: [],
    allSessions: [],
    isLoading: true,
    error: null,
  });

  const refreshSessions = useCallback(async (silent = false) => {
    if (!isAuthenticated) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }
    if (!silent || allSessionsRef.current.length === 0) {
      dispatch({ type: 'SET_LOADING', payload: true });
    }
    try {
      const [activeRes, upcomingRes, allRes] = await Promise.all([
        sessionApi.getActive(),
        sessionApi.getUpcoming(),
        sessionApi.getAll(),
      ]);

      const allSessions = allRes.data as Session[];
      const now = new Date();
      const nowMs = now.getTime();

      // 1. Existing active sessions from backend that haven't elapsed
      const activeSessionsFromApi = (activeRes.data as Session[])
        .map((s) => {
          if (s.start_time && (s as any).schedule && (s as any).schedule !== 'adhoc') {
            const [hStr, mStr] = s.start_time.split(':');
            const startD = new Date(now);
            startD.setHours(parseInt(hStr, 10) || 0, parseInt(mStr, 10) || 0, 0, 0);
            const endD = new Date(startD.getTime() + s.duration * 60_000);
            if (startD.getTime() <= nowMs && nowMs < endD.getTime()) {
              return {
                ...s,
                started_at: startD.toISOString(),
              };
            }
          }
          return s;
        })
        .filter((s) => {
          if (getRemainingSeconds(s) <= 0) {
            return false; // Session time has elapsed
          }
          return true;
        });

      // 2. Evaluate all sessions to detect any scheduled sessions currently in their active window
      const activeIds = new Set(activeSessionsFromApi.map(s => s.id));
      const newlyActivated: Session[] = [];

      for (const s of allSessions) {
        if (!activeIds.has(s.id) && s.status === 'scheduled' && isSessionInActiveWindow(s, now)) {
          const [hStr, mStr] = (s.start_time || '00:00').split(':');
          const startD = new Date(now);
          startD.setHours(parseInt(hStr, 10) || 0, parseInt(mStr, 10) || 0, 0, 0);

          const activeSession: Session = {
            ...s,
            status: SessionStatus.ACTIVE,
            started_at: startD.toISOString(),
          };
          newlyActivated.push(activeSession);
          activeIds.add(s.id);

          // Asynchronously notify backend to mark active with exact local slot start ISO
          sessionApi.start(s.id, startD.toISOString()).catch(() => {});
        }
      }

      const activeSessions = [...activeSessionsFromApi, ...newlyActivated];
      const upcomingSessions = (upcomingRes.data as Session[]).filter(s => !activeIds.has(s.id));

      allSessionsRef.current = allSessions;
      activeSessionsRef.current = activeSessions;

      // Detect if an active session just ended / elapsed
      if (prevActiveSessionsRef.current.length > 0) {
        for (const prev of prevActiveSessionsRef.current) {
          if (!activeIds.has(prev.id)) {
            // Check if session was skipped or cancelled
            const currentSession = allSessions.find(s => s.id === prev.id);
            const isExplicitlySkipped = skippedSessionIds.has(prev.id);
            const isSkipped = isExplicitlySkipped ||
              currentSession?.status === SessionStatus.SKIPPED ||
              Boolean(currentSession?.skipped_until && new Date(currentSession.skipped_until).getTime() > Date.now());
            const isCancelled = currentSession?.status === SessionStatus.CANCELLED;

            if (isSkipped || isCancelled) {
              // Skipped or cancelled sessions do NOT earn quality tier badges, show celebration modal, or post completed notification
              skippedSessionIds.delete(prev.id);
              continue;
            }

            // Verify in history that backend actually recorded a 'completed' session
            // ONLY post completed notification if history confirms the session was successfully completed!
            historyApi.getAll(1, 5).then((historyRes: any) => {
              const historyList = historyRes?.data || historyRes || [];
              const latestRecord = Array.isArray(historyList)
                ? historyList.find((h: any) => h.session_id === prev.id)
                : null;

              if (latestRecord && (latestRecord.status === 'skipped' || latestRecord.status === 'cancelled')) {
                return;
              }

              const completedRecord = Array.isArray(historyList)
                ? historyList.find((h: any) => h.session_id === prev.id && h.status === 'completed')
                : null;

              if (completedRecord) {
                // Post completed notification ONLY when confirmed completed!
                notifySessionCompleted(prev.id, prev.name);

                const actualDuration = completedRecord.actual_duration ?? prev.duration;
                const scheduledDuration = completedRecord.scheduled_duration ?? prev.duration;
                const violationsCount = completedRecord.violations_count ?? 0;
                const breaksCount = (completedRecord.breaks_count ?? 0) + (completedRecord.emergency_breaks_count ?? 0);

                const tier = evaluateSessionQualityTier({
                  actualDuration,
                  scheduledDuration,
                  violationsCount,
                  breaksUsedCount: breaksCount,
                  status: 'completed',
                  isOnSchedule: completedRecord.is_on_schedule ?? true,
                });

                recordEarnedTier(tier.key);
                setCompletedSessionTierData({
                  tier,
                  sessionName: completedRecord.session_name || prev.name,
                  durationMinutes: actualDuration,
                  violationsBlocked: violationsCount,
                });
              }
            }).catch((err) => {
              console.warn('[SessionContext] Could not verify completed session in history:', err);
            });

            break;
          }
        }
      }
      prevActiveSessionsRef.current = activeSessions;

      dispatch({
        type: 'SET_SESSIONS',
        payload: {
          active: activeSessions,
          upcoming: upcomingSessions,
          all: allSessions,
        },
      });

      // Schedule/refresh local notification reminders based on latest sessions
      scheduleSessionReminders(allSessions, activeSessions).catch(() => {});
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load sessions',
      });
    }
  }, [isAuthenticated]);

  // Initial fetch + adaptive polling (5s when session is active to sync breaks instantly, 30s when idle)
  const hasActiveSession = state.activeSessions.length > 0;
  useEffect(() => {
    if (isAuthenticated) {
      refreshSessions(false);
      const pollDelay = hasActiveSession ? 5_000 : POLL_INTERVAL_MS;
      intervalRef.current = setInterval(() => {
        refreshSessions(true);
      }, pollDelay);
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, refreshSessions, hasActiveSession]);

  // In-memory 5s ticker: checks if any scheduled session enters active window (0 network overhead)
  useEffect(() => {
    if (!isAuthenticated) return;
    fastTickerRef.current = setInterval(() => {
      const now = new Date();
      const currentAll = allSessionsRef.current;
      const currentActiveIds = new Set(activeSessionsRef.current.map(s => s.id));
      let shouldRefresh = false;

      for (const s of currentAll) {
        if (!currentActiveIds.has(s.id) && s.status === 'scheduled' && isSessionInActiveWindow(s, now)) {
          shouldRefresh = true;
          break;
        }
      }

      // Also check if an active session duration elapsed
      for (const a of activeSessionsRef.current) {
        if (a.started_at) {
          const endMs = new Date(a.started_at).getTime() + a.duration * 60_000;
          if (now.getTime() >= endMs) {
            shouldRefresh = true;
            break;
          }
        }
      }

      if (shouldRefresh) {
        refreshSessions();
      }
    }, 5000);

    return () => {
      if (fastTickerRef.current) clearInterval(fastTickerRef.current);
    };
  }, [isAuthenticated, refreshSessions]);

  // Sync active sessions with the native App Blocker.
  // Key fix: compare by session ID so polling re-fetches that produce the same
  // session do NOT restart the service or re-attach listeners.
  useEffect(() => {
    async function syncAppBlocker() {
      const mobileActiveSession = state.activeSessions.find(s => s.mobile_focus === true) ?? null;
      const desiredId = mobileActiveSession?.id ?? null;

      // ── Same session ID → sync dynamic break & remaining time to native service ──
      if (desiredId === runningSessionIdRef.current) {
        if (mobileActiveSession) {
          const remainingBreakSec = (mobileActiveSession as any).remaining_break_seconds != null
            ? (mobileActiveSession as any).remaining_break_seconds
            : (mobileActiveSession.allow_breaks
                ? Math.max(0, ((mobileActiveSession.max_break_minutes || 5) * 60) - (mobileActiveSession.break_used_seconds ?? 0))
                : 0);

          const breakEndsMs = (mobileActiveSession as any).break_ends_at
            ? new Date((mobileActiveSession as any).break_ends_at).getTime()
            : null;
          const breakStartedMs = (mobileActiveSession as any).break_started_at
            ? new Date((mobileActiveSession as any).break_started_at).getTime()
            : null;

          // If break_ends_at has already passed while on break, auto-close it
          if ((mobileActiveSession as any).is_on_break && breakEndsMs && Date.now() >= breakEndsMs) {
            sessionApi.endBreak(mobileActiveSession.id).catch(() => {});
          }

          syncBreakState(
            (mobileActiveSession as any).is_on_break ?? false,
            remainingBreakSec,
            mobileActiveSession.allow_breaks ?? false,
            breakEndsMs,
            breakStartedMs,
          );
        }
        return;
      }

      // ── Tear down previous state ───────────────────────────────────────────
      if (violationListenerRef.current) { violationListenerRef.current.remove(); violationListenerRef.current = null; }
      if (breakStartedListenerRef.current) { breakStartedListenerRef.current.remove(); breakStartedListenerRef.current = null; }
      if (breakEndedListenerRef.current) { breakEndedListenerRef.current.remove(); breakEndedListenerRef.current = null; }

      // ── No active mobile session → stop service ────────────────────────────
      if (!mobileActiveSession || !desiredId) {
        runningSessionIdRef.current = null;
        cachedGroupsRef.current = null;
        stopMonitoring();
        console.log('AppBlocker: stopped (no active mobile session)');
        return;
      }

      // ── New session → start service ────────────────────────────────────────
      try {
        const hasPerms = await hasRequiredPermissions();
        if (!hasPerms) {
          console.log('AppBlocker: missing required permissions, skipping start');
          return;
        }

        // Re-fetch groups only when session changes
        const groupsRes = await appGroupApi.getAll();
        cachedGroupsRef.current = groupsRes.data as AppGroup[];

        const targetGroups = cachedGroupsRef.current.filter(
          g => mobileActiveSession.app_group_ids?.includes(g.id)
        );

        if (targetGroups.length === 0) {
          console.log('AppBlocker: no app groups assigned, skipping start');
          runningSessionIdRef.current = desiredId; // mark as "processed" to avoid loop
          return;
        }

        const blockedPackages = [
          ...new Set(
            targetGroups.flatMap(g =>
              g.apps.map(app => app.package_name || app.id).filter(Boolean)
            )
          ),
        ] as string[];

        console.log('AppBlocker: starting monitoring for', blockedPackages.length, 'packages, session', desiredId);

        // Compute remaining break seconds for this session
        const remainingBreakSec = (mobileActiveSession as any).remaining_break_seconds != null
          ? (mobileActiveSession as any).remaining_break_seconds
          : (mobileActiveSession.allow_breaks
              ? Math.max(0, ((mobileActiveSession.max_break_minutes || 5) * 60) - (mobileActiveSession.break_used_seconds ?? 0))
              : 0);

        const startedAtMs = getEffectiveSessionStartMs(mobileActiveSession);
        const endAtMs = startedAtMs + (mobileActiveSession.duration || 25) * 60_000;

        startMonitoring(
          blockedPackages,
          mobileActiveSession.allow_breaks ?? false,
          remainingBreakSec,
          mobileActiveSession.id,
          mobileActiveSession.name,
          endAtMs,
          startedAtMs,
        );
        runningSessionIdRef.current = desiredId;

        // Attach violation listener — record violation when user taps "Allow anyway" in native overlay
        violationListenerRef.current = addListener('onAppViolation', async (event: { packageName: string; allowMinutes?: number }) => {
          console.log('AppBlocker violation:', event.packageName, '→ session', desiredId);
          // If session has already ended or changed, do not attempt to log violation against an ended session
          if (!desiredId || runningSessionIdRef.current !== desiredId) {
            return;
          }
          try {
            await violationApi.create({
              session_id: desiredId,
              app_name: event.packageName,
              duration_seconds: (event.allowMinutes ?? 5) * 60,
              action_taken: ViolationAction.ALLOW_ANYWAY,
            } as Record<string, unknown>);
          } catch (e: any) {
            // 404 = session already ended or completed on server — benign
            if (e?.statusCode !== 404 && e?.code !== 'NOT_FOUND' && !e?.message?.includes('not found')) {
              console.error('Failed to record violation:', e);
            }
          }
        });

        // Break started from native overlay → call API + pause JS-side monitoring
        breakStartedListenerRef.current = addListener('onBreakStarted', async (event: { breakMinutes: number; packageName?: string }) => {
          console.log('AppBlocker: native break started', event.breakMinutes, 'min');
          try {
            await sessionApi.startBreak(desiredId, 'violation', event.breakMinutes);
          } catch (e: any) {
            console.error('Failed to record native break start:', e);
            if (e?.message?.includes('No break time remaining') || e?.statusCode === 400) {
              endBreak();
            }
          }
          await refreshSessions();
        });

        // Break ended from native overlay → call API endpoint, refresh
        // Note: 404 "No open break found" is benign — means extension already ended it.
        breakEndedListenerRef.current = addListener('onBreakEnded', async () => {
          console.log('AppBlocker: native break ended');
          try {
            await sessionApi.endBreak(desiredId);
          } catch (e: any) {
            // 404 = break already closed by extension or another client — not an error
            if (e?.statusCode !== 404 && e?.code !== 'NOT_FOUND') {
              console.error('Failed to record native break end:', e);
            }
          }
          await refreshSessions();
        });
      } catch (err) {
        console.error('AppBlocker sync error:', err);
      }
    }

    syncAppBlocker();
  }, [state.activeSessions]);

  // handleBreak: initiate break natively and via API, without killing foreground monitoring
  const handleBreak = useCallback(async (sessionId: string, minutes: number) => {
    try {
      await sessionApi.startBreak(sessionId, 'manual', minutes);
      takeBreak(minutes);
      await refreshSessions();
    } catch (e) {
      console.error('Failed to start break:', e);
    }
  }, [refreshSessions]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (violationListenerRef.current) violationListenerRef.current.remove();
      if (breakStartedListenerRef.current) breakStartedListenerRef.current.remove();
      if (breakEndedListenerRef.current) breakEndedListenerRef.current.remove();
      if (breakTimerRef.current) clearTimeout(breakTimerRef.current);
      stopMonitoring();
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        ...state,
        refreshSessions,
        handleBreak,
        completedSessionTierData,
        dismissCompletedTierCard,
        triggerSessionComplete,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessions(): SessionContextType {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessions must be used within SessionProvider');
  }
  return context;
}
