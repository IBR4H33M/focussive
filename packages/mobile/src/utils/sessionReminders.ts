// ============================================================
// Focussive Mobile — Session Reminder Notifications
// ============================================================
// On Android, live-ticking, non-dismissible notifications are posted via the
// native app-blocker module (Notification chronometer + AlarmManager) so the
// countdown updates every second and survives the app being killed. Other
// platforms fall back to simple scheduled Expo local notifications.
// ============================================================

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Session } from '@focussive/shared';
import {
  scheduleReminderNotification as nativeScheduleReminder,
  scheduleActiveNotification as nativeScheduleActive,
  cancelSessionNotification as nativeCancelSessionNotification,
} from '@focussive/app-blocker';

const REMINDER_MINUTES_KEY = 'session_reminder_minutes';
const DEFAULT_REMINDER_MINUTES = 15;
const SCHEDULED_IDS_KEY = 'session_reminder_ids';
const NATIVE_NOTIF_IDS_KEY = 'session_native_notification_ids';
const LATE_FIRED_KEY = 'session_reminder_late_fired';
const REMINDER_CATEGORY = 'session-reminder';
const ACTIVE_CATEGORY = 'session-active';
const ACTIVE_NOTIFICATION_ID = 1001;

type ActiveSessionWithViolations = Session & { violations_count?: number };

// ─── Permissions ──────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Preference helpers ───────────────────────────────────────

export async function getReminderMinutes(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(REMINDER_MINUTES_KEY);
    if (val === null) return DEFAULT_REMINDER_MINUTES;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed <= 0 ? DEFAULT_REMINDER_MINUTES : parsed;
  } catch {
    return DEFAULT_REMINDER_MINUTES;
  }
}

export async function setReminderMinutes(minutes: number): Promise<void> {
  await AsyncStorage.setItem(REMINDER_MINUTES_KEY, String(minutes));
}

// ─── Shared helpers ───────────────────────────────────────────

/**
 * Parse a "HH:mm" start_time + optional date to a full Date object.
 * Uses today's date if date is not provided.
 */
