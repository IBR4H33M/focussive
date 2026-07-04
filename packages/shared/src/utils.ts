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
