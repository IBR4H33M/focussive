// ============================================================
// Focussive Mobile — Manage History Screen
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
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
import { useTheme } from '@/utils/theme';
import { historyApi } from '@/utils/api';
import { formatDate, formatDuration } from '@focussive/shared';
import type { SessionHistory } from '@focussive/shared';

export default function ManageHistoryScreen() {
  const theme = useTheme();
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await historyApi.getAll(1, 100);
      setHistory(response.data as SessionHistory[]);
    } catch {
      Alert.alert('Error', 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function confirmDeleteOne(item: SessionHistory) {
    Alert.alert(
      'Delete Entry',
      `Remove "${item.session_name}" from history?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              await historyApi.deleteOne(item.id);
              setHistory(prev => prev.filter(h => h.id !== item.id));
            } catch {
              Alert.alert('Error', 'Failed to delete entry');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }

  function confirmDeleteAll() {
    if (history.length === 0) return;
    Alert.alert(
      'Delete All History',
      `This will permanently delete all ${history.length} history entr${history.length === 1 ? 'y' : 'ies'}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await historyApi.deleteAll();
              setHistory([]);
            } catch {
              Alert.alert('Error', 'Failed to delete history');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }

  function renderItem({ item }: { item: SessionHistory }) {
    const isDeleting = deletingId === item.id;
    return (
      <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
            {item.session_name}
          </Text>
          <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
            {formatDate(item.created_at)} · {formatDuration(item.scheduled_duration)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => confirmDeleteOne(item)}
          disabled={isDeleting}
          style={[styles.deleteBtn, { opacity: isDeleting ? 0.4 : 1 }]}
        >
          <Ionicons name="trash-outline" size={18} color={theme.danger} />
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {history.length > 0 && (
        <TouchableOpacity
          style={[styles.deleteAllBtn, { backgroundColor: `${theme.danger}15`, borderColor: theme.danger }]}
          onPress={confirmDeleteAll}
        >
          <Ionicons name="trash-outline" size={16} color={theme.danger} />
          <Text style={[styles.deleteAllText, { color: theme.danger }]}>
            Delete All History ({history.length})
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={history}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No history</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              All history has been cleared
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
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 0,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  deleteAllText: { fontSize: 14, fontWeight: '500' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowName: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  rowMeta: { fontSize: 12, fontWeight: '300' },
  deleteBtn: { padding: 4 },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '300', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontWeight: '300', textAlign: 'center' },
});
