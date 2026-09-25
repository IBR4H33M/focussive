// ============================================================
// Focussive Extension — Popup Component
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { isAuthenticated as checkAuth, sessionApi } from '../utils/api';
import LoginView from './LoginView';
import SessionCard from './SessionCard';
import UpcomingCard from './UpcomingCard';
import Menu from './Menu';
import { getNextSessionOccurrence, isSessionInActiveWindow } from '@focussive/shared';
import type { StoredSession } from '../utils/storage';

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 400,
    minHeight: 300,
    backgroundColor: '#2F3456',
    color: '#E9E4DC',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #5D6E75',
    backgroundColor: '#2F3456',
  },
  logo: {
    fontSize: 18,
    fontWeight: 400,
    letterSpacing: 2,
    color: '#8BA794',
  },
  menuBtn: {
    background: 'none',
    border: 'none',
    color: '#BAC6B8',
    fontSize: 20,
    cursor: 'pointer',
    padding: 4,
  },
  body: {
    padding: '16px 20px',
  },
  dropdownContainer: {
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: '#3A4062',
    border: '1px solid #5D6E75',
    borderRadius: 10,
    overflow: 'hidden',
  },
  dropdownBtn: {
    width: '100%',
    padding: '11px 14px',
    backgroundColor: 'transparent',
    border: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    color: '#E9E4DC',
  },
  dropdownTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: '#E9E4DC',
  },
  dropdownContent: {
    padding: '4px 14px 10px',
    borderTop: '1px solid #5D6E75',
    display: 'flex',
    flexDirection: 'column' as const,
    maxHeight: 180,
    overflowY: 'auto' as const,
  },
  siteRow: {
    padding: '7px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  siteText: {
    fontSize: 13,
    fontWeight: 400,
    color: '#E9E4DC',
    letterSpacing: 0.2,
  },
  noSession: {
    textAlign: 'center' as const,
    padding: '40px 20px',
  },
  noSessionTitle: {
    fontSize: 16,
    fontWeight: 400,
    color: '#E9E4DC',
    marginBottom: 4,
  },
  noSessionSub: {
    fontSize: 13,
    fontWeight: 300,
    color: '#BAC6B8',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 2,
    color: '#BAC6B8',
    marginTop: 16,
    marginBottom: 8,
  },
  loading: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#BAC6B8',
  },
};

export default function Popup() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [activeSession, setActiveSession] = useState<StoredSession | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<StoredSession[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockedSitesOpen, setBlockedSitesOpen] = useState(false);

  const loadData = useCallback(async () => {
    const isAuth = await checkAuth();
    setAuthenticated(isAuth);

    if (isAuth) {
      // Ask background for cached data first
      chrome.runtime.sendMessage({ type: 'GET_SESSION' }, async (response) => {
        if (response && (response.activeSession !== undefined || response.upcomingSessions !== undefined)) {
          setActiveSession(response.activeSession || null);
          setUpcomingSessions(response.upcomingSessions || []);
        } else {
          // Background cache not ready yet — fetch directly from API as fallback
          try {
            const [activeRes, allRes] = await Promise.all([
              sessionApi.getActive(),
              sessionApi.getAll(),
            ]);
            const activeSessions = ((activeRes as any).data as StoredSession[]) || [];
            const allSessions = ((allRes as any).data as StoredSession[]) || [];
            setActiveSession(activeSessions.length > 0 ? activeSessions[0] : null);

            const now = new Date();
            const activeIds = new Set(activeSessions.map((s) => s.id));
            const pausedIds = new Set(
              allSessions.filter((s) => (s as any).status === 'paused').map((s) => s.id)
            );
            const candidates = allSessions.filter(
              (s) =>
                (s as any).status !== 'completed' &&
                (s as any).status !== 'cancelled' &&
                !activeIds.has(s.id) &&
                !pausedIds.has(s.id) &&
                !isSessionInActiveWindow(s as any, now)
            );
            const validUpcoming = candidates
              .map((s) => ({ session: s, nextOccurrence: getNextSessionOccurrence(s as any, now) }))
              .filter((item): item is { session: StoredSession; nextOccurrence: Date } => item.nextOccurrence !== null)
              .sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime())
              .map((item) => item.session);

            setUpcomingSessions(validUpcoming);
          } catch {
            setActiveSession(null);
            setUpcomingSessions([]);
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

  const blockedList = activeSession?.blocked_websites || [];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/icons/icon-48.png" alt="Focussive" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          <span style={styles.logo}>Focussive</span>
        </div>
        <button style={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
      </div>

      {menuOpen && (
        <Menu
          onClose={() => setMenuOpen(false)}
          onLogout={handleLogout}
          onRefreshData={loadData}
        />
      )}

      <div style={styles.body}>
        {activeSession ? (
          <>
            <SessionCard session={activeSession} />

            {/* Blocked Websites Dropdown under running session card */}
            {blockedList.length > 0 && (
              <div style={styles.dropdownContainer}>
                <button
                  style={styles.dropdownBtn}
                  onClick={() => setBlockedSitesOpen(!blockedSitesOpen)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                    <span style={styles.dropdownTitle}>
                      Blocked Websites ({blockedList.length})
                    </span>
                  </div>
                  <span style={{ transform: blockedSitesOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: 11, color: '#BAC6B8' }}>
                    ▼
                  </span>
                </button>

                {blockedSitesOpen && (
                  <div style={styles.dropdownContent}>
                    {blockedList.map((site, idx) => (
                      <div key={idx} style={{ ...styles.siteRow, ...(idx === blockedList.length - 1 ? { borderBottom: 'none' } : {}) }}>
                        <span style={styles.siteText}>{site}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {upcomingSessions.length > 0 && (
              <>
                <div style={styles.sectionTitle}>UPCOMING</div>
                {upcomingSessions.slice(0, 1).map((s) => (
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
                {upcomingSessions.slice(0, 1).map((s) => (
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
