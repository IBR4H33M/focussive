// ============================================================
// Focussive Mobile — Stats Screen
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
  Platform,
} from 'react-native';
import { useTheme } from '@/utils/theme';
import { historyApi } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDuration, formatTime } from '@focussive/shared';
import type { SessionHistory } from '@focussive/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 5 minutes of distracted time counted per violation (allow-anyway press)
const DISTRACTED_MINS_PER_VIOLATION = 5;

// ─── Period helpers ──────────────────────────────────────────
type PeriodKey = 'day' | 'week' | 'month' | 'year' | 'custom';

interface Period {
  key: PeriodKey;
  label: string;
}

const PERIODS: Period[] = [
  { key: 'day',   label: 'Yesterday' },
  { key: 'week',  label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
  { key: 'year',  label: 'Last year' },
  { key: 'custom', label: 'Custom' },
];

function getDateRange(period: PeriodKey, customDays: number): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(0, 0, 0, 0); // start of today (exclusive — we always exclude today)

  const from = new Date(to);
  switch (period) {
    case 'day':   from.setDate(from.getDate() - 1); break;
    case 'week':  from.setDate(from.getDate() - 7); break;
    case 'month': from.setDate(from.getDate() - 30); break;
    case 'year':  from.setDate(from.getDate() - 365); break;
    case 'custom': from.setDate(from.getDate() - Math.max(1, customDays)); break;
  }
  return { from, to };
}

function filterByPeriod(history: SessionHistory[], period: PeriodKey, customDays: number): SessionHistory[] {
  const { from, to } = getDateRange(period, customDays);
  return history.filter(h => {
    const d = new Date(h.created_at);
    return d >= from && d < to;
  });
}

// ─── Sections ───────────────────────────────────────────────
const SECTIONS = ['Overview', 'History'];

