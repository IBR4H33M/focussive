// ============================================================
// Focussive Mobile — Gamification, Tiers & Archetype Badges
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionHistory, AppGroup } from '@focussive/shared';

// ─── 1. Quality Tiers ────────────────────────────────────────

export type QualityTierKey = 'legendary' | 'epic' | 'rare' | 'uncommon' | 'common';

export interface QualityTierInfo {
  key: QualityTierKey;
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  tagline: string;
  description: string;
}

export const QUALITY_TIERS: Record<QualityTierKey, QualityTierInfo> = {
  legendary: {
    key: 'legendary',
    name: 'Legendary',
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: '#F59E0B',
    icon: 'trophy',
    tagline: 'Flawless Masterclass',
    description: 'Zero distractions, no emergency breaks, 60+ minutes on schedule.',
  },
  epic: {
    key: 'epic',
    name: 'Epic',
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.16)',
    borderColor: '#8B5CF6',
    icon: 'shield-checkmark',
    tagline: 'Iron Discipline',
    description: 'Zero distraction attempts and zero emergency breaks used.',
  },
  rare: {
    key: 'rare',
    name: 'Rare',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.16)',
    borderColor: '#3B82F6',
    icon: 'diamond',
    tagline: 'Clean Focus',
    description: 'Zero distraction attempts throughout the entire session.',
  },
  uncommon: {
    key: 'uncommon',
    name: 'Uncommon',
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.16)',
    borderColor: '#10B981',
    icon: 'ribbon',
    tagline: 'Solid Resilience',
    description: 'Completed with at most 1 distraction attempt.',
  },
  common: {
    key: 'common',
    name: 'Common',
    color: '#94A3B8',
    bgColor: 'rgba(148, 163, 184, 0.16)',
    borderColor: '#94A3B8',
    icon: 'checkmark-circle',
    tagline: 'Session Completed',
    description: 'Successfully reached the finish line.',
  },
};

/**
 * Rolls for a quality tier based on session performance
 */
export function evaluateSessionQualityTier(params: {
  actualDuration: number;
  scheduledDuration: number;
  violationsCount: number;
  breaksUsedCount?: number;
  status?: string;
  isOnSchedule?: boolean;
}): QualityTierInfo {
  const {
    actualDuration,
    scheduledDuration,
    violationsCount,
    breaksUsedCount = 0,
    status = 'completed',
    isOnSchedule,
  } = params;

  if (status !== 'completed') {
    return QUALITY_TIERS.common;
  }

  const zeroViolations = violationsCount === 0;
  const noBreaks = breaksUsedCount === 0;
  const duration60Plus = actualDuration >= 60 || scheduledDuration >= 60;
  const onSchedule = isOnSchedule !== undefined ? isOnSchedule : actualDuration >= scheduledDuration;

  // Legendary: Epic + 60+ minutes + on schedule
  if (zeroViolations && noBreaks && duration60Plus && onSchedule) {
    return QUALITY_TIERS.legendary;
  }

  // Epic: Zero attempts + no emergency break
  if (zeroViolations && noBreaks) {
    return QUALITY_TIERS.epic;
  }

  // Rare: Zero distraction attempts
  if (zeroViolations) {
    return QUALITY_TIERS.rare;
  }

  // Uncommon: Completed with <= 1 distraction attempt
  if (violationsCount <= 1) {
    return QUALITY_TIERS.uncommon;
  }

  // Common: Session completed
  return QUALITY_TIERS.common;
}

// ─── 2. Collectible Milestone Badges & Archetypes ────────────

export type MilestoneKey =
  | 'the_sprinter'
  | 'the_marathoner'
  | 'the_dawn_patrol'
  | 'the_night_shift'
  | 'the_unbreakable'
  | 'the_comeback'
  | 'the_realist';

export interface MilestoneBadge {
  key: MilestoneKey;
  title: string;
  quote: string;
  requirement: string;
  icon: string;
  color: string;
}

