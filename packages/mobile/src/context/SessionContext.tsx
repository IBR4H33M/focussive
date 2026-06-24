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
import { sessionApi } from '@/utils/api';
import { useAuth } from './AuthContext';
import type { Session } from '@focussive/shared';

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
