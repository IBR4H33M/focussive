// ============================================================
// Focussive Mobile — Session Context
// ============================================================

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { sessionApi, appGroupApi, violationApi } from '@/utils/api';
import { startMonitoring, stopMonitoring, hasRequiredPermissions, addListener } from '@focussive/app-blocker';
import { useAuth } from './AuthContext';
import { type Session, type AppGroup, ViolationAction } from '@focussive/shared';

// Poll every 30 seconds — aggressive 5s polling was causing Supabase rate-limits
const POLL_INTERVAL_MS = 30_000;

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

interface SessionContextType extends SessionState {
  refreshSessions: () => Promise<void>;
  handleBreak: (sessionId: string, minutes: number) => Promise<void>;
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

  // Cache app groups so we don't re-fetch every 30s when the session hasn't changed
  const cachedGroupsRef = useRef<AppGroup[] | null>(null);
  // Track which session ID the native service is currently running for.
  // undefined = never synced, null = explicitly stopped, string = running for that ID.
  const runningSessionIdRef = useRef<string | null | undefined>(undefined);
  const violationListenerRef = useRef<ReturnType<typeof addListener> | null>(null);
  const breakStartedListenerRef = useRef<ReturnType<typeof addListener> | null>(null);
  const breakEndedListenerRef = useRef<ReturnType<typeof addListener> | null>(null);
  const breakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, dispatch] = useReducer(sessionReducer, {
    activeSessions: [],
    upcomingSessions: [],
    allSessions: [],
    isLoading: false,
    error: null,
  });

  const refreshSessions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [activeRes, upcomingRes, allRes] = await Promise.all([
        sessionApi.getActive(),
        sessionApi.getUpcoming(),
        sessionApi.getAll(),
      ]);

      dispatch({
        type: 'SET_SESSIONS',
        payload: {
          active: activeRes.data as Session[],
          upcoming: upcomingRes.data as Session[],
          all: allRes.data as Session[],
        },
      });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load sessions',
      });
    }
  }, [isAuthenticated]);

  // Initial fetch + polling every 30s
  useEffect(() => {
    if (isAuthenticated) {
      refreshSessions();
      intervalRef.current = setInterval(refreshSessions, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, refreshSessions]);

  // Sync active sessions with the native App Blocker.
  // Key fix: compare by session ID so polling re-fetches that produce the same
  // session do NOT restart the service or re-attach listeners.
  useEffect(() => {
    async function syncAppBlocker() {
      const mobileActiveSession = state.activeSessions.find(s => s.mobile_focus === true) ?? null;
      const desiredId = mobileActiveSession?.id ?? null;

      // ── Nothing changed — skip ─────────────────────────────────────────────
      if (desiredId === runningSessionIdRef.current) return;

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
        const maxBreakSec = (mobileActiveSession.allow_breaks && mobileActiveSession.max_break_minutes)
          ? mobileActiveSession.max_break_minutes * 60
          : 0;
        const remainingBreakSec = Math.max(0, maxBreakSec - (mobileActiveSession.break_used_seconds ?? 0));

        startMonitoring(
          blockedPackages,
          mobileActiveSession.allow_breaks ?? false,
          remainingBreakSec,
        );
        runningSessionIdRef.current = desiredId;

        // Attach violation listener — record violation when user taps "Allow anyway" in native overlay
        violationListenerRef.current = addListener('onAppViolation', async (event: { packageName: string; allowMinutes?: number }) => {
          console.log('AppBlocker violation:', event.packageName, '→ session', desiredId);
          try {
            await violationApi.create({
              session_id: desiredId,
              app_name: event.packageName,
              duration_seconds: (event.allowMinutes ?? 5) * 60,
              action_taken: ViolationAction.ALLOW_ANYWAY,
            } as import('@focussive/shared').CreateViolationRequest);
          } catch (e) {
            console.error('Failed to record violation:', e);
          }
        });

        // Break started from native overlay → call API + pause JS-side monitoring
        breakStartedListenerRef.current = addListener('onBreakStarted', async (event: { breakMinutes: number; packageName?: string }) => {
          console.log('AppBlocker: native break started', event.breakMinutes, 'min');
          try {
            const session = state.activeSessions.find(s => s.id === desiredId);
            if (session) {
              await sessionApi.startBreak(desiredId, 'violation');
            }
          } catch (e) {
            console.error('Failed to record native break start:', e);
          }
        });

        // Break ended from native overlay → call API endpoint, refresh
        breakEndedListenerRef.current = addListener('onBreakEnded', async () => {
          console.log('AppBlocker: native break ended');
          try {
            await sessionApi.endBreak(desiredId);
          } catch (e) {
            console.error('Failed to record native break end:', e);
          }
          await refreshSessions();
        });
      } catch (err) {
        console.error('AppBlocker sync error:', err);
      }
    }

    syncAppBlocker();
  }, [state.activeSessions]);

  // handleBreak: suspend monitoring for break duration, then resume
  const handleBreak = useCallback(async (sessionId: string, minutes: number) => {
    try {
      const breakRes = await sessionApi.startBreak(sessionId, 'manual');
      stopMonitoring();

      if (breakTimerRef.current) clearTimeout(breakTimerRef.current);

      breakTimerRef.current = setTimeout(async () => {
        try {
          await sessionApi.endBreak(sessionId, breakRes.id);
        } catch (e) {
          console.error('Failed to end break:', e);
        }
        // Refresh will trigger syncAppBlocker which restarts monitoring
        await refreshSessions();
      }, minutes * 60 * 1000);
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
    <SessionContext.Provider value={{ ...state, refreshSessions, handleBreak }}>
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
