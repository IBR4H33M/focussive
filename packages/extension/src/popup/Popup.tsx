// ============================================================
// Focussive Extension — Popup Component
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { isAuthenticated as checkAuth, sessionApi } from '../utils/api';
import LoginView from './LoginView';
import SessionCard from './SessionCard';
import UpcomingCard from './UpcomingCard';
import Menu from './Menu';
import type { StoredSession } from '../utils/storage';

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 400,
    minHeight: 300,
    backgroundColor: '#1a1a1a',
    color: '#E0E0E0',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #333',
  },
  logo: {
    fontSize: 18,
    fontWeight: 300,
    letterSpacing: 2,
    color: '#90EE90',
  },
  menuBtn: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: 20,
    cursor: 'pointer',
    padding: 4,
  },
  body: {
    padding: '16px 20px',
  },
  noSession: {
    textAlign: 'center' as const,
    padding: '40px 20px',
  },
  noSessionTitle: {
    fontSize: 16,
    fontWeight: 300,
    color: '#E0E0E0',
    marginBottom: 4,
  },
  noSessionSub: {
    fontSize: 13,
    fontWeight: 300,
    color: '#999',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 2,
    color: '#999',
    marginTop: 16,
    marginBottom: 8,
  },
  loading: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#999',
  },
};

export default function Popup() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [activeSession, setActiveSession] = useState<StoredSession | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<StoredSession[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadData = useCallback(async () => {
    const isAuth = await checkAuth();
    setAuthenticated(isAuth);

    if (isAuth) {
      // Ask background for cached data first
      chrome.runtime.sendMessage({ type: 'GET_SESSION' }, async (response) => {
        const cached = response?.activeSession || null;
        const upcoming = response?.upcomingSessions || [];

        if (cached) {
          setActiveSession(cached);
          setUpcomingSessions(upcoming);
        } else {
          // Background cache empty — fetch directly from API as fallback
          try {
            const [activeRes, upcomingRes] = await Promise.all([
              sessionApi.getActive(),
              sessionApi.getUpcoming(),
            ]);
            const activeSessions = (activeRes as any).data as StoredSession[];
            const upcomingSess = (upcomingRes as any).data as StoredSession[];
            setActiveSession(activeSessions.length > 0 ? activeSessions[0] : null);
            setUpcomingSessions(upcomingSess || []);
          } catch {
            setActiveSession(null);
            setUpcomingSessions(upcoming);
          }
        }
      });
    }
  }, []);

  useEffect(() => {
    loadData();
    // Refresh every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  function handleLoginSuccess() {
    setAuthenticated(true);
    loadData();
  }

  function handleLogout() {
    setAuthenticated(false);
    setActiveSession(null);
    setUpcomingSessions([]);
    setMenuOpen(false);
  }

  if (authenticated === null) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={styles.container}>
        <LoginView onSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.logo}>Focussive</span>
        <button style={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
      </div>

      {menuOpen && <Menu onClose={() => setMenuOpen(false)} onLogout={handleLogout} />}

      <div style={styles.body}>
        {activeSession ? (
          <>
            <SessionCard session={activeSession} />

            {upcomingSessions.length > 0 && (
              <>
                <div style={styles.sectionTitle}>UPCOMING</div>
                {upcomingSessions.slice(0, 2).map((s) => (
                  <UpcomingCard key={s.id} session={s} />
                ))}
              </>
            )}
          </>
        ) : (
          <div style={styles.noSession}>
            <div style={styles.noSessionTitle}>No active session</div>
            <div style={styles.noSessionSub}>
              {upcomingSessions.length > 0
                ? 'Your next session is coming up'
                : 'Create a session in the mobile app'}
            </div>

            {upcomingSessions.length > 0 && (
              <>
                <div style={styles.sectionTitle}>UPCOMING</div>
                {upcomingSessions.map((s) => (
                  <UpcomingCard key={s.id} session={s} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
