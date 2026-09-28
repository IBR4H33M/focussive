// ============================================================
// Focussive Mobile — Dashboard Screen
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSessions, markSessionAsSkipped } from '@/context/SessionContext';
import { cancelSessionNotification, stopMonitoring } from '@focussive/app-blocker';
import SessionCard from '@/components/SessionCard';
import { sessionApi, historyApi } from '@/utils/api';
import type { Session, SessionHistory } from '@focussive/shared';
import { sortByNextOccurrence, getNextSessionOccurrence, isSessionInActiveWindow } from '@focussive/shared';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { evaluateMilestones } from '@/utils/gamification';
import { useSubscription } from '@/context/SubscriptionContext';

export default function DashboardScreen() {
  const theme = useTheme();
  const isDark = useIsDark();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeSessions, upcomingSessions, allSessions, isLoading, refreshSessions } = useSessions();
  const { tier, isTrialActive, openPaywall, packages } = useSubscription();

  const isPro = tier === 'premium' || isTrialActive;
  const annualPkg = packages.find((p) => p.packageType === 'ANNUAL' || p.identifier.includes('annual'));
  const adPriceText = annualPkg?.product?.priceString
    ? `${annualPkg.product.priceString}/year`
    : '3 Weeks Free Trial';

  const [isSkippingUpcoming, setIsSkippingUpcoming] = useState(false);
  const [history, setHistory] = useState<SessionHistory[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await historyApi.getAll(1, 200);
      setHistory((response.data as SessionHistory[]) || []);
    } catch {
      // silently fail
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const milestones = useMemo(() => evaluateMilestones(history, []), [history]);

  const nearestMilestone = useMemo(() => {
    const list = Object.values(milestones);
    const unearned = list.filter((m) => !m.isUnlocked && m.current < m.target);
    if (unearned.length > 0) {
      unearned.sort((a, b) => {
        const ratioA = a.target > 0 ? a.current / a.target : 0;
        const ratioB = b.target > 0 ? b.current / b.target : 0;
        if (ratioB !== ratioA) {
          return ratioB - ratioA;
        }
        return (a.target - a.current) - (b.target - b.current);
      });
      return unearned[0];
    }
    return null;
  }, [milestones]);

  const now = new Date();
  const activeIds = new Set(activeSessions.map((s) => s.id));
  const pausedSessions = allSessions.filter((s) => s.status === 'paused');
  const pausedIds = new Set(pausedSessions.map((s) => s.id));

  // Determine effective active sessions (include any session currently in its active window)
  const windowActiveSessions = allSessions.filter(
    (s) =>
      !activeIds.has(s.id) &&
      !pausedIds.has(s.id) &&
      s.status !== 'completed' &&
      s.status !== 'cancelled' &&
      isSessionInActiveWindow(s, now)
  );
  const effectiveActiveSessions = [...activeSessions, ...windowActiveSessions];
  const effectiveActiveIds = new Set(effectiveActiveSessions.map((s) => s.id));

  // Candidates for upcoming/scheduled: all non-active, non-paused, non-completed sessions
  const candidates = allSessions.filter(
    (s) =>
      s.status !== 'completed' &&
      s.status !== 'cancelled' &&
      !effectiveActiveIds.has(s.id) &&
      !pausedIds.has(s.id) &&
      !isSessionInActiveWindow(s, now)
  );

  // Evaluate the next future occurrence for each candidate.
  // Sessions that have already finished today or whose single run was skipped return null and are excluded.
  const validUpcomingSessions = candidates
    .map((s) => ({ session: s, nextOccurrence: getNextSessionOccurrence(s, now) }))
    .filter((item): item is { session: Session; nextOccurrence: Date } => item.nextOccurrence !== null)
    .sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());

  // Pick the single closest upcoming session
  const nextUpcoming = validUpcomingSessions.length > 0 ? validUpcomingSessions[0] : null;
  const nextUpcomingSession = nextUpcoming ? nextUpcoming.session : null;
  const nextUpcomingOccurrence = nextUpcoming ? nextUpcoming.nextOccurrence : undefined;
  const nextUpcomingId = nextUpcomingSession?.id ?? null;

  // Remaining sessions scheduled within the next 24 hours (closest first, excluding nextUpcoming)
  const isWithinNext24Hours = (date: Date) => {
    const time = date.getTime();
    const nowTime = now.getTime();
    return time > nowTime && time <= nowTime + 24 * 60 * 60 * 1000;
  };

  const scheduledSessions = validUpcomingSessions
    .filter((item) => item.session.id !== nextUpcomingId && isWithinNext24Hours(item.nextOccurrence));



  async function handleSkipSession(session: Session) {
    try {
      setIsSkippingUpcoming(true);
      const status = await sessionApi.getSkipStatus();
      if (status && status.skips_remaining <= 0) {
        Alert.alert(
          'Skip Limit Reached',
          `You have used all ${status.monthly_skip_limit} skips for this month. You can adjust your limit in Settings > Preferences.`
        );
        setIsSkippingUpcoming(false);
        return;
      }

      const remainingText = status ? ` (${status.skips_remaining} skip${status.skips_remaining === 1 ? '' : 's'} left this month)` : '';
      const isActiveSession = session.status === 'active' || session.status === 'paused';
      const promptText = isActiveSession
        ? `This active session "${session.name}" will be ended and skipped${remainingText}.\n\nIt will not count as a violation and will resume automatically on its next scheduled occurrence.`
        : `This upcoming occurrence of "${session.name}" will be skipped${remainingText}.\n\nIt will resume automatically on its next scheduled occurrence.`;

      Alert.alert(
        'Skip this session?',
        promptText,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setIsSkippingUpcoming(false) },
          {
            text: 'Skip',
            style: 'destructive',
            onPress: async () => {
              try {
                markSessionAsSkipped(session.id);
                try {
                  cancelSessionNotification(1001);
                  stopMonitoring();
                } catch {}
                const res = await sessionApi.skip(session.id);
                const remainingAfter = res.skips_remaining !== undefined
                  ? ` (${res.skips_remaining} skip${res.skips_remaining === 1 ? '' : 's'} remaining this month)`
                  : '';
                Alert.alert('Session Skipped', `The session has been skipped${remainingAfter}.`);
                await refreshSessions();
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to skip session');
              } finally {
                setIsSkippingUpcoming(false);
              }
            },
          },
        ]
      );
    } catch {
      const isActiveSession = session.status === 'active' || session.status === 'paused';
      const promptText = isActiveSession
        ? `This active session "${session.name}" will be ended and skipped.\n\nIt will not count as a violation and will resume automatically on its next scheduled occurrence.`
        : `This upcoming occurrence of "${session.name}" will be skipped.\n\nIt will resume automatically on its next scheduled occurrence.`;

      Alert.alert(
        'Skip this session?',
        promptText,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => setIsSkippingUpcoming(false) },
          {
            text: 'Skip',
            style: 'destructive',
            onPress: async () => {
              try {
                markSessionAsSkipped(session.id);
                try {
                  cancelSessionNotification(1001);
                  stopMonitoring();
                } catch {}
                await sessionApi.skip(session.id);
                Alert.alert('Session Skipped', 'The session has been skipped.');
                await refreshSessions();
              } catch (err: any) {
                Alert.alert('Error', err.message || 'Failed to skip session');
              } finally {
                setIsSkippingUpcoming(false);
              }
            },
          },
        ]
      );
    }
  }

  const currentActiveOrPaused = effectiveActiveSessions[0] || pausedSessions[0];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 24) + 16 }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              refreshSessions();
              fetchHistory();
            }}
            tintColor={theme.accent}
          />
        }
      >
        {/* Loading State when starting up or loading sessions */}
        {allSessions.length === 0 && isLoading && (
          <View style={styles.loadingContainer}>
            <LoadingSpinner size={56} />
          </View>
        )}

        {/* Active + Paused Sessions */}
        {(effectiveActiveSessions.length > 0 || pausedSessions.length > 0) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>ACTIVE</Text>
            {effectiveActiveSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session as Session & { violations_count?: number }}
                isActive
              />
            ))}
            {pausedSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session as Session & { violations_count?: number }}
              />
            ))}
            {/* If there is an active session, skip button appears underneath it */}
            {currentActiveOrPaused && (
              <TouchableOpacity
                style={[
                  styles.skipUpcomingBtn,
                  { backgroundColor: '#187834' },
                ]}
                onPress={() => handleSkipSession(currentActiveOrPaused)}
                disabled={isSkippingUpcoming}
                activeOpacity={0.7}
              >
                <Ionicons name="play-forward-outline" size={15} color="#FFFFFF" />
                <Text style={[styles.skipUpcomingBtnText, { color: '#FFFFFF' }]}>Skip this session</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Next upcoming session */}
        {nextUpcomingSession && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              UPCOMING
            </Text>
            <SessionCard
              key={nextUpcomingSession.id}
              session={nextUpcomingSession as Session & { violations_count?: number; pause_count?: number }}
              isUpcoming
              nextOccurrence={nextUpcomingOccurrence}
            />
            {/* Show skip button under upcoming ONLY if there is no active session */}
            {!currentActiveOrPaused && (
              <TouchableOpacity
                style={[
                  styles.skipUpcomingBtn,
                  { backgroundColor: '#D97706' },
                ]}
                onPress={() => handleSkipSession(nextUpcomingSession)}
                disabled={isSkippingUpcoming}
                activeOpacity={0.7}
              >
                <Ionicons name="play-forward-outline" size={15} color="#FFFFFF" />
                <Text style={[styles.skipUpcomingBtnText, { color: '#FFFFFF' }]}>Skip this session</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Scheduled Later Sessions — inside a clean rounded container with filled surface color, max 2 items, and View All button */}
        {scheduledSessions.length > 0 && (
          <View style={[styles.scheduledContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              SCHEDULED LATER
            </Text>

            <View style={styles.scheduledList}>
              {scheduledSessions.slice(0, 1).map((item) => (
                <SessionCard
                  key={item.session.id}
                  session={item.session as Session & { violations_count?: number; pause_count?: number }}
                  nextOccurrence={item.nextOccurrence}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.viewAllButton, { backgroundColor: isDark ? '#5F66A2' : theme.card }]}
              onPress={() => router.push({ pathname: '/(tabs)/app-groups', params: { tab: 'sessions' } } as never)}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewAllButtonText, { color: isDark ? '#FFFFFF' : theme.text }]}>View All</Text>
              <Ionicons name="arrow-forward" size={14} color={isDark ? '#FFFFFF' : theme.accent} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* View All Sessions shortcut if there are multiple sessions but no remaining scheduled later sessions */}
        {scheduledSessions.length === 0 && allSessions.length > 1 && (
          <View style={{ marginBottom: 24 }}>
            <TouchableOpacity
              style={[styles.viewAllButton, { backgroundColor: isDark ? '#5F66A2' : theme.card }]}
              onPress={() => router.push({ pathname: '/(tabs)/app-groups', params: { tab: 'sessions' } } as never)}
              activeOpacity={0.7}
            >
              <Text style={[styles.viewAllButtonText, { color: isDark ? '#FFFFFF' : theme.text }]}>View All Sessions</Text>
              <Ionicons name="arrow-forward" size={14} color={isDark ? '#FFFFFF' : theme.accent} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* Ad Banner for non-pro users (RevenueCat SDK powered, hidden for Pro users) */}
        {!isPro && (
          <TouchableOpacity
            style={[
              styles.adBannerContainer,
              {
                backgroundColor: isDark ? 'rgba(217, 119, 6, 0.14)' : '#FEF3C7',
                borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
              },
            ]}
            onPress={() => openPaywall('dashboard_ad_banner')}
            activeOpacity={0.85}
          >
            <View style={[styles.adBannerTopRow, { justifyContent: 'flex-end' }]}>
              <Text
                style={[
                  styles.adSponsoredTag,
                  {
                    color: isDark ? 'rgba(255, 255, 255, 0.5)' : '#92400E',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(146, 64, 14, 0.2)',
                  },
                ]}
              >
                Ad
              </Text>
            </View>

            <Text style={[styles.adBannerTitle, { color: isDark ? '#FFFFFF' : '#78350F' }]}>
              Unlock Unlimited Distraction Blocking
            </Text>
            <Text style={[styles.adBannerSubtitle, { color: isDark ? 'rgba(255, 255, 255, 0.8)' : '#92400E' }]}>
              Get unlimited website & app groups, ad-free focus sessions, and complete history.
            </Text>

            <View style={styles.adBannerFooter}>
              <Text style={[styles.adBannerPrice, { color: isDark ? '#FCD34D' : '#B45309' }]}>
                {adPriceText}
              </Text>
              <View style={[styles.adBannerCtaBtn, { backgroundColor: isDark ? '#F59E0B' : '#D97706' }]}>
                <Text style={styles.adBannerCtaText}>Upgrade Now</Text>
                <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Milestone Progression Section */}
        {nearestMilestone && (
          <View style={styles.progressionSection}>
            <View style={styles.progressionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginBottom: 0 }]}>
                MILESTONE PROGRESSION
              </Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(tabs)/stats', params: { section: '1' } } as never)}
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
              style={[styles.progressionCard, { backgroundColor: isDark ? '#20233B' : theme.card }]}
              onPress={() => router.push({ pathname: '/(tabs)/stats', params: { section: '1' } } as never)}
              activeOpacity={0.8}
            >
              <View style={styles.progressionTopRow}>
                <View style={[styles.milestoneIconBox, { backgroundColor: 'transparent' }]}>
                  <Image
                    source={nearestMilestone.badge.image}
                    style={[
                      { width: 36, height: 36 },
                      isDark ? { tintColor: '#FFFFFF' } : null,
                    ]}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.progressionTitleRow}>
                    <Text style={[styles.progressionTitle, { color: theme.text }]}>
                      {nearestMilestone.badge.title}
                    </Text>
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
                        width: nearestMilestone.current > 0
                          ? `${Math.min(100, (nearestMilestone.current / nearestMilestone.target) * 100)}%`
                          : '0%',
                        backgroundColor: theme.accent,
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressionStatsRow}>
                  <Text style={[styles.progressionDetailText, { color: theme.textSecondary }]}>
                    {`${nearestMilestone.target - nearestMilestone.current} needed to unlock`}
                  </Text>
                  <Text style={[styles.progressionRatioText, { color: theme.text }]}>
                    {nearestMilestone.current} / {nearestMilestone.target}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {allSessions.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Ionicons name="bulb-outline" size={48} color={theme.textSecondary} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No sessions Created Yet</Text>
            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              Create your first focus session to get started
            </Text>

            <TouchableOpacity
              style={[
                styles.emptyCreateBtn,
                {
                  backgroundColor: isDark ? theme.accent : theme.accentDark,
                },
              ]}
              onPress={() => router.push('/session/create' as never)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color="#FFFFFF"
              />
              <Text
                style={[
                  styles.emptyCreateBtnText,
                  { color: '#FFFFFF' },
                ]}
              >
                Create new session
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
  },
  section: {
    marginBottom: 24,
  },
  scheduledContainer: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  scheduledList: {
    marginTop: 4,
    marginBottom: 6,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
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
    padding: 16,
    gap: 12,
  },
  progressionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  milestoneIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
  progressionQuote: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  progressionRequirement: {
    fontSize: 12,
    lineHeight: 16,
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
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  skipUpcomingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  skipUpcomingBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 12,
  },
  loadingContainer: {
    paddingVertical: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  emptyCreateBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  fab: {
    position: 'absolute',
    bottom: 94,
    right: 20,
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
  adBannerContainer: {
    marginBottom: 24,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  adBannerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  adBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  adSponsoredTag: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  adBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  adBannerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    marginBottom: 14,
  },
  adBannerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adBannerPrice: {
    fontSize: 12,
    fontWeight: '600',
  },
  adBannerCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  adBannerCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
