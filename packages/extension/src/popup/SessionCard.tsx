// ============================================================
// Focussive Extension — Active Session Card
// ============================================================

import React, { useState, useEffect } from 'react';
import type { StoredSession } from '../utils/storage';
import { formatCountdown, getRemainingSeconds } from '@focussive/shared';
import type { Session } from '@focussive/shared';

interface SessionCardProps {
  session: StoredSession;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: 320,
    margin: '0 auto',
    padding: 20,
    borderRadius: 14,
    border: '2px solid #90EE90',
    backgroundColor: '#252525',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: 500,
    color: '#E0E0E0',
  },
  cancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    border: '1.5px solid #DC3545',
    background: 'none',
    color: '#DC3545',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    textAlign: 'center' as const,
    fontSize: 42,
    fontWeight: 200,
    color: '#90EE90',
    fontVariantNumeric: 'tabular-nums',
    margin: '8px 0',
    letterSpacing: 2,
  },
  stats: {
    textAlign: 'center' as const,
    marginTop: 8,
  },
  violations: {
    fontSize: 13,
    fontWeight: 500,
    color: '#DC3545',
  },
  noViolations: {
    fontSize: 13,
    fontWeight: 400,
    color: '#999',
  },
};

export default function SessionCard({ session }: SessionCardProps) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    // Convert StoredSession to shape compatible with getRemainingSeconds
    const sessionLike = {
      started_at: session.started_at,
      duration: session.duration,
    } as Session;

    setRemaining(getRemainingSeconds(sessionLike));

    const interval = setInterval(() => {
      setRemaining(getRemainingSeconds(sessionLike));
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.name}>{session.name}</span>
        <button style={styles.cancelBtn} title="Cancel session">
          ✕
        </button>
      </div>

      <div style={styles.countdown}>
        {formatCountdown(remaining)}
      </div>

      <div style={styles.stats}>
        {session.violations_count > 0 ? (
          <span style={styles.violations}>
            {session.violations_count} violation{session.violations_count !== 1 ? 's' : ''}
          </span>
        ) : (
          <span style={styles.noViolations}>No violations — keep going! 💪</span>
        )}
      </div>
    </div>
  );
}