export const MILESTONE_BADGES: Record<MilestoneKey, MilestoneBadge> = {
  the_sprinter: {
    key: 'the_sprinter',
    title: 'The Sprinter',
    quote: "You work in bursts and that's fine.",
    requirement: '20+ short sessions (<60m) completed within 7 days',
    icon: 'flash',
    color: '#F59E0B',
  },
  the_marathoner: {
    key: 'the_marathoner',
    title: 'The Marathoner',
    quote: 'Deep work is your natural mode.',
    requirement: '15+ sessions of over 60m in one week',
    icon: 'infinite',
    color: '#3B82F6',
  },
  the_dawn_patrol: {
    key: 'the_dawn_patrol',
    title: 'The Dawn Patrol',
    quote: 'Own the morning, own the day.',
    requirement: '15+ sessions of ≥60m in one week completed before 9am',
    icon: 'sunny',
    color: '#F97316',
  },
  the_night_shift: {
    key: 'the_night_shift',
    title: 'The Night Shift',
    quote: 'The world sleeps, you build.',
    requirement: '15+ sessions of ≥60m in one week completed after 9pm',
    icon: 'moon',
    color: '#6366F1',
  },
  the_unbreakable: {
    key: 'the_unbreakable',
    title: 'The Unbreakable',
    quote: 'Focus forged in steel.',
    requirement: '25 consecutive clean sessions of ≥60m duration',
    icon: 'shield',
    color: '#10B981',
  },
  the_comeback: {
    key: 'the_comeback',
    title: 'The Comeback',
    quote: 'Resilience defined.',
    requirement: 'Returned after a 7+ day gap and completed 5 sessions of ≥60m in 3 days',
    icon: 'flame',
    color: '#EF4444',
  },
  the_realist: {
    key: 'the_realist',
    title: 'The Realist',
    quote: 'Sustainable rhythm beats burnout.',
    requirement: 'Used breaks but still completed 90% of sessions for a total of 10 sessions within 7 days',
    icon: 'cafe',
    color: '#14B8A6',
  },
};

// ─── 3. Qualification Check for Sessions ─────────────────────

/**
 * Checks the qualification rule:
 * "for every achievement, for a session to be counted, each session will have to have
 *  at least 2 apps from the most used 4 apps from last week and at least 3 apps in total for any session."
 */
export function isSessionQualifiedForMilestones(
  historyItem: SessionHistory,
  appGroups: AppGroup[] = [],
  top4AppNamesOrIds: string[] = []
): boolean {
  // Collect all apps associated with this session's groups or available groups
  let sessionApps: string[] = [];

  // If history row has snapshot of blocked_apps stored in DB, prioritize it!
  if (Array.isArray(historyItem.blocked_apps) && historyItem.blocked_apps.length > 0) {
    sessionApps = historyItem.blocked_apps;
  } else {
    // Fallback: try finding group matching session
    const matchedGroup = appGroups.find(
      g => (historyItem as any).app_group_id === g.id || (historyItem as any).app_group_ids?.includes(g.id)
    );

    if (matchedGroup && matchedGroup.apps) {
      sessionApps = matchedGroup.apps.map(a => a.name || a.package_name || a.id);
    } else if (appGroups.length > 0) {
      // If no direct group relation on history row, aggregate from default/first app group
      sessionApps = appGroups[0]?.apps?.map(a => a.name || a.package_name || a.id) || [];
    }
  }

  // If top4 list wasn't passed, build a default one from apps in app groups
  const top4 = top4AppNamesOrIds.length >= 4
    ? top4AppNamesOrIds
    : appGroups.flatMap(g => (g.apps || []).map(a => a.name || a.package_name || a.id)).slice(0, 4);

  // Requirement 1: at least 3 apps in total for the session
  if (sessionApps.length < 3) {
    // Allow pass if session was completed and had at least 3 apps implied, otherwise fallback
    return sessionApps.length === 0; // If app tracking wasn't recorded, don't penalize legacy entries
  }

  // Requirement 2: at least 2 apps from the most used 4 apps from last week
  const matches = sessionApps.filter(app => top4.includes(app));
  return matches.length >= 2;
}

// ─── 4. Longest Clean Streak Calculation ──────────────────────

export function calculateLongestCleanStreak(sessions: SessionHistory[]): number {
  if (!sessions || sessions.length === 0) return 0;

  // Sort ascending chronologically
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let maxStreak = 0;
  let currentStreak = 0;

  for (const s of sorted) {
    if (s.status === 'completed' && (s.violations_count ?? 0) === 0) {
      currentStreak += 1;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    } else {
      currentStreak = 0;
    }
  }

  return maxStreak;
}

// ─── 5. Milestone Progress Evaluation ────────────────────────

export interface MilestoneProgress {
  badge: MilestoneBadge;
  isUnlocked: boolean;
  current: number;
  target: number;
}

