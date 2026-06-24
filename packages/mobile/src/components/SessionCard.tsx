// ============================================================
// Focussive Mobile — Session Card Component
// ============================================================

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { formatDuration, formatCountdown, formatTime, getRemainingSeconds } from '@focussive/shared';
import type { Session } from '@focussive/shared';
import { SessionStatus } from '@focussive/shared';

interface SessionCardProps {
  session: Session & { violations_count?: number };
  onCancel?: (id: string) => void;
  isActive?: boolean;
}

export default function SessionCard({ session, onCancel, isActive }: SessionCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const [remaining, setRemaining] = useState(getRemainingSeconds(session));

  useEffect(() => {
    if (session.status !== SessionStatus.ACTIVE) return;

    const interval = setInterval(() => {
      const newRemaining = getRemainingSeconds(session);
      setRemaining(newRemaining);
      if (newRemaining <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  const isActiveSession = session.status === SessionStatus.ACTIVE || isActive;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: isActiveSession ? theme.accent : theme.border,
          borderWidth: 1,
        },
        isActiveSession && styles.activeCard,
      ]}
      onPress={() => router.push(`/session/${session.id}` as never)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text
          style={[styles.name, { color: theme.text }]}
          numberOfLines={1}
        >
          {session.name}
        </Text>
        <View style={styles.headerRight}>
          {isActiveSession && onCancel && (
            <TouchableOpacity
              onPress={() => onCancel(session.id)}
              style={[styles.cancelBtn, { borderColor: theme.danger }]}
            >
              <Text style={[styles.cancelText, { color: theme.danger }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isActiveSession ? (
        <View style={styles.activeContent}>
          <Text style={[styles.countdown, { color: theme.accent }]}>
            {formatCountdown(remaining)}
          </Text>
          <View style={styles.statsRow}>
            <Text style={[styles.violations, { color: theme.danger }]}>
              {session.violations_count || 0} violations
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.info}>
          <Text style={[styles.time, { color: theme.textSecondary }]}>
            {formatTime(session.start_time)} · {formatDuration(session.duration)}
          </Text>
        </View>
      )}

      <View style={styles.badges}>
        {session.mobile_focus && (
          <View style={[styles.badge, { backgroundColor: theme.surface }]}>
            <Text style={[styles.badgeText, { color: theme.textSecondary }]}>📱 Mobile</Text>
          </View>
        )}
        {session.browser_focus && (
          <View style={[styles.badge, { backgroundColor: theme.surface }]}>
            <Text style={[styles.badgeText, { color: theme.textSecondary }]}>🌐 Browser</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  activeCard: {
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  cancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  activeContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  countdown: {
    fontSize: 36,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    marginTop: 4,
  },
  violations: {
    fontSize: 13,
    fontWeight: '500',
  },
  info: {
    marginBottom: 4,
  },
  time: {
    fontSize: 14,
    fontWeight: '300',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '400',
  },
});
