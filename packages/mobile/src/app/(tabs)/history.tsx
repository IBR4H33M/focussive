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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, useIsDark } from '@/utils/theme';
import { historyApi } from '@/utils/api';
import { useSubscription } from '@/context/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDuration, formatTime } from '@focussive/shared';
import type { SessionHistory } from '@focussive/shared';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const RETENTION_DAYS = 21;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

function isHistoryItemLocked(item: SessionHistory, isPremium: boolean): boolean {
  if (isPremium) return false;
  const created = new Date(item.created_at).getTime();
  if (isNaN(created)) return false;
  return Date.now() - created > RETENTION_MS;
}

export default function HistoryScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const router = useRouter();
  const { isPremium, openPaywall } = useSubscription();

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
    const isSkipped = item.status === 'skipped';
    const isLocked = isHistoryItemLocked(item, isPremium);

    if (isLocked) {
      return (
        <TouchableOpacity
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#46496C' : theme.card,
              borderWidth: 1,
              borderColor: 'rgba(212, 175, 55, 0.35)',
              opacity: 0.9,
            },
          ]}
          onPress={() => openPaywall('history_locked')}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardName, { color: isDark ? 'rgba(255,255,255,0.7)' : theme.textSecondary }]} numberOfLines={1}>
              {item.session_name}
            </Text>
            <View style={styles.proBadge}>
              <Image
                source={require('../../../assets/pro_icon.png')}
                style={{ width: 12, height: 12 }}
                resizeMode="contain"
              />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </View>

          <View style={styles.cardDetails}>
            <Text style={[styles.cardDate, { color: isDark ? 'rgba(255, 255, 255, 0.5)' : theme.textSecondary }]}>
              {formatDate(item.created_at)}
            </Text>
            <Text style={[styles.cardDot, { color: isDark ? 'rgba(255, 255, 255, 0.5)' : theme.textSecondary }]}>·</Text>
            <Text style={{ fontSize: 12, color: '#D4AF37', fontWeight: '500' }}>
              Archived in account • Tap to unlock
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: isDark ? '#5F66A2' : theme.card }]}
        onPress={() => router.push(`/history/${item.id}` as never)}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardName, { color: isDark ? '#FFFFFF' : theme.text }]} numberOfLines={1}>
            {item.session_name}
          </Text>
          {isCancelled && (
            <View style={[styles.cancelBadge, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.25)' : theme.dangerBg }]}>
              <Text style={[styles.cancelBadgeText, { color: isDark ? '#FFB4B4' : theme.danger }]}>Cancelled</Text>
            </View>
          )}
          {isSkipped && (
            <View style={[styles.cancelBadge, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.15)' }]}>
              <Text style={[styles.cancelBadgeText, { color: isDark ? '#FCD34D' : '#D97706' }]}>Skipped</Text>
            </View>
          )}
        </View>

        <View style={styles.cardDetails}>
          <Text style={[styles.cardDate, { color: isDark ? 'rgba(255, 255, 255, 0.85)' : theme.textSecondary }]}>
            {formatDate(item.created_at)}
          </Text>
          <Text style={[styles.cardDot, { color: isDark ? 'rgba(255, 255, 255, 0.85)' : theme.textSecondary }]}>·</Text>
          <Text style={[styles.cardTime, { color: isDark ? 'rgba(255, 255, 255, 0.85)' : theme.textSecondary }]}>
            {formatTime(item.start_time)}
          </Text>
          <Text style={[styles.cardDot, { color: isDark ? 'rgba(255, 255, 255, 0.85)' : theme.textSecondary }]}>·</Text>
          <Text style={[styles.cardDuration, { color: isDark ? 'rgba(255, 255, 255, 0.85)' : theme.textSecondary }]}>
            {formatDuration(item.actual_duration || item.scheduled_duration)}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text
            style={[
              styles.violations,
              { color: item.violations_count > 0 ? (isDark ? '#FFB4B4' : theme.danger) : (isDark ? 'rgba(255, 255, 255, 0.85)' : theme.textSecondary) },
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
        <LoadingSpinner size={64} />
      </View>
    );
  }

  const hasLockedItems = !isPremium && history.some((item) => isHistoryItemLocked(item, false));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          hasLockedItems ? (
            <TouchableOpacity
              style={[
                styles.historyUpgradeCard,
                { backgroundColor: isDark ? '#46496C' : theme.card },
              ]}
              onPress={() => openPaywall('history_banner')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Image
                  source={require('../../../assets/pro_icon.png')}
                  style={{ width: 24, height: 24 }}
                  resizeMode="contain"
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyUpgradeTitle, { color: isDark ? '#FFFFFF' : theme.text }]}>
                    Unlock Full History
                  </Text>
                  <Text style={[styles.historyUpgradeSubtitle, { color: isDark ? 'rgba(255,255,255,0.7)' : theme.textSecondary }]}>
                    Older sessions are safely archived. Upgrade to Pro for lifetime history.
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="list-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 16 }} />
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
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.45)',
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D4AF37',
    letterSpacing: 0.5,
  },
  historyUpgradeCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.4)',
  },
  historyUpgradeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyUpgradeSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
});