export function evaluateMilestones(
  history: SessionHistory[],
  appGroups: AppGroup[] = []
): Record<MilestoneKey, MilestoneProgress> {
  const completedSessions = history
    .filter(h => h.status === 'completed')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // ── Helper: 7-day rolling window counts ──
  function getMaxIn7Days(filterFn: (h: SessionHistory) => boolean): number {
    let max = 0;
    for (let i = 0; i < completedSessions.length; i++) {
      const windowStart = new Date(completedSessions[i].created_at).getTime();
      const windowEnd = windowStart + 7 * 24 * 60 * 60 * 1000;
      const count = completedSessions
        .slice(i)
        .filter(h => new Date(h.created_at).getTime() <= windowEnd && filterFn(h)).length;
      if (count > max) max = count;
    }
    return max;
  }

  // 1. The Sprinter: 20+ short sessions (<60m) completed within 7 days
  const sprinterCount = getMaxIn7Days(
    h => (h.actual_duration ?? h.scheduled_duration ?? 0) < 60
  );

  // 2. The Marathoner: 15+ sessions of over 60m in one week
  const marathonerCount = getMaxIn7Days(
    h => (h.actual_duration ?? h.scheduled_duration ?? 0) > 60
  );

  // 3. The Dawn Patrol: 15+ sessions of >=60m in one week completed before 9am
  const dawnPatrolCount = getMaxIn7Days(h => {
    const dur = h.actual_duration ?? h.scheduled_duration ?? 0;
    if (dur < 60) return false;
    const d = new Date(h.created_at);
    return d.getHours() < 9;
  });

  // 4. The Night Shift: 15+ sessions of >=60m after 9pm
  const nightShiftCount = getMaxIn7Days(h => {
    const dur = h.actual_duration ?? h.scheduled_duration ?? 0;
    if (dur < 60) return false;
    const d = new Date(h.created_at);
    return d.getHours() >= 21;
  });

  // 5. The Unbreakable: 25 consecutive clean sessions of >=60m duration
  let maxUnbreakable = 0;
  let curUnbreakable = 0;
  for (const s of completedSessions) {
    const dur = s.actual_duration ?? s.scheduled_duration ?? 0;
    const isClean = (s.violations_count ?? 0) === 0;
    if (dur >= 60 && isClean) {
      curUnbreakable += 1;
      if (curUnbreakable > maxUnbreakable) maxUnbreakable = curUnbreakable;
    } else {
      curUnbreakable = 0;
    }
  }

  // 6. The Comeback: returned after 7+ day gap and completed 5 sessions of >=60m in 3 days
  let comebackUnlocked = false;
  let comebackMax = 0;
  for (let i = 1; i < completedSessions.length; i++) {
    const prevTime = new Date(completedSessions[i - 1].created_at).getTime();
    const curTime = new Date(completedSessions[i].created_at).getTime();
    const gapDays = (curTime - prevTime) / (24 * 60 * 60 * 1000);

    if (gapDays >= 7) {
      // Check next 3 days from curTime
      const threeDaysEnd = curTime + 3 * 24 * 60 * 60 * 1000;
      const count = completedSessions
        .slice(i)
        .filter(
          h =>
            new Date(h.created_at).getTime() <= threeDaysEnd &&
            (h.actual_duration ?? h.scheduled_duration ?? 0) >= 60
        ).length;
      if (count > comebackMax) comebackMax = count;
      if (count >= 5) comebackUnlocked = true;
    }
  }

  // 7. The Realist: used breaks but completed >= 90% of sessions for total 10 sessions in 7 days
  let realistUnlocked = false;
  let realistMax = 0;
  for (let i = 0; i < history.length; i++) {
    const windowStart = new Date(history[i].created_at).getTime();
    const windowEnd = windowStart + 7 * 24 * 60 * 60 * 1000;
    const inWindow = history.filter(
      h => new Date(h.created_at).getTime() >= windowStart && new Date(h.created_at).getTime() <= windowEnd
    );
    const completedInWindow = inWindow.filter(h => h.status === 'completed');
    const withBreaks = completedInWindow.filter(h => ((h as any).pause_count ?? 0) > 0);

    if (completedInWindow.length >= 10 && withBreaks.length > 0) {
      const completionRate = completedInWindow.length / inWindow.length;
      if (completionRate >= 0.9) {
        realistUnlocked = true;
        realistMax = completedInWindow.length;
      }
    } else {
      if (completedInWindow.length > realistMax) realistMax = completedInWindow.length;
    }
  }

  return {
    the_sprinter: {
      badge: MILESTONE_BADGES.the_sprinter,
      isUnlocked: sprinterCount >= 20,
      current: Math.min(20, sprinterCount),
      target: 20,
    },
    the_marathoner: {
      badge: MILESTONE_BADGES.the_marathoner,
      isUnlocked: marathonerCount >= 15,
      current: Math.min(15, marathonerCount),
      target: 15,
    },
    the_dawn_patrol: {
      badge: MILESTONE_BADGES.the_dawn_patrol,
      isUnlocked: dawnPatrolCount >= 15,
      current: Math.min(15, dawnPatrolCount),
      target: 15,
    },
    the_night_shift: {
      badge: MILESTONE_BADGES.the_night_shift,
      isUnlocked: nightShiftCount >= 15,
      current: Math.min(15, nightShiftCount),
      target: 15,
    },
    the_unbreakable: {
      badge: MILESTONE_BADGES.the_unbreakable,
      isUnlocked: maxUnbreakable >= 25,
      current: Math.min(25, maxUnbreakable),
      target: 25,
    },
    the_comeback: {
      badge: MILESTONE_BADGES.the_comeback,
      isUnlocked: comebackUnlocked,
      current: Math.min(5, comebackMax),
      target: 5,
    },
    the_realist: {
      badge: MILESTONE_BADGES.the_realist,
      isUnlocked: realistUnlocked,
      current: Math.min(10, realistMax),
      target: 10,
    },
  };
}

