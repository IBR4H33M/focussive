// ============================================================
// Focussive Mobile — Session Reminder Notifications
// ============================================================
// Uses Expo local notifications to schedule "upcoming session"
// reminders. All scheduling is done on-device, no push server needed.
// ============================================================

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { Session } from '@focussive/shared';

const REMINDER_MINUTES_KEY = 'session_reminder_minutes';
const DEFAULT_REMINDER_MINUTES = 15;
const SCHEDULED_IDS_KEY = 'session_reminder_ids';

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

// ─── Core scheduling ──────────────────────────────────────────

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
 * Parse a "HH:mm" start_time + optional date to a full Date object.
 * Uses today's date if date is not provided.
 */
function parseSessionTime(startTime: string, referenceDate?: Date): Date {
  const [h, m] = startTime.split(':').map(Number);
  const d = referenceDate ? new Date(referenceDate) : new Date();
  d.setHours(h, m, 0, 0);
  return d;
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

/**
 * Format a "HH:mm" time string for display (respects 12h/24h from AsyncStorage).
 */
async function formatStartTime(startTime: string): Promise<string> {
  try {
    const fmt = await AsyncStorage.getItem('time_format');
    const use24 = fmt !== '12';
    const [h, m] = startTime.split(':').map(Number);
    if (use24) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch {
    return startTime;
  }
}

/**
 * Schedule reminder notifications for all upcoming (scheduled) sessions.
 * Cancels previous reminders first to avoid duplicates.
 */
export async function scheduleSessionReminders(sessions: Session[]): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    await cancelAllReminders();

    const reminderMinutes = await getReminderMinutes();
    const now = new Date();
    const scheduledIds: string[] = [];

    // Only consider sessions with status 'scheduled' (not active/completed)
    const upcomingSessions = sessions.filter(
      (s) => (s as any).status === 'scheduled' && s.start_time
    );

    for (const session of upcomingSessions) {
      // Try today and the next 7 days for recurring sessions
      const datesToCheck = [new Date()];

      for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        datesToCheck.push(d);
      }

      for (const date of datesToCheck) {
        const sessionStart = parseSessionTime(session.start_time, date);
        const reminderFireAt = new Date(sessionStart.getTime() - reminderMinutes * 60 * 1000);

        // Only schedule if the reminder time is in the future (at least 10s away)
        if (reminderFireAt.getTime() - now.getTime() < 10_000) continue;

        // For "today" sessions, only schedule for today
        const schedule = (session as any).schedule;
        if (schedule === 'today') {
          // Only for today
          if (date.toDateString() !== new Date().toDateString()) continue;
        } else if (schedule === 'recurring') {
          // Check schedule_days contains today's weekday name
          const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayName = weekdays[date.getDay()];
          const scheduleDays: string[] = (session as any).schedule_days ?? [];
          if (!scheduleDays.includes(dayName) && !scheduleDays.includes(dayName.toLowerCase())) continue;
        } else if (schedule === 'scheduled') {
          // Check schedule_days contains the YYYY-MM-DD date string
          const dateStr = date.toISOString().split('T')[0];
          const scheduleDays: string[] = (session as any).schedule_days ?? [];
          if (!scheduleDays.includes(dateStr)) continue;
        }

        const formattedTime = await formatStartTime(session.start_time);
        const countdown = formatCountdown(reminderMinutes);

        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: '⏰ Upcoming Session',
            body: `You have the ${formattedTime} "${session.name}" session upcoming in ${countdown}`,
            sound: true,
            data: { sessionId: session.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminderFireAt,
          },
        });

        scheduledIds.push(id);

        // For "today" sessions, only one reminder needed
        if (schedule === 'today') break;
      }
    }

    if (scheduledIds.length > 0) {
      await AsyncStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(scheduledIds));
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
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
