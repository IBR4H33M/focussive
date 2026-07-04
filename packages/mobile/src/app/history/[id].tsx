// ============================================================
// Focussive Mobile — History Detail Screen
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/utils/theme';
import { historyApi } from '@/utils/api';
import { formatDate, formatDuration, formatTime } from '@focussive/shared';
import type { SessionHistory } from '@focussive/shared';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();

  const [entry, setEntry] = useState<SessionHistory & { violations?: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEntry = useCallback(async () => {
    try {
      const data = await historyApi.getById(id) as SessionHistory & { violations?: any[] };
      setEntry(data);
    } catch {
      Alert.alert('Error', 'History entry not found');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!entry) return null;

  const isCancelled = entry.status === 'cancelled';
  const isCompleted = entry.status === 'completed';
  const totalViolations = entry.violations_count ?? 0;
  const appViolations = (entry as any).app_violations_count ?? 0;
  const webViolations = (entry as any).web_violations_count ?? 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.sessionName, { color: theme.text }]}>{entry.session_name}</Text>
          <View style={[
            styles.statusBadge,
            { backgroundColor: isCancelled ? theme.dangerBg : `${theme.accent}20` }
          ]}>
            <Text style={[
              styles.statusText,
              { color: isCancelled ? theme.danger : theme.accent }
            ]}>
              {isCancelled ? 'Cancelled' : 'Completed'}
            </Text>
          </View>
        </View>
        <Text style={[styles.date, { color: theme.textSecondary }]}>
          {formatDate(entry.created_at)}
        </Text>
      </View>

      {/* Duration Stats */}
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>DURATION</Text>
      <View style={[styles.statsGrid, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {formatDuration(entry.actual_duration ?? entry.scheduled_duration)}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Actual</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {formatDuration(entry.scheduled_duration)}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Scheduled</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: theme.text }]}>
            {formatTime(entry.start_time)}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Start Time</Text>
        </View>
      </View>

      {/* Violations */}
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>VIOLATIONS</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* Total */}
        <View style={styles.violationRow}>
          <View style={styles.violationLeft}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={totalViolations > 0 ? theme.danger : theme.textSecondary}
            />
            <Text style={[styles.violationLabel, { color: theme.text }]}>Total Violations</Text>
          </View>
          <Text style={[
            styles.violationCount,
            { color: totalViolations > 0 ? theme.danger : theme.textSecondary }
          ]}>
            {totalViolations}
          </Text>
        </View>

        {/* Separator */}
        {totalViolations > 0 && (
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
        )}

        {/* App Violations */}
        {totalViolations > 0 && (
          <>
            <View style={styles.violationRow}>
              <View style={styles.violationLeft}>
                <Ionicons name="phone-portrait-outline" size={18} color={theme.textSecondary} />
                <Text style={[styles.violationSubLabel, { color: theme.textSecondary }]}>
                  Mobile App Violations
                </Text>
              </View>
              <Text style={[
                styles.violationSubCount,
                { color: appViolations > 0 ? theme.danger : theme.textSecondary }
              ]}>
                {appViolations}
              </Text>
            </View>

            <View style={styles.violationRow}>
              <View style={styles.violationLeft}>
                <Ionicons name="globe-outline" size={18} color={theme.textSecondary} />
                <Text style={[styles.violationSubLabel, { color: theme.textSecondary }]}>
                  Browser Violations
                </Text>
              </View>
              <Text style={[
                styles.violationSubCount,
                { color: webViolations > 0 ? theme.danger : theme.textSecondary }
              ]}>
                {webViolations}
              </Text>
            </View>
          </>
        )}

        {totalViolations === 0 && (
          <View style={styles.noViolations}>
            <Ionicons name="checkmark-circle-outline" size={32} color={theme.accent} />
            <Text style={[styles.noViolationsText, { color: theme.textSecondary }]}>
              No violations — great focus!
            </Text>
          </View>
        )}
      </View>

      {/* Cancellation reason */}
      {isCancelled && (entry as any).cancellation_reason && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>CANCELLATION REASON</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cancelReason, { color: theme.text }]}>
              {(entry as any).cancellation_reason}
            </Text>
          </View>
        </>
      )}

      {/* Pause count */}
      {((entry as any).pause_count ?? 0) > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>PAUSES</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.violationRow}>
              <View style={styles.violationLeft}>
                <Ionicons name="pause-circle-outline" size={20} color={theme.textSecondary} />
                <Text style={[styles.violationLabel, { color: theme.text }]}>Times Paused</Text>
              </View>
              <Text style={[styles.violationCount, { color: theme.textSecondary }]}>
                {(entry as any).pause_count}
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  sessionName: { fontSize: 20, fontWeight: '500', flex: 1, marginRight: 12 },
  date: { fontSize: 13, fontWeight: '300', marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 4,
  },
  statsGrid: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 20,
  },
  statCell: { flex: 1, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '500', marginBottom: 4 },
  statLabel: { fontSize: 11, fontWeight: '300' },
  statDivider: { width: 1, marginVertical: 12 },
  separator: { height: 1, marginVertical: 8 },
  violationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  violationLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  violationLabel: { fontSize: 15, fontWeight: '400' },
  violationCount: { fontSize: 22, fontWeight: '300' },
  violationSubLabel: { fontSize: 13, fontWeight: '300' },
  violationSubCount: { fontSize: 18, fontWeight: '300' },
  noViolations: { alignItems: 'center', paddingVertical: 12, gap: 8 },
  noViolationsText: { fontSize: 14, fontWeight: '300' },
  cancelReason: { fontSize: 14, fontWeight: '300', lineHeight: 20 },
});
