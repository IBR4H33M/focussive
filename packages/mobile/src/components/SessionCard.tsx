// ============================================================
// Focussive Mobile — Session Card Component
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/utils/theme';
import { useSessions } from '@/context/SessionContext';
import { formatDuration, formatCountdown, getRemainingSeconds } from '@focussive/shared';
import type { Session } from '@focussive/shared';
import { SessionStatus } from '@focussive/shared';

interface SessionCardProps {
  session: Session & {
    violations_count?: number;
    is_on_break?: boolean;
    break_ends_at?: string | null;
  };
  isActive?: boolean;
}

function formatTimeRange(startTime: string, durationMinutes: number): string {
  const [hStr, mStr] = startTime.split(':');
  const startH = parseInt(hStr, 10);
  const startM = parseInt(mStr, 10);
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

function getBreakSecondsLeft(breakEndsAt: string | null | undefined): number {
  if (!breakEndsAt) return 0;
  return Math.max(0, Math.floor((new Date(breakEndsAt).getTime() - Date.now()) / 1000));
}

const TIMER_GREEN = '#90EE90';
const TIMER_YELLOW = '#FFD580';

export default function SessionCard({ session, isActive }: SessionCardProps) {
  const theme = useTheme();
  const router = useRouter();

  const isActiveSession = session.status === SessionStatus.ACTIVE || isActive;
  const isOnBreak = session.is_on_break ?? false;

  const [remaining, setRemaining] = useState(getRemainingSeconds(session));
  const [breakLeft, setBreakLeft] = useState(() => getBreakSecondsLeft(session.break_ends_at));

  // Session countdown
  useEffect(() => {
    if (!isActiveSession) return;
    const interval = setInterval(() => {
      const s = getRemainingSeconds(session);
      setRemaining(s);
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [session, isActiveSession]);

  const { refreshSessions } = useSessions();
  const breakEndedRef = useRef(false);

  // Break countdown — triggers a session refresh as soon as it hits 0
  useEffect(() => {
    if (!isOnBreak || !session.break_ends_at) {
      setBreakLeft(0);
      breakEndedRef.current = false;
      return;
    }
    setBreakLeft(getBreakSecondsLeft(session.break_ends_at));
    breakEndedRef.current = false;
    const interval = setInterval(() => {
      const left = getBreakSecondsLeft(session.break_ends_at!);
      setBreakLeft(left);
      if (left <= 0 && !breakEndedRef.current) {
        breakEndedRef.current = true;
        clearInterval(interval);
        // Immediately refresh so UI stops showing "Break ongoing"
        refreshSessions();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isOnBreak, session.break_ends_at]);

  const timeRange = formatTimeRange(session.start_time, session.duration);
  const durationLabel = formatDuration(session.duration);
  const timerColor = isActiveSession ? (isOnBreak ? TIMER_YELLOW : TIMER_GREEN) : theme.text;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderWidth: isActiveSession ? 1.5 : 0,
          borderColor: isActiveSession ? theme.accent : 'transparent',
        },
      ]}
      onPress={() => router.push(`/session/${session.id}` as never)}
      activeOpacity={0.7}
    >
      {/* Header row */}
      <View style={styles.header}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {session.name}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Time row: range left, main countdown right */}
      <View style={styles.timeRow}>
        <Text style={[styles.timeRange, { color: theme.textSecondary }]}>{timeRange}</Text>
        <Text style={[styles.durationBig, { color: timerColor }]}>
          {isActiveSession ? formatCountdown(remaining) : durationLabel}
        </Text>
      </View>

      {/* Break ongoing row */}
      {isActiveSession && isOnBreak && (
        <View style={[styles.breakRow, { borderColor: `${TIMER_GREEN}40`, backgroundColor: `${TIMER_GREEN}10` }]}>
          <Text style={styles.breakLabel}>Break ongoing</Text>
          <Text style={styles.breakCountdown}>{formatCountdown(breakLeft)}</Text>
        </View>
      )}

      {/* Footer: badges + violations */}
      <View style={styles.footer}>
        <View style={styles.badgesRow}>
          {session.mobile_focus && (
            <View style={[styles.badge, { backgroundColor: theme.surface }]}>
              <Ionicons name="phone-portrait-outline" size={12} color={theme.textSecondary} />
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>Mobile</Text>
            </View>
          )}
          {session.browser_focus && (
            <View style={[styles.badge, { backgroundColor: theme.surface }]}>
              <Ionicons name="globe-outline" size={12} color={theme.textSecondary} />
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>Browser</Text>
            </View>
          )}
        </View>
        <View style={styles.statsRow}>
          {(isActiveSession) && (session.violations_count ?? 0) > 0 && (
            <Text style={[styles.stat, { color: theme.danger }]}>
              {session.violations_count} violation{session.violations_count !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 17,
    fontWeight: '500',
    flex: 1,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeRange: {
    fontSize: 13,
    fontWeight: '300',
    flex: 1,
  },
  durationBig: {
    fontSize: 22,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  breakLabel: {
    fontSize: 12,
    color: TIMER_GREEN,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  breakCountdown: {
    fontSize: 16,
    fontWeight: '300',
    color: TIMER_GREEN,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '400',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  stat: {
    fontSize: 12,
    fontWeight: '400',
  },
});
