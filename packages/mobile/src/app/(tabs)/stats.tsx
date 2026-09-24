// ============================================================
// Focussive Mobile — Stats Screen
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Image,
  Alert,
} from 'react-native';
import { useTheme, useIsDark } from '@/utils/theme';
import { historyApi, userApi, appGroupApi } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDuration, formatTime } from '@focussive/shared';
import type { SessionHistory, AppGroup } from '@focussive/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  QUALITY_TIERS,
  type QualityTierKey,
  type QualityTierInfo,
  TIER_HERO_BADGES,
  TIER_LIST_BADGES,
  MILESTONE_BADGES,
  type MilestoneKey,
  evaluateMilestones,
  calculateLongestCleanStreak,
  getSelectedArchetype,
  setSelectedArchetype,
  getEarnedTierCounts,
} from '@/utils/gamification';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 5 minutes of distracted time counted per violation (allow-anyway press)
const DISTRACTED_MINS_PER_VIOLATION = 5;

// ─── Period helpers ──────────────────────────────────────────
type PeriodKey = 'week' | 'month' | 'year' | 'custom';

interface Period {
  key: PeriodKey;
  label: string;
}

const nowRef = new Date();
const currentMonthName = nowRef.toLocaleString('en-US', { month: 'long' });
const currentYear = nowRef.getFullYear();

const PERIODS: Period[] = [
  { key: 'week',   label: 'Last 7 days' },
  { key: 'month',  label: `${currentMonthName} ${currentYear}` },
  { key: 'year',   label: 'Last 1 year' },
  { key: 'custom', label: 'Custom' },
];

