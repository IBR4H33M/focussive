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
import { type Session, ViolationAction } from '@focussive/shared';

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

  // Initial fetch + polling every 5 seconds
  useEffect(() => {
    if (isAuthenticated) {
      refreshSessions();
      intervalRef.current = setInterval(refreshSessions, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAuthenticated, refreshSessions]);

  // Sync active sessions with the native App Blocker and listen for violations
  useEffect(() => {
    let violationListener: ReturnType<typeof addListener> | null = null;

    async function syncAppBlocker() {
      // Always remove old listener first to avoid stale closures
      if (violationListener) {
        violationListener.remove();
        violationListener = null;
      }

      try {
        const mobileActiveSession = state.activeSessions.find(s => s.mobile_focus === true);
        
        if (mobileActiveSession && mobileActiveSession.app_group_ids && mobileActiveSession.app_group_ids.length > 0) {
          const hasPerms = await hasRequiredPermissions();
          if (!hasPerms) {
            console.log('AppBlocker: Missing required permissions to start monitoring.');
            return;
          }

          // Fetch app groups to find the apps to block
          const groupsRes = await appGroupApi.getAll();
          const groups = groupsRes.data as import('@focussive/shared').AppGroup[];
          
          const targetGroups = groups.filter(g => mobileActiveSession.app_group_ids?.includes(g.id));
          
          if (targetGroups.length > 0) {
            const blockedPackages = [
              ...new Set(
                targetGroups.flatMap(g => 
                  g.apps.map(app => app.package_name || app.id).filter(Boolean)
                )
              )
            ] as string[];
            
            console.log('AppBlocker: Starting monitoring for', blockedPackages.length, 'packages');
            startMonitoring(blockedPackages);

            // Capture the session id in scope for this listener
            const sessionId = mobileActiveSession.id;

            violationListener = addListener('onAppViolation', async (event) => {
              console.log('AppBlocker Violation detected:', event.packageName, 'session:', sessionId);
              try {
                await violationApi.create({
                  session_id: sessionId,
                  app_name: event.packageName,
                  duration_seconds: 0,
                  action_taken: ViolationAction.ALLOW_ANYWAY,
                } as import('@focussive/shared').CreateViolationRequest);
                console.log('Violation recorded successfully for:', event.packageName);
              } catch (e) {
                console.error('Failed to record violation:', e);
              }
            });
          }
        } else {
          // No active mobile session, ensure monitoring is stopped
          stopMonitoring();
        }
      } catch (err) {
        console.error('AppBlocker sync error:', err);
      }
    }

    syncAppBlocker();

    return () => {
      if (violationListener) {
        violationListener.remove();
      }
    };
  }, [state.activeSessions]);

  return (
    <SessionContext.Provider value={{ ...state, refreshSessions }}>
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
