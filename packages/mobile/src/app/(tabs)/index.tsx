// ============================================================
// Focussive Mobile — Home Screen (Sessions)
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
import { useTheme } from '@/utils/theme';
import { useSessions } from '@/context/SessionContext';
import SessionCard from '@/components/SessionCard';
import { sessionApi } from '@/utils/api';
import type { Session } from '@focussive/shared';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { activeSessions, upcomingSessions, allSessions, isLoading, refreshSessions } = useSessions();

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancellingSession, setCancellingSession] = useState<Session | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Scheduled sessions = all minus active minus upcoming
  const activeIds = new Set(activeSessions.map((s) => s.id));
  const upcomingIds = new Set(upcomingSessions.map((s) => s.id));
  const scheduledSessions = allSessions.filter(
    (s) => !activeIds.has(s.id) && !upcomingIds.has(s.id)
  );

  function handleCancel(sessionId: string) {
    const session = activeSessions.find((s) => s.id === sessionId);
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refreshSessions}
            tintColor={theme.accent}
          />
        }
      >
        {/* Active Sessions */}
        {activeSessions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ACTIVE</Text>
            {activeSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session as Session & { violations_count?: number; pause_count?: number }}
                isActive
                onCancel={handleCancel}
                onRefresh={refreshSessions}
              />
            ))}
          </View>
        )}

        {/* Upcoming Sessions */}
        {upcomingSessions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>UPCOMING</Text>
            {upcomingSessions.map((session) => (
              <SessionCard key={session.id} session={session as Session & { violations_count?: number; pause_count?: number }} onRefresh={refreshSessions} />
            ))}
          </View>
        )}

        {/* Scheduled Sessions */}
        {scheduledSessions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>SCHEDULED</Text>
            {scheduledSessions.map((session) => (
              <SessionCard key={session.id} session={session as Session & { violations_count?: number; pause_count?: number }} onRefresh={refreshSessions} />
            ))}
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

      {/* FAB - Create Session */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.accentDark }]}
        onPress={() => router.push('/session/create' as never)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

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
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
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
    bottom: 24,
    right: 24,
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
