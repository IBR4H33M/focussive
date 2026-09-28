// ============================================================
// Focussive Extension — Running Session Card (Mobile-Parity)
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import type { StoredSession } from '../utils/storage';
import { formatCountdown, getRemainingSeconds, getElapsedSeconds } from '@focussive/shared';
import type { Session } from '@focussive/shared';
import { sessionApi } from '../utils/api';

interface SessionCardProps {
  session: StoredSession;
  onRefresh?: () => void;
}

function formatTimeRange(startTime: string, durationMinutes: number): string {
  if (!startTime) return '';
  const [hStr, mStr] = startTime.split(':');
  const startH = parseInt(hStr || '0', 10);
  const startM = parseInt(mStr || '0', 10);
  const startDate = new Date();
  startDate.setHours(startH, startM, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const fmt = (d: Date) => {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  };
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

function getBreakSecondsLeft(breakEndsAt: string | null): number {
  if (!breakEndsAt) return 0;
  return Math.max(0, Math.floor((new Date(breakEndsAt).getTime() - Date.now()) / 1000));
}

const GREEN = '#22B14C';
const GREEN_BORDER = '#1B8C3C';
const GREEN_DARK_BTN = '#16652D';
const TIMER_BREAK = '#FFF1B8';
const VIOLATION_RED = '#FFD1D1';

export default function SessionCard({ session, onRefresh }: SessionCardProps) {
  const [remaining, setRemaining] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [breakModalOpen, setBreakModalOpen] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(1);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Break state synced across mobile & extension
  const isOnBreak = session.is_on_break;
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(() => getBreakSecondsLeft(session.break_ends_at));

  const remainingBreakMin = Math.ceil((session.remaining_break_seconds || 0) / 60);
  const remainingSessionMin = Math.floor(Math.max(0, remaining - 1) / 60);
  const maxBreakAllowed = Math.max(0, Math.min(remainingBreakMin, remainingSessionMin));
  const hasBreakTime = session.allow_breaks && maxBreakAllowed > 0 && !isOnBreak;

  // Session countdown — paused while on break, continues when break finishes
  useEffect(() => {
    const sessionLike = {
      started_at: session.started_at,
      duration: session.duration,
      start_time: session.start_time,
      schedule: session.schedule,
      time_slots: session.time_slots,
      break_used_seconds: session.break_used_seconds,
      is_on_break: session.is_on_break,
      break_started_at: session.break_started_at,
      break_ends_at: session.break_ends_at,
    } as any;

    setRemaining(getRemainingSeconds(sessionLike));
    setElapsed(getElapsedSeconds(sessionLike));

    // When on break, session timer is paused (unless break time has already elapsed)
    if (isOnBreak) {
      const breakEndsMs = session.break_ends_at ? new Date(session.break_ends_at).getTime() : 0;
      if (breakEndsMs === 0 || Date.now() < breakEndsMs) {
        return;
      }
    }

    const interval = setInterval(() => {
      setRemaining(getRemainingSeconds(sessionLike));
      setElapsed(getElapsedSeconds(sessionLike));
    }, 1000);
    return () => clearInterval(interval);
  }, [session, isOnBreak]);

  // Break countdown derived from break_ends_at
  useEffect(() => {
    if (!isOnBreak || !session.break_ends_at) {
      setBreakSecondsLeft(0);
      return;
    }
    setBreakSecondsLeft(getBreakSecondsLeft(session.break_ends_at));
    const interval = setInterval(() => {
      const left = getBreakSecondsLeft(session.break_ends_at!);
      setBreakSecondsLeft(left);
      if (left <= 0) {
        clearInterval(interval);
        if (onRefresh) onRefresh();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isOnBreak, session.break_ends_at, onRefresh]);

  const handleStartBreak = useCallback((minutesToTake: number) => {
    chrome.runtime.sendMessage({
      type: 'START_BREAK',
      sessionId: session.id,
      minutes: minutesToTake,
    });
    setBreakModalOpen(false);
    if (onRefresh) {
      setTimeout(onRefresh, 400);
    }
  }, [session.id, onRefresh]);


  const handleConfirmSkip = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      chrome.runtime.sendMessage({ type: 'SESSION_SKIPPED', sessionId: session.id }, () => {});
      await sessionApi.skip(session.id);
      chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {});
      setActionLoading(false);
      setShowSkipModal(false);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionLoading(false);
      setActionError(err.message || 'Failed to skip session');
    }
  }, [session.id, onRefresh]);

  const timeRange = formatTimeRange(session.start_time, session.duration);
  const timerColor = isOnBreak ? TIMER_BREAK : '#FFFFFF';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header: Session Name */}
        <div style={styles.header}>
          <div style={styles.nameRow}>
            <span style={styles.name} title={session.name}>{session.name}</span>
          </div>
        </div>

        {/* Time row: range on left, main countdown on right (just like in mobile) */}
        <div style={styles.timeRow}>
          <div style={styles.timeRangeBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255, 255, 255, 0.88)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span style={styles.timeRange}>{timeRange}</span>
          </div>
          <div style={styles.timerBox}>
            <span style={{ ...styles.durationBig, color: timerColor }}>
              {formatCountdown(elapsed)}
            </span>
            <span style={styles.remainingSubText}>
              {formatCountdown(remaining)} remaining
            </span>
          </div>
        </div>

        {/* Break ongoing row */}
        {isOnBreak && (
          <div style={styles.breakRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={styles.breakLabel}>Break ongoing</span>
            </div>
            <span style={styles.breakCountdown}>{formatCountdown(breakSecondsLeft)}</span>
          </div>
        )}

        {/* Footer: Focus badges on left, Violations on right */}
        <div style={styles.footer}>
          <div style={styles.badgesRow}>
            {session.mobile_focus && (
              <span style={styles.badge}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
                Mobile
              </span>
            )}
            {session.browser_focus && (
              <span style={styles.badge}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Browser
              </span>
            )}
          </div>
          <div style={styles.statsRow}>
            {session.violations_count > 0 ? (
              <span style={styles.violations}>
                {session.violations_count} violation{session.violations_count !== 1 ? 's' : ''}
              </span>
            ) : (
              <span style={styles.noViolations}>No violations</span>
            )}
          </div>
        </div>

        {/* Break Buttons for Running Session (Mobile Parity) */}
        {/* Break Buttons for Running Session (Mobile Parity) */}
        {session.allow_breaks && !isOnBreak && (
          <div style={styles.breakControlsSection}>
            {hasBreakTime ? (
              <div style={styles.breakActionGroup}>
                <button
                  className="take-break-btn"
                  style={styles.primaryBreakBtn}
                  onClick={() => {
                    setBreakMinutes(1);
                    setBreakModalOpen(true);
                  }}
                  title="Take a break from this session"
                >
                  <span style={styles.primaryBreakBtnText}>Take a break</span>
                  <span style={styles.primaryBreakBtnSub}>{maxBreakAllowed} min available</span>
                </button>
              </div>
            ) : (
              <div style={styles.breakBtnDisabled}>
                <span>{remainingBreakMin <= 0 ? 'No break time available' : 'Session ending soon'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skip Button under the running container (matching mobile dashboard) */}
      <button
        className="skip-active-btn"
        style={styles.skipActiveBtn}
        onClick={() => {
          setActionError(null);
          setShowSkipModal(true);
        }}
        title="Skip this active session"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" y1="5" x2="19" y2="19" />
        </svg>
        <span>Skip this session</span>
      </button>

      <style>{`
        .take-break-btn:hover {
          background-color: #1c7c37 !important;
          filter: brightness(1.08);
        }
        .skip-active-btn:hover {
          background-color: #1e8f3e !important;
          filter: brightness(1.08);
        }
      `}</style>

      {/* Take a Break Picker Modal (Identical to Mobile Experience) */}
      {breakModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeaderTitle}>Take a break</div>
            <div style={styles.breakQuoteLarge}>
              Even machines need to cool down.
            </div>
            <div style={styles.modalSubtitle}>
              No violations tracked during breaks.
              <br />
              Come back when you&apos;re ready.
            </div>

            {/* Minutes Stepper */}
            <div style={styles.stepperContainer}>
              <button
                style={styles.stepperArrowBtn}
                onClick={() => setBreakMinutes((m) => Math.min(m + 1, maxBreakAllowed))}
                disabled={breakMinutes >= maxBreakAllowed}
              >
                ▲
              </button>
              <div style={styles.stepperNumber}>{breakMinutes}</div>
              <div style={styles.stepperUnit}>
                {breakMinutes === 1 ? 'minute' : 'minutes'}
              </div>
              <button
                style={styles.stepperArrowBtn}
                onClick={() => setBreakMinutes((m) => Math.max(m - 1, 1))}
                disabled={breakMinutes <= 1}
              >
                ▼
              </button>
            </div>

            {/* Start Break Button */}
            <button
              style={styles.startBreakModalBtn}
              onClick={() => handleStartBreak(breakMinutes)}
            >
              Start {breakMinutes} {breakMinutes === 1 ? 'minute' : 'minute'} break
            </button>

            <button
              style={styles.cancelLinkBtn}
              onClick={() => setBreakModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}


      {/* Skip Active Session Confirmation Modal */}
      {showSkipModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeaderTitle}>Skip this session?</div>
            <div style={styles.modalSubtitle}>
              This active session <strong>&ldquo;{session.name}&rdquo;</strong> will be ended and skipped.
              <br /><br />
              It will not count as a violation, no history will be logged, and it will resume automatically on its next scheduled occurrence.
            </div>

            {actionError && (
              <div style={styles.errorBanner}>{actionError}</div>
            )}

            <div style={styles.modalBtnRow}>
              <button
                style={styles.modalCancelBtn}
                onClick={() => setShowSkipModal(false)}
                disabled={actionLoading}
              >
                Keep Going
              </button>
              <button
                style={styles.modalDestructiveWarningBtn}
                onClick={handleConfirmSkip}
                disabled={actionLoading}
              >
                {actionLoading ? 'Skipping...' : 'Skip Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    padding: '16px',
    borderRadius: 14,
    backgroundColor: GREEN,
    border: `1.5px solid ${GREEN_BORDER}`,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    overflow: 'hidden',
  },
  liveIndicator: {
    color: '#86EFAC',
    fontSize: 14,
    lineHeight: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: 600,
    color: '#FFFFFF',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cancelBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    border: 'none',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background-color 0.15s',
  },
  timeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  timeRangeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  timeRange: {
    fontSize: 14,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.88)',
    letterSpacing: 0.2,
  },
  durationBig: {
    fontSize: 34,
    fontWeight: 400,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    letterSpacing: 1,
  },
  timerBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  remainingSubText: {
    fontSize: 11,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'right',
    marginTop: -2,
  },
  breakRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.22)',
  },
  breakLabel: {
    fontSize: 12,
    color: TIMER_BREAK,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  breakCountdown: {
    fontSize: 16,
    fontWeight: 600,
    color: '#FFFFFF',
    fontVariantNumeric: 'tabular-nums',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  badgesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 500,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    padding: '3px 7px',
    borderRadius: 5,
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
  },
  violations: {
    fontSize: 12,
    fontWeight: 600,
    color: VIOLATION_RED,
  },
  noViolations: {
    fontSize: 12,
    fontWeight: 400,
    color: 'rgba(255, 255, 255, 0.88)',
  },
  breakControlsSection: {
    marginTop: 2,
    paddingTop: 8,
    borderTop: '1px solid rgba(255, 255, 255, 0.16)',
  },
  breakActionGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  primaryBreakBtn: {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    border: 'none',
    backgroundColor: GREEN_DARK_BTN,
    color: '#FFFFFF',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    boxSizing: 'border-box',
  },
  primaryBreakBtnText: {
    fontSize: 14,
    fontWeight: 400,
    color: '#FFFFFF',
  },
  primaryBreakBtnSub: {
    fontSize: 12,
    fontWeight: 400,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  quickBreakRow: {
    display: 'flex',
    gap: 6,
  },
  quickBreakPill: {
    flex: 1,
    padding: '6px 0',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
  },
  breakBtnDisabled: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
    color: 'rgba(255, 255, 255, 0.6)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    fontWeight: 500,
    boxSizing: 'border-box',
  },
  skipActiveBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 14px',
    backgroundColor: '#187834',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxSizing: 'border-box',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: 20,
    boxSizing: 'border-box',
  },
  modalContent: {
    backgroundColor: '#3A4062',
    border: '1px solid #5D6E75',
    borderRadius: 18,
    padding: '24px 22px',
    width: '100%',
    maxWidth: 320,
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  modalHeaderTitle: {
    fontSize: 19,
    fontWeight: 700,
    color: '#E9E4DC',
    marginBottom: 8,
  },
  breakQuoteLarge: {
    fontSize: 16,
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: 8,
    lineHeight: 1.35,
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 1.5,
    color: '#BAC6B8',
    marginBottom: 18,
  },
  stepperContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    margin: '4px 0 16px',
  },
  stepperArrowBtn: {
    background: 'none',
    border: 'none',
    color: '#8BA794',
    fontSize: 20,
    cursor: 'pointer',
    padding: '4px 30px',
  },
  stepperNumber: {
    fontSize: 56,
    fontWeight: 300,
    color: '#E9E4DC',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  stepperUnit: {
    fontSize: 13,
    fontWeight: 600,
    color: '#BAC6B8',
    marginTop: 4,
  },
  startBreakModalBtn: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 10,
    border: 'none',
    backgroundColor: '#F59E0B',
    color: '#1C1D2A',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: 10,
    transition: 'filter 0.15s ease',
  },
  cancelLinkBtn: {
    background: 'none',
    border: 'none',
    color: '#BAC6B8',
    fontSize: 13,
    cursor: 'pointer',
    padding: '6px 12px',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    border: '1px solid #EF4444',
    color: '#FCA5A5',
    padding: '8px 10px',
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 14,
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'left',
  },
  modalBtnRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    width: '100%',
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    padding: '9px 14px',
    backgroundColor: 'transparent',
    border: '1.5px solid #5D6E75',
    borderRadius: 8,
    color: '#BAC6B8',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalDestructiveDangerBtn: {
    flex: 1,
    padding: '9px 14px',
    backgroundColor: '#DC2626',
    border: 'none',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalDestructiveWarningBtn: {
    flex: 1,
    padding: '9px 14px',
    backgroundColor: '#D97706',
    border: 'none',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
