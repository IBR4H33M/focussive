// ============================================================
// Focussive Mobile — All Sessions (Ordered by Creation Date)
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSessions } from '@/context/SessionContext';
import { formatTime, formatDuration, formatDate } from '@focussive/shared';
import type { Session } from '@focussive/shared';
import { SessionStatus } from '@focussive/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatCreatedAt(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function AllSessionsScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { allSessions, isLoading, refreshSessions } = useSessions();

  const [sortDesc, setSortDesc] = useState(true);

  const sortedSessions = useMemo(() => {
    return [...allSessions].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return sortDesc ? timeB - timeA : timeA - timeB;
    });
  }, [allSessions, sortDesc]);

  function getStatusBadge(status: string) {
    switch (status) {
      case SessionStatus.ACTIVE:
        return { label: 'Active', bg: `${theme.accent}20`, text: theme.accent, icon: 'radio-button-on' };
      case SessionStatus.SCHEDULED:
        return { label: 'Scheduled', bg: `${theme.accent}15`, text: theme.textSecondary, icon: 'calendar-outline' };
      case SessionStatus.COMPLETED:
        return { label: 'Completed', bg: `${theme.surface}`, text: theme.textSecondary, icon: 'checkmark-circle-outline' };
      case SessionStatus.CANCELLED:
        return { label: 'Cancelled', bg: theme.dangerBg, text: theme.danger, icon: 'close-circle-outline' };
      default:
        return { label: status, bg: theme.surface, text: theme.textSecondary, icon: 'time-outline' };
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Page Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>All Sessions</Text>

        {/* Sort Toggle Button */}
        <TouchableOpacity
          style={[styles.sortButton, { backgroundColor: theme.card }]}
          onPress={() => setSortDesc(prev => !prev)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={sortDesc ? 'arrow-down' : 'arrow-up'}
            size={14}
            color={theme.accent}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.sortButtonText, { color: theme.text }]}>
            {sortDesc ? 'Newest' : 'Oldest'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sessions List */}
      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refreshSessions}
            tintColor={theme.accent}
          />
        }
      >
        {sortedSessions.map((session) => {
          const badge = getStatusBadge(session.status);
          return (
            <TouchableOpacity
              key={session.id}
              style={[styles.sessionCard, { backgroundColor: theme.card }]}
              onPress={() => router.push(`/session/${session.id}` as never)}
              activeOpacity={0.7}
            >
              {/* Card Header: Name + Status Badge */}
              <View style={styles.cardHeader}>
                <Text style={[styles.sessionName, { color: theme.text }]} numberOfLines={1}>
                  {session.name}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                  <Ionicons name={badge.icon as any} size={12} color={badge.text} style={{ marginRight: 4 }} />
                  <Text style={[styles.statusText, { color: badge.text }]}>
                    {badge.label}
                  </Text>
                </View>
              </View>

              {/* Time & Duration */}
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.metaText, { color: theme.text }]}>
                  {formatTime(session.start_time)} · {formatDuration(session.duration)}
                </Text>
              </View>

              {/* Schedule Type */}
              <View style={styles.metaRow}>
                <Ionicons name="repeat-outline" size={14} color={theme.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                  {session.schedule === 'today'
                    ? 'Runs Today'
                    : session.schedule === 'recurring'
                    ? `Recurring (${Array.isArray(session.schedule_days) ? session.schedule_days.join(', ') : 'Daily'})`
                    : `Scheduled dates (${Array.isArray(session.schedule_days) ? session.schedule_days.length : 0})`}
                </Text>
              </View>

              {/* Footer: Focus badges + Created Date */}
              <View style={styles.cardFooter}>
                <View style={styles.focusPills}>
                  {session.mobile_focus && (
                    <View style={[styles.focusPill, { backgroundColor: theme.surface }]}>
                      <Ionicons name="phone-portrait-outline" size={11} color={theme.textSecondary} style={{ marginRight: 3 }} />
                      <Text style={[styles.focusPillText, { color: theme.textSecondary }]}>Mobile</Text>
                    </View>
                  )}
                  {session.browser_focus && (
                    <View style={[styles.focusPill, { backgroundColor: theme.surface }]}>
                      <Ionicons name="globe-outline" size={11} color={theme.textSecondary} style={{ marginRight: 3 }} />
                      <Text style={[styles.focusPillText, { color: theme.textSecondary }]}>Browser</Text>
                    </View>
                  )}
                </View>

                <View style={styles.createdDateContainer}>
                  <Ionicons name="calendar-outline" size={12} color={theme.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.createdDateText, { color: theme.textSecondary }]}>
                    {formatCreatedAt(session.created_at)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {sortedSessions.length === 0 && !isLoading && (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-clear-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Sessions Found</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Create a new focus session to see it listed here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 12,
  },
  sessionCard: {
    borderRadius: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '400',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
  },
  focusPills: {
    flexDirection: 'row',
    gap: 6,
  },
  focusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  focusPillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  createdDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createdDateText: {
    fontSize: 11,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
});
