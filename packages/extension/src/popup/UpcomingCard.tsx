// ============================================================
// Focussive Extension — Upcoming Session Card (Mobile-Parity)
// ============================================================

import React, { useState } from 'react';
import type { StoredSession } from '../utils/storage';
import { formatDuration } from '@focussive/shared';

interface UpcomingCardProps {
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

export default function UpcomingCard({ session, onRefresh }: UpcomingCardProps) {
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  const timeRange = formatTimeRange(session.start_time, session.duration);
  const durationLabel = formatDuration(session.duration);

  async function handleConfirmSkip() {
    setIsSkipping(true);
    setSkipError(null);
    chrome.runtime.sendMessage({ type: 'SKIP_SESSION', sessionId: session.id }, (res) => {
      setIsSkipping(false);
      if (res?.success) {
        setShowSkipConfirm(false);
        if (onRefresh) onRefresh();
      } else {
        setSkipError(res?.error || 'Failed to skip session');
      }
    });
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header: Name + Duration Badge */}
        <div style={styles.header}>
          <span style={styles.name} title={session.name}>
            {session.name}
          </span>
          <span style={styles.durationBadge}>{durationLabel}</span>
        </div>

        {/* Time Row */}
        <div style={styles.timeRow}>
          <div style={styles.timeRangeBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#78350F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span style={styles.timeRangeText}>{timeRange}</span>
          </div>
        </div>

        {/* Footer: Badges for Mobile / Browser / Breaks */}
        <div style={styles.footer}>
          <div style={styles.badgesRow}>
            {session.mobile_focus && (
              <span style={styles.badge}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#78350F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
                Mobile
              </span>
            )}
            {session.browser_focus && (
              <span style={styles.badge}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#78350F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Browser
              </span>
            )}
            {session.allow_breaks && (
              <span style={styles.badge}>
                ☕ Breaks: {session.max_break_minutes || 5}m
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Skip Button under the upcoming container (matching mobile dashboard) */}
      <button
        style={styles.skipBtn}
        onClick={() => {
          setSkipError(null);
          setShowSkipConfirm(true);
        }}
        title="Skip upcoming occurrence of this session"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" y1="5" x2="19" y2="19" />
        </svg>
        <span>Skip this session</span>
      </button>

      {/* Skip Confirmation Modal / Overlay */}
      {showSkipConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalTitle}>Skip this session?</div>
            <div style={styles.modalBody}>
              This upcoming occurrence of <strong>&ldquo;{session.name}&rdquo;</strong> will be skipped.
              <br /><br />
              It will resume automatically on its next scheduled occurrence.
            </div>

            {skipError && (
              <div style={styles.errorBanner}>{skipError}</div>
            )}

            <div style={styles.modalBtnRow}>
              <button
                style={styles.modalCancelBtn}
                onClick={() => setShowSkipConfirm(false)}
                disabled={isSkipping}
              >
                Cancel
              </button>
              <button
                style={styles.modalDestructiveBtn}
                onClick={handleConfirmSkip}
                disabled={isSkipping}
              >
                {isSkipping ? 'Skipping...' : 'Skip Session'}
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
    padding: '14px 16px',
    borderRadius: 14,
    border: '1.5px solid #FDE68A',
    backgroundColor: '#FEF3C7',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: 600,
    color: '#452C03',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  durationBadge: {
    fontSize: 12,
    fontWeight: 700,
    color: '#D97706',
    backgroundColor: 'rgba(217, 119, 6, 0.14)',
    padding: '2px 8px',
    borderRadius: 6,
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  timeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeRangeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  timeRangeText: {
    fontSize: 14,
    fontWeight: 500,
    color: '#78350F',
    letterSpacing: 0.2,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  badgesRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    fontWeight: 500,
    color: '#78350F',
    backgroundColor: 'rgba(120, 53, 15, 0.12)',
    padding: '3px 7px',
    borderRadius: 5,
  },
  skipBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 14px',
    backgroundColor: '#D97706',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    boxSizing: 'border-box',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
    borderRadius: 14,
    padding: '20px 22px',
    width: '100%',
    maxWidth: 320,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
    boxSizing: 'border-box',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#E9E4DC',
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 1.5,
    color: '#BAC6B8',
    marginBottom: 18,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    border: '1px solid #EF4444',
    color: '#FCA5A5',
    padding: '8px 10px',
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 14,
  },
  modalBtnRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    padding: '8px 14px',
    backgroundColor: 'transparent',
    border: '1.5px solid #5D6E75',
    borderRadius: 8,
    color: '#BAC6B8',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  modalDestructiveBtn: {
    padding: '8px 14px',
    backgroundColor: '#D97706',
    border: 'none',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
