// ============================================================
// Focussive Mobile — Manage History Screen
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { historyApi } from '@/utils/api';
import { formatDate, formatDuration } from '@focussive/shared';
import type { SessionHistory } from '@focussive/shared';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function ManageHistoryScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearingRange, setClearingRange] = useState<'week' | 'month' | 'all' | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await historyApi.getAll(1, 200);
      setHistory((response.data as SessionHistory[]) || []);
    } catch {
      Alert.alert('Error', 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Calculate counts for the last 7 days and last 30 days
  const now = Date.now();
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1000;
  const monthCutoff = now - 30 * 24 * 60 * 60 * 1000;

  const countPastWeek = useMemo(() => {
    return history.filter(h => new Date(h.created_at).getTime() >= weekCutoff).length;
  }, [history, weekCutoff]);

  const countPastMonth = useMemo(() => {
    return history.filter(h => new Date(h.created_at).getTime() >= monthCutoff).length;
  }, [history, monthCutoff]);

  async function handleBatchClear(range: 'week' | 'month' | 'all') {
    let title = '';
    let message = '';
    let count = 0;

    if (range === 'week') {
      title = 'Clear Last 7 Days';
      count = countPastWeek;
      message = `This will delete ${count} session ${count === 1 ? 'record' : 'records'} from the past 7 days. Your weekly stats and streak will be recalculated.`;
    } else if (range === 'month') {
      title = 'Clear Last 30 Days';
      count = countPastMonth;
      message = `This will delete ${count} session ${count === 1 ? 'record' : 'records'} from the past 30 days. Your monthly stats will be recalculated.`;
    } else {
      title = 'Clear All Session History';
      count = history.length;
      message = `This will permanently delete all ${count} session ${count === 1 ? 'record' : 'records'}. Your streaks and milestones will reset. This action cannot be undone.`;
    }

    if (count === 0 && range !== 'all') {
      Alert.alert(title, 'No session records found in this timeframe.');
      return;
    }

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear Data',
        style: 'destructive',
        onPress: async () => {
          setClearingRange(range);
          try {
            await historyApi.deleteAll(range);
            await fetchHistory();
            Alert.alert('History Cleared', 'The selected session history has been cleared.');
          } catch {
            Alert.alert('Error', 'Failed to clear history');
          } finally {
            setClearingRange(null);
          }
        },
      },
    ]);
  }

  const CARD_BG = isDark ? '#25283E' : theme.card;
  const CARD_BORDER = isDark ? 'rgba(255, 255, 255, 0.08)' : theme.border;
  const CARD_TEXT = isDark ? '#FFFFFF' : theme.text;
  const CARD_TEXT_MUTED = isDark ? 'rgba(255, 255, 255, 0.65)' : theme.textSecondary;

  function renderHeader() {
    return (
      <View style={styles.headerContainer}>
        {/* Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: isDark ? 'rgba(139, 167, 148, 0.12)' : 'rgba(88, 112, 66, 0.1)' }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.infoBannerTitle, { color: theme.accent }]}>Milestone &amp; Streak Integrity</Text>
            <Text style={[styles.infoBannerBody, { color: CARD_TEXT_MUTED }]}>
              To prevent stat manipulation, individual sessions cannot be deleted one by one. You can clear session records in time batches below.
            </Text>
          </View>
        </View>

        {/* Batch Clear Actions Card */}
        <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: isDark ? '700' : '800' }]}>
          CLEAR SESSION DATA
        </Text>

        <View style={[styles.batchCard, { backgroundColor: CARD_BG, borderColor: CARD_BORDER }]}>
          {/* Option: Last 7 Days */}
          <TouchableOpacity
            style={styles.batchOption}
            onPress={() => handleBatchClear('week')}
            disabled={clearingRange !== null || countPastWeek === 0}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <Ionicons name="calendar-outline" size={20} color={countPastWeek > 0 ? theme.accent : CARD_TEXT_MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: countPastWeek > 0 ? CARD_TEXT : CARD_TEXT_MUTED }]}>
                Clear Last 7 Days
              </Text>
              <Text style={[styles.optionSubtitle, { color: CARD_TEXT_MUTED }]}>
                {countPastWeek} {countPastWeek === 1 ? 'session' : 'sessions'} in the past week
              </Text>
            </View>
            {clearingRange === 'week' ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={countPastWeek > 0 ? theme.danger : CARD_TEXT_MUTED} />
            )}
          </TouchableOpacity>

          <View style={[styles.cardDivider, { backgroundColor: CARD_BORDER }]} />

          {/* Option: Last 30 Days */}
          <TouchableOpacity
            style={styles.batchOption}
            onPress={() => handleBatchClear('month')}
            disabled={clearingRange !== null || countPastMonth === 0}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <Ionicons name="time-outline" size={20} color={countPastMonth > 0 ? theme.accent : CARD_TEXT_MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: countPastMonth > 0 ? CARD_TEXT : CARD_TEXT_MUTED }]}>
                Clear Last 30 Days
              </Text>
              <Text style={[styles.optionSubtitle, { color: CARD_TEXT_MUTED }]}>
                {countPastMonth} {countPastMonth === 1 ? 'session' : 'sessions'} in the past 30 days
              </Text>
            </View>
            {clearingRange === 'month' ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={countPastMonth > 0 ? theme.danger : CARD_TEXT_MUTED} />
            )}
          </TouchableOpacity>

          <View style={[styles.cardDivider, { backgroundColor: CARD_BORDER }]} />

          {/* Option: All History */}
          <TouchableOpacity
            style={styles.batchOption}
            onPress={() => handleBatchClear('all')}
            disabled={clearingRange !== null || history.length === 0}
            activeOpacity={0.7}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: isDark ? 'rgba(255, 107, 107, 0.12)' : 'rgba(255, 107, 107, 0.08)' }]}>
              <Ionicons name="flame-outline" size={20} color={theme.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.danger }]}>
                Clear All History
              </Text>
              <Text style={[styles.optionSubtitle, { color: CARD_TEXT_MUTED }]}>
                Resets all {history.length} sessions, streaks, and milestones
              </Text>
            </View>
            {clearingRange === 'all' ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            )}
          </TouchableOpacity>
        </View>

        {/* Section Header for Session List */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
          <Text style={[styles.sectionTitle, { color: theme.accent, fontWeight: isDark ? '700' : '800', marginBottom: 0 }]}>
            RECORDED SESSIONS ({history.length})
          </Text>
        </View>
      </View>
    );
  }

  function renderItem({ item }: { item: SessionHistory }) {
    const isCompleted = item.status === 'completed';

    return (
      <View style={[styles.row, { backgroundColor: CARD_BG, borderColor: CARD_BORDER }]}>
        <View style={[styles.statusIndicator, { backgroundColor: isCompleted ? '#1E9E44' : '#F59E0B' }]} />
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: CARD_TEXT }]} numberOfLines={1}>
            {item.session_name}
          </Text>
          <Text style={[styles.rowMeta, { color: CARD_TEXT_MUTED }]}>
            {formatDate(item.created_at)} · {formatDuration(item.actual_duration || item.scheduled_duration)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: isCompleted ? 'rgba(30, 158, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)' }]}>
          <Text style={[styles.statusBadgeText, { color: isCompleted ? '#1E9E44' : '#F59E0B' }]}>
            {isCompleted ? 'Completed' : (item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Session')}
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <LoadingSpinner size={64} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color={theme.border} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: CARD_TEXT }]}>No History</Text>
            <Text style={[styles.emptySubtitle, { color: CARD_TEXT_MUTED }]}>
              Completed and past focus sessions will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  headerContainer: { marginBottom: 8 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  infoBannerTitle: { fontSize: 14, fontWeight: '700' },
  infoBannerBody: { fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 12, letterSpacing: 2, marginBottom: 10 },
  batchCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  batchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  optionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  optionSubtitle: { fontSize: 12 },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  statusIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', marginBottom: 3 },
  rowMeta: { fontSize: 12 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: { alignItems: 'center', paddingTop: 40, paddingBottom: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', maxWidth: 260 },
});
