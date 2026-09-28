import type { DayOfWeek } from "./types";

export const dayOrder: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

export const toMinutes = (timeValue: string): number => {
  const parts = timeValue.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  return hours * 60 + minutes;
};

export const formatDuration = (minutes: number): string => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hrs}h`;
  }
  return `${hrs}h ${mins}m`;
};

export const getDayOfWeek = (date: Date): DayOfWeek => {
  const index = (date.getDay() + 6) % 7;
  const day = dayOrder[index];
  if (!day) throw new Error("Invalid day index");
  return day;
};

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isValidPassword = (password: string): boolean =>
  password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);

export const generateQRCode = (): string => {
  // 6-character uppercase alphanumeric code, avoiding ambiguous characters (O, 0, I, 1)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

interface OverlapCheckSession {
  start_time: string;
  duration: number;
  schedule: string;
  schedule_days: string[];
}

const timeRangesOverlap = (aStart: number, aDuration: number, bStart: number, bDuration: number): boolean => {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
};

type ScheduleWindow =
  | { type: "today" }
  | { type: "weekdays"; days: string[] }
  | { type: "dates"; dates: string[] };

const scheduleWindowOf = (session: OverlapCheckSession): ScheduleWindow => {
  if (session.schedule === "recurring") {
    return { type: "weekdays", days: session.schedule_days.map((d) => d.toLowerCase()) };
  }
  if (session.schedule === "scheduled") {
    return { type: "dates", dates: session.schedule_days };
  }
  return { type: "today" };
};

const daysIntersect = (a: OverlapCheckSession, b: OverlapCheckSession): boolean => {
  const today = new Date();
  const todayName = getDayOfWeek(today);
  const todayDate = today.toISOString().split("T")[0];

  const aWindow = scheduleWindowOf(a);
  const bWindow = scheduleWindowOf(b);

  const asDateList = (w: ScheduleWindow): string[] | null => (w.type === "dates" ? w.dates : null);
  const asWeekdayList = (w: ScheduleWindow): string[] | null => (w.type === "weekdays" ? w.days : null);

  if (aWindow.type === "today" && bWindow.type === "today") return true;
  if (aWindow.type === "today") {
    const bDays = asWeekdayList(bWindow);
    if (bDays) return bDays.includes(todayName);
    const bDates = asDateList(bWindow);
    if (bDates) return bDates.includes(todayDate);
  }
  if (bWindow.type === "today") {
    const aDays = asWeekdayList(aWindow);
    if (aDays) return aDays.includes(todayName);
    const aDates = asDateList(aWindow);
    if (aDates) return aDates.includes(todayDate);
  }

  const aDays = asWeekdayList(aWindow);
  const bDays = asWeekdayList(bWindow);
  if (aDays && bDays) return aDays.some((d) => bDays.includes(d));

  const aDates = asDateList(aWindow);
  const bDates = asDateList(bWindow);
  if (aDates && bDates) return aDates.some((d) => bDates.includes(d));

  const weekdays = aDays ?? bDays;
  const dates = aDates ?? bDates;
  if (weekdays && dates) {
    return dates.some((dateStr) => weekdays.includes(getDayOfWeek(new Date(dateStr))));
  }

  return false;
};

export const isSessionOverlap = (a: OverlapCheckSession, b: OverlapCheckSession): boolean => {
  if (!daysIntersect(a, b)) return false;
  return timeRangesOverlap(toMinutes(a.start_time), a.duration, toMinutes(b.start_time), b.duration);
};

/** Formats an ISO timestamp as a human-readable date, e.g. "Jul 27, 2026". */
export const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/** Formats a "HH:mm" time string as a 12-hour clock time, e.g. "2:30 PM". */
export const formatTime = (time: string): string => {
  const [hStr, mStr] = time.split(":");
  let h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
};

/** Formats a countdown in seconds as "MM:SS", or "H:MM:SS" once past an hour. */
export const formatCountdown = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
};

/**
 * Resolves the true start timestamp (in ms) of a session.
 * For scheduled sessions (recurring, today, scheduled), resolves to today's scheduled start time
 * in the local timezone so that client countdowns are immune to server timezone drift.
 * Falls back to session.started_at, or Date.now().
 */
export const getEffectiveSessionStartMs = (session: {
  started_at?: string | null;
  duration?: number;
  start_time?: string;
  schedule?: string;
  time_slots?: Array<{ start_time: string; end_time: string }>;
  break_used_seconds?: number;
}): number => {
  const now = new Date();
  const durMs = (session.duration || 25) * 60 * 1000;

  // 1. If it has time_slots or start_time and is not an adhoc session
  if (session.start_time && (session.schedule || '').toLowerCase() !== 'adhoc') {
    // Check time_slots first
    if (Array.isArray(session.time_slots) && session.time_slots.length > 0) {
      for (const slot of session.time_slots) {
        if (!slot.start_time) continue;
        const [sh, sm] = slot.start_time.split(':').map(Number);
        if (isNaN(sh) || isNaN(sm)) continue;
        const slotStart = new Date(now);
        slotStart.setHours(sh, sm, 0, 0);
        let slotEndMs = slotStart.getTime() + durMs;
        if (slot.end_time) {
          const [eh, em] = slot.end_time.split(':').map(Number);
          if (!isNaN(eh) && !isNaN(em)) {
            const customEnd = new Date(now);
            customEnd.setHours(eh, em, 0, 0);
            if (customEnd.getTime() > slotStart.getTime()) {
              slotEndMs = customEnd.getTime();
            }
          }
        }
        // If current time is within or within 1 hour past this slot
        if (slotStart.getTime() <= now.getTime() && now.getTime() <= slotEndMs + 60 * 60_000) {
          return slotStart.getTime();
        }
      }
    }

    // Single start_time
    const [sh, sm] = session.start_time.split(':').map(Number);
    if (!isNaN(sh) && !isNaN(sm)) {
      const scheduledStart = new Date(now);
      scheduledStart.setHours(sh, sm, 0, 0);
      const scheduledEndMs = scheduledStart.getTime() + durMs;
      if (scheduledStart.getTime() <= now.getTime() && now.getTime() <= scheduledEndMs + 60 * 60_000) {
        return scheduledStart.getTime();
      }
    }
  }

  // 2. Fallback to started_at
  if (session.started_at) {
    const parsed = new Date(session.started_at).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return now.getTime();
};

/** Seconds remaining until an active session ends. */
export const getRemainingSeconds = (session: {
  started_at?: string | null;
  duration: number;
  break_used_seconds?: number;
  is_on_break?: boolean;
  break_started_at?: string | null;
  break_ends_at?: string | null;
  start_time?: string;
  schedule?: string;
  time_slots?: Array<{ start_time: string; end_time: string }>;
}): number => {
  const startedAtMs = getEffectiveSessionStartMs(session);
  const totalDurationMs = (session.duration || 25) * 60_000;
  const sessionEndMs = startedAtMs + totalDurationMs;

  // When a break is currently active, freeze the countdown at break start
  if (session.is_on_break) {
    let breakStartMs = Date.now();
    if (session.break_started_at) {
      breakStartMs = new Date(session.break_started_at).getTime();
    }
    return Math.max(0, Math.floor((sessionEndMs - breakStartMs) / 1000));
  }

  // Active session running (or resumed after break):
  return Math.max(0, Math.floor((sessionEndMs - Date.now()) / 1000));
};

/** Seconds elapsed since an active session started, pausing during breaks. */
export const getElapsedSeconds = (session: {
  started_at?: string | null;
  duration?: number;
  break_used_seconds?: number;
  is_on_break?: boolean;
  break_started_at?: string | null;
  break_ends_at?: string | null;
  start_time?: string;
  schedule?: string;
  time_slots?: Array<{ start_time: string; end_time: string }>;
}): number => {
  const startedAtMs = getEffectiveSessionStartMs(session);

  if (session.is_on_break) {
    let breakStartMs = Date.now();
    if (session.break_started_at) {
      breakStartMs = new Date(session.break_started_at).getTime();
    }
    return Math.max(0, Math.floor((breakStartMs - startedAtMs) / 1000));
  }

  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
};

/** Whether a URL's hostname matches (or is a subdomain of) an entry in `blockedList`. */
export const isBlockedWebsite = (url: string, blockedList: string[]): boolean => {
  if (blockedList.length === 0) return false;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return blockedList.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^www\./, "").trim();
    if (!normalized) return false;
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
};

/**
 * Calculates the next upcoming Date when this session will start, or null if it has no future runs.
 * Fully respects skipped_until and checks all time_slots if present.
 */
export const getNextSessionOccurrence = (
  session: {
    schedule: string;
    schedule_days?: string[];
    start_time: string;
    skipped_until?: string | null;
    time_slots?: Array<{ start_time: string; end_time: string }>;
  },
  now: Date = new Date()
): Date | null => {
  const schedule = (session.schedule || '').toLowerCase();
  const scheduleDays = Array.isArray(session.schedule_days) ? session.schedule_days : [];
  const skippedUntilTime = session.skipped_until ? new Date(session.skipped_until).getTime() : 0;
  const effectiveMinTime = Math.max(now.getTime(), skippedUntilTime);

  // Collect all slot start times
  const slotStartTimes: string[] = [];
  if (Array.isArray(session.time_slots) && session.time_slots.length > 0) {
    for (const slot of session.time_slots) {
      if (slot.start_time) slotStartTimes.push(slot.start_time);
    }
  }
  if (slotStartTimes.length === 0 && session.start_time) {
    slotStartTimes.push(session.start_time);
  }
  if (slotStartTimes.length === 0) return null;

  const getSlotOccurrencesOnDate = (baseDate: Date): Date[] => {
    const dates: Date[] = [];
    for (const timeStr of slotStartTimes) {
      const [hStr, mStr] = timeStr.split(':');
      const h = parseInt(hStr ?? '0', 10);
      const m = parseInt(mStr ?? '0', 10);
      if (isNaN(h) || isNaN(m)) continue;
      const d = new Date(baseDate);
      d.setHours(h, m, 0, 0);
      if (d.getTime() > effectiveMinTime) {
        dates.push(d);
      }
    }
    dates.sort((a, b) => a.getTime() - b.getTime());
    return dates;
  };

  if (schedule === 'today') {
    const occurrences = getSlotOccurrencesOnDate(now);
    return occurrences.length > 0 ? occurrences[0] : null;
  }

  if (schedule === 'recurring') {
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const normalizedDays = scheduleDays.map((d) => String(d).toLowerCase());

    for (let offset = 0; offset <= 14; offset++) {
      const candidateDate = new Date(now);
      candidateDate.setDate(now.getDate() + offset);
      const dayName = weekdays[candidateDate.getDay()];

      const isScheduledDay = normalizedDays.length === 0 || (dayName ? normalizedDays.includes(dayName) : false);

      if (isScheduledDay) {
        const occurrences = getSlotOccurrencesOnDate(candidateDate);
        if (occurrences.length > 0) {
          return occurrences[0];
        }
      }
    }
    return null;
  }

  if (schedule === 'scheduled' || schedule === 'later') {
    let earliest: Date | null = null;
    for (const dateStr of scheduleDays) {
      const datePart = String(dateStr).split('T')[0];
      const [yearStr, monthStr, dayStr] = datePart.split('-');
      const y = parseInt(yearStr ?? '0', 10);
      const mo = parseInt(monthStr ?? '0', 10) - 1;
      const day = parseInt(dayStr ?? '0', 10);
      if (isNaN(y) || isNaN(mo) || isNaN(day)) continue;

      const baseDate = new Date(y, mo, day);
      const occurrences = getSlotOccurrencesOnDate(baseDate);
      if (occurrences.length > 0) {
        const first = occurrences[0];
        if (!earliest || first.getTime() < earliest.getTime()) {
          earliest = first;
        }
      }
    }
    return earliest;
  }

  return null;
};

/**
 * Sorts sessions by their next upcoming occurrence in ascending order (closest upcoming first).
 */
export const sortByNextOccurrence = <T extends {
  schedule: string;
  schedule_days?: string[];
  start_time: string;
  skipped_until?: string | null;
  time_slots?: Array<{ start_time: string; end_time: string }>;
}>(
  sessions: T[],
  now: Date = new Date()
): T[] => {
  return [...sessions].sort((a, b) => {
    const nextA = getNextSessionOccurrence(a, now)?.getTime() ?? Infinity;
    const nextB = getNextSessionOccurrence(b, now)?.getTime() ?? Infinity;
    return nextA - nextB;
  });
};

/**
 * Checks whether a session should currently be running right now based on its
 * schedule configuration (today, recurring, scheduled/later) and time window
 * (start_time + duration or time_slots).
 */
export const isSessionInActiveWindow = (
  session: {
    schedule: string;
    schedule_days?: string[];
    start_time: string;
    duration: number;
    time_slots?: Array<{ start_time: string; end_time: string }>;
    skipped_until?: string | null;
    status?: string;
  },
  now: Date = new Date()
): boolean => {
  if (session.status === 'completed' || session.status === 'cancelled') {
    return false;
  }

  // Check if session was skipped for this occurrence
  if (session.skipped_until && new Date(session.skipped_until).getTime() > now.getTime()) {
    return false;
  }

  // Check day match
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentWeekday = weekdays[now.getDay()];
  const schedule = (session.schedule || "").toLowerCase();
  const scheduleDays = (Array.isArray(session.schedule_days) ? session.schedule_days : []).map(d => String(d).toLowerCase());

  let isScheduledDay = false;
  if (schedule === 'today') {
    isScheduledDay = true;
  } else if (schedule === 'recurring') {
    isScheduledDay = scheduleDays.length === 0 || scheduleDays.includes(currentWeekday);
  } else if (schedule === 'scheduled' || schedule === 'later') {
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    isScheduledDay = scheduleDays.includes(todayStr);
  }

  if (!isScheduledDay) return false;

  // Check time window
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (Array.isArray(session.time_slots) && session.time_slots.length > 0) {
    for (const slot of session.time_slots) {
      if (!slot.start_time || !slot.end_time) continue;
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) continue;
      const slotStart = sh * 60 + sm;
      let slotEnd = eh * 60 + em;
      if (slotEnd <= slotStart) slotEnd += 24 * 60; // handles overnight slot
      if (currentMinutes >= slotStart && currentMinutes < slotEnd) {
        return true;
      }
    }
  }

  if (session.start_time) {
    const [h, m] = session.start_time.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      const startMinutes = h * 60 + m;
      const endMinutes = startMinutes + (session.duration || 25);
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return true;
      }
    }
  }

  return false;
};