function getDateRange(period: PeriodKey, customDays: number): { from: Date; to: Date } {
  const today = new Date();
  // Yesterday end-of-day (23:59:59.999) — rolling range starts from previous day
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 23, 59, 59, 999);

  const from = new Date(to);
  switch (period) {
    case 'week': {
      // 7 days ending at yesterday (inclusive)
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'month': {
      // Current month up to yesterday
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'year': {
      // 1 year ending at yesterday (e.g. Sep 19 2025 to Sep 20 2026)
      from.setFullYear(from.getFullYear() - 1);
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case 'custom': {
      from.setDate(from.getDate() - Math.max(1, customDays) + 1);
      from.setHours(0, 0, 0, 0);
      break;
    }
  }
  return { from, to };
}

function getPeriodSectionTitle(key: PeriodKey): string {
  switch (key) {
    case 'week':   return 'Last 7 days stats';
    case 'month':  return `${currentMonthName} ${currentYear} stats`;
    case 'year':   return 'Last 1 year stats';
    case 'custom': return 'Custom stats';
  }
}

function filterByPeriod(history: SessionHistory[], period: PeriodKey, customDays: number): SessionHistory[] {
  const { from, to } = getDateRange(period, customDays);
  return history.filter(h => {
    const d = new Date(h.created_at);
    return d >= from && d <= to;
  });
}

// ─── Sections ───────────────────────────────────────────────
const SECTIONS = ['Overview', 'Milestones', 'History'];

// ─── Main Component ──────────────────────────────────────────
export default function StatsScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const { isPremium, openPaywall } = useSubscription();

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

  // Profile & avatar state
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  // App Groups & Gamification state
  const [appGroups, setAppGroups] = useState<AppGroup[]>([]);
  const [selectedArchetype, setSelectedArchetypeState] = useState<string | null>(null);
  const [tierCounts, setTierCounts] = useState<Record<QualityTierKey, number>>({
    legendary: 0,
    epic: 0,
    rare: 0,
    uncommon: 0,
    common: 0,
  });
  const [archetypeModalVisible, setArchetypeModalVisible] = useState(false);
  const [selectedTierDetail, setSelectedTierDetail] = useState<QualityTierInfo | null>(null);

  useEffect(() => {
    userApi.getProfile().then(p => {
      setProfile(p);
      if (p.active_archetype) {
        setSelectedArchetypeState(p.active_archetype as string);
        setSelectedArchetype(p.active_archetype as string).catch(() => {});
      }
    }).catch(() => {});
    appGroupApi.getAll().then(res => setAppGroups((res.data as AppGroup[]) || [])).catch(() => {});
    getSelectedArchetype().then(a => {
      if (a) setSelectedArchetypeState(a);
    });
  }, []);

  // Sync tier counts whenever history updates
  useEffect(() => {
    if (history.length > 0) {
      getEarnedTierCounts(history).then(counts => setTierCounts(counts));
    }
  }, [history]);

  // Milestone evaluations
  const milestones = useMemo(() => evaluateMilestones(history, appGroups), [history, appGroups]);

  // Milestone nearest to completion
  const nearestMilestone = useMemo(() => {
    const list = Object.values(milestones);
    const unearned = list.filter(m => !m.isUnlocked);
    if (unearned.length > 0) {
      unearned.sort((a, b) => {
        const ratioA = a.target > 0 ? a.current / a.target : 0;
        const ratioB = b.target > 0 ? b.current / b.target : 0;
        return ratioB - ratioA;
      });
      return unearned[0];
    }
    return list[0] || null;
  }, [milestones]);

  const totalBadgesEarned = useMemo(() => {
    const milestoneCount = Object.values(milestones).filter(m => m.isUnlocked).length;
    const tierCount = Object.values(tierCounts).reduce((acc, count) => acc + (count > 0 ? 1 : 0), 0);
    return milestoneCount + tierCount;
  }, [milestones, tierCounts]);

  async function handleEquipArchetype(badgeTitle: string) {
    setSelectedArchetypeState(badgeTitle);
    await setSelectedArchetype(badgeTitle);
    userApi.updateProfile({ active_archetype: badgeTitle }).catch(() => {});
    setArchetypeModalVisible(false);
  }

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
    if (!isPremium && (key === 'month' || key === 'year')) {
      setPeriodDropdownVisible(false);
      openPaywall('history_limit');
      return;
    }
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
    const cleanStreak = calculateLongestCleanStreak(filtered);
    const focusHours = Math.floor(totalFocusMinutes / 60);
    const focusMins = totalFocusMinutes % 60;
    const formattedFocusTime = `${focusHours}h ${focusMins.toString().padStart(2, '0')}m`;

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sectionContent} showsVerticalScrollIndicator={false}>

        {/* Profile Header without container */}
        <View style={styles.cleanProfileRow}>
          <View style={styles.avatarTouchable}>
            {(profile?.avatar_url || user?.avatar_url) ? (
              <Image
                source={{ uri: profile?.avatar_url || user?.avatar_url }}
                style={styles.profileAvatar}
              />
            ) : (
              <View style={[styles.profileAvatar, { backgroundColor: theme.accent }]}>
                <Text style={styles.profileAvatarText}>
                  {(profile?.name || user?.name || 'U')[0]?.toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.profileInfoCol}>
            <Text style={[styles.profileNameText, { color: theme.text }]} numberOfLines={1}>
              {profile?.name || user?.name || 'Focus User'}
            </Text>

            {/* Archetype title under profile name */}
            <TouchableOpacity
              style={[
                styles.archetypePill,
                {
                  backgroundColor: selectedArchetype ? `${theme.accent}20` : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                },
              ]}
              onPress={() => setArchetypeModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.archetypePillText,
                  { color: selectedArchetype ? theme.accent : theme.textSecondary },
                ]}
              >
                {selectedArchetype || 'Select Archetype'}
              </Text>
              <Ionicons name="chevron-forward" size={12} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Earned Badges Section ── */}
        <View style={styles.badgesSectionContainer}>
          <View style={styles.badgesSectionHeader}>
            <Text style={[styles.badgesSectionTitle, { color: theme.text }]}>
              Earned badges
            </Text>
          </View>

          {/* Session Quality Tiers */}
          <Text style={[styles.badgeSubheading, { color: theme.textSecondary }]}>
            SESSION QUALITY TIERS
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tiersScrollRow}
          >
            {Object.values(QUALITY_TIERS).map(tier => {
              const count = tierCounts[tier.key] || 0;
              return (
                <TouchableOpacity
                  key={tier.key}
                  style={[
                    styles.tierCard,
                    {
                      opacity: count > 0 ? 1 : 0.45,
                    },
                  ]}
                  onPress={() => setSelectedTierDetail(tier)}
                  activeOpacity={0.7}
                >
                  <View style={styles.tierIconBox}>
                    <Image
                      source={tier.heroImage || TIER_HERO_BADGES[tier.key]}
                      style={styles.tierIconImage}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={[styles.tierCardTitle, { color: theme.text }]}>
                    {tier.name}
                  </Text>
                  <Text style={[styles.tierCountText, { color: count > 0 ? theme.text : theme.textSecondary }]}>
                    {count > 0 ? `×${count}` : '0'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Milestone Progression Section (Nearest to completion) ── */}
        {nearestMilestone && (
          <View style={styles.progressionSection}>
            <View style={styles.progressionHeaderRow}>
              <Text style={[styles.badgeSubheading, { color: theme.textSecondary, marginBottom: 0 }]}>
                MILESTONE PROGRESSION
              </Text>
              <TouchableOpacity
                onPress={() => goToSection(1)}
                style={styles.viewAllMilestonesBtn}
                activeOpacity={0.7}
              >
                <Text style={[styles.viewAllMilestonesText, { color: theme.accent }]}>
                  View all
                </Text>
                <Ionicons name="arrow-forward" size={13} color={theme.accent} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.progressionCard, { backgroundColor: theme.card }]}
              onPress={() => goToSection(1)}
              activeOpacity={0.8}
            >
              <View style={styles.progressionTopRow}>
                <View
                  style={[
                    styles.milestoneIconBox,
                    { backgroundColor: `${nearestMilestone.badge.color}20` },
                  ]}
                >
                  <Ionicons
                    name={nearestMilestone.badge.icon as any}
                    size={22}
                    color={nearestMilestone.badge.color}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.progressionTitleRow}>
                    <Text style={[styles.progressionTitle, { color: theme.text }]}>
                      {nearestMilestone.badge.title}
                    </Text>
                    <View
                      style={[
                        styles.progressionPctBadge,
                        { backgroundColor: `${nearestMilestone.badge.color}20` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.progressionPctText,
                          { color: nearestMilestone.badge.color },
                        ]}
                      >
                        {nearestMilestone.isUnlocked
                          ? 'Earned'
                          : `${Math.round(
                              Math.min(
                                100,
                                (nearestMilestone.current / nearestMilestone.target) * 100
                              )
                            )}%`}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.progressionQuote, { color: theme.textSecondary }]}>
                    {nearestMilestone.badge.quote}
                  </Text>
                </View>
              </View>

              <Text style={[styles.progressionRequirement, { color: theme.textSecondary }]}>
                {nearestMilestone.badge.requirement}
              </Text>

              {/* Progress Bar */}
              <View style={{ gap: 6, marginTop: 4 }}>
                <View
                  style={[
                    styles.progressBarBg,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.06)',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(
                          100,
                          Math.max(
                            nearestMilestone.isUnlocked ? 100 : 4,
                            (nearestMilestone.current / nearestMilestone.target) * 100
                          )
                        )}%`,
                        backgroundColor: nearestMilestone.badge.color,
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressionStatsRow}>
                  <Text style={[styles.progressionDetailText, { color: theme.textSecondary }]}>
                    {nearestMilestone.isUnlocked
                      ? 'Completed & Ready to equip as Archetype'
                      : `${nearestMilestone.target - nearestMilestone.current} needed to unlock`}
                  </Text>
                  <Text style={[styles.progressionRatioText, { color: theme.text }]}>
                    {nearestMilestone.current} / {nearestMilestone.target}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Period Stats Section ── */}
        <View style={styles.periodStatsSection}>
          <View style={styles.periodHeaderRow}>
            <Text style={[styles.periodSectionTitle, { color: theme.text }]}>
              {getPeriodSectionTitle(activePeriod)}
            </Text>
            <TouchableOpacity
              style={[styles.periodBtnClean, { backgroundColor: theme.card }]}
              onPress={() => setPeriodDropdownVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodBtnText, { color: theme.text }]}>{periodLabel}</Text>
              <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* 4 Requested Metrics Grid (Borderless) */}
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={styles.metricIconRow}>
                <Ionicons name="checkmark-done-circle-outline" size={17} color={theme.accent} />
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Sessions completed</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>{completedOnly.length}</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={styles.metricIconRow}>
                <Ionicons name="time-outline" size={17} color="#3B82F6" />
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Hours focused</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>{formattedFocusTime}</Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={styles.metricIconRow}>
                <Ionicons name="shield-outline" size={17} color={totalViolations > 0 ? theme.danger : '#10B981'} />
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Distraction attempts</Text>
              </View>
              <Text style={[styles.metricValue, { color: totalViolations > 0 ? theme.danger : theme.text }]}>
                {totalViolations} blocked
              </Text>
            </View>

            <View style={[styles.metricCard, { backgroundColor: theme.card }]}>
              <View style={styles.metricIconRow}>
                <Ionicons name="flame-outline" size={17} color="#F59E0B" />
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Longest clean streak</Text>
              </View>
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {cleanStreak} session{cleanStreak !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {/* Focus vs Distracted Bar */}
          {totalFocusMinutes > 0 && (
            <View style={[styles.barSection, { backgroundColor: theme.card }]}>
              <Text style={[styles.barTitle, { color: theme.textSecondary }]}>FOCUS BREAKDOWN</Text>
              <View style={styles.barTrack}>
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
        </View>
      </ScrollView>
    );
  }

  // ─── Milestones Tab ───────────────────────────────────────
  function renderMilestones() {
    const unlockedCount = Object.values(milestones).filter(m => m.isUnlocked).length;
    const totalCount = Object.keys(milestones).length;

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.sectionContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Summary */}
        <View style={styles.milestonesHeaderBox}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.milestonesHeaderTitle, { color: theme.text }]}>
              Collectible Milestones
            </Text>
            <Text style={[styles.milestonesHeaderSubtitle, { color: theme.textSecondary }]}>
              Complete specific focus challenges to unlock and equip unique Archetypes.
            </Text>
          </View>
          <View style={styles.milestonesCountBox}>
            <Text style={[styles.milestonesCountNumber, { color: theme.accent }]}>
              {unlockedCount}/{totalCount}
            </Text>
            <Text style={[styles.milestonesCountLabel, { color: theme.textSecondary }]}>
              Earned
            </Text>
          </View>
        </View>

        {/* Milestone Qualification Notice */}
        <View
          style={[
            styles.qualificationNotice,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' },
          ]}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.accent} />
          <Text style={[styles.qualificationNoticeText, { color: theme.textSecondary }]}>
            Sessions qualify when blocking ≥3 apps total and ≥2 of your top 4 most used apps.
          </Text>
        </View>

        {/* Milestone Cards List (Containers without borders) */}
        <View style={styles.milestonesList}>
          {Object.entries(milestones).map(([key, item]) => {
            const isEquipped = selectedArchetype === item.badge.title;
            return (
              <View
                key={key}
                style={[
                  styles.milestoneCard,
                  {
                    backgroundColor: theme.card,
                    borderWidth: 0,
                  },
                ]}
              >
                <View style={styles.milestoneTopRow}>
                  <View
                    style={[
                      styles.milestoneIconBox,
                      { backgroundColor: `${item.badge.color}20` },
                    ]}
                  >
                    <Ionicons
                      name={item.badge.icon as any}
                      size={20}
                      color={item.badge.color}
                    />
                  </View>
                  <View style={styles.milestoneInfo}>
                    <View style={styles.milestoneTitleRow}>
                      <Text style={[styles.milestoneTitle, { color: theme.text }]}>
                        {item.badge.title}
                      </Text>
                      {item.isUnlocked ? (
                        <View
                          style={[
                            styles.unlockedBadge,
                            { backgroundColor: '#10B98120' },
                          ]}
                        >
                          <Ionicons
                            name="checkmark-circle"
                            size={12}
                            color="#10B981"
                          />
                          <Text style={styles.unlockedBadgeText}>Earned</Text>
                        </View>
                      ) : (
                        <Text
                          style={[
                            styles.progressText,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {item.current} / {item.target}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.milestoneQuote,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {item.badge.quote}
                    </Text>
                    <Text
                      style={[
                        styles.milestoneReq,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {item.badge.requirement}
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View
                  style={[
                    styles.progressBarBg,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.06)',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(
                          100,
                          Math.max(
                            item.isUnlocked ? 100 : 2,
                            (item.current / item.target) * 100
                          )
                        )}%`,
                        backgroundColor: item.badge.color,
                      },
                    ]}
                  />
                </View>

                {/* Equip / status button if unlocked */}
                {item.isUnlocked && (
                  <TouchableOpacity
                    style={[
                      styles.equipBtn,
                      {
                        backgroundColor: isEquipped
                          ? `${item.badge.color}25`
                          : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                        borderWidth: 0,
                      },
                    ]}
                    onPress={() => handleEquipArchetype(item.badge.title)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isEquipped ? 'checkmark' : 'sparkles'}
                      size={14}
                      color={isEquipped ? item.badge.color : theme.text}
                    />
                    <Text
                      style={[
                        styles.equipBtnText,
                        { color: isEquipped ? item.badge.color : theme.text },
                      ]}
                    >
                      {isEquipped ? 'Active Archetype' : 'Set as Archetype'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
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
        ListHeaderComponent={
          !isPremium ? (
            <TouchableOpacity
              style={[
                styles.historyLimitBanner,
                {
                  backgroundColor: isDark ? 'rgba(139, 167, 148, 0.12)' : 'rgba(88, 112, 66, 0.08)',
                  borderColor: theme.border,
                },
              ]}
              onPress={() => openPaywall('history_limit')}
              activeOpacity={0.8}
            >
              <Ionicons name="time-outline" size={18} color={theme.accent} />
              <Text style={[styles.historyLimitText, { color: theme.text, flex: 1 }]}>
                Free tier shows last 3 weeks of history. Upgrade for unlimited lifetime records.
              </Text>
              <View style={[styles.historyUpgradePill, { backgroundColor: theme.accent }]}>
                <Text style={styles.historyUpgradePillText}>Upgrade</Text>
              </View>
            </TouchableOpacity>
          ) : null
        }
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

  // ─── Render ──────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Segmented Control: "Overview", "Milestones", and "History" */}
      <View style={[styles.topBarWrapper, { paddingTop: Math.max(insets.top + 16, 36) }]}>
        <View
          style={[
            styles.segmentContainer,
            {
              borderColor: theme.accent,
              backgroundColor: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.04)',
            },
          ]}
        >
          {SECTIONS.map((sectionName, index) => {
            const isSelected = activeSection === index;
            const isFirst = index === 0;
            const isLast = index === SECTIONS.length - 1;
            return (
              <TouchableOpacity
                key={sectionName}
                style={[
                  styles.segmentTab,
                  isFirst && styles.segmentTabLeft,
                  isLast && styles.segmentTabRight,
                  isSelected && {
                    backgroundColor: theme.accent,
                  },
                ]}
                onPress={() => goToSection(index)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: isSelected
                        ? (isDark ? '#2F3456' : '#FFFFFF')
                        : theme.accent,
                      fontWeight: isSelected ? '700' : '600',
                    },
                  ]}
                >
                  {sectionName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Tab Pages: No outer horizontal ScrollView gesture interference */}
      <View style={{ flex: 1 }}>
        {activeSection === 0 && renderOverview()}
        {activeSection === 1 && renderMilestones()}
        {activeSection === 2 && renderHistory()}
      </View>

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
            {PERIODS.map(p => {
              const isLocked = !isPremium && (p.key === 'month' || p.key === 'year');
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[
                    styles.dropdownItem,
                    activePeriod === p.key && { backgroundColor: theme.accent + '18' },
                    isLocked && { opacity: 0.8 },
                  ]}
                  onPress={() => selectPeriod(p.key)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.dropdownItemText, { color: activePeriod === p.key ? theme.accent : theme.text }]}>
                      {p.label}
                    </Text>
                    {isLocked && (
                      <View style={[styles.periodProBadge, { backgroundColor: theme.accent }]}>
                        <Text style={styles.periodProText}>PRO</Text>
                      </View>
                    )}
                  </View>
                  {activePeriod === p.key && <Ionicons name="checkmark" size={16} color={theme.accent} />}
                </TouchableOpacity>
              );
            })}
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
            {[7, 14, 30, 60, 90].map(d => {
              const isLocked = !isPremium && d > 21;
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.dropdownItem,
                    customDays === d && { backgroundColor: theme.accent + '18' },
                    isLocked && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    if (isLocked) {
                      setCustomInputVisible(false);
                      openPaywall('history_limit');
                      return;
                    }
                    setCustomDays(d);
                    setCustomInput(String(d));
                    setCustomInputVisible(false);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.dropdownItemText, { color: customDays === d ? theme.accent : theme.text }]}>
                      Last {d} days
                    </Text>
                    {isLocked && (
                      <View style={[styles.periodProBadge, { backgroundColor: theme.accent }]}>
                        <Text style={styles.periodProText}>PRO</Text>
                      </View>
                    )}
                  </View>
                  {customDays === d && <Ionicons name="checkmark" size={16} color={theme.accent} />}
                </TouchableOpacity>
              );
            })}
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

      {/* ── Archetype Selection Modal ── */}
      <Modal
        visible={archetypeModalVisible}
        transparent
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setArchetypeModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Select Archetype</Text>
            <TouchableOpacity
              onPress={() => setArchetypeModalVisible(false)}
              style={[styles.closeBtn, { backgroundColor: theme.surface }]}
            >
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.archetypeModalDesc, { color: theme.textSecondary }]}>
              Choose an earned milestone badge to display as your Archetype under your profile name.
            </Text>

            {Object.entries(milestones).map(([key, item]) => {
              const isEquipped = selectedArchetype === item.badge.title;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.archetypeOptionCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: isEquipped ? theme.accent : theme.border,
                      opacity: item.isUnlocked ? 1 : 0.6,
                    },
                  ]}
                  onPress={() => {
                    if (item.isUnlocked) {
                      handleEquipArchetype(item.badge.title);
                    }
                  }}
                  disabled={!item.isUnlocked}
                  activeOpacity={0.8}
                >
                  <View style={[styles.milestoneIconBox, { backgroundColor: `${item.badge.color}20` }]}>
                    <Ionicons name={item.badge.icon as any} size={20} color={item.badge.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.milestoneTitle, { color: theme.text }]}>{item.badge.title}</Text>
                      {item.isUnlocked ? (
                        !isEquipped ? (
                          <View style={[styles.unlockedBadge, { backgroundColor: '#10B98120' }]}>
                            <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                            <Text style={styles.unlockedBadgeText}>Unlocked</Text>
                          </View>
                        ) : null
                      ) : (
                        <Text style={[styles.progressText, { color: theme.textSecondary }]}>
                          {item.current} / {item.target}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.milestoneQuote, { color: theme.textSecondary }]}>
                      {item.badge.quote}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Quality Tier Detail Modal ── */}
      <Modal
        visible={!!selectedTierDetail}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTierDetail(null)}
      >
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedTierDetail(null)}
        >
          {selectedTierDetail && (
            <View
              style={[
                styles.tierDetailModalCard,
                {
                  backgroundColor: theme.card,
                  borderColor: selectedTierDetail.borderColor,
                },
              ]}
            >
              <View style={styles.tierIconBoxLarge}>
                <Image
                  source={selectedTierDetail.heroImage || TIER_HERO_BADGES[selectedTierDetail.key]}
                  style={styles.tierIconImageLarge}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.tierDetailTitle, { color: selectedTierDetail.color }]}>
                {selectedTierDetail.name.toUpperCase()} TIER
              </Text>
              <Text style={[styles.tierDetailTagline, { color: theme.text }]}>
                {selectedTierDetail.tagline}
              </Text>
              <Text style={[styles.tierDetailDesc, { color: theme.textSecondary }]}>
                {selectedTierDetail.description}
              </Text>
              <View style={[styles.tierDetailCountRow, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)' }]}>
                <Text style={[styles.tierDetailCountLabel, { color: theme.textSecondary }]}>Times Earned</Text>
                <Text style={[styles.tierDetailCountNum, { color: theme.text }]}>
                  {tierCounts[selectedTierDetail.key] || 0}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.tierDetailCloseBtn, { backgroundColor: selectedTierDetail.color }]}
                onPress={() => setSelectedTierDetail(null)}
              >
                <Text style={styles.tierDetailCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
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
  topBarWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 10,
    marginVertical: -2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabLeft: {
    marginLeft: -2,
    borderTopLeftRadius: 10.5,
    borderBottomLeftRadius: 10.5,
  },
  segmentTabRight: {
    marginRight: -2,
    borderTopRightRadius: 10.5,
    borderBottomRightRadius: 10.5,
  },
  segmentText: {
    fontSize: 14,
    letterSpacing: 0.3,
  },

  sectionContent: { padding: 16, paddingBottom: 48 },

  // Profile row without container
  cleanProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  avatarTouchable: {
    position: 'relative',
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
  },
  profileInfoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  profileNameText: {
    fontSize: 18,
    fontWeight: '700',
  },
  archetypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 0,
    alignSelf: 'flex-start',
  },
  archetypePillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Earned Badges Section
  badgesSectionContainer: {
    marginBottom: 24,
  },
  badgesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgesSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badgesCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgesCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeSubheading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  tiersScrollRow: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  tierCard: {
    width: 86,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  tierIconBox: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  tierIconImage: {
    width: 72,
    height: 72,
  },
  tierCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  tierCountText: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 1,
  },

  // Milestone Progression Section (Overview tab)
  progressionSection: {
    marginBottom: 24,
  },
  progressionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  viewAllMilestonesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllMilestonesText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressionCard: {
    borderRadius: 16,
    borderWidth: 0,
    padding: 16,
    gap: 12,
  },
  progressionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  progressionPctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  progressionPctText: {
    fontSize: 11,
    fontWeight: '800',
  },
  progressionQuote: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  progressionRequirement: {
    fontSize: 12,
    lineHeight: 16,
  },
  progressionStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressionDetailText: {
    fontSize: 11,
    fontWeight: '500',
  },
  progressionRatioText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Milestones Tab Styles
  milestonesHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  milestonesHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  milestonesHeaderSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  milestonesCountBox: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  milestonesCountNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  milestonesCountLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  qualificationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  qualificationNoticeText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },

  // Milestone Badges Cards (borderless containers)
  milestonesList: {
    gap: 12,
  },
  milestoneCard: {
    borderRadius: 16,
    borderWidth: 0, // Border removed!
    padding: 16,
    gap: 12,
  },
  milestoneTopRow: {
    flexDirection: 'row',
    gap: 12,
  },
  milestoneIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  milestoneTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  unlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unlockedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
  },
  milestoneQuote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  milestoneReq: {
    fontSize: 11,
    lineHeight: 15,
  },
  equipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 10,
    borderWidth: 0, // No thin border!
  },
  equipBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Period Stats Section
  periodStatsSection: {
    marginBottom: 24,
  },
  periodHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  periodSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  periodBtnClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 0, // No thin border!
  },
  periodBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // 4 Metrics Grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    borderRadius: 14,
    borderWidth: 0, // No thin border!
    padding: 14,
    gap: 6,
  },
  metricIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

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

  // Archetype & Tier Detail Modals
  archetypeModalDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  archetypeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
  },
  tierDetailModalCard: {
    width: SCREEN_WIDTH - 64,
    borderRadius: 20,
    borderWidth: 2,
    padding: 24,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  tierIconBoxLarge: {
    width: 76,
    height: 76,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  tierIconImageLarge: {
    width: 76,
    height: 76,
  },
  tierDetailTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  tierDetailTagline: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  tierDetailDesc: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  tierDetailCountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  tierDetailCountLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  tierDetailCountNum: {
    fontSize: 16,
    fontWeight: '800',
  },
  tierDetailCloseBtn: {
    width: '100%',
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierDetailCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

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
  historyLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    gap: 10,
  },
  historyLimitText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  historyUpgradePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  historyUpgradePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  periodProBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  periodProText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});

const dcStyles = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', padding: 16 },
  value: { fontSize: 16, fontWeight: '400', marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '300' },
});
