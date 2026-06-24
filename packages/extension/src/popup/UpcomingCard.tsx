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
    border: '1px solid #333',
    backgroundColor: '#252525',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: 400,
    color: '#E0E0E0',
  },
  time: {
    fontSize: 13,
    fontWeight: 300,
    color: '#999',
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