// ─── 6. Storage & Archetype Persistence ──────────────────────

const STORAGE_KEYS = {
  ARCHETYPE: '@focussive_archetype',
  TIER_COUNTS: '@focussive_tier_counts',
  PENDING_SESSION_TIER: '@focussive_pending_session_tier',
};

export async function getSelectedArchetype(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.ARCHETYPE);
  } catch {
    return null;
  }
}

export async function setSelectedArchetype(archetype: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ARCHETYPE, archetype);
  } catch (e) {
    console.error('Failed to save archetype:', e);
  }
}

export async function recordEarnedTier(tierKey: QualityTierKey): Promise<Record<QualityTierKey, number>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TIER_COUNTS);
    const counts: Record<QualityTierKey, number> = raw
      ? JSON.parse(raw)
      : { legendary: 0, epic: 0, rare: 0, uncommon: 0, common: 0 };
    counts[tierKey] = (counts[tierKey] || 0) + 1;
    await AsyncStorage.setItem(STORAGE_KEYS.TIER_COUNTS, JSON.stringify(counts));
    return counts;
  } catch {
    return { legendary: 0, epic: 0, rare: 0, uncommon: 0, common: 0 };
  }
}

export async function getEarnedTierCounts(history: SessionHistory[]): Promise<Record<QualityTierKey, number>> {
  // Compute from history records so that it is always in sync
  const counts: Record<QualityTierKey, number> = {
    legendary: 0,
    epic: 0,
    rare: 0,
    uncommon: 0,
    common: 0,
  };

  history.forEach(item => {
    if (item.status === 'completed') {
      let tierKey: QualityTierKey;
      if (item.quality_tier && QUALITY_TIERS[item.quality_tier as QualityTierKey]) {
        tierKey = item.quality_tier as QualityTierKey;
      } else {
        const tier = evaluateSessionQualityTier({
          actualDuration: item.actual_duration ?? item.scheduled_duration ?? 0,
          scheduledDuration: item.scheduled_duration ?? 0,
          violationsCount: item.violations_count ?? 0,
          breaksUsedCount: item.breaks_count ?? (item as any).pause_count ?? 0,
          status: item.status,
          isOnSchedule: item.is_on_schedule ?? true,
        });
        tierKey = tier.key;
      }
      counts[tierKey] = (counts[tierKey] || 0) + 1;
    }
  });

  return counts;
}

export async function savePendingSessionTier(data: {
  sessionName: string;
  durationMinutes: number;
  tier: QualityTierInfo;
  violationsBlocked: number;
}): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_SESSION_TIER, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save pending tier:', e);
  }
}

export async function getPendingSessionTier(): Promise<{
  sessionName: string;
  durationMinutes: number;
  tier: QualityTierInfo;
  violationsBlocked: number;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SESSION_TIER);
    if (!raw) return null;
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_SESSION_TIER);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
