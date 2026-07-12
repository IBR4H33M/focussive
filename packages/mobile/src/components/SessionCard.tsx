// ============================================================
// Focussive Mobile — Session Card Component
// ============================================================

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/utils/theme';
import { formatDuration, formatCountdown, getRemainingSeconds } from '@focussive/shared';
import type { Session } from '@focussive/shared';
import { SessionStatus } from '@focussive/shared';
import { sessionApi } from '@/utils/api';

interface SessionCardProps {
  session: Session & { violations_count?: number; pause_count?: number };
  onCancel?: (id: string) => void;
  onRefresh?: () => void;
  isActive?: boolean;
}

// Compute "9:30 AM – 12:30 PM" from start_time (HH:mm) + duration (minutes)
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

export default function SessionCard({ session, onCancel, onRefresh, isActive }: SessionCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const [remaining, setRemaining] = useState(getRemainingSeconds(session));
  const [isPausing, setIsPausing] = useState(false);

  const isActiveSession = session.status === SessionStatus.ACTIVE || isActive;
  const isPausedSession = session.status === 'paused';

  useEffect(() => {
    if (!isActiveSession) return;

    const interval = setInterval(() => {
      const newRemaining = getRemainingSeconds(session);
      setRemaining(newRemaining);
      if (newRemaining <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [session, isActiveSession]);

  async function handlePause() {
    setIsPausing(true);
    try {
      await sessionApi.pause(session.id);
      onRefresh?.();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to toggle pause');
    } finally {
      setIsPausing(false);
    }
  }

  const timeRange = formatTimeRange(session.start_time, session.duration);
  const durationLabel = formatDuration(session.duration);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderTopWidth: isActiveSession ? 1.5 : 0,
          borderBottomWidth: isActiveSession ? 1.5 : 0,
          borderLeftWidth: isActiveSession ? 1.5 : 0,
          borderRightWidth: isActiveSession ? 1.5 : 0,
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
        <View style={styles.headerRight}>
          {(isActiveSession || isPausedSession) && (
            <TouchableOpacity
              onPress={handlePause}
              style={[styles.iconBtn, { borderColor: theme.border }]}
              disabled={isPausing}
            >
              <Ionicons
                name={isPausedSession ? 'play' : 'pause'}
                size={14}
                color={isPausedSession ? theme.accent : theme.textSecondary}
              />
            </TouchableOpacity>
          )}
          {isActiveSession && onCancel && (
            <TouchableOpacity
              onPress={() => onCancel(session.id)}
              style={[styles.iconBtn, { borderColor: theme.danger }]}
            >
              <Ionicons name="close" size={14} color={theme.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Time row: range on left, duration large on right */}
      <View style={styles.timeRow}>
        <Text style={[styles.timeRange, { color: theme.textSecondary }]}>{timeRange}</Text>
        <Text style={[styles.durationBig, { color: isActiveSession ? theme.accent : theme.text }]}>
          {isActiveSession ? formatCountdown(remaining) : durationLabel}
        </Text>
      </View>

      {/* Stats + badges row */}
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
          {isPausedSession && (
            <View style={[styles.badge, { backgroundColor: theme.surface }]}>
              <Ionicons name="pause-circle-outline" size={12} color={theme.textSecondary} />
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>Paused</Text>
            </View>
          )}
        </View>
        <View style={styles.statsRow}>
          {(isActiveSession || isPausedSession) && (session.violations_count ?? 0) > 0 && (
            <Text style={[styles.stat, { color: theme.danger }]}>
              {session.violations_count} violation{session.violations_count !== 1 ? 's' : ''}
            </Text>
          )}
          {(session.pause_count ?? 0) > 0 && (
            <Text style={[styles.stat, { color: theme.textSecondary }]}>
              {session.pause_count} pause{session.pause_count !== 1 ? 's' : ''}
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
    marginBottom: 10,
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
