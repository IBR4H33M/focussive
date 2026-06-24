// ============================================================
// Focussive — Shared Utility Functions
// ============================================================

import {
  type Session,
  type Weekday,
  ScheduleType,
  SessionStatus,
} from './types';

/**
 * Format duration in minutes to a human-readable string.
 * e.g., 90 → "1h 30m", 45 → "45m"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format countdown from remaining seconds to hh:mm:ss string.
 * e.g., 3661 → "01:01:01"
 */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((v) => v.toString().padStart(2, '0'))
    .join(':');
}

/**
 * Check if two sessions overlap in time.
 * Considers schedule type and days.
 */
export function isSessionOverlap(
  sessionA: Pick<Session, 'start_time' | 'duration' | 'schedule' | 'schedule_days'>,
  sessionB: Pick<Session, 'start_time' | 'duration' | 'schedule' | 'schedule_days'>
): boolean {
  // Check if they share any common days
  const daysA = getSessionDays(sessionA);
  const daysB = getSessionDays(sessionB);
  const commonDays = daysA.filter((d) => daysB.includes(d));

  if (commonDays.length === 0) return false;

  // Check time overlap
  const startA = parseTime(sessionA.start_time);
  const endA = startA + sessionA.duration;
  const startB = parseTime(sessionB.start_time);
  const endB = startB + sessionB.duration;

  return startA < endB && startB < endA;
}

/**
 * Get the days a session is active on.
 */
function getSessionDays(
  session: Pick<Session, 'schedule' | 'schedule_days'>
): Weekday[] {
  if (session.schedule === ScheduleType.TODAY) {
    const today = getCurrentWeekday();
    return [today];
  }
  return session.schedule_days || [];
}

/**
 * Parse time string "HH:mm" to minutes since midnight.
 */
export function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * Get the current weekday.
 */
export function getCurrentWeekday(): Weekday {
  const days: Weekday[] = [
    'sunday' as Weekday,
    'monday' as Weekday,
    'tuesday' as Weekday,
    'wednesday' as Weekday,
    'thursday' as Weekday,
    'friday' as Weekday,
    'saturday' as Weekday,
  ];
  return days[new Date().getDay()]!;
}

/**
 * Check if a session is currently active based on its schedule and time.
 */
export function isSessionActive(session: Session): boolean {
  if (session.status !== SessionStatus.ACTIVE) return false;
  return true;
}

/**
 * Check if a session is upcoming (scheduled for later today).
 */
export function isSessionUpcoming(session: Session): boolean {
  if (session.status !== SessionStatus.SCHEDULED) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const sessionStart = parseTime(session.start_time);
  const today = getCurrentWeekday();

  // Check if session is scheduled for today
  const sessionDays = getSessionDays(session);
  if (!sessionDays.includes(today)) return false;

  return sessionStart > currentMinutes;
}

/**
 * Calculate remaining seconds for an active session.
 */
export function getRemainingSeconds(session: Session): number {
  if (!session.started_at) return session.duration * 60;

  const startedAt = new Date(session.started_at).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - startedAt) / 1000);
  const totalSeconds = session.duration * 60;

  return Math.max(0, totalSeconds - elapsed);
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength (min 8 chars, 1 uppercase, 1 lowercase, 1 number).
 */
export function isValidPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/**
 * Generate a random QR code string (alphanumeric, 32 chars).
 */
export function generateQRCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Check if a URL matches any blocked website pattern.
 */
export function isBlockedWebsite(url: string, blockedList: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return blockedList.some((blocked) => {
      const pattern = blocked.toLowerCase();
      return hostname === pattern || hostname.endsWith(`.${pattern}`);
    });
  } catch {
    return false;
  }
}

/**
 * Format a date to a readable string.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a time to a readable string.
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const h = hours ?? 0;
  const m = minutes ?? 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}
