// ============================================================
// Focussive Mobile — Dashboard Screen
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSessions } from '@/context/SessionContext';
import SessionCard from '@/components/SessionCard';
import { sessionApi } from '@/utils/api';
import type { Session } from '@focussive/shared';
import { sortByNextOccurrence, getNextSessionOccurrence, isSessionInActiveWindow } from '@focussive/shared';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function DashboardScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeSessions, upcomingSessions, allSessions, isLoading, refreshSessions } = useSessions();

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancellingSession, setCancellingSession] = useState<Session | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isSkippingUpcoming, setIsSkippingUpcoming] = useState(false);

  const now = new Date();
  const activeIds = new Set(activeSessions.map((s) => s.id));
  const pausedSessions = allSessions.filter((s) => s.status === 'paused');
  const pausedIds = new Set(pausedSessions.map((s) => s.id));

  // Determine effective active sessions (include any session currently in its active window)
  const windowActiveSessions = allSessions.filter(
    (s) =>
      !activeIds.has(s.id) &&
      !pausedIds.has(s.id) &&
      s.status !== 'completed' &&
      s.status !== 'cancelled' &&
      isSessionInActiveWindow(s, now)
  );
  const effectiveActiveSessions = [...activeSessions, ...windowActiveSessions];
  const effectiveActiveIds = new Set(effectiveActiveSessions.map((s) => s.id));

  // Candidates for upcoming/scheduled: all non-active, non-paused, non-completed sessions
  const candidates = allSessions.filter(
    (s) =>
      s.status !== 'completed' &&
      s.status !== 'cancelled' &&
      !effectiveActiveIds.has(s.id) &&
      !pausedIds.has(s.id) &&
      !isSessionInActiveWindow(s, now)
  );

  // Evaluate the next future occurrence for each candidate.
  // Sessions that have already finished today or whose single run was skipped return null and are excluded.
  const validUpcomingSessions = candidates
    .map((s) => ({ session: s, nextOccurrence: getNextSessionOccurrence(s, now) }))
    .filter((item): item is { session: Session; nextOccurrence: Date } => item.nextOccurrence !== null)
    .sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());

  // Pick the single closest upcoming session
  const nextUpcomingSession = validUpcomingSessions.length > 0 ? validUpcomingSessions[0].session : null;
  const nextUpcomingId = nextUpcomingSession?.id ?? null;

  // Remaining sessions scheduled later (closest first)
  const scheduledSessions = validUpcomingSessions
    .filter((item) => item.session.id !== nextUpcomingId)
    .map((item) => item.session);

  function handleCancel(sessionId: string) {
    const session = [...effectiveActiveSessions, ...pausedSessions].find((s) => s.id === sessionId);
    if (session) {
      setCancellingSession(session);
      setCancelModalVisible(true);
    }
  }

  async function confirmCancel() {
    if (!cancellingSession) return;
    try {
      await sessionApi.cancel(cancellingSession.id, cancelReason || undefined);
      setCancelModalVisible(false);
      setCancellingSession(null);
      setCancelReason('');
      await refreshSessions();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to cancel session');
    }
  }

  async function handleSkipSession(session: Session) {
    try {
      setIsSkippingUpcoming(true);
      const status = await sessionApi.getSkipStatus();
      if (status && status.skips_remaining <= 0) {
        Alert.alert(
          'Skip Limit Reached',
          `You have used all ${status.monthly_skip_limit} skips for this month. You can adjust your limit in Settings > Preferences.`
        );
        setIsSkippingUpcoming(false);
        return;
      }

      const remainingText = status ? ` (${status.skips_remaining} skip${status.skips_remaining === 1 ? '' : 's'} left this month)` : '';
      const isActiveSession = session.status === 'active' || session.status === 'paused';
      const promptText = isActiveSession
        ? `This active session "${session.name}" will be ended and skipped${remainingText}.\n\nIt will not count as a violation and will resume automatically on its next scheduled occurrence.`
        : `This upcoming occurrence of "${session.name}" will be skipped${remainingText}.\n\nIt will resume automatically on its next scheduled occurrence.`;

      Alert.alert(
        'Skip this session?',
        promptText,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setIsSkippingUpcoming(false) },
          {
            text: 'Skip',
            style: 'destructive',
            onPress: async () => {
              try {
                const res = await sessionApi.skip(session.id);
                const remainingAfter = res.skips_remaining !== undefined
                  ? ` (${res.skips_remaining} skip${res.skips_remaining === 1 ? '' : 's'} remaining this month)`
                  : '';
                Alert.alert('Session Skipped', `The session has been skipped${remainingAfter}.`);
                await refreshSessions();
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to skip session');
              } finally {
                setIsSkippingUpcoming(false);
              }
            },
          },
        ]
      );
    } catch {
      const isActiveSession = session.status === 'active' || session.status === 'paused';
      const promptText = isActiveSession
        ? `This active session "${session.name}" will be ended and skipped.\n\nIt will not count as a violation and will resume automatically on its next scheduled occurrence.`
        : `This upcoming occurrence of "${session.name}" will be skipped.\n\nIt will resume automatically on its next scheduled occurrence.`;

      Alert.alert(
        'Skip this session?',
        promptText,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setIsSkippingUpcoming(false) },
          {
            text: 'Skip',
            style: 'destructive',
            onPress: async () => {
              try {
                await sessionApi.skip(session.id);
                Alert.alert('Session Skipped', 'The session has been skipped.');
                await refreshSessions();
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to skip session');
              } finally {
                setIsSkippingUpcoming(false);
              }
            },
          },
        ]
      );
    }
  }

  const currentActiveOrPaused = effectiveActiveSessions[0] || pausedSessions[0];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 24) + 16 }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refreshSessions}
            tintColor={theme.accent}
          />
        }
      >
        {/* Loading State when starting up */}
        {allSessions.length === 0 && isLoading && (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <LoadingSpinner size={64} />
          </View>
        )}

        {/* Active + Paused Sessions */}
        {(effectiveActiveSessions.length > 0 || pausedSessions.length > 0) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ACTIVE</Text>
            {effectiveActiveSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session as Session & { violations_count?: number }}
                isActive
              />
            ))}
            {pausedSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session as Session & { violations_count?: number }}
              />
            ))}
            {/* If there is an active session, skip button appears underneath it */}
            {currentActiveOrPaused && (
              <TouchableOpacity
                style={[
                  styles.skipUpcomingBtn,
                  { backgroundColor: theme.card },
                ]}
                onPress={() => handleSkipSession(currentActiveOrPaused)}
                disabled={isSkippingUpcoming}
                activeOpacity={0.7}
              >
                <Ionicons name="play-forward-outline" size={15} color={theme.textSecondary} />
                <Text style={[styles.skipUpcomingBtnText, { color: theme.text }]}>Skip this session</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Next upcoming session */}
        {nextUpcomingSession && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              UPCOMING
            </Text>
            <SessionCard
              key={nextUpcomingSession.id}
              session={nextUpcomingSession as Session & { violations_count?: number; pause_count?: number }}
              isUpcoming
            />
            {/* Show skip button under upcoming ONLY if there is no active session */}
            {!currentActiveOrPaused && (
              <TouchableOpacity
                style={[
                  styles.skipUpcomingBtn,
                  { backgroundColor: '#D97706' },
                ]}
                onPress={() => handleSkipSession(nextUpcomingSession)}
                disabled={isSkippingUpcoming}
                activeOpacity={0.7}
              >
                <Ionicons name="play-forward-outline" size={15} color="#FFFFFF" />
                <Text style={[styles.skipUpcomingBtnText, { color: '#FFFFFF' }]}>Skip this session</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Scheduled Later Sessions — inside a clean rounded container with filled surface color, max 2 items, and View All button */}
        {scheduledSessions.length > 0 && (
          <View style={[styles.scheduledContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              SCHEDULED LATER
            </Text>

            <View style={styles.scheduledList}>
              {scheduledSessions.slice(0, 2).map((session) => (
                <SessionCard
                  key={session.id}
                  session={session as Session & { violations_count?: number; pause_count?: number }}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.viewAllButton, { backgroundColor: theme.card }]}
              onPress={() => router.push({ pathname: '/(tabs)/app-groups', params: { tab: 'sessions' } } as never)}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewAllButtonText, { color: theme.text }]}>View All</Text>
              <Ionicons name="arrow-forward" size={14} color={theme.accent} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* View All Sessions shortcut if there are multiple sessions but no remaining scheduled later sessions */}
        {scheduledSessions.length === 0 && allSessions.length > 1 && (
          <View style={{ marginBottom: 24 }}>
            <TouchableOpacity
              style={[styles.viewAllButton, { backgroundColor: theme.card }]}
              onPress={() => router.push({ pathname: '/(tabs)/app-groups', params: { tab: 'sessions' } } as never)}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewAllButtonText, { color: theme.text }]}>View All Sessions</Text>
              <Ionicons name="arrow-forward" size={14} color={theme.accent} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {allSessions.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Ionicons name="bulb-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No sessions yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Create your first focus session to get started
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Cancel Confirmation Modal */}
      <Modal visible={cancelModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Cancel Session?</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              This will end &quot;{cancellingSession?.name}&quot; and move it to history.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border }]}
                onPress={() => {
                  setCancelModalVisible(false);
                  setCancellingSession(null);
                }}
              >
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Keep Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.danger }]}
                onPress={confirmCancel}
              >
                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Cancel Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
  },
  section: {
    marginBottom: 24,
  },
  scheduledContainer: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  scheduledList: {
    marginTop: 4,
    marginBottom: 6,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  skipUpcomingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  skipUpcomingBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '300',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '300',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 94,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '500',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '300',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