// ─── Main Component ──────────────────────────────────────────
export default function StatsScreen() {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const indicatorAnim = useRef(new Animated.Value(0)).current;

  const [activeSection, setActiveSection] = useState(0);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail modal
  const [selectedEntry, setSelectedEntry] = useState<(SessionHistory & { violations?: any[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);

  // Period filter
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('week');
  const [periodDropdownVisible, setPeriodDropdownVisible] = useState(false);
  const [customDays, setCustomDays] = useState(14);
  const [customInputVisible, setCustomInputVisible] = useState(false);
  const [customInput, setCustomInput] = useState('14');

  const fetchHistory = useCallback(async () => {
    try {
      const response = await historyApi.getAll(1, 200);
      setHistory(response.data as SessionHistory[]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  function goToSection(index: number) {
    setActiveSection(index);
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    Animated.spring(indicatorAnim, { toValue: index, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }

  function onScrollEnd(e: any) {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== activeSection) {
      setActiveSection(index);
      Animated.spring(indicatorAnim, { toValue: index, useNativeDriver: true, tension: 80, friction: 12 }).start();
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

  function selectPeriod(key: PeriodKey) {
    setActivePeriod(key);
    setPeriodDropdownVisible(false);
    if (key === 'custom') setCustomInputVisible(true);
  }

  // ─── Filtered data ───────────────────────────────────────
  const filtered = filterByPeriod(history, activePeriod, customDays);
  const completedOnly = filtered.filter(h => h.status === 'completed');

  const totalFocusMinutes = completedOnly.reduce((a, h) => a + (h.actual_duration ?? h.scheduled_duration ?? 0), 0);
  const totalSessions = filtered.length;
  const totalViolations = filtered.reduce((a, h) => a + (h.violations_count ?? 0), 0);
  const totalAppViolations = filtered.reduce((a, h) => a + ((h as any).app_violations_count ?? 0), 0);
  const totalWebViolations = filtered.reduce((a, h) => a + ((h as any).web_violations_count ?? 0), 0);

  const distractedMinutes = totalViolations * DISTRACTED_MINS_PER_VIOLATION;
  const focusedMinutes = Math.max(0, totalFocusMinutes - distractedMinutes);
  const focusPct = totalFocusMinutes > 0 ? Math.round((focusedMinutes / totalFocusMinutes) * 100) : 100;

  const periodLabel = PERIODS.find(p => p.key === activePeriod)?.label ?? 'Custom';

  // ─── Overview ────────────────────────────────────────────
  function renderOverview() {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sectionContent} showsVerticalScrollIndicator={false}>

        {/* Period Selector */}
        <TouchableOpacity
          style={[styles.periodBtn, { backgroundColor: theme.card }]}
          onPress={() => setPeriodDropdownVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.periodBtnText, { color: theme.text }]}>{periodLabel}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Total Focus Time — hero */}
        <View style={styles.heroBlock}>
          <Text style={[styles.heroNumber, { color: theme.text }]}>{formatDuration(totalFocusMinutes)}</Text>
          <Text style={[styles.heroLabel, { color: theme.textSecondary }]}>Total Focus Time</Text>
        </View>

        {/* Row: sessions + violations */}
        <View style={styles.statRow}>
          <View style={[styles.statBox, { backgroundColor: theme.card }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{totalSessions}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Sessions</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: theme.card }]}>
            <Text style={[styles.statValue, { color: totalViolations > 0 ? theme.danger : theme.text }]}>{totalViolations}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Violations</Text>
            {totalViolations > 0 && (
              <View style={styles.violationSubRow}>
                <View style={styles.violationSubItem}>
                  <Ionicons name="phone-portrait-outline" size={11} color={theme.textSecondary} />
                  <Text style={[styles.violationSubText, { color: theme.textSecondary }]}>{totalAppViolations}</Text>
                </View>
                <View style={styles.violationSubItem}>
                  <Ionicons name="globe-outline" size={11} color={theme.textSecondary} />
                  <Text style={[styles.violationSubText, { color: theme.textSecondary }]}>{totalWebViolations}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Focus vs Distracted Bar */}
        {totalFocusMinutes > 0 && (
          <View style={[styles.barSection, { backgroundColor: theme.card }]}>
            <Text style={[styles.barTitle, { color: theme.textSecondary }]}>FOCUS BREAKDOWN</Text>

            {/* Bar */}
            <View style={styles.barTrack}>
              {/* Focused portion */}
              <View
                style={[
                  styles.barFill,
                  {
                    flex: focusedMinutes,
                    backgroundColor: theme.accent,
                    borderTopLeftRadius: 6,
                    borderBottomLeftRadius: 6,
                    borderTopRightRadius: distractedMinutes === 0 ? 6 : 0,
                    borderBottomRightRadius: distractedMinutes === 0 ? 6 : 0,
                  },
                ]}
              />
              {/* Distracted portion */}
              {distractedMinutes > 0 && (
                <View
                  style={[
                    styles.barFill,
                    {
                      flex: Math.min(distractedMinutes, totalFocusMinutes),
                      backgroundColor: theme.danger,
                      borderTopRightRadius: 6,
                      borderBottomRightRadius: 6,
                    },
                  ]}
                />
              )}
            </View>

            {/* Legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                  Focused — {formatDuration(focusedMinutes)}
                </Text>
              </View>
              {distractedMinutes > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: theme.danger }]} />
                  <Text style={[styles.legendText, { color: theme.textSecondary }]}>
                    Distracted — {formatDuration(Math.min(distractedMinutes, totalFocusMinutes))}
                  </Text>
                </View>
              )}
            </View>

            {/* Percentage */}
            <View style={[styles.focusPctRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.focusPctLabel, { color: theme.textSecondary }]}>Focus score</Text>
              <Text style={[styles.focusPct, { color: focusPct >= 80 ? theme.accent : focusPct >= 50 ? '#F0A500' : theme.danger }]}>
                {focusPct}%
              </Text>
            </View>
          </View>
        )}

        {filtered.length === 0 && !loading && (
          <View style={styles.emptyBlock}>
            <Ionicons name="bar-chart-outline" size={44} color={theme.textSecondary} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No data for this period</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>Try selecting a wider range</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ─── History ─────────────────────────────────────────────
  function renderHistory() {
    if (loading) {
      return <View style={styles.centered}><ActivityIndicator size="large" color={theme.accent} /></View>;
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
              style={[styles.historyCard, { backgroundColor: theme.card }]}
              onPress={() => openDetail(item)}
              activeOpacity={0.7}
            >
              <View style={styles.historyCardTop}>
                <Text style={[styles.historyName, { color: theme.text }]} numberOfLines={1}>
                  {item.session_name}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: isCancelled ? theme.dangerBg : theme.accent + '22' }]}>
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
                <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  // ─── Tab indicator ───────────────────────────────────────
  const indicatorTranslateX = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_WIDTH / 2],
  });

  // ─── Render ──────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* Section Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        {SECTIONS.map((s, i) => (
          <TouchableOpacity key={s} style={styles.tabItem} onPress={() => goToSection(i)}>
            <Text style={[styles.tabText, { color: activeSection === i ? theme.accent : theme.textSecondary }]}>{s}</Text>
          </TouchableOpacity>
        ))}
        <Animated.View
          style={[
            styles.tabIndicator,
            { backgroundColor: theme.accent, width: SCREEN_WIDTH / 2 },
            { transform: [{ translateX: indicatorTranslateX }] },
          ]}
        />
      </View>

      {/* Horizontal pager */}
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
      </ScrollView>

      {/* ── Period Dropdown Modal ── */}
      <Modal
        visible={periodDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodDropdownVisible(false)}
      >
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPress={() => setPeriodDropdownVisible(false)}>
          <View style={[styles.dropdown, { backgroundColor: theme.card }]}>
            <Text style={[styles.dropdownTitle, { color: theme.textSecondary }]}>SELECT PERIOD</Text>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.dropdownItem, activePeriod === p.key && { backgroundColor: theme.accent + '18' }]}
                onPress={() => selectPeriod(p.key)}
              >
                <Text style={[styles.dropdownItemText, { color: activePeriod === p.key ? theme.accent : theme.text }]}>
                  {p.label}
                </Text>
                {activePeriod === p.key && <Ionicons name="checkmark" size={16} color={theme.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Custom Days Modal ── */}
      <Modal
        visible={customInputVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomInputVisible(false)}
      >
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPress={() => setCustomInputVisible(false)}>
          <View style={[styles.dropdown, { backgroundColor: theme.card }]}>
            <Text style={[styles.dropdownTitle, { color: theme.textSecondary }]}>CUSTOM RANGE</Text>
            <Text style={[styles.dropdownSubtitle, { color: theme.textSecondary }]}>Show last N days (excluding today)</Text>

            {/* Preset options */}
            {[7, 14, 30, 60, 90].map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.dropdownItem, customDays === d && { backgroundColor: theme.accent + '18' }]}
                onPress={() => { setCustomDays(d); setCustomInput(String(d)); setCustomInputVisible(false); }}
              >
                <Text style={[styles.dropdownItemText, { color: customDays === d ? theme.accent : theme.text }]}>
                  Last {d} days
                </Text>
                {customDays === d && <Ionicons name="checkmark" size={16} color={theme.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal
        visible={detailVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
              {selectedEntry?.session_name ?? '...'}
            </Text>
            <TouchableOpacity
              onPress={() => setDetailVisible(false)}
              style={[styles.closeBtn, { backgroundColor: theme.surface }]}
            >
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {detailLoading ? (
            <View style={styles.centered}><ActivityIndicator size="large" color={theme.accent} /></View>
          ) : selectedEntry ? (
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>

              {/* Status banner */}
              <View style={[styles.statusBanner, {
                backgroundColor: selectedEntry.status === 'cancelled' ? theme.dangerBg : theme.accent + '18'
              }]}>
                <Ionicons
                  name={selectedEntry.status === 'cancelled' ? 'close-circle-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color={selectedEntry.status === 'cancelled' ? theme.danger : theme.accent}
                />
                <Text style={[styles.statusBannerText, {
                  color: selectedEntry.status === 'cancelled' ? theme.danger : theme.accent
                }]}>
                  {selectedEntry.status === 'cancelled' ? 'Session Cancelled' : 'Session Completed'}
                </Text>
              </View>

              {/* Duration */}
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>DURATION</Text>
              <View style={[styles.detailGrid, { backgroundColor: theme.card }]}>
                <DetailCell label="Actual" value={formatDuration(selectedEntry.actual_duration ?? selectedEntry.scheduled_duration)} theme={theme} />
                <View style={[styles.detailDivider, { backgroundColor: theme.border }]} />
                <DetailCell label="Scheduled" value={formatDuration(selectedEntry.scheduled_duration)} theme={theme} />
                <View style={[styles.detailDivider, { backgroundColor: theme.border }]} />
                <DetailCell label="Start" value={formatTime(selectedEntry.start_time)} theme={theme} />
              </View>

              {/* Violations */}
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>VIOLATIONS</Text>
              <View style={[styles.detailCard, { backgroundColor: theme.card }]}>
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
                    <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
                    <View style={styles.detailRow}>
                      <View style={styles.detailRowLeft}>
                        <Ionicons name="phone-portrait-outline" size={17} color={theme.textSecondary} />
                        <Text style={[styles.detailRowSubLabel, { color: theme.textSecondary }]}>Mobile Apps</Text>
                      </View>
                      <Text style={[styles.detailRowSubValue, { color: ((selectedEntry as any).app_violations_count ?? 0) > 0 ? theme.danger : theme.textSecondary }]}>
                        {(selectedEntry as any).app_violations_count ?? 0}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <View style={styles.detailRowLeft}>
                        <Ionicons name="globe-outline" size={17} color={theme.textSecondary} />
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
                    <Ionicons name="checkmark-circle" size={26} color={theme.accent} />
                    <Text style={[styles.noViolationsText, { color: theme.textSecondary }]}>No violations — great work!</Text>
                  </View>
                )}
              </View>

              {/* Pauses */}
              {((selectedEntry as any).pause_count ?? 0) > 0 && (
                <>
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>PAUSES</Text>
                  <View style={[styles.detailCard, { backgroundColor: theme.card }]}>
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
                  <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>REASON</Text>
                  <View style={[styles.detailCard, { backgroundColor: theme.card }]}>
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

// ─── Sub-components ──────────────────────────────────────────

function DetailCell({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={dcStyles.cell}>
      <Text style={[dcStyles.value, { color: theme.text }]}>{value}</Text>
      <Text style={[dcStyles.label, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },

  // Tabs
  tabBar: { flexDirection: 'row', height: 46, borderBottomWidth: StyleSheet.hairlineWidth, position: 'relative' },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '500', letterSpacing: 0.4 },
  tabIndicator: { position: 'absolute', bottom: 0, height: 2, borderRadius: 1 },

  sectionContent: { padding: 16, paddingBottom: 48 },

  // Period selector
  periodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  periodBtnText: { fontSize: 14, fontWeight: '500' },

  // Hero
  heroBlock: { alignItems: 'flex-start', marginBottom: 24 },
  heroNumber: { fontSize: 48, fontWeight: '200', letterSpacing: -1.5 },
  heroLabel: { fontSize: 13, fontWeight: '300', marginTop: 2 },

  // Stats row
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statBox: { flex: 1, borderRadius: 14, padding: 16 },
  statValue: { fontSize: 28, fontWeight: '300', marginBottom: 2 },
  statLabel: { fontSize: 12, fontWeight: '300' },
  violationSubRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  violationSubItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  violationSubText: { fontSize: 12, fontWeight: '300' },

  // Focus bar
  barSection: { borderRadius: 14, padding: 18, marginBottom: 24 },
  barTitle: { fontSize: 10, fontWeight: '600', letterSpacing: 1.5, marginBottom: 14 },
  barTrack: { flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 16 },
  barFill: { height: '100%' },
  legendRow: { gap: 8, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, fontWeight: '300' },
  focusPctRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  focusPctLabel: { fontSize: 13, fontWeight: '300' },
  focusPct: { fontSize: 26, fontWeight: '300' },

  emptyBlock: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '300' },
  emptySubtitle: { fontSize: 13, fontWeight: '300' },

  // History cards
  historyCard: { borderRadius: 12, padding: 14, marginBottom: 10 },
  historyCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyName: { fontSize: 15, fontWeight: '500', flex: 1, marginRight: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  historyCardMid: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyMetaText: { fontSize: 12, fontWeight: '300' },
  historyCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyViolations: { fontSize: 13, fontWeight: '400' },

  // Dropdown
  dropdownBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  dropdown: { width: '100%', borderRadius: 16, overflow: 'hidden', paddingVertical: 8 },
  dropdownTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, paddingHorizontal: 18, paddingVertical: 10 },
  dropdownSubtitle: { fontSize: 12, fontWeight: '300', paddingHorizontal: 18, marginBottom: 4 },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  dropdownItemText: { fontSize: 15, fontWeight: '400' },

  // Detail modal
  modalContainer: { flex: 1, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, gap: 12 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '500' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  modalContent: { padding: 20, paddingBottom: 48 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 20 },
  statusBannerText: { fontSize: 14, fontWeight: '500' },
  detailLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  detailGrid: { flexDirection: 'row', borderRadius: 12, marginBottom: 20 },
  detailDivider: { width: StyleSheet.hairlineWidth, marginVertical: 12 },
  detailCard: { borderRadius: 12, paddingVertical: 4, marginBottom: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  detailRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailRowLabel: { fontSize: 15, fontWeight: '400' },
  detailRowSubLabel: { fontSize: 13, fontWeight: '300' },
  detailRowValue: { fontSize: 22, fontWeight: '200' },
  detailRowSubValue: { fontSize: 17, fontWeight: '200' },
  rowDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  noViolations: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  noViolationsText: { fontSize: 13, fontWeight: '300' },
  cancelReason: { fontSize: 14, fontWeight: '300', lineHeight: 20, padding: 14 },
});

const dcStyles = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', padding: 16 },
  value: { fontSize: 16, fontWeight: '400', marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '300' },
});
