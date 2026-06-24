// ============================================================
// Focussive Mobile — Session Detail Screen
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { sessionApi, violationApi } from '@/utils/api';
import { useSessions } from '@/context/SessionContext';
import { formatDuration, formatTime, formatCountdown, getRemainingSeconds } from '@focussive/shared';
import { SessionStatus } from '@focussive/shared';
import type { Session, Violation } from '@focussive/shared';

export default function SessionDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshSessions } = useSessions();

  const [session, setSession] = useState<(Session & { violations_count: number }) | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    loadSession();
  }, [id]);

  useEffect(() => {
    if (!session || session.status !== SessionStatus.ACTIVE) return;
    setRemaining(getRemainingSeconds(session));
    const interval = setInterval(() => {
      setRemaining(getRemainingSeconds(session));
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  async function loadSession() {
    if (!id) return;
    try {
      const data = await sessionApi.getById(id) as Session & { violations_count: number };
      setSession(data);

      const vRes = await violationApi.getBySession(id);
      setViolations(vRes.data as Violation[]);
    } catch {
      Alert.alert('Error', 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!session) return;
    Alert.alert('Delete Session', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await sessionApi.delete(session.id);
            await refreshSessions();
            router.back();
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete');
          }
        },
      },
    ]);
  }

  async function handleCancel() {
    if (!session) return;
    Alert.alert('Cancel Session', 'End this session early?', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Cancel Session',
        style: 'destructive',
        onPress: async () => {
          try {
            await sessionApi.cancel(session.id);
            await refreshSessions();
            router.back();
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to cancel');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Session not found</Text>
      </View>
    );
  }

  const isActive = session.status === SessionStatus.ACTIVE;

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={[styles.name, { color: theme.text }]}>{session.name}</Text>

      {/* Active Countdown */}
      {isActive && (
        <View style={[styles.countdownContainer, { borderColor: theme.accent }]}>
          <Text style={[styles.countdown, { color: theme.accent }]}>
            {formatCountdown(remaining)}
          </Text>
          <Text style={[styles.countdownLabel, { color: theme.textSecondary }]}>remaining</Text>
        </View>
      )}

      {/* Details */}
      <View style={[styles.detailCard, { borderColor: theme.border }]}>
        <DetailRow label="Duration" value={formatDuration(session.duration)} theme={theme} />
        <DetailRow label="Start Time" value={formatTime(session.start_time)} theme={theme} />
        <DetailRow label="Schedule" value={session.schedule.replace('_', ' ')} theme={theme} />
        <DetailRow label="Status" value={session.status} theme={theme} />
        <DetailRow label="Mobile Focus" value={session.mobile_focus ? '✅ On' : '❌ Off'} theme={theme} />
        <DetailRow label="Browser Focus" value={session.browser_focus ? '✅ On' : '❌ Off'} theme={theme} />
        <DetailRow label="Violations" value={String(session.violations_count)} theme={theme} isLast />
      </View>

      {/* Violations List */}
      {violations.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>VIOLATIONS</Text>
          {violations.map((v) => (
            <View key={v.id} style={[styles.violationItem, { borderColor: theme.border }]}>
              <Text style={[styles.violationName, { color: theme.text }]}>
                {v.app_name || v.website_name || 'Unknown'}
              </Text>
              <Text style={[styles.violationAction, { color: theme.textSecondary }]}>
                {v.action_taken.replace('_', ' ')} · {v.duration_seconds}s
              </Text>
            </View>
          ))}
        </>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isActive ? (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.danger }]} onPress={handleCancel}>
            <Text style={styles.actionBtnText}>Cancel Session</Text>
          </TouchableOpacity>
        ) : session.status === SessionStatus.SCHEDULED ? (
          <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.danger, borderWidth: 1 }]} onPress={handleDelete}>
            <Text style={[styles.actionBtnText, { color: theme.danger }]}>Delete Session</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value, theme, isLast }: { label: string; value: string; theme: ReturnType<typeof useTheme>; isLast?: boolean }) {
  return (
    <View style={[detailStyles.row, !isLast && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
      <Text style={[detailStyles.label, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[detailStyles.value, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  label: { fontSize: 14, fontWeight: '300' },
  value: { fontSize: 14, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 28, fontWeight: '300', marginBottom: 16 },
  countdownContainer: { alignItems: 'center', padding: 24, borderRadius: 16, borderWidth: 2, marginBottom: 24 },
  countdown: { fontSize: 48, fontWeight: '200', fontVariant: ['tabular-nums'] },
  countdownLabel: { fontSize: 14, fontWeight: '300', marginTop: 4 },
  detailCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 2, marginBottom: 12 },
  violationItem: { padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8 },
  violationName: { fontSize: 14, fontWeight: '500' },
  violationAction: { fontSize: 12, fontWeight: '300', marginTop: 4 },
  actions: { marginTop: 24 },
  actionBtn: { height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
