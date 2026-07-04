// ============================================================
// Focussive Mobile — Stats Screen (formerly History)
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/utils/theme';
import { historyApi } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDuration, formatTime } from '@focussive/shared';
import type { SessionHistory } from '@focussive/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SECTIONS = ['Overview', 'History', 'Violations'];

export default function StatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const indicatorAnim = useRef(new Animated.Value(0)).current;

  const [activeSection, setActiveSection] = useState(0);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<(SessionHistory & { violations?: any[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await historyApi.getAll(1, 50);
      setHistory(response.data as SessionHistory[]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function goToSection(index: number) {
    setActiveSection(index);
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    Animated.spring(indicatorAnim, {
      toValue: index,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }

  function onScrollEnd(e: any) {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== activeSection) {
      setActiveSection(index);
      Animated.spring(indicatorAnim, {
        toValue: index,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    }
  }

  async function openDetail(item: SessionHistory) {
    setDetailVisible(true);
    setDetailLoading(true);
    try {
      const data = await historyApi.getById(item.id) as SessionHistory & { violations?: any[] };
      setSelectedEntry(data);
    } catch {
      setSelectedEntry(item as any);
    } finally {
      setDetailLoading(false);
    }
  }

  // ---------- computed stats ----------
  const totalSessions = history.length;
  const completedSessions = history.filter(h => h.status === 'completed').length;
  const cancelledSessions = history.filter(h => h.status === 'cancelled').length;
  const totalMinutes = history.reduce((acc, h) => acc + (h.actual_duration ?? h.scheduled_duration ?? 0), 0);
  const totalViolations = history.reduce((acc, h) => acc + (h.violations_count ?? 0), 0);
  const totalAppViolations = history.reduce((acc, h) => acc + ((h as any).app_violations_count ?? 0), 0);
  const totalWebViolations = history.reduce((acc, h) => acc + ((h as any).web_violations_count ?? 0), 0);
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const avgDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

  // ---------- renders ----------
  function renderOverview() {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sectionContent} showsVerticalScrollIndicator={false}>
        {/* Hero stat */}
        <View style={[styles.heroCard, { backgroundColor: theme.accent + '18', borderColor: theme.accent + '40' }]}>
          <Text style={[styles.heroNumber, { color: theme.accent }]}>{formatDuration(totalMinutes)}</Text>
          <Text style={[styles.heroLabel, { color: theme.textSecondary }]}>Total Focus Time</Text>
        </View>

        {/* Grid stats */}
        <View style={styles.statsGrid}>
          <StatCard label="Sessions" value={String(totalSessions)} icon="timer-outline" theme={theme} />
          <StatCard label="Completed" value={String(completedSessions)} icon="checkmark-circle-outline" theme={theme} color={theme.accent} />
          <StatCard label="Cancelled" value={String(cancelledSessions)} icon="close-circle-outline" theme={theme} color={theme.danger} />
          <StatCard label="Completion" value={`${completionRate}%`} icon="trending-up-outline" theme={theme} color={completionRate >= 70 ? theme.accent : theme.danger} />
          <StatCard label="Avg Duration" value={formatDuration(avgDuration)} icon="time-outline" theme={theme} />
          <StatCard label="Violations" value={String(totalViolations)} icon="warning-outline" theme={theme} color={totalViolations > 0 ? theme.danger : theme.textSecondary} />
        </View>
      </ScrollView>
    );
  }

  function renderHistory() {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      );
    }
    if (history.length === 0) {
      return (
        <View style={styles.centered}>
          <Ionicons name="time-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No history yet</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>Completed sessions will appear here</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={history}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.sectionContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isCancelled = item.status === 'cancelled';
          const violations = item.violations_count ?? 0;
          return (
            <TouchableOpacity
              style={[styles.historyCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => openDetail(item)}
              activeOpacity={0.7}
            >
              <View style={styles.historyCardTop}>
                <Text style={[styles.historyName, { color: theme.text }]} numberOfLines={1}>
                  {item.session_name}
                </Text>
                <View style={[
                  styles.statusPill,
                  { backgroundColor: isCancelled ? theme.dangerBg : theme.accent + '20' }
                ]}>
                  <Text style={[styles.statusPillText, { color: isCancelled ? theme.danger : theme.accent }]}>
                    {isCancelled ? 'Cancelled' : 'Completed'}
                  </Text>
                </View>
              </View>

              <View style={styles.historyCardMid}>
                <View style={styles.historyMeta}>
                  <Ionicons name="calendar-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.historyMetaText, { color: theme.textSecondary }]}>{formatDate(item.created_at)}</Text>
                </View>
                <View style={styles.historyMeta}>
                  <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.historyMetaText, { color: theme.textSecondary }]}>{formatTime(item.start_time)}</Text>
                </View>
                <View style={styles.historyMeta}>
                  <Ionicons name="hourglass-outline" size={12} color={theme.textSecondary} />
                  <Text style={[styles.historyMetaText, { color: theme.textSecondary }]}>
                    {formatDuration(item.actual_duration ?? item.scheduled_duration)}
                  </Text>
                </View>
              </View>

              <View style={styles.historyCardBottom}>
                <Text style={[styles.historyViolations, { color: violations > 0 ? theme.danger : theme.textSecondary }]}>
                  {violations > 0 ? `${violations} violation${violations !== 1 ? 's' : ''}` : 'No violations'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  function renderViolations() {
    const historyWithViolations = history.filter(h => (h.violations_count ?? 0) > 0);
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sectionContent} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        <View style={[styles.heroCard, { backgroundColor: theme.dangerBg, borderColor: theme.danger + '40' }]}>
          <Text style={[styles.heroNumber, { color: theme.danger }]}>{totalViolations}</Text>
          <Text style={[styles.heroLabel, { color: theme.textSecondary }]}>Total Violations</Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Mobile Apps" value={String(totalAppViolations)} icon="phone-portrait-outline" theme={theme} color={theme.danger} />
          <StatCard label="Browser" value={String(totalWebViolations)} icon="globe-outline" theme={theme} color={theme.danger} />
        </View>

        {/* Per-session breakdown */}
        {historyWithViolations.length > 0 && (
          <>
            <Text style={[styles.breakdownTitle, { color: theme.textSecondary }]}>BY SESSION</Text>
            {historyWithViolations.map(item => {
              const appV = (item as any).app_violations_count ?? 0;
              const webV = (item as any).web_violations_count ?? 0;
              const total = item.violations_count ?? 0;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.violationRow, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => openDetail(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.violationRowName, { color: theme.text }]} numberOfLines={1}>{item.session_name}</Text>
                    <Text style={[styles.violationRowDate, { color: theme.textSecondary }]}>{formatDate(item.created_at)}</Text>
                  </View>
                  <View style={styles.violationCounts}>
                    <View style={styles.violationBadge}>
                      <Ionicons name="phone-portrait-outline" size={11} color={theme.textSecondary} />
                      <Text style={[styles.violationBadgeText, { color: appV > 0 ? theme.danger : theme.textSecondary }]}>{appV}</Text>
                    </View>
                    <View style={styles.violationBadge}>
                      <Ionicons name="globe-outline" size={11} color={theme.textSecondary} />
                      <Text style={[styles.violationBadgeText, { color: webV > 0 ? theme.danger : theme.textSecondary }]}>{webV}</Text>
                    </View>
                    <Text style={[styles.violationTotal, { color: theme.danger }]}>{total}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {historyWithViolations.length === 0 && (
          <View style={styles.centered}>
            <Ionicons name="shield-checkmark-outline" size={48} color={theme.accent} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No violations yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>Keep up the great focus!</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  const indicatorTranslateX = indicatorAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, SCREEN_WIDTH / 3, (SCREEN_WIDTH / 3) * 2],
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Section Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {SECTIONS.map((s, i) => (
          <TouchableOpacity key={s} style={styles.tabItem} onPress={() => goToSection(i)}>
            <Text style={[styles.tabText, { color: activeSection === i ? theme.accent : theme.textSecondary }]}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
        {/* Active indicator */}
        <Animated.View
          style={[
            styles.tabIndicator,
            { backgroundColor: theme.accent, width: SCREEN_WIDTH / 3 },
            { transform: [{ translateX: indicatorTranslateX }] },
          ]}
        />
      </View>

      {/* Horizontally scrollable sections */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_WIDTH }}>{renderOverview()}</View>
        <View style={{ width: SCREEN_WIDTH }}>{renderHistory()}</View>
        <View style={{ width: SCREEN_WIDTH }}>{renderViolations()}</View>
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          {/* Modal handle */}
          <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />

          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
              {selectedEntry?.session_name ?? '...'}
            </Text>
            <TouchableOpacity onPress={() => setDetailVisible(false)} style={[styles.closeBtn, { backgroundColor: theme.surface }]}>
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {detailLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : selectedEntry ? (
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Status */}
              <View style={[
                styles.statusBanner,
                { backgroundColor: selectedEntry.status === 'cancelled' ? theme.dangerBg : theme.accent + '15' }
              ]}>
                <Ionicons
                  name={selectedEntry.status === 'cancelled' ? 'close-circle-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color={selectedEntry.status === 'cancelled' ? theme.danger : theme.accent}
                />
                <Text style={[styles.statusBannerText, { color: selectedEntry.status === 'cancelled' ? theme.danger : theme.accent }]}>
                  {selectedEntry.status === 'cancelled' ? 'Session Cancelled' : 'Session Completed'}
                </Text>
              </View>

              {/* Duration */}
              <Text style={[styles.detailSectionLabel, { color: theme.textSecondary }]}>DURATION</Text>
              <View style={[styles.detailGrid, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <DetailCell label="Actual" value={formatDuration(selectedEntry.actual_duration ?? selectedEntry.scheduled_duration)} theme={theme} />
                <View style={[styles.detailDivider, { backgroundColor: theme.border }]} />
                <DetailCell label="Scheduled" value={formatDuration(selectedEntry.scheduled_duration)} theme={theme} />
                <View style={[styles.detailDivider, { backgroundColor: theme.border }]} />
                <DetailCell label="Start Time" value={formatTime(selectedEntry.start_time)} theme={theme} />
              </View>

              {/* Violations */}
              <Text style={[styles.detailSectionLabel, { color: theme.textSecondary }]}>VIOLATIONS</Text>
              <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.detailRow}>
                  <View style={styles.detailRowLeft}>
                    <Ionicons name="alert-circle-outline" size={20} color={(selectedEntry.violations_count ?? 0) > 0 ? theme.danger : theme.textSecondary} />
                    <Text style={[styles.detailRowLabel, { color: theme.text }]}>Total</Text>
                  </View>
                  <Text style={[styles.detailRowValue, { color: (selectedEntry.violations_count ?? 0) > 0 ? theme.danger : theme.textSecondary }]}>
                    {selectedEntry.violations_count ?? 0}
                  </Text>
                </View>

                {(selectedEntry.violations_count ?? 0) > 0 && (
                  <>
                    <View style={[styles.rowSeparator, { backgroundColor: theme.border }]} />
                    <View style={styles.detailRow}>
                      <View style={styles.detailRowLeft}>
                        <Ionicons name="phone-portrait-outline" size={18} color={theme.textSecondary} />
                        <Text style={[styles.detailRowSubLabel, { color: theme.textSecondary }]}>Mobile Apps</Text>
                      </View>
                      <Text style={[styles.detailRowSubValue, { color: ((selectedEntry as any).app_violations_count ?? 0) > 0 ? theme.danger : theme.textSecondary }]}>
                        {(selectedEntry as any).app_violations_count ?? 0}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <View style={styles.detailRowLeft}>
                        <Ionicons name="globe-outline" size={18} color={theme.textSecondary} />
                        <Text style={[styles.detailRowSubLabel, { color: theme.textSecondary }]}>Browser</Text>
                      </View>
                      <Text style={[styles.detailRowSubValue, { color: ((selectedEntry as any).web_violations_count ?? 0) > 0 ? theme.danger : theme.textSecondary }]}>
                        {(selectedEntry as any).web_violations_count ?? 0}
                      </Text>
                    </View>
                  </>
                )}

                {(selectedEntry.violations_count ?? 0) === 0 && (
                  <View style={styles.noViolations}>
                    <Ionicons name="checkmark-circle" size={28} color={theme.accent} />
                    <Text style={[styles.noViolationsText, { color: theme.textSecondary }]}>No violations — great work!</Text>
                  </View>
                )}
              </View>

              {/* Pauses */}
              {((selectedEntry as any).pause_count ?? 0) > 0 && (
                <>
                  <Text style={[styles.detailSectionLabel, { color: theme.textSecondary }]}>PAUSES</Text>
                  <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.detailRow}>
                      <View style={styles.detailRowLeft}>
                        <Ionicons name="pause-circle-outline" size={20} color={theme.textSecondary} />
                        <Text style={[styles.detailRowLabel, { color: theme.text }]}>Times Paused</Text>
                      </View>
                      <Text style={[styles.detailRowValue, { color: theme.textSecondary }]}>
                        {(selectedEntry as any).pause_count}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {/* Cancellation reason */}
              {selectedEntry.status === 'cancelled' && (selectedEntry as any).cancellation_reason && (
                <>
                  <Text style={[styles.detailSectionLabel, { color: theme.textSecondary }]}>REASON FOR CANCELLATION</Text>
                  <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.cancelReason, { color: theme.text }]}>
                      {(selectedEntry as any).cancellation_reason}
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

// ---------- Sub-components ----------

function StatCard({ label, value, icon, theme, color }: { label: string; value: string; icon: any; theme: any; color?: string }) {
  const c = color ?? theme.text;
  return (
    <View style={[statStyles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Ionicons name={icon} size={20} color={c} style={{ marginBottom: 8 }} />
      <Text style={[statStyles.value, { color: c }]}>{value}</Text>
      <Text style={[statStyles.label, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

function DetailCell({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={detailStyles.cell}>
      <Text style={[detailStyles.cellValue, { color: theme.text }]}>{value}</Text>
      <Text style={[detailStyles.cellLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  tabBar: {
    flexDirection: 'row',
    height: 48,
    borderBottomWidth: 1,
    position: 'relative',
  },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '500', letterSpacing: 0.5 },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
  sectionContent: { padding: 16, paddingBottom: 40 },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  heroNumber: { fontSize: 42, fontWeight: '200', letterSpacing: -1 },
  heroLabel: { fontSize: 13, fontWeight: '300', marginTop: 4 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  historyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyName: { fontSize: 15, fontWeight: '500', flex: 1, marginRight: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  historyCardMid: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyMetaText: { fontSize: 12, fontWeight: '300' },
  historyCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyViolations: { fontSize: 13, fontWeight: '400' },
  emptyTitle: { fontSize: 18, fontWeight: '300', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, fontWeight: '300', textAlign: 'center' },
  breakdownTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginTop: 8, marginBottom: 10 },
  violationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  violationRowName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  violationRowDate: { fontSize: 12, fontWeight: '300' },
  violationCounts: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  violationBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  violationBadgeText: { fontSize: 13, fontWeight: '400' },
  violationTotal: { fontSize: 18, fontWeight: '300', marginLeft: 4 },
  // Modal
  modalContainer: { flex: 1, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '500' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  modalContent: { padding: 20, paddingBottom: 48 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  statusBannerText: { fontSize: 14, fontWeight: '500' },
  detailSectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  detailGrid: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  detailDivider: { width: 1, marginVertical: 12 },
  detailCard: { borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 20 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  detailRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailRowLabel: { fontSize: 15, fontWeight: '400' },
  detailRowSubLabel: { fontSize: 13, fontWeight: '300' },
  detailRowValue: { fontSize: 22, fontWeight: '200' },
  detailRowSubValue: { fontSize: 17, fontWeight: '200' },
  rowSeparator: { height: 1, marginHorizontal: 12 },
  noViolations: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  noViolationsText: { fontSize: 13, fontWeight: '300' },
  cancelReason: { fontSize: 14, fontWeight: '300', lineHeight: 20, padding: 12 },
});

const statStyles = StyleSheet.create({
  card: {
    width: '47%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'flex-start',
  },
  value: { fontSize: 22, fontWeight: '300', marginBottom: 2 },
  label: { fontSize: 12, fontWeight: '300' },
});

const detailStyles = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', padding: 16 },
  cellValue: { fontSize: 17, fontWeight: '400', marginBottom: 4 },
  cellLabel: { fontSize: 11, fontWeight: '300' },
});
