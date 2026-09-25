// ============================================================
// Focussive Extension — Upcoming Session Card
// ============================================================

import React from 'react';
import type { StoredSession } from '../utils/storage';
import { formatTime } from '@focussive/shared';

interface UpcomingCardProps {
  session: StoredSession;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: 280,
    margin: '0 auto 8px auto',
    padding: 14,
    borderRadius: 10,
    border: '1px solid #FDE68A',
    backgroundColor: '#FEF3C7',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: '#452C03',
  },
  time: {
    fontSize: 13,
    fontWeight: 500,
    color: '#78350F',
  },
};

export default function UpcomingCard({ session }: UpcomingCardProps) {
  return (
    <div style={styles.card}>
      <span style={styles.name}>{session.name}</span>
      <span style={styles.time}>{formatTime(session.start_time)}</span>
    </div>
  );
}