function parseSessionTime(startTime: string, referenceDate?: Date): Date {
  const [h, m] = startTime.split(':').map(Number);
  const d = referenceDate ? new Date(referenceDate) : new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

async function getUse24HourFormat(): Promise<boolean> {
  try {
    const fmt = await AsyncStorage.getItem('time_format');
    return fmt !== '12';
  } catch {
    return true;
  }
}

function formatClockTime(date: Date, use24Hour: boolean): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (use24Hour) {
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${period}`;
}

/**
 * Format minutes remaining into a human-readable countdown.
 * e.g. 90 → "1h 30m", 30 → "30 minutes"
 */
function formatCountdown(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

function violationsLabel(count: number): string {
  return `Violations: ${count}`;
}

/** Deterministic 32-bit hash so the same occurrence always maps to the same notification id. */
function hashId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

// ─── Android: native live (chronometer) notifications ─────────

async function scheduleAndroidNativeNotifications(
  sessions: Session[],
  activeSessions: ActiveSessionWithViolations[],
): Promise<void> {
  const reminderMinutes = await getReminderMinutes();
  const use24Hour = await getUse24HourFormat();
  const now = new Date();
  const desiredIds = new Set<number>();

  // ── Upcoming reminders (+ pre-arm the "running" alarm for the next occurrence) ──
  const upcomingSessions = sessions.filter((s) => (s as any).status === 'scheduled' && s.start_time);

  for (const session of upcomingSessions) {
    const schedule = (session as any).schedule;
    const datesToCheck = [new Date()];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      datesToCheck.push(d);
    }

    let activeAlarmArmed = false;

    for (const date of datesToCheck) {
      const sessionStart = parseSessionTime(session.start_time, date);
      const msUntilStart = sessionStart.getTime() - now.getTime();

      // Session already started — too late for a "starts soon" reminder.
      if (msUntilStart < 10_000) continue;

      if (schedule === 'today') {
        if (date.toDateString() !== new Date().toDateString()) continue;
      } else if (schedule === 'recurring') {
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = weekdays[date.getDay()];
        const scheduleDays: string[] = (session as any).schedule_days ?? [];
        if (!scheduleDays.includes(dayName) && !scheduleDays.includes(dayName.toLowerCase())) continue;
      } else if (schedule === 'scheduled') {
        const dateStr = date.toISOString().split('T')[0];
        const scheduleDays: string[] = (session as any).schedule_days ?? [];
        if (!scheduleDays.includes(dateStr)) continue;
      }

      const sessionEnd = new Date(sessionStart.getTime() + session.duration * 60_000);
      const formattedStart = formatClockTime(sessionStart, use24Hour);
      const formattedEnd = formatClockTime(sessionEnd, use24Hour);
      const reminderFireAt = new Date(sessionStart.getTime() - reminderMinutes * 60_000);

      const reminderId = hashId(`${session.id}:reminder:${date.toDateString()}`);
      desiredIds.add(reminderId);
      nativeScheduleReminder(
        reminderId,
        session.id,
        `${session.name} is scheduled at ${formattedStart}`,
        `Ends at ${formattedEnd}`,
        sessionStart.getTime(),
        sessionStart.getTime(),
        reminderFireAt.getTime(),
      );

      // Only the nearest occurrence's "running" alarm should be armed —
      // later occurrences would otherwise stomp on the same notification id.
      if (!activeAlarmArmed) {
        const activeId = ACTIVE_NOTIFICATION_ID;
        desiredIds.add(activeId);
        nativeScheduleActive(
          activeId,
          session.id,
          `Session ${session.name} is running`,
          `Ends at ${formattedEnd}`,
          sessionEnd.getTime(),
          sessionEnd.getTime(),
          sessionStart.getTime(),
          violationsLabel(0),
        );
        activeAlarmArmed = true;
      }

      if (schedule === 'today') break;
    }
  }

  // ── Currently running sessions — authoritative content, posted immediately ──
  for (const session of activeSessions) {
    const startedAtMs = session.started_at ? new Date(session.started_at).getTime() : now.getTime();
    const endAt = startedAtMs + session.duration * 60_000;
    const formattedEnd = formatClockTime(new Date(endAt), use24Hour);
    const violations = session.violations_count ?? 0;

    const activeId = ACTIVE_NOTIFICATION_ID;
    desiredIds.add(activeId);
    nativeScheduleActive(
      activeId,
      session.id,
      `Session ${session.name} is running`,
      `Ends at ${formattedEnd}`,
      endAt,
      endAt,
      now.getTime(),
      violationsLabel(violations),
    );
  }

  // ── Drop notifications for sessions that are no longer relevant ────────
  try {
    const raw = await AsyncStorage.getItem(NATIVE_NOTIF_IDS_KEY);
    const previousIds: number[] = raw ? JSON.parse(raw) : [];
    for (const id of previousIds) {
      if (!desiredIds.has(id)) {
        nativeCancelSessionNotification(id);
      }
    }
  } catch {
    // ignore
  }
  await AsyncStorage.setItem(NATIVE_NOTIF_IDS_KEY, JSON.stringify(Array.from(desiredIds)));
}

// ─── Legacy path (iOS / other platforms): static Expo local notifications ──

/**
 * Cancel all previously scheduled reminder notifications.
 */
export async function cancelAllReminders(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_IDS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    await AsyncStorage.removeItem(SCHEDULED_IDS_KEY);
  } catch {
    // ignore
  }
}

/**
 * Track sessions we've already sent a "late" reminder for (i.e. the configured
 * lead time had already elapsed by the time we scheduled), keyed by
 * "sessionId_dateString". Prevents re-firing the same late reminder on every
 * 30s poll while the session is still upcoming.
 */
async function getLateFiredMap(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(LATE_FIRED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function pruneAndSaveLateFired(map: Record<string, number>): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const key of Object.keys(map)) {
    if (map[key] < cutoff) delete map[key];
  }
  await AsyncStorage.setItem(LATE_FIRED_KEY, JSON.stringify(map));
}

async function scheduleLegacyReminders(sessions: Session[]): Promise<void> {
  await cancelAllReminders();

  const reminderMinutes = await getReminderMinutes();
  const use24Hour = await getUse24HourFormat();
  const now = new Date();
  const scheduledIds: string[] = [];
  const lateFired = await getLateFiredMap();
  let lateFiredChanged = false;

  const upcomingSessions = sessions.filter((s) => (s as any).status === 'scheduled' && s.start_time);

  for (const session of upcomingSessions) {
    const datesToCheck = [new Date()];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      datesToCheck.push(d);
    }

    const schedule = (session as any).schedule;

    for (const date of datesToCheck) {
      const sessionStart = parseSessionTime(session.start_time, date);
      const msUntilStart = sessionStart.getTime() - now.getTime();

      if (msUntilStart < 10_000) continue;

      if (schedule === 'today') {
        if (date.toDateString() !== new Date().toDateString()) continue;
      } else if (schedule === 'recurring') {
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = weekdays[date.getDay()];
        const scheduleDays: string[] = (session as any).schedule_days ?? [];
        if (!scheduleDays.includes(dayName) && !scheduleDays.includes(dayName.toLowerCase())) continue;
      } else if (schedule === 'scheduled') {
        const dateStr = date.toISOString().split('T')[0];
        const scheduleDays: string[] = (session as any).schedule_days ?? [];
        if (!scheduleDays.includes(dateStr)) continue;
      }

      const reminderFireAt = new Date(sessionStart.getTime() - reminderMinutes * 60 * 1000);
      const isLate = reminderFireAt.getTime() - now.getTime() < 10_000;

      if (isLate) {
        const occurrenceKey = `${session.id}_${date.toDateString()}`;
        if (lateFired[occurrenceKey]) continue;
        lateFired[occurrenceKey] = now.getTime();
        lateFiredChanged = true;
      }

      const fireAt = isLate ? new Date(now.getTime() + 3_000) : reminderFireAt;
      const leadMinutes = isLate ? Math.max(1, Math.round(msUntilStart / 60_000)) : reminderMinutes;

      const formattedStart = formatClockTime(sessionStart, use24Hour);
      const formattedEnd = formatClockTime(new Date(sessionStart.getTime() + session.duration * 60_000), use24Hour);
      const countdown = formatCountdown(leadMinutes);

      const reminderId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Session starts soon',
          body: `${session.name} starts at ${formattedStart}. ${countdown} left. Ends at ${formattedEnd}.`,
          sound: true,
          data: {
            sessionId: session.id,
            notificationType: 'reminder',
            startTime: session.start_time,
            startAt: sessionStart.toISOString(),
            endAt: new Date(sessionStart.getTime() + session.duration * 60_000).toISOString(),
          },
          categoryIdentifier: REMINDER_CATEGORY,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          channelId: 'default',
        } as any,
      });

      scheduledIds.push(reminderId);

      const activeId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Session running now',
          body: `${session.name} is live. ${formatCountdown(session.duration)} remaining. Ends at ${formattedEnd}.`,
          sound: true,
          data: {
            sessionId: session.id,
            notificationType: 'active',
            startTime: session.start_time,
            startAt: sessionStart.toISOString(),
            endAt: new Date(sessionStart.getTime() + session.duration * 60_000).toISOString(),
          },
          categoryIdentifier: ACTIVE_CATEGORY,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: sessionStart,
          channelId: 'default',
        } as any,
      });

      scheduledIds.push(activeId);

      if (schedule === 'today') break;
    }
  }

  if (scheduledIds.length > 0) {
    await AsyncStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(scheduledIds));
  }
  if (lateFiredChanged) {
    await pruneAndSaveLateFired(lateFired);
  }
}

// ─── Public entry point ─────────────────────────────────────────

/**
 * Schedule/refresh session reminder + running-session notifications.
 * Safe to call on every session refresh — scheduling is idempotent per
 * occurrence, so repeated calls just silently update existing notifications.
 */
export async function scheduleSessionReminders(
  sessions: Session[],
  activeSessions: ActiveSessionWithViolations[] = [],
): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    if (Platform.OS === 'android') {
      await scheduleAndroidNativeNotifications(sessions, activeSessions);
    } else {
      await scheduleLegacyReminders(sessions);
    }
  } catch (e) {
    console.warn('[Reminders] Failed to schedule session reminders:', e);
  }
}

// ─── Notification handler setup ───────────────────────────────

/**
 * Configure how notifications behave when the app is in the foreground.
 * Call once at app startup.
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    {
      identifier: 'open-session',
      buttonTitle: 'Open session',
      options: {
        opensAppToForeground: true,
      },
    },
  ]).catch(() => {});

  Notifications.setNotificationCategoryAsync(ACTIVE_CATEGORY, [
    {
      identifier: 'open-session',
      buttonTitle: 'Open session',
      options: {
        opensAppToForeground: true,
      },
    },
  ]).catch(() => {});

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Session Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8BA794',
    }).catch(() => {});
  }
}
