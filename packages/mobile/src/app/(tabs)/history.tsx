// ============================================================
// Focussive Mobile — History Screen
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { historyApi } from '@/utils/api';
import { formatDate, formatDuration, formatTime } from '@focussive/shared';
import type { SessionHistory } from '@focussive/shared';

export default function HistoryScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchHistory = useCallback(async (pageNum: number) => {
    try {
      const response = await historyApi.getAll(pageNum);
      const items = response.data as SessionHistory[];
      if (pageNum === 1) {
        setHistory(items);
      } else {
        setHistory((prev) => [...prev, ...items]);
      }
      setHasMore(items.length === response.limit);
    } catch {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(1);
  }, [fetchHistory]);

  function loadMore() {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchHistory(nextPage);
  }

  function renderItem({ item }: { item: SessionHistory }) {
    const isCancelled = item.status === 'cancelled';

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => router.push(`/history/${item.id}` as never)}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={1}>
            {item.session_name}
          </Text>
          {isCancelled && (
            <View style={[styles.cancelBadge, { backgroundColor: theme.dangerBg }]}>
              <Text style={[styles.cancelBadgeText, { color: theme.danger }]}>Cancelled</Text>
            </View>
          )}
        </View>

        <View style={styles.cardDetails}>
          <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
            {formatDate(item.created_at)}
          </Text>
          <Text style={[styles.cardDot, { color: theme.textSecondary }]}>·</Text>
          <Text style={[styles.cardTime, { color: theme.textSecondary }]}>
            {formatTime(item.start_time)}
          </Text>
          <Text style={[styles.cardDot, { color: theme.textSecondary }]}>·</Text>
          <Text style={[styles.cardDuration, { color: theme.textSecondary }]}>
            {formatDuration(item.actual_duration || item.scheduled_duration)}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text
            style={[
              styles.violations,
              { color: item.violations_count > 0 ? theme.danger : theme.textSecondary },
            ]}
          >
            {item.violations_count} violation{item.violations_count !== 1 ? 's' : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading && history.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No history yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Completed and cancelled sessions will appear here
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
  listContent: { padding: 16 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardName: { fontSize: 16, fontWeight: '500', flex: 1 },
  cancelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  cancelBadgeText: { fontSize: 11, fontWeight: '500' },
  cardDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cardDate: { fontSize: 13, fontWeight: '300' },
  cardDot: { fontSize: 13 },
  cardTime: { fontSize: 13, fontWeight: '300' },
  cardDuration: { fontSize: 13, fontWeight: '300' },
  cardFooter: {},
  violations: { fontSize: 13, fontWeight: '400' },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '300', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontWeight: '300', textAlign: 'center' },
});
