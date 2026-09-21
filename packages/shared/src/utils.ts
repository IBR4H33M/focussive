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
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 32; i++) {
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

/** Seconds remaining until an active session (by `started_at` + `duration`) ends. */
export const getRemainingSeconds = (session: { started_at?: string; duration: number }): number => {
  if (!session.started_at) return session.duration * 60;
  const startedAtMs = new Date(session.started_at).getTime();
  const endAtMs = startedAtMs + session.duration * 60_000;
  return Math.max(0, Math.floor((endAtMs - Date.now()) / 1000));
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
 */
export const getNextSessionOccurrence = (
  session: { schedule: string; schedule_days?: string[]; start_time: string },
  now: Date = new Date()
): Date | null => {
  if (!session.start_time) return null;
  const [hStr, mStr] = session.start_time.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (isNaN(h) || isNaN(m)) return null;

  const schedule = session.schedule;
  const scheduleDays = Array.isArray(session.schedule_days) ? session.schedule_days : [];

  const makeDate = (baseDate: Date): Date => {
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
  };

  if (schedule === "today") {
    const todayOccurrence = makeDate(now);
    if (todayOccurrence.getTime() > now.getTime()) {
      return todayOccurrence;
    }
    return null;
  }

  if (schedule === "recurring") {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const normalizedDays = scheduleDays.map((d) => d.toLowerCase());

    for (let offset = 0; offset <= 7; offset++) {
      const candidateDate = new Date(now);
      candidateDate.setDate(now.getDate() + offset);
      const dayName = weekdays[candidateDate.getDay()];

      const isScheduledDay = normalizedDays.length === 0 || (dayName ? normalizedDays.includes(dayName) : false);

      if (isScheduledDay) {
        const occurrence = makeDate(candidateDate);
        if (occurrence.getTime() > now.getTime()) {
          return occurrence;
        }
      }
    }
    return null;
  }

  if (schedule === "scheduled") {
    let earliest: Date | null = null;
    for (const dateStr of scheduleDays) {
      const [yearStr, monthStr, dayStr] = dateStr.split("-");
      const y = parseInt(yearStr ?? "0", 10);
      const mo = parseInt(monthStr ?? "0", 10) - 1;
      const day = parseInt(dayStr ?? "0", 10);
      if (isNaN(y) || isNaN(mo) || isNaN(day)) continue;

      const d = new Date(y, mo, day, h, m, 0, 0);
      if (d.getTime() > now.getTime()) {
        if (!earliest || d.getTime() < earliest.getTime()) {
          earliest = d;
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
export const sortByNextOccurrence = <T extends { schedule: string; schedule_days?: string[]; start_time: string }>(
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

