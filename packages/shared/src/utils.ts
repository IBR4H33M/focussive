// ============================================================
// Focussive — Shared Utility Functions
// ============================================================

import type { Session } from './types';
import { ScheduleType } from './types';

// --- Type alias used in several util functions ---

export type DayOfWeek =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday'
  | 'friday' | 'saturday' | 'sunday';

// ── Day helpers ──────────────────────────────────────────────

export const dayOrder: DayOfWeek[] = [
  'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday',
];

export const getDayOfWeek = (date: Date): DayOfWeek => {
  const index = (date.getDay() + 6) % 7;
  const day = dayOrder[index];
  if (!day) throw new Error('Invalid day index');
  return day;
};

// ── Time helpers ─────────────────────────────────────────────

/** Convert "HH:mm" to total minutes since midnight */
export const toMinutes = (timeValue: string): number => {
  const parts = timeValue.split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  return hours * 60 + minutes;
};

/** Format a minute count as "1h 30m" / "45m" */
export const formatDuration = (minutes: number): string => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

/** Format "HH:mm" to "9:30 AM" */
export const formatTime = (timeStr: string): string => {
  if (!timeStr) return '';
  const [hourStr, minuteStr] = timeStr.split(':');
  const hour = parseInt(hourStr ?? '0', 10);
  const minute = minuteStr ?? '00';
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${period}`;
};

/** Format an ISO date string to "Jan 1, 2026" */
export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ── Session countdown helpers ─────────────────────────────────

/**
 * Return seconds remaining in an active session.
 * Returns 0 if the session has already ended or hasn't started.
 */
export const getRemainingSeconds = (session: Pick<Session, 'started_at' | 'duration'>): number => {
  if (!session.started_at) return session.duration * 60;
  const startedAt = new Date(session.started_at).getTime();
  const durationMs = session.duration * 60 * 1000;
  const endAt = startedAt + durationMs;
  const remaining = Math.max(0, Math.floor((endAt - Date.now()) / 1000));
  return remaining;
};

/**
 * Format seconds as "MM:SS" or "H:MM:SS" for the countdown display.
 */
export const formatCountdown = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
};

// ── Validation helpers ────────────────────────────────────────

export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export const isValidPassword = (password: string): boolean => {
  // Minimum 8 characters, at least one letter and one number
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
};

// ── QR Code ───────────────────────────────────────────────────

/**
 * Generate a random alphanumeric QR login code.
 * Uses crypto.randomUUID where available, falls back to Math.random.
 */
export const generateQRCode = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
  }
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

// ── Session scheduling / overlap ─────────────────────────────

interface SessionLike {
  start_time: string;
  duration: number;
  schedule: string;
  schedule_days?: string[];
}

/**
 * Returns true if two sessions have overlapping time windows on any shared day.
 */
export const isSessionOverlap = (a: SessionLike, b: SessionLike): boolean => {
  const aStart = toMinutes(a.start_time);
  const aEnd = aStart + a.duration;
  const bStart = toMinutes(b.start_time);
  const bEnd = bStart + b.duration;

  // No time overlap
  if (aEnd <= bStart || bEnd <= aStart) return false;

  const scheduleA = a.schedule;
  const scheduleB = b.schedule;

  // Both "today" or one-off — always on same day pool
  if (scheduleA === ScheduleType.TODAY || scheduleB === ScheduleType.TODAY) return true;

  // Both recurring — check weekday intersection
  if (scheduleA === ScheduleType.RECURRING && scheduleB === ScheduleType.RECURRING) {
    const daysA = a.schedule_days ?? [];
    const daysB = b.schedule_days ?? [];
    return daysA.some(d => daysB.includes(d));
  }

  // Both scheduled (specific dates) — check date intersection
  if (scheduleA === ScheduleType.SCHEDULED && scheduleB === ScheduleType.SCHEDULED) {
    const datesA = a.schedule_days ?? [];
    const datesB = b.schedule_days ?? [];
    return datesA.some(d => datesB.includes(d));
  }

  // Mixed types — conservative: assume possible overlap
  return true;
};

// ── Website blocking ──────────────────────────────────────────

/**
 * Return true if the given URL matches any hostname in the blocked list.
 * Handles bare hostnames (youtube.com) and full URLs (https://youtube.com/...).
 */
export const isBlockedWebsite = (url: string, blockedList: string[]): boolean => {
  if (!url || blockedList.length === 0) return false;

  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    hostname = url.replace(/^www\./, '').split('/')[0] ?? '';
  }

  return blockedList.some(blocked => {
    const clean = blocked.replace(/^www\./, '').toLowerCase();
    return hostname.toLowerCase() === clean || hostname.toLowerCase().endsWith(`.${clean}`);
  });
};
