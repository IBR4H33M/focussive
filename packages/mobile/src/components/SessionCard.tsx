// ============================================================
// Focussive Mobile — Session Card Component
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useIsDark } from '@/utils/theme';
import { useSessions } from '@/context/SessionContext';
import { formatDuration, formatCountdown, getRemainingSeconds } from '@focussive/shared';
import type { Session } from '@focussive/shared';
import { SessionStatus } from '@focussive/shared';

interface SessionCardProps {
  session: Session & {
    violations_count?: number;
    is_on_break?: boolean;
    break_ends_at?: string | null;
  };
  isActive?: boolean;
  isUpcoming?: boolean;
}

function formatTimeRange(startTime: string, durationMinutes: number): string {
  const [hStr, mStr] = startTime.split(':');
  const startH = parseInt(hStr, 10);
  const startM = parseInt(mStr, 10);
  const startDate = new Date();
  startDate.setHours(startH, startM, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const fmt = (d: Date) => {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  };
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

function getBreakSecondsLeft(breakEndsAt: string | null | undefined): number {
  if (!breakEndsAt) return 0;
  return Math.max(0, Math.floor((new Date(breakEndsAt).getTime() - Date.now()) / 1000));
}

// Break state uses the palette's Saffron; the darker variant keeps it legible
// on the light Cosmic latte background, where raw Saffron is only ~1.7:1.
const TIMER_BREAK_DARK = '#9A5B00';
const TIMER_BREAK_LIGHT = '#F6C531';

// Active session palette: vivid green #22B14C with darker green border #1B8C3C
const ACTIVE_DARK_CARD_BG = '#22B14C';
const ACTIVE_DARK_CARD_TEXT = '#FFFFFF';
const ACTIVE_DARK_CARD_MUTED = 'rgba(255, 255, 255, 0.88)';
const ACTIVE_DARK_CARD_BORDER = '#1B8C3C';
const ACTIVE_DARK_CARD_SUBTLE = 'rgba(0, 0, 0, 0.18)';
const ACTIVE_DARK_CARD_DANGER = '#FFB4B4';

const ACTIVE_LIGHT_CARD_BG = '#22B14C';
const ACTIVE_LIGHT_CARD_TEXT = '#FFFFFF';
const ACTIVE_LIGHT_CARD_MUTED = 'rgba(255, 255, 255, 0.88)';
const ACTIVE_LIGHT_CARD_BORDER = '#1B8C3C';
const ACTIVE_LIGHT_CARD_SUBTLE = 'rgba(0, 0, 0, 0.14)';
const ACTIVE_LIGHT_CARD_DANGER = '#FFB4B4';

// Upcoming session palette (very light filled yellow, with dark shades of yellow for text)
const UPCOMING_CARD_BG = '#FEF3C7';
const UPCOMING_CARD_BORDER = '#FDE68A';
const UPCOMING_CARD_TEXT = '#452C03';
const UPCOMING_CARD_MUTED = '#78350F';
const UPCOMING_CARD_SUBTLE = 'rgba(120, 53, 15, 0.12)';

export default function SessionCard({ session, isActive, isUpcoming }: SessionCardProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const router = useRouter();

  const isActiveSession = session.status === SessionStatus.ACTIVE || isActive;
  const isOnBreak = session.is_on_break ?? false;

  const [remaining, setRemaining] = useState(getRemainingSeconds(session));
  const [breakLeft, setBreakLeft] = useState(() => getBreakSecondsLeft(session.break_ends_at));

  // Session countdown
  useEffect(() => {
    if (!isActiveSession) return;
    const interval = setInterval(() => {
      const s = getRemainingSeconds(session);
      setRemaining(s);
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [session, isActiveSession]);

  const { refreshSessions } = useSessions();
  const breakEndedRef = useRef(false);

  // Break countdown — triggers a session refresh as soon as it hits 0
  useEffect(() => {
    if (!isOnBreak || !session.break_ends_at) {
      setBreakLeft(0);
      breakEndedRef.current = false;
      return;
    }
    setBreakLeft(getBreakSecondsLeft(session.break_ends_at));
    breakEndedRef.current = false;
    const interval = setInterval(() => {
      const left = getBreakSecondsLeft(session.break_ends_at!);
      setBreakLeft(left);
      if (left <= 0 && !breakEndedRef.current) {
        breakEndedRef.current = true;
        clearInterval(interval);
        // Immediately refresh so UI stops showing "Break ongoing"
        refreshSessions();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isOnBreak, session.break_ends_at]);

  const timeRange = formatTimeRange(session.start_time, session.duration);
  const durationLabel = formatDuration(session.duration);

  const isUpcomingSession = isUpcoming && !isActiveSession;

  const cardBackgroundColor = isActiveSession
    ? (isDark ? ACTIVE_DARK_CARD_BG : ACTIVE_LIGHT_CARD_BG)
    : isUpcomingSession
      ? UPCOMING_CARD_BG
      : theme.card;

  const cardBorderColor = isActiveSession
    ? (isDark ? ACTIVE_DARK_CARD_BORDER : ACTIVE_LIGHT_CARD_BORDER)
    : isUpcomingSession
      ? UPCOMING_CARD_BORDER
      : 'transparent';

  const primaryTextColor = isActiveSession
    ? (isDark ? ACTIVE_DARK_CARD_TEXT : ACTIVE_LIGHT_CARD_TEXT)
    : isUpcomingSession
      ? UPCOMING_CARD_TEXT
      : theme.text;

  const secondaryTextColor = isActiveSession
    ? (isDark ? ACTIVE_DARK_CARD_MUTED : ACTIVE_LIGHT_CARD_MUTED)
    : isUpcomingSession
      ? UPCOMING_CARD_MUTED
      : theme.textSecondary;

  const breakColor = isActiveSession
    ? (isDark ? ACTIVE_DARK_CARD_TEXT : ACTIVE_LIGHT_CARD_TEXT)
    : (isDark ? TIMER_BREAK_LIGHT : TIMER_BREAK_DARK);

  const timerColor = isActiveSession
    ? (isOnBreak ? breakColor : (isDark ? ACTIVE_DARK_CARD_TEXT : ACTIVE_LIGHT_CARD_TEXT))
    : isUpcomingSession
      ? '#D97706'
      : primaryTextColor;

  const badgeBackgroundColor = isActiveSession
    ? (isDark ? ACTIVE_DARK_CARD_SUBTLE : ACTIVE_LIGHT_CARD_SUBTLE)
    : isUpcomingSession
      ? UPCOMING_CARD_SUBTLE
      : theme.surface;

  const badgeForegroundColor = isActiveSession
    ? (isDark ? ACTIVE_DARK_CARD_TEXT : ACTIVE_LIGHT_CARD_TEXT)
    : isUpcomingSession
      ? UPCOMING_CARD_MUTED
      : theme.textSecondary;

  const breakRowBorderColor = isActiveSession
    ? 'rgba(0, 0, 0, 0.2)'
    : `${isDark ? theme.accent : theme.accentDark}40`;

  const breakRowBackgroundColor = isActiveSession
    ? 'rgba(0, 0, 0, 0.12)'
    : `${isDark ? theme.accent : theme.accentDark}10`;

  const breakTextColor = isActiveSession
    ? '#FFFFFF'
    : (isDark ? theme.accent : theme.accentDark);

  const violationColor = isActiveSession
    ? (isDark ? ACTIVE_DARK_CARD_DANGER : ACTIVE_LIGHT_CARD_DANGER)
    : theme.danger;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: cardBackgroundColor,
          borderWidth: (isActiveSession || isUpcomingSession) ? 1.5 : 0,
          borderColor: cardBorderColor,
        },
      ]}
      onPress={() => router.push(`/session/${session.id}` as never)}
      activeOpacity={0.7}
    >
      {/* Header row */}
      <View style={styles.header}>
        <Text style={[styles.name, { color: primaryTextColor }]} numberOfLines={1}>
          {session.name}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Time row: range left, main countdown right */}
      <View style={styles.timeRow}>
        <Text style={[styles.timeRange, { color: secondaryTextColor }]}>{timeRange}</Text>
        <Text style={[styles.durationBig, { color: timerColor }]}>
          {isActiveSession ? formatCountdown(remaining) : durationLabel}
        </Text>
      </View>

      {/* Break ongoing row */}
      {isActiveSession && isOnBreak && (
        <View style={[styles.breakRow, { borderColor: breakRowBorderColor, backgroundColor: breakRowBackgroundColor }]}>
          <Text style={[styles.breakLabel, { color: breakTextColor }]}>Break ongoing</Text>
          <Text style={[styles.breakCountdown, { color: breakTextColor }]}>
            {formatCountdown(breakLeft)}
          </Text>
        </View>
      )}

      {/* Footer: badges + violations */}
      <View style={styles.footer}>
        <View style={styles.badgesRow}>
          {session.mobile_focus && (
            <View style={[styles.badge, { backgroundColor: badgeBackgroundColor }]}>
              <Ionicons name="phone-portrait-outline" size={12} color={badgeForegroundColor} />
              <Text style={[styles.badgeText, { color: badgeForegroundColor }]}>Mobile</Text>
            </View>
          )}
          {session.browser_focus && (
            <View style={[styles.badge, { backgroundColor: badgeBackgroundColor }]}>
              <Ionicons name="globe-outline" size={12} color={badgeForegroundColor} />
              <Text style={[styles.badgeText, { color: badgeForegroundColor }]}>Browser</Text>
            </View>
          )}
        </View>
        <View style={styles.statsRow}>
          {(isActiveSession) && (session.violations_count ?? 0) > 0 && (
            <Text style={[styles.stat, { color: violationColor }]}>
              {session.violations_count} violation{session.violations_count !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timeRange: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  durationBig: {
    fontSize: 40,
    fontWeight: '400',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  breakLabel: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  breakCountdown: {
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '400',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  stat: {
    fontSize: 12,
    fontWeight: '400',
  },
});
